import {
  STRUGGLE_ACTIVITY_IDS,
  STRUGGLE_MOVE_ID,
  STRUGGLE_RULE
} from "./struggle-rules.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";
import { getLanguage as language } from "./i18n.mjs";


const MODULE_ID =
  "poke5e-local";


const STRUGGLE_MODES =
  new Set([
    "self",
    "nearest"
  ]);


const LABELS = {

  es: {
    missing:
      "no tiene un Item Struggle válido. Reimporta el Pokémon antes de continuar.",

    noTarget:
      "no encuentra un Pokémon objetivo válido y usa Forcejeo contra sí mismo.",

    self:
      "usa Forcejeo contra sí mismo y golpea automáticamente.",

    target:
      "usa Forcejeo contra",

    miss:
      "falla Forcejeo contra",

    damage:
      "recibe",

    damageSuffix:
      "de daño sin tipo por Forcejeo."
  },

  en: {
    missing:
      "does not have a valid Struggle Item. Reimport the Pokémon before continuing.",

    noTarget:
      "cannot find a valid Pokémon target and uses Struggle against itself.",

    self:
      "uses Struggle against itself and automatically hits.",

    target:
      "uses Struggle against",

    miss:
      "misses Struggle against",

    damage:
      "takes",

    damageSuffix:
      "typeless damage from Struggle."
  }
};


function label(
  key
) {

  return (
    LABELS[
      language()
    ][key] ??
    key
  );
}


async function chat(
  actor,
  content
) {

  await ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


function findStruggleItem(
  actor
) {

  return (
    actor?.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "sourceId"
        ) ===
          STRUGGLE_MOVE_ID
    ) ??
    null
  );
}


function struggleMetadata(
  item
) {

  const metadata =
    item?.getFlag(
      MODULE_ID,
      "struggle"
    );


  if (
    metadata?.kind !==
      "struggle" ||
    typeof metadata.damageFormula !==
      "string" ||
    !metadata.damageFormula.trim()
  ) {
    return null;
  }


  return metadata;
}


function struggleActivity(
  item,
  mode
) {

  const activityId =
    STRUGGLE_ACTIVITY_IDS[
      mode
    ];


  if (!activityId) {
    return null;
  }


  return (
    item?.system
      ?.activities
      ?.get?.(
        activityId
      ) ??
    null
  );
}


/* ============================================================
 * NO DAMAGE AMPLIFICATION
 * ============================================================ */

function struggleItemFromConfig(
  config
) {

  const item =
    config?.subject?.item ??
    null;


  if (
    item?.documentName !==
      "Item" ||
    item.getFlag(
      MODULE_ID,
      "sourceId"
    ) !==
      STRUGGLE_MOVE_ID
  ) {
    return null;
  }


  return item;
}


function exactStruggleRoll(
  roll,
  formula
) {

  const RollClass =
    roll.constructor;


  const options =
    foundry.utils.deepClone(
      roll.options ??
      {}
    );


  delete options.type;


  return new RollClass(
    formula,
    roll.data,
    options
  );
}


function onPostDamageRollConfiguration(
  rolls,
  config
) {

  if (
    !Array.isArray(
      rolls
    ) ||
    !rolls.length
  ) {
    return;
  }


  const item =
    struggleItemFromConfig(
      config
    );


  if (!item) {
    return;
  }


  const metadata =
    struggleMetadata(
      item
    );


  if (!metadata) {

    console.error(
      `[${MODULE_ID}] ${item.name}: metadata de Struggle inválida.`
    );

    rolls.splice(
      0,
      rolls.length
    );

    return;
  }


  const replacement =
    exactStruggleRoll(
      rolls[0],
      metadata.damageFormula
    );


  rolls.splice(
    0,
    rolls.length,
    replacement
  );
}


/* ============================================================
 * TOKEN / TARGET
 * ============================================================ */

function sameActor(
  left,
  right
) {

  if (
    !left ||
    !right
  ) {
    return false;
  }


  if (
    left.uuid &&
    right.uuid
  ) {
    return (
      left.uuid ===
      right.uuid
    );
  }


  return (
    left.id ===
    right.id
  );
}


function combatToken(
  combatant
) {

  if (
    !combatant?.tokenId
  ) {
    return null;
  }


  return (
    canvas.tokens?.get(
      combatant.tokenId
    ) ??
    null
  );
}


function tokenDistance(
  sourceToken,
  targetToken
) {

  if (
    !sourceToken ||
    !targetToken ||
    !canvas.grid
  ) {
    return Infinity;
  }


  const measurement =
    canvas.grid.measurePath(
      [
        sourceToken.center,
        targetToken.center
      ]
    );


  const distance =
    Number(
      measurement?.distance
    );


  return Number.isFinite(
    distance
  )
    ? distance
    : Infinity;
}


function validTargetCombatant(
  combatant,
  sourceActor
) {

  const actor =
    combatant?.actor;


  if (
    !actor ||
    sameActor(
      actor,
      sourceActor
    ) ||
    !isPokemonActor(
      actor
    ) ||
    combatant.isDefeated
  ) {
    return false;
  }


  const hp =
    Number(
      actor.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  return hp > 0;
}


function nearestPokemonTarget(
  sourceActor
) {

  const combat =
    game.combat;


  if (!combat) {
    return null;
  }


  const sourceCombatant =
    combat.combatants.find(
      combatant =>
        sameActor(
          combatant.actor,
          sourceActor
        )
    );


  const sourceToken =
    combatToken(
      sourceCombatant
    );


  if (!sourceToken) {
    return null;
  }


  const candidates = [];


  for (
    const combatant
    of combat.combatants
  ) {

    if (
      !validTargetCombatant(
        combatant,
        sourceActor
      )
    ) {
      continue;
    }


    const token =
      combatToken(
        combatant
      );


    const distance =
      tokenDistance(
        sourceToken,
        token
      );


    if (
      !token ||
      distance >
        STRUGGLE_RULE.rangedRange
    ) {
      continue;
    }


    candidates.push({
      actor:
        combatant.actor,

      distance,

      combatantId:
        combatant.id
    });
  }


  candidates.sort(
    (
      left,
      right
    ) => {

      const difference =
        left.distance -
        right.distance;


      if (
        difference !== 0
      ) {
        return difference;
      }


      return String(
        left.combatantId
      ).localeCompare(
        String(
          right.combatantId
        )
      );
    }
  );


  return (
    candidates[0] ??
    null
  );
}


function targetMode(
  distance
) {

  return (
    distance <=
      STRUGGLE_RULE.meleeRange
      ? "melee"
      : "ranged"
  );
}


function targetAc(
  actor
) {

  const ac =
    Number(
      actor?.system
        ?.attributes
        ?.ac
        ?.value
    );


  return Number.isFinite(
    ac
  )
    ? ac
    : 10;
}


/* ============================================================
 * NATIVE ACTION
 * ============================================================ */

async function activateStruggle(
  activity
) {

  const result =
    await activity.use(
      {
        subsequentActions:
          false
      },
      {
        configure:
          false
      }
    );


  return Boolean(
    result
  );
}


async function rollStruggleAttack(
  activity,
  targetActor
) {

  const rolls =
    await activity.rollAttack(
      {
        target:
          targetAc(
            targetActor
          )
      },
      {
        configure:
          false
      }
    );


  const roll =
    rolls?.[0];


  if (!roll) {
    return false;
  }


  if (
    roll.isCritical
  ) {
    return true;
  }


  if (
    roll.isFumble
  ) {
    return false;
  }


  return (
    roll.isSuccess ===
    true
  );
}


function rolledDamageTotal(
  rolls
) {

  return Math.max(
    0,
    Array.from(
      rolls ??
      []
    ).reduce(
      (
        total,
        roll
      ) =>
        total +
        (
          Number(
            roll?.total
          ) ||
          0
        ),
      0
    )
  );
}


async function applyStruggleDamage(
  activity,
  targetActor
) {

  const rolls =
    await activity.rollDamage(
      {
        isCritical:
          false
      },
      {
        configure:
          false
      }
    );


  if (
    !rolls?.length
  ) {
    return null;
  }


  const damage =
    rolledDamageTotal(
      rolls
    );


  if (
    damage > 0
  ) {
    await targetActor.applyDamage(
      damage
    );
  }


  return damage;
}


/* ============================================================
 * SELF
 * ============================================================ */

async function resolveSelfStruggle(
  actor,
  item,
  fallback = false
) {

  const activity =
    struggleActivity(
      item,
      "melee"
    );


  if (!activity) {
    throw new Error(
      "No existe la Activity melee de Struggle."
    );
  }


  const activated =
    await activateStruggle(
      activity
    );


  if (!activated) {
    return;
  }


  await chat(
    actor,
    fallback
      ? `<strong>${actor.name}</strong> ${label("noTarget")}`
      : `<strong>${actor.name}</strong> ${label("self")}`
  );


  const damage =
    await applyStruggleDamage(
      activity,
      actor
    );


  if (
    damage == null
  ) {
    return;
  }


  await chat(
    actor,
    `<strong>${actor.name}</strong> ${label("damage")} ` +
    `<strong>${damage}</strong> ${label("damageSuffix")}`
  );
}


/* ============================================================
 * TARGET
 * ============================================================ */

async function resolveTargetStruggle(
  actor,
  item,
  target
) {

  const mode =
    targetMode(
      target.distance
    );


  const activity =
    struggleActivity(
      item,
      mode
    );


  if (!activity) {
    throw new Error(
      `No existe la Activity ${mode} de Struggle.`
    );
  }


  const activated =
    await activateStruggle(
      activity
    );


  if (!activated) {
    return;
  }


  await chat(
    actor,
    `<strong>${actor.name}</strong> ${label("target")} ` +
    `<strong>${target.actor.name}</strong>.`
  );


  const hit =
    await rollStruggleAttack(
      activity,
      target.actor
    );


  if (!hit) {

    await chat(
      actor,
      `<strong>${actor.name}</strong> ${label("miss")} ` +
      `<strong>${target.actor.name}</strong>.`
    );

    return;
  }


  const damage =
    await applyStruggleDamage(
      activity,
      target.actor
    );


  if (
    damage == null
  ) {
    return;
  }


  await chat(
    actor,
    `<strong>${target.actor.name}</strong> ${label("damage")} ` +
    `<strong>${damage}</strong> ${label("damageSuffix")}`
  );
}


/* ============================================================
 * CONFUSION API
 * ============================================================ */

export async function resolveConfusionStruggle(
  actor,
  mode
) {

  if (
    !isPokemonActor(
      actor
    ) ||
    !STRUGGLE_MODES.has(
      mode
    )
  ) {
    return;
  }


  const item =
    findStruggleItem(
      actor
    );


  if (!item) {

    console.error(
      `[${MODULE_ID}] ${actor.name}: Struggle no está importado.`
    );


    await chat(
      actor,
      `<strong>${actor.name}</strong> ${label("missing")}`
    );

    return;
  }


  try {

    if (
      mode ===
      "self"
    ) {

      await resolveSelfStruggle(
        actor,
        item
      );

      return;
    }


    const target =
      nearestPokemonTarget(
        actor
      );


    if (!target) {

      await resolveSelfStruggle(
        actor,
        item,
        true
      );

      return;
    }


    await resolveTargetStruggle(
      actor,
      item,
      target
    );

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] ${actor.name}: error resolviendo Struggle por Confusión.`,
      error
    );


    ui.notifications.error(
      `${actor.name}: no se pudo resolver Struggle.`
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonStruggleEngine() {

  if (
    registered
  ) {
    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.postDamageRollConfiguration",
    onPostDamageRollConfiguration
  );
}