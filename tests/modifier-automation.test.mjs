import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { buildMoveModifierEffects } from "../scripts/modifier-effects.mjs";
import { registerMoveModifierAutomation, synchronizeAutomatedMoveModifiers, clearEncounterMoveModifiers } from "../scripts/modifier-automation.mjs";
import { getPokemonMoveEffects, managePokemonMoveEffect, pokemonMoveEffectsMarkup } from "../scripts/pokemon-move-effects.mjs";

installFoundryUtils();
createHooks();
const documents = new Map();
const frames = [];
const notices = [];
const MODULE_ID = "poke5e-local";
let sequence = 0;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
  actors: [], scenes: [], settings: { get: () => "es" } };
globalThis.canvas = { tokens: { controlled: [], placeables: [] } };
globalThis.ui = { notifications: { info: text => notices.push(text), error: text => assert.fail(text) } };
globalThis.fromUuidSync = uuid => documents.get(uuid);
globalThis.requestAnimationFrame = callback => frames.push(callback);
registerMoveModifierAutomation();

function effect(source) {
  const result = createFlagDocument({ ...source, uuid: `ActiveEffect.${++sequence}`, documentName: "ActiveEffect" });
  Object.assign(result, { name: source.name, changes: source.changes, duration: source.duration, disabled: source.disabled });
  result.toObject = () => ({ ...structuredClone(source), flags: structuredClone(result._flags) });
  result.update = async changes => {
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith(`flags.${MODULE_ID}.`)) {await result.setFlag(MODULE_ID, key.slice(`flags.${MODULE_ID}.`.length), value);}
      else {result[key] = value;}
    }
  };
  return result;
}

function actor() {
  const result = createFlagDocument({ uuid: `Actor.${++sequence}`, flags: { [MODULE_ID]: { kind: "pokemon" } } });
  result.createEmbeddedDocuments = async (_type, sources) => sources.map(source => {
    const created = effect(source);
    created.parent = result;
    created.delete = async () => { result.effects = result.effects.filter(entry => entry !== created); };
    result.effects.push(created);
    return created;
  });
  result.deleteEmbeddedDocuments = async (_type, ids) => { result.effects = result.effects.filter(entry => !ids.includes(entry.id)); };
  documents.set(result.uuid, result);
  return result;
}

function move(id, source = actor()) {
  const result = createFlagDocument({ uuid: `${source.uuid}.Item.${id}`, documentName: "Item", flags: {
    [MODULE_ID]: { kind: "move", sourceId: id, moveDefinition: { id } }
  } });
  result.actor = source;
  result.effects = buildMoveModifierEffects({ id }).effects.map(effect);
  result.createEmbeddedDocuments = async (_type, sources) => { result.effects.push(...sources.map(effect)); };
  source.items.push(result);
  documents.set(result.uuid, result);
  return result;
}

function message(item, target, { success = false, type = item.getFlag(MODULE_ID, "sourceId") === "mud-slap" ? "attack" : "save", live = true } = {}) {
  const activity = { item, actor: item.actor, attack: { type: "ranged" } };
  const roll = { total: success ? 20 : 5, options: { target: type === "attack" ? 10 : 12,
    poke5eTargetActorUuid: target.uuid,
    [MODULE_ID]: { modifierUsage: { usageMessageId: `Usage.${++sequence}`, actorUuid: target.uuid, itemUuid: item.uuid, dc: 12 } }
  } };
  if (type === "attack") {delete roll.options[MODULE_ID].modifierUsage; roll.total = success ? 15 : 5;}
  const result = createFlagDocument({ uuid: `ChatMessage.${++sequence}`, flags: { dnd5e: { roll: { type } } } });
  result.rolls = [roll];
  result.getAssociatedItem = () => item;
  result.getAssociatedActivity = () => activity;
  // Mock getFlag also supports dotted keys like Foundry.
  const getFlag = result.getFlag;
  result.getFlag = (scope, key) => key === "roll.type" ? type : getFlag(scope, key);
  if (live) {Hooks.callAll("createChatMessage", result);}
  return result;
}

async function paints() {
  for (let index = 0; index < 24; index++) {
    while (frames.length) {frames.shift()();}
    await Promise.resolve();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function show(value) {
  Hooks.callAll("dnd5e.renderChatMessage", value, { isConnected: true });
  await paints();
}

test("Growl applies after a failed save is displayed, stacks to -5, and ignores successful saves", async () => {
  const item = move("growl");
  const target = actor();
  await show(message(item, target, { success: true }));
  assert.equal(target.effects.length, 0);
  for (let index = 0; index < 6; index++) {await show(message(item, target));}
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 5);
  assert.ok(target.effects[0].changes.every(change => change.value === "-5"));
  assert.equal(getPokemonMoveEffects(target).length, 1);
});

test("Leer and Screech keep their ally-only attack bonuses and respect their separate stack caps", async () => {
  for (const [id, cap] of [["leer", 5], ["screech", 3]]) {
    const item = move(id);
    const target = actor();
    for (let index = 0; index < cap + 1; index++) {await show(message(item, target));}
    const applied = target.effects[0];
    assert.equal(applied.getFlag(MODULE_ID, "stackCount"), cap);
    assert.deepEqual(applied.getFlag(MODULE_ID, "targetedAttack"), { bonusPerStack: 1, alliesOnly: true, excludeSource: true });
    assert.deepEqual(applied.changes, []);
  }
});

test("Mud-Slap only applies on a hit, waits for Dice So Nice, and can be completely wiped off", async () => {
  const item = move("mud-slap");
  const target = actor();
  await show(message(item, target));
  assert.equal(target.effects.length, 0);
  let finish;
  game.dice3d = { waitFor3DAnimationByMessageID: () => new Promise(resolve => { finish = resolve; }) };
  try {
    const hit = message(item, target, { success: true });
    await show(hit);
    assert.equal(target.effects.length, 0);
    finish();
    await paints();
    assert.equal(target.effects.length, 1);
    assert.equal(target.effects[0].changes[0].value, "-1");
    assert.match(pokemonMoveEffectsMarkup(target), /Limpiar lodo \(Acción\)/);
    await managePokemonMoveEffect(target, target.effects[0].id, "remove");
    await show(hit);
    assert.equal(target.effects.length, 0, "rendering again must not reapply a removed effect");
  } finally {delete game.dice3d;}
});

test("rerenders, historical chat and other GM clients cannot duplicate applications", async () => {
  const item = move("growl");
  const target = actor();
  const roll = message(item, target);
  Hooks.callAll("dnd5e.renderChatMessage", roll, { isConnected: true });
  await show(roll);
  await show(roll);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 1);
  await show(message(item, target, { live: false }));
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 1);
  game.user.id = "other-gm";
  try {await show(message(item, target));} finally {game.user.id = "gm";}
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 1);
});

test("Mud-Slap stacks to -5 and unresolved attacks or unrelated saves cannot apply it", async () => {
  const item = move("mud-slap");
  const target = actor();
  const unresolved = message(item, target, { success: true });
  delete unresolved.rolls[0].options.target;
  await show(unresolved);
  assert.equal(target.effects.length, 0);
  for (let index = 0; index < 6; index++) {await show(message(item, target, { success: true }));}
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 5);
  assert.ok(target.effects[0].changes.every(change => change.value === "-5"));
  const unrelated = actor();
  const standaloneSave = message(move("growl"), unrelated);
  delete standaloneSave.rolls[0].options[MODULE_ID].modifierUsage;
  await show(standaloneSave);
  assert.equal(unrelated.effects.length, 0);
});

test("separate targets only receive their own failed-save effects", async () => {
  const item = move("screech");
  const failed = actor();
  const succeeded = actor();
  await show(message(item, failed));
  await show(message(item, succeeded, { success: true }));
  assert.equal(failed.effects.length, 1);
  assert.equal(succeeded.effects.length, 0);
});

test("simultaneous failed saves preserve stacks and never use mutable current targets", async () => {
  const item = move("growl");
  const target = actor();
  const unrelated = actor();
  game.user.targets = new Set([{ actor: unrelated }]);
  const first = message(item, target);
  const second = message(item, target);
  Hooks.callAll("dnd5e.renderChatMessage", first, { isConnected: true });
  await show(second);
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 2);
  assert.equal(unrelated.effects.length, 0);
});

test("existing moves gain missing templates without replacing custom descriptions or templates", async () => {
  const item = move("mud-slap");
  item.system.description = { value: "Custom description" };
  item.effects = [];
  await synchronizeAutomatedMoveModifiers(item.actor);
  await synchronizeAutomatedMoveModifiers(item.actor);
  assert.equal(item.effects.length, 1);
  assert.equal(item.system.description.value, "Custom description");
  assert.equal(item.effects[0].getFlag(MODULE_ID, "maxStacks"), 5);
});

test("encounter cleanup removes Mud-Slap but preserves other modifiers, including on synthetic tokens", async () => {
  const target = actor();
  const token = actor();
  const mud = move("mud-slap");
  const growl = move("growl");
  await show(message(mud, target, { success: true }));
  await show(message(mud, token, { success: true }));
  await show(message(growl, target));
  game.actors = [target];
  game.scenes = [{ tokens: [{ actorLink: false, actor: token }] }];
  await clearEncounterMoveModifiers();
  assert.equal(token.effects.length, 0);
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "sourceMove"), "growl");
  game.actors = [];
  game.scenes = [];
});
