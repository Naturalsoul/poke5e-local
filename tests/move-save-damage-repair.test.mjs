import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const { saveDamageUpdates } = await import("../scripts/move-description-repair-service.mjs");
const { resolveOnSaveMode } = await import("../scripts/builder.mjs");

const moves = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));
const list = Array.isArray(moves) ? moves : Object.values(moves.moves ?? moves);
const definitions = new Map(list.map(move => [move.id, move]));
const M = "poke5e-local";
const item = (id, sourceId, onSave) => ({ id, getFlag: (module, key) => (module === M ? { kind: "move", sourceId }[key] : undefined),
  system: { activities: [{ id: "save1", type: "save", damage: { onSave } }] } });

test("Poison Gas halves its damage on a successful save (table ruling); Smog as written", () => {
  assert.equal(resolveOnSaveMode(definitions.get("poison-gas")), "half");
  assert.equal(resolveOnSaveMode(definitions.get("smog")), "half");
});

test("existing Move items get the damage-on-save their definition calls for, and nothing else is touched", () => {
  const updates = saveDamageUpdates([item("a", "poison-gas", "none"), item("b", "smog", "half"), item("c", "not-in-catalog", "none")], definitions);
  assert.deepEqual(updates, [{ _id: "a", "system.activities.save1.damage.onSave": "half" }]);
});
