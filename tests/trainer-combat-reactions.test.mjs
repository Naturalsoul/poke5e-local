import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const gm = { id: "gm", isGM: true, active: true };
globalThis.game = { actors: [], user: gm, settings: { get: () => "es" }, combat: null,
  users: { find: predicate => [gm].find(predicate), activeGM: gm }, socket: { on() {}, emit() {} } };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
const prompts = [];
globalThis.foundry.applications = { api: { DialogV2: { wait: async options => {
  prompts.push(options);
  return prompts.answer;
} } } };
const chat = [];
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };

class FakeRoll {
  constructor(data) { Object.assign(this, data); }
  static fromData(data) { return new FakeRoll(data); }
  toJSON() { return { ...this, parent: undefined }; }
  get isSuccess() { return Number(this.total) >= this.options.target; }
}
globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { return { formula: this.formula, total: 4, terms: [{ toJSON: () => ({ class: "Die", faces: 6, results: [{ result: 4 }] }) }] }; } };

const { registerAttackOutcomeEngine, subscribeAttackOutcome } = await import("../scripts/attack-outcome-engine.mjs");
const combat = await import("../scripts/trainer-combat-reactions.mjs");
registerAttackOutcomeEngine();
combat.registerTrainerCombatReactions();

function trainer(pathId, level, resources) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} }, resources } } } });
  actor.system = { abilities: {} };
  game.actors.push(actor);
  return actor;
}

function pokemon(owner) {
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "pokemon", ...(owner ? { trainerOwnerUuid: owner.uuid } : {}) } } });
  actor.name = `Pokémon ${game.actors.length}`;
  game.actors.push(actor);
  return actor;
}

function attack({ total, ac, target, natural = 10 }) {
  const message = { documentName: "ChatMessage", id: `m${chat.length}`, rolls: [], update: async changes => { message.rolls = changes.rolls.map(FakeRoll.fromData); } };
  const roll = new FakeRoll({ total, formula: "1d20 + 5", terms: [], options: { target: ac, poke5eTargetActorUuid: target?.uuid },
    isCritical: natural === 20, isFumble: natural === 1, d20: { results: [{ active: true, result: natural }] }, parent: message });
  message.rolls = [roll];
  return roll;
}

const points = (owner, id) => owner.getFlag(MODULE_ID, "trainerProgression").resources[id].value;
const moveActivity = actor => ({ actor, id: "a1", item: { uuid: "Item.tackle", getFlag: (_module, key) => ({ kind: "move", sourceId: "tackle" })[key] } });

async function rollAttack(roll, attacker) {
  const outcomes = [];
  const unsubscribe = subscribeAttackOutcome(outcome => outcomes.push(outcome));
  hooks.handler("dnd5e.rollAttack")([roll], { subject: moveActivity(attacker) });
  await new Promise(resolve => setTimeout(resolve, 20));
  unsubscribe();
  return outcomes;
}

test("without a possible reaction the attack outcome is dispatched at once, as before", () => {
  const outcomes = [];
  const unsubscribe = subscribeAttackOutcome(outcome => outcomes.push(outcome));
  hooks.handler("dnd5e.rollAttack")([attack({ total: 15, ac: 12, target: pokemon(null) })], { subject: moveActivity(pokemon(null)) });
  unsubscribe();
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].hit, true);
});

test("Sabotage turns a hit into a miss before status-on-hit and other consumers see it", async () => {
  const grunt = trainer("grunt", 5, { shadowPoints: { value: 5, max: 5 } });
  const target = pokemon(grunt);
  prompts.answer = { points: "4" };
  const roll = attack({ total: 15, ac: 12, target });
  const outcomes = await rollAttack(roll, pokemon(null));
  assert.match(prompts.at(-1).content, /min="4" max="5"/, "minimum to miss is 15 − 12 + 1");
  assert.deepEqual(outcomes.map(outcome => outcome.hit), [false]);
  assert.equal(roll.parent.rolls[0].options.target, 16);
  assert.equal(points(grunt, "shadowPoints"), 1);
  assert.match(chat.at(-1), /Sabotage.*CA 12 → 16/);
});

test("an answer outside the allowed range is ignored and spends nothing", async () => {
  const grunt = trainer("grunt", 5, { shadowPoints: { value: 5, max: 5 } });
  prompts.answer = { points: "2" };
  const outcomes = await rollAttack(attack({ total: 15, ac: 12, target: pokemon(grunt) }), pokemon(null));
  assert.deepEqual(outcomes.map(outcome => outcome.hit), [true]);
  assert.equal(points(grunt, "shadowPoints"), 5);
});

test("Raise Your Defenses is offered only from Tactician 9 and when 5 points are enough", () => {
  const raise = combat.defenseOffer(combat.DEFENSES[1]);
  const tactician = trainer("tactician", 9, { tacticalPoints: { value: 9, max: 9 } });
  const target = pokemon(tactician);
  assert.ok(raise(attack({ total: 16, ac: 12, target })), "5 points make it miss");
  assert.equal(raise(attack({ total: 17, ac: 12, target })), null, "6 would be needed");
  assert.equal(raise(attack({ total: 14, ac: 12, target, natural: 20 })), null, "a critical always hits");
  assert.equal(raise(attack({ total: 14, ac: 12, target: pokemon(trainer("tactician", 8, { tacticalPoints: { value: 8, max: 8 } })) })), null);
});

test("a Battle Die is offered on a miss it can turn into a hit and the die joins the attack", async () => {
  const ace = trainer("ace-trainer", 5, { battleDice: { value: 2, max: 2 } });
  const attacker = pokemon(ace);
  assert.equal(combat.battleDieOffer(attack({ total: 5, ac: 12 }), moveActivity(attacker)), null, "a d6 cannot cover 7");
  prompts.answer = {};
  const roll = attack({ total: 9, ac: 12 });
  const outcomes = await rollAttack(roll, attacker);
  assert.deepEqual(outcomes.map(outcome => outcome.hit), [true], "9 + 4 hits AC 12");
  assert.equal(roll.parent.rolls[0].total, 13);
  assert.match(roll.parent.rolls[0].formula, /\+ 1d6\[Battle Die\]/);
  assert.equal(points(ace, "battleDice"), 1);
  assert.deepEqual([5, 9, 15].map(level => combat.battleDieFaces(trainer("ace-trainer", level, {}))), [6, 8, 10]);
});

test("saves: Raise Your Defenses passes a failed save of its Pokémon; Not This Time fails an opponent's", () => {
  const tactician = trainer("tactician", 15, { tacticalPoints: { value: 15, max: 15 } });
  const own = pokemon(tactician);
  const opponent = pokemon(null);
  const save = total => new FakeRoll({ total, formula: "1d20 + 2", terms: [], options: { target: 14 } });
  assert.ok(combat.saveDefenseOffer(save(10), { actor: own, dc: 14 }), "needs 4");
  assert.equal(combat.saveDefenseOffer(save(8), { actor: own, dc: 14 }), null, "needs 6");
  assert.equal(combat.saveDefenseOffer(save(10), { actor: opponent, dc: 14 }), null);
  assert.ok(combat.notThisTimeOffer(save(16), { actor: opponent, dc: 14, moveUser: own }), "needs 3");
  assert.equal(combat.notThisTimeOffer(save(16), { actor: pokemon(tactician), dc: 14, moveUser: own }), null, "not against its own team");
  assert.equal(combat.notThisTimeOffer(save(13), { actor: opponent, dc: 14, moveUser: own }), null, "already failed");
  const added = combat.rollWith(save(10), { bonus: 4, label: "Raise Your Defenses" });
  assert.equal(added.total, 14);
  assert.equal(added.isSuccess, true);
});

test("Nefarious Stagger turns the Flinched a Grunt 15's Pokémon inflicts into Stunned, keeping its duration", async () => {
  const grunt = trainer("grunt", 15, { shadowPoints: { value: 3, max: 15 } });
  const attacker = pokemon(grunt);
  const target = pokemon(null);
  const log = [];
  const effects = new Map();
  target.effects = { get: id => effects.get(id), find: predicate => [...effects.values()].find(predicate) };
  target.deleteEmbeddedDocuments = async (_type, ids) => { ids.forEach(id => effects.delete(id)); log.push(["delete", ...ids]); };
  target.toggleStatusEffect = async id => ({ update: async changes => log.push(["stunned", id, changes[`flags.${MODULE_ID}`]]) });
  const flinched = { id: "fx", parent: target, origin: attacker.uuid, flags: { [MODULE_ID]: { status: "flinched" } }, statuses: new Set(["poke5e-flinched"]) };
  effects.set("fx", flinched);
  assert.equal(combat.staggerOffer(flinched, "someone-else"), null, "only the creating client offers it");
  assert.equal(combat.staggerOffer({ ...flinched, parent: pokemon(grunt) }, "gm"), null, "not on its own team");
  prompts.answer = {};
  await combat.staggerOffer(flinched, "gm")();
  assert.deepEqual(log, [["delete", "fx"], ["stunned", "stunned", { expireAtEndOfNextTurn: true, nextTurnStarted: false, nefariousStagger: grunt.uuid }]]);
  assert.equal(points(grunt, "shadowPoints"), 1);
  assert.equal(combat.staggerOffer({ ...flinched, id: "fx2" }, "gm"), null, "1 Shadow Point is not enough");
});

test("Sinister Dodge: a Grunt 9's Pokémon with 4 Shadow Points resists the Move's damage one step more", () => {
  globalThis.CONFIG = { DND5E: { healingTypes: { healing: {}, temphp: {} } } };
  const grunt = trainer("grunt", 9, { shadowPoints: { value: 4, max: 9 } });
  const own = pokemon(grunt);
  const move = { actor: pokemon(null), item: { getFlag: (_module, key) => ({ kind: "move" })[key] } };
  assert.deepEqual(combat.dodgeCandidates(move, [own, pokemon(null), pokemon(trainer("grunt", 8, { shadowPoints: { value: 8, max: 8 } }))]), [own]);
  assert.deepEqual(combat.dodgeCandidates({ ...move, item: { getFlag: () => "item" } }, [own]), [], "only Moves");

  const message = { getFlag: (_module, key) => (key === "sinisterDodge" ? [own.uuid] : null) };
  const damages = Object.assign([
    { type: "fire", value: 12, active: { type: { vulnerability: true } } },
    { type: "water", value: 5, active: {} },
    { type: "grass", value: 3, active: { type: { resistance: true } } },
    { type: "healing", value: -4, active: {} }
  ], { amount: 16 });
  combat.applySinisterDodge(pokemon(null), damages, { originatingMessage: message });
  assert.equal(damages.amount, 16, "other Pokémon take the damage as rolled");
  combat.applySinisterDodge(own, damages, { originatingMessage: message });
  assert.deepEqual(damages.map(damage => damage.value), [6, 2, 0, -4]);
  assert.equal(damages.amount, 4);
});

test("Master Trainer: a level 20 trainer or its Pokémon turns a failed save into a success, twice per long rest", async () => {
  const red = trainer("ace-trainer", 20, { masterTrainerUses: { value: 1, max: 2 } });
  const pikachu = pokemon(red);
  const save = total => {
    const message = { documentName: "ChatMessage", rolls: [], update: async changes => { message.rolls = changes.rolls.map(FakeRoll.fromData); } };
    const roll = new FakeRoll({ total, formula: "1d20 + 3", terms: [], options: { target: 15 }, parent: message });
    message.rolls = [roll];
    return roll;
  };
  assert.equal(combat.masterTrainerOffer(save(16), { actor: pikachu, dc: 15 }), null, "already a success");
  assert.equal(combat.masterTrainerOffer(save(9), { actor: pokemon(trainer("ace-trainer", 19, { masterTrainerUses: { value: 2, max: 2 } })), dc: 15 }), null);
  assert.ok(combat.masterTrainerOffer(save(9), { actor: red, dc: 15 }), "the trainer's own saves too");
  prompts.answer = {};
  const roll = save(9);
  const replacement = await combat.masterTrainerOffer(roll, { actor: pikachu, dc: 15 })();
  assert.equal(replacement.total, 15);
  assert.equal(replacement.isSuccess, true);
  assert.equal(roll.parent.rolls[0].total, 15);
  assert.equal(points(red, "masterTrainerUses"), 0);
  assert.equal(combat.masterTrainerOffer(save(9), { actor: pikachu, dc: 15 }), null, "no uses left");
});
