import { hasPokemonAbility, hasPokemonStatus } from "./status-runtime.mjs";
import { originatingMoveItem } from "./damage-engine.mjs";
import { doubleDamageDice } from "./active-ability-service.mjs";
import { SOUND_MOVES } from "./passive-ability-engine.mjs";
import { messageRollShown } from "./chat-roll-display.mjs";
import { abilityWeather, activeTerrain, distanceBetween, hasWeather, isGrounded } from "./battlefield-service.mjs";
import { auraDamage, auraDamageMultiplier, telepathyBlocks } from "./aura-ability-engine.mjs";
import { inflictsStatus } from "./trainer-path-actions.mjs";
import { isAttackHit, subscribeAttackOutcome } from "./attack-outcome-engine.mjs";

/* ============================================================
 * ABILITIES THAT CHANGE A MOVE
 *
 * - the Move's damage roll (dnd5e.postRollConfiguration): its type (Galvanize, Normalize...), its dice
 *   (Merciless, Wind Power), its critical multiplier (Sniper) and flat bonuses (Sharpness, Tough Claws,
 *   Reckless, Electromorphosis);
 * - the damage a target takes (dnd5e.preCalculateDamage): Tinted Lens, Scrappy, Mind's Eye, Ice Scales,
 *   Water Compaction;
 * - initiative (Quick Draw), using a Move (Truant) and critical hits (Hustle);
 * - weather and terrain: Weather Ball, Solar Power, Flower Gift, Sand Force, the terrains that double MOVE,
 *   primal weathers that stop Water or Fire damage, Misty Terrain against Dragon, Protosynthesis, Quark Drive;
 * - auras from aura-ability-engine: Battery, Power Spot, Steely Spirit, Plus/Minus, Fairy/Dark Aura, Telepathy;
 * - Stakeout: double damage to the Pokémon an opponent switched in, until the end of its next turn's round;
 * - Sheer Force: MOVE again on a damaging Move with a status or stat change for others (event-ability-engine drops it);
 * - Skill Link: a chat notice that a combo Move's first extra hit needs no d4 (the chain itself is rolled by hand);
 * - Gorilla Tactics: the first Move it rolls damage with after entering gets MOVE twice, the others none.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const CHARGE_FLAG = "abilityCharge";
export const GORILLA_FLAG = "gorillaTacticsMove";
const WATER_COMPACTION = "water-compaction";
const MENTAL = ["int", "wis", "cha"];
const SHARP_MOVE = /cut|blade|slash|edge|cleave|razor|sword|axe/;

// From → to. A function of the Move id and type returns the new type, or null to keep it.
const TYPE_CHANGE = {
  galvanize: (_id, type) => (type === "normal" ? "electric" : null),
  pixilate: (_id, type) => (type === "normal" ? "fairy" : null),
  refrigerate: (_id, type) => (type === "normal" ? "ice" : null),
  normalize: () => "normal",
  "liquid-voice": id => (SOUND_MOVES.has(id) ? "water" : null)
};

const TEXT = {
  truant: { en: "Truant: it cannot use the same Move two rounds in a row.", es: "Truant: no puede usar el mismo Move dos rondas seguidas." },
  hustle: { en: "may take another action this turn; an attack with it has disadvantage", es: "puede realizar otra acción este turno; si ataca con ella, tiene desventaja" },
  skillLink: { en: "hits at least twice: the first extra hit needs no d4", es: "golpea al menos dos veces: el primer golpe extra no necesita el d4" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];
const moveId = move => move?.getFlag?.(MODULE_ID, "sourceId") ?? "";
const definition = move => move?.getFlag?.(MODULE_ID, "moveDefinition") ?? {};
const targetActors = () => [...game.user?.targets ?? []].map(token => token.actor).filter(Boolean);

// The "MOVE" part of the damage: the best modifier among the Move's power abilities.
export function moveModifier(actor, move) {
  const { damage, powerAbilities = [] } = definition(move);
  if (!/MOVE/.test(String(damage?.modifier ?? ""))) {return 0;}
  const mods = powerAbilities.map(ability => Number(actor.system?.abilities?.[ability]?.mod ?? 0));
  return mods.length ? Math.max(0, ...mods) : 0;
}

function stabBonus(actor, move) {
  const stab = move?.getFlag?.(MODULE_ID, "stab");
  return stab?.eligible ? Number(stab.bonus ?? actor.system?.attributes?.prof ?? 0) : 0;
}

/* ============================================================
 * DAMAGE ROLL
 * ============================================================ */

// Weather Ball: its type, and doubled dice, while there is weather.
const WEATHER_BALL = { sun: "fire", rain: "water", sandstorm: "rock", hail: "ice", snow: "ice" };
const weatherBallType = move => (moveId(move) === "weather-ball" ? WEATHER_BALL[Object.keys(WEATHER_BALL).find(id => hasWeather(id))] ?? null : null);
const TERRAIN_TYPE = { electric: "electric", grassy: "grass", psychic: "psychic" };

export function changedMoveType(actor, move) {
  const type = weatherBallType(move) ?? move?.getFlag?.(MODULE_ID, "moveType");
  const abilityId = Object.keys(TYPE_CHANGE).find(id => hasPokemonAbility(actor, id));
  return (abilityId && TYPE_CHANGE[abilityId](moveId(move), type)) || type;
}

// Tough Claws: a melee Move gets STAB, twice if it already had it. Reckless: twice with recoil.
function stabRiders(actor, move, melee) {
  const stab = stabBonus(actor, move);
  const toughClaws = hasPokemonAbility(actor, "tough-claws") && melee ? stab || Number(actor.system?.attributes?.prof ?? 0) : 0;
  const reckless = hasPokemonAbility(actor, "reckless") && move?.getFlag?.(MODULE_ID, "instantRecoil") ? stab : 0;
  return toughClaws + reckless;
}

// Solar Power, Flower Gift (an ally within 30 ft), Sand Force (STAB again), a terrain of the Move's type (MOVE again).
function weatherFlat(actor, move, type) {
  const prof = Number(actor.system?.attributes?.prof ?? 0);
  const sun = abilityWeather("sun");
  const flowerGift = sun && [...game.combat?.combatants ?? []].some(({ actor: ally }) => ally && hasPokemonAbility(ally, "flower-gift") &&
    ally.getActiveTokens?.()[0]?.document?.disposition === actor.getActiveTokens?.()[0]?.document?.disposition && distanceBetween(actor, ally) <= 30);
  return (hasPokemonAbility(actor, "solar-power") && sun ? 2 : 0) + (flowerGift ? prof : 0) +
    (hasPokemonAbility(actor, "sand-force") && abilityWeather("sandstorm") ? stabBonus(actor, move) : 0) +
    (TERRAIN_TYPE[activeTerrain()] === type ? moveModifier(actor, move) : 0);
}

// A status, or a stat change for someone other than the user.
export const hasSecondaryEffect = move => inflictsStatus(move) || Array.from(move?.effects ?? []).some(effect =>
  effect.getFlag?.(MODULE_ID, "kind") === "pokemon-modifier" && effect.getFlag(MODULE_ID, "trigger") !== "self" &&
  effect.getFlag(MODULE_ID, "target") !== "self");

// How many extra times MOVE counts: Sheer Force +1; Gorilla Tactics +1 on its Move (the first one, if none yet), -1 on the others.
function moveMultiplierRiders(actor, move) {
  const sheer = hasPokemonAbility(actor, "sheer-force") && hasSecondaryEffect(move) ? 1 : 0;
  if (!hasPokemonAbility(actor, "gorilla-tactics")) {return sheer;}
  const chosen = actor.getFlag?.(MODULE_ID, GORILLA_FLAG) ?? moveId(move);
  return sheer + (chosen === moveId(move) ? 1 : -1);
}

const mercilessApplies = (actor, targets) => hasPokemonAbility(actor, "merciless") && targets.length > 0 &&
  targets.every(target => hasPokemonStatus(target, "poisoned"));

// What the attacker's Abilities do to this Move's damage roll.
export function damageRiders(actor, move, targets, { melee = false } = {}) {
  const type = changedMoveType(actor, move);
  const charge = actor.getFlag?.(MODULE_ID, CHARGE_FLAG) ?? {};
  const electric = type === "electric";
  const merciless = mercilessApplies(actor, targets);
  const sharp = hasPokemonAbility(actor, "sharpness") && SHARP_MOVE.test(moveId(move));
  const moveAgain = (sharp ? 1 : 0) + (electric && charge.electromorphosis ? 1 : 0) + moveMultiplierRiders(actor, move);
  const aura = auraDamage(actor, type);
  return {
    type,
    doubleDice: merciless || (electric && Boolean(charge["wind-power"])) || Boolean(weatherBallType(move)) || aura.doubleDice,
    flat: moveAgain * moveModifier(actor, move) + stabRiders(actor, move, melee) + weatherFlat(actor, move, type) + aura.flat,
    dice: aura.dice,
    critical: hasPokemonAbility(actor, "sniper") ? 3 : null,
    consume: electric ? Object.keys(charge) : []
  };
}

// A number or a dice formula ("1d6") added to the roll.
export function addFlat(roll, value) {
  const { OperatorTerm, NumericTerm } = foundry.dice.terms;
  const terms = typeof value === "string" ? foundry.dice.Roll.parse(value) : [new NumericTerm({ number: value })];
  roll.terms.push(new OperatorTerm({ operator: "+" }), ...terms);
  roll.resetFormula();
}

function applyRiders(roll, riders, originalType) {
  if (riders.type && roll.options.type === originalType) {roll.options.type = riders.type;}
  if (riders.doubleDice) {doubleDamageDice(roll);}
  if (!riders.critical || !roll.isCritical) {return;}
  roll.options.critical = { ...roll.options.critical, multiplier: riders.critical };
  roll.configureDamage();
}

const moveOf = activity => (activity?.item?.getFlag?.(MODULE_ID, "kind") === "move" ? activity.item : null);
const isDamageConfig = (rolls, config) => Array.isArray(rolls) && Array.from(config?.hookNames ?? []).includes("damage");

function onPostRollConfiguration(rolls, config) {
  const activity = config?.subject;
  const move = isDamageConfig(rolls, config) ? moveOf(activity) : null;
  const actor = activity?.actor;
  if (!move || !actor) {return;}
  const riders = damageRiders(actor, move, targetActors(), { melee: activity.attack?.type?.value === "melee" });
  const damage = rolls.filter(roll => roll && !["healing", "temphp"].includes(roll.options?.type));
  damage.forEach(roll => applyRiders(roll, riders, move.getFlag(MODULE_ID, "moveType")));
  if (riders.flat && damage[0]) {addFlat(damage[0], riders.flat);}
  if (riders.dice && damage[0]) {addFlat(damage[0], riders.dice);}
  lockGorillaMove(actor, move);
  if (riders.consume.length && actor.isOwner) {
    void actor.unsetFlag(MODULE_ID, CHARGE_FLAG).catch(error => console.error(`[${MODULE_ID}] ability charge`, error));
  }
}

// Gorilla Tactics: the first Move with MOVE damage becomes its Move until it leaves the battlefield.
function lockGorillaMove(actor, move) {
  if (!hasPokemonAbility(actor, "gorilla-tactics") || actor.getFlag(MODULE_ID, GORILLA_FLAG) || !moveModifier(actor, move) || !actor.isOwner) {return;}
  void actor.setFlag(MODULE_ID, GORILLA_FLAG, moveId(move)).catch(error => console.error(`[${MODULE_ID}] gorilla tactics`, error));
}

// Electromorphosis (any damage) and Wind Power (a wind Move) charge the next Electric Move.
export async function chargeNextElectricMove(actor, abilityId) {
  if (!actor.isOwner) {return;}
  await actor.setFlag(MODULE_ID, CHARGE_FLAG, { ...actor.getFlag(MODULE_ID, CHARGE_FLAG), [abilityId]: true });
}

/* ============================================================
 * DAMAGE TAKEN
 * ============================================================ */

function ignore(options, category, value) {
  if (options.ignore === true) {return;}
  options.ignore = { ...options.ignore };
  options.ignore[category] = value === true ? true : new Set([...options.ignore[category] ?? [], ...value]);
}

const resisted = (actor, type) => actor.system?.traits?.dr?.value?.has?.(type) ?? false;

// Extremely harsh sunlight stops Water damage; heavy rain stops Fire damage.
const nullified = type => (type === "water" && hasWeather("extreme-sun")) || (type === "fire" && hasWeather("heavy-rain"));

const isDamage = entry => entry.value > 0 && !["healing", "temphp"].includes(entry.type);
const weakTo = (actor, type) => actor.system?.traits?.dv?.value?.has?.(type) ?? false;

// The attacker's Abilities ignore some of the target's resistances or immunities.
function attackerIgnores(attacker, options) {
  if (hasPokemonAbility(attacker, "tinted-lens")) {ignore(options, "resistance", true);}
  if (["scrappy", "minds-eye"].some(abilityId => hasPokemonAbility(attacker, abilityId))) {ignore(options, "immunity", ["normal", "fighting"]);}
}

// Which damage types the target takes half of: Ice Scales (mental Moves), Misty Terrain (Dragon), Water Compaction (all).
function halvedBy(actor, move) {
  const mental = (definition(move).powerAbilities ?? []).some(ability => MENTAL.includes(ability));
  const misty = activeTerrain() === "misty" && isGrounded(actor);
  const compacted = Array.from(actor.effects ?? []).some(effect => effect.getFlag?.(MODULE_ID, "stackKey") === WATER_COMPACTION);
  return type => compacted || (!resisted(actor, type) && ((hasPokemonAbility(actor, "ice-scales") && mental) ||
    (misty && type === "dragon" && !weakTo(actor, "dragon"))));
}

export function applyRiderDefenses(actor, damages, options = {}) {
  const move = originatingMoveItem(options);
  attackerIgnores(move?.actor, options);
  // Misty Terrain: a grounded Pokémon weak to Dragon takes regular damage instead.
  if (activeTerrain() === "misty" && isGrounded(actor) && weakTo(actor, "dragon")) {ignore(options, "vulnerability", ["dragon"]);}
  const halved = halvedBy(actor, move);
  const ally = telepathyBlocks(actor, move?.actor);
  const stakeout = staked(move?.actor, actor) ? 2 : 1;
  for (const damage of damages.filter(isDamage)) {
    if (nullified(damage.type) || ally) {damage.value = 0;}
    if (move) {damage.value = Math.trunc(damage.value * auraDamageMultiplier(damage.type) * stakeout);}
    if (halved(damage.type)) {damage.value = Math.trunc(damage.value / 2);}
  }
}

// Protosynthesis (sun: STR, CON) and Quark Drive (Electric Terrain: DEX, WIS): advantage on those saves.
function onPreRollSavingThrow(config) {
  const actor = config?.subject;
  const boosted = (hasPokemonAbility(actor, "protosynthesis") && abilityWeather("sun") && ["str", "con"].includes(config.ability)) ||
    (hasPokemonAbility(actor, "quark-drive") && activeTerrain() === "electric" && ["dex", "wis"].includes(config.ability));
  if (boosted) {config.advantage = true;}
}

/* ============================================================
 * INITIATIVE, MOVES AND CRITICAL HITS
 * ============================================================ */

function onPreConfigureInitiative(actor, rollConfig) {
  if (!hasPokemonAbility(actor, "quick-draw")) {return;}
  rollConfig.options ??= {};
  rollConfig.options.advantage = true;
}

const TRUANT_FLAG = "truantLastMove";

export function truantBlocks(actor, move, round) {
  const last = actor.getFlag?.(MODULE_ID, TRUANT_FLAG);
  return hasPokemonAbility(actor, "truant") && Boolean(round) && last?.id === moveId(move) && round - last.round === 1;
}

function onPreUseActivity(activity) {
  const move = moveOf(activity);
  if (!move || !truantBlocks(activity.actor, move, game.combat?.started ? game.combat.round : 0)) {return true;}
  ui.notifications.warn(text("truant"));
  return false;
}

function onPostUseActivity(activity) {
  const move = moveOf(activity);
  const actor = activity?.actor;
  if (!move || !game.combat?.started || !hasPokemonAbility(actor, "truant") || !actor.isOwner) {return;}
  void actor.setFlag(MODULE_ID, TRUANT_FLAG, { id: moveId(move), round: game.combat.round });
}

async function onRollAttack(rolls, data) {
  const actor = data?.subject?.actor;
  const roll = rolls?.[0];
  if (!roll?.isCritical || !hasPokemonAbility(actor, "hustle")) {return;}
  if (roll.parent?.documentName === "ChatMessage") {await messageRollShown(roll.parent);}
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (Hustle) ${text("hustle")}.</div>` });
}

// Combo Moves: after a hit, a d4 of 3 or 4 hits again (up to four extra hits).
export const COMBO_MOVES = new Set(["arm-thrust", "bone-rush", "bullet-seed", "comet-punch", "double-slap", "fury-attack", "fury-swipes",
  "icicle-spear", "pin-missile", "rock-blast", "spike-cannon", "tail-slap", "water-shuriken"]);

async function onSkillLinkOutcome(outcome, context) {
  const move = moveOf(context?.activity);
  const actor = move?.actor;
  if (!isAttackHit(outcome) || !COMBO_MOVES.has(moveId(move)) || !hasPokemonAbility(actor, "skill-link")) {return;}
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (Skill Link) ${text("skillLink")}.</div>` });
}

// Stakeout: the replacement an opponent switched in, until the round after the switch ends.
const STAKEOUT_FLAG = "stakeout";

export function staked(attacker, target) {
  const mark = attacker?.getFlag?.(MODULE_ID, STAKEOUT_FLAG);
  return Boolean(mark) && hasPokemonAbility(attacker, "stakeout") && mark.target === target?.uuid && Number(game.combat?.round ?? 0) <= mark.round;
}

async function onSwitched({ incoming }) {
  const gm = game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
  if (!gm || !incoming || !game.combat) {return;}
  const side = incoming.getActiveTokens?.()[0]?.document?.disposition;
  const watchers = [...new Set([...game.combat.combatants].map(combatant => combatant.actor))].filter(actor => actor &&
    hasPokemonAbility(actor, "stakeout") && actor.getActiveTokens?.()[0]?.document?.disposition !== side);
  for (const watcher of watchers) {await watcher.setFlag(MODULE_ID, STAKEOUT_FLAG, { target: incoming.uuid, round: game.combat.round + 1 });}
}

export function registerRiderAbilityEngine() {
  subscribeAttackOutcome(onSkillLinkOutcome);
  Hooks.on("poke5ePokemonSwitched", event => { void onSwitched(event).catch(error => console.error(`[${MODULE_ID}] stakeout`, error)); });
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  Hooks.on("dnd5e.preCalculateDamage", applyRiderDefenses);
  Hooks.on("dnd5e.preConfigureInitiative", onPreConfigureInitiative);
  Hooks.on("dnd5e.preRollSavingThrow", onPreRollSavingThrow);
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.rollAttack", (rolls, data) => {
    void onRollAttack(rolls, data).catch(error => console.error(`[${MODULE_ID}] hustle`, error));
  });
}

export { WATER_COMPACTION };
