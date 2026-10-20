import test from "node:test";
import assert from "node:assert/strict";
import {
  createHooks
} from "./helpers/foundry-mocks.mjs";

const hooks = createHooks();

globalThis.CONFIG = {
  Dice: {
    D20Roll: {
      ADV_MODE: {
        NORMAL: 0,
        ADVANTAGE: 1,
        DISADVANTAGE: -1
      }
    }
  }
};

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  }
};

const {
  registerPokemonFlinchEngine
} = await import("../scripts/flinch-engine.mjs");

registerPokemonFlinchEngine();

function flinchedEffect() {
  return {
    disabled: false,
    statuses: new Set(["poke5e-flinched"]),
    flags: {
      "poke5e-local": {
        status: "flinched"
      }
    },
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    }
  };
}

function flinchedActor() {
  return {
    effects: [flinchedEffect()]
  };
}

function prepareRoll({ advantage = false } = {}) {
  const rollConfig = {
    options: advantage
      ? { advantage: true }
      : {}
  };

  hooks.handler("dnd5e.preRollAttack")({
    subject: {
      actor: flinchedActor()
    },
    rolls: [rollConfig]
  });

  const roll = {
    options: {
      ...rollConfig.options,
      advantageMode: advantage
        ? CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE
        : CONFIG.Dice.D20Roll.ADV_MODE.NORMAL
    },
    configured: false,
    configureModifiers() {
      this.configured = true;
    }
  };

  hooks.handler("dnd5e.postRollConfiguration")([roll]);

  return roll;
}

test("Flinched forces Disadvantage on an attack roll", () => {
  const roll = prepareRoll();

  assert.equal(roll.options.disadvantage, true);
  assert.equal(
    roll.options.advantageMode,
    CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE
  );
  assert.equal(roll.configured, true);
});

test("Flinched cancels existing Advantage to Normal", () => {
  const roll = prepareRoll({
    advantage: true
  });

  assert.equal(roll.options.disadvantage, true);
  assert.equal(
    roll.options.advantageMode,
    CONFIG.Dice.D20Roll.ADV_MODE.NORMAL
  );
});
