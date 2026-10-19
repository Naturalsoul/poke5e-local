import { registerAttackReaction } from "./attack-outcome-engine.mjs";
import { registerSaveReaction } from "./save-outcome-engine.mjs";
import { askTrainerReaction } from "./trainer-reaction-service.mjs";
import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";
import { getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource } from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";
import { pokemonStatus } from "./status-runtime.mjs";
import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";
import { messageRollShown } from "./chat-roll-display.mjs";

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

/* ============================================================
 * GRUNT L9 — SINISTER DODGE
 *
 * After a damaging Move is rolled against the trainer's Pokémon, 4 Shadow Points make
 * it one step more resistant to that damage: vulnerable → neutral → resistant → immune.
 * The choice is stored on the damage message and applied whenever that damage is.
 * ============================================================ */

export const SINISTER_DODGE = { name: "Sinister Dodge", pathId: "grunt", level: 9, resourceId: "shadowPoints" };
const DODGE_COST = 4;
const SINISTER_DODGE_FLAG = "sinisterDodge";

const canDodge = pokemon => (featureOwner(pokemon, SINISTER_DODGE)?.resource.value ?? 0) >= DODGE_COST;

export function dodgeCandidates(activity, targets) {
  if (activity?.item?.getFlag?.(MODULE_ID, "kind") !== "move") {return [];}
  return targets.filter(actor => actor && actor !== activity.actor && canDodge(actor));
}

async function offerSinisterDodge(rolls, data) {
  const message = rolls?.[0]?.parent;
  const targets = dodgeCandidates(data?.subject, [...game.user.targets].map(token => token.actor));
  if (!targets.length || message?.documentName !== "ChatMessage") {return;}
  await messageRollShown(message);
  const dodged = [];
  for (const pokemon of targets) {
    const owner = featureOwner(pokemon, SINISTER_DODGE);
    if (!canDodge(pokemon)) {continue;}
    const answer = await askTrainerReaction(owner.trainer, {
      title: SINISTER_DODGE.name,
      use: en() ? "Dodge" : "Esquivar",
      content: en()
        ? `<p><strong>${escape(pokemon.name)}</strong> is about to take damage from <strong>${escape(data.subject.item.name)}</strong>. Spend 4 of ${owner.resource.value} Shadow Points to resist it one step more?</p>`
        : `<p><strong>${escape(pokemon.name)}</strong> va a recibir daño de <strong>${escape(data.subject.item.name)}</strong>. ¿Gastar 4 de ${owner.resource.value} Shadow Points para resistirlo un paso más?</p>`
    });
    if (!answer || !await spendTrainerProgressionResource(owner.trainer, SINISTER_DODGE.resourceId, DODGE_COST)) {continue;}
    dodged.push(pokemon.uuid);
    await announce(owner.trainer, en()
      ? `<strong>${escape(owner.trainer.name)}</strong> uses <strong>Sinister Dodge</strong>: <strong>${escape(pokemon.name)}</strong> resists this damage one step more.`
      : `<strong>${escape(owner.trainer.name)}</strong> usa <strong>Sinister Dodge</strong>: <strong>${escape(pokemon.name)}</strong> resiste este daño un paso más.`);
  }
  if (dodged.length) {await message.setFlag(MODULE_ID, SINISTER_DODGE_FLAG, dodged);}
}

// Vulnerable → neutral and neutral → resistant both halve it; resistant → immune removes it.
export function steppedDamage(damage) {
  const active = { ...damage.active?.all, ...damage.active?.type };
  return active.resistance && !active.vulnerability ? 0 : Math.trunc(damage.value / 2);
}

// dnd5e.calculateDamage runs after resistances: re-step only the damage of the dodging Pokémon.
export function applySinisterDodge(actor, damages, options) {
  const dodged = options?.originatingMessage?.getFlag?.(MODULE_ID, SINISTER_DODGE_FLAG);
  if (!Array.isArray(dodged) || !dodged.includes(actor?.uuid)) {return;}
  for (const damage of damages) {
    if (damage.type in CONFIG.DND5E.healingTypes || !(damage.value > 0)) {continue;}
    const stepped = steppedDamage(damage);
    damages.amount -= damage.value - stepped;
    damage.value = stepped;
  }
}

/* ============================================================
 * GRUNT L15 — NEFARIOUS STAGGER
 *
 * When the trainer's Pokémon inflicts Flinched, 2 Shadow Points turn it into Stunned,
 * with Flinched's duration (until the end of the target's next turn).
 * ============================================================ */

export const NEFARIOUS_STAGGER = { name: "Nefarious Stagger", pathId: "grunt", level: 15, resourceId: "shadowPoints" };
const STAGGER_COST = 2;

function flinchSource(effect) {
  const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  const actor = origin?.documentName === "Actor" ? origin : origin?.actor;
  // Moves and abilities inflict Flinched during their user's turn: without an origin, whoever is acting.
  return isPokemonActor(actor) ? actor : game.combat?.combatant?.actor ?? null;
}

// Only the client that created the Flinched effect offers it, once.
export function staggerOffer(effect, userId) {
  const target = effect?.parent;
  if (userId !== game.user.id || pokemonStatus(effect) !== "flinched" || target?.documentName !== "Actor") {return null;}
  const source = flinchSource(effect);
  const owner = source && source !== target ? featureOwner(source, NEFARIOUS_STAGGER) : null;
  if (!owner || owner.resource.value < STAGGER_COST || getPokemonTrainerUuid(target) === owner.trainer.uuid) {return null;}
  return async () => {
    const answer = await askTrainerReaction(owner.trainer, {
      title: NEFARIOUS_STAGGER.name,
      use: en() ? "Stun it" : "Aturdir",
      content: en()
        ? `<p><strong>${escape(source.name)}</strong> made <strong>${escape(target.name)}</strong> flinch. Spend 2 of ${owner.resource.value} Shadow Points to stun it instead?</p>`
        : `<p><strong>${escape(source.name)}</strong> hizo retroceder a <strong>${escape(target.name)}</strong>. ¿Gastar 2 de ${owner.resource.value} Shadow Points para aturdirlo en su lugar?</p>`
    });
    if (!answer || !target.effects.get(effect.id) || !await spendTrainerProgressionResource(owner.trainer, NEFARIOUS_STAGGER.resourceId, STAGGER_COST)) {return;}
    await target.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    const created = await target.toggleStatusEffect("stunned", { active: true });
    const stunned = typeof created?.update === "function" ? created : target.effects.find(entry => entry.statuses?.has("stunned"));
    await stunned?.update({ [`flags.${MODULE_ID}`]: { ...endOfNextTurnFlags(), nefariousStagger: owner.trainer.uuid } });
    await announce(owner.trainer, en()
      ? `<strong>${escape(owner.trainer.name)}</strong> uses <strong>Nefarious Stagger</strong>: <strong>${escape(target.name)}</strong> is Stunned instead of Flinched.`
      : `<strong>${escape(owner.trainer.name)}</strong> usa <strong>Nefarious Stagger</strong>: <strong>${escape(target.name)}</strong> queda Aturdido en vez de Retroceso.`);
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
  Hooks.on("dnd5e.rollDamage", (rolls, data) => {
    void offerSinisterDodge(rolls, data).catch(error => console.error(`[${MODULE_ID}] Error en Sinister Dodge`, error));
  });
  Hooks.on("dnd5e.calculateDamage", applySinisterDodge);
  Hooks.on("createActiveEffect", (effect, _options, userId) => {
    const step = staggerOffer(effect, userId);
    if (step) {void step().catch(error => console.error(`[${MODULE_ID}] Error en Nefarious Stagger`, error));}
  });
}
