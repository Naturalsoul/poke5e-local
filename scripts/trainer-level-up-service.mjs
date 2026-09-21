import {
  configureTrainerProgression,
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";

import {
  getTrainerLevel,
  isTrainerActor
} from "./trainer-service.mjs";

import {
  MAX_SUPPORTED_TRAINER_LEVEL,
  getTrainerSpecialization
} from "./trainer-rules.mjs";

const ABILITY_SCORE_INCREASE_POINTS =
  2;

const ABILITY_SCORE_CAP =
  20;

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

function assertTrainer(
  trainer
) {

  if (
    !isTrainerActor(
      trainer
    )
  ) {

    throw new Error(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


function assertProgression(
  progression
) {

  if (
    !progression?.origin?.id ||
    !Array.isArray(
      progression
        .specializationIds
    ) ||
    !progression
      .specializationIds
      .length
  ) {

    throw new Error(
      "El Trainer no posee un estado de progresión válido."
    );
  }
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

function trainerAbilityScores(
  trainer
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          trainer.system
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
      numeric < 0 ||
      numeric > 2
    ) {

      throw new Error(
        `${abilityId.toUpperCase()}: el aumento debe ser 0, 1 o 2.`
      );
    }


    const current =
      preview
        .abilityScoreIncrease
        .currentScores[
          abilityId
        ];


    if (
      current +
      numeric >
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
 * PREVIEW
 * ============================================================ */

export function getTrainerLevelUpPreview(
  trainer
) {

  assertTrainer(
    trainer
  );


  const currentLevel =
    getTrainerLevel(
      trainer
    );


  const nextLevel =
    currentLevel + 1;


  const progression =
    getTrainerProgressionState(
      trainer
    );


  assertProgression(
    progression
  );


  const requiresAbilityScoreIncrease =
    ABILITY_SCORE_INCREASE_LEVELS.has(
      nextLevel
    );


  const pathId =
    progression
      ?.path
      ?.id ??
    null;


  let pathFeatureChoice =
    null;


  if (
    nextLevel === 9 &&
    pathId === "ace-trainer"
  ) {

    pathFeatureChoice =
      "ace-trainer-ability";
  }


  if (
    nextLevel === 9 &&
    pathId === "type-master"
  ) {

    pathFeatureChoice =
      "type-master-resistance";
  }


  return {
    currentLevel,
    nextLevel,

    canLevelUp:
      nextLevel <=
      MAX_SUPPORTED_TRAINER_LEVEL,

    requiresPath:
      currentLevel === 1 &&
      nextLevel === 2 &&
      !progression.path,

    requiresSpecialization:
      nextLevel === 7 ||
      nextLevel === 18,

    requiresEpicBoon:
      nextLevel === 19,

    pathFeatureChoice,

    requiresTrainerResolveSave:
      nextLevel === 10,

    pathId,

    conModifier:
      abilityModifier(
        trainer.system
          ?.abilities
          ?.con
          ?.value
      ),

    abilityScoreIncrease: {
      required:
        requiresAbilityScoreIncrease,

      points:
        requiresAbilityScoreIncrease
          ? ABILITY_SCORE_INCREASE_POINTS
          : 0,

      cap:
        ABILITY_SCORE_CAP,

      currentScores:
        trainerAbilityScores(
          trainer
        )
    }
  };
}

/* ============================================================
 * HP
 * ============================================================ */

async function resolveTrainerHpBase(
  mode
) {

  if (
    mode ===
    "fixed"
  ) {

    return {
      mode:
        "fixed",

      base:
        4
    };
  }


  if (
    mode !==
    "roll"
  ) {

    throw new Error(
      "Debes elegir cómo obtener los HP del nuevo nivel."
    );
  }


  const roll =
    await new Roll(
      "1d6"
    ).evaluate();


  const result =
    Number(
      roll.total
    );


  if (
    !Number.isFinite(
      result
    )
  ) {

    throw new Error(
      "No se pudo resolver la tirada de HP."
    );
  }


  return {
    mode:
      "roll",

    base:
      Math.trunc(
        result
      )
  };
}


/* ============================================================
 * CONFIGURATION
 * ============================================================ */

function nextTrainerConfiguration(
  trainer,
  {
    pathId = null,
    pathChoices = {},
    specializationId = null,
    trainerResolveSaveId = null,
    epicBoonFeatName = null,
    hpGains = {},
    abilityScoreGains = {},
    abilityScoreIncreaseHistory = {}
  } = {}
) {

  const preview =
    getTrainerLevelUpPreview(
      trainer
    );


  if (
    !preview.canLevelUp
  ) {

    throw new Error(
      `Trainer Level Up está implementado actualmente hasta nivel ${MAX_SUPPORTED_TRAINER_LEVEL}.`
    );
  }


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const existingPathId =
    progression
      .path
      ?.id ??
    null;


  const requestedPathId =
    pathId
      ? String(
          pathId
        )
      : null;


  if (
    existingPathId &&
    requestedPathId &&
    requestedPathId !==
      existingPathId
  ) {

    throw new Error(
      "El Trainer Path no puede cambiarse durante un Level Up."
    );
  }


  const resolvedPathId =
    preview.nextLevel >= 2
      ? (
          existingPathId ??
          requestedPathId
        )
      : null;


  if (
    preview.nextLevel >= 2 &&
    !resolvedPathId
  ) {

    throw new Error(
      "Al alcanzar nivel 2 debes seleccionar un Trainer Path."
    );
  }


  const resolvedPathChoices = {
    ...foundry.utils.deepClone(
      progression
        .path
        ?.choices ??
      {}
    ),

    ...foundry.utils.deepClone(
      pathChoices ??
      {}
    )
  };


  const specializationIds = [
    ...(
      progression
        .specializationIds ??
      []
    )
  ];


  if (
    preview.requiresSpecialization
  ) {

    const specialization =
      getTrainerSpecialization(
        specializationId
      );


    if (!specialization) {

      throw new Error(
        `Al alcanzar nivel ${preview.nextLevel} debes seleccionar una Specialization válida.`
      );
    }


    /*
     * Poke5e permite stackear Specializations,
     * por lo que no eliminamos duplicados.
     */

    specializationIds.push(
      specialization.id
    );
  }


  let resolvedTrainerResolveSaveId =
    progression
      ?.trainerResolveSaveId ??
    null;


  if (
    preview.requiresTrainerResolveSave
  ) {

    resolvedTrainerResolveSaveId =
      String(
        trainerResolveSaveId ??
        ""
      ).trim();


    if (
      !resolvedTrainerResolveSaveId
    ) {

      throw new Error(
        "Trainer's Resolve requiere seleccionar una Saving Throw proficiency adicional."
      );
    }
  }

  let resolvedEpicBoonFeatName =
    progression
      ?.epicBoonFeatName ??
    null;


  if (
    preview.requiresEpicBoon
  ) {

    resolvedEpicBoonFeatName =
      String(
        epicBoonFeatName ??
        ""
      ).trim();


    if (
      !resolvedEpicBoonFeatName
    ) {

      throw new Error(
        "Epic Boon requiere seleccionar un Feat."
      );
    }
  }

  return {
    level:
      preview.nextLevel,

    baseAbilityScores:
      foundry.utils.deepClone(
        progression
          .baseAbilityScores
      ),

    abilityScoreGains:
      foundry.utils.deepClone(
        abilityScoreGains
      ),

    abilityScoreIncreaseHistory:
      foundry.utils.deepClone(
        abilityScoreIncreaseHistory
      ),

    hpGains:
      foundry.utils.deepClone(
        hpGains
      ),

    originId:
      progression
        .origin
        .id,

    originChoices:
      foundry.utils.deepClone(
        progression
          .origin
          .choices ??
        {}
      ),

    classSkillIds:
      [
        ...(
          progression
            .classSkillIds ??
          []
        )
      ],

    specializationId:
      specializationIds[0],

    specializationIds,

    pathId:
      resolvedPathId,

    pathChoices:
      resolvedPathChoices,

    trainerResolveSaveId:
      resolvedTrainerResolveSaveId,

    epicBoonFeatName:
      resolvedEpicBoonFeatName
  };
}


/* ============================================================
 * LEVEL UP
 * ============================================================ */

export async function levelUpTrainer(
  trainer,
  {
    pathId = null,
    pathChoices = {},
    specializationId = null,
    trainerResolveSaveId = null,
    epicBoonFeatName = null,
    hpMode = "fixed",
    abilityScoreIncreases = {}
  } = {}
) {

  const before =
    getTrainerLevelUpPreview(
      trainer
    );


  if (
    !before.canLevelUp
  ) {

    throw new Error(
      `Trainer Level Up está implementado actualmente hasta nivel ${MAX_SUPPORTED_TRAINER_LEVEL}.`
    );
  }


  const previous =
    getTrainerProgressionState(
      trainer
    );


  const resolvedAbilityScoreIncreases =
    resolveAbilityScoreIncreases(
      before,
      abilityScoreIncreases
    );


  const previousAbilityScoreGains =
    progressionAbilityScoreGains(
      previous
    );


  const nextAbilityScoreGains =
    mergeAbilityScoreGains(
      previousAbilityScoreGains,
      resolvedAbilityScoreIncreases
    );


  const abilityScoreIncreaseHistory =
    foundry.utils.deepClone(
      previous
        ?.abilityScoreIncreaseHistory ??
      {}
    );


  if (
    before
      .abilityScoreIncrease
      .required
  ) {

    abilityScoreIncreaseHistory[
      String(
        before.nextLevel
      )
    ] = {

      increases:
        foundry.utils.deepClone(
          resolvedAbilityScoreIncreases
        ),

      points:
        before
          .abilityScoreIncrease
          .points,

      cap:
        before
          .abilityScoreIncrease
          .cap
    };
  }


  const hpGain =
    await resolveTrainerHpBase(
      hpMode
    );


  const hpGains =
    foundry.utils.deepClone(
      previous
        ?.hpGains ??
      {}
    );


  hpGains[
    String(
      before.nextLevel
    )
  ] =
    hpGain;


  const configuration =
    nextTrainerConfiguration(
      trainer,
      {
        pathId,
        pathChoices,
        specializationId,
        trainerResolveSaveId,
        epicBoonFeatName,
        hpGains,

        abilityScoreGains:
          nextAbilityScoreGains,

        abilityScoreIncreaseHistory
      }
    );


  const progression =
    await configureTrainerProgression(
      trainer,
      configuration
    );


  const conModifier =
    abilityModifier(
      trainer.system
        ?.abilities
        ?.con
        ?.value
    );


  return {
    trainer,

    previousLevel:
      before.currentLevel,

    level:
      before.nextLevel,

    hpGain: {
      ...hpGain,

      conModifier,

      total:
        Math.max(
          1,
          hpGain.base +
          conModifier
        )
    },

    abilityScoreIncreases:
      resolvedAbilityScoreIncreases,

    progression
  };
}