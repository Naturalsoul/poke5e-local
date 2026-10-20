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

globalThis.ChatMessage = {
  create: async () => null,
  getSpeaker: () => ({})
};

const uuidDocuments = new Map();
globalThis.fromUuidSync = uuid => uuidDocuments.get(uuid) ?? null;

const {
  registerDynamicDamageEngine
} = await import("../scripts/dynamic-damage-engine.mjs");

registerDynamicDamageEngine();

function dynamicItem(kind, formula, actor, extra = {}) {
  const flags = {
    kind: "move",
    sourceId: kind,
    stab: extra.stab ?? {
      eligible: false,
      bonus: 0
    },
    dynamicDamage: {
      kind,
      implemented: true,
      rejectedFormulas: [formula]
    }
  };

  return {
    uuid: `Actor.${actor?.id ?? "none"}.Item.${kind}`,
    name: kind,
    documentName: "Item",
    actor,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      return flags[key];
    }
  };
}

function damageMessage(item, resolution = null) {
  return {
    id: `Message.${item.name}`,
    data: {},
    getAssociatedItem() {
      return item;
    },
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local" || key !== "dynamicDamage") {
        return undefined;
      }
      return resolution;
    },
    getOriginatingMessage() {
      return null;
    }
  };
}

function resolveDynamic(item) {
  const rolls = [new MockRoll("0")];
  const message = damageMessage(item);
  const config = {
    hookNames: new Set(["damage"]),
    subject: { item }
  };

  hooks.handler("dnd5e.postRollConfiguration")(
    rolls,
    config,
    null,
    message
  );

  return {
    roll: rolls[0],
    resolution: message.data.flags["poke5e-local"].dynamicDamage
  };
}

function applyRolloutDamage({ source, item, target, resolution, before = 20, after = 15 }) {
  target.system = {
    attributes: {
      hp: {
        value: before,
        temp: 0
      }
    }
  };

  const message = damageMessage(item, resolution);
  const options = {
    originatingMessage: message
  };

  hooks.handler("dnd5e.preApplyDamage")(
    target,
    before - after,
    {
      "system.attributes.hp.value": after
    },
    options
  );

  hooks.handler("dnd5e.applyDamage", 0)(
    target,
    before - after,
    options
  );

  return new Promise(resolve => setImmediate(resolve));
}

function rolloutActor({ stage = null } = {}) {
  const flags = {
    "poke5e-local": {}
  };

  if (stage) {
    flags["poke5e-local"].dynamicDamageState = {
      rollout: stage
    };
  }

  const actor = createFlagDocument({
    uuid: "Actor.rollout-lifecycle",
    name: "Rolloutmon",
    flags,
    system: {
      attributes: {
        movement: {
          walk: 30,
          bonus: 0
        }
      }
    }
  });

  actor.statuses = new Set();
  uuidDocuments.set(actor.uuid, actor);
  return actor;
}

function combatFor(actor, round = 1) {
  const combatant = {
    id: `Combatant.${actor.id}`,
    actor
  };

  return {
    id: "Combat.rollout",
    round,
    turn: 0,
    combatant,
    combatants: [combatant]
  };
}

test("Rollout successful damage stores the next stage for the following round", async () => {
  const source = rolloutActor();
  game.combat = combatFor(source, 1);
  const item = dynamicItem("rollout", "Rd6 + 2", source);
  const target = createFlagDocument({ uuid: "Actor.rollout-target" });

  const { resolution } = resolveDynamic(item);
  assert.equal(resolution.stage, 1);

  await applyRolloutDamage({ source, item, target, resolution });

  assert.deepEqual(
    source.getFlag("poke5e-local", "dynamicDamageState").rollout,
    {
      combatId: "Combat.rollout",
      lastSuccessRound: 1,
      nextStage: 2,
      lastStage: 1,
      lastDamage: 5,
      updatedAt: source.getFlag("poke5e-local", "dynamicDamageState").rollout.updatedAt
    }
  );
});

test("Rollout clears its sequence when the target takes no effective damage", async () => {
  const source = rolloutActor({
    stage: {
      combatId: "Combat.rollout",
      lastSuccessRound: 1,
      nextStage: 2
    }
  });
  game.combat = combatFor(source, 2);
  const item = dynamicItem("rollout", "Rd6 + 2", source);
  const target = createFlagDocument({ uuid: "Actor.rollout-immune" });

  const { resolution } = resolveDynamic(item);
  assert.equal(resolution.stage, 2);

  await applyRolloutDamage({
    source,
    item,
    target,
    resolution,
    before: 20,
    after: 20
  });

  assert.equal(
    source.getFlag("poke5e-local", "dynamicDamageState"),
    undefined
  );
});

test("Rollout stage five loops back to stage one after successful damage", async () => {
  const source = rolloutActor({
    stage: {
      combatId: "Combat.rollout",
      lastSuccessRound: 4,
      nextStage: 5
    }
  });
  game.combat = combatFor(source, 5);
  const item = dynamicItem("rollout", "Rd6 + 2", source);
  const target = createFlagDocument({ uuid: "Actor.rollout-stage-five" });

  const { resolution } = resolveDynamic(item);
  assert.equal(resolution.stage, 5);
  assert.equal(resolution.scaledDice, "16d6");

  await applyRolloutDamage({ source, item, target, resolution });

  const state = source.getFlag(
    "poke5e-local",
    "dynamicDamageState"
  ).rollout;

  assert.equal(state.nextStage, 1);
  assert.equal(state.lastStage, 5);
});

test("Rollout stale state is cleared when a full round was skipped", async () => {
  const source = rolloutActor({
    stage: {
      combatId: "Combat.rollout",
      lastSuccessRound: 1,
      nextStage: 2
    }
  });
  const combat = combatFor(source, 3);
  game.combat = combat;

  await hooks.handler("combatTurnChange")(
    combat,
    { round: 2, turn: 0, combatantId: "old" },
    { round: 3, turn: 0, combatantId: combat.combatant.id }
  );

  assert.equal(
    source.getFlag("poke5e-local", "dynamicDamageState"),
    undefined
  );
});

test("Deleting combat clears Rollout state belonging to that combat", async () => {
  const source = rolloutActor({
    stage: {
      combatId: "Combat.rollout",
      lastSuccessRound: 2,
      nextStage: 3
    }
  });
  const combat = combatFor(source, 2);
  game.combat = combat;

  await hooks.handler("deleteCombat")(combat);

  assert.equal(
    source.getFlag("poke5e-local", "dynamicDamageState"),
    undefined
  );
});

function outrageEffect(actor) {
  const flags = {};

  return {
    uuid: "Actor.outrage.ActiveEffect.concentration",
    parent: actor,
    disabled: false,
    deleted: false,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
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

function outrageContext() {
  const actor = createFlagDocument({
    uuid: "Actor.outrage",
    name: "Outragemon",
    flags: {
      "poke5e-local": {
        activeAbilityId: "none"
      }
    },
    system: {
      attributes: {
        hp: {
          value: 20,
          max: 20
        }
      }
    }
  });
  actor.statuses = new Set();

  const item = dynamicItem(
    "outrage",
    "Rd6 + 2 + 2",
    actor,
    {
      stab: {
        eligible: true,
        bonus: 2
      }
    }
  );

  const effect = outrageEffect(actor);
  actor.effects = [effect];
  uuidDocuments.set(actor.uuid, actor);

  const combatant = {
    id: "Combatant.outrage",
    actor
  };

  const combat = {
    id: "Combat.outrage",
    round: 1,
    turn: 0,
    combatant,
    combatants: [combatant]
  };

  game.combat = combat;

  return { actor, item, effect, combat };
}

test("Outrage concentration start snapshots combat and source metadata", () => {
  const { actor, item, combat } = outrageContext();
  const effectData = {};

  hooks.handler("dnd5e.preBeginConcentrating")(
    actor,
    item,
    effectData
  );

  const state = effectData.flags["poke5e-local"].outrage;

  assert.equal(state.kind, "outrage");
  assert.equal(state.combatId, combat.id);
  assert.equal(state.startRound, 1);
  assert.equal(state.itemUuid, item.uuid);
  assert.deepEqual(state.stabTargets, []);
});

test("Outrage scales 1x, 2x, 4x across its three combat rounds", async () => {
  const { actor, item, effect, combat } = outrageContext();
  const effectData = {};
  hooks.handler("dnd5e.preBeginConcentrating")(actor, item, effectData);
  await effect.setFlag(
    "poke5e-local",
    "outrage",
    effectData.flags["poke5e-local"].outrage
  );

  const expected = ["1d6 + 2", "2d6 + 2", "4d6 + 2"];

  for (let round = 1; round <= 3; round += 1) {
    combat.round = round;
    const result = resolveDynamic(item);
    assert.equal(result.roll.formula, expected[round - 1]);
    assert.equal(result.resolution.stage, round);

    const target = createFlagDocument({
      uuid: `Actor.outrage-target-${round}`
    });

    const message = damageMessage(item, result.resolution);
    const options = { originatingMessage: message };
    hooks.handler("dnd5e.applyDamage", 1)(target, 5, options);
    await new Promise(resolve => setImmediate(resolve));
  }

  assert.equal(effect.deleted, true);
  assert.equal(
    effect.getFlag("poke5e-local", "outrage").endReason,
    "completed"
  );
});

test("Outrage STAB is applied only once to the same target during one activation", async () => {
  const { actor, item, effect, combat } = outrageContext();
  const effectData = {};
  hooks.handler("dnd5e.preBeginConcentrating")(actor, item, effectData);
  await effect.setFlag(
    "poke5e-local",
    "outrage",
    effectData.flags["poke5e-local"].outrage
  );

  const target = createFlagDocument({ uuid: "Actor.same-outrage-target" });

  const stageOne = resolveDynamic(item).resolution;
  const messageOne = damageMessage(item, stageOne);
  const optionsOne = { originatingMessage: messageOne };
  const damagesOne = [{ value: 10, type: "dragon" }];

  hooks.handler("dnd5e.preCalculateDamage")(
    target,
    damagesOne,
    optionsOne
  );
  assert.equal(damagesOne[0].value, 12);

  hooks.handler("dnd5e.applyDamage", 1)(target, 12, optionsOne);
  await new Promise(resolve => setImmediate(resolve));

  combat.round = 2;
  const stageTwo = resolveDynamic(item).resolution;
  const messageTwo = damageMessage(item, stageTwo);
  const optionsTwo = { originatingMessage: messageTwo };
  const damagesTwo = [{ value: 10, type: "dragon" }];

  hooks.handler("dnd5e.preCalculateDamage")(
    target,
    damagesTwo,
    optionsTwo
  );

  assert.equal(damagesTwo[0].value, 10);
});
