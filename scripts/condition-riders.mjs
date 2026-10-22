import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";
import { pokemonTypes } from "./status-runtime.mjs";

/* ============================================================
 * CONDITION RIDERS
 *
 * Moves that leave a D&D condition (frightened, blinded, grappled) or a lasting mark (Mean Look, Salt Cure)
 * instead of a Pokémon status. Their templates ride on the Move like status templates and are applied by the
 * same triggers (a failed save or a hit), but with their own kind, so nothing treats them as Pokémon statuses
 * (exclusivity, cures, status announcements).
 * - Frightened from Glare, Scary Face and Roar ends with a WIS save at the end of each of the creature's
 *   turns, against the Move's DC.
 * - Mean Look: the target can't be switched out or recalled for 3 rounds.
 * - Salt Cure: 1d4 rock damage at the start of each of its turns (double to Water and Steel) until it is
 *   healed or leaves the field.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
export const CONDITION_KIND = "move-condition";
const ICONS = "systems/dnd5e/icons/svg/statuses";

const LABELS = {
  es: { frightened: "Asustado", blinded: "Cegado", grappled: "Apresado", trapped: "Mean Look — No puede huir ni cambiarse",
    salted: "Salt Cure — Salado", save: "Salvación contra", overcomes: "se sobrepone a", saltHurts: "sufre daño por Salt Cure",
    saltEnds: "ya no sufre Salt Cure", cantLeave: name => `${name} no puede huir ni ser cambiado (Mean Look).` },
  en: { frightened: "Frightened", blinded: "Blinded", grappled: "Grappled", trapped: "Mean Look — Can't flee or switch out",
    salted: "Salt Cure — Salted", save: "Save against", overcomes: "overcomes", saltHurts: "is hurt by Salt Cure",
    saltEnds: "is no longer hurt by Salt Cure", cantLeave: name => `${name} can't flee or be switched out (Mean Look).` }
};
const text = () => LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"];
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

const frightened = { condition: "frightened", trigger: "failed-save", repeatSave: "wis" };
export const CONDITION_RIDERS = Object.freeze({
  glare: frightened,
  "scary-face": frightened,
  // shortcut: the forced move away from the user is the GM's.
  roar: frightened,
  flash: { condition: "blinded", trigger: "failed-save", untilEndOfNextTurn: true },
  "crush-grip": { condition: "grappled", trigger: "hit" },
  "snap-trap": { condition: "grappled", trigger: "failed-save" },
  "mean-look": { condition: "trapped", trigger: "failed-save", img: "icons/svg/net.svg", rounds: 3 },
  "salt-cure": { condition: "salted", trigger: "failed-save", img: "icons/svg/acid.svg",
    startTurnDamage: { formula: "1d4", type: "rock", vulnerableTypes: ["water", "steel"] } }
});
const DND_CONDITIONS = new Set(["frightened", "blinded", "grappled"]);

const effectId = (moveId, condition) => `P5c${moveId}${condition}`.replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0").slice(0, 16);

export function buildConditionEffects(move, language = "es") {
  const rider = CONDITION_RIDERS[move?.id];
  if (!rider) {return [];}
  const labels = LABELS[language === "en" ? "en" : "es"];
  return [{
    _id: effectId(move.id, rider.condition),
    name: labels[rider.condition],
    img: rider.img ?? `${ICONS}/${rider.condition}.svg`,
    disabled: false,
    transfer: false,
    statuses: DND_CONDITIONS.has(rider.condition) ? [rider.condition] : [],
    changes: [],
    duration: rider.rounds ? { rounds: rider.rounds } : {},
    flags: { [MODULE_ID]: {
      kind: CONDITION_KIND, condition: rider.condition, trigger: rider.trigger, sourceMove: move.id,
      ...(rider.repeatSave ? { repeatSave: rider.repeatSave } : {}),
      ...(rider.startTurnDamage ? { startTurnDamage: rider.startTurnDamage } : {}),
      ...(rider.untilEndOfNextTurn ? endOfNextTurnFlags() : {})
    } }
  }];
}

const conditions = (actor, condition) => Array.from(actor?.effects ?? []).filter(effect =>
  effect.getFlag?.(MODULE_ID, "kind") === CONDITION_KIND && (!condition || effect.getFlag(MODULE_ID, "condition") === condition));

async function chat(actor, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content: `<p>${html}</p>` });
}

// Mean Look: the switch and recall services refuse while it lasts (a fainted Pokémon still goes back).
export function assertCanLeaveField(pokemon) {
  if (Number(pokemon?.system?.attributes?.hp?.value) > 0 && conditions(pokemon, "trapped").some(effect => !effect.disabled)) {throw new Error(text().cantLeave(pokemon.name));}
}

// The Move's save DC, from the Move that applied it.
function moveDc(effect) {
  const item = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  const save = Array.from(item?.system?.activities ?? []).find(activity => activity.type === "save");
  return Number(save?.save?.dc?.value) || null;
}

// Start of the creature's turn: Salt Cure's damage.
export async function processConditionRidersStartTurn(actor) {
  for (const effect of conditions(actor).filter(entry => entry.getFlag(MODULE_ID, "startTurnDamage"))) {
    const { formula, type, vulnerableTypes = [] } = effect.getFlag(MODULE_ID, "startTurnDamage");
    const roll = await new Roll(formula).evaluate();
    const message = await roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: `${effect.name} (${type})` });
    await game.dice3d?.waitFor3DAnimationByMessageID?.(message?.id);
    const value = roll.total * (pokemonTypes(actor).some(entry => vulnerableTypes.includes(entry)) ? 2 : 1);
    await actor.applyDamage([{ value, type }]);
    await chat(actor, `<strong>${escape(actor.name)}</strong> ${text().saltHurts}: ${value}.`);
  }
}

// End of the creature's turn: a save against each condition that allows one; a success ends it.
export async function processConditionRidersEndTurn(actor) {
  for (const effect of conditions(actor).filter(entry => entry.getFlag(MODULE_ID, "repeatSave"))) {
    const dc = moveDc(effect);
    if (!dc) {continue;}
    const ability = effect.getFlag(MODULE_ID, "repeatSave");
    const [roll] = await actor.rollSavingThrow({ ability, target: dc }, { configure: false },
      { data: { flavor: `${text().save} ${effect.name} — ${actor.name} (DC ${dc})` } }) ?? [];
    if (!roll || roll.total < dc || !actor.effects.get(effect.id)) {continue;}
    await effect.delete();
    await chat(actor, `<strong>${escape(actor.name)}</strong> ${text().overcomes} <strong>${escape(effect.name)}</strong>.`);
  }
}

// Salt Cure ends when the creature is healed or leaves the field.
async function endSaltCure(actor) {
  const salted = conditions(actor, "salted");
  if (!salted.length) {return;}
  await actor.deleteEmbeddedDocuments("ActiveEffect", salted.map(effect => effect.id));
  await chat(actor, `<strong>${escape(actor.name)}</strong> ${text().saltEnds}.`);
}

const logged = task => { void task.catch(error => console.error(`[${MODULE_ID}] condition riders`, error)); };

function onPreUpdateActor(actor, changes, options) {
  if (conditions(actor, "salted").length) {options[MODULE_ID] = { ...options[MODULE_ID], saltHpBefore: actor.system.attributes.hp.value };}
}

// Only the client that healed it reacts, so it ends once.
function onUpdateActor(actor, changes, options, userId) {
  const before = options?.[MODULE_ID]?.saltHpBefore;
  const after = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (userId === game.user.id && before !== undefined && after > before) {logged(endSaltCure(actor));}
}

let registered = false;

export function registerConditionRiders() {
  if (registered) {return;}
  registered = true;
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", onUpdateActor);
  // The switching client owns the Pokémon leaving the field.
  Hooks.on("poke5ePokemonSwitched", ({ outgoing }) => { if (outgoing?.isOwner) {logged(endSaltCure(outgoing));} });
}
