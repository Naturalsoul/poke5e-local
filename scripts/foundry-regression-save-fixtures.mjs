import {
  getSaveOutcome,
  getSaveProgress
} from "./save-outcome-engine.mjs";

import {
  calculatePokemonDefenses
} from "./types.mjs";

import {
  cleanupFoundryRegressionFixtures
} from "./foundry-regression-fixtures.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";

const MODULE_ID =
  "poke5e-local";

const FIXTURE_FLAG =
  "regressionFixture";

const FIXTURE_KIND =
  "foundry-fixture";

const FIXTURE_PREFIX =
  "[Poke5e Regression Save]";

const TEMP_HP_BUFFER =
  1000;

const FORCED_SUCCESS_DC =
  -100;

const FORCED_FAILURE_DC =
  1000;

const SAVE_RESULT_FLAG =
  "saveResultResolution";

const WAIT_STEP_MS =
  50;

const WAIT_TIMEOUT_MS =
  5000;


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
    `Poke5e Save Fixtures: ${summary.pass} PASS · ` +
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
 * PRECONDITIONS
 * ============================================================ */

function selectedTargetCount() {

  return Number(
    game.user.targets?.size ??
    0
  );
}


function controlledTokenCount() {

  return Array.from(
    canvas.tokens?.controlled ??
    []
  ).length;
}


function preconditionChecks() {

  const checks = [];


  if (
    !canvas?.scene
  ) {

    checks.push(
      skip(
        "save.precondition.scene",
        "Se requiere una Scene activa para crear el Token temporal de Save Fixtures."
      )
    );
  }


  if (
    selectedTargetCount() > 0
  ) {

    checks.push(
      skip(
        "save.precondition.targets-clear",
        "Deselecciona todos los targets reales antes de ejecutar Save Fixtures."
      )
    );
  }


  if (
    controlledTokenCount() > 0
  ) {

    checks.push(
      skip(
        "save.precondition.control-clear",
        "Libera todos los Tokens controlados antes de ejecutar Save Fixtures."
      )
    );
  }


  return checks;
}


/* ============================================================
 * ACTOR / MOVE CANDIDATE
 * ============================================================ */

function isRegressionFixture(
  actor
) {

  return (
    actor?.getFlag?.(
      MODULE_ID,
      FIXTURE_FLAG
    )?.kind ===
      FIXTURE_KIND
  );
}


function itemActivities(
  item
) {

  return Array.from(
    item?.system
      ?.activities ??
    []
  );
}


function damageParts(
  activity
) {

  return Array.from(
    activity?.damage
      ?.parts ??
    []
  );
}


function saveAbility(
  activity
) {

  const abilities =
    Array.from(
      activity?.save
        ?.ability ??
      []
    );


  return String(
    abilities[0] ??
    ""
  )
    .trim()
    .toLowerCase() ||
    null;
}


function saveResultDefinition(
  item
) {

  const definition =
    item?.getFlag?.(
      MODULE_ID,
      "saveResult"
    );


  return definition?.kind ===
    "heal-per-failed-save"

    ? definition

    : null;
}


function saveCandidatePriority(
  item,
  activity
) {

  const onSave =
    String(
      activity.damage
        ?.onSave ??
      "none"
    )
      .trim()
      .toLowerCase();


  if (
    saveResultDefinition(
      item
    )
  ) {

    return 3;
  }


  if (
    onSave === "half" ||
    onSave === "none"
  ) {

    return 2;
  }


  return 1;
}


function saveCandidates(
  actor
) {

  const candidates = [];


  for (
    const item
    of actor?.items ??
      []
  ) {

    if (
      item.getFlag?.(
        MODULE_ID,
        "kind"
      ) !==
        "move"
    ) {

      continue;
    }


    for (
      const activity
      of itemActivities(
        item
      )
    ) {

      const ability =
        saveAbility(
          activity
        );


      if (
        activity?.type !==
          "save" ||
        !ability ||
        damageParts(
          activity
        ).length ===
          0 ||
        typeof activity.use !==
          "function" ||
        typeof activity.rollDamage !==
          "function"
      ) {

        continue;
      }


      candidates.push({
        item,
        activity,
        ability,

        priority:
          saveCandidatePriority(
            item,
            activity
          )
      });
    }
  }


  return candidates.sort(
    (
      left,
      right
    ) =>
      right.priority -
      left.priority
  );
}


function sourceActor(
  actorUuid
) {

  if (
    actorUuid
  ) {

    try {

      const document =
        fromUuidSync(
          actorUuid,
          {
            strict:
              false
          }
        );


      const actor =
        document?.documentName ===
          "Actor"

          ? document

          : document?.actor ??
            null;


      return (
        isPokemonActor(
          actor
        ) &&
        !isRegressionFixture(
          actor
        ) &&
        saveCandidates(
          actor
        ).length > 0
      )

        ? actor

        : null;

    } catch {

      return null;
    }
  }


  return (
    game.actors.find(
      actor =>
        isPokemonActor(
          actor
        ) &&
        !isRegressionFixture(
          actor
        ) &&
        saveCandidates(
          actor
        ).length > 0
    ) ??
    null
  );
}


/* ============================================================
 * FIXTURE ACTORS
 * ============================================================ */

function clearRuntimeFlags(
  source
) {

  const flags =
    foundry.utils.getProperty(
      source,
      `flags.${MODULE_ID}`
    );


  if (
    !flags ||
    typeof flags !==
      "object"
  ) {

    return;
  }


  delete flags.dynamicDamageState;
  delete flags.statusGrace;
  delete flags.pendingMoveModifiers;
  delete flags.pendingAttackModifier;
  delete flags.activeAbilityId;
  delete flags.grantedHiddenAbilities;
}


function fixtureActorSource(
  actor,
  {
    nameSuffix,
    itemId = null
  }
) {

  const source =
    foundry.utils.deepClone(
      actor.toObject()
    );


  delete source._id;


  source.name =
    `${FIXTURE_PREFIX} ${nameSuffix} — ${actor.name}`;


  source.folder =
    null;


  source.effects =
    [];


  const embeddedItems =
    Array.isArray(
      source.items
    )

      ? source.items

      : [];


  source.items =
    itemId

      ? embeddedItems.filter(
          item =>
            item._id ===
              itemId
        )

      : [];


  clearRuntimeFlags(
    source
  );


  foundry.utils.setProperty(
    source,
    `flags.${MODULE_ID}.${FIXTURE_FLAG}`,
    {
      kind:
        FIXTURE_KIND,

      sourceActorUuid:
        actor.uuid,

      saveFixture:
        true,

      createdAt:
        Date.now()
    }
  );


  return source;
}


async function createFixtureActor(
  actor,
  options
) {

  return Actor.implementation.create(
    fixtureActorSource(
      actor,
      options
    ),
    {
      renderSheet:
        false
    }
  );
}


function fixtureCandidate(
  attacker,
  sourceCandidate
) {

  const item =
    attacker?.items.find(
      candidate =>
        candidate.id ===
          sourceCandidate.item.id
    ) ??
    attacker?.items.find(
      candidate =>
        candidate.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          sourceCandidate.item.getFlag?.(
            MODULE_ID,
            "sourceId"
          )
    );


  if (!item) {

    return null;
  }


  const activity =
    itemActivities(
      item
    ).find(
      candidate =>
        candidate.id ===
          sourceCandidate.activity.id
    ) ??
    null;


  if (
    !activity
  ) {

    return null;
  }


  return {
    item,
    activity,
    ability:
      saveAbility(
        activity
      )
  };
}


/* ============================================================
 * TEMPORARY TOKEN
 * ============================================================ */

async function waitForTokenObject(
  tokenDocument
) {

  const attempts =
    Math.ceil(
      WAIT_TIMEOUT_MS /
      WAIT_STEP_MS
    );


  for (
    let attempt = 0;
    attempt < attempts;
    attempt += 1
  ) {

    const object =
      tokenDocument?.object ??
      canvas.tokens?.get?.(
        tokenDocument?.id
      ) ??
      null;


    if (object) {

      return object;
    }


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          WAIT_STEP_MS
        )
    );
  }


  return null;
}


async function createTargetToken(
  actor
) {

  const tokenDocument =
    await actor.getTokenDocument({
      actorLink:
        false,

      hidden:
        true,

      x:
        0,

      y:
        0
    });


  const source =
    tokenDocument.toObject();


  delete source._id;


  source.name =
    `${FIXTURE_PREFIX} Target Token`;


  foundry.utils.setProperty(
    source,
    `flags.${MODULE_ID}.${FIXTURE_FLAG}`,
    {
      kind:
        FIXTURE_KIND,

      saveFixtureToken:
        true,

      createdAt:
        Date.now()
    }
  );


  const created =
    await canvas.scene.createEmbeddedDocuments(
      "Token",
      [
        source
      ]
    );


  const createdDocument =
    created[0] ??
    null;


  if (!createdDocument) {

    return {
      document:
        null,

      object:
        null,

      actor:
        null
    };
  }


  const object =
    await waitForTokenObject(
      createdDocument
    );


  return {
    document:
      createdDocument,

    object,

    actor:
      object?.actor ??
      createdDocument.actor ??
      null
  };
}


function activateTargetToken(
  token
) {

  if (!token) {

    return false;
  }


  token.control({
    releaseOthers:
      true
  });


  token.setTarget(
    true,
    {
      releaseOthers:
        true,

      groupSelection:
        false
    }
  );


  return (
    canvas.tokens.controlled.includes(
      token
    ) &&
    game.user.targets.has(
      token
    )
  );
}


async function cleanupTargetToken(
  tokenFixture
) {

  const failures = [];


  try {

    tokenFixture?.object
      ?.setTarget?.(
        false,
        {
          releaseOthers:
            false,

          groupSelection:
            false
        }
      );

  } catch (
    error
  ) {

    failures.push({
      phase:
        "untarget",

      message:
        error.message
    });
  }


  try {

    tokenFixture?.object
      ?.release?.();

  } catch (
    error
  ) {

    failures.push({
      phase:
        "release",

      message:
        error.message
    });
  }


  if (
    tokenFixture?.document
  ) {

    try {

      await tokenFixture.document.delete();

    } catch (
      error
    ) {

      failures.push({
        phase:
          "delete",

        message:
          error.message
      });
    }
  }


  return failures;
}


/* ============================================================
 * HP
 * ============================================================ */

function hpState(
  actor
) {

  const hp =
    actor?.system
      ?.attributes
      ?.hp;


  if (!hp) {

    return null;
  }


  const value =
    Number(
      hp.value
    );


  const maximum =
    Number(
      hp.max
    );


  const temp =
    Number(
      hp.temp ??
      0
    );


  if (
    !Number.isFinite(
      value
    ) ||
    !Number.isFinite(
      maximum
    ) ||
    maximum <= 0 ||
    !Number.isFinite(
      temp
    )
  ) {

    return null;
  }


  return {
    value,
    maximum,
    temp,

    total:
      value +
      temp
  };
}


async function prepareTargetHp(
  actor
) {

  const state =
    hpState(
      actor
    );


  if (!state) {

    return null;
  }


  await actor.update({
    "system.attributes.hp.value":
      state.maximum,

    "system.attributes.hp.temp":
      TEMP_HP_BUFFER
  });


  return hpState(
    actor
  );
}


async function prepareSourceHealingRoom(
  actor
) {

  const state =
    hpState(
      actor
    );


  if (!state) {

    return null;
  }


  const value =
    Math.max(
      1,
      Math.floor(
        state.maximum /
        2
      )
    );


  await actor.update({
    "system.attributes.hp.value":
      value,

    "system.attributes.hp.temp":
      0
  });


  return hpState(
    actor
  );
}


function actualDamage(
  before,
  after
) {

  if (
    !before ||
    !after
  ) {

    return null;
  }


  return Math.max(
    0,
    before.total -
    after.total
  );
}


/* ============================================================
 * MESSAGES
 * ============================================================ */

function currentMessageIds() {

  return new Set(
    Array.from(
      game.messages ??
      []
    )
      .map(
        message =>
          message?.id ??
          null
      )
      .filter(Boolean)
  );
}


function newMessagesAfter(
  snapshot
) {

  return Array.from(
    game.messages ??
    []
  ).filter(
    message =>
      message?.id &&
      !snapshot.has(
        message.id
      )
  );
}


async function deleteMessagesCreatedAfter(
  snapshot
) {

  const failures = [];


  const created =
    newMessagesAfter(
      snapshot
    );


  for (
    const message
    of created
  ) {

    try {

      await message.delete();

    } catch (
      error
    ) {

      failures.push({
        id:
          message.id,

        message:
          error.message
      });
    }
  }


  return {
    deleted:
      created.length -
      failures.length,

    failures
  };
}


function findDamageMessage(
  snapshot,
  usageMessage
) {

  const created =
    newMessagesAfter(
      snapshot
    );


  return (
    created.find(
      message =>
        message.getOriginatingMessage?.()
          ?.id ===
            usageMessage.id &&
        message.getFlag?.(
          "dnd5e",
          "roll.type"
        ) ===
          "damage"
    ) ??
    created.find(
      message =>
        message.getOriginatingMessage?.()
          ?.id ===
            usageMessage.id
    ) ??
    null
  );
}


/* ============================================================
 * DOM BRIDGE
 * ============================================================ */

function usageSaveButton(
  message,
  ability
) {

  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.innerHTML =
    String(
      message?.content ??
      ""
    );


  return (
    wrapper.querySelector(
      `button[data-action="rollSave"][data-ability="${ability}"]`
    ) ??
    wrapper.querySelector(
      'button[data-action="rollSave"]'
    )
  );
}


function dispatchSaveCapture(
  message,
  sourceButton,
  dc
) {

  if (
    !message ||
    !sourceButton
  ) {

    return false;
  }


  const host =
    document.createElement(
      "div"
    );


  host.dataset.messageId =
    message.id;


  host.hidden =
    true;


  const button =
    sourceButton.cloneNode(
      true
    );


  button.dataset.dc =
    String(
      dc
    );


  host.appendChild(
    button
  );


  /*
   * El listener Poke5e está registrado en document con capture:true.
   * Dejamos que llegue a capture y detenemos el bubbling en el host,
   * evitando invocar accidentalmente el handler visual de D&D5e.
   */
  host.addEventListener(
    "click",
    event => {
      event.stopPropagation();
    }
  );


  document.body.appendChild(
    host
  );


  try {

    button.click();

    return true;

  } finally {

    host.remove();
  }
}


function dispatchSaveResultClick(
  message
) {

  const host =
    document.createElement(
      "div"
    );


  host.hidden =
    true;


  const button =
    document.createElement(
      "button"
    );


  button.dataset.poke5eAction =
    "resolve-save-result";


  button.dataset.messageId =
    message.id;


  host.appendChild(
    button
  );


  document.body.appendChild(
    host
  );


  try {

    button.click();

  } finally {

    host.remove();
  }
}


async function waitFor(
  predicate
) {

  const attempts =
    Math.ceil(
      WAIT_TIMEOUT_MS /
      WAIT_STEP_MS
    );


  for (
    let attempt = 0;
    attempt < attempts;
    attempt += 1
  ) {

    const value =
      predicate();


    if (value) {

      return value;
    }


    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          WAIT_STEP_MS
        )
    );
  }


  return null;
}


/* ============================================================
 * DAMAGE EXPECTATION
 * ============================================================ */

function actorTypes(
  actor
) {

  const types =
    actor?.getFlag?.(
      MODULE_ID,
      "types"
    );


  return Array.isArray(
    types
  )

    ? types

    : [];
}


function typeMultiplier(
  actor,
  damageType
) {

  const defenses =
    calculatePokemonDefenses(
      actorTypes(
        actor
      )
    );


  const raw =
    Number(
      defenses.multipliers?.[
        damageType
      ] ??
      1
    );


  if (
    raw === 0
  ) {

    return 0;
  }


  if (
    raw > 1
  ) {

    return 2;
  }


  if (
    raw < 1
  ) {

    return 0.5;
  }


  return 1;
}


function saveMultiplier(
  outcome,
  activity
) {

  if (
    !outcome?.success
  ) {

    return 1;
  }


  const onSave =
    String(
      activity.damage
        ?.onSave ??
      "none"
    )
      .trim()
      .toLowerCase();


  switch (
    onSave
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


function expectedDamage(
  actor,
  damages,
  multiplier
) {

  let total =
    0;


  for (
    const damage
    of damages
  ) {

    let value =
      Number(
        damage.value
      ) *
      multiplier;


    const type =
      String(
        damage.type ??
        ""
      )
        .trim()
        .toLowerCase();


    const typeFactor =
      typeMultiplier(
        actor,
        type
      );


    if (
      typeFactor === 0
    ) {

      value =
        0;

    } else if (
      typeFactor === 0.5
    ) {

      value =
        Math.trunc(
          value /
          2
        );

    } else if (
      typeFactor === 2
    ) {

      value *=
        2;
    }


    total +=
      value;
  }


  return Math.trunc(
    total
  );
}


function damageDescriptions(
  rolls
) {

  return Array.from(
    rolls ??
    []
  )
    .map(
      roll => ({
        value:
          Number(
            roll?.total
          ),

        type:
          String(
            roll?.options?.type ??
            ""
          )
            .trim()
            .toLowerCase()
      })
    )
    .filter(
      damage =>
        Number.isFinite(
          damage.value
        ) &&
        Boolean(
          damage.type
        )
    );
}


/* ============================================================
 * ONE SAVE SCENARIO
 * ============================================================ */

async function useSaveActivity(
  activity
) {

  return activity.use(
    {
      consume:
        false,

      subsequentActions:
        false
    },
    {
      configure:
        false
    }
  );
}


async function executeSaveScenario({
  activity,
  item,
  target,
  ability,
  dc,
  expectedSuccess
}) {

  const checks = [];


  const usage =
    await useSaveActivity(
      activity
    );


  const usageMessage =
    usage?.message ??
    null;


  if (!usageMessage) {

    return {
      checks: [
        fail(
          `save.${expectedSuccess ? "success" : "failure"}.usage-message`,
          `${item.name}: SaveActivity.use no creó Usage Message.`
        )
      ],

      usageMessage:
        null,

      outcome:
        null
    };
  }


  checks.push(
    pass(
      `save.${expectedSuccess ? "success" : "failure"}.usage-message`,
      `${item.name}: Usage Message real creado.`,
      {
        messageId:
          usageMessage.id
      }
    )
  );


  const button =
    usageSaveButton(
      usageMessage,
      ability
    );


  if (!button) {

    checks.push(
      fail(
        `save.${expectedSuccess ? "success" : "failure"}.button`,
        `${item.name}: Usage Message no contiene button[data-action=rollSave].`
      )
    );


    return {
      checks,
      usageMessage,
      outcome:
        null
    };
  }


  const captured =
    dispatchSaveCapture(
      usageMessage,
      button,
      dc
    );


  if (!captured) {

    checks.push(
      fail(
        `save.${expectedSuccess ? "success" : "failure"}.capture`,
        `${item.name}: no se pudo disparar el contexto de Save.`
      )
    );


    return {
      checks,
      usageMessage,
      outcome:
        null
    };
  }


  const rolls =
    await target.rollSavingThrow(
      {
        ability,
        target:
          dc
      },
      {
        configure:
          false
      }
    );


  const roll =
    Array.from(
      rolls ??
      []
    )[0] ??
    null;


  const outcome =
    getSaveOutcome(
      usageMessage,
      target
    );


  const correctOutcome =
    Boolean(
      roll &&
      outcome &&
      outcome.success ===
        expectedSuccess &&
      outcome.failure ===
        !expectedSuccess
    );


  checks.push(
    correctOutcome

      ? pass(
          `save.${expectedSuccess ? "success" : "failure"}.outcome`,
          `${item.name}: SaveOutcome registró ${expectedSuccess ? "SUCCESS" : "FAILURE"}.`,
          {
            total:
              roll?.total ??
              null,

            dc,

            actorUuid:
              target.uuid
          }
        )

      : fail(
          `save.${expectedSuccess ? "success" : "failure"}.outcome`,
          `${item.name}: SaveOutcome no coincide con el resultado forzado.`,
          {
            rollTotal:
              roll?.total ??
              null,

            dc,
            outcome
          }
        )
  );


  const progress =
    getSaveProgress(
      usageMessage
    );


  checks.push(
    progress.complete &&
    progress.expected === 1 &&
    progress.resolved === 1

      ? pass(
          `save.${expectedSuccess ? "success" : "failure"}.progress`,
          `${item.name}: Save batch quedó completo 1/1.`,
          progress
        )

      : fail(
          `save.${expectedSuccess ? "success" : "failure"}.progress`,
          `${item.name}: Save batch no quedó completo.`,
          progress
        )
  );


  if (!correctOutcome) {

    return {
      checks,
      usageMessage,
      outcome
    };
  }


  const damageMessageSnapshot =
    currentMessageIds();


  const damageRolls =
    await activity.rollDamage(
      {},
      {
        configure:
          false
      },
      {
        data: {
          "flags.dnd5e.originatingMessage":
            usageMessage.id
        }
      }
    );


  const damages =
    damageDescriptions(
      damageRolls
    );


  const damageMessage =
    findDamageMessage(
      damageMessageSnapshot,
      usageMessage
    );


  if (
    !damages.length ||
    !damageMessage
  ) {

    checks.push(
      fail(
        `save.${expectedSuccess ? "success" : "failure"}.damage-roll`,
        `${item.name}: no se obtuvo DamageRoll Message correlacionable con la Usage Card.`,
        {
          damages,

          damageMessageId:
            damageMessage?.id ??
            null
        }
      )
    );


    return {
      checks,
      usageMessage,
      outcome
    };
  }


  checks.push(
    pass(
      `save.${expectedSuccess ? "success" : "failure"}.damage-roll`,
      `${item.name}: DamageRoll real correlacionado con Usage Message.`,
      {
        damageMessageId:
          damageMessage.id,

        damages
      }
    )
  );


  const before =
    await prepareTargetHp(
      target
    );


  if (!before) {

    checks.push(
      skip(
        `save.${expectedSuccess ? "success" : "failure"}.apply-damage`,
        `${target.name}: HP no resoluble para aplicar daño.`
      )
    );


    return {
      checks,
      usageMessage,
      outcome
    };
  }


  const multiplier =
    saveMultiplier(
      outcome,
      activity
    );


  const expected =
    expectedDamage(
      target,
      damages,
      multiplier
    );


  await target.applyDamage(
    damages,
    {
      originatingMessage:
        damageMessage
    }
  );


  const observed =
    actualDamage(
      before,
      hpState(
        target
      )
    );


  checks.push(
    observed ===
      expected

      ? pass(
          `save.${expectedSuccess ? "success" : "failure"}.apply-damage`,
          `${item.name}: SaveOutcome → preCalculateDamage → Actor5e.applyDamage resolvió ${observed}.`,
          {
            saveMultiplier:
              multiplier,

            damageOnSave:
              activity.damage?.onSave ??
              "none",

            expected,
            observed
          }
        )

      : fail(
          `save.${expectedSuccess ? "success" : "failure"}.apply-damage`,
          `${item.name}: daño efectivo distinto del esperado tras la Save.`,
          {
            saveMultiplier:
              multiplier,

            damageOnSave:
              activity.damage?.onSave ??
              "none",

            expected,
            observed,
            damages
          }
        )
  );


  return {
    checks,
    usageMessage,
    outcome
  };
}


/* ============================================================
 * SAVE RESULT
 * ============================================================ */

async function testSaveResult(
  attacker,
  item,
  failedScenario
) {

  const definition =
    saveResultDefinition(
      item
    );


  if (!definition) {

    return skip(
      "save.result",
      `${item.name}: no posee saveResult heal-per-failed-save; esta rama queda SKIP.`
    );
  }


  const message =
    failedScenario
      ?.usageMessage;


  if (!message) {

    return fail(
      "save.result",
      `${item.name}: no existe Usage Message fallida para resolver SaveResult.`
    );
  }


  const before =
    await prepareSourceHealingRoom(
      attacker
    );


  if (!before) {

    return skip(
      "save.result",
      `${attacker.name}: HP no resoluble para probar SaveResult.`
    );
  }


  dispatchSaveResultClick(
    message
  );


  const resolution =
    await waitFor(
      () => {
        const data =
          message.getFlag?.(
            MODULE_ID,
            SAVE_RESULT_FLAG
          );


        return data?.resolved

          ? data

          : null;
      }
    );


  if (!resolution) {

    return fail(
      "save.result",
      `${item.name}: SaveResult no quedó resuelto después del click runtime.`
    );
  }


  const after =
    hpState(
      attacker
    );


  const actualHealing =
    Number(
      resolution.actualHealing ??
      0
    );


  const hpIncrease =
    after &&
    before

      ? Math.max(
          0,
          after.value -
          before.value
        )

      : null;


  const valid =
    Number(
      resolution.failures
    ) === 1 &&
    Number.isFinite(
      actualHealing
    ) &&
    actualHealing >= 0 &&
    hpIncrease ===
      actualHealing;


  return valid

    ? pass(
        "save.result",
        `${item.name}: SaveResult resolvió una curación coherente con 1 Save fallida.`,
        {
          failures:
            resolution.failures,

          formula:
            resolution.formula ??
            null,

          rolledHealing:
            resolution.rolledHealing ??
            null,

          actualHealing,
          hpIncrease
        }
      )

    : fail(
        "save.result",
        `${item.name}: SaveResult produjo una resolución inconsistente.`,
        {
          resolution,
          hpIncrease
        }
      );
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export async function runFoundrySaveFixtures({
  actorUuid = null,
  notify = true
} = {}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Foundry Save Fixtures requiere un usuario GM."
    );
  }


  const preconditions =
    preconditionChecks();


  if (
    preconditions.length
  ) {

    const summary =
      summarize(
        preconditions
      );


    if (notify) {

      notifySummary(
        summary
      );
    }


    return {
      kind:
        "poke5e-foundry-save-fixtures",

      sourceActorUuid:
        null,

      summary,
      checks:
        preconditions,

      cleanup:
        null
    };
  }


  await cleanupFoundryRegressionFixtures({
    notify:
      false
  });


  const source =
    sourceActor(
      actorUuid
    );


  const sourceCandidate =
    saveCandidates(
      source
    )[0] ??
    null;


  if (
    !source ||
    !sourceCandidate
  ) {

    const checks = [
      skip(
        "save.candidate",
        actorUuid
          ? "El Pokémon indicado no posee una Save Activity con daño apta para este fixture."
          : "No se encontró un Pokémon importado con una Save Activity con daño apta para este fixture."
      )
    ];


    const summary =
      summarize(
        checks
      );


    if (notify) {

      notifySummary(
        summary
      );
    }


    return {
      kind:
        "poke5e-foundry-save-fixtures",

      sourceActorUuid:
        source?.uuid ??
        null,

      summary,
      checks,

      cleanup:
        null
    };
  }


  const checks = [];
  const messageSnapshot =
    currentMessageIds();

  let attacker =
    null;

  let targetWorld =
    null;

  let targetToken =
    null;

  let messageCleanup =
    null;

  let fixtureCleanup =
    null;

  let tokenCleanup =
    [];


  try {

    attacker =
      await createFixtureActor(
        source,
        {
          nameSuffix:
            "Attacker",

          itemId:
            sourceCandidate.item.id
        }
      );


    targetWorld =
      await createFixtureActor(
        source,
        {
          nameSuffix:
            "Target",

          itemId:
            null
        }
      );


    const candidate =
      fixtureCandidate(
        attacker,
        sourceCandidate
      );


    if (
      !attacker ||
      !targetWorld ||
      !candidate?.ability
    ) {

      checks.push(
        fail(
          "save.fixture-actors",
          "No se pudieron materializar Attacker, Target y Save Activity temporales."
        )
      );

    } else {

      checks.push(
        pass(
          "save.fixture-actors",
          "Attacker y Target temporales creados sin modificar Actors originales.",
          {
            attackerUuid:
              attacker.uuid,

            targetUuid:
              targetWorld.uuid
          }
        )
      );


      targetToken =
        await createTargetToken(
          targetWorld
        );


      const targetActor =
        targetToken.actor;


      if (
        !targetToken.object ||
        !targetActor ||
        !activateTargetToken(
          targetToken.object
        )
      ) {

        checks.push(
          fail(
            "save.fixture-token",
            "No se pudo crear/controlar/targetear el Token temporal requerido por D&D5e SaveActivity."
          )
        );

      } else {

        checks.push(
          pass(
            "save.fixture-token",
            "Token temporal sintético quedó controlado y targeteado para la Save.",
            {
              tokenUuid:
                targetToken.document?.uuid ??
                null,

              actorUuid:
                targetActor.uuid,

              synthetic:
                targetActor.isToken ===
                true
            }
          )
        );


        const successScenario =
          await executeSaveScenario({
            activity:
              candidate.activity,

            item:
              candidate.item,

            target:
              targetActor,

            ability:
              candidate.ability,

            dc:
              FORCED_SUCCESS_DC,

            expectedSuccess:
              true
          });


        checks.push(
          ...successScenario.checks
        );


        const failureScenario =
          await executeSaveScenario({
            activity:
              candidate.activity,

            item:
              candidate.item,

            target:
              targetActor,

            ability:
              candidate.ability,

            dc:
              FORCED_FAILURE_DC,

            expectedSuccess:
              false
          });


        checks.push(
          ...failureScenario.checks
        );


        checks.push(
          await testSaveResult(
            attacker,
            candidate.item,
            failureScenario
          )
        );
      }
    }

  } catch (
    error
  ) {

    checks.push(
      fail(
        "save.runtime",
        "La ejecución del Save Fixture lanzó una excepción.",
        {
          name:
            error.name,

          message:
            error.message,

          stack:
            error.stack ??
            null
        }
      )
    );

  } finally {

    tokenCleanup =
      await cleanupTargetToken(
        targetToken
      );


    messageCleanup =
      await deleteMessagesCreatedAfter(
        messageSnapshot
      );


    fixtureCleanup =
      await cleanupFoundryRegressionFixtures({
        notify:
          false
      });
  }


  checks.push(
    tokenCleanup.length ===
      0

      ? pass(
          "save.token-cleanup",
          "El Token temporal fue liberado, destargeteado y eliminado."
        )

      : fail(
          "save.token-cleanup",
          "El cleanup del Token temporal tuvo errores.",
          tokenCleanup
        )
  );


  checks.push(
    messageCleanup.failures.length ===
      0

      ? pass(
          "save.chat-cleanup",
          "Los ChatMessages creados por Save Fixtures fueron eliminados.",
          messageCleanup
        )

      : fail(
          "save.chat-cleanup",
          "No se pudieron eliminar todos los ChatMessages de Save Fixtures.",
          messageCleanup
        )
  );


  checks.push(
    fixtureCleanup.failures.length ===
      0

      ? pass(
          "save.fixture-cleanup",
          "Los Actors temporales de Save Fixtures fueron eliminados.",
          fixtureCleanup
        )

      : fail(
          "save.fixture-cleanup",
          "Quedaron documentos temporales de Save Fixtures sin eliminar.",
          fixtureCleanup
        )
  );


  const summary =
    summarize(
      checks
    );


  if (notify) {

    notifySummary(
      summary
    );
  }


  return {
    kind:
      "poke5e-foundry-save-fixtures",

    sourceActorUuid:
      source.uuid,

    candidate: {
      itemUuid:
        sourceCandidate.item.uuid,

      itemName:
        sourceCandidate.item.name,

      itemSourceId:
        sourceCandidate.item.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ??
        null,

      activityId:
        sourceCandidate.activity.id,

      ability:
        sourceCandidate.ability,

      damageOnSave:
        sourceCandidate.activity.damage
          ?.onSave ??
        "none",

      saveResult:
        Boolean(
          saveResultDefinition(
            sourceCandidate.item
          )
        )
    },

    summary,
    checks,

    cleanup: {
      tokenFailures:
        tokenCleanup,

      messages:
        messageCleanup,

      fixtures:
        fixtureCleanup
    }
  };
}
