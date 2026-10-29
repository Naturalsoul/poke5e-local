import {
  createFakemonDesignIntent
} from "./fakemon-design-profile.mjs";
import { normalizeId } from "./ids.mjs";


const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];


const DEFAULT_COMPARABLE_LIMIT =
  8;


const MIN_STAGE_SAMPLE =
  8;


const FEATURE_WEIGHTS =
  Object.freeze({
    durability:
      0.33,

    offense:
      0.34,

    speed:
      0.20,

    control:
      0.08,

    type:
      0.05
  });


export function buildFakemonBalanceRecommendation({
  database,
  intent,
  comparableLimit =
    DEFAULT_COMPARABLE_LIMIT
}) {

  const design =
    createFakemonDesignIntent(
      intent
    );


  const officialSpecies =
    officialSpeciesFromDatabase(
      database
    )
      .filter(
        isProfileableSpecies
      );


  if (!officialSpecies.length) {

    throw new Error(
      "No hay especies Poke5e válidas para construir referencias de balance."
    );
  }


  const stageSelection =
    selectStagePool(
      officialSpecies,
      design.stage
    );


  const metricContext =
    buildMetricContext(
      officialSpecies,
      design.offenseMode
    );


  const scored =
    stageSelection.species
      .map(
        species =>
          scoreComparable({
            species,
            design,
            metricContext,

            stageWasFiltered:
              stageSelection.filtered
          })
      )
      .sort(
        (
          left,
          right
        ) =>
          left.distance -
          right.distance
      );


  const limit =
    Math.min(
      normalizeLimit(
        comparableLimit
      ),
      scored.length
    );


  const comparables =
    scored.slice(
      0,
      limit
    );


  if (!comparables.length) {

    throw new Error(
      "No fue posible encontrar Pokémon Poke5e comparables."
    );
  }


  const averageSimilarity =
    average(
      comparables.map(
        entry =>
          entry.similarity
      )
    );


  return {
    intent:
      design,

    population: {
      officialSpecies:
        officialSpecies.length,

      comparedSpecies:
        stageSelection
          .species
          .length,

      stage:
        design.stage,

      stageFiltered:
        stageSelection.filtered
    },

    confidence: {
      score:
        roundToStep(
          averageSimilarity,
          0.01
        ),

      level:
        confidenceLevel({
          sampleSize:
            comparables.length,

          averageSimilarity
        })
    },

    recommendation:
      recommendFromComparables(
        comparables
      ),

    comparables:
      comparables.map(
        comparableSummary
      ),

    methodology: {
      source:
        "poke5e-normalized",

      strategy:
        "nearest-comparable-percentiles",

      note:
        "SR y minimumLevel se derivan de Pokémon Poke5e comparables; no se usa Challenge Rating de D&D."
    }
  };
}


export function classifyFakemonReferenceStage(
  species
) {

  const incoming =
    Array.isArray(
      species
        ?.evolutionRefs
        ?.incoming
    )
      ? species
          .evolutionRefs
          .incoming
      : [];


  const outgoing =
    Array.isArray(
      species
        ?.evolutionRefs
        ?.outgoing
    )
      ? species
          .evolutionRefs
          .outgoing
      : [];


  if (
    incoming.length &&
    outgoing.length
  ) {

    return "intermediate";
  }


  if (
    incoming.length
  ) {

    return "final";
  }


  if (
    outgoing.length
  ) {

    return "base";
  }


  return "standalone";
}


function officialSpeciesFromDatabase(
  database
) {

  const customIds =
    new Set(
      (
        database
          ?.fakemon
          ?.speciesIds ??
        []
      )
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    );


  return (
    Array.isArray(
      database?.pokemon
    )
      ? database.pokemon
      : []
  )
    .filter(
      species =>
        species?.id &&
        !customIds.has(
          normalizeId(
            species.id
          )
        )
    );
}


function isProfileableSpecies(
  species
) {

  const combat =
    species?.combat;


  if (
    !combat ||
    typeof combat !==
      "object"
  ) {

    return false;
  }


  if (
    !finite(
      species.sr
    ) ||
    !finite(
      species.minimumLevel
    ) ||
    !finite(
      combat.ac
    ) ||
    !finite(
      combat.hp
    )
  ) {

    return false;
  }


  return ABILITY_IDS.every(
    abilityId =>
      finite(
        combat
          .attributes
          ?.[abilityId]
      )
  );
}


function selectStagePool(
  species,
  stage
) {

  if (
    stage ===
      "any"
  ) {

    return {
      species,
      filtered:
        false
    };
  }


  const matching =
    species.filter(
      entry =>
        classifyFakemonReferenceStage(
          entry
        ) ===
          stage
    );


  /*
   * Si la muestra es demasiado pequeña no
   * forzamos el filtro. La etapa se convierte
   * en una penalización suave durante scoring.
   */
  if (
    matching.length >=
      MIN_STAGE_SAMPLE
  ) {

    return {
      species:
        matching,

      filtered:
        true
    };
  }


  return {
    species,
    filtered:
      false
  };
}


function buildMetricContext(
  species,
  offenseMode
) {

  const raw =
    species.map(
      entry =>
        rawCombatFeatures(
          entry,
          offenseMode
        )
    );


  return {
    hp:
      sortedFeature(
        raw,
        "hp"
      ),

    ac:
      sortedFeature(
        raw,
        "ac"
      ),

    con:
      sortedFeature(
        raw,
        "con"
      ),

    speed:
      sortedFeature(
        raw,
        "speed"
      ),

    dex:
      sortedFeature(
        raw,
        "dex"
      ),

    offense:
      sortedFeature(
        raw,
        "offense"
      ),

    control:
      sortedFeature(
        raw,
        "control"
      )
  };
}


function scoreComparable({
  species,
  design,
  metricContext,
  stageWasFiltered
}) {

  const raw =
    rawCombatFeatures(
      species,
      design.offenseMode
    );


  const features = {
    durability:
      weightedAverage([
        [
          percentileRank(
            metricContext.hp,
            raw.hp
          ),
          0.45
        ],

        [
          percentileRank(
            metricContext.ac,
            raw.ac
          ),
          0.35
        ],

        [
          percentileRank(
            metricContext.con,
            raw.con
          ),
          0.20
        ]
      ]),

    offense:
      percentileRank(
        metricContext.offense,
        raw.offense
      ),

    speed:
      weightedAverage([
        [
          percentileRank(
            metricContext.speed,
            raw.speed
          ),
          0.75
        ],

        [
          percentileRank(
            metricContext.dex,
            raw.dex
          ),
          0.25
        ]
      ]),

    /*
    * Balance de especie:
    * mantenemos un proxy basado en atributos
    * mentales para seleccionar comparables.
    *
    * v3.0.2 usa la dimensión de Control además
    * para puntuar Moves de utilidad, sin convertir
    * esas etiquetas UX en reglas nuevas de Poke5e.
    */
    control:
      percentileRank(
        metricContext.control,
        raw.control
      )
  };


  const distance =
    FEATURE_WEIGHTS.durability *
      Math.abs(
        features.durability -
        design.dimensions
          .durability
      ) +

    FEATURE_WEIGHTS.offense *
      Math.abs(
        features.offense -
        design.dimensions
          .offense
      ) +

    FEATURE_WEIGHTS.speed *
      Math.abs(
        features.speed -
        design.dimensions
          .speed
      ) +

    FEATURE_WEIGHTS.control *
      Math.abs(
        features.control -
        design.dimensions
          .control
      ) +

    FEATURE_WEIGHTS.type *
      typeDistance(
        design.types,
        species.types
      ) +

    stagePenalty({
      species,
      stage:
        design.stage,
      stageWasFiltered
    });


  return {
    species,
    raw,
    features,
    distance,

    similarity:
      clamp01(
        1 -
        distance
      )
  };
}


function rawCombatFeatures(
  species,
  offenseMode
) {

  const attributes =
    species
      .combat
      .attributes;


  const str =
    Number(
      attributes.str
    );

  const dex =
    Number(
      attributes.dex
    );

  const con =
    Number(
      attributes.con
    );

  const int =
    Number(
      attributes.int
    );

  const wis =
    Number(
      attributes.wis
    );

  const cha =
    Number(
      attributes.cha
    );


  const physical =
    Math.max(
      str,
      dex
    );


  const special =
    Math.max(
      int,
      wis,
      cha
    );


  const offense =
    offenseMode ===
      "physical"

      ? physical

      : offenseMode ===
          "special"

        ? special

        : (
            physical +
            special
          ) /
          2;


  return {
    hp:
      Number(
        species.combat.hp
      ),

    ac:
      Number(
        species.combat.ac
      ),

    str,
    dex,
    con,
    int,
    wis,
    cha,

    speed:
      primaryMobility(
        species
      ),

    offense,

    control:
      (
        int +
        wis +
        cha
      ) /
      3
  };
}


function primaryMobility(
  species
) {

  const values =
    (
      species
        ?.combat
        ?.speed ??
      []
    )
      .map(
        entry =>
          Number(
            entry?.value
          )
      )
      .filter(
        Number.isFinite
      );


  return values.length
    ? Math.max(
        ...values
      )
    : 0;
}


function recommendFromComparables(
  comparables
) {

  const weights =
    comparableWeights(
      comparables
    );


  return {
    sr:
      numericRecommendation({
        comparables,
        weights,

        getter:
          entry =>
            entry.species.sr,

        step:
          0.5,

        minimum:
          0
      }),

    minimumLevel:
      numericRecommendation({
        comparables,
        weights,

        getter:
          entry =>
            entry
              .species
              .minimumLevel,

        step:
          1,

        minimum:
          1,

        maximum:
          20
      }),

    combat: {
      hp:
        numericRecommendation({
          comparables,
          weights,

          getter:
            entry =>
              entry
                .species
                .combat
                .hp,

          step:
            1,

          minimum:
            1
        }),

      ac:
        numericRecommendation({
          comparables,
          weights,

          getter:
            entry =>
              entry
                .species
                .combat
                .ac,

          step:
            1,

          minimum:
            1
        }),

      hitDie:
        weightedMode(
          comparables,
          weights,

          entry =>
            entry
              .species
              .combat
              .hitDie
        ),

      speed:
        numericRecommendation({
          comparables,
          weights,

          getter:
            entry =>
              entry.raw.speed,

          step:
            5,

          minimum:
            0
        }),

      attributes:
        Object.fromEntries(
          ABILITY_IDS.map(
            abilityId => [
              abilityId,

              numericRecommendation({
                comparables,
                weights,

                getter:
                  entry =>
                    entry
                      .species
                      .combat
                      .attributes
                      ?.[abilityId],

                step:
                  1,

                minimum:
                  1
              })
            ]
          )
        )
    }
  };
}


function numericRecommendation({
  comparables,
  weights,
  getter,
  step,
  minimum = null,
  maximum = null
}) {

  const values =
    comparables
      .map(
        getter
      )
      .map(
        Number
      )
      .filter(
        Number.isFinite
      );


  const value =
    clampValue(
      roundToStep(
        weightedMean(
          comparables,
          weights,
          getter
        ),
        step
      ),
      minimum,
      maximum
    );


  return {
    value,

    min:
      clampValue(
        roundToStep(
          quantile(
            values,
            0.25
          ),
          step
        ),
        minimum,
        maximum
      ),

    max:
      clampValue(
        roundToStep(
          quantile(
            values,
            0.75
          ),
          step
        ),
        minimum,
        maximum
      )
  };
}


function comparableSummary(
  entry
) {

  const species =
    entry.species;


  return {
    id:
      String(
        species.id
      ),

    name:
      speciesName(
        species
      ),

    types:
      Array.isArray(
        species.types
      )
        ? [
            ...species.types
          ]
        : [],

    stage:
      classifyFakemonReferenceStage(
        species
      ),

    similarity:
      roundToStep(
        entry.similarity,
        0.01
      ),

    sr:
      Number(
        species.sr
      ),

    minimumLevel:
      Number(
        species.minimumLevel
      ),

    combat: {
      hp:
        Number(
          species.combat.hp
        ),

      ac:
        Number(
          species.combat.ac
        ),

      hitDie:
        species
          .combat
          .hitDie,

      speed:
        entry.raw.speed,

      attributes:
        Object.fromEntries(
          ABILITY_IDS.map(
            abilityId => [
              abilityId,

              Number(
                species
                  .combat
                  .attributes
                  ?.[abilityId]
              )
            ]
          )
        )
    }
  };
}


function stagePenalty({
  species,
  stage,
  stageWasFiltered
}) {

  if (
    stageWasFiltered ||
    stage ===
      "any"
  ) {

    return 0;
  }


  return (
    classifyFakemonReferenceStage(
      species
    ) ===
      stage

      ? 0

      : 0.12
  );
}


function typeDistance(
  expected,
  actual
) {

  const actualTypes =
    new Set(
      Array.isArray(
        actual
      )
        ? actual
        : []
    );


  const matches =
    expected.filter(
      type =>
        actualTypes.has(
          type
        )
    ).length;


  return (
    1 -
    matches /
      expected.length
  );
}


function comparableWeights(
  comparables
) {

  const values =
    comparables.map(
      entry =>
        Math.max(
          0.05,
          entry.similarity
        )
    );


  const total =
    values.reduce(
      (
        sum,
        value
      ) =>
        sum +
        value,
      0
    );


  return values.map(
    value =>
      value /
      total
  );
}


function weightedMean(
  entries,
  weights,
  getter
) {

  let result =
    0;


  entries.forEach(
    (
      entry,
      index
    ) => {

      result +=
        Number(
          getter(
            entry
          )
        ) *
        (
          weights[
            index
          ] ??
          0
        );
    }
  );


  return result;
}


function weightedMode(
  entries,
  weights,
  getter
) {

  const totals =
    new Map();


  entries.forEach(
    (
      entry,
      index
    ) => {

      const value =
        String(
          getter(
            entry
          ) ??
          ""
        ).trim();


      if (!value) {
        return;
      }


      totals.set(
        value,
        (
          totals.get(
            value
          ) ??
          0
        ) +
        (
          weights[
            index
          ] ??
          0
        )
      );
    }
  );


  return [
    ...totals.entries()
  ]
    .sort(
      (
        left,
        right
      ) =>
        right[1] -
        left[1]
    )
    ?.[0]
    ?.[0] ??
    "d6";
}


function sortedFeature(
  entries,
  key
) {

  return entries
    .map(
      entry =>
        Number(
          entry[
            key
          ]
        )
    )
    .filter(
      Number.isFinite
    )
    .sort(
      (
        left,
        right
      ) =>
        left -
        right
    );
}


function percentileRank(
  sorted,
  value
) {

  if (!sorted.length) {
    return 0.5;
  }


  let below =
    0;

  let equal =
    0;


  for (
    const entry
    of sorted
  ) {

    if (
      entry <
      value
    ) {

      below +=
        1;

      continue;
    }


    if (
      entry ===
      value
    ) {

      equal +=
        1;
    }
  }


  return (
    below +
    equal *
      0.5
  ) /
    sorted.length;
}


function quantile(
  values,
  percentile
) {

  const sorted =
    values
      .map(
        Number
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (!sorted.length) {
    return 0;
  }


  if (
    sorted.length ===
      1
  ) {

    return sorted[0];
  }


  const position =
    (
      sorted.length -
      1
    ) *
    percentile;


  const lower =
    Math.floor(
      position
    );


  const upper =
    Math.ceil(
      position
    );


  if (
    lower ===
      upper
  ) {

    return sorted[
      lower
    ];
  }


  const ratio =
    position -
    lower;


  return (
    sorted[
      lower
    ] *
      (
        1 -
        ratio
      ) +

    sorted[
      upper
    ] *
      ratio
  );
}


function weightedAverage(
  entries
) {

  const weight =
    entries.reduce(
      (
        sum,
        entry
      ) =>
        sum +
        entry[1],
      0
    );


  return entries.reduce(
    (
      sum,
      [
        value,
        entryWeight
      ]
    ) =>
      sum +
      value *
        entryWeight,
    0
  ) /
    weight;
}


function confidenceLevel({
  sampleSize,
  averageSimilarity
}) {

  if (
    sampleSize >= 6 &&
    averageSimilarity >=
      0.78
  ) {

    return "high";
  }


  if (
    sampleSize >= 4 &&
    averageSimilarity >=
      0.60
  ) {

    return "medium";
  }


  return "low";
}


function average(
  values
) {

  return values.reduce(
    (
      sum,
      value
    ) =>
      sum +
      value,
    0
  ) /
    values.length;
}


function normalizeLimit(
  value
) {

  const numeric =
    Number(
      value
    );


  return (
    Number.isInteger(
      numeric
    ) &&
    numeric > 0
  )
    ? numeric
    : DEFAULT_COMPARABLE_LIMIT;
}


function roundToStep(
  value,
  step
) {

  return (
    Math.round(
      value /
      step
    ) *
    step
  );
}


function clampValue(
  value,
  minimum,
  maximum
) {

  let result =
    value;


  if (
    minimum != null
  ) {

    result =
      Math.max(
        minimum,
        result
      );
  }


  if (
    maximum != null
  ) {

    result =
      Math.min(
        maximum,
        result
      );
  }


  return result;
}


function clamp01(
  value
) {

  return Math.min(
    1,
    Math.max(
      0,
      value
    )
  );
}


function finite(
  value
) {

  return Number.isFinite(
    Number(
      value
    )
  );
}


function speciesName(
  species
) {

  const value =
    species?.name;


  if (
    typeof value ===
      "string"
  ) {

    return value;
  }


  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {

    return String(
      value.es ??
      value.en ??
      species.id
    );
  }


  return String(
    species?.id ??
    ""
  );
}