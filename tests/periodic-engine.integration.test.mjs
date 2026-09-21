import test from "node:test";
import assert from "node:assert/strict";

import {
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

class PeriodicRoll {
  static nextTotal = 8;

  constructor(formula) {
    this.formula = formula;
    this.total = null;
  }

  async evaluate() {
    this.total = PeriodicRoll.nextTotal;
    return this;
  }

  async toMessage() {
    return this;
  }
}

globalThis.Roll = PeriodicRoll;

globalThis.game = {
  user: {
    id: "gm",
    isGM: true,
    targets: new Set()
  },
  users: {
    activeGM: { id: "gm" }
  },
  settings: {
    get() {
      return "es";
    }
  },
  actors: []
};

globalThis.canvas = {
  tokens: {
    placeables: []
  }
};

globalThis.ui = {
  notifications: {
    info() {},
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
    return data;
  }
};

globalThis.document = {
  addEventListener() {},
  createElement() {
    throw new Error("DOM creation not expected in these periodic tests.");
  }
};

const uuidDocuments = new Map();
globalThis.fromUuidSync = uuid => uuidDocuments.get(uuid) ?? null;

const {
  processPokemonPeriodicEndTurn,
  registerPokemonPeriodicEngine
} = await import("../periodic-engine.mjs");

function periodicEffect({
  sourceActorUuid,
  target,
  damageImmunityTypes = ["grass"],
  removeWhenFainted = true,
  removeOnCombatEnd = true,
  drainFraction = 0.5
}) {
  const flags = {
    kind: "pokemon-periodic",
    sourceActorUuid,
    periodic: {
      kind: "leech-seed",
      timing: "end-turn",
      damage: {
        formula: "1d8",
        type: "grass"
      },
      drain: {
        fraction: drainFraction
      },
      damageImmunityTypes,
      removeWhenFainted,
      removeOnCombatEnd
    }
  };

  return {
    id: "Effect.leech-seed",
    name: "Leech Seed",
    disabled: false,
    parent: target,
    deleted: false,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      return flags[key];
    },
    async delete() {
      this.deleted = true;
      return this;
    }
  };
}

function pokemonActor({
  uuid,
  name,
  hp,
  max = 20,
  temp = 0,
  types = []
}) {
  const actor = createFlagDocument({
    uuid,
    name,
    flags: {
      "poke5e-local": {
        sourceId: name.toLowerCase(),
        types
      }
    },
    system: {
      attributes: {
        hp: {
          value: hp,
          max,
          temp
        }
      }
    }
  });

  actor.damageCalls = [];
  actor.deletedEffectIds = [];

  actor.applyDamage = async function applyDamage(value) {
    this.damageCalls.push(structuredClone(value));

    if (typeof value === "number") {
      if (value < 0) {
        this.system.attributes.hp.value = Math.min(
          this.system.attributes.hp.max,
          this.system.attributes.hp.value - value
        );
      }
      return this;
    }

    const amount = Math.max(
      0,
      Number(value?.[0]?.value ?? 0)
    );

    const hpState = this.system.attributes.hp;
    const absorbedByTemp = Math.min(hpState.temp ?? 0, amount);
    hpState.temp = Math.max(0, (hpState.temp ?? 0) - absorbedByTemp);

    const remaining = amount - absorbedByTemp;
    hpState.value = Math.max(0, hpState.value - remaining);
    return this;
  };

  actor.deleteEmbeddedDocuments = async function deleteEmbeddedDocuments(
    documentName,
    ids
  ) {
    assert.equal(documentName, "ActiveEffect");
    this.deletedEffectIds.push(...ids);
    return [];
  };

  uuidDocuments.set(uuid, actor);
  return actor;
}

test("Leech Seed deals typed Grass damage and heals half of actual effective damage", async () => {
  const source = pokemonActor({
    uuid: "Actor.seed-source",
    name: "Seeder",
    hp: 5,
    max: 20
  });
  const target = pokemonActor({
    uuid: "Actor.seed-target",
    name: "Target",
    hp: 10,
    max: 20,
    temp: 2,
    types: ["water"]
  });

  target.effects = [
    periodicEffect({
      sourceActorUuid: source.uuid,
      target
    })
  ];

  PeriodicRoll.nextTotal = 8;
  await processPokemonPeriodicEndTurn(target);

  assert.deepEqual(
    target.damageCalls[0],
    [{ value: 8, type: "grass" }]
  );
  assert.equal(target.system.attributes.hp.value, 4);
  assert.equal(target.system.attributes.hp.temp, 0);
  assert.equal(source.system.attributes.hp.value, 9);
  assert.deepEqual(source.damageCalls, [-4]);
});

test("Leech Seed does not damage or heal when target has a configured immunity type", async () => {
  const source = pokemonActor({
    uuid: "Actor.seed-immune-source",
    name: "SeederImmune",
    hp: 5,
    max: 20
  });
  const target = pokemonActor({
    uuid: "Actor.seed-grass",
    name: "GrassTarget",
    hp: 10,
    max: 20,
    types: ["grass"]
  });

  target.effects = [
    periodicEffect({
      sourceActorUuid: source.uuid,
      target
    })
  ];

  await processPokemonPeriodicEndTurn(target);

  assert.deepEqual(target.damageCalls, []);
  assert.deepEqual(source.damageCalls, []);
});

test("Leech Seed removes itself immediately from a fainted target when configured", async () => {
  const source = pokemonActor({
    uuid: "Actor.seed-faint-source",
    name: "SeederFaint",
    hp: 10
  });
  const target = pokemonActor({
    uuid: "Actor.seed-fainted",
    name: "FaintedTarget",
    hp: 0
  });

  const effect = periodicEffect({
    sourceActorUuid: source.uuid,
    target
  });
  target.effects = [effect];

  await processPokemonPeriodicEndTurn(target);

  assert.equal(effect.deleted, true);
  assert.deepEqual(target.damageCalls, []);
});

test("Periodic combat cleanup removes effects marked removeOnCombatEnd", async () => {
  const source = pokemonActor({
    uuid: "Actor.seed-clean-source",
    name: "SeederClean",
    hp: 10
  });
  const target = pokemonActor({
    uuid: "Actor.seed-clean-target",
    name: "CleanTarget",
    hp: 10
  });

  const effect = periodicEffect({
    sourceActorUuid: source.uuid,
    target,
    removeOnCombatEnd: true
  });
  target.effects = [effect];
  game.actors = [source, target];

  registerPokemonPeriodicEngine();
  await hooks.handler("deleteCombat")({ id: "Combat.done" });

  assert.deepEqual(target.deletedEffectIds, [effect.id]);
});
