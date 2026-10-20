import test from "node:test";
import assert from "node:assert/strict";

import {
  createAbilityItem,
  createFlagDocument,
  createHooks,
  renderMockRollMessage,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

class TurnRoll {
  static nextTotal = 4;

  constructor(formula) {
    this.formula = formula;
    this.total = null;
  }

  async evaluate() {
    this.total = TurnRoll.nextTotal;
    return this;
  }

  async toMessage(data) {
    return renderMockRollMessage(data);
  }
}

globalThis.Roll = TurnRoll;
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
  actors: []
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

globalThis.canvas = {
  tokens: {
    placeables: []
  }
};

globalThis.fromUuidSync = () => null;

const {
  registerPokemonTurnEngine
} = await import("../scripts/turn-engine.mjs");

registerPokemonTurnEngine();

function statusEffect(actor, status, {
  disabled = false,
  volatile = false,
  expireAtEndOfNextTurn = false,
  nextTurnStarted = false
} = {}) {
  const flags = {
    status,
    nonVolatile: !volatile,
    volatile,
    expireAtEndOfNextTurn,
    nextTurnStarted
  };

  return {
    id: `Effect.${status}`,
    name: status,
    parent: actor,
    disabled,
    statuses: new Set([
      status === "paralysis"
        ? "poke5e-paralysis"
        : status === "burned"
          ? "poke5e-burned"
          : status === "flinched"
            ? "poke5e-flinched"
            : status
    ]),
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      return flags[key];
    },
    async update(data) {
      for (const [key, value] of Object.entries(data)) {
        const prefix = "flags.poke5e-local.";
        if (key.startsWith(prefix)) {
          flags[key.slice(prefix.length)] = value;
        }
      }
      return this;
    },
    async setFlag(_moduleId, key, value) {
      flags[key] = value;
      return this;
    },
    async delete() {
      this.deleted = true;
      return this;
    },
    _flags: flags
  };
}

function pokemonActor({
  id,
  level = 1,
  hp = 20,
  types = [],
  abilities = []
}) {
  const actor = createFlagDocument({
    uuid: `Actor.${id}`,
    name: id,
    flags: {
      "poke5e-local": {
        kind: "pokemon",
        sourceId: id,
        level,
        types,
        activeAbilityId: abilities.length === 1
          ? abilities[0]
          : null
      }
    },
    items: abilities.map(createAbilityItem),
    system: {
      attributes: {
        hp: {
          value: hp,
          max: 20,
          temp: 0
        }
      }
    }
  });

  actor.statuses = new Set();
  actor.createdEffects = [];
  actor.deletedEffectIds = [];
  actor.damageCalls = [];

  actor.applyDamage = async function applyDamage(value) {
    this.damageCalls.push(value);
    return this;
  };

  actor.createEmbeddedDocuments = async function createEmbeddedDocuments(
    documentName,
    sources
  ) {
    assert.equal(documentName, "ActiveEffect");
    this.createdEffects.push(...structuredClone(sources));
    return sources;
  };

  actor.updateEmbeddedDocuments = async function updateEmbeddedDocuments(
    documentName,
    updates
  ) {
    assert.equal(documentName, "ActiveEffect");
    for (const update of updates) {
      const effect = this.effects.find(entry => entry.id === update._id);
      if (!effect) continue;
      await effect.update(update);
    }
    return updates;
  };

  actor.deleteEmbeddedDocuments = async function deleteEmbeddedDocuments(
    documentName,
    ids
  ) {
    assert.equal(documentName, "ActiveEffect");
    this.deletedEffectIds.push(...ids);
    return [];
  };

  return actor;
}

function preCreateResult(actor, status) {
  const effect = statusEffect(actor, status);
  return hooks.handler("preCreateActiveEffect")(effect);
}

test("Turn Engine blocks type-based status immunity before ActiveEffect creation", () => {
  const electric = pokemonActor({
    id: "electric",
    types: ["electric"]
  });

  assert.equal(
    preCreateResult(electric, "paralysis"),
    false
  );
});

test("Turn Engine blocks Flinched when Inner Focus is the active Ability", () => {
  const actor = pokemonActor({
    id: "inner-focus",
    abilities: ["inner-focus"]
  });

  assert.equal(
    preCreateResult(actor, "flinched"),
    false
  );
});

test("Turn Engine prevents a second simultaneous non-volatile status", () => {
  const actor = pokemonActor({ id: "status-exclusive" });
  actor.effects = [statusEffect(actor, "burned")];

  assert.equal(
    preCreateResult(actor, "poisoned"),
    false
  );
});

test("deleting a non-volatile status creates Grace Period and blocks immediate reapplication", async () => {
  const actor = pokemonActor({ id: "grace" });
  const burned = statusEffect(actor, "burned");
  actor.effects = [burned];

  await hooks.handler("deleteActiveEffect")(burned);

  assert.equal(
    actor.getFlag("poke5e-local", "statusGrace").burned.turnStarted,
    false
  );

  actor.effects = [];
  assert.equal(
    preCreateResult(actor, "burned"),
    false
  );
});

test("Turn Engine marks Grace Period on the next turn and clears it at that turn end", async () => {
  const waiting = pokemonActor({ id: "waiting" });
  const actor = pokemonActor({ id: "grace-cycle" });
  const burned = statusEffect(actor, "burned");
  actor.effects = [burned];
  await hooks.handler("deleteActiveEffect")(burned);
  actor.effects = [];

  const combatants = new Map([
    ["waiting", { id: "waiting", actor: waiting }],
    ["actor", { id: "actor", actor }]
  ]);

  const combat = {
    combatants
  };

  await hooks.handler("combatTurnChange")(
    combat,
    { round: 1, turn: 0, combatantId: "waiting" },
    { round: 1, turn: 1, combatantId: "actor" }
  );

  assert.equal(
    actor.getFlag("poke5e-local", "statusGrace").burned.turnStarted,
    true
  );

  await hooks.handler("combatTurnChange")(
    combat,
    { round: 1, turn: 1, combatantId: "actor" },
    { round: 2, turn: 0, combatantId: "waiting" }
  );

  assert.equal(
    actor.getFlag("poke5e-local", "statusGrace"),
    undefined
  );
});

test("Burned end-turn damage uses the Pokemon proficiency progression and skips fainted actors", async () => {
  const burnedActor = pokemonActor({
    id: "burned-end-turn",
    level: 5,
    hp: 10
  });
  burnedActor.effects = [statusEffect(burnedActor, "burned")];

  const nextActor = pokemonActor({ id: "next" });
  const combat = {
    combatants: new Map([
      ["burned", { id: "burned", actor: burnedActor }],
      ["next", { id: "next", actor: nextActor }]
    ])
  };

  await hooks.handler("combatTurnChange")(
    combat,
    { round: 1, turn: 0, combatantId: "burned" },
    { round: 1, turn: 1, combatantId: "next" }
  );

  assert.deepEqual(burnedActor.damageCalls, [3]);

  burnedActor.damageCalls.length = 0;
  burnedActor.system.attributes.hp.value = 0;

  await hooks.handler("combatTurnChange")(
    combat,
    { round: 2, turn: 0, combatantId: "burned" },
    { round: 2, turn: 1, combatantId: "next" }
  );

  assert.deepEqual(burnedActor.damageCalls, []);
});

async function endTurn(actor, round) {
  const next = pokemonActor({ id: `next-${round}` });
  await hooks.handler("combatTurnChange")(
    { combatants: new Map([["actor", { id: "actor", actor }], ["next", { id: "next", actor: next }]]) },
    { round, turn: 0, combatantId: "actor" },
    { round, turn: 1, combatantId: "next" }
  );
}

test("Asleep ends after three of its turns even if every wake-up roll fails", async () => {
  TurnRoll.nextTotal = 4;
  const actor = pokemonActor({ id: "sleeper" });
  const asleep = statusEffect(actor, "asleep");
  actor.effects = [asleep];
  await endTurn(actor, 1);
  await endTurn(actor, 2);
  assert.equal(asleep.deleted, undefined, "still asleep after two turns");
  await endTurn(actor, 3);
  assert.equal(asleep.deleted, true);
});

test("Frozen's save DC uses the current proficiency of whoever froze it", async () => {
  const freezer = pokemonActor({ id: "freezer", level: 9 });
  const actor = pokemonActor({ id: "frozen" });
  const frozen = statusEffect(actor, "frozen");
  frozen.origin = freezer.uuid;
  frozen._flags.recovery = { ability: "str", dc: 12 };
  actor.effects = [frozen];
  const targets = [];
  actor.rollSavingThrow = async ({ target }) => {
    targets.push(target);
    return [{ total: 1 }];
  };
  globalThis.fromUuidSync = uuid => (uuid === freezer.uuid ? freezer : null);
  await endTurn(actor, 1);
  globalThis.fromUuidSync = () => null;
  assert.deepEqual(targets, [14], "10 + proficiency 4 at level 9, not the stored 12");
});
