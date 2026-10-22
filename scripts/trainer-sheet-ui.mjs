import {
  getTrainerLevel,
  isTrainerActor
} from "./trainer-service.mjs";

import {
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";

import {
  getTrainerProgressionLimits
} from "./trainer-rules.mjs";

import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  buildTrainerCommandCenter
} from "./trainer-command-center.mjs";

import {
  activateTrainerCommandCenter,
  getTrainerCommandUiState
} from "./trainer-command-actions.mjs";

import {
  TrainerActorSheet
} from "./trainer-actor-sheet.mjs";

import {
  canCurrentUserOperateTrainer
} from "./trainer-ownership-service.mjs";

import {
  registerTrainerRocketRank,
  renderRocketRank
} from "./trainer-rocket-rank.mjs";

import {
  registerTrainerPokemonCenterService,
  useTrainerPokemonCenter
} from "./trainer-pokemon-center-service.mjs";

const MODULE_ID =
  "poke5e-local";


const SHEET_LABELS = {

  es: {
    invalidPokemon:
      "No se pudo encontrar el Pokémon.",

    pokemonSheetUnavailable:
      "No se pudo abrir la ficha del Pokémon.",

    trainerSheetUnavailable:
      "No se pudo resolver la ventana del Trainer.",

    maxSr:
      "SR MÁX.",

    maxSrTitle:
      "SR máximo controlable",

    speed:
      "SPD",

    speedTitle:
      "Velocidad",

    proficiency:
      "PB",

    proficiencyTitle:
      "Bono de competencia",

    hp:
      "HP",

    hpTitle:
      "Puntos de golpe",

    armorClass:
      "AC",

    armorClassTitle:
      "Clase de Armadura",

    pokemonCenter:
      "Centro Pokémon",

    pokemonCenterTitle:
      "Usar Pokémon Center",

    pokemonCenterConfirm:
      "Se recuperarán todos tus Pokémon. Asegurate de estar en un Centro Pokémon o similar.",

    pokemonCenterConfirmButton:
      "Recuperar Pokémon",

    pokemonCenterPermissionDenied:
      "No tienes permisos para usar el Centro Pokémon con este Trainer.",

    pokemonCenterEmpty:
      "Este Trainer no tiene Pokémon asignados.",

    pokemonCenterError:
      "No se pudo completar la recuperación Pokémon.",

    pokemonCenterRecovered:
      count =>
        `${count} Pokémon recuperado${count === 1 ? "" : "s"} completamente.`,

    pokemonCenterPartial:
      (
        recovered,
        failed
      ) =>
        `Centro Pokémon: ${recovered} recuperado(s), ${failed} con error.`,
  },


  en: {
    invalidPokemon:
      "The Pokémon could not be found.",

    pokemonSheetUnavailable:
      "The Pokémon sheet could not be opened.",

    trainerSheetUnavailable:
      "The Trainer window could not be resolved.",

    maxSr:
      "MAX SR",

    maxSrTitle:
      "Maximum controllable SR",

    speed:
      "SPD",

    speedTitle:
      "Speed",

    proficiency:
      "PB",

    proficiencyTitle:
      "Proficiency Bonus",

    hp:
      "HP",

    hpTitle:
      "Hit Points",

    armorClass:
      "AC",

    armorClassTitle:
      "Armor Class",

    pokemonCenter:
      "Pokémon Center",

    pokemonCenterTitle:
      "Use Pokémon Center",

    pokemonCenterConfirm:
      "All your Pokémon will fully heal. Be sure to be in a Pokemon Center or similar.",

    pokemonCenterConfirmButton:
      "Recover Pokémon",

    pokemonCenterPermissionDenied:
      "You do not have permission to use the Pokémon Center with this Trainer.",

    pokemonCenterEmpty:
      "This Trainer has no assigned Pokémon.",

    pokemonCenterError:
      "Pokémon recovery could not be completed.",

    pokemonCenterRecovered:
      count =>
        `${count} Pokémon fully recovered.`,

    pokemonCenterPartial:
      (
        recovered,
        failed
      ) =>
        `Pokémon Center: ${recovered} recovered, ${failed} failed.`,
  }
};


const COMMAND_CENTER_CLASS =
  "poke5e-trainer-command-center";

const COMMAND_HOST_SELECTOR =
  "[data-trainer-command-host]";

const POKEMON_SHEET_OPEN_SELECTOR =
  "[data-trainer-pokemon-sheet-open]";

const COMMAND_SCROLL_SELECTOR =
  ".poke5e-trainer-pokemon-tab";

const TRAINER_HEADER_BUTTONS_SELECTOR =
  ".sheet-header .sheet-header-buttons";

const POKEMON_CENTER_CONTROL_SELECTOR =
  '[data-poke5e-trainer-action="pokemon-center"]';


function trainerFromUuid(
  uuid
) {

  if (!uuid) {
    return null;
  }


  const trainer =
    game.actors.find(
      actor =>
        actor.uuid ===
        uuid
    );


  return isTrainerActor(
    trainer
  )
    ? trainer
    : null;
}


function ownerTrainerForPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {
    return null;
  }


  return trainerFromUuid(
    getPokemonTrainerUuid(
      pokemon
    )
  );
}


function actorFromOwnedDocument(
  documentValue
) {

  let current =
    documentValue ??
    null;


  while (
    current &&
    current.documentName !==
      "Actor"
  ) {

    current =
      current.parent ??
      null;
  }


  return current;
}

/* ============================================================
 * SHEET NAVIGATION
 * ============================================================ */

function getSheetLabels() {

  const language =
    game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
      ? "en"
      : "es";


  return SHEET_LABELS[
    language
  ];
}

function getTrainerMaximumSr(
  trainer
) {

  const level =
    getTrainerLevel(
      trainer
    ) ??
    1;


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const limits =
    getTrainerProgressionLimits({
      level,

      pathId:
        progression
          ?.path
          ?.id ??
        null
    });


  return limits.maxSr;
}

function pokemonFromId(
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


function trainerApplicationForRoot(
  root
) {

  const trainerId =
    String(
      root?.dataset
        ?.trainerId ??
      ""
    );


  if (!trainerId) {

    return null;
  }


  for (
    const application
    of foundry.applications
      .instances
      .values()
  ) {

    if (
      !(
        application instanceof
          TrainerActorSheet
      ) ||
      application.document
        ?.id !==
        trainerId
    ) {

      continue;
    }


    if (
      application.element
        ?.contains(
          root
        )
    ) {

      return application;
    }
  }


  return null;
}


async function openPokemonSheetFromTrainer({
  root,
  pokemon
}) {

  const labels =
    getSheetLabels();


  const trainerApplication =
    trainerApplicationForRoot(
      root
    );


  if (!trainerApplication) {

    throw new Error(
      labels.trainerSheetUnavailable
    );
  }


  const pokemonSheet =
    pokemon.sheet;


  if (
    !pokemonSheet ||
    typeof pokemonSheet.render !==
      "function"
  ) {

    throw new Error(
      labels.pokemonSheetUnavailable
    );
  }


  await pokemonSheet.render(
    true
  );


  if (
    pokemonSheet.minimized &&
    typeof pokemonSheet.maximize ===
      "function"
  ) {

    await pokemonSheet.maximize();
  }


  if (
    !trainerApplication.minimized
  ) {

    await trainerApplication.minimize();
  }


  pokemonSheet.bringToFront();
}


async function onPokemonSheetOpenClick(
  event
) {

  const button =
    event.target
      ?.closest?.(
        POKEMON_SHEET_OPEN_SELECTOR
      );


  if (!button) {

    return;
  }


  const root =
    button.closest(
      `.${COMMAND_CENTER_CLASS}`
    );


  if (!root) {

    return;
  }


  event.preventDefault();
  event.stopPropagation();


  const labels =
    getSheetLabels();


  const pokemon =
    pokemonFromId(
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

    await openPokemonSheetFromTrainer({
      root,
      pokemon
    });

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error abriendo Pokémon Sheet desde Trainer`,
      error
    );


    ui.notifications.error(
      error?.message ??
      labels.pokemonSheetUnavailable
    );
  }
}

async function confirmTrainerPokemonCenter(
  labels
) {

  const confirmed =
    await foundry.applications.api
      .DialogV2.prompt({

        window: {
          title:
            labels.pokemonCenterTitle
        },

        content: `
          <p>
            ${labels.pokemonCenterConfirm}
          </p>
        `,

        rejectClose:
          false,

        ok: {
          label:
            labels.pokemonCenterConfirmButton,

          callback:
            () => true
        }
      });


  return confirmed ===
    true;
}


function createTrainerPokemonCenterHeaderButton(
  trainer
) {

  const labels =
    getSheetLabels();


  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";

  button.className =
    "poke5e-trainer-pokemon-center__button";

  button.dataset
    .poke5eTrainerAction =
    "pokemon-center";


  button.innerHTML = `
    <img
      class="poke5e-trainer-pokemon-center__icon"
      src="modules/poke5e-local/assets/ui/pokemon-center.png"
      alt=""
      aria-hidden="true"
    >
  `;


  const canOperate =
    canCurrentUserOperateTrainer(
      trainer
    );


  const tooltip =
    canOperate
      ? labels.pokemonCenterTitle
      : labels.pokemonCenterPermissionDenied;


  button.disabled =
    !canOperate;

  button.title =
    tooltip;

  button.setAttribute(
    "aria-label",
    tooltip
  );


  button.addEventListener(
    "click",
    async event => {

      event.preventDefault();
      event.stopPropagation();


      if (
        !canCurrentUserOperateTrainer(
          trainer
        )
      ) {

        ui.notifications.error(
          labels.pokemonCenterPermissionDenied
        );

        return;
      }


      const confirmed =
        await confirmTrainerPokemonCenter(
          labels
        );


      if (!confirmed) {

        return;
      }


      button.disabled =
        true;


      button.setAttribute(
        "aria-busy",
        "true"
      );


      try {

        const result =
          await useTrainerPokemonCenter(
            trainer
          );


        if (
          result.failed > 0
        ) {

          ui.notifications.warn(
            labels.pokemonCenterPartial(
              result.recovered,
              result.failed
            )
          );

        } else if (
          result.recovered === 0
        ) {

          ui.notifications.info(
            labels.pokemonCenterEmpty
          );

        } else {

          ui.notifications.info(
            labels.pokemonCenterRecovered(
              result.recovered
            )
          );
        }

      } catch (error) {

        console.error(
          `[${MODULE_ID}] Error usando Centro Pokémon`,
          error
        );


        ui.notifications.error(
          error?.message ??
          labels.pokemonCenterError
        );

      } finally {

        if (
          button.isConnected
        ) {

          button.removeAttribute(
            "aria-busy"
          );


          button.disabled =
            !canCurrentUserOperateTrainer(
              trainer
            );
        }
      }
    }
  );


  return button;
}

function updateTrainerPokemonCenterHeader(
  element,
  trainer
) {

  const headerButtons =
    element.querySelector(
      TRAINER_HEADER_BUTTONS_SELECTOR
    );


  if (!headerButtons) {

    return;
  }


  const currentButton =
    headerButtons.querySelector(
      POKEMON_CENTER_CONTROL_SELECTOR
    );


  const nextButton =
    createTrainerPokemonCenterHeaderButton(
      trainer
    );


  if (currentButton) {

    currentButton.replaceWith(
      nextButton
    );

    return;
  }


  headerButtons.append(
    nextButton
  );
}

function createTrainerCommandCenter(
  trainer
) {

  const state =
    getTrainerCommandUiState(
      trainer
    );


  const root =
    buildTrainerCommandCenter(
      trainer,
      state
    );


  activateTrainerCommandCenter({
    root,
    trainer,

    refresh:
      () =>
        refreshRenderedTrainerCommandCenters(
          trainer
        )
  });


  return root;
}

function refreshRenderedTrainerCommandCenters(
  trainer
) {

  for (
    const root
    of document.querySelectorAll(
      `.${COMMAND_CENTER_CLASS}`
    )
  ) {

    if (
      root.dataset.trainerId !==
      trainer.id
    ) {

      continue;
    }


    const scrollHost =
      root.closest(
        COMMAND_SCROLL_SELECTOR
      );


    const scrollPosition =
      scrollHost
        ? {
            top:
              scrollHost.scrollTop,

            left:
              scrollHost.scrollLeft
          }
        : null;


    const nextRoot =
      createTrainerCommandCenter(
        trainer
      );


    root.replaceWith(
      nextRoot
    );


    if (
      !scrollHost ||
      !scrollPosition
    ) {

      continue;
    }


    /*
     * Restauración inmediata.
     *
     * Evita que el reemplazo completo del
     * Command Center cambie la posición
     * visible de la pestaña Pokémon.
     */
    scrollHost.scrollTop =
      scrollPosition.top;

    scrollHost.scrollLeft =
      scrollPosition.left;


    /*
     * Algunos cambios de altura se resuelven
     * durante el siguiente layout del navegador.
     *
     * Reafirmamos la misma posición una vez
     * terminada esa actualización.
     */
    window.requestAnimationFrame(
      () => {

        if (
          !scrollHost.isConnected
        ) {

          return;
        }


        scrollHost.scrollTop =
          scrollPosition.top;

        scrollHost.scrollLeft =
          scrollPosition.left;
      }
    );
  }
}


function refreshPokemonOwner(
  pokemon
) {

  const trainer =
    ownerTrainerForPokemon(
      pokemon
    );


  if (!trainer) {
    return;
  }


  refreshRenderedTrainerCommandCenters(
    trainer
  );
}

/* ============================================================
 * TRAINER SIDEBAR
 * ============================================================ */

function updateTrainerSidebar(
  element,
  trainer
) {

  const stats =
    element.querySelector(
      ".sidebar .card > .stats"
    );


  if (!stats) {

    return;
  }


  const labels =
    getSheetLabels();

  const armorClassBadge =
    element.querySelector(
      ".sidebar .card > .ac-badge.badge"
    );


  if (armorClassBadge) {

    armorClassBadge.dataset
      .poke5eTrainerMetric =
      "ac";


    armorClassBadge.setAttribute(
      "aria-label",
      labels.armorClassTitle
    );
  }

  const lozenges =
    [
      ...stats.querySelectorAll(
        ".lozenges .lozenge"
      )
    ];


  const [
    maxSrLozenge,
    speedLozenge,
    proficiencyLozenge
  ] =
    lozenges;


  configureTrainerSidebarMetric(
    maxSrLozenge,
    {
      metric:
        "max-sr",

      label:
        labels.maxSr,

      title:
        labels.maxSrTitle,

      value:
        getTrainerMaximumSr(
          trainer
        )
    }
  );


  configureTrainerSidebarMetric(
    speedLozenge,
    {
      metric:
        "speed",

      label:
        labels.speed,

      title:
        labels.speedTitle
    }
  );


  configureTrainerSidebarMetric(
    proficiencyLozenge,
    {
      metric:
        "proficiency",

      label:
        labels.proficiency,

      title:
        labels.proficiencyTitle
    }
  );


  const meterGroups =
    [
      ...stats.querySelectorAll(
        ".meter-group"
      )
    ];


  const [
    hpMeter,
    hitDice
  ] =
    meterGroups;


  if (hpMeter) {

    hpMeter.dataset
      .poke5eTrainerMeter =
      "hp";


    hpMeter.title =
      labels.hpTitle;


    const hpLabel =
      hpMeter.querySelector(
        ":scope > .label"
      );


    if (hpLabel) {

      hpLabel.textContent =
        labels.hp;
    }
  }


  if (hitDice) {

    hitDice.classList.add(
      "poke5e-trainer-hit-dice"
    );
  }
}

function configureTrainerSidebarMetric(
  lozenge,
  {
    metric,
    label,
    title,
    value = null
  }
) {

  if (!lozenge) {

    return;
  }


  const valueElement =
    lozenge.querySelector(
      ".value"
    );


  const labelElement =
    lozenge.querySelector(
      ".label"
    );


  if (
    value !== null &&
    valueElement
  ) {

    valueElement.textContent =
      String(
        value
      );
  }


  if (labelElement) {

    labelElement.textContent =
      label;
  }


  lozenge.dataset
    .poke5eTrainerMetric =
    metric;


  lozenge.title =
    title;
}

function refreshRenderedTrainerSidebars(
  trainer
) {

  for (
    const application
    of foundry.applications
      .instances
      .values()
  ) {

    if (
      !(
        application instanceof
          TrainerActorSheet
      ) ||
      application.document
        ?.id !==
        trainer.id ||
      !(
        application.element instanceof
          HTMLElement
      )
    ) {

      continue;
    }


    updateTrainerSidebar(
      application.element,
      trainer
    );
  }
}

function refreshRenderedTrainerHeaderControls(
  trainer
) {

  for (
    const application
    of foundry.applications
      .instances
      .values()
  ) {

    if (
      !(
        application instanceof
          TrainerActorSheet
      ) ||
      application.document
        ?.id !==
        trainer.id ||
      !(
        application.element instanceof
          HTMLElement
      )
    ) {

      continue;
    }


    updateTrainerPokemonCenterHeader(
      application.element,
      trainer
    );
  }
}

/* ============================================================
 * SHEET COMMAND CENTER
 * ============================================================ */

function onRenderApplicationV2(
  application,
  element
) {

  const trainer =
    application?.document;


  if (
    !(
      application instanceof
        TrainerActorSheet
    ) ||
    !(element instanceof HTMLElement) ||
    !isTrainerActor(
      trainer
    )
  ) {
    return;
  }

  updateTrainerSidebar(
    element,
    trainer
  );

  updateTrainerPokemonCenterHeader(
    element,
    trainer
  );

  renderRocketRank(
    element,
    trainer
  );

  const host =
    element.querySelector(
      COMMAND_HOST_SELECTOR
    );


  if (!host) {
    return;
  }


  host.replaceChildren(
    createTrainerCommandCenter(
      trainer
    )
  );
}


/* ============================================================
 * LIVE REFRESH
 * ============================================================ */

function onUpdateActor(
  actor
) {

  if (
    isTrainerActor(
      actor
    )
  ) {

    refreshRenderedTrainerSidebars(
      actor
    );


    refreshRenderedTrainerHeaderControls(
      actor
    );


    refreshRenderedTrainerCommandCenters(
      actor
    );

    return;
  }


  refreshPokemonOwner(
    actor
  );
}


function onPokemonOwnedDocumentChange(
  documentValue
) {

  const actor =
    actorFromOwnedDocument(
      documentValue
    );


  refreshPokemonOwner(
    actor
  );
}


function onDeleteActor(
  actor
) {

  refreshPokemonOwner(
    actor
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerTrainerSheetUi() {

  registerTrainerPokemonCenterService();

  registerTrainerRocketRank();

  document.addEventListener(
    "click",
    onPokemonSheetOpenClick
  );


  Hooks.on(
    "renderApplicationV2",
    onRenderApplicationV2
  );

  Hooks.on(
    "updateActor",
    onUpdateActor
  );

  Hooks.on(
    "deleteActor",
    onDeleteActor
  );


  Hooks.on(
    "createItem",
    onPokemonOwnedDocumentChange
  );

  Hooks.on(
    "updateItem",
    onPokemonOwnedDocumentChange
  );

  Hooks.on(
    "deleteItem",
    onPokemonOwnedDocumentChange
  );


  Hooks.on(
    "createActiveEffect",
    onPokemonOwnedDocumentChange
  );

  Hooks.on(
    "updateActiveEffect",
    onPokemonOwnedDocumentChange
  );

  Hooks.on(
    "deleteActiveEffect",
    onPokemonOwnedDocumentChange
  );
}