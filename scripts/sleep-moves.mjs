import { findStatusEffect } from "./status-runtime.mjs";
import { applyPokemonStatus } from "./pokemon-status-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { distanceBetween } from "./battlefield-service.mjs";
import { areaDamage } from "./lingering-area-moves.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";

/* ============================================================
 * MOVES ABOUT SLEEP
 *
 * - Snore and Sleep Talk can only be used while asleep; Sleep Talk then uses one of its 1-action Moves,
 *   picked by a die rolled in chat;
 * - Sing (applied by the GM from the usage card): 5d8 hit points of creatures within 30 ft fall asleep,
 *   lowest current hit points first;
 * - Nightmare (same): its damage to every sleeping creature within 60 ft, without waking them.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const ASLEEP_ONLY = new Set(["snore", "sleep-talk"]);

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const authority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] sleep moves`, error)); };
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);
const others = user => [...new Set(Array.from(game.combat?.combatants ?? []).map(combatant => combatant.actor))]
  .filter(actor => isPokemonActor(actor) && actor !== user);
const hp = actor => Number(actor.system?.attributes?.hp?.value ?? 0);

async function rollInChat(actor, formula, flavor) {
  const roll = await new Roll(formula).evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return roll.total;
}

function onPreUseActivity(activity) {
  if (!ASLEEP_ONLY.has(moveId(activity?.item)) || findStatusEffect(activity.actor, "asleep")) {return true;}
  ui.notifications.warn(en() ? `${activity.item.name} can only be used while asleep.` : `${activity.item.name} solo se puede usar dormido.`);
  return false;
}

// Sing: who falls asleep from a pool of hit points, lowest first; already asleep creatures don't count.
export function singTargets(pool, creatures) {
  const chosen = [];
  let left = pool;
  for (const actor of creatures.filter(creature => !findStatusEffect(creature, "asleep")).sort((a, b) => hp(a) - hp(b))) {
    if (hp(actor) > left) {break;}
    left -= hp(actor);
    chosen.push(actor);
  }
  return chosen;
}

async function sing(user, item) {
  const pool = await rollInChat(user, "5d8", `${item.name} — 5d8`);
  const nearby = others(user).filter(actor => distanceBetween(actor, user) <= 30);
  for (const actor of singTargets(pool, nearby)) {await applyPokemonStatus(actor, "asleep", { language: en() ? "en" : "es" });}
}

async function nightmare(user, item) {
  for (const actor of others(user)) {
    if (findStatusEffect(actor, "asleep") && distanceBetween(actor, user) <= 60) {await areaDamage(actor, item, false);}
  }
}

export async function onCreateUsageMessage(message) {
  if (!authority() || message.type !== "usage") {return;}
  const item = message.getAssociatedItem?.();
  const action = { sing, nightmare }[moveId(item)];
  if (action && isPokemonActor(item.actor)) {await action(item.actor, item);}
}

// Sleep Talk: one of its other Moves that take 1 action.
export function sleepTalkMoves(actor) {
  return Array.from(actor.items ?? []).filter(item => moveId(item) && moveId(item) !== "sleep-talk" &&
    item.getFlag(MODULE_ID, "moveDefinition")?.activation?.type === "action");
}

async function onPostUseActivity(activity) {
  const actor = activity?.actor;
  if (moveId(activity?.item) !== "sleep-talk" || !actor?.isOwner) {return;}
  const moves = sleepTalkMoves(actor);
  if (!moves.length) {return;}
  const face = await rollInChat(actor, `1d${moves.length}`, moves.map((move, index) => `${index + 1}. ${move.name}`).join(" · "));
  await moves[face - 1].use();
}

let registered = false;

export function registerSleepMoves() {
  if (registered) {return;}
  registered = true;
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", activity => logged(onPostUseActivity(activity)));
  Hooks.on("createChatMessage", message => logged(onCreateUsageMessage(message)));
}
