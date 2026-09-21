import assert from "node:assert/strict";
import test from "node:test";

import {
  createHooks,
  installFoundryUtils,
  MockRoll
} from "./helpers/foundry-mocks.mjs";

import {
  POKEMON_TYPE_IDS
} from "../types.mjs";

const MODULE_ID =
  "poke5e-local";

const REQUIRED_STATUS_IDS = [
  "poke5e-paralysis",
  "poke5e-asleep",
  "poke5e-burned",
  "poke5e-frozen",
  "poke5e-confused",
  "poke5e-flinched"
];

function installBaseGlobals({
  version = "5.3.3",
  actors = []
} = {}) {

  installFoundryUtils();

  globalThis.Roll =
    MockRoll;

  globalThis.CONFIG = {
    DND5E: {
      damageTypes:
        Object.fromEntries(
          POKEMON_TYPE_IDS.map(
            type => [
              type,
              {
                label: type
              }
            ]
          )
        )
    },

    statusEffects:
      REQUIRED_STATUS_IDS.map(
        id => ({
          id
        })
      )
  };

  const notifications = [];

  globalThis.ui = {
    notifications: {
      info(message) {
        notifications.push({
          type: "info",
          message
        });
      },

      error(message) {
        notifications.push({
          type: "error",
          message
        });
      }
    }
  };

  globalThis.game = {
    user: {
      isGM: true
    },

    system: {
      id: "dnd5e",
      version
    },

    actors
  };

  globalThis.fromUuidSync =
    uuid =>
      actors.find(
        actor =>
          actor.uuid === uuid
      ) ??
      null;

  return {
    notifications
  };
}

function activityCollection(
  activities
) {

  return {
    *[Symbol.iterator]() {
      yield* activities;
    }
  };
}

function createActivity({
  id,
  name,
  formula = "0"
}) {

  return {
    id,
    uuid: `Activity.${id}`,
    name,

    damage: {
      parts: [
        {
          custom: {
            enabled: true,
            formula
          }
        }
      ]
    },

    validate() {
      return true;
    }
  };
}

function createMove({
  uuid,
  name,
  sourceId,
  activities,
  dynamicDamage = null,
  struggle = null
}) {

  const flags = {
    kind: "move",
    sourceId,
    dynamicDamage,
    struggle
  };

  return {
    uuid,
    id: uuid.split(".").at(-1),
    documentName: "Item",
    name,

    system: {
      activities:
        activityCollection(
          activities
        )
    },

    getFlag(moduleId, key) {
      return moduleId === MODULE_ID
        ? flags[key]
        : undefined;
    },

    validate() {
      return true;
    }
  };
}

function createPokemonActor({
  uuid = "Actor.pikachu",
  name = "Pikachu (Lv. 5)",
  items = []
} = {}) {

  const flags = {
    sourceId: "pikachu",
    level: 5,
    types: ["electric"]
  };

  return {
    uuid,
    id: uuid.split(".").at(-1),
    documentName: "Actor",
    name,
    items,
    effects: [],

    getFlag(moduleId, key) {
      return moduleId === MODULE_ID
        ? flags[key]
        : undefined;
    },

    validate() {
      return true;
    }
  };
}

async function importRunner() {
  return import(
    `../foundry-regression-runner.mjs?test=${Date.now()}-${Math.random()}`
  );
}

test(
  "Foundry runner: smoke base pasa en D&D5e 5.3.3 sin actores",
  async () => {

    installBaseGlobals();

    const module =
      await importRunner();

    const result =
      await module.runFoundryRegressionSmoke({
        notify: false
      });

    assert.equal(
      result.summary.fail,
      0
    );

    assert.equal(
      result.summary.pass,
      4
    );

    assert.equal(
      result.summary.skip,
      1
    );
  }
);

test(
  "Foundry runner: detecta versión D&D5e distinta de 5.3.3",
  async () => {

    installBaseGlobals({
      version: "5.3.4"
    });

    const module =
      await importRunner();

    const result =
      await module.runFoundryRegressionSmoke({
        notify: false
      });

    const versionCheck =
      result.checks.find(
        check =>
          check.id ===
            "system.version"
      );

    assert.equal(
      versionCheck.status,
      "fail"
    );
  }
);

test(
  "Foundry runner: valida actor, Struggle y Dynamic Damage materializados",
  async () => {

    const struggle =
      createMove({
        uuid: "Actor.pikachu.Item.struggle",
        name: "Struggle",
        sourceId: "struggle",
        activities: [
          createActivity({
            id: "P5eStruggleMelee",
            name: "Struggle — Melee"
          }),
          createActivity({
            id: "P5eStruggleRange",
            name: "Struggle — Ranged"
          })
        ],
        struggle: {
          kind: "struggle",
          noAmplification: true
        }
      });

    const rollout =
      createMove({
        uuid: "Actor.pikachu.Item.rollout",
        name: "Rollout",
        sourceId: "rollout",
        activities: [
          createActivity({
            id: "rollout-attack",
            name: "Rollout"
          })
        ],
        dynamicDamage: {
          kind: "rollout",
          implemented: true,
          rejectedFormulas: [
            "Rd6 + 2"
          ]
        }
      });

    const actor =
      createPokemonActor({
        items: [
          struggle,
          rollout
        ]
      });

    installBaseGlobals({
      actors: [
        actor
      ]
    });

    const module =
      await importRunner();

    const result =
      await module.runFoundryRegressionSmoke({
        notify: false
      });

    assert.equal(
      result.summary.fail,
      0
    );

    assert.ok(
      result.checks.some(
        check =>
          check.id ===
            `${rollout.uuid}.dynamic-placeholder` &&
          check.status ===
            "pass"
      )
    );
  }
);

test(
  "Foundry runner: marca como FAIL un Pokémon sin Struggle",
  async () => {

    const actor =
      createPokemonActor();

    installBaseGlobals({
      actors: [
        actor
      ]
    });

    const module =
      await importRunner();

    const result =
      await module.runFoundryRegressionSmoke({
        notify: false
      });

    assert.ok(
      result.checks.some(
        check =>
          check.id ===
            `${actor.uuid}.struggle` &&
          check.status ===
            "fail"
      )
    );
  }
);

test(
  "Foundry runner: trace registra el orden de hooks observados",
  async () => {

    installBaseGlobals();

    const hooks =
      createHooks();

    const module =
      await importRunner();

    module.registerFoundryRegressionRunner();

    globalThis.Poke5eRegression.startTrace();

    hooks.handler(
      "dnd5e.preRollAttack"
    )({
      subject: {
        id: "attack",
        item: {
          uuid: "Item.move",
          name: "Tackle"
        }
      }
    });

    hooks.handler(
      "dnd5e.rollAttack"
    )([
      new MockRoll(
        "1d20 + 4"
      )
    ]);

    const trace =
      globalThis.Poke5eRegression.stopTrace();

    assert.deepEqual(
      trace.events.map(
        event =>
          event.hook
      ),
      [
        "dnd5e.preRollAttack",
        "dnd5e.rollAttack"
      ]
    );
  }
);
