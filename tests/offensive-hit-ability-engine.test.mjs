import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbilityItem,
  createFlagDocument,
  createHooks
} from "./helpers/foundry-mocks.mjs";

const hooks = createHooks();
const actors = new Map();

globalThis.fromUuidSync = uuid => actors.get(uuid) ?? null;

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  }
};

globalThis.ChatMessage = {
  getSpeaker() {
    return {};
  },
  async create() {
    return null;
  }
};

class TriggerRoll {
  static nextTotal = 1;

  constructor(formula) {
    this.formula = formula;
    this.total = null;
  }

  static create(formula) {
    return new this(formula);
  }

  async evaluate() {
    this.total = TriggerRoll.nextTotal;
    return this;
  }
}

globalThis.Roll = TriggerRoll;

const {
  registerAttackOutcomeEngine
} = await import("../attack-outcome-engine.mjs");
const {
  registerPokemonOffensiveHitAbilityEngine
} = await import("../offensive-hit-ability-engine.mjs");

registerAttackOutcomeEngine();
registerPokemonOffensiveHitAbilityEngine();

function flushAsyncSubscribers() {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

function actor({ uuid, ability = null } = {}) {
  const result = createFlagDocument({
    uuid,
    items: ability
      ? [createAbilityItem(ability)]
      : []
  });

  result.createdEffects = [];
  result.createEmbeddedDocuments = async function createEmbeddedDocuments(
    type,
    sources
  ) {
    assert.equal(type, "ActiveEffect");
    this.createdEffects.push(...sources);
    return sources;
  };

  return result;
}

function activity(source, scope) {
  const item = {
    uuid: "Item.attack",
    documentName: "Item",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      if (key === "kind") {
        return "move";
      }
      if (key === "sourceId") {
        return "tackle";
      }
      return undefined;
    }
  };

  return {
    id: "attack",
    actor: source,
    item,
    attack: {
      type: {
        value: scope
      }
    }
  };
}

function hitRoll(targetUuid) {
  return {
    d20: {
      results: [
        {
          result: 14,
          active: true,
          discarded: false
        }
      ]
    },
    total: 20,
    isCritical: false,
    isFumble: false,
    hasAdvantage: false,
    hasDisadvantage: false,
    options: {
      target: 12,
      poke5eTargetActorUuid: targetUuid
    }
  };
}

async function dispatch(source, target, scope, triggerTotal) {
  TriggerRoll.nextTotal = triggerTotal;
  actors.set(source.uuid, source);
  actors.set(target.uuid, target);

  hooks.handler("dnd5e.rollAttack")(
    [hitRoll(target.uuid)],
    {
      subject: activity(source, scope)
    }
  );

  await flushAsyncSubscribers();
}

test("Poison Touch applies Poisoned after a triggered melee hit", async () => {
  const source = actor({
    uuid: "Actor.poison-touch",
    ability: "poison-touch"
  });
  const target = actor({
    uuid: "Actor.target"
  });

  await dispatch(source, target, "melee", 10);

  assert.equal(target.createdEffects.length, 1);
  assert.deepEqual(
    target.createdEffects[0].statuses,
    ["poisoned"]
  );
  assert.equal(
    target.createdEffects[0].flags["poke5e-local"].sourceAbility,
    "poison-touch"
  );
});

test("Poison Touch ignores ranged hits", async () => {
  const source = actor({
    uuid: "Actor.poison-touch-ranged",
    ability: "poison-touch"
  });
  const target = actor({
    uuid: "Actor.target-ranged"
  });

  await dispatch(source, target, "ranged", 10);

  assert.equal(target.createdEffects.length, 0);
});
