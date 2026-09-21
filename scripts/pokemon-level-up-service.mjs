import {
  importPokemon,
  loadDatabase
} from "./importer.mjs";

import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  getPokemonExperienceState
} from "./pokemon-experience-service.mjs";

import {
  getPokemonHeldItem
} from "./pokemon-held-item-service.mjs";

import {
  refreshPokemonMoves
} from "./pokemon-move-refresh-service.mjs";

import {
  historicalPokemonConHpAdjustment,
  pokemonHpGainForRoll
} from "./pokemon-hp-rules.mjs";

import {
  evolvePokemonForLevelUp,
  resolvePokemonEvolutionForLevelUp
} from "./pokemon-evolution-service.mjs";

const MODULE_ID =
  "poke5e-local";

const MAX_SUPPORTED_LEVEL =
  20;

const PEAK_POWER_LEVEL =
  20;

const PROGRESSION_VERSION =
  3;

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

const ABILITY_SCORE_INCREASE_LEVELS =
  new Set([
    4,
    8,
    12,
    16
  ]);


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertTrainerPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }


  if (
    !getPokemonTrainerUuid(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon.name} no pertenece a ningún Trainer.`
    );
  }
}


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

    throw new Error(
      `${pokemon.name} no posee un nivel Pokémon válido.`
    );
  }


  return Math.trunc(
    level
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


function normalizeOptionalId(
  value
) {

  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return id ||
    null;
}


/* ============================================================
 * CANONICAL DATA
 * ============================================================ */

function pokemonHitDieSides(
  source
) {
  const raw =
    String(
      source?.combat
        ?.hitDie ??
      source?.combat
        ?.hitDice ??
      source?.hitDie ??
      source?.hitDice ??
      "d6"
    )
      .trim()
      .toLowerCase();


  const match =
    raw.match(
      /^d(\d+)$/
    );


  const sides =
    Number(
      match?.[1] ??
      6
    );


  return Number.isFinite(
    sides
  )
    ? Math.max(
        2,
        Math.trunc(
          sides
        )
      )
    : 6;
}

function pokemonSr(
  source
) {
  const value =
    Number(
      source?.sr
    );


  return Number.isFinite(
    value
  )
    ? value
    : 0;
}

/* ============================================================
 * ABILITY SCORE IMPROVEMENT
 * ============================================================ */

function maximumEvolutionDepth(
  pokemonId,
  evolutions,
  direction,
  visited = new Set()
) {
  if (
    visited.has(
      pokemonId
    )
  ) {
    return 0;
  }


  const nextVisited =
    new Set(
      visited
    );


  nextVisited.add(
    pokemonId
  );


  const edges =
    evolutions.filter(
      evolution =>
        direction === "incoming"
          ? String(
              evolution?.to ??
              ""
            ) === pokemonId
          : String(
              evolution?.from ??
              ""
            ) === pokemonId
    );


  if (
    !edges.length
  ) {
    return 0;
  }


  return Math.max(
    ...edges.map(
      evolution => {

        const nextPokemonId =
          direction === "incoming"
            ? String(
                evolution?.from ??
                ""
              )
            : String(
                evolution?.to ??
                ""
              );


        if (!nextPokemonId) {
          return 0;
        }


        return (
          1 +
          maximumEvolutionDepth(
            nextPokemonId,
            evolutions,
            direction,
            nextVisited
          )
        );
      }
    )
  );
}


function pokemonEvolutionStages(
  source,
  evolutions
) {
  const sourceId =
    String(
      source?.id ??
      ""
    );


  if (!sourceId) {
    return 1;
  }


  const incomingDepth =
    maximumEvolutionDepth(
      sourceId,
      evolutions,
      "incoming"
    );


  const outgoingDepth =
    maximumEvolutionDepth(
      sourceId,
      evolutions,
      "outgoing"
    );


  return Math.min(
    3,
    Math.max(
      1,
      1 +
      incomingDepth +
      outgoingDepth
    )
  );
}


function abilityScorePointsForStages(
  stages
) {
  if (
    stages <= 1
  ) {
    return 4;
  }


  if (
    stages === 2
  ) {
    return 3;
  }


  return 2;
}


function pokemonAbilityScores(
  pokemon
) {
  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          pokemon.system
            ?.abilities
            ?.[abilityId]
            ?.value ??
          10
        )
      ]
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


function progressionAbilityScoreGains(
  progression
) {
  const stored =
    progression
      ?.abilityScoreGains ??
    {};


  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const numeric =
          Number(
            stored[
              abilityId
            ] ??
            0
          );


        return [
          abilityId,

          Number.isFinite(
            numeric
          )
            ? Math.max(
                0,
                Math.trunc(
                  numeric
                )
              )
            : 0
        ];
      }
    )
  );
}


function resolveAbilityScoreIncreases(
  preview,
  requested
) {
  if (
    !preview
      .abilityScoreIncrease
      .required
  ) {
    return emptyAbilityScoreGains();
  }


  const result =
    emptyAbilityScoreGains();


  let allocated =
    0;


  for (
    const abilityId
    of ABILITY_IDS
  ) {
    const numeric =
      Number(
        requested
          ?.[abilityId] ??
        0
      );


    if (
      !Number.isInteger(
        numeric
      ) ||
      numeric < 0
    ) {
      throw new Error(
        `${abilityId.toUpperCase()}: el aumento debe ser un entero no negativo.`
      );
    }


    const currentScore =
      preview
        .abilityScoreIncrease
        .currentScores[
          abilityId
        ];


    if (
      numeric > 0 &&
      (
        currentScore +
        numeric
      ) >
        preview
          .abilityScoreIncrease
          .cap
    ) {
      throw new Error(
        `${abilityId.toUpperCase()} no puede superar ` +
        `${preview.abilityScoreIncrease.cap}.`
      );
    }


    result[
      abilityId
    ] =
      numeric;


    allocated +=
      numeric;
  }


  if (
    allocated !==
    preview
      .abilityScoreIncrease
      .points
  ) {
    throw new Error(
      `Debes distribuir exactamente ` +
      `${preview.abilityScoreIncrease.points} puntos de ASI.`
    );
  }


  return result;
}


function mergeAbilityScoreGains(
  previous,
  increases
) {
  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          previous[
            abilityId
          ] ??
          0
        ) +
        Number(
          increases[
            abilityId
          ] ??
          0
        )
      ]
    )
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

async function rollPokemonHpGain(
  pokemon,
  dieSides
) {

  const roll =
    await new Roll(
      `1d${dieSides}`
    ).evaluate();


  const dieResult =
    Number(
      roll.total
    );


  if (
    !Number.isFinite(
      dieResult
    )
  ) {

    throw new Error(
      "No se pudo resolver la tirada de HP del Pokémon."
    );
  }


  const conModifier =
    abilityModifier(
      pokemon.system
        ?.abilities
        ?.con
        ?.value
    );


  return {
    dieSides,

    dieResult:
      Math.trunc(
        dieResult
      ),

    conModifier,

    total:
      pokemonHpGainForRoll(
        dieResult,
        conModifier
      )
  };
}

async function applyPokemonLevelHp(
  pokemon,
  previousHp,
  hpRoll,
  {
    progression,
    currentLevel,
    previousConModifier,
    nextConModifier
  }
) {
  const currentLevelGain =
    pokemonHpGainForRoll(
      hpRoll.dieResult,
      nextConModifier
    );


const retroactiveAdjustment =
  historicalPokemonConHpAdjustment({
    progression,
    currentLevel,
    previousConModifier,
    nextConModifier
  });


  const newMaximum =
    Math.max(
      1,
      previousHp.max +
      retroactiveAdjustment +
      currentLevelGain
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


  await pokemon.update({
    "system.attributes.hp.max":
      newMaximum,

    "system.attributes.hp.value":
      newValue,

    "system.attributes.hp.temp":
      previousHp.temp
  });


  return {
    hp: {
      value:
        newValue,

      max:
        newMaximum,

      temp:
        previousHp.temp
    },

    hpGain: {
      dieSides:
        hpRoll.dieSides,

      dieResult:
        hpRoll.dieResult,

      conModifier:
        nextConModifier,

      total:
        currentLevelGain
    },

    retroactiveConAdjustment:
      retroactiveAdjustment
  };
}

/* ============================================================
 * NATURE STATE
 * ============================================================ */

function pokemonNatureSnapshot(
  pokemon
) {

  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "nature"
    );


  if (
    !stored ||
    typeof stored !==
      "object"
  ) {

    return null;
  }


  const id =
    String(
      stored.id ??
      ""
    )
      .trim()
      .toLowerCase();


  if (!id) {

    return null;
  }


  const rawRoll =
    Number(
      stored.roll
    );


  return {
    id,

    roll:
      Number.isInteger(
        rawRoll
      ) &&
      rawRoll >= 1 &&
      rawRoll <= 100

        ? rawRoll

        : null
  };
}


function pokemonNatureEffectIds(
  pokemon
) {

  return pokemon.effects
    .filter(
      effect =>
        effect.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          "pokemon-nature"
    )
    .map(
      effect =>
        effect.id
    )
    .filter(Boolean)
    .sort();
}


function sameNatureState(
  left,
  right
) {

  if (
    !left ||
    !right
  ) {

    return left ===
      right;
  }


  return (
    left.id ===
      right.id &&

    left.roll ===
      right.roll
  );
}

/* ============================================================
 * PRESERVED STATE
 * ============================================================ */

function manualItemIds(
  pokemon,
  kind
) {

  return pokemon.items
    .filter(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) === kind &&
        item.getFlag(
          MODULE_ID,
          "importManaged"
        ) === false
    )
    .map(
      item =>
        item.id
    )
    .filter(Boolean)
    .sort();
}


function levelUpStateSnapshot(
  pokemon
) {

  return {
    actorUuid:
      pokemon.uuid,

    trainerOwnerUuid:
      getPokemonTrainerUuid(
        pokemon
      ),

    folderId:
      pokemon.folder?.id ??
      null,

    sort:
      pokemon.sort,

    activeAbilityId:
      normalizeOptionalId(
        pokemon.getFlag(
          MODULE_ID,
          "activeAbilityId"
        )
      ),

    manualMoveItemIds:
      manualItemIds(
        pokemon,
        "move"
      ),

    manualAbilityItemIds:
      manualItemIds(
        pokemon,
        "ability"
      ),

    heldItemId:
      String(
        pokemon.getFlag(
          MODULE_ID,
          "heldItemId"
        ) ??
        ""
      ) ||
      null,

    heldItemDocumentId:
      getPokemonHeldItem(
        pokemon
      )?.id ??
      null,

    nature:
      pokemonNatureSnapshot(
        pokemon
      ),

    natureEffectIds:
      pokemonNatureEffectIds(
        pokemon
      )
  };
}


function sameStringArray(
  left,
  right
) {

  if (
    left.length !==
    right.length
  ) {

    return false;
  }


  return left.every(
    (
      value,
      index
    ) =>
      value ===
      right[index]
  );
}


function assertLevelUpInvariants(
  pokemon,
  snapshot,
  expectedLevel
) {

  /*
   * Debe seguir siendo exactamente
   * la misma instancia de Actor.
   */
  if (
    pokemon.uuid !==
    snapshot.actorUuid
  ) {

    throw new Error(
      `${pokemon.name}: Level Up cambió la instancia del Actor.`
    );
  }


  /*
   * Ownership Trainer.
   */
  if (
    getPokemonTrainerUuid(
      pokemon
    ) !==
    snapshot.trainerOwnerUuid
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró trainerOwnerUuid.`
    );
  }


  /*
   * Party / PC.
   *
   * El Actor debe permanecer exactamente
   * donde estaba.
   */
  if (
    (
      pokemon.folder?.id ??
      null
    ) !==
    snapshot.folderId ||
    pokemon.sort !==
      snapshot.sort
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró su ubicación Party/PC.`
    );
  }


  /*
   * Nivel resultante.
   */
  const resultingLevel =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "level"
      )
    );


  if (
    !Number.isFinite(
      resultingLevel
    ) ||
    Math.trunc(
      resultingLevel
    ) !==
    expectedLevel
  ) {

    throw new Error(
      `${pokemon.name}: el nivel resultante no coincide con Nv. ${expectedLevel}.`
    );
  }


  /*
   * Moves manuales.
   *
   * Level Up no los administra.
   */
  const currentMoveItemIds =
    manualItemIds(
      pokemon,
      "move"
    );


  if (
    !sameStringArray(
      currentMoveItemIds,
      snapshot.manualMoveItemIds
    )
  ) {

    throw new Error(
      `${pokemon.name}: Level Up modificó sus Move Items manuales.`
    );
  }


  /*
   * Abilities manuales.
   */
  const currentAbilityItemIds =
    manualItemIds(
      pokemon,
      "ability"
    );


  if (
    !sameStringArray(
      currentAbilityItemIds,
      snapshot.manualAbilityItemIds
    )
  ) {

    throw new Error(
      `${pokemon.name}: Level Up modificó sus Ability Items manuales.`
    );
  }


  /*
   * Ability activa.
   */
  const activeAbilityId =
    normalizeOptionalId(
      pokemon.getFlag(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (
    activeAbilityId !==
    snapshot.activeAbilityId
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró activeAbilityId.`
    );
  }

  /*
   * Objeto llevado.
   *
   * Level Up no administra ni reemplaza
   * el objeto elegido por el jugador.
   */

  const heldItem =
    getPokemonHeldItem(
      pokemon
    );


  const heldItemId =
    String(
      pokemon.getFlag(
        MODULE_ID,
        "heldItemId"
      ) ??
      ""
    ) ||
    null;


  if (
    heldItemId !==
      snapshot.heldItemId ||
    (
      heldItem?.id ??
      null
    ) !==
      snapshot.heldItemDocumentId
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró el objeto que llevaba.`
    );
  }

  /*
   * Nature pertenece al individuo.
   */

  if (
    !sameNatureState(
      pokemonNatureSnapshot(
        pokemon
      ),
      snapshot.nature
    )
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró su Nature.`
    );
  }


  if (
    !sameStringArray(
      pokemonNatureEffectIds(
        pokemon
      ),
      snapshot.natureEffectIds
    )
  ) {

    throw new Error(
      `${pokemon.name}: Level Up alteró el efecto técnico de su Nature.`
    );
  }
}

/* ============================================================
 * PREVIEW
 * ============================================================ */

export async function getPokemonLevelUpPreview(
  pokemon,
  {
    evolution =
      null
  } = {}
) {

  assertTrainerPokemon(
    pokemon
  );


  const currentLevel =
    pokemonLevel(
      pokemon
    );


  const nextLevel =
    currentLevel +
    1;


  const experience =
    getPokemonExperienceState(
      pokemon
    );


  const levelSupported =
    nextLevel <=
    MAX_SUPPORTED_LEVEL;


  const database =
    await loadDatabase();


  const sourceId =
    String(
      pokemon.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    );


  let source =
    database.pokemon.find(
      entry =>
        String(
          entry.id
        ) ===
          sourceId
    );


  if (!source) {

    throw new Error(
      `No se encontraron datos canónicos para ${sourceId}.`
    );
  }


  let currentScores =
    pokemonAbilityScores(
      pokemon
    );


  let evolutionPreview =
    null;


  if (
    evolution?.evolve ===
      true
  ) {

    const evolutionResolution =
      await resolvePokemonEvolutionForLevelUp(
        pokemon,
        {
          evolutionKey:
            evolution
              .evolutionKey,

          evolutionLevel:
            nextLevel,

          abilityScoreIncreases:
            evolution
              .abilityScoreIncreases ??
            {},

          manualConditionKeys:
            evolution
              .manualConditionKeys ??
            [],

          activeAbilityId:
            evolution
              .activeAbilityId ??
            null
        }
      );


    source =
      evolutionResolution
        .candidate
        .targetSpecies;


    currentScores =
      foundry.utils.deepClone(
        evolutionResolution
          .abilityScores
      );


    evolutionPreview = {
      key:
        evolutionResolution
          .candidate
          .key,

      from:
        evolutionResolution
          .candidate
          .from,

      to:
        evolutionResolution
          .candidate
          .to,

      targetSpecies:
        evolutionResolution
          .candidate
          .targetSpecies,

      evolutionPoints:
        evolutionResolution
          .candidate
          .evolutionPoints,

      abilityScoreIncreases:
        foundry.utils.deepClone(
          evolutionResolution
            .abilityResolution
            .increases
        ),

      activeAbilityId:
        evolutionResolution
          .abilityChoice
          .id
    };
  }


  const evolutionStages =
    pokemonEvolutionStages(
      source,
      database.evolutions
    );


  const isPeakPower =
    nextLevel ===
    PEAK_POWER_LEVEL;


  const requiresAbilityScoreIncrease =
    ABILITY_SCORE_INCREASE_LEVELS.has(
      nextLevel
    ) ||
    isPeakPower;


  const sourceSr =
    pokemonSr(
      source
    );


  const abilityScoreCap =
    isPeakPower
      ? (
          sourceSr >= 15
            ? 30
            : 22
        )
      : 20;


  return {
    currentLevel,
    nextLevel,
    levelSupported,
    experience,

    canLevelUp:
      levelSupported &&
      experience.readyToLevel,

    hitDieSides:
      pokemonHitDieSides(
        source
      ),

    /*
     * Si evolucionará, ya utilizamos el CON
     * resultante de Evolution.
     */

    conModifier:
      abilityModifier(
        currentScores.con
      ),

    evolution:
      evolutionPreview,

    abilityScoreIncrease: {
      required:
        requiresAbilityScoreIncrease,

      kind:
        requiresAbilityScoreIncrease
          ? (
              isPeakPower
                ? "peak-power"
                : "standard"
            )
          : null,

      points:
        requiresAbilityScoreIncrease
          ? abilityScorePointsForStages(
              evolutionStages
            )
          : 0,

      cap:
        abilityScoreCap,

      evolutionStages,

      sourceSr,

      /*
       * ASI normal se distribuye DESPUÉS
       * de Evolution Points.
       */
      currentScores
    }
  };
}


/* ============================================================
 * LEVEL UP
 * ============================================================ */

export async function levelUpPokemon(
  pokemon,
  {
    abilityScoreIncreases =
      {},

    evolution =
      null
  } = {}
) {

  const preview =
    await getPokemonLevelUpPreview(
      pokemon,
      {
        evolution
      }
    );


  if (
    !preview.levelSupported
  ) {

    throw new Error(
      `Pokémon Level Up está implementado actualmente hasta nivel ${MAX_SUPPORTED_LEVEL}.`
    );
  }


  if (
    !preview
      .experience
      .readyToLevel
  ) {

    throw new Error(
      `${pokemon.name} todavía necesita ` +
      `${preview.experience.xpRemaining} XP ` +
      `para subir a Nv. ${preview.nextLevel}.`
    );
  }


  const resolvedAbilityScoreIncreases =
    resolveAbilityScoreIncreases(
      preview,
      abilityScoreIncreases
    );


  let evolutionTransaction =
    null;


  try {

    /*
     * ========================================================
     * EVOLUTION
     *
     * Poke5e:
     * ocurre antes de los beneficios normales del Level Up.
     * ========================================================
     */

    if (
      evolution?.evolve ===
        true
    ) {

      evolutionTransaction =
        await evolvePokemonForLevelUp(
          pokemon,
          {
            evolutionKey:
              evolution
                .evolutionKey,

            evolutionLevel:
              preview.nextLevel,

            abilityScoreIncreases:
              evolution
                .abilityScoreIncreases ??
              {},

            manualConditionKeys:
              evolution
                .manualConditionKeys ??
              [],

            activeAbilityId:
              evolution
                .activeAbilityId ??
              null
          }
        );
    }


    const workingPokemon =
      evolutionTransaction
        ?.actor ??
      pokemon;


    /*
     * El snapshot normal de Level Up se toma
     * DESPUÉS de Evolution.
     *
     * Así una Ability cambiada legítimamente por
     * Evolution pasa a ser el estado que Level Up
     * debe preservar.
     */

    const preservedState =
      levelUpStateSnapshot(
        workingPokemon
      );


    /*
     * Si hubo Evolution, este HP ya contiene:
     *
     * - bonus 2 × nivel;
     * - ajuste retroactivo por CON de Evolution.
     */

    const beforeHp =
      hpSnapshot(
        workingPokemon
      );


    const previousConModifier =
      abilityModifier(
        workingPokemon.system
          ?.abilities
          ?.con
          ?.value
      );


    /*
     * El preview ya utiliza el Hit Die de la
     * especie evolucionada cuando corresponde.
     */

    const hpRoll =
      await rollPokemonHpGain(
        workingPokemon,
        preview.hitDieSides
      );


    const previousProgression =
      foundry.utils.deepClone(
        workingPokemon.getFlag(
          MODULE_ID,
          "pokemonProgression"
        ) ??
        {}
      );


    const previousAbilityScoreGains =
      progressionAbilityScoreGains(
        previousProgression
      );


    const nextAbilityScoreGains =
      mergeAbilityScoreGains(
        previousAbilityScoreGains,
        resolvedAbilityScoreIncreases
      );


    const hpGains =
      foundry.utils.deepClone(
        previousProgression
          .hpGains ??
        {}
      );


    hpGains[
      String(
        preview.nextLevel
      )
    ] = {
      dieSides:
        hpRoll.dieSides,

      dieResult:
        hpRoll.dieResult
    };


    const abilityScoreIncreaseHistory =
      foundry.utils.deepClone(
        previousProgression
          .abilityScoreIncreaseHistory ??
        {}
      );


    if (
      preview
        .abilityScoreIncrease
        .required
    ) {

      abilityScoreIncreaseHistory[
        String(
          preview.nextLevel
        )
      ] = {
        kind:
          preview
            .abilityScoreIncrease
            .kind,

        increases:
          foundry.utils.deepClone(
            resolvedAbilityScoreIncreases
          ),

        points:
          preview
            .abilityScoreIncrease
            .points,

        cap:
          preview
            .abilityScoreIncrease
            .cap,

        evolutionStages:
          preview
            .abilityScoreIncrease
            .evolutionStages,

        sourceSr:
          preview
            .abilityScoreIncrease
            .sourceSr
      };
    }


    /*
     * Si Evolution ocurrió, sourceId ya es el
     * de la nueva especie y level ya es nextLevel.
     *
     * Reimportar al MISMO nivel aplica únicamente
     * los ASI normales y reconstruye derivados.
     */

    const sourceId =
      String(
        workingPokemon.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
        ""
      );


    if (!sourceId) {

      throw new Error(
        `${workingPokemon.name} no posee sourceId.`
      );
    }


    const importResult =
      await importPokemon(
        sourceId,
        {
          updateExisting:
            true,

          targetActor:
            workingPokemon,

          level:
            preview.nextLevel,

          abilityScoreGains:
            nextAbilityScoreGains
        }
      );


    const updatedPokemon =
      importResult?.actor ??
      workingPokemon;


    if (
      updatedPokemon.uuid !==
        preservedState.actorUuid
    ) {

      throw new Error(
        `${workingPokemon.name}: Importer no actualizó la instancia esperada durante Level Up.`
      );
    }


    const nextConModifier =
      abilityModifier(
        updatedPokemon.system
          ?.abilities
          ?.con
          ?.value
      );


    const hpResult =
      await applyPokemonLevelHp(
        updatedPokemon,
        beforeHp,
        hpRoll,
        {
          progression:
            previousProgression,

          currentLevel:
            preview.currentLevel,

          previousConModifier,

          nextConModifier
        }
      );


    const nextProgression = {
      ...previousProgression,

      version:
        PROGRESSION_VERSION,

      baseLevel:
        previousProgression
          .baseLevel ??
        preview.currentLevel,

      baseHpMax:
        previousProgression
          .baseHpMax ??
        beforeHp.max,

      hpGains,

      abilityScoreGains:
        nextAbilityScoreGains,

      abilityScoreIncreaseHistory
    };


    await updatedPokemon.setFlag(
      MODULE_ID,
      "pokemonProgression",
      nextProgression
    );


    const moveRefresh =
      await refreshPokemonMoves(
        updatedPokemon
      );


    assertLevelUpInvariants(
      updatedPokemon,
      preservedState,
      preview.nextLevel
    );


    /*
     * Evolution Item se consume AL FINAL.
     *
     * Si todo lo anterior falló, nunca desaparece.
     */

    const consumedEvolutionItems =
      evolutionTransaction
        ? await evolutionTransaction
            .consumeRequiredItems()
        : [];


    return {
      pokemon:
        updatedPokemon,

      previousLevel:
        preview.currentLevel,

      level:
        preview.nextLevel,

      hpGain:
        hpResult.hpGain,

      hp:
        hpResult.hp,

      retroactiveConAdjustment:
        hpResult
          .retroactiveConAdjustment,

      abilityScoreIncreases:
        resolvedAbilityScoreIncreases,

      movesRefreshed:
        moveRefresh.refreshed,

      proficiencyBonus:
        Number(
          updatedPokemon.getFlag(
            MODULE_ID,
            "proficiencyBonus"
          ) ??
          updatedPokemon.system
            ?.attributes
            ?.prof ??
          0
        ),

      progression:
        updatedPokemon.getFlag(
          MODULE_ID,
          "pokemonProgression"
        ),

      evolution:
        evolutionTransaction
          ? {
              from:
                evolutionTransaction
                  .candidate
                  .from,

              to:
                evolutionTransaction
                  .candidate
                  .to,

              evolutionPoints:
                evolutionTransaction
                  .candidate
                  .evolutionPoints,

              hpBonus:
                evolutionTransaction
                  .hp
                  .hpBonus,

              activeAbilityId:
                evolutionTransaction
                  .activeAbilityId,

              consumedItems:
                consumedEvolutionItems
            }
          : null
    };

  } catch (error) {

    if (
      evolutionTransaction
    ) {

      try {

        await evolutionTransaction
          .rollback();

      } catch (
        rollbackError
      ) {

        throw new AggregateError(
          [
            error,
            rollbackError
          ],
          `${pokemon.name}: Level Up falló después de Evolution y también falló el rollback.`
        );
      }
    }


    throw error;
  }
}