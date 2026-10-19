import { getPokemonTrainerUuid, getTrainerOwnedPokemon, getTrainerPartyState, isPokemonActor } from "./trainer-party-service.mjs";
import {
  ensureTrainerPathFeatureResources, getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource
} from "./trainer-progression-service.mjs";
import { refreshTrainerFeatureIcons } from "./trainer-feature-service.mjs";
import { MULTITALENTED_FLAG } from "./trainer-path-effects.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";
import { battleDieFaces } from "./trainer-combat-reactions.mjs";

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

// Path features used from the command center; resource → shown by its button instead of a counter.
export const TRAINER_PATH_ACTION_RESOURCES = { "trainer-skill-dice": "skillDice", "trainer-cheerleader": "cheerleaderUses", "trainer-battle-dice": "battleDice" };
export const TRAINER_PATH_ACTION_ICONS = { "trainer-skill-dice": "fa-dice-six", "trainer-multitalented": "fa-graduation-cap", "trainer-partner": "fa-handshake",
  "trainer-cheerleader": "fa-bullhorn", "trainer-battle-dice": "fa-dice-d6", "trainer-directed-strike": "fa-crosshairs", "trainer-dark-advantage": "fa-mask" };
const ACTION_NAMES = { "trainer-skill-dice": "Skill Dice", "trainer-cheerleader": "Cheerleader", "trainer-battle-dice": "Battle Dice" };

export function availableTrainerPathActions(trainer) {
  return [
    pathAtLevel(trainer, "hobbyist", 5) ? "trainer-skill-dice" : null,
    pathAtLevel(trainer, "hobbyist", 15) ? "trainer-multitalented" : null,
    pathAtLevel(trainer, "ranger", 9) ? "trainer-partner" : null,
    pathAtLevel(trainer, "poke-mentor", 9) ? "trainer-cheerleader" : null,
    pathAtLevel(trainer, "ace-trainer", 5) ? "trainer-battle-dice" : null,
    pathAtLevel(trainer, "tactician", 5) ? "trainer-directed-strike" : null,
    pathAtLevel(trainer, "grunt", 5) ? "trainer-dark-advantage" : null
  ].filter(Boolean);
}

export function trainerPathActionLabel(trainer, action) {
  if (action === "trainer-multitalented") {return "Multitalented";}
  if (action === "trainer-directed-strike") {return "Directed Strike";}
  if (action === "trainer-dark-advantage") {return "Dark Advantage";}
  if (action === "trainer-partner") {
    const partner = fromUuidSync(trainer.getFlag(MODULE_ID, RANGER_PARTNER_FLAG) ?? "", { strict: false });
    return `Partner: ${partner?.name ?? "—"}`;
  }
  const resource = getTrainerProgressionResource(trainer, TRAINER_PATH_ACTION_RESOURCES[action]);
  return `${ACTION_NAMES[action]} ${resource?.value ?? 0}/${resource?.max ?? 1}`;
}

/* ============================================================
 * HOBBYIST L5 — VERSATILE
 *
 * The Skill Dice button adds a d6 to the latest skill check or save of one of the
 * trainer's Pokémon, after its result is known, by rewriting that chat message.
 * ============================================================ */

const VERSATILE_ROLL_TYPES = ["skill", "save"];

// The latest roll of these types by one of the trainer's Pokémon that `key` has not changed yet.
export function latestVersatileMessage(trainer, messages, { types = VERSATILE_ROLL_TYPES, key = "versatile" } = {}) {
  return [...messages].slice(-20).reverse().find(message => {
    const actor = ChatMessage.implementation.getSpeakerActor(message.speaker);
    return types.includes(message.flags?.dnd5e?.roll?.type) && message.rolls?.length
      && !message.rolls[0].options?.[MODULE_ID]?.[key] && isPokemonActor(actor) && getPokemonTrainerUuid(actor) === trainer.uuid;
  }) ?? null;
}

// Appends an evaluated die roll to an evaluated roll, keeping it a real die so the tooltip shows it.
// A label that is not a damage type leaves the die with the roll's own damage type.
export function withVersatileDie(roll, dieRoll, { label = "Versatile", key = "versatile" } = {}) {
  const data = roll.toJSON();
  const die = { ...dieRoll.terms[0].toJSON(), options: { flavor: label } };
  data.terms = [...data.terms, { class: "OperatorTerm", options: {}, evaluated: true, operator: "+" }, die];
  data.formula = `${roll.formula} + ${dieRoll.formula}[${label}]`;
  data.total = Number(roll.total) + Number(dieRoll.total);
  data.options = { ...data.options, [MODULE_ID]: { ...data.options?.[MODULE_ID], [key]: dieRoll.total } };
  return roll.constructor.fromData(data);
}

// The latest matching roll, if this user may rewrite it; warns otherwise.
function rewritableMessage(trainer, filter, missing) {
  const message = latestVersatileMessage(trainer, game.messages.contents, filter);
  if (!message) {
    ui.notifications.warn(missing);
    return null;
  }
  // shortcut: only the roll's author or the GM can rewrite it; a socket relay would be needed if others roll for the trainer's Pokémon.
  if (!message.canUserModify(game.user, "update")) {
    ui.notifications.warn(en() ? "Only whoever rolled it or the GM can change it." : "Solo quien hizo la tirada o el GM puede cambiarla.");
    return null;
  }
  return message;
}

const rollLine = message => {
  const actor = ChatMessage.implementation.getSpeakerActor(message.speaker);
  const total = message.rolls.reduce((sum, roll) => sum + Number(roll.total), 0);
  return `<p><strong>${escape(actor?.name)}</strong> — ${escape(message.flavor)}: <strong>${total}</strong></p>`;
};

async function addDieToLatestRoll(trainer, { resourceId, filter, faces, label, title, missing }) {
  const resource = getTrainerProgressionResource(trainer, resourceId);
  if (!resource?.value) {
    ui.notifications.warn(en() ? `No ${title} left until a long rest.` : `No quedan ${title} hasta un descanso largo.`);
    return;
  }
  const message = rewritableMessage(trainer, filter, missing);
  if (!message) {return;}
  const [roll, ...rest] = message.rolls;
  const use = await foundry.applications.api.DialogV2.confirm({
    window: { title },
    content: `${rollLine(message)}
      <p>${en() ? `Add a d${faces}? Left: ${resource.value}/${resource.max}.` : `¿Añadir un d${faces}? Quedan: ${resource.value}/${resource.max}.`}</p>`,
    rejectClose: false
  });
  if (use !== true || !await spendTrainerProgressionResource(trainer, resourceId, 1)) {return;}
  const die = await new Roll(`1d${faces}`).evaluate();
  await game.dice3d?.showForRoll(die, game.user, true);
  await message.update({ rolls: [withVersatileDie(roll, die, { label, key: filter.key }), ...rest].map(entry => entry.toJSON()) });
}

function useSkillDie(trainer) {
  return addDieToLatestRoll(trainer, {
    resourceId: "skillDice", filter: {}, label: "Versatile", title: "Skill Dice",
    // Multitalented (L15): Skill Dice become d10.
    faces: pathAtLevel(trainer, "hobbyist", 15) ? 10 : 6,
    missing: en() ? "No recent skill check or save from your Pokémon." : "No hay una tirada reciente de habilidad o salvación de tus Pokémon."
  });
}

const DAMAGE_MISSING = () => (en() ? "No recent damage roll from your Pokémon." : "No hay una tirada de daño reciente de tus Pokémon.");

// Battle Master (Ace Trainer 5): a Battle Die on a damage roll; attack rolls are offered it when it can turn a miss into a hit.
function useBattleDie(trainer) {
  return addDieToLatestRoll(trainer, {
    resourceId: "battleDice", filter: { types: ["damage"], key: "battleDie" }, faces: battleDieFaces(trainer),
    label: "Battle Die", title: "Battle Dice", missing: DAMAGE_MISSING()
  });
}

/* ============================================================
 * TACTICIAN L5 — DIRECTED STRIKE
 *
 * 2 Tactical Points: the latest damage roll of one of the trainer's Pokémon is rolled
 * again and the higher result is kept.
 * ============================================================ */

const DIRECTED_STRIKE_COST = 2;

async function useDirectedStrike(trainer) {
  const resource = getTrainerProgressionResource(trainer, "tacticalPoints");
  if ((resource?.value ?? 0) < DIRECTED_STRIKE_COST) {
    ui.notifications.warn(en() ? "Directed Strike needs 2 Tactical Points." : "Directed Strike necesita 2 Tactical Points.");
    return;
  }
  const message = rewritableMessage(trainer, { types: ["damage"], key: "directedStrike" }, DAMAGE_MISSING());
  if (!message) {return;}
  const use = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Directed Strike" },
    content: `${rollLine(message)}
      <p>${en() ? `Roll the damage again and keep the higher? Costs 2 of ${resource.value} Tactical Points.`
    : `¿Tirar el daño otra vez y quedarse con el mayor? Cuesta 2 de ${resource.value} Tactical Points.`}</p>`,
    rejectClose: false
  });
  if (use !== true || !await spendTrainerProgressionResource(trainer, "tacticalPoints", DIRECTED_STRIKE_COST)) {return;}
  const rerolls = await Promise.all(message.rolls.map(roll => roll.reroll()));
  for (const roll of rerolls) {await game.dice3d?.showForRoll(roll, game.user, true);}
  const sum = rolls => rolls.reduce((total, roll) => total + Number(roll.total), 0);
  const [before, after] = [sum(message.rolls), sum(rerolls)];
  const [first, ...rest] = (after > before ? rerolls : message.rolls).map(roll => roll.toJSON());
  first.options = { ...first.options, [MODULE_ID]: { ...first.options?.[MODULE_ID], directedStrike: { first: before, second: after } } };
  await message.update({ rolls: [first, ...rest] });
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message"><strong>${escape(trainer.name)}</strong> ${en() ? "uses" : "usa"} <strong>Directed Strike</strong>: `
      + `${before} / ${after} → <strong>${Math.max(before, after)}</strong></div>` });
}

/* ============================================================
 * GRUNT L5 — DARK ADVANTAGE
 *
 * 3 Shadow Points: advantage on the next skill check, ability check, attack or save
 * of the trainer or one of its party Pokémon. It is used up when that roll is made,
 * so cancelling the roll dialog keeps it.
 * ============================================================ */

const DARK_ADVANTAGE_FLAG = "darkAdvantage";
const DARK_ADVANTAGE_COST = 3;
const rollSubject = data => (data?.subject?.documentName === "Actor" ? data.subject : data?.subject?.actor ?? null);

async function useDarkAdvantage(trainer) {
  const resource = getTrainerProgressionResource(trainer, "shadowPoints");
  if ((resource?.value ?? 0) < DARK_ADVANTAGE_COST) {
    ui.notifications.warn(en() ? "Dark Advantage needs 3 Shadow Points." : "Dark Advantage necesita 3 Shadow Points.");
    return;
  }
  const party = getTrainerPartyState(trainer).pokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
  const actors = [trainer, ...party];
  const uuid = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Dark Advantage" },
    content: `<p>${en() ? `Advantage on the next check, attack or save. Costs 3 of ${resource.value} Shadow Points.`
      : `Ventaja en la próxima prueba, ataque o salvación. Cuesta 3 de ${resource.value} Shadow Points.`}</p>
      <div class="form-group"><label>${en() ? "Who" : "Quién"}</label>
        <select name="actor">${actors.map(actor => `<option value="${actor.uuid}">${escape(actor.name)}</option>`).join("")}</select></div>`,
    ok: { label: en() ? "Use" : "Usar", callback: (_event, button) => button.form.elements.actor.value },
    rejectClose: false
  });
  const actor = actors.find(entry => entry.uuid === uuid);
  if (!actor || !await spendTrainerProgressionResource(trainer, "shadowPoints", DARK_ADVANTAGE_COST)) {return;}
  await actor.setFlag(MODULE_ID, DARK_ADVANTAGE_FLAG, trainer.uuid);
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message"><strong>${escape(trainer.name)}</strong> ${en() ? "uses" : "usa"} <strong>Dark Advantage</strong>: `
      + `${en() ? "advantage on the next roll of" : "ventaja en la próxima tirada de"} <strong>${escape(actor.name)}</strong>.</div>` });
}

export function applyDarkAdvantage(config) {
  if (!rollSubject(config)?.getFlag?.(MODULE_ID, DARK_ADVANTAGE_FLAG)) {return;}
  for (const rollConfig of config.rolls ?? []) {
    rollConfig.options ??= {};
    rollConfig.options.advantage = true;
    rollConfig.options[MODULE_ID] = { ...rollConfig.options[MODULE_ID], darkAdvantage: true };
  }
}

function consumeDarkAdvantage(rolls, data) {
  const actor = rollSubject(data);
  if (!rolls?.[0]?.options?.[MODULE_ID]?.darkAdvantage || !actor?.getFlag?.(MODULE_ID, DARK_ADVANTAGE_FLAG)) {return;}
  void actor.unsetFlag(MODULE_ID, DARK_ADVANTAGE_FLAG).catch(error => console.error(`[${MODULE_ID}] Error consumiendo Dark Advantage`, error));
}

/* ============================================================
 * HOBBYIST L15 — MULTITALENTED
 * ============================================================ */

async function chooseMultitalentedSkills(trainer) {
  const pokemon = getTrainerOwnedPokemon(trainer);
  if (!pokemon.length) {
    ui.notifications.warn(en() ? "This trainer has no Pokémon." : "Este entrenador no tiene Pokémon.");
    return;
  }
  const chosen = trainer.getFlag(MODULE_ID, MULTITALENTED_FLAG) ?? {};
  const skills = Object.entries(CONFIG.DND5E.skills).map(([id, skill]) => [id, game.i18n.localize(skill.label)]);
  const rows = pokemon.map(actor => `<div class="form-group"><label>${escape(actor.name)}</label>
    <select name="${escape(actor.id)}"><option value="">—</option>${skills.map(([id, label]) =>
    `<option value="${id}" ${chosen[actor.id] === id ? "selected" : ""}>${escape(label)}</option>`).join("")}</select></div>`);
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Multitalented" },
    content: `<p>${en() ? "Extra skill proficiency for each Pokémon:" : "Proficiencia de skill adicional para cada Pokémon:"}</p>${rows.join("")}`,
    rejectClose: false,
    ok: { label: en() ? "Save" : "Guardar",
      callback: (_event, button) => Object.fromEntries(pokemon.map(actor => [actor.id, button.form.elements[actor.id].value])) }
  });
  // An empty value clears that Pokémon's skill (setFlag merges, so every Pokémon is written).
  if (result) {await trainer.setFlag(MODULE_ID, MULTITALENTED_FLAG, result);}
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
  if (action === "trainer-skill-dice") {return useSkillDie(trainer);}
  if (action === "trainer-multitalented") {return chooseMultitalentedSkills(trainer);}
  if (action === "trainer-partner") {return choosePartner(trainer);}
  if (action === "trainer-battle-dice") {return useBattleDie(trainer);}
  if (action === "trainer-directed-strike") {return useDirectedStrike(trainer);}
  if (action === "trainer-dark-advantage") {return useDarkAdvantage(trainer);}
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
  for (const kind of ["Attack", "Skill", "SavingThrow", "AbilityCheck"]) {
    Hooks.on(`dnd5e.preRoll${kind}`, applyDarkAdvantage);
    Hooks.on(`dnd5e.roll${kind}`, consumeDarkAdvantage);
  }
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
      for (const trainer of game.actors.filter(isTrainerActor)) {
        await ensureTrainerPathFeatureResources(trainer);
        await refreshTrainerFeatureIcons(trainer);
      }
    })());
  });
  Hooks.on("deleteCombat", combat => {
    if (!authority()) {return;}
    const trainerUuids = new Set(combat.combatants.map(combatant => combatTrainerUuid(combatant.actor)).filter(Boolean));
    for (const trainerUuid of trainerUuids) {run(expireCheerleader(trainerUuid));}
  });
}
