import assert from "node:assert/strict";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const { detectEncounterParty, distanceToTier, encounterDifficulty, pokemonPower } = await import("../scripts/encounter-difficulty.mjs");

const tier = (party, rows) => encounterDifficulty(party, rows).tier.id;

test("an even fight is Medium; weaker or fewer rivals are easier, stronger or more are harder", () => {
  const party = { size: 4, level: 5 };
  assert.equal(tier(party, [{ level: 5, quantity: 4 }]), "medium", "4 against 4, same level");
  assert.equal(tier({ size: 1, level: 5 }, [{ level: 5 }]), "medium", "1 against 1");
  assert.equal(tier(party, [{ level: 5, quantity: 2 }]), "easy", "half as many");
  assert.equal(tier(party, [{ level: 5 }]), "trivial", "one against four");
  assert.equal(tier(party, [{ level: 7, quantity: 4 }]), "hard", "two levels higher: 750 against 500");
  assert.equal(tier(party, [{ level: 5, quantity: 8 }]), "deadly", "twice as many: 8 × 500 × 1.5 = 12 000 against 2000");
  assert.equal(tier({ size: 2, level: 10 }, [{ level: 12 }, { level: 9, quantity: 2 }]), "hard", "mixed rows");
});

test("weights follow D&D's per-level curve and clamp to levels 1 to 20", () => {
  assert.equal(pokemonPower(1), 50);
  assert.equal(pokemonPower(10), 1200);
  assert.equal(pokemonPower(25), 5700);
  assert.equal(pokemonPower(0), 50);
  assert.equal(encounterDifficulty({ size: 4, level: 5 }, []).tier.id, "trivial", "no rivals");
});

test("distance to a tier is 0 inside it and grows outside", () => {
  assert.equal(distanceToTier(1.2, "medium"), 0);
  assert.equal(distanceToTier(0.8, "medium"), 0.19999999999999996);
  assert.equal(distanceToTier(2, "medium"), 0.5);
  assert.equal(distanceToTier(5, "deadly"), 0);
});

test("the party is each player's trainer, at their strongest team Pokémon's level on average", () => {
  const pokemon = (uuid, level) => ({ uuid, getFlag: (_scope, key) => (key === "level" ? level : undefined) });
  const all = { a1: pokemon("a1", 6), a2: pokemon("a2", 9), b1: pokemon("b1", 4) };
  const trainer = (id, team, playerOwned = true) => ({ id, uuid: `Actor.${id}`, documentName: "Actor", hasPlayerOwner: playerOwned,
    getFlag: (_scope, key) => ({ kind: "trainer", trainerParty: { pokemonUuids: team } })[key] });
  globalThis.fromUuidSync = uuid => all[uuid] ?? null;
  globalThis.game = { actors: [trainer("ash", ["a1", "a2"]), trainer("misty", ["b1"]), trainer("rival", ["a1"], false)] };
  const { weakTo, pokemon: matchups, strongest, ...party } = detectEncounterParty();
  assert.equal(strongest.level, 9, "the strongest Pokémon, for the progress");
  assert.deepEqual(party, { size: 2, level: 7, team: 2 }, "9 and 4, teams of 2 and 1: the NPC rival doesn't count");
  assert.ok(Array.isArray(weakTo));
  assert.equal(matchups.length, 3, "every team Pokémon, for the type matchup");
  globalThis.game = { actors: [] };
  assert.equal(detectEncounterParty(), null);
});

test("generating by difficulty rerolls until it lands in the tier, or keeps the closest", async () => {
  const { generateForDifficulty } = await import("../scripts/encounter-difficulty.mjs");
  const party = { size: 1, level: 5 };
  const measure = rows => encounterDifficulty(party, rows);
  const rolls = [[{ level: 2 }], [{ level: 9 }], [{ level: 5 }], [{ level: 1 }]];
  let calls = 0;
  const medium = generateForDifficulty(() => rolls[calls++ % rolls.length], measure, "medium");
  assert.deepEqual(medium.result, [{ level: 5 }]);
  assert.equal(calls, 3, "stops at the first hit");
  const deadly = generateForDifficulty(() => [{ level: 6 }], measure, "deadly", 5);
  assert.equal(deadly.tier.id, "medium", "none reaches Deadly: the closest, and the planner warns");
  assert.ok(deadly.distance > 0);
});

test("trainer battles: whole teams, Pokémon on the field both ways, an even battle is Hard", async () => {
  const party = { size: 4, level: 8, team: 3 };
  const trainers = (count, size, level, onField = 1) => ({
    rows: Array.from({ length: count * size }, () => ({ level })), onField: count * onField });
  const battle = ({ rows, onField }) => encounterDifficulty(party, rows, { onField }).tier.id;
  assert.equal(battle(trainers(4, 3, 8)), "hard", "4 against 4, same teams and level");
  assert.equal(battle(trainers(4, 3, 7)), "hard", "a level below: 1.0");
  assert.equal(battle(trainers(4, 3, 6)), "medium", "two below: 0.8");
  assert.equal(battle(trainers(4, 3, 9)), "deadly", "a level above: 2.2");
  assert.equal(battle(trainers(1, 3, 8)), "trivial", "a lone trainer against four: one Pokémon facing four");
  assert.equal(battle(trainers(2, 6, 7)), "easy", "two trainers of 6, one each on the field");
  assert.equal(battle(trainers(2, 6, 7, 2)), "hard", "the same two in a double battle");
  assert.equal(battle(trainers(3, 6, 7, 2)), "deadly", "three of them in a double battle");
});

test("rival extras raise a trainer battle's difficulty without levels", async () => {
  const { boostMultiplier } = await import("../scripts/encounter-difficulty.mjs");
  assert.equal(boostMultiplier(), 1);
  assert.equal(boostMultiplier({ statBonus: 2, coverage: true, items: true }).toFixed(3), "1.386");
  const party = { size: 4, level: 8, team: 3 };
  const rows = Array.from({ length: 12 }, () => ({ level: 6 }));
  assert.equal(encounterDifficulty(party, rows, { onField: 4 }).tier.id, "medium", "two levels below: 0.8");
  assert.equal(encounterDifficulty(party, rows, { onField: 4, boosts: { statBonus: 2, coverage: true, items: true } }).tier.id,
    "hard", "the same Pokémon with every extra: 1.11");
});

test("coverage brings a super effective damaging Move into the four", async () => {
  const { selectEncounterMoves } = await import("../scripts/encounter-move-selector.mjs");
  const move = (id, type, damage = true) => ({ id, type, damage: damage ? { dice: { 1: "1d6" } } : null });
  const moves = [move("a", "normal"), move("b", "normal"), move("c", "normal"), move("d", "normal"), move("e", "normal"),
    move("growl", "fire", false), move("ember", "fire")];
  const pokemon = { id: "x", learnset: { level: [{ level: 1, moveIds: moves.map(each => each.id) }] } };
  for (let seed = 0; seed < 20; seed++) {
    let n = seed;
    const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    const ids = selectEncounterMoves({ pokemon, moves, level: 5, coverageTypes: ["fire"], random }).map(each => each.id);
    assert.equal(ids.length, 4);
    assert.ok(ids.includes("ember"), `ember with seed ${seed}: ${ids}`);
  }
  const without = selectEncounterMoves({ pokemon, moves: moves.filter(each => each.id !== "ember"), level: 5, coverageTypes: ["fire"] });
  assert.equal(without.length, 4, "nothing covers: four Moves as before");
});

test("ranks keep levels near the party's and put the ace above", async () => {
  const { getTrainerRank, rankLevels } = await import("../scripts/encounter-difficulty.mjs");
  assert.deepEqual(rankLevels(8, getTrainerRank("route")), { min: 5, max: 7, ace: null });
  assert.deepEqual(rankLevels(8, getTrainerRank("gym-leader")), { min: 7, max: 8, ace: [9, 9] });
  assert.deepEqual(rankLevels(8, getTrainerRank("champion")), { min: 8, max: 9, ace: [9, 10] });
  assert.deepEqual(rankLevels(1, getTrainerRank("route")), { min: 1, max: 1, ace: null }, "never below 1");
  assert.deepEqual(rankLevels(20, getTrainerRank("champion")).ace, [20, 20], "never above 20");
  assert.equal(getTrainerRank("nope").id, "route");
});

test("types tilt a trainer battle: advantage up, disadvantage down, unknown neutral", async () => {
  const { typeMatchup } = await import("../scripts/encounter-difficulty.mjs");
  const grass = [{ types: ["grass"], moveTypes: ["grass"] }];
  assert.ok(typeMatchup(["fire"], grass) > 1.5, "Fire against Grass");
  assert.ok(typeMatchup(["water"], grass) < 0.7, "Water against Grass");
  assert.equal(typeMatchup(["normal"], [{ types: ["normal"], moveTypes: ["normal"] }]), 1);
  assert.equal(typeMatchup([], grass), 1);
  assert.equal(typeMatchup(["fire"], []), 1);
  const party = { size: 1, level: 8, team: 1, pokemon: grass };
  const fight = types => encounterDifficulty(party, [{ level: 8, types }], { onField: 1 });
  assert.ok(fight(["fire"]).power > fight(["water"]).power);
  assert.ok(fight(["fire"]).matchup > 1);
});

test("every rank reaches its difficulty for parties of 2 to 6, adding helpers only when needed", async () => {
  const { TRAINER_RANKS, generateForDifficulty, rankLevels } = await import("../scripts/encounter-difficulty.mjs");
  const pick = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
  for (const party of [{ size: 2, level: 8, team: 3 }, { size: 4, level: 8, team: 3 }, { size: 6, level: 8, team: 4 }]) {
    for (const rank of TRAINER_RANKS) {
      const levels = rankLevels(party.level, rank);
      let best = null;
      for (let trainers = rank.trainers[0]; trainers <= rank.trainers[1] && best?.distance !== 0; trainers++) {
        const roll = () => {
          const team = pick(rank.team);
          const rows = Array.from({ length: trainers * team }, (_, index) => ({
            level: levels.ace && index === team - 1 ? pick(levels.ace) : pick([levels.min, levels.max]) }));
          return { rows, onField: trainers * Math.min(team, pick(rank.onField)) };
        };
        const attempt = generateForDifficulty(roll, ({ rows, onField }) =>
          encounterDifficulty(party, rows, { onField, boosts: rank.extras }), rank.target, 300);
        if (!best || attempt.distance < best.distance) {best = attempt;}
      }
      assert.equal(best.distance, 0, `${rank.id} for ${party.size} players: ${best.tier.id}`);
      assert.ok(best.result.rows.every(row => row.level <= (levels.ace?.[1] ?? levels.max)), "levels stay in the rank's band");
    }
  }
});
