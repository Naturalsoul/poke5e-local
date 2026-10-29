import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEncounterDefinition,
  mergeTrainerRerollRows,
  validateTrainerState
} from "../scripts/encounter-planner-data.mjs";

test("a reroll keeps locked rows in place and fills the rest in order", () => {
  const current = [{ id: "a", locked: true }, { id: "b" }, { id: "c", locked: true }, { id: "d" }];
  const generated = [{ id: "x" }, { id: "y" }, { id: "z" }];
  assert.deepEqual(mergeTrainerRerollRows(current, generated).map(row => row.id), ["a", "x", "c", "y", "z"]);
  assert.deepEqual(mergeTrainerRerollRows(null, generated).map(row => row.id), ["x", "y", "z"]);
});

test("trainer encounters need named Trainers with at least one Pokémon", () => {
  const trainer = { id: "t1", name: "Brock" };
  assert.equal(validateTrainerState({ type: "wild", trainers: [], rows: [] }), null);
  assert.match(validateTrainerState({ type: "trainer", trainers: [], rows: [] }), /al menos un Entrenador/);
  assert.match(validateTrainerState({ type: "trainer", trainers: [{ id: "t1", name: " " }], rows: [] }), /nombre/);
  assert.match(validateTrainerState({ type: "trainer", trainers: [trainer], rows: [] }), /"Brock" requiere/);
  assert.equal(validateTrainerState({ type: "trainer", trainers: [trainer], rows: [{ trainerId: "t1" }] }), null);
});

test("the encounter definition groups rows under their Trainer", () => {
  const row = { pokemonId: "onix", level: 12, quantity: 1, trainerId: "t1", abilityId: " Sturdy ", itemId: "", moveIds: ["tackle"] };
  const state = {
    encounterKey: "k1", type: "trainer", optional: true,
    trainers: [{ id: "t1", name: " Brock ", archetypeId: "missing" }],
    rows: [row, { ...row, trainerId: "t2" }]
  };
  const definition = buildEncounterDefinition(state, "Pewter", "Gym");
  assert.equal(definition.optional, true);
  assert.deepEqual(definition.pokemon, []);
  assert.equal(definition.trainers.length, 1);
  const [brock] = definition.trainers;
  assert.equal(brock.name, "Brock");
  assert.equal(brock.archetypeId, "generic");
  assert.equal(brock.pokemon.length, 1);
  assert.equal(brock.pokemon[0].abilityId, "sturdy");
  assert.equal(brock.pokemon[0].itemId, null);
  assert.equal(brock.pokemon[0].itemResolved, false);
  assert.deepEqual(brock.pokemon[0].moveIds, ["tackle"]);

  const wild = buildEncounterDefinition({ ...state, type: "wild", optional: "yes" }, "Route 1", "Grass");
  assert.equal(wild.optional, false);
  assert.equal(wild.pokemon.length, 2);
  assert.deepEqual(wild.trainers, []);
});
