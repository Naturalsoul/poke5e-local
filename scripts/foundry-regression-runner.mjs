import {
  POKEMON_TYPE_IDS
} from "./types.mjs";

import {
  cleanupFoundryRegressionFixtures,
  runFoundryRegressionFixtures
} from "./foundry-regression-fixtures.mjs";

import {
  runFoundryActivityFixtures
} from "./foundry-regression-activity-fixtures.mjs";

import {
  runFoundrySaveFixtures
} from "./foundry-regression-save-fixtures.mjs";

import {
  activePokemonAbilityId
} from "./status-runtime.mjs";

import {
  STRUGGLE_ACTIVITY_IDS,
  STRUGGLE_MOVE_ID,
  STRUGGLE_RULE
} from "./struggle-rules.mjs";

const MODULE_ID =
  "poke5e-local";

const EXPECTED_SYSTEM =
  "dnd5e";

const EXPECTED_VERSION =
  "5.3.3";

const REQUIRED_STATUS_IDS =
  Object.freeze([
    "poke5e-paralysis",
    "poke5e-asleep",
    "poke5e-burned",
    "poke5e-frozen",
    "poke5e-confused",
    "poke5e-flinched"
  ]);

const DYNAMIC_DAMAGE_KINDS =
  new Set([
    "magnitude",
    "rollout",
    "outrage"
  ]);

const TRACE_HOOKS =
  Object.freeze([
    "dnd5e.preUseActivity",
    "dnd5e.postUseActivity",
    "dnd5e.preCreateUsageMessage",
    "dnd5e.postCreateUsageMessage",
    "dnd5e.preRollAttack",
    "dnd5e.postAttackRollConfiguration",
    "dnd5e.rollAttack",
    "dnd5e.postRollAttack",
    "dnd5e.preRollDamage",
    "dnd5e.postDamageRollConfiguration",
    "dnd5e.rollDamage",
    "dnd5e.postRollConfiguration",
    "dnd5e.preRollSavingThrow",
    "dnd5e.rollSavingThrow",
    "dnd5e.preBeginConcentrating",
    "dnd5e.beginConcentrating",
    "dnd5e.preEndConcentration",
    "dnd5e.endConcentration",
    "dnd5e.preCalculateDamage",
    "dnd5e.calculateDamage",
    "dnd5e.preApplyDamage",
    "dnd5e.applyDamage",
    "combatTurnChange",
    "createActiveEffect",
    "deleteActiveEffect"
  ]);

const traceState = {
  active: false,
  sequence: 0,
  events: []
};


/* ============================================================
 * RESULT
 * ============================================================ */

function result(
  status,
  id,
  message,
  details = null
) {

  return {
    status,
    id,
    message,
    details
  };
}


function pass(
  id,
  message,
  details = null
) {

  return result(
    "pass",
    id,
    message,
    details
  );
}


function fail(
  id,
  message,
  details = null
) {

  return result(
    "fail",
    id,
    message,
    details
  );
}


function skip(
  id,
  message,
  details = null
) {

  return result(
    "skip",
    id,
    message,
    details
  );
}


/* ============================================================
 * SAFE VALIDATION
 * ============================================================ */

function validateDataModel(
  document,
  id,
  label
) {

  if (
    typeof document?.validate !==
      "function"
  ) {

    return skip(
      id,
      `${label}: validate() no está disponible.`
    );
  }


  try {

    const valid =
      document.validate({
        strict: true
      });


    return valid === false

      ? fail(
          id,
          `${label}: DataModel inválido.`,
          document.validationFailures ??
            null
        )

      : pass(
          id,
          `${label}: DataModel válido.`
        );

  } catch (
    error
  ) {

    return fail(
      id,
      `${label}: DataModel lanzó una validación estricta.`,
      error.message
    );
  }
}


/* ============================================================
 * ACTOR SELECTION
 * ============================================================ */

function isPokemonActor(
  actor
) {

  return Boolean(
    actor?.getFlag?.(
      MODULE_ID,
      "sourceId"
    )
  );
}


function actorFromUuid(
  uuid
) {

  if (!uuid) {

    return null;
  }


  try {

    const document =
      fromUuidSync(
        uuid,
        {
          strict: false
        }
      );


    if (
      document?.documentName ===
        "Actor"
    ) {

      return document;
    }


    return (
      document?.actor ??
      null
    );

  } catch {

    return null;
  }
}


function selectedPokemonActors(
  actorUuid
) {

  if (
    actorUuid
  ) {

    const actor =
      actorFromUuid(
        actorUuid
      );


    return isPokemonActor(
      actor
    )

      ? [actor]

      : [];
  }


  return game.actors.filter(
    isPokemonActor
  );
}


/* ============================================================
 * SYSTEM CHECKS
 * ============================================================ */

function systemChecks() {

  const checks = [];


  checks.push(
    game.system.id ===
      EXPECTED_SYSTEM

      ? pass(
          "system.id",
          `Sistema ${EXPECTED_SYSTEM} activo.`
        )

      : fail(
          "system.id",
          `Se esperaba ${EXPECTED_SYSTEM} y está activo ${game.system.id}.`
        )
  );


  checks.push(
    game.system.version ===
      EXPECTED_VERSION

      ? pass(
          "system.version",
          `D&D5e ${EXPECTED_VERSION} coincide con la versión validada.`
        )

      : fail(
          "system.version",
          `Se esperaba D&D5e ${EXPECTED_VERSION}; versión actual ${game.system.version}.`
        )
  );


  return checks;
}


function damageTypeChecks() {

  const damageTypes =
    CONFIG.DND5E
      ?.damageTypes ??
    {};


  const missing =
    POKEMON_TYPE_IDS.filter(
      type =>
        !damageTypes[type]
    );


  return [
    missing.length

      ? fail(
          "pokemon.damage-types",
          "Faltan tipos Pokémon registrados en CONFIG.DND5E.damageTypes.",
          missing
        )

      : pass(
          "pokemon.damage-types",
          `${POKEMON_TYPE_IDS.length} tipos Pokémon registrados.`
        )
  ];
}


function statusChecks() {

  const statusIds =
    new Set(
      CONFIG.statusEffects.map(
        effect =>
          String(
            effect.id ??
            ""
          )
      )
    );


  const missing =
    REQUIRED_STATUS_IDS.filter(
      statusId =>
        !statusIds.has(
          statusId
        )
    );


  return [
    missing.length

      ? fail(
          "pokemon.status-registry",
          "Faltan estados Pokémon registrados en CONFIG.statusEffects.",
          missing
        )

      : pass(
          "pokemon.status-registry",
          `${REQUIRED_STATUS_IDS.length} estados custom requeridos registrados.`
        )
  ];
}


/* ============================================================
 * DAMAGE PARTS
 * ============================================================ */

function damageParts(
  activity
) {

  return Array.from(
    activity?.damage
      ?.parts ??
    []
  );
}


function customDamageFormula(
  part
) {

  if (
    part?.custom?.enabled !==
      true
  ) {

    return null;
  }


  return String(
    part.custom.formula ??
    ""
  ).trim();
}


function validateCustomDamageFormula(
  formula
) {

  if (!formula) {

    return false;
  }


  try {

    return Roll.validate(
      formula
    );

  } catch {

    return false;
  }
}


/* ============================================================
 * ACTOR CONTRACTS
 * ============================================================ */

function actorLevelCheck(
  actor
) {

  const level =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      )
    );


  return (
    Number.isInteger(
      level
    ) &&
    level >= 1 &&
    level <= 20
  )

    ? pass(
        `${actor.uuid}.level`,
        `${actor.name}: nivel ${level}.`
      )

    : fail(
        `${actor.uuid}.level`,
        `${actor.name}: flags.${MODULE_ID}.level inválido.`,
        level
      );
}


function actorTypesCheck(
  actor
) {

  const types =
    actor.getFlag(
      MODULE_ID,
      "types"
    );


  if (
    !Array.isArray(
      types
    ) ||
    !types.length
  ) {

    return fail(
      `${actor.uuid}.types`,
      `${actor.name}: no posee types canónicos.`
    );
  }


  const invalid =
    types.filter(
      type =>
        !POKEMON_TYPE_IDS.includes(
          String(type)
            .trim()
            .toLowerCase()
        )
    );


  return invalid.length

    ? fail(
        `${actor.uuid}.types`,
        `${actor.name}: contiene tipos no canónicos.`,
        invalid
      )

    : pass(
        `${actor.uuid}.types`,
        `${actor.name}: tipos ${types.join("/")}.`
      );
}


function activeAbilityCheck(
  actor
) {

  const configured =
    String(
      actor.getFlag(
        MODULE_ID,
        "activeAbilityId"
      ) ??
      ""
    )
      .trim()
      .toLowerCase();


  const resolved =
    activePokemonAbilityId(
      actor
    );


  if (
    !configured
  ) {

    return skip(
      `${actor.uuid}.active-ability`,
      `${actor.name}: no tiene activeAbilityId explícito; se conserva compatibilidad legacy.`,
      {
        resolved
      }
    );
  }


  return resolved ===
    configured

    ? pass(
        `${actor.uuid}.active-ability`,
        `${actor.name}: Ability activa ${configured}.`
      )

    : fail(
        `${actor.uuid}.active-ability`,
        `${actor.name}: activeAbilityId no resuelve a una Ability disponible.`,
        {
          configured,
          resolved
        }
      );
}


/* ============================================================
 * ITEMS / ACTIVITIES
 * ============================================================ */

function moveActivities(
  item
) {

  return Array.from(
    item?.system
      ?.activities ??
    []
  );
}


function activityChecks(
  actor,
  item
) {

  const checks = [];


  for (
    const activity
    of moveActivities(
      item
    )
  ) {

    checks.push(
      validateDataModel(
        activity,
        `${activity.uuid ?? activity.id}.datamodel`,
        `${actor.name} / ${item.name} / ${activity.name}`
      )
    );


    for (
      const part
      of damageParts(
        activity
      )
    ) {

      const formula =
        customDamageFormula(
          part
        );


      if (!formula) {

        continue;
      }


      checks.push(
        validateCustomDamageFormula(
          formula
        )

          ? pass(
              `${activity.uuid ?? activity.id}.damage.${formula}`,
              `${item.name}: fórmula custom ejecutable (${formula}).`
            )

          : fail(
              `${activity.uuid ?? activity.id}.damage.${formula}`,
              `${item.name}: fórmula custom inválida para Foundry.`,
              formula
            )
      );
    }
  }


  return checks;
}


function dynamicDamageChecks(
  actor,
  item
) {

  const definition =
    item.getFlag(
      MODULE_ID,
      "dynamicDamage"
    );


  if (!definition) {

    return [];
  }


  const checks = [];


  if (
    definition.implemented !==
      true
  ) {

    checks.push(
      skip(
        `${item.uuid}.dynamic-damage`,
        `${actor.name} / ${item.name}: dynamicDamage existe pero no está implementado.`,
        definition
      )
    );


    return checks;
  }


  checks.push(
    DYNAMIC_DAMAGE_KINDS.has(
      definition.kind
    )

      ? pass(
          `${item.uuid}.dynamic-kind`,
          `${item.name}: dynamicDamage ${definition.kind}.`
        )

      : fail(
          `${item.uuid}.dynamic-kind`,
          `${item.name}: kind dinámico desconocido.`,
          definition.kind
        )
  );


  const rejected =
    Array.isArray(
      definition.rejectedFormulas
    )

      ? definition.rejectedFormulas
          .filter(Boolean)

      : [];


  checks.push(
    rejected.length === 1

      ? pass(
          `${item.uuid}.dynamic-source`,
          `${item.name}: conserva una fórmula dinámica fuente.`
        )

      : fail(
          `${item.uuid}.dynamic-source`,
          `${item.name}: se esperaba exactamente una rejectedFormula.`,
          rejected
        )
  );


  const placeholders =
    moveActivities(
      item
    )
      .flatMap(
        damageParts
      )
      .map(
        customDamageFormula
      )
      .filter(
        formula =>
          formula === "0"
      );


  checks.push(
    placeholders.length

      ? pass(
          `${item.uuid}.dynamic-placeholder`,
          `${item.name}: placeholder de daño dinámico presente.`
        )

      : fail(
          `${item.uuid}.dynamic-placeholder`,
          `${item.name}: falta el placeholder 0 requerido por Dynamic Damage Engine.`
        )
  );


  return checks;
}


function struggleChecks(
  actor
) {

  const item =
    actor.items.find(
      candidate =>
        candidate.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          STRUGGLE_MOVE_ID
    );


  if (!item) {

    return [
      fail(
        `${actor.uuid}.struggle`,
        `${actor.name}: no tiene Struggle importado; requiere reimportación.`
      )
    ];
  }


  const activityIds =
    new Set(
      moveActivities(
        item
      ).map(
        activity =>
          activity.id
      )
    );


  const missing =
    Object.values(
      STRUGGLE_ACTIVITY_IDS
    ).filter(
      activityId =>
        !activityIds.has(
          activityId
        )
    );


  const metadata =
    item.getFlag(
      MODULE_ID,
      "struggle"
    );


  return [
    missing.length

      ? fail(
          `${actor.uuid}.struggle-activities`,
          `${actor.name}: faltan Activities de Struggle.`,
          missing
        )

      : pass(
          `${actor.uuid}.struggle-activities`,
          `${actor.name}: Activities melee/ranged de Struggle presentes.`
        ),

    metadata?.noAmplification ===
      STRUGGLE_RULE.noAmplification

      ? pass(
          `${actor.uuid}.struggle-amplification`,
          `${actor.name}: Struggle conserva noAmplification.`
        )

      : fail(
          `${actor.uuid}.struggle-amplification`,
          `${actor.name}: metadata noAmplification de Struggle inconsistente.`,
          metadata
        )
  ];
}


function actorChecks(
  actor
) {

  const checks = [
    validateDataModel(
      actor,
      `${actor.uuid}.datamodel`,
      actor.name
    ),
    actorLevelCheck(
      actor
    ),
    actorTypesCheck(
      actor
    ),
    activeAbilityCheck(
      actor
    )
  ];


  for (
    const item
    of actor.items
  ) {

    checks.push(
      validateDataModel(
        item,
        `${item.uuid}.datamodel`,
        `${actor.name} / ${item.name}`
      )
    );


    if (
      item.getFlag?.(
        MODULE_ID,
        "kind"
      ) !==
        "move"
    ) {

      continue;
    }


    checks.push(
      ...activityChecks(
        actor,
        item
      )
    );


    checks.push(
      ...dynamicDamageChecks(
        actor,
        item
      )
    );
  }


  checks.push(
    ...struggleChecks(
      actor
    )
  );


  return checks;
}


/* ============================================================
 * SUMMARY
 * ============================================================ */

function summarize(
  checks
) {

  const summary = {
    total:
      checks.length,

    pass:
      0,

    fail:
      0,

    skip:
      0
  };


  for (
    const check
    of checks
  ) {

    if (
      Object.hasOwn(
        summary,
        check.status
      )
    ) {

      summary[check.status] +=
        1;
    }
  }


  return summary;
}


function notifySummary(
  summary
) {

  const text =
    `Poke5e Regression: ${summary.pass} PASS · ` +
    `${summary.fail} FAIL · ${summary.skip} SKIP.`;


  if (
    summary.fail > 0
  ) {

    ui.notifications.error(
      text
    );

    return;
  }


  ui.notifications.info(
    text
  );
}


/* ============================================================
 * PUBLIC: SMOKE
 * ============================================================ */

export async function runFoundryRegressionSmoke({
  actorUuid = null,
  notify = true
} = {}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Foundry Regression Runner requiere un usuario GM."
    );
  }


  const checks = [
    ...systemChecks(),
    ...damageTypeChecks(),
    ...statusChecks()
  ];


  const actors =
    selectedPokemonActors(
      actorUuid
    );


  if (
    !actors.length
  ) {

    checks.push(
      skip(
        "pokemon.actors",
        actorUuid
          ? "El Actor indicado no es un Pokémon Poke5e resoluble."
          : "No hay Pokémon importados para validar."
      )
    );

  } else {

    checks.push(
      pass(
        "pokemon.actors",
        `${actors.length} Pokémon seleccionado(s) para smoke test.`
      )
    );


    for (
      const actor
      of actors
    ) {

      checks.push(
        ...actorChecks(
          actor
        )
      );
    }
  }


  const summary =
    summarize(
      checks
    );


  if (
    notify
  ) {

    notifySummary(
      summary
    );
  }


  return {
    kind:
      "poke5e-foundry-regression-smoke",

    system: {
      id:
        game.system.id,

      version:
        game.system.version
    },

    actorUuids:
      actors.map(
        actor =>
          actor.uuid
      ),

    summary,
    checks
  };
}


/* ============================================================
 * TRACE
 * ============================================================ */

function traceArgument(
  value
) {

  if (
    Array.isArray(
      value
    )
  ) {

    const first =
      value[0];


    if (
      first?.formula
    ) {

      return {
        kind:
          "rolls",

        count:
          value.length,

        formulas:
          value.map(
            roll =>
              roll?.formula ??
              null
          )
      };
    }


    return {
      kind:
        "array",

      count:
        value.length
    };
  }


  if (
    value?.documentName
  ) {

    return {
      kind:
        value.documentName,

      uuid:
        value.uuid ??
        null,

      name:
        value.name ??
        null
    };
  }


  if (
    value?.subject?.item
  ) {

    return {
      kind:
        "configuration",

      activityId:
        value.subject.id ??
        null,

      itemUuid:
        value.subject.item.uuid ??
        null,

      itemName:
        value.subject.item.name ??
        null
    };
  }


  if (
    value?.formula
  ) {

    return {
      kind:
        "roll",

      formula:
        value.formula,

      total:
        value.total ??
        null
    };
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {

    return {
      kind:
        "object",

      keys:
        Object.keys(
          value
        ).slice(
          0,
          8
        )
    };
  }


  return value ??
    null;
}


function recordTraceEvent(
  hookName,
  args
) {

  if (
    !traceState.active
  ) {

    return;
  }


  traceState.sequence +=
    1;


  traceState.events.push({
    sequence:
      traceState.sequence,

    hook:
      hookName,

    timestamp:
      Date.now(),

    args:
      Array.from(
        args
      )
        .slice(
          0,
          4
        )
        .map(
          traceArgument
        )
  });
}


function startTrace() {

  traceState.active =
    true;

  traceState.sequence =
    0;

  traceState.events =
    [];


  return {
    active:
      true,

    hooks:
      [...TRACE_HOOKS]
  };
}


function stopTrace() {

  traceState.active =
    false;


  return {
    active:
      false,

    events:
      foundry.utils.deepClone(
        traceState.events
      )
  };
}


function clearTrace() {

  traceState.sequence =
    0;

  traceState.events =
    [];


  return [];
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerFoundryRegressionRunner() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  for (
    const hookName
    of TRACE_HOOKS
  ) {

    Hooks.on(
      hookName,
      (...args) => {
        recordTraceEvent(
          hookName,
          args
        );
      }
    );
  }


  globalThis.Poke5eRegression =
    Object.freeze({
      runSmoke:
        runFoundryRegressionSmoke,

      runFixtures:
        runFoundryRegressionFixtures,

      runActivityFixtures:
        runFoundryActivityFixtures,

      runSaveFixtures:
        runFoundrySaveFixtures,

      cleanupFixtures:
        cleanupFoundryRegressionFixtures,

      startTrace,
      stopTrace,
      clearTrace
    });
}
