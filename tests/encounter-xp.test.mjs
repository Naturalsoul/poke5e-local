import assert from "node:assert/strict";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const { calculatePokemonEncounterXp, encounterShare, levelProgress, poolExpShare, levelScaling } = await import("../scripts/encounter-xp-service.mjs");

test("without rules it is poke5e's: 200 × Level × SR, capture a fifth", () => {
  assert.deepEqual(calculatePokemonEncounterXp({ level: 10, sr: 8 }), { defeated: 16000, captured: 3200 });
});

test("level scaling as in Gen V: weaker rivals give much less, stronger ones more", () => {
  assert.equal(levelScaling(10, 10), 1);
  assert.equal(levelScaling(8, 10).toFixed(2), "0.83");
  assert.equal(levelScaling(5, 10).toFixed(2), "0.57");
  assert.ok(levelScaling(12, 10) > 1);
  assert.equal(calculatePokemonEncounterXp({ level: 5, sr: 8, context: { scaling: true, partyLevel: 10 } }).defeated,
    Math.round(8000 * levelScaling(5, 10)));
});

test("progress: a gain as a share of the level, where it lands, and how many like it make a level", () => {
  const halfway = 62000 + 10000;
  const { before, after, share, toLevel } = levelProgress(halfway, 4000);
  assert.deepEqual(before, { level: 10, progress: 0.5 });
  assert.deepEqual(after, { level: 10, progress: 0.7 });
  assert.equal(share, 0.2, "4 000 of the 20 000 from 10 to 11");
  assert.equal(toLevel, 3, "10 000 left: three like it");
  const across = levelProgress(halfway, 15000);
  assert.equal(across.after.level, 11, "it can cross into the next level");
  assert.equal(levelProgress(450000, 1000).toLevel, null, "level 20 has nowhere to go");
});

test("pace: a Medium encounter, divided among those taking part, gives each 1/N of a level, by strength not SR", () => {
  const pace = (level, overrides = {}) => calculatePokemonEncounterXp({ level, sr: 8, context: {
    style: "pace", pace: 8, scaling: false, partyLevel: 10, participants: 1, partyPower: 1200, multiplier: 1, ...overrides } }).defeated;
  assert.equal(pace(10), 2500, "20 000 to level 11, in 8 encounters");
  assert.equal(calculatePokemonEncounterXp({ level: 10, sr: 1, context: { style: "pace", pace: 8, partyLevel: 10,
    participants: 1, partyPower: 1200, multiplier: 1 } }).defeated, 2500, "the SR doesn't matter");
  assert.equal(pace(8), 1875, "a weaker rival weighs less: 900 against 1200");
  assert.equal(pace(10, { multiplier: 1.5 }), 3750, "a harder encounter gives more");
  assert.equal(pace(10, { participants: 4, partyPower: 4800 }) * 4 / 4, 2500,
    "4 against 4: four rivals' XP divided among 4 participants is 2 500 each");
  assert.ok(pace(10) < calculatePokemonEncounterXp({ level: 10, sr: 8 }).defeated / 6, "far below poke5e's 16 000");
});

test("shares: an even split, but in an optional encounter the weaker Pokémon get more and the strongest less", () => {
  const rows = [{ level: 8, sr: 5, quantity: 2 }];
  assert.equal(encounterShare(rows, 10, 2), 8000, "2 × 8 000 between 2");
  const strongest = encounterShare(rows, 10, 2, { optional: true });
  const weaker = encounterShare(rows, 4, 2, { optional: true });
  assert.equal(strongest, Math.round(8000 * levelScaling(8, 10)));
  assert.ok(weaker > 8000 && strongest < 8000, `${weaker} > 8000 > ${strongest}`);
  const pace = { style: "pace", pace: 8, scaling: false, partyLevel: 10, participants: 2, partyPower: 2400, multiplier: 1 };
  assert.equal(encounterShare([{ level: 10, sr: 1, quantity: 2 }], 10, 2, { context: pace }), 2500, "the pace, split");
});

test("Exp. Share, house rule: the holder pools its trainer's XP as one more participant, nothing added", () => {
  const shares = [{ trainer: "ash", xp: 600 }, { trainer: "ash", xp: 400 }, { trainer: "misty", xp: 4000 },
    { trainer: "ash", xp: 0, holder: true }];
  assert.deepEqual(poolExpShare(shares), [333, 333, 4000, 333]);
  // Its trainer's Pokémon didn't fight: nothing to share.
  assert.deepEqual(poolExpShare([{ trainer: "misty", xp: 900 }, { trainer: "ash", xp: 0, holder: true }]), [900, 0]);
  // Holding it and fighting: just a fighter.
  assert.deepEqual(poolExpShare([{ trainer: "ash", xp: 500 }, { trainer: "ash", xp: 500 }]), [500, 500]);
});
