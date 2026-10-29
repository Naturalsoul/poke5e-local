import assert from "node:assert/strict";
import test from "node:test";
import { getTrainerRank, rankLevels } from "../scripts/encounter-difficulty.mjs";
import {
  buildGenerationOptions,
  buildTrainerRoster,
  replaceTrainerRows,
  rerollTrainerTeamRows,
  rollTrainerEncounter,
  rollWildEncounterRows,
  trainerTeamLevels
} from "../scripts/encounter-planner-generation.mjs";

const candidates = ["rattata", "pidgey", "caterpie", "weedle", "spearow", "zubat"]
  .map(id => ({ id, name: id, types: ["normal"], minLevel: 1, sr: 1 }));
const counter = prefix => {
  let n = 0;
  return () => `${prefix}-${++n}`;
};

test("a wild reroll keeps locked rows with their Ability and item", () => {
  const state = {
    randomSize: "normal",
    randomDifficulty: "",
    rows: [{ id: "row-1", pokemonId: "pidgey", level: 3, quantity: 1, locked: true, abilityId: " Keen-Eye ", itemId: "oran-berry" }]
  };
  const rows = rollWildEncounterRows({ state, candidates, party: {}, minLevel: 2, maxLevel: 4, nextRowId: counter("row") });
  const locked = rows.find(row => row.locked);
  assert.equal(locked.pokemonId, "pidgey");
  assert.equal(locked.abilityId, "keen-eye");
  assert.equal(locked.itemId, "oran-berry");
  assert.equal(locked.itemResolved, true);
  for (const row of rows.filter(each => !each.locked)) {
    assert.equal(row.trainerId, null);
    assert.equal(row.abilityId, null);
    assert.equal(row.itemResolved, false);
    assert.ok(row.level >= 2 && row.level <= 4);
  }
  assert.deepEqual(rows.map(row => row.id), rows.map((_, index) => `row-${index + 1}`));
});

test("a trainer reroll replaces only that trainer's unlocked rows, in place", () => {
  const trainer = { id: "t1", name: "Joey", teamSize: "3", archetypeId: "generic" };
  const rows = [
    { id: "a", trainerId: "t1", pokemonId: "rattata", level: 5, quantity: 1, locked: true },
    { id: "b", trainerId: "t1", pokemonId: "pidgey", level: 4, quantity: 1 },
    { id: "c", trainerId: "t2", pokemonId: "weedle", level: 2, quantity: 1 }
  ];
  const { minLevel, maxLevel } = trainerTeamLevels(rows, "t1", null);
  assert.deepEqual({ minLevel, maxLevel }, { minLevel: 4, maxLevel: 5 });
  assert.deepEqual(trainerTeamLevels(rows, "nobody", 8), { minLevel: 5, maxLevel: 8 });

  const result = rerollTrainerTeamRows({ trainer, rows, candidates, minLevel, maxLevel, nextRowId: counter("new") });
  assert.equal(result.lockedCount, 1);
  assert.ok(result.generatedRows.length > 0);
  assert.equal(result.rows[0].id, "a");
  assert.equal(result.rows.at(-1).id, "c");
  assert.ok(result.rows.slice(1, -1).every(row => row.trainerId === "t1" && row.id.startsWith("new-")));
});

test("replaceTrainerRows appends a team that had no rows", () => {
  const rows = [{ id: "c", trainerId: "t2" }];
  assert.deepEqual(replaceTrainerRows(rows, "t1", [{ id: "x", trainerId: "t1" }]).map(row => row.id), ["c", "x"]);
});

test("rolled trainers get counted names and fresh ids", () => {
  const { trainers, rows } = buildTrainerRoster({
    generatedTrainers: [
      { archetypeId: "generic", onField: 1, pokemon: [{ pokemonId: "rattata" }] },
      { archetypeId: "generic", onField: 1, pokemon: [{ pokemonId: "zubat" }, { pokemonId: "pidgey" }] }
    ],
    teamSize: "auto",
    language: "es",
    nextTrainerId: counter("trainer"),
    nextRowId: counter("row")
  });
  assert.deepEqual(trainers.map(trainer => trainer.id), ["trainer-1", "trainer-2"]);
  assert.match(trainers[0].name, / 1$/);
  assert.match(trainers[1].name, / 2$/);
  assert.deepEqual(rows.map(row => [row.id, row.trainerId]), [["row-1", "trainer-1"], ["row-2", "trainer-2"], ["row-3", "trainer-2"]]);
});

test("a rank roll returns trainers within the rank's levels", () => {
  const rank = getTrainerRank("");
  const party = { size: 4, level: 5, team: 4, pokemon: [], strongest: null, participants: 4 };
  const levels = rankLevels(party.level, rank);
  const state = { trainerRandomCount: "auto", trainerRandomPokemonCount: "auto", trainerRandomOnField: "auto", trainerRandomArchetype: "generic" };
  const { generatedTrainers } = rollTrainerEncounter({
    state, party, rank, levels, boosts: {}, candidates, pokemonTypes: () => ["normal"]
  });
  assert.ok(generatedTrainers.length >= rank.trainers[0] && generatedTrainers.length <= rank.trainers[1]);
  for (const pokemon of generatedTrainers.flatMap(trainer => trainer.pokemon)) {
    assert.ok(pokemon.level >= levels.min && pokemon.level <= Math.max(levels.max, levels.ace ?? 0));
  }
});

test("generation options only send coverage types when that boost is on", () => {
  const state = { boostCoverage: false, boostStats: "2", partyWeakTo: ["fire"], itemPolicies: {}, type: "wild" };
  assert.deepEqual(buildGenerationOptions(state).boosts.coverageTypes, []);
  assert.equal(buildGenerationOptions(state).boosts.statBonus, 2);
  state.boostCoverage = true;
  assert.deepEqual(buildGenerationOptions(state).boosts.coverageTypes, ["fire"]);
});
