const POKE5E_UNLOCK_LEVELS =
  Object.freeze([
    2,
    6,
    10,
    14,
    18
  ]);

const MIN_COMPARABLE_SAMPLES =
  4;

const SCORE_WEIGHTS =
  Object.freeze({
    base:
      0.58,

    levelFit:
      0.24,

    missingType:
      0.18,

    requiredType:
      0.30,

    utilityNeed:
      0.14,

    coverageNeed:
      0.08,

    redundancy:
      0.12,

    inheritanceNeed:
      0.16,
  });

const INHERITANCE_TARGET_FACTORS =
  Object.freeze({
    continuity:
      1,

    moderate:
      0.70,

    radical:
      0.35
  });

export function composeFakemonLevelLearnset({
  ranked,
  moveById,
  comparables,
  officialSpecies,
  intent,
  minimumLevel,
  evolutionContinuity = null,
  visibleLimit
}) {
  const minLevel =
    normalizeLevel(
      minimumLevel,
      1
    );


  const candidates =
    (
      ranked ??
      []
    ).map(
      entry => ({
        ...entry,

        observedLevel:
          normalizeLevel(
            entry.level,
            minLevel
          )
      })
    );


  const capacity =
    Math.min(
      positiveInteger(
        visibleLimit,
        candidates.length
      ),
      candidates.length
    );


  const schedule =
    fitScheduleToCapacity(
      buildSchedule({
        comparables,
        officialSpecies,
        minimumLevel:
          minLevel
      }),
      capacity
    );


  const targetCount =
    schedule.reduce(
      (
        sum,
        slot
      ) =>
        sum +
        slot.targetCount,
      0
    );


  const requiredTypeIds =
    bestMoveIdPerType(
      candidates,
      moveById,
      intent?.types ??
      []
    );


  const desiredUtilityCount =
    targetUtilityCount(
      targetCount,
      intent
    );


  const desiredCoverageCount =
    targetCount >=
      6
      ? 1
      : 0;

  const desiredInheritedCount =
    targetInheritedCount({
      targetCount,
      candidates,
      evolutionContinuity
    });

  const assignments =
    composeAssignments({
      candidates,
      schedule,
      moveById,
      intent,
      requiredTypeIds,
      desiredUtilityCount,
      desiredCoverageCount,
      desiredInheritedCount
    });


  const assignmentById =
    new Map(
      assignments.map(
        entry => [
          entry.moveId,
          entry
        ]
      )
    );


  const visibleIds =
    new Set(
      assignmentById.keys()
    );

  const inheritedCandidate =
    candidates.find(
      candidate =>
        candidate.inheritedFromSource
    );


  if (
    inheritedCandidate &&
    visibleIds.size <
      capacity
  ) {

    visibleIds.add(
      inheritedCandidate.moveId
    );
  }

  for (
    const candidate
    of candidates
  ) {

    if (
      visibleIds.size >=
      capacity
    ) {
      break;
    }


    visibleIds.add(
      candidate.moveId
    );
  }


  const entries =
    candidates
      .filter(
        candidate =>
          visibleIds.has(
            candidate.moveId
          )
      )
      .map(
        candidate =>
          applyAssignment({
            candidate,

            assignment:
              assignmentById.get(
                candidate.moveId
              ),

            schedule,
            moveById,
            intent,

            fallbackLevel:
              minLevel
          })
      );


  const selectedByLevel =
    countAssignmentsByLevel(
      assignments
    );


  return {
    entries,

    profile: {
      source:
        "poke5e-observed-learnset-shape",

      minimumLevel:
        minLevel,

      targetMoveCount:
        targetCount,

      selectedMoveCount:
        assignments.length,

      availableCandidates:
        candidates.length,

      desiredUtilityCount,

      desiredCoverageCount,
      desiredInheritedCount,

      selectedInheritedCount:
        assignments.filter(
          entry =>
            entry.inheritedFromSource
        ).length,
      mechanicalRoleCounts:
        Object.fromEntries(
          countAssignmentsByRole(
            assignments
          )
        ),

      levels:
        schedule.map(
          slot => ({
            ...slot,

            selectedCount:
              selectedByLevel.get(
                slot.level
              ) ??
              0
          })
        )
    }
  };
}


function buildSchedule({
  comparables,
  officialSpecies,
  minimumLevel
}) {

  const levels = [
    minimumLevel,

    ...POKE5E_UNLOCK_LEVELS
      .filter(
        level =>
          level >
          minimumLevel
      )
  ];


  return levels.map(
    (
      level,
      index
    ) => {

      const starting =
        index ===
        0;


      const comparableSamples =
        shapeSamples(
          comparables,
          level,
          starting
        );


      const globalReferences =
        (
          officialSpecies ??
          []
        ).map(
          species => ({
            species,

            weight:
              1
          })
        );


      const globalSamples =
        shapeSamples(
          globalReferences,
          level,
          starting
        );


      const useComparables =
        comparableSamples.length >=
        MIN_COMPARABLE_SAMPLES;


      const samples =
        useComparables
          ? comparableSamples
          : globalSamples;


      const averageObservedCount =
        weightedMean(
          samples
        );


      const targetCount =
        samples.length
          ? Math.max(
              starting
                ? 1
                : 0,

              Math.round(
                averageObservedCount
              )
            )
          : starting
            ? 1
            : 0;


      return {
        level,

        stage:
          stageForIndex(
            index,
            levels.length
          ),

        targetCount,

        sampleSource:
          useComparables
            ? "comparables"
            : "global",

        sampleSize:
          samples.length,

        averageObservedCount:
          roundToStep(
            averageObservedCount,
            0.1
          )
      };
    }
  );
}


function shapeSamples(
  references,
  level,
  starting
) {

  return (
    references ??
    []
  )
    .map(
      reference => {

        const species =
          reference?.species;


        if (!species) {
          return null;
        }


        const value =
          moveCountForSlot(
            species,
            level,
            starting
          );


        if (
          value == null
        ) {
          return null;
        }


        return {
          value,

          weight:
            Math.max(
              0.05,
              Number(
                reference.weight
              ) ||
              1
            )
        };
      }
    )
    .filter(
      Boolean
    );
}


function moveCountForSlot(
  species,
  level,
  starting
) {

  const speciesMinimum =
    normalizeLevel(
      species?.minimumLevel,
      1
    );


  if (
    !starting &&
    level <=
      speciesMinimum
  ) {
    return null;
  }


  const targetLevel =
    starting
      ? speciesMinimum
      : level;


  return (
    species
      ?.learnset
      ?.level ??
    []
  ).reduce(
    (
      total,
      group
    ) => {

      if (
        Number(
          group?.level
        ) !==
        targetLevel
      ) {
        return total;
      }


      return total +
        (
          Array.isArray(
            group?.moveIds
          )
            ? group.moveIds.length
            : 0
        );
    },
    0
  );
}


function fitScheduleToCapacity(
  schedule,
  capacity
) {

  const result =
    schedule.map(
      slot => ({
        ...slot
      })
    );


  let total =
    result.reduce(
      (
        sum,
        slot
      ) =>
        sum +
        slot.targetCount,
      0
    );


  while (
    total >
    capacity
  ) {

    const reducible =
      [
        ...result
      ]
        .reverse()
        .find(
          slot => {

            const minimum =
              slot ===
                result[0]
                ? 1
                : 0;


            return (
              slot.targetCount >
              minimum
            );
          }
        );


    if (!reducible) {
      break;
    }


    reducible.targetCount -=
      1;

    total -=
      1;
  }


  return result;
}


function composeAssignments({
  candidates,
  schedule,
  moveById,
  intent,
  requiredTypeIds,
  desiredUtilityCount,
  desiredCoverageCount,
  desiredInheritedCount
}) {

  const state = {
    selectedIds:
      new Set(),

    signatureCounts:
      new Map(),

    typeCounts:
      new Map(),

    roleCounts:
      new Map(),

    inheritedCount:
      0
  };


  const assignments =
    [];


  for (
    const slot
    of schedule
  ) {

    for (
      let index =
        0;

      index <
        slot.targetCount;

      index +=
        1
    ) {

      const candidate =
        bestCandidateForSlot({
          candidates,
          moveById,
          intent,
          slot,
          requiredTypeIds,
          desiredUtilityCount,
          desiredCoverageCount,
          desiredInheritedCount,
          state
        });


      if (!candidate) {
        break;
      }


      const move =
        moveById.get(
          candidate.moveId
        );


      const role =
        classifyMoveRole(
          candidate,
          move,
          intent
        );


      const signature =
        compositionSignature(
          move,
          role
        );


      const moveType =
        normalizeId(
          move?.type
        );


      assignments.push({
        moveId:
          candidate.moveId,

        level:
          slot.level,

        stage:
          slot.stage,

        role,

        inheritedFromSource:
          candidate.inheritedFromSource ===
          true
      });


      state.selectedIds.add(
        candidate.moveId
      );


      incrementMap(
        state.signatureCounts,
        signature
      );


      if (moveType) {

        incrementMap(
          state.typeCounts,
          moveType
        );
      }


      incrementMap(
        state.roleCounts,
        role
      );


      if (
        candidate.inheritedFromSource
      ) {

        state.inheritedCount +=
          1;
      }
    }
  }


  return assignments;
}


function bestCandidateForSlot({
  candidates,
  moveById,
  intent,
  slot,
  requiredTypeIds,
  desiredUtilityCount,
  desiredCoverageCount,
  state,
  desiredInheritedCount
}) {

  return candidates
    .filter(
      candidate =>
        !state.selectedIds.has(
          candidate.moveId
        )
    )
    .map(
      candidate => {

        const move =
          moveById.get(
            candidate.moveId
          );


        const role =
          classifyMoveRole(
            candidate,
            move,
            intent
          );


        const signature =
          compositionSignature(
            move,
            role
          );


        const moveType =
          normalizeId(
            move?.type
          );


        const missingType =
          (
            intent?.types ??
            []
          ).includes(
            moveType
          ) &&
          !state.typeCounts.has(
            moveType
          );


        const requiredType =
          missingType &&
          requiredTypeIds.has(
            candidate.moveId
          );


        const utilityNeeded =
          isUtilityCompositionRole(
            role
          ) &&
          utilityCompositionCount(
            state.roleCounts
          ) <
            desiredUtilityCount;


        const coverageNeeded =
          role ===
            "coverage" &&
          mapCount(
            state.roleCounts,
            "coverage"
          ) <
            desiredCoverageCount;

        const inheritanceNeeded =
          candidate.inheritedFromSource &&
          state.inheritedCount <
            desiredInheritedCount;

        const levelFit =
          1 -
          Math.min(
            1,

            Math.abs(
              candidate.observedLevel -
              slot.level
            ) /
              19
          );


        const redundancy =
          mapCount(
            state.signatureCounts,
            signature
          );


        const compositionScore =
          candidate.score *
            SCORE_WEIGHTS.base +

          levelFit *
            SCORE_WEIGHTS.levelFit +

          (
            missingType
              ? SCORE_WEIGHTS.missingType
              : 0
          ) +

          (
            requiredType
              ? SCORE_WEIGHTS.requiredType
              : 0
          ) +

          (
            utilityNeeded
              ? SCORE_WEIGHTS.utilityNeed
              : 0
          ) +

          (
            coverageNeeded
              ? SCORE_WEIGHTS.coverageNeed
              : 0
          ) -

          (
            inheritanceNeeded
              ? SCORE_WEIGHTS.inheritanceNeed
              : 0
          ) -

          Math.min(
            0.36,

            redundancy *
              SCORE_WEIGHTS.redundancy
          );


        return {
          candidate,
          compositionScore
        };
      }
    )
    .sort(
      (
        left,
        right
      ) =>
        right.compositionScore -
          left.compositionScore ||

        right.candidate.score -
          left.candidate.score ||

        String(
          left.candidate.moveId
        ).localeCompare(
          String(
            right.candidate.moveId
          )
        )
    )[0]
    ?.candidate ??
    null;
}


function applyAssignment({
  candidate,
  assignment,
  schedule,
  moveById,
  intent,
  fallbackLevel
}) {

  if (!assignment) {

    return {
      ...candidate,

      level:
        nearestScheduleLevel(
          candidate.observedLevel,
          schedule,
          fallbackLevel
        ),

      selected:
        false,

      learnsetStage:
        null,

      learnsetRole:
        classifyMoveRole(
          candidate,
          moveById.get(
            candidate.moveId
          ),
          intent
        )
    };
  }


  return {
    ...candidate,

    level:
      assignment.level,

    selected:
      true,

    learnsetStage:
      assignment.stage,

    learnsetRole:
      assignment.role,

    reasons:
      uniqueStrings([
        ...(
          candidate.reasons ??
          []
        ),

        `composition-${assignment.stage}`,

        compositionReasonForRole(
          assignment.role
        )
      ])
  };
}


function classifyMoveRole(
  candidate,
  move,
  intent
) {

  const mechanicalRole =
    normalizeId(
      candidate
        ?.mechanicalRole
    );


  if (
    [
      "control",
      "status",
      "debuff"
    ].includes(
      mechanicalRole
    )
  ) {
    return "control";
  }


  if (
    [
      "support",
      "setup",
      "defense",
      "sustain",
      "mobility"
    ].includes(
      mechanicalRole
    )
  ) {
    return mechanicalRole;
  }


  const moveType =
    normalizeId(
      move?.type
    );


  const targetTypes =
    intent?.types ??
    [];


  if (!move?.damage) {
    return "utility";
  }


  if (
    targetTypes.includes(
      moveType
    )
  ) {
    return "stab";
  }


  if (moveType) {
    return "coverage";
  }


  return "offense";
}

function isUtilityCompositionRole(
  role
) {

  return [
    "utility",
    "control",
    "support",
    "setup",
    "defense",
    "sustain",
    "mobility"
  ].includes(
    role
  );
}


function utilityCompositionCount(
  roleCounts
) {

  return [
    ...roleCounts.entries()
  ].reduce(
    (
      total,
      [
        role,
        count
      ]
    ) =>
      total +
      (
        isUtilityCompositionRole(
          role
        )
          ? count
          : 0
      ),
    0
  );
}


function compositionReasonForRole(
  role
) {

  if (
    isUtilityCompositionRole(
      role
    )
  ) {
    return "composition-utility";
  }


  if (
    role ===
    "stab"
  ) {
    return "composition-stab";
  }


  if (
    role ===
    "coverage"
  ) {
    return "composition-coverage";
  }


  return "composition-offense";
}

function compositionSignature(
  move,
  role
) {

  const abilities =
    normalizePowerAbilities(
      move?.powerAbilities
    )
      .sort()
      .join(
        "+"
      ) ||
    "none";


  const resolution =
    move?.attack
      ? "attack"
      : move?.save
        ? "save"
        : "other";


  return (
    `${role}|` +
    `${normalizeId(move?.type) || "none"}|` +
    `${abilities}|` +
    resolution
  );
}


function bestMoveIdPerType(
  candidates,
  moveById,
  targetTypes
) {

  const ids =
    new Set();


  for (
    const type
    of targetTypes
  ) {

    const candidate =
      candidates.find(
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


    if (candidate) {

      ids.add(
        candidate.moveId
      );
    }
  }


  return ids;
}


function targetUtilityCount(
  total,
  intent
) {

  const offense =
    clamp01(
      Number(
        intent
          ?.dimensions
          ?.offense ??
        0
      )
    );


  const control =
    clamp01(
      Number(
        intent
          ?.dimensions
          ?.control ??
        0
      )
    );


  const durability =
    clamp01(
      Number(
        intent
          ?.dimensions
          ?.durability ??
        0
      )
    );


  const ratio =
    clamp(
      0.10 +
        control *
          0.30 +
        durability *
          0.22 -
        offense *
          0.12,

      0.10,
      0.55
    );


  return Math.round(
    total *
    ratio
  );
}

function targetInheritedCount({
  targetCount,
  candidates,
  evolutionContinuity
}) {

  const observedRetention =
    Number(
      evolutionContinuity
        ?.observedRetention
    );


  if (
    !Number.isFinite(
      observedRetention
    ) ||
    observedRetention <=
      0
  ) {
    return 0;
  }


  const mutationDegree =
    normalizeId(
      evolutionContinuity
        ?.mutationDegree
    );


  const factor =
    INHERITANCE_TARGET_FACTORS[
      mutationDegree
    ] ??
    INHERITANCE_TARGET_FACTORS
      .moderate;


  const inheritedCandidates =
    candidates.filter(
      candidate =>
        candidate.inheritedFromSource
    ).length;


  return Math.min(
    inheritedCandidates,

    Math.max(
      0,

      Math.round(
        targetCount *
        clamp01(
          observedRetention
        ) *
        factor
      )
    )
  );
}

function nearestScheduleLevel(
  observedLevel,
  schedule,
  fallback
) {

  if (!schedule.length) {
    return fallback;
  }


  return [
    ...schedule
  ]
    .sort(
      (
        left,
        right
      ) =>
        Math.abs(
          left.level -
          observedLevel
        ) -
          Math.abs(
            right.level -
            observedLevel
          ) ||

        left.level -
          right.level
    )[0]
    .level;
}


function stageForIndex(
  index,
  total
) {

  if (
    index ===
    0
  ) {
    return "starting";
  }


  if (
    index ===
    total -
      1
  ) {
    return "capstone";
  }


  const progress =
    total <=
      2
      ? 1
      : index /
        (
          total -
          1
        );


  if (
    progress <=
    0.34
  ) {
    return "early";
  }


  if (
    progress <=
    0.67
  ) {
    return "mid";
  }


  return "late";
}


function countAssignmentsByLevel(
  assignments
) {

  const counts =
    new Map();


  for (
    const assignment
    of assignments
  ) {

    incrementMap(
      counts,
      assignment.level
    );
  }


  return counts;
}

function countAssignmentsByRole(
  assignments
) {

  const counts =
    new Map();


  for (
    const assignment
    of assignments
  ) {

    incrementMap(
      counts,
      assignment.role
    );
  }


  return counts;
}

function weightedMean(
  samples
) {

  if (!samples.length) {
    return 0;
  }


  const totalWeight =
    samples.reduce(
      (
        sum,
        sample
      ) =>
        sum +
        sample.weight,
      0
    );


  if (!totalWeight) {
    return 0;
  }


  return samples.reduce(
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
}


function normalizePowerAbilities(
  value
) {

  const values =
    Array.isArray(
      value
    )
      ? value
      : [
          value
        ];


  return values
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


function incrementMap(
  map,
  key
) {

  map.set(
    key,
    mapCount(
      map,
      key
    ) +
      1
  );
}


function mapCount(
  map,
  key
) {

  return (
    map.get(
      key
    ) ??
    0
  );
}


function uniqueStrings(
  values
) {

  return [
    ...new Set(
      values
        .map(
          value =>
            String(
              value ??
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    )
  ];
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
    numeric >
      0
  )
    ? numeric
    : fallback;
}


function normalizeLevel(
  value,
  fallback
) {

  const numeric =
    Number(
      value
    );


  const resolved =
    Number.isFinite(
      numeric
    )
      ? Math.round(
          numeric
        )
      : Number(
          fallback
        ) ||
        1;


  return clamp(
    resolved,
    1,
    20
  );
}


function roundToStep(
  value,
  step
) {

  return Number.isFinite(
    value
  )
    ? Math.round(
        value /
        step
      ) *
        step
    : 0;
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


function normalizeId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}