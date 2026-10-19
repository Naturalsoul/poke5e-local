import { hasPokemonAbility, pokemonStatus } from "./status-runtime.mjs";
import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";
import { isTrainerActor } from "./trainer-service.mjs";
import { registerAttackReaction } from "./attack-outcome-engine.mjs";
import { registerSaveReaction } from "./save-outcome-engine.mjs";
import { askTrainerReaction } from "./trainer-reaction-service.mjs";
import { rewriteRoll, rollWith } from "./trainer-combat-reactions.mjs";
import { inflictsStatus } from "./trainer-path-actions.mjs";
import { addFlat, moveModifier } from "./rider-ability-engine.mjs";

/* ============================================================
 * ACTIVE ABILITIES
 *
 * Abilities used once per short or long rest. Most are switched on beforehand from the
 * Pokémon sheet or the battle hotbar, and the next matching event uses them up:
 * - disadvantage: the next attack against the Pokémon;
 * - halve: the damage of the next attack that hits it;
 * - blockStatus: the next status it would get;
 * - doubleDice: the damage dice of its next damage roll;
 * - doubleMove: its MOVE modifier, once more, on its next Move damage roll (Simple);
 * - saveDisadvantage: the next save against a status from its Moves (Mycelium Might).
 * Magic Bounce blocks the next status like Shield Dust and gives it to whoever caused it.
 * Heavy Metal and Steadfast depend on a result already rolled, so they ask (only when
 * they would change it), like the trainer reactions.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const USES_FLAG = "abilityUses";
const GUARD_FLAG = "abilityGuard";
const TARGET_ACTOR_OPTION = "poke5eTargetActorUuid";

export const ACTIVE_ABILITIES = {
  intimidate: { rest: "short", guard: "disadvantage" },
  "cute-charm": { rest: "short", guard: "disadvantage" },
  "light-metal": { rest: "long", guard: "disadvantage" },
  "fur-coat": { rest: "long", guard: "halve" },
  // Friend Guard protects the targeted ally, never the holder itself.
  "friend-guard": { rest: "long", guard: "halve", ally: true },
  "shield-dust": { rest: "long", guard: "blockStatus" },
  "huge-power": { rest: "short", guard: "doubleDice" },
  "pure-power": { rest: "short", guard: "doubleDice" },
  "heavy-metal": { rest: "long", reaction: true },
  steadfast: { rest: "long", reaction: true },
  "magic-bounce": { rest: "long", guard: "blockStatus" },
  simple: { rest: "short", guard: "doubleMove" },
  "mycelium-might": { rest: "short", guard: "saveDisadvantage" }
};

const TEXT = {
  disadvantage: { en: "the next attack against {target} has disadvantage", es: "el próximo ataque contra {target} tendrá desventaja" },
  halve: { en: "{target} will take half the damage of the next attack that hits it", es: "{target} recibirá la mitad del daño del próximo ataque que lo golpee" },
  blockStatus: { en: "{target} will ignore the next status it gets", es: "{target} ignorará el próximo estado que reciba" },
  doubleDice: { en: "{target}'s next damage roll doubles its dice", es: "la próxima tirada de daño de {target} duplica sus dados" },
  doubleMove: { en: "{target}'s next Move damage roll doubles its MOVE modifier", es: "la próxima tirada de daño de un Move de {target} duplica su modificador MOVE" },
  saveDisadvantage: { en: "the next save against a status from {target}'s Moves has disadvantage",
    es: "la próxima salvación contra un estado de los Moves de {target} tendrá desventaja" },
  short: { en: "already used until a short rest", es: "ya usada hasta un descanso corto" },
  long: { en: "already used until a long rest", es: "ya usada hasta un descanso largo" },
  ally: { en: "Target the allied Pokémon it protects.", es: "Marca como objetivo al Pokémon aliado que protege." },
  owner: { en: "Only its owner or the GM can switch it on for", es: "Solo su dueño o el GM pueden activarla para" },
  used: { en: "uses", es: "usa" },
  on: { en: "on", es: "activa" },
  reaction: { en: "Offered when it would change a rolled result", es: "Se ofrece cuando cambiaría el resultado de una tirada" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const actorFrom = uuid => (uuid ? fromUuidSync(uuid, { strict: false }) : null);

export function activeAbilityOf(pokemon) {
  return isPokemonActor(pokemon) ? Object.keys(ACTIVE_ABILITIES).find(abilityId => hasPokemonAbility(pokemon, abilityId)) ?? null : null;
}

function abilityName(pokemon, abilityId) {
  return pokemon.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "ability" && item.getFlag?.(MODULE_ID, "sourceId") === abilityId)?.name ?? abilityId;
}

export const abilityUsesLeft = (pokemon, abilityId) => (pokemon?.getFlag?.(MODULE_ID, USES_FLAG)?.[abilityId] ? 0 : 1);
const guardOf = actor => actor?.getFlag?.(MODULE_ID, GUARD_FLAG) ?? {};

async function spendUse(pokemon, abilityId) {
  await pokemon.setFlag(MODULE_ID, USES_FLAG, { ...pokemon.getFlag(MODULE_ID, USES_FLAG), [abilityId]: true });
}

async function announce(pokemon, abilityId, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }),
    content: `<div class="poke5e-turn-message"><strong>${escape(pokemon.name)}</strong> ${text("used")} <strong>${escape(abilityName(pokemon, abilityId))}</strong>: ${html}.</div>` });
}

// The one targeted Pokémon, other than the holder, whose token is on the holder's side.
function allyTarget(pokemon) {
  const targets = [...game.user.targets];
  const own = pokemon.getActiveTokens?.()[0]?.document?.disposition;
  const [token] = targets;
  return targets.length === 1 && isPokemonActor(token.actor) && token.actor !== pokemon && token.document?.disposition === own ? token.actor : null;
}

/* ============================================================
 * SWITCHING ON
 * ============================================================ */

export async function useActiveAbility(pokemon) {
  const abilityId = activeAbilityOf(pokemon);
  const rule = ACTIVE_ABILITIES[abilityId];
  if (!rule || rule.reaction) {return false;}
  if (!abilityUsesLeft(pokemon, abilityId)) {
    ui.notifications.warn(`${abilityName(pokemon, abilityId)}: ${text(rule.rest)}.`);
    return false;
  }
  const recipient = rule.ally ? allyTarget(pokemon) : pokemon;
  if (!recipient) {
    ui.notifications.warn(text("ally"));
    return false;
  }
  if (!recipient.isOwner) {
    // shortcut: another player's Pokémon needs its owner or the GM; a socket relay would let anyone do it.
    ui.notifications.warn(`${text("owner")} ${recipient.name}.`);
    return false;
  }
  await spendUse(pokemon, abilityId);
  await recipient.setFlag(MODULE_ID, GUARD_FLAG, { ...guardOf(recipient), [rule.guard]: abilityId });
  await announce(pokemon, abilityId, text(rule.guard).replace("{target}", escape(recipient.name)));
  return true;
}

async function clearGuard(actor, kind) {
  const guard = { ...guardOf(actor) };
  if (!guard[kind]) {return;}
  delete guard[kind];
  await (Object.keys(guard).length ? actor.setFlag(MODULE_ID, GUARD_FLAG, guard) : actor.unsetFlag(MODULE_ID, GUARD_FLAG));
}

const logged = promise => void promise.catch(error => console.error(`[${MODULE_ID}] active abilities`, error));

/* ============================================================
 * USING UP A GUARD
 * ============================================================ */

const targetActors = () => [...game.user?.targets ?? []].map(token => token.actor).filter(Boolean);

// Intimidate, Cute Charm, Light Metal: the next attack against the Pokémon.
export function applyGuardDisadvantage(config) {
  const guarded = targetActors().filter(actor => guardOf(actor).disadvantage);
  const rollConfig = config?.rolls?.[0];
  if (!guarded.length || !rollConfig) {return;}
  rollConfig.options ??= {};
  rollConfig.options.disadvantage = true;
  rollConfig.options[MODULE_ID] = { ...rollConfig.options[MODULE_ID], abilityGuard: guarded.map(actor => actor.uuid) };
}

function consumeGuardDisadvantage(rolls) {
  for (const uuid of rolls?.[0]?.options?.[MODULE_ID]?.abilityGuard ?? []) {
    const actor = actorFrom(uuid);
    if (actor) {logged(clearGuard(actor, "disadvantage"));}
  }
}

// Fur Coat, Friend Guard: half the damage of the next attack (any damage that comes from a roll message).
export function applyGuardHalving(actor, damages, options = {}) {
  if (!guardOf(actor).halve || !options.originatingMessage) {return;}
  for (const damage of damages) {
    if (damage.value > 0 && damage.type !== "healing" && damage.type !== "temphp") {damage.value = Math.trunc(damage.value / 2);}
  }
  options[MODULE_ID] = { ...options[MODULE_ID], guardHalved: true };
}

function consumeGuardHalving(actor, _amount, options) {
  if (options?.[MODULE_ID]?.guardHalved) {logged(clearGuard(actor, "halve"));}
}

// Shield Dust: the next status is not applied.
function blockStatus(effect, _data, _options, userId) {
  const actor = effect?.parent;
  if (userId !== game.user.id || !guardOf(actor).blockStatus || !pokemonStatus(effect)) {return true;}
  const abilityId = guardOf(actor).blockStatus;
  logged(clearGuard(actor, "blockStatus").then(() => announce(actor, abilityId, en() ? `ignores ${effect.name}` : `ignora ${effect.name}`)));
  if (abilityId === "magic-bounce") {logged(bounceStatus(effect, actor));}
  return false;
}

// Magic Bounce: the status goes to whoever caused it (its effect's origin).
async function bounceStatus(effect, actor) {
  const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
  const source = origin?.documentName === "Actor" ? origin : origin?.actor;
  if (!source || source === actor) {return;}
  // shortcut: whoever's status bounced must own its source (the GM usually does); otherwise it only is blocked.
  if (!source.isOwner) {return;}
  await source.createEmbeddedDocuments("ActiveEffect", [{ ...effect.toObject(), origin: actor.uuid }]);
}

// Simple: the next Move damage roll adds its MOVE modifier once more.
function applyGuardDoubleMove(rolls, config) {
  if (!Array.isArray(rolls) || !Array.from(config?.hookNames ?? []).includes("damage")) {return;}
  const move = config.subject?.item;
  const actor = move?.actor;
  if (!guardOf(actor).doubleMove || move.getFlag?.(MODULE_ID, "kind") !== "move") {return;}
  const roll = rolls.find(entry => entry && !["healing", "temphp"].includes(entry.options?.type));
  const bonus = moveModifier(actor, move);
  if (roll && bonus) {addFlat(roll, bonus);}
  logged(clearGuard(actor, "doubleMove"));
}

// Mycelium Might: the next save against a status from its Moves has disadvantage.
function applyGuardSaveDisadvantage(config) {
  for (const rollConfig of config?.rolls ?? []) {
    const itemUuid = rollConfig.options?.[MODULE_ID]?.modifierUsage?.itemUuid;
    const move = itemUuid ? fromUuidSync(itemUuid, { strict: false }) : null;
    const user = move?.actor;
    if (!guardOf(user).saveDisadvantage || !inflictsStatus(move)) {continue;}
    rollConfig.options.disadvantage = true;
    if (user.isOwner) {logged(clearGuard(user, "saveDisadvantage"));}
  }
}

// Huge Power, Pure Power: the dice of the next damage roll are doubled.
export function doubleDamageDice(roll) {
  for (const term of roll.terms ?? []) {
    if (typeof term.faces !== "number" || typeof term.number !== "number") {continue;}
    term.options.baseNumber = (term.options.baseNumber ?? term.number) * 2;
    term.number *= 2;
  }
  roll.resetFormula?.();
}

function applyGuardDoubleDice(rolls, config) {
  if (!Array.isArray(rolls) || !Array.from(config?.hookNames ?? []).includes("damage")) {return;}
  const actor = config.subject?.actor ?? config.subject?.item?.actor;
  if (!guardOf(actor).doubleDice) {return;}
  rolls.filter(roll => roll && roll.options?.type !== "healing").forEach(doubleDamageDice);
  logged(clearGuard(actor, "doubleDice"));
}

/* ============================================================
 * REACTIONS
 * ============================================================ */

function askPokemon(pokemon, abilityId, html) {
  // The Pokémon's player decides, or the GM when none is online (wild Pokémon).
  return askTrainerReaction(pokemon, { title: abilityName(pokemon, abilityId), use: `${en() ? "Use" : "Usar"} ${abilityName(pokemon, abilityId)}`, content: `<p>${html}</p>` });
}

const canReact = (pokemon, abilityId) => hasPokemonAbility(pokemon, abilityId) && abilityUsesLeft(pokemon, abilityId) > 0;

// Heavy Metal: +2 AC once per long rest, when that makes a hit miss.
export function heavyMetalOffer(roll) {
  const ac = Number(roll?.options?.target);
  const pokemon = actorFrom(roll?.options?.[TARGET_ACTOR_OPTION]);
  const total = Number(roll?.total);
  if (!Number.isFinite(ac) || roll.isCritical || roll.isFumble || total < ac || total >= ac + 2 || !canReact(pokemon, "heavy-metal")) {return null;}
  return async () => {
    const answer = await askPokemon(pokemon, "heavy-metal", en()
      ? `<strong>${escape(pokemon.name)}</strong> is hit: <strong>${total}</strong> against AC <strong>${ac}</strong>. Raise its AC by 2 so it misses?`
      : `<strong>${escape(pokemon.name)}</strong> recibe el golpe: <strong>${total}</strong> contra CA <strong>${ac}</strong>. ¿Subir su CA en 2 para que falle?`);
    if (!answer || !canReact(pokemon, "heavy-metal")) {return null;}
    await spendUse(pokemon, "heavy-metal");
    const replacement = await rewriteRoll(roll, rollWith(roll, { target: ac + 2 }));
    await announce(pokemon, "heavy-metal", en() ? `AC ${ac} → ${ac + 2}, <strong>miss</strong>` : `CA ${ac} → ${ac + 2}, <strong>falla</strong>`);
    return replacement;
  };
}

// Steadfast: once per long rest, a failed save against a Move that inflicts a status is passed instead.
export function steadfastOffer(roll, { actor, dc, move }) {
  if (!Number.isFinite(dc) || Number(roll?.total) >= dc || !canReact(actor, "steadfast") || !inflictsStatus(move)) {return null;}
  return async () => {
    const answer = await askPokemon(actor, "steadfast", en()
      ? `<strong>${escape(actor.name)}</strong> fails its save against <strong>${escape(move.name)}</strong>: <strong>${roll.total}</strong> against DC <strong>${dc}</strong>. Pass it instead?`
      : `<strong>${escape(actor.name)}</strong> falla su salvación contra <strong>${escape(move.name)}</strong>: <strong>${roll.total}</strong> contra CD <strong>${dc}</strong>. ¿Superarla igualmente?`);
    if (!answer || !canReact(actor, "steadfast")) {return null;}
    await spendUse(actor, "steadfast");
    const replacement = await rewriteRoll(roll, rollWith(roll, { target: Number(roll.total) }));
    await announce(actor, "steadfast", en() ? "<strong>passes</strong> the save" : "<strong>supera</strong> la salvación");
    return replacement;
  };
}

/* ============================================================
 * RESTS
 * ============================================================ */

// A short rest restores the short-rest Abilities; a long rest restores all of them.
export async function restoreAbilityUses(pokemon, longRest) {
  const uses = pokemon.getFlag(MODULE_ID, USES_FLAG);
  if (!uses) {return;}
  const kept = Object.fromEntries(Object.entries(uses).filter(([abilityId]) => !longRest && ACTIVE_ABILITIES[abilityId]?.rest === "long"));
  await (Object.keys(kept).length ? pokemon.setFlag(MODULE_ID, USES_FLAG, kept) : pokemon.unsetFlag(MODULE_ID, USES_FLAG));
}

// A trainer's rest is also its Pokémon's.
export function restedPokemon(actor) {
  return isTrainerActor(actor)
    ? game.actors.filter(entry => isPokemonActor(entry) && getPokemonTrainerUuid(entry) === actor.uuid)
    : [actor].filter(isPokemonActor);
}

function onRestCompleted(actor, result, config) {
  const longRest = result?.longRest === true || config?.type === "long";
  logged(Promise.all(restedPokemon(actor).filter(entry => entry.isOwner).map(entry => restoreAbilityUses(entry, longRest))));
}

/* ============================================================
 * SHEET
 * ============================================================ */

// Play button and uses left next to the Ability's name, like the held item's use buttons.
export function activeAbilityButton(pokemon) {
  const abilityId = activeAbilityOf(pokemon);
  const rule = ACTIVE_ABILITIES[abilityId];
  if (!rule) {return "";}
  const left = abilityUsesLeft(pokemon, abilityId);
  const on = Object.values(guardOf(pokemon)).includes(abilityId);
  const charges = on ? text("on") : `${left}/1`;
  const tooltip = escape(rule.reaction ? text("reaction") : `${en() ? "Use" : "Usar"}: ${abilityName(pokemon, abilityId)} · ${charges}`);
  const button = rule.reaction ? "" : `
    <button type="button" class="poke5e-pokemon-held-item__use" data-poke5e-ability-action="use" data-actor-uuid="${escape(pokemon.uuid)}"
      ${left && pokemon.isOwner ? "" : "disabled"} title="${tooltip}" aria-label="${tooltip}">
      <i class="fa-solid fa-play" aria-hidden="true"></i>
    </button>`;
  return `
    <span class="poke5e-pokemon-held-item__use-control" ${rule.reaction ? `title="${tooltip}"` : ""}>${button}
      <span class="poke5e-pokemon-held-item__charges">${charges}</span>
    </span>`;
}

function onDocumentClick(event) {
  const button = event.target?.closest?.('[data-poke5e-ability-action="use"]');
  if (!button) {return;}
  event.preventDefault();
  event.stopPropagation();
  const pokemon = actorFrom(button.dataset.actorUuid);
  if (pokemon) {logged(useActiveAbility(pokemon));}
}

let registered = false;

export function registerActiveAbilityService() {
  if (registered) {return;}
  registered = true;
  registerAttackReaction(heavyMetalOffer);
  registerSaveReaction(steadfastOffer);
  Hooks.on("dnd5e.preRollAttack", applyGuardDisadvantage);
  Hooks.on("dnd5e.rollAttack", consumeGuardDisadvantage);
  Hooks.on("dnd5e.preCalculateDamage", applyGuardHalving);
  Hooks.on("dnd5e.applyDamage", consumeGuardHalving);
  Hooks.on("preCreateActiveEffect", blockStatus);
  Hooks.on("dnd5e.postRollConfiguration", applyGuardDoubleDice);
  Hooks.on("dnd5e.postRollConfiguration", applyGuardDoubleMove);
  Hooks.on("dnd5e.preRollSavingThrow", applyGuardSaveDisadvantage);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  document.addEventListener("click", onDocumentClick);
}
