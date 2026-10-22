import test from "node:test";
import assert from "node:assert/strict";
import {
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();

function token(actor, disposition) {
  return {
    actor,
    document: {
      disposition
    }
  };
}

const sourceActor = {
  uuid: "Actor.source",
  id: "source",
  name: "Source"
};

const attacker = {
  uuid: "Actor.ally",
  id: "ally",
  name: "Ally"
};

function targetedEffect({
  stacks = 2,
  sourceActorUuid = sourceActor.uuid,
  sourceDisposition = 1,
  alliesOnly = true,
  excludeSource = true,
  bonusPerStack = 1
} = {}) {
  const flags = {
    kind: "pokemon-modifier",
    stackCount: stacks,
    sourceActorUuid,
    sourceDisposition,
    targetedAttack: {
      alliesOnly,
      excludeSource,
      bonusPerStack
    }
  };

  return {
    name: "Tail Whip",
    disabled: false,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }

      return flags[key];
    }
  };
}

const target = {
  uuid: "Actor.target",
  id: "target",
  name: "Target",
  effects: [targetedEffect()]
};

const allyToken = token(attacker, 1);
const sourceToken = token(sourceActor, 1);
const targetToken = token(target, -1);

const targets = new Set([targetToken]);

globalThis.game = {
  user: {
    targets
  }
};

globalThis.canvas = {
  tokens: {
    controlled: [],
    placeables: [
      allyToken,
      sourceToken,
      targetToken
    ]
  }
};

const {
  registerPokemonTargetedModifierEngine
} = await import("../scripts/targeted-modifier-engine.mjs");

registerPokemonTargetedModifierEngine();

function runPreRollAttack(actor = attacker) {
  const rollConfig = {
    parts: ["@mod"],
    data: {},
    options: {}
  };

  const config = {
    subject: {
      actor
    },
    rolls: [rollConfig]
  };

  const message = {
    data: {}
  };

  hooks.handler("dnd5e.preRollAttack")(
    config,
    {},
    message
  );

  return {
    rollConfig,
    message
  };
}

test("targeted modifier adds stack-scaled bonus for an allied attacker", () => {
  const result = runPreRollAttack();

  assert.equal(
    result.rollConfig.data.poke5eTargeted,
    2
  );

  assert.deepEqual(
    result.rollConfig.parts,
    ["@mod", "@poke5eTargeted"]
  );

  assert.equal(
    result.rollConfig.options["poke5e-local"].targetedAttackBonus,
    2
  );

  assert.equal(
    result.message.data.flags["poke5e-local"].targetedAttack.bonus,
    2
  );
});

test("targeted modifier does not benefit the original source when excluded", () => {
  const result = runPreRollAttack(sourceActor);

  assert.equal(
    result.rollConfig.data.poke5eTargeted,
    undefined
  );

  assert.deepEqual(
    result.rollConfig.parts,
    ["@mod"]
  );
});

test("targeted modifier does not benefit an attacker on a different side", () => {
  allyToken.document.disposition = -1;

  const result = runPreRollAttack();

  assert.equal(
    result.rollConfig.data.poke5eTargeted,
    undefined
  );

  allyToken.document.disposition = 1;
});

test("targeted modifier requires exactly one current target", () => {
  targets.clear();

  const result = runPreRollAttack();

  assert.equal(
    result.rollConfig.data.poke5eTargeted,
    undefined
  );

  targets.add(targetToken);
});

function rollModeEffect(rule, sourceActorUuid = sourceActor.uuid) {
  const flags = { kind: "pokemon-modifier", sourceActorUuid, rollModes: { ...rule } };
  const effect = {
    uuid: `ActiveEffect.${Math.random()}`,
    disabled: false,
    getFlag: (moduleId, key) => moduleId === "poke5e-local" ? flags[key] : undefined,
    async setFlag(_moduleId, key, value) { flags.rollModes.nextAttack = key === "rollModes.nextAttack" ? value : flags.rollModes.nextAttack; },
    async delete() { effect.deleted = true; }
  };
  return effect;
}

function rollModes(actor) {
  const rollConfig = { parts: [], data: {}, options: {} };
  hooks.handler("dnd5e.preRollAttack", 1)({ subject: { actor }, rolls: [rollConfig] }, {}, { data: {} });
  return rollConfig.options;
}

test("roll modes give advantage, disadvantage, or both cancelling, and respect vsSource", () => {
  const user = { uuid: "Actor.user", effects: [rollModeEffect({ own: 1 })] };
  target.effects = [];
  assert.equal(rollModes(user).advantage, true);
  user.effects = [rollModeEffect({ own: 1 }), rollModeEffect({ own: -1 })];
  assert.deepEqual([rollModes(user).advantage, rollModes(user).disadvantage], [true, true]);
  // Snarl: only against its source, Crush Claw: only from its source.
  user.effects = [rollModeEffect({ own: -1, vsSource: true }, "Actor.elsewhere")];
  assert.equal(rollModes(user).disadvantage, undefined);
  user.effects = [];
  target.effects = [rollModeEffect({ against: 1, vsSource: true }, "Actor.user")];
  assert.equal(rollModes(user).advantage, true);
  assert.equal(rollModes(attacker).advantage, undefined);
  target.effects = [targetedEffect()];
});

test("next-attack roll modes are spent by the GM when the attack message is created", async () => {
  const { consumeAttackRollModes } = await import("../scripts/targeted-modifier-engine.mjs");
  const twice = rollModeEffect({ against: 1, nextAttack: 2 });
  const lasting = rollModeEffect({ against: 1 });
  const snarl = rollModeEffect({ own: -1, vsSource: true, nextAttack: 1 }, "Actor.elsewhere");
  const user = { uuid: "Actor.user", effects: [snarl] };
  target.effects = [twice, lasting];
  const options = rollModes(user);
  assert.deepEqual(options["poke5e-local"].consumedRollModes, [snarl.uuid, twice.uuid]);
  const effects = new Map([twice, lasting, snarl].map(effect => [effect.uuid, effect]));
  globalThis.fromUuidSync = uuid => effects.get(uuid);
  game.user.isGM = true;
  await consumeAttackRollModes({ rolls: [{ options }, { options }] });
  assert.equal(snarl.deleted, true);
  assert.equal(twice.deleted, undefined);
  assert.equal(twice.getFlag("poke5e-local", "rollModes").nextAttack, 1);
  game.user.isGM = false;
  await consumeAttackRollModes({ rolls: [{ options }] });
  assert.equal(twice.deleted, undefined, "only the GM spends them");
  target.effects = [targetedEffect()];
});

test("Charm: the charmed attacker takes -2 only on attacks against whoever charmed it", () => {
  const charm = sourceActorUuid => ({ name: "Charm", disabled: false,
    getFlag: (moduleId, key) => (moduleId === "poke5e-local" ? { kind: "pokemon-modifier", attackVsSource: -2, sourceActorUuid }[key] : undefined) });
  const saved = target.effects;
  target.effects = [];
  attacker.effects = [charm(target.uuid)];
  assert.equal(runPreRollAttack().rollConfig.data.poke5eTargeted, -2);
  attacker.effects = [charm("Actor.someone-else")];
  assert.equal(runPreRollAttack().rollConfig.data.poke5eTargeted, undefined);
  delete attacker.effects;
  target.effects = saved;
});
