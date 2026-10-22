import { pokemonTypes } from "./status-runtime.mjs";
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
 * - Moves with a wider critical range (19-20, Fickle Beam 17-20, Frost Breath 16-20), set on the roll itself.
 * - Feint Attack: always rolled with advantage.
 * - Damage that depends on hit points, added to the damage roll before it is rolled: Brine, Flail, Reversal
 *   (the formula repeated, so a critical still doubles its dice), Hex and Wring Out (MOVE again), Hard Press
 *   (+proficiency), Eruption (STAB again), Dragon Energy (+1d6 per 20 HP) and Rage Fist (+1 per 10 HP missing).
 *   The target is the one targeted when the damage is rolled.
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

const crit19 = ["air-cutter", "aqua-cutter", "attack-order", "blaze-kick", "crabhammer", "cross-chop", "drill-peck", "drill-run",
  "esper-wing", "hyper-fang", "ivy-cudgel", "karate-chop", "leaf-blade", "night-slash", "psycho-cut", "razor-leaf", "seismic-toss",
  "shadow-claw", "slash"];
export const CRITICAL_RANGES = Object.freeze({ ...Object.fromEntries(crit19.map(id => [id, 19])), "fickle-beam": 17, "frost-breath": 16 });

// Lowest threshold wins, so Super Luck or another source never narrows the Move's own range.
const ADVANTAGE_MOVES = new Set(["feint-attack"]);

export function onPreRollAttackCritical(config) {
  const id = moveId(config?.subject?.item);
  const threshold = CRITICAL_RANGES[id];
  if (!threshold && !ADVANTAGE_MOVES.has(id)) {return;}
  for (const rollConfig of config.rolls ?? []) {
    rollConfig.options ??= {};
    if (threshold) {rollConfig.options.criticalSuccess = Math.min(rollConfig.options.criticalSuccess ?? 20, threshold);}
    if (ADVANTAGE_MOVES.has(id)) {rollConfig.options.advantage = true;}
  }
}

const hpShare = actor => {
  const hp = actor?.system?.attributes?.hp;
  return hp?.max > 0 ? hp.value / hp.max : null;
};
const hasStatus = actor => Array.from(actor?.effects ?? []).some(effect => !effect.disabled && effect.getFlag?.(MODULE_ID, "kind") === "pokemon-status");
// MOVE: the modifier of the ability the Move attacks with.
const moveModifier = (actor, activity) => Number(actor?.system?.abilities?.[activity?.attack?.ability]?.mod) || 0;
const proficiency = actor => Number(actor?.system?.attributes?.prof) || 0;
const lowHpMultiplier = user => { const share = hpShare(user); if (share === null) {return 1;} if (share <= 0.1) {return 3;} return share < 0.5 ? 2 : 1; };

// Each returns { times, extra }: the formula repeated `times` over, plus extra parts.
export const DAMAGE_RIDERS = Object.freeze({
  brine: ({ target }) => ({ times: hpShare(target) !== null && hpShare(target) < 0.5 ? 2 : 1 }),
  flail: ({ user }) => ({ times: lowHpMultiplier(user) }),
  reversal: ({ user }) => ({ times: lowHpMultiplier(user) }),
  hex: ({ user, target, activity }) => ({ extra: hasStatus(target) ? [moveModifier(user, activity)] : [] }),
  "wring-out": ({ user, target, activity }) => ({ extra: hpShare(target) >= 0.5 ? [moveModifier(user, activity)] : [] }),
  "hard-press": ({ user, target }) => ({ extra: hpShare(target) > 0.5 ? [proficiency(user)] : [] }),
  eruption: ({ user, item }) => ({ extra: hpShare(user) >= 1 && pokemonTypes(user).includes(item.getFlag(MODULE_ID, "moveDefinition")?.type)
    ? [proficiency(user)] : [] }),
  "dragon-energy": ({ user }) => {
    const dice = Math.floor((Number(user?.system?.attributes?.hp?.value) || 0) / 20);
    return { extra: dice > 0 ? [`${dice}d6`] : [] };
  },
  "rage-fist": ({ user }) => {
    const hp = user?.system?.attributes?.hp;
    const bonus = Math.floor(((Number(hp?.max) || 0) - (Number(hp?.value) || 0)) / 10);
    return { extra: bonus > 0 ? [bonus] : [] };
  }
});

const targetedActor = () => (game.user?.targets?.size === 1 ? [...game.user.targets][0]?.actor ?? null : null);

export function onPreRollDamageRiders(config) {
  const activity = config?.subject;
  const item = activity?.item;
  const rider = DAMAGE_RIDERS[moveId(item)];
  const roll = config?.rolls?.[0];
  if (!rider || !roll || config.isHealing) {return;}
  const { times = 1, extra = [] } = rider({ user: activity.actor, target: targetedActor(), activity, item });
  const base = [...(roll.parts ?? [])];
  roll.parts = [...Array.from({ length: times }, () => base).flat(), ...extra.filter(Boolean).map(String)];
}

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
  Hooks.on("dnd5e.preRollAttack", onPreRollAttackCritical);
  Hooks.on("dnd5e.preRollDamage", onPreRollDamageRiders);
}
