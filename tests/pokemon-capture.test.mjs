import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { actors: [], user: { targets: new Set() }, settings: { get: () => "es" }, combat: null };
globalThis.canvas = { tokens: { placeables: [] } };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4 } };
globalThis.foundry.applications = { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: Base => class extends Base {}, DialogV2: {} } };
const capture = await import("../scripts/pokemon-capture-service.mjs");

function trainer(level, pathId = "ace-trainer", skills = {}) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} } } } } });
  actor.system = { skills };
  game.actors.push(actor);
  return actor;
}

function wild({ level = 2, sr = "1/8", hp = [20, 20], types = ["bug"], size = "sm", owner = null } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.wild-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "pokemon", level, sr, types, sourceId: "caterpie", ...(owner ? { trainerOwnerUuid: owner } : {}) } } });
  actor.system = { attributes: { hp: { value: hp[0], max: hp[1] } }, traits: { size } };
  actor.effects = [];
  actor.statuses = new Set();
  game.actors.push(actor);
  return actor;
}

test("base DC follows poke5e's examples: Caterpie 12, Butterfree with a Great Ball 16", () => {
  const caterpie = wild();
  assert.equal(capture.captureDc(caterpie, capture.ballReduction("poke-ball", { trainer: trainer(2), target: caterpie })).dc, 12);
  const butterfree = wild({ level: 10, sr: 6, hp: [20, 45] });
  const context = { trainer: trainer(10), target: butterfree };
  assert.deepEqual(capture.captureDc(butterfree, capture.ballReduction("great-ball", context)), { base: 26, health: 5, reduction: 5, dc: 16 });
  const red = wild({ level: 10, sr: 6, hp: [4, 45] });
  assert.equal(capture.captureDc(red, 0).health, 10, "below 10% stacks another −5");
});

test("ball reductions read the trainer, the target and the table's answers", () => {
  const orthworm = wild({ level: 5, sr: 9, types: ["steel"], size: "huge" });
  const ranger = trainer(6, "ranger", { nat: { total: 6 }, ath: { total: 2 } });
  const context = { trainer: ranger, target: orthworm };
  assert.equal(capture.captureDc(orthworm, capture.ballReduction("safari-ball", context)).dc, 18, "poke5e's Safari Ball example");
  assert.equal(capture.ballReduction("sport-ball", context), 2);
  assert.equal(capture.ballReduction("heavy-ball", context), 10);
  assert.equal(capture.ballReduction("nest-ball", context), 5);
  assert.equal(capture.ballReduction("net-ball", context), 0);
  assert.equal(capture.ballReduction("level-ball", context), 5);
  assert.equal(capture.ballReduction("quick-ball", { ...context, firstRound: true }), 15);
  assert.equal(capture.ballReduction("repeat-ball", { ...context, caughtBefore: true }), 10);
  assert.equal(capture.ballReduction("love-ball", { ...context, activePokemon: { system: { abilities: { cha: { value: 14 } } } } }), 4);
  assert.equal(capture.ballReduction("dusk-ball", context), 0);
  assert.equal(capture.ballReduction("dusk-ball", context, { situational: true }), 10);
  assert.equal(capture.ballReduction("timer-ball", context, { timerTurns: 14 }), 10, "max 10");
});

test("fainted, owned or higher-level Pokémon cannot be caught", () => {
  const ash = trainer(5);
  assert.equal(capture.captureBlocker(ash, wild()), null);
  assert.match(capture.captureBlocker(ash, wild({ hp: [0, 20] })), /debilitado/);
  assert.match(capture.captureBlocker(ash, wild({ owner: "Actor.someone" })), /pertenece/);
  assert.match(capture.captureBlocker(ash, wild({ level: 6 })), /más nivel/);
  assert.match(capture.captureBlocker(ash, null), /objetivo/);
});

test("negative statuses and Poké Assist give advantage", async () => {
  const target = wild({ types: ["grass", "poison"] });
  target.statuses.add("restrained");
  assert.deepEqual(capture.captureAdvantageReasons(trainer(5), target), ["restrained"]);
  const ranger = trainer(15, "ranger");
  const partner = wild({ types: ["grass"], owner: ranger.uuid });
  await ranger.setFlag(MODULE_ID, "rangerPartnerUuid", partner.uuid);
  assert.deepEqual(capture.captureAdvantageReasons(ranger, wild({ types: ["grass"] })), ["Poké Assist"]);
  assert.deepEqual(capture.captureAdvantageReasons(ranger, wild({ types: ["fire"] })), []);
});

test("throwing a ball spends it, rolls Animal Handling against the DC and announces the result after Dice So Nice", async () => {
  const ash = trainer(5);
  const target = wild({ hp: [5, 20] });
  target.statuses.add("restrained");
  game.user.targets = new Set([{ actor: target }]);
  const events = [];
  const ball = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: { sourceId: "great-ball", itemType: "pokeball" } } });
  ball.name = "Great Ball";
  ball.parent = ash;
  ball.system = { quantity: 2 };
  ball.update = async changes => { ball.system.quantity = changes["system.quantity"]; };
  ash.rollSkill = async (config, dialog, message) => {
    events.push(["roll", config.skill, config.target, config.advantage, dialog.configure]);
    message.document = { id: "roll-message" };
    return [{ total: 3 }];
  };
  globalThis.game.dice3d = { waitFor3DAnimationByMessageID: async id => { events.push(["dice", id]); } };
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.foundry.applications.api.DialogV2 = { prompt: async () => ({ situational: false, timerTurns: 0, styler: false, gotta: false }) };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => { events.push(["result", data.flags[MODULE_ID].capture.caught]); } } };
  globalThis.ui = { notifications: { warn: message => events.push(["warn", message]) } };
  await capture.throwPokeball(ball);
  // Caterpie at quarter HP: 12 − 5 (below half) − 5 (Great Ball) = 2.
  assert.deepEqual(events, [["roll", "ani", 2, true, false], ["dice", "roll-message"], ["result", true]]);
  assert.equal(ball.system.quantity, 1);
  game.user.targets = new Set();
});
