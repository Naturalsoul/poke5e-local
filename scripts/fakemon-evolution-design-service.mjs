import {
  buildFakemonBalanceRecommendation,
  classifyFakemonReferenceStage
} from "./fakemon-balance-profiler.mjs";

import {
  canonicalEvolutionValue
} from "./pokemon-evolution-rules.mjs";

import {
  buildEvolutionCatalogContinuityProfile
} from "./fakemon-evolution-catalog-profiler.mjs";

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

export const FAKEMON_EVOLUTION_ORIGIN_IDS =
  Object.freeze([
    "natural",
    "bond",
    "rocket-experiment",
    "catalyst",
    "move-mastery",
    "special-event"
  ]);

export const FAKEMON_MUTATION_DEGREE_IDS =
  Object.freeze([
    "continuity",
    "moderate",
    "radical"
  ]);

/*
 * Peso del patrón evolutivo observado frente
 * al perfil objetivo normal del Wizard.
 *
 * Son heurísticas de diseño del Wizard,
 * no reglas Poke5e.
 */
const DELTA_BLEND_WEIGHTS =
  Object.freeze({
    continuity:
      0.75,

    moderate:
      0.55,

    radical:
      0.30
  });

const SOURCE_DISTANCE_WEIGHTS =
  Object.freeze({
    types:
      0.16,

    sr:
      0.18,

    minimumLevel:
      0.08,

    hp:
      0.12,

    ac:
      0.08,

    speed:
      0.08,

    attributes:
      0.18,

    sourceStage:
      0.07,

    targetStage:
      0.05
  });


export function listFakemonEvolutionSourceSpecies({
  database,
  customSpecies = []
}) {

  const byId =
    new Map();


  for (
    const species
    of asArray(
      database?.pokemon
    )
  ) {

    const id =
      canonicalEvolutionValue(
        species?.id
      );


    if (id) {

      byId.set(
        id,
        species
      );
    }
  }


  /*
   * database.pokemon ya contiene los Fakemon
   * habilitados.
   *
   * Repository aporta además los deshabilitados.
   *
   * No sobreescribimos la versión compuesta porque
   * puede contener evolutionRefs reconstruidos.
   */
  for (
    const species
    of asArray(
      customSpecies
    )
  ) {

    const id =
      canonicalEvolutionValue(
        species?.id
      );


    if (
      id &&
      !byId.has(
        id
      )
    ) {

      byId.set(
        id,
        species
      );
    }
  }


  return [
    ...byId.values()
  ]
    .filter(
      isEvolutionProfileableSpecies
    )
    .sort(
      compareSpecies
    );
}


export function resolveFakemonEvolutionSourceSpecies({
  species,
  value
}) {

  const query =
    canonicalEvolutionValue(
      value
    );


  if (!query) {
    return null;
  }


  const entries =
    asArray(
      species
    );


  const byId =
    entries.find(
      entry =>
        canonicalEvolutionValue(
          entry?.id
        ) ===
        query
    );


  if (byId) {
    return byId;
  }


  const byName =
    entries.filter(
      entry =>
        speciesNames(
          entry
        ).some(
          name =>
            canonicalEvolutionValue(
              name
            ) ===
            query
        )
    );


  return byName.length ===
    1
    ? byName[0]
    : null;
}


export function buildFakemonEvolutionBalanceRecommendation({
  database,
  sourceSpecies,
  customSpecies = [],
  intent,
  mutationDegree = "moderate",
  narrativeOrigin = "natural",
  comparableLimit =
    DEFAULT_COMPARABLE_LIMIT
}) {

  if (
    !isEvolutionProfileableSpecies(
      sourceSpecies
    )
  ) {

    throw new Error(
      "La especie de origen no contiene estadísticas suficientes para perfilar una Evolution."
    );
  }


  const mutation =
    normalizeMutationDegree(
      mutationDegree
    );


  const origin =
    normalizeNarrativeOrigin(
      narrativeOrigin
    );


  /*
   * El profiler normal sigue aportando el perfil
   * objetivo solicitado por el GM.
   */
  const baseRecommendation =
    buildFakemonBalanceRecommendation({
      database,
      intent,
      comparableLimit
    });


  const officialSpecies =
    officialSpeciesFromDatabase(
      database,
      customSpecies
    );


  const officialById =
    new Map(
      officialSpecies.map(
        species => [
          canonicalEvolutionValue(
            species.id
          ),
          species
        ]
      )
    );


  /*
   * Una misma relación puede aparecer varias veces
   * con condiciones diferentes.
   *
   * Para estudiar deltas de especie interesa
   * únicamente from → to una vez.
   */
  const pairs =
    buildOfficialEvolutionPairs({
      database,
      officialById
    });


  if (!pairs.length) {

    return {
      ...baseRecommendation,

      evolutionProfile:
        fallbackEvolutionProfile({
          sourceSpecies,
          mutation,
          origin,
          baseRecommendation
        })
    };
  }


  const stageById =
    buildStageMap(
      pairs
    );


  const sourceStage =
    resolveSourceStage({
      sourceSpecies,
      stageById
    });


  const targetStage =
    normalizeStage(
      intent?.stage
    );


  const metricContext =
    buildSourceMetricContext(
      pairs.map(
        pair =>
          pair.fromSpecies
      )
    );


  const scored =
    pairs
      .map(
        pair =>
          scoreEvolutionPair({
            pair,
            sourceSpecies,
            sourceStage,
            targetStage,
            stageById,
            metricContext
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

    return {
      ...baseRecommendation,

      evolutionProfile:
        fallbackEvolutionProfile({
          sourceSpecies,
          mutation,
          origin,
          baseRecommendation
        })
    };
  }


  const weights =
    comparableWeights(
      comparables
    );

  const catalogContinuity =
    buildEvolutionCatalogContinuityProfile({
      comparables,
      weights
    });

  const deltaRecommendation =
    buildDeltaRecommendation({
      sourceSpecies,
      comparables,
      weights
    });


  const deltaWeight =
    DELTA_BLEND_WEIGHTS[
      mutation
    ];


  const recommendation =
    blendRecommendations({
      base:
        baseRecommendation
          .recommendation,

      delta:
        deltaRecommendation,

      deltaWeight
    });


  const averageSimilarity =
    average(
      comparables.map(
        entry =>
          entry.similarity
      )
    );


  const confidenceScore =
    clamp01(
      averageSimilarity *
        0.65 +

      Number(
        baseRecommendation
          ?.confidence
          ?.score ??
        0
      ) *
        0.35
    );


  return {
    ...baseRecommendation,

    population: {
      ...baseRecommendation.population,

      evolutionPairs:
        pairs.length,

      evolutionComparables:
        comparables.length
    },

    confidence: {
      score:
        roundToStep(
          confidenceScore,
          0.01
        ),

      level:
        confidenceLevel({
          sampleSize:
            comparables.length,

          averageSimilarity:
            confidenceScore
        })
    },

    recommendation,

    /*
     * El Recommendation Engine ya consume
     * balanceRecommendation.comparables.
     *
     * En modo Evolution esos comparables serán
     * las especies DESTINO de las Evolutions
     * estadísticamente más parecidas.
     */
    comparables:
      targetComparableSummaries(
        comparables
      ),

    methodology: {
      source:
        "poke5e-normalized",

      strategy:
        "evolution-delta-plus-target-profile",

      note:
        "La recomendación mezcla deltas observados en Evolutions Poke5e " +
        "con el perfil objetivo del Wizard. El grado de mutación controla " +
        "el peso relativo; no crea reglas nuevas de Poke5e."
    },

    evolutionProfile:
      buildEvolutionProfile({
        sourceSpecies,
        sourceStage,
        mutation,
        origin,
        deltaWeight,
        comparables,
        catalogContinuity,
        deltaRecommendation,

        baseRecommendation:
          baseRecommendation
            .recommendation,

        finalRecommendation:
          recommendation
      })
  };
}


function buildOfficialEvolutionPairs({
  database,
  officialById
}) {

  const seen =
    new Set();

  const pairs =
    [];


  for (
    const evolution
    of asArray(
      database?.evolutions
    )
  ) {

    const from =
      canonicalEvolutionValue(
        evolution?.from
      );


    const to =
      canonicalEvolutionValue(
        evolution?.to
      );


    if (
      !from ||
      !to ||
      from ===
        to
    ) {
      continue;
    }


    const fromSpecies =
      officialById.get(
        from
      );


    const toSpecies =
      officialById.get(
        to
      );


    if (
      !isEvolutionProfileableSpecies(
        fromSpecies
      ) ||
      !isEvolutionProfileableSpecies(
        toSpecies
      )
    ) {
      continue;
    }


    const key =
      `${from}>${to}`;


    if (
      seen.has(
        key
      )
    ) {
      continue;
    }


    seen.add(
      key
    );


    pairs.push({
      from,
      to,
      fromSpecies,
      toSpecies
    });
  }


  return pairs;
}


function buildStageMap(
  pairs
) {

  const incoming =
    new Map();

  const outgoing =
    new Map();


  for (
    const pair
    of pairs
  ) {

    incrementMap(
      outgoing,
      pair.from
    );

    incrementMap(
      incoming,
      pair.to
    );
  }


  const ids =
    new Set([
      ...incoming.keys(),
      ...outgoing.keys()
    ]);


  return new Map(
    [
      ...ids
    ].map(
      id => [
        id,

        stageFromCounts({
          incoming:
            incoming.get(
              id
            ) ??
            0,

          outgoing:
            outgoing.get(
              id
            ) ??
            0
        })
      ]
    )
  );
}


function scoreEvolutionPair({
  pair,
  sourceSpecies,
  sourceStage,
  targetStage,
  stageById,
  metricContext
}) {

  const source =
    sourceMetrics(
      sourceSpecies
    );


  const reference =
    sourceMetrics(
      pair.fromSpecies
    );


  const attributeDistance =
    average(
      ABILITY_IDS.map(
        abilityId =>
          normalizedDistance(
            source.attributes[
              abilityId
            ],

            reference.attributes[
              abilityId
            ],

            metricContext.attributes[
              abilityId
            ]
          )
      )
    );


  const referenceSourceStage =
    stageById.get(
      pair.from
    ) ??
    "standalone";


  const referenceTargetStage =
    stageById.get(
      pair.to
    ) ??
    "standalone";


  const distance =
    SOURCE_DISTANCE_WEIGHTS.types *
      typeDistance(
        sourceSpecies.types,
        pair.fromSpecies.types
      ) +

    SOURCE_DISTANCE_WEIGHTS.sr *
      normalizedDistance(
        source.sr,
        reference.sr,
        metricContext.sr
      ) +

    SOURCE_DISTANCE_WEIGHTS.minimumLevel *
      normalizedDistance(
        source.minimumLevel,
        reference.minimumLevel,
        metricContext.minimumLevel
      ) +

    SOURCE_DISTANCE_WEIGHTS.hp *
      normalizedDistance(
        source.hp,
        reference.hp,
        metricContext.hp
      ) +

    SOURCE_DISTANCE_WEIGHTS.ac *
      normalizedDistance(
        source.ac,
        reference.ac,
        metricContext.ac
      ) +

    SOURCE_DISTANCE_WEIGHTS.speed *
      normalizedDistance(
        source.speed,
        reference.speed,
        metricContext.speed
      ) +

    SOURCE_DISTANCE_WEIGHTS.attributes *
      attributeDistance +

    SOURCE_DISTANCE_WEIGHTS.sourceStage *
      stageDistance(
        sourceStage,
        referenceSourceStage
      ) +

    SOURCE_DISTANCE_WEIGHTS.targetStage *
      stageDistance(
        targetStage,
        referenceTargetStage
      );


  return {
    ...pair,

    sourceStage:
      referenceSourceStage,

    targetStage:
      referenceTargetStage,

    distance,

    similarity:
      clamp01(
        1 -
        distance
      ),

    deltas:
      evolutionDeltas(
        pair.fromSpecies,
        pair.toSpecies
      )
  };
}


function buildSourceMetricContext(
  species
) {

  const metrics =
    species.map(
      sourceMetrics
    );


  return {
    sr:
      metricRange(
        metrics,
        entry =>
          entry.sr
      ),

    minimumLevel:
      metricRange(
        metrics,
        entry =>
          entry.minimumLevel
      ),

    hp:
      metricRange(
        metrics,
        entry =>
          entry.hp
      ),

    ac:
      metricRange(
        metrics,
        entry =>
          entry.ac
      ),

    speed:
      metricRange(
        metrics,
        entry =>
          entry.speed
      ),

    attributes:
      Object.fromEntries(
        ABILITY_IDS.map(
          abilityId => [
            abilityId,

            metricRange(
              metrics,
              entry =>
                entry.attributes[
                  abilityId
                ]
            )
          ]
        )
      )
  };
}


function sourceMetrics(
  species
) {

  return {
    sr:
      Number(
        species.sr
      ),

    minimumLevel:
      Number(
        species.minimumLevel
      ),

    hp:
      Number(
        species.combat.hp
      ),

    ac:
      Number(
        species.combat.ac
      ),

    speed:
      primaryMobility(
        species
      ),

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
  };
}


function evolutionDeltas(
  fromSpecies,
  toSpecies
) {

  const from =
    sourceMetrics(
      fromSpecies
    );


  const to =
    sourceMetrics(
      toSpecies
    );


  return {
    sr:
      to.sr -
      from.sr,

    minimumLevel:
      to.minimumLevel -
      from.minimumLevel,

    hp:
      to.hp -
      from.hp,

    ac:
      to.ac -
      from.ac,

    speed:
      to.speed -
      from.speed,

    attributes:
      Object.fromEntries(
        ABILITY_IDS.map(
          abilityId => [
            abilityId,

            to.attributes[
              abilityId
            ] -
            from.attributes[
              abilityId
            ]
          ]
        )
      )
  };
}


function buildDeltaRecommendation({
  sourceSpecies,
  comparables,
  weights
}) {

  const source =
    sourceMetrics(
      sourceSpecies
    );


  return {
    sr:
      deltaNumericRecommendation({
        source:
          source.sr,

        comparables,
        weights,

        getter:
          entry =>
            entry.deltas.sr,

        step:
          0.5,

        minimum:
          0
      }),

    minimumLevel:
      deltaNumericRecommendation({
        source:
          source.minimumLevel,

        comparables,
        weights,

        getter:
          entry =>
            entry.deltas.minimumLevel,

        step:
          1,

        minimum:
          1,

        maximum:
          20
      }),

    combat: {
      hp:
        deltaNumericRecommendation({
          source:
            source.hp,

          comparables,
          weights,

          getter:
            entry =>
              entry.deltas.hp,

          step:
            1,

          minimum:
            1
        }),

      ac:
        deltaNumericRecommendation({
          source:
            source.ac,

          comparables,
          weights,

          getter:
            entry =>
              entry.deltas.ac,

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
              .toSpecies
              .combat
              .hitDie
        ),

      speed:
        deltaNumericRecommendation({
          source:
            source.speed,

          comparables,
          weights,

          getter:
            entry =>
              entry.deltas.speed,

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

              deltaNumericRecommendation({
                source:
                  source.attributes[
                    abilityId
                  ],

                comparables,
                weights,

                getter:
                  entry =>
                    entry
                      .deltas
                      .attributes[
                        abilityId
                      ],

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


function deltaNumericRecommendation({
  source,
  comparables,
  weights,
  getter,
  step,
  minimum = null,
  maximum = null
}) {

  const deltas =
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


  const meanDelta =
    weightedMean(
      comparables,
      weights,
      getter
    );


  const lowerDelta =
    quantile(
      deltas,
      0.25
    );


  const upperDelta =
    quantile(
      deltas,
      0.75
    );


  return {
    value:
      clampValue(
        roundToStep(
          source +
          meanDelta,
          step
        ),
        minimum,
        maximum
      ),

    min:
      clampValue(
        roundToStep(
          source +
          lowerDelta,
          step
        ),
        minimum,
        maximum
      ),

    max:
      clampValue(
        roundToStep(
          source +
          upperDelta,
          step
        ),
        minimum,
        maximum
      ),

    delta: {
      value:
        roundToStep(
          meanDelta,
          step
        ),

      min:
        roundToStep(
          lowerDelta,
          step
        ),

      max:
        roundToStep(
          upperDelta,
          step
        )
    }
  };
}


function blendRecommendations({
  base,
  delta,
  deltaWeight
}) {

  const blend =
    (
      baseMetric,
      deltaMetric,
      step,
      minimum,
      maximum = null
    ) =>
      blendNumericRecommendation({
        base:
          baseMetric,

        delta:
          deltaMetric,

        deltaWeight,
        step,
        minimum,
        maximum
      });


  return {
    sr:
      blend(
        base.sr,
        delta.sr,
        0.5,
        0
      ),

    minimumLevel:
      blend(
        base.minimumLevel,
        delta.minimumLevel,
        1,
        1,
        20
      ),

    combat: {
      hp:
        blend(
          base.combat.hp,
          delta.combat.hp,
          1,
          1
        ),

      ac:
        blend(
          base.combat.ac,
          delta.combat.ac,
          1,
          1
        ),

      /*
       * Hit Die es categórico.
       */
      hitDie:
        deltaWeight >=
          0.5
          ? delta.combat.hitDie
          : base.combat.hitDie,

      speed:
        blend(
          base.combat.speed,
          delta.combat.speed,
          5,
          0
        ),

      attributes:
        Object.fromEntries(
          ABILITY_IDS.map(
            abilityId => [
              abilityId,

              blend(
                base
                  .combat
                  .attributes[
                    abilityId
                  ],

                delta
                  .combat
                  .attributes[
                    abilityId
                  ],

                1,
                1
              )
            ]
          )
        )
    }
  };
}


function blendNumericRecommendation({
  base,
  delta,
  deltaWeight,
  step,
  minimum = null,
  maximum = null
}) {

  const value =
    clampValue(
      roundToStep(
        blendNumber(
          base.value,
          delta.value,
          deltaWeight
        ),
        step
      ),
      minimum,
      maximum
    );


  const blendedMin =
    clampValue(
      roundToStep(
        blendNumber(
          base.min,
          delta.min,
          deltaWeight
        ),
        step
      ),
      minimum,
      maximum
    );


  const blendedMax =
    clampValue(
      roundToStep(
        blendNumber(
          base.max,
          delta.max,
          deltaWeight
        ),
        step
      ),
      minimum,
      maximum
    );


  return {
    value,

    min:
      Math.min(
        value,
        blendedMin,
        blendedMax
      ),

    max:
      Math.max(
        value,
        blendedMin,
        blendedMax
      )
  };
}


function buildEvolutionProfile({
  sourceSpecies,
  sourceStage,
  mutation,
  origin,
  deltaWeight,
  comparables,
  deltaRecommendation,
  baseRecommendation,
  catalogContinuity,
  finalRecommendation
}) {

  const source =
    sourceMetrics(
      sourceSpecies
    );


  return {
    source:
      speciesSummary(
        sourceSpecies,
        sourceStage
      ),

    narrativeOrigin:
      origin,

    mutationDegree:
      mutation,

    deltaWeight,

    fallback:
      false,

    comparableCount:
      comparables.length,

    catalogContinuity,

    comparables:
      comparables.map(
        entry => ({
          from:
            speciesSummary(
              entry.fromSpecies,
              entry.sourceStage
            ),

          to:
            speciesSummary(
              entry.toSpecies,
              entry.targetStage
            ),

          similarity:
            roundToStep(
              entry.similarity,
              0.01
            ),

          deltas:
            entry.deltas
        })
      ),

    metrics: {
      sr:
        evolutionMetric({
          source:
            source.sr,

          delta:
            deltaRecommendation.sr,

          base:
            baseRecommendation.sr,

          final:
            finalRecommendation.sr
        }),

      minimumLevel:
        evolutionMetric({
          source:
            source.minimumLevel,

          delta:
            deltaRecommendation.minimumLevel,

          base:
            baseRecommendation.minimumLevel,

          final:
            finalRecommendation.minimumLevel
        }),

      hp:
        evolutionMetric({
          source:
            source.hp,

          delta:
            deltaRecommendation.combat.hp,

          base:
            baseRecommendation.combat.hp,

          final:
            finalRecommendation.combat.hp
        }),

      ac:
        evolutionMetric({
          source:
            source.ac,

          delta:
            deltaRecommendation.combat.ac,

          base:
            baseRecommendation.combat.ac,

          final:
            finalRecommendation.combat.ac
        }),

      speed:
        evolutionMetric({
          source:
            source.speed,

          delta:
            deltaRecommendation.combat.speed,

          base:
            baseRecommendation.combat.speed,

          final:
            finalRecommendation.combat.speed
        }),

      attributes:
        Object.fromEntries(
          ABILITY_IDS.map(
            abilityId => [
              abilityId,

              evolutionMetric({
                source:
                  source.attributes[
                    abilityId
                  ],

                delta:
                  deltaRecommendation
                    .combat
                    .attributes[
                      abilityId
                    ],

                base:
                  baseRecommendation
                    .combat
                    .attributes[
                      abilityId
                    ],

                final:
                  finalRecommendation
                    .combat
                    .attributes[
                      abilityId
                    ]
              })
            ]
          )
        )
    }
  };
}


function evolutionMetric({
  source,
  delta,
  base,
  final
}) {

  return {
    source,

    observedDelta:
      delta.delta,

    deltaTarget: {
      value:
        delta.value,

      min:
        delta.min,

      max:
        delta.max
    },

    profileTarget: {
      value:
        base.value,

      min:
        base.min,

      max:
        base.max
    },

    final: {
      value:
        final.value,

      min:
        final.min,

      max:
        final.max
    }
  };
}


function fallbackEvolutionProfile({
  sourceSpecies,
  mutation,
  origin,
  baseRecommendation
}) {

  return {
    source:
      speciesSummary(
        sourceSpecies,

        classifyFakemonReferenceStage(
          sourceSpecies
        )
      ),

    narrativeOrigin:
      origin,

    mutationDegree:
      mutation,

    deltaWeight:
      0,

    fallback:
      true,

    comparableCount:
      0,

    catalogContinuity:
      buildEvolutionCatalogContinuityProfile({
        comparables: [],
        weights: []
      }),

    comparables:
      [],

    metrics:
      buildFallbackMetrics({
        sourceSpecies,

        finalRecommendation:
          baseRecommendation
            .recommendation
      })
  };
}


function buildFallbackMetrics({
  sourceSpecies,
  finalRecommendation
}) {

  const source =
    sourceMetrics(
      sourceSpecies
    );


  const metric =
    (
      sourceValue,
      final
    ) => ({
      source:
        sourceValue,

      observedDelta:
        null,

      deltaTarget:
        null,

      profileTarget: {
        ...final
      },

      final: {
        ...final
      }
    });


  return {
    sr:
      metric(
        source.sr,
        finalRecommendation.sr
      ),

    minimumLevel:
      metric(
        source.minimumLevel,
        finalRecommendation.minimumLevel
      ),

    hp:
      metric(
        source.hp,
        finalRecommendation.combat.hp
      ),

    ac:
      metric(
        source.ac,
        finalRecommendation.combat.ac
      ),

    speed:
      metric(
        source.speed,
        finalRecommendation.combat.speed
      ),

    attributes:
      Object.fromEntries(
        ABILITY_IDS.map(
          abilityId => [
            abilityId,

            metric(
              source.attributes[
                abilityId
              ],

              finalRecommendation
                .combat
                .attributes[
                  abilityId
                ]
            )
          ]
        )
      )
  };
}


function targetComparableSummaries(
  comparables
) {

  const byId =
    new Map();


  for (
    const entry
    of comparables
  ) {

    const species =
      entry.toSpecies;


    const id =
      canonicalEvolutionValue(
        species?.id
      );


    if (!id) {
      continue;
    }


    const previous =
      byId.get(
        id
      );


    if (
      previous &&
      previous.similarity >=
        entry.similarity
    ) {
      continue;
    }


    byId.set(
      id,
      {
        id,

        name:
          speciesDisplayName(
            species
          ),

        types: [
          ...asArray(
            species.types
          )
        ],

        stage:
          entry.targetStage,

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
            species.combat.hitDie,

          speed:
            primaryMobility(
              species
            ),

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
      }
    );
  }


  return [
    ...byId.values()
  ].sort(
    (
      left,
      right
    ) =>
      right.similarity -
      left.similarity
  );
}


function officialSpeciesFromDatabase(
  database,
  customSpecies
) {

  const customIds =
    new Set(
      [
        ...asArray(
          database
            ?.fakemon
            ?.speciesIds
        ),

        ...asArray(
          customSpecies
        ).map(
          species =>
            species?.id
        )
      ]
        .map(
          canonicalEvolutionValue
        )
        .filter(
          Boolean
        )
    );


  return asArray(
    database?.pokemon
  )
    .filter(
      species =>
        species?.id &&
        !customIds.has(
          canonicalEvolutionValue(
            species.id
          )
        )
    )
    .filter(
      isEvolutionProfileableSpecies
    );
}


function isEvolutionProfileableSpecies(
  species
) {

  if (
    !species?.combat ||
    !finite(
      species.sr
    ) ||
    !finite(
      species.minimumLevel
    ) ||
    !finite(
      species.combat.hp
    ) ||
    !finite(
      species.combat.ac
    )
  ) {
    return false;
  }


  return ABILITY_IDS.every(
    abilityId =>
      finite(
        species
          .combat
          .attributes
          ?.[abilityId]
      )
  );
}


function resolveSourceStage({
  sourceSpecies,
  stageById
}) {

  return (
    stageById.get(
      canonicalEvolutionValue(
        sourceSpecies?.id
      )
    ) ??

    classifyFakemonReferenceStage(
      sourceSpecies
    )
  );
}


function stageFromCounts({
  incoming,
  outgoing
}) {

  if (
    incoming > 0 &&
    outgoing > 0
  ) {
    return "intermediate";
  }


  if (
    incoming > 0
  ) {
    return "final";
  }


  if (
    outgoing > 0
  ) {
    return "base";
  }


  return "standalone";
}


function speciesSummary(
  species,
  stage
) {

  return {
    id:
      canonicalEvolutionValue(
        species?.id
      ),

    name:
      speciesDisplayName(
        species
      ),

    types: [
      ...asArray(
        species?.types
      )
    ],

    stage,

    sr:
      Number(
        species?.sr
      ),

    minimumLevel:
      Number(
        species?.minimumLevel
      )
  };
}


function speciesDisplayName(
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
      species?.id ??
      ""
    );
  }


  return String(
    species?.id ??
    ""
  );
}


function speciesNames(
  species
) {

  const value =
    species?.name;


  if (
    typeof value ===
    "string"
  ) {
    return [
      value
    ];
  }


  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {

    return [
      value.es,
      value.en
    ].filter(
      Boolean
    );
  }


  return [];
}


function compareSpecies(
  left,
  right
) {

  return speciesDisplayName(
    left
  ).localeCompare(
    speciesDisplayName(
      right
    ),
    "es",
    {
      sensitivity:
        "base"
    }
  );
}


function primaryMobility(
  species
) {

  const values =
    asArray(
      species
        ?.combat
        ?.speed
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


function metricRange(
  entries,
  getter
) {

  const values =
    entries
      .map(
        getter
      )
      .map(
        Number
      )
      .filter(
        Number.isFinite
      );


  if (!values.length) {

    return {
      min:
        0,

      max:
        1
    };
  }


  return {
    min:
      Math.min(
        ...values
      ),

    max:
      Math.max(
        ...values
      )
  };
}


function normalizedDistance(
  left,
  right,
  range
) {

  const span =
    Math.max(
      1,

      Number(
        range?.max
      ) -

      Number(
        range?.min
      )
    );


  return clamp01(
    Math.abs(
      Number(
        left
      ) -
      Number(
        right
      )
    ) /
    span
  );
}


function typeDistance(
  expected,
  actual
) {

  const left =
    new Set(
      asArray(
        expected
      ).map(
        canonicalEvolutionValue
      )
    );


  const right =
    new Set(
      asArray(
        actual
      ).map(
        canonicalEvolutionValue
      )
    );


  const union =
    new Set([
      ...left,
      ...right
    ]);


  if (!union.size) {
    return 0;
  }


  const intersection =
    [
      ...left
    ].filter(
      value =>
        right.has(
          value
        )
    ).length;


  return (
    1 -
    intersection /
      union.size
  );
}


function stageDistance(
  expected,
  actual
) {

  if (
    !expected ||
    expected ===
      "any"
  ) {
    return 0;
  }


  return expected ===
    actual
    ? 0
    : 1;
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

  return entries.reduce(
    (
      total,
      entry,
      index
    ) =>
      total +
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
      ),
    0
  );
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


function blendNumber(
  base,
  delta,
  deltaWeight
) {

  return (
    Number(
      base
    ) *
      (
        1 -
        deltaWeight
      ) +

    Number(
      delta
    ) *
      deltaWeight
  );
}


function confidenceLevel({
  sampleSize,
  averageSimilarity
}) {

  if (
    sampleSize >=
      6 &&
    averageSimilarity >=
      0.78
  ) {
    return "high";
  }


  if (
    sampleSize >=
      4 &&
    averageSimilarity >=
      0.60
  ) {
    return "medium";
  }


  return "low";
}


function normalizeMutationDegree(
  value
) {

  const id =
    canonicalEvolutionValue(
      value
    ) ||
    "moderate";


  if (
    !FAKEMON_MUTATION_DEGREE_IDS.includes(
      id
    )
  ) {

    throw new Error(
      `Grado de mutación no válido: ${id}.`
    );
  }


  return id;
}


function normalizeNarrativeOrigin(
  value
) {

  const id =
    canonicalEvolutionValue(
      value
    ) ||
    "natural";


  if (
    !FAKEMON_EVOLUTION_ORIGIN_IDS.includes(
      id
    )
  ) {

    throw new Error(
      `Origen de Evolution no válido: ${id}.`
    );
  }


  return id;
}


function normalizeStage(
  value
) {

  return (
    canonicalEvolutionValue(
      value
    ) ||
    "any"
  );
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
    numeric >
      0
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
      Number(
        value
      ) /
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

      Number.isFinite(
        value
      )
        ? value
        : 0
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


function average(
  values
) {

  if (!values.length) {
    return 0;
  }


  return values.reduce(
    (
      sum,
      value
    ) =>
      sum +
      Number(
        value
      ),
    0
  ) /
    values.length;
}


function incrementMap(
  map,
  key
) {

  map.set(
    key,

    (
      map.get(
        key
      ) ??
      0
    ) +
      1
  );
}


function asArray(
  value
) {

  return Array.isArray(
    value
  )
    ? value
    : [];
}