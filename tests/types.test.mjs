import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePokemonDefenses,
  hasStab,
  pokemonTypeLabel
} from "../scripts/types.mjs";

test("dual types preserve raw x4 while Foundry classification remains vulnerability", () => {
  const defenses = calculatePokemonDefenses(["fire", "flying"]);
  assert.equal(defenses.multipliers.rock, 4);
  assert.ok(defenses.vulnerabilities.includes("rock"));
});

test("Water resists Fire and is weak to Electric", () => {
  const defenses = calculatePokemonDefenses(["water"]);
  assert.equal(defenses.multipliers.fire, 0.5);
  assert.equal(defenses.multipliers.electric, 2);
});

test("STAB requires the move type to match one of the Pokemon types", () => {
  assert.equal(hasStab(["water", "flying"], "water"), true);
  assert.equal(hasStab(["water", "flying"], "electric"), false);
});

test("type labels support ES and EN", () => {
  assert.equal(pokemonTypeLabel("electric", "es"), "Eléctrico");
  assert.equal(pokemonTypeLabel("electric", "en"), "Electric");
});
