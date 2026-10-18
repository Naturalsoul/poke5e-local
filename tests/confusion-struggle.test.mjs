import test from "node:test";
import assert from "node:assert/strict";

import {
  createFlagDocument,
  createHooks,
  renderMockRollMessage,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

import {
  STRUGGLE_ACTIVITY_IDS
} from "../scripts/struggle-rules.mjs";

installFoundryUtils();

const messages = [];

class ConfusionRoll {
  static nextTotal = 1;

  constructor(formula) {
    this.formula = formula;
    this.total = null;
  }

  async evaluate() {
    this.total = ConfusionRoll.nextTotal;
    return this;
  }

  async toMessage(data) {
    return renderMockRollMessage(data);
  }
}

globalThis.Roll = ConfusionRoll;

globalThis.CONST = {
  ACTIVE_EFFECT_MODES: {
    OVERRIDE: 5
  }
};

globalThis.game = {
  user: {
    id: "gm",
    isGM: true
  },
  users: {
    activeGM: {
      id: "gm"
    }
  },
  settings: {
    get() {
      return "es";
    }
  },
  combat: null,
  actors: []
};

globalThis.ui = {
  notifications: {
    warn() {},
    error(message) {
      throw new Error(`Unexpected notification: ${message}`);
    }
  }
};

globalThis.ChatMessage = {
  getSpeaker() {
    return {};
  },
  async create(data) {
    messages.push(data);
    return data;
  }
};

createHooks();

globalThis.canvas = {
  tokens: {
    get() {
      return null;
    }
  },
  grid: {
    measurePath() {
      return { distance: Infinity };
    }
  }
};

globalThis.fromUuidSync = () => null;

const {
  processConfusionStartTurn
} = await import("../scripts/confusion-engine.mjs");

function confusedEffect() {
  const flags = {
    status: "confused",
    confusion: {
      formula: "1d8",
      checks: 0,
      maxChecks: 3,
      expireAfterTurn: false
    }
  };

  return {
    disabled: false,
    statuses: new Set(["poke5e-confused"]),
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      return flags[key];
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "poke5e-local");
      flags[key] = structuredClone(value);
      return this;
    },
    async delete() {
      this.deleted = true;
    },
    _flags: flags
  };
}

function activityStub(damage) {
  const calls = {
    use: 0,
    attack: 0,
    damage: 0
  };

  return {
    calls,
    async use() {
      calls.use += 1;
      return true;
    },
    async rollAttack() {
      calls.attack += 1;
      return [
        {
          isCritical: false,
          isFumble: false,
          isSuccess: true
        }
      ];
    },
    async rollDamage() {
      calls.damage += 1;
      return [{ total: damage }];
    }
  };
}

function confusionActor() {
  const effect = confusedEffect();
  const actor = createFlagDocument({
    uuid: "Actor.confused",
    name: "Confusedmon",
    flags: {
      "poke5e-local": {
        sourceId: "confusedmon"
      }
    },
    effects: [effect],
    system: {
      attributes: {
        hp: {
          value: 20,
          max: 20
        },
        ac: {
          value: 12
        }
      }
    }
  });

  const melee = activityStub(4);
  const ranged = activityStub(6);

  const item = {
    name: "Struggle",
    documentName: "Item",
    actor,
    system: {
      activities: new Map([
        [STRUGGLE_ACTIVITY_IDS.melee, melee],
        [STRUGGLE_ACTIVITY_IDS.ranged, ranged]
      ])
    },
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      if (key === "sourceId") {
        return "struggle";
      }
      if (key === "struggle") {
        return {
          kind: "struggle",
          damageFormula: "2 + 2"
        };
      }
      return undefined;
    }
  };

  actor.items = [item];
  actor.damageApplications = [];
  actor.applyDamage = async function applyDamage(value) {
    this.damageApplications.push(value);
    return this;
  };

  return {
    actor,
    effect,
    melee,
    ranged
  };
}

test("Confusion result 1 routes into real self Struggle and increments the check counter", async () => {
  const context = confusionActor();
  ConfusionRoll.nextTotal = 1;

  await processConfusionStartTurn(
    context.actor
  );

  assert.deepEqual(
    context.actor.damageApplications,
    [4]
  );
  assert.equal(context.melee.calls.attack, 0);
  assert.equal(context.melee.calls.damage, 1);
  assert.equal(
    context.effect._flags.confusion.checks,
    1
  );
  assert.equal(
    context.effect._flags.confusion.expireAfterTurn,
    false
  );
});
