import {
  hasPokemonAbility
} from "./status-runtime.mjs";
import {
  crossedHpThreshold,
  projectedPokemonHpState
} from "./hp-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const ABILITY_STATE_KIND =
  "pokemon-ability-state";

const HP_THRESHOLD_MARKER =
  "hpThresholdAbilities";

const ANGER_SHELL_ABILITY_ID =
  "anger-shell";

const pendingLongRests =
  new Set();


/* ============================================================
 * DEFINITIONS
 *
 * Nuevas Abilities por umbral de HP pueden agregarse aquí
 * sin modificar el pipeline.
 * ============================================================ */

const HP_THRESHOLD_DEFINITIONS =
  new Map([
    [
      ANGER_SHELL_ABILITY_ID,
      Object.freeze({
        ratio: 0.5,
        direction: "below"
      })
    ]
  ]);


const HP_THRESHOLD_HANDLERS =
  new Map([
    [
      ANGER_SHELL_ABILITY_ID,
      activateAngerShell
    ]
  ]);


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"

    ? "en"

    : "es";
}


/* ============================================================
 * ABILITY ITEM
 * ============================================================ */

function abilityItem(
  actor,
  abilityId
) {

  return actor?.items.find(
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
  ) ?? null;
}


/* ============================================================
 * ABILITY STATE EFFECT
 * ============================================================ */

function abilityStateEffect(
  actor,
  abilityId
) {

  return actor?.effects.find(
    effect =>

      !effect.disabled &&

      effect.getFlag?.(
        MODULE_ID,
        "kind"
      ) ===
        ABILITY_STATE_KIND &&

      effect.getFlag?.(
        MODULE_ID,
        "sourceAbility"
      ) ===
        abilityId
  ) ?? null;
}


/* ============================================================
 * TRIGGERED ABILITIES
 * ============================================================ */

function triggeredThresholdAbilities(
  actor,
  state
) {

  const triggered =
    [];


  for (
    const [
      abilityId,
      definition
    ]
    of HP_THRESHOLD_DEFINITIONS
  ) {

    if (
      !hasPokemonAbility(
        actor,
        abilityId
      ) ||

      abilityStateEffect(
        actor,
        abilityId
      ) ||

      !crossedHpThreshold(
        state,
        definition
      )
    ) {

      continue;
    }


    triggered.push(
      abilityId
    );
  }


  return triggered;
}


/* ============================================================
 * PRE APPLY DAMAGE
 *
 * Aquí todavía conocemos:
 *
 * HP anterior
 * HP posterior previsto
 *
 * pero todavía NO activamos la Ability.
 * ============================================================ */

function onPreApplyDamage(
  actor,
  amount,
  updates,
  options
) {

  if (
    Number(amount) <= 0
  ) {

    return;
  }


  const state =
    projectedPokemonHpState(
      actor,
      updates
    );


  if (!state) {

    return;
  }


  const abilityIds =
    triggeredThresholdAbilities(
      actor,
      state
    );


  if (!abilityIds.length) {

    return;
  }


  options[
    MODULE_ID
  ] ??=
    {};


  options[
    MODULE_ID
  ][HP_THRESHOLD_MARKER] =
    abilityIds;
}


/* ============================================================
 * CAPPED ABILITY INCREASE
 *
 * Ejemplos:
 *
 * 18 → +2 → 20
 * 21 → +1 → 22
 * 22 → +0
 * ============================================================ */

function cappedAbilityIncrease(
  actor,
  abilityId,
  amount,
  maximum
) {

  const current =
    Number(
      actor?.system
        ?.abilities
        ?.[abilityId]
        ?.value ??
      0
    );


  if (
    !Number.isFinite(current)
  ) {

    return 0;
  }


  const target =
    Math.min(
      maximum,
      current + amount
    );


  return Math.max(
    0,
    target - current
  );
}


/* ============================================================
 * ANGER SHELL
 * ============================================================ */

async function activateAngerShell(
  actor
) {

  if (
    abilityStateEffect(
      actor,
      ANGER_SHELL_ABILITY_ID
    )
  ) {

    return;
  }


  const ability =
    abilityItem(
      actor,
      ANGER_SHELL_ABILITY_ID
    );


  if (!ability) {

    return;
  }


  const strIncrease =
    cappedAbilityIncrease(
      actor,
      "str",
      2,
      22
    );


  const dexIncrease =
    cappedAbilityIncrease(
      actor,
      "dex",
      2,
      22
    );


  const changes = [
    {
      key:
        "system.attributes.ac.bonus",

      mode:
        CONST.ACTIVE_EFFECT_MODES.ADD,

      value:
        "-2",

      priority:
        20
    }
  ];


  if (
    strIncrease > 0
  ) {

    changes.push({
      key:
        "system.abilities.str.value",

      mode:
        CONST.ACTIVE_EFFECT_MODES.ADD,

      value:
        String(
          strIncrease
        ),

      priority:
        20
    });
  }


  if (
    dexIncrease > 0
  ) {

    changes.push({
      key:
        "system.abilities.dex.value",

      mode:
        CONST.ACTIVE_EFFECT_MODES.ADD,

      value:
        String(
          dexIncrease
        ),

      priority:
        20
    });
  }


  const suffix =
    language() === "en"

      ? "Active"

      : "Activa";


  await actor.createEmbeddedDocuments(
    "ActiveEffect",
    [
      {
        name:
          `${ability.name} — ${suffix}`,

        img:
          ability.img,

        disabled:
          false,

        transfer:
          false,

        changes,

        flags: {
          [MODULE_ID]: {
            kind:
              ABILITY_STATE_KIND,

            sourceAbility:
              ANGER_SHELL_ABILITY_ID,

            expiresOnLongRest:
              true,

            strIncrease,

            dexIncrease
          }
        }
      }
    ]
  );


  const content =
    language() === "en"

      ? (
          `<strong>${actor.name}</strong> activates ` +
          `<strong>${ability.name}</strong>: ` +
          `AC -2, STR +${strIncrease}, DEX +${dexIncrease}.`
        )

      : (
          `<strong>${actor.name}</strong> activa ` +
          `<strong>${ability.name}</strong>: ` +
          `CA -2, Fuerza +${strIncrease}, Destreza +${dexIncrease}.`
        );


  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


/* ============================================================
 * APPLY DAMAGE
 * ============================================================ */

function onApplyDamage(
  actor,
  amount,
  options
) {

  if (
    Number(amount) <= 0
  ) {

    return;
  }


  const abilityIds =
    options?.[
      MODULE_ID
    ]?.[
      HP_THRESHOLD_MARKER
    ];


  if (
    !Array.isArray(
      abilityIds
    ) ||
    !abilityIds.length
  ) {

    return;
  }


  void processThresholdAbilities(
    actor,
    abilityIds
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error procesando habilidad por umbral de HP:`,
        error
      );
    }
  );
}


async function processThresholdAbilities(
  actor,
  abilityIds
) {

  for (
    const abilityId
    of abilityIds
  ) {

    const handler =
      HP_THRESHOLD_HANDLERS.get(
        abilityId
      );


    if (!handler) {

      continue;
    }


    await handler(
      actor
    );
  }
}


/* ============================================================
 * LONG REST LIFECYCLE
 *
 * restCompleted sirve para Short y Long Rest.
 *
 * Por eso registramos qué Actor inició específicamente
 * un Long Rest y solo entonces limpiamos los efectos.
 * ============================================================ */

function onPreLongRest(
  actor
) {

  if (actor?.uuid) {

    pendingLongRests.add(
      actor.uuid
    );
  }
}


function onPreShortRest(
  actor
) {

  if (actor?.uuid) {

    pendingLongRests.delete(
      actor.uuid
    );
  }
}


function longRestAbilityEffects(
  actor
) {

  return actor?.effects.filter(
    effect =>

      !effect.disabled &&

      effect.getFlag?.(
        MODULE_ID,
        "kind"
      ) ===
        ABILITY_STATE_KIND &&

      effect.getFlag?.(
        MODULE_ID,
        "expiresOnLongRest"
      ) ===
        true
  ) ?? [];
}


async function clearLongRestAbilityEffects(
  actor
) {

  const effects =
    longRestAbilityEffects(
      actor
    );


  if (!effects.length) {

    return;
  }


  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    effects.map(
      effect =>
        effect.id
    )
  );


  const content =
    language() === "en"

      ? (
          `<strong>${actor.name}</strong>'s temporary ability ` +
          "changes end after the long rest."
        )

      : (
          "Los cambios temporales de habilidades de " +
          `<strong>${actor.name}</strong> terminan tras el descanso largo.`
        );


  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


function onRestCompleted(
  actor
) {

  if (
    !actor?.uuid ||
    !pendingLongRests.delete(
      actor.uuid
    )
  ) {

    return;
  }


  void clearLongRestAbilityEffects(
    actor
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error limpiando habilidades tras descanso largo:`,
        error
      );
    }
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonHpThresholdAbilityEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preApplyDamage",
    onPreApplyDamage
  );


  Hooks.on(
    "dnd5e.applyDamage",
    onApplyDamage
  );


  Hooks.on(
    "dnd5e.preLongRest",
    onPreLongRest
  );


  Hooks.on(
    "dnd5e.preShortRest",
    onPreShortRest
  );


  Hooks.on(
    "dnd5e.restCompleted",
    onRestCompleted
  );


  console.log(
    `[${MODULE_ID}] HP Threshold Ability Engine registrado.`
  );
}