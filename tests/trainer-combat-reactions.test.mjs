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
