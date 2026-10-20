import { findStatusEffect } from "./status-runtime.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { activeTerrain, distanceBetween, isGrounded } from "./battlefield-service.mjs";
import { sufferArea } from "./lingering-area-moves.mjs";
import { askTrainerReaction } from "./trainer-reaction-service.mjs";
import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";

/* ============================================================
 * MOVES THAT KEEP STATUSES AWAY
 *
 * - Uproar: while its user concentrates on it, creatures within 30 ft wake up and can't fall asleep,
 *   and those starting their turn there make a CON save against its damage (half on a success);
 * - Electric Terrain: grounded Pokémon wake up when it is up (blocking sleep and doubling MOVE are
 *   in event-ability-engine and rider-ability-engine);
 * - Safeguard: its user and allies within 50 ft can't get a new status for 3 rounds;
 * - Take Heart: a reaction to getting a status or Frightened; it is cured, gets no new one and has
 *   advantage on WIS and CHA saves until the end of its next turn (advantage on WIS/CHA Move attacks is manual).
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SAFEGUARD_KIND = "pokemon-safeguard";
const UPROAR = { radius: 30, rule: { damage: "half-on-save" } };
const SAFEGUARD_RANGE = 50;
const TAKE_HEART_KIND = "pokemon-take-heart";

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const authority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] status field moves`, error)); };
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);
const combatActors = () => Array.from(game.combat?.combatants ?? []).map(combatant => combatant.actor).filter(isPokemonActor);
const side = actor => actor?.getActiveTokens?.()[0]?.document?.disposition ?? null;

// The Move a concentration effect is on (dnd5e stores it in flags.dnd5e.item, or as its origin).
function concentratedMove(effect) {
  if (!effect?.statuses?.has?.("concentrating")) {return null;}
  const uuid = effect.getFlag?.("dnd5e", "item")?.uuid ?? effect.origin;
  return uuid ? fromUuidSync(uuid, { strict: false }) : null;
}

// Each Uproar going on in the combat: its user and its Move.
export function activeUproars() {
  return combatActors().flatMap(user => Array.from(user.effects ?? []).map(concentratedMove)
    .filter(item => moveId(item) === "uproar").map(item => ({ user, item })));
}

const inUproar = (actor, { user }) => actor !== user && distanceBetween(actor, user) <= UPROAR.radius;

function safeguarded(actor) {
  return Array.from(actor?.effects ?? []).some(effect => effect.getFlag?.(MODULE_ID, "kind") === SAFEGUARD_KIND &&
    Number(game.combat?.round ?? 0) < Number(effect.getFlag(MODULE_ID, "untilRound")));
}

// What keeps this status off the Pokémon, or null (called from battlefieldBlocksStatus).
export function fieldMoveBlocksStatus(actor, status) {
  if (safeguarded(actor)) {return "safeguard";}
  if (Array.from(actor?.effects ?? []).some(effect => effect.getFlag?.(MODULE_ID, "kind") === TAKE_HEART_KIND)) {return "take-heart";}
  return status === "asleep" && activeUproars().some(uproar => inUproar(actor, uproar)) ? "uproar" : null;
}

async function wake(actor) {
  await findStatusEffect(actor, "asleep")?.delete();
}

async function safeguard(user) {
  const allies = combatActors().filter(ally => ally === user || (side(ally) === side(user) && distanceBetween(ally, user) <= SAFEGUARD_RANGE));
  const untilRound = Number(game.combat?.round ?? 0) + 3;
  for (const ally of allies) {
    await ally.createEmbeddedDocuments("ActiveEffect", [{
      name: "Safeguard", img: "icons/magic/defensive/shield-barrier-blue.webp", origin: user.uuid,
      description: en() ? "Protected from new status conditions." : "Protegido de nuevos estados.",
      flags: { [MODULE_ID]: { kind: SAFEGUARD_KIND, untilRound } }
    }]);
  }
}

async function onMoveUsed(activity) {
  const id = moveId(activity?.item);
  if (!authority() || !isPokemonActor(activity?.actor)) {return;}
  if (id === "safeguard") {await safeguard(activity.actor);}
  if (id === "uproar") {
    for (const actor of combatActors()) {if (inUproar(actor, { user: activity.actor })) {await wake(actor);}}
  }
}

// Called by the Turn Engine at the start of the Pokémon's turn.
export async function processStatusFieldMovesStartTurn(actor) {
  if (!isPokemonActor(actor)) {return;}
  for (const effect of Array.from(actor.effects ?? [])) {
    if (effect.getFlag?.(MODULE_ID, "kind") === SAFEGUARD_KIND && !safeguarded(actor)) {await effect.delete();}
  }
  for (const uproar of activeUproars().filter(entry => inUproar(actor, entry))) {
    await wake(actor);
    await sufferArea(actor, { item: uproar.item, rule: UPROAR.rule });
  }
}

const ppLeft = item => !Number(item.system?.uses?.max) || Number(item.system.uses.spent ?? 0) < Number(item.system.uses.max);

export function takeHeartMove(effect) {
  const actor = effect?.parent;
  const harmful = effect?.getFlag?.(MODULE_ID, "kind") === "pokemon-status" || effect?.statuses?.has?.("frightened");
  if (!harmful || actor?.documentName !== "Actor" || !isPokemonActor(actor)) {return null;}
  return Array.from(actor.items ?? []).find(item => moveId(item) === "take-heart" && ppLeft(item)) ?? null;
}

async function takeHeart(effect, move) {
  const actor = effect.parent;
  const answer = await askTrainerReaction(actor, { title: move.name, use: `${en() ? "Use" : "Usar"} ${move.name}`,
    content: `<p>${en() ? `${actor.name} gets ${effect.name}. Use ${move.name}?` : `${actor.name} recibe ${effect.name}. ¿Usar ${move.name}?`}</p>` });
  if (!answer) {return;}
  await move.update({ "system.uses.spent": Number(move.system?.uses?.spent ?? 0) + 1 });
  await effect.delete();
  const advantage = ["wis", "cha"].map(ability => ({ key: `system.abilities.${ability}.save.roll.mode`, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "1" }));
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: move.name, img: move.img, origin: move.uuid, changes: advantage,
    flags: { [MODULE_ID]: { kind: TAKE_HEART_KIND, ...endOfNextTurnFlags() } } }]);
}

function onCreateEffect(effect, _options, userId) {
  const move = userId === game.user.id ? takeHeartMove(effect) : null;
  if (move) {logged(takeHeart(effect, move));}
}

async function onUpdateCombat() {
  if (!authority() || activeTerrain() !== "electric") {return;}
  for (const actor of combatActors()) {if (isGrounded(actor)) {await wake(actor);}}
}

let registered = false;

export function registerStatusFieldMoves() {
  if (registered) {return;}
  registered = true;
  Hooks.on("dnd5e.postUseActivity", activity => logged(onMoveUsed(activity)));
  Hooks.on("updateCombat", () => logged(onUpdateCombat()));
  Hooks.on("createActiveEffect", onCreateEffect);
}
