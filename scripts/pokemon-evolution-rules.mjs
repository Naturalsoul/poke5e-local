const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

export const EVOLUTION_ABILITY_SCORE_MODE_STANDARD =
  "standard";

export const EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF =
  "tradeoff";

export const EVOLUTION_ABILITY_SCORE_CAP =
  20;

export const EVOLUTION_TRADEOFF_ABILITY_SCORE_CAP =
  24;

export const MIN_EVOLUTION_ABILITY_SCORE =
  1;

export const MAX_EVOLUTION_POINTS_PER_ABILITY =
  4;

export const MIN_EVOLUTION_TRADEOFF_CHANGE_PER_ABILITY =
  -4;


const AUTOMATIC_CONDITION_TYPES =
  new Set([
    "level",
    "gender",
    "move",
    "move-type",
    "item"
  ]);


const MANUAL_CONDITION_TYPES =
  new Set([
    "loyalty",
    "time",
    "special"
  ]);


/* ============================================================
 * CANONICAL IDS
 * ============================================================ */

export function canonicalEvolutionValue(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’']/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}


export function evolutionConditionKey(
  condition,
  index = 0
) {

  const type =
    canonicalEvolutionValue(
      condition?.type
    );


  const value =
    canonicalEvolutionValue(
      condition?.value
    );


  return `${type}:${value}:${index}`;
}


export function evolutionKey(
  evolution
) {

  const from =
    canonicalEvolutionValue(
      evolution?.from
    );


  const to =
    canonicalEvolutionValue(
      evolution?.to
    );


  const conditions =
    Array.isArray(
      evolution?.conditions
    )
      ? evolution.conditions
      : [];


  const conditionKey =
    conditions
      .map(
        (
          condition,
          index
        ) =>
          evolutionConditionKey(
            condition,
            index
          )
      )
      .join(
        "|"
      );


  return `${from}>${to}|${conditionKey}`;
}


/* ============================================================
 * EFFECTS
 * ============================================================ */

export function evolutionPoints(
  evolution
) {

  const effects =
    Array.isArray(
      evolution?.effects
    )
      ? evolution.effects
      : [];


  const asiEffect =
    effects.find(
      effect =>
        canonicalEvolutionValue(
          effect?.type
        ) ===
          "asi"
    );


  if (!asiEffect) {

    return null;
  }


  const points =
    Number(
      asiEffect.value
    );


  if (
    !Number.isInteger(
      points
    ) ||
    points < 0
  ) {

    return null;
  }


  return points;
}


export function isStandardEvolution(
  evolution
) {

  const effects =
    Array.isArray(
      evolution?.effects
    )
      ? evolution.effects
      : [];


  if (
    !effects.length ||
    evolutionPoints(
      evolution
    ) == null
  ) {

    return false;
  }


  return effects.every(
    effect =>
      canonicalEvolutionValue(
        effect?.type
      ) ===
        "asi"
  );
}


/* ============================================================
 * CANDIDATES
 * ============================================================ */

export function evolutionCandidatesFrom(
  evolutions,
  sourceId
) {

  const normalizedSourceId =
    canonicalEvolutionValue(
      sourceId
    );


  if (!normalizedSourceId) {

    return [];
  }


  return (
    Array.isArray(
      evolutions
    )
      ? evolutions
      : []
  ).filter(
    evolution =>
      canonicalEvolutionValue(
        evolution?.from
      ) ===
        normalizedSourceId
  );
}


/* ============================================================
 * CONDITIONS
 * ============================================================ */

function normalizedValueSet(
  values
) {

  return new Set(
    (
      Array.isArray(
        values
      )
        ? values
        : []
    )
      .map(
        canonicalEvolutionValue
      )
      .filter(
        Boolean
      )
  );
}


function evaluateAutomaticCondition(
  condition,
  context
) {

  const type =
    canonicalEvolutionValue(
      condition?.type
    );


  const value =
    condition?.value;


  if (
    type ===
      "level"
  ) {

    const actual =
      Number(
        context.level
      );


    const required =
      Number(
        value
      );


    return (
      Number.isFinite(
        actual
      ) &&
      Number.isFinite(
        required
      ) &&
      actual >=
        required
    );
  }


  const requiredId =
    canonicalEvolutionValue(
      value
    );


  if (!requiredId) {

    return false;
  }


  if (
    type ===
      "gender"
  ) {

    return (
      canonicalEvolutionValue(
        context.gender
      ) ===
        requiredId
    );
  }


  if (
    type ===
      "move"
  ) {

    return normalizedValueSet(
      context.knownMoveIds
    ).has(
      requiredId
    );
  }


  if (
    type ===
      "move-type"
  ) {

    return normalizedValueSet(
      context.knownMoveTypes
    ).has(
      requiredId
    );
  }


  if (
    type ===
      "item"
  ) {

    return normalizedValueSet(
      context.itemIds
    ).has(
      requiredId
    );
  }


  return false;
}


export function evaluateEvolutionConditions(
  evolution,
  context = {}
) {

  const conditions =
    Array.isArray(
      evolution?.conditions
    )
      ? evolution.conditions
      : [];


  const manualConditionKeys =
    new Set(
      Array.isArray(
        context.manualConditionKeys
      )
        ? context
            .manualConditionKeys
            .map(
              String
            )
        : []
    );


  const evaluated =
    conditions.map(
      (
        condition,
        index
      ) => {

        const type =
          canonicalEvolutionValue(
            condition?.type
          );


        const key =
          evolutionConditionKey(
            condition,
            index
          );


        if (
          AUTOMATIC_CONDITION_TYPES
            .has(
              type
            )
        ) {

          return {
            ...condition,

            key,

            mode:
              "automatic",

            satisfied:
              evaluateAutomaticCondition(
                condition,
                context
              )
          };
        }


        if (
          MANUAL_CONDITION_TYPES
            .has(
              type
            )
        ) {

          return {
            ...condition,

            key,

            mode:
              "manual",

            satisfied:
              manualConditionKeys
                .has(
                  key
                )
          };
        }


        return {
          ...condition,

          key,

          mode:
            "unsupported",

          satisfied:
            false
        };
      }
    );


  return {
    conditions:
      evaluated,

    satisfied:
      evaluated.every(
        condition =>
          condition.satisfied
      ),

    automaticSatisfied:
      evaluated
        .filter(
          condition =>
            condition.mode ===
              "automatic"
        )
        .every(
          condition =>
            condition.satisfied
        ),

    needsManualConfirmation:
      evaluated.some(
        condition =>
          condition.mode ===
            "manual" &&
          !condition.satisfied
      ),

    unsupported:
      evaluated.some(
        condition =>
          condition.mode ===
            "unsupported"
      )
  };
}


/* ============================================================
 * EVOLUTION POINTS
 * ============================================================ */

function emptyAbilityRecord() {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,
        0
      ]
    )
  );
}


export function evolutionAbilityScoreMode(
  evolution
) {

  const mode =
    canonicalEvolutionValue(
      evolution?.abilityScoreMode
    );


  return mode ===
    EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF
    ? EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF
    : EVOLUTION_ABILITY_SCORE_MODE_STANDARD;
}


export function evolutionAbilityScorePolicy(
  mode
) {

  const normalizedMode =
    canonicalEvolutionValue(
      mode
    ) ===
    EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF
      ? EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF
      : EVOLUTION_ABILITY_SCORE_MODE_STANDARD;


  if (
    normalizedMode ===
      EVOLUTION_ABILITY_SCORE_MODE_TRADEOFF
  ) {

    return {
      mode:
        normalizedMode,

      cap:
        EVOLUTION_TRADEOFF_ABILITY_SCORE_CAP,

      standardCap:
        EVOLUTION_ABILITY_SCORE_CAP,

      minimumScore:
        MIN_EVOLUTION_ABILITY_SCORE,

      minimumChange:
        MIN_EVOLUTION_TRADEOFF_CHANGE_PER_ABILITY,

      maximumChange:
        MAX_EVOLUTION_POINTS_PER_ABILITY,

      allowsSacrifice:
        true
    };
  }


  return {
    mode:
      normalizedMode,

    cap:
      EVOLUTION_ABILITY_SCORE_CAP,

    standardCap:
      EVOLUTION_ABILITY_SCORE_CAP,

    minimumScore:
      MIN_EVOLUTION_ABILITY_SCORE,

    minimumChange:
      0,

    maximumChange:
      MAX_EVOLUTION_POINTS_PER_ABILITY,

    allowsSacrifice:
      false
  };
}


export function analyzeEvolutionAbilityScoreAllocation({
  currentScores,
  requestedChanges = {},
  points,
  mode = EVOLUTION_ABILITY_SCORE_MODE_STANDARD
}) {

  const requiredPoints =
    Number(
      points
    );


  if (
    !Number.isInteger(
      requiredPoints
    ) ||
    requiredPoints < 0
  ) {

    throw new Error(
      "Evolution Points inválidos."
    );
  }


  const policy =
    evolutionAbilityScorePolicy(
      mode
    );


  const changes =
    emptyAbilityRecord();


  const scores =
    {};


  let positivePoints =
    0;

  let sacrificedPoints =
    0;

  let overcapPoints =
    0;


  for (
    const abilityId
    of ABILITY_IDS
  ) {

    const currentScore =
      Number(
        currentScores
          ?.[abilityId]
      );


    if (
      !Number.isInteger(
        currentScore
      ) ||
      currentScore <
        policy.minimumScore
    ) {

      throw new Error(
        `${abilityId.toUpperCase()}: ` +
        "la puntuación actual no es válida."
      );
    }


    if (
      currentScore >
        policy.cap
    ) {

      throw new Error(
        `${abilityId.toUpperCase()} ya supera ` +
        `el máximo de ${policy.cap} ` +
        "permitido por esta Evolution."
      );
    }


    const change =
      Number(
        requestedChanges
          ?.[abilityId] ??
        0
      );


    if (
      !Number.isInteger(
        change
      ) ||
      change <
        policy.minimumChange ||
      change >
        policy.maximumChange
    ) {

      throw new Error(
        `${abilityId.toUpperCase()}: el cambio debe estar entre ` +
        `${policy.minimumChange} y +${policy.maximumChange}.`
      );
    }


    const nextScore =
      currentScore +
      change;


    if (
      nextScore <
        policy.minimumScore
    ) {

      throw new Error(
        `${abilityId.toUpperCase()} no puede quedar por debajo de ` +
        `${policy.minimumScore} durante Evolution.`
      );
    }


    if (
      nextScore >
        policy.cap
    ) {

      throw new Error(
        `${abilityId.toUpperCase()} no puede superar ` +
        `${policy.cap} durante Evolution.`
      );
    }


    changes[
      abilityId
    ] =
      change;


    scores[
      abilityId
    ] =
      nextScore;


    positivePoints +=
      Math.max(
        0,
        change
      );


    sacrificedPoints +=
      Math.max(
        0,
        -change
      );


    const previousOvercap =
      Math.max(
        0,
        currentScore -
          EVOLUTION_ABILITY_SCORE_CAP
      );


    const nextOvercap =
      Math.max(
        0,
        nextScore -
          EVOLUTION_ABILITY_SCORE_CAP
      );


    /*
     * Solo cobramos sacrificio por puntos NUEVOS
     * creados sobre 20.
     */
    overcapPoints +=
      Math.max(
        0,
        nextOvercap -
          previousOvercap
      );
  }


  const netPoints =
    positivePoints -
    sacrificedPoints;


  const exactPoints =
    netPoints ===
      requiredPoints;


  const sacrificeCoversOvercap =
    !policy.allowsSacrifice ||
    sacrificedPoints >=
      overcapPoints;


  return {
    scores,
    changes,

    /*
     * Alias legacy.
     *
     * Trainer/Party ya consume este nombre.
     * En Tradeoff puede contener negativos.
     */
    increases:
      changes,

    points:
      requiredPoints,

    mode:
      policy.mode,

    cap:
      policy.cap,

    positivePoints,
    sacrificedPoints,
    overcapPoints,
    netPoints,
    exactPoints,
    sacrificeCoversOvercap,

    valid:
      exactPoints &&
      sacrificeCoversOvercap
  };
}


export function resolveEvolutionAbilityScores({
  currentScores,
  requestedChanges = null,
  requestedIncreases = null,
  points,
  mode = EVOLUTION_ABILITY_SCORE_MODE_STANDARD
}) {

  const allocation =
    analyzeEvolutionAbilityScoreAllocation({
      currentScores,

      requestedChanges:
        requestedChanges ??
        requestedIncreases ??
        {},

      points,
      mode
    });


  if (
    !allocation.exactPoints
  ) {

    throw new Error(
      `Debes distribuir un balance neto exacto de ${allocation.points} ` +
      "Evolution Points."
    );
  }


  if (
    !allocation.sacrificeCoversOvercap
  ) {

    throw new Error(
      `Para crear ${allocation.overcapPoints} punto(s) nuevos sobre ` +
      `${EVOLUTION_ABILITY_SCORE_CAP}, debes sacrificar al menos ` +
      `${allocation.overcapPoints} punto(s) en otras características.`
    );
  }


  return allocation;
}