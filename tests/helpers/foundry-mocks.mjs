import assert from "node:assert/strict";

export function deepClone(value) {
  return value == null
    ? value
    : structuredClone(value);
}

export function getProperty(object, path) {
  return String(path)
    .split(".")
    .reduce(
      (value, key) => value?.[key],
      object
    );
}

export function setProperty(object, path, value) {
  const keys = String(path).split(".");
  let current = object;

  for (const key of keys.slice(0, -1)) {
    current[key] ??= {};
    current = current[key];
  }

  current[keys.at(-1)] = value;
  return true;
}

export function installFoundryUtils() {
  globalThis.foundry = {
    utils: {
      deepClone,
      getProperty,
      hasProperty: (object, key) => key in object || getProperty(object, key) !== undefined,
      setProperty
    }
  };
}

export function createHooks() {
  const callbacks = new Map();

  globalThis.Hooks = {
    on(name, handler) {
      const handlers = callbacks.get(name) ?? [];
      handlers.push(handler);
      callbacks.set(name, handlers);
      return handler;
    },

    once(name, handler) {
      return this.on(name, handler);
    },

    off(name, handler) {
      callbacks.set(name, (callbacks.get(name) ?? []).filter(entry => entry !== handler));
    },

    callAll(name, ...args) {
      for (const handler of callbacks.get(name) ?? []) {handler(...args);}
    }
  };

  return {
    callbacks,

    handler(name, index = 0) {
      const handlers = callbacks.get(name) ?? [];
      assert.ok(
        handlers[index],
        `No hook registered for ${name} at index ${index}.`
      );
      return handlers[index];
    },

    handlers(name) {
      return callbacks.get(name) ?? [];
    }
  };
}

let rollMessageSequence = 0;
export function renderMockRollMessage(data) {
  globalThis.requestAnimationFrame ??= callback => queueMicrotask(callback);
  if (!globalThis.Hooks) {createHooks();}
  const message = createFlagDocument({ uuid: `ChatMessage.roll${++rollMessageSequence}`, flags: data.flags });
  Hooks.callAll("dnd5e.renderChatMessage", message, { isConnected: true });
  return message;
}

export function createFlagDocument({
  uuid = "Actor.test",
  name = "Test",
  documentName = "Actor",
  flags = {},
  items = [],
  effects = [],
  system = {}
} = {}) {
  const storedFlags = structuredClone(flags);

  return {
    uuid,
    id: uuid.split(".").at(-1),
    name,
    documentName,
    items,
    effects,
    system,

    getFlag(moduleId, key) {
      return storedFlags[moduleId]?.[key];
    },

    async setFlag(moduleId, key, value) {
      storedFlags[moduleId] ??= {};
      storedFlags[moduleId][key] = structuredClone(value);
      return this;
    },

    async unsetFlag(moduleId, key) {
      if (storedFlags[moduleId]) {
        delete storedFlags[moduleId][key];
      }
      return this;
    },

    _flags: storedFlags
  };
}

export function createAbilityItem(abilityId) {
  return {
    name: abilityId,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      if (key === "kind") {
        return "ability";
      }
      if (key === "sourceId") {
        return abilityId;
      }
      return undefined;
    }
  };
}

export class MockRoll {
  constructor(formula, data = {}, options = {}) {
    this.formula = String(formula);
    this.data = data;
    this.options = options;
    this.total = null;
  }

  static create(formula, data = {}, options = {}) {
    return new this(formula, data, options);
  }

  static validate(formula) {
    const text = String(formula ?? "").trim();
    return Boolean(text) &&
      !/\bRd\d+\b/i.test(text) &&
      !/\bdice\b/i.test(text);
  }

  evaluateSync({ maximize = false } = {}) {
    if (!MockRoll.validate(this.formula)) {
      throw new Error(`Invalid formula: ${this.formula}`);
    }

    const expression = this.formula.replace(
      /(\d+)d(\d+)/gi,
      (_match, count, sides) => {
        const dice = Number(count);
        const faces = Number(sides);
        return String(
          maximize
            ? dice * faces
            : dice
        );
      }
    );

    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error(`Unsupported expression: ${expression}`);
    }

    this.total = Function(
      `"use strict"; return (${expression});`
    )();

    return this;
  }
}
