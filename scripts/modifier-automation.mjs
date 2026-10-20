import { AUTOMATED_MODIFIER_MOVES, buildMoveModifierEffects } from "./modifier-effects.mjs";
import { buildMoveStatusEffects } from "./status-effects.mjs";
import { applyStatusTemplate } from "./attack-status-engine.mjs";
import { applyPokemonMoveModifier } from "./modifier-engine.mjs";
import { buildAttackOutcome, isNaturalAttackAtLeast } from "./attack-outcome-engine.mjs";
import { afterPaint, waitForVisibleResult } from "./chat-roll-display.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";

const MODULE_ID = "poke5e-local";
const NATURAL_AT_LEAST_TRIGGER = /^natural-attack-(\d+)\+$/;
// Statuses from saves are applied here; the attack-only ones ("hit", "natural-attack-N+") in attack-status-engine.
const SAVE_STATUS_TRIGGERS = new Set(["failed-save", "failed-save-by-5", "hit-and-failed-save"]);
const live = new Set();
const pending = new Map();
const actorsPending = new Map();
const combinedParts = new Map();
let registered = false;

function authority() {
  return game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

function actorFromUuid(uuid) {
  const doc = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return doc?.actor ?? doc;
}

function attackApplication(message, roll, item, template) {
  const trigger = template?.getFlag(MODULE_ID, "trigger");
  const natural = String(trigger ?? "").match(NATURAL_AT_LEAST_TRIGGER);
  if (!(trigger === "hit" || trigger === "hit-and-failed-save" || natural)) {return null;}
  const activity = message.getAssociatedActivity?.();
  if (!activity || activity.item?.uuid !== item.uuid) {return null;}
  const outcome = buildAttackOutcome(roll, activity);
  // Same contract as status riders (Scald): natural N+ applies regardless of hit/miss.
  const applies = natural ? isNaturalAttackAtLeast(outcome, Number(natural[1])) : outcome.hit === true;
  const recipient = template.getFlag(MODULE_ID, "target") === "self" ? item.actor : actorFromUuid(outcome.targetActorUuid);
  const actor = applies ? recipient : null;
  if (!actor) {return null;}
    const usageId = message.getFlag("dnd5e", "originatingMessage");
  return trigger === "hit-and-failed-save" ? { item, actor, part: "hit", usageId, template } : { item, actor, usageId, template };
}

function saveApplication(roll, save, item, template) {
  const trigger = template?.getFlag(MODULE_ID, "trigger");
  if (!["failed-save", "failed-save-by-5", "hit-and-failed-save"].includes(trigger) || !save?.usageMessageId) {return null;}
  const dc = Number(roll.options?.target ?? save.dc);
  if (!Number.isFinite(dc) || !Number.isFinite(Number(roll.total))) {return null;}
  const success = typeof roll.isSuccess === "boolean" ? roll.isSuccess : Number(roll.total) >= dc;
  if (success || (trigger === "failed-save-by-5" && dc - Number(roll.total) < 5)) {return null;}
  const actor = actorFromUuid(save.actorUuid);
  const usageId = save.usageMessageId;
    return trigger === "hit-and-failed-save" ? { item, actor, part: "failed-save", usageId, template } : { item, actor, usageId, template };
}

// The Move's stat change (one application applies all of them) and each status a save gives.
function automatedTemplates(item) {
  const modifier = AUTOMATED_MODIFIER_MOVES.has(item.getFlag(MODULE_ID, "sourceId"))
    ? item.effects.find(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier") : null;
  const statuses = item.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status" &&
    SAVE_STATUS_TRIGGERS.has(effect.getFlag(MODULE_ID, "trigger")));
  return [modifier, ...statuses].filter(Boolean);
}

function eligibleApplications(message, roll) {
  const save = roll.options?.[MODULE_ID]?.modifierUsage;
  const type = message.getFlag("dnd5e", "roll.type");
  const item = save ? fromUuidSync(save.itemUuid, { strict: false }) : message.getAssociatedItem?.();
  if (item?.getFlag(MODULE_ID, "kind") !== "move" || !["attack", "save"].includes(type)) {return [];}
  return automatedTemplates(item).map(template => (type === "attack"
    ? attackApplication(message, roll, item, template) : saveApplication(roll, save, item, template))).filter(Boolean);
}

const isStatus = template => template?.getFlag(MODULE_ID, "kind") === "pokemon-status";

// Hit and failed save arrive as separate messages of the same usage, in either order.
// shortcut: kept in memory, so a GM reload between the attack and the save loses the pair; persist on the usage message if that matters.
function completesCombined({ actor, part, usageId, template }) {
  if (!part) {return true;}
  if (!usageId || !actor) {return false;}
  const key = `${usageId}:${actor.uuid}:${isStatus(template) ? template.id : "modifier"}`;
  const parts = combinedParts.get(key) ?? new Set();
  parts.add(part);
  if (parts.size < 2) {
    combinedParts.set(key, parts);
    return false;
  }
  combinedParts.delete(key);
  return true;
}

// Debuffs from a concentration move end with the user's concentration, found through its usage card.
function usageConcentration(item, usageId) {
  const template = item.effects.find(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier");
  const id = template?.getFlag(MODULE_ID, "concentration") ? game.messages?.get(usageId)?.system?.concentration : null;
  return id ? item.actor?.effects.find(effect => effect.id === id)?.uuid ?? null : null;
}

// Serialize applications from different roll messages to avoid losing stacks.
async function applyApplication({ actor, item, usageId, template, dependentOn = usageConcentration(item, usageId) }) {
  if (!isPokemonActor(actor)) {return;}
  const previous = actorsPending.get(actor.uuid) ?? Promise.resolve();
  const task = previous.then(() => (isStatus(template) ? applyStatusTemplate(actor, template) : applyPokemonMoveModifier(actor, item, { dependentOn })));
  const settled = task.catch(() => {});
  actorsPending.set(actor.uuid, settled);
  try {await task;} finally {
    if (actorsPending.get(actor.uuid) === settled) {actorsPending.delete(actor.uuid);}
  }
}

async function applyDisplayedModifiers(message, record) {
  await game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
  await afterPaint();
  if (!await waitForVisibleResult(record)) {throw new Error("No se pudo mostrar la tirada del modificador.");}
  await afterPaint();
  if (!authority()) {return;}
  // One message can contain several roll parts for the same target.
  const applications = new Map();
    for (const roll of message.rolls ?? []) {
    for (const application of eligibleApplications(message, roll).filter(entry => entry.actor)) {
      const which = isStatus(application.template) ? application.template.id : "modifier";
      applications.set(`${application.actor.uuid}:${application.item.uuid}:${which}`, application);
    }
  }
  for (const application of applications.values()) {
    if (completesCombined(application)) {await applyApplication(application);}
  }
}

export function onRenderedMoveModifier(message, html) {
  if (!authority() || !live.has(message.id)) {return;}
  const previous = pending.get(message.id);
  if (previous) {
    previous.html = html;
    void afterPaint().then(() => previous.refresh?.());
    return;
  }
    if (!Array.from(message.rolls ?? []).some(roll => eligibleApplications(message, roll).some(application => application.actor))) {
    live.delete(message.id);
    return;
  }
  const record = { html };
  pending.set(message.id, record);
  void applyDisplayedModifiers(message, record).then(() => live.delete(message.id)).catch(error => {
    console.error(`[${MODULE_ID}] Error aplicando modificador automático`, error);
    ui.notifications.error(error.message);
  }).finally(() => pending.delete(message.id));
}

// Self buffs apply when the usage card is created; dnd5e has already started concentration by then.
export async function onCreateUsageMessage(message) {
  if (!authority() || message.type !== "usage") {return;}
  const item = message.getAssociatedItem?.();
  if (item?.getFlag(MODULE_ID, "kind") !== "move" || !AUTOMATED_MODIFIER_MOVES.has(item.getFlag(MODULE_ID, "sourceId")) ||
    !item.effects.some(effect => effect.getFlag(MODULE_ID, "trigger") === "self")) {return;}
  const concentrationId = message.system?.concentration;
  const concentration = concentrationId ? item.actor?.effects.find(effect => effect.id === concentrationId) : null;
  await applyApplication({ actor: item.actor, item, dependentOn: concentration?.uuid ?? null });
}

// Moves imported before automation still carry dnd5e's apply button; never let it duplicate an active modifier.
export function onPreCreateModifierEffect(effect) {
  const actor = effect.parent;
  const stackKey = effect.getFlag?.(MODULE_ID, "stackKey");
  if (actor?.documentName !== "Actor" || effect.getFlag?.(MODULE_ID, "kind") !== "pokemon-modifier" ||
    !AUTOMATED_MODIFIER_MOVES.has(effect.getFlag(MODULE_ID, "sourceMove"))) {return true;}
  return !actor.effects.some(existing => !existing.disabled && existing.getFlag(MODULE_ID, "stackKey") === stackKey);
}

export async function synchronizeAutomatedMoveModifiers(actor) {
  if (!isPokemonActor(actor)) {return;}
  for (const item of actor.items ?? []) {
    const id = item.getFlag(MODULE_ID, "sourceId");
    if (item.getFlag(MODULE_ID, "kind") !== "move" || !AUTOMATED_MODIFIER_MOVES.has(id) ||
      item.effects.some(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier")) {continue;}
    const move = item.getFlag(MODULE_ID, "moveDefinition");
    if (!move) {continue;}
    const source = buildMoveModifierEffects(move, game.settings.get(MODULE_ID, "language"));
    await item.createEmbeddedDocuments("ActiveEffect", source.effects);
  }
}

// Moves created before their status was automated get its templates (Frozen reads its DC from whoever froze it).
export async function synchronizeMoveStatusTemplates(actor) {
  if (!isPokemonActor(actor)) {return;}
  for (const item of actor.items ?? []) {
    if (item.getFlag(MODULE_ID, "kind") !== "move" || item.effects.some(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status")) {continue;}
    const { effects } = buildMoveStatusEffects({ id: item.getFlag(MODULE_ID, "sourceId") }, game.settings.get(MODULE_ID, "language"));
    if (effects.length) {await item.createEmbeddedDocuments("ActiveEffect", effects);}
  }
}

function allPokemonActors() {
  const actors = new Map(Array.from(game.actors ?? []).map(actor => [actor.uuid, actor]));
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {actors.set(token.actor.uuid, token.actor);}
    }
  }
  return [...actors.values()].filter(isPokemonActor);
}

export async function clearEncounterMoveModifiers() {
  if (!authority()) {return;}
  for (const actor of allPokemonActors()) {
    const ids = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier" &&
      effect.getFlag(MODULE_ID, "removeOnCombatEnd")).map(effect => effect.id);
    if (ids.length) {await actor.deleteEmbeddedDocuments("ActiveEffect", ids);}
  }
}

export function registerMoveModifierAutomation() {
  if (registered) {return;}
  registered = true;
  const run = task => { void task.catch(error => console.error(`[${MODULE_ID}] Error en modificadores de movimientos`, error)); };
  // Historical messages must never reapply effects on opening or refreshing chat.
  Hooks.on("createChatMessage", message => { if (authority() && message.rolls?.length) {live.add(message.id);} });
  Hooks.on("createChatMessage", message => run(onCreateUsageMessage(message)));
  Hooks.on("preCreateActiveEffect", onPreCreateModifierEffect);
  Hooks.on("dnd5e.renderChatMessage", onRenderedMoveModifier);
  Hooks.on("deleteChatMessage", message => live.delete(message.id));
  Hooks.once("ready", () => {
    if (authority()) {run((async () => {
      for (const actor of allPokemonActors()) {
        await synchronizeAutomatedMoveModifiers(actor);
        await synchronizeMoveStatusTemplates(actor);
      }
    })());}
  });
  Hooks.on("deleteCombat", () => run(clearEncounterMoveModifiers()));
  Hooks.on("updateCombat", (_combat, changes) => { if (changes.started === false) {run(clearEncounterMoveModifiers());} });
}
