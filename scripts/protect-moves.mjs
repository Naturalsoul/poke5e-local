import { applyPokemonStatus } from "./pokemon-status-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { registerAttackReaction } from "./attack-outcome-engine.mjs";
import { askTrainerReaction } from "./trainer-reaction-service.mjs";
import { rewriteRoll, rollWith } from "./trainer-combat-reactions.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { areaSave, moveDc } from "./lingering-area-moves.mjs";

/* ============================================================
 * THE PROTECT FAMILY (reactions to being hit)
 *
 * When an attack hits a Pokémon that knows Protect, Detect, Obstruct, Baneful Bunker, King's Shield or
 * Spiky Shield (melee only), its player is asked; using it spends 1 PP and turns the hit into a miss.
 * The first use in a combat always works, later ones need more than 15 on a d20 rolled in chat.
 * After a melee attack: Baneful Bunker poisons the attacker, Obstruct makes it save (CON) or flinch,
 * Spiky Shield deals it proficiency grass damage. King's Shield also stops every other attack until
 * the start of its user's next turn.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const USED_FLAG = "protectUsedInCombat";
const KINGS_FLAG = "kingsShieldUp";
const TARGET_ACTOR_OPTION = "poke5eTargetActorUuid";

export const PROTECT_MOVES = Object.freeze({
  protect: {},
  detect: {},
  obstruct: { melee: "flinch" },
  "baneful-bunker": { melee: "poison" },
  "kings-shield": { lasting: true },
  "spiky-shield": { meleeOnly: true, melee: "spikes" }
});

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);
const actorFrom = uuid => {
  const document = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return document?.actor ?? document;
};
const ppLeft = item => !Number(item.system?.uses?.max) || Number(item.system.uses.spent ?? 0) < Number(item.system.uses.max);
const isMelee = activity => (activity?.attack?.type?.value ?? activity?.attack?.type) === "melee";

async function chat(actor, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message">${html}</div>` });
}

// The Protect-family Move this Pokémon can answer the attack with, or null.
export function protectMoveFor(pokemon, activity) {
  return Array.from(pokemon?.items ?? []).find(item => {
    const rule = PROTECT_MOVES[moveId(item)];
    return rule && ppLeft(item) && (!rule.meleeOnly || isMelee(activity));
  }) ?? null;
}

const kingsShieldUp = pokemon => Boolean(game.combat && pokemon?.getFlag?.(MODULE_ID, KINGS_FLAG) === game.combat.id);

async function works(pokemon, move) {
  const combatId = game.combat?.id ?? null;
  if (!combatId || pokemon.getFlag(MODULE_ID, USED_FLAG) !== combatId) {
    if (combatId) {await pokemon.setFlag(MODULE_ID, USED_FLAG, combatId);}
    return true;
  }
  const roll = await new Roll("1d20").evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor: pokemon }), flavor: `${move.name} — d20 > 15` });
  return roll.total > 15;
}

async function punishMelee(pokemon, move, attacker) {
  const { melee } = PROTECT_MOVES[moveId(move)];
  if (!melee || !isPokemonActor(attacker)) {return;}
  const language = en() ? "en" : "es";
  if (melee === "poison") {await applyPokemonStatus(attacker, "poisoned", { language });}
  if (melee === "spikes") {await attacker.applyDamage([{ value: Number(pokemon.system?.attributes?.prof ?? 2), type: "grass" }]);}
  if (melee === "flinch") {
    const dc = moveDc(move);
    const total = await areaSave(attacker, move, dc);
    if (total !== null && total < dc) {await applyPokemonStatus(attacker, "flinched", { language });}
  }
}

const asMiss = roll => rewriteRoll(roll, rollWith(roll, { target: Number(roll.total) + 1 }));

// shortcut: a natural 20 always hits in dnd5e, so no member of the family is offered against it; add a "protected" outcome if a crit must be stopped.
export function protectOffer(roll, activity) {
  const ac = Number(roll?.options?.target);
  const pokemon = actorFrom(roll?.options?.[TARGET_ACTOR_OPTION]);
  if (!isPokemonActor(pokemon) || !Number.isFinite(ac) || roll.isCritical || roll.isFumble || Number(roll.total) < ac) {return null;}
  if (kingsShieldUp(pokemon)) {
    return async () => {
      await chat(pokemon, `<strong>${escape(pokemon.name)}</strong> (King's Shield): ${en() ? "the attack is blocked" : "el ataque queda bloqueado"}.`);
      return asMiss(roll);
    };
  }
  const move = protectMoveFor(pokemon, activity);
  if (!move) {return null;}
  return () => useProtect(pokemon, move, roll, activity);
}

function question(pokemon, move, activity) {
  const [who, what, how] = [pokemon.name, activity?.item?.name, move.name].map(escape);
  return `<p>${en() ? `<strong>${who}</strong> is hit by <strong>${what}</strong>. Use ${how}?`
    : `<strong>${who}</strong> recibe <strong>${what}</strong>. ¿Usar ${how}?`}</p>`;
}

async function useProtect(pokemon, move, roll, activity) {
  const answer = await askTrainerReaction(pokemon, { title: move.name, use: `${en() ? "Use" : "Usar"} ${move.name}`,
    content: question(pokemon, move, activity) });
  if (!answer) {return null;}
  await move.update({ "system.uses.spent": Number(move.system?.uses?.spent ?? 0) + 1 });
  const label = `<strong>${escape(pokemon.name)}</strong> (${escape(move.name)})`;
  if (!await works(pokemon, move)) {
    await chat(pokemon, `${label}: ${en() ? "it fails" : "falla"}.`);
    return null;
  }
  const replacement = await asMiss(roll);
  await chat(pokemon, `${label}: ${en() ? "the attack <strong>misses</strong>" : "el ataque <strong>falla</strong>"}.`);
  if (PROTECT_MOVES[moveId(move)].lasting && game.combat) {await pokemon.setFlag(MODULE_ID, KINGS_FLAG, game.combat.id);}
  if (isMelee(activity)) {await punishMelee(pokemon, move, activity?.actor);}
  return replacement;
}

// Called by the Turn Engine: King's Shield lasts until the start of its user's next turn.
export async function processProtectStartTurn(actor) {
  if (actor?.getFlag?.(MODULE_ID, KINGS_FLAG)) {await actor.unsetFlag(MODULE_ID, KINGS_FLAG);}
}

let registered = false;

export function registerProtectMoves() {
  if (registered) {return;}
  registered = true;
  registerAttackReaction(protectOffer);
}
