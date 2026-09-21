import test from "node:test";
import assert from "node:assert/strict";

import {
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

import {
  STRUGGLE_ACTIVITY_IDS
} from "../struggle-rules.mjs";

installFoundryUtils();
const hooks = createHooks();

const messages = [];

globalThis.game = {
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
  getSpeaker() {
    return {};
  },
  async create(data) {
    messages.push(data);
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
  registerPokemonStruggleEngine,
  resolveConfusionStruggle
} = await import("../struggle-engine.mjs");

registerPokemonStruggleEngine();

class DamageRollMock {
  constructor(formula, data = {}, options = {}) {
    this.formula = formula;
    this.data = data;
    this.options = options;
  }
}

function struggleItem(actor, {
  damageFormula = "2 + 3",
  meleeActivity = null,
  rangedActivity = null
} = {}) {
  const activities = new Map();

  if (meleeActivity) {
    activities.set(
      STRUGGLE_ACTIVITY_IDS.melee,
      meleeActivity
    );
  }

  if (rangedActivity) {
    activities.set(
      STRUGGLE_ACTIVITY_IDS.ranged,
      rangedActivity
    );
  }

  return {
    name: "Struggle",
    uuid: `${actor.uuid}.Item.struggle`,
    documentName: "Item",
    actor,
    system: {
      activities
    },
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }

      if (key === "sourceId") {
        return "struggle";
      }

      if (key === "struggle") {
        return {
          kind: "struggle",
          damageFormula,
          noAmplification: true
        };
      }

      return undefined;
    }
  };
}

function pokemonActor(uuid, name = uuid) {
  const actor = createFlagDocument({
    uuid,
    name,
    flags: {
      "poke5e-local": {
        sourceId: name.toLowerCase()
      }
    },
    system: {
      attributes: {
        hp: {
          value: 20,
          max: 20
        },
        ac: {
          value: 12
        }
      }
    }
  });

  actor.damageApplications = [];
  actor.applyDamage = async function applyDamage(value) {
    this.damageApplications.push(value);
    return this;
  };

  return actor;
}

function activityStub({
  damage = 4,
  hit = true
} = {}) {
  const calls = {
    use: 0,
    attack: 0,
    damage: 0
  };

  return {
    calls,

    async use() {
      calls.use += 1;
      return true;
    },

    async rollAttack() {
      calls.attack += 1;
      return [
        {
          isCritical: false,
          isFumble: false,
          isSuccess: hit
        }
      ];
    },

    async rollDamage() {
      calls.damage += 1;
      return [
        {
          total: damage
        }
      ];
    }
  };
}

test("Struggle replaces the configured damage roll with the exact metadata formula", () => {
  const actor = pokemonActor("Actor.struggle-hook", "Hookmon");
  const item = struggleItem(actor, {
    damageFormula: "2 + 5"
  });

  const rolls = [
    new DamageRollMock("99d99", {}, {
      type: "fire",
      marker: "keep"
    }),
    new DamageRollMock("1d4")
  ];

  hooks.handler("dnd5e.postDamageRollConfiguration")(
    rolls,
    {
      subject: {
        item
      }
    }
  );

  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].formula, "2 + 5");
  assert.equal(rolls[0].options.type, undefined);
  assert.equal(rolls[0].options.marker, "keep");
});

test("Confusion self Struggle automatically damages the source without an attack roll", async () => {
  messages.length = 0;

  const actor = pokemonActor("Actor.self", "Selfmon");
  const melee = activityStub({ damage: 5 });
  const ranged = activityStub({ damage: 7 });
  const item = struggleItem(actor, {
    meleeActivity: melee,
    rangedActivity: ranged
  });

  actor.items = [item];

  await resolveConfusionStruggle(
    actor,
    "self"
  );

  assert.equal(melee.calls.use, 1);
  assert.equal(melee.calls.attack, 0);
  assert.equal(melee.calls.damage, 1);
  assert.deepEqual(actor.damageApplications, [5]);
  assert.equal(ranged.calls.use, 0);
});

test("Confusion nearest Struggle selects the closest valid Pokémon and chooses range by distance", async () => {
  messages.length = 0;

  const source = pokemonActor("Actor.source", "Source");
  const near = pokemonActor("Actor.near", "Near");
  const far = pokemonActor("Actor.far", "Far");

  const melee = activityStub({ damage: 3 });
  const ranged = activityStub({ damage: 6, hit: true });
  const item = struggleItem(source, {
    meleeActivity: melee,
    rangedActivity: ranged
  });

  source.items = [item];

  const tokens = new Map([
    ["Token.source", { center: { x: 0, y: 0 } }],
    ["Token.near", { center: { x: 20, y: 0 } }],
    ["Token.far", { center: { x: 40, y: 0 } }]
  ]);

  canvas.tokens.get = id => tokens.get(id) ?? null;
  canvas.grid.measurePath = points => ({
    distance: Math.abs(
      Number(points[1]?.x ?? 0) -
      Number(points[0]?.x ?? 0)
    )
  });

  game.combat = {
    combatants: [
      {
        id: "Combatant.source",
        tokenId: "Token.source",
        actor: source,
        isDefeated: false
      },
      {
        id: "Combatant.near",
        tokenId: "Token.near",
        actor: near,
        isDefeated: false
      },
      {
        id: "Combatant.far",
        tokenId: "Token.far",
        actor: far,
        isDefeated: false
      }
    ]
  };

  await resolveConfusionStruggle(
    source,
    "nearest"
  );

  assert.equal(melee.calls.use, 0);
  assert.equal(ranged.calls.use, 1);
  assert.equal(ranged.calls.attack, 1);
  assert.equal(ranged.calls.damage, 1);
  assert.deepEqual(near.damageApplications, [6]);
  assert.deepEqual(far.damageApplications, []);

  game.combat = null;
});

test("Confusion nearest Struggle falls back to self when no valid target exists", async () => {
  const source = pokemonActor("Actor.fallback", "Fallback");
  const melee = activityStub({ damage: 4 });
  const ranged = activityStub({ damage: 9 });
  const item = struggleItem(source, {
    meleeActivity: melee,
    rangedActivity: ranged
  });

  source.items = [item];

  canvas.tokens.get = () => ({ center: { x: 0, y: 0 } });
  game.combat = {
    combatants: [
      {
        id: "Combatant.fallback",
        tokenId: "Token.fallback",
        actor: source,
        isDefeated: false
      }
    ]
  };

  await resolveConfusionStruggle(
    source,
    "nearest"
  );

  assert.equal(melee.calls.damage, 1);
  assert.equal(ranged.calls.damage, 0);
  assert.deepEqual(source.damageApplications, [4]);

  game.combat = null;
});
