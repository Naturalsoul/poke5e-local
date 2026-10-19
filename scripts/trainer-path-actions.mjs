import { getPokemonTrainerUuid, getTrainerOwnedPokemon, getTrainerPartyState, isPokemonActor } from "./trainer-party-service.mjs";
import {
  ensureTrainerPathFeatureResources, getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource
} from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";

const MODULE_ID = "poke5e-local";
const CHEERLEADER_KIND = "trainer-cheerleader";
export const RANGER_PARTNER_FLAG = "rangerPartnerUuid";
let registered = false;

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const add = (key, value) => ({ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(value), priority: 20 });
const modifier = (trainer, ability) => Math.floor((Number(trainer.system?.abilities?.[ability]?.value ?? 10) - 10) / 2);

function pathAtLevel(trainer, pathId, level) {
  return getTrainerProgressionState(trainer)?.path?.id === pathId && (getTrainerLevel(trainer) ?? 0) >= level;
}

// Level 9 path features used from the command center.
export function availableTrainerPathActions(trainer) {
  return [
    pathAtLevel(trainer, "ranger", 9) ? "trainer-partner" : null,
    pathAtLevel(trainer, "poke-mentor", 9) ? "trainer-cheerleader" : null
  ].filter(Boolean);
}

export function trainerPathActionLabel(trainer, action) {
  if (action === "trainer-partner") {
    const partner = fromUuidSync(trainer.getFlag(MODULE_ID, RANGER_PARTNER_FLAG) ?? "", { strict: false });
    return `Partner: ${partner?.name ?? "—"}`;
  }
  const resource = getTrainerProgressionResource(trainer, "cheerleaderUses");
  return `Cheerleader ${resource?.value ?? 0}/${resource?.max ?? 1}`;
}

/* ============================================================
 * RANGER L9 — PARTNERS
 * ============================================================ */

async function choosePartner(trainer) {
  const current = trainer.getFlag(MODULE_ID, RANGER_PARTNER_FLAG);
  const options = getTrainerPartyState(trainer).pokemonUuids
    .map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean)
    .map(pokemon => `<option value="${escape(pokemon.uuid)}" ${pokemon.uuid === current ? "selected" : ""}>${escape(pokemon.name)}</option>`);
  if (!options.length) {
    ui.notifications.warn(en() ? "No Pokémon in the party." : "No hay Pokémon en el equipo.");
    return;
  }
  const uuid = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Partners" },
    content: `<p>${en() ? "Partner until your next long rest:" : "Partner hasta tu próximo descanso largo:"}</p>
      <div class="form-group"><select name="partner">${options.join("")}</select></div>`,
    rejectClose: false,
    ok: { label: en() ? "Choose" : "Elegir", callback: (_event, button) => button.form.elements.partner.value }
  });
  if (uuid) {await trainer.setFlag(MODULE_ID, RANGER_PARTNER_FLAG, uuid);}
}

/* ============================================================
 * POKÉ MENTOR L9 — CHEERLEADER
 * ============================================================ */

export function cheerleaderChanges(choice, bonus) {
  if (choice === "ac") {return [add("system.attributes.ac.bonus", bonus)];}
  const target = choice === "damage" ? "damage" : "attack";
  return ["mwak", "rwak", "msak", "rsak"].map(key => add(`system.bonuses.${key}.${target}`, bonus));
}

async function useCheerleader(trainer) {
  if (!getTrainerProgressionResource(trainer, "cheerleaderUses")?.value) {
    ui.notifications.warn(en() ? "Cheerleader is spent until a short rest." : "Cheerleader está gastado hasta un descanso corto.");
    return;
  }
  const bonus = Math.max(1, modifier(trainer, "cha"));
  const labels = en() ? { attack: "Attack rolls", damage: "Damage rolls", ac: "AC" } : { attack: "Tiradas de ataque", damage: "Tiradas de daño", ac: "CA" };
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Cheerleader" },
    content: `<p>${en() ? `Active Pokémon get +${bonus} until your Pokémon's next turn to:` : `Los Pokémon activos reciben +${bonus} hasta el siguiente turno de tu Pokémon en:`}</p>
      <div class="form-group"><select name="choice">${Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select></div>`,
    rejectClose: false,
    ok: { label: "Cheerleader", callback: (_event, button) => button.form.elements.choice.value }
  });
  if (!choice) {return;}
  // shortcut: only this trainer's active Pokémon are "allies"; other trainers' Pokémon need the effect copied by hand.
  const pokemon = getTrainerPartyState(trainer).activePokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
  if (!pokemon.length) {
    ui.notifications.warn(en() ? "No active Pokémon." : "No hay Pokémon activos.");
    return;
  }
  if (!await spendTrainerProgressionResource(trainer, "cheerleaderUses", 1)) {return;}
  const name = `Cheerleader — ${labels[choice]} +${bonus}`;
  const turnOf = cheerleaderTurnOf(pokemon);
  for (const actor of pokemon) {
    await clearCheerleader(actor);
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: "icons/svg/sound.svg", transfer: false, disabled: false,
      changes: cheerleaderChanges(choice, bonus), flags: { [MODULE_ID]: { kind: CHEERLEADER_KIND, trainerUuid: trainer.uuid, turnOf } } }]);
  }
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<p><strong>${escape(trainer.name)}</strong>: ${escape(name)} (${pokemon.map(actor => escape(actor.name)).join(", ")}).</p>` });
}

async function clearCheerleader(actor) {
  const ids = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === CHEERLEADER_KIND).map(effect => effect.id);
  if (ids.length) {await actor.deleteEmbeddedDocuments("ActiveEffect", ids);}
}

export async function runTrainerPathAction(action, trainer) {
  if (action === "trainer-partner") {return choosePartner(trainer);}
  return useCheerleader(trainer);
}

/* ============================================================
 * EXPIRY
 *
 * Trainers are not in the initiative tracker, so "until your next turn" means until the
 * next turn of the trainer's Pokémon: the one whose turn it was when Cheerleader was used,
 * or, used outside its Pokémon's turn, whichever of its Pokémon acts next. Combat end clears it.
 * ============================================================ */

function authority() {
  return game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

function cheerleaderTurnOf(pokemon) {
  const current = game.combat?.combatant?.actor?.uuid;
  return pokemon.some(actor => actor.uuid === current) ? current : null;
}

// turnOf left the combat (switched out): the next turn of any of the trainer's Pokémon ends it.
export function cheerleaderExpiresOnTurn(turnOf, actorUuid, combatantUuids) {
  return !turnOf || turnOf === actorUuid || !combatantUuids.includes(turnOf);
}

async function expireCheerleader(trainerUuid, shouldExpire = () => true) {
  const trainer = fromUuidSync(trainerUuid, { strict: false });
  if (!isTrainerActor(trainer)) {return;}
  for (const pokemon of getTrainerOwnedPokemon(trainer)) {
    const ids = pokemon.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === CHEERLEADER_KIND
      && effect.getFlag(MODULE_ID, "trainerUuid") === trainerUuid && shouldExpire(effect.getFlag(MODULE_ID, "turnOf"))).map(effect => effect.id);
    if (ids.length) {await pokemon.deleteEmbeddedDocuments("ActiveEffect", ids);}
  }
}

const combatTrainerUuid = actor => (isPokemonActor(actor) ? getPokemonTrainerUuid(actor) : null);

export function registerTrainerPathActions() {
  if (registered) {return;}
  registered = true;
  const run = task => { void task.catch(error => console.error(`[${MODULE_ID}] Error en rasgos de camino`, error)); };
  Hooks.on("updateCombat", (combat, changes) => {
    const actor = combat.combatant?.actor;
    const trainerUuid = combatTrainerUuid(actor);
    if (!authority() || !("turn" in changes || "round" in changes) || !trainerUuid) {return;}
    const combatantUuids = combat.combatants.map(combatant => combatant.actor?.uuid).filter(Boolean);
    run(expireCheerleader(trainerUuid, turnOf => cheerleaderExpiresOnTurn(turnOf, actor.uuid, combatantUuids)));
  });
  Hooks.once("ready", () => {
    if (!authority()) {return;}
    run((async () => {
      for (const trainer of game.actors.filter(isTrainerActor)) {await ensureTrainerPathFeatureResources(trainer);}
    })());
  });
  Hooks.on("deleteCombat", combat => {
    if (!authority()) {return;}
    const trainerUuids = new Set(combat.combatants.map(combatant => combatTrainerUuid(combatant.actor)).filter(Boolean));
    for (const trainerUuid of trainerUuids) {run(expireCheerleader(trainerUuid));}
  });
}
