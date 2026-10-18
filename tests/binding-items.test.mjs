import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils, MockRoll, renderMockRollMessage } from "./helpers/foundry-mocks.mjs";
import { buildMoveItem } from "../scripts/builder.mjs";
import { buildMovePeriodicEffects } from "../scripts/periodic-effects.mjs";
import {
  applyPeriodicEffect, applyBindingDamageBonus, captureBindingDamage, recordBindingDamage,
  processPokemonPeriodicEndTurn, validateBindingContinuation, synchronizeBindingMoves
} from "../scripts/periodic-engine.mjs";

installFoundryUtils();
createHooks();
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const MODULE_ID = "poke5e-local";
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.game = { user: { targets: new Set() }, settings: { get: () => "es" },
  actors: [], combat: { id: "battle", round: 1, turn: 0 } };
globalThis.canvas = { tokens: { placeables: [] } };
globalThis.ui = { notifications: { info() {}, warn() {} } };
globalThis.ChatMessage = { getSpeaker: () => ({}) };
globalThis.Roll = class extends MockRoll {
  async evaluate() { return this.evaluateSync(); }
  async toMessage(data) { return renderMockRollMessage(data); }
};
const { moves } = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));
const pokemon = { id: "test", types: ["normal"],
  combat: { attributes: { str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } };
let sequence = 0;

function actor() {
  const result = createFlagDocument({ uuid: `Actor.${++sequence}`, flags: { [MODULE_ID]: { kind: "pokemon" } },
    system: { attributes: { prof: 3, hp: { value: 50, max: 50 } } } });
  result.items.get = id => result.items.find(item => item.id === id);
  result.damage = [];
  result.applyDamage = async values => { result.damage.push(values); };
  result.createEmbeddedDocuments = async (_type, sources) => sources.map(source => {
    const effect = createFlagDocument({ ...source, documentName: "ActiveEffect", uuid: `Effect.${++sequence}` });
    Object.assign(effect, source);
    effect.delete = async () => { result.effects = result.effects.filter(entry => entry !== effect); };
    result.effects.push(effect);
    return effect;
  });
  documents.set(result.uuid, result);
  return result;
}

function moveItem(source, id) {
  const move = moves.find(entry => entry.id === id);
  const templateSource = buildMovePeriodicEffects(move, "en", { level: 5 }).effects[0];
  const template = createFlagDocument({ flags: templateSource.flags });
  template.toObject = () => structuredClone(templateSource);
  return { actor: source, uuid: `${source.uuid}.Item.${id}`, name: id, effects: [template] };
}

function equipBand(source) {
  const held = createFlagDocument({ documentName: "Item", flags: { [MODULE_ID]: {
    kind: "catalog-item", sourceId: "binding-band"
  } }, system: { quantity: 1 } });
  source.items.push(held);
  return held;
}

test("binding moves preserve initial damage and add a continuation with the correct action and no PP cost", () => {
  for (const id of ["bind", "wrap", "clamp", "sand-tomb", "whirlpool", "thunder-cage", "fire-spin", "infestation"]) {
    const move = moves.find(entry => entry.id === id);
    const built = buildMoveItem(move, pokemon, 5, "en");
    const activities = Object.values(built.system.activities);
    assert.ok(activities[0].damage.parts.length, id);
    const continuation = activities.find(activity => activity.flags?.[MODULE_ID]?.bindingContinuation);
    if (["fire-spin", "infestation"].includes(id)) {
      assert.equal(continuation, undefined);
    } else {
      assert.ok(continuation, id);
      assert.equal(continuation.activation.type, ["bind", "wrap", "clamp"].includes(id) ? "bonus" : "action");
      assert.deepEqual(continuation.consumption.targets, []);
      assert.equal(continuation.duration.concentration, false);
    }
  }
  for (const id of ["snap-trap", "magma-storm"]) {
    assert.equal(buildMovePeriodicEffects(moves.find(move => move.id === id)).effects.length, 0);
  }
});

test("Binding Band snapshots PB at application and adds it once per target and round, only to continuations", async () => {
  game.combat.round = 1;
  const source = actor();
  equipBand(source);
  const target = actor();
  const item = moveItem(source, "bind");
  const effect = await applyPeriodicEffect(target, item);
  assert.equal(effect.getFlag(MODULE_ID, "periodic").bindingBonus, 3);
  assert.equal(await applyPeriodicEffect(target, item), effect);
  source.system.attributes.prof = 6;
  source.items.length = 0;
  const options = { originatingMessage: { getAssociatedItem: () => item,
    getAssociatedActivity: () => ({ flags: { [MODULE_ID]: { bindingContinuation: true } } }) } };
  const initial = [{ value: 6, type: "normal" }]; initial.amount = 6;
  applyBindingDamageBonus(target, initial, { originatingMessage: { getAssociatedActivity: () => null } });
  assert.equal(initial.amount, 6);
  const damage = [{ value: 6, type: "normal" }]; damage.amount = 6;
  applyBindingDamageBonus(target, damage, options);
  applyBindingDamageBonus(target, damage, options);
  assert.equal(damage.amount, 9);
  assert.equal(target.getFlag(MODULE_ID, "bindingDamageRounds"), undefined, "preview is read only");
  options[MODULE_ID].heldItemDamageApplied = 9;
  captureBindingDamage(target, options);
  const concurrent = [{ value: 6, type: "normal" }]; concurrent.amount = 6;
  applyBindingDamageBonus(target, concurrent, { originatingMessage: options.originatingMessage });
  assert.equal(concurrent.amount, 6, "a concurrent application cannot reuse the round bonus before persistence");
  await recordBindingDamage(target, 9, options);
  const again = [{ value: 6, type: "normal" }]; again.amount = 6;
  applyBindingDamageBonus(target, again, options);
  assert.equal(again.amount, 6);
  game.combat.round++;
  const next = [{ value: 6, type: "normal" }]; next.amount = 6;
  applyBindingDamageBonus(target, next, options);
  assert.equal(next.amount, 9);
  game.user.targets = new Set([{ actor: target }]);
  const continuation = { item, flags: { [MODULE_ID]: { bindingContinuation: true } } };
  assert.equal(validateBindingContinuation(continuation), true);
  target.effects.length = 0;
  assert.equal(validateBindingContinuation(continuation), false);
});

test("Clamp expires after one minute and its continuation stops when the target escapes", async () => {
  game.time = { worldTime: 100 };
  const source = actor();
  equipBand(source);
  const target = actor();
  const item = moveItem(source, "clamp");
  await applyPeriodicEffect(target, item);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "periodic").expiresAt, 160);
  const activity = { item, flags: { [MODULE_ID]: { bindingContinuation: true } } };
  game.user.targets = new Set([{ actor: target }]);
  assert.equal(validateBindingContinuation(activity), true);
  game.time.worldTime = 160;
  assert.equal(validateBindingContinuation(activity), false);
  await processPokemonPeriodicEndTurn(target);
  assert.equal(target.effects.length, 0);
});

test("Fire Spin binds to native concentration, ticks once per turn, expires after three turns and stops on concentration loss", async () => {
  const source = actor();
  equipBand(source);
  const item = moveItem(source, "fire-spin");
  const concentration = { uuid: "Effect.concentration", origin: item.uuid };
  source.concentration = { effects: new Set([concentration]) };
  documents.set(concentration.uuid, concentration);
  const target = actor();
  await applyPeriodicEffect(target, item);
  assert.equal(target.effects[0].getFlag("dnd5e", "dependentOn"), concentration.uuid);
  for (let round = 1; round <= 3; round++) {
    game.combat.round = round;
    await processPokemonPeriodicEndTurn(target);
    await processPokemonPeriodicEndTurn(target);
    assert.equal(target.damage.length, round);
    assert.deepEqual(target.damage.at(-1), [{ value: 5, type: "fire" }]);
  }
  assert.equal(target.effects.length, 0);
  const second = actor();
  await applyPeriodicEffect(second, item);
  documents.delete(concentration.uuid);
  await processPokemonPeriodicEndTurn(second);
  assert.deepEqual(second.damage, []);
  assert.equal(second.effects.length, 0);
  source.concentration.effects.clear();
  await assert.rejects(applyPeriodicEffect(actor(), item), /concentración/);
});

test("existing binding moves gain only missing templates and activities without changing spent PP or custom descriptions", async () => {
  const source = actor();
  const flags = { kind: "move", moveDefinition: moves.find(move => move.id === "bind") };
  const item = createFlagDocument({ flags: { [MODULE_ID]: flags },
    system: { uses: { spent: 7 }, description: { value: "Custom" }, activities: new Map() } });
  item.update = async updates => {
    for (const [key, value] of Object.entries(updates)) {
      if (key === `flags.${MODULE_ID}.bindingVersion`) {await item.setFlag(MODULE_ID, "bindingVersion", value);}
      else {item.system.activities.set(key, value);}
    }
  };
  item.createEmbeddedDocuments = async (_type, sources) => {
    item.effects.push(...sources.map(effect => createFlagDocument({ flags: effect.flags })));
  };
  source.items.push(item);
  await synchronizeBindingMoves(source);
  await synchronizeBindingMoves(source);
  assert.equal(item.effects.length, 1);
  assert.equal(item.system.activities.size, 1);
  assert.equal(item.system.uses.spent, 7);
  assert.equal(item.system.description.value, "Custom");
});
