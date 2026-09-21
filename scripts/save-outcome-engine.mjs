import {
  BERSERK_ABILITY_ID,
  hasActiveBerserk
} from "./berserk-runtime.mjs";

import {
  hasPokemonStatus
} from "./status-runtime.mjs";

const MODULE_ID = "poke5e-local";
const CONTEXT_TTL = 5 * 60 * 1000;

const TARGET_SAVE_ADVANTAGE_FLAG =
  "targetSaveAdvantage";

const FLINCHED_STATUS_ID =
  "flinched";
/*
 * Resultados por utilización del Move.
 *
 * usageMessageId
 * └── targets
 *     ├── Actor UUID → success
 *     └── Actor UUID → failure
 */
const saveUsages = new Map();

/*
 * Contextos de botones de Save actualmente en resolución.
 *
 * D&D5e 5.3.3 no pasa el Usage Message a
 * actor.rollSavingThrow(), por lo que capturamos el click
 * ANTES de que D&D5e procese el botón.
 */
const pendingSaveContexts = [];

/* ============================================================
 * REGISTRATION
 * ============================================================ */

export function registerSaveOutcomeEngine() {

  /*
   * Snapshot de modificadores dependientes del usuario
   * en el Usage Message de la Save.
   */

  Hooks.on(
    "dnd5e.preCreateUsageMessage",
    onPreCreateUsageMessage
  );


  /*
   * capture:true es intencional.
   *
   * Necesitamos registrar qué Usage Card inició las saves
   * antes de que el listener de D&D5e empiece a tirarlas.
   */

  document.addEventListener(
    "click",
    onSaveButtonCapture,
    true
  );


  Hooks.on(
    "dnd5e.preRollSavingThrow",
    onPreRollSavingThrow
  );


  Hooks.on(
    "dnd5e.postRollConfiguration",
    onPostRollConfiguration
  );


  Hooks.on(
    "dnd5e.rollSavingThrow",
    onRollSavingThrow
  );


  Hooks.on(
    "dnd5e.preCalculateDamage",
    onPreCalculateDamage
  );


  Hooks.on(
    "deleteChatMessage",
    onDeleteChatMessage
  );


  console.log(
    `[${MODULE_ID}] Save Outcome Engine registrado.`
  );
}

/* ============================================================
 * PUBLIC API
 * ============================================================ */

export function getSaveUsage(
  messageOrId
) {
  const id =
    typeof messageOrId === "string"
      ? messageOrId
      : messageOrId?.id;

  return id
    ? saveUsages.get(id) ?? null
    : null;
}

export function getSaveOutcome(
  messageOrId,
  actorOrUuid
) {
  const usage =
    getSaveUsage(
      messageOrId
    );

  if (!usage) {
    return null;
  }

  const uuid =
    typeof actorOrUuid === "string"
      ? actorOrUuid
      : actorOrUuid?.uuid;

  if (!uuid) {
    return null;
  }

  return (
    usage.targets.get(uuid) ??
    null
  );
}

export function getSaveProgress(
  messageOrId
) {
  const usage =
    getSaveUsage(
      messageOrId
    );

  if (!usage) {
    return {
      expected: 0,
      resolved: 0,
      pending: 0,
      complete: false
    };
  }

  const expectedUuids =
    usage.expectedActorUuids instanceof Set
      ? usage.expectedActorUuids
      : new Set(
          usage.targets.keys()
        );

  let resolved = 0;

  for (const uuid of expectedUuids) {
    if (
      usage.targets.has(
        uuid
      )
    ) {
      resolved += 1;
    }
  }

  const expected =
    expectedUuids.size;

  const pending =
    Math.max(
      0,
      expected - resolved
    );

  return {
    expected,
    resolved,
    pending,

    complete:
      expected > 0 &&
      pending === 0
  };
}

export function getDamageUsageMessage(
  damageMessage
) {
  if (!damageMessage) {
    return null;
  }

  return (
    damageMessage.getOriginatingMessage?.() ??
    damageMessage
  );
}

function activityActivationType(
  activity
) {

  const raw =
    typeof activity?.activation?.type ===
      "string"

      ? activity.activation.type

      : activity?.activation?.type
        ?.value;


  return String(
    raw ??
    ""
  )
    .trim()
    .toLowerCase();
}


function resolveTargetSaveAdvantageSources(
  activity
) {

  const actor =
    activity?.item?.actor;


  if (!actor) {

    return [];
  }


  const sources =
    [];


  if (
    hasActiveBerserk(
      actor
    )
  ) {

    sources.push(
      BERSERK_ABILITY_ID
    );
  }


  /*
   * Poke5e dice específicamente "uses an action".
   *
   * Bonus Actions y Reactions no reciben esta parte
   * de Flinched.
   */

  if (
    hasPokemonStatus(
      actor,
      FLINCHED_STATUS_ID
    ) &&

    activityActivationType(
      activity
    ) ===
      "action"
  ) {

    sources.push(
      FLINCHED_STATUS_ID
    );
  }


  return [
    ...new Set(
      sources
    )
  ];
}


function normalizeTargetSaveAdvantageSources(
  value
) {

  if (!Array.isArray(value)) {

    return [];
  }


  return [
    ...new Set(
      value
        .map(
          source =>
            String(
              source ??
              ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
    )
  ];
}

/* ============================================================
 * SAVE BUTTON CAPTURE
 * ============================================================ */

function onSaveButtonCapture(event) {
  const button =
    event.target.closest(
      'button[data-action="rollSave"]'
    );

  if (!button) {
    return;
  }

  const messageElement =
    button.closest(
      "[data-message-id]"
    );

  const messageId =
    messageElement?.dataset
      ?.messageId;

  if (!messageId) {
    return;
  }

  const message =
    game.messages.get(
      messageId
    );

  if (!message) {
    return;
  }

  const item =
    message.getAssociatedItem?.();

  if (
    !isPoke5eMove(item)
  ) {
    return;
  }

  const activity =
    message.getAssociatedActivity?.();

  if (
    activity?.type !== "save"
  ) {
    return;
  }

  const targetSaveAdvantage =
    message.getFlag?.(
      MODULE_ID,
      TARGET_SAVE_ADVANTAGE_FLAG
    );


  const saveAdvantageSources =
    normalizeTargetSaveAdvantageSources(
      targetSaveAdvantage
        ?.sources
    );

  const ability =
    String(
      button.dataset.ability ??
      activity.save?.ability?.first?.() ??
      ""
    );

  const dc =
    finiteNumber(
      button.dataset.dc ??
      activity.save?.dc?.value,
      null
    );

  const actors =
    currentSaveActors();

  if (!actors.length) {
    return;
  }

  cleanupExpiredContexts();

  /*
   * Si se vuelve a pulsar Save sobre la misma tarjeta,
   * reemplazamos resultados anteriores para los actores
   * que están siendo tirados nuevamente.
   */
  const expectedActorUuids =
    new Set(
        actors.map(
        actor =>
            actor.uuid
        )
    );

    let usage =
    saveUsages.get(
        message.id
    );

    if (!usage) {
        usage = {
            messageId:
                message.id,

            itemUuid:
                item.uuid,

            itemName:
                item.name,

            itemSourceId:
                item.getFlag(
                    MODULE_ID,
                    "sourceId"
                ),

            activityId:
                activity.id,

            ability,

            dc,

            damageOnSave:
                activity.damage?.onSave ??
                "none",

            targetSaveAdvantageSources:
              saveAdvantageSources,

            expectedActorUuids,

            targets:
                new Map(),

            createdAt:
                Date.now()
    };

    saveUsages.set(
        message.id,
        usage
    );
    } else {
        usage.ability =
            ability;

        usage.dc =
            dc;

        usage.damageOnSave =
            activity.damage?.onSave ??
            usage.damageOnSave ??
            "none";

        usage.targetSaveAdvantageSources =
          saveAdvantageSources;

        /*
        * Cada nueva pulsación de Save representa
        * una nueva resolución del grupo seleccionado.
        *
        * Evitamos conservar resultados antiguos.
        */
        usage.expectedActorUuids =
            expectedActorUuids;

        usage.targets.clear();

        usage.createdAt =
            Date.now();
    }

  const context = {
    usageMessageId:
      message.id,

    itemSourceId:
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ),

    ability,
    dc,
    targetSaveAdvantageSources:
      saveAdvantageSources,

    pendingActorUuids:
      new Set(
        actors.map(
          actor =>
            actor.uuid
        )
      ),

    createdAt:
      Date.now()
  };

  pendingSaveContexts.push(
    context
  );

  console.debug(
    `[${MODULE_ID}] Save batch preparado.`,
    {
      move:
        item.name,

      messageId:
        message.id,

      ability,

      dc,

      actors:
        actors.map(
          actor =>
            actor.name
        )
    }
  );
}

/* ============================================================
 * SAVE MODIFIER SNAPSHOT
 *
 * Berserk:
 *
 * Si el usuario activa una actividad Save mientras Berserk
 * está activo, los targets tendrán Advantage en esa resolución.
 *
 * Guardamos el snapshot en el Usage Message para no depender
 * de que el HP del usuario cambie entre activación y tirada.
 * ============================================================ */

function onPreCreateUsageMessage(
  activity,
  messageConfig
) {

  const item =
    activity?.item;


  if (
    activity?.type !==
      "save" ||
    !isPoke5eMove(
      item
    ) ||
    !messageConfig?.data
  ) {

    return;
  }


  const sources =
    resolveTargetSaveAdvantageSources(
      activity
    );


  if (!sources.length) {

    return;
  }


  foundry.utils.setProperty(
    messageConfig.data,
    `flags.${MODULE_ID}.${TARGET_SAVE_ADVANTAGE_FLAG}`,
    {
      sourceActorUuid:
        item.actor?.uuid ??
        null,

      sources
    }
  );
}

/* ============================================================
 * BERSERK SAVE ADVANTAGE
 * ============================================================ */

function findPendingContextForActor(
  actor,
  ability,
  targetDc = null
) {

  const actorUuid =
    actor?.uuid;


  if (!actorUuid) {

    return null;
  }


  for (
    let index =
      pendingSaveContexts.length - 1;

    index >= 0;

    index--
  ) {

    const context =
      pendingSaveContexts[
        index
      ];


    if (
      !context.pendingActorUuids
        .has(
          actorUuid
        )
    ) {

      continue;
    }


    if (
      context.ability &&
      ability &&
      context.ability !==
        ability
    ) {

      continue;
    }


    if (
      context.dc != null &&
      targetDc != null &&
      Number(
        context.dc
      ) !==
        Number(
          targetDc
        )
    ) {

      continue;
    }


    return context;
  }


  return null;
}


function onPreRollSavingThrow(
  config
) {

  const actor =
    config?.subject;


  if (!actor) {

    return;
  }


  cleanupExpiredContexts();


  const rollConfig =
    config.rolls?.[0];


  if (!rollConfig) {

    return;
  }


  const ability =
    String(
      config?.ability ??
      rollConfig.options?.ability ??
      ""
    );


  const targetDc =
    finiteNumber(
      rollConfig.options?.target,
      null
    );


  const context =
    findPendingContextForActor(
      actor,
      ability,
      targetDc
    );


  const sources =
    normalizeTargetSaveAdvantageSources(
      context
        ?.targetSaveAdvantageSources
    );


  if (!sources.length) {

    return;
  }


  rollConfig.options ??=
    {};


  rollConfig.options.advantage =
    true;


  rollConfig.options[
    MODULE_ID
  ] = {

    ...(
      rollConfig.options[
        MODULE_ID
      ] ??
      {}
    ),

    targetSaveAdvantage: {

      applied:
        true,

      sources,

      usageMessageId:
        context.usageMessageId
    }
  };
}


function hasTargetSaveAdvantageMarker(
  roll
) {

  return (
    roll?.options?.[
      MODULE_ID
    ]?.targetSaveAdvantage
      ?.applied ===
    true
  );
}


function resolveTargetSaveAdvantageMode(
  roll
) {

  const modes =
    CONFIG.Dice.D20Roll
      .ADV_MODE;


  const finalizedMode =
    roll?.options
      ?.advantageMode;


  const hasDisadvantage =

    roll?.options
      ?.disadvantage ===
      true ||

    finalizedMode ===
      modes.DISADVANTAGE;


  return hasDisadvantage

    ? modes.NORMAL

    : modes.ADVANTAGE;
}


function onPostRollConfiguration(
  rolls
) {

  for (
    const roll
    of Array.from(
      rolls ??
      []
    )
  ) {

    if (
      !hasTargetSaveAdvantageMarker(
        roll
      )
    ) {

      continue;
    }


    roll.options.advantageMode =
      resolveTargetSaveAdvantageMode(
        roll
      );


    roll.configureModifiers();
  }
}

/* ============================================================
 * SAVE RESULT
 * ============================================================ */

function onRollSavingThrow(
  rolls,
  data
) {
  const actor =
    data?.subject;

  if (!actor) {
    return;
  }

  const roll =
    Array.isArray(rolls)
      ? rolls[0]
      : rolls;

  if (!roll) {
    return;
  }

  cleanupExpiredContexts();

  const context =
    findPendingContext(
      actor,
      data?.ability,
      roll
    );

  if (!context) {
    return;
  }

  const usage =
    saveUsages.get(
      context.usageMessageId
    );

  if (!usage) {
    finishActorInContext(
      context,
      actor.uuid
    );

    return;
  }

  const success =
    determineSaveSuccess(
      roll,
      context.dc
    );

  const outcome = {
    actorUuid:
      actor.uuid,

    actorName:
      actor.name,

    success,

    failure:
      !success,

    total:
      Number(
        roll.total ??
        0
      ),

    dc:
      context.dc,

    ability:
      context.ability,

    rolledAt:
      Date.now()
  };

  usage.targets.set(
    actor.uuid,
    outcome
  );

  finishActorInContext(
    context,
    actor.uuid
  );

  console.debug(
    `[${MODULE_ID}] Save registrado.`,
    {
      move:
        usage.itemName,

      actor:
        actor.name,

      total:
        outcome.total,

      dc:
        outcome.dc,

      result:
        success
          ? "SUCCESS"
          : "FAILURE"
    }
  );
}

/* ============================================================
 * DAMAGE MODIFIER
 * ============================================================ */

function onPreCalculateDamage(
  actor,
  damages,
  options
) {
  const damageMessage =
    options?.originatingMessage;

  if (!damageMessage) {
    return;
  }

  const item =
    damageMessage.getAssociatedItem?.();

  if (
    !isPoke5eMove(item)
  ) {
    return;
  }

  const usageMessage =
    getDamageUsageMessage(
      damageMessage
    );

  if (!usageMessage) {
    return;
  }

  const usage =
    saveUsages.get(
      usageMessage.id
    );

  if (!usage) {
    return;
  }

  /*
   * Seguridad:
   * solamente correlacionamos el daño
   * perteneciente al mismo Move.
   */
  const sourceId =
    item.getFlag(
      MODULE_ID,
      "sourceId"
    );

  if (
    sourceId !==
    usage.itemSourceId
  ) {
    return;
  }

  const outcome =
    usage.targets.get(
      actor.uuid
    );

  /*
   * Si no existe una Save registrada
   * para este Actor, no inventamos
   * ningún resultado.
   */
  if (!outcome) {
    return;
  }

  const saveMultiplier =
    outcome.success
      ? multiplierOnSuccessfulSave(
          damageMessage,
          usage
        )
      : 1;

  /*
   * ==========================================================
   * IMPORTANTE
   * ==========================================================
   *
   * NO modificamos options.multiplier.
   *
   * D&D5e puede llamar calculateDamage()
   * varias veces utilizando el mismo objeto options.
   *
   * Si hiciéramos:
   *
   *   options.multiplier *= 0.5
   *
   * terminaríamos acumulando:
   *
   *   1
   *   0.5
   *   0.25
   *   0.125
   *
   * En cambio, D&D5e crea una copia fresca de
   * "damages" antes de ejecutar preCalculateDamage.
   *
   * Por eso aplicamos aquí la Save directamente
   * a los valores de daño.
   * ==========================================================
   */

  if (
    saveMultiplier !== 1
  ) {
    for (const damage of damages) {
      const value =
        Number(
          damage?.value
        );

      if (
        !Number.isFinite(
          value
        )
      ) {
        continue;
      }

      damage.value =
        value *
        saveMultiplier;
    }
  }

  /*
   * Metadata para diagnóstico y futuros motores.
   *
   * No modifica el cálculo nativo de D&D5e.
   */
  options[MODULE_ID] ??= {};

  options[MODULE_ID]
    .saveOutcome = {
      usageMessageId:
        usage.messageId,

      actorUuid:
        actor.uuid,

      success:
        outcome.success,

      failure:
        outcome.failure,

      total:
        outcome.total,

      dc:
        outcome.dc,

      multiplier:
        saveMultiplier
    };

  console.debug(
    `[${MODULE_ID}] Save aplicado al daño.`,
    {
      move:
        usage.itemName,

      actor:
        actor.name,

      result:
        outcome.success
          ? "SUCCESS"
          : "FAILURE",

      saveMultiplier,

      damages:
        damages.map(
          damage => ({
            type:
              damage.type,

            value:
              damage.value
          })
        )
    }
  );
}

/* ============================================================
 * SAVE MULTIPLIER
 * ============================================================ */

function multiplierOnSuccessfulSave(
  damageMessage,
  usage
) {
  /*
   * SaveActivity.rollDamage() copia damage.onSave
   * al Damage Roll Message.
   */
  const onSave =
    damageMessage.getFlag(
      "dnd5e",
      "roll.damageOnSave"
    ) ??
    usage.damageOnSave ??
    "none";

  switch (
    String(onSave)
      .toLowerCase()
  ) {
    case "half":
      return 0.5;

    case "full":
      return 1;

    case "none":
    default:
      return 0;
  }
}

/* ============================================================
 * CONTEXT MATCHING
 * ============================================================ */

function findPendingContext(
  actor,
  ability,
  roll
) {

  return findPendingContextForActor(
    actor,
    ability,
    finiteNumber(
      roll?.options?.target,
      null
    )
  );
}

function finishActorInContext(
  context,
  actorUuid
) {
  context.pendingActorUuids
    .delete(
      actorUuid
    );

  if (
    context.pendingActorUuids.size
  ) {
    return;
  }

  const index =
    pendingSaveContexts.indexOf(
      context
    );

  if (
    index >= 0
  ) {
    pendingSaveContexts.splice(
      index,
      1
    );
  }
}

function cleanupExpiredContexts() {
  const cutoff =
    Date.now() -
    CONTEXT_TTL;

  for (
    let index =
      pendingSaveContexts.length - 1;

    index >= 0;

    index--
  ) {
    if (
      pendingSaveContexts[index]
        .createdAt <
      cutoff
    ) {
      pendingSaveContexts.splice(
        index,
        1
      );
    }
  }
}

/* ============================================================
 * SUCCESS
 * ============================================================ */

function determineSaveSuccess(
  roll,
  fallbackDc
) {
  if (
    typeof roll.isSuccess ===
    "boolean"
  ) {
    return roll.isSuccess;
  }

  const dc =
    finiteNumber(
      roll.options?.target ??
      fallbackDc,
      null
    );

  if (dc == null) {
    return false;
  }

  return (
    Number(
      roll.total ??
      0
    ) >= dc
  );
}

/* ============================================================
 * TARGETS
 *
 * Debe imitar SaveActivity#getSceneTargets:
 *
 * 1. Tokens seleccionados.
 * 2. Character del usuario como fallback.
 * ============================================================ */

function currentSaveActors() {
  const controlled =
    canvas.tokens
      ?.controlled ??
    [];

  const actors =
    controlled
      .map(
        token =>
          token.actor
      )
      .filter(Boolean);

  if (
    actors.length
  ) {
    return uniqueActors(
      actors
    );
  }

  if (
    game.user.character
  ) {
    return [
      game.user.character
    ];
  }

  return [];
}

function uniqueActors(
  actors
) {
  const byUuid =
    new Map();

  for (const actor of actors) {
    if (!actor?.uuid) {
      continue;
    }

    byUuid.set(
      actor.uuid,
      actor
    );
  }

  return [
    ...byUuid.values()
  ];
}

/* ============================================================
 * CLEANUP
 * ============================================================ */

function onDeleteChatMessage(
  message
) {
  saveUsages.delete(
    message.id
  );

  for (
    let index =
      pendingSaveContexts.length - 1;

    index >= 0;

    index--
  ) {
    if (
      pendingSaveContexts[index]
        .usageMessageId ===
      message.id
    ) {
      pendingSaveContexts.splice(
        index,
        1
      );
    }
  }
}

/* ============================================================
 * HELPERS
 * ============================================================ */

function isPoke5eMove(
  item
) {
  if (
    item?.documentName !==
    "Item"
  ) {
    return false;
  }

  return (
    item.getFlag(
      MODULE_ID,
      "kind"
    ) === "move"
  );
}

function finiteNumber(
  value,
  fallback = null
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : fallback;
}