import {
  calculatePokemonDefenses
} from "./types.mjs";

import {
  cleanupFoundryRegressionFixtures
} from "./foundry-regression-fixtures.mjs";

const MODULE_ID =
  "poke5e-local";

const FIXTURE_FLAG =
  "regressionFixture";

const FIXTURE_KIND =
  "foundry-fixture";

const FIXTURE_PREFIX =
  "[Poke5e Regression Activity]";

const TEMP_HP_BUFFER =
  1000;


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
    `Poke5e Activity Fixtures: ${summary.pass} PASS · ` +
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
 * SOURCE ACTOR
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
        )
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
        Boolean(
          plainAttackCandidate(
            actor
          )
        )
    ) ??
    null
  );
}


/* ============================================================
 * PLAIN ATTACK CANDIDATE
 *
 * Este fixture busca deliberadamente un Move sencillo:
 *
 * - Activity attack;
 * - una única parte de daño;
 * - no Dynamic Damage;
 * - no Struggle;
 * - no Drain/Recoil/Multi-target;
 * - sin trigger de status.
 *
 * Así probamos la canalización nativa D&D5e sin introducir
 * simultáneamente otra mecánica Poke5e en la observación.
 * ============================================================ */

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


function hasTriggeredStatusTemplate(
  item
) {

  return Array.from(
    item?.effects ??
    []
  ).some(
    effect =>
      Boolean(
        effect.getFlag?.(
          MODULE_ID,
          "trigger"
        )
      )
  );
}


function isPlainAttackItem(
  item
) {

  if (
    item?.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return false;
  }


  if (
    item.getFlag?.(
      MODULE_ID,
      "sourceId"
    ) ===
      "struggle"
  ) {

    return false;
  }


  const excludedFlags = [
    "dynamicDamage",
    "instantDrain",
    "instantRecoil",
    "multiTarget",
    "saveResult"
  ];


  if (
    excludedFlags.some(
      flag =>
        Boolean(
          item.getFlag?.(
            MODULE_ID,
            flag
          )
        )
    )
  ) {

    return false;
  }


  return !hasTriggeredStatusTemplate(
    item
  );
}


function plainAttackCandidate(
  actor
) {

  for (
    const item
    of actor?.items ??
      []
  ) {

    if (
      !isPlainAttackItem(
        item
      )
    ) {

      continue;
    }


    for (
      const activity
      of itemActivities(
        item
      )
    ) {

      if (
        activity?.type !==
          "attack" ||
        damageParts(
          activity
        ).length !==
          1 ||
        typeof activity.rollAttack !==
          "function" ||
        typeof activity.rollDamage !==
          "function"
      ) {

        continue;
      }


      const part =
        damageParts(
          activity
        )[0];


      const formula =
        part?.custom?.enabled ===
          true

          ? String(
              part.custom.formula ??
              ""
            ).trim()

          : null;


      if (
        formula ===
          "0"
      ) {

        continue;
      }


      return {
        item,
        activity
      };
    }
  }


  return null;
}


/* ============================================================
 * FIXTURE ACTOR SOURCE
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

      activityFixture:
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


function foundryTypeMultiplier(
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


function expectedTypedDamage(
  amount,
  multiplier
) {

  const value =
    Math.max(
      0,
      Number(
        amount
      )
    );


  if (
    multiplier ===
      0.5
  ) {

    return Math.floor(
      value /
      2
    );
  }


  return value *
    multiplier;
}


function damageRollType(
  roll
) {

  const type =
    String(
      roll?.options?.type ??
      ""
    )
      .trim()
      .toLowerCase();


  return type ||
    null;
}


/* ============================================================
 * CHAT MESSAGE CLEANUP
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


async function deleteMessagesCreatedAfter(
  snapshot
) {

  const failures = [];


  const created =
    Array.from(
      game.messages ??
      []
    ).filter(
      message =>
        message?.id &&
        !snapshot.has(
          message.id
        )
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


/* ============================================================
 * EXECUTE ATTACK ACTIVITY
 * ============================================================ */

function finiteRollTotal(
  roll
) {

  const total =
    Number(
      roll?.total
    );


  return Number.isFinite(
    total
  )

    ? total

    : null;
}


async function executeAttackPipeline(
  source,
  target,
  sourceCandidate
) {

  const item =
    source.items.find(
      candidate =>
        candidate.id ===
          sourceCandidate.item.id
    ) ??
    source.items.find(
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

    return [
      fail(
        "activity.item-cloned",
        "El Move candidato no existe dentro del Actor fixture."
      )
    ];
  }


  const activity =
    Array.from(
      item.system
        ?.activities ??
      []
    ).find(
      candidate =>
        candidate.id ===
          sourceCandidate.activity.id
    ) ??
    null;


  if (!activity) {

    return [
      fail(
        "activity.activity-cloned",
        `${item.name}: la Activity candidata no existe en el fixture.`
      )
    ];
  }


  const checks = [
    pass(
      "activity.candidate",
      `${item.name}: Activity attack sencilla seleccionada.`,
      {
        itemSourceId:
          item.getFlag?.(
            MODULE_ID,
            "sourceId"
          ) ??
          null,

        activityId:
          activity.id
      }
    )
  ];


  const targetAc =
    Number(
      target.system
        ?.attributes
        ?.ac
        ?.value
    );


  const attackRolls =
    await activity.rollAttack(
      {
        target:
          Number.isFinite(
            targetAc
          )

            ? targetAc

            : 10
      },
      {
        configure:
          false
      }
    );


  const attackRoll =
    Array.isArray(
      attackRolls
    )

      ? attackRolls[0]

      : null;


  const attackTotal =
    finiteRollTotal(
      attackRoll
    );


  checks.push(
    attackRoll &&
    attackTotal !==
      null

      ? pass(
          "activity.attack-roll",
          `${item.name}: AttackActivity.rollAttack produjo un D20Roll evaluado.`,
          {
            formula:
              attackRoll.formula ??
              null,

            total:
              attackTotal
          }
        )

      : fail(
          "activity.attack-roll",
          `${item.name}: AttackActivity.rollAttack no produjo una tirada evaluada.`
        )
  );


  const damageRolls =
    await activity.rollDamage(
      {
        isCritical:
          false
      },
      {
        configure:
          false
      }
    );


  const rolls =
    Array.from(
      damageRolls ??
      []
    );


  if (
    rolls.length !==
      1
  ) {

    checks.push(
      fail(
        "activity.damage-roll-count",
        `${item.name}: se esperaba exactamente un DamageRoll para el fixture sencillo.`,
        {
          count:
            rolls.length
        }
      )
    );


    return checks;
  }


  const damageRoll =
    rolls[0];


  const damageTotal =
    finiteRollTotal(
      damageRoll
    );


  const damageType =
    damageRollType(
      damageRoll
    );


  if (
    damageTotal ===
      null ||
    !damageType
  ) {

    checks.push(
      fail(
        "activity.damage-roll",
        `${item.name}: DamageRoll sin total o tipo resoluble.`,
        {
          formula:
            damageRoll?.formula ??
            null,

          total:
            damageRoll?.total ??
            null,

          type:
            damageType
        }
      )
    );


    return checks;
  }


  checks.push(
    pass(
      "activity.damage-roll",
      `${item.name}: AttackActivity.rollDamage produjo daño ${damageType}.`,
      {
        formula:
          damageRoll.formula ??
          null,

        total:
          damageTotal,

        type:
          damageType
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
        "activity.apply-damage",
        `${target.name}: HP no resoluble para aplicar el DamageRoll.`
      )
    );


    return checks;
  }


  const multiplier =
    foundryTypeMultiplier(
      target,
      damageType
    );


  const expected =
    expectedTypedDamage(
      damageTotal,
      multiplier
    );


  await target.applyDamage([
    {
      value:
        damageTotal,

      type:
        damageType
    }
  ]);


  const after =
    hpState(
      target
    );


  const observed =
    actualDamage(
      before,
      after
    );


  checks.push(
    observed ===
      expected

      ? pass(
          "activity.apply-damage",
          `${item.name}: DamageRoll → Actor5e.applyDamage resolvió ${observed} de daño efectivo.`,
          {
            rolledDamage:
              damageTotal,

            damageType,

            multiplier,

            expected,

            observed
          }
        )

      : fail(
          "activity.apply-damage",
          `${item.name}: el daño aplicado por D&D5e no coincide con la defensa Pokémon esperada.`,
          {
            rolledDamage:
              damageTotal,

            damageType,

            multiplier,

            expected,

            observed
          }
        )
  );


  return checks;
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export async function runFoundryActivityFixtures({
  actorUuid = null,
  notify = true
} = {}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Foundry Activity Fixtures requiere un usuario GM."
    );
  }


  if (
    Number(
      game.user.targets?.size ??
      0
    ) > 0
  ) {

    const checks = [
      skip(
        "activity.precondition.targets-clear",
        "Deselecciona todos los targets reales antes de ejecutar Activity Fixtures. No se modificaron objetivos automáticamente."
      )
    ];


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
        "poke5e-foundry-activity-fixtures",

      sourceActorUuid:
        null,

      summary,
      checks,

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
    plainAttackCandidate(
      source
    );


  if (
    !source ||
    !sourceCandidate
  ) {

    const checks = [
      skip(
        "activity.candidate",
        actorUuid
          ? "El Pokémon indicado no posee una Activity attack sencilla apta para este fixture."
          : "No se encontró un Pokémon importado con una Activity attack sencilla apta para este fixture."
      )
    ];


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
        "poke5e-foundry-activity-fixtures",

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
  let attacker = null;
  let target = null;
  let messageCleanup = null;
  let fixtureCleanup = null;


  const messageSnapshot =
    currentMessageIds();


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


    target =
      await createFixtureActor(
        source,
        {
          nameSuffix:
            "Target",

          itemId:
            null
        }
      );


    if (
      !attacker ||
      !target
    ) {

      checks.push(
        fail(
          "activity.fixture-actors",
          "No se pudieron crear ambos Actors temporales para Activity Fixtures."
        )
      );

    } else {

      checks.push(
        pass(
          "activity.fixture-actors",
          "Attacker y Target temporales creados sin modificar Actors originales.",
          {
            attackerUuid:
              attacker.uuid,

            targetUuid:
              target.uuid
          }
        )
      );


      checks.push(
        ...await executeAttackPipeline(
          attacker,
          target,
          sourceCandidate
        )
      );
    }

  } catch (
    error
  ) {

    checks.push(
      fail(
        "activity.runtime",
        "La ejecución del Activity Fixture lanzó una excepción.",
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
    messageCleanup.failures.length ===
      0

      ? pass(
          "activity.chat-cleanup",
          "Los ChatMessages creados por las tiradas del fixture fueron eliminados.",
          messageCleanup
        )

      : fail(
          "activity.chat-cleanup",
          "No se pudieron eliminar todos los ChatMessages del fixture.",
          messageCleanup
        )
  );


  checks.push(
    fixtureCleanup.failures.length ===
      0

      ? pass(
          "activity.fixture-cleanup",
          "Los Actors temporales del Activity Fixture fueron eliminados.",
          fixtureCleanup
        )

      : fail(
          "activity.fixture-cleanup",
          "Quedaron documentos temporales del Activity Fixture sin eliminar.",
          fixtureCleanup
        )
  );


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
      "poke5e-foundry-activity-fixtures",

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
        sourceCandidate.activity.id
    },

    summary,
    checks,

    cleanup: {
      messages:
        messageCleanup,

      fixtures:
        fixtureCleanup
    }
  };
}
