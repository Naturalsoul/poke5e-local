import {
  getNatureDefinition,
  natureFromD100
} from "./nature-rules.mjs";

import {
  historicalPokemonConHpAdjustment
} from "./pokemon-hp-rules.mjs";

import {
  refreshPokemonMoves
} from "./pokemon-move-refresh-service.mjs";


const MODULE_ID =
  "poke5e-local";

const NATURE_EFFECT_KIND =
  "pokemon-nature";


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertPokemonActor(
  actor
) {

  if (
    actor?.documentName !==
      "Actor" ||

    actor.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "pokemon"
  ) {

    throw new TypeError(
      `${actor?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function currentLanguage() {

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
 * STATE
 * ============================================================ */

function normalizeNatureRoll(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;
  }


  const numeric =
    Number(
      value
    );


  return (
    Number.isInteger(
      numeric
    ) &&
    numeric >= 1 &&
    numeric <= 100
  )

    ? numeric

    : null;
}


function normalizedNatureState(
  value
) {

  const definition =
    getNatureDefinition(
      value?.id
    );


  if (!definition) {

    return null;
  }


  return Object.freeze({
    id:
      definition.id,

    roll:
      normalizeNatureRoll(
        value?.roll
      ),

    definition
  });
}


export function getPokemonNature(
  actor
) {

  if (
    actor?.documentName !==
      "Actor"
  ) {

    return null;
  }


  return normalizedNatureState(
    actor.getFlag?.(
      MODULE_ID,
      "nature"
    )
  );
}


/* ============================================================
 * EFFECT
 * ============================================================ */

function natureEffects(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>
      effect.getFlag?.(
        MODULE_ID,
        "kind"
      ) ===
        NATURE_EFFECT_KIND
  );
}


function addAbilityScore(
  abilityId,
  value
) {

  return {
    key:
      `system.abilities.${abilityId}.value`,

    mode:
      CONST.ACTIVE_EFFECT_MODES.ADD,

    value:
      String(
        value
      ),

    priority:
      10
  };
}


function natureChanges(
  definition
) {

  const changes =
    [];


  if (
    definition.increase
  ) {

    changes.push(
      addAbilityScore(
        definition.increase,
        1
      )
    );
  }


  if (
    definition.decrease
  ) {

    changes.push(
      addAbilityScore(
        definition.decrease,
        -1
      )
    );
  }


  return changes;
}


function natureEffectSource(
  definition
) {

  const language =
    currentLanguage();


  const name =
    language === "en"

      ? definition.name.en

      : definition.name.es;


  return {
    name:
      language === "en"

        ? `Nature — ${name}`

        : `Naturaleza — ${name}`,

    img:
      "icons/svg/aura.svg",

    disabled:
      false,

    transfer:
      false,

    duration:
      {},

    changes:
      natureChanges(
        definition
      ),

    flags: {

      [MODULE_ID]: {

        managed:
          true,

        kind:
          NATURE_EFFECT_KIND,

        natureId:
          definition.id
      }
    }
  };
}


async function synchronizeNatureEffect(
  actor,
  definition
) {

  const effects =
    natureEffects(
      actor
    );


  const source =
    natureEffectSource(
      definition
    );


  const primary =
    effects[0] ??
    null;


  if (primary) {

    await primary.update({
      name:
        source.name,

      img:
        source.img,

      disabled:
        false,

      changes:
        foundry.utils.deepClone(
          source.changes
        ),

      [`flags.${MODULE_ID}.managed`]:
        true,

      [`flags.${MODULE_ID}.kind`]:
        NATURE_EFFECT_KIND,

      [`flags.${MODULE_ID}.natureId`]:
        definition.id
    });

  } else {

    const created =
      await actor.createEmbeddedDocuments(
        "ActiveEffect",
        [
          source
        ]
      );


    if (
      !created[0]
    ) {

      throw new Error(
        `${actor.name}: no se pudo crear el efecto de Nature.`
      );
    }
  }


  const duplicateIds =
    effects
      .slice(
        1
      )
      .map(
        effect =>
          effect.id
      )
      .filter(Boolean);


  if (
    duplicateIds.length
  ) {

    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      duplicateIds
    );
  }
}


/* ============================================================
 * CON / HP
 * ============================================================ */

function abilityModifier(
  score
) {

  return Math.floor(
    (
      Number(
        score ??
        10
      ) -
      10
    ) /
    2
  );
}


function pokemonLevel(
  actor
) {

  const value =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      )
    );


  return Number.isFinite(
    value
  )

    ? Math.min(
        20,

        Math.max(
          1,
          Math.trunc(
            value
          )
        )
      )

    : 1;
}


function hpSnapshot(
  actor
) {

  const hp =
    actor.system
      ?.attributes
      ?.hp ??
    {};


  return {
    value:
      Number(
        hp.value ??
        0
      ),

    max:
      Number(
        hp.max ??
        0
      ),

    temp:
      Math.max(
        0,
        Number(
          hp.temp ??
          0
        )
      )
  };
}


async function applyConHpAdjustment(
  actor,
  previousHp,
  previousConModifier,
  nextConModifier
) {

  if (
    previousConModifier ===
    nextConModifier
  ) {

    return 0;
  }


  const progression =
    foundry.utils.deepClone(
      actor.getFlag(
        MODULE_ID,
        "pokemonProgression"
      ) ??
      {}
    );


  const adjustment =
    historicalPokemonConHpAdjustment({
      progression,

      currentLevel:
        pokemonLevel(
          actor
        ),

      previousConModifier,
      nextConModifier
    });


  if (
    adjustment === 0
  ) {

    return 0;
  }


  const newMaximum =
    Math.max(
      1,
      previousHp.max +
        adjustment
    );


  const missingHp =
    Math.max(
      0,
      previousHp.max -
        previousHp.value
    );


  let newValue;


  if (
    previousHp.value <= 0
  ) {

    newValue =
      0;

  } else if (
    previousHp.max > 0 &&
    previousHp.value >=
      previousHp.max
  ) {

    newValue =
      newMaximum;

  } else {

    newValue =
      Math.max(
        0,
        newMaximum -
          missingHp
      );
  }


  await actor.update({
    "system.attributes.hp.max":
      newMaximum,

    "system.attributes.hp.value":
      Math.min(
        newMaximum,
        newValue
      ),

    "system.attributes.hp.temp":
      previousHp.temp
  });


  return adjustment;
}


/* ============================================================
 * ASSIGN / REPLACE
 * ============================================================ */

export async function assignPokemonNature(
  actor,
  natureId,
  {
    roll = null
  } = {}
) {

  assertPokemonActor(
    actor
  );


  const definition =
    getNatureDefinition(
      natureId
    );


  if (!definition) {

    throw new RangeError(
      `Nature desconocida: ${String(natureId)}.`
    );
  }


  const previousNature =
    getPokemonNature(
      actor
    );


  const previousHp =
    hpSnapshot(
      actor
    );


  const previousConModifier =
    abilityModifier(
      actor.system
        ?.abilities
        ?.con
        ?.value
    );


  await synchronizeNatureEffect(
    actor,
    definition
  );


  await actor.setFlag(
    MODULE_ID,
    "nature",
    {
      id:
        definition.id,

      roll:
        normalizeNatureRoll(
          roll
        )
    }
  );


  const nextConModifier =
    abilityModifier(
      actor.system
        ?.abilities
        ?.con
        ?.value
    );


  const hpAdjustment =
    await applyConHpAdjustment(
      actor,
      previousHp,
      previousConModifier,
      nextConModifier
    );


  const moveRefresh =
    await refreshPokemonMoves(
      actor
    );


  return {
    previousNature,

    nature:
      getPokemonNature(
        actor
      ),

    hpAdjustment,

    movesRefreshed:
      moveRefresh.refreshed
  };
}


export async function replacePokemonNature(
  actor,
  natureId
) {

  return assignPokemonNature(
    actor,
    natureId,
    {
      roll:
        null
    }
  );
}


/* ============================================================
 * RANDOM
 * ============================================================ */

export async function rollPokemonNature(
  actor
) {

  assertPokemonActor(
    actor
  );


  const roll =
    Roll.create(
      "1d100"
    );


  await roll.evaluate();


  const result =
    Number(
      roll.total
    );


  const definition =
    natureFromD100(
      result
    );


  const application =
    await assignPokemonNature(
      actor,
      definition.id,
      {
        roll:
          result
      }
    );


  return {
    ...application,

    roll:
      result
  };
}