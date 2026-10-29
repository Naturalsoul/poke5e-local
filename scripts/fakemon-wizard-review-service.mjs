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

const MIN_ABILITY_TYPE_AFFINITY =
  0.20;

const HIGH_DIMENSION =
  0.65;

const UTILITY_ROLES =
  new Set([
    "utility",
    "control",
    "support",
    "setup",
    "defense",
    "sustain",
    "mobility"
  ]);

const DURABILITY_ROLES =
  new Set([
    "defense",
    "sustain"
  ]);

const LOW_RISK_ARCHETYPES =
  new Set([
    "tank",
    "support-controller"
  ]);


export function buildFakemonWizardReview({
  database,
  concept,
  recommendation,
  catalogRecommendations,
  selections,
  evolutionDesign = null
}) {

  const intent =
    recommendation?.intent;


  const balance =
    recommendation?.recommendation;


  if (
    !intent ||
    !balance ||
    !catalogRecommendations ||
    !selections
  ) {

    throw new Error(
      "No hay información suficiente para revisar el Fakemon Wizard."
    );
  }


  const moveById =
    catalogById(
      database?.moves
    );


  const selectedAbilities =
    filterSelected(
      catalogRecommendations.abilities,
      selections.abilityIds,
      entry =>
        entry.id
    );


  const selectedLevelMoves =
    filterSelected(
      catalogRecommendations.levelMoves,
      selections.levelMoveIds,
      entry =>
        entry.moveId
    );


  const selectedEggMoves =
    filterSelected(
      catalogRecommendations.eggMoves,
      selections.eggMoveIds,
      entry =>
        entry.moveId
    );


  const selectedTms =
    filterSelected(
      catalogRecommendations.tms,
      selections.tmMoveIds,
      entry =>
        entry.moveId
    );


  const levelAnalysis =
    analyzeLevelMoves({
      entries:
        selectedLevelMoves,

      moveById,
      intent
    });


  const summary = {
    name:
      String(
        concept?.name ??
        ""
      ).trim(),

    types: [
      ...(
        intent.types ??
        []
      )
    ],

    primaryArchetype:
      intent.primaryArchetype,

    secondaryArchetype:
      intent.secondaryArchetype,

    offenseMode:
      intent.offenseMode,

    confidence:
      recommendation
        ?.confidence
        ?.level ??
      "low",

    sr:
      balance.sr.value,

    minimumLevel:
      balance.minimumLevel.value,

    combat: {
      hp:
        balance.combat.hp.value,

      ac:
        balance.combat.ac.value,

      hitDie:
        balance.combat.hitDie,

      speed:
        balance.combat.speed.value,

      attributes:
        Object.fromEntries(
          Object.entries(
            balance.combat.attributes ??
            {}
          ).map(
            ([
              id,
              value
            ]) => [
              id,
              value?.value
            ]
          )
        )
    },

    abilities: {
      selectedCount:
        selectedAbilities.length,

      hiddenCount:
        selectedAbilities.filter(
          entry =>
            entry.hidden ===
            true
        ).length,

      ids:
        selectedAbilities.map(
          entry =>
            entry.id
        )
    },

    levelMoves: {
      selectedCount:
        selectedLevelMoves.length,

      targetCount:
        Number(
          catalogRecommendations
            .learnsetProfile
            ?.targetMoveCount ??
          0
        ),

      ...levelAnalysis
    },

    eggMoves: {
      selectedCount:
        selectedEggMoves.length
    },

    tms: {
      selectedCount:
        selectedTms.length
    },

    evolution:
      buildEvolutionSummary({
        evolutionDesign,
        recommendation,
        catalogRecommendations,
        selections
      })
  };


  const checks = [
    buildConfidenceCheck(
      recommendation
    ),

    ...buildTypeChecks({
      intent,
      selectedLevelMoves,

      allLevelMoves:
        catalogRecommendations
          .levelMoves ??
        [],

      moveById
    }),

    ...buildAbilityAffinityChecks({
      intent,
      selectedAbilities,

      allAbilities:
        catalogRecommendations
          .abilities ??
        []
    }),

    buildLearnsetCountCheck({
      selectedCount:
        selectedLevelMoves.length,

      targetCount:
        summary.levelMoves
          .targetCount
    }),

    buildProgressionCheck({
      selectedLevelMoves,

      profile:
        catalogRecommendations
          .learnsetProfile
    }),

    ...buildRoleChecks({
      intent,
      levelAnalysis
    }),

    ...buildEvidenceChecks({
      intent,

      evidence:
        catalogRecommendations
          .evidence
    }),

    ...buildEvolutionChecks(
      summary.evolution
    )
  ].filter(
    Boolean
  );


  return {
    summary,
    checks,

    warningCount:
      checks.filter(
        checkEntry =>
          checkEntry.status ===
          "warning"
      ).length,

    infoCount:
      checks.filter(
        checkEntry =>
          checkEntry.status ===
          "info"
      ).length
  };
}


function analyzeLevelMoves({
  entries,
  moveById,
  intent
}) {

  const byLevel =
    new Map();

  const byType =
    new Map();

  const roleCounts =
    new Map();


  let damageCount =
    0;

  let coverageCount =
    0;

  let utilityCount =
    0;

  let durabilityCount =
    0;

  let riskCount =
    0;

  let offenseCompatibleCount =
    0;

  let offenseEvaluableCount =
    0;


  for (
    const entry
    of entries
  ) {

    const move =
      moveById.get(
        normalizeId(
          entry.moveId
        )
      );


    const level =
      Number(
        entry.level
      );


    const type =
      normalizeId(
        move?.type
      );


    const role =
      normalizeId(
        entry.learnsetRole ??
        entry.mechanicalRole
      ) ||
      "other";


    if (
      Number.isInteger(
        level
      )
    ) {

      incrementMap(
        byLevel,
        level
      );
    }


    if (type) {

      incrementMap(
        byType,
        type
      );
    }


    incrementMap(
      roleCounts,
      role
    );


    if (
      UTILITY_ROLES.has(
        role
      )
    ) {

      utilityCount +=
        1;
    }


    if (
      DURABILITY_ROLES.has(
        role
      )
    ) {

      durabilityCount +=
        1;
    }


    if (
      hasMechanicalRole(
        entry,
        "risk"
      )
    ) {

      riskCount +=
        1;
    }


    if (!move?.damage) {
      continue;
    }


    damageCount +=
      1;


    if (
      type &&
      !(
        intent.types ??
        []
      ).includes(
        type
      )
    ) {

      coverageCount +=
        1;
    }


    const powerAbilities =
      normalizePowerAbilities(
        move?.powerAbilities
      );


    if (!powerAbilities.length) {
      continue;
    }


    offenseEvaluableCount +=
      1;


    if (
      matchesOffenseMode(
        powerAbilities,
        intent.offenseMode
      )
    ) {

      offenseCompatibleCount +=
        1;
    }
  }


  return {
    byLevel:
      orderedCountObject(
        byLevel,
        true
      ),

    byType:
      orderedCountObject(
        byType
      ),

    roleCounts:
      orderedCountObject(
        roleCounts
      ),

    damageCount,
    coverageCount,
    utilityCount,
    durabilityCount,
    riskCount,
    offenseCompatibleCount,
    offenseEvaluableCount
  };
}


function buildConfidenceCheck(
  recommendation
) {

  const level =
    normalizeId(
      recommendation
        ?.confidence
        ?.level
    ) ||
    "low";


  if (
    level ===
    "high"
  ) {

    return check(
      "reference-confidence-high",
      "pass",
      "references",
      {
        level
      }
    );
  }


  if (
    level ===
    "medium"
  ) {

    return check(
      "reference-confidence-medium",
      "info",
      "references",
      {
        level
      }
    );
  }


  return check(
    "reference-confidence-low",
    "warning",
    "references",
    {
      level
    }
  );
}


function buildTypeChecks({
  intent,
  selectedLevelMoves,
  allLevelMoves,
  moveById
}) {

  return (
    intent.types ??
    []
  ).map(
    (
      type,
      index
    ) => {

      const candidateCount =
        countMovesOfType(
          allLevelMoves,
          moveById,
          type
        );


      const selectedCount =
        countMovesOfType(
          selectedLevelMoves,
          moveById,
          type
        );


      if (
        selectedCount >
        0
      ) {

        return check(
          index ===
            0
            ? "primary-type-represented"
            : "secondary-type-represented",
          "pass",
          "learnset",
          {
            type,
            selectedCount,
            candidateCount
          }
        );
      }


      if (
        candidateCount >
        0
      ) {

        return check(
          index ===
            0
            ? "missing-primary-type-representation"
            : "missing-secondary-type-representation",
          "warning",
          "learnset",
          {
            type,
            candidateCount
          }
        );
      }


      return check(
        "type-candidate-unavailable",
        "info",
        "learnset",
        {
          type
        }
      );
    }
  );
}


function buildAbilityAffinityChecks({
  intent,
  selectedAbilities,
  allAbilities
}) {

  return (
    intent.types ??
    []
  ).map(
    type => {

      const hasCandidate =
        allAbilities.some(
          entry =>
            abilityAffinityForType(
              entry,
              type
            ) >=
            MIN_ABILITY_TYPE_AFFINITY
        );


      if (!hasCandidate) {

        return check(
          "ability-affinity-unavailable",
          "info",
          "abilities",
          {
            type
          }
        );
      }


      const hasSelected =
        selectedAbilities.some(
          entry =>
            abilityAffinityForType(
              entry,
              type
            ) >=
            MIN_ABILITY_TYPE_AFFINITY
        );


      return check(
        hasSelected
          ? "ability-affinity-represented"
          : "ability-affinity-not-selected",

        hasSelected
          ? "pass"
          : "info",

        "abilities",

        {
          type
        }
      );
    }
  );
}


function buildLearnsetCountCheck({
  selectedCount,
  targetCount
}) {

  if (
    !Number.isFinite(
      targetCount
    ) ||
    targetCount <=
      0
  ) {

    return check(
      "learnset-target-unavailable",
      "info",
      "learnset",
      {
        selectedCount
      }
    );
  }


  const difference =
    Math.abs(
      selectedCount -
      targetCount
    );


  const threshold =
    Math.max(
      2,

      Math.ceil(
        targetCount *
        0.25
      )
    );


  const deviates =
    difference >=
    threshold;


  return check(
    deviates
      ? "learnset-count-deviation"
      : "learnset-count-aligned",

    deviates
      ? "warning"
      : "pass",

    "learnset",

    {
      selectedCount,
      targetCount,
      difference
    }
  );
}


function buildProgressionCheck({
  selectedLevelMoves,
  profile
}) {

  const expectedLevels =
    (
      profile?.levels ??
      []
    ).filter(
      entry =>
        Number(
          entry?.targetCount
        ) >
        0
    );


  if (!expectedLevels.length) {
    return null;
  }


  const selectedLevels =
    new Set(
      selectedLevelMoves.map(
        entry =>
          Number(
            entry.level
          )
      )
    );


  const missingLevels =
    expectedLevels
      .map(
        entry =>
          Number(
            entry.level
          )
      )
      .filter(
        level =>
          !selectedLevels.has(
            level
          )
      );


  if (!missingLevels.length) {

    return check(
      "learnset-progression-covered",
      "pass",
      "learnset",
      {
        expectedLevels:
          expectedLevels.length
      }
    );
  }


  return check(
    "learnset-progression-gaps",

    missingLevels.length >=
      2
      ? "warning"
      : "info",

    "learnset",

    {
      missingLevels
    }
  );
}


function buildRoleChecks({
  intent,
  levelAnalysis
}) {

  const checks =
    [];


  const offense =
    dimension(
      intent,
      "offense"
    );


  const durability =
    dimension(
      intent,
      "durability"
    );


  const control =
    dimension(
      intent,
      "control"
    );


  if (
    offense >=
    HIGH_DIMENSION
  ) {

    checks.push(
      check(
        levelAnalysis.damageCount >
          0
          ? "offense-has-damage"
          : "offense-without-damage",

        levelAnalysis.damageCount >
          0
          ? "pass"
          : "warning",

        "roles",

        {
          damageCount:
            levelAnalysis.damageCount
        }
      )
    );
  }


  if (
    [
      "physical",
      "special"
    ].includes(
      intent.offenseMode
    ) &&
    levelAnalysis
      .offenseEvaluableCount >=
      2
  ) {

    const ratio =
      levelAnalysis
        .offenseCompatibleCount /
      levelAnalysis
        .offenseEvaluableCount;


    checks.push(
      check(
        ratio >=
          0.5
          ? "offense-mode-compatible"
          : "offense-mode-mismatch",

        ratio >=
          0.5
          ? "pass"
          : "warning",

        "roles",

        {
          mode:
            intent.offenseMode,

          compatible:
            levelAnalysis
              .offenseCompatibleCount,

          evaluable:
            levelAnalysis
              .offenseEvaluableCount,

          ratio:
            roundScore(
              ratio
            )
        }
      )
    );
  }


  if (
    control >=
    HIGH_DIMENSION
  ) {

    checks.push(
      check(
        levelAnalysis.utilityCount >
          0
          ? "control-utility-present"
          : "control-utility-missing",

        levelAnalysis.utilityCount >
          0
          ? "pass"
          : "warning",

        "roles",

        {
          utilityCount:
            levelAnalysis.utilityCount
        }
      )
    );
  }


  if (
    durability >=
    HIGH_DIMENSION
  ) {

    checks.push(
      check(
        levelAnalysis.durabilityCount >
          0
          ? "durability-tools-present"
          : "durability-tools-missing",

        levelAnalysis.durabilityCount >
          0
          ? "pass"
          : "warning",

        "roles",

        {
          durabilityCount:
            levelAnalysis
              .durabilityCount
        }
      )
    );
  }


  if (
    levelAnalysis.damageCount >=
      4
  ) {

    checks.push(
      check(
        levelAnalysis.coverageCount >
          0
          ? "coverage-present"
          : "coverage-limited",

        levelAnalysis.coverageCount >
          0
          ? "pass"
          : "info",

        "roles",

        {
          damageCount:
            levelAnalysis.damageCount,

          coverageCount:
            levelAnalysis.coverageCount
        }
      )
    );
  }


  if (
    LOW_RISK_ARCHETYPES.has(
      intent.primaryArchetype
    ) &&
    levelAnalysis.riskCount >
      0
  ) {

    checks.push(
      check(
        "low-risk-profile-has-risk-moves",

        levelAnalysis.riskCount >=
          2
          ? "warning"
          : "info",

        "roles",

        {
          riskCount:
            levelAnalysis.riskCount,

          archetype:
            intent.primaryArchetype
        }
      )
    );
  }


  return checks;
}


function buildEvidenceChecks({
  intent,
  evidence
}) {

  const checks =
    [];


  const expandedTypes =
    (
      evidence?.typePeers ??
      []
    )
      .filter(
        entry =>
          entry?.species >
            0 &&
          entry.powerBandApplied !==
            true
      )
      .map(
        entry =>
          entry.type
      );


  if (expandedTypes.length) {

    checks.push(
      check(
        "expanded-type-reference-pool",
        "info",
        "references",
        {
          types:
            expandedTypes
        }
      )
    );
  }


  if (
    (
      intent.types ??
      []
    ).length >
      1 &&
    Number(
      evidence
        ?.exactTypePeers
        ?.species ??
      0
    ) ===
      0
  ) {

    checks.push(
      check(
        "no-exact-type-references",
        "info",
        "references",
        {
          types: [
            ...intent.types
          ]
        }
      )
    );
  }


  return checks;
}

function buildEvolutionSummary({
  evolutionDesign,
  recommendation,
  catalogRecommendations,
  selections
}) {

  if (!evolutionDesign) {
    return null;
  }


  const profile =
    evolutionDesign.profile ??
    recommendation
      ?.evolutionProfile ??
    null;


  return {
    sourceSpeciesId:
      String(
        evolutionDesign
          .sourceSpeciesId ??
        profile?.source?.id ??
        ""
      ),

    sourceName:
      String(
        profile?.source?.name ??
        evolutionDesign
          .sourceSpeciesId ??
        ""
      ),

    sourceTypes:
      Array.isArray(
        profile?.source?.types
      )
        ? [
            ...profile.source.types
          ]
        : [],

    narrativeOrigin:
      evolutionDesign
        .narrativeOrigin ??
      profile?.narrativeOrigin ??
      "natural",

    mutationDegree:
      evolutionDesign
        .mutationDegree ??
      profile?.mutationDegree ??
      "moderate",

    deltaWeight:
      Number(
        profile?.deltaWeight ??
        0
      ),

    comparableCount:
      Number(
        profile?.comparableCount ??
        0
      ),

    continuity:
      buildEvolutionContinuitySummary({
        catalogRecommendations,
        selections
      }),

    rule:
      buildEvolutionRuleSummary(
        evolutionDesign
      ),

    fallback:
      profile?.fallback ===
      true
  };
}


function buildEvolutionChecks(
  evolution
) {

  if (!evolution) {
    return [];
  }


  const checks =
    [];


  if (
    evolution.fallback
  ) {

    checks.push(
      check(
        "evolution-delta-fallback",
        "warning",
        "evolution",
        {
          sourceSpeciesId:
            evolution.sourceSpeciesId
        }
      )
    );

  } else {

    checks.push(
      check(
        "evolution-delta-supported",
        "pass",
        "evolution",
        {
          comparableCount:
            evolution.comparableCount
        }
      )
    );
  }


  if (
    evolution.mutationDegree ===
    "radical"
  ) {

    checks.push(
      check(
        "evolution-radical-mutation",
        "info",
        "evolution",
        {
          deltaWeight:
            evolution.deltaWeight
        }
      )
    );
  }
  checks.push(
    ...buildEvolutionRuleChecks(
      evolution.rule
    )
  );
  checks.push(
    ...buildEvolutionContinuityChecks(
      evolution
    )
  );

  return checks;
}

function buildEvolutionRuleSummary(
  evolutionDesign
) {

  const rule =
    evolutionDesign?.rule;


  if (!rule) {
    return null;
  }


  return {
    evolutionPoints:
      Number(
        rule.evolutionPoints ??
        0
      ),

    abilityScoreMode:
      String(
        rule.abilityScoreMode ??
        "standard"
      ),

    conditions:
      (
        Array.isArray(
          rule.conditions
        )
          ? rule.conditions
          : []
      ).map(
        condition => ({
          type:
            String(
              condition?.type ??
              ""
            ),

          value:
            condition?.value ??
            ""
        })
      )
  };
}


function buildEvolutionRuleChecks(
  rule
) {

  if (!rule) {
    return [];
  }


  const checks = [
    check(
      "evolution-requirements-defined",

      rule.conditions.length >
        0
        ? "pass"
        : "warning",

      "evolution",

      {
        conditionCount:
          rule.conditions.length,

        evolutionPoints:
          rule.evolutionPoints
      }
    )
  ];


  if (
    rule.abilityScoreMode ===
      "tradeoff"
  ) {

    checks.push(
      check(
        "evolution-tradeoff-mode",
        "info",
        "evolution",
        {
          cap:
            24
        }
      )
    );
  }


  return checks;
}

function buildEvolutionContinuityChecks(
  evolution
) {

  const continuity =
    evolution?.continuity;


  if (!continuity) {
    return [];
  }


  const abilities =
    continuity.channels
      ?.abilities ??
    {};

  const levelMoves =
    continuity.channels
      ?.levelMoves ??
    {};


  const availableCore =
    Number(
      abilities.sourceCount ??
      0
    ) +
    Number(
      levelMoves.sourceCount ??
      0
    );


  const selectedCoreInherited =
    Number(
      abilities.selectedInheritedCount ??
      0
    ) +
    Number(
      levelMoves.selectedInheritedCount ??
      0
    );


  const checks =
    [];


  if (
    availableCore >
    0
  ) {

    const missingHighContinuity =
      evolution.mutationDegree ===
        "continuity" &&
      selectedCoreInherited ===
        0;


    checks.push(
      check(
        missingHighContinuity
          ? "evolution-source-identity-missing"
          : "evolution-source-identity-present",

        missingHighContinuity
          ? "warning"
          : "pass",

        "evolution",

        {
          selectedInherited:
            selectedCoreInherited,

          availableSource:
            availableCore
        }
      )
    );
  }


  const desiredInheritedCount =
    Number(
      levelMoves.desiredInheritedCount ??
      0
    );


  const selectedInheritedCount =
    Number(
      levelMoves.selectedInheritedCount ??
      0
    );


  if (
    desiredInheritedCount >
    0
  ) {

    const aligned =
      selectedInheritedCount >=
      Math.max(
        1,
        desiredInheritedCount -
          1
      );


    const severeGap =
      evolution.mutationDegree ===
        "continuity" &&
      selectedInheritedCount <
        Math.max(
          1,

          Math.ceil(
            desiredInheritedCount *
            0.5
          )
        );


    checks.push(
      check(
        aligned
          ? "evolution-level-inheritance-aligned"
          : "evolution-level-inheritance-below-target",

        aligned
          ? "pass"
          : severeGap
            ? "warning"
            : "info",

        "evolution",

        {
          selectedInheritedCount,
          desiredInheritedCount
        }
      )
    );
  }


  return checks;
}

function buildEvolutionContinuitySummary({
  catalogRecommendations,
  selections
}) {

  const continuity =
    catalogRecommendations
      ?.evolutionContinuity;


  if (!continuity) {
    return null;
  }


  const sourceCounts =
    continuity.sourceCounts ??
    {};


  return {
    sourceInfluence:
      Number(
        continuity.sourceInfluence ??
        0
      ),

    observed:
      continuity.observed ??
      null,

    channels: {
      abilities:
        inheritedSelectionSummary({
          entries:
            catalogRecommendations
              .abilities,

          selectedValues:
            selections.abilityIds,

          idGetter:
            entry =>
              entry.id,

          sourceCount:
            sourceCounts.abilities
        }),

      levelMoves: {
        ...inheritedSelectionSummary({
          entries:
            catalogRecommendations
              .levelMoves,

          selectedValues:
            selections.levelMoveIds,

          idGetter:
            entry =>
              entry.moveId,

          sourceCount:
            sourceCounts.levelMoves
        }),

        desiredInheritedCount:
          Number(
            catalogRecommendations
              ?.learnsetProfile
              ?.desiredInheritedCount ??
            0
          )
      },

      eggMoves:
        inheritedSelectionSummary({
          entries:
            catalogRecommendations
              .eggMoves,

          selectedValues:
            selections.eggMoveIds,

          idGetter:
            entry =>
              entry.moveId,

          sourceCount:
            sourceCounts.eggMoves
        }),

      tms:
        inheritedSelectionSummary({
          entries:
            catalogRecommendations
              .tms,

          selectedValues:
            selections.tmMoveIds,

          idGetter:
            entry =>
              entry.moveId,

          sourceCount:
            sourceCounts.tms
        })
    }
  };
}


function inheritedSelectionSummary({
  entries,
  selectedValues,
  idGetter,
  sourceCount
}) {

  const selected =
    selectedIdSet(
      selectedValues
    );


  const candidates =
    Array.isArray(
      entries
    )
      ? entries
      : [];


  const selectedEntries =
    candidates.filter(
      entry =>
        selected.has(
          normalizeId(
            idGetter(
              entry
            )
          )
        )
    );


  return {
    sourceCount:
      Number(
        sourceCount ??
        0
      ),

    visibleInheritedCount:
      candidates.filter(
        entry =>
          entry.inheritedFromSource
      ).length,

    selectedInheritedCount:
      selectedEntries.filter(
        entry =>
          entry.inheritedFromSource
      ).length,

    selectedCount:
      selectedEntries.length
  };
}

function filterSelected(
  entries,
  values,
  idGetter
) {

  const selected =
    selectedIdSet(
      values
    );


  return (
    entries ??
    []
  ).filter(
    entry =>
      selected.has(
        normalizeId(
          idGetter(
            entry
          )
        )
      )
  );
}


function countMovesOfType(
  entries,
  moveById,
  type
) {

  const normalizedType =
    normalizeId(
      type
    );


  return (
    entries ??
    []
  ).filter(
    entry =>
      normalizeId(
        moveById
          .get(
            normalizeId(
              entry.moveId
            )
          )
          ?.type
      ) ===
      normalizedType
  ).length;
}


function abilityAffinityForType(
  entry,
  type
) {

  const normalizedType =
    normalizeId(
      type
    );


  return Number(
    entry
      ?.typeAffinities
      ?.find(
        affinity =>
          normalizeId(
            affinity.type
          ) ===
          normalizedType
      )
      ?.score ??
    0
  );
}


function hasMechanicalRole(
  entry,
  role
) {

  const normalizedRole =
    normalizeId(
      role
    );


  return (
    entry
      ?.mechanicalProfile
      ?.roles ??
    []
  )
    .map(
      normalizeId
    )
    .includes(
      normalizedRole
    );
}


function matchesOffenseMode(
  powerAbilities,
  offenseMode
) {

  if (
    offenseMode ===
    "physical"
  ) {

    return powerAbilities.some(
      id =>
        PHYSICAL_POWER_ABILITIES.has(
          id
        )
    );
  }


  if (
    offenseMode ===
    "special"
  ) {

    return powerAbilities.some(
      id =>
        SPECIAL_POWER_ABILITIES.has(
          id
        )
    );
  }


  return true;
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


function selectedIdSet(
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
        normalizeId
      )
      .filter(
        Boolean
      )
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


function dimension(
  intent,
  key
) {

  const value =
    Number(
      intent
        ?.dimensions
        ?.[key] ??
      0
    );


  return Number.isFinite(
    value
  )
    ? Math.min(
        1,

        Math.max(
          0,
          value
        )
      )
    : 0;
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


function orderedCountObject(
  map,
  numeric = false
) {

  return Object.fromEntries(
    [
      ...map.entries()
    ].sort(
      (
        left,
        right
      ) =>
        numeric
          ? Number(
              left[0]
            ) -
            Number(
              right[0]
            )
          : String(
              left[0]
            ).localeCompare(
              String(
                right[0]
              )
            )
    )
  );
}


function check(
  code,
  status,
  section,
  data = {}
) {

  return {
    code,
    status,
    section,
    data
  };
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