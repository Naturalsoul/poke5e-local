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
const chatMessages = [];
const actorsByUuid = new Map();

globalThis.CONFIG = {
  DND5E: {
    healingTypes: {
      healing: {
        label: "Healing"
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

globalThis.ChatMessage = {
  getSpeaker() {
    return {};
  },
  async create(data) {
    chatMessages.push(data);
    return data;
  }
};

globalThis.ui = {
  notifications: {
    warn() {},
    error() {},
    info() {}
  }
};

globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;

class DamageRollMock {
  constructor(formula, data = {}, options = {}, deterministic = null) {
    this.formula = String(formula);
    this.data = data;
    this.options = options;
    this.isDeterministic = deterministic ?? !/\d+d\d+/i.test(this.formula);
  }

  alter(multiplier) {
    const formula = this.formula.replace(
      /(\d+)d(\d+)/gi,
      (_match, count, sides) => `${Number(count) * multiplier}d${sides}`
    );
    return new this.constructor(
      formula,
      this.data,
      structuredClone(this.options),
      this.isDeterministic
    );
  }
}

function pokemonActor({
  uuid,
  name = uuid,
  hpValue = 10,
  hpMax = 10,
  abilityId = null,
  effects = []
}) {
  const items = abilityId
    ? [createAbilityItem(abilityId)]
    : [];
  const actor = createFlagDocument({
    uuid,
    name,
    items,
    effects,
    flags: {
      "poke5e-local": {
        sourceId: uuid.toLowerCase()
      }
    },
    system: {
      attributes: {
        hp: {
          value: hpValue,
          max: hpMax,
          temp: 0
        }
      }
    }
  });
  actorsByUuid.set(uuid, actor);
  return actor;
}

function burnedEffect() {
  return {
    disabled: false,
    flags: {
      "poke5e-local": {
        status: "burned"
      }
    },
    getFlag(moduleId, key) {
      return this.flags[moduleId]?.[key];
    }
  };
}

function moveItem({
  sourceActor,
  sourceId = "test-move",
  stab = null,
  instantDrain = null,
  instantRecoil = null,
  struggle = null
}) {
  const flags = {
    kind: "move",
    sourceId,
    stab,
    instantDrain,
    instantRecoil,
    struggle
  };
  return {
    uuid: `Item.${sourceId}`,
    name: sourceId,
    actor: sourceActor,
    documentName: "Item",
    effects: [],
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      return flags[key];
    }
  };
}

function damageConfig(actor, item) {
  return {
    hookNames: new Set(["damage"]),
    subject: {
      actor,
      item
    }
  };
}

function originatingMessage(item, activityType = "attack") {
  const activity = {
    type: activityType
  };
  return {
    getAssociatedItem() {
      return item;
    },
    getAssociatedActivity() {
      return activity;
    },
    getOriginatingMessage() {
      return this;
    }
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error("Asynchronous damage pipeline did not finish in time.");
}

const moveModifiers = await import("../move-modifier-runtime.mjs");
const damageEngine = await import("../damage-engine.mjs");
damageEngine.registerPokemonDamageEngine();

test("Burned replaces a random damage roll with two rolls keeping the lower result", () => {
  const actor = pokemonActor({
    uuid: "Actor.burned",
    effects: [burnedEffect()]
  });
  const item = moveItem({ sourceActor: actor, sourceId: "burned-move" });
  const rolls = [new DamageRollMock("2d6 + 3")];

  hooks.handler("dnd5e.postRollConfiguration")(
    rolls,
    damageConfig(actor, item)
  );

  assert.equal(rolls[0].formula, "{2d6 + 3, 2d6 + 3}kl");
  assert.equal(
    rolls[0].options["poke5e-local"].burnedKeepLower,
    true
  );
  assert.equal(
    rolls[0].options["poke5e-local"].originalFormula,
    "2d6 + 3"
  );
});

test("Burned leaves deterministic and healing rolls unchanged", () => {
  const actor = pokemonActor({
    uuid: "Actor.burned-exclusions",
    effects: [burnedEffect()]
  });
  const item = moveItem({ sourceActor: actor, sourceId: "burned-exclusions" });
  const deterministic = new DamageRollMock("4", {}, {}, true);
  const healing = new DamageRollMock(
    "1d8 + 2",
    {},
    { type: "healing" },
    false
  );
  const rolls = [deterministic, healing];

  hooks.handler("dnd5e.postRollConfiguration")(
    rolls,
    damageConfig(actor, item)
  );

  assert.equal(rolls[0].formula, "4");
  assert.equal(rolls[1].formula, "1d8 + 2");
});

test("threshold STAB ability adds only the extra STAB bonus", () => {
  const actor = pokemonActor({
    uuid: "Actor.blaze",
    hpValue: 5,
    hpMax: 20,
    abilityId: "blaze"
  });
  const item = moveItem({
    sourceActor: actor,
    sourceId: "ember",
    stab: {
      eligible: true,
      bonus: 2
    }
  });
  const rolls = [new DamageRollMock("2d6 + 1 + 2")];

  hooks.handler("dnd5e.postRollConfiguration")(
    rolls,
    damageConfig(actor, item)
  );

  assert.equal(rolls[0].formula, "2d6 + 1 + 2 + 2");
  assert.equal(
    rolls[0].options["poke5e-local"].stabAbilityBoost.totalBonus,
    4
  );
});

test("active Anger Point modifier doubles damage dice once and is consumed", async () => {
  const actor = pokemonActor({ uuid: "Actor.anger-point" });
  const item = moveItem({ sourceActor: actor, sourceId: "anger-move" });

  await moveModifiers.armFollowingTurnMoveModifier(
    actor,
    {
      sourceAbility: "anger-point",
      timing: "following-turn",
      usesRemaining: 1,
      damageDiceMultiplier: 2
    }
  );
  await moveModifiers.activateFollowingTurnMoveModifiers(actor);

  const rolls = [new DamageRollMock("2d6 + 3")];
  hooks.handler("dnd5e.postRollConfiguration")(
    rolls,
    damageConfig(actor, item)
  );

  assert.equal(rolls[0].formula, "4d6 + 3");
  assert.equal(
    rolls[0].options["poke5e-local"].moveModifier.damageDiceMultiplier,
    2
  );

  await waitFor(() => moveModifiers.activeDamageDiceModifier(actor) === null);
  assert.equal(moveModifiers.activeDamageDiceModifier(actor), null);
});

test("Berserk doubles positive attack damage before defensive type processing", () => {
  const source = pokemonActor({
    uuid: "Actor.berserk-damage",
    hpValue: 2,
    hpMax: 10,
    abilityId: "berserk"
  });
  const target = pokemonActor({ uuid: "Actor.berserk-target" });
  const item = moveItem({ sourceActor: source, sourceId: "berserk-attack" });
  const damages = [
    { value: 4, type: "normal" },
    { value: 3, type: "fire" },
    { value: 0, type: "water" }
  ];
  const options = {
    originatingMessage: originatingMessage(item, "attack")
  };

  hooks.handler("dnd5e.preCalculateDamage")(target, damages, options);

  assert.deepEqual(
    damages.map(entry => entry.value),
    [8, 6, 0]
  );
  assert.equal(options["poke5e-local"].berserkDamage.multiplier, 2);
});

test("Berserk does not amplify Save damage or Struggle", () => {
  const source = pokemonActor({
    uuid: "Actor.berserk-exclusions",
    hpValue: 1,
    hpMax: 10,
    abilityId: "berserk"
  });
  const target = pokemonActor({ uuid: "Actor.berserk-exclusion-target" });
  const saveItem = moveItem({ sourceActor: source, sourceId: "berserk-save-damage" });
  const saveDamages = [{ value: 7, type: "fire" }];

  hooks.handler("dnd5e.preCalculateDamage")(
    target,
    saveDamages,
    {
      originatingMessage: originatingMessage(saveItem, "save")
    }
  );
  assert.equal(saveDamages[0].value, 7);

  const struggleItem = moveItem({
    sourceActor: source,
    sourceId: "struggle",
    struggle: {
      noAmplification: true
    }
  });
  const struggleDamages = [{ value: 4, type: "typeless" }];

  hooks.handler("dnd5e.preCalculateDamage")(
    target,
    struggleDamages,
    {
      originatingMessage: originatingMessage(struggleItem, "attack")
    }
  );
  assert.equal(struggleDamages[0].value, 4);
});

test("Drain and Recoil use actual applied damage and resolve in recoil-then-drain order", async () => {
  const source = pokemonActor({
    uuid: "Actor.drain-recoil-source",
    hpValue: 10,
    hpMax: 20
  });
  source.damageCalls = [];
  source.applyDamage = async amount => {
    source.damageCalls.push(amount);
    const hp = source.system.attributes.hp;
    hp.value = Math.max(0, Math.min(hp.max, hp.value - Number(amount)));
    return source;
  };

  const target = pokemonActor({
    uuid: "Actor.drain-recoil-target",
    hpValue: 10,
    hpMax: 10
  });
  target.system.attributes.hp.temp = 2;

  const item = moveItem({
    sourceActor: source,
    sourceId: "drain-recoil",
    instantDrain: {
      kind: "instant-drain",
      fraction: 0.5,
      round: "floor"
    },
    instantRecoil: {
      kind: "instant-recoil",
      fraction: 0.5,
      round: "floor",
      damageType: "typeless"
    }
  });
  const options = {
    originatingMessage: originatingMessage(item, "attack")
  };
  const updates = {
    "system.attributes.hp.value": 4,
    "system.attributes.hp.temp": 0
  };

  hooks.handler("dnd5e.preApplyDamage")(target, 8, updates, options);

  assert.equal(options["poke5e-local"].instantDrain.actualDamage, 8);
  assert.equal(options["poke5e-local"].instantRecoil.actualDamage, 8);

  hooks.handler("dnd5e.applyDamage")(target, 8, options);
  await waitFor(() => source.damageCalls.length === 2);

  assert.deepEqual(source.damageCalls, [4, -4]);
  assert.equal(source.system.attributes.hp.value, 10);
});
