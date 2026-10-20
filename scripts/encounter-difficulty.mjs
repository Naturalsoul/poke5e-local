import { isTrainerActor } from "./trainer-service.mjs";
import { getTrainerOwnedPokemon, getTrainerPartyState } from "./trainer-party-service.mjs";

/* ============================================================
 * ENCOUNTER DIFFICULTY
 *
 * poke5e has no difficulty table, and its SR is not a CR: "Pokémon of the same level will be similarly strong".
 * So each Pokémon weighs by its level, on D&D 5e's curve (the DMG's Medium XP threshold per character level), and:
 * - the party is one Pokémon per player, at the level of their strongest; in trainer battles, their whole team;
 * - a wild encounter is its Pokémon's weight, times D&D's crowd multiplier when they outnumber the party;
 * - a trainer battle is every Pokémon of every team (each one must be beaten), stronger than wild ones (poke5e
 *   gives them a feat, a specialization and better stats), with the crowd multiplier counting only the Pokémon on
 *   the field at once: one per trainer;
 * - an even fight is Medium; Easy, Hard and Deadly follow D&D's thresholds (½, 1½ and 2.2 times Medium).
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const POWER_BY_LEVEL = Object.freeze([0, 50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500,
  2800, 3200, 3900, 4200, 4900, 5700]);

// A trainer's Pokémon against a wild one of the same level.
export const TRAINER_POKEMON_BONUS = 1.2;

// From the lowest: each tier starts at this many times the party's weight.
export const DIFFICULTIES = Object.freeze([
  { id: "trivial", label: "Trivial", from: 0 },
  { id: "easy", label: "Fácil", from: 0.5 },
  { id: "medium", label: "Media", from: 1 },
  { id: "hard", label: "Difícil", from: 1.5 },
  { id: "deadly", label: "Mortal", from: 2.2 }
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
const level = value => clamp(value, 1, 20);
export const pokemonPower = value => POWER_BY_LEVEL[level(value)];

// Each extra rival per party Pokémon adds half: 2 against 1 is ×1.5, 3 against 1 is ×2.
const crowd = (foes, partySize) => 1 + 0.5 * Math.max(0, foes / Math.max(1, partySize) - 1);
const quantity = row => Math.max(0, Number(row.quantity ?? 1) || 0);

/**
 * @param {{ size: number, level: number, team?: number }} party  players, their level, Pokémon per player
 * @param {{ level: number, quantity?: number }[]} rows
 * @param {{ trainers?: number }} [battle]  with trainers: a trainer battle
 */
export function encounterDifficulty(party, rows, { trainers = 0 } = {}) {
  const size = clamp(party?.size, 1, 12);
  const trainerBattle = trainers > 0;
  const partyPower = size * (trainerBattle ? clamp(party?.team, 1, 6) : 1) * pokemonPower(party?.level);
  const weight = rows.reduce((total, row) => total + pokemonPower(row.level) * quantity(row), 0);
  const onField = trainerBattle ? trainers : rows.reduce((total, row) => total + quantity(row), 0);
  const power = Math.round(weight * (trainerBattle ? TRAINER_POKEMON_BONUS : 1) * crowd(onField, size));
  const ratio = power / partyPower;
  const tier = DIFFICULTIES.findLast(entry => ratio >= entry.from) ?? DIFFICULTIES[0];
  return { tier, power, partyPower, ratio };
}

// How far a ratio is from a tier's range (0 inside it): to keep the closest try when none lands in it.
export function distanceToTier(ratio, tierId) {
  const index = DIFFICULTIES.findIndex(entry => entry.id === tierId);
  const from = DIFFICULTIES[index]?.from ?? 0;
  const to = DIFFICULTIES[index + 1]?.from ?? Infinity;
  if (ratio < from) {return from - ratio;}
  return ratio >= to ? ratio - to : 0;
}

/**
 * Rolls a random generator until its result lands in the tier, keeping the closest try if none does.
 * @param {() => any} generate
 * @param {(result: any) => { tier: object, ratio: number }} measure
 */
export function generateForDifficulty(generate, measure, difficulty, attempts = 300) {
  let best = null;
  for (let attempt = 0; attempt < attempts && best?.distance !== 0; attempt++) {
    const result = generate();
    const { tier, ratio } = measure(result);
    const distance = distanceToTier(ratio, difficulty);
    if (!best || distance < best.distance) {best = { result, tier, distance };}
  }
  return best;
}

const pokemonLevel = pokemon => Number(pokemon?.getFlag?.(MODULE_ID, "level")) || 0;
const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

// The players' trainers: how many, their strongest Pokémon's level and their team size, on average (their team,
// or else every Pokémon they own).
export function detectEncounterParty() {
  const trainers = (game.actors?.contents ?? Array.from(game.actors ?? [])).filter(actor => isTrainerActor(actor) && actor.hasPlayerOwner);
  const players = trainers.map(trainer => {
    const team = getTrainerPartyState(trainer).pokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
    const pokemon = team.length ? team : getTrainerOwnedPokemon(trainer);
    return { level: Math.max(0, ...pokemon.map(pokemonLevel)), team: Math.min(6, pokemon.length) };
  }).filter(player => player.level > 0);
  if (!players.length) {return null;}
  return {
    size: players.length,
    level: level(average(players.map(player => player.level))),
    team: clamp(average(players.map(player => player.team)), 1, 6)
  };
}
