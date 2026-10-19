import { hasPokemonAbility } from "./status-runtime.mjs";
import { distanceBetween } from "./battlefield-service.mjs";
import { registerSaveReaction } from "./save-outcome-engine.mjs";
import { rewriteRoll } from "./trainer-combat-reactions.mjs";

/* ============================================================
 * AURAS
 *
 * Abilities that reach other Pokémon in the combat. Short ranges (5-30 ft) measure the distance between
 * tokens; "in battle" and long ranges (60-100 ft) count the whole combat, like the weather.
 * Pure rules read by the other engines:
 * - attacks: Victory Star, Plus/Minus, Costar, Supersweet Syrup;
 * - damage: Battery, Power Spot, Steely Spirit, Plus/Minus, Fairy Aura, Dark Aura, Aura Break, Telepathy;
 * - statuses and saves: Flower Veil, Sweet Veil, Aroma Veil;
 * - stat changes: the four Ruin Abilities; bonus actions: Armor Tail, Dazzling, Queenly Majesty;
 * - Screen Cleaner; Neutralizing Gas lives in hasPokemonAbility (status-runtime).
 * ============================================================ */

const RUIN = { "beads-of-ruin": "cha", "sword-of-ruin": "con", "tablets-of-ruin": "str", "vessel-of-ruin": "wis" };
const SCREENS = ["light-screen", "reflect", "aurora-veil"];

const alive = actor => Number(actor?.system?.attributes?.hp?.value) > 0;
const side = actor => actor?.getActiveTokens?.()[0]?.document?.disposition ?? null;

export function combatPokemon(combat = game.combat) {
  return [...new Set([...combat?.combatants ?? []].map(combatant => combatant.actor).filter(alive))];
}

// Other Pokémon in the combat on the same side, within `feet` (Infinity: anywhere).
export function alliesOf(actor, feet = Infinity) {
  const fighting = combatPokemon();
  if (!fighting.includes(actor)) {return [];}
  return fighting.filter(other => other !== actor && side(other) === side(actor) &&
    (feet === Infinity || distanceBetween(actor, other) <= feet));
}

export function opponentsOf(actor) {
  return combatPokemon().filter(other => side(other) !== side(actor));
}

const anyoneHas = abilityId => combatPokemon().some(actor => hasPokemonAbility(actor, abilityId));
const allyHas = (actor, abilityId, feet) => alliesOf(actor, feet).some(ally => hasPokemonAbility(ally, abilityId));

/* ============================================================
 * ATTACKS
 * ============================================================ */

const plusMinus = actor => ["plus", "minus"].some(id => hasPokemonAbility(actor, id)) &&
  alliesOf(actor).some(ally => ["plus", "minus"].some(id => hasPokemonAbility(ally, id)));

// Victory Star (its side, itself included) and Plus/Minus.
export function auraAttackBonus(actor) {
  const victoryStar = hasPokemonAbility(actor, "victory-star") || allyHas(actor, "victory-star");
  return (victoryStar ? 1 : 0) + (plusMinus(actor) ? 2 : 0);
}

// Costar: an ally within 5 ft.
export const auraAdvantage = actor => hasPokemonAbility(actor, "costar") && alliesOf(actor, 5).length > 0;

// Supersweet Syrup: attacks against creatures within 30 ft of it gain 1d4.
export function syrupBonus(targets) {
  const holders = combatPokemon().filter(actor => hasPokemonAbility(actor, "supersweet-syrup"));
  return targets.some(target => holders.some(holder => holder === target || distanceBetween(holder, target) <= 30)) ? "1d4" : null;
}

/* ============================================================
 * DAMAGE
 * ============================================================ */

const powerSpotDie = holder => (Number(holder.system?.details?.level ?? 0) >= 10 ? "1d8" : "1d6");

// { flat, dice, doubleDice } the auras add to `actor`'s Move of `type`.
export function auraDamage(actor, type) {
  const powerSpot = alliesOf(actor, 15).find(ally => hasPokemonAbility(ally, "power-spot"));
  const steely = [actor, ...alliesOf(actor, 30)].filter(other => hasPokemonAbility(other, "steely-spirit")).slice(0, 2);
  const steel = type === "steel" ? steely.reduce((sum, other) => sum + Number(other.system?.abilities?.cha?.mod ?? 0), 0) : 0;
  return {
    flat: steel + (plusMinus(actor) ? 2 : 0),
    dice: powerSpot ? powerSpotDie(powerSpot) : null,
    doubleDice: type === "electric" && allyHas(actor, "battery", 20)
  };
}

// Fairy Aura and Dark Aura double those Moves' damage; Aura Break halves it instead.
export function auraDamageMultiplier(type) {
  const aura = { fairy: "fairy-aura", dark: "dark-aura" }[type];
  if (!aura || !anyoneHas(aura)) {return 1;}
  return anyoneHas("aura-break") ? 0.5 : 2;
}

// Telepathy: its allies' attacks do not hurt it.
export const telepathyBlocks = (target, attacker) => Boolean(attacker) && attacker !== target &&
  hasPokemonAbility(target, "telepathy") && side(attacker) === side(target);

/* ============================================================
 * STATUSES, SAVES, STAT CHANGES, BONUS ACTIONS
 * ============================================================ */

// Flower Veil (Grass allies, any new status) and Sweet Veil (sleep), within 15 ft.
export function auraBlocksStatus(actor, status, types) {
  const veil = [actor, ...alliesOf(actor, 15)];
  if (types.includes("grass") && veil.some(other => hasPokemonAbility(other, "flower-veil"))) {return "flower-veil";}
  return status === "asleep" && veil.some(other => hasPokemonAbility(other, "sweet-veil")) ? "sweet-veil" : null;
}

// Aroma Veil: a WIS save of an ally within 15 ft (or its own) passes.
export const aromaVeilPasses = (actor, ability) => ability === "wis" &&
  [actor, ...alliesOf(actor, 15)].some(other => hasPokemonAbility(other, "aroma-veil"));

// The Ruin Abilities lower everyone else's score by 4 (no stacking); those with one are spared.
export function ruinChanges(actor) {
  if (Object.keys(RUIN).some(abilityId => hasPokemonAbility(actor, abilityId))) {return [];}
  return Object.entries(RUIN).filter(([abilityId]) => combatPokemon().some(other => other !== actor && hasPokemonAbility(other, abilityId)))
    .map(([, ability]) => ({ key: `system.abilities.${ability}.value`, mode: 2, value: "-4", priority: 20 }));
}

// Armor Tail forbids an opponent's bonus action Moves; Dazzling and Queenly Majesty make them cost an action.
export function bonusActionAura(actor) {
  const foes = opponentsOf(actor);
  if (foes.some(foe => hasPokemonAbility(foe, "armor-tail"))) {return "armor-tail";}
  return foes.find(foe => ["dazzling", "queenly-majesty"].some(id => hasPokemonAbility(foe, id))) ? "dazzling" : null;
}

// Screen Cleaner: Light Screen, Reflect and Aurora Veil do nothing while it is in the combat.
export const screenCleaned = sourceMove => SCREENS.includes(sourceMove) && anyoneHas("screen-cleaner");

/* ============================================================
 * HOOKS
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const RUIN_FLAG = "ruinAura";
const gmAuthority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] auras`, error)); };

// shortcut: Ruin lowers the score by 4 without the minimum of 1; fine while no Pokémon has a score under 5.
async function syncRuin(actor, ended) {
  const changes = ended ? [] : ruinChanges(actor);
  const existing = actor.effects?.find(effect => effect.getFlag(MODULE_ID, RUIN_FLAG));
  if (!changes.length) {return existing?.delete();}
  if (existing && JSON.stringify(existing.changes) === JSON.stringify(changes)) {return null;}
  if (existing) {return existing.update({ changes });}
  return actor.createEmbeddedDocuments("ActiveEffect", [{ name: "Ruin", img: "icons/svg/downgrade.svg", changes,
    flags: { [MODULE_ID]: { [RUIN_FLAG]: true } } }]);
}

let queue = Promise.resolve();

function queueRuin(combat, ended = false) {
  if (!gmAuthority() || !combat) {return;}
  const actors = [...new Set([...combat.combatants ?? []].map(combatant => combatant.actor).filter(Boolean))];
  queue = queue.then(() => Promise.all(actors.map(actor => syncRuin(actor, ended))));
  logged(queue);
}

// Armor Tail stops an opponent's bonus action Move; Dazzling and Queenly Majesty only remind it costs an action.
function onPreUseActivity(activity) {
  const actor = activity?.actor;
  if (activity?.item?.getFlag?.(MODULE_ID, "kind") !== "move" || activity.activation?.type !== "bonus" || !actor) {return true;}
  const aura = bonusActionAura(actor);
  if (aura === "armor-tail") {
    ui.notifications.warn("Armor Tail: no puede usar Moves de acción adicional.");
    return false;
  }
  if (aura) {ui.notifications.info("Dazzling / Queenly Majesty: este Move cuesta una acción.");}
  return true;
}

// Screen Cleaner keeps Light Screen, Reflect and Aurora Veil from being made.
function onPreCreateEffect(effect) {
  if (effect.parent?.documentName !== "Actor" || !screenCleaned(effect.getFlag?.(MODULE_ID, "sourceMove"))) {return true;}
  ui.notifications.info("Screen Cleaner: la pantalla no tiene efecto.");
  return false;
}

// Aroma Veil: a failed WIS save becomes a pass.
export function aromaVeilOffer(roll, { actor, dc, ability }) {
  if (!Number.isFinite(dc) || Number(roll?.total) >= dc || !aromaVeilPasses(actor, ability)) {return null;}
  return async () => {
    const data = roll.toJSON();
    const bonus = dc - roll.total;
    data.terms.push({ class: "OperatorTerm", operator: "+", evaluated: true, options: {} },
      { class: "NumericTerm", number: bonus, evaluated: true, options: { flavor: "Aroma Veil" } });
    data.formula = `${data.formula} + ${bonus}`;
    data.total = dc;
    return rewriteRoll(roll, roll.constructor.fromData(data));
  };
}

export function registerAuraAbilityEngine() {
  Hooks.on("updateCombat", combat => queueRuin(combat));
  Hooks.on("createCombatant", combatant => queueRuin(combatant.parent));
  Hooks.on("deleteCombatant", combatant => logged(syncRuin(combatant.actor ?? { effects: [] }, true)));
  Hooks.on("deleteCombat", combat => queueRuin(combat, true));
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("preCreateActiveEffect", onPreCreateEffect);
  registerSaveReaction(aromaVeilOffer);
}
