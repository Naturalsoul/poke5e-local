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
const element = (tag, parent = null) => ({ tag, parent, children: [], dataset: {}, style: {}, classList: { add() {} },
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }, setAttribute() {},
  addEventListener() {}, querySelector: () => null,
  closest(selector) {
    const key = { "[data-poke5e-item-roll]": "poke5eItemRoll", "[data-message-id]": "messageId" }[selector];
    return key in this.dataset ? this : this.parent?.closest(selector) ?? null;
  } });
globalThis.document = { createElement: tag => element(tag), addEventListener: (type, fn) => type === "click" && clicks.push(fn) };
const rolled = [];
globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { return this; }
  async toMessage(data) { rolled.push([this.formula, data.flavor]); } };
globalThis.ChatMessage = { implementation: { getSpeakerActor: () => null } };
globalThis.ui = { notifications: { warn() {}, error: text => rolled.push(["error", text]), info() {} } };
const message = { id: "m1", speaker: {}, isAuthor: false,
  getFlag: (_m, key) => ({ itemRolls: [{ id: "healing", kind: "healing", formula: "3d6 + 6", label: { en: "Roll healing" } }],
    itemRollName: "Super Potion" })[key] };
globalThis.game = { user: { isGM: true, targets: new Set() }, actors: Object.assign([], { get: () => null }),
  messages: new Map([["m1", message]]), settings: { get: () => "en", register() {} } };

const { registerPoke5eItemConsumptionService } = await import("../scripts/item-consumption-service.mjs");
registerPoke5eItemConsumptionService();

test("the potion's roll button rolls its formula, found through the card's message id", async () => {
  const card = element("li");
  card.dataset.messageId = "m1";
  for (const render of renderers) {render(message, card);}
  const button = card.children[0].children[0];
  for (const click of clicks) {click({ target: button, preventDefault() {}, stopPropagation() {} });}
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(rolled, [["3d6 + 6", "<strong>Super Potion</strong> — Roll healing"]]);
});
