import assert from "node:assert/strict";
import test from "node:test";

const { learnableMoveIds, scoreMove, selectBestMoves } = await import("../scripts/encounter-move-selector.mjs");

const move = (id, type, dice, extra = {}) => ({ id, type, powerAbilities: ["str"], damage: dice ? { dice: { 1: dice }, type: [type] } : null, ...extra });
const moves = [
  move("tackle", "normal", "1d6"), move("ember", "fire", "1d8"), move("flame-burst", "fire", "2d8"),
  move("growl", "normal", null), move("thunder-punch", "electric", "2d6"), move("overheat", "fire", "4d10"),
  move("rest", "psychic", null, { damage: { dice: { 1: "4d6" }, type: "healing" } })
];
const pokemon = {
  id: "charmander", types: ["fire"], combat: { attributes: { str: 14, dex: 12 } },
  learnset: { level: [{ level: 1, moveIds: ["tackle", "ember", "growl", "rest"] }, { level: 6, moveIds: ["flame-burst"] }],
    eggMoveIds: ["thunder-punch"], tms: [{ id: 35, moveId: "overheat" }] }
};

test("learnable: level-up up to the level, egg Moves and TMs as allowed", () => {
  assert.deepEqual(learnableMoveIds(pokemon, 5, { tm: false }).sort(), ["ember", "growl", "rest", "tackle", "thunder-punch"]);
  assert.ok(learnableMoveIds(pokemon, 5).includes("overheat"));
});

test("scores: dice, STAB, and healing is not damage", () => {
  assert.ok(scoreMove(moves[1], pokemon, 5) > scoreMove(moves[0], pokemon, 5), "STAB ember over tackle");
  assert.equal(scoreMove(moves[6], pokemon, 5), 0, "rest heals");
});

test("best moveset: strongest STAB, coverage, other types, a status Move; TMs only when allowed", () => {
  const ids = (options = {}) => selectBestMoves({ pokemon, moves, level: 6, random: () => 0, ...options }).map(m => m.id);
  const levelAndEgg = ids({ sources: { tm: false } });
  assert.equal(levelAndEgg[0], "flame-burst");
  assert.ok(levelAndEgg.includes("thunder-punch"), levelAndEgg.join(", "));
  assert.equal(levelAndEgg.filter(id => ["growl", "rest"].includes(id)).length, 1, "one status Move (rest heals: a status one)");
  assert.ok(!levelAndEgg.includes("overheat"));
  assert.equal(ids()[0], "overheat", "with TMs");
  assert.equal(ids({ sources: { tm: false }, coverageTypes: ["electric"] })[1], "thunder-punch", "the covering Move second");
});
