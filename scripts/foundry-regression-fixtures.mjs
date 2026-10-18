import {
  calculatePokemonDefenses
} from "./types.mjs";

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
  "[Poke5e Regression]";

const BASE_TEST_DAMAGE =
  2;


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
    `Poke5e Fixtures: ${summary.pass} PASS · ` +
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
 * FIXTURE IDENTIFICATION
 * ============================================================ */

function fixtureMetadata(
  document
) {

  return (
    document?.getFlag?.(
      MODULE_ID,
      FIXTURE_FLAG
    ) ??
    null
  );
}


function isRegressionFixture(
  document
) {

  return (
    fixtureMetadata(
      document
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


      return isPokemonActor(
        actor
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
        )
    ) ??
    null
  );
}


/* ============================================================
 * FIXTURE SOURCE
 * ============================================================ */

function clearRuntimeState(
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
}


function fixtureActorSource(
  actor
) {

  const source =
    foundry.utils.deepClone(
      actor.toObject()
    );


  delete source._id;


  source.name =
    `${FIXTURE_PREFIX} ${actor.name}`;


  source.folder =
    null;


  source.effects =
    [];


  clearRuntimeState(
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

      createdAt:
        Date.now()
    }
  );


  const maximum =
    Number(
      foundry.utils.getProperty(
        source,
        "system.attributes.hp.max"
      )
    );


  if (
    Number.isFinite(
      maximum
    ) &&
    maximum > 0
  ) {

    foundry.utils.setProperty(
      source,
      "system.attributes.hp.value",
      maximum
    );

    foundry.utils.setProperty(
      source,
      "system.attributes.hp.temp",
      0
    );
  }


  return source;
}


async function createFixtureActor(
  actor
) {

  return Actor.implementation.create(
    fixtureActorSource(
      actor
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


async function resetHp(
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
 * DAMAGE CASES
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


function damageCases(
  actor
) {

  const defenses =
    calculatePokemonDefenses(
      actorTypes(
        actor
      )
    );


  return [
    {
      id:
        "resistance",

      type:
        defenses.resistances[0] ??
        null,

      multiplier:
        0.5
    },
    {
      id:
        "vulnerability",

      type:
        defenses.vulnerabilities[0] ??
        null,

      multiplier:
        2
    },
    {
      id:
        "immunity",

      type:
        defenses.immunities[0] ??
        null,

      multiplier:
        0
    },
    {
      id:
        "neutral",

      type:
        defenses.neutral[0] ??
        null,

      multiplier:
        1
    }
  ];
}


async function runTypedDamageCase(
  actor,
  definition
) {

  if (
    !definition.type
  ) {

    return skip(
      `fixture.damage.${definition.id}`,
      `${actor.name}: no posee un tipo de daño ${definition.id} para comprobar.`
    );
  }


  const before =
    await resetHp(
      actor
    );


  if (!before) {

    return skip(
      `fixture.damage.${definition.id}`,
      `${actor.name}: HP no resoluble para prueba de daño.`
    );
  }


  const expected =
    BASE_TEST_DAMAGE *
    definition.multiplier;


  if (
    before.maximum <
      expected
  ) {

    return skip(
      `fixture.damage.${definition.id}`,
      `${actor.name}: HP máximo insuficiente para distinguir el resultado esperado.`,
      {
        maximum:
          before.maximum,

        expected
      }
    );
  }


  await actor.applyDamage([
    {
      value:
        BASE_TEST_DAMAGE,

      type:
        definition.type
    }
  ]);


  const after =
    hpState(
      actor
    );


  const observed =
    actualDamage(
      before,
      after
    );


  return observed ===
    expected

    ? pass(
        `fixture.damage.${definition.id}`,
        `${actor.name}: ${definition.type} aplica ${observed} de daño efectivo.`,
        {
          baseDamage:
            BASE_TEST_DAMAGE,

          expected,

          observed
        }
      )

    : fail(
        `fixture.damage.${definition.id}`,
        `${actor.name}: D&D5e resolvió incorrectamente ${definition.id} para ${definition.type}.`,
        {
          baseDamage:
            BASE_TEST_DAMAGE,

          expected,

          observed
        }
      );
}


async function runDirectDamageCase(
  actor
) {

  const before =
    await resetHp(
      actor
    );


  if (!before) {

    return skip(
      "fixture.damage.direct",
      `${actor.name}: HP no resoluble para daño directo.`
    );
  }


  if (
    before.maximum <
      BASE_TEST_DAMAGE
  ) {

    return skip(
      "fixture.damage.direct",
      `${actor.name}: HP máximo insuficiente para daño directo.`
    );
  }


  await actor.applyDamage(
    BASE_TEST_DAMAGE
  );


  const after =
    hpState(
      actor
    );


  const observed =
    actualDamage(
      before,
      after
    );


  return observed ===
    BASE_TEST_DAMAGE

    ? pass(
        "fixture.damage.direct",
        `${actor.name}: applyDamage(number) conserva daño directo sin tipo.`,
        {
          expected:
            BASE_TEST_DAMAGE,

          observed
        }
      )

    : fail(
        "fixture.damage.direct",
        `${actor.name}: daño directo inesperado.`,
        {
          expected:
            BASE_TEST_DAMAGE,

          observed
        }
      );
}


/* ============================================================
 * SYNTHETIC TOKEN ACTOR
 * ============================================================ */

function fixtureSceneSource(
  actor
) {

  return {
    name:
      `${FIXTURE_PREFIX} Synthetic Actor`,

    active:
      false,

    navigation:
      false,

    width:
      1000,

    height:
      1000,

    padding:
      0,

    grid: {
      type:
        1,

      size:
        100,

      distance:
        5,

      units:
        "ft"
    },

    flags: {
      [MODULE_ID]: {
        [FIXTURE_FLAG]: {
          kind:
            FIXTURE_KIND,

          sourceActorUuid:
            actor.uuid,

          createdAt:
            Date.now()
        }
      }
    }
  };
}


async function createFixtureScene(
  actor
) {

  return Scene.implementation.create(
    fixtureSceneSource(
      actor
    )
  );
}


async function syntheticActorCheck(
  actor,
  scene
) {

  const tokenDocument =
    await actor.getTokenDocument({
      x:
        100,

      y:
        100,

      hidden:
        true,

      actorLink:
        false
    });


  const source =
    tokenDocument.toObject();


  delete source._id;


  source.actorId =
    actor.id;

  source.actorLink =
    false;


  const created =
    await scene.createEmbeddedDocuments(
      "Token",
      [
        source
      ]
    );


  const synthetic =
    created[0]?.actor ??
    null;


  if (!synthetic) {

    return fail(
      "fixture.synthetic-token",
      "El Token temporal no produjo un Actor resoluble."
    );
  }


  const sourceId =
    synthetic.getFlag?.(
      MODULE_ID,
      "sourceId"
    );


  const valid =
    synthetic.isToken ===
      true &&
    sourceId ===
      actor.getFlag(
        MODULE_ID,
        "sourceId"
      );


  return valid

    ? pass(
        "fixture.synthetic-token",
        `${synthetic.name}: Actor sintético válido y conserva contrato Poke5e.`,
        {
          actorUuid:
            synthetic.uuid,

          sourceId
        }
      )

    : fail(
        "fixture.synthetic-token",
        "El Actor sintético no conserva el contrato esperado.",
        {
          isToken:
            synthetic.isToken,

          sourceId
        }
      );
}


/* ============================================================
 * CLEANUP
 * ============================================================ */

async function deleteFixtureDocuments(
  documents
) {

  const failures = [];


  for (
    const document
    of documents
  ) {

    try {

      await document.delete();

    } catch (
      error
    ) {

      failures.push({
        uuid:
          document.uuid ??
          document.id ??
          null,

        message:
          error.message
      });
    }
  }


  return failures;
}


export async function cleanupFoundryRegressionFixtures({
  notify = true
} = {}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Foundry Regression Fixtures requiere un usuario GM."
    );
  }


  const scenes =
    game.scenes.filter(
      isRegressionFixture
    );


  const actors =
    game.actors.filter(
      isRegressionFixture
    );


  const sceneFailures =
    await deleteFixtureDocuments(
      scenes
    );


  const actorFailures =
    await deleteFixtureDocuments(
      actors
    );


  const failures = [
    ...sceneFailures,
    ...actorFailures
  ];


  const resultData = {
    scenes:
      scenes.length,

    actors:
      actors.length,

    failures
  };


  if (
    notify
  ) {

    if (
      failures.length
    ) {

      ui.notifications.error(
        `Poke5e Regression: cleanup incompleto (${failures.length} error/es).`
      );

    } else {

      ui.notifications.info(
        `Poke5e Regression: cleanup completo (${scenes.length} escena/s, ${actors.length} actor/es).`
      );
    }
  }


  return resultData;
}


/* ============================================================
 * PUBLIC: FIXTURES
 * ============================================================ */

export async function runFoundryRegressionFixtures({
  actorUuid = null,
  notify = true
} = {}) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Foundry Regression Fixtures requiere un usuario GM."
    );
  }


  await cleanupFoundryRegressionFixtures({
    notify:
      false
  });


  const source =
    sourceActor(
      actorUuid
    );


  if (!source) {

    const checks = [
      skip(
        "fixture.source-actor",
        actorUuid
          ? "El Actor indicado no es un Pokémon Poke5e resoluble."
          : "No existe un Pokémon importado que pueda utilizarse como fixture."
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
        "poke5e-foundry-regression-fixtures",

      sourceActorUuid:
        null,

      summary,
      checks,

      cleanup: {
        scenes:
          0,

        actors:
          0,

        failures:
          []
      }
    };
  }


  const checks = [];
  let fixtureActor = null;
  let fixtureScene = null;
  let cleanup = null;


  try {

    fixtureActor =
      await createFixtureActor(
        source
      );


    if (!fixtureActor) {

      checks.push(
        fail(
          "fixture.actor-created",
          "Actor.implementation.create no devolvió un fixture."
        )
      );

      return {
        kind:
          "poke5e-foundry-regression-fixtures",

        sourceActorUuid:
          source.uuid,

        summary:
          summarize(
            checks
          ),

        checks,
        cleanup:
          null
      };
    }


    checks.push(
      pass(
        "fixture.actor-created",
        `${fixtureActor.name}: clon temporal creado.`,
        {
          uuid:
            fixtureActor.uuid,

          sourceActorUuid:
            source.uuid
        }
      )
    );


    try {

      fixtureActor.validate({
        strict:
          true
      });


      checks.push(
        pass(
          "fixture.actor-datamodel",
          `${fixtureActor.name}: Actor DataModel válido.`
        )
      );

    } catch (
      error
    ) {

      checks.push(
        fail(
          "fixture.actor-datamodel",
          `${fixtureActor.name}: Actor DataModel inválido.`,
          error.message
        )
      );
    }


    checks.push(
      fixtureActor.items.size ===
        source.items.size

        ? pass(
            "fixture.embedded-items",
            `${fixtureActor.name}: Items embebidos clonados correctamente.`,
            {
              count:
                fixtureActor.items.size
            }
          )

        : fail(
            "fixture.embedded-items",
            `${fixtureActor.name}: cantidad de Items distinta del Actor fuente.`,
            {
              source:
                source.items.size,

              fixture:
                fixtureActor.items.size
            }
          )
    );


    for (
      const damageCase
      of damageCases(
        fixtureActor
      )
    ) {

      checks.push(
        await runTypedDamageCase(
          fixtureActor,
          damageCase
        )
      );
    }


    checks.push(
      await runDirectDamageCase(
        fixtureActor
      )
    );


    fixtureScene =
      await createFixtureScene(
        fixtureActor
      );


    if (
      fixtureScene
    ) {

      checks.push(
        pass(
          "fixture.scene-created",
          `${fixtureScene.name}: escena temporal creada sin activarla.`
        )
      );


      checks.push(
        await syntheticActorCheck(
          fixtureActor,
          fixtureScene
        )
      );

    } else {

      checks.push(
        fail(
          "fixture.scene-created",
          "Scene.implementation.create no devolvió una escena temporal."
        )
      );
    }

  } catch (
    error
  ) {

    checks.push(
      fail(
        "fixture.runtime",
        "La ejecución de fixtures lanzó una excepción.",
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

    cleanup =
      await cleanupFoundryRegressionFixtures({
        notify:
          false
      });
  }


  checks.push(
    cleanup.failures.length ===
      0

      ? pass(
          "fixture.cleanup",
          "Los documentos temporales fueron eliminados correctamente.",
          cleanup
        )

      : fail(
          "fixture.cleanup",
          "Quedaron documentos temporales sin eliminar.",
          cleanup
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
      "poke5e-foundry-regression-fixtures",

    sourceActorUuid:
      source.uuid,

    summary,
    checks,
    cleanup
  };
}
