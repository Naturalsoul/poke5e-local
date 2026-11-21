import { getPokemonExperienceState } from "./pokemon-experience-service.mjs";
import { getPokemonTypes } from "./pokemon-type-service.mjs";
import { isTrainerActor } from "./trainer-service.mjs";
import { calculatePokemonDefenses } from "./types.mjs";
import { getTrainerOwnedPokemon, getTrainerPartyState } from "./trainer-party-service.mjs";

/* ============================================================
 * ENCOUNTER DIFFICULTY
 *
 * poke5e has no difficulty table, and its SR is not a CR: "Pokémon of the same level will be similarly strong".
 * So each Pokémon weighs by its level, on D&D 5e's curve (the DMG's Medium XP threshold per character level), and:
 * - the party is one Pokémon per player, at the level of their strongest; in trainer battles, their whole team;
 * - a wild encounter is its Pokémon's weight, times D&D's crowd multiplier when they outnumber the party;
 * - a trainer battle is every Pokémon of every team (each one must be beaten), stronger than wild ones (poke5e
 *   gives them a feat, a specialization and better stats), times (rival Pokémon on the field ÷ the players' on the
 *   field)^0.6 up to even and ^0.7 past it (see fieldWeight);
 * - in trainer battles, each rival Pokémon also weighs by its types against the players' team (typeMatchup) and by its
 *   species' SR against theirs (speciesWeight): an evolved rival hits harder than its pre-evolution at the same level;
 * - an even wild fight is Medium, an even trainer battle Hard; Easy, Hard and Deadly follow D&D's thresholds (½, 1½
 *   and 2.2 times Medium), and Extreme (3) caps Deadly.
 * Checked against simulated fights with the players' own Pokémon (poke5e's action economy, statuses, berries): at 1
 * they lose about a quarter of their HP, at 1.5 half (and win 9 in 10), at 2.2 three quarters (win 6 in 10), past 3
 * they win under half.
 * Trainer battles aren't chosen by difficulty but by the rival's rank, as in the games (TRAINER_RANKS); the
 * difficulty is what the planner shows of them.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const POWER_BY_LEVEL = Object.freeze([0, 50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500,
  2800, 3200, 3900, 4200, 4900, 5700]);

// A trainer's Pokémon against a wild one of the same level.
export const TRAINER_POKEMON_BONUS = 1.2;

// An even trainer battle lands in Hard (from 1.5) rather than Medium.
const EVEN_TRAINER_BATTLE = 1.5;

/*
 * What the rivals' extras are worth, as a guess to tune at the table: +1 to every score is about +5% to hit, damage,
 * DCs and HP each; a super effective Move doubles one attack in four; an item or berry is a small edge.
 */
export function boostMultiplier({ statBonus = 0, coverage = false, items = false, bestMoves = false, tmMoves = false } = {}) {
  return (1 + 0.1 * Math.max(0, Math.min(2, Number(statBonus) || 0))) * (coverage ? 1.1 : 1) * (items ? 1.05 : 1) *
    // The team's Moves by role (control, setup, coverage) weigh about ×1.45 in simulated fights; TMs, harder still.
    (bestMoves ? 1.45 : 1) * (tmMoves ? 1.1 : 1);
}

// From the lowest: each tier starts at this many times the party's weight.
export const DIFFICULTIES = Object.freeze([
  { id: "trivial", label: "Trivial", from: 0 },
  { id: "easy", label: "Fácil", from: 0.5 },
  { id: "medium", label: "Media", from: 1 },
  { id: "hard", label: "Difícil", from: 1.5 },
  { id: "deadly", label: "Mortal", from: 2.2 },
  // Past 3 the players win under half of the fights: the ceiling of Deadly, which ranks don't aim at.
  { id: "extreme", label: "Extrema", from: 3 }
]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.trunc(Number(value)) || min));
const level = value => clamp(value, 1, 20);
export const pokemonPower = value => POWER_BY_LEVEL[level(value)];

// Each extra rival per party Pokémon adds half: 2 against 1 is ×1.5, 3 against 1 is ×2.
const crowd = (foes, partySize) => 1 + 0.5 * Math.max(0, foes / Math.max(1, partySize) - 1);
// Rival Pokémon on the field against the players': past even, each extra one costs them more (fitted on simulated fights).
export const fieldWeight = (onField, size) => { const share = onField / size; return share ** (share > 1 ? 0.7 : 0.6); };
const quantity = row => Math.max(0, Number(row.quantity ?? 1) || 0);

// A rival's species SR against the players' mean, ^0.35 between ×0.5 and ×2 (fitted on simulated fights); 1 when unknown.
const SPECIES_EXPONENT = 0.35;
export function speciesWeight(sr, partySr) {
  const rival = Number(sr); const players = Number(partySr);
  return rival > 0 && players > 0 ? Math.min(2, Math.max(0.5, (rival / players) ** SPECIES_EXPONENT)) : 1;
}
const meanSr = pokemon => {
  const known = (pokemon ?? []).map(each => Number(each.sr)).filter(sr => sr > 0);
  return known.length ? known.reduce((sum, sr) => sum + sr, 0) / known.length : 0;
};

/*
 * How a rival Pokémon fares by type against the players' team: its types (STAB) against each of their Pokémon, and
 * their damaging Moves' types (or else their own) against it. Each side's best multiplier, averaged over the team, as
 * (offense ÷ defense)^0.5 between ×0.5 and ×2: the players pick targets and Moves, so a matchup tilts a fight
 * without deciding it. 1 when either side's types are unknown.
 */
export function typeMatchup(rivalTypes = [], partyPokemon = []) {
  if (!rivalTypes.length || !partyPokemon.length) {return 1;}
  const rivalDefense = calculatePokemonDefenses(rivalTypes).multipliers;
  const best = (types, multipliers) => Math.max(...types.map(type => multipliers[type] ?? 1));
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const offense = mean(partyPokemon.map(pokemon => best(rivalTypes, calculatePokemonDefenses(pokemon.types).multipliers)));
  const defense = mean(partyPokemon.map(pokemon => best(pokemon.moveTypes?.length ? pokemon.moveTypes : pokemon.types, rivalDefense)));
  return Math.min(2, Math.max(0.5, Math.sqrt(Math.max(0.25, offense) / Math.max(0.25, defense))));
}

/**
 * @param {{ size: number, level: number, team?: number }} party  players (one Pokémon each on the field), their
 *   level, Pokémon per player
 *   and, from their trainers, their Pokémon (pokemon: [{ types, moveTypes, sr }])
 * @param {{ level: number, quantity?: number, types?: string[], sr?: number }[]} rows
 * @param {{ onField?: number, boosts?: object }} [battle]  with the rival Pokémon on the field at once: a trainer
 *   battle, and their extras (see boostMultiplier)
 */
export function encounterDifficulty(party, rows, { onField = 0, boosts } = {}) {
  const size = clamp(party?.size, 1, 12);
  const trainerBattle = onField > 0;
  const partyPower = size * (trainerBattle ? clamp(party?.team, 1, 6) : 1) * pokemonPower(party?.level);
  const weight = rows.reduce((total, row) => total + pokemonPower(row.level) * quantity(row), 0);
  const partySr = meanSr(party?.pokemon);
  const matched = trainerBattle
    ? rows.reduce((total, row) => total + pokemonPower(row.level) * quantity(row) * typeMatchup(row.types, party?.pokemon) *
      speciesWeight(row.sr, partySr), 0)
    : weight;
  const power = Math.round(trainerBattle
    ? matched * TRAINER_POKEMON_BONUS * boostMultiplier(boosts) * fieldWeight(onField, size) * EVEN_TRAINER_BATTLE
    : weight * crowd(rows.reduce((total, row) => total + quantity(row), 0), size));
  const ratio = power / partyPower;
  const tier = DIFFICULTIES.findLast(entry => ratio >= entry.from) ?? DIFFICULTIES[0];
  const levelGap = rows.length ? rows.reduce((total, row) => total + level(row.level), 0) / rows.length - level(party?.level) : 0;
  const win = trainerBattle ? rivalWinChance(ratio, levelGap) : null;
  return { tier, power, partyPower, ratio, win, weight, matchup: weight ? matched / weight : 1 };
}

/*
 * Rival ranks, after the games. A rank sets the style: levels around the party's (from–to; the boss's ace apart), one
 * type or not, extras, and what it aims at: winChance, the rival's chance to win in % (the boss picks its own), else a tier. How many Pokémon it brings and sends out at once (within its
 * ranges) adapts to the party, since the games tune a rival for one player and a table has several: a boss rank adds
 * gym helpers only when alone it can't reach its difficulty. Levels stay near the party's, so a campaign that levels
 * by XP doesn't inflate. fieldCap: rolled on "auto", all its trainers send out at most the players' Pokémon on the
 * field plus this many, since outnumbering the party weighs the most (fieldWeight). actions: how many actions each of
 * its Pokémon takes on its turn, like a D&D boss; an extra action weighs a bit more than one more Pokémon on the field.
 */
export const TRAINER_RANKS = Object.freeze([
  { id: "route", label: "Entrenador de ruta", target: "easy", levels: [-3, -1], trainers: [1, 6], team: [1, 3],
    onField: [1, 2], extras: {} },
  { id: "veteran", label: "Entrenador Veterano", winChance: 20, levels: [-1, 0], trainers: [1, 4], team: [2, 5],
    onField: [1, 3], fieldCap: 3, extras: { statBonus: 1, coverage: true, bestMoves: true } },
  { id: "ace-trainer", label: "Entrenador Guay", winChance: 40, levels: [-1, 1], ace: [1, 1], trainers: [1, 4], team: [2, 5],
    onField: [1, 3], fieldCap: 2, extras: { statBonus: 1, coverage: true, items: true, bestMoves: true } },
  { id: "rival", label: "Rival", winChance: 50, levels: [-1, 1], ace: [1, 2], trainers: [1, 4], team: [3, 6],
    onField: [1, 6], fieldCap: 2, extras: { statBonus: 2, coverage: true, items: true, bestMoves: true } },
  { id: "gym-leader", label: "Líder de Gimnasio", winChance: 60, levels: [-1, 0], ace: [1, 1], trainers: [1, 4],
    team: [1, 6], onField: [1, 6], fieldCap: 2, monotype: true, extras: { statBonus: 1, coverage: true, items: true, bestMoves: true } },
  { id: "elite-four", label: "Alto Mando", winChance: 75, levels: [0, 1], ace: [1, 1], trainers: [1, 4], team: [2, 6],
    onField: [1, 6], fieldCap: 1, monotype: true, extras: { statBonus: 2, coverage: true, items: true, bestMoves: true } },
  { id: "champion", label: "Campeón", winChance: 80, levels: [0, 1], ace: [1, 2], trainers: [1, 4], team: [3, 6],
    onField: [1, 6], fieldCap: 2, extras: { statBonus: 2, coverage: true, items: true, bestMoves: true } },
  { id: "legend", label: "Leyenda", winChance: 90, levels: [1, 2], ace: [2, 3], trainers: [1, 4], team: [4, 6],
    onField: [1, 6], fieldCap: 3, extras: { statBonus: 2, coverage: true, items: true, bestMoves: true, tmMoves: true } },
  // The whole party against one trainer: up to 12 Pokémon, up to 6 on the field, more than one action each.
  { id: "boss", label: "Entrenador boss", target: "deadly", levels: [0, 1], ace: [1, 2], trainers: [1, 1], team: [6, 12],
    onField: [1, 6], actions: [1, 3], extras: { statBonus: 2, coverage: true, items: true, bestMoves: true } },
  { id: "totem", label: "Pokémon Dominante", target: "hard", levels: [-1, 0], ace: [1, 2], trainers: [1, 4], team: [1, 6],
    onField: [1, 6], extras: { statBonus: 2, items: true } }
]);

// A rival trainer's team: the games' 6, or up to 12 for a boss.
export const MAX_TRAINER_TEAM = 12;

// What a trainer battle weighs on the field: each trainer's Pokémon out at once (no more than it has) times their actions.
// An extra action weighs 1.25 Pokémon on the field: at that weight a Deadly boss and a Deadly Champion win as often.
const ACTION_WEIGHT = 1.25;
export const fieldedActions = (trainers, countOf) => Math.max(1, trainers.reduce((total, trainer) =>
  total + Math.min(Number(trainer.onField) || 1, countOf(trainer)) * (1 + ACTION_WEIGHT * ((Number(trainer.actions) || 1) - 1)), 0));

/*
 * A rival trainer's chance to win, fitted on 640 simulated battles of every rank with Moves de equipo against the
 * players' own Pokémon played at their best (targets by threat, status Moves, matchup switches and leads), with their
 * trainers' features and bags (an item takes the trainer's action; a trainer with no Pokémon standing uses one each
 * round) and rivals evolved to their level: logistic in ln(ratio) and in the rivals' mean level over the party's,
 * since the ratio overrates levels: at the same ratio a lower-level team wins more often.
 */
const WIN_CURVE = Object.freeze({ a: -8.95, b: 8.02, level: -0.97 });
export const BOSS_WIN_CHANCES = Object.freeze([60, 70, 80, 90]);
export const rivalWinChance = (ratio, levelGap = 0) =>
  1 / (1 + Math.exp(-(WIN_CURVE.a + WIN_CURVE.b * Math.log(Math.max(0.01, ratio)) + WIN_CURVE.level * levelGap)));
// Within 5 points of the chance asked (in %).
export const winRange = percent => ({ winFrom: percent / 100 - 0.05, winTo: Math.min(0.99, percent / 100 + 0.05) });

export const getTrainerRank = id => TRAINER_RANKS.find(rank => rank.id === id) ?? TRAINER_RANKS[0];

// A rank's levels for a party: { min, max, ace: [min, max] or null }, within 1 and 20.
export function rankLevels(partyLevel, rank) {
  const at = offset => level(level(partyLevel) + offset);
  const max = at(rank.levels[1]);
  return { min: Math.min(max, at(rank.levels[0])), max, ace: rank.ace ? rank.ace.map(at) : null };
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
// difficulty: a tier id, or a ratio range { from, to }.
export function generateForDifficulty(generate, measure, difficulty, attempts = 300) {
  let best = null;
  for (let attempt = 0; attempt < attempts && best?.distance !== 0; attempt++) {
    const result = generate();
    const { tier, ratio, win } = measure(result);
    let distance = distanceToTier(ratio, difficulty);
    if (difficulty?.winFrom !== undefined) {distance = Math.max(0, difficulty.winFrom - win, win - difficulty.winTo);}
    else if (typeof difficulty === "object") {distance = Math.max(0, difficulty.from - ratio, ratio - difficulty.to);}
    if (!best || distance < best.distance) {best = { result, tier, ratio, win, distance };}
  }
  return best;
}

export const pokemonLevel = pokemon => Number(pokemon?.getFlag?.(MODULE_ID, "level")) || 0;
const average = values => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

// The types of the Moves on its sheet that deal damage.
const damagingMoveTypes = pokemon => [...new Set((pokemon.items?.contents ?? Array.from(pokemon.items ?? []))
  .filter(item => item.getFlag?.(MODULE_ID, "kind") === "move" && item.getFlag(MODULE_ID, "moveDefinition")?.damage)
  .map(item => item.getFlag(MODULE_ID, "moveType"))
  .filter(Boolean))];

// The players' strongest Pokémon, with its XP: { name, level, xp }.
const strongestOf = candidates => {
  const pokemon = candidates.reduce((best, each) => (pokemonLevel(each) > pokemonLevel(best ?? {}) ? each : best), null);
  if (!pokemon) {return null;}
  let xp = 0;
  try {
    xp = getPokemonExperienceState(pokemon).total;
  } catch {
    xp = 0;
  }
  return { name: pokemon.name, level: pokemonLevel(pokemon), xp };
};

const typesOf = pokemon => {
  try {
    return getPokemonTypes(pokemon);
  } catch {
    return [];
  }
};

// The players' trainers and their Pokémon: their team, or else every Pokémon they own.
export function playerTeams() {
  const trainers = (game.actors?.contents ?? Array.from(game.actors ?? [])).filter(actor => isTrainerActor(actor) && actor.hasPlayerOwner);
  return trainers.map(trainer => {
    const team = getTrainerPartyState(trainer).pokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
    return { trainer, pokemon: team.length ? team : getTrainerOwnedPokemon(trainer) };
  });
}

// Each value once, the most repeated first.
const byFrequency = values => {
  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.keys()].sort((left, right) => counts.get(right) - counts.get(left));
};

// The players' trainers: how many, their strongest Pokémon's level and their team size, on average (their team,
// or else every Pokémon they own), and the attacking types super effective against any of those Pokémon, those that
// hit the most of them first.
export function detectEncounterParty() {
  const players = playerTeams().map(({ pokemon }) => {
    const matchups = pokemon.map(each => ({ types: typesOf(each), moveTypes: damagingMoveTypes(each), sr: Number(each.getFlag?.(MODULE_ID, "sr")) || 0 }));
    const weakTo = matchups.flatMap(each => calculatePokemonDefenses(each.types).vulnerabilities);
    return { level: Math.max(0, ...pokemon.map(pokemonLevel)), team: Math.min(6, pokemon.length), weakTo, matchups,
      strongest: pokemon.reduce((best, each) => (pokemonLevel(each) > pokemonLevel(best ?? {}) ? each : best), null) };
  }).filter(player => player.level > 0);
  if (!players.length) {return null;}
  return {
    size: players.length,
    level: level(average(players.map(player => player.level))),
    team: clamp(average(players.map(player => player.team)), 1, 6),
    weakTo: byFrequency(players.flatMap(player => player.weakTo)),
    pokemon: players.flatMap(player => player.matchups),
    strongest: strongestOf(players.map(player => player.strongest))
  };
}
