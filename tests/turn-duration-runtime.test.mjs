import test from "node:test";
import assert from "node:assert/strict";
import {
  endOfNextTurnFlags,
  expireEndOfNextTurnEffects,
  markEndOfNextTurnEffectsStarted,
  refreshEndOfNextTurnDuration
} from "../scripts/turn-duration-runtime.mjs";

function effect(id, started = false) {
  const flags = {
    "poke5e-local": {
      expireAtEndOfNextTurn: true,
      nextTurnStarted: started
    }
  };

  return {
    id,
    getFlag(moduleId, key) {
      return flags[moduleId]?.[key];
    },
    async update(changes) {
      for (const [path, value] of Object.entries(changes)) {
        if (path === "flags.poke5e-local.nextTurnStarted") {
          flags["poke5e-local"].nextTurnStarted = value;
        }
      }
    }
  };
}

test("end-of-next-turn flags start unarmed", () => {
  assert.deepEqual(endOfNextTurnFlags(), {
    expireAtEndOfNextTurn: true,
    nextTurnStarted: false
  });
});

test("effect is marked at next turn and expires at its end", async () => {
  const targetEffect = effect("Effect.one");
  const actor = {
    effects: [targetEffect],
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates) {
        if (update._id === targetEffect.id) {
          await targetEffect.update({
            "flags.poke5e-local.nextTurnStarted":
              update["flags.poke5e-local.nextTurnStarted"]
          });
        }
      }
    },
    async deleteEmbeddedDocuments(_type, ids) {
      this.deleted = ids;
    }
  };

  await markEndOfNextTurnEffectsStarted(actor);
  assert.equal(
    targetEffect.getFlag("poke5e-local", "nextTurnStarted"),
    true
  );

  await expireEndOfNextTurnEffects(actor);
  assert.deepEqual(actor.deleted, ["Effect.one"]);
});

test("refresh returns an existing effect to waiting state", async () => {
  const targetEffect = effect("Effect.refresh", true);
  await refreshEndOfNextTurnDuration(targetEffect);
  assert.equal(
    targetEffect.getFlag("poke5e-local", "nextTurnStarted"),
    false
  );
});
