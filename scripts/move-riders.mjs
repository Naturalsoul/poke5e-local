import { buildAttackOutcome } from "./attack-outcome-engine.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { CONDITION_KIND } from "./condition-riders.mjs";
import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";

/* ============================================================
 * MOVE RIDERS
 *
 * One-off effects of a few Moves, run by the active GM from the chat messages (after Dice So Nice):
 * - Clear Smog: on a hit, the target's stat changes are reset.
 * - Incinerate: on a hit, the target's held berry burns to ash.
 * - Eternabeam: its user is incapacitated until the end of its next turn.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const LABELS = {
  es: { cleared: "pierde sus cambios de estadísticas", burned: name => `se queda sin ${name}: se ha reducido a cenizas`,
    worn: "Eternabeam — Incapacitado" },
  en: { cleared: "loses its stat changes", burned: name => `loses its ${name}: it burned to ash`,
    worn: "Eternabeam — Incapacitated" }
};
const text = () => LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"];
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const authority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);
const actorFromUuid = uuid => {
  const document = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return document?.actor ?? document;
};

async function chat(actor, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<p>${html}</p>` });
}

export const HIT_RIDERS = Object.freeze({
  "clear-smog": async target => {
    const ids = Array.from(target.effects ?? []).filter(effect => effect.getFlag?.(MODULE_ID, "kind") === "pokemon-modifier")
      .map(effect => effect.id);
    if (!ids.length) {return;}
    await target.deleteEmbeddedDocuments("ActiveEffect", ids);
    await chat(target, `<strong>${escape(target.name)}</strong> ${text().cleared}.`);
  },
  incinerate: async target => {
    const held = getPokemonHeldItem(target);
    if (held?.getFlag?.(MODULE_ID, "itemType") !== "berry") {return;}
    await held.delete();
    await chat(target, `<strong>${escape(target.name)}</strong> ${text().burned(escape(held.name))}.`);
  }
});

async function onAttackMessage(message) {
  const item = message.getAssociatedItem?.();
  const rider = HIT_RIDERS[moveId(item)];
  const roll = message.rolls?.[0];
  if (!rider || !roll) {return;}
  await game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
  const outcome = buildAttackOutcome(roll, message.getAssociatedActivity?.());
  const target = outcome.hit === true ? actorFromUuid(outcome.targetActorUuid) : null;
  if (target) {await rider(target);}
}

export function eternabeamEffect() {
  return { name: text().worn, img: "systems/dnd5e/icons/svg/statuses/incapacitated.svg", statuses: ["incapacitated"],
    transfer: false, changes: [], flags: { [MODULE_ID]: { kind: CONDITION_KIND, condition: "incapacitated", sourceMove: "eternabeam",
      ...endOfNextTurnFlags() } } };
}

async function onUsageMessage(message) {
  const item = message.getAssociatedItem?.();
  if (moveId(item) === "eternabeam" && item.actor) {await item.actor.createEmbeddedDocuments("ActiveEffect", [eternabeamEffect()]);}
}

function onCreateChatMessage(message) {
  if (!authority()) {return;}
  const attack = message.getFlag?.("dnd5e", "roll.type") === "attack";
  if (message.type !== "usage" && !attack) {return;}
  void (attack ? onAttackMessage(message) : onUsageMessage(message))
    .catch(error => console.error(`[${MODULE_ID}] move riders`, error));
}

let registered = false;

export function registerMoveRiders() {
  if (registered) {return;}
  registered = true;
  Hooks.on("createChatMessage", onCreateChatMessage);
}
