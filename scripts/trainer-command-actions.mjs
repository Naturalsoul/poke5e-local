import { runTrainerPathAction } from "./trainer-path-actions.mjs";
import {
  assignPokemonToParty,
  getTrainerPartyState,
  isPokemonActor,
  removePokemonFromParty
} from "./trainer-party-service.mjs";

import {
  deployTrainerPokemon,
  recallTrainerPokemon
} from "./trainer-deployment-service.mjs";

import {
  requestTrainerPokemonSwitch
} from "./trainer-switch-authority-service.mjs";

import {
  findPokemonTokenDocuments
} from "./trainer-token-service.mjs";

import {
  isPokemonMoveKnown
} from "./pokemon-move-service.mjs";

import {
  openPokemonLevelUpDialog
} from "./pokemon-level-up-dialog.mjs";

import {
  openTrainerLevelUpDialog
} from "./trainer-level-up-dialog.mjs";

import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";

const MODULE_ID =
  "poke5e-local";

const DEFAULT_MAX_ACTIVE =
  1;

const trainerUiState =
  new Map();

const PLAYER_BATTLE_ACTIONS =
  new Set([
    "deploy",
    "recall",
    "switch-start",
    "switch-complete",
    "move-use",
    "party-to-pc",
    "pc-to-party"
  ]);

const LABELS = {

  es: {
    formatWarning:
      "Retira un Pokémon activo antes de cambiar a Single Battle.",

    invalidPokemon:
      "No se pudo encontrar el Pokémon.",

    invalidSwitch:
      "No se pudo completar el cambio de Pokémon.",

    invalidMove:
      "El Move seleccionado no está disponible para este Pokémon.",

    invalidActivity:
      "La actividad seleccionada no está disponible.",

    permissionDenied:
      "No tienes ownership suficiente sobre este Trainer y su Pokémon.",

    gmOnly:
      "Esta acción solo está disponible para el GM.",

    tokenCreatePermission:
      "Tu rol de Foundry no tiene permiso para crear Tokens. El GM debe habilitar Create New Tokens en Configurar Permisos.",

    tokenDeletePermission:
      "Tu rol de Foundry no tiene permiso para eliminar Tokens. El GM debe habilitar Delete Tokens en Configurar Permisos.",

    error:
      "No se pudo actualizar el Trainer.",

    placement:
      name =>
        `Haz clic en el mapa para desplegar a ${name}. Presiona Esc para cancelar.`,

    noCanvas:
      "No hay una Scene activa donde desplegar el Pokémon.",
  },


  en: {
    formatWarning:
      "Recall an active Pokémon before changing to Single Battle.",

    invalidPokemon:
      "The Pokémon could not be found.",

    invalidSwitch:
      "The Pokémon switch could not be completed.",

    invalidMove:
      "The selected Move is not available for this Pokémon.",

    invalidActivity:
      "The selected activity is not available.",

    permissionDenied:
      "You do not have sufficient ownership over this Trainer and Pokémon.",

    gmOnly:
      "This action is only available to the GM.",

    tokenCreatePermission:
      "Your Foundry role cannot create Tokens. The GM must enable Create New Tokens in Configure Permissions.",

    tokenDeletePermission:
      "Your Foundry role cannot delete Tokens. The GM must enable Delete Tokens in Configure Permissions.",

    error:
      "The Trainer could not be updated.",

    placement:
      name =>
        `Click the map to deploy ${name}. Press Esc to cancel.`,

    noCanvas:
      "There is no active Scene where the Pokémon can be deployed.",
  }
};


function getLanguage() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
}


function getLabels() {

  return LABELS[
    getLanguage()
  ];
}


function pokemonFromUuid(
  uuid
) {

  return (
    game.actors.find(
      actor =>
        actor.uuid ===
        uuid
    ) ??
    null
  );
}


function resolvePokemon(
  pokemonId
) {

  const pokemon =
    game.actors.get(
      String(
        pokemonId ??
        ""
      )
    );

  return isPokemonActor(
    pokemon
  )
    ? pokemon
    : null;
}

function assertCommandPermission({
  action,
  trainer,
  pokemon,
  labels
}) {

  if (
    game.user.isGM
  ) {

    return;
  }


  if (
    !PLAYER_BATTLE_ACTIONS.has(
      action
    )
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  if (
    !canCurrentUserOperateTrainerPokemon(
      trainer,
      pokemon
    )
  ) {

    throw new Error(
      labels.permissionDenied
    );
  }
}


function hasPokemonToken(
  pokemon
) {

  return (
    findPokemonTokenDocuments(
      pokemon
    ).length >
    0
  );
}


function assertTokenCreatePermission(
  pokemon,
  labels
) {

  if (
    game.user.isGM ||
    hasPokemonToken(
      pokemon
    ) ||
    game.user.can(
      "TOKEN_CREATE"
    )
  ) {

    return;
  }


  throw new Error(
    labels.tokenCreatePermission
  );
}


function assertTokenDeletePermission(
  pokemon,
  labels
) {

  if (
    game.user.isGM ||
    !hasPokemonToken(
      pokemon
    ) ||
    game.user.can(
      "TOKEN_DELETE"
    )
  ) {

    return;
  }


  throw new Error(
    labels.tokenDeletePermission
  );
}

function resolveMove(
  pokemon,
  moveId
) {

  const move =
    pokemon.items.get(
      String(
        moveId ??
        ""
      )
    );


  if (
    !move ||
    move.getFlag(
      MODULE_ID,
      "kind"
    ) !== "move" ||
    !isPokemonMoveKnown(
      pokemon,
      move
    )
  ) {

    return null;
  }


  return move;
}


function resolveMoveActivity(
  move,
  activityId
) {

  const activity =
    move.system
      ?.activities
      ?.get(
        String(
          activityId ??
          ""
        )
      );


  if (
    !activity ||
    typeof activity.use !==
      "function" ||
    activity.canUse ===
      false
  ) {

    return null;
  }


  return activity;
}


async function executeMoveActivity({
  pokemon,
  moveId,
  activityId,
  labels
}) {

  const move =
    resolveMove(
      pokemon,
      moveId
    );


  if (!move) {

    throw new Error(
      labels.invalidMove
    );
  }


  const activity =
    resolveMoveActivity(
      move,
      activityId
    );


  if (!activity) {

    throw new Error(
      labels.invalidActivity
    );
  }


  await activity.use();
}

function normalizeUiState(
  trainer,
  state
) {

  const partyState =
    getTrainerPartyState(
      trainer
    );

  const activeCount =
    partyState
      .activePokemonUuids
      .length;


  if (
    activeCount >
    state.maxActive
  ) {

    state.maxActive =
      2;
  }


  if (
    state.switchOutgoingUuid &&
    !partyState.activePokemonUuids
      .includes(
        state.switchOutgoingUuid
      )
  ) {

    state.switchOutgoingUuid =
      null;
  }


  return state;
}


export function getTrainerCommandUiState(
  trainer
) {

  let state =
    trainerUiState.get(
      trainer.id
    );


  if (!state) {

    const activeCount =
      getTrainerPartyState(
        trainer
      ).activePokemonUuids.length;


    state = {

      maxActive:
        activeCount > 1
          ? 2
          : DEFAULT_MAX_ACTIVE,

      switchOutgoingUuid:
        null
    };


    trainerUiState.set(
      trainer.id,
      state
    );
  }


  return normalizeUiState(
    trainer,
    state
  );
}


function setBusy(
  root,
  busy
) {

  root.classList.toggle(
    "is-busy",
    busy
  );


  for (
    const control
    of root.querySelectorAll(
      "button, select"
    )
  ) {

    const persistentlyDisabled =
      control.dataset
        .commandPersistentDisabled ===
      "true";


    control.disabled =
      busy ||
      persistentlyDisabled;
  }
}

/* ============================================================
 * CANVAS VIEW
 *
 * Deploy / Switch no deben modificar la cámara local
 * del Player.
 *
 * Foundry o algún módulo puede reaccionar a la creación
 * de un Token poseído y cambiar la vista. Conservamos
 * explícitamente la posición previa del canvas.
 * ============================================================ */

function capturePlayerCanvasView() {

  if (
    game.user.isGM ||
    !canvas.ready ||
    !canvas.stage
  ) {

    return null;
  }


  const x =
    Number(
      canvas.stage.pivot?.x
    );

  const y =
    Number(
      canvas.stage.pivot?.y
    );

  const scale =
    Number(
      canvas.stage.scale?.x
    );


  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(scale)
  ) {

    return null;
  }


  return {
    x,
    y,
    scale
  };
}


function restorePlayerCanvasView(
  view
) {

  if (
    !view ||
    !canvas.ready
  ) {

    return;
  }


  const restore =
    () => {

      if (!canvas.ready) {

        return;
      }


      canvas.pan(
        view
      );
    };


  /*
   * Primera restauración inmediata.
   */
  restore();


  /*
   * La creación del Token puede provocar trabajo de
   * percepción/control durante los siguientes frames.
   *
   * Reafirmamos la vista después de que Foundry termine
   * ese trabajo visual.
   */
  window.requestAnimationFrame(
    () => {

      restore();


      window.requestAnimationFrame(
        restore
      );
    }
  );
}

/* ============================================================
 * TOKEN PLACEMENT
 * ============================================================ */

function requestCanvasPlacement(
  pokemon,
  labels
) {

  if (
    !canvas.ready ||
    !canvas.scene ||
    !canvas.stage
  ) {

    throw new Error(
      labels.noCanvas
    );
  }


  ui.notifications.info(
    labels.placement(
      pokemon.name
    )
  );


  return new Promise(
    resolve => {

      const stage =
        canvas.stage;


      const cleanup =
        () => {

          stage.off(
            "pointerdown",
            onPointerDown
          );


          window.removeEventListener(
            "keydown",
            onKeyDown
          );
        };


      const finish =
        position => {

          cleanup();

          resolve(
            position
          );
        };


      const onPointerDown =
        event => {

          /*
           * Solo clic izquierdo.
           */

          if (
            event.button !==
            0
          ) {

            return;
          }


          event.stopPropagation();


          const point =
            canvas.canvasCoordinatesFromClient({
              x:
                event.clientX,

              y:
                event.clientY
            });


          const tokenLayer =
            canvas.getLayerByEmbeddedName(
              "Token"
            );


          const snapped =
            tokenLayer
              ?.getSnappedPoint(
                point
              ) ??
            point;


          finish({
            x:
              snapped.x,

            y:
              snapped.y
          });
        };


      const onKeyDown =
        event => {

          if (
            event.key !==
            "Escape"
          ) {

            return;
          }


          finish(
            null
          );
        };


      stage.on(
        "pointerdown",
        onPointerDown
      );


      window.addEventListener(
        "keydown",
        onKeyDown
      );
    }
  );
}


async function resolveDeploymentPosition(
  pokemon,
  labels
) {

  /*
   * Un Token existente puede haber sido
   * colocado manualmente.
   *
   * En ese caso lo adoptamos y no pedimos
   * una segunda colocación.
   */

  const existing =
    findPokemonTokenDocuments(
      pokemon
    );


  if (
    existing.length
  ) {

    return {
      cancelled:
        false,

      position:
        null
    };
  }


  const position =
    await requestCanvasPlacement(
      pokemon,
      labels
    );


  return {
    cancelled:
      !position,

    position
  };
}

async function executePokemonAction({
  action,
  trainer,
  pokemon,
  state,
  labels
}) {

  if (
    action ===
    "pokemon-level-up"
  ) {

    await openPokemonLevelUpDialog(
      pokemon
    );

    return;
  }


  if (
    action === "deploy"
  ) {

    const placement =
      await resolveDeploymentPosition(
        pokemon,
        labels
      );


    if (
      placement.cancelled
    ) {

      return;
    }


    /*
     * Capturamos la cámara DESPUÉS de que el Player
     * haya elegido dónde desplegar.
     *
     * Así preservamos exactamente la vista desde la
     * que hizo clic en el mapa.
     */
    const canvasView =
      capturePlayerCanvasView();


    await deployTrainerPokemon(
      trainer,
      pokemon,
      {
        maxActive:
          state.maxActive,

        position:
          placement.position
      }
    );


    restorePlayerCanvasView(
      canvasView
    );


    return;
  }


  if (
    action === "recall"
  ) {

    assertTokenDeletePermission(
      pokemon,
      labels
    );


    await recallTrainerPokemon(
      trainer,
      pokemon
    );


    return;
  }


  if (
    action === "party-to-pc"
  ) {

    await removePokemonFromParty(
      trainer,
      pokemon
    );


    return;
  }


  if (
    action === "pc-to-party"
  ) {

    await assignPokemonToParty(
      trainer,
      pokemon
    );
  }
}

async function completeSwitch({
  trainer,
  incoming,
  state,
  labels
}) {

  const outgoing =
    pokemonFromUuid(
      state.switchOutgoingUuid
    );


  if (
    !outgoing ||
    !isPokemonActor(
      outgoing
    )
  ) {

    ui.notifications.warn(
      labels.invalidSwitch
    );

    state.switchOutgoingUuid =
      null;

    return;
  }


  if (
    !game.user.isGM &&
    !canCurrentUserOperateTrainerPokemon(
      trainer,
      outgoing
    )
  ) {

    throw new Error(
      labels.permissionDenied
    );
  }


  const canvasView =
    capturePlayerCanvasView();


  await requestTrainerPokemonSwitch(
    trainer,
    outgoing,
    incoming,
    {
      scene:
        canvas.scene
    }
  );


  restorePlayerCanvasView(
    canvasView
  );


  state.switchOutgoingUuid =
    null;
}

function handleFormatChange({
  select,
  trainer,
  state,
  refresh,
  labels
}) {

  const requested =
    Number(
      select.value
    );


  if (
    requested !== 1 &&
    requested !== 2
  ) {

    refresh();

    return;
  }


  const activeCount =
    getTrainerPartyState(
      trainer
    ).activePokemonUuids.length;


  if (
    requested <
    activeCount
  ) {

    ui.notifications.warn(
      labels.formatWarning
    );

    refresh();

    return;
  }


  state.maxActive =
    requested;


  refresh();
}


export function activateTrainerCommandCenter({
  root,
  trainer,
  refresh
}) {

  const state =
    getTrainerCommandUiState(
      trainer
    );

  const labels =
    getLabels();


  root.addEventListener(
    "change",
    event => {

      const select =
        event.target.closest(
          '[data-command-role="battle-format"]'
        );


      if (!select) {
        return;
      }


      handleFormatChange({
        select,
        trainer,
        state,
        refresh,
        labels
      });
    }
  );


  root.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "button[data-command-action]"
        );


      if (!button) {
        return;
      }


      const action =
        String(
          button.dataset
            .commandAction ??
          ""
        );

      if (
        action ===
        "trainer-level-up"
      ) {

        if (
          !game.user.isGM
        ) {

          ui.notifications.error(
            labels.gmOnly
          );

          return;
        }

        setBusy(
          root,
          true
        );


        try {

          await openTrainerLevelUpDialog(
            trainer
          );


          refresh();

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error subiendo nivel de Trainer`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }


      if (["trainer-skill-dice", "trainer-partner", "trainer-cheerleader"].includes(action)) {
        try {
          await runTrainerPathAction(action, trainer);
          refresh();
        } catch (error) {
          console.error(`[${MODULE_ID}] Error usando rasgo de camino`, error);
          ui.notifications.error(error?.message ?? labels.error);
        }
        return;
      }

      if (
        action ===
        "switch-cancel"
      ) {

        state.switchOutgoingUuid =
          null;

        refresh();

        return;
      }


      const pokemon =
        resolvePokemon(
          button.dataset
            .pokemonId
        );


      if (!pokemon) {

        ui.notifications.warn(
          labels.invalidPokemon
        );

        return;
      }

      try {

        assertCommandPermission({
          action,
          trainer,
          pokemon,
          labels
        });

      } catch (error) {

        ui.notifications.error(
          error?.message ??
          labels.error
        );


        return;
      }

      if (
        action ===
        "move-use"
      ) {

        setBusy(
          root,
          true
        );


        try {

          await executeMoveActivity({
            pokemon,

            moveId:
              button.dataset
                .moveId,

            activityId:
              button.dataset
                .activityId,

            labels
          });


          refresh();

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error usando Move desde Trainer Command Center`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }


      /*
       * Primer clic del Switch.
       *
       * No modifica estado canónico:
       * únicamente entra en modo visual
       * de selección.
       */
      if (
        action ===
        "switch-start"
      ) {

        state.switchOutgoingUuid =
          pokemon.uuid;

        refresh();

        return;
      }


      setBusy(
        root,
        true
      );


      try {

        /*
         * Segundo clic del Switch.
         */
        if (
          action ===
          "switch-complete"
        ) {

          await completeSwitch({
            trainer,

            incoming:
              pokemon,

            state,
            labels
          });

        } else {

          await executePokemonAction({
            action,
            trainer,
            pokemon,
            state,
            labels
          });
        }


        refresh();

      } catch (error) {

        console.error(
          `[${MODULE_ID}] Error en Trainer Command Center`,
          error
        );


        ui.notifications.error(
          error?.message ??
          labels.error
        );

      } finally {

        setBusy(
          root,
          false
        );
      }
    }
  );
}