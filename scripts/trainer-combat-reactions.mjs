import { registerAttackReaction } from "./attack-outcome-engine.mjs";
import { registerSaveReaction } from "./save-outcome-engine.mjs";
import { askTrainerReaction } from "./trainer-reaction-service.mjs";
import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";
import { getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource } from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";

/* ============================================================
 * TRAINER COMBAT REACTIONS
 *
 * Offered only when the feature would change the result, to the player who owns the
 * trainer (see trainer-reaction-service), after Dice So Nice reveals the roll.
 * The roll's chat message is rewritten, so the card and later damage use the new result.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const TARGET_ACTOR_OPTION = "poke5eTargetActorUuid";
let registered = false;

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

function trainerOf(pokemon) {
  if (!isPokemonActor(pokemon)) {return null;}
  const uuid = getPokemonTrainerUuid(pokemon);
  const trainer = uuid ? game.actors.find(actor => actor.uuid === uuid) : null;
  return isTrainerActor(trainer) ? trainer : null;
}

// The trainer of this Pokémon has the feature and points left: { trainer, resource }.
export function featureOwner(pokemon, { pathId, level, resourceId }) {
  const trainer = trainerOf(pokemon);
  if (!trainer || getTrainerProgressionState(trainer)?.path?.id !== pathId || (getTrainerLevel(trainer) ?? 0) < level) {return null;}
  const resource = getTrainerProgressionResource(trainer, resourceId);
  return resource?.value > 0 ? { trainer, resource } : null;
}

export function battleDieFaces(trainer) {
  const level = getTrainerLevel(trainer) ?? 0;
  if (level >= 15) {return 10;}
  return level >= 9 ? 8 : 6;
}

const actorFrom = uuid => (uuid ? fromUuidSync(uuid, { strict: false }) : null);

/* ============================================================
 * ROLL REWRITING
 * ============================================================ */

// A real die keeps its tooltip; a flat bonus is a numeric term.
function addedTerm({ bonus, die, label }) {
  if (die) {return { term: { ...die.terms[0].toJSON(), options: { flavor: label } }, value: Number(die.total), formula: die.formula };}
  if (bonus) {return { term: { class: "NumericTerm", options: { flavor: label }, evaluated: true, number: bonus }, value: bonus, formula: String(bonus) };}
  return null;
}

export function rollWith(roll, { target, ...addition }) {
  const data = roll.toJSON();
  if (target !== undefined) {data.options = { ...data.options, target };}
  const added = addedTerm(addition);
  if (added) {
    data.terms = [...data.terms, { class: "OperatorTerm", options: {}, evaluated: true, operator: "+" }, added.term];
    data.formula = `${roll.formula} + ${added.formula}[${addition.label}]`;
    data.total = Number(roll.total) + added.value;
  }
  return roll.constructor.fromData(data);
}

async function rewriteRoll(roll, replacement) {
  const message = roll.parent;
  if (message?.documentName !== "ChatMessage") {throw new Error("No se encontró el mensaje de la tirada.");}
  const index = message.rolls.length === 1 ? 0 : message.rolls.findIndex(entry => entry.total === roll.total && entry.formula === roll.formula);
  if (index < 0) {throw new Error("No se encontró la tirada en su mensaje.");}
  const rolls = message.rolls.map((entry, position) => (position === index ? replacement : entry));
  await message.update({ rolls: rolls.map(entry => entry.toJSON()) });
  replacement.parent = message;
  return replacement;
}

async function announce(trainer, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message">${html}</div>` });
}

/* ============================================================
 * SPENDING POINTS
 *
 * The owner chooses how many points, between the minimum that changes the result and
 * what the feature allows. The answer comes from another client: validate it again.
 * ============================================================ */

function pointsPrompt(feature, owner, text, { need, max }) {
  const label = en() ? feature.label.en : feature.label.es;
  return {
    title: feature.name,
    use: en() ? `Use ${feature.name}` : `Usar ${feature.name}`,
    content: `<p>${text}</p>
      <div class="form-group"><label>${label}</label>
        <input type="number" name="points" min="${need}" max="${max}" value="${need}" step="1"></div>
      <p class="hint">${en() ? `Minimum: ${need}. Available: ${owner.resource.value}/${owner.resource.max}.`
    : `Mínimo: ${need}. Disponibles: ${owner.resource.value}/${owner.resource.max}.`}</p>`
  };
}

async function askPoints(feature, owner, text, need) {
  const max = Math.min(feature.cap ?? Infinity, owner.resource.value);
  const answer = await askTrainerReaction(owner.trainer, pointsPrompt(feature, owner, text, { need, max }));
  const points = Number(answer?.points);
  if (!Number.isInteger(points) || points < need || points > max) {return null;}
  // shortcut: whoever rolled spends the points, so they need permission on the trainer (the GM, normally).
  return await spendTrainerProgressionResource(owner.trainer, feature.resourceId, points) ? points : null;
}

const SHADOW = { es: "Shadow Points", en: "Shadow Points" };
const TACTICAL = { es: "Tactical Points", en: "Tactical Points" };

export const DEFENSES = [
  { name: "Sabotage", pathId: "grunt", level: 1, resourceId: "shadowPoints", label: SHADOW },
  { name: "Raise Your Defenses", pathId: "tactician", level: 9, resourceId: "tacticalPoints", label: TACTICAL, cap: 5 }
];

export const NOT_THIS_TIME = { name: "Not This Time", pathId: "tactician", level: 15, resourceId: "tacticalPoints", label: TACTICAL, cap: 5 };
export const BATTLE_MASTER = { name: "Battle Master", pathId: "ace-trainer", level: 5, resourceId: "battleDice" };

const reachable = (feature, owner, need) => need >= 1 && need <= Math.min(feature.cap ?? Infinity, owner.resource.value);

/* ============================================================
 * ATTACKS
 * ============================================================ */

const attackHits = (roll, ac) => !roll.isFumble && (roll.isCritical || Number(roll.total) >= ac);

// Sabotage (Grunt) and Raise Your Defenses (Tactician 9): raise the AC of the trainer's Pokémon so a hit misses.
export function defenseOffer(feature) {
  return roll => {
    const ac = Number(roll?.options?.target);
    if (!Number.isFinite(ac) || roll.isCritical || !attackHits(roll, ac)) {return null;}
    const pokemon = actorFrom(roll.options?.[TARGET_ACTOR_OPTION]);
    const owner = featureOwner(pokemon, feature);
    const need = Number(roll.total) - ac + 1;
    if (!owner || !reachable(feature, owner, need)) {return null;}
    return async () => {
      const text = en()
        ? `<strong>${escape(pokemon.name)}</strong> is hit: <strong>${roll.total}</strong> against AC <strong>${ac}</strong>. Raise its AC so it misses?`
        : `<strong>${escape(pokemon.name)}</strong> recibe el golpe: <strong>${roll.total}</strong> contra CA <strong>${ac}</strong>. ¿Subir su CA para que falle?`;
      const points = await askPoints(feature, owner, text, need);
      if (!points) {return null;}
      const replacement = await rewriteRoll(roll, rollWith(roll, { target: ac + points }));
      await announce(owner.trainer, en()
        ? `<strong>${escape(owner.trainer.name)}</strong> uses <strong>${feature.name}</strong>: AC ${ac} → ${ac + points} (${points} points). <strong>Miss.</strong>`
        : `<strong>${escape(owner.trainer.name)}</strong> usa <strong>${feature.name}</strong>: CA ${ac} → ${ac + points} (${points} puntos). <strong>Falla.</strong>`);
      return replacement;
    };
  };
}

// Battle Master (Ace Trainer 5): a Battle Die on a missed attack, when the die can make it hit.
export function battleDieOffer(roll, activity) {
  const ac = Number(roll?.options?.target);
  const pokemon = activity?.actor;
  if (!Number.isFinite(ac) || roll.isFumble || attackHits(roll, ac)) {return null;}
  const owner = featureOwner(pokemon, BATTLE_MASTER);
  const faces = owner ? battleDieFaces(owner.trainer) : 0;
  if (!owner || Number(roll.total) + faces < ac) {return null;}
  return async () => {
    const answer = await askTrainerReaction(owner.trainer, {
      title: "Battle Master",
      use: en() ? "Roll Battle Die" : "Tirar Battle Die",
      content: en()
        ? `<p><strong>${escape(pokemon.name)}</strong> misses: <strong>${roll.total}</strong> against AC <strong>${ac}</strong>. Add a Battle Die (d${faces})? Left: ${owner.resource.value}/${owner.resource.max}.</p>`
        : `<p><strong>${escape(pokemon.name)}</strong> falla: <strong>${roll.total}</strong> contra CA <strong>${ac}</strong>. ¿Añadir un Battle Die (d${faces})? Quedan: ${owner.resource.value}/${owner.resource.max}.</p>`
    });
    if (!answer || !await spendTrainerProgressionResource(owner.trainer, BATTLE_MASTER.resourceId, 1)) {return null;}
    const die = await new Roll(`1d${faces}`).evaluate();
    await game.dice3d?.showForRoll(die, game.user, true);
    return rewriteRoll(roll, rollWith(roll, { die, label: "Battle Die" }));
  };
}

/* ============================================================
 * SAVING THROWS
 * ============================================================ */

const saveSucceeds = (roll, dc) => Number(roll.total) >= dc;

// Raise Your Defenses (Tactician 9): the trainer's Pokémon failed a save it can still pass.
export function saveDefenseOffer(roll, { actor, dc }) {
  const feature = DEFENSES[1];
  if (!Number.isFinite(dc) || saveSucceeds(roll, dc)) {return null;}
  const owner = featureOwner(actor, feature);
  const need = dc - Number(roll.total);
  if (!owner || !reachable(feature, owner, need)) {return null;}
  return async () => {
    const text = en()
      ? `<strong>${escape(actor.name)}</strong> fails its save: <strong>${roll.total}</strong> against DC <strong>${dc}</strong>. Raise it so it succeeds?`
      : `<strong>${escape(actor.name)}</strong> falla su salvación: <strong>${roll.total}</strong> contra CD <strong>${dc}</strong>. ¿Subirla para que la supere?`;
    const points = await askPoints(feature, owner, text, need);
    if (!points) {return null;}
    const replacement = await rewriteRoll(roll, rollWith(roll, { bonus: points, label: feature.name }));
    await announce(owner.trainer, en()
      ? `<strong>${escape(owner.trainer.name)}</strong> uses <strong>${feature.name}</strong>: save ${roll.total} → ${replacement.total}. <strong>Success.</strong>`
      : `<strong>${escape(owner.trainer.name)}</strong> usa <strong>${feature.name}</strong>: salvación ${roll.total} → ${replacement.total}. <strong>Éxito.</strong>`);
    return replacement;
  };
}

// Not This Time (Tactician 15): an opponent passed the save against the Move of the trainer's Pokémon.
export function notThisTimeOffer(roll, { actor, dc, moveUser }) {
  if (!Number.isFinite(dc) || !saveSucceeds(roll, dc)) {return null;}
  const owner = featureOwner(moveUser, NOT_THIS_TIME);
  const need = Number(roll.total) - dc + 1;
  if (!owner || getPokemonTrainerUuid(actor) === owner.trainer.uuid || !reachable(NOT_THIS_TIME, owner, need)) {return null;}
  return async () => {
    const text = en()
      ? `<strong>${escape(actor.name)}</strong> passes the save against <strong>${escape(moveUser.name)}</strong>: <strong>${roll.total}</strong> against DC <strong>${dc}</strong>. Raise the DC so it fails?`
      : `<strong>${escape(actor.name)}</strong> supera la salvación contra <strong>${escape(moveUser.name)}</strong>: <strong>${roll.total}</strong> contra CD <strong>${dc}</strong>. ¿Subir la CD para que falle?`;
    const points = await askPoints(NOT_THIS_TIME, owner, text, need);
    if (!points) {return null;}
    const replacement = await rewriteRoll(roll, rollWith(roll, { target: dc + points }));
    await announce(owner.trainer, en()
      ? `<strong>${escape(owner.trainer.name)}</strong> uses <strong>Not This Time</strong>: DC ${dc} → ${dc + points}. <strong>Failure.</strong>`
      : `<strong>${escape(owner.trainer.name)}</strong> usa <strong>Not This Time</strong>: CD ${dc} → ${dc + points}. <strong>Falla.</strong>`);
    return replacement;
  };
}

export function registerTrainerCombatReactions() {
  if (registered) {return;}
  registered = true;
  // The attacker's die first: the defender reacts to the final total.
  registerAttackReaction(battleDieOffer);
  for (const feature of DEFENSES) {registerAttackReaction(defenseOffer(feature));}
  registerSaveReaction(saveDefenseOffer);
  registerSaveReaction(notThisTimeOffer);
}
