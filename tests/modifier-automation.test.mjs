import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { buildMoveModifierEffects } from "../scripts/modifier-effects.mjs";
import { registerMoveModifierAutomation, synchronizeAutomatedMoveModifiers, clearEncounterMoveModifiers,
  onPreCreateModifierEffect, synchronizeMoveStatusTemplates } from "../scripts/modifier-automation.mjs";
import { buildMoveStatusEffects } from "../scripts/status-effects.mjs";
import { getPokemonMoveEffects, managePokemonMoveEffect, pokemonMoveEffectsMarkup } from "../scripts/pokemon-move-effects.mjs";

installFoundryUtils();
createHooks();
const documents = new Map();
const frames = [];
const notices = [];
const MODULE_ID = "poke5e-local";
let sequence = 0;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
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

test("Leer, Screech and Tail Whip keep their ally-only attack bonuses and respect their separate stack caps", async () => {
  for (const [id, cap] of [["leer", 5], ["screech", 3], ["tail-whip", 5]]) {
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

function usage(item, system = {}) {
  const result = createFlagDocument({ uuid: `ChatMessage.${++sequence}`, documentName: "ChatMessage", system });
  result.type = "usage";
  result.getAssociatedItem = () => item;
  Hooks.callAll("createChatMessage", result);
  return result;
}

function concentration(user) {
  const result = effect({ name: "Concentrating" });
  result.parent = user;
  user.effects.push(result);
  return result;
}

test("Defense Curl applies to its user once when the usage card is created", async () => {
  const item = move("defense-curl");
  const user = item.actor;
  usage(item);
  await paints();
  assert.equal(user.effects.length, 1);
  const applied = user.effects[0];
  assert.equal(applied.getFlag(MODULE_ID, "sourceMove"), "defense-curl");
  assert.equal(applied.getFlag(MODULE_ID, "expireAtStartTurn"), true);
  assert.deepEqual(applied.changes.map(change => change.value), ["4", "normal"]);
  assert.equal(applied.getFlag("dnd5e", "dependentOn"), undefined);
  usage(item);
  await paints();
  assert.equal(user.effects.length, 1, "using it again must not duplicate the buff");
});

test("the self trigger ignores other messages, other GMs and moves that are not automated", async () => {
  const curl = move("defense-curl");
  const chat = createFlagDocument({ uuid: `ChatMessage.${++sequence}`, documentName: "ChatMessage" });
  chat.type = "base";
  chat.getAssociatedItem = () => curl;
  Hooks.callAll("createChatMessage", chat);
  game.user.id = "other-gm";
  try {usage(curl);} finally {game.user.id = "gm";}
  const growth = move("growth");
  usage(growth);
  await paints();
  assert.equal(curl.actor.effects.length, 0);
  assert.equal(growth.actor.effects.length, 0);
});

test("Agility depends on its concentration so dnd5e removes it, and recasting relinks it", async () => {
  const item = move("agility");
  const user = item.actor;
  const first = concentration(user);
  usage(item, { concentration: first.id });
  await paints();
  const applied = user.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === "agility");
  assert.equal(applied.getFlag("dnd5e", "dependentOn"), first.uuid);
  assert.equal(applied.changes[0].value, "20");
  const second = concentration(user);
  usage(item, { concentration: second.id });
  await paints();
  assert.equal(user.effects.filter(entry => entry.getFlag(MODULE_ID, "sourceMove") === "agility").length, 1);
  assert.equal(applied.getFlag("dnd5e", "dependentOn"), second.uuid);
});

test("automated self buffs drop dnd5e's apply button and cannot be duplicated by old items", async () => {
  assert.deepEqual(buildMoveModifierEffects({ id: "agility" }).activityEffects, []);
  assert.equal(buildMoveModifierEffects({ id: "growth" }).activityEffects.length, 1);
  const item = move("defense-curl");
  const copy = effect(buildMoveModifierEffects({ id: "defense-curl" }).effects[0]);
  copy.parent = item.actor;
  assert.equal(onPreCreateModifierEffect(copy), true);
  usage(item);
  await paints();
  assert.equal(onPreCreateModifierEffect(copy), false);
  const growth = effect(buildMoveModifierEffects({ id: "growth" }).effects[0]);
  growth.parent = item.actor;
  assert.equal(onPreCreateModifierEffect(growth), true);
});

test("Amnesia, Acid Armor, Aqua Ring and Defend Order apply on use with the right changes and concentration", async () => {
  for (const [id, values, concentrates] of [
    ["amnesia", ["2"], false], ["acid-armor", ["2"], true], ["aqua-ring", [], true], ["defend-order", ["1"], true]
  ]) {
    const item = move(id);
    const user = item.actor;
    const focus = concentrates ? concentration(user) : null;
    usage(item, focus ? { concentration: focus.id } : {});
    await paints();
    const applied = user.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.ok(applied, id);
    assert.deepEqual(applied.changes.map(change => change.value), values, id);
    assert.equal(applied.getFlag("dnd5e", "dependentOn"), focus?.uuid, id);
    assert.deepEqual(buildMoveModifierEffects({ id }).activityEffects, [], id);
  }
});

test("Aqua Ring keeps its end-of-turn healing flag on the applied effect", async () => {
  const item = move("aqua-ring");
  usage(item, { concentration: concentration(item.actor).id });
  await paints();
  const applied = item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === "aqua-ring");
  assert.deepEqual(applied.getFlag(MODULE_ID, "endTurnHealing"), { formula: "@prof", source: "aqua-ring" });
});

function attack(item, target, natural, { hit = true } = {}) {
  const result = message(item, target, { type: "attack", success: hit });
  result.rolls[0].d20 = { results: [{ active: true, result: natural }] };
  return result;
}

test("Bubble Beam halves speed on a natural 19+ and Mud Shot sets it to 0 on a natural 16+", async () => {
  for (const [id, threshold, factor] of [["bubble-beam", 19, "0.5"], ["mud-shot", 16, "0"]]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, threshold - 1));
    assert.equal(target.effects.length, 0, `${id} below threshold`);
    await show(attack(item, target, threshold));
    assert.equal(target.effects.length, 1, id);
    const applied = target.effects[0];
    assert.ok(applied.changes.every(change => change.value === factor && change.mode === CONST.ACTIVE_EFFECT_MODES.MULTIPLY), id);
    assert.equal(applied.getFlag(MODULE_ID, "expireAtEndOfNextTurn"), true, id);
    assert.equal(applied.getFlag(MODULE_ID, "nextTurnStarted"), false, id);
  }
});

test("natural triggers follow the Scald contract (hit or miss), ignore saves and refresh on a new trigger", async () => {
  const item = move("mud-shot");
  const target = actor();
  await show(message(item, target));
  assert.equal(target.effects.length, 0, "a failed save must not trigger an attack rider");
  await show(attack(item, target, 17, { hit: false }));
  assert.equal(target.effects.length, 1);
  await target.effects[0].setFlag(MODULE_ID, "nextTurnStarted", true);
  await show(attack(item, target, 20));
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "nextTurnStarted"), false);
});

function sprayHit(item, target, usageId, { hit = true } = {}) {
  const result = message(item, target, { type: "attack", success: hit });
  result._flags.dnd5e = { ...result._flags.dnd5e, originatingMessage: usageId };
  return result;
}

function spraySave(item, target, usageId, { success = false } = {}) {
  const result = message(item, target, { type: "save", success });
  result.rolls[0].options[MODULE_ID].modifierUsage.usageMessageId = usageId;
  return result;
}

test("Acid Spray needs a hit and a failed save from the same usage, in either order, stacking to -3 AC", async () => {
  const item = move("acid-spray");
  const target = actor();
  await show(sprayHit(item, target, "Usage.a"));
  assert.equal(target.effects.length, 0, "a hit alone must not apply");
  await show(spraySave(item, target, "Usage.a"));
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].changes[0].value, "-1");
  await show(spraySave(item, target, "Usage.b"));
  await show(sprayHit(item, target, "Usage.b"));
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 2);
  for (const usageId of ["Usage.c", "Usage.d"]) {
    await show(sprayHit(item, target, usageId));
    await show(spraySave(item, target, usageId));
  }
  assert.equal(target.effects.length, 1);
  assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), 3);
  assert.equal(target.effects[0].changes[0].value, "-3");
});

test("Acid Spray ignores misses, successful saves, mismatched usages and other targets", async () => {
  const item = move("acid-spray");
  const target = actor();
  const other = actor();
  await show(sprayHit(item, target, "Usage.miss", { hit: false }));
  await show(spraySave(item, target, "Usage.miss"));
  await show(sprayHit(item, target, "Usage.saved"));
  await show(spraySave(item, target, "Usage.saved", { success: true }));
  await show(sprayHit(item, target, "Usage.one"));
  await show(spraySave(item, target, "Usage.two"));
  await show(sprayHit(item, target, "Usage.split"));
  await show(spraySave(item, other, "Usage.split"));
  assert.equal(target.effects.length, 0);
  assert.equal(other.effects.length, 0);
});

const acValue = applied => applied.changes.find(change => change.key === "system.attributes.ac.bonus")?.value;

test("batch 5a self buffs apply on use with their AC change and concentration link", async () => {
  for (const [id, ac, concentrates] of [
    ["cotton-guard", "2", true], ["minimize", "2", true], ["coil", "1", true], ["quiver-dance", "1", true],
    ["victory-dance", "1", true], ["swords-dance", "1", true], ["charge", "2", true], ["iron-defense", "6", false],
    ["psyshield-bash", "1", false], ["rock-polish", "2", false], ["whirlwind", "2", false], ["shell-smash", "-1", false],
    ["stuff-cheeks", "2", false], ["stockpile", "1", false], ["clangorous-soul", "1", false], ["scale-shot", "-2", false],
    ["shelter", "5", false]
  ]) {
    const item = move(id);
    const focus = concentrates ? concentration(item.actor) : null;
    usage(item, focus ? { concentration: focus.id } : {});
    await paints();
    const applied = item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.ok(applied, id);
    assert.equal(acValue(applied), ac, id);
    assert.equal(applied.getFlag("dnd5e", "dependentOn"), focus?.uuid, id);
  }
});

test("batch 5a buffs scale with level and keep their extra changes and expiry", () => {
  const built = (id, level = 1) => buildMoveModifierEffects({ id }, "en", { level }).effects[0];
  assert.ok(built("victory-dance", 10).changes.every(change => change.value === "2"));
  assert.deepEqual([acValue(built("quiver-dance", 10)), acValue(built("quiver-dance", 9))], ["2", "1"]);
  assert.equal(acValue(built("swords-dance", 10)), "2");
  assert.ok(built("shell-smash").changes.some(change => change.key.endsWith(".damage") && change.value === "@prof"));
  assert.ok(built("rock-polish").changes.some(change => change.key === "system.attributes.movement.bonus" && change.value === "20"));
  for (const id of ["iron-defense", "psyshield-bash", "scale-shot", "steel-wing"]) {
    assert.equal(built(id).flags[MODULE_ID].expireAtEndOfNextTurn, true, id);
  }
  for (const id of ["charge", "whirlwind", "shelter"]) {assert.equal(built(id).flags[MODULE_ID].expireAtStartTurn, true, id);}
  assert.deepEqual(built("rock-polish").duration, { rounds: 3 });
});

test("Clangorous Soul and Stockpile stack on repeated use up to their caps", async () => {
  for (const [id, max] of [["clangorous-soul", 5], ["stockpile", 3], ["stuff-cheeks", 2]]) {
    const item = move(id);
    for (let index = 0; index < max + 1; index++) {
      usage(item);
      await paints();
    }
    const applied = item.actor.effects.filter(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.equal(applied.length, 1, id);
    assert.equal(applied[0].getFlag(MODULE_ID, "stackCount"), max, id);
  }
});

test("natural-roll AC breaks apply at their threshold, last for the combat and respect their stack caps", async () => {
  for (const [id, threshold, max] of [["crunch", 18, 5], ["iron-tail", 19, 1], ["liquidation", 18, 5],
    ["razor-shell", 18, 5], ["rock-smash", 19, 1], ["shadow-bone", 18, 5]]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, threshold - 1));
    assert.equal(target.effects.length, 0, id);
    for (let index = 0; index < max + 1; index++) {await show(attack(item, target, threshold));}
    assert.equal(target.effects.length, 1, id);
    assert.equal(target.effects[0].getFlag(MODULE_ID, "stackCount"), max, id);
    assert.equal(target.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true, id);
    assert.equal(acValue(target.effects[0]), String(-max), id);
  }
});

test("Steel Wing raises its user's AC on a natural 19+, not the target's", async () => {
  const item = move("steel-wing");
  const target = actor();
  await show(attack(item, target, 18));
  assert.equal(item.actor.effects.length, 0);
  await show(attack(item, target, 19));
  assert.equal(target.effects.length, 0);
  assert.equal(acValue(item.actor.effects[0]), "1");
});

test("Grav Apple needs hit plus failed save; Clanging Scales needs a save failed by 5 or more", async () => {
  const apple = move("grav-apple");
  const target = actor();
  await show(sprayHit(apple, target, "Usage.apple"));
  await show(spraySave(apple, target, "Usage.apple"));
  assert.equal(acValue(target.effects[0]), "-1");
  const scales = move("clanging-scales");
  const close = actor();
  const failedByFour = spraySave(scales, close, "Usage.scales");
  failedByFour.rolls[0].total = 8;
  await show(failedByFour);
  assert.equal(close.effects.length, 0);
  await show(spraySave(scales, close, "Usage.scales2"));
  assert.equal(acValue(close.effects[0]), "-1");
  assert.equal(close.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true);
});

test("natural-roll AC breaks wait for Dice So Nice before applying", async () => {
  const item = move("crunch");
  const target = actor();
  let finish;
  game.dice3d = { waitFor3DAnimationByMessageID: () => new Promise(resolve => { finish = resolve; }) };
  try {
    await show(attack(item, target, 20));
    assert.equal(target.effects.length, 0, "must not apply while the dice are still rolling");
    finish();
    await paints();
    assert.equal(target.effects.length, 1);
  } finally {delete game.dice3d;}
});

const attackValue = applied => applied.changes.find(change => change.key === "system.bonuses.mwak.attack")?.value;

test("batch 5b self attack buffs apply on use and scale with level", async () => {
  for (const [id, value] of [["meditate", "1"], ["sharpen", "1d4"], ["work-up", "2"]]) {
    const item = move(id);
    usage(item, id === "work-up" ? {} : { concentration: concentration(item.actor).id });
    await paints();
    assert.equal(attackValue(item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id)), value, id);
  }
  const built = (id, level) => buildMoveModifierEffects({ id }, "en", { level }).effects[0];
  assert.deepEqual([4, 5, 10, 17].map(level => attackValue(built("meditate", level))), ["1", "2", "3", "4"]);
  assert.equal(attackValue(built("sharpen", 10)), "1d6");
});

test("batch 5b attack debuffs use their triggers, caps and durations", async () => {
  for (const [id, roll, max, value] of [["octazooka", 18, 1, "-1"], ["play-rough", 19, 5, "-5"]]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, roll - 1));
    for (let index = 0; index < max + 1; index++) {await show(attack(item, target, roll));}
    assert.equal(target.effects.length, 1, id);
    assert.equal(attackValue(target.effects[0]), value, id);
    assert.equal(target.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true, id);
  }
  const sand = move("sand-attack");
  const blinded = actor();
  for (let index = 0; index < 6; index++) {await show(message(sand, blinded));}
  assert.equal(attackValue(blinded.effects[0]), "-5");
  const ball = move("shadow-ball");
  const covered = actor();
  await show(message(ball, covered, { type: "attack", success: false }));
  assert.equal(covered.effects.length, 0);
  await show(message(ball, covered, { type: "attack", success: true }));
  assert.equal(attackValue(covered.effects[0]), "-2");
  assert.equal(covered.effects[0].getFlag(MODULE_ID, "expireAtEndOfNextTurn"), true);
});

test("Ancient Power, Silver Wind and Ominous Wind raise the user's ability scores on a natural 19+", async () => {
  for (const [id, max] of [["ancient-power", 5], ["silver-wind", 5], ["ominous-wind", 1]]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, 18));
    assert.equal(item.actor.effects.length, 0, id);
    for (let index = 0; index < max + 1; index++) {await show(attack(item, target, 19));}
    const applied = item.actor.effects[0];
    assert.equal(target.effects.length, 0, id);
    assert.equal(applied.getFlag(MODULE_ID, "stackCount"), max, id);
    assert.equal(applied.changes.length, 6, id);
    assert.ok(applied.changes.every(change => change.key.startsWith("system.abilities.") && change.value === String(max)), id);
  }
});

test("Feather Dance removes proficiency from attacks and ends with the user's concentration", async () => {
  const item = move("feather-dance");
  const focus = concentration(item.actor);
  const card = createFlagDocument({ uuid: "ChatMessage.feather-card", documentName: "ChatMessage",
    system: { concentration: focus.id } });
  game.messages = new Map([[card.id, card]]);
  try {
    const target = actor();
    const save = message(item, target);
    save.rolls[0].options[MODULE_ID].modifierUsage.usageMessageId = card.id;
    await show(save);
    assert.equal(attackValue(target.effects[0]), "-@prof");
    assert.equal(target.effects[0].getFlag("dnd5e", "dependentOn"), focus.uuid);
  } finally {delete game.messages;}
});

const changeValue = (applied, key) => applied.changes.find(change => change.key === key)?.value;

test("batch 5c self save buffs apply on use with advantage modes, dice and expiry", async () => {
  for (const [id, key, value, concentrates] of [
    ["aromatic-mist", "system.bonuses.abilities.save", "1d4", false],
    ["cosmic-power", "system.abilities.wis.save.roll.mode", "1", true],
    ["hammer-arm", "system.abilities.dex.save.roll.mode", "-1", false],
    ["ice-hammer", "system.abilities.dex.save.roll.mode", "-1", false]
  ]) {
    const item = move(id);
    const focus = concentrates ? concentration(item.actor) : null;
    usage(item, focus ? { concentration: focus.id } : {});
    await paints();
    const applied = item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.equal(changeValue(applied, key), value, id);
    assert.equal(applied.getFlag("dnd5e", "dependentOn"), focus?.uuid, id);
  }
  const built = (id, level = 1) => buildMoveModifierEffects({ id }, "en", { level }).effects[0];
  assert.equal(changeValue(built("aromatic-mist", 10), "system.bonuses.abilities.save"), "1d6");
  assert.equal(built("cosmic-power").changes.length, 6);
  assert.equal(built("hammer-arm").flags[MODULE_ID].expireAtStartTurn, true);
  assert.equal(changeValue(built("hammer-arm"), "system.attributes.movement.walk"), "0.5");
});

test("batch 5c save debuffs apply on a failed save with their caps and durations", async () => {
  for (const [id, key, times, value] of [
    ["apple-acid", "system.abilities.con.bonuses.save", 4, "-6"],
    ["lumina-crash", "system.abilities.wis.bonuses.save", 2, "-2"],
    ["tearful-look", "system.bonuses.mwak.attack", 6, "-5"]
  ]) {
    const item = move(id);
    const target = actor();
    for (let index = 0; index < times; index++) {await show(message(item, target));}
    assert.equal(target.effects.length, 1, id);
    assert.equal(changeValue(target.effects[0], key), value, id);
  }
  const built = id => buildMoveModifierEffects({ id }, "en", { level: 1 }).effects[0];
  assert.equal(built("apple-acid").flags[MODULE_ID].removeOnCombatEnd, true);
  assert.equal(built("lumina-crash").flags[MODULE_ID].expireAtEndOfNextTurn, true);
  assert.deepEqual(built("tearful-look").duration, { seconds: 60 });
});

const speedValue = applied => changeValue(applied, "system.attributes.movement.bonus");

test("batch 5d self speed buffs apply on use, stack and expire as written", async () => {
  for (const [id, uses, value, concentrates] of [["aqua-step", 1, "10", false], ["autotomize", 4, "30", false],
    ["shift-gear", 1, "10", true]]) {
    const item = move(id);
    const focus = concentrates ? concentration(item.actor) : null;
    for (let index = 0; index < uses; index++) {
      usage(item, focus ? { concentration: focus.id } : {});
      await paints();
    }
    const applied = item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.equal(speedValue(applied), value, id);
    assert.equal(applied.getFlag("dnd5e", "dependentOn"), focus?.uuid, id);
  }
  const built = id => buildMoveModifierEffects({ id }, "en", { level: 1 }).effects[0];
  assert.equal(built("aqua-step").flags[MODULE_ID].expireAtEndOfNextTurn, true);
  assert.equal(changeValue(built("shift-gear"), "system.bonuses.mwak.damage"), "1");
});

test("Flame Charge, Esper Wing and Trailblaze speed up their user on each hit, up to +30", async () => {
  for (const id of ["flame-charge", "esper-wing", "trailblaze"]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, 5, { hit: false }));
    assert.equal(item.actor.effects.length, 0, id);
    for (let index = 0; index < 7; index++) {await show(attack(item, target, 5, { hit: true }));}
    assert.equal(target.effects.length, 0, id);
    assert.equal(speedValue(item.actor.effects[0]), "30", id);
    assert.equal(item.actor.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true, id);
  }
});

test("Tar Shot slows the target by 10 per hit and adds fire vulnerability once", async () => {
  const item = move("tar-shot");
  const target = actor();
  await show(attack(item, target, 5, { hit: true }));
  await show(attack(item, target, 5, { hit: true }));
  assert.equal(speedValue(target.effects[0]), "-20");
  assert.equal(changeValue(target.effects[0], "system.traits.dv.value"), "fire");
  assert.equal(target.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true);
});

test("batch 5e self buffs apply on use with their changes, caps and expiry", async () => {
  for (const [id, key, uses, value, concentrates] of [
    ["belly-drum", "system.abilities.str.value", 1, "10", false],
    ["dragon-dance", "system.bonuses.mwak.attack", 1, "@prof", true],
    ["hone-claws", "system.bonuses.mwak.damage", 4, "3", false],
    ["rage", "system.traits.dr.value", 1, "normal", true],
    ["superpower", "system.abilities.dex.value", 1, "-10", false]
  ]) {
    const item = move(id);
    const focus = concentrates ? concentration(item.actor) : null;
    for (let index = 0; index < uses; index++) {
      usage(item, focus ? { concentration: focus.id } : {});
      await paints();
    }
    const applied = item.actor.effects.find(entry => entry.getFlag(MODULE_ID, "sourceMove") === id);
    assert.equal(changeValue(applied, key), value, id);
    assert.equal(applied.getFlag("dnd5e", "dependentOn"), focus?.uuid, id);
  }
  const built = (id, level = 1) => buildMoveModifierEffects({ id }, "en", { level }).effects[0];
  assert.deepEqual([4, 5, 10, 17].map(level => changeValue(built("rage", level), "system.bonuses.mwak.damage")), ["1", "2", "4", "6"]);
  assert.equal(changeValue(built("rage"), "system.abilities.str.check.roll.mode"), "1");
  assert.equal(built("belly-drum").flags[MODULE_ID].removeOnCombatEnd, true);
  assert.equal(built("superpower").flags[MODULE_ID].expireAtEndOfNextTurn, true);
});

test("Trop Kick lowers the target's attacks on a natural 16+, up to -3 for the combat", async () => {
  const item = move("trop-kick");
  const target = actor();
  await show(attack(item, target, 15));
  assert.equal(target.effects.length, 0);
  for (let index = 0; index < 4; index++) {await show(attack(item, target, 16));}
  assert.equal(changeValue(target.effects[0], "system.bonuses.mwak.attack"), "-3");
  assert.equal(target.effects[0].getFlag(MODULE_ID, "removeOnCombatEnd"), true);
});

const rollModesOf = entry => entry?.getFlag(MODULE_ID, "rollModes");

test("batch 5f debuffs carry their roll modes to the target on their trigger", async () => {
  for (const [id, natural, hit, expected] of [
    ["aurora-beam", 15, true, { own: -1 }],
    ["spirit-break", 5, true, { own: -1, nextAttack: 1 }],
    ["earth-power", 19, false, { against: 1, nextAttack: 1 }],
    // Close Combat applies on use, hit or miss.
    ["close-combat", 1, false, { own: 1, vsSource: true }]
  ]) {
    const item = move(id);
    const target = actor();
    await show(attack(item, target, natural - 1 || 1, { hit: false }));
    if (id !== "close-combat") {assert.equal(target.effects.length, 0, id);}
    await show(attack(item, target, natural, { hit }));
    assert.deepEqual(rollModesOf(target.effects[0]), expected, id);
    assert.equal(target.effects[0].getFlag(MODULE_ID, "sourceActorUuid"), item.actor.uuid, id);
  }
});

test("Crush Claw keeps one next-attack advantage per user on the same target", async () => {
  const target = actor();
  for (const item of [move("crush-claw"), move("crush-claw")]) {await show(attack(item, target, 15));}
  assert.equal(target.effects.length, 2);
  assert.deepEqual(rollModesOf(target.effects[0]), { against: 1, vsSource: true, nextAttack: 1 });
});

test("batch 5f self roll modes apply on use or on a high natural roll", async () => {
  const overheat = move("overheat");
  usage(overheat);
  await paints();
  assert.deepEqual(rollModesOf(overheat.actor.effects[0]), { own: -1, nextAttack: 1 });
  const cannon = move("armor-cannon");
  usage(cannon);
  await paints();
  assert.deepEqual(rollModesOf(cannon.actor.effects[0]), { against: 1 });
  assert.equal(changeValue(cannon.actor.effects[0], "system.abilities.con.save.roll.mode"), "-1");
  const claw = move("metal-claw");
  await show(attack(claw, actor(), 19, { hit: false }));
  assert.equal(changeValue(claw.actor.effects[0], "system.bonuses.mwak.attack"), "1");
  assert.deepEqual(rollModesOf(claw.actor.effects[0]), { own: 0, nextAttack: 1 });
});

test("Fake Tears and Metal Sound give +5 to everyone's attacks against the target", () => {
  for (const id of ["fake-tears", "metal-sound"]) {
    const built = buildMoveModifierEffects({ id }, "en").effects[0];
    assert.deepEqual(built.flags[MODULE_ID].targetedAttack, { bonusPerStack: 5, alliesOnly: false, excludeSource: false }, id);
    assert.equal(built.flags[MODULE_ID].expireAtEndOfNextTurn, true, id);
  }
  // Decorate keeps dnd5e's apply button; the GM picks the creature.
  assert.equal(buildMoveModifierEffects({ id: "decorate" }).activityEffects.length, 1);
});

function statusMove(id) {
  const item = move(id);
  item.effects.push(...buildMoveStatusEffects({ id }).effects.map(source => Object.assign(effect(source), { parent: item })));
  return item;
}

const statusOf = target => target.effects.map(applied => [applied.getFlag(MODULE_ID, "status"), applied.getFlag(MODULE_ID, "badlyPoisoned") === true]);

test("a failed save applies the Move's status after it is displayed; a success does not", async () => {
  const item = statusMove("hypnosis");
  const target = actor();
  await show(message(item, target, { success: true }));
  assert.deepEqual(statusOf(target), []);
  await show(message(item, target));
  assert.deepEqual(statusOf(target), [["asleep", false]]);
});

test("failed-save-by-5 statuses need a save missed by 5 or more", async () => {
  const item = statusMove("thunder");
  const target = actor();
  const close = message(item, target, { live: false });
  close.rolls[0].total = 10;
  Hooks.callAll("createChatMessage", close);
  await show(close);
  assert.deepEqual(statusOf(target), [], "missed by 2");
  await show(message(item, target));
  assert.deepEqual(statusOf(target), [["paralysis", false]]);
});

test("hit-and-failed-save statuses need both from the same usage (Poison Fang badly poisons)", async () => {
  const item = statusMove("poison-fang");
  const target = actor();
  await show(sprayHit(item, target, "Usage.fang"));
  assert.deepEqual(statusOf(target), [], "a hit alone");
  await show(spraySave(item, target, "Usage.fang"));
  assert.deepEqual(statusOf(target), [["poisoned", true]]);
});

test("Moves created before their status was automated get its templates once", async () => {
  const owner = actor();
  const bite = move("bite", owner);
  await synchronizeMoveStatusTemplates(owner);
  await synchronizeMoveStatusTemplates(owner);
  assert.deepEqual(bite.effects.map(applied => [applied.getFlag(MODULE_ID, "status"), applied.getFlag(MODULE_ID, "trigger")]),
    [["flinched", "natural-attack-19+"]]);
});

test("a d6 status table is one template that rolls in chat and applies that face's status", async () => {
  const rolled = [];
  globalThis.ChatMessage = { getSpeaker: () => ({}) };
  globalThis.Roll = class {
    async evaluate() { this.total = 5; return this; }
    async toMessage(data) {
      rolled.push(data.flavor);
      const shown = createFlagDocument({ id: `Roll.${++sequence}`, flags: data.flags });
      Hooks.callAll("dnd5e.renderChatMessage", shown, { isConnected: true });
      return shown;
    }
  };
  const item = statusMove("tri-attack");
  assert.equal(item.effects.filter(applied => applied.getFlag(MODULE_ID, "kind") === "pokemon-status").length, 1);
  const target = actor();
  await show(message(item, target));
  assert.equal(rolled.length, 1);
  assert.deepEqual(statusOf(target), [["paralysis", false]], "a 5 is paralysis");
  assert.equal(target.effects[0].getFlag(MODULE_ID, "randomStatuses"), undefined);
});

test("Toxic Spikes poisons on a failed save and badly poisons on a fail by 5", async () => {
  const item = statusMove("toxic-spikes");
  const close = actor();
  const result = message(item, close, { live: false });
  result.rolls[0].total = 10;
  Hooks.callAll("createChatMessage", result);
  await show(result);
  assert.deepEqual(statusOf(close), [["poisoned", false]]);
  const far = actor();
  await show(message(item, far));
  assert.deepEqual(statusOf(far), [["poisoned", true]]);
});

test("Psycho Shift moves its user's status to a target that fails its save", async () => {
  const item = statusMove("psycho-shift");
  const burn = effect({ name: "Burned", flags: { [MODULE_ID]: { kind: "pokemon-status", status: "burned" } } });
  burn.delete = async () => { item.actor.effects = item.actor.effects.filter(entry => entry !== burn); };
  item.actor.effects.push(burn);
  const target = actor();
  await show(message(item, target));
  assert.deepEqual(statusOf(target), [["burned", false]]);
  assert.equal(item.actor.effects.length, 0);
});

test("status riders batch 2: Fire Lash, Charm, V-create and Glaciate", () => {
  const built = id => buildMoveModifierEffects({ id }, "en").effects[0];
  const lash = built("fire-lash").flags[MODULE_ID];
  assert.equal(lash.trigger, "hit-and-failed-save");
  assert.deepEqual(lash.targetedAttack, { bonusPerStack: 1, alliesOnly: true, excludeSource: true });
  assert.equal(lash.maxStacks, 5);
  assert.equal(built("charm").flags[MODULE_ID].attackVsSource, -2);
  assert.equal(built("charm").flags[MODULE_ID].trigger, "failed-save");
  assert.equal(acValue(built("v-create")), "-2");
  assert.equal(built("v-create").flags[MODULE_ID].expireAtStartTurn, true);
  const glaciate = built("glaciate");
  assert.ok(glaciate.changes.some(change => change.key === "system.attributes.movement.bonus" && change.value === "-5"));
  assert.equal(glaciate.flags[MODULE_ID].trigger, "hit");
});
