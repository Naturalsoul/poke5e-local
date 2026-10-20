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
  assert.deepEqual(detectEncounterParty(), { size: 2, level: 7, team: 2 }, "9 and 4, teams of 2 and 1: the NPC rival doesn't count");
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

test("trainer battles: whole teams, one Pokémon per trainer on the field, trainer Pokémon a bit stronger", () => {
  const party = { size: 1, level: 5, team: 6 };
  const team = count => Array.from({ length: count }, () => ({ level: 5 }));
  const battle = (rows, trainers) => encounterDifficulty(party, rows, { trainers }).tier.id;
  assert.equal(battle(team(6), 1), "medium", "6 against 6, same level: 1.2");
  assert.equal(battle(team(3), 1), "easy", "half a team: 0.6");
  assert.equal(battle(team(6), 2), "hard", "two trainers at once: ×1.5 more");
  assert.equal(battle(team(6).map(() => ({ level: 8 })), 1), "hard", "three levels higher: 2.16, just short of Deadly");
  assert.equal(battle(team(6).map(() => ({ level: 9 })), 1), "deadly", "four levels higher: 1100 × 1.2 against 500");
  assert.equal(encounterDifficulty({ size: 1, level: 5, team: 6 }, team(6)).tier.id, "deadly",
    "the same 6 as wild Pokémon all at once: crowd ×3.5 against one");
});
