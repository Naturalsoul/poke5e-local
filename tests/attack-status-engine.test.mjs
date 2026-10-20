import test from "node:test";
import assert from "node:assert/strict";
import {
  createHooks
} from "./helpers/foundry-mocks.mjs";

const hooks = createHooks();

const actors = new Map();
globalThis.fromUuidSync = uuid => actors.get(uuid) ?? null;

const {
  registerAttackOutcomeEngine
} = await import("../scripts/attack-outcome-engine.mjs");
const {
  registerPokemonAttackStatusEngine
} = await import("../scripts/attack-status-engine.mjs");

registerAttackOutcomeEngine();
registerPokemonAttackStatusEngine();

function flushAsyncSubscribers() {
  return new Promise(resolve => {
    setImmediate(resolve);
  });
}

function targetActor(uuid = "Actor.target") {
  return {
    uuid,
    documentName: "Actor",
    createdEffects: [],
    async createEmbeddedDocuments(type, sources) {
      assert.equal(type, "ActiveEffect");
      this.createdEffects.push(...sources);
      return sources;
    }
  };
}

function statusTemplate(trigger, status = "burned") {
  const flags = {
    kind: "pokemon-status",
    trigger,
    status
  };

  return {
    disabled: false,
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }

      return flags[key];
    },
    toObject() {
      return {
        _id: "TemplateStatus",
        name: status,
        flags: {
          "poke5e-local": {
            ...flags
          }
        }
      };
    }
  };
}

function moveItem(sourceId, trigger) {
  const template = statusTemplate(trigger);

  return {
    name: sourceId,
    uuid: `Item.${sourceId}`,
    documentName: "Item",
    effects: [template],
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }

      if (key === "kind") {
        return "move";
      }

      if (key === "sourceId") {
        return sourceId;
      }

      return undefined;
    }
  };
}

function activity(item) {
  return {
    id: "attack",
    actor: {
      uuid: "Actor.source"
    },
    item,
    attack: {
      type: {
        value: "ranged"
      }
    }
  };
}

function attackRoll({
  natural,
  total,
  targetAc,
  targetUuid
}) {
  return {
    d20: {
      results: [
        {
          result: natural,
          active: true,
          discarded: false
        }
      ]
    },
    total,
    isCritical: false,
    isFumble: false,
    hasAdvantage: false,
    hasDisadvantage: false,
    options: {
      target: targetAc,
      poke5eTargetActorUuid: targetUuid
    }
  };
}

async function dispatchAttack(item, roll) {
  hooks.handler("dnd5e.rollAttack")(
    [roll],
    {
      subject: activity(item)
    }
  );

  await flushAsyncSubscribers();
}

test("Scald applies its natural-16+ status trigger even when the attack misses", async () => {
  const target = targetActor("Actor.scald-target");
  actors.set(target.uuid, target);

  await dispatchAttack(
    moveItem("scald", "natural-attack-16+"),
    attackRoll({
      natural: 16,
      total: 18,
      targetAc: 30,
      targetUuid: target.uuid
    })
  );

  assert.equal(target.createdEffects.length, 1);
  assert.equal(target.createdEffects[0]._id, undefined);
  assert.equal(
    target.createdEffects[0].flags["poke5e-local"].status,
    "burned"
  );
});

test("Scald does not trigger below natural 16", async () => {
  const target = targetActor("Actor.scald-low");
  actors.set(target.uuid, target);

  await dispatchAttack(
    moveItem("scald", "natural-attack-16+"),
    attackRoll({
      natural: 15,
      total: 40,
      targetAc: 10,
      targetUuid: target.uuid
    })
  );

  assert.equal(target.createdEffects.length, 0);
});

test("Will-O-Wisp hit trigger applies only after a resolved hit", async () => {
  const hitTarget = targetActor("Actor.wow-hit");
  const missTarget = targetActor("Actor.wow-miss");
  actors.set(hitTarget.uuid, hitTarget);
  actors.set(missTarget.uuid, missTarget);

  const item = moveItem("will-o-wisp", "hit");

  await dispatchAttack(
    item,
    attackRoll({
      natural: 10,
      total: 18,
      targetAc: 12,
      targetUuid: hitTarget.uuid
    })
  );

  await dispatchAttack(
    item,
    attackRoll({
      natural: 10,
      total: 8,
      targetAc: 12,
      targetUuid: missTarget.uuid
    })
  );

  assert.equal(hitTarget.createdEffects.length, 1);
  assert.equal(missTarget.createdEffects.length, 0);
});
