import assert from "node:assert/strict";
import test from "node:test";
import { createHooks, createFlagDocument } from "./helpers/foundry-mocks.mjs";
import { publishRollBeforeDamage } from "../scripts/chat-roll-display.mjs";

const hooks = createHooks();
const frames = [];
const observers = new Set();
let sequence = 0;
globalThis.game = { user: { id: "gm", isGM: true } };
globalThis.requestAnimationFrame = callback => { frames.push(callback); };
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
};

async function paints() {
  for (let index = 0; index < 12; index++) {
    while (frames.length) {frames.shift()();}
    await Promise.resolve();
  }
}

function fixture({ duringPublish = false } = {}) {
  let message;
  let applied = 0;
  const html = { isConnected: true };
  const roll = { total: 8, async toMessage(data) {
    message = createFlagDocument({ uuid: `ChatMessage.${++sequence}`, flags: data.flags });
    if (duringPublish) {Hooks.callAll("dnd5e.renderChatMessage", message, html);}
    return message;
  } };
  const task = publishRollBeforeDamage(roll, { flavor: "Fire Spin" }).then(() => { applied++; });
  return { roll, task, html, applied: () => applied,
    show: (element = html) => Hooks.callAll("dnd5e.renderChatMessage", message, element), message: () => message };
}

test("damage waits for a render and painted result even without Dice So Nice", async () => {
  const value = fixture();
  await paints();
  assert.equal(value.applied(), 0);
  value.show();
  await Promise.resolve();
  assert.equal(value.applied(), 0);
  await paints();
  await value.task;
  assert.equal(value.applied(), 1);
  assert.equal(hooks.handlers("dnd5e.renderChatMessage").length, 0);
});

test("a render during message creation waits for Dice So Nice and uses the latest rendered element", async () => {
  let finishAnimation;
  game.dice3d = { waitFor3DAnimationByMessageID: () => new Promise(resolve => { finishAnimation = resolve; }) };
  try {
    const value = fixture({ duringPublish: true });
    await paints();
    assert.equal(value.applied(), 0);
    value.html.isConnected = false;
    value.show({ isConnected: true });
    finishAnimation();
    await paints();
    await value.task;
    value.show();
    await paints();
    assert.equal(value.applied(), 1);
  } finally {delete game.dice3d;}
});

test("an animated but masked result cannot apply damage until it is revealed and painted", async () => {
  let hidden = true;
  const html = { isConnected: true, querySelector: () => ({ closest: () => hidden ? {} : null }) };
  game.dice3d = { waitFor3DAnimationByMessageID: async () => {} };
  try {
    const value = fixture();
    value.show(html);
    await paints();
    assert.equal(value.applied(), 0);
    hidden = false;
    for (const observer of [...observers]) {observer.callback();}
    assert.equal(value.applied(), 0);
    await paints();
    await value.task;
    assert.equal(value.applied(), 1);
    assert.equal(observers.size, 0);
  } finally {delete game.dice3d;}
});

test("publishing or animation failures do not continue into damage and remove listeners", async () => {
  await assert.rejects(publishRollBeforeDamage({ toMessage: async () => undefined }, {}), /No se pudo publicar/);
  game.dice3d = { waitFor3DAnimationByMessageID: async () => { throw new Error("animation failed"); } };
  try {
    const value = fixture({ duringPublish: true });
    await assert.rejects(value.task, /animation failed/);
    assert.equal(value.applied(), 0);
    assert.equal(hooks.handlers("dnd5e.renderChatMessage").length, 0);
    await paints();
  } finally {delete game.dice3d;}
});
