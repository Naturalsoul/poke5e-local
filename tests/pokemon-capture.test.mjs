import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
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

const socket = { handler: null, sent: [], on(_channel, handler) { this.handler = handler; }, emit(_channel, payload) { this.sent.push(payload); } };
game.socket = socket;
game.users = { activeGM: { id: "gm" }, get: id => ({ id }) };
capture.registerPokemonCaptureService();
hooks.handler("ready")();

test("a player's catch asks the GM to move the Pokémon and the message says where it went, after Dice So Nice", async () => {
  const ash = trainer(5);
  const target = wild({ hp: [5, 20] });
  target.statuses.add("restrained");
  const tokenDocument = { uuid: "Scene.route1.Token.caterpie", actor: target };
  game.user = { id: "player", isGM: false, targets: new Set([{ document: tokenDocument }]) };
  const events = [];
  const ball = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: { sourceId: "great-ball", itemType: "pokeball" } } });
  ball.name = "Great Ball";
  ball.parent = ash;
  ball.system = { quantity: 2 };
  ball.update = async changes => { ball.system.quantity = changes["system.quantity"]; };
  ash.rollSkill = async (config, dialog, message) => {
    events.push(["roll", config.skill, "target" in config, config.advantage, message.data.flavor]);
    const rendered = { id: "roll-message", getFlag: (_module, key) => message.data.flags[MODULE_ID][key] };
    // dnd5e renders the card first; Dice So Nice reveals the total later.
    setTimeout(() => hooks.handler("dnd5e.renderChatMessage")(rendered, {}), 0);
    return [{ total: 3 }];
  };
  socket.emit = (_channel, payload) => {
    events.push(["request", payload.trainerUuid, payload.tokenUuid, payload.targetGmId]);
    setTimeout(() => socket.handler({ type: "pokemon-capture-acquire-response", requestId: payload.requestId, recipientId: "player",
      ok: true, result: { destination: "pc", pokemonUuid: "Actor.caught" } }), 0);
  };
  game.dice3d = { waitFor3DAnimationByMessageID: async id => { events.push(["dice", id]); } };
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => {
    events.push(["result", data.flags[MODULE_ID].capture.destination, /PC/.test(data.content), /GM/.test(data.content)]);
  } } };
  globalThis.ui = { notifications: { warn: message => events.push(["warn", message]), error: message => events.push(["error", message]) } };

  const prepared = await capture.prepareCapture(ball);
  assert.equal(prepared.questions, "", "a Great Ball needs no questions");
  await prepared.throwBall({});
  // Caterpie at quarter HP: 12 − 5 (below half) − 5 (Great Ball) = 2; the 3 catches it.
  assert.deepEqual(events, [
    ["roll", "ani", false, true, `Great Ball → ${target.name}`],
    ["dice", "roll-message"],
    ["request", ash.uuid, tokenDocument.uuid, "gm"],
    ["result", "pc", true, false]
  ]);
  assert.equal(ball.system.quantity, 1);
});

test("the Pokémon goes to the party while a Pokéslot is free, else to the PC", async () => {
  const { getTrainerPokeslotLimit } = await import("../scripts/trainer-party-service.mjs");
  const ash = trainer(5);
  assert.equal(capture.captureDestination(ash), "party");
  const limit = getTrainerPokeslotLimit(ash);
  await ash.setFlag(MODULE_ID, "trainerParty", { pokemonUuids: Array.from({ length: limit }, (_, index) => `Actor.p${index}`), activePokemonUuids: [] });
  assert.equal(capture.captureDestination(ash), "pc");
});

test("the GM refuses to move a Pokémon for someone who does not own the trainer", async () => {
  const ash = trainer(5);
  ash.testUserPermission = () => false;
  globalThis.fromUuid = async uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
  game.user = { id: "gm", isGM: true, targets: new Set() };
  const replies = [];
  socket.emit = (_channel, payload) => replies.push(payload);
  socket.handler({ type: "pokemon-capture-acquire-request", requestId: "r1", senderId: "intruder", targetGmId: "gm",
    trainerUuid: ash.uuid, tokenUuid: "Scene.s.Token.t" });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(replies[0].ok, false);
  assert.match(replies[0].error, /no autorizada/);
});

test("the use window only asks what the module cannot see", () => {
  const ranger = trainer(5, "ranger");
  assert.match(capture.captureQuestions(ranger, "dusk-ball", []), /name="situational"/);
  assert.match(capture.captureQuestions(ranger, "timer-ball", []), /name="timerTurns"/);
  assert.match(capture.captureQuestions(ranger, "poke-ball", []), /name="styler"/);
  assert.doesNotMatch(capture.captureQuestions(ranger, "dusk-ball", []), /−|DC|CD/);
});
