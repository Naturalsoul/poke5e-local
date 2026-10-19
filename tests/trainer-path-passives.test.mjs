import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
globalThis.game = { actors: [], user: { isGM: true, targets: new Set() }, users: { activeGM: null }, settings: { get: () => "es" } };
globalThis.canvas = { tokens: { placeables: [] } };
const { getGeneralistSkillBonus, getPokemonDrawingPowerBonus, registerTrainerFeatureEngine } = await import("../scripts/trainer-feature-engine.mjs");
const { trainerPathEffectChanges } = await import("../scripts/trainer-path-effects.mjs");
registerTrainerFeatureEngine();

function trainer(pathId, level, specializationIds = []) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${pathId}-${level}-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} }, specializationIds } } } });
  actor.system = { skills: { ath: { value: 0 }, sur: { value: 1 } } };
  game.actors.push(actor);
  return actor;
}

function pokemon(owner, types, skills = { ath: { value: 0 } }) {
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${Math.random()}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "pokemon", trainerOwnerUuid: owner.uuid, types } } });
  actor.system = { skills };
  game.actors.push(actor);
  return actor;
}

test("Drawing Power gives +2 attack to specialized-type Pokémon from Type Master level 5", () => {
  const syla = trainer("type-master", 5, ["punk", "mystic"]);
  assert.equal(getPokemonDrawingPowerBonus(pokemon(syla, ["bug", "poison"])), 2);
  assert.equal(getPokemonDrawingPowerBonus(pokemon(syla, ["electric"])), 0);
  assert.equal(getPokemonDrawingPowerBonus(pokemon(trainer("type-master", 4, ["punk"]), ["poison"])), 0, "not before level 5");
  assert.equal(getPokemonDrawingPowerBonus(pokemon(trainer("ace-trainer", 9, ["punk"]), ["poison"])), 0);
});

test("Drawing Power reaches the attack roll once, next to Ace Trainer's hook", () => {
  const syla = trainer("type-master", 9, ["mystic"]);
  const item = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: { kind: "move" } } });
  item.actor = pokemon(syla, ["ghost"]);
  const rollConfig = { parts: ["@mod"], options: {} };
  const config = { subject: { item }, rolls: [rollConfig] };
  hooks.handler("dnd5e.preRollAttack")(config);
  hooks.handler("dnd5e.preRollAttack")(config);
  assert.deepEqual(rollConfig.parts, ["@mod", "2"]);
});

test("Generalist adds half the trainer's PB to unproficient skill checks of the trainer and its Pokémon", () => {
  const flinker = trainer("hobbyist", 9);
  const diggy = pokemon(flinker, ["ground"], { ath: { value: 0 }, prc: { value: 1 } });
  // Level 9 → PB 4 → +2.
  assert.equal(getGeneralistSkillBonus(flinker, "ath"), 2);
  assert.equal(getGeneralistSkillBonus(flinker, "sur"), 0, "proficient skill");
  assert.equal(getGeneralistSkillBonus(diggy, "ath"), 2);
  assert.equal(getGeneralistSkillBonus(diggy, "prc"), 0);
  assert.equal(getGeneralistSkillBonus(trainer("hobbyist", 8), "ath"), 0, "not before level 9");
  const rolled = { subject: flinker, skill: "ath" };
  hooks.handler("dnd5e.preRollSkill")(rolled, {}, {});
  assert.equal(rolled.bonus, "2");
});

test("Tactical Mastery raises the chosen ability; Storing Power steps the chosen type one level", () => {
  const ace = { pathId: "ace-trainer", level: 9, choices: { tacticalMasteryAbilityId: "dex" } };
  assert.deepEqual(trainerPathEffectChanges(ace), [{ key: "system.abilities.dex.value", mode: 2, value: "1", priority: 20 }]);
  assert.deepEqual(trainerPathEffectChanges({ ...ace, level: 8 }), []);
  const master = { pathId: "type-master", level: 9, choices: { storingPowerResistanceType: "ghost" }, specializedTypes: ["poison", "ghost"],
    pokemonTypes: ["ghost"], inParty: true };
  assert.equal(trainerPathEffectChanges({ ...master, traits: { dv: ["ghost", "dark"], dr: [] } })[0].value, "-ghost");
  assert.deepEqual(trainerPathEffectChanges({ ...master, traits: { dv: [], dr: [] } })[0], { key: "system.traits.dr.value", mode: 2, value: "ghost", priority: 20 });
  assert.deepEqual(trainerPathEffectChanges({ ...master, traits: { dr: ["ghost"] } }), [], "already resistant");
  assert.deepEqual(trainerPathEffectChanges({ ...master, inParty: false, traits: {} }), [], "only carried Pokémon");
  assert.deepEqual(trainerPathEffectChanges({ ...master, pokemonTypes: ["electric"], traits: {} }), []);
});

test("the managed effect is created, updated and removed with the trainer's choices", async () => {
  const { synchronizeTrainerPathEffects } = await import("../scripts/trainer-path-effects.mjs");
  const ace = trainer("ace-trainer", 9);
  await ace.setFlag(MODULE_ID, "trainerProgression", { path: { id: "ace-trainer", choices: { tacticalMasteryAbilityId: "str" } } });
  globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid);
  const mon = pokemon(ace, ["normal"]);
  const effects = new Map();
  mon.effects = { get: id => effects.get(id) };
  mon.createEmbeddedDocuments = async (_type, [source]) => {
    const created = { ...source, update: async changes => Object.assign(created, changes), delete: async () => effects.delete(source._id) };
    effects.set(source._id, created);
  };
  await synchronizeTrainerPathEffects(mon);
  assert.equal(effects.get("P5eTrainerPath00").changes[0].key, "system.abilities.str.value");
  await ace.setFlag(MODULE_ID, "trainerProgression", { path: { id: "ace-trainer", choices: { tacticalMasteryAbilityId: "con" } } });
  await synchronizeTrainerPathEffects(mon);
  assert.equal(effects.size, 1);
  assert.equal(effects.get("P5eTrainerPath00").changes[0].key, "system.abilities.con.value");
  await mon.setFlag(MODULE_ID, "trainerOwnerUuid", null);
  await synchronizeTrainerPathEffects(mon);
  assert.equal(effects.size, 0, "released Pokémon lose it");
});

test("Storing Power shows in the type matchups marked with *", async () => {
  const { applyStoringPowerMatchups } = await import("../scripts/trainer-path-effects.mjs");
  const withEffect = changes => ({ effects: new Map([["P5eTrainerPath00", { disabled: false, changes }]]) });
  const spectreon = { resistances: [{ type: "poison", multiplier: "½" }], weaknesses: [{ type: "ghost", multiplier: "2" }, { type: "dark", multiplier: "2" }] };
  applyStoringPowerMatchups(withEffect([{ key: "system.traits.dv.value", value: "-ghost" }]), spectreon);
  assert.deepEqual(spectreon.weaknesses.map(entry => `${entry.type}×${entry.multiplier}`), ["dark×2", "ghost×1*"]);
  const salandit = { resistances: [], weaknesses: [] };
  applyStoringPowerMatchups(withEffect([{ key: "system.traits.dr.value", value: "ghost" }]), salandit);
  assert.deepEqual(salandit.resistances, [{ type: "ghost", multiplier: "½*", storingPower: true }]);
  const tactical = { resistances: [], weaknesses: [] };
  applyStoringPowerMatchups(withEffect([{ key: "system.abilities.str.value", value: "1" }]), tactical);
  assert.deepEqual(tactical, { resistances: [], weaknesses: [] }, "Tactical Mastery adds no chip");
});
