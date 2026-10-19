import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const chat = [];
globalThis.game = { user: { targets: new Set() }, settings: { get: () => "es" } };
globalThis.CONFIG = { DND5E: { healingTypes: { healing: {}, temphp: {} } } };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
globalThis.requestAnimationFrame = callback => queueMicrotask(callback);
const engine = await import("../scripts/reroll-ability-engine.mjs");
engine.registerRerollAbilityEngine();

function pokemon(abilityId, { types = [], weak = [], hp = 20, damage = 0 } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, items: [createAbilityItem(abilityId)],
    flags: { [MODULE_ID]: { kind: "pokemon", types } },
    system: { attributes: { hp: { value: hp, max: 20 } }, traits: { dv: { value: new Set(weak) } } } });
  actor.name = abilityId;
  actor.calculateDamage = () => ({ amount: damage });
  return actor;
}

const move = (sourceId, type, { pp = 10, stab = false } = {}) => ({ system: { uses: { max: pp } },
  getFlag: (_module, key) => ({ kind: "move", sourceId, moveType: type, stab: { eligible: stab } })[key] });

test("which Abilities roll the damage again, and which way", () => {
  assert.equal(engine.rerollMode(pokemon("adaptability"), move("ember", "fire", { stab: true }), [])?.mode, "higher");
  assert.equal(engine.rerollMode(pokemon("adaptability"), move("tackle", "normal"), []), null);
  assert.equal(engine.rerollMode(pokemon("iron-fist"), move("fire-punch", "fire"), [])?.abilityId, "iron-fist");
  assert.equal(engine.rerollMode(pokemon("strong-jaw"), move("crunch", "dark"), [])?.abilityId, "strong-jaw");
  assert.equal(engine.rerollMode(pokemon("technician"), move("tackle", "normal", { pp: 35 }), [])?.abilityId, "technician");
  assert.equal(engine.rerollMode(pokemon("technician"), move("hyper-beam", "normal", { pp: 5 }), []), null);
  const prism = pokemon("prism-armor", { weak: ["water"] });
  assert.equal(engine.rerollMode(pokemon("static"), move("surf", "water"), [prism])?.mode, "lower");
  assert.equal(engine.rerollMode(pokemon("transistor"), move("spark", "electric"), [pokemon("prism-armor", { weak: ["electric"] })]), null, "they cancel out");
});

test("Sturdy rolls when the hit takes half its current HP or more; Filter only against its weakness", () => {
  const rolls = [{ total: 9, options: { type: "water" } }];
  assert.equal(engine.d4Candidates([pokemon("sturdy", { hp: 18, damage: 9 })], rolls).length, 1);
  assert.equal(engine.d4Candidates([pokemon("sturdy", { hp: 18, damage: 8 })], rolls).length, 0);
  assert.equal(engine.d4Candidates([pokemon("filter", { weak: ["water"] })], rolls)[0].abilityId, "filter");
  assert.equal(engine.d4Candidates([pokemon("filter", { weak: ["fire"] })], rolls).length, 0);
});

test("a stored success halves the damage; Filter only the part it is weak to", () => {
  const golem = pokemon("sturdy");
  const ferro = pokemon("filter");
  const message = { getFlag: () => ({ [golem.uuid]: "sturdy", [ferro.uuid]: "filter" }) };
  const sturdy = Object.assign([{ type: "water", value: 16, active: {} }], { amount: 16 });
  engine.applyD4Abilities(golem, sturdy, { originatingMessage: message });
  assert.deepEqual([sturdy[0].value, sturdy.amount], [8, 8]);
  const filter = Object.assign([{ type: "water", value: 16, active: { type: { vulnerability: true } } }, { type: "normal", value: 4, active: {} }], { amount: 20 });
  engine.applyD4Abilities(ferro, filter, { originatingMessage: message });
  assert.deepEqual([filter[0].value, filter[1].value, filter.amount], [8, 4, 12]);
});

test("the damage message keeps the higher of the two rolls and says so", async () => {
  const roll = { total: 5, options: { type: "fire" }, reroll: async () => ({ total: 11, options: { type: "fire" }, toJSON: () => ({ total: 11 }) }) };
  let updated = null;
  const message = { documentName: "ChatMessage", flags: {}, update: async data => { updated = data; } };
  roll.parent = message;
  hooks.handler("dnd5e.rollDamage")([roll], { subject: { actor: pokemon("adaptability"), item: move("ember", "fire", { stab: true }) } });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(updated, { rolls: [{ total: 11 }] });
  assert.match(chat.at(-1), /total mayor: 5 \/ 11 → <strong>11<\/strong>/);
});
