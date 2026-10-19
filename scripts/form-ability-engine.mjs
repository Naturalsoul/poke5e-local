import { hasPokemonAbility } from "./status-runtime.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { restedPokemon } from "./active-ability-service.mjs";
import { abilityWeather, registerTypeShaper, reshape } from "./battlefield-service.mjs";

/* ============================================================
 * FORM CHANGES
 *
 * Each form is one ActiveEffect (flags.poke5e-local.formAbility) the active GM keeps in step with the
 * Pokémon: its HP, its turns, the Moves it uses and its rests. What a form spent until a rest is kept in
 * flags.poke5e-local.formSpent.
 * - by HP: Schooling, Zen Mode, Shields Down, Power Construct;
 * - by damage: Ice Face, Disguise; by Moves: Stance Change; by an ally: Zero to Hero;
 * - each turn: Hunger Switch; always: Embody Aspect;
 * - types: Zen Mode, Multitype (Plate), RKS System (Memory), Protean and Libero (the Move it uses), Color Change
 *   (the damage that hit it), through battlefield-service's type shapers, during the combat.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const FORM_FLAG = "formAbility";
const SPENT_FLAG = "formSpent";
const ADD = 2;
const OVERRIDE = 5;
const UPGRADE = 4;
const NON_VOLATILE = ["burned", "frozen", "paralyzed", "poisoned", "badly-poisoned", "asleep"];
const SHORT_REST = ["schooling", "shields-down", "ice-face", "disguise"];
const EMBODY = { "embody-aspect-cornerstone": "con", "embody-aspect-heartflame": "str", "embody-aspect-teal": "dex", "embody-aspect-wellspring": "cha" };
const PLATES = { draco: "dragon", dread: "dark", earth: "ground", fist: "fighting", flame: "fire", icicle: "ice", insect: "bug", iron: "steel",
  meadow: "grass", mind: "psychic", pixie: "fairy", sky: "flying", splash: "water", spooky: "ghost", stone: "rock", toxic: "poison", zap: "electric" };

const add = (key, value) => ({ key, mode: ADD, value: String(value), priority: 20 });
const set = (key, value, mode = OVERRIDE) => ({ key, mode, value: String(value), priority: 30 });
const score = ability => `system.abilities.${ability}.value`;
const base = (actor, ability) => Number(actor._source?.system?.abilities?.[ability]?.value ?? actor.system?.abilities?.[ability]?.value ?? 10);
const hp = actor => actor.system?.attributes?.hp ?? {};
const below = (actor, fraction) => Number(hp(actor).value) < Number(hp(actor).max) * fraction;
const spent = (actor, abilityId) => Boolean(actor.getFlag?.(MODULE_ID, SPENT_FLAG)?.[abilityId]);
const gmAuthority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] form abilities`, error)); };
const inCombat = actor => [...game.combat?.combatants ?? []].some(combatant => combatant.actor === actor);

async function announce(actor, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> ${html}.</div>` });
}

const markSpent = (actor, abilityId, value = true) => actor.setFlag(MODULE_ID, SPENT_FLAG, { [abilityId]: value });

/* ============================================================
 * THE FORMS
 * Each returns the changes of the form the Pokémon is in now, or null for its normal form.
 * ============================================================ */

const FORMS = {
  schooling: actor => (actor.getFlag(MODULE_ID, SPENT_FLAG)?.schooling === "school" ?
    [add("system.attributes.ac.bonus", 5), ...["str", "dex", "con"].map(ability => add(score(ability), 5))] : null),
  "zen-mode": actor => (below(actor, 0.5) ? [add("system.attributes.ac.bonus", 4), set(score("str"), base(actor, "wis")),
    set(score("wis"), base(actor, "str"))] : null),
  "zen-mode-galarian": actor => (below(actor, 0.5) ? [add(score("str"), 2), add(score("dex"), 2)] : null),
  "shields-down": actor => (spent(actor, "shields-down") ? [add(score("dex"), 6), add("system.attributes.ac.bonus", -4)] : null),
  "ice-face": actor => (spent(actor, "ice-face") ? [add("system.attributes.ac.bonus", -3), add("system.attributes.movement.bonus", 5)] : null),
  "stance-change": actor => actor.getFlag(MODULE_ID, SPENT_FLAG)?.["stance-change"] ?? null,
  "zero-to-hero": actor => actor.getFlag(MODULE_ID, SPENT_FLAG)?.["zero-to-hero"] ?? null,
  ...Object.fromEntries(Object.entries(EMBODY).map(([abilityId, ability]) => [abilityId, () => [set(score(ability), 23, UPGRADE)]]))
};

// The changes each of the Pokémon's form Abilities wants now.
export function wantedForms(actor) {
  return Object.entries(FORMS).filter(([abilityId]) => hasPokemonAbility(actor, abilityId))
    .map(([abilityId, form]) => [abilityId, form(actor)]).filter(([, changes]) => Array.isArray(changes) && changes.length);
}

const SHIFT_FLAG = "shiftedType";
const SHIFTERS = ["protean", "libero", "color-change"];
const ZEN_TYPES = { "zen-mode": ["fire", "psychic"], "zen-mode-galarian": ["ice", "fire"] };

function heldItemId(actor) {
  const held = isPokemonActor(actor) ? getPokemonHeldItem(actor) : null;
  return String(held?.getFlag?.(MODULE_ID, "sourceId") ?? held?.name ?? "").toLowerCase().replace(/\s+/g, "-");
}

// Zen Mode, Multitype (its Plate's type) and RKS System (its Memory's type, Normal without one).
export function formTypes(actor) {
  const shifted = actor.getFlag?.(MODULE_ID, SHIFT_FLAG);
  if (shifted && SHIFTERS.some(abilityId => hasPokemonAbility(actor, abilityId))) {return [shifted];}
  const zen = Object.keys(ZEN_TYPES).find(abilityId => hasPokemonAbility(actor, abilityId));
  if (zen && below(actor, 0.5)) {return ZEN_TYPES[zen];}
  if (hasPokemonAbility(actor, "multitype")) {
    const type = PLATES[heldItemId(actor).replace(/-plate$/, "")];
    return type ? [type] : null;
  }
  return hasPokemonAbility(actor, "rks-system") ? [/^([a-z]+)-memory$/.exec(heldItemId(actor))?.[1] ?? "normal"] : null;
}

/* ============================================================
 * SYNC
 * ============================================================ */

async function syncForms(actor) {
  const wanted = new Map(wantedForms(actor));
  for (const effect of actor.effects.filter(entry => entry.getFlag(MODULE_ID, FORM_FLAG))) {
    const changes = wanted.get(effect.getFlag(MODULE_ID, FORM_FLAG));
    wanted.delete(effect.getFlag(MODULE_ID, FORM_FLAG));
    if (!changes) {await effect.delete();} else if (JSON.stringify(changes) !== JSON.stringify(effect.changes)) {await effect.update({ changes });}
  }
  const created = [...wanted].map(([abilityId, changes]) => ({ name: abilityId, img: "icons/svg/aura.svg", changes, origin: actor.uuid,
    flags: { [MODULE_ID]: { [FORM_FLAG]: abilityId } } }));
  if (created.length) {await actor.createEmbeddedDocuments("ActiveEffect", created);}
  if (inCombat(actor)) {await reshape(game.combat, [actor]);}
}

const syncing = new Map();

function queueSync(actor) {
  if (!gmAuthority() || !isPokemonActor(actor)) {return;}
  if (!Object.keys(FORMS).some(abilityId => hasPokemonAbility(actor, abilityId)) && !formTypes(actor) &&
    !actor.effects.some(effect => effect.getFlag(MODULE_ID, FORM_FLAG))) {return;}
  const task = (syncing.get(actor.uuid) ?? Promise.resolve()).then(() => syncForms(actor));
  syncing.set(actor.uuid, task);
  logged(task);
}

/* ============================================================
 * HP: Schooling ends, Shields Down breaks, Power Construct, Disguise breaks
 * ============================================================ */

async function onHpChanged(actor, before) {
  const flags = actor.getFlag(MODULE_ID, SPENT_FLAG) ?? {};
  if (flags.schooling === "school" && below(actor, 0.25)) {
    await markSpent(actor, "schooling", "spent");
    await announce(actor, "vuelve a su Forma Individual");
  }
  if (hasPokemonAbility(actor, "shields-down") && !flags["shields-down"] && below(actor, 0.5)) {
    await markSpent(actor, "shields-down");
    await announce(actor, "rompe su coraza: Forma Núcleo");
  }
  const construct = ["power-construct-10", "power-construct-50", "power-construct-100"].find(id => hasPokemonAbility(actor, id));
  if (construct && !flags[construct] && below(actor, 0.5) && Number(hp(actor).value) > 0 && before >= Number(hp(actor).max) * 0.5) {
    await markSpent(actor, construct);
    await actor.update({ "system.attributes.hp.value": Number(hp(actor).max) });
    await announce(actor, "cambia de forma con Power Construct y recupera todos sus PS (cambia su especie en la hoja)");
  }
  if (flags.disguise === "up" && Number(hp(actor).temp ?? 0) <= 0) {
    await markSpent(actor, "disguise", "broken");
    await announce(actor, "pierde su disfraz");
  }
}

/* ============================================================
 * DAMAGE: Ice Face; an ally hurt: Zero to Hero
 * ============================================================ */

// Ice Face: the first damage in Ice Form is halved (marked on the options, spent once applied).
function onCalculateDamage(actor, damages, options = {}) {
  // Color Change: the type of the biggest damage of the hit, taken once it is applied.
  const hit = damages.filter(entry => entry.value > 0 && !["healing", "temphp"].includes(entry.type)).sort((a, b) => b.value - a.value)[0];
  if (hit && hasPokemonAbility(actor, "color-change")) {options.poke5eColorChange = hit.type;}
  if (!hasPokemonAbility(actor, "ice-face") || spent(actor, "ice-face")) {return;}
  for (const damage of damages.filter(entry => entry.value > 0 && !["healing", "temphp"].includes(entry.type))) {
    damage.value = Math.trunc(damage.value / 2);
  }
  options.poke5eIceFace = true;
}

async function onApplyDamage(actor, amount, options = {}) {
  if (options.poke5eColorChange && amount > 0 && inCombat(actor) && actor.isOwner) {await actor.setFlag(MODULE_ID, SHIFT_FLAG, options.poke5eColorChange);}
  if (options.poke5eIceFace && amount > 0) {
    await markSpent(actor, "ice-face");
    await announce(actor, "rompe su cara de hielo: Forma Deshielo");
  }
  if (amount > 0 && !isPokemonActor(actor) && inCombat(actor)) {await heroForAlly(actor);}
}

// Zero to Hero: a non-Pokémon ally of Palafin took damage.
async function heroForAlly(actor) {
  const side = actor.getActiveTokens?.()[0]?.document?.disposition;
  const palafin = [...game.combat.combatants].map(combatant => combatant.actor).find(other => other && hasPokemonAbility(other, "zero-to-hero") &&
    !spent(other, "zero-to-hero") && other.getActiveTokens?.()[0]?.document?.disposition === side);
  // shortcut: needs the damage applier to own Palafin (usually the GM); route through the GM if players apply damage.
  if (!palafin?.isOwner) {return;}
  const raise = ability => set(score(ability), Math.min(22, base(palafin, ability) + 4));
  await markSpent(palafin, "zero-to-hero", [add("system.attributes.ac.bonus", 4), raise("str"), raise("dex"),
    set("system.attributes.movement.walk", 30), set("system.traits.size", "med")]);
  await announce(palafin, "entra en su Forma Heroica");
}

/* ============================================================
 * TURNS, MOVES, STATUSES, COMBAT AND RESTS
 * ============================================================ */

export async function processFormAbilitiesStartTurn(actor) {
  const flags = actor.getFlag(MODULE_ID, SPENT_FLAG) ?? {};
  if (hasPokemonAbility(actor, "schooling") && !flags.schooling && Number(actor.system?.details?.level ?? 0) >= 5 && !below(actor, 0.25)) {
    await markSpent(actor, "schooling", "school");
    await announce(actor, "forma un banco: Forma Banco");
  }
  if (hasPokemonAbility(actor, "ice-face") && flags["ice-face"] && abilityWeather("hail")) {
    await markSpent(actor, "ice-face", false);
    await announce(actor, "recupera su cara de hielo con el granizo");
  }
  if (hasPokemonAbility(actor, "hunger-switch")) {
    const hangry = !flags["hunger-switch"];
    await markSpent(actor, "hunger-switch", hangry);
    await announce(actor, hangry ? "pasa a su Forma Voraz" : "pasa a su Forma Saciada");
  }
}

// Protean and Libero: the type of the Move, just before it is used.
function onPreUseActivity(activity) {
  const actor = activity?.actor;
  const type = activity?.item?.getFlag?.(MODULE_ID, "moveType");
  if (!type || !actor?.isOwner || !inCombat(actor) || !["protean", "libero"].some(abilityId => hasPokemonAbility(actor, abilityId)) ||
    actor.getFlag(MODULE_ID, SHIFT_FLAG) === type) {return true;}
  logged(actor.setFlag(MODULE_ID, SHIFT_FLAG, type));
  return true;
}

// Stance Change: King's Shield → Shield Forme (AC and DEX swapped); a damaging Move → Blade Forme.
async function onPostUseActivity(activity) {
  const actor = activity?.actor;
  const move = activity?.item;
  if (actor?.isOwner && hasPokemonAbility(actor, "stance-change") && move?.getFlag?.(MODULE_ID, "kind") === "move") {await changeStance(actor, move, activity);}
}

async function changeStance(actor, move, activity) {
  const shielded = Boolean(actor.getFlag(MODULE_ID, SPENT_FLAG)?.["stance-change"]);
  if (move.getFlag(MODULE_ID, "sourceId") === "kings-shield" && !shielded) {
    const armor = Number(actor.system?.attributes?.ac?.value ?? 10);
    await markSpent(actor, "stance-change", [set("system.attributes.ac.calc", "flat"), set("system.attributes.ac.flat", base(actor, "dex")),
      set(score("dex"), armor)]);
    await announce(actor, "cambia a su Forma Escudo");
  } else if (shielded && activity.damage?.parts?.length) {
    await markSpent(actor, "stance-change", null);
    await announce(actor, "cambia a su Forma Filo");
  }
}

// Shields Down: no non-volatile status in Meteor Form.
function onPreCreateEffect(effect) {
  const actor = effect.parent;
  if (actor?.documentName !== "Actor" || !hasPokemonAbility(actor, "shields-down") || spent(actor, "shields-down") ||
    effect.getFlag?.(MODULE_ID, "kind") !== "pokemon-status" || !NON_VOLATILE.includes(effect.getFlag(MODULE_ID, "status"))) {return true;}
  ui.notifications.info(`${actor.name} (Shields Down): inmune en su Forma Meteoro.`);
  return false;
}

// Disguise: its temporary HP when the combat starts; Zero to Hero ends with it.
async function onCombatantCreated(combatant) {
  const actor = combatant.actor;
  if (!actor || !hasPokemonAbility(actor, "disguise") || actor.getFlag(MODULE_ID, SPENT_FLAG)?.disguise === "broken") {return;}
  const temp = 2 * Number(actor.system?.details?.level ?? 1);
  await actor.update({ "system.attributes.hp.temp": Math.max(Number(hp(actor).temp ?? 0), temp) });
  await markSpent(actor, "disguise", "up");
}

async function onCombatDeleted(combat) {
  for (const actor of new Set([...combat.combatants].map(combatant => combatant.actor).filter(Boolean))) {
    if (Array.isArray(actor.getFlag(MODULE_ID, SPENT_FLAG)?.["zero-to-hero"])) {await markSpent(actor, "zero-to-hero", true);}
    if (actor.getFlag(MODULE_ID, SPENT_FLAG)?.["stance-change"]) {await markSpent(actor, "stance-change", null);}
    if (actor.getFlag(MODULE_ID, SHIFT_FLAG)) {await actor.unsetFlag(MODULE_ID, SHIFT_FLAG);}
  }
}

function onRestCompleted(actor, result, config) {
  const long = result?.longRest === true || config?.type === "long";
  logged(Promise.all(restedPokemon(actor).filter(pokemon => pokemon.isOwner && pokemon.getFlag(MODULE_ID, SPENT_FLAG)).map(pokemon => {
    const flags = pokemon.getFlag(MODULE_ID, SPENT_FLAG);
    const reset = Object.keys(flags).filter(key => long ? !["hunger-switch"].includes(key) : SHORT_REST.includes(key));
    return reset.length ? pokemon.update(Object.fromEntries(reset.map(key => [`flags.${MODULE_ID}.${SPENT_FLAG}.-=${key}`, null]))) : null;
  })));
}

export function registerFormAbilityEngine() {
  registerTypeShaper(actor => formTypes(actor));
  Hooks.on("preUpdateActor", (actor, changes, options) => {
    if (foundry.utils.hasProperty(changes, "system.attributes.hp")) {options.poke5eHpBefore = Number(hp(actor).value);}
  });
  Hooks.on("updateActor", (actor, changes, options, userId) => {
    if (userId === game.user.id && foundry.utils.hasProperty(changes, "system.attributes.hp")) {logged(onHpChanged(actor, options.poke5eHpBefore));}
    queueSync(actor);
  });
  Hooks.on("updateItem", item => queueSync(item.parent));
  Hooks.on("dnd5e.calculateDamage", onCalculateDamage);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => logged(onApplyDamage(actor, amount, options)));
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.postUseActivity", activity => logged(onPostUseActivity(activity)));
  Hooks.on("preCreateActiveEffect", onPreCreateEffect);
  Hooks.on("createCombatant", (combatant, _options, userId) => { if (userId === game.user.id) {logged(onCombatantCreated(combatant));} });
  Hooks.on("deleteCombat", combat => { if (gmAuthority()) {logged(onCombatDeleted(combat));} });
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  Hooks.once("ready", () => game.actors?.forEach(queueSync));
}
