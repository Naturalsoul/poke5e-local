import test from "node:test";
import assert from "node:assert/strict";
import {
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const documentListeners = new Map();
const notifications = [];
const rollMessages = [];

globalThis.document = {
  addEventListener(name, handler) {
    const handlers = documentListeners.get(name) ?? [];
    handlers.push(handler);
    documentListeners.set(name, handlers);
  }
};

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

globalThis.canvas = {
  tokens: {
    controlled: []
  }
};

globalThis.ui = {
  notifications: {
    warn(message) {
      notifications.push({ type: "warn", message });
    },
    info(message) {
      notifications.push({ type: "info", message });
    },
    error(message) {
      notifications.push({ type: "error", message });
    }
  }
};

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  },
  messages: new Map(),
  user: {
    character: null
  }
};

class HealingRoll {
  constructor(formula) {
    this.formula = String(formula);
    this.total = null;
  }

  static create(formula) {
    return new this(formula);
  }

  async evaluate() {
    const diceCount = Array.from(
      this.formula.matchAll(/1d6/gi)
    ).length;
    this.total = diceCount * 4;
    return this;
  }

  async toMessage(data) {
    rollMessages.push({
      formula: this.formula,
      total: this.total,
      data
    });
    return null;
  }
}

globalThis.Roll = HealingRoll;

globalThis.ChatMessage = {
  getSpeaker() {
    return {};
  }
};

function moveItem(actorRef, sourceId) {
  return {
    uuid: `Item.${sourceId}`,
    name: sourceId,
    actor: actorRef,
    documentName: "Item",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      if (key === "kind") {
        return "move";
      }
      if (key === "sourceId") {
        return sourceId;
      }
      if (key === "saveResult") {
        return {
          kind: "heal-per-failed-save",
          formulaPerFailure: "1d6"
        };
      }
      return undefined;
    }
  };
}

function saveActivity(item) {
  return {
    id: "save-result-activity",
    type: "save",
    item,
    activation: {
      type: "action"
    },
    save: {
      ability: {
        first() {
          return "wis";
        }
      },
      dc: {
        value: 13
      }
    },
    damage: {
      onSave: "half"
    }
  };
}

function usageMessage({ id, item, activity }) {
  const flags = {};

  return {
    id,
    getAssociatedItem() {
      return item;
    },
    getAssociatedActivity() {
      return activity;
    },
    getAssociatedActor() {
      return item.actor;
    },
    getOriginatingMessage() {
      return this;
    },
    getFlag(moduleId, key) {
      return flags[moduleId]?.[key];
    },
    async setFlag(moduleId, key, value) {
      flags[moduleId] ??= {};
      flags[moduleId][key] = structuredClone(value);
      return this;
    },
    _flags: flags
  };
}

function saveButtonEvent(messageId) {
  const messageElement = {
    dataset: {
      messageId
    }
  };
  const button = {
    dataset: {
      ability: "wis",
      dc: "13"
    },
    closest(selector) {
      if (selector === 'button[data-action="rollSave"]') {
        return this;
      }
      if (selector === "[data-message-id]") {
        return messageElement;
      }
      return null;
    }
  };

  return { target: button };
}

function resultButtonEvent(messageId) {
  const button = {
    disabled: false,
    innerHTML: "",
    dataset: {
      poke5eAction: "resolve-save-result",
      messageId
    },
    closest(selector) {
      if (selector === '[data-poke5e-action="resolve-save-result"]') {
        return this;
      }
      return null;
    }
  };

  return {
    button,
    event: {
      target: button,
      preventDefault() {},
      stopPropagation() {}
    }
  };
}

function beginSaveBatch(message, actors) {
  game.messages.set(message.id, message);
  canvas.tokens.controlled = actors.map(actor => ({ actor }));
  const clickHandlers = documentListeners.get("click") ?? [];
  assert.ok(clickHandlers[0], "SaveOutcome click capture was not registered.");
  clickHandlers[0](saveButtonEvent(message.id));
}

function recordSave(actor, success, total) {
  hooks.handler("dnd5e.rollSavingThrow")(
    [
      {
        total,
        isSuccess: success,
        options: {
          target: 13
        }
      }
    ],
    {
      subject: actor,
      ability: "wis"
    }
  );
}

async function clickSaveResult(messageId) {
  const clickHandlers = documentListeners.get("click") ?? [];
  assert.ok(clickHandlers[1], "SaveResult click handler was not registered.");
  const { button, event } = resultButtonEvent(messageId);
  clickHandlers[1](event);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const message = game.messages.get(messageId);
    const resolution = message?.getFlag(
      "poke5e-local",
      "saveResultResolution"
    );
    if (resolution?.resolved) {
      await new Promise(resolve => setImmediate(resolve));
      return { button, resolution };
    }
    await new Promise(resolve => setImmediate(resolve));
  }

  throw new Error("SaveResult did not resolve in time.");
}

function sourceActor(uuid, hpValue, hpMax) {
  const actor = createFlagDocument({
    uuid,
    name: uuid,
    system: {
      attributes: {
        hp: {
          value: hpValue,
          max: hpMax
        }
      }
    }
  });
  actor.damageCalls = [];
  actor.applyDamage = async amount => {
    actor.damageCalls.push(amount);
    return actor;
  };
  return actor;
}

const saveOutcome = await import("../scripts/save-outcome-engine.mjs");
const saveResult = await import("../scripts/save-result-engine.mjs");
saveOutcome.registerSaveOutcomeEngine();
saveResult.registerSaveResultEngine();

test("SaveResult heals once per failed save and records a durable resolution", async () => {
  rollMessages.length = 0;
  const source = sourceActor("Actor.matcha-source", 10, 20);
  const item = moveItem(source, "matcha-gotcha");
  const activity = saveActivity(item);
  const message = usageMessage({
    id: "Message.matcha-result",
    item,
    activity
  });
  const targets = [
    createFlagDocument({ uuid: "Actor.matcha-a", name: "A" }),
    createFlagDocument({ uuid: "Actor.matcha-b", name: "B" }),
    createFlagDocument({ uuid: "Actor.matcha-c", name: "C" })
  ];

  beginSaveBatch(message, targets);
  recordSave(targets[0], false, 8);
  recordSave(targets[1], true, 16);
  recordSave(targets[2], false, 5);

  assert.equal(saveOutcome.getSaveProgress(message.id).complete, true);

  const { resolution } = await clickSaveResult(message.id);

  assert.equal(resolution.failures, 2);
  assert.equal(resolution.successes, 1);
  assert.equal(resolution.formula, "(1d6) + (1d6)");
  assert.equal(resolution.rolledHealing, 8);
  assert.equal(resolution.actualHealing, 8);
  assert.deepEqual(source.damageCalls, [-8]);
  assert.equal(rollMessages.length, 1);

  await clickSaveResult(message.id);
  assert.deepEqual(source.damageCalls, [-8]);
});

test("SaveResult resolves to zero healing when every target succeeds", async () => {
  const source = sourceActor("Actor.matcha-zero", 5, 20);
  const item = moveItem(source, "matcha-zero");
  const activity = saveActivity(item);
  const message = usageMessage({
    id: "Message.matcha-zero",
    item,
    activity
  });
  const targets = [
    createFlagDocument({ uuid: "Actor.matcha-zero-a" }),
    createFlagDocument({ uuid: "Actor.matcha-zero-b" })
  ];

  beginSaveBatch(message, targets);
  recordSave(targets[0], true, 15);
  recordSave(targets[1], true, 14);

  const { resolution } = await clickSaveResult(message.id);

  assert.equal(resolution.failures, 0);
  assert.equal(resolution.rolledHealing, 0);
  assert.equal(resolution.actualHealing, 0);
  assert.deepEqual(source.damageCalls, []);
});

test("SaveResult does not roll or heal a source already at full HP", async () => {
  const previousRollCount = rollMessages.length;
  const source = sourceActor("Actor.matcha-full", 20, 20);
  const item = moveItem(source, "matcha-full");
  const activity = saveActivity(item);
  const message = usageMessage({
    id: "Message.matcha-full",
    item,
    activity
  });
  const target = createFlagDocument({
    uuid: "Actor.matcha-full-target"
  });

  beginSaveBatch(message, [target]);
  recordSave(target, false, 2);

  const { resolution } = await clickSaveResult(message.id);

  assert.equal(resolution.reason, "full-hp");
  assert.equal(resolution.actualHealing, 0);
  assert.deepEqual(source.damageCalls, []);
  assert.equal(rollMessages.length, previousRollCount);
});
