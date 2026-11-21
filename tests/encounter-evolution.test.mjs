import assert from "node:assert/strict";
import test from "node:test";
import { evolveRolledPokemon } from "../scripts/encounter-evolution.mjs";
import { encounterDifficulty, speciesWeight } from "../scripts/encounter-difficulty.mjs";

const evolutions = [
  { from: "totodile", to: "croconaw", conditions: [{ type: "level", value: 6 }] },
  { from: "croconaw", to: "feraligatr", conditions: [{ type: "level", value: 14 }] },
  { from: "eevee", to: "vaporeon", conditions: [{ type: "item", value: "water-stone" }] },
  { from: "burmy", to: "wormadam", conditions: [{ type: "level", value: 5 }, { type: "gender", value: "female" }] }
];
const pool = ["totodile", "croconaw", "feraligatr", "eevee", "vaporeon", "burmy", "wormadam"].map(id => ({ id }));

test("a rolled rival climbs its level evolutions up to its own level, among the species the roll could pick", () => {
  assert.equal(evolveRolledPokemon({ pokemonId: "totodile", level: 5 }, { evolutions, pool }).pokemonId, "totodile");
  assert.equal(evolveRolledPokemon({ pokemonId: "totodile", level: 10 }, { evolutions, pool }).pokemonId, "croconaw");
  assert.equal(evolveRolledPokemon({ pokemonId: "totodile", level: 15 }, { evolutions, pool }).pokemonId, "feraligatr");
  assert.equal(evolveRolledPokemon({ pokemonId: "eevee", level: 15 }, { evolutions, pool }).pokemonId, "eevee");
  assert.equal(evolveRolledPokemon({ pokemonId: "burmy", level: 8 }, { evolutions, pool }).pokemonId, "wormadam");
  // A gym's single-type pool without the evolution keeps the rolled species.
  assert.equal(evolveRolledPokemon({ pokemonId: "totodile", level: 10 }, { evolutions, pool: [{ id: "totodile" }] }).pokemonId, "totodile");
  const row = { pokemonId: "totodile", level: 10, ace: true, quantity: 1 };
  assert.deepEqual(evolveRolledPokemon(row, { evolutions, pool }), { ...row, pokemonId: "croconaw" });
});

test("a rival's species SR weighs against the players' own", () => {
  assert.equal(speciesWeight(7, 7), 1);
  assert.equal(speciesWeight(0, 7), 1);
  assert.equal(speciesWeight(7, 0), 1);
  assert.ok(speciesWeight(14, 7) > 1.25 && speciesWeight(14, 7) < 1.3);
  assert.equal(speciesWeight(1000, 1), 2);
  const party = { size: 1, level: 10, team: 1, pokemon: [{ types: [], sr: 6 }] };
  const ratio = sr => encounterDifficulty(party, [{ level: 10, sr }], { onField: 1 }).ratio;
  assert.ok(ratio(12) > ratio(6) && ratio(6) > ratio(3));
  assert.equal(encounterDifficulty({ ...party, pokemon: [{ types: [] }] }, [{ level: 10, sr: 12 }], { onField: 1 }).ratio, ratio(6));
});
