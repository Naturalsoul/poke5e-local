import { getPokemonBattleMoves, isPokemonMoveKnown } from "./pokemon-move-service.mjs";
import { getPokemonTrainerUuid, getTrainerPartyState, isPokemonActive } from "./trainer-party-service.mjs";
import { canCurrentUserOperateTrainerPokemon } from "./trainer-ownership-service.mjs";
import { availableTrainerPathActions, runTrainerPathAction, TRAINER_PATH_ACTION_RESOURCES, trainerPathActionName } from "./trainer-path-actions.mjs";
import { getTrainerProgressionResource } from "./trainer-progression-service.mjs";
import { trainerFeatureIcon } from "./trainer-feature-icons.mjs";
import { reactionDecider } from "./trainer-reaction-service.mjs";
import { ACTIVE_ABILITIES, activeAbilityOf, abilityMaxUses, abilityUsesLeft, useActiveAbility } from "./active-ability-service.mjs";

/* ============================================================
 * BATTLE HOTBAR
 *
 * Page 1 of the hotbar follows the deployed (or selected) Pokémon: its Moves (and an Ability switched on beforehand) from slot 1,
 * the trainer's path actions ending at slot 10. Each slot shows the PP or uses left.
 * The macros are the user's own, reused between Pokémon; only slots holding them are rewritten.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const FLAG = "battleHotbar";
const SLOTS = 10;
const COMMAND = `game.modules.get("${MODULE_ID}").api.useBattleHotbarMacro(this);`;
const DEFAULT_ACTION_ICON = "icons/svg/upgrade.svg";

// Path action → the trainer feature whose icon it uses.
const ACTION_FEATURES = { "trainer-skill-dice": "versatile", "trainer-multitalented": "multitalented", "trainer-partner": "partners",
  "trainer-cheerleader": "cheerleader", "trainer-battle-dice": "battle-master", "trainer-directed-strike": "directed-strike",
  "trainer-dark-advantage": "dark-advantage", "trainer-body": "body", "trainer-spirit": "spirit", "trainer-pokechef": "pokechef",
  "trainer-field-medic": "field-medic", "trainer-tracker": "pokemon-tracker", "trainer-analyst": "analyst" };

let shownSignature = "";
let writing = Promise.resolve();
const knownActive = new Map();

// { slot: { name, img, entry } }, entry = { kind: "move" | "action", uuid, id }.
// The Pokémon's Ability when it is switched on beforehand (Intimidate, Huge Power...).
function abilitySlot(pokemon) {
  const abilityId = activeAbilityOf(pokemon);
  const item = pokemon.items.find(entry => entry.getFlag?.(MODULE_ID, "kind") === "ability" && entry.getFlag?.(MODULE_ID, "sourceId") === abilityId);
  return abilityId && !ACTIVE_ABILITIES[abilityId].reaction
    ? [{ name: item?.name ?? abilityId, img: item?.img ?? DEFAULT_ACTION_ICON, entry: { kind: "ability", uuid: pokemon.uuid, id: abilityId } }]
    : [];
}

export function battleHotbarSlots(pokemon, trainer) {
  const moves = [...getPokemonBattleMoves(pokemon).map(move => ({ name: move.name, img: move.img,
    entry: { kind: "move", uuid: pokemon.uuid, id: move.id } })), ...abilitySlot(pokemon)].slice(0, SLOTS);
  const actions = availableTrainerPathActions(trainer).slice(0, SLOTS - moves.length).map(action => ({ name: trainerPathActionName(action),
    img: trainerFeatureIcon(ACTION_FEATURES[action]) ?? DEFAULT_ACTION_ICON, entry: { kind: "action", uuid: trainer.uuid, id: action } }));
  return Object.fromEntries([
    ...moves.map((slot, index) => [index + 1, slot]),
    ...actions.map((slot, index) => [SLOTS - actions.length + index + 1, slot])
  ]);
}

function moveCounter(pokemon, moveId) {
  const uses = pokemon.items.get(moveId)?.system?.uses;
  return uses?.max > 0 ? { value: uses.value ?? uses.max - (uses.spent ?? 0), max: uses.max } : null;
}

function actionCounter(trainer, action) {
  const resourceId = TRAINER_PATH_ACTION_RESOURCES[action];
  const resource = resourceId ? getTrainerProgressionResource(trainer, resourceId) : null;
  return resourceId ? { value: resource?.value ?? 0, max: resource?.max ?? 1 } : null;
}

// PP of a Move or uses of a path action, null when it has none.
export function battleHotbarCounter(entry) {
  const document = fromUuidSync(entry?.uuid ?? "", { strict: false });
  if (!document) {return null;}
  if (entry.kind === "ability") {
    const max = abilityMaxUses(document, entry.id);
    return max === null ? null : { value: abilityUsesLeft(document, entry.id), max };
  }
  return entry.kind === "move" ? moveCounter(document, entry.id) : actionCounter(document, entry.id);
}

const ownMacros = () => game.macros.filter(macro => macro.author?.id === game.user.id && macro.getFlag(MODULE_ID, FLAG));

// One write at a time, so two quick changes don't both create macros.
function writeHotbar(slots) {
  writing = writing.then(() => replaceBattleSlots(slots)).catch(error => {
    shownSignature = "";
    console.error(`[${MODULE_ID}] battle hotbar`, error);
  });
  return writing;
}

async function replaceBattleSlots(slots) {
  const signature = JSON.stringify(slots);
  if (signature === shownSignature) {return;}
  shownSignature = signature;
  const pool = ownMacros();
  const hotbar = { ...game.user.hotbar };
  for (let slot = 1; slot <= SLOTS; slot++) {
    if (pool.some(macro => macro.id === hotbar[slot])) {delete hotbar[slot];}
  }
  const data = Object.entries(slots).map(([slot, { name, img, entry }]) => [slot,
    { name, img, type: "script", command: COMMAND, flags: { [MODULE_ID]: { [FLAG]: entry } } }]);
  const reused = data.slice(0, pool.length).map(([slot, macroData], index) => {
    hotbar[slot] = pool[index].id;
    return { _id: pool[index].id, ...macroData };
  });
  const fresh = data.slice(pool.length);
  if (reused.length) {await game.macros.documentClass.updateDocuments(reused);}
  const created = fresh.length ? await game.macros.documentClass.createDocuments(fresh.map(([, macroData]) => macroData)) : [];
  created.forEach((macro, index) => { hotbar[fresh[index][0]] = macro.id; });
  await game.user.update({ hotbar }, { diff: false, recursive: false });
  if (ui.hotbar?.page !== 1) {await ui.hotbar?.changePage(1);}
  ui.hotbar?.render();
}

export function showBattleHotbar(pokemon, trainer) {
  return writeHotbar(battleHotbarSlots(pokemon, trainer));
}

function operableTrainer(pokemon) {
  const trainer = fromUuidSync(getPokemonTrainerUuid(pokemon) ?? "", { strict: false });
  return trainer && isPokemonActive(trainer, pokemon) && canCurrentUserOperateTrainerPokemon(trainer, pokemon) ? trainer : null;
}

// What each kind of battle macro runs, or null when it is not available to this user.
const RUNNERS = {
  action: (document, id) => (document?.isOwner ? () => runTrainerPathAction(id, document) : null),
  ability: document => (document?.isOwner ? () => useActiveAbility(document) : null),
  move: (document, id) => {
    const move = document?.items.get(id);
    return move && isPokemonMoveKnown(document, move) && operableTrainer(document) ? () => move.use() : null;
  }
};

export async function useBattleHotbarMacro(macro) {
  const entry = macro?.getFlag(MODULE_ID, FLAG);
  const run = RUNNERS[entry?.kind]?.(fromUuidSync(entry?.uuid ?? "", { strict: false }), entry?.id);
  if (run) {return run();}
  ui.notifications.warn(game.settings.get(MODULE_ID, "language") === "en"
    ? "That Pokémon or action is no longer available to you." : "Ese Pokémon o acción ya no está disponible para ti.");
  return null;
}

function onControlToken(token, controlled) {
  const pokemon = token.actor;
  const trainer = controlled && pokemon ? operableTrainer(pokemon) : null;
  if (trainer) {showBattleHotbar(pokemon, trainer);}
}

// After a deploy, recall or switch, the trainer's player (or the GM when none is online) follows the change.
function onPartyChange(trainer, changes) {
  if (foundry.utils.getProperty(changes, `flags.${MODULE_ID}.trainerParty`) === undefined || reactionDecider(trainer) !== game.user) {return;}
  const active = getTrainerPartyState(trainer).activePokemonUuids;
  const previous = knownActive.get(trainer.uuid) ?? [];
  knownActive.set(trainer.uuid, active);
  const target = active.filter(uuid => !previous.includes(uuid)).at(-1) ?? (previous.length > active.length ? active.at(-1) : null);
  const pokemon = target ? fromUuidSync(target, { strict: false }) : null;
  if (pokemon) {showBattleHotbar(pokemon, trainer);}
  else if (!active.length && previous.length) {writeHotbar({});}
}

// Uuids of the actors behind the battle macros on the page shown.
function shownUuids() {
  return new Set((ui.hotbar?.slots ?? []).map(slot => slot.macro?.getFlag(MODULE_ID, FLAG)?.uuid).filter(Boolean));
}

function onRenderHotbar(_app, html) {
  for (const element of html.querySelectorAll(".slot[data-slot]")) {
    const entry = game.macros.get(game.user.hotbar[element.dataset.slot])?.getFlag(MODULE_ID, FLAG);
    const counter = entry ? battleHotbarCounter(entry) : null;
    if (!counter) {continue;}
    element.classList.toggle("poke5e-hotbar-slot--spent", counter.value <= 0);
    element.insertAdjacentHTML("beforeend", `<span class="poke5e-hotbar-slot__count">${counter.value}/${counter.max}</span>`);
  }
}

function rerenderIfShown(actor) {
  if (actor && shownUuids().has(actor.uuid)) {ui.hotbar.render();}
}

export function registerBattleHotbar() {
  Hooks.on("controlToken", onControlToken);
  Hooks.on("updateActor", (actor, changes) => {
    onPartyChange(actor, changes);
    rerenderIfShown(actor);
  });
  Hooks.on("updateItem", item => rerenderIfShown(item.parent));
  Hooks.on("renderHotbar", onRenderHotbar);
}
