import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";

/* ============================================================
 * CONDITION RIDERS
 *
 * Moves that leave a D&D condition (frightened, blinded, grappled) instead of a Pokémon status. Their
 * templates ride on the Move like status templates and are applied by the same triggers (a failed save
 * or a hit), but with their own kind, so nothing treats them as Pokémon statuses (exclusivity, cures,
 * status announcements). Frightened from Glare, Scary Face and Roar ends with a WIS save at the end of
 * each of the creature's turns, against the Move's DC.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
export const CONDITION_KIND = "move-condition";
const ICONS = "systems/dnd5e/icons/svg/statuses";

const LABELS = {
  es: { frightened: "Asustado", blinded: "Cegado", grappled: "Apresado", save: "Salvación contra", overcomes: "se sobrepone a" },
  en: { frightened: "Frightened", blinded: "Blinded", grappled: "Grappled", save: "Save against", overcomes: "overcomes" }
};

const frightened = { condition: "frightened", trigger: "failed-save", repeatSave: "wis" };
export const CONDITION_RIDERS = Object.freeze({
  glare: frightened,
  "scary-face": frightened,
  // shortcut: the forced move away from the user is the GM's.
  roar: frightened,
  flash: { condition: "blinded", trigger: "failed-save", untilEndOfNextTurn: true },
  "crush-grip": { condition: "grappled", trigger: "hit" },
  "snap-trap": { condition: "grappled", trigger: "failed-save" }
});

const effectId = (moveId, condition) => `P5c${moveId}${condition}`.replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0").slice(0, 16);

export function buildConditionEffects(move, language = "es") {
  const rider = CONDITION_RIDERS[move?.id];
  if (!rider) {return [];}
  const text = LABELS[language === "en" ? "en" : "es"];
  return [{
    _id: effectId(move.id, rider.condition),
    name: text[rider.condition],
    img: `${ICONS}/${rider.condition}.svg`,
    disabled: false,
    transfer: false,
    statuses: [rider.condition],
    changes: [],
    flags: { [MODULE_ID]: {
      kind: CONDITION_KIND, condition: rider.condition, trigger: rider.trigger, sourceMove: move.id,
      ...(rider.repeatSave ? { repeatSave: rider.repeatSave } : {}),
      ...(rider.untilEndOfNextTurn ? endOfNextTurnFlags() : {})
    } }
  }];
}

// The Move's save DC, from the Move that applied it.
function moveDc(effect) {
  const item = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  const save = Array.from(item?.system?.activities ?? []).find(activity => activity.type === "save");
  return Number(save?.save?.dc?.value) || null;
}

// End of the creature's turn: a save against each condition that allows one; a success ends it.
export async function processConditionRidersEndTurn(actor) {
  const text = LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"];
  const effects = Array.from(actor?.effects ?? []).filter(effect =>
    effect.getFlag(MODULE_ID, "kind") === CONDITION_KIND && effect.getFlag(MODULE_ID, "repeatSave"));
  for (const effect of effects) {
    const dc = moveDc(effect);
    if (!dc) {continue;}
    const ability = effect.getFlag(MODULE_ID, "repeatSave");
    const [roll] = await actor.rollSavingThrow({ ability, target: dc }, { configure: false },
      { data: { flavor: `${text.save} ${effect.name} — ${actor.name} (DC ${dc})` } }) ?? [];
    if (!roll || roll.total < dc || !actor.effects.get(effect.id)) {continue;}
    await effect.delete();
    await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
      content: `<p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> ${text.overcomes} <strong>${foundry.utils.escapeHTML(effect.name)}</strong>.</p>` });
  }
}
