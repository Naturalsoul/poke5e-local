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
} = await import("../targeted-modifier-engine.mjs");

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
