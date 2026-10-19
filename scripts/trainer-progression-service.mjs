import {
  MAX_SUPPORTED_TRAINER_LEVEL,
  TRAINER_CLASS_SKILL_IDS,
  TRAINER_SKILLS,
  getTrainerLevelRule,
  getTrainerOrigin,
  getTrainerPath,
  getTrainerSpecialization
} from "./trainer-rules.mjs";

import {
  synchronizeTrainerFeatures
} from "./trainer-feature-service.mjs";


const MODULE_ID =
  "poke5e-local";

const PROGRESSION_VERSION =
  2;

const PROFICIENCY_EFFECT_KIND =
  "trainer-proficiency";

const ABILITY_IDS =
  Object.freeze([
    "str",
    "dex",
    "con",
    "int",
    "wis",
    "cha"
  ]);


function assertTrainer(
  trainer
) {

  if (
    trainer?.documentName !==
      "Actor" ||
    trainer.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "trainer"
  ) {

    throw new Error(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


function clampAbility(
  value
) {

  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    throw new Error(
      "Los Ability Scores del Trainer deben ser numéricos."
    );
  }


  return Math.min(
    20,
    Math.max(
      1,
      Math.trunc(
        numeric
      )
    )
  );
}


function normalizeBaseAbilities(
  values
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      id => [
        id,
        clampAbility(
          values?.[id] ??
          10
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
      Number(score) -
      10
    ) /
    2
  );
}


function increaseAbility(
  abilities,
  id,
  amount
) {

  if (
    !ABILITY_IDS.includes(
      id
    )
  ) {

    throw new Error(
      `Ability inválida: ${id}.`
    );
  }


  abilities[id] =
    Math.min(
      20,
      abilities[id] +
        Number(amount)
    );
}

function normalizeAbilityScoreGains(
  values
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const numeric =
          Number(
            values
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
            `El aumento acumulado de ${abilityId.toUpperCase()} debe ser un entero no negativo.`
          );
        }


        return [
          abilityId,
          numeric
        ];
      }
    )
  );
}


function applyAbilityScoreGains(
  abilities,
  gains
) {

  for (
    const abilityId
    of ABILITY_IDS
  ) {

    const amount =
      gains[
        abilityId
      ];


    if (
      amount <= 0
    ) {

      continue;
    }


    increaseAbility(
      abilities,
      abilityId,
      amount
    );
  }
}

function requireDistinctChoices(
  values,
  count,
  message
) {

  const normalized =
    [
      ...new Set(
        values
          .map(
            value =>
              String(
                value ??
                ""
              )
          )
          .filter(Boolean)
      )
    ];


  if (
    normalized.length !==
    count
  ) {

    throw new Error(
      message
    );
  }


  return normalized;
}


function validateSkillIds(
  skillIds,
  allowedIds,
  count,
  message
) {

  const normalized =
    requireDistinctChoices(
      skillIds,
      count,
      message
    );


  if (
    normalized.some(
      id =>
        !allowedIds.includes(
          id
        )
    )
  ) {

    throw new Error(
      message
    );
  }


  return normalized;
}


function applyOriginAbilities(
  abilities,
  origin,
  choices
) {

  for (
    const [
      id,
      bonus
    ]
    of Object.entries(
      origin.abilityBonuses ??
      {}
    )
  ) {

    increaseAbility(
      abilities,
      id,
      bonus
    );
  }


  if (
    origin.id ===
    "galarian"
  ) {

    if (
      choices.galarianPattern ===
      "str2-dex1"
    ) {

      increaseAbility(
        abilities,
        "str",
        2
      );

      increaseAbility(
        abilities,
        "dex",
        1
      );

      return;
    }


    if (
      choices.galarianPattern ===
      "dex2-str1"
    ) {

      increaseAbility(
        abilities,
        "dex",
        2
      );

      increaseAbility(
        abilities,
        "str",
        1
      );

      return;
    }


    throw new Error(
      "El Origin Galarian requiere elegir STR +2 / DEX +1 o DEX +2 / STR +1."
    );
  }


  if (
    origin.id ===
    "kantoan"
  ) {

    const selected =
      requireDistinctChoices(
        choices.kantoAbilityIds ??
        [],
        2,
        "El Origin Kantoan requiere dos Ability Scores diferentes."
      );


    for (
      const id
      of selected
    ) {

      increaseAbility(
        abilities,
        id,
        1
      );
    }
  }
}


function setSkillMinimum(
  skills,
  id,
  minimum
) {

  const current =
    skills.get(
      id
    ) ??
    0;


  skills.set(
    id,
    Math.max(
      current,
      minimum
    )
  );
}


function stepSkillProficiency(
  skills,
  id
) {

  const current =
    skills.get(
      id
    ) ??
    0;


  skills.set(
    id,
    Math.min(
      2,
      current + 1
    )
  );
}


function buildSpecializationIds(
  primaryId,
  path,
  pathChoices,
  configuredIds = null
) {

  if (
    Array.isArray(
      configuredIds
    ) &&
    configuredIds.length
  ) {

    return configuredIds.map(
      id => {

        const specialization =
          getTrainerSpecialization(
            id
          );


        if (!specialization) {

          throw new Error(
            `Specialization inválida: ${id}.`
          );
        }


        /*
         * Los duplicados son intencionales:
         * Poke5e permite stackear Specializations.
         */

        return specialization.id;
      }
    );
  }


  const primary =
    getTrainerSpecialization(
      primaryId
    );


  if (!primary) {

    throw new Error(
      "El Trainer requiere una Specialization válida."
    );
  }


  const ids = [
    primary.id
  ];


  if (
    path?.id ===
    "hobbyist"
  ) {

    const additional =
      getTrainerSpecialization(
        pathChoices
          .hobbyistSpecializationId
      );


    if (
      !additional ||
      additional.id ===
        primary.id
    ) {

      throw new Error(
        "Hobbyist requiere una Specialization adicional diferente."
      );
    }


    ids.push(
      additional.id
    );
  }


  return ids;
}


function applySpecializationBenefits(
  abilities,
  skills,
  specializationIds
) {

  for (
    const id
    of specializationIds
  ) {

    const specialization =
      getTrainerSpecialization(
        id
      );


    if (
      specialization
        ?.trainerAbility
    ) {

      increaseAbility(
        abilities,
        specialization
          .trainerAbility,
        1
      );
    }


    if (
      specialization
        ?.trainerSkill
    ) {

      stepSkillProficiency(
        skills,
        specialization
          .trainerSkill
      );
    }
  }
}


function applyPathSkills(
  skills,
  path,
  pathChoices
) {

  if (!path) {

    return;
  }


  if (
    path.trainerSkill
  ) {

    setSkillMinimum(
      skills,
      path.trainerSkill,
      1
    );
  }


  if (
    path.trainerSkillExpertise
  ) {

    setSkillMinimum(
      skills,
      path.trainerSkillExpertise,
      2
    );
  }


  for (
    const id
    of path.trainerSkills ??
    []
  ) {

    setSkillMinimum(
      skills,
      id,
      1
    );
  }


  if (
    path.id !==
    "hobbyist"
  ) {

    return;
  }


  const existing =
    new Set(
      [
        ...skills.entries()
      ]
        .filter(
          entry =>
            entry[1] > 0
        )
        .map(
          entry =>
            entry[0]
        )
    );


  const selected =
    validateSkillIds(
      pathChoices
        .hobbyistSkillIds ??
        [],
      Object.keys(
        TRAINER_SKILLS
      ),
      2,
      "Hobbyist requiere dos nuevas Skill Proficiencies."
    );


  if (
    selected.some(
      id =>
        existing.has(
          id
        )
    )
  ) {

    throw new Error(
      "Las Skills elegidas por Hobbyist deben ser nuevas proficiencies."
    );
  }


  for (
    const id
    of selected
  ) {

    setSkillMinimum(
      skills,
      id,
      1
    );
  }
}


function buildTrainerSkills({
  level,
  classSkillIds,
  origin,
  originChoices,
  path,
  pathChoices
}) {

  const skills =
    new Map();


  /*
   * Trainer Class:
   * Animal Handling + dos Skills.
   */

  setSkillMinimum(
    skills,
    "ani",
    1
  );


  const selectedClassSkills =
    validateSkillIds(
      classSkillIds,
      TRAINER_CLASS_SKILL_IDS,
      2,
      "Debes seleccionar dos Skills válidas para la Trainer Class."
    );


  for (
    const id
    of selectedClassSkills
  ) {

    setSkillMinimum(
      skills,
      id,
      1
    );
  }


  for (
    const id
    of origin.skillProficiencies ??
    []
  ) {

    setSkillMinimum(
      skills,
      id,
      1
    );
  }


  if (
    origin.id ===
    "unovan"
  ) {

    const extra =
      validateSkillIds(
        originChoices
          .unovanExtraSkillIds ??
          [],
        Object.keys(
          TRAINER_SKILLS
        ),
        2,
        "El Origin Unovan requiere dos Skill Proficiencies adicionales."
      );


    for (
      const id
      of extra
    ) {

      setSkillMinimum(
        skills,
        id,
        1
      );
    }
  }


  applyPathSkills(
    skills,
    path,
    pathChoices
  );


  /*
  * Pokémon Tracker — Trainer Lv. 13
  *
  * Todos los Trainers obtienen Expertise
  * en Animal Handling.
  */

  if (
    level >= 13
  ) {

    setSkillMinimum(
      skills,
      "ani",
      2
    );
  }


  return {
    skills,
    selectedClassSkills
  };
}


function buildTrainerResources(
  path,
  level,
  proficiencyBonus,
  previous
) {
  const resources = {};


  if (
    path?.resource
  ) {

    const resource =
      path.resource;


    const maximum =
      resource.maximum ===
      "trainerLevel"
        ? level
        : proficiencyBonus;


    const existing =
      previous?.[
        resource.id
      ];


    resources[
      resource.id
    ] = {

      value:
        existing
          ? Math.min(
              Number(
                existing.value ??
                maximum
              ),
              maximum
            )
          : maximum,

      max:
        maximum,

      recovery:
        "long-rest"
    };
  }


  if (
    level >= 20
  ) {

    const maximum =
      2;


    const existing =
      previous
        ?.masterTrainerUses;


    resources
      .masterTrainerUses = {

        value:
          existing
            ? Math.min(
                Number(
                  existing.value ??
                  maximum
                ),
                maximum
              )
            : maximum,

        max:
          maximum,

        recovery:
          "long-rest"
      };
  }


  return resources;
}


/* ============================================================
 * PATH FEATURE RESOURCES (niveles 5+)
 * ============================================================ */

// Hobbyist L5 Versatile: 1 + WIS mod skill dice (min 1). Poké Mentor L9 Cheerleader: once per short rest.
function pathFeatureResources(pathId, level, abilities, previous = {}) {
  const resources = {};
  const keep = (id, max, recovery) => {
    const value = previous?.[id] ? Math.min(Number(previous[id].value ?? max), max) : max;
    resources[id] = { value, max, recovery };
  };
  if (pathId === "hobbyist" && level >= 5) {
    keep("skillDice", Math.max(1, 1 + Math.floor((Number(abilities?.wis ?? 10) - 10) / 2)), "long-rest");
  }
  if (pathId === "poke-mentor" && level >= 9) {keep("cheerleaderUses", 1, "short-rest");}
  // Pokémon Collector L5, Gotta Catch 'Em All: one advantaged capture per long rest.
  if (pathId === "pokemon-collector" && level >= 5) {keep("gottaCatchUses", 1, "long-rest");}
  return resources;
}

// Trainers configured before these resources existed get them without leveling up.
export async function ensureTrainerPathFeatureResources(trainer) {
  const progression = getTrainerProgressionState(trainer);
  if (!progression?.path) {return;}
  const abilities = Object.fromEntries(Object.entries(trainer.system?.abilities ?? {}).map(([id, ability]) => [id, ability?.value]));
  const wanted = pathFeatureResources(progression.path.id, Number(trainer.getFlag(MODULE_ID, "trainerLevel")) || 1, abilities,
    progression.resources);
  const current = progression.resources ?? {};
  if (Object.entries(wanted).every(([id, resource]) => current[id]?.max === resource.max)) {return;}
  await trainer.setFlag(MODULE_ID, "trainerProgression", { ...progression, resources: { ...current, ...wanted } });
}

export async function resetTrainerShortRestResources(trainer) {
  const progression = getTrainerProgressionState(trainer);
  const resources = foundry.utils.deepClone(progression?.resources ?? {});
  const spent = Object.values(resources).filter(resource => resource?.recovery === "short-rest" && resource.value !== resource.max);
  if (!spent.length) {return;}
  for (const resource of spent) {resource.value = normalizeResourceAmount(resource.max);}
  await trainer.setFlag(MODULE_ID, "trainerProgression", { ...progression, resources });
}

function calculateTrainerHp(
  level,
  constitution,
  hpGains = {}
) {

  const conModifier =
    abilityModifier(
      constitution
    );


  let maximum =
    Math.max(
      1,
      6 +
      conModifier
    );


  for (
    let currentLevel = 2;
    currentLevel <= level;
    currentLevel += 1
  ) {

    const stored =
      hpGains[
        String(
          currentLevel
        )
      ] ??
      hpGains[
        currentLevel
      ];


    const base =
      Number(
        stored?.base ??
        4
      );


    const normalizedBase =
      Number.isFinite(
        base
      )
        ? Math.max(
            1,
            Math.trunc(
              base
            )
          )
        : 4;


    maximum +=
      Math.max(
        1,
        normalizedBase +
        conModifier
      );
  }


  return maximum;
}

/* ============================================================
 * MOVEMENT
 * ============================================================ */

function normalizeMovementValue(
  value
) {

  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? Math.max(
        0,
        numeric
      )
    : 0;
}


function getBaseTrainerMovement(
  trainer,
  previousProgression
) {

  const stored =
    previousProgression
      ?.baseMovement;


  if (stored) {

    return {

      walk:
        normalizeMovementValue(
          stored.walk
        ),

      climb:
        normalizeMovementValue(
          stored.climb
        ),

      swim:
        normalizeMovementValue(
          stored.swim
        )
    };
  }


  const movement =
    trainer.system
      ?.attributes
      ?.movement ??
    {};


  return {

    walk:
      normalizeMovementValue(
        movement.walk
      ),

    climb:
      normalizeMovementValue(
        movement.climb
      ),

    swim:
      normalizeMovementValue(
        movement.swim
      )
  };
}


function buildTrainerMovement({
  baseMovement,
  origin,
  originChoices,
  path
}) {

  const movement = {
    ...baseMovement
  };


  /*
   * Ranger:
   *
   * +10 walk
   * climb/swim = half walk
   */

  if (
    path?.id ===
    "ranger"
  ) {

    movement.walk +=
      10;


    const halfWalk =
      movement.walk /
      2;


    movement.climb =
      Math.max(
        movement.climb,
        halfWalk
      );


    movement.swim =
      Math.max(
        movement.swim,
        halfWalk
      );
  }


  if (
    origin.id !==
    "hoennian"
  ) {

    return movement;
  }


  const environment =
    originChoices
      .hoennEnvironment;


  /*
   * Coast usa la velocidad final de walk,
   * por lo que también combina correctamente
   * con Ranger.
   */

  if (
    environment ===
    "coast"
  ) {

    movement.swim =
      Math.max(
        movement.swim,
        movement.walk
      );
  }


  if (
    environment ===
    "mountain"
  ) {

    movement.climb =
      Math.max(
        movement.climb,
        10
      );
  }


  return movement;
}

async function ensureProficiencyEffect(
  trainer,
  proficiencyBonus
) {

  const existing =
    trainer.effects.find(
      effect =>
        effect.getFlag(
          MODULE_ID,
          "kind"
        ) ===
        PROFICIENCY_EFFECT_KIND
    );


  const data = {

    name:
      "Trainer Proficiency",

    img:
      "icons/svg/upgrade.svg",

    disabled:
      false,

    transfer:
      false,

    changes: [
      {
        key:
          "system.attributes.prof",

        mode:
          CONST
            .ACTIVE_EFFECT_MODES
            .OVERRIDE,

        value:
          String(
            proficiencyBonus
          ),

        priority:
          20
      }
    ],

    flags: {

      [MODULE_ID]: {

        kind:
          PROFICIENCY_EFFECT_KIND,

        proficiencyBonus
      }
    }
  };


  if (existing) {

    await existing.update(
      data
    );

    return existing;
  }


  const created =
    await trainer
      .createEmbeddedDocuments(
        "ActiveEffect",
        [
          data
        ]
      );


  return (
    created[0] ??
    null
  );
}


export function getTrainerProgressionState(
  trainer
) {

  if (
    trainer?.documentName !==
    "Actor"
  ) {

    return null;
  }


  return (
    trainer.getFlag(
      MODULE_ID,
      "trainerProgression"
    ) ??
    null
  );
}

/* ============================================================
 * TRAINER RESOURCES
 * ============================================================ */

function normalizeResourceAmount(
  value,
  fallback = 0
) {

  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? Math.max(
        0,
        Math.trunc(
          numeric
        )
      )
    : fallback;
}


export function getTrainerProgressionResource(
  trainer,
  resourceId
) {

  assertTrainer(
    trainer
  );


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const resource =
    progression
      ?.resources
      ?.[resourceId];


  if (!resource) {

    return null;
  }


  const maximum =
    normalizeResourceAmount(
      resource.max
    );


  return {

    value:
      Math.min(
        normalizeResourceAmount(
          resource.value
        ),
        maximum
      ),

    max:
      maximum,

    recovery:
      String(
        resource.recovery ??
        ""
      )
  };
}


async function setTrainerResourceValue(
  trainer,
  resourceId,
  value
) {

  assertTrainer(
    trainer
  );


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const resource =
    progression
      ?.resources
      ?.[resourceId];


  if (!resource) {

    throw new Error(
      `El Trainer no posee el recurso ${resourceId}.`
    );
  }


  const maximum =
    normalizeResourceAmount(
      resource.max
    );


  const nextProgression =
    foundry.utils.deepClone(
      progression
    );


  nextProgression
    .resources[
      resourceId
    ].value =
      Math.min(
        maximum,
        normalizeResourceAmount(
          value
        )
      );


  await trainer.setFlag(
    MODULE_ID,
    "trainerProgression",
    nextProgression
  );


  return getTrainerProgressionResource(
    trainer,
    resourceId
  );
}


export async function spendTrainerProgressionResource(
  trainer,
  resourceId,
  amount = 1
) {

  const cost =
    normalizeResourceAmount(
      amount
    );


  if (
    cost < 1
  ) {

    throw new Error(
      "El coste del recurso debe ser al menos 1."
    );
  }


  const resource =
    getTrainerProgressionResource(
      trainer,
      resourceId
    );


  if (
    !resource ||
    resource.value <
      cost
  ) {

    return false;
  }


  await setTrainerResourceValue(
    trainer,
    resourceId,
    resource.value -
      cost
  );


  return true;
}


export async function restoreTrainerProgressionResource(
  trainer,
  resourceId,
  amount = 1
) {

  const recovery =
    normalizeResourceAmount(
      amount
    );


  if (
    recovery < 1
  ) {

    return getTrainerProgressionResource(
      trainer,
      resourceId
    );
  }


  const resource =
    getTrainerProgressionResource(
      trainer,
      resourceId
    );


  if (!resource) {

    return null;
  }


  return setTrainerResourceValue(
    trainer,
    resourceId,
    resource.value +
      recovery
  );
}


export async function resetTrainerLongRestResources(
  trainer
) {

  assertTrainer(
    trainer
  );


  const progression =
    getTrainerProgressionState(
      trainer
    );


  if (
    !progression?.resources
  ) {

    return progression;
  }


  const nextProgression =
    foundry.utils.deepClone(
      progression
    );


  let changed =
    false;


  for (
    const resource
    of Object.values(
      nextProgression.resources
    )
  ) {

    // A long rest includes a short rest.
    if (
      ![
        "long-rest",
        "short-rest"
      ].includes(
        resource
          ?.recovery
      )
    ) {

      continue;
    }


    const maximum =
      normalizeResourceAmount(
        resource.max
      );


    if (
      resource.value ===
      maximum
    ) {

      continue;
    }


    resource.value =
      maximum;

    changed =
      true;
  }


  if (
    changed
  ) {

    await trainer.setFlag(
      MODULE_ID,
      "trainerProgression",
      nextProgression
    );
  }


  return nextProgression;
}

export async function configureTrainerProgression(
  trainer,
  configuration
) {

  assertTrainer(
    trainer
  );


  const level =
    Math.trunc(
      Number(
        configuration?.level ??
        1
      )
    );


  if (
    level < 1 ||
    level >
      MAX_SUPPORTED_TRAINER_LEVEL
  ) {

    throw new Error(
      `Esta versión de Trainer Progression admite niveles 1 a ${MAX_SUPPORTED_TRAINER_LEVEL}.`
    );
  }


  const levelRule =
    getTrainerLevelRule(
      level
    );


  const origin =
    getTrainerOrigin(
      configuration
        ?.originId
    );


  if (!origin) {

    throw new Error(
      "Debes seleccionar un Trainer Origin válido."
    );
  }


  const path =
    level >= 2
      ? getTrainerPath(
          configuration
            ?.pathId
        )
      : null;


  if (
    level >= 2 &&
    !path
  ) {

    throw new Error(
      "Un Trainer de nivel 2 o superior requiere un Trainer Path."
    );
  }

  if (
    path?.requires
  ) {

    throw new Error(
      `${path.name} requiere el subsistema ${path.requires}, que todavía no está implementado.`
    );
  }

  const originChoices =
    configuration
      ?.originChoices ??
    {};

  const pathChoices =
    configuration
      ?.pathChoices ??
    {};


  const previous =
    getTrainerProgressionState(
      trainer
    );


  const abilities =
    normalizeBaseAbilities(
      configuration
        ?.baseAbilityScores
    );


  applyOriginAbilities(
    abilities,
    origin,
    originChoices
  );


  const {
    skills,
    selectedClassSkills
  } =
    buildTrainerSkills({

      level,

      classSkillIds:
        configuration
          ?.classSkillIds ??
        [],

      origin,
      originChoices,
      path,
      pathChoices
    });


  const specializationIds =
    buildSpecializationIds(
      configuration
        ?.specializationId,
      path,
      pathChoices,
      configuration
        ?.specializationIds ??
      null
    );


  applySpecializationBenefits(
    abilities,
    skills,
    specializationIds
  );


  const abilityScoreGains =
    normalizeAbilityScoreGains(
      configuration
        ?.abilityScoreGains ??
      previous
        ?.abilityScoreGains ??
      {}
    );


  applyAbilityScoreGains(
    abilities,
    abilityScoreGains
  );


  const saveIds =
    new Set([
      "cha",
      ...(
        origin
          .savingThrowProficiencies ??
        []
      )
    ]);


  const trainerResolveSaveId =
    level >= 10
      ? String(
          configuration
            ?.trainerResolveSaveId ??
          previous
            ?.trainerResolveSaveId ??
          ""
        ).trim()
      : null;


  if (
    level >= 10
  ) {

    if (
      !ABILITY_IDS.includes(
        trainerResolveSaveId
      )
    ) {

      throw new Error(
        "Trainer's Resolve requiere una Saving Throw válida."
      );
    }


    if (
      saveIds.has(
        trainerResolveSaveId
      )
    ) {

      throw new Error(
        "Trainer's Resolve debe otorgar proficiency en una Saving Throw nueva."
      );
    }


    saveIds.add(
      trainerResolveSaveId
    );
  }

  const epicBoonFeatName =
    level >= 19
      ? String(
          configuration
            ?.epicBoonFeatName ??
          previous
            ?.epicBoonFeatName ??
          ""
        ).trim()
      : null;


  if (
    level >= 19 &&
    !epicBoonFeatName
  ) {

    throw new Error(
      "Un Trainer de nivel 19 o superior requiere una elección de Epic Boon."
    );
  }

  const hpGains =
    foundry.utils.deepClone(
      configuration
        ?.hpGains ??
      previous
        ?.hpGains ??
      {}
    );

  const abilityScoreIncreaseHistory =
    foundry.utils.deepClone(
      configuration
        ?.abilityScoreIncreaseHistory ??
      previous
        ?.abilityScoreIncreaseHistory ??
      {}
    );

  const baseMovement =
    getBaseTrainerMovement(
      trainer,
      previous
    );


  const movement =
    buildTrainerMovement({

      baseMovement,
      origin,
      originChoices,
      path
    });

  const resources =
    {
      ...pathFeatureResources(
        path?.id,
        level,
        abilities,
        previous?.resources
      ),
      ...buildTrainerResources(
        path,
        level,
        levelRule
          .proficiencyBonus,
        previous?.resources
      )
    };


  const managedSkillIds =
    [
      ...skills.keys()
    ];


  const previousSkillIds =
    previous
      ?.managedSkillIds ??
    [];


  const previousSaveIds =
    previous
      ?.managedSaveIds ??
    [];


  const updates = {};

  updates[
    "system.attributes.movement.walk"
  ] =
    movement.walk;


  updates[
    "system.attributes.movement.climb"
  ] =
    movement.climb;


  updates[
    "system.attributes.movement.swim"
  ] =
    movement.swim;

  for (
    const id
    of ABILITY_IDS
  ) {

    updates[
      `system.abilities.${id}.value`
    ] =
      abilities[id];
  }


  for (
    const id
    of previousSkillIds
  ) {

    updates[
      `system.skills.${id}.value`
    ] =
      0;
  }


  for (
    const [
      id,
      value
    ]
    of skills
  ) {

    updates[
      `system.skills.${id}.value`
    ] =
      value;
  }


  for (
    const id
    of previousSaveIds
  ) {

    updates[
      `system.abilities.${id}.proficient`
    ] =
      0;
  }


  for (
    const id
    of saveIds
  ) {

    updates[
      `system.abilities.${id}.proficient`
    ] =
      1;
  }


  /*
   * Los regionales no existen en CONFIG.DND5E,
   * así que permanecen correctamente como
   * custom languages.
   */

  updates[
    "system.traits.languages.value"
  ] = [
    "common"
  ];

  updates[
    "system.traits.languages.custom"
  ] =
    origin.regionalLanguage;


  const hpMaximum =
    calculateTrainerHp(
      level,
      abilities.con,
      hpGains
    );


  const currentMaximum =
    Number(
      trainer.system
        ?.attributes
        ?.hp
        ?.max ??
      0
    );

  const currentValue =
    Number(
      trainer.system
        ?.attributes
        ?.hp
        ?.value ??
      currentMaximum
    );

  const existingDamage =
    Math.max(
      0,
      currentMaximum -
      currentValue
    );


  updates[
    "system.attributes.hp.max"
  ] =
    hpMaximum;

  updates[
    "system.attributes.hp.value"
  ] =
    Math.max(
      0,
      hpMaximum -
      existingDamage
    );


  await trainer.update(
    updates
  );


  await trainer.setFlag(
    MODULE_ID,
    "trainerLevel",
    level
  );


  const progression = {

    version:
      PROGRESSION_VERSION,

    baseMovement:
      foundry.utils.deepClone(
        baseMovement
      ),

    baseAbilityScores:
      normalizeBaseAbilities(
        configuration
          ?.baseAbilityScores
      ),

    abilityScoreGains:
      foundry.utils.deepClone(
        abilityScoreGains
      ),

    abilityScoreIncreaseHistory,

    hpGains,

    origin: {
      id:
        origin.id,

      choices:
        foundry.utils.deepClone(
          originChoices
        )
    },

    classSkillIds:
      selectedClassSkills,

    specializationIds,

    path:
      path
        ? {
            id:
              path.id,

            choices:
              foundry.utils.deepClone(
                pathChoices
              )
          }
        : null,

    resources,

    managedSkillIds,

    managedSaveIds: [
      ...saveIds
    ],

    trainerResolveSaveId,

    epicBoonFeatName,

    /*
     * Kantoan puede elegir cualquier Feat.
     * Lo registramos canónicamente, pero
     * todavía no creamos un Item porque
     * el subsystem Feats no está implementado.
     */

    pendingFeat:
      origin.id ===
      "kantoan"
        ? String(
            originChoices
              .kantoFeatName ??
            ""
          ).trim() ||
          null
        : null
  };


  await trainer.setFlag(
    MODULE_ID,
    "trainerProgression",
    progression
  );


  await ensureProficiencyEffect(
    trainer,
    levelRule
      .proficiencyBonus
  );

  await synchronizeTrainerFeatures(
    trainer,
    {
      progression,
      level
    }
  );

  return progression;
}