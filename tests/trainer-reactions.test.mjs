import assert from "node:assert/strict";
import test from "node:test";
import { createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const socket = { handler: null, sent: [], on(_channel, handler) { this.handler = handler; }, emit(_channel, payload) { this.sent.push(payload); } };
const users = [];
globalThis.game = { settings: { get: () => "es" }, socket, user: { id: "gm", isGM: true },
  users: { find: predicate => users.find(predicate), get activeGM() { return users.find(user => user.isGM && user.active) ?? null; } } };
const dialogs = [];
globalThis.foundry.applications = { api: { DialogV2: { wait: async options => {
  dialogs.push(options);
  return options.answer ?? dialogs.answer;
} } } };
const reactions = await import("../scripts/trainer-reaction-service.mjs");
reactions.registerTrainerReactionService();
hooks.handler("ready")();

const trainer = { testUserPermission: user => user.owns === true };

test("the connected player who owns the trainer decides; without one, the GM", () => {
  users.splice(0, users.length, { id: "gm", isGM: true, active: true }, { id: "ana", active: false, owns: true }, { id: "leo", active: true });
  assert.equal(reactions.reactionDecider(trainer).id, "gm");
  users[1].active = true;
  assert.equal(reactions.reactionDecider(trainer).id, "ana");
});

test("the GM's roll waits for the player's answer over the socket", async () => {
  users.splice(0, users.length, { id: "gm", isGM: true, active: true }, { id: "ana", active: true, owns: true });
  socket.sent = [];
  const answer = reactions.askTrainerReaction(trainer, { title: "Sabotage", content: "<input name='points'>" });
  const request = socket.sent[0];
  assert.equal(request.targetUserId, "ana");
  // Someone else cannot answer for Ana.
  socket.handler({ type: "trainer-reaction-response", requestId: request.requestId, senderId: "leo", recipientId: "gm", values: { points: "5" } });
  socket.handler({ type: "trainer-reaction-response", requestId: request.requestId, senderId: "ana", recipientId: "gm", values: { points: "2" } });
  assert.deepEqual(await answer, { points: "2" });
});

test("the asked player sees the prompt and replies; declining replies null", async () => {
  game.user = { id: "ana" };
  socket.sent = [];
  dialogs.answer = "skip";
  await socket.handler({ type: "trainer-reaction-request", requestId: "r1", senderId: "gm", targetUserId: "ana", prompt: { title: "Battle Die", content: "" } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(dialogs.at(-1).window.title, "Battle Die");
  assert.deepEqual(socket.sent.at(-1), { type: "trainer-reaction-response", requestId: "r1", senderId: "ana", recipientId: "gm", values: null });
  game.user = { id: "gm", isGM: true };
});

test("asking yourself shows the prompt locally and returns the form values", async () => {
  users.splice(0, users.length, { id: "gm", isGM: true, active: true });
  dialogs.answer = { points: "3" };
  assert.deepEqual(await reactions.askTrainerReaction(trainer, { title: "Raise Your Defenses", content: "" }), { points: "3" });
  dialogs.answer = "skip";
  assert.equal(await reactions.askTrainerReaction(trainer, { title: "Raise Your Defenses", content: "" }), null);
});
