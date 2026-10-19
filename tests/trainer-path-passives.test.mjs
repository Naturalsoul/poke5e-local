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

test("path feature resources: Skill Dice from WIS, Cheerleader once per short rest", async () => {
  const { ensureTrainerPathFeatureResources, resetTrainerShortRestResources } = await import("../scripts/trainer-progression-service.mjs");
  const flinker = trainer("hobbyist", 5);
  flinker.system.abilities = { wis: { value: 14 } };
  await ensureTrainerPathFeatureResources(flinker);
  assert.deepEqual(flinker.getFlag(MODULE_ID, "trainerProgression").resources.skillDice, { value: 3, max: 3, recovery: "long-rest" });
  const mentor = trainer("poke-mentor", 9);
  mentor.system.abilities = {};
  await ensureTrainerPathFeatureResources(mentor);
  const progression = mentor.getFlag(MODULE_ID, "trainerProgression");
  await mentor.setFlag(MODULE_ID, "trainerProgression", { ...progression, resources: { cheerleaderUses: { value: 0, max: 1, recovery: "short-rest" } } });
  await resetTrainerShortRestResources(mentor);
  assert.equal(mentor.getFlag(MODULE_ID, "trainerProgression").resources.cheerleaderUses.value, 1);
});

test("Partners adds the trainer's WIS mod to the partner's skills, and to its attacks only against wild Pokémon", async () => {
  const ranger = trainer("ranger", 9);
  ranger.system.abilities = { wis: { value: 16 } };
  const partner = pokemon(ranger, ["grass"]);
  const other = pokemon(ranger, ["fire"]);
  await ranger.setFlag(MODULE_ID, "rangerPartnerUuid", partner.uuid);
  const skill = { subject: partner, skill: "ath" };
  hooks.handler("dnd5e.preRollSkill")(skill, {}, {});
  assert.equal(skill.bonus, "3");
  const otherSkill = { subject: other, skill: "ath" };
  hooks.handler("dnd5e.preRollSkill")(otherSkill, {}, {});
  assert.equal(otherSkill.bonus, undefined);
  const attack = () => {
    const item = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: { kind: "move" } } });
    item.actor = partner;
    const rollConfig = { parts: [], options: {} };
    hooks.handler("dnd5e.preRollAttack")({ subject: { item }, rolls: [rollConfig] });
    return rollConfig.parts;
  };
  const wild = createFlagDocument({ uuid: "Actor.wild", documentName: "Actor", flags: { [MODULE_ID]: { kind: "pokemon" } } });
  game.user.targets = new Set([{ actor: wild }]);
  assert.deepEqual(attack(), ["3"]);
  game.user.targets = new Set([{ actor: other }]);
  assert.deepEqual(attack(), [], "not against a trainer's Pokémon");
  game.user.targets = new Set();
});

test("Versatile replays the save without a message and posts it with the skill die added", async () => {
  const { withVersatileDie } = await import("../scripts/trainer-feature-engine.mjs");
  class FakeRoll {
    constructor(data) { Object.assign(this, data); }
    static fromData(data) { return new FakeRoll(data); }
    toJSON() { return { ...this }; }
  }
  const d20 = new FakeRoll({ formula: "1d20 + 2", total: 12, terms: [{ class: "D20Die" }], options: {} });
  const die = { formula: "1d6", total: 4, terms: [{ toJSON: () => ({ class: "Die", faces: 6, results: [{ result: 4 }] }) }] };
  const final = withVersatileDie(d20, die);
  assert.equal(final.total, 16);
  assert.equal(final.terms.at(-1).options.flavor, "Versatile");
  assert.equal(final.options[MODULE_ID].versatile, 4);

  const flinker = trainer("hobbyist", 5);
  flinker.isOwner = true;
  flinker.system.abilities = { wis: { value: 10 } };
  const { ensureTrainerPathFeatureResources } = await import("../scripts/trainer-progression-service.mjs");
  await ensureTrainerPathFeatureResources(flinker);
  const diggy = pokemon(flinker, ["ground"]);
  const replays = [];
  diggy.rollSavingThrow = async (config, _dialog, message) => {
    replays.push({ config, message });
    message.data = { speaker: "Diggy" };
    return [d20];
  };
  globalThis.Roll = class { constructor() {} async evaluate() { return die; } };
  globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => true } } };
  globalThis.foundry.utils.escapeHTML = value => String(value);
  const posted = new Promise(resolve => {
    globalThis.ChatMessage = { implementation: { create: async data => resolve(data) } };
  });
  assert.equal(hooks.handler("dnd5e.preRollSavingThrow")({ subject: diggy, ability: "dex" }, {}, {}), false);
  const message = await posted;
  assert.equal(replays[0].message.create, false);
  assert.equal(message.speaker, "Diggy");
  assert.equal(message.rolls[0].total, 16);
  assert.equal(flinker.getFlag(MODULE_ID, "trainerProgression").resources.skillDice.value, 0);
});

test("Cheerleader bonus targets attacks, damage or AC", async () => {
  const { cheerleaderChanges } = await import("../scripts/trainer-path-actions.mjs");
  assert.deepEqual(cheerleaderChanges("ac", 2), [{ key: "system.attributes.ac.bonus", mode: 2, value: "2", priority: 20 }]);
  assert.deepEqual(cheerleaderChanges("damage", 1).map(change => change.key),
    ["mwak", "rwak", "msak", "rsak"].map(key => `system.bonuses.${key}.damage`));
  assert.ok(cheerleaderChanges("attack", 1).every(change => change.key.endsWith(".attack")));
});
