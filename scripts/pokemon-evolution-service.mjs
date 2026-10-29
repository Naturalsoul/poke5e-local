import {
  buildAbilityItem
} from "./builder.mjs";

import {
  loadDatabase,
  rebuildPokemonAsSpecies
} from "./importer.mjs";

import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  getPokemonKnownMoves
} from "./pokemon-move-service.mjs";

import {
  getPokemonGender
} from "./gender-runtime.mjs";

import {
  refreshPokemonMoves
} from "./pokemon-move-refresh-service.mjs";

import {
  historicalPokemonConHpAdjustment
} from "./pokemon-hp-rules.mjs";

import {
  canonicalEvolutionValue,
  evaluateEvolutionConditions,
  evolutionCandidatesFrom,
  evolutionKey,
  evolutionPoints,
  isStandardEvolution,
  evolutionAbilityScoreMode,
  resolveEvolutionAbilityScores
} from "./pokemon-evolution-rules.mjs";


const MODULE_ID =
  "poke5e-local";

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

const ABILITY_ITEM_KIND =
  "ability";

const CATALOG_ITEM_KIND =
  "catalog-item";

const EVOLUTION_ITEM_TYPE =
  "evolution";

const STRUGGLE_MOVE_ID =
  "struggle";


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


function assertEvolutionAuthority() {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Solo el GM puede aplicar una Evolution de Pokémon."
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
    !Number.isInteger(
      level
    ) ||
    level < 1 ||
    level > 20
  ) {

    throw new Error(
      `${pokemon.name} no posee un nivel Pokémon válido.`
    );
  }


  return level;
}


function resolveEvolutionLevel(
  pokemon,
  value,
  {
    onDemand = false
  } = {}
) {

  const currentLevel =
    pokemonLevel(
      pokemon
    );


  const expectedLevel =
    currentLevel +
    (onDemand ? 0 : 1);


  const requestedLevel =
    value == null
      ? expectedLevel
      : Number(
          value
        );


  if (
    !Number.isInteger(
      requestedLevel
    ) ||
    requestedLevel !==
      expectedLevel
  ) {

    throw new Error(
      onDemand
        ? `Evolution manual debe realizarse al nivel actual: Nv. ${currentLevel}.`
        : `Evolution debe resolverse durante el Level Up a Nv. ${expectedLevel}.`
    );
  }


  return requestedLevel;
}


/* ============================================================
 * STATE READERS
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


function trainerForPokemon(
  pokemon
) {

  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (!trainerUuid) {

    return null;
  }


  return (
    game.actors.find(
      actor =>
        actor.uuid ===
          trainerUuid
    ) ??
    null
  );
}


function pokemonSourceId(
  pokemon
) {

  return String(
    pokemon.getFlag(
      MODULE_ID,
      "sourceId"
    ) ??
    ""
  ).trim();
}


function rawPokemonSource(
  pokemon
) {

  return pokemon.toObject();
}


function rawAbilityScores(
  pokemon
) {

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


function effectiveAbilityScores(
  pokemon
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const score =
          Number(
            pokemon.system
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


function applyEvolutionIncreasesToBase(
  baseScores,
  increases
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          baseScores[
            abilityId
          ] ??
          10
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


function proficiencySnapshot(
  pokemon
) {

  const source =
    rawPokemonSource(
      pokemon
    );


  const savingThrows =
    ABILITY_IDS.filter(
      abilityId =>
        Number(
          source.system
            ?.abilities
            ?.[abilityId]
            ?.proficient ??
          0
        ) > 0
    );


  const skills =
    Object.fromEntries(
      Object.entries(
        source.system
          ?.skills ??
        {}
      )
        .filter(
          (
            [
              ,
              entry
            ]
          ) =>
            Number(
              entry?.value ??
              0
            ) > 0
        )
        .map(
          (
            [
              skillId,
              entry
            ]
          ) => [
            skillId,

            {
              value:
                Number(
                  entry?.value ??
                  1
                ),

              ability:
                String(
                  entry?.ability ??
                  ""
                )
            }
          ]
        )
    );


  return {
    savingThrows,
    skills
  };
}


function progressionSnapshot(
  pokemon
) {

  return foundry.utils.deepClone(
    pokemon.getFlag(
      MODULE_ID,
      "pokemonProgression"
    ) ??
    {}
  );
}


function pokemonGenderId(
  pokemon
) {

  return (
    getPokemonGender(
      pokemon
    )?.id ??
    null
  );
}


function knownMoveState(
  pokemon
) {

  const moves =
    getPokemonKnownMoves(
      pokemon
    );


  const knownMoveIds =
    moves
      .map(
        move =>
          canonicalEvolutionValue(
            move.getFlag(
              MODULE_ID,
              "sourceId"
            )
          )
      )
      .filter(
        moveId =>
          moveId &&
          moveId !==
            STRUGGLE_MOVE_ID
      );


  const knownMoveTypes =
    moves
      .map(
        move =>
          canonicalEvolutionValue(
            move.getFlag(
              MODULE_ID,
              "moveType"
            )
          )
      )
      .filter(
        Boolean
      );


  return {
    knownMoveIds:
      [
        ...new Set(
          knownMoveIds
        )
      ],

    knownMoveTypes:
      [
        ...new Set(
          knownMoveTypes
        )
      ]
  };
}


function itemQuantity(
  item
) {

  const quantity =
    Number(
      item?.system
        ?.quantity ??
      1
    );


  if (
    !Number.isFinite(
      quantity
    )
  ) {

    return 1;
  }


  return Math.max(
    0,
    Math.trunc(
      quantity
    )
  );
}


function trainerItemIds(
  trainer
) {

  if (!trainer) {

    return [];
  }


  return [
    ...new Set(
      trainer.items
        .filter(
          item =>
            item.getFlag(
              MODULE_ID,
              "kind"
            ) ===
              CATALOG_ITEM_KIND &&

            item.getFlag(
              MODULE_ID,
              "itemType"
            ) ===
              EVOLUTION_ITEM_TYPE &&

            itemQuantity(
              item
            ) > 0
        )
        .map(
          item =>
            canonicalEvolutionValue(
              item.getFlag(
                MODULE_ID,
                "sourceId"
              )
            )
        )
        .filter(
          Boolean
        )
    )
  ];
}


/* ============================================================
 * ABILITY STATE
 * ============================================================ */

function abilityItems(
  pokemon
) {

  return pokemon.items.filter(
    item =>
      item.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        ABILITY_ITEM_KIND
  );
}


function assertSingleAbilityItem(
  pokemon
) {

  const items =
    abilityItems(
      pokemon
    );


  if (
    items.length >
    1
  ) {

    throw new Error(
      `${pokemon.name} posee más de una Ability Item. ` +
      "Debe corregirse la inconsistencia antes de evolucionar."
    );
  }


  return (
    items[0] ??
    null
  );
}


function activeAbilityId(
  pokemon
) {

  const flagged =
    canonicalEvolutionValue(
      pokemon.getFlag(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (flagged) {

    return flagged;
  }


  const item =
    assertSingleAbilityItem(
      pokemon
    );


  return item
    ? (
        canonicalEvolutionValue(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          )
        ) ||
        null
      )
    : null;
}


function grantedHiddenAbilityIds(
  pokemon
) {

  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "grantedHiddenAbilities"
    );


  return [
    ...new Set(
      (
        Array.isArray(
          stored
        )
          ? stored
          : []
      )
        .map(
          canonicalEvolutionValue
        )
        .filter(
          Boolean
        )
    )
  ];
}


function normalizedAbilityRefs(
  pokemonSource
) {

  return (
    Array.isArray(
      pokemonSource?.abilities
    )
      ? pokemonSource.abilities
      : []
  )
    .map(
      entry =>
        typeof entry ===
          "string"
          ? {
              id:
                canonicalEvolutionValue(
                  entry
                ),

              hidden:
                false
            }
          : {
              id:
                canonicalEvolutionValue(
                  entry?.id
                ),

              hidden:
                Boolean(
                  entry?.hidden
                )
            }
    )
    .filter(
      entry =>
        entry.id
    );
}


function targetAbilityState(
  pokemon,
  targetSpecies,
  database
) {

  const currentId =
    activeAbilityId(
      pokemon
    );


  const grantedHidden =
    new Set(
      grantedHiddenAbilityIds(
        pokemon
      )
    );


  const refs =
    normalizedAbilityRefs(
      targetSpecies
    );


  const eligibleRefs =
    refs.filter(
      reference =>
        !reference.hidden ||
        grantedHidden.has(
          reference.id
        )
    );


  const abilityById =
    new Map(
      database.abilities
        .filter(
          ability =>
            ability?.id
        )
        .map(
          ability => [
            canonicalEvolutionValue(
              ability.id
            ),
            ability
          ]
        )
    );


  const choices =
    eligibleRefs.map(
      reference => ({
        ...reference,

        definition:
          abilityById.get(
            reference.id
          ) ??
          null
      })
    );


  const currentValid =
    Boolean(
      currentId &&
      eligibleRefs.some(
        reference =>
          reference.id ===
            currentId
      )
    );


  const targetHiddenIds =
    new Set(
      refs
        .filter(
          reference =>
            reference.hidden
        )
        .map(
          reference =>
            reference.id
        )
    );


  return {
    currentAbilityId:
      currentId,

    currentAbilityValid:
      currentValid,

    abilitySelectionRequired:
      !currentValid &&
      choices.length >
        1,

    choices,

    definitionsComplete:
      choices.every(
        choice =>
          Boolean(
            choice.definition
          )
      ),

    grantedHiddenAbilityIds:
      [
        ...grantedHidden
      ]
        .filter(
          abilityId =>
            targetHiddenIds.has(
              abilityId
            )
        )
  };
}


function resolveTargetAbilityChoice(
  candidate,
  requestedId
) {

  if (
    candidate
      .currentAbilityValid
  ) {

    return (
      candidate
        .abilityChoices
        .find(
          choice =>
            choice.id ===
              candidate
                .currentAbilityId
        ) ??
      null
    );
  }


  if (
    candidate
      .abilityChoices
      .length === 1
  ) {

    return candidate
      .abilityChoices[0];
  }


  const normalizedRequestedId =
    canonicalEvolutionValue(
      requestedId
    );


  if (!normalizedRequestedId) {

    throw new Error(
      "Debes elegir una Ability válida para la forma evolucionada."
    );
  }


  const selected =
    candidate
      .abilityChoices
      .find(
        choice =>
          choice.id ===
            normalizedRequestedId
      );


  if (!selected) {

    throw new Error(
      `La Ability ${normalizedRequestedId} no está disponible para esta Evolution.`
    );
  }


  return selected;
}


async function applyTargetAbility(
  pokemon,
  choice
) {

  if (!choice?.definition) {

    throw new Error(
      `No se encontraron datos canónicos para la Ability ${choice?.id ?? "desconocida"}.`
    );
  }


  const currentItem =
    assertSingleAbilityItem(
      pokemon
    );


  const source =
    buildAbilityItem(
      choice.definition,
      currentLanguage(),
      {
        hiddenAbility:
          choice.hidden
      }
    );


  if (currentItem) {

    await pokemon.updateEmbeddedDocuments(
      "Item",
      [
        {
          _id:
            currentItem.id,

          ...source
        }
      ]
    );

  } else {

    await pokemon.createEmbeddedDocuments(
      "Item",
      [
        source
      ]
    );
  }


  await pokemon.setFlag(
    MODULE_ID,
    "activeAbilityId",
    choice.id
  );
}


/* ============================================================
 * PREVIEW
 * ============================================================ */

function requiredItemIds(
  evolution
) {

  return [
    ...new Set(
      (
        Array.isArray(
          evolution?.conditions
        )
          ? evolution.conditions
          : []
      )
        .filter(
          condition =>
            canonicalEvolutionValue(
              condition?.type
            ) ===
              "item"
        )
        .map(
          condition =>
            canonicalEvolutionValue(
              condition?.value
            )
        )
        .filter(
          Boolean
        )
    )
  ];
}


function candidatePreview({
  evolution,
  targetSpecies,
  conditionContext,
  pokemon,
  database
}) {

  const standard =
    isStandardEvolution(
      evolution
    );


  const evaluation =
    evaluateEvolutionConditions(
      evolution,
      conditionContext
    );


  const rawMinimumLevel =
    targetSpecies?.minimumLevel;

  const parsedMinimumLevel =
    rawMinimumLevel == null
      ? null
      : Number(rawMinimumLevel);

  const minimumLevel =
    Number.isInteger(parsedMinimumLevel) &&
    parsedMinimumLevel >= 1
      ? parsedMinimumLevel
      : null;

  const minimumLevelSatisfied =
    minimumLevel == null ||
    conditionContext.level >= minimumLevel;


  const abilityState =
    targetSpecies
      ? targetAbilityState(
          pokemon,
          targetSpecies,
          database
        )
      : {
          currentAbilityId:
            activeAbilityId(
              pokemon
            ),

          currentAbilityValid:
            false,

          abilitySelectionRequired:
            false,

          choices:
            [],

          definitionsComplete:
            false,

          grantedHiddenAbilityIds:
            []
        };


  return {
    key:
      evolutionKey(
        evolution
      ),

    evolution:
      foundry.utils.deepClone(
        evolution
      ),

    from:
      canonicalEvolutionValue(
        evolution?.from
      ),

    to:
      canonicalEvolutionValue(
        evolution?.to
      ),

    targetSpecies,

    standard,

    specialHandlerRequired:
      !standard,

    evolutionPoints:
      evolutionPoints(
        evolution
      ),

    minimumLevel,
    minimumLevelSatisfied,

    abilityScoreMode:
      evolutionAbilityScoreMode(
        evolution
      ),

    evaluation,

    requiredItemIds:
      requiredItemIds(
        evolution
      ),

    currentAbilityId:
      abilityState
        .currentAbilityId,

    currentAbilityValid:
      abilityState
        .currentAbilityValid,

    abilitySelectionRequired:
      abilityState
        .abilitySelectionRequired,

    abilityChoices:
      abilityState
        .choices,

    abilityDefinitionsComplete:
      abilityState
        .definitionsComplete,

    grantedHiddenAbilityIds:
      abilityState
        .grantedHiddenAbilityIds,

    eligible:
      Boolean(
        standard &&
        targetSpecies &&
        evaluation.satisfied &&
        minimumLevelSatisfied &&
        abilityState
          .choices
          .length >
          0 &&
        abilityState
          .definitionsComplete
      )
  };
}


export async function getPokemonEvolutionPreview(
  pokemon,
  {
    evolutionLevel = null,
    manualConditionKeys = [],
    onDemand = false
  } = {}
) {

  assertTrainerPokemon(
    pokemon
  );


  assertSingleAbilityItem(
    pokemon
  );


  const level =
    resolveEvolutionLevel(
      pokemon,
      evolutionLevel,
      { onDemand }
    );


  const database =
    await loadDatabase();


  const sourceId =
    pokemonSourceId(
      pokemon
    );


  if (!sourceId) {

    throw new Error(
      `${pokemon.name} no posee sourceId.`
    );
  }


  const sourceSpecies =
    database.pokemon.find(
      entry =>
        String(
          entry.id
        ) ===
          sourceId
    );


  if (!sourceSpecies) {

    throw new Error(
      `No se encontraron datos canónicos para ${sourceId}.`
    );
  }


  const trainer =
    trainerForPokemon(
      pokemon
    );


  if (!trainer) {

    throw new Error(
      `${pokemon.name} no posee un Trainer resoluble.`
    );
  }


  const moves =
    knownMoveState(
      pokemon
    );


  const conditionContext = {
    level,

    gender:
      pokemonGenderId(
        pokemon
      ),

    knownMoveIds:
      moves.knownMoveIds,

    knownMoveTypes:
      moves.knownMoveTypes,

    itemIds:
      trainerItemIds(
        trainer
      ),

    manualConditionKeys
  };


  const candidates =
    evolutionCandidatesFrom(
      database.evolutions,
      sourceId
    )
      .map(
        evolution => {

          const targetId =
            canonicalEvolutionValue(
              evolution?.to
            );


          const targetSpecies =
            database.pokemon.find(
              entry =>
                canonicalEvolutionValue(
                  entry?.id
                ) ===
                  targetId
            ) ??
            null;


          return candidatePreview({
            evolution,
            targetSpecies,
            conditionContext,
            pokemon,
            database
          });
        }
      );


  return {
    currentLevel:
      pokemonLevel(
        pokemon
      ),

    evolutionLevel:
      level,

    sourceId,
    sourceSpecies,
    trainer,
    conditionContext,
    candidates
  };
}

export async function resolvePokemonEvolutionForLevelUp(
  pokemon,
  {
    evolutionKey:
      requestedEvolutionKey,

    evolutionLevel =
      null,

    onDemand =
      false,

    abilityScoreIncreases =
      {},

    manualConditionKeys =
      [],

    activeAbilityId:
      requestedAbilityId =
        null
  } = {}
) {

  assertTrainerPokemon(
    pokemon
  );


  assertSingleAbilityItem(
    pokemon
  );


  const preview =
    await getPokemonEvolutionPreview(
      pokemon,
      {
        evolutionLevel,
        manualConditionKeys,
        onDemand
      }
    );


  const requestedKey =
    String(
      requestedEvolutionKey ??
      ""
    );


  const candidate =
    preview.candidates.find(
      entry =>
        entry.key ===
          requestedKey
    );


  if (!candidate) {

    throw new Error(
      "La Evolution solicitada no pertenece a este Pokémon."
    );
  }


  if (
    !candidate.standard
  ) {

    throw new Error(
      `${candidate.from} → ${candidate.to} requiere un handler especial.`
    );
  }


  if (
    !candidate.targetSpecies
  ) {

    throw new Error(
      `No se encontraron datos canónicos para ${candidate.to}.`
    );
  }


  if (
    !candidate.minimumLevelSatisfied
  ) {
    throw new Error(
      `La evolución a ${candidate.to} requiere nivel ` +
      `${candidate.minimumLevel}; el Pokémon está en Nv. ${preview.evolutionLevel}.`
    );
  }


  if (
    !candidate
      .evaluation
      .satisfied
  ) {

    throw new Error(
      "No se cumplen todos los requisitos de esta Evolution."
    );
  }


  if (
    candidate
      .evaluation
      .unsupported
  ) {

    throw new Error(
      "Esta Evolution contiene una condición todavía no soportada."
    );
  }


  if (
    !candidate
      .abilityChoices
      .length
  ) {

    throw new Error(
      `${candidate.to} no posee una Ability elegible para este individuo.`
    );
  }


  if (
    !candidate
      .abilityDefinitionsComplete
  ) {

    throw new Error(
      `${candidate.to} referencia una Ability inexistente en la base canónica.`
    );
  }


  const abilityChoice =
    resolveTargetAbilityChoice(
      candidate,
      requestedAbilityId
    );


  if (!abilityChoice) {

    throw new Error(
      "No se pudo resolver la Ability de la forma evolucionada."
    );
  }


  /*
   * Para los límites usamos scores efectivos.
   *
   * Aquí Nature ya está reflejada.
   */

  const currentEffectiveScores =
    effectiveAbilityScores(
      pokemon
    );


  const abilityResolution =
    resolveEvolutionAbilityScores({
      currentScores:
        currentEffectiveScores,

      requestedIncreases:
        abilityScoreIncreases,

      points:
        candidate
          .evolutionPoints,

      mode:
        candidate
          .abilityScoreMode
    });


  /*
   * Para persistencia partimos del source real,
   * SIN absorber el +1/-1 de Nature.
   */

  const nextAbilityScoreBase =
    applyEvolutionIncreasesToBase(
      rawAbilityScores(
        pokemon
      ),
      abilityResolution
        .increases
    );


  return {
    preview,
    candidate,
    abilityChoice,
    abilityResolution,

    abilityScoreBase:
      nextAbilityScoreBase,

    /*
     * Scores efectivos que verá el Level Up
     * inmediatamente después de Evolution.
     */
    abilityScores:
      abilityResolution
        .scores
  };
}

/* ============================================================
 * HP
 * ============================================================ */

async function applyEvolutionHp(
  pokemon,
  previousHp,
  {
    progression,
    currentLevel,
    evolutionLevel,
    previousConModifier
  }
) {

  const nextConModifier =
    abilityModifier(
      pokemon.system
        ?.abilities
        ?.con
        ?.value
    );


  const retroactiveConAdjustment =
    historicalPokemonConHpAdjustment({
      progression,
      currentLevel,
      previousConModifier,
      nextConModifier
    });


  const hpBonus =
    2 *
    evolutionLevel;


  const newMaximum =
    Math.max(
      1,
      previousHp.max +
      retroactiveConAdjustment +
      hpBonus
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


  return {
    hp: {
      value:
        Math.min(
          newMaximum,
          newValue
        ),

      max:
        newMaximum,

      temp:
        previousHp.temp
    },

    hpBonus,

    retroactiveConAdjustment,

    previousConModifier,

    nextConModifier
  };
}


/* ============================================================
 * SNAPSHOT / ROLLBACK
 * ============================================================ */

function abilityItemSnapshot(
  pokemon
) {

  const item =
    assertSingleAbilityItem(
      pokemon
    );


  return item
    ? foundry.utils.deepClone(
        item.toObject()
      )
    : null;
}


function evolutionStateSnapshot(
  pokemon
) {

  return {
    actorUuid:
      pokemon.uuid,

    sourceId:
      pokemonSourceId(
        pokemon
      ),

    level:
      pokemonLevel(
        pokemon
      ),

    trainerOwnerUuid:
      getPokemonTrainerUuid(
        pokemon
      ),

    folderId:
      pokemon.folder?.id ??
      null,

    sort:
      pokemon.sort,

    hp:
      hpSnapshot(
        pokemon
      ),

    rawAbilityScores:
      rawAbilityScores(
        pokemon
      ),

    effectiveAbilityScores:
      effectiveAbilityScores(
        pokemon
      ),

    proficiencies:
      proficiencySnapshot(
        pokemon
      ),

    progression:
      progressionSnapshot(
        pokemon
      ),

    activeAbilityId:
      pokemon.getFlag(
        MODULE_ID,
        "activeAbilityId"
      ),

    grantedHiddenAbilities:
      pokemon.getFlag(
        MODULE_ID,
        "grantedHiddenAbilities"
      ),

    abilityItem:
      abilityItemSnapshot(
        pokemon
      )
  };
}


async function restoreOptionalFlag(
  pokemon,
  key,
  value
) {

  if (
    value ===
      undefined
  ) {

    await pokemon.unsetFlag(
      MODULE_ID,
      key
    );


    return;
  }


  await pokemon.setFlag(
    MODULE_ID,
    key,
    foundry.utils.deepClone(
      value
    )
  );
}


async function restoreAbilityItem(
  pokemon,
  snapshot
) {

  const current =
    assertSingleAbilityItem(
      pokemon
    );


  if (
    snapshot &&
    current
  ) {

    const source =
      foundry.utils.deepClone(
        snapshot
      );


    delete source._id;


    await pokemon.updateEmbeddedDocuments(
      "Item",
      [
        {
          _id:
            current.id,

          ...source
        }
      ]
    );


    return;
  }


  if (
    snapshot &&
    !current
  ) {

    await pokemon.createEmbeddedDocuments(
      "Item",
      [
        foundry.utils.deepClone(
          snapshot
        )
      ],
      {
        keepId:
          true,

        keepEmbeddedIds:
          true
      }
    );


    return;
  }


  if (
    !snapshot &&
    current
  ) {

    await current.delete();
  }
}


async function rollbackEvolution(
  pokemon,
  snapshot
) {

  await rebuildPokemonAsSpecies(
    pokemon,
    snapshot.sourceId,
    {
      level:
        snapshot.level,

      abilityScoreBase:
        snapshot.rawAbilityScores,

      abilityScoreGains:
        emptyAbilityScoreGains(),

      additionalSavingThrows:
        snapshot
          .proficiencies
          .savingThrows,

      additionalSkillProficiencies:
        snapshot
          .proficiencies
          .skills
    }
  );


  await pokemon.update({
    "system.attributes.hp.value":
      snapshot.hp.value,

    "system.attributes.hp.max":
      snapshot.hp.max,

    "system.attributes.hp.temp":
      snapshot.hp.temp
  });


  await restoreAbilityItem(
    pokemon,
    snapshot.abilityItem
  );


  await restoreOptionalFlag(
    pokemon,
    "pokemonProgression",
    snapshot.progression
  );


  await restoreOptionalFlag(
    pokemon,
    "grantedHiddenAbilities",
    snapshot
      .grantedHiddenAbilities
  );


  await restoreOptionalFlag(
    pokemon,
    "activeAbilityId",
    snapshot.activeAbilityId
  );


  await refreshPokemonMoves(
    pokemon
  );
}


/* ============================================================
 * PROGRESSION V3
 * ============================================================ */

function nextEvolutionProgression({
  snapshot,
  candidate,
  evolutionLevel,
  abilityScoreBase,
  abilityScoreIncreases,
  abilityResolution,
  hpBonus
}) {

  const previous =
    foundry.utils.deepClone(
      snapshot.progression
    );


  const evolutionHistory =
    Array.isArray(
      previous.evolutionHistory
    )
      ? foundry.utils.deepClone(
          previous.evolutionHistory
        )
      : [];


  evolutionHistory.push({
    key:
      candidate.key,

    from:
      snapshot.sourceId,

    to:
      candidate.to,

    level:
      evolutionLevel,

    evolutionPoints:
      candidate.evolutionPoints,

    abilityScoreIncreases:
      foundry.utils.deepClone(
        abilityScoreIncreases
      ),
    abilityScoreMode:
      candidate.abilityScoreMode,

    sacrificedEvolutionPoints:
      Number(
        abilityResolution
          ?.sacrificedPoints ??
        0
      ),

    overcapEvolutionPoints:
      Number(
        abilityResolution
          ?.overcapPoints ??
        0
      ),
    hpBonus
  });


  return {
    ...previous,

    version:
      PROGRESSION_VERSION,

    baseLevel:
      previous.baseLevel ??
      snapshot.level,

    baseHpMax:
      previous.baseHpMax ??
      snapshot.hp.max,

    abilityScoreBase:
      foundry.utils.deepClone(
        abilityScoreBase
      ),

    /*
     * Evolution convierte el estado actual
     * en la nueva base individual.
     *
     * Los ASI posteriores se acumulan desde 0.
     */
    abilityScoreGains:
      emptyAbilityScoreGains(),

    retainedProficiencies:
      foundry.utils.deepClone(
        snapshot.proficiencies
      ),

    evolutionHistory
  };
}


/* ============================================================
 * INVARIANTS
 * ============================================================ */

function assertEvolutionInvariants(
  pokemon,
  snapshot,
  candidate,
  evolutionLevel
) {

  if (
    pokemon.uuid !==
      snapshot.actorUuid
  ) {

    throw new Error(
      `${pokemon.name}: Evolution cambió la instancia del Actor.`
    );
  }


  if (
    getPokemonTrainerUuid(
      pokemon
    ) !==
      snapshot.trainerOwnerUuid
  ) {

    throw new Error(
      `${pokemon.name}: Evolution alteró trainerOwnerUuid.`
    );
  }


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
      `${pokemon.name}: Evolution alteró su ubicación Party/PC.`
    );
  }


  if (
    pokemonSourceId(
      pokemon
    ) !==
      candidate.to
  ) {

    throw new Error(
      `${pokemon.name}: Evolution no actualizó sourceId a ${candidate.to}.`
    );
  }


  if (
    pokemonLevel(
      pokemon
    ) !==
      evolutionLevel
  ) {

    throw new Error(
      `${pokemon.name}: Evolution no quedó en Nv. ${evolutionLevel}.`
    );
  }
}

function findTrainerEvolutionItem(
  trainer,
  sourceId
) {

  const targetId =
    canonicalEvolutionValue(
      sourceId
    );


  return (
    trainer?.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          CATALOG_ITEM_KIND &&

        item.getFlag(
          MODULE_ID,
          "itemType"
        ) ===
          EVOLUTION_ITEM_TYPE &&

        canonicalEvolutionValue(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          )
        ) ===
          targetId &&

        itemQuantity(
          item
        ) > 0
    ) ??
    null
  );
}


async function consumeEvolutionItemUnit(
  item
) {

  const trainer =
    item.parent;


  if (
    trainer?.documentName !==
      "Actor"
  ) {

    throw new Error(
      `${item.name} no pertenece a un Trainer válido.`
    );
  }


  const quantity =
    itemQuantity(
      item
    );


  if (
    quantity <= 0
  ) {

    throw new Error(
      `${item.name} no tiene unidades disponibles.`
    );
  }


  if (
    quantity > 1
  ) {

    await item.update({
      "system.quantity":
        quantity - 1
    });


    return {
      itemName:
        item.name,

      rollback:
        async () => {

          const current =
            trainer.items.get(
              item.id
            );


          if (current) {

            await current.update({
              "system.quantity":
                quantity
            });
          }
        }
    };
  }


  const source =
    foundry.utils.deepClone(
      item.toObject()
    );


  await item.delete();


  return {
    itemName:
      source.name,

    rollback:
      async () => {

        if (
          trainer.items.get(
            source._id
          )
        ) {

          return;
        }


        await trainer.createEmbeddedDocuments(
          "Item",
          [
            source
          ],
          {
            keepId:
              true,

            keepEmbeddedIds:
              true
          }
        );
      }
  };
}


async function consumeRequiredEvolutionItems(
  pokemon,
  itemIds
) {

  const requestedIds =
    [
      ...new Set(
        (
          Array.isArray(
            itemIds
          )
            ? itemIds
            : []
        )
          .map(
            canonicalEvolutionValue
          )
          .filter(
            Boolean
          )
      )
    ];


  if (!requestedIds.length) {

    return [];
  }


  const trainer =
    trainerForPokemon(
      pokemon
    );


  if (!trainer) {

    throw new Error(
      `${pokemon.name} no posee un Trainer resoluble para consumir objetos de Evolution.`
    );
  }


  const items =
    requestedIds.map(
      sourceId => {

        const item =
          findTrainerEvolutionItem(
            trainer,
            sourceId
          );


        if (!item) {

          throw new Error(
            `${trainer.name} ya no posee el objeto de Evolution requerido: ${sourceId}.`
          );
        }


        return item;
      }
    );


  const transactions =
    [];


  try {

    for (
      const item
      of items
    ) {

      transactions.push(
        await consumeEvolutionItemUnit(
          item
        )
      );
    }

  } catch (error) {

    const rollbackErrors =
      [];


    for (
      const transaction
      of [
        ...transactions
      ].reverse()
    ) {

      try {

        await transaction.rollback();

      } catch (
        rollbackError
      ) {

        rollbackErrors.push(
          rollbackError
        );
      }
    }


    if (
      rollbackErrors.length
    ) {

      throw new AggregateError(
        [
          error,
          ...rollbackErrors
        ],
        "Falló el consumo del Evolution Item y también su rollback."
      );
    }


    throw error;
  }


  return transactions.map(
    transaction =>
      transaction.itemName
  );
}

/* ============================================================
 * APPLY
 * ============================================================ */

export async function evolvePokemonForLevelUp(
  pokemon,
  {
    evolutionKey:
      requestedEvolutionKey,

    evolutionLevel =
      null,

    onDemand =
      false,

    abilityScoreIncreases =
      {},

    manualConditionKeys =
      [],

    activeAbilityId:
      requestedAbilityId =
        null
  } = {}
) {

  assertEvolutionAuthority();


  const resolution =
    await resolvePokemonEvolutionForLevelUp(
      pokemon,
      {
        evolutionKey:
          requestedEvolutionKey,

        evolutionLevel,

        onDemand,

        abilityScoreIncreases,

        manualConditionKeys,

        activeAbilityId:
          requestedAbilityId
      }
    );


  const {
    preview,
    candidate,
    abilityChoice,
    abilityResolution,
    abilityScoreBase:
      nextAbilityScoreBase
  } =
    resolution;


  const snapshot =
    evolutionStateSnapshot(
      pokemon
    );


  const previousConModifier =
    abilityModifier(
      pokemon.system
        ?.abilities
        ?.con
        ?.value
    );


  try {

    /*
     * IMPORTANTE:
     *
     * Evolution reconstruye el Actor al nivel solicitado.
     * En Level Up es el siguiente nivel; bajo demanda es
     * el nivel actual, sin aplicar beneficios de Level Up.
     * Reconstruimos al nivel objetivo para:
     *
     * - usar datos válidos de la nueva especie;
     * - obtener PB/valores derivados del nuevo nivel;
     * - permitir especies cuyo minimumLevel es precisamente
     *   el nivel de Evolution.
     *
     * El Level Up Service NO incrementará nuevamente el nivel.
     */

    const rebuildResult =
      await rebuildPokemonAsSpecies(
        pokemon,
        candidate.targetSpecies,
        {
          level:
            preview.evolutionLevel,

          abilityScoreBase:
            nextAbilityScoreBase,

          abilityScoreGains:
            emptyAbilityScoreGains(),

          additionalSavingThrows:
            snapshot
              .proficiencies
              .savingThrows,

          additionalSkillProficiencies:
            snapshot
              .proficiencies
              .skills
        }
      );


    const updatedPokemon =
      rebuildResult?.actor ??
      pokemon;


    await updatedPokemon.setFlag(
      MODULE_ID,
      "grantedHiddenAbilities",
      foundry.utils.deepClone(
        candidate
          .grantedHiddenAbilityIds
      )
    );


    await applyTargetAbility(
      updatedPokemon,
      abilityChoice
    );


    const hpResult =
      await applyEvolutionHp(
        updatedPokemon,
        snapshot.hp,
        {
          progression:
            snapshot.progression,

          currentLevel:
            snapshot.level,

          evolutionLevel:
            preview.evolutionLevel,

          previousConModifier
        }
      );


    const nextProgression =
      nextEvolutionProgression({
        snapshot,
        candidate,

        evolutionLevel:
          preview.evolutionLevel,

        abilityScoreBase:
          nextAbilityScoreBase,

        abilityScoreIncreases:
          abilityResolution
            .increases,
        abilityResolution,
        hpBonus:
          hpResult.hpBonus
      });


    await updatedPokemon.setFlag(
      MODULE_ID,
      "pokemonProgression",
      nextProgression
    );


    const moveRefresh =
      await refreshPokemonMoves(
        updatedPokemon
      );


    assertEvolutionInvariants(
      updatedPokemon,
      snapshot,
      candidate,
      preview.evolutionLevel
    );


    let reverted =
      false;


    let itemsConsumed =
      false;


    return {
      actor:
        updatedPokemon,

      candidate,

      evolutionLevel:
        preview.evolutionLevel,

      abilityScoreBase:
        nextAbilityScoreBase,

      abilityScores:
        abilityResolution
          .scores,

      abilityScoreIncreases:
        abilityResolution
          .increases,

      activeAbilityId:
        abilityChoice.id,

      hp:
        hpResult,

      requiredItemIds:
        candidate.requiredItemIds,

      movesRefreshed:
        moveRefresh.refreshed,

      progression:
        nextProgression,
      
      abilityScoreMode:
        abilityResolution.mode,

      sacrificedEvolutionPoints:
        abilityResolution
          .sacrificedPoints,

      overcapEvolutionPoints:
        abilityResolution
          .overcapPoints,

      rollback:
        async () => {

          if (reverted) {

            return;
          }


          await rollbackEvolution(
            updatedPokemon,
            snapshot
          );


          reverted =
            true;
        },

      consumeRequiredItems:
        async () => {

          if (
            itemsConsumed
          ) {

            return [];
          }


          const consumed =
            await consumeRequiredEvolutionItems(
              updatedPokemon,
              candidate.requiredItemIds
            );


          itemsConsumed =
            true;


          return consumed;
        }
    };

  } catch (error) {

    try {

      await rollbackEvolution(
        pokemon,
        snapshot
      );

    } catch (
      rollbackError
    ) {

      throw new AggregateError(
        [
          error,
          rollbackError
        ],
        `${pokemon.name}: Evolution falló y el rollback también falló.`
      );
    }


    throw error;
  }
}

/* ============================================================
 * ON-DEMAND EVOLUTION (GM ONLY)
 * ============================================================ */

/**
 * Applies the existing permanent evolution transaction without
 * increasing Pokémon level or running the Level Up service.
 * @param {Actor} pokemon - Trainer-owned Pokémon Actor.
 * @param {object} choices - Values returned by the evolution dialog.
 * @returns {Promise<object>} Evolution result with consumed items.
 */
export async function evolvePokemonOnDemand(
  pokemon,
  choices = {}
) {
  assertEvolutionAuthority();

  const currentLevel =
    pokemonLevel(pokemon);

  const transaction =
    await evolvePokemonForLevelUp(
      pokemon,
      {
        ...choices,
        evolutionLevel: currentLevel,
        onDemand: true
      }
    );

  try {
    const consumedItems =
      await transaction.consumeRequiredItems();

    return {
      ...transaction,
      consumedItems
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `${pokemon.name}: la evolución manual y su rollback fallaron.`
      );
    }

    throw error;
  }
}
