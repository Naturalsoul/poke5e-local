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

globalThis.document = {
  addEventListener(name, handler) {
    documentListeners.set(name, handler);
  },
  createElement(tagName) {
    assert.equal(tagName, "button");
    return {
      dataset: {},
      disabled: false,
      innerHTML: "",
      type: ""
    };
  }
};

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  }
};

const notifications = [];
globalThis.ui = {
  notifications: {
    info(message) {
      notifications.push({ type: "info", message });
    },
    warn(message) {
      notifications.push({ type: "warn", message });
    },
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
    return data;
  }
};

const uuidDocuments = new Map();
globalThis.fromUuidSync = uuid => uuidDocuments.get(uuid) ?? null;

const {
  registerMultiTargetEngine
} = await import("../scripts/multi-target-engine.mjs");

registerMultiTargetEngine();

function sourceActor(id = "source") {
  const actor = createFlagDocument({
    uuid: `Actor.${id}`,
    name: id,
    flags: {
      "poke5e-local": {
        sourceId: id,
        level: 3
      }
    },
    system: {
      attributes: {
        hp: {
          value: 5,
          max: 20,
          temp: 0
        }
      }
    }
  });

  actor.damageCalls = [];
  actor.applyDamage = async function applyDamage(value) {
    this.damageCalls.push(value);
    if (Number(value) < 0) {
      this.system.attributes.hp.value = Math.min(
        this.system.attributes.hp.max,
        this.system.attributes.hp.value - Number(value)
      );
    }
    return this;
  };
  uuidDocuments.set(actor.uuid, actor);
  return actor;
}

function moveItem(source, id = "absorb") {
  const flags = {
    kind: "move",
    sourceId: id,
    level: 3,
    multiTarget: {
      kind: "multi-target-drain",
      fraction: 0.5,
      round: "floor",
      cap: {
        kind: "level-multiplier",
        multiplier: 2
      }
    }
  };

  return {
    uuid: `${source.uuid}.Item.${id}`,
    name: id,
    actor: source,
    documentName: "Item",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {return undefined;}
      return flags[key];
    }
  };
}

function damageMessage(id, item) {
  return {
    id,
    getAssociatedItem() {
      return item;
    },
    getFlag(moduleId, key) {
      if (moduleId === "dnd5e" && key === "roll.type") {
        return "damage";
      }
      return undefined;
    }
  };
}

function targetActor(id, before, beforeTemp = 0) {
  return createFlagDocument({
    uuid: `Actor.${id}`,
    name: id,
    system: {
      attributes: {
        hp: {
          value: before,
          max: before,
          temp: beforeTemp
        }
      }
    }
  });
}

function collectDamage({ message, target, after, afterTemp = 0, amount = 1 }) {
  hooks.handler("dnd5e.preApplyDamage")(
    target,
    amount,
    {
      "system.attributes.hp.value": after,
      "system.attributes.hp.temp": afterTemp
    },
    {
      originatingMessage: message
    }
  );
}

function renderResolver(message) {
  const container = {
    appended: [],
    append(button) {
      this.appended.push(button);
    }
  };

  const html = {
    querySelector(selector) {
      if (selector === '[data-poke5e-action="resolve-multi-target"]') {
        return null;
      }
      if (selector === ".card-buttons") {
        return container;
      }
      return null;
    }
  };

  hooks.handler("dnd5e.renderChatMessage")(message, html);
  assert.equal(container.appended.length, 1);
  return container.appended[0];
}

async function clickButton(button) {
  const listener = documentListeners.get("click");
  assert.ok(listener);
  listener({
    target: {
      closest(selector) {
        return selector === '[data-poke5e-action="resolve-multi-target"]'
          ? button
          : null;
      }
    },
    preventDefault() {},
    stopPropagation() {}
  });
  await new Promise(resolve => setImmediate(resolve));
}

test("multi-target drain aggregates effective damage across different targets and applies its level cap", async () => {
  const source = sourceActor("multi-source");
  const item = moveItem(source, "multi-drain");
  const message = damageMessage("Message.multi-cap", item);

  collectDamage({
    message,
    target: targetActor("multi-a", 10, 2),
    after: 4,
    afterTemp: 0,
    amount: 8
  });
  collectDamage({
    message,
    target: targetActor("multi-b", 12),
    after: 2,
    amount: 10
  });

  const button = renderResolver(message);
  assert.match(button.innerHTML, /18 daño/);

  await clickButton(button);

  assert.deepEqual(source.damageCalls, [-6]);
  assert.equal(source.system.attributes.hp.value, 11);
  assert.equal(button.disabled, true);
  assert.match(button.innerHTML, /Absorción resuelta/);
});

test("multi-target collection replaces duplicate target results instead of double-counting", () => {
  const source = sourceActor("multi-duplicate-source");
  const item = moveItem(source, "multi-duplicate");
  const message = damageMessage("Message.multi-duplicate", item);
  const target = targetActor("multi-duplicate-target", 10);

  collectDamage({ message, target, after: 5, amount: 5 });
  collectDamage({ message, target, after: 8, amount: 2 });

  const button = renderResolver(message);
  assert.match(button.innerHTML, /2 daño/);
  assert.doesNotMatch(button.innerHTML, /7 daño/);
});

test("multi-target resolver is idempotent after a usage has been resolved", async () => {
  notifications.length = 0;
  const source = sourceActor("multi-once-source");
  const item = moveItem(source, "multi-once");
  const message = damageMessage("Message.multi-once", item);
  const target = targetActor("multi-once-target", 10);

  collectDamage({ message, target, after: 4, amount: 6 });
  const button = renderResolver(message);

  await clickButton(button);
  await clickButton(button);

  assert.deepEqual(source.damageCalls, [-3]);
  assert.equal(
    notifications.some(entry => /ya fue resuelta/i.test(entry.message)),
    true
  );
});

test("multi-target drain resolves without healing when effective damage is zero", async () => {
  const source = sourceActor("multi-zero-source");
  const item = moveItem(source, "multi-zero");
  const message = damageMessage("Message.multi-zero", item);
  const target = targetActor("multi-zero-target", 10);

  collectDamage({ message, target, after: 10, amount: 5 });
  const button = renderResolver(message);
  assert.match(button.innerHTML, /0 daño/);

  await clickButton(button);

  assert.deepEqual(source.damageCalls, []);
  assert.equal(button.disabled, true);
});
