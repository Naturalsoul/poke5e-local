import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
let saved;
globalThis.game = { actors: [], user: { isGM: true }, settings: { get: () => saved } };
const { currentPokemonSheetDesign, pokemonSheetSize } = await import("../scripts/pokemon-sheet-pc.mjs");

test("an unknown saved design falls back to the classic sheet and its size", () => {
  saved = "removed-design";
  assert.equal(currentPokemonSheetDesign(), "classic");
  assert.deepEqual(pokemonSheetSize(), { width: 900, height: 780 });
});

test("the PC design opens a smaller window than the classic one", () => {
  saved = "pc";
  assert.equal(currentPokemonSheetDesign(), "pc");
  assert.ok(pokemonSheetSize().height < 780);
});

test("every panel of the classic sheet lands in a tab, or it would vanish from the PC design", () => {
  const sheet = readFileSync("scripts/pokemon-sheet-ui.mjs", "utf8");
  const layout = readFileSync("scripts/pokemon-sheet-pc.mjs", "utf8");
  const panels = new Set(sheet.match(/poke5e-pokemon-panel--[a-z-]+/g));
  assert.ok(panels.size >= 7);
  for (const panel of panels) {assert.ok(layout.includes(`.${panel}`), `${panel} has no tab`);}
  const unnamed = sheet.match(/class="poke5e-pokemon-panel">\s*<header>[\s\S]*?class="(poke5e-pokemon-[a-z-]+)"/g) ?? [];
  assert.equal(unnamed.length, 2);
  assert.ok(layout.includes(":has(.poke5e-pokemon-stats)") && layout.includes(":has(.poke5e-pokemon-battle-grid)"));
});
