import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbilityItem,
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

const actors = new Map();
globalThis.fromUuidSync = uuid => actors.get(uuid) ?? null;

globalThis.CONST = {
  ACTIVE_EFFECT_MODES: {
    OVERRIDE: 5
  }
};

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
  registerPokemonReactiveHitAbilityEngine
} = await import("../reactive-hit-ability-engine.mjs");

registerAttackOutcomeEngine();
registerPokemonReactiveHitAbilityEngine();

function flushAsyncSubscribers() {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

function runtimeActor({
  uuid,
  name,
  ability = null,
  proficiencyBonus = null
}) {
  const actor = createFlagDocument({
    uuid,
    name,
    flags: {
      "poke5e-local": proficiencyBonus == null
        ? {}
        : {
            proficiencyBonus
          }
    },
    items: ability
      ? [createAbilityItem(ability)]
      : [],
    effects: [],
    system: {
      attributes: {
        movement: {
          walk: 30,
          burrow: 0,
          climb: 0,
          fly: 0,
          swim: 0,
          bonus: 0
        }
      }
    }
  });

  actor.damageApplications = [];
  actor.createdEffects = [];

  actor.applyDamage = async function applyDamage(value) {
    this.damageApplications.push(value);
    return this;
  };

  actor.createEmbeddedDocuments = async function createEmbeddedDocuments(
    type,
    sources
  ) {
    assert.equal(type, "ActiveEffect");
    this.createdEffects.push(...sources);
    return sources.map((source, index) => ({
      ...source,
      id: source.id ?? `Effect.${index}`
    }));
  };

  return actor;
}

function moveItem() {
  return {
    uuid: "Item.tackle",
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
}

function meleeActivity(attacker) {
  return {
    id: "attack",
    actor: attacker,
    item: moveItem(),
    attack: {
      type: {
        value: "melee"
      }
    }
  };
}

function hitRoll(targetUuid) {
  return {
    d20: {
      results: [
        {
          result: 12,
          active: true,
          discarded: false
        }
      ]
    },
    total: 18,
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

async function dispatchMeleeHit(attacker, defender, triggerTotal) {
  TriggerRoll.nextTotal = triggerTotal;
  actors.set(attacker.uuid, attacker);
  actors.set(defender.uuid, defender);

  hooks.handler("dnd5e.rollAttack")(
    [hitRoll(defender.uuid)],
    {
      subject: meleeActivity(attacker)
    }
  );

  await flushAsyncSubscribers();
}

for (const [ability, damageType] of [
  ["static", "electric"],
  ["poison-point", "poison"],
  ["effect-spore", "grass"]
]) {
  test(`${ability} applies source PB as typed reactive damage on trigger`, async () => {
    const attacker = runtimeActor({
      uuid: `Actor.attacker-${ability}`,
      name: "Attacker"
    });
    const defender = runtimeActor({
      uuid: `Actor.defender-${ability}`,
      name: "Defender",
      ability,
      proficiencyBonus: 3
    });

    await dispatchMeleeHit(attacker, defender, 4);

    assert.deepEqual(
      attacker.damageApplications,
      [
        [
          {
            value: 3,
            type: damageType
          }
        ]
      ]
    );
  });
}

test("Flame Body applies Burned when its 1d10 trigger succeeds", async () => {
  const attacker = runtimeActor({
    uuid: "Actor.attacker-flame",
    name: "Attacker"
  });
  const defender = runtimeActor({
    uuid: "Actor.defender-flame",
    name: "Defender",
    ability: "flame-body"
  });

  await dispatchMeleeHit(attacker, defender, 10);

  assert.equal(attacker.createdEffects.length, 1);
  assert.deepEqual(
    attacker.createdEffects[0].statuses,
    ["poke5e-burned"]
  );
  assert.equal(
    attacker.createdEffects[0].flags["poke5e-local"].sourceAbility,
    "flame-body"
  );
});

test("Gooey applies a non-stacking speed-zero effect until end of next turn", async () => {
  const attacker = runtimeActor({
    uuid: "Actor.attacker-gooey",
    name: "Attacker"
  });
  const defender = runtimeActor({
    uuid: "Actor.defender-gooey",
    name: "Defender",
    ability: "gooey"
  });

  await dispatchMeleeHit(attacker, defender, 3);

  assert.equal(attacker.createdEffects.length, 1);

  const effect = attacker.createdEffects[0];

  assert.equal(
    effect.flags["poke5e-local"].movementLock.speed,
    0
  );
  assert.equal(
    effect.flags["poke5e-local"].expireAtEndOfNextTurn,
    true
  );
  assert.equal(effect.changes.length, 6);
  assert.ok(
    effect.changes.every(change => change.value === "0")
  );
});

test("Stench applies Flinched until the end of the attacker's next turn", async () => {
  const attacker = runtimeActor({
    uuid: "Actor.attacker-stench",
    name: "Attacker"
  });
  const defender = runtimeActor({
    uuid: "Actor.defender-stench",
    name: "Defender",
    ability: "stench"
  });

  await dispatchMeleeHit(attacker, defender, 10);

  assert.equal(attacker.createdEffects.length, 1);

  const effect = attacker.createdEffects[0];

  assert.deepEqual(
    effect.statuses,
    ["poke5e-flinched"]
  );
  assert.equal(
    effect.flags["poke5e-local"].expireAtEndOfNextTurn,
    true
  );
  assert.equal(
    effect.flags["poke5e-local"].sourceAbility,
    "stench"
  );
});
