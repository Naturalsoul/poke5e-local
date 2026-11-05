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

test("each pixel design opens at the compact size, and Pixel Team Rocket is a design of its own", () => {
  for (const design of ["pc", "rocket"]) {
    saved = design;
    assert.equal(currentPokemonSheetDesign(), design);
    assert.equal(pokemonSheetSize().height, 620);
  }
});

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test("Pixel Team Rocket's text stays readable on its panels and buttons", () => {
  const css = readFileSync("styles/pokemon-sheet-pc.css", "utf8");
  const block = css.slice(css.indexOf(".poke5e-pokemon-summary--rocket {"));
  const token = name => block.match(new RegExp(`--pc-${name}: (#[0-9a-f]{6})`))[1];
  for (const text of ["ink", "muted", "red-dark", "gold", "stat-down"]) {
    for (const surface of ["paper", "paper-shade", "field"]) {
      assert.ok(contrast(token(text), token(surface)) >= 4.5, `${text} on ${surface}`);
    }
  }
  assert.ok(contrast(token("proficient-text"), token("proficient")) >= 4.5);
  assert.ok(contrast("#ffffff", token("red")) >= 4.5);
});
