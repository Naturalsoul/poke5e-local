import {
  buildMoveMechanicalProfile
} from "./move-mechanical-profile.mjs";


const ARCHETYPE_ROLE_PREFERENCES =
  Object.freeze({

    tank: {
      damage: 0.35,
      utility: 0.60,
      control: 0.62,
      status: 0.55,
      debuff: 0.60,
      support: 0.55,
      setup: 0.72,
      defense: 1.00,
      sustain: 1.00,
      mobility: 0.25,
      risk: 0.05
    },

    "offensive-tank": {
      damage: 0.86,
      utility: 0.52,
      control: 0.42,
      status: 0.36,
      debuff: 0.48,
      support: 0.35,
      setup: 0.72,
      defense: 0.72,
      sustain: 0.82,
      mobility: 0.30,
      risk: 0.18
    },

    "physical-attacker": {
      damage: 1.00,
      utility: 0.25,
      control: 0.20,
      status: 0.18,
      debuff: 0.28,
      support: 0.12,
      setup: 0.68,
      defense: 0.18,
      sustain: 0.28,
      mobility: 0.48,
      risk: 0.42
    },

    "special-attacker": {
      damage: 1.00,
      utility: 0.32,
      control: 0.34,
      status: 0.30,
      debuff: 0.34,
      support: 0.16,
      setup: 0.64,
      defense: 0.18,
      sustain: 0.30,
      mobility: 0.44,
      risk: 0.38
    },

    "mixed-attacker": {
      damage: 1.00,
      utility: 0.28,
      control: 0.25,
      status: 0.22,
      debuff: 0.30,
      support: 0.14,
      setup: 0.62,
      defense: 0.20,
      sustain: 0.28,
      mobility: 0.44,
      risk: 0.40
    },

    "fast-striker": {
      damage: 1.00,
      utility: 0.20,
      control: 0.18,
      status: 0.16,
      debuff: 0.24,
      support: 0.10,
      setup: 0.58,
      defense: 0.10,
      sustain: 0.18,
      mobility: 0.92,
      risk: 0.48
    },

    "support-controller": {
      damage: 0.24,
      utility: 0.90,
      control: 1.00,
      status: 1.00,
      debuff: 0.96,
      support: 1.00,
      setup: 0.58,
      defense: 0.48,
      sustain: 0.62,
      mobility: 0.42,
      risk: 0.05
    },

    "glass-cannon": {
      damage: 1.00,
      utility: 0.12,
      control: 0.12,
      status: 0.12,
      debuff: 0.18,
      support: 0.05,
      setup: 0.70,
      defense: 0.04,
      sustain: 0.10,
      mobility: 0.68,
      risk: 0.62
    }
  });


export function evaluateFakemonMoveMechanics({
  move,
  intent
}) {

  const profile =
    buildMoveMechanicalProfile(
      move
    );


  const roleScores =
    Object.fromEntries(
      profile.roles.map(
        role => [
          role,
          roundScore(
            rolePreference({
              role,
              intent
            })
          )
        ]
      )
    );


  const rankedRoles =
    Object.entries(
      roleScores
    )
      .sort(
        (
          left,
          right
        ) =>
          right[1] -
          left[1]
      );


  const primaryRole =
    rankedRoles[0]?.[0] ??
    (
      profile.dealsDamage
        ? "damage"
        : "utility"
    );


  const scores =
    rankedRoles.map(
      entry =>
        entry[1]
    );


  const maximum =
    scores.length
      ? Math.max(
          ...scores
        )
      : 0;


  const average =
    scores.length
      ? scores.reduce(
          (
            sum,
            value
          ) =>
            sum +
            value,
          0
        ) /
        scores.length
      : 0;


  return {
    score:
      roundScore(
        clamp01(
          maximum *
            0.72 +
          average *
            0.28
        )
      ),

    primaryRole,
    roleScores,
    profile
  };
}


function rolePreference({
  role,
  intent
}) {

  const archetypePreference =
    blendedArchetypePreference({
      role,
      intent
    });


  const dimensionPreference =
    dimensionPreferenceForRole({
      role,
      intent
    });


  return clamp01(
    archetypePreference *
      0.72 +
    dimensionPreference *
      0.28
  );
}


function blendedArchetypePreference({
  role,
  intent
}) {

  const primary =
    archetypeRoleValue(
      intent?.primaryArchetype,
      role
    );


  const secondaryId =
    normalizeId(
      intent?.secondaryArchetype
    );


  if (!secondaryId) {
    return primary;
  }


  const secondary =
    archetypeRoleValue(
      secondaryId,
      role
    );


  return (
    primary *
      0.65 +
    secondary *
      0.35
  );
}


function archetypeRoleValue(
  archetypeId,
  role
) {

  return (
    ARCHETYPE_ROLE_PREFERENCES[
      normalizeId(
        archetypeId
      )
    ]?.[
      role
    ] ??
    0.45
  );
}


function dimensionPreferenceForRole({
  role,
  intent
}) {

  const offense =
    dimension(
      intent,
      "offense",
      0.5
    );


  const durability =
    dimension(
      intent,
      "durability",
      0.5
    );


  const speed =
    dimension(
      intent,
      "speed",
      0.5
    );


  const control =
    dimension(
      intent,
      "control",
      0.5
    );


  switch (
    role
  ) {

    case "damage":
      return offense;


    case "control":
    case "status":
    case "debuff":
    case "support":
    case "utility":
      return control;


    case "defense":
    case "sustain":
      return durability;


    case "mobility":
      return speed;


    case "setup":
      return Math.max(
        offense,
        durability
      );


    case "risk":
      return (
        offense *
          0.60 +
        (
          1 -
          durability
        ) *
          0.40
      );


    default:
      return 0.5;
  }
}


function dimension(
  intent,
  key,
  fallback
) {

  const value =
    Number(
      intent
        ?.dimensions
        ?.[key]
    );


  return Number.isFinite(
    value
  )
    ? clamp01(
        value
      )
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