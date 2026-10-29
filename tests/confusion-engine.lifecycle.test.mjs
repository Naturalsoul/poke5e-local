import test from "node:test";
import assert from "node:assert/strict";

import {
  createFlagDocument,
  createHooks,
  renderMockRollMessage,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

class ConfusionRoll {
  static nextTotal = 4;

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
  user: { id: "gm", isGM: true },
  users: { activeGM: { id: "gm" } },
  settings: {
    get() {
      return "es";
    }
  },
  combat: null,
  actors: []
};

const warnings = [];
globalThis.ui = {
  notifications: {
    warn(message) {
      warnings.push(message);
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
  processConfusionEndTurn,
  processConfusionStartTurn,
  registerPokemonConfusionEngine
} = await import("../scripts/confusion-engine.mjs");

registerPokemonConfusionEngine();

function confusedEffect(actor, {
  checks = 0,
  maxChecks = 3,
  expireAfterTurn = false
} = {}) {
  const flags = {
    status: "confused",
    confusion: {
      formula: "1d8",
      checks,
      maxChecks,
      expireAfterTurn
    }
  };

  return {
    id: "Effect.confused",
    name: "Confundido",
    parent: actor,
    disabled: false,
    deleted: false,
    statuses: new Set(["poke5e-confused"]),
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {return undefined;}
      return flags[key];
    },
    async setFlag(moduleId, key, value) {
      assert.equal(moduleId, "poke5e-local");
      flags[key] = structuredClone(value);
      return this;
    },
    async delete() {
      this.deleted = true;
      return this;
    },
    _flags: flags
  };
}

function pokemonActor(id) {
  const actor = createFlagDocument({
    uuid: `Actor.${id}`,
    name: id,
    flags: {
      "poke5e-local": {
        kind: "pokemon",
        sourceId: id
      }
    },
    system: {
      attributes: {
        movement: {
          walk: 30,
          fly: 0,
          swim: 0,
          climb: 0,
          burrow: 0,
          bonus: 0
        }
      }
    }
  });

  actor.createdEffects = [];
  actor.createEmbeddedDocuments = async function createEmbeddedDocuments(
    documentName,
    sources
  ) {
    assert.equal(documentName, "ActiveEffect");
    this.createdEffects.push(...structuredClone(sources));
    return sources.map((source, index) => ({
      ...source,
      id: `Created.${index}`
    }));
  };

  return actor;
}

test("Confusion result 8 ends Confused immediately without waiting for end turn", async () => {
  const actor = pokemonActor("confusion-eight");
  const effect = confusedEffect(actor);
  actor.effects = [effect];
  ConfusionRoll.nextTotal = 8;

  await processConfusionStartTurn(actor);

  assert.equal(effect.deleted, true);
  assert.equal(effect._flags.confusion.checks, 0);
});

test("Confusion result 3 creates a turn lock with Incapacitated and zero movement", async () => {
  const actor = pokemonActor("confusion-three");
  const effect = confusedEffect(actor);
  actor.effects = [effect];
  ConfusionRoll.nextTotal = 3;

  await processConfusionStartTurn(actor);

  assert.equal(actor.createdEffects.length, 1);
  const lock = actor.createdEffects[0];
  assert.deepEqual(lock.statuses, ["incapacitated"]);
  assert.equal(
    lock.flags["poke5e-local"].kind,
    "confusion-turn-lock"
  );
  assert.equal(
    lock.changes.every(change => change.value === "0"),
    true
  );
});

test("Confusion marks its third check for expiration and deletes at end of that turn", async () => {
  const actor = pokemonActor("confusion-third");
  const effect = confusedEffect(actor, { checks: 2 });
  actor.effects = [effect];
  ConfusionRoll.nextTotal = 4;

  await processConfusionStartTurn(actor);

  assert.equal(effect._flags.confusion.checks, 3);
  assert.equal(effect._flags.confusion.expireAfterTurn, true);
  assert.equal(effect.deleted, false);

  await processConfusionEndTurn(actor);
  assert.equal(effect.deleted, true);
});

test("Confused blocks reactions even without a turn-lock result", () => {
  warnings.length = 0;
  const actor = pokemonActor("confusion-reaction");
  actor.effects = [confusedEffect(actor)];

  const result = hooks.handler("dnd5e.preUseActivity")({
    actor,
    activation: {
      type: "reaction"
    }
  });

  assert.equal(result, false);
  assert.equal(warnings.length, 1);
});

test("Confusion turn lock blocks actions but a normal Confused actor may still use an action", () => {
  const actor = pokemonActor("confusion-action");
  const confused = confusedEffect(actor);
  actor.effects = [confused];

  const normalResult = hooks.handler("dnd5e.preUseActivity")({
    actor,
    activation: {
      type: "action"
    }
  });
  assert.equal(normalResult, true);

  actor.effects.push({
    disabled: false,
    getFlag(moduleId, key) {
      if (moduleId === "poke5e-local" && key === "kind") {
        return "confusion-turn-lock";
      }
      return undefined;
    }
  });

  const lockedResult = hooks.handler("dnd5e.preUseActivity")({
    actor,
    activation: {
      type: "action"
    }
  });
  assert.equal(lockedResult, false);
});

function outrageEffect(actor, endReason) {
  return {
    parent: actor,
    disabled: false,
    getFlag(moduleId, key) {
      if (moduleId === "poke5e-local" && key === "outrage") {
        return {
          kind: "outrage",
          endReason
        };
      }
      return undefined;
    }
  };
}

test("ending Outrage normally creates Confused, while combat-end cleanup does not", async () => {
  const completedActor = pokemonActor("outrage-completed");
  completedActor.effects = [];
  const completedEffect = outrageEffect(completedActor, "completed");

  const cleanupActor = pokemonActor("outrage-cleanup");
  cleanupActor.effects = [];
  const cleanupEffect = outrageEffect(cleanupActor, "combat-end");

  game.combat = {
    combatants: [
      { actor: completedActor },
      { actor: cleanupActor }
    ]
  };

  await hooks.handler("deleteActiveEffect")(completedEffect);
  await hooks.handler("deleteActiveEffect")(cleanupEffect);

  assert.equal(completedActor.createdEffects.length, 1);
  assert.equal(
    completedActor.createdEffects[0].flags["poke5e-local"].status,
    "confused"
  );
  assert.equal(cleanupActor.createdEffects.length, 0);
});
