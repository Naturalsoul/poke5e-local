import {
  composeFakemonLevelLearnset
} from "./fakemon-learnset-composer.mjs";

import {
  evaluateFakemonMoveMechanics
} from "./fakemon-move-role-scorer.mjs";
import { normalizeId } from "./ids.mjs";

const PHYSICAL_POWER_ABILITIES =
  new Set([
    "str",
    "dex"
  ]);

const SPECIAL_POWER_ABILITIES =
  new Set([
    "int",
    "wis",
    "cha"
  ]);

const TYPE_PEER_LEVEL_WEIGHT =
  0.2;

const EXACT_TYPE_LEVEL_WEIGHT =
  0.35;

const SOURCE_LEVEL_SAMPLE_WEIGHT =
  0.25;

const SOURCE_INHERITANCE_INFLUENCE =
  Object.freeze({
    continuity:
      0.28,

    moderate:
      0.18,

    radical:
      0.08
  });

const PREFER_INHERITED_ABILITY_THRESHOLD =
  0.18;

const MIN_POWER_BAND_PEERS =
  4;

const MIN_EXACT_POWER_BAND_PEERS =
  2;

const TYPE_AFFINITY_SMOOTHING =
  1;

const MIN_ABILITY_TYPE_AFFINITY =
  0.20;


const ABILITY_SCORE_WEIGHTS =
  Object.freeze({
    comparable:
      0.52,

    typeAffinity:
      0.34,

    exactType:
      0.14
  });


const MOVE_SCORE_WEIGHTS =
  Object.freeze({
    comparable:
      0.34,

    type:
      0.15,

    exactType:
      0.08,

    stab:
      0.13,

    role:
      0.12,

    mechanics:
      0.18
  });


const MOVE_VISIBLE_TYPE_QUOTAS =
  Object.freeze({
    level:
      2,

    egg:
      1,

    tm:
      2
  });


const MOVE_SELECTED_TYPE_QUOTAS =
  Object.freeze({
    level:
      1,

    egg:
      0,

    tm:
      1
  });


const DEFAULT_LIMITS =
  Object.freeze({
    abilities:
      8,

    levelMoves:
      28,

    eggMoves:
      8,

    tms:
      12
  });


const DEFAULT_SELECTION_COUNTS =
  Object.freeze({
    eggMoves:
      4,

    tms:
      8
  });


export function buildFakemonCatalogRecommendations({
  database,
  balanceRecommendation,
  evolutionContext = null,
  limits = {}
}) {
  const intent =
    balanceRecommendation?.intent;


  if (!intent) {

    throw new Error(
      "La recomendación de balance no contiene un DesignIntent válido."
    );
  }


  const officialSpecies =
    officialSpeciesFromDatabase(
      database
    );


  const speciesById =
    new Map(
      officialSpecies.map(
        species => [
          normalizeId(
            species.id
          ),
          species
        ]
      )
    );


  const moveById =
    catalogById(
      database?.moves
    );


  const abilityById =
    catalogById(
      database?.abilities
    );

  const evolution =
    buildEvolutionRecommendationContext({
      evolutionContext,
      balanceRecommendation
    });

  const comparables =
    resolveComparables(
      balanceRecommendation
        ?.comparables,
      speciesById
    );


  if (!comparables.length) {

    throw new Error(
      "No hay Pokémon Poke5e comparables disponibles para recomendar Moves y Abilities."
    );
  }


  const typePeerContext =
    buildTypePeerContext({
      species:
        officialSpecies,

      targetTypes:
        intent.types,

      balanceRecommendation
    });


  const globalAbilityUsage =
    buildGlobalAbilityUsage(
      officialSpecies
    );


  const resolvedLimits = {
    abilities:
      positiveInteger(
        limits.abilities,
        DEFAULT_LIMITS.abilities
      ),

    levelMoves:
      positiveInteger(
        limits.levelMoves,
        DEFAULT_LIMITS.levelMoves
      ),

    eggMoves:
      positiveInteger(
        limits.eggMoves,
        DEFAULT_LIMITS.eggMoves
      ),

    tms:
      positiveInteger(
        limits.tms,
        DEFAULT_LIMITS.tms
      )
  };


  const abilities =
    recommendAbilities({
      comparables,
      typePeerContext,
      abilityById,
      globalAbilityUsage,
      evolution,

      limit:
        resolvedLimits.abilities
    });


  if (!abilities.length) {

    throw new Error(
      "No fue posible recomendar una Ability Poke5e para este perfil."
    );
  }


  const commonMoveArgs = {
    comparables,
    typePeerContext,
    moveById,
    intent,
    officialSpecies,
    evolution
  };

  const levelMoveRecommendations =
    recommendMoves({
      ...commonMoveArgs,

      kind:
        "level",

      minimumLevel:
        balanceRecommendation
          ?.recommendation
          ?.minimumLevel
          ?.value ??
        1,

      limit:
        resolvedLimits.levelMoves
    });

  return {
    methodology: {
      source:
        "poke5e-normalized",

      strategy:
        "type-separated-weighted-recommendations",

      note:
        "Stats y SR siguen derivándose de comparables. " +
        "Moves y Abilities usan evidencia separada por cada tipo, combinación exacta y rango de poder."
    },

    evidence: {
      comparableSpecies:
        comparables.length,

      typePeers:
        typePeerContext
          .targetTypes
          .map(
            type => {

              const selection =
                typePeerContext
                  .byType
                  .get(
                    type
                  );


              return {
                type,

                species:
                  selection
                    ?.species
                    ?.length ??
                  0,

                powerBandApplied:
                  selection
                    ?.powerBandApplied ===
                    true
              };
            }
          ),

      exactTypePeers: {
        species:
          typePeerContext
            .exact
            .species
            .length,

        powerBandApplied:
          typePeerContext
            .exact
            .powerBandApplied ===
            true
      }
    },

    evolutionContinuity:
      buildEvolutionContinuityOutput(
        evolution
      ),
    abilities,

    learnsetProfile:
      levelMoveRecommendations
        .profile,

    levelMoves:
      levelMoveRecommendations
        .entries,

    eggMoves:
      recommendMoves({
        ...commonMoveArgs,

        kind:
          "egg",

        minimumLevel:
          1,

        limit:
          resolvedLimits.eggMoves,

        selectedCount:
          DEFAULT_SELECTION_COUNTS
            .eggMoves
      }),

    tms:
      recommendMoves({
        ...commonMoveArgs,

        kind:
          "tm",

        minimumLevel:
          1,

        limit:
          resolvedLimits.tms,

        selectedCount:
          DEFAULT_SELECTION_COUNTS
            .tms
      })
  };
}


function recommendAbilities({
  comparables,
  typePeerContext,
  abilityById,
  globalAbilityUsage,
  evolution,
  limit
}) {
  const candidates =
    new Map();


  const comparableWeightTotal =
    comparables.reduce(
      (
        sum,
        entry
      ) =>
        sum +
        entry.weight,
      0
    );


  for (
    const comparable
    of comparables
  ) {

    collectSpeciesAbilities({
      species:
        comparable.species,

      candidates,
      abilityById,

      source:
        "comparable",

      weight:
        comparable.weight
    });
  }


  for (
    const type
    of typePeerContext.targetTypes
  ) {

    const selection =
      typePeerContext
        .byType
        .get(
          type
        );


    for (
      const species
      of selection?.species ??
      []
    ) {

      collectSpeciesAbilities({
        species,
        candidates,
        abilityById,

        source:
          "type",

        sourceType:
          type
      });
    }
  }


  for (
    const species
    of typePeerContext
      .exact
      .species
  ) {

    collectSpeciesAbilities({
      species,
      candidates,
      abilityById,

      source:
        "exact"
    });
  }

  if (
    evolution?.sourceSpecies
  ) {
    collectSpeciesAbilities({
      species:
        evolution.sourceSpecies,

      candidates,
      abilityById,

      source:
        "source"
    });
  }

  const scored = [
    ...candidates.values()
  ]
    .map(
      candidate => {

        const comparableScore =
          comparableWeightTotal
            ? candidate.comparableWeight /
              comparableWeightTotal
            : 0;


        const typeAffinities =
          typePeerContext
            .targetTypes
            .map(
              type =>
                buildAbilityTypeAffinity({
                  candidate,
                  type,
                  typePeerContext,
                  globalAbilityUsage
                })
            );


        const strongestTypeAffinity =
          typeAffinities.reduce(
            (
              maximum,
              entry
            ) =>
              Math.max(
                maximum,
                entry.score
              ),
            0
          );


        const exactTypeScore =
          prevalence(
            candidate.exactTypeCount,
            typePeerContext
              .exact
              .species
              .length
          );


        const hiddenRatio =
          abilityHiddenRatio(
            candidate
          );

        const baseScore =
          clamp01(
            comparableScore *
              ABILITY_SCORE_WEIGHTS
                .comparable +

            strongestTypeAffinity *
              ABILITY_SCORE_WEIGHTS
                .typeAffinity +

            Math.sqrt(
              exactTypeScore
            ) *
              ABILITY_SCORE_WEIGHTS
                .exactType
          );


        const score =
          applySourceInheritanceBoost({
            score:
              baseScore,

            inheritedFromSource:
              candidate.sourceInherited,

            evolution
          });


        const evolutionPattern =
          Boolean(
            evolution
          ) &&
          comparableScore >
            0;


        return {
          id:
            candidate.id,

          score:
            roundScore(
              score
            ),

          hidden:
            candidate.sourceInherited &&
            candidate.sourceHidden != null
              ? candidate.sourceHidden
              : hiddenRatio >=
                0.5,

          selected:
            false,

          inheritedFromSource:
            candidate.sourceInherited ===
            true,

          evolutionPattern,

          typeAffinities,

          reasons:
            abilityReasonCodes({
              comparableScore,
              strongestTypeAffinity,
              exactTypeScore,
              hiddenRatio,

              inheritedFromSource:
                candidate.sourceInherited,

              evolutionPattern
            }),

          evidence: {
            comparableWeight:
              roundScore(
                comparableScore
              ),

            exactTypePrevalence:
              roundScore(
                exactTypeScore
              ),

            hiddenRatio:
              roundScore(
                hiddenRatio
              ),

            evolution: {
              inheritedFromSource:
                candidate.sourceInherited ===
                true,

              observedRetention:
                evolutionChannelRetention(
                  evolution,
                  "abilities"
                ),

              targetPattern:
                evolutionPattern
            },

            referenceSpeciesIds: [
              ...candidate
                .referenceIds
            ]
          }
        };
      }
    )
    .filter(
      candidate =>
        candidate.score > 0
    )
    .sort(
      compareRecommendedEntries
    );


  return curateAbilityRecommendations({
    ranked:
      scored,

    targetTypes:
      typePeerContext
        .targetTypes,

    sourceAbilityIds:
      new Set(
        scored
          .filter(
            entry =>
              entry.inheritedFromSource
          )
          .map(
            entry =>
              entry.id
          )
      ),

    preferInherited:
      Number(
        evolution
          ?.sourceInfluence ??
        0
      ) >=
      PREFER_INHERITED_ABILITY_THRESHOLD,

    limit
  });
}

function collectSpeciesAbilities({
  species,
  candidates,
  abilityById,
  source,
  sourceType = null,
  weight = 1
}) {

  const seen =
    new Set();


  for (
    const reference
    of species?.abilities ??
    []
  ) {

    const abilityId =
      normalizeId(
        reference?.id
      );


    const ability =
      abilityById.get(
        abilityId
      );


    if (
      !abilityId ||
      seen.has(
        abilityId
      ) ||
      !ability ||
      ability.deprecated
    ) {
      continue;
    }


    seen.add(
      abilityId
    );


    const candidate =
      getOrCreateCandidate(
        candidates,
        abilityId
      );

    if (
      source ===
        "source"
    ) {

      candidate.sourceInherited =
        true;

      candidate.sourceHidden =
        reference?.hidden ===
        true;

      continue;
    }

    if (
      source ===
      "comparable"
    ) {

      candidate.comparableWeight +=
        weight;


      candidate.hiddenWeight +=
        reference?.hidden
          ? weight
          : 0;


      candidate.referenceIds.add(
        species.id
      );

      continue;
    }


    if (
      source ===
        "type" &&
      sourceType
    ) {

      incrementMap(
        candidate.typePeerCounts,
        sourceType
      );


      if (
        reference?.hidden
      ) {

        incrementMap(
          candidate.typePeerHiddenCounts,
          sourceType
        );
      }


      continue;
    }


    if (
      source ===
      "exact"
    ) {

      candidate.exactTypeCount +=
        1;


      if (
        reference?.hidden
      ) {

        candidate.exactTypeHiddenCount +=
          1;
      }
    }
  }
}

function recommendMoves({
  kind,
  comparables,
  typePeerContext,
  moveById,
  intent,
  minimumLevel,
  limit,
  selectedCount,
  officialSpecies,
  evolution
}) {
  const candidates =
    new Map();


  const comparableWeightTotal =
    comparables.reduce(
      (
        sum,
        entry
      ) =>
        sum +
        entry.weight,
      0
    );


  for (
    const comparable
    of comparables
  ) {

    collectSpeciesMoves({
      kind,

      species:
        comparable.species,

      weight:
        comparable.weight,

      candidates,
      moveById,

      source:
        "comparable"
    });
  }


  for (
    const type
    of typePeerContext.targetTypes
  ) {

    const selection =
      typePeerContext
        .byType
        .get(
          type
        );


    for (
      const species
      of selection?.species ??
      []
    ) {

      collectSpeciesMoves({
        kind,
        species,

        weight:
          1,

        candidates,
        moveById,

        source:
          "type",

        sourceType:
          type
      });
    }
  }


  for (
    const species
    of typePeerContext
      .exact
      .species
  ) {

    collectSpeciesMoves({
      kind,
      species,

      weight:
        1,

      candidates,
      moveById,

      source:
        "exact"
    });
  }

  if (
    evolution?.sourceSpecies
  ) {

    collectSpeciesMoves({
      kind,

      species:
        evolution.sourceSpecies,

      weight:
        SOURCE_LEVEL_SAMPLE_WEIGHT,

      candidates,
      moveById,

      source:
        "source"
    });
  }

  const ranked = [
    ...candidates.values()
  ]
    .map(
      candidate => {

        const move =
          moveById.get(
            candidate.id
          );


        const comparableScore =
          comparableWeightTotal
            ? candidate.comparableWeight /
              comparableWeightTotal
            : 0;


        const typePrevalenceByType =
          Object.fromEntries(
            typePeerContext
              .targetTypes
              .map(
                type => {

                  const peerCount =
                    typePeerContext
                      .byType
                      .get(
                        type
                      )
                      ?.species
                      ?.length ??
                    0;


                  return [
                    type,

                    prevalence(
                      candidate
                        .typePeerCounts
                        .get(
                          type
                        ) ??
                      0,

                      peerCount
                    )
                  ];
                }
              )
          );


        const moveType =
          normalizeId(
            move?.type
          );


        const targetType =
          intent.types.includes(
            moveType
          );


        const strongestPeerEvidence =
          Math.max(
            0,
            ...Object.values(
              typePrevalenceByType
            )
          );


        const relevantTypeEvidence =
          targetType
            ? typePrevalenceByType[
                moveType
              ] ??
              0
            : strongestPeerEvidence *
              0.65;


        const typeScore =
          Math.sqrt(
            relevantTypeEvidence
          );


        const exactTypeScore =
          prevalence(
            candidate.exactTypeCount,
            typePeerContext
              .exact
              .species
              .length
          );


        const stabScore =
          targetType
            ? 1
            : 0;


        const offenseFit =
          moveOffenseFit(
            move,
            intent.offenseMode
          );


        const utilityFit =
          moveUtilityFit(
            move
          );


        const roleFit =
          weightedRoleFit({
            offenseFit,
            utilityFit,
            intent
          });

        const mechanicalEvaluation =
          evaluateFakemonMoveMechanics({
            move,
            intent
          });

        const baseScore =
          clamp01(
            comparableScore *
              MOVE_SCORE_WEIGHTS
                .comparable +

            typeScore *
              MOVE_SCORE_WEIGHTS
                .type +

            Math.sqrt(
              exactTypeScore
            ) *
              MOVE_SCORE_WEIGHTS
                .exactType +

            stabScore *
              MOVE_SCORE_WEIGHTS
                .stab +

            roleFit *
              MOVE_SCORE_WEIGHTS
                .role +

            mechanicalEvaluation.score *
              MOVE_SCORE_WEIGHTS
                .mechanics
          );


        const score =
          applySourceInheritanceBoost({
            score:
              baseScore,

            inheritedFromSource:
              candidate.sourceInherited,

            evolution
          });


        const evolutionPattern =
          Boolean(
            evolution
          ) &&
          comparableScore >
            0;


        const newTypeIdentity =
          Boolean(
            evolution
          ) &&
          targetType &&
          !evolution.sourceTypes.includes(
            moveType
          );


        const base = {
          moveId:
            candidate.id,

          score:
            roundScore(
              score
            ),

          selected:
            false,

          inheritedFromSource:
            candidate.sourceInherited ===
            true,

          evolutionPattern,

          newTypeIdentity,

          mechanicalProfile:
            mechanicalEvaluation
              .profile,

          mechanicalFit:
            mechanicalEvaluation
              .score,

          mechanicalRole:
            mechanicalEvaluation
              .primaryRole,

          reasons:
            moveReasonCodes({
              kind,
              comparableScore,
              typeScore,
              exactTypeScore,
              stabScore,
              offenseFit,
              utilityFit,
              intent,
              inheritedFromSource:
                candidate.sourceInherited,
              evolutionPattern,
              newTypeIdentity
            }),

          evidence: {
            comparableWeight:
              roundScore(
                comparableScore
              ),

            typePrevalenceByType:
              Object.fromEntries(
                Object.entries(
                  typePrevalenceByType
                ).map(
                  ([
                    type,
                    value
                  ]) => [
                    type,
                    roundScore(
                      value
                    )
                  ]
                )
              ),

            exactTypePrevalence:
              roundScore(
                exactTypeScore
              ),

            mechanics: {
              fit:
                mechanicalEvaluation
                  .score,

              primaryRole:
                mechanicalEvaluation
                  .primaryRole,

              roleScores:
                mechanicalEvaluation
                  .roleScores
            },
            evolution: {
              inheritedFromSource:
                candidate.sourceInherited ===
                true,

              observedRetention:
                evolutionChannelRetention(
                  evolution,
                  continuityChannelForKind(
                    kind
                  )
                ),

              targetPattern:
                evolutionPattern,

              newTypeIdentity
            },
            referenceSpeciesIds: [
              ...candidate
                .referenceIds
            ]
          }
        };


        if (
          kind ===
          "level"
        ) {

          return {
            ...base,

            level:
              recommendedLevel(
                candidate.levelSamples,
                minimumLevel
              )
          };
        }


        if (
          kind ===
          "tm"
        ) {

          const tm =
            resolveTmMetadata(
              move,
              candidate.tmSamples
            );


          return tm
            ? {
                ...base,
                ...tm
              }
            : null;
        }


        return base;
      }
    )
    .filter(
      Boolean
    )
    .filter(
      candidate =>
        candidate.score > 0
    )
    .sort(
      compareRecommendedEntries
    );

  if (
    kind ===
    "level"
  ) {

    return composeFakemonLevelLearnset({
      ranked,
      moveById,
      comparables,
      officialSpecies,
      intent,
      minimumLevel,
      evolutionContinuity:
        buildLevelEvolutionContinuity(
          evolution
        ),
      visibleLimit:
        limit
    });
  }
    
  return curateMoveRecommendations({
    ranked,
    targetTypes:
      intent.types,
    moveById,
    kind,
    limit,
    selectedCount
  });
}

function collectSpeciesMoves({
  kind,
  species,
  weight,
  candidates,
  moveById,
  source,
  sourceType = null
}) {

  const observations =
    speciesMoveObservations(
      species,
      kind
    );


  const seen =
    new Set();


  for (
    const observation
    of observations
  ) {

    const moveId =
      normalizeId(
        observation.moveId
      );


    const move =
      moveById.get(
        moveId
      );


    if (
      !moveId ||
      seen.has(
        moveId
      ) ||
      !move ||
      move.deprecated
    ) {
      continue;
    }


    seen.add(
      moveId
    );


    const candidate =
      getOrCreateCandidate(
        candidates,
        moveId
      );

    if (
      source ===
        "source"
    ) {

      candidate.sourceInherited =
        true;

      collectMoveMetadata({
        candidate,
        observation,
        kind,
        weight
      });

      continue;
    }

    if (
      source ===
      "comparable"
    ) {

      candidate.comparableWeight +=
        weight;


      candidate.referenceIds.add(
        species.id
      );


      collectMoveMetadata({
        candidate,
        observation,
        kind,
        weight
      });

      continue;
    }


    if (
      source ===
        "type" &&
      sourceType
    ) {

      incrementMap(
        candidate.typePeerCounts,
        sourceType
      );


      collectMoveMetadata({
        candidate,
        observation,
        kind,

        weight:
          TYPE_PEER_LEVEL_WEIGHT
      });

      continue;
    }


    if (
      source ===
      "exact"
    ) {

      candidate.exactTypeCount +=
        1;


      collectMoveMetadata({
        candidate,
        observation,
        kind,

        weight:
          EXACT_TYPE_LEVEL_WEIGHT
      });
    }
  }
}


function collectMoveMetadata({
  candidate,
  observation,
  kind,
  weight
}) {

  if (
    kind ===
      "level" &&
    Number.isFinite(
      Number(
        observation.level
      )
    )
  ) {

    candidate.levelSamples.push({
      value:
        Number(
          observation.level
        ),

      weight
    });
  }


  if (
    kind ===
      "tm" &&
    observation.tm
  ) {

    candidate.tmSamples.push(
      observation.tm
    );
  }
}

function speciesMoveObservations(
  species,
  kind
) {

  if (
    kind ===
    "level"
  ) {

    return (
      species?.learnset?.level ??
      []
    ).flatMap(
      group =>
        (
          group?.moveIds ??
          []
        ).map(
          moveId => ({
            moveId,

            level:
              group?.level
          })
        )
    );
  }


  if (
    kind ===
    "egg"
  ) {

    return (
      species
        ?.learnset
        ?.eggMoveIds ??
      []
    ).map(
      moveId => ({
        moveId
      })
    );
  }


  if (
    kind ===
    "tm"
  ) {

    return (
      species?.learnset?.tms ??
      []
    ).map(
      tm => ({
        moveId:
          tm?.moveId,

        tm
      })
    );
  }


  return [];
}


function resolveComparables(
  summaries,
  speciesById
) {

  return (
    Array.isArray(
      summaries
    )
      ? summaries
      : []
  )
    .map(
      summary => {

        const species =
          speciesById.get(
            normalizeId(
              summary?.id
            )
          );


        if (!species) {
          return null;
        }


        return {
          species,

          weight:
            Math.max(
              0.05,
              clamp01(
                Number(
                  summary?.similarity
                )
              )
            )
        };
      }
    )
    .filter(
      Boolean
    );
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
  ).filter(
    species =>
      species?.id &&
      !customIds.has(
        normalizeId(
          species.id
        )
      )
  );
}


function buildTypePeerContext({
  species,
  targetTypes,
  balanceRecommendation
}) {

  const normalizedTypes = [
    ...new Set(
      (
        targetTypes ??
        []
      )
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    )
  ];


  const byType =
    new Map();


  for (
    const type
    of normalizedTypes
  ) {

    const matching =
      species.filter(
        entry =>
          speciesHasType(
            entry,
            type
          )
      );


    byType.set(
      type,
      selectPeerPool({
        species:
          matching,

        balanceRecommendation,

        minimumPowerBandPeers:
          MIN_POWER_BAND_PEERS
      })
    );
  }


  const exactMatching =
    species.filter(
      entry =>
        hasExactTypeSet(
          entry,
          normalizedTypes
        )
    );


  const exact =
    selectPeerPool({
      species:
        exactMatching,

      balanceRecommendation,

      minimumPowerBandPeers:
        MIN_EXACT_POWER_BAND_PEERS
    });


  return {
    targetTypes:
      normalizedTypes,

    byType,
    exact
  };
}


function selectPeerPool({
  species,
  balanceRecommendation,
  minimumPowerBandPeers
}) {

  const srRange =
    balanceRecommendation
      ?.recommendation
      ?.sr;


  const levelRange =
    balanceRecommendation
      ?.recommendation
      ?.minimumLevel;


  if (
    !srRange ||
    !levelRange
  ) {

    return {
      species,
      powerBandApplied:
        false
    };
  }


  const powerBand =
    species.filter(
      entry =>
        withinRecommendationRange(
          entry?.sr,
          srRange
        ) &&
        withinRecommendationRange(
          entry?.minimumLevel,
          levelRange
        )
    );


  if (
    powerBand.length >=
    minimumPowerBandPeers
  ) {

    return {
      species:
        powerBand,

      powerBandApplied:
        true
    };
  }


  return {
    species,
    powerBandApplied:
      false
  };
}


function speciesHasType(
  species,
  type
) {

  return (
    species?.types ??
    []
  )
    .map(
      normalizeId
    )
    .includes(
      type
    );
}


function hasExactTypeSet(
  species,
  targetTypes
) {

  const speciesTypes = [
    ...new Set(
      (
        species?.types ??
        []
      )
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    )
  ];


  if (
    speciesTypes.length !==
    targetTypes.length
  ) {
    return false;
  }


  return targetTypes.every(
    type =>
      speciesTypes.includes(
        type
      )
  );
}

function withinRecommendationRange(
  value,
  range
) {

  const numeric =
    Number(
      value
    );


  const minimum =
    Number(
      range?.min
    );


  const maximum =
    Number(
      range?.max
    );


  return (
    Number.isFinite(
      numeric
    ) &&
    Number.isFinite(
      minimum
    ) &&
    Number.isFinite(
      maximum
    ) &&
    numeric >= minimum &&
    numeric <= maximum
  );
}


function getOrCreateCandidate(
  candidates,
  id
) {

  if (
    !candidates.has(
      id
    )
  ) {

    candidates.set(
      id,
      {
        id,

        comparableWeight:
          0,

        hiddenWeight:
          0,

        typePeerCounts:
          new Map(),

        typePeerHiddenCounts:
          new Map(),

        exactTypeCount:
          0,

        exactTypeHiddenCount:
          0,

        levelSamples:
          [],

        tmSamples:
          [],

        sourceInherited:
          false,

        sourceHidden:
          null,

        referenceIds:
          new Set()
      }
    );
  }


  return candidates.get(
    id
  );
}

function markDefaultAbilities(
  entries,
  targetTypes,
  {
    preferInherited = false
  } = {}
) {

  entries.forEach(
    entry => {

      entry.selected =
        false;
    }
  );


  if (!entries.length) {
    return;
  }


  const selectedIds =
    new Set();


  const selectEntry =
    entry => {

      if (
        !entry ||
        selectedIds.has(
          entry.id
        ) ||
        selectedIds.size >=
          2
      ) {
        return false;
      }


      entry.selected =
        true;

      selectedIds.add(
        entry.id
      );

      return true;
    };


  if (preferInherited) {

    selectEntry(
      entries.find(
        entry =>
          entry.inheritedFromSource &&
          !entry.hidden
      )
    );
  }


  const primaryType =
    targetTypes[0];


  selectEntry(
    bestAbilityForType({
      entries:
        entries.filter(
          entry =>
            !entry.hidden &&
            !selectedIds.has(
              entry.id
            )
        ),

      type:
        primaryType
    }) ??
    entries.find(
      entry =>
        !entry.hidden &&
        !selectedIds.has(
          entry.id
        )
    )
  );


  const secondaryType =
    targetTypes[1];


  if (
    secondaryType &&
    selectedIds.size <
      2
  ) {

    selectEntry(
      bestAbilityForType({
        entries:
          entries.filter(
            entry =>
              !selectedIds.has(
                entry.id
              )
          ),

        type:
          secondaryType
      })
    );
  }


  if (
    preferInherited &&
    selectedIds.size <
      2
  ) {

    selectEntry(
      entries.find(
        entry =>
          entry.inheritedFromSource &&
          !selectedIds.has(
            entry.id
          )
      )
    );
  }


  if (
    selectedIds.size <
      2
  ) {

    selectEntry(
      entries.find(
        entry =>
          entry.hidden &&
          !selectedIds.has(
            entry.id
          )
      )
    );
  }


  if (
    selectedIds.size <
      2
  ) {

    selectEntry(
      entries.find(
        entry =>
          !selectedIds.has(
            entry.id
          )
      )
    );
  }
}

function buildGlobalAbilityUsage(
  species
) {

  const counts =
    new Map();


  for (
    const entry
    of species
  ) {

    const seen =
      new Set();


    for (
      const reference
      of entry?.abilities ??
      []
    ) {

      const abilityId =
        normalizeId(
          reference?.id
        );


      if (
        !abilityId ||
        seen.has(
          abilityId
        )
      ) {
        continue;
      }


      seen.add(
        abilityId
      );


      counts.set(
        abilityId,
        (
          counts.get(
            abilityId
          ) ??
          0
        ) +
        1
      );
    }
  }


  return {
    totalSpecies:
      species.length,

    counts
  };
}


function buildAbilityTypeAffinity({
  candidate,
  type,
  typePeerContext,
  globalAbilityUsage
}) {

  const peerCount =
    typePeerContext
      .byType
      .get(
        type
      )
      ?.species
      ?.length ??
    0;


  const observed =
    candidate
      .typePeerCounts
      .get(
        type
      ) ??
    0;


  const globalObserved =
    globalAbilityUsage
      .counts
      .get(
        candidate.id
      ) ??
    0;


  const rawPrevalence =
    prevalence(
      observed,
      peerCount
    );


  const globalPrevalence =
    prevalence(
      globalObserved,
      globalAbilityUsage
        .totalSpecies
    );


  if (
    !observed ||
    !peerCount
  ) {

    return {
      type,
      score:
        0,

      prevalence:
        0,

      globalPrevalence:
        roundScore(
          globalPrevalence
        ),

      lift:
        0
    };
  }


  const typeSmoothed =
    smoothedPrevalence(
      observed,
      peerCount
    );


  const globalSmoothed =
    smoothedPrevalence(
      globalObserved,
      globalAbilityUsage
        .totalSpecies
    );


  const lift =
    globalSmoothed
      ? typeSmoothed /
        globalSmoothed
      : 0;


  const specificity =
    clamp01(
      Math.log2(
        Math.max(
          1,
          lift
        )
      ) /
      2
    );


  const score =
    clamp01(
      Math.sqrt(
        rawPrevalence
      ) *
        0.65 +

      specificity *
        0.35
    );


  return {
    type,

    score:
      roundScore(
        score
      ),

    prevalence:
      roundScore(
        rawPrevalence
      ),

    globalPrevalence:
      roundScore(
        globalPrevalence
      ),

    lift:
      roundScore(
        lift
      )
  };
}


function abilityHiddenRatio(
  candidate
) {

  const typeObserved =
    sumMapValues(
      candidate
        .typePeerCounts
    );


  const typeHidden =
    sumMapValues(
      candidate
        .typePeerHiddenCounts
    );


  const numerator =
    candidate.hiddenWeight +
    typeHidden *
      0.25 +
    candidate.exactTypeHiddenCount *
      0.35;


  const denominator =
    candidate.comparableWeight +
    typeObserved *
      0.25 +
    candidate.exactTypeCount *
      0.35;


  return denominator
    ? numerator /
      denominator
    : 0;
}


function curateAbilityRecommendations({
  ranked,
  targetTypes,
  sourceAbilityIds = new Set(),
  preferInherited = false,
  limit
}) {

  const requiredIds =
    new Set(
      sourceAbilityIds
    );


  for (
    const type
    of targetTypes
  ) {

    const best =
      bestAbilityForType({
        entries:
          ranked,

        type
      });


    if (best) {

      requiredIds.add(
        best.id
      );
    }
  }


  const visible =
    selectRequiredThenFill({
      ranked,
      requiredIds,
      limit,

      idGetter:
        entry =>
          entry.id
    });


  markDefaultAbilities(
    visible,
    targetTypes,
    {
      preferInherited
    }
  );

  return visible;
}


function bestAbilityForType({
  entries,
  type
}) {

  if (!type) {
    return null;
  }


  return entries
    .map(
      entry => ({
        entry,

        affinity:
          abilityAffinityForType(
            entry,
            type
          )
      })
    )
    .filter(
      candidate =>
        candidate.affinity >=
        MIN_ABILITY_TYPE_AFFINITY
    )
    .sort(
      (
        left,
        right
      ) =>
        right.affinity -
          left.affinity ||
        right.entry.score -
          left.entry.score
    )
    ?.[0]
    ?.entry ??
    null;
}


function abilityAffinityForType(
  entry,
  type
) {

  return (
    entry
      ?.typeAffinities
      ?.find(
        affinity =>
          affinity.type ===
          type
      )
      ?.score ??
    0
  );
}


function curateMoveRecommendations({
  ranked,
  targetTypes,
  moveById,
  kind,
  limit,
  selectedCount,
  evolution
}) {

  const visibleQuota =
    MOVE_VISIBLE_TYPE_QUOTAS[
      kind
    ] ??
    1;


  const selectedQuota =
    MOVE_SELECTED_TYPE_QUOTAS[
      kind
    ] ??
    0;


  const requiredVisibleIds =
    collectMoveTypeRequirements({
      entries:
        ranked,

      targetTypes,
      moveById,

      countPerType:
        visibleQuota
    });

  if (evolution) {

    const inherited =
      ranked.find(
        entry =>
          entry.inheritedFromSource
      );


    if (inherited) {

      requiredVisibleIds.add(
        inherited.moveId
      );
    }
  }

  const visible =
    selectRequiredThenFill({
      ranked,

      requiredIds:
        requiredVisibleIds,

      limit,

      idGetter:
        entry =>
          entry.moveId
    });


  const selectedIds =
    new Set(
      visible
        .slice(
          0,
          selectedCount
        )
        .map(
          entry =>
            entry.moveId
        )
    );


  const requiredSelectedIds =
    collectMoveTypeRequirements({
      entries:
        visible,

      targetTypes,
      moveById,

      countPerType:
        selectedQuota
    });


  for (
    const moveId
    of requiredSelectedIds
  ) {

    selectedIds.add(
      moveId
    );
  }


  trimSelectedMoves({
    entries:
      visible,

    selectedIds,

    protectedIds:
      requiredSelectedIds,

    maximum:
      selectedCount
  });


  return visible.map(
    entry => ({
      ...entry,

      selected:
        selectedIds.has(
          entry.moveId
        )
    })
  );
}


function collectMoveTypeRequirements({
  entries,
  targetTypes,
  moveById,
  countPerType
}) {

  const required =
    new Set();


  if (
    countPerType <=
    0
  ) {
    return required;
  }


  for (
    const type
    of targetTypes
  ) {

    const matching =
      entries.filter(
        entry =>
          normalizeId(
            moveById
              .get(
                entry.moveId
              )
              ?.type
          ) ===
          type
      );


    matching
      .slice(
        0,
        countPerType
      )
      .forEach(
        entry => {

          required.add(
            entry.moveId
          );
        }
      );
  }


  return required;
}


function trimSelectedMoves({
  entries,
  selectedIds,
  protectedIds,
  maximum
}) {

  if (
    selectedIds.size <=
    maximum
  ) {
    return;
  }


  for (
    let index =
      entries.length -
      1;

    index >= 0 &&
    selectedIds.size >
      maximum;

    index -= 1
  ) {

    const moveId =
      entries[
        index
      ].moveId;


    if (
      !selectedIds.has(
        moveId
      ) ||
      protectedIds.has(
        moveId
      )
    ) {
      continue;
    }


    selectedIds.delete(
      moveId
    );
  }
}


function selectRequiredThenFill({
  ranked,
  requiredIds,
  limit,
  idGetter
}) {

  const byId =
    new Map(
      ranked.map(
        entry => [
          idGetter(
            entry
          ),
          entry
        ]
      )
    );


  const selectedIds =
    new Set();

  const selectedEntries =
    [];


  for (
    const requiredId
    of requiredIds
  ) {

    if (
      selectedEntries.length >=
      limit
    ) {
      break;
    }


    const entry =
      byId.get(
        requiredId
      );


    if (
      !entry ||
      selectedIds.has(
        requiredId
      )
    ) {
      continue;
    }


    selectedIds.add(
      requiredId
    );

    selectedEntries.push(
      entry
    );
  }


  for (
    const entry
    of ranked
  ) {

    if (
      selectedEntries.length >=
      limit
    ) {
      break;
    }


    const id =
      idGetter(
        entry
      );


    if (
      selectedIds.has(
        id
      )
    ) {
      continue;
    }


    selectedIds.add(
      id
    );

    selectedEntries.push(
      entry
    );
  }


  return selectedEntries.sort(
    compareRecommendedEntries
  );
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


function sumMapValues(
  map
) {

  return [
    ...map.values()
  ].reduce(
    (
      sum,
      value
    ) =>
      sum +
      value,
    0
  );
}


function prevalence(
  observed,
  population
) {

  if (
    !population
  ) {
    return 0;
  }


  return observed /
    population;
}


function smoothedPrevalence(
  observed,
  population
) {

  return (
    observed +
    TYPE_AFFINITY_SMOOTHING
  ) /
    (
      population +
      TYPE_AFFINITY_SMOOTHING *
        2
    );
}

function moveOffenseFit(
  move,
  offenseMode
) {

  const powerAbilities =
    normalizedPowerAbilities(
      move?.powerAbilities
    );


  if (!powerAbilities.length) {

    return move?.damage
      ? 0.55
      : 0.35;
  }


  if (
    offenseMode ===
    "physical"
  ) {

    return powerAbilities.some(
      id =>
        PHYSICAL_POWER_ABILITIES
          .has(
            id
          )
    )
      ? 1
      : 0.15;
  }


  if (
    offenseMode ===
    "special"
  ) {

    return powerAbilities.some(
      id =>
        SPECIAL_POWER_ABILITIES
          .has(
            id
          )
    )
      ? 1
      : 0.15;
  }


  return powerAbilities.some(
    id =>
      PHYSICAL_POWER_ABILITIES
        .has(
          id
        ) ||
      SPECIAL_POWER_ABILITIES
        .has(
          id
        )
  )
    ? 0.9
    : 0.5;
}


function moveUtilityFit(
  move
) {

  if (!move?.damage) {
    return 1;
  }


  if (
    move?.save &&
    !move?.attack
  ) {
    return 0.55;
  }


  return 0.15;
}


function weightedRoleFit({
  offenseFit,
  utilityFit,
  intent
}) {

  const offenseWeight =
    Math.max(
      0.05,
      Number(
        intent.dimensions
          ?.offense ??
        0
      )
    );


  const controlWeight =
    Math.max(
      0.05,
      Number(
        intent.dimensions
          ?.control ??
        0
      )
    );


  return (
    offenseFit *
      offenseWeight +
    utilityFit *
      controlWeight
  ) /
    (
      offenseWeight +
      controlWeight
    );
}


function recommendedLevel(
  samples,
  minimumLevel
) {

  const floor =
    clamp(
      Math.round(
        Number(
          minimumLevel
        ) ||
        1
      ),
      1,
      20
    );


  const valid =
    samples.filter(
      sample =>
        Number.isFinite(
          sample.value
        ) &&
        Number.isFinite(
          sample.weight
        ) &&
        sample.weight > 0
    );


  if (!valid.length) {
    return floor;
  }


  const totalWeight =
    valid.reduce(
      (
        sum,
        sample
      ) =>
        sum +
        sample.weight,
      0
    );


  const weighted =
    valid.reduce(
      (
        sum,
        sample
      ) =>
        sum +
        sample.value *
          sample.weight,
      0
    ) /
      totalWeight;


  return clamp(
    Math.round(
      Math.max(
        floor,
        weighted
      )
    ),
    1,
    20
  );
}


function resolveTmMetadata(
  move,
  samples
) {

  const directId =
    Number(
      move?.tm?.id
    );


  if (
    Number.isInteger(
      directId
    ) &&
    directId >= 0
  ) {

    const cost =
      Number(
        move.tm?.cost
      );


    return {
      id:
        directId,

      cost:
        Number.isFinite(
          cost
        ) &&
        cost >= 0
          ? cost
          : 0,

      source:
        "moves.json"
    };
  }


  const sample =
    samples.find(
      tm =>
        Number.isInteger(
          Number(
            tm?.id
          )
        )
    );


  if (!sample) {
    return null;
  }


  return {
    id:
      Number(
        sample.id
      ),

    cost:
      Math.max(
        0,
        Number(
          sample.cost
        ) ||
        0
      ),

    source:
      String(
        sample.source ??
        "moves.json"
      )
  };
}

function abilityReasonCodes({
  comparableScore,
  strongestTypeAffinity,
  exactTypeScore,
  hiddenRatio,
  inheritedFromSource,
  evolutionPattern
}) {

  const reasons =
    [];


  if (
    comparableScore > 0
  ) {

    reasons.push(
      "comparable-frequency"
    );
  }


  if (
    strongestTypeAffinity >=
    MIN_ABILITY_TYPE_AFFINITY
  ) {

    reasons.push(
      "type-affinity"
    );
  }


  if (
    exactTypeScore > 0
  ) {

    reasons.push(
      "exact-type-frequency"
    );
  }


  if (
    hiddenRatio >=
    0.5
  ) {

    reasons.push(
      "hidden-pattern"
    );
  }

    if (inheritedFromSource) {

    reasons.push(
      "source-inheritance"
    );
  }


  if (evolutionPattern) {

    reasons.push(
      "evolution-pattern"
    );
  }

  return reasons;
}

function moveReasonCodes({
  kind,
  comparableScore,
  typeScore,
  exactTypeScore,
  stabScore,
  offenseFit,
  utilityFit,
  intent,
  inheritedFromSource,
  evolutionPattern,
  newTypeIdentity
}) {

  const reasons =
    [];


  if (
    comparableScore > 0
  ) {

    reasons.push(
      "comparable-frequency"
    );
  }


  if (
    typeScore > 0
  ) {

    reasons.push(
      "type-frequency"
    );
  }


  if (
    exactTypeScore > 0
  ) {

    reasons.push(
      "exact-type-frequency"
    );
  }


  if (
    stabScore > 0
  ) {

    reasons.push(
      "stab"
    );
  }


  if (
    offenseFit >=
    0.8
  ) {

    reasons.push(
      `${intent.offenseMode}-fit`
    );
  }


  if (
    intent.dimensions
      .control >=
      0.65 &&
    utilityFit >=
      0.8
  ) {

    reasons.push(
      "utility-fit"
    );
  }

  if (inheritedFromSource) {

    reasons.push(
      "source-inheritance"
    );
  }


  if (evolutionPattern) {

    reasons.push(
      "evolution-pattern"
    );
  }


  if (newTypeIdentity) {

    reasons.push(
      "new-type-identity"
    );
  }

  reasons.push(
    `observed-${kind}`
  );


  return reasons;
}

function normalizedPowerAbilities(
  value
) {

  if (
    Array.isArray(
      value
    )
  ) {

    return value
      .map(
        normalizeId
      )
      .filter(
        id =>
          id &&
          id !==
            "none"
      );
  }


  const normalized =
    normalizeId(
      value
    );


  return (
    normalized &&
    normalized !==
      "none"
  )
    ? [
        normalized
      ]
    : [];
}

function buildEvolutionRecommendationContext({
  evolutionContext,
  balanceRecommendation
}) {

  const sourceSpecies =
    evolutionContext
      ?.sourceSpecies;


  if (!sourceSpecies?.id) {
    return null;
  }


  const mutationDegree =
    normalizeMutationDegree(
      evolutionContext
        ?.mutationDegree ??
      balanceRecommendation
        ?.evolutionProfile
        ?.mutationDegree
    );


  return {
    sourceSpecies,

    sourceSpeciesId:
      normalizeId(
        sourceSpecies.id
      ),

    sourceName:
      speciesName(
        sourceSpecies
      ),

    sourceTypes: [
      ...new Set(
        (
          sourceSpecies.types ??
          []
        )
          .map(
            normalizeId
          )
          .filter(
            Boolean
          )
      )
    ],

    mutationDegree,

    sourceInfluence:
      SOURCE_INHERITANCE_INFLUENCE[
        mutationDegree
      ],

    continuityProfile:
      evolutionContext
        ?.continuityProfile ??
      balanceRecommendation
        ?.evolutionProfile
        ?.catalogContinuity ??
      null
  };
}


function buildEvolutionContinuityOutput(
  evolution
) {

  if (!evolution) {
    return null;
  }


  return {
    sourceSpeciesId:
      evolution.sourceSpeciesId,

    sourceName:
      evolution.sourceName,

    sourceTypes: [
      ...evolution.sourceTypes
    ],

    mutationDegree:
      evolution.mutationDegree,

    sourceInfluence:
      evolution.sourceInfluence,

    sourceCounts:
      sourceCatalogCounts(
        evolution.sourceSpecies
      ),

    observed:
      evolution.continuityProfile
  };
}


function buildLevelEvolutionContinuity(
  evolution
) {

  if (!evolution) {
    return null;
  }


  return {
    mutationDegree:
      evolution.mutationDegree,

    observedRetention:
      evolutionChannelRetention(
        evolution,
        "levelMoves"
      )
  };
}


function sourceCatalogCounts(
  species
) {

  return {
    abilities:
      new Set(
        (
          species?.abilities ??
          []
        )
          .map(
            entry =>
              normalizeId(
                entry?.id
              )
          )
          .filter(
            Boolean
          )
      ).size,

    levelMoves:
      new Set(
        (
          species
            ?.learnset
            ?.level ??
          []
        )
          .flatMap(
            group =>
              group?.moveIds ??
              []
          )
          .map(
            normalizeId
          )
          .filter(
            Boolean
          )
      ).size,

    eggMoves:
      new Set(
        (
          species
            ?.learnset
            ?.eggMoveIds ??
          []
        )
          .map(
            normalizeId
          )
          .filter(
            Boolean
          )
      ).size,

    tms:
      new Set(
        (
          species
            ?.learnset
            ?.tms ??
          []
        )
          .map(
            entry =>
              normalizeId(
                entry?.moveId
              )
          )
          .filter(
            Boolean
          )
      ).size
  };
}


function applySourceInheritanceBoost({
  score,
  inheritedFromSource,
  evolution
}) {

  const base =
    clamp01(
      Number(
        score
      )
    );


  if (
    !inheritedFromSource ||
    !evolution
  ) {
    return base;
  }


  const influence =
    clamp01(
      Number(
        evolution.sourceInfluence
      )
    );


  return clamp01(
    base +
    (
      1 -
      base
    ) *
    influence
  );
}


function evolutionChannelRetention(
  evolution,
  channel
) {

  const retention =
    evolution
      ?.continuityProfile
      ?.channels
      ?.[channel]
      ?.retention;


  return Number.isFinite(
    Number(
      retention
    )
  )
    ? Number(
        retention
      )
    : null;
}


function continuityChannelForKind(
  kind
) {

  return {
    level:
      "levelMoves",

    egg:
      "eggMoves",

    tm:
      "tms"
  }[
    kind
  ] ??
    kind;
}


function normalizeMutationDegree(
  value
) {

  const normalized =
    normalizeId(
      value
    );


  return Object.hasOwn(
    SOURCE_INHERITANCE_INFLUENCE,
    normalized
  )
    ? normalized
    : "moderate";
}


function speciesName(
  species
) {

  const name =
    species?.name;


  if (
    name &&
    typeof name ===
      "object" &&
    !Array.isArray(
      name
    )
  ) {

    return String(
      name.es ??
      name.en ??
      species?.id ??
      ""
    );
  }


  return String(
    name ??
    species?.id ??
    ""
  );
}

function catalogById(
  entries
) {

  return new Map(
    (
      Array.isArray(
        entries
      )
        ? entries
        : []
    )
      .filter(
        entry =>
          entry?.id
      )
      .map(
        entry => [
          normalizeId(
            entry.id
          ),
          entry
        ]
      )
  );
}


function compareRecommendedEntries(
  left,
  right
) {

  if (
    right.score !==
    left.score
  ) {

    return (
      right.score -
      left.score
    );
  }


  return String(
    left.id ??
    left.moveId ??
    ""
  ).localeCompare(
    String(
      right.id ??
      right.moveId ??
      ""
    )
  );
}


function positiveInteger(
  value,
  fallback
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
    : fallback;
}


function roundScore(
  value
) {

  return (
    Math.round(
      value *
      100
    ) /
    100
  );
}


function clamp01(
  value
) {

  return clamp(
    Number.isFinite(
      value
    )
      ? value
      : 0,
    0,
    1
  );
}


function clamp(
  value,
  minimum,
  maximum
) {

  return Math.min(
    maximum,
    Math.max(
      minimum,
      value
    )
  );
}