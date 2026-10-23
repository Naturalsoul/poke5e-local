import { hasWeather } from "./battlefield-service.mjs";
import { hasPokemonAbility, pokemonTypes } from "./status-runtime.mjs";
import { battleArmor } from "./passive-ability-engine.mjs";
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
 * - Size and stats: Body Press (+MOVE against a smaller target), Heat Crash and Heavy Slam (+MOVE per size above it),
 *   Gyro Ball (double dice when its DEX is lower), Snipe Shot (double dice when rolled with advantage) and Lash Out
 *   (advantage and +MOVE while it has a status or a lowered stat).
 * - Hold Back: the damage it deals never takes the target below 1 HP.
 * - Chip Away, Sacred Sword, Secret Sword and Darkest Lariat ignore the AC the target gained in battle (as Unaware).
 * - While concentrating: Focus Energy widens the critical range by 2; Tail Glow and Calm Mind add STAB again.
 * - Collision Course and Electro Drift (+MOVE against a target vulnerable to it), Skitter Smack (+half its level in d6
 *   with advantage), Trump Card (+MOVE per PP spent before this use) and Last Respects (+2d6 per downed ally, up to 10d6).
 * - From the attacks in chat since the user's previous attack: Payback (double damage if the target hit the user) and
 *   Bolt Beak / Fishious Rend (MOVE again if the target didn't attack). Charge Beam: a natural 10+ hit powers MOVE up
 *   until the end of its next turn. Electro Ball: next tier of dice when faster. Laser Focus: its next attack crits.
 * - Damage type picked for the player: Multi-Attack and Revelation Dance (the user's primary type), Techno Blast (its
 *   held Drive) and Weather Ball (the weather, with double dice). Still changeable in the damage dialog.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const LABELS = {
  es: { cleared: "pierde sus cambios de estadísticas", burned: name => `se queda sin ${name}: se ha reducido a cenizas`,
    worn: "Eternabeam — Incapacitado", charged: "Charge Beam — MOVE doble",
    crash: "se estrella y recibe" },
  en: { cleared: "loses its stat changes", burned: name => `loses its ${name}: it burned to ash`,
    worn: "Eternabeam — Incapacitated", charged: "Charge Beam — MOVE doubled",
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
  "charge-beam": async (_target, { user, outcome }) => {
    if (!user || (outcome?.natural ?? 0) < 10) {return;}
    await user.createEmbeddedDocuments("ActiveEffect", [{ name: text().charged, img: "icons/svg/lightning.svg", transfer: false, changes: [],
      flags: { [MODULE_ID]: { kind: CONDITION_KIND, condition: "charged", sourceMove: "charge-beam", ...endOfNextTurnFlags() } } }]);
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
const IGNORE_AC_BOOSTS = new Set(["chip-away", "sacred-sword", "secret-sword", "darkest-lariat"]);
const focusing = (actor, id) => Array.from(actor?.effects ?? []).some(effect => !effect.disabled && effect.getFlag?.(MODULE_ID, "sourceMove") === id);
const singleTarget = () => (game.user?.targets?.size === 1 ? [...game.user.targets][0]?.actor ?? null : null);

// Lowest threshold wins, so Super Luck or another source never narrows the Move's own range.
export function onPreRollAttackCritical(config) {
  const id = moveId(config?.subject?.item);
  const user = config?.subject?.actor;
  const threshold = CRITICAL_RANGES[id];
  const focused = focusing(user, "focus-energy");
  const laser = Array.from(user?.effects ?? []).find(effect => !effect.disabled && effect.getFlag?.(MODULE_ID, "sourceMove") === "laser-focus");
  const ignoreBoosts = IGNORE_AC_BOOSTS.has(id) && !hasPokemonAbility(user, "unaware");
  if (!id || (!threshold && !focused && !laser && !ignoreBoosts && !ADVANTAGE_MOVES.has(id) && id !== "lash-out")) {return;}
  const armor = ignoreBoosts ? battleArmor(singleTarget()) : 0;
  // Spent on this attack.
  if (laser) {void laser.delete().catch(error => console.error(`[${MODULE_ID}] laser focus`, error));}
  for (const rollConfig of config.rolls ?? []) {
    rollConfig.options ??= {};
    if (threshold) {rollConfig.options.criticalSuccess = Math.min(rollConfig.options.criticalSuccess ?? 20, threshold);}
    if (focused) {rollConfig.options.criticalSuccess = (rollConfig.options.criticalSuccess ?? 20) - 2;}
    if (laser) {rollConfig.options.criticalSuccess = 1;}
    if (armor) {(rollConfig.parts ??= []).push(String(armor));}
    if (ADVANTAGE_MOVES.has(id) || (id === "lash-out" && frustrated(config.subject.actor))) {rollConfig.options.advantage = true;}
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
  entries.push({ moveId: outcome.moveId, hit: outcome.hit, targetUuid: outcome.targetActorUuid, round: game.combat?.round ?? null,
    advantage: outcome.advantage === true });
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
const SIZES = ["tiny", "sm", "med", "lg", "huge", "grg"];
const sizeRank = actor => SIZES.indexOf(actor?.system?.traits?.size);
const sizesAbove = (user, target) => (sizeRank(user) < 0 || sizeRank(target) < 0 ? 0 : Math.max(0, sizeRank(user) - sizeRank(target)));
const dexScore = actor => Number(actor?.system?.abilities?.dex?.value) || 0;
// Lash Out: a status, or a lowered stat (a penalty, or a Leer-like mark that helps its attackers).
export function frustrated(actor) {
  return hasStatus(actor) || Array.from(actor?.effects ?? []).some(effect => !effect.disabled
    && effect.getFlag?.(MODULE_ID, "kind") === "pokemon-modifier"
    && (Boolean(effect.getFlag(MODULE_ID, "targetedAttack")) || Array.from(effect.changes ?? []).some(change => Number(change.value) < 0)));
}
const vulnerableTo = (actor, item) => {
  const types = actor?.system?.traits?.dv?.value;
  const type = item?.getFlag?.(MODULE_ID, "moveDefinition")?.type;
  return Boolean(type && types && (types.has?.(type) ?? Array.from(types).includes(type)));
};
const levelOf = actor => Number(actor?.getFlag?.(MODULE_ID, "level")) || 0;
const disposition = actor => actor?.getActiveTokens?.()[0]?.document?.disposition ?? actor?.prototypeToken?.disposition ?? 0;
// Allies down in this combat: combatants on the user's side at 0 HP.
function downedAllies(user) {
  const side = disposition(user);
  return Array.from(game.combat?.combatants ?? []).map(combatant => combatant.actor)
    .filter(actor => actor && actor !== user && disposition(actor) === side && Number(actor.system?.attributes?.hp?.value) <= 0).length;
}
// The attacks in chat after the user's previous attack (the latest of its own is the one being resolved).
export function attacksSinceLastTurn(user) {
  const found = [];
  let own = 0;
  for (const message of Array.from(game.messages?.contents ?? []).reverse()) {
    if (message.getFlag?.("dnd5e", "roll.type") !== "attack" || !message.rolls?.[0]) {continue;}
    const outcome = buildAttackOutcome(message.rolls[0], message.getAssociatedActivity?.());
    if (outcome.actorUuid === user?.uuid && ++own === 2) {break;}
    if (outcome.actorUuid !== user?.uuid) {found.push(outcome);}
  }
  return found;
}
const hitBy = (user, target) => attacksSinceLastTurn(user).some(outcome => outcome.actorUuid === target?.uuid && outcome.hit === true
  && outcome.targetActorUuid === user.uuid);
const attackedSince = (user, target) => attacksSinceLastTurn(user).some(outcome => outcome.actorUuid === target?.uuid);
const topSpeed = actor => Math.max(0, ...Object.values(actor?.system?.attributes?.movement ?? {}).map(Number).filter(Number.isFinite));
// Electro Ball: the dice of the next level threshold; past the last one, double dice.
function nextTierDice(item, user) {
  const table = item?.getFlag?.(MODULE_ID, "moveDefinition")?.damage?.dice ?? {};
  const levels = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const next = levels.find(level => level > levelOf(user));
  return next === undefined ? null : table[next];
}
const die = (dice, count) => (count > 0 && dice ? [`${dice.number * count}d${dice.faces}`] : []);
const oneDie = (dice, count) => (count > 0 && dice ? [`${count}d${dice.faces}`] : []);
const doubling = ({ user, item, dice }) => {
  const multiplier = Math.min(8, 2 ** Math.max(0, streak(user, moveId(item), { rounds: true }) - 1));
  return { extra: die(dice, multiplier - 1) };
};

const DRIVES = { burn: "fire", chill: "ice", douse: "water", shock: "electric" };
function heldDriveType(actor) {
  let held = null;
  try { held = getPokemonHeldItem(actor); } catch { return null; }
  const name = String(held?.name ?? "").toLowerCase();
  return Object.entries(DRIVES).find(([drive]) => name.includes(drive))?.[1] ?? null;
}
const WEATHER_TYPES = [["sun", "fire"], ["rain", "water"], ["sandstorm", "rock"], ["hail", "ice"], ["snow", "ice"]];
const weatherType = () => WEATHER_TYPES.find(([weather]) => hasWeather(weather))?.[1] ?? null;

// Each returns { times, extra, type }: the formula repeated `times` over, plus extra parts, and the damage type.
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
  "body-press": ({ user, target, activity }) => ({ extra: sizesAbove(user, target) > 0 ? [moveModifier(user, activity)] : [] }),
  "heat-crash": ({ user, target, activity }) => ({ extra: sizesAbove(user, target) > 0 ? [moveModifier(user, activity) * sizesAbove(user, target)] : [] }),
  "heavy-slam": ({ user, target, activity }) => ({ extra: sizesAbove(user, target) > 0 ? [moveModifier(user, activity) * sizesAbove(user, target)] : [] }),
  "gyro-ball": ({ user, target, dice }) => ({ extra: target && dexScore(user) < dexScore(target) ? die(dice, 1) : [] }),
  "snipe-shot": ({ user, dice }) => ({ extra: attacks(user).at(-1)?.advantage ? die(dice, 1) : [] }),
  "lash-out": ({ user, activity }) => ({ extra: frustrated(user) ? [moveModifier(user, activity)] : [] }),
  "collision-course": ({ user, target, item, activity }) => ({ extra: vulnerableTo(target, item) ? [moveModifier(user, activity)] : [] }),
  "electro-drift": ({ user, target, item, activity }) => ({ extra: vulnerableTo(target, item) ? [moveModifier(user, activity)] : [] }),
  "skitter-smack": ({ user }) => ({ extra: attacks(user).at(-1)?.advantage && levelOf(user) ? [`${Math.ceil(levelOf(user) / 2)}d6`] : [] }),
  // Its PP is spent when it is used, so this use is already counted.
  "trump-card": ({ user, item, activity }) => {
    const before = Math.max(0, (Number(item?.system?.uses?.spent) || 0) - 1);
    return { extra: before ? [moveModifier(user, activity) * before] : [] };
  },
  "last-respects": ({ user, dice }) => ({ extra: oneDie(dice, Math.min(2 * downedAllies(user), 10 - (dice?.number ?? 1))) }),
  payback: ({ user, target }) => ({ times: target && hitBy(user, target) ? 2 : 1 }),
  "bolt-beak": ({ user, target, activity }) => ({ extra: target && !attackedSince(user, target) ? [moveModifier(user, activity)] : [] }),
  "fishious-rend": ({ user, target, activity }) => ({ extra: target && !attackedSince(user, target) ? [moveModifier(user, activity)] : [] }),
  "electro-ball": ({ user, target, item, dice }) => {
    if (!target || topSpeed(user) <= topSpeed(target)) {return {};}
    const next = nextTierDice(item, user);
    return next ? { replaceDice: next } : { extra: die(dice, 1) };
  },
  "multi-attack": ({ user }) => ({ type: pokemonTypes(user)[0] ?? null }),
  "revelation-dance": ({ user }) => ({ type: pokemonTypes(user)[0] ?? null }),
  "techno-blast": ({ user }) => ({ type: heldDriveType(user) }),
  "weather-ball": ({ dice }) => (weatherType() ? { type: weatherType(), extra: die(dice, 1) } : { type: "normal" }),
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

// Tail Glow and Calm Mind: a Move of the user's type adds its STAB (proficiency) once more.
function stabAgain(user, item) {
  const doubled = focusing(user, "tail-glow") || focusing(user, "calm-mind");
  return doubled && pokemonTypes(user).includes(item?.getFlag?.(MODULE_ID, "moveDefinition")?.type) ? proficiency(user) : 0;
}

export function onPreRollDamageRiders(config) {
  const activity = config?.subject;
  const item = activity?.item;
  const roll = config?.rolls?.[0];
  if (!moveId(item) || !roll || config.isHealing) {return;}
  const stab = stabAgain(activity.actor, item);
  if (stab) {(roll.parts ??= []).push(String(stab));}
  // Charge Beam's charge: MOVE once more on its damaging Moves.
  if (focusing(activity.actor, "charge-beam") && activity.attack?.ability) {(roll.parts ??= []).push(String(moveModifier(activity.actor, activity)));}
  const rider = DAMAGE_RIDERS[moveId(item)];
  if (!rider) {return;}
  const match = String(roll.parts?.[0] ?? "").match(/(\d+)d(\d+)/);
  const dice = match ? { number: Number(match[1]), faces: Number(match[2]) } : null;
  const { times = 1, extra = [], type = null, replaceDice = null } = rider({ user: activity.actor, target: singleTarget(), activity, item, dice });
  if (replaceDice && match) {roll.parts[0] = roll.parts[0].replace(match[0], replaceDice);}
  if (type) {
    roll.options ??= {};
    roll.options.type = type;
    roll.options.types = [...new Set([type, ...(roll.options.types ?? [])])];
  }
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
  if (target) {await HIT_RIDERS[id](target, { item, user: item.actor, outcome });}
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

// Hold Back: whoever applies its damage from the chat card, the target keeps 1 HP.
export function onPreApplyDamage(actor, _amount, updates, options) {
  if (moveId(options?.originatingMessage?.getAssociatedItem?.()) !== "hold-back") {return;}
  const hp = updates?.["system.attributes.hp.value"];
  if (hp !== undefined && hp < 1 && Number(actor?.system?.attributes?.hp?.value) >= 1) {updates["system.attributes.hp.value"] = 1;}
}

let registered = false;

export function registerMoveRiders() {
  if (registered) {return;}
  registered = true;
  Hooks.on("createChatMessage", onCreateChatMessage);
  Hooks.on("dnd5e.preRollAttack", onPreRollAttackCritical);
  Hooks.on("dnd5e.preRollDamage", onPreRollDamageRiders);
  subscribeAttackOutcome(recordAttack);
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
}
