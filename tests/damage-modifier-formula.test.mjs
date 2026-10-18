import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils, MockRoll } from "./helpers/foundry-mocks.mjs";
import { buildMoveItem } from "../scripts/builder.mjs";

installFoundryUtils();
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
globalThis.Roll = MockRoll;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };

const { moves } = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));
const pokemon = { id: "test", name: { en: "Test" }, types: ["normal"],
  combat: { attributes: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } };

function formulas(id, level = 7) {
  const item = buildMoveItem(moves.find(move => move.id === id), pokemon, level, "en");
  return Object.values(item.system.activities).flatMap(activity =>
    (activity.damage?.parts ?? []).map(part => part.custom?.formula).filter(Boolean));
}

test("LEVEL damage modifier resolves to the Pokémon level", () => {
  assert.equal(formulas("night-shade")[0], "2d4 + 7");
  assert.equal(formulas("seismic-toss", 12)[0], "1d12 + 12");
});

test("MOVE + STAB adds STAB exactly once", () => {
  assert.equal(formulas("revelation-dance")[0], "2d10 + 0 + 3");
  assert.equal(formulas("tackle")[0], "1d10 + 3 + 3");
});

test("no move leaves a word in its damage formula", () => {
  for (const move of moves) {
    for (const formula of formulas(move.id)) {
      assert.doesNotMatch(formula, /[a-ce-z]/i, `${move.id}: ${formula}`);
    }
  }
});
