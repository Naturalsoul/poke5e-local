import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4 } };
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

test("Versatile picks the latest skill or save of the trainer's Pokémon and adds the die to it", async () => {
  const { latestVersatileMessage, withVersatileDie } = await import("../scripts/trainer-path-actions.mjs");
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
  const diggy = pokemon(flinker, ["ground"]);
  const stranger = pokemon(trainer("hobbyist", 5), ["fire"]);
  globalThis.ChatMessage = { implementation: { getSpeakerActor: speaker => speaker.actor } };
  const roll = (actor, type, rolls = [d20]) => ({ speaker: { actor }, flags: { dnd5e: { roll: { type } } }, rolls });
  const save = roll(diggy, "save");
  const messages = [save, roll(diggy, "attack"), roll(stranger, "skill"), roll(diggy, "skill", [final])];
  assert.equal(latestVersatileMessage(flinker, messages), save, "skips attacks, other trainers and rolls already boosted");
  assert.equal(latestVersatileMessage(flinker, [roll(diggy, "attack")]), null);
});

test("Directed Strike rerolls the latest damage of the trainer's Pokémon once and keeps the higher", async () => {
  const { availableTrainerPathActions, runTrainerPathAction } = await import("../scripts/trainer-path-actions.mjs");
  const tess = trainer("tactician", 5);
  await tess.setFlag(MODULE_ID, "trainerProgression", { ...tess.getFlag(MODULE_ID, "trainerProgression"), resources: { tacticalPoints: { value: 5, max: 5 } } });
  assert.deepEqual(availableTrainerPathActions(tess), ["trainer-directed-strike"]);
  assert.deepEqual(availableTrainerPathActions(trainer("ace-trainer", 5)), ["trainer-battle-dice"]);
  const damage = total => ({ total, formula: "2d6", options: {}, toJSON() { return { ...this }; }, reroll: async () => damage(total + 3) });
  const message = { speaker: { actor: pokemon(tess, ["normal"]) }, flags: { dnd5e: { roll: { type: "damage" } } }, rolls: [damage(5)],
    canUserModify: () => true, update: async changes => { message.rolls = changes.rolls; } };
  const chat = [];
  game.messages = { contents: [message] };
  globalThis.ChatMessage = { implementation: { getSpeakerActor: speaker => speaker.actor, getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
  globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => true } } };
  globalThis.ui = { notifications: { warn: text => chat.push(text) } };
  await runTrainerPathAction("trainer-directed-strike", tess);
  assert.equal(message.rolls[0].total, 8);
  assert.deepEqual(message.rolls[0].options[MODULE_ID].directedStrike, { first: 5, second: 8 });
  assert.match(chat.at(-1), /5 \/ 8 → <strong>8<\/strong>/);
  assert.equal(tess.getFlag(MODULE_ID, "trainerProgression").resources.tacticalPoints.value, 3);
  await runTrainerPathAction("trainer-directed-strike", tess);
  assert.match(chat.at(-1), /No hay una tirada de daño/, "the same roll is not redirected twice");
});

test("Dark Advantage spends 3 Shadow Points and gives advantage to the chosen actor's next roll only", async () => {
  const { registerTrainerPathActions, runTrainerPathAction } = await import("../scripts/trainer-path-actions.mjs");
  registerTrainerPathActions();
  const grunt = trainer("grunt", 5);
  const zubat = pokemon(grunt, ["poison"]);
  await grunt.setFlag(MODULE_ID, "trainerProgression", { ...grunt.getFlag(MODULE_ID, "trainerProgression"), resources: { shadowPoints: { value: 5, max: 5 } } });
  await grunt.setFlag(MODULE_ID, "trainerParty", { pokemonUuids: [zubat.uuid], activePokemonUuids: [zubat.uuid] });
  globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async options => {
    assert.match(options.content, new RegExp(`value="${zubat.uuid}"`));
    return zubat.uuid;
  } } } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async () => {} } };
  await runTrainerPathAction("trainer-dark-advantage", grunt);
  assert.equal(grunt.getFlag(MODULE_ID, "trainerProgression").resources.shadowPoints.value, 2);
  const config = { subject: zubat, rolls: [{}] };
  hooks.handlers("dnd5e.preRollSavingThrow").forEach(handler => handler(config));
  assert.equal(config.rolls[0].options.advantage, true);
  const other = { subject: pokemon(grunt, ["dark"]), rolls: [{}] };
  hooks.handlers("dnd5e.preRollSkill").forEach(handler => handler(other));
  assert.equal(other.rolls[0].options?.advantage, undefined, "only the chosen actor");
  hooks.handlers("dnd5e.rollSavingThrow").forEach(handler => handler([{ options: config.rolls[0].options }], { subject: zubat }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(zubat.getFlag(MODULE_ID, "darkAdvantage") ?? null, null, "used up by the roll");
});

test("Cheerleader bonus targets attacks, damage or AC", async () => {
  const { cheerleaderChanges } = await import("../scripts/trainer-path-actions.mjs");
  assert.deepEqual(cheerleaderChanges("ac", 2), [{ key: "system.attributes.ac.bonus", mode: 2, value: "2", priority: 20 }]);
  assert.deepEqual(cheerleaderChanges("damage", 1).map(change => change.key),
    ["mwak", "rwak", "msak", "rsak"].map(key => `system.bonuses.${key}.damage`));
  assert.ok(cheerleaderChanges("attack", 1).every(change => change.key.endsWith(".attack")));
});

test("Cheerleader ends on the next turn of the trainer's Pokémon, since trainers are not in initiative", async () => {
  const { cheerleaderExpiresOnTurn } = await import("../scripts/trainer-path-actions.mjs");
  const inCombat = ["Actor.a", "Actor.b"];
  assert.equal(cheerleaderExpiresOnTurn("Actor.a", "Actor.b", inCombat), false, "used on A's turn: B's turn keeps it");
  assert.equal(cheerleaderExpiresOnTurn("Actor.a", "Actor.a", inCombat), true, "A's next turn ends it");
  assert.equal(cheerleaderExpiresOnTurn(null, "Actor.b", inCombat), true, "used outside its turns: next Pokémon turn ends it");
  assert.equal(cheerleaderExpiresOnTurn("Actor.gone", "Actor.b", inCombat), true, "A switched out");
});

test("catalog item healing adds Nurse's WIS and offers Tactician's d4s", async () => {
  const { getNurseItemHealingBonus, refundItemHealingBonuses, resolveItemHealingBonuses } = await import("../scripts/trainer-feature-engine.mjs");
  const nurse = trainer("nurse", 2);
  nurse.system.abilities = { wis: { value: 16 } };
  const patient = pokemon(nurse, ["normal"]);
  assert.equal(getNurseItemHealingBonus(nurse), 3);
  assert.equal(getNurseItemHealingBonus(patient), 3, "a berry eaten by the Nurse's Pokémon");
  const low = trainer("nurse", 2);
  low.system.abilities = { wis: { value: 8 } };
  assert.equal(getNurseItemHealingBonus(low), 1, "minimum 1");
  assert.equal(getNurseItemHealingBonus(trainer("ranger", 2)), 0);

  const tactician = trainer("tactician", 3);
  tactician.isOwner = true;
  await tactician.setFlag(MODULE_ID, "trainerProgression", { ...tactician.getFlag(MODULE_ID, "trainerProgression"),
    resources: { tacticalPoints: { value: 3, max: 3, recovery: "long-rest" } } });
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async () => ({ trainerUuid: tactician.uuid, spent: 2 }) } } };
  globalThis.foundry.utils.escapeHTML = value => String(value);
  const result = await resolveItemHealingBonuses(nurse);
  assert.deepEqual(result.parts, ["3[Nurse]", "2d4[Tactician]"]);
  const points = () => tactician.getFlag(MODULE_ID, "trainerProgression").resources.tacticalPoints.value;
  assert.equal(points(), 1);
  await refundItemHealingBonuses(result);
  assert.equal(points(), 3);
  tactician.isOwner = false;
});

function move(actor, flags) {
  const item = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: { kind: "move", ...flags } } });
  item.actor = actor;
  return item;
}

test("Releasing Power gives specialized-type Pokémon their STAB on damaging Moves without it, from level 15", async () => {
  const { getPokemonReleasingPowerBonus } = await import("../scripts/trainer-feature-engine.mjs");
  const syla = trainer("type-master", 15, ["punk", "mystic"]);
  const gengar = pokemon(syla, ["ghost", "poison"]);
  gengar.system.attributes = { prof: 4 };
  // PB 4 + Type Master's +2 for matching both types.
  assert.equal(getPokemonReleasingPowerBonus(gengar, move(gengar, { moveType: "psychic", stab: { eligible: false } })), 6);
  assert.equal(getPokemonReleasingPowerBonus(gengar, move(gengar, { moveType: "ghost", stab: { eligible: true } })), 0, "already has STAB");
  assert.equal(getPokemonReleasingPowerBonus(gengar, move(gengar, { struggle: { noAmplification: true } })), 0);
  const pikachu = pokemon(syla, ["electric"]);
  pikachu.system.attributes = { prof: 4 };
  assert.equal(getPokemonReleasingPowerBonus(pikachu, move(pikachu, { moveType: "normal" })), 0, "not a specialized type");
  const early = trainer("type-master", 14, ["mystic"]);
  const ghost = pokemon(early, ["ghost"]);
  ghost.system.attributes = { prof: 4 };
  assert.equal(getPokemonReleasingPowerBonus(ghost, move(ghost, { moveType: "normal" })), 0);
});

test("Poké Assist gives advantage to Moves of the Partner's types from level 15", async () => {
  const { hasPokeAssistAdvantage } = await import("../scripts/trainer-feature-engine.mjs");
  const ranger = trainer("ranger", 15);
  const partner = pokemon(ranger, ["grass", "poison"]);
  const ally = pokemon(ranger, ["water"]);
  await ranger.setFlag(MODULE_ID, "rangerPartnerUuid", partner.uuid);
  assert.equal(hasPokeAssistAdvantage(ally, move(ally, { moveType: "grass" })), true);
  assert.equal(hasPokeAssistAdvantage(ally, move(ally, { moveType: "water" })), false);
  const item = move(ally, { moveType: "poison" });
  const rollConfig = { parts: [], options: {} };
  hooks.handler("dnd5e.preRollAttack")({ subject: { item }, rolls: [rollConfig] });
  assert.equal(rollConfig.options.advantage, true);
});

test("Multitalented adds the chosen skill proficiency from level 15", () => {
  const base = { pathId: "hobbyist", choices: {}, multitalentedSkill: "ath" };
  assert.deepEqual(trainerPathEffectChanges({ ...base, level: 15 }), [{ key: "system.skills.ath.value", mode: 4, value: "1", priority: 20 }]);
  assert.deepEqual(trainerPathEffectChanges({ ...base, level: 14 }), []);
  assert.deepEqual(trainerPathEffectChanges({ ...base, level: 15, multitalentedSkill: "" }), []);
});
