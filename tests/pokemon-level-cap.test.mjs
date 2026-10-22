import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();

const { getPokemonExperienceState, getPokemonExperienceThreshold, setPokemonExperience } =
  await import("../scripts/pokemon-experience-service.mjs");
const { canTrainerControlPokemon, getTrainerControlLevel, assertTrainerCanControlPokemon } =
  await import("../scripts/trainer-control-service.mjs");

const M = "poke5e-local";
const trainer = (level, path = null) => createFlagDocument({
  uuid: `Actor.trainer${level}${path ?? ""}`,
  name: "Seraphina",
  flags: { [M]: { kind: "trainer", trainerLevel: level, ...(path ? { trainerProgression: { path: { id: path } } } : {}) } }
});
const pokemon = (level, owner, xp) => createFlagDocument({
  uuid: `Actor.pokemon${level}`,
  name: "Goomy",
  flags: { [M]: { kind: "pokemon", level, trainerOwnerUuid: owner?.uuid,
    ...(xp == null ? {} : { pokemonProgression: { experience: { version: 1, total: xp } } }) } }
});
const world = new Map();
globalThis.fromUuidSync = uuid => world.get(uuid) ?? null;
const register = (...docs) => docs.forEach(doc => world.set(doc.uuid, doc));

test("a Pokémon at its trainer's level can't be ready to level, whatever its XP", () => {
  const seraphina = trainer(9);
  register(seraphina);
  const goomy = pokemon(9, seraphina, getPokemonExperienceThreshold(10));
  const state = getPokemonExperienceState(goomy);
  assert.equal(state.levelCap, 9);
  assert.equal(state.atLevelCap, true);
  assert.equal(state.readyToLevel, false);
  assert.equal(getPokemonExperienceState(pokemon(8, seraphina, getPokemonExperienceThreshold(9))).readyToLevel, true);
});

test("XP past the next threshold of the trainer's level is lost", async () => {
  const seraphina = trainer(9);
  register(seraphina);
  const goomy = pokemon(8, seraphina, getPokemonExperienceThreshold(8));
  const state = await setPokemonExperience(goomy, getPokemonExperienceThreshold(12));
  assert.equal(state.total, getPokemonExperienceThreshold(10));
});

test("wild and rival Pokémon (no trainer) have no cap", async () => {
  const wild = pokemon(5, null, getPokemonExperienceThreshold(5));
  assert.equal(getPokemonExperienceState(wild).levelCap, null);
  const state = await setPokemonExperience(wild, getPokemonExperienceThreshold(9));
  assert.equal(state.total, getPokemonExperienceThreshold(9));
  assert.equal(state.readyToLevel, true);
});

test("a trainer controls Pokémon up to their level; a Guru, one more", () => {
  const seraphina = trainer(9);
  const guru = trainer(9, "guru");
  assert.equal(getTrainerControlLevel(seraphina), 9);
  assert.equal(getTrainerControlLevel(guru), 10);
  assert.equal(canTrainerControlPokemon(seraphina, pokemon(9, seraphina)), true);
  assert.equal(canTrainerControlPokemon(seraphina, pokemon(10, seraphina)), false);
  assert.equal(canTrainerControlPokemon(guru, pokemon(10, guru)), true);
  assert.throws(() => assertTrainerCanControlPokemon(seraphina, pokemon(10, seraphina)), /Nv\. 10 .* hasta Nv\. 9/);
});
