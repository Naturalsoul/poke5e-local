import assert from "node:assert/strict";
import test from "node:test";
import { TRAINER_RANKS, getTrainerRank, rankLevels } from "../scripts/encounter-difficulty.mjs";
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

test("a Gym Leader on auto sends out no more than the party plus its field cap, all trainers together; a manual choice wins", () => {
  const rank = getTrainerRank("gym-leader");
  const party = { size: 2, level: 5, team: 4, pokemon: [], strongest: null, participants: 2 };
  const levels = rankLevels(party.level, rank);
  const state = { trainerRandomCount: "auto", trainerRandomPokemonCount: "auto", trainerRandomOnField: "auto", trainerRandomArchetype: "generic" };
  for (let i = 0; i < 10; i += 1) {
    const { generatedTrainers } = rollTrainerEncounter({ state, party, rank, levels, boosts: {}, candidates, pokemonTypes: () => ["normal"] });
    assert.ok(generatedTrainers.reduce((total, trainer) => total + trainer.onField, 0) <= party.size + rank.fieldCap);
  }
  const manual = rollTrainerEncounter({ state: { ...state, trainerRandomCount: "1", trainerRandomPokemonCount: "6", trainerRandomOnField: "4" },
    party, rank, levels, boosts: {}, candidates, pokemonTypes: () => ["normal"] });
  assert.equal(manual.generatedTrainers[0].onField, Math.min(4, manual.generatedTrainers[0].pokemon.length));
});

test("a boss is one trainer with 6 to 12 Pokémon, up to 6 out, 1 to 3 actions each, weighed by both", async () => {
  const { encounterDifficulty, fieldedActions } = await import("../scripts/encounter-difficulty.mjs");
  const rank = getTrainerRank("boss");
  const party = { size: 4, level: 8, team: 4, pokemon: [], strongest: null, participants: 4 };
  const levels = rankLevels(party.level, rank);
  const state = { trainerRandomCount: "auto", trainerRandomPokemonCount: "auto", trainerRandomOnField: "auto", trainerRandomArchetype: "generic" };
  const { generatedTrainers: [boss, ...others] } = rollTrainerEncounter({ state, party, rank, levels, boosts: rank.extras, candidates,
    pokemonTypes: () => ["normal"] });
  assert.equal(others.length, 0);
  assert.ok(boss.pokemon.length >= 6 && boss.pokemon.length <= 12, String(boss.pokemon.length));
  assert.ok(boss.onField >= 1 && boss.onField <= 6 && boss.actions >= 1 && boss.actions <= 3);
  assert.equal(fieldedActions([{ onField: 2, actions: 3 }, { onField: 9 }], () => 4), 11, "2 × (1 + 2 × 1.25), and 4 out of 9 asked");
  const rows = boss.pokemon.map(pokemon => ({ ...pokemon, types: ["normal"] }));
  const weigh = actions => encounterDifficulty(party, rows, { onField: fieldedActions([{ ...boss, actions }], () => rows.length), boosts: rank.extras }).ratio;
  assert.ok(weigh(2) > weigh(1));
});

test("a rival aims at its chance to win: higher ratio and a lower level gap win more, and a boss lands in its band or says what it reached", async () => {
  const { encounterDifficulty, fieldedActions, rivalWinChance, winRange } = await import("../scripts/encounter-difficulty.mjs");
  assert.ok(Math.abs(winRange(70).winFrom - 0.65) < 1e-9 && Math.abs(winRange(70).winTo - 0.75) < 1e-9);
  assert.ok(rivalWinChance(1) < 0.01 && rivalWinChance(6) > 0.99);
  assert.ok(rivalWinChance(3.2, 0) > rivalWinChance(3, 0) && rivalWinChance(3, -1) > rivalWinChance(3, 0) && rivalWinChance(3, 1) < rivalWinChance(3, 0));
  const rank = getTrainerRank("boss");
  const party = { size: 4, level: 8, team: 4, pokemon: [], strongest: null, participants: 4 };
  const levels = rankLevels(party.level, rank);
  const roll = chance => {
    const state = { trainerRandomCount: "auto", trainerRandomPokemonCount: "auto", trainerRandomOnField: "auto",
      trainerRandomArchetype: "generic", bossWinChance: chance };
    const { generatedTrainers: [boss], missedTarget } = rollTrainerEncounter({ state, party, rank, levels, boosts: rank.extras, candidates,
      pokemonTypes: () => ["normal"] });
    const rows = boss.pokemon.map(pokemon => ({ ...pokemon, types: ["normal"] }));
    const { win } = encounterDifficulty(party, rows, { onField: fieldedActions([boss], () => rows.length), boosts: rank.extras });
    const { winFrom, winTo } = winRange(Number(chance));
    assert.ok((win >= winFrom - 1e-9 && win <= winTo + 1e-9) || missedTarget?.wanted === `que el boss gane un ${chance} %`, `${chance}: ${win}`);
  };
  ["60", "90"].forEach(roll);
});

test("a boss keeps a team over 6: asked for 12 it gets 12, and a reroll on auto keeps its size", async () => {
  const { generateRandomTrainerEncounter, rerollRandomTrainerTeam } = await import("../scripts/encounter-trainer-randomizer.mjs");
  const many = Array.from({ length: 14 }, (_, index) => ({ id: `species-${index}`, name: `species-${index}`, types: ["normal"], minLevel: 1, sr: 1 }));
  const [boss] = generateRandomTrainerEncounter({ candidates: many, trainerCount: 1, pokemonPerTrainer: "12", minLevel: 8, maxLevel: 9,
    archetypeId: "generic" });
  assert.equal(boss.pokemon.length, 12);
  const rerolled = rerollRandomTrainerTeam({ candidates: many, currentTeamSize: 10, pokemonPerTrainer: "auto", minLevel: 8, maxLevel: 9,
    archetypeId: "generic" });
  assert.equal(rerolled.pokemon.length, 10);
});

test("generation options only send coverage types when that boost is on", () => {
  const state = { boostCoverage: false, boostStats: "2", partyWeakTo: ["fire"], itemPolicies: {}, type: "wild" };
  assert.deepEqual(buildGenerationOptions(state).boosts.coverageTypes, []);
  assert.equal(buildGenerationOptions(state).boosts.statBonus, 2);
  state.boostCoverage = true;
  assert.deepEqual(buildGenerationOptions(state).boosts.coverageTypes, ["fire"]);
});

test("every win-chance rank rolls a rival that wins its chance for parties of 2 to 6", () => {
  const state = { trainerRandomCount: "auto", trainerRandomPokemonCount: "auto", trainerRandomOnField: "auto", trainerRandomArchetype: "generic" };
  for (const party of [{ size: 2, level: 8, team: 3 }, { size: 4, level: 8, team: 5 }, { size: 6, level: 8, team: 4 }]) {
    for (const rank of TRAINER_RANKS.filter(entry => entry.winChance)) {
      const { missedTarget } = rollTrainerEncounter({ state, party: { ...party, pokemon: [] }, rank, levels: rankLevels(party.level, rank),
        boosts: rank.extras, candidates, pokemonTypes: () => ["normal"] });
      const reached = missedTarget ? Number.parseInt(missedTarget.reached.replace(/\D+/g, ""), 10) : rank.winChance;
      assert.ok(Math.abs(reached - rank.winChance) <= 10, `${rank.id} for ${party.size} players: ${missedTarget?.reached}`);
    }
  }
});
