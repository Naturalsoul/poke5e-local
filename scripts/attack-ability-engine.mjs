import {
  isAttackCritical,
  isAttackMiss,
  subscribeAttackOutcome
} from "./attack-outcome-engine.mjs";

import {
  hasPokemonAbility
} from "./status-runtime.mjs";

import {
  isBelowHpRatio
} from "./hp-runtime.mjs";

import {
  armFollowingTurnMoveModifier
} from "./move-modifier-runtime.mjs";

import {
  BERSERK_ABILITY_ID,
  hasActiveBerserk
} from "./berserk-runtime.mjs";
import { actorFromUuid } from "./foundry-runtime.mjs";
import { getLanguage as language } from "./i18n.mjs";

const MODULE_ID =
  "poke5e-local";

const PENDING_ATTACK_MODIFIER_FLAG =
  "pendingAttackModifier";

const ANALYTIC_ABILITY_ID =
  "analytic";

const ANGER_POINT_ABILITY_ID =
  "anger-point";

const DEFEATIST_ABILITY_ID =
  "defeatist";

const DEFEATIST_HP_RATIO =
  0.25;

const pendingByActor =
  new Map();

const ANALYTIC_MESSAGES =
  Object.freeze({

    es: {
      activates:
        "activa",

      effect:
        "Su próximo ataque se realiza con ventaja."
    },

    en: {
      activates:
        "activates",

      effect:
        "Its next attack is made with advantage."
    }
  });

const ANGER_POINT_MESSAGES =
  Object.freeze({

    es: {
      activates:
        "activa",

      effect:
        "En su siguiente turno, los dados de daño de un Move se duplicarán."
    },

    en: {
      activates:
        "activates",

      effect:
        "On its following turn, the damage dice of one Move will be doubled."
    }
  });


/* ============================================================
 * POKE5E ATTACK ACTIVITY
 * ============================================================ */

function isPoke5eAttackActivity(
  activity
) {

  const item =
    activity?.item;


  return Boolean(

    item &&

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) ===
      "move"
  );
}


/* ============================================================
 * PENDING ATTACK MODIFIER
 * ============================================================ */

function pendingAttackModifier(
  actor
) {

  if (!actor) {

    return null;
  }


  return (
    pendingByActor.get(
      actor.uuid
    )

    ??

    actor.getFlag?.(
      MODULE_ID,
      PENDING_ATTACK_MODIFIER_FLAG
    )

    ??

    null
  );
}


function analyticPendingModifier() {

  return {

    kind:
      "next-attack-modifier",

    sourceAbility:
      ANALYTIC_ABILITY_ID,

    advantage:
      true
  };
}

function abilityDisplayName(
  actor,
  abilityId
) {

  const ability =
    actor?.items.find(
      item =>

        item.getFlag?.(
          MODULE_ID,
          "kind"
        ) ===
          "ability" &&

        item.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          abilityId
    );


  return (
    ability?.name ??
    abilityId
  );
}


function angerPointMoveModifier() {

  return {

    sourceAbility:
      ANGER_POINT_ABILITY_ID,

    timing:
      "following-turn",

    usesRemaining:
      1,

    damageDiceMultiplier:
      2
  };
}

async function setPendingAttackModifier(
  actor,
  modifier
) {

  /*
   * Mirror inmediato.
   *
   * Evita depender de que setFlag termine antes
   * de que el usuario pueda iniciar otro ataque.
   */

  pendingByActor.set(
    actor.uuid,
    modifier
  );


  /*
   * Persistimos también en el Actor para que
   * el estado sobreviva a rerenders/reloads.
   */

  await actor.setFlag(
    MODULE_ID,
    PENDING_ATTACK_MODIFIER_FLAG,
    modifier
  );
}


// Sap Sipper, Justified, Rattled...: the holder's next attack has advantage, like Analytic.
export function grantNextAttackAdvantage(actor, abilityId) {
  return setPendingAttackModifier(actor, { kind: "next-attack-modifier", sourceAbility: abilityId, advantage: true });
}

async function clearPendingAttackModifier(
  actor
) {

  pendingByActor.delete(
    actor.uuid
  );


  await actor.unsetFlag(
    MODULE_ID,
    PENDING_ATTACK_MODIFIER_FLAG
  );
}

async function postAnalyticActivationMessage(
  actor
) {

  const abilityName =
    abilityDisplayName(
      actor,
      ANALYTIC_ABILITY_ID
    );


  const messages =
    ANALYTIC_MESSAGES[
      language()
    ];


  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${actor.name}</strong>

        ${messages.activates}

        <strong>${abilityName}</strong>.

        ${messages.effect}

      </div>
    `
  });
}

async function postAngerPointActivationMessage(
  actor
) {

  const abilityName =
    abilityDisplayName(
      actor,
      ANGER_POINT_ABILITY_ID
    );


  const messages =
    ANGER_POINT_MESSAGES[
      language()
    ];


  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${actor.name}</strong>

        ${messages.activates}

        <strong>${abilityName}</strong>.

        ${messages.effect}

      </div>
    `
  });
}

/* ============================================================
 * CONTINUOUS ATTACK DISADVANTAGE
 *
 * Defeatist:
 * HP < 25 % -> ataques con Disadvantage.
 *
 * Berserk:
 * HP < 25 % -> ataques con Disadvantage.
 *
 * Un Pokémon tiene una única Ability activa,
 * por lo que estas reglas no se acumulan.
 * ============================================================ */

function hasActiveDefeatist(
  actor
) {

  return (
    hasPokemonAbility(
      actor,
      DEFEATIST_ABILITY_ID
    ) &&

    isBelowHpRatio(
      actor,
      DEFEATIST_HP_RATIO
    )
  );
}


function activeContinuousDisadvantageAbility(
  actor
) {

  if (
    hasActiveDefeatist(
      actor
    )
  ) {

    return DEFEATIST_ABILITY_ID;
  }


  if (
    hasActiveBerserk(
      actor
    )
  ) {

    return BERSERK_ABILITY_ID;
  }


  return null;
}


function applyContinuousDisadvantageToRollConfig(
  rollConfig,
  sourceAbility
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

    continuousAttackModifier: {

      sourceAbility,

      disadvantage:
        true
    }
  };
}


function hasContinuousDisadvantageMarker(
  roll
) {

  return (
    roll?.options?.[
      MODULE_ID
    ]?.continuousAttackModifier
      ?.disadvantage ===
    true
  );
}

/* ============================================================
 * APPLY TO NEXT ATTACK
 *
 * No consumimos aquí el estado pendiente.
 *
 * preRollAttack ocurre antes del diálogo y el usuario
 * todavía podría cancelar la tirada.
 * ============================================================ */

function onPreRollAttack(
  config
) {

  const activity =
    config?.subject;


  if (
    !isPoke5eAttackActivity(
      activity
    )
  ) {

    return;
  }


  const actor =
    activity.actor;

      /* ==========================================================
      * CONTINUOUS DISADVANTAGE
      *
      * Defeatist / Berserk.
      * ========================================================== */

      const continuousDisadvantageAbility =
        activeContinuousDisadvantageAbility(
          actor
        );


      if (
        continuousDisadvantageAbility
      ) {

        const rollConfig =
          config.rolls?.[0];


        if (!rollConfig) {

          console.warn(
            `[${MODULE_ID}] ${activity.item.name}: ` +
            "no se encontró config.rolls[0] para aplicar Disadvantage de Ability."
          );


          return;
        }


        applyContinuousDisadvantageToRollConfig(
          rollConfig,
          continuousDisadvantageAbility
        );


        return;
      }


  const modifier =
    pendingAttackModifier(
      actor
    );


  if (
    modifier?.kind !==
      "next-attack-modifier" ||

    modifier.advantage !==
      true
  ) {

    return;
  }


  /*
   * Un Move Pokémon actual produce un único
   * attack roll primario.
   *
   * El beneficio es para "el siguiente ataque",
   * no para rolls posteriores añadidos al proceso.
   */

  const rollConfig =
    config.rolls?.[0];


  if (!rollConfig) {

    console.warn(
      `[${MODULE_ID}] ${activity.item.name}: ` +
      "no se encontró config.rolls[0] para aplicar el modificador del siguiente ataque."
    );


    return;
  }


  rollConfig.options ??=
    {};


  /*
   * Dejamos que D&D5e resuelva:
   *
   * advantage
   * disadvantage
   * ambos → normal
   */

  rollConfig.options.advantage =
    true;


  /*
   * Marker que llegará al D20Roll.
   *
   * Nos permite consumir Analytic solamente
   * cuando el ataque fue efectivamente tirado.
   */

  rollConfig.options[
    MODULE_ID
  ] = {

    ...(
      rollConfig.options[
        MODULE_ID
      ] ??
      {}
    ),

    pendingAttackModifier: {

      applied:
        true,

      sourceAbility:
        modifier.sourceAbility ??
        null
    }
  };
}


/* ============================================================
 * ¿EL ROLL CONSUMIÓ EL MODIFICADOR?
 * ============================================================ */

function usedPendingAttackModifier(
  roll
) {

  return (
    roll?.options?.[
      MODULE_ID
    ]?.pendingAttackModifier
      ?.applied ===
    true
  );
}

/* ============================================================
 * RESOLVER ADVANTAGE FINAL
 *
 * El diálogo D&D5e puede sobrescribir advantageMode
 * según el botón pulsado.
 *
 * Analytic es una regla mecánica, por lo que no debe
 * desaparecer simplemente por pulsar "Normal".
 *
 * Si existe Disadvantage real/manual:
 *
 * Advantage + Disadvantage
 * → Normal
 * ============================================================ */

function resolvePendingAdvantageMode(
  roll
) {

  const modes =
    CONFIG.Dice.D20Roll
      .ADV_MODE;


  const finalizedMode =
    roll?.options
      ?.advantageMode;


  const hasDisadvantage =

    roll?.options
      ?.disadvantage ===
      true ||

    finalizedMode ===
      modes.DISADVANTAGE;


  return hasDisadvantage

    ? modes.NORMAL

    : modes.ADVANTAGE;
}

function resolveContinuousDisadvantageMode(
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


  /*
   * D&D5e:
   *
   * Advantage + Disadvantage
   * -> Normal
   */

  return hasAdvantage

    ? modes.NORMAL

    : modes.DISADVANTAGE;
}


/* ============================================================
 * POST ATTACK ROLL CONFIGURATION
 *
 * Este punto ocurre:
 *
 * diálogo cerrado
 * ↓
 * D20Roll construido
 * ↓
 * AQUÍ
 * ↓
 * evaluación del dado
 *
 * Así Analytic queda realmente aplicado al ataque.
 * ============================================================ */

function onPostAttackRollConfiguration(
  rolls,
  config
) {

  if (
    !isPoke5eAttackActivity(
      config?.subject
    )
  ) {

    return;
  }


  for (
    const roll
    of Array.from(
      rolls ??
      []
    )
  ) {

    let changed =
      false;


    /* ========================================================
    * DEFEATIST
    * ======================================================== */

    if (
      hasContinuousDisadvantageMarker(
        roll
      )
    ) {

      roll.options.advantageMode =
        resolveContinuousDisadvantageMode(
          roll
        );


      changed =
        true;
    }


    /* ========================================================
    * ANALYTIC
    * ======================================================== */

    if (
      usedPendingAttackModifier(
        roll
      )
    ) {

      roll.options.advantageMode =
        resolvePendingAdvantageMode(
          roll
        );


      changed =
        true;
    }


    if (!changed) {

      continue;
    }


    /*
    * El D20Roll ya fue construido.
    *
    * Reconfiguramos sus modificadores antes
    * de evaluar el dado.
    */

    roll.configureModifiers();
  }
}

async function processAngerPoint(
  outcome
) {

  if (
    !isAttackCritical(
      outcome
    )
  ) {

    return;
  }


  const target =
    actorFromUuid(
      outcome.targetActorUuid
    );


  if (
    !target ||

    !hasPokemonAbility(
      target,
      ANGER_POINT_ABILITY_ID
    )
  ) {

    return;
  }


  await armFollowingTurnMoveModifier(
    target,
    angerPointMoveModifier()
  );


  await postAngerPointActivationMessage(
    target
  );
}


/* ============================================================
 * ANALYTIC
 *
 * Poke5e:
 *
 * después de fallar un ataque,
 * el siguiente ataque tiene ventaja.
 * ============================================================ */

async function onAttackOutcome(
  outcome,
  context
) {

  await processAngerPoint(
    outcome
  );


  const actor =
    context?.activity?.actor;


  if (!actor) {

    return;
  }


  const analyticTriggered =
    isAttackMiss(
      outcome
    ) &&

    hasPokemonAbility(
      actor,
      ANALYTIC_ABILITY_ID
    );


  /*
   * MISS
   *
   * Si el Pokémon tiene Analytic:
   *
   * - un primer fallo arma Analytic;
   * - si el ataque con Analytic vuelve a fallar,
   *   queda armado de nuevo para el siguiente.
   */

  if (
    analyticTriggered
  ) {

    await setPendingAttackModifier(
      actor,
      analyticPendingModifier()
    );


    await postAnalyticActivationMessage(
      actor
    );


    return;
  }


  /*
   * El siguiente ataque ya ocurrió.
   *
   * Si no volvió a fallar con Analytic,
   * consumimos el beneficio pendiente.
   *
   * También se consume si hit/miss quedó sin resolver:
   * la regla otorga ventaja al siguiente ataque,
   * no hasta conseguir un impacto.
   */

  if (
    usedPendingAttackModifier(
      context?.roll
    )
  ) {

    await clearPendingAttackModifier(
      actor
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonAttackAbilityEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  /*
   * Preparamos el beneficio antes del diálogo.
   */

  Hooks.on(
    "dnd5e.preRollAttack",
    onPreRollAttack
  );


  /*
   * Lo hacemos obligatorio después de que
   * el diálogo terminó de configurar el D20.
   */

  Hooks.on(
    "dnd5e.postAttackRollConfiguration",
    onPostAttackRollConfiguration
  );


  /*
   * Detectamos posteriormente miss/hit
   * mediante nuestro contrato canónico.
   */

  subscribeAttackOutcome(
    onAttackOutcome
  );
}