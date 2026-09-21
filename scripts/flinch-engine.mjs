import {
  buildPokemonStatusEffect
} from "./status-effects.mjs";

import {
  findStatusEffect,
  hasPokemonStatus
} from "./status-runtime.mjs";

import {
  refreshEndOfNextTurnDuration
} from "./turn-duration-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const FLINCHED_STATUS =
  "flinched";


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  try {

    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"

      ? "en"

      : "es";

  } catch {

    return "es";
  }
}


/* ============================================================
 * APPLY FLINCHED
 *
 * Fuente común para Abilities y futuros Moves.
 *
 * La inmunidad (Inner Focus) la decide Turn Engine mediante
 * preCreateActiveEffect.
 * ============================================================ */

export async function applyFlinched(
  actor,
  {
    sourceAbility = null,
    sourceMove = null,
    sourceReason = null
  } = {}
) {

  if (!actor) {

    throw new TypeError(
      "applyFlinched requiere un Actor."
    );
  }


  const existing =
    findStatusEffect(
      actor,
      FLINCHED_STATUS
    );


  if (existing) {

    await refreshEndOfNextTurnDuration(
      existing
    );


    return {
      status:
        "refreshed",

      effect:
        existing
    };
  }


  const effect =
    buildPokemonStatusEffect(
      FLINCHED_STATUS,
      language(),
      {
        sourceAbility,
        sourceMove,
        sourceReason
      }
    );


  if (!effect) {

    return {
      status:
        "unsupported",

      effect:
        null
    };
  }


  const created =
    await actor.createEmbeddedDocuments(
      "ActiveEffect",
      [
        effect
      ]
    );


  return {
    status:
      created.length
        ? "created"
        : "blocked",

    effect:
      created[0] ??
      null
  };
}


/* ============================================================
 * ROLL ACTOR
 * ============================================================ */

function rollActor(
  config
) {

  const subject =
    config?.subject;


  if (
    subject?.documentName ===
      "Actor"
  ) {

    return subject;
  }


  return (
    subject?.actor ??
    null
  );
}


/* ============================================================
 * DISADVANTAGE
 * ============================================================ */

function applyFlinchedDisadvantage(
  config
) {

  const actor =
    rollActor(
      config
    );


  if (
    !actor ||
    !hasPokemonStatus(
      actor,
      FLINCHED_STATUS
    )
  ) {

    return;
  }


  for (
    const rollConfig
    of Array.from(
      config.rolls ??
      []
    )
  ) {

    rollConfig.options ??=
      {};


    rollConfig.options.disadvantage =
      true;


    rollConfig.options[
      MODULE_ID
    ] = {

      ...(
        rollConfig.options[
          MODULE_ID
        ] ??
        {}
      ),

      flinchedDisadvantage: {

        applied:
          true
      }
    };
  }
}


function hasFlinchedDisadvantageMarker(
  roll
) {

  return (
    roll?.options?.[
      MODULE_ID
    ]?.flinchedDisadvantage
      ?.applied ===
    true
  );
}


/* ============================================================
 * FINAL MODE
 *
 * Advantage + Disadvantage -> Normal.
 * ============================================================ */

function resolveFlinchedDisadvantageMode(
  roll
) {

  const modes =
    CONFIG.Dice.D20Roll
      .ADV_MODE;


  const finalizedMode =
    roll?.options
      ?.advantageMode;


  const hasAdvantage =

    roll?.options
      ?.advantage ===
      true ||

    finalizedMode ===
      modes.ADVANTAGE;


  return hasAdvantage

    ? modes.NORMAL

    : modes.DISADVANTAGE;
}


function onPostRollConfiguration(
  rolls
) {

  for (
    const roll
    of Array.from(
      rolls ??
      []
    )
  ) {

    if (
      !hasFlinchedDisadvantageMarker(
        roll
      )
    ) {

      continue;
    }


    roll.options.advantageMode =
      resolveFlinchedDisadvantageMode(
        roll
      );


    roll.configureModifiers();
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonFlinchEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preRollAttack",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.preRollAbilityCheck",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.preRollSkill",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.preRollToolCheck",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.preRollSavingThrow",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.preRollConcentration",
    applyFlinchedDisadvantage
  );


  Hooks.on(
    "dnd5e.postRollConfiguration",
    onPostRollConfiguration
  );


  console.log(
    `[${MODULE_ID}] Flinch Engine registrado.`
  );
}