import { activePokemonAbilityId, findStatusEffect, hasPokemonAbility, hasPokemonStatus, pokemonTypes, removeStatusWithNotice } from "./status-runtime.mjs";
import { fieldMoveBlocksStatus } from "./status-field-moves.mjs";
import { auraBlocksStatus } from "./aura-ability-engine.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { originatingMoveItem } from "./damage-engine.mjs";
import { isMeleeDamage, isOpponentDebuff, WIND_MOVES } from "./passive-ability-engine.mjs";
import { chargeNextElectricMove, GORILLA_FLAG, hasSecondaryEffect, WATER_COMPACTION } from "./rider-ability-engine.mjs";
import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { applyPokemonStatus } from "./pokemon-status-service.mjs";
import { rollPokemonNature } from "./nature-runtime.mjs";
import { restedPokemon } from "./active-ability-service.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { fellBelowHalf } from "./berry-ability-engine.mjs";
import { registerSaveReaction } from "./save-outcome-engine.mjs";
import { rewriteRoll } from "./trainer-combat-reactions.mjs";
import { abilityWeather, activeTerrain, environment, hasWeather, isGrounded, setBattlefield } from "./battlefield-service.mjs";

/* ============================================================
 * ABILITIES THAT REACT TO EVENTS
 *
 * - hit by a Move (dnd5e.applyDamage): Stamina, Weak Armor, Motor Drive, Steam Engine, Water Compaction,
 *   Electromorphosis, Wind Power, Liquid Ooze, Toxic Chain; Emergency Exit and Wimp Out as a chat notice;
 * - a Pokémon faints: Moxie and the Neighs (notice), Beast Boost, Soul-Heart, Aftermath, Innards Out;
 * - stat changes and statuses (ActiveEffect hooks): Clear Body, White Smoke, Full Metal Body, Hyper Cutter,
 *   Big Pecks, Contrary, Oblivious, Synchronize, Poison Puppeteer; Wonder Skin rolls a failed save again;
 * - effects that last while a condition holds: Unburden, Marvel Scale, Quick Feet, and the weather and terrain
 *   ones (Chlorophyll, Swift Swim, Sand Rush, Slush Rush, Sand Veil, Snow Cloak, Grass Pelt, Surge Surfer);
 * - statuses the weather or terrain prevents (Leaf Guard, Hydration, Electric and Misty Terrain);
 * - Seed Sower and Sand Spit set the terrain or weather when hit;
 * - turns, switches and rests: Hospitality, Bad Dreams, Natural Cure, Regenerator, Moody;
 * - Receiver and Power of Alchemy copy the Ability of the fainted ally they replace, until switched out;
  * - volatile statuses (Confused, Flinched) end when switched out; Flinched also when the combat ends;
  * - Wake-Up Slap wakes up the sleeper it hits (its doubled MOVE is in rider-ability-engine); Sparkling Aria
 *   cures the burn of whoever it damages;


 * - Sheer Force: its damaging Moves give no status or stat change to others (the damage is in rider-ability-engine).
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const REGENERATOR_FLAG = "regeneratorUsed";
const COPIED_FLAG = "copiedAbilityId";
const COPIERS = ["receiver", "power-of-alchemy"];
const WEATHER_REACTION_FLAG = "weatherReactionUses";
const ADD = 2;
const MULTIPLY = 1;
const SYNCHRONIZED = ["burned", "paralysis", "poisoned"];
const STAT_GUARDS = ["clear-body", "white-smoke", "full-metal-body"];
const CHARM_MOVES = ["taunt", "attract", "captivate"];
const ANOTHER_ACTION = { moxie: false, "chilling-neigh": true, "grim-neigh": true, "as-one": true };

const TEXT = {
  action: { en: "may immediately take another action", es: "puede realizar otra acción de inmediato" },
  move: { en: "may move up to 20 ft and take another action", es: "puede moverse hasta 20 ft y realizar otra acción" },
  boost: { en: "raises the ability scores of its saving throw proficiencies by 2", es: "sube en 2 las características de sus salvaciones competentes" },
  recoil: { en: "hurts the attacker", es: "daña al atacante" },
  exit: { en: "can be switched out as a free action", es: "puede ser cambiado como acción gratuita" },
  wimp: { en: "must disengage and run toward its trainer, and switch out if it can", es: "debe retirarse hacia su entrenador y cambiarse si puede" },
  blocked: { en: "is not affected", es: "no se ve afectado" },
  heals: { en: "recovers", es: "recupera" },
  cured: { en: "cures its statuses", es: "se cura de sus estados" },
  nature: { en: "changes its nature", es: "cambia su naturaleza" },
  temp: { en: "gives its allies within 20 ft temporary HP", es: "da PG temporales a sus aliados a 20 ft" },
  dreams: { en: "torments the sleeper", es: "atormenta al dormido" },
  speed: { en: "Speed", es: "Velocidad" },
  copies: { en: "copies", es: "copia" },
  sheer: { en: "gives up the added effect", es: "renuncia al efecto adicional" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] ability events`, error)); };
const gmAuthority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const tokenSide = actor => actor?.getActiveTokens?.()[0]?.document?.disposition ?? null;
const add = (key, value) => ({ key, mode: ADD, value: String(value), priority: 20 });

function abilityName(actor, abilityId) {
  return actor.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "ability" && item.getFlag?.(MODULE_ID, "sourceId") === abilityId)?.name ?? abilityId;
}

async function announce(actor, abilityId, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (${abilityName(actor, abilityId)}) ${html}.</div>` });
}

function combatActors(combat = game.combat) {
  return [...new Set([...combat?.combatants ?? []].map(combatant => combatant.actor).filter(Boolean))];
}

/* ============================================================
 * STACKING STAT CHANGES
 * ============================================================ */

// A module stat change keyed by Ability; `max` stacks multiply the changes. Refreshes its turn timers.
export async function stackAbilityEffect(actor, abilityId, { changes, max = 1, flags = {}, label = "" }) {
  const key = `ability:${abilityId}`;
  const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "stackKey") === key);
  const count = Math.min(max, Number(existing?.getFlag(MODULE_ID, "stackCount") ?? 0) + 1);
  const scaled = changes.map(change => (change.mode === ADD ? { ...change, value: String(Number(change.value) * count) } : change));
  const name = `${abilityName(actor, abilityId)}${label ? ` — ${label}` : ""}${max > 1 ? ` (${count}/${max})` : ""}`;
  const data = { name, changes: scaled, flags: { [MODULE_ID]: { kind: "pokemon-modifier", stackKey: key, stackCount: count, maxStacks: max, ...flags } } };
  if (existing) {return existing.update(data);}
  const img = actor.items?.find(item => item.getFlag?.(MODULE_ID, "sourceId") === abilityId)?.img ?? "icons/svg/aura.svg";
  return actor.createEmbeddedDocuments("ActiveEffect", [{ ...data, img, origin: actor.uuid }]);
}

const speed = value => add("system.attributes.movement.bonus", value);
const ac = value => add("system.attributes.ac.bonus", value);
const untilTurnStart = { expireAtStartTurn: true };
const untilCombatEnds = { removeOnCombatEnd: true };

// Ability → [does this hit trigger it, the stat change].
const ON_HIT = {
  stamina: [() => true, { changes: [ac(2)], flags: untilTurnStart }],
  "weak-armor": [() => true, { changes: [ac(-1), speed(5)], max: 5, flags: untilCombatEnds }],
  "motor-drive": [type => type === "electric", { changes: [speed(10)], max: 5, flags: untilCombatEnds }],
  "steam-engine": [type => ["fire", "water"].includes(type),
    { changes: [{ key: "system.attributes.movement.walk", mode: MULTIPLY, value: "2", priority: 30 }], flags: endOfNextTurnFlags() }],
  [WATER_COMPACTION]: [type => type === "water", { changes: [], flags: untilTurnStart }]
};

/* ============================================================
 * HIT BY A MOVE
 * ============================================================ */

async function forcedSave(actor, ability, dc, flavor) {
  const [roll] = await actor.rollSavingThrow({ ability, target: dc }, { configure: false }, { create: false }) ?? [];
  if (!roll) {return true;}
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: `${flavor} — ${actor.name} (DC ${dc})` });
  return roll.total >= dc;
}

async function poisonOnFailedSave(actor, ability, dc, flavor) {
  if (!await forcedSave(actor, ability, dc, flavor)) {await applyPokemonStatus(actor, "poisoned", { language: en() ? "en" : "es" });}
}

async function onHitByMove(target, move, options) {
  const type = move.getFlag(MODULE_ID, "moveType");
  const attacker = move.actor;
  for (const [abilityId, [triggers, effect]] of Object.entries(ON_HIT)) {
    if (hasPokemonAbility(target, abilityId) && triggers(type)) {await stackAbilityEffect(target, abilityId, effect);}
  }
  if (hasPokemonAbility(target, "electromorphosis")) {await chargeNextElectricMove(target, "electromorphosis");}
  if (hasPokemonAbility(target, "wind-power") && WIND_MOVES.has(move.getFlag(MODULE_ID, "sourceId"))) {await chargeNextElectricMove(target, "wind-power");}
  if (attacker && hasPokemonAbility(target, "liquid-ooze") && move.getFlag(MODULE_ID, "instantDrain")) {
    await poisonOnFailedSave(attacker, "con", 12, "Liquid Ooze");
  }
  if (hasPokemonAbility(attacker, "toxic-chain") && isMeleeDamage(options)) {await poisonOnFailedSave(target, "con", 16, "Toxic Chain");}
  if (hasPokemonAbility(target, "toxic-debris")) {await toxicDebris(target);}
}

// Toxic Debris: everyone within 5 ft makes a DEX save (DC level + 2) or is poisoned.
async function toxicDebris(actor) {
  const token = actor.getActiveTokens?.()[0];
  const dc = Number(actor.system?.details?.level ?? 0) + 2;
  const near = (globalThis.canvas?.tokens?.placeables ?? []).filter(other => other !== token && other.actor && token && distance(token, other) <= 5);
  if (near.length) {await announce(actor, "toxic-debris", "");}
  for (const other of near) {await poisonOnFailedSave(other.actor, "dex", dc, "Toxic Debris");}
}

// Ability → [battlefield key, its id, rounds, uses per long rest]. They answer a hit with their reaction.
const WEATHER_REACTIONS = {
  "seed-sower": ["terrain", "grassy", 3, () => 3, true],
  "sand-spit": ["weather", "sandstorm", 5, actor => Number(actor.system?.attributes?.prof ?? 0), false]
};

async function weatherReactions(actor, move) {
  for (const [abilityId, [key, id, rounds, uses, needsMove]] of Object.entries(WEATHER_REACTIONS)) {
    const spent = Number(actor.getFlag(MODULE_ID, WEATHER_REACTION_FLAG)?.[abilityId] ?? 0);
    const already = key === "terrain" ? activeTerrain() === id : hasWeather(id);
    if (!hasPokemonAbility(actor, abilityId) || (needsMove && !move) || spent >= uses(actor) || already || !game.combat) {continue;}
    await actor.setFlag(MODULE_ID, WEATHER_REACTION_FLAG, { ...actor.getFlag(MODULE_ID, WEATHER_REACTION_FLAG), [abilityId]: spent + 1 });
    const damage = key === "weather" ? Math.ceil(Number(actor.system?.details?.level ?? 0) / 2) : 0;
    await setBattlefield({ [key]: { id, rounds, damage, source: { actorUuid: actor.uuid } } });
    await announce(actor, abilityId, `${spent + 1}/${uses(actor)}`);
  }
}

async function onHalfHp(actor, before, after) {
  const max = Number(actor.system.attributes.hp.max);
  if (hasPokemonAbility(actor, "wimp-out") && fellBelowHalf(before, after, max)) {await announce(actor, "wimp-out", text("wimp"));}
  else if (hasPokemonAbility(actor, "emergency-exit") && after > 0 && after <= max / 2) {await announce(actor, "emergency-exit", text("exit"));}
}

/* ============================================================
 * FAINTING
 * ============================================================ */

const saveProficient = actor => Object.entries(actor.system?.abilities ?? {}).filter(([, ability]) => Number(ability.proficient) >= 1).map(([key]) => key);

async function boostSaves(actor, abilityId) {
  const changes = saveProficient(actor).map(key => add(`system.abilities.${key}.value`, 2));
  if (!changes.length) {return;}
  await stackAbilityEffect(actor, abilityId, { changes, max: 5, flags: untilCombatEnds });
  await announce(actor, abilityId, text("boost"));
}

async function hurtAttacker(fainted, abilityId, attacker, amount) {
  if (!attacker || amount <= 0) {return;}
  await attacker.applyDamage(amount);
  await announce(fainted, abilityId, `${text("recoil")}: ${amount}`);
}

async function onFaint(fainted, attacker, lost, options) {
  const victor = Object.keys(ANOTHER_ACTION).find(abilityId => hasPokemonAbility(attacker, abilityId));
  if (victor) {await announce(attacker, victor, text(ANOTHER_ACTION[victor] ? "move" : "action"));}
  if (hasPokemonAbility(attacker, "beast-boost")) {await boostSaves(attacker, "beast-boost");}
  const side = tokenSide(fainted);
  for (const ally of combatActors().filter(actor => actor !== fainted && tokenSide(actor) === side && hasPokemonAbility(actor, "soul-heart"))) {
    await boostSaves(ally, "soul-heart");
  }
  if (hasPokemonAbility(fainted, "aftermath") && isMeleeDamage(options)) {await hurtAttacker(fainted, "aftermath", attacker, Math.floor(lost / 2));}
  if (hasPokemonAbility(fainted, "innards-out")) {await hurtAttacker(fainted, "innards-out", attacker, lost);}
}

function onPreApplyDamage(actor, _amount, _updates, options) {
  if (isPokemonActor(actor)) {options[MODULE_ID] = { ...options[MODULE_ID], hpBefore: actor.system.attributes.hp.value };}
}

async function onApplyDamage(actor, _amount, options) {
  const before = options?.[MODULE_ID]?.hpBefore;
  const after = Number(actor.system.attributes.hp.value);
  if (before === undefined || after >= before) {return;}
    const move = originatingMoveItem(options);
  if (move) {await onHitByMove(actor, move, options);}
    const cured = { "wake-up-slap": "asleep", "sparkling-aria": "burned" }[move?.getFlag(MODULE_ID, "sourceId")];
  if (cured) {await removeStatusWithNotice(actor, findStatusEffect(actor, cured), move.name);}
  if (before > 0 && after <= 0) {await onFaint(actor, move?.actor ?? null, before - after, options);}
  else {
    await onHalfHp(actor, before, after);
    await weatherReactions(actor, move);
  }
}

/* ============================================================
 * STAT CHANGES AND STATUSES
 * ============================================================ */

const negated = changes => changes.map(change => (Number.isFinite(Number(change.value)) && change.mode === ADD
  ? { ...change, value: String(-Number(change.value)) } : change));
const LOWERED_BY = {
  "hyper-cutter": change => change.key.startsWith("system.bonuses."),
  "big-pecks": change => change.key === "system.attributes.ac.bonus"
};

// Which changes of an opponent's stat change survive this Pokémon's Ability. null: nothing changes.
export function protectedChanges(actor, changes) {
  const lowered = change => Number(change.value) < 0;
  if (STAT_GUARDS.some(abilityId => hasPokemonAbility(actor, abilityId))) {return changes.filter(change => !lowered(change));}
  const abilityId = Object.keys(LOWERED_BY).find(id => hasPokemonAbility(actor, id));
  return abilityId ? changes.filter(change => !(lowered(change) && LOWERED_BY[abilityId](change))) : null;
}

function guardingAbility(actor) {
  return [...STAT_GUARDS, ...Object.keys(LOWERED_BY)].find(abilityId => hasPokemonAbility(actor, abilityId));
}

const obliviousBlocks = (actor, effect) => hasPokemonAbility(actor, "oblivious") &&
  (effect.statuses?.has?.("charmed") || CHARM_MOVES.includes(effect.getFlag(MODULE_ID, "sourceMove")));

// Mirror Armor: an opponent's stat drop goes back to whoever caused it.
async function mirrorArmor(effect, actor) {
  const source = effectSourceActor(effect);
  await announce(actor, "mirror-armor", source ? `→ ${source.name}` : text("blocked"));
  // shortcut: whoever applies the drop must own its source (the GM usually does); otherwise it is only blocked.
  if (!source?.isOwner) {return;}
  const data = effect.toObject();
  // Marked, so two Mirror Armors do not send it back and forth.
  await source.createEmbeddedDocuments("ActiveEffect", [{ ...data, origin: actor.uuid,
    flags: { ...data.flags, [MODULE_ID]: { ...data.flags?.[MODULE_ID], mirrored: true } } }]);
}

// Opportunist: an opponent's stat rise is copied, until the combat ends.
async function opportunist(effect) {
  const actor = effect.parent;
  const raised = Array.from(effect.changes ?? []).filter(change => Number(change.value) > 0);
  if (!raised.length || effect.getFlag(MODULE_ID, "opportunist") || !combatActors().includes(actor)) {return;}
  for (const copier of combatActors().filter(other => tokenSide(other) !== tokenSide(actor) && hasPokemonAbility(other, "opportunist"))) {
    await copier.createEmbeddedDocuments("ActiveEffect", [{ name: `${abilityName(copier, "opportunist")} — ${effect.name}`, img: effect.img,
      changes: raised, origin: copier.uuid, flags: { [MODULE_ID]: { kind: "pokemon-modifier", opportunist: true, ...untilCombatEnds } } }]);
    await announce(copier, "opportunist", effect.name);
  }
}

// Contrary inverts a Move's stat change; the guards drop what an opponent's would lower. false blocks it.
function adjustStatChange(effect, actor) {
  const changes = Array.from(effect.changes ?? []).map(change => ({ ...change }));
  if (hasPokemonAbility(actor, "contrary") && effect.getFlag(MODULE_ID, "sourceMove")) {
    effect.updateSource({ changes: negated(changes) });
    return true;
  }
  if (hasPokemonAbility(actor, "mirror-armor") && !effect.getFlag(MODULE_ID, "mirrored") && isOpponentDebuff(effect, actor) && changes.some(change => Number(change.value) < 0)) {
    logged(mirrorArmor(effect, actor));
    return false;
  }
  const kept = isOpponentDebuff(effect, actor) ? protectedChanges(actor, changes) : null;
  if (!kept || kept.length === changes.length) {return true;}
  logged(announce(actor, guardingAbility(actor), text("blocked")));
  if (!kept.length && !effect.getFlag(MODULE_ID, "rollModes")) {return false;}
  effect.updateSource({ changes: kept });
  return true;
}

// What keeps this status off the Pokémon now, or null.
export function battlefieldBlocksStatus(actor, status) {
  const veil = auraBlocksStatus(actor, status, pokemonTypes(actor));
  if (veil) {return veil;}
  const field = fieldMoveBlocksStatus(actor, status);
  if (field) {return field;}
  if (hasPokemonAbility(actor, "leaf-guard") && abilityWeather("sun")) {return "leaf-guard";}
  if (hasPokemonAbility(actor, "hydration") && (abilityWeather("rain") || environment() === "water")) {return "hydration";}
  if (!isGrounded(actor)) {return null;}
  if (activeTerrain() === "misty") {return "misty-terrain";}
  return activeTerrain() === "electric" && status === "asleep" ? "electric-terrain" : null;
}

// Sheer Force: a status or stat change that the holder's damaging Move would give to another creature.
export function sheerForceBlocks(actor, effect) {
  if (!["pokemon-status", "pokemon-modifier"].includes(effect.getFlag?.(MODULE_ID, "kind"))) {return null;}
  const sourceUuid = effect.getFlag(MODULE_ID, "sourceActorUuid");
  const source = effectSourceActor(effect) ?? (sourceUuid ? fromUuidSync(sourceUuid, { strict: false }) : null);
  if (!source || source === actor || !hasPokemonAbility(source, "sheer-force")) {return null;}
  const move = effectMove(effect, source);
  return move?.getFlag?.(MODULE_ID, "moveDefinition")?.damage && hasSecondaryEffect(move) ? source : null;
}

// The Move that made the effect: its origin, or the source's Move with that id.
function effectMove(effect, source) {
  const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  if (origin?.documentName === "Item") {return origin;}
  const sourceMove = effect.getFlag(MODULE_ID, "sourceMove");
  return source.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "move" && item.getFlag(MODULE_ID, "sourceId") === sourceMove) ?? null;
}

function onPreCreateEffect(effect) {
  const actor = effect.parent;
  if (actor?.documentName !== "Actor" || !isPokemonActor(actor)) {return true;}
  const sheer = sheerForceBlocks(actor, effect);
  if (sheer) {
    logged(announce(sheer, "sheer-force", text("sheer")));
    return false;
  }
  const blocker = effect.getFlag(MODULE_ID, "kind") === "pokemon-status" ? battlefieldBlocksStatus(actor, effect.getFlag(MODULE_ID, "status")) : null;
  if (blocker) {
    logged(announce(actor, blocker, text("blocked")));
    return false;
  }
  if (obliviousBlocks(actor, effect)) {
    logged(announce(actor, "oblivious", text("blocked")));
    return false;
  }
  return effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier" ? adjustStatChange(effect, actor) : true;
}

// Stacking a Move's stat change rewrites its changes from the template: keep them inverted or protected.
function onPreUpdateEffect(effect, changed) {
  const actor = effect.parent;
  if (!Array.isArray(changed.changes) || actor?.documentName !== "Actor" || effect.getFlag(MODULE_ID, "kind") !== "pokemon-modifier") {return;}
  if (hasPokemonAbility(actor, "contrary") && effect.getFlag(MODULE_ID, "sourceMove")) {
    changed.changes = negated(changed.changes);
    return;
  }
  const kept = isOpponentDebuff(effect, actor) ? protectedChanges(actor, changed.changes) : null;
  if (kept) {changed.changes = kept;}
}

// The Pokémon whose Move or Ability created this effect, if it is not the bearer.
export function effectSourceActor(effect) {
  const origin = effect?.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  const actor = origin?.documentName === "Actor" ? origin : origin?.actor ?? null;
  return actor && actor !== effect.parent ? actor : null;
}

async function onStatusCreated(effect) {
  const actor = effect.parent;
  const status = effect.getFlag(MODULE_ID, "status");
  const source = effectSourceActor(effect);
  if (!status || !source || !isPokemonActor(source)) {return;}
  if (hasPokemonAbility(actor, "synchronize") && SYNCHRONIZED.includes(status)) {
    await announce(actor, "synchronize", `→ ${source.name}`);
    await applyPokemonStatus(source, status, { language: en() ? "en" : "es" });
  }
  if (status === "poisoned" && hasPokemonAbility(source, "poison-puppeteer")) {await actor.toggleStatusEffect("charmed", { active: true });}
}

const WONDER_SKIN = ["burned", "frozen", "poisoned", "paralysis"];
const moveStatuses = move => Array.from(move?.effects ?? []).map(effect => effect.getFlag?.(MODULE_ID, "status")).filter(Boolean);

// Wonder Skin: advantage against those statuses, as a second d20 once the save has failed.
export function wonderSkinOffer(roll, { actor, dc, move }) {
  if (!Number.isFinite(dc) || Number(roll?.total) >= dc || roll.hasAdvantage || !hasPokemonAbility(actor, "wonder-skin") ||
    !moveStatuses(move).some(status => WONDER_SKIN.includes(status))) {return null;}
  return async () => {
    const again = await roll.reroll();
    await game.dice3d?.showForRoll(again, game.user, true);
    await announce(actor, "wonder-skin", `${roll.total} / ${again.total}`);
    return again.total > roll.total ? rewriteRoll(roll, again) : null;
  };
}

/* ============================================================
 * WHILE A CONDITION HOLDS
 * ============================================================ */

const hasNegativeStatus = actor => Array.from(actor.effects ?? []).some(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status");
const doubleWalk = [{ key: "system.attributes.movement.walk", mode: MULTIPLY, value: "2", priority: 30 }];
const sandy = () => abilityWeather("sandstorm") || environment() === "desert";
const icy = () => abilityWeather("hail") || abilityWeather("snow") || environment() === "arctic";

const CONDITIONAL = {
  unburden: [actor => !getPokemonHeldItem(actor), [speed(10)]],
  "marvel-scale": [hasNegativeStatus, [ac(2)]],
  "quick-feet": [hasNegativeStatus, [speed(15)]],
  chlorophyll: [() => abilityWeather("sun"), doubleWalk],
  "swift-swim": [() => abilityWeather("rain"), doubleWalk],
  "sand-rush": [sandy, doubleWalk],
  "slush-rush": [icy, doubleWalk],
  "sand-veil": [sandy, [ac(2)]],
  "snow-cloak": [icy, [ac(2)]],
  "grass-pelt": [() => activeTerrain() === "grassy", [ac(1)]],
  // shortcut: Surge Surfer doubles its speed for the whole Electric Terrain, not from the start of each turn in it.
  "surge-surfer": [() => activeTerrain() === "electric", doubleWalk]
};

const syncing = new Map();

async function syncConditionalEffects(actor) {
  for (const [abilityId, [holds, changes]] of Object.entries(CONDITIONAL)) {
    const existing = actor.effects.find(effect => effect.getFlag(MODULE_ID, "conditionalAbility") === abilityId);
    const wanted = hasPokemonAbility(actor, abilityId) && holds(actor);
    if (wanted && !existing) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{ name: abilityName(actor, abilityId), img: "icons/svg/aura.svg", changes,
        origin: actor.uuid, flags: { [MODULE_ID]: { conditionalAbility: abilityId } } }]);
    } else if (!wanted && existing) {
      await existing.delete();
    }
  }
}

// One sync at a time per Pokémon, run by the active GM.
function queueSync(actor) {
  if (!gmAuthority() || !isPokemonActor(actor) || !Object.keys(CONDITIONAL).some(abilityId => hasPokemonAbility(actor, abilityId) ||
    actor.effects.some(effect => effect.getFlag(MODULE_ID, "conditionalAbility") === abilityId))) {return;}
  const task = (syncing.get(actor.uuid) ?? Promise.resolve()).then(() => syncConditionalEffects(actor));
  syncing.set(actor.uuid, task);
  logged(task);
}

/* ============================================================
 * TURNS, SWITCHES AND RESTS
 * ============================================================ */

function distance(from, to) {
  return globalThis.canvas?.grid?.measurePath?.([from.center, to.center])?.distance ?? Infinity;
}

export async function processEventAbilitiesStartTurn(actor) {
  if (!hasPokemonAbility(actor, "hospitality")) {return;}
  const token = actor.getActiveTokens?.()[0];
  const allies = (globalThis.canvas?.tokens?.placeables ?? []).filter(other => other !== token && other.actor &&
    other.document.disposition === token?.document?.disposition && distance(token, other) <= 20);
  if (!allies.length) {return;}
  const roll = await new Roll("1d4").evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: `Hospitality — ${actor.name}` });
  for (const ally of allies) {await ally.actor.update({ "system.attributes.hp.temp": roll.total });}
  await announce(actor, "hospitality", `${text("temp")}: ${roll.total}`);
}

export async function processEventAbilitiesEndTurn(actor) {
  if (!hasPokemonStatus(actor, "asleep") || Number(actor.system?.attributes?.hp?.value) <= 0) {return;}
  const side = tokenSide(actor);
  for (const foe of combatActors().filter(other => tokenSide(other) !== side && hasPokemonAbility(other, "bad-dreams"))) {
    const damage = Number(foe.system?.attributes?.prof ?? 0);
    await actor.applyDamage(damage);
    await announce(foe, "bad-dreams", `${text("dreams")} ${actor.name}: ${damage}`);
  }
}

// Receiver, Power of Alchemy: the fainted ally's non-hidden Ability, while this Pokémon stays in.
export function copiableAbility(fainted) {
  const abilityId = activePokemonAbilityId(fainted);
  const item = fainted?.items?.find(entry => entry.getFlag?.(MODULE_ID, "kind") === "ability" && entry.getFlag(MODULE_ID, "sourceId") === abilityId);
  return abilityId && !COPIERS.includes(abilityId) && !item?.getFlag(MODULE_ID, "hiddenAbility") ? abilityId : null;
}

async function copyFaintedAbility(incoming, outgoing) {
  const copier = COPIERS.find(abilityId => hasPokemonAbility(incoming, abilityId));
  if (!copier || !incoming.isOwner || !isPokemonActor(outgoing) || Number(outgoing.system?.attributes?.hp?.value) > 0) {return;}
  const abilityId = copiableAbility(outgoing);
  if (!abilityId) {return;}
  await incoming.setFlag(MODULE_ID, COPIED_FLAG, abilityId);
  await announce(incoming, copier, `${text("copies")} ${abilityName(outgoing, abilityId)} (${outgoing.name})`);
}

// What only lasts while the Pokémon is on the battlefield: a copied Ability, the Gorilla Tactics Move.
async function leaveBattlefield(actor) {
  for (const flag of [COPIED_FLAG, GORILLA_FLAG]) {
    if (actor.getFlag(MODULE_ID, flag) !== undefined) {await actor.unsetFlag(MODULE_ID, flag);}
  }
}

// Confused has its own combat-end cleanup in confusion-engine, so the combat end only passes ["flinched"].
export async function clearVolatileStatuses(actor, statuses = null) {
  const ids = Array.from(actor.effects ?? []).filter(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status" &&
    effect.getFlag(MODULE_ID, "volatile") && (!statuses || statuses.includes(effect.getFlag(MODULE_ID, "status")))).map(effect => effect.id);
  if (ids.length) {await actor.deleteEmbeddedDocuments("ActiveEffect", ids);}
}

async function onSwitched({ outgoing, incoming }) {
  if (incoming) {await copyFaintedAbility(incoming, outgoing);}
  if (!isPokemonActor(outgoing) || !outgoing.isOwner) {return;}
  await leaveBattlefield(outgoing);
  await clearVolatileStatuses(outgoing);
  if (hasPokemonAbility(outgoing, "natural-cure")) {
    const ids = outgoing.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status").map(effect => effect.id);
    if (ids.length) {
      await outgoing.deleteEmbeddedDocuments("ActiveEffect", ids);
      await announce(outgoing, "natural-cure", text("cured"));
    }
  }
  const hp = outgoing.system.attributes.hp;
  if (hasPokemonAbility(outgoing, "regenerator") && !outgoing.getFlag(MODULE_ID, REGENERATOR_FLAG) && hp.value > 0 && hp.value < hp.max) {
    const healed = Math.min(Number(outgoing.system.details?.level ?? 0), hp.max - hp.value);
    await outgoing.update({ "system.attributes.hp.value": hp.value + healed, [`flags.${MODULE_ID}.${REGENERATOR_FLAG}`]: true });
    await announce(outgoing, "regenerator", `${text("heals")} ${healed} HP`);
  }
}

async function onLongRest(pokemon) {
  if (pokemon.getFlag(MODULE_ID, REGENERATOR_FLAG)) {await pokemon.unsetFlag(MODULE_ID, REGENERATOR_FLAG);}
  if (pokemon.getFlag(MODULE_ID, WEATHER_REACTION_FLAG)) {await pokemon.unsetFlag(MODULE_ID, WEATHER_REACTION_FLAG);}
  if (!hasPokemonAbility(pokemon, "moody")) {return;}
  await rollPokemonNature(pokemon);
  await announce(pokemon, "moody", text("nature"));
}

function onRestCompleted(actor, result, config) {
  if (!(result?.longRest === true || config?.type === "long")) {return;}
  logged(Promise.all(restedPokemon(actor).filter(pokemon => pokemon.isOwner).map(onLongRest)));
}

export function registerEventAbilityEngine() {
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => logged(onApplyDamage(actor, amount, options)));
  Hooks.on("preCreateActiveEffect", onPreCreateEffect);
  Hooks.on("preUpdateActiveEffect", onPreUpdateEffect);
  Hooks.on("createActiveEffect", (effect, _options, userId) => {
    if (userId === game.user.id && effect.parent?.documentName === "Actor") {logged(onStatusCreated(effect));}
    if (gmAuthority() && effect.getFlag(MODULE_ID, "kind") === "pokemon-modifier") {logged(opportunist(effect));}
    queueSync(effect.parent);
  });
  Hooks.on("deleteActiveEffect", effect => queueSync(effect.parent));
  Hooks.on("updateActor", actor => queueSync(actor));
  // The weather, terrain or environment changed.
  Hooks.on("updateCombat", combat => combatActors(combat).forEach(queueSync));
  Hooks.on("deleteCombat", combat => {
    combatActors(combat).forEach(queueSync);
    if (gmAuthority()) {
      logged(Promise.all(combatActors(combat).map(actor => leaveBattlefield(actor).then(() => clearVolatileStatuses(actor, ["flinched"])))));
    }
  });
  Hooks.on("createItem", item => queueSync(item.parent));
  Hooks.on("deleteItem", item => queueSync(item.parent));
  Hooks.once("ready", () => game.actors?.forEach(queueSync));
  Hooks.on("poke5ePokemonSwitched", event => logged(onSwitched(event)));
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  registerSaveReaction(wonderSkinOffer);
}
