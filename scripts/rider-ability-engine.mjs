import { hasPokemonAbility, hasPokemonStatus } from "./status-runtime.mjs";
import { originatingMoveItem } from "./damage-engine.mjs";
import { doubleDamageDice } from "./active-ability-service.mjs";
import { SOUND_MOVES } from "./passive-ability-engine.mjs";
import { messageRollShown } from "./chat-roll-display.mjs";

/* ============================================================
 * ABILITIES THAT CHANGE A MOVE
 *
 * - the Move's damage roll (dnd5e.postRollConfiguration): its type (Galvanize, Normalize...), its dice
 *   (Merciless, Wind Power), its critical multiplier (Sniper) and flat bonuses (Sharpness, Tough Claws,
 *   Reckless, Electromorphosis);
 * - the damage a target takes (dnd5e.preCalculateDamage): Tinted Lens, Scrappy, Mind's Eye, Ice Scales,
 *   Water Compaction;
 * - initiative (Quick Draw), using a Move (Truant) and critical hits (Hustle).
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const CHARGE_FLAG = "abilityCharge";
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
  hustle: { en: "may take another action this turn; an attack with it has disadvantage", es: "puede realizar otra acción este turno; si ataca con ella, tiene desventaja" }
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

export function changedMoveType(actor, move) {
  const type = move?.getFlag?.(MODULE_ID, "moveType");
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

// What the attacker's Abilities do to this Move's damage roll.
export function damageRiders(actor, move, targets, { melee = false } = {}) {
  const type = changedMoveType(actor, move);
  const charge = actor.getFlag?.(MODULE_ID, CHARGE_FLAG) ?? {};
  const electric = type === "electric";
  const merciless = hasPokemonAbility(actor, "merciless") && targets.length > 0 && targets.every(target => hasPokemonStatus(target, "poisoned"));
  const sharp = hasPokemonAbility(actor, "sharpness") && SHARP_MOVE.test(moveId(move));
  const consume = electric ? Object.keys(charge) : [];
  return {
    type,
    doubleDice: merciless || (electric && Boolean(charge["wind-power"])),
    flat: (sharp ? moveModifier(actor, move) : 0) + stabRiders(actor, move, melee) +
      (electric && charge.electromorphosis ? moveModifier(actor, move) : 0),
    critical: hasPokemonAbility(actor, "sniper") ? 3 : null,
    consume
  };
}

function addFlat(roll, value) {
  const { OperatorTerm, NumericTerm } = foundry.dice.terms;
  roll.terms.push(new OperatorTerm({ operator: "+" }), new NumericTerm({ number: value }));
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
  if (riders.consume.length && actor.isOwner) {
    void actor.unsetFlag(MODULE_ID, CHARGE_FLAG).catch(error => console.error(`[${MODULE_ID}] ability charge`, error));
  }
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

export function applyRiderDefenses(actor, damages, options = {}) {
  const move = originatingMoveItem(options);
  const attacker = move?.actor;
  if (hasPokemonAbility(attacker, "tinted-lens")) {ignore(options, "resistance", true);}
  if (["scrappy", "minds-eye"].some(abilityId => hasPokemonAbility(attacker, abilityId))) {ignore(options, "immunity", ["normal", "fighting"]);}
  const mental = (definition(move).powerAbilities ?? []).some(ability => MENTAL.includes(ability));
  const iceScales = hasPokemonAbility(actor, "ice-scales") && mental;
  const compacted = Array.from(actor.effects ?? []).some(effect => effect.getFlag?.(MODULE_ID, "stackKey") === WATER_COMPACTION);
  for (const damage of damages.filter(entry => entry.value > 0 && !["healing", "temphp"].includes(entry.type))) {
    if ((iceScales && !resisted(actor, damage.type)) || compacted) {damage.value = Math.trunc(damage.value / 2);}
  }
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

export function registerRiderAbilityEngine() {
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  Hooks.on("dnd5e.preCalculateDamage", applyRiderDefenses);
  Hooks.on("dnd5e.preConfigureInitiative", onPreConfigureInitiative);
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.rollAttack", (rolls, data) => {
    void onRollAttack(rolls, data).catch(error => console.error(`[${MODULE_ID}] hustle`, error));
  });
}

export { WATER_COMPACTION };
