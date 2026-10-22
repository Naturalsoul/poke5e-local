import { pokemonTypes } from "./status-runtime.mjs";
import { buildAttackOutcome, subscribeAttackOutcome } from "./attack-outcome-engine.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { CONDITION_KIND } from "./condition-riders.mjs";
import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";

/* ============================================================
 * MOVE RIDERS
 *
 * One-off effects of a few Moves, run by the active GM from the chat messages (after Dice So Nice):
 * - Clear Smog: on a hit, the target's stat changes are reset.
 * - Incinerate: on a hit, the target's held berry burns to ash.
 * - Jump Kick, High Jump Kick and Supercell Slam: on a miss, the user takes 1 (or its proficiency) damage.
 * - Eternabeam: its user is incapacitated until the end of its next turn.
 * - Moves with a wider critical range (19-20, Fickle Beam 17-20, Frost Breath 16-20), set on the roll itself.
 * - Feint Attack: always rolled with advantage.
 * - Damage that depends on hit points, added to the damage roll before it is rolled: Brine, Flail, Reversal
 *   (the formula repeated, so a critical still doubles its dice), Hex and Wring Out (MOVE again), Hard Press
 *   (+proficiency), Eruption (STAB again), Dragon Energy (+1d6 per 20 HP) and Rage Fist (+1 per 10 HP missing).
 *   The target is the one targeted when the damage is rolled.
 * - Damage that depends on the battle: Stored Power and Power Trip (+1 die per boost on the user), Punishment (per
 *   boost on the target), Stomping Tantrum (double dice) and Temper Flare (+1 die) after a missed attack, Fury Cutter
 *   and Ice Ball (dice doubling each consecutive round they hit, up to x8) and Power-Up Punch (+1 die per
 *   consecutive hit on the same target, up to double), from each Pokémon's recent attacks.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const LABELS = {
  es: { cleared: "pierde sus cambios de estadísticas", burned: name => `se queda sin ${name}: se ha reducido a cenizas`,
    worn: "Eternabeam — Incapacitado",
    crash: "se estrella y recibe" },
  en: { cleared: "loses its stat changes", burned: name => `loses its ${name}: it burned to ash`,
    worn: "Eternabeam — Incapacitated",
    crash: "crashes and takes" }
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

export const MISS_RIDERS = Object.freeze({
  "jump-kick": () => 1,
  "high-jump-kick": () => 1,
  "supercell-slam": user => Number(user?.system?.attributes?.prof) || 0
});

async function crash(user, amount) {
  if (!user || amount <= 0) {return;}
  await user.applyDamage(amount);
  await chat(user, `<strong>${escape(user.name)}</strong> ${text().crash} ${amount}.`);
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

const ADVANTAGE_MOVES = new Set(["feint-attack"]);

// Lowest threshold wins, so Super Luck or another source never narrows the Move's own range.
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

// A boost: an active stat change with a positive value (Leer-like debuffs and penalties don't count).
const boosts = actor => Array.from(actor?.effects ?? []).filter(effect => !effect.disabled && effect.getFlag?.(MODULE_ID, "kind") === "pokemon-modifier"
  && Array.from(effect.changes ?? []).some(change => Number(change.value) > 0)).length;

// shortcut: kept in memory on the client that rolls the attacks, so a reload forgets it; move to actor flags if it matters.
const history = new Map();
export function recordAttack(outcome) {
  if (!outcome?.actorUuid || outcome.hit === null) {return;}
  const entries = history.get(outcome.actorUuid) ?? [];
  entries.push({ moveId: outcome.moveId, hit: outcome.hit, targetUuid: outcome.targetActorUuid, round: game.combat?.round ?? null });
  history.set(outcome.actorUuid, entries.slice(-10));
}
export const clearAttackHistory = () => history.clear();
// The attack being resolved is the latest; the one before it is "the last attack".
const attacks = actor => history.get(actor?.uuid) ?? [];
const missedLast = actor => attacks(actor).at(-2)?.hit === false;
// Consecutive hits with this Move ending with this one: each in the round after the previous (if `rounds`), on the same
// target (if `sameTarget`).
function streak(actor, id, { rounds = false, sameTarget = false } = {}) {
  const entries = attacks(actor);
  let count = 0;
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    const later = entries[index + 1];
    if (entry.moveId !== id || !entry.hit) {break;}
    if (later && rounds && entry.round !== null && later.round !== entry.round + 1) {break;}
    if (later && sameTarget && entry.targetUuid !== later.targetUuid) {break;}
    count++;
  }
  return count;
}
const die = (dice, count) => (count > 0 && dice ? [`${dice.number * count}d${dice.faces}`] : []);
const oneDie = (dice, count) => (count > 0 && dice ? [`${count}d${dice.faces}`] : []);
const doubling = ({ user, item, dice }) => {
  const multiplier = Math.min(8, 2 ** Math.max(0, streak(user, moveId(item), { rounds: true }) - 1));
  return { extra: die(dice, multiplier - 1) };
};

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
  },
  "stored-power": ({ user, dice }) => ({ extra: oneDie(dice, boosts(user)) }),
  "power-trip": ({ user, dice }) => ({ extra: oneDie(dice, boosts(user)) }),
  punishment: ({ target, dice }) => ({ extra: oneDie(dice, boosts(target)) }),
  "stomping-tantrum": ({ user, dice }) => ({ extra: missedLast(user) ? die(dice, 1) : [] }),
  "temper-flare": ({ user, dice }) => ({ extra: missedLast(user) ? oneDie(dice, 1) : [] }),
  "fury-cutter": context => doubling(context),
  "ice-ball": context => doubling(context),
  "power-up-punch": ({ user, item, dice }) => ({
    extra: oneDie(dice, Math.min(dice?.number ?? 0, streak(user, moveId(item), { sameTarget: true }) - 1)) })
});

const targetedActor = () => (game.user?.targets?.size === 1 ? [...game.user.targets][0]?.actor ?? null : null);

export function onPreRollDamageRiders(config) {
  const activity = config?.subject;
  const item = activity?.item;
  const rider = DAMAGE_RIDERS[moveId(item)];
  const roll = config?.rolls?.[0];
  if (!rider || !roll || config.isHealing) {return;}
  const match = String(roll.parts?.[0] ?? "").match(/(\d+)d(\d+)/);
  const dice = match ? { number: Number(match[1]), faces: Number(match[2]) } : null;
  const { times = 1, extra = [] } = rider({ user: activity.actor, target: targetedActor(), activity, item, dice });
  const base = [...(roll.parts ?? [])];
  roll.parts = [...Array.from({ length: times }, () => base).flat(), ...extra.filter(Boolean).map(String)];
}

async function onAttackMessage(message) {
  const item = message.getAssociatedItem?.();
  const id = moveId(item);
  const roll = message.rolls?.[0];
  if (!roll || (!HIT_RIDERS[id] && !MISS_RIDERS[id])) {return;}
  await game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
  const outcome = buildAttackOutcome(roll, message.getAssociatedActivity?.());
  if (outcome.hit === false && MISS_RIDERS[id]) {await crash(item.actor, MISS_RIDERS[id](item.actor));}
  const target = outcome.hit === true && HIT_RIDERS[id] ? actorFromUuid(outcome.targetActorUuid) : null;
  if (target) {await HIT_RIDERS[id](target, { item, user: item.actor });}
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
  subscribeAttackOutcome(recordAttack);
}
