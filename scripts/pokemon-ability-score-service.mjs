import {
  historicalPokemonConHpAdjustment
} from "./pokemon-hp-rules.mjs";

import {
  refreshPokemonMoves
} from "./pokemon-move-refresh-service.mjs";

import {
  isPokemonActor,
  assertPokemon
} from "./trainer-party-service.mjs";


const MODULE_ID =
  "poke5e-local";

const PROGRESSION_VERSION =
  3;

const MIN_ABILITY_SCORE =
  1;

const MAX_ABILITY_SCORE =
  30;

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];


function assertGm() {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Solo el GM puede modificar las características permanentes de un Pokémon."
    );
  }
}


function normalizeAbilityId(
  value
) {

  const abilityId =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    !ABILITY_IDS.includes(
      abilityId
    )
  ) {

    throw new RangeError(
      `Característica desconocida: ${String(value)}.`
    );
  }


  return abilityId;
}


function normalizeAbilityScore(
  value
) {

  const score =
    Number(
      value
    );


  if (
    !Number.isInteger(
      score
    ) ||
    score <
      MIN_ABILITY_SCORE ||
    score >
      MAX_ABILITY_SCORE
  ) {

    throw new RangeError(
      `La característica debe ser un entero entre ` +
      `${MIN_ABILITY_SCORE} y ${MAX_ABILITY_SCORE}.`
    );
  }


  return score;
}


/* ============================================================
 * SCORES
 * ============================================================ */

function rawPokemonSource(
  pokemon
) {

  return pokemon.toObject();
}


export function getPokemonPermanentAbilityScores(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return {};
  }


  const source =
    rawPokemonSource(
      pokemon
    );


  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const score =
          Number(
            source.system
              ?.abilities
              ?.[abilityId]
              ?.value ??
            10
          );


        return [
          abilityId,

          Number.isFinite(
            score
          )
            ? Math.trunc(
                score
              )
            : 10
        ];
      }
    )
  );
}


export function canCurrentUserEditPokemonAbilityScores(
  pokemon
) {

  return Boolean(
    game.user.isGM &&
    isPokemonActor(
      pokemon
    )
  );
}


function emptyAbilityScoreGains() {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,
        0
      ]
    )
  );
}


/* ============================================================
 * LEVEL / MODIFIER
 * ============================================================ */

function pokemonLevel(
  pokemon
) {

  const level =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "level"
      )
    );


  if (
    !Number.isFinite(
      level
    )
  ) {

    return 1;
  }


  return Math.min(
    20,
    Math.max(
      1,
      Math.trunc(
        level
      )
    )
  );
}


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


/* ============================================================
 * HP
 * ============================================================ */

function hpSnapshot(
  pokemon
) {

  const hp =
    pokemon.system
      ?.attributes
      ?.hp ??
    {};


  const value =
    Number(
      hp.value ??
      0
    );


  const maximum =
    Number(
      hp.max ??
      0
    );


  const temp =
    Number(
      hp.temp ??
      0
    );


  return {
    value:
      Number.isFinite(
        value
      )
        ? value
        : 0,

    max:
      Number.isFinite(
        maximum
      )
        ? maximum
        : 0,

    temp:
      Number.isFinite(
        temp
      )
        ? Math.max(
            0,
            temp
          )
        : 0
  };
}


async function applyConHpAdjustment(
  pokemon,
  previousHp,
  progression,
  previousConModifier,
  nextConModifier
) {

  if (
    previousConModifier ===
      nextConModifier
  ) {

    return 0;
  }


  const adjustment =
    historicalPokemonConHpAdjustment({
      progression,

      currentLevel:
        pokemonLevel(
          pokemon
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
    previousHp.value <=
      0
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


  await pokemon.update({
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
 * PROGRESSION
 * ============================================================ */

function progressionSnapshot(
  pokemon
) {

  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "pokemonProgression"
    );


  return {
    exists:
      stored != null,

    value:
      stored &&
      typeof stored ===
        "object"
        ? foundry.utils.deepClone(
            stored
          )
        : {}
  };
}


function rebasedProgression({
  pokemon,
  previousProgression,
  permanentScores,
  hp
}) {

  return {
    ...foundry.utils.deepClone(
      previousProgression
    ),

    version:
      PROGRESSION_VERSION,

    baseLevel:
      previousProgression
        .baseLevel ??
      pokemonLevel(
        pokemon
      ),

    baseHpMax:
      previousProgression
        .baseHpMax ??
      hp.max,

    /*
     * Una edición manual del GM establece
     * un nuevo anchor permanente.
     *
     * Los ASI ya incluidos en system pasan
     * a formar parte de esta nueva base.
     */
    abilityScoreBase:
      foundry.utils.deepClone(
        permanentScores
      ),

    /*
     * Evitamos volver a sumar ASI antiguos
     * sobre la nueva base.
     */
    abilityScoreGains:
      emptyAbilityScoreGains()
  };
}


/* ============================================================
 * UPDATE / ROLLBACK
 * ============================================================ */

function abilityScoreUpdateData(
  scores
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        `system.abilities.${abilityId}.value`,
        scores[
          abilityId
        ]
      ]
    )
  );
}


async function restorePreviousState(
  pokemon,
  {
    permanentScores,
    hp,
    progression
  }
) {

  await pokemon.update({
    ...abilityScoreUpdateData(
      permanentScores
    ),

    "system.attributes.hp.value":
      hp.value,

    "system.attributes.hp.max":
      hp.max,

    "system.attributes.hp.temp":
      hp.temp
  });


  if (
    progression.exists
  ) {

    await pokemon.setFlag(
      MODULE_ID,
      "pokemonProgression",
      foundry.utils.deepClone(
        progression.value
      )
    );

  } else {

    await pokemon.unsetFlag(
      MODULE_ID,
      "pokemonProgression"
    );
  }


  await refreshPokemonMoves(
    pokemon
  );
}


/* ============================================================
 * PUBLIC UPDATE
 * ============================================================ */

export async function setPokemonAbilityScore(
  pokemon,
  abilityId,
  value
) {

  assertPokemon(
    pokemon
  );

  assertGm();


  const normalizedAbilityId =
    normalizeAbilityId(
      abilityId
    );


  const nextScore =
    normalizeAbilityScore(
      value
    );


  const previousScores =
    getPokemonPermanentAbilityScores(
      pokemon
    );


  const previousScore =
    previousScores[
      normalizedAbilityId
    ];


  /*
   * Importante:
   *
   * No hacemos rebase si el valor no cambió.
   * Así evitamos convertir innecesariamente
   * abilityScoreGains existentes en base.
   */
  if (
    previousScore ===
      nextScore
  ) {

    return {
      abilityId:
        normalizedAbilityId,

      previousScore,
      score:
        nextScore,

      effectiveScore:
        Number(
          pokemon.system
            ?.abilities
            ?.[normalizedAbilityId]
            ?.value ??
          nextScore
        ),

      hpAdjustment:
        0,

      movesRefreshed:
        0
    };
  }


  const previousHp =
    hpSnapshot(
      pokemon
    );


  const previousProgression =
    progressionSnapshot(
      pokemon
    );


  const previousConModifier =
    abilityModifier(
      pokemon.system
        ?.abilities
        ?.con
        ?.value
    );


  const nextScores = {
    ...previousScores,

    [normalizedAbilityId]:
      nextScore
  };


  const nextProgression =
    rebasedProgression({
      pokemon,

      previousProgression:
        previousProgression.value,

      permanentScores:
        nextScores,

      hp:
        previousHp
    });


  try {

    await pokemon.update({
      ...abilityScoreUpdateData(
        nextScores
      ),

      [`flags.${MODULE_ID}.pokemonProgression`]:
        nextProgression
    });


    /*
     * pokemon.system ya contiene ahora los
     * ActiveEffects aplicados, incluida Nature.
     */
    const nextConModifier =
      abilityModifier(
        pokemon.system
          ?.abilities
          ?.con
          ?.value
      );


    const hpAdjustment =
      await applyConHpAdjustment(
        pokemon,
        previousHp,
        nextProgression,
        previousConModifier,
        nextConModifier
      );


    /*
     * Los Moves pueden utilizar Ability Scores
     * para fórmulas, ataques, saves, etc.
     */
    const moveRefresh =
      await refreshPokemonMoves(
        pokemon
      );


    return {
      abilityId:
        normalizedAbilityId,

      previousScore,

      score:
        nextScore,

      effectiveScore:
        Number(
          pokemon.system
            ?.abilities
            ?.[normalizedAbilityId]
            ?.value ??
          nextScore
        ),

      hpAdjustment,

      movesRefreshed:
        moveRefresh.refreshed,

      progression:
        nextProgression
    };

  } catch (error) {

    try {

      await restorePreviousState(
        pokemon,
        {
          permanentScores:
            previousScores,

          hp:
            previousHp,

          progression:
            previousProgression
        }
      );

    } catch (rollbackError) {

      throw new AggregateError(
        [
          error,
          rollbackError
        ],
        `${pokemon.name}: falló la edición de características y también su rollback.`
      );
    }


    throw error;
  }
}