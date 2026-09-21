import {
  addPokemonExperience,
  setPokemonExperience
} from "./pokemon-experience-service.mjs";

import {
  isPokemonMoveKnown
} from "./pokemon-move-service.mjs";

import {
  STRUGGLE_MOVE_ID
} from "./struggle-rules.mjs";

import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";

import {
  clearPokemonHeldItem,
  getPokemonHeldItem,
  transferPokemonHeldItemToTrainer
} from "./pokemon-held-item-service.mjs";

import {
  getPokemonNature,
  replacePokemonNature
} from "./nature-runtime.mjs";

import {
  getNatureDefinition
} from "./nature-rules.mjs";

import {
  assignPokemonShinyState,
  getPokemonShinyState
} from "./shiny-runtime.mjs";

import {
  getDefaultShinyRuleId
} from "./shiny-rules.mjs";

import {
  renamePokemon
} from "./pokemon-name-service.mjs";

import {
  applyPokemonStatus,
  removePokemonStatus
} from "./pokemon-status-service.mjs";

import {
  setPokemonTypes
} from "./pokemon-type-service.mjs";

import {
  replacePokemonGender
} from "./gender-runtime.mjs";

import {
  setPokemonAbilityScore
} from "./pokemon-ability-score-service.mjs";

const MODULE_ID =
  "poke5e-local";


const LABELS = {

  es: {
    invalidMove:
      "El Move seleccionado no está disponible para este Pokémon.",

    invalidActivity:
      "La actividad seleccionada no está disponible.",

    permissionDenied:
      "No tienes ownership suficiente sobre este Trainer y su Pokémon.",

    error:
      "No se pudo usar el Move.",

    invalidItem:
      "El Item seleccionado no está disponible.",

    itemSheetUnavailable:
      "No se puede abrir la ficha de este Item.",

    invalidHp:
      "No se pudo modificar el HP del Pokémon.",

    trainerUnavailable:
      "Este Pokémon no tiene un Trainer disponible.",

    trainerSheetUnavailable:
      "No se puede abrir la ficha del Trainer.",

    gmOnly:
      "Esta acción está disponible solo para el GM.",

    invalidAbility:
      "La característica seleccionada no está disponible.",

    invalidAbilityRoll:
      "No se pudo realizar la tirada de característica.",

    invalidSkill:
      "La Skill seleccionada no está disponible para este Pokémon.",

    invalidSkillRoll:
      "No se pudo realizar el Skill Check.",

    invalidInitiativeRoll:
      "No se pudo realizar la tirada de iniciativa.",

    deleteTitle:
      "Eliminar del Pokémon",

    deleteConfirm:
      name =>
        `¿Eliminar ${name} de este Pokémon?`,

    invalidDeleteItem:
      "Este Item no puede eliminarse desde la ficha Pokémon.",

    deleteFailed:
      "No se pudo eliminar el Item del Pokémon.",

    invalidExperience:
      "La experiencia debe ser un número válido.",

    invalidMovePp:
      "Los PP deben ser un número entero entre 0 y el máximo del Move.",

    movePpUpdateFailed:
      "No se pudieron actualizar los PP del Move.",

    experienceUpdateFailed:
      "No se pudo actualizar la experiencia del Pokémon.",

    invalidHeldItem:
      "El objeto seleccionado no es el objeto que lleva este Pokémon.",

    removeHeldItem:
      "Quitar objeto",

    removeHeldItemFailed:
      "No se pudo quitar el objeto del Pokémon.",

    transferHeldItem:
      "Dar al Trainer",

    transferHeldItemConfirm:
      (itemName, trainerName) =>
        `¿Dar ${itemName} a ${trainerName}? El Pokémon dejará de llevarlo.`,

    transferHeldItemFailed:
      "No se pudo transferir el objeto al Trainer.",

    invalidNature:
      "La Nature seleccionada no es válida.",

    natureUpdateFailed:
      "No se pudo cambiar la Nature del Pokémon.",

    invalidShinyState:
      "El estado Shiny seleccionado no es válido.",

    shinyUpdateFailed:
      "No se pudo cambiar el estado Shiny del Pokémon.",

    nicknameUpdateFailed:
      "No se pudo cambiar el nombre del Pokémon.",

    statusApplyFailed:
      "No se pudo aplicar el estado al Pokémon.",

    statusRemoveFailed:
      "No se pudo quitar el estado del Pokémon.",

    invalidPokemonTypes:
      "No se pudieron resolver los tipos del Pokémon.",

    typeUpdateFailed:
      "No se pudieron actualizar los tipos del Pokémon.",

    genderUpdateFailed:
      "No se pudo cambiar el género del Pokémon.",

    abilityScoreUpdateFailed:
      "No se pudo modificar la característica del Pokémon.",
  },


  en: {
    invalidMove:
      "The selected Move is not available for this Pokémon.",

    invalidActivity:
      "The selected activity is not available.",

    permissionDenied:
      "You do not have sufficient ownership over this Trainer and Pokémon.",

    error:
      "The Move could not be used.",

    invalidItem:
      "The selected Item is not available.",

    itemSheetUnavailable:
      "This Item sheet cannot be opened.",

    invalidHp:
      "The Pokémon HP could not be changed.",

    trainerUnavailable:
      "This Pokémon does not have an available Trainer.",

    trainerSheetUnavailable:
      "The Trainer sheet cannot be opened.",

    gmOnly:
      "This action is available only to the GM.",

    invalidAbility:
      "The selected ability is not available.",

    invalidAbilityRoll:
      "The ability roll could not be performed.",

    invalidSkill:
      "The selected Skill is not available for this Pokémon.",

    invalidSkillRoll:
      "The Skill Check could not be performed.",

    invalidInitiativeRoll:
      "The initiative roll could not be performed.",

    deleteTitle:
      "Remove from Pokémon",

    deleteConfirm:
      name =>
        `Remove ${name} from this Pokémon?`,

    invalidDeleteItem:
      "This Item cannot be removed from the Pokémon sheet.",

    deleteFailed:
      "The Item could not be removed from the Pokémon.",

    invalidExperience:
      "Experience must be a valid number.",

    invalidMovePp:
      "PP must be an integer between 0 and the Move maximum.",

    movePpUpdateFailed:
      "The Move PP could not be updated.",

    experienceUpdateFailed:
      "The Pokémon experience could not be updated.",

    invalidHeldItem:
      "The selected Item is not the Item carried by this Pokémon.",

    removeHeldItem:
      "Remove Item",

    removeHeldItemFailed:
      "The carried Item could not be removed.",

    transferHeldItem:
      "Give to Trainer",

    transferHeldItemConfirm:
      (itemName, trainerName) =>
        `Give ${itemName} to ${trainerName}? The Pokémon will stop carrying it.`,

    transferHeldItemFailed:
      "The carried Item could not be transferred to the Trainer.",

    invalidNature:
      "The selected Nature is not valid.",

    natureUpdateFailed:
      "The Pokémon Nature could not be changed.",

    invalidShinyState:
      "The selected Shiny state is not valid.",

    shinyUpdateFailed:
      "The Pokémon Shiny state could not be changed.",

    nicknameUpdateFailed:
      "The Pokémon name could not be changed.",

    statusApplyFailed:
      "The status could not be applied to the Pokémon.",

    statusRemoveFailed:
      "The status could not be removed from the Pokémon.",

    invalidPokemonTypes:
      "The Pokémon types could not be resolved.",

    typeUpdateFailed:
      "The Pokémon types could not be updated.",

    genderUpdateFailed:
      "The Pokémon gender could not be changed.",

    abilityScoreUpdateFailed:
      "The Pokémon Ability Score could not be changed.",
  }
};


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function getLabels() {

  const language =
    game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
      ? "en"
      : "es";


  return LABELS[
    language
  ];
}


/* ============================================================
 * PERMISSIONS
 * ============================================================ */

function assertPokemonOperationPermission({
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
    !trainer ||
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


/* ============================================================
 * MOVE RESOLUTION
 * ============================================================ */

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

async function updateMovePp({
  pokemon,
  moveId,
  value,
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


  const max =
    Number(
      move.system
        ?.uses
        ?.max ??
      move.getFlag(
        MODULE_ID,
        "pp"
      ) ??
      0
    );


  const current =
    Number(
      value
    );


  if (
    !Number.isInteger(max) ||
    max <= 0 ||
    !Number.isInteger(current) ||
    current < 0 ||
    current > max
  ) {

    throw new Error(
      labels.invalidMovePp
    );
  }


  const spent =
    Number(
      move.system
        ?.uses
        ?.spent ??
      0
    );


  const normalizedSpent =
    Number.isFinite(
      spent
    )
      ? spent
      : 0;


  const nextSpent =
    max -
    current;


  if (
    nextSpent ===
    normalizedSpent
  ) {

    return {
      current,
      max
    };
  }


  await move.update({
    "system.uses.spent":
      nextSpent
  });


  return {
    current,
    max
  };
}

/* ============================================================
 * ITEM DETAILS
 * ============================================================ */

function resolveInspectableItem(
  pokemon,
  itemId
) {

  const item =
    pokemon.items.get(
      String(
        itemId ??
        ""
      )
    );


  if (!item) {

    return null;
  }


  const kind =
    item.getFlag(
      MODULE_ID,
      "kind"
    );


  if (
    kind !== "move" &&
    kind !== "ability" &&
    kind !== "catalog-item"
  ) {

    return null;
  }


  return item;
}


async function openInspectableItem({
  pokemon,
  itemId,
  labels
}) {

  const item =
    resolveInspectableItem(
      pokemon,
      itemId
    );


  if (!item) {

    throw new Error(
      labels.invalidItem
    );
  }


  const sheet =
    item.sheet;


  if (!sheet) {

    throw new Error(
      labels.itemSheetUnavailable
    );
  }


  await sheet.render(
    true
  );
}

/* ============================================================
 * ITEM DELETE
 * ============================================================ */

function normalizeCanonicalId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


function resolveDeletableItem(
  pokemon,
  itemId
) {

  const item =
    resolveInspectableItem(
      pokemon,
      itemId
    );


  if (!item) {

    return null;
  }


  const kind =
    item.getFlag(
      MODULE_ID,
      "kind"
    );


  const sourceId =
    normalizeCanonicalId(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      )
    );


  if (
    kind === "move" &&
    sourceId ===
      STRUGGLE_MOVE_ID
  ) {

    return null;
  }


  return item;
}


async function confirmItemDelete(
  item,
  labels
) {

  return foundry.applications.api
    .DialogV2.confirm({

      window: {
        title:
          labels.deleteTitle
      },

      content: `
        <p>
          ${foundry.utils.escapeHTML(
            labels.deleteConfirm(
              item.name
            )
          )}
        </p>
      `,

      rejectClose:
        false,

      modal:
        true
    });
}


async function deletePokemonItem({
  pokemon,
  itemId,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  const item =
    resolveDeletableItem(
      pokemon,
      itemId
    );


  if (!item) {

    throw new Error(
      labels.invalidDeleteItem
    );
  }


  const confirmed =
    await confirmItemDelete(
      item,
      labels
    );


  if (
    confirmed !== true
  ) {

    return false;
  }


  await item.delete();


  return true;
}

/* ============================================================
 * HELD ITEM
 * ============================================================ */

async function removePokemonHeldItem({
  pokemon,
  itemId,
  labels
}) {

  const heldItem =
    getPokemonHeldItem(
      pokemon
    );


  if (
    !heldItem ||
    heldItem.id !==
      String(
        itemId ??
        ""
      )
  ) {

    throw new Error(
      labels.invalidHeldItem
    );
  }


  const confirmed =
    await foundry.applications.api
      .DialogV2.confirm({

        window: {
          title:
            labels.removeHeldItem
        },

        content: `
          <p>
            ${foundry.utils.escapeHTML(
              labels.deleteConfirm(
                heldItem.name
              )
            )}
          </p>
        `,

        rejectClose:
          false,

        modal:
          true
      });


  if (
    confirmed !== true
  ) {

    return false;
  }


  await clearPokemonHeldItem(
    pokemon,
    {
      deleteItem:
        true
    }
  );


  return true;
}

async function transferPokemonHeldItem({
  trainer,
  pokemon,
  itemId,
  labels
}) {

  if (!trainer) {

    throw new Error(
      labels.trainerUnavailable
    );
  }


  assertPokemonOperationPermission({
    trainer,
    pokemon,
    labels
  });


  const heldItem =
    getPokemonHeldItem(
      pokemon
    );


  if (
    !heldItem ||
    heldItem.id !==
      String(
        itemId ??
        ""
      )
  ) {

    throw new Error(
      labels.invalidHeldItem
    );
  }


  const confirmed =
    await foundry.applications.api
      .DialogV2.confirm({

        window: {
          title:
            labels.transferHeldItem
        },

        content: `
          <p>
            ${foundry.utils.escapeHTML(
              labels.transferHeldItemConfirm(
                heldItem.name,
                trainer.name
              )
            )}
          </p>
        `,

        rejectClose:
          false,

        modal:
          true
      });


  if (
    confirmed !== true
  ) {

    return false;
  }


  await transferPokemonHeldItemToTrainer(
    pokemon,
    trainer
  );


  return true;
}

/* ============================================================
 * NATURE
 * ============================================================ */

async function updatePokemonNature({
  pokemon,
  natureId,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  const normalizedNatureId =
    String(
      natureId ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !getNatureDefinition(
      normalizedNatureId
    )
  ) {

    throw new Error(
      labels.invalidNature
    );
  }


  const currentNature =
    getPokemonNature(
      pokemon
    );


  if (
    currentNature?.id ===
    normalizedNatureId
  ) {

    return currentNature;
  }


  const result =
    await replacePokemonNature(
      pokemon,
      normalizedNatureId
    );


  return result.nature;
}

/* ============================================================
 * SHINY
 * ============================================================ */

async function updatePokemonShinyState({
  pokemon,
  value,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  const normalizedValue =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    normalizedValue !== "true" &&
    normalizedValue !== "false"
  ) {

    throw new Error(
      labels.invalidShinyState
    );
  }


  const isShiny =
    normalizedValue ===
    "true";


  const currentState =
    getPokemonShinyState(
      pokemon
    );


  if (
    currentState?.isShiny ===
    isShiny
  ) {

    return currentState;
  }


  return assignPokemonShinyState(
    pokemon,
    isShiny,
    {
      ruleId:
        currentState?.ruleId ??
        getDefaultShinyRuleId(),

      /*
       * Un cambio realizado deliberadamente
       * por el GM no proviene de una tirada.
       */
      roll:
        null
    }
  );
}

/* ============================================================
 * GENDER
 * ============================================================ */

async function updatePokemonGender({
  pokemon,
  genderId,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  return replacePokemonGender(
    pokemon,
    genderId
  );
}

/* ============================================================
 * TYPES
 * ============================================================ */

async function updatePokemonTypes({
  root,
  pokemon,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  const primarySelect =
    root.querySelector(
      'select[data-pokemon-sheet-field="type-primary"]'
    );


  const secondarySelect =
    root.querySelector(
      'select[data-pokemon-sheet-field="type-secondary"]'
    );


  if (
    !primarySelect ||
    !secondarySelect
  ) {

    throw new Error(
      labels.invalidPokemonTypes
    );
  }


  const previousPrimary =
    primarySelect.dataset
      .typeCurrent ??
    primarySelect.value;


  const previousSecondary =
    secondarySelect.dataset
      .typeCurrent ??
    secondarySelect.value;


  primarySelect.disabled =
    true;

  secondarySelect.disabled =
    true;


  try {

    const result =
      await setPokemonTypes(
        pokemon,
        [
          primarySelect.value,
          secondarySelect.value
        ].filter(Boolean)
      );


    if (
      primarySelect.isConnected
    ) {

      primarySelect.value =
        result.types[0];


      primarySelect.dataset
        .typeCurrent =
        result.types[0];
    }


    if (
      secondarySelect.isConnected
    ) {

      const secondaryType =
        result.types[1] ??
        "";


      secondarySelect.value =
        secondaryType;


      secondarySelect.dataset
        .typeCurrent =
        secondaryType;
    }


    return result;

  } catch (error) {

    if (
      primarySelect.isConnected
    ) {

      primarySelect.value =
        previousPrimary;
    }


    if (
      secondarySelect.isConnected
    ) {

      secondarySelect.value =
        previousSecondary;
    }


    throw error;

  } finally {

    if (
      primarySelect.isConnected
    ) {

      primarySelect.disabled =
        false;
    }


    if (
      secondarySelect.isConnected
    ) {

      secondarySelect.disabled =
        false;
    }
  }
}

/* ============================================================
 * TRAINER
 * ============================================================ */

async function openPokemonTrainer({
  trainer,
  pokemon,
  labels
}) {

  if (!trainer) {

    throw new Error(
      labels.trainerUnavailable
    );
  }


  assertPokemonOperationPermission({
    trainer,
    pokemon,
    labels
  });


  const sheet =
    trainer.sheet;


  if (!sheet) {

    throw new Error(
      labels.trainerSheetUnavailable
    );
  }


  await sheet.render(
    true
  );
}

function toggleTechnicalDetails({
  root,
  button,
  labels
}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      labels.gmOnly
    );
  }


  const panel =
    root.querySelector(
      "[data-pokemon-technical-panel]"
    );


  if (!panel) {

    return;
  }


  const willOpen =
    panel.hidden;


  panel.hidden =
    !willOpen;


  root.dataset.technicalOpen =
    willOpen
      ? "true"
      : "false";


  button.setAttribute(
    "aria-expanded",
    willOpen
      ? "true"
      : "false"
  );


  button.classList.toggle(
    "is-active",
    willOpen
  );
}

/* ============================================================
 * HP
 * ============================================================ */

async function adjustPokemonHp({
  pokemon,
  delta,
  labels
}) {

  const hp =
    pokemon.system
      ?.attributes
      ?.hp;


  const current =
    Number(
      hp?.value
    );


  const max =
    Number(
      hp?.max
    );


  const adjustment =
    Number(
      delta
    );


  if (
    !Number.isFinite(current) ||
    !Number.isFinite(max) ||
    !Number.isFinite(adjustment)
  ) {

    throw new Error(
      labels.invalidHp
    );
  }


  const nextValue =
    Math.max(
      0,
      Math.min(
        max,
        current +
          adjustment
      )
    );


  if (
    nextValue ===
    current
  ) {

    return;
  }


  await pokemon.update({
    "system.attributes.hp.value":
      nextValue
  });
}

/* ============================================================
 * ABILITY ROLLS
 * ============================================================ */

async function executeAbilityRoll({
  pokemon,
  abilityId,
  rollType,
  labels
}) {

  const normalizedAbilityId =
    String(
      abilityId ??
      ""
    )
      .trim()
      .toLowerCase();


  const ability =
    pokemon.system
      ?.abilities
      ?.[normalizedAbilityId];


  if (!ability) {

    throw new Error(
      labels.invalidAbility
    );
  }


  if (
    rollType ===
    "check"
  ) {

    if (
      typeof pokemon
        .rollAbilityCheck !==
      "function"
    ) {

      throw new Error(
        labels.invalidAbilityRoll
      );
    }


    await pokemon.rollAbilityCheck({
      ability:
        normalizedAbilityId
    });


    return;
  }


  if (
    rollType ===
    "save"
  ) {

    if (
      typeof pokemon
        .rollSavingThrow !==
      "function"
    ) {

      throw new Error(
        labels.invalidAbilityRoll
      );
    }


    await pokemon.rollSavingThrow({
      ability:
        normalizedAbilityId
    });


    return;
  }


  throw new Error(
    labels.invalidAbilityRoll
  );
}

/* ============================================================
 * SKILL ROLLS
 * ============================================================ */

async function executeSkillRoll({
  pokemon,
  skillId,
  labels
}) {

  const normalizedSkillId =
    String(
      skillId ??
      ""
    )
      .trim()
      .toLowerCase();


  const skill =
    pokemon.system
      ?.skills
      ?.[normalizedSkillId];


  const proficiency =
    Number(
      skill?.value ??
      0
    );


  if (
    !skill ||
    !Number.isFinite(
      proficiency
    ) ||
    proficiency <= 0
  ) {

    throw new Error(
      labels.invalidSkill
    );
  }


  if (
    typeof pokemon
      .rollSkill !==
    "function"
  ) {

    throw new Error(
      labels.invalidSkillRoll
    );
  }


  await pokemon.rollSkill({
    skill:
      normalizedSkillId
  });
}

/* ============================================================
 * INITIATIVE
 * ============================================================ */

async function executeInitiativeRoll({
  pokemon,
  labels
}) {

  if (
    typeof pokemon
      .rollInitiativeDialog !==
    "function"
  ) {

    throw new Error(
      labels.invalidInitiativeRoll
    );
  }


  await pokemon.rollInitiativeDialog();
}

/* ============================================================
 * EXPERIENCE
 * ============================================================ */

async function updatePokemonExperience({
  pokemon,
  value,
  labels
}) {

  const normalizedValue =
    String(
      value ??
      ""
    )
      .trim()
      .replace(
        /\s+/g,
        ""
      );


  if (
    !normalizedValue
  ) {

    throw new Error(
      labels.invalidExperience
    );
  }


  const relativeMatch =
    normalizedValue.match(
      /^([+-])(\d+)$/
    );


  if (
    relativeMatch
  ) {

    const amount =
      Number(
        relativeMatch[2]
      );


    if (
      !Number.isFinite(
        amount
      )
    ) {

      throw new Error(
        labels.invalidExperience
      );
    }


    const adjustment =
      relativeMatch[1] === "-"
        ? -amount
        : amount;


    return addPokemonExperience(
      pokemon,
      adjustment
    );
  }


  if (
    !/^\d+$/.test(
      normalizedValue
    )
  ) {

    throw new Error(
      labels.invalidExperience
    );
  }


  return setPokemonExperience(
    pokemon,
    normalizedValue
  );
}

/* ============================================================
 * UI STATE
 * ============================================================ */

function setBusy(
  root,
  busy
) {

  root.classList.toggle(
    "is-busy",
    busy
  );


  for (
    const button
    of root.querySelectorAll(
      "button[data-pokemon-sheet-action]"
    )
  ) {

    button.disabled =
      busy;
  }
}


/* ============================================================
 * ACTIVATE
 * ============================================================ */

export function activatePokemonSheetActions({
  root,
  pokemon,
  trainer,
  refresh
}) {

  const labels =
    getLabels();


  root.addEventListener(
    "click",
    async event => {

      const button =
        event.target.closest(
          "button[data-pokemon-sheet-action]"
        );


      if (
        !button ||
        !root.contains(
          button
        )
      ) {

        return;
      }


      const action =
        String(
          button.dataset
            .pokemonSheetAction ??
          ""
        );

      if (
        action ===
        "trainer-open"
      ) {

        try {

          await openPokemonTrainer({
            trainer,
            pokemon,
            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error abriendo Trainer desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );
        }


        return;
      }


      if (
        action ===
        "technical-toggle"
      ) {

        try {

          toggleTechnicalDetails({
            root,
            button,
            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error mostrando detalles técnicos del Pokémon`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );
        }


        return;
      }

      if (
        action ===
        "ability-roll"
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });


          await executeAbilityRoll({
            pokemon,

            abilityId:
              button.dataset
                .abilityId,

            rollType:
              button.dataset
                .rollType,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error realizando Ability Roll desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.invalidAbilityRoll
          );
        }


        return;
      }

      if (
        action ===
        "skill-roll"
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });


          await executeSkillRoll({
            pokemon,

            skillId:
              button.dataset
                .skillId,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error realizando Skill Check desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.invalidSkillRoll
          );
        }


        return;
      }

      if (
        action ===
        "initiative-roll"
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });

        } catch (error) {

          ui.notifications.error(
            error?.message ??
            labels.invalidInitiativeRoll
          );

          return;
        }


        setBusy(
          root,
          true
        );


        try {

          await executeInitiativeRoll({
            pokemon,
            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error realizando Initiative desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.invalidInitiativeRoll
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      if (
        action ===
        "hp-adjust"
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });


          await adjustPokemonHp({
            pokemon,

            delta:
              button.dataset
                .hpDelta,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error modificando HP desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );
        }


        return;
      }

      if (
        action ===
        "status-remove"
      ) {

        setBusy(
          root,
          true
        );


        try {

          await removePokemonStatus(
            pokemon,
            button.dataset
              .effectId
          );


          if (
            typeof refresh ===
            "function"
          ) {

            refresh();
          }

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error quitando estado desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.statusRemoveFailed
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      if (
        action ===
        "item-open"
      ) {

        try {

          await openInspectableItem({
            pokemon,

            itemId:
              button.dataset
                .itemId,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error abriendo Item desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );
        }


        return;
      }

      if (
        action ===
        "held-item-transfer"
      ) {

        try {

          setBusy(
            root,
            true
          );


          await transferPokemonHeldItem({
            trainer,
            pokemon,

            itemId:
              button.dataset
                .itemId,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error transfiriendo Held Item al Trainer desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.transferHeldItemFailed
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      if (
        action ===
        "held-item-remove"
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });


          setBusy(
            root,
            true
          );


          await removePokemonHeldItem({
            pokemon,

            itemId:
              button.dataset
                .itemId,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error quitando Held Item desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.removeHeldItemFailed
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      if (
        action ===
        "item-delete"
      ) {

        setBusy(
          root,
          true
        );


        try {

          await deletePokemonItem({
            pokemon,

            itemId:
              button.dataset
                .itemId,

            labels
          });

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error eliminando Item desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.deleteFailed
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }


      if (
        action !==
        "move-use"
      ) {

        return;
      }


      try {

        assertPokemonOperationPermission({
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


        if (
          typeof refresh ===
          "function"
        ) {

          refresh();
        }

      } catch (error) {

        console.error(
          `[${MODULE_ID}] Error usando Move desde Pokémon Sheet`,
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

  root.addEventListener(
    "change",
    async event => {

      const nicknameInput =
        event.target
          ?.closest?.(
            'input[data-pokemon-sheet-field="nickname"]'
          );


      if (
        nicknameInput &&
        root.contains(
          nicknameInput
        )
      ) {

        const previousValue =
          nicknameInput.dataset
            .nicknameCurrent ??
          pokemon.name;


        try {

          nicknameInput.disabled =
            true;


          const result =
            await renamePokemon(
              pokemon,
              nicknameInput.value
            );


          if (
            nicknameInput.isConnected
          ) {

            nicknameInput.value =
              result.name;


            nicknameInput.dataset
              .nicknameCurrent =
              result.name;
          }

        } catch (error) {

          if (
            nicknameInput.isConnected
          ) {

            nicknameInput.value =
              previousValue;
          }


          console.error(
            `[${MODULE_ID}] Error actualizando nombre desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.nicknameUpdateFailed
          );

        } finally {

          if (
            nicknameInput.isConnected
          ) {

            nicknameInput.disabled =
              false;
          }
        }


        return;
      }

      const typeSelect =
        event.target
          ?.closest?.(
            [
              'select[data-pokemon-sheet-field="type-primary"]',
              'select[data-pokemon-sheet-field="type-secondary"]'
            ].join(",")
          );


      if (
        typeSelect &&
        root.contains(
          typeSelect
        )
      ) {

        try {

          await updatePokemonTypes({
            root,
            pokemon,
            labels
          });


          if (
            typeof refresh ===
            "function"
          ) {

            refresh();
          }

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error actualizando tipos desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.typeUpdateFailed
          );
        }


        return;
      }

      const genderSelect =
        event.target
          ?.closest?.(
            'select[data-pokemon-sheet-field="gender"]'
          );


      if (
        genderSelect &&
        root.contains(
          genderSelect
        )
      ) {

        const previousGenderId =
          genderSelect.dataset
            .genderCurrent ??
          "";


        try {

          genderSelect.disabled =
            true;


          const gender =
            await updatePokemonGender({
              pokemon,

              genderId:
                genderSelect.value,

              labels
            });


          if (
            genderSelect.isConnected
          ) {

            genderSelect.value =
              gender.id;


            genderSelect.dataset
              .genderCurrent =
              gender.id;
          }

        } catch (error) {

          if (
            genderSelect.isConnected
          ) {

            genderSelect.value =
              previousGenderId;
          }


          console.error(
            `[${MODULE_ID}] Error actualizando género desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.genderUpdateFailed
          );

        } finally {

          if (
            genderSelect.isConnected
          ) {

            genderSelect.disabled =
              false;
          }
        }


        return;
      }

      const statusSelect =
        event.target
          ?.closest?.(
            'select[data-pokemon-sheet-field="status-add"]'
          );


      if (
        statusSelect &&
        root.contains(
          statusSelect
        )
      ) {

        const statusId =
          statusSelect.value;


        if (!statusId) {

          return;
        }


        try {

          statusSelect.disabled =
            true;


          await applyPokemonStatus(
            pokemon,
            statusId,
            {
              language:
                game.settings.get(
                  MODULE_ID,
                  "language"
                )
            }
          );


          if (
            typeof refresh ===
            "function"
          ) {

            refresh();
          }

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error aplicando estado desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.statusApplyFailed
          );

        } finally {

          if (
            statusSelect.isConnected
          ) {

            statusSelect.value =
              "";


            statusSelect.disabled =
              false;
          }
        }


        return;
      }

      const experienceInput =
        event.target
          ?.closest?.(
            'input[data-pokemon-sheet-field="experience"]'
          );


      if (
        experienceInput &&
        root.contains(
          experienceInput
        )
      ) {

        try {

          assertPokemonOperationPermission({
            trainer,
            pokemon,
            labels
          });


          experienceInput.disabled =
            true;


          const experience =
            await updatePokemonExperience({
              pokemon,

              value:
                experienceInput.value,

              labels
            });


          if (
            experienceInput.isConnected
          ) {

            experienceInput.value =
              String(
                experience.total
              );


            experienceInput.dataset
              .experienceCurrent =
              String(
                experience.total
              );
          }

        } catch (error) {

          experienceInput.value =
            experienceInput.dataset
              .experienceCurrent ??
            experienceInput.value;


          console.error(
            `[${MODULE_ID}] Error actualizando Experience desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.experienceUpdateFailed
          );

        } finally {

          if (
            experienceInput.isConnected
          ) {

            experienceInput.disabled =
              false;
          }
        }


        return;
      }

      const abilityScoreInput =
        event.target
          ?.closest?.(
            'input[data-pokemon-sheet-field="ability-score"]'
          );


      if (
        abilityScoreInput &&
        root.contains(
          abilityScoreInput
        )
      ) {

        const previousValue =
          abilityScoreInput.dataset
            .abilityScoreCurrent ??
          abilityScoreInput.value;


        try {

          abilityScoreInput.disabled =
            true;


          const result =
            await setPokemonAbilityScore(
              pokemon,
              abilityScoreInput.dataset
                .abilityId,
              abilityScoreInput.value
            );


          if (
            abilityScoreInput.isConnected
          ) {

            abilityScoreInput.value =
              String(
                result.score
              );


            abilityScoreInput.dataset
              .abilityScoreCurrent =
              String(
                result.score
              );
          }

        } catch (error) {

          if (
            abilityScoreInput.isConnected
          ) {

            abilityScoreInput.value =
              previousValue;
          }


          console.error(
            `[${MODULE_ID}] Error actualizando Ability Score desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.abilityScoreUpdateFailed
          );

        } finally {

          if (
            abilityScoreInput.isConnected
          ) {

            abilityScoreInput.disabled =
              false;
          }
        }


        return;
      }

      const natureSelect =
        event.target
          ?.closest?.(
            'select[data-pokemon-sheet-field="nature"]'
          );


      if (
        natureSelect &&
        root.contains(
          natureSelect
        )
      ) {

        const previousNatureId =
          natureSelect.dataset
            .natureCurrent ??
          "";


        try {

          natureSelect.disabled =
            true;


          const nature =
            await updatePokemonNature({
              pokemon,

              natureId:
                natureSelect.value,

              labels
            });


          if (
            natureSelect.isConnected
          ) {

            natureSelect.value =
              nature.id;


            natureSelect.dataset
              .natureCurrent =
              nature.id;
          }

        } catch (error) {

          if (
            natureSelect.isConnected
          ) {

            natureSelect.value =
              previousNatureId;
          }


          console.error(
            `[${MODULE_ID}] Error actualizando Nature desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.natureUpdateFailed
          );

        } finally {

          if (
            natureSelect.isConnected
          ) {

            natureSelect.disabled =
              false;
          }
        }


        return;
      }

      const shinySelect =
        event.target
          ?.closest?.(
            'select[data-pokemon-sheet-field="shiny"]'
          );


      if (
        shinySelect &&
        root.contains(
          shinySelect
        )
      ) {

        const previousValue =
          shinySelect.dataset
            .shinyCurrent ??
          "";


        try {

          shinySelect.disabled =
            true;


          const shinyState =
            await updatePokemonShinyState({
              pokemon,

              value:
                shinySelect.value,

              labels
            });


          if (
            shinySelect.isConnected
          ) {

            const nextValue =
              String(
                shinyState.isShiny
              );


            shinySelect.value =
              nextValue;


            shinySelect.dataset
              .shinyCurrent =
              nextValue;
          }

        } catch (error) {

          if (
            shinySelect.isConnected
          ) {

            shinySelect.value =
              previousValue;
          }


          console.error(
            `[${MODULE_ID}] Error actualizando Shiny desde Pokémon Sheet`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.shinyUpdateFailed
          );

        } finally {

          if (
            shinySelect.isConnected
          ) {

            shinySelect.disabled =
              false;
          }
        }


        return;
      }

      const ppInput =
        event.target
          ?.closest?.(
            'input[data-pokemon-sheet-field="move-pp"]'
          );


      if (
        !ppInput ||
        !root.contains(
          ppInput
        )
      ) {

        return;
      }


      try {

        assertPokemonOperationPermission({
          trainer,
          pokemon,
          labels
        });


        ppInput.disabled =
          true;


        const pp =
          await updateMovePp({
            pokemon,

            moveId:
              ppInput.dataset
                .moveId,

            value:
              ppInput.value,

            labels
          });


        if (
          ppInput.isConnected
        ) {

          ppInput.value =
            String(
              pp.current
            );


          ppInput.dataset
            .movePpCurrent =
            String(
              pp.current
            );
        }

      } catch (error) {

        ppInput.value =
          ppInput.dataset
            .movePpCurrent ??
          ppInput.value;


        console.error(
          `[${MODULE_ID}] Error actualizando PP desde Pokémon Sheet`,
          error
        );


        ui.notifications.error(
          error?.message ??
          labels.movePpUpdateFailed
        );

      } finally {

        if (
          ppInput.isConnected
        ) {

          ppInput.disabled =
            false;
        }
      }
    }
  );


  root.addEventListener(
    "keydown",
    event => {

      const input =
        event.target
          ?.closest?.(
            [
              'input[data-pokemon-sheet-field="nickname"]',
              'input[data-pokemon-sheet-field="experience"]',
              'input[data-pokemon-sheet-field="ability-score"]',
              'input[data-pokemon-sheet-field="move-pp"]'
            ].join(",")
          );


      if (
        !input ||
        !root.contains(
          input
        )
      ) {

        return;
      }


      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        input.blur();

        return;
      }


      if (
        event.key !==
        "Escape"
      ) { 

        return;
      }


      event.preventDefault();


      const field =
        input.dataset
          .pokemonSheetField;

      if (
        field ===
        "nickname"
      ) {

        input.value =
          input.dataset
            .nicknameCurrent ??
          input.value;

      } else if (
        field ===
        "experience"
      ) {
        input.value =
          input.dataset
            .experienceCurrent ??
          input.value;

      } else if (
        field ===
          "ability-score"
      ) {
        input.value =
          input.dataset
            .abilityScoreCurrent ??
          input.value;
      } else if (
        field ===
        "move-pp"
      ) {

        input.value =
          input.dataset
            .movePpCurrent ??
          input.value;
      }


      input.blur();
    }
  );
}