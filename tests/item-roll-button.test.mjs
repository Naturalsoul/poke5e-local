import assert from "node:assert/strict";
import test from "node:test";
import { createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
createHooks();
globalThis.foundry.applications = { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: class {} }, handlebars: {} };
globalThis.foundry.utils.escapeHTML ??= value => String(value);

const renderers = [];
const on = Hooks.on.bind(Hooks);
Hooks.on = (name, fn) => { if (name === "dnd5e.renderChatMessage") {renderers.push(fn);} return on(name, fn); };
const clicks = [];
globalThis.document = { addEventListener: (type, fn, capture) => type === "click" && clicks.push([fn, capture]) };
const rolled = [];
globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { return this; }
  async toMessage(data) { rolled.push([this.formula, data.flavor]); } };
globalThis.ChatMessage = { implementation: { getSpeakerActor: () => null } };
globalThis.ui = { notifications: { warn: text => rolled.push(["warn", text]), error: text => rolled.push(["error", text]), info() {} } };
const message = { id: "m1", speaker: {}, isAuthor: false,
  getFlag: (_m, key) => ({ itemRolls: [{ id: "healing", kind: "healing", formula: "3d6 + 6", label: { en: "Roll healing" } }],
    itemRollName: "Super Potion" })[key] };
globalThis.game = { user: { isGM: true, targets: new Set() }, actors: Object.assign([], { get: () => null }),
  messages: new Map([["m1", message]]), settings: { get: () => "en", register() {} } };

const { registerPoke5eItemConsumptionService } = await import("../scripts/item-consumption-service.mjs");
registerPoke5eItemConsumptionService();

test("a card without the buttons in its content gets them inside the chat card", () => {
  let inserted = "";
  const chatCard = { insertAdjacentHTML: (_where, markup) => { inserted = markup; } };
  const html = { querySelector: selector => (selector === ".chat-card" ? chatCard : null) };
  for (const render of renderers) {render(message, html);}
  assert.match(inserted, /data-poke5e-item-roll="healing"/);
  assert.match(inserted, /Roll healing · 3d6 \+ 6/);
});

test("the button's click is caught on the capture phase and rolls its formula", async () => {
  const card = { dataset: { messageId: "m1" } };
  const button = { dataset: { poke5eItemRoll: "healing" }, closest: selector => (selector === "[data-message-id]" ? card : null) };
  const target = { closest: selector => (selector === "[data-poke5e-item-roll]" ? button : null) };
  assert.ok(clicks.every(([, capture]) => capture === true));
  for (const [click] of clicks) {click({ target, preventDefault() {}, stopPropagation() {} });}
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(rolled, [["3d6 + 6", "<strong>Super Potion</strong> — Roll healing"]]);
});
