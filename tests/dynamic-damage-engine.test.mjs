import test from "node:test";
import assert from "node:assert/strict";
import {
  createFlagDocument,
  createHooks,
  installFoundryUtils,
  MockRoll
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

globalThis.Roll = MockRoll;
globalThis.CONFIG = {
  Dice: {
    randomUniform() {
      return 0.5;
    }
  }
};

globalThis.game = {
  user: { id: "gm", isGM: true },
  users: { activeGM: { id: "gm" } },
  settings: {
    get() {
      return "es";
    }
  },
  combat: null
};

globalThis.ui = {
  notifications: {
    error(message) {
      throw new Error(`Unexpected notification: ${message}`);
    }
  }
};

globalThis.fromUuidSync = () => null;

globalThis.ChatMessage = {
  create: async () => null,
  getSpeaker: () => ({})
};

const {
  registerDynamicDamageEngine
} = await import("../scripts/dynamic-damage-engine.mjs");

registerDynamicDamageEngine();

function dynamicItem(kind, formula, actor = null) {
  const flags = {
    kind: "move",
    sourceId: kind,
    dynamicDamage: {
      kind,
      implemented: true,
      rejectedFormulas: [formula]
    }
  };

  return {
    name: kind,
    documentName: "Item",
    actor,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      return flags[key];
    }
  };
}

function runDamageHook(item) {
  const rolls = [new MockRoll("0", {}, {})];
  const message = { data: {} };
  const config = {
    hookNames: new Set(["damage"]),
    subject: { item }
  };

  const handler = hooks.handler("dnd5e.postRollConfiguration");
  const result = handler(rolls, config, null, message);
  return { rolls, message, result };
}

test("Magnitude replaces placeholder using Foundry RNG without sync d100 evaluation", () => {
  const result = runDamageHook(
    dynamicItem("magnitude", "3×dice + 2")
  );

  assert.notEqual(result.result, false);
  assert.equal(result.rolls[0].formula, "3d12 + 2");
  assert.equal(
    result.message.data.flags["poke5e-local"].dynamicDamage.tableRoll,
    51
  );
});

test("Rollout starts at stage 1 outside combat", () => {
  const actor = createFlagDocument({ uuid: "Actor.rollout" });
  const result = runDamageHook(
    dynamicItem("rollout", "Rd6 + 2", actor)
  );

  assert.equal(result.rolls[0].formula, "1d6 + 2");
  assert.equal(
    result.message.data.flags["poke5e-local"].dynamicDamage.stage,
    1
  );
});

test("Rollout advances when previous success belongs to preceding combat round", () => {
  const actor = createFlagDocument({
    uuid: "Actor.rollout-combat",
    flags: {
      "poke5e-local": {
        dynamicDamageState: {
          rollout: {
            combatId: "Combat.one",
            lastSuccessRound: 1,
            nextStage: 2
          }
        }
      }
    }
  });

  game.combat = {
    id: "Combat.one",
    round: 2,
    combatant: { actor }
  };

  const result = runDamageHook(
    dynamicItem("rollout", "Rd6 + 2", actor)
  );

  assert.equal(result.rolls[0].formula, "2d6 + 2");
  assert.equal(
    result.message.data.flags["poke5e-local"].dynamicDamage.stage,
    2
  );

  game.combat = null;
});
