import { getPokemonTrainerUuid, getTrainerOwnedPokemon, getTrainerPartyState, isPokemonActor } from "./trainer-party-service.mjs";
import {
  ensureTrainerPathFeatureResources, getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource
} from "./trainer-progression-service.mjs";
import { refreshTrainerFeatureIcons } from "./trainer-feature-service.mjs";
import { BODY_FLAG, MULTITALENTED_FLAG } from "./trainer-path-effects.mjs";
import { publishRollBeforeDamage, trackRollDisplay } from "./chat-roll-display.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";
import { battleDieFaces } from "./trainer-combat-reactions.mjs";
import { activePokemonAbilityId } from "./status-runtime.mjs";

const MODULE_ID = "poke5e-local";
const CHEERLEADER_KIND = "trainer-cheerleader";
const SPIRIT_KIND = "trainer-spirit";
const TEAM_BONUS_KINDS = [CHEERLEADER_KIND, SPIRIT_KIND];
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
export const TRAINER_PATH_ACTION_RESOURCES = { "trainer-skill-dice": "skillDice", "trainer-cheerleader": "cheerleaderUses", "trainer-battle-dice": "battleDice",
  "trainer-spirit": "spiritUses", "trainer-pokechef": "pokechefUses", "trainer-tracker": "trackerUses" };
export const TRAINER_PATH_ACTION_ICONS = { "trainer-skill-dice": "fa-dice-six", "trainer-multitalented": "fa-graduation-cap", "trainer-partner": "fa-handshake",
  "trainer-cheerleader": "fa-bullhorn", "trainer-battle-dice": "fa-dice-d6", "trainer-directed-strike": "fa-crosshairs", "trainer-dark-advantage": "fa-mask",
  "trainer-body": "fa-dumbbell", "trainer-spirit": "fa-yin-yang", "trainer-pokechef": "fa-cookie-bite", "trainer-field-medic": "fa-kit-medical",
  "trainer-tracker": "fa-binoculars", "trainer-analyst": "fa-magnifying-glass" };
const ACTION_NAMES = { "trainer-skill-dice": "Skill Dice", "trainer-cheerleader": "Cheerleader", "trainer-battle-dice": "Battle Dice",
  "trainer-spirit": "Spirit", "trainer-pokechef": "Pokéchef", "trainer-directed-strike": "Directed Strike", "trainer-dark-advantage": "Dark Advantage",
  "trainer-multitalented": "Multitalented", "trainer-body": "Body", "trainer-field-medic": "Field Medic",
  "trainer-tracker": "Pokémon Tracker", "trainer-analyst": "Analyst" };

export function availableTrainerPathActions(trainer) {
  return [
    pathAtLevel(trainer, "hobbyist", 5) ? "trainer-skill-dice" : null,
    pathAtLevel(trainer, "hobbyist", 15) ? "trainer-multitalented" : null,
    pathAtLevel(trainer, "ranger", 9) ? "trainer-partner" : null,
    pathAtLevel(trainer, "poke-mentor", 9) ? "trainer-cheerleader" : null,
    pathAtLevel(trainer, "ace-trainer", 5) ? "trainer-battle-dice" : null,
    pathAtLevel(trainer, "tactician", 5) ? "trainer-directed-strike" : null,
    pathAtLevel(trainer, "grunt", 5) ? "trainer-dark-advantage" : null,
    pathAtLevel(trainer, "guru", 9) ? "trainer-body" : null,
    pathAtLevel(trainer, "guru", 15) ? "trainer-spirit" : null,
    pathAtLevel(trainer, "nurse", 5) ? "trainer-pokechef" : null,
    pathAtLevel(trainer, "nurse", 9) ? "trainer-field-medic" : null,
    (getTrainerLevel(trainer) ?? 0) >= 13 ? "trainer-tracker" : null,
    pathAtLevel(trainer, "researcher", 5) ? "trainer-analyst" : null
  ].filter(Boolean);
}

export function trainerPathActionName(action) {
  return ACTION_NAMES[action] ?? "Partner";
}

export function trainerPathActionLabel(trainer, action) {
  if (action === "trainer-partner") {
    const partner = fromUuidSync(trainer.getFlag(MODULE_ID, RANGER_PARTNER_FLAG) ?? "", { strict: false });
    return `Partner: ${partner?.name ?? "—"}`;
  }
  if (!TRAINER_PATH_ACTION_RESOURCES[action]) {return ACTION_NAMES[action];}
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

/* Poké Mentor L9 Cheerleader and Guru L15 Spirit: a bonus to the active Pokémon until the next turn of one of them. */
const TEAM_BONUSES = {
  "trainer-cheerleader": { name: "Cheerleader", kind: CHEERLEADER_KIND, resourceId: "cheerleaderUses", ability: "cha", choices: ["attack", "damage", "ac"],
    img: "icons/svg/sound.svg", spent: { en: "Cheerleader is spent until a short rest.", es: "Cheerleader está gastado hasta un descanso corto." } },
  "trainer-spirit": { name: "Spirit", kind: SPIRIT_KIND, resourceId: "spiritUses", ability: "wis", choices: ["attack", "damage"],
    img: "icons/svg/aura.svg", spent: { en: "No Spirit uses left until a long rest.", es: "No quedan usos de Spirit hasta un descanso largo." } }
};

async function useTeamBonus(trainer, feature) {
  if (!getTrainerProgressionResource(trainer, feature.resourceId)?.value) {
    ui.notifications.warn(en() ? feature.spent.en : feature.spent.es);
    return;
  }
  const bonus = Math.max(1, modifier(trainer, feature.ability));
  const allLabels = en() ? { attack: "Attack rolls", damage: "Damage rolls", ac: "AC" } : { attack: "Tiradas de ataque", damage: "Tiradas de daño", ac: "CA" };
  const labels = Object.fromEntries(feature.choices.map(id => [id, allLabels[id]]));
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: { title: feature.name },
    content: `<p>${en() ? `Active Pokémon get +${bonus} until your Pokémon's next turn to:` : `Los Pokémon activos reciben +${bonus} hasta el siguiente turno de tu Pokémon en:`}</p>
      <div class="form-group"><select name="choice">${Object.entries(labels).map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select></div>`,
    rejectClose: false,
    ok: { label: feature.name, callback: (_event, button) => button.form.elements.choice.value }
  });
  if (!choice) {return;}
  // shortcut: only this trainer's active Pokémon are "allies"; other trainers' Pokémon need the effect copied by hand.
  const pokemon = getTrainerPartyState(trainer).activePokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
  if (!pokemon.length) {
    ui.notifications.warn(en() ? "No active Pokémon." : "No hay Pokémon activos.");
    return;
  }
  if (!await spendTrainerProgressionResource(trainer, feature.resourceId, 1)) {return;}
  const name = `${feature.name} — ${labels[choice]} +${bonus}`;
  const turnOf = cheerleaderTurnOf(pokemon);
  for (const actor of pokemon) {
    await clearTeamBonus(actor, feature.kind);
    await actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: feature.img, transfer: false, disabled: false,
      changes: cheerleaderChanges(choice, bonus), flags: { [MODULE_ID]: { kind: feature.kind, trainerUuid: trainer.uuid, turnOf } } }]);
  }
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<p><strong>${escape(trainer.name)}</strong>: ${escape(name)} (${pokemon.map(actor => escape(actor.name)).join(", ")}).</p>` });
}

async function clearTeamBonus(actor, kind) {
  const ids = actor.effects.filter(effect => effect.getFlag(MODULE_ID, "kind") === kind).map(effect => effect.id);
  if (ids.length) {await actor.deleteEmbeddedDocuments("ActiveEffect", ids);}
}

/* ============================================================
 * GURU L9 — BODY
 *
 * Each Pokémon with more than one Ability may keep a second one active, chosen here;
 * the path effect exposes it to hasPokemonAbility.
 * ============================================================ */

function abilityItems(pokemon) {
  return pokemon.items.filter(item => item.getFlag?.(MODULE_ID, "kind") === "ability");
}

async function chooseBodyAbilities(trainer) {
  const pokemon = getTrainerOwnedPokemon(trainer).filter(actor => abilityItems(actor).length > 1);
  if (!pokemon.length) {
    ui.notifications.warn(en() ? "None of this trainer's Pokémon has two Abilities." : "Ningún Pokémon de este entrenador tiene dos Abilities.");
    return;
  }
  const chosen = trainer.getFlag(MODULE_ID, BODY_FLAG) ?? {};
  const rows = pokemon.map(actor => {
    const active = actor.getFlag(MODULE_ID, "activeAbilityId");
    const options = abilityItems(actor).filter(item => item.getFlag(MODULE_ID, "sourceId") !== active)
      .map(item => [item.getFlag(MODULE_ID, "sourceId"), item.name]);
    return `<div class="form-group"><label>${escape(actor.name)}</label>
      <select name="${escape(actor.id)}"><option value="">—</option>${options.map(([id, label]) =>
    `<option value="${escape(id)}" ${chosen[actor.id] === id ? "selected" : ""}>${escape(label)}</option>`).join("")}</select></div>`;
  });
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Body" },
    content: `<p>${en() ? "Second active Ability for each Pokémon:" : "Segunda Ability activa para cada Pokémon:"}</p>${rows.join("")}`,
    rejectClose: false,
    ok: { label: en() ? "Save" : "Guardar",
      callback: (_event, button) => Object.fromEntries(pokemon.map(actor => [actor.id, button.form.elements[actor.id].value])) }
  });
  // An empty value clears that Pokémon's choice (setFlag merges, so every Pokémon is written).
  if (result) {await trainer.setFlag(MODULE_ID, BODY_FLAG, result);}
}

/* ============================================================
 * NURSE — POKÉCHEF (L5) AND FIELD MEDIC (L9)
 * ============================================================ */

const POKECHEF_FORMULAS = [[15, "4d12 + 10"], [9, "3d10 + 6"], [5, "2d4 + 2"]];

export function pokechefFormula(trainer) {
  return POKECHEF_FORMULAS.find(([level]) => (getTrainerLevel(trainer) ?? 0) >= level)?.[1] ?? POKECHEF_FORMULAS.at(-1)[1];
}

function singleTargetActor() {
  const targets = [...game.user.targets].map(token => token.actor).filter(Boolean);
  if (targets.length === 1) {return targets[0];}
  ui.notifications.warn(en() ? "Target exactly one creature." : "Selecciona como objetivo exactamente a una criatura.");
  return null;
}

// The healing is applied after Dice So Nice shows it, when this user may change the target.
async function usePokechef(trainer) {
  const resource = getTrainerProgressionResource(trainer, "pokechefUses");
  if (!resource?.value) {
    ui.notifications.warn(en() ? "No Treats left until a long rest." : "No quedan Treats hasta un descanso largo.");
    return;
  }
  const target = singleTargetActor();
  if (!target) {return;}
  const formula = pokechefFormula(trainer);
  const use = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Pokéchef" },
    content: `<p>${en() ? `Give <strong>${escape(target.name)}</strong> a Treat (${formula} HP)? Left: ${resource.value}/${resource.max}.`
      : `¿Darle a <strong>${escape(target.name)}</strong> un Treat (${formula} PV)? Quedan: ${resource.value}/${resource.max}.`}</p>`,
    rejectClose: false
  });
  if (use !== true || !await spendTrainerProgressionResource(trainer, "pokechefUses", 1)) {return;}
  const roll = await new Roll(formula).evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    flavor: `<strong>Pokéchef</strong> → ${escape(target.name)}` });
  if (!target.isOwner) {
    ui.notifications.warn(en() ? `The GM applies the healing to ${target.name}.` : `El GM aplica la curación a ${target.name}.`);
    return;
  }
  await target.applyDamage([{ value: roll.total, type: "healing" }]);
}

const FIELD_MEDIC_DC = 12;
const nonVolatileStatuses = actor => actor.effects.filter(effect => !effect.disabled && effect.getFlag?.(MODULE_ID, "nonVolatile") === true);

async function chooseStatus(statuses) {
  if (statuses.length === 1) {return statuses[0];}
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Field Medic" },
    content: `<div class="form-group"><select name="status">${statuses.map(effect => `<option value="${effect.id}">${escape(effect.name)}</option>`).join("")}</select></div>`,
    rejectClose: false,
    ok: { label: en() ? "Treat" : "Tratar", callback: (_event, button) => button.form.elements.status.value }
  });
  return statuses.find(effect => effect.id === id) ?? null;
}

async function useFieldMedic(trainer) {
  const target = singleTargetActor();
  if (!target) {return;}
  const statuses = nonVolatileStatuses(target);
  if (!statuses.length) {
    ui.notifications.warn(en() ? `${target.name} has no non-volatile status.` : `${target.name} no tiene un estado no volátil.`);
    return;
  }
  const status = await chooseStatus(statuses);
  if (!status) {return;}
  const display = trackRollDisplay();
  let rolls;
  try {
    rolls = await trainer.rollSkill({ skill: "med", target: FIELD_MEDIC_DC }, {},
      { data: { flavor: `Field Medic → ${target.name} (${status.name})`, flags: { [MODULE_ID]: display.flags } } });
  } catch (error) {
    display.stop();
    throw error;
  }
  if (!rolls?.length) {
    display.stop();
    return;
  }
  await display.displayed();
  const healed = Number(rolls[0].total) >= FIELD_MEDIC_DC;
  if (healed) {await removeTreatedStatus(target, status);}
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message"><strong>Field Medic</strong>: ${fieldMedicText(target, status, healed)}</div>` });
}

async function removeTreatedStatus(target, status) {
  if (target.isOwner) {
    await target.deleteEmbeddedDocuments("ActiveEffect", [status.id]);
    return;
  }
  ui.notifications.warn(en() ? `The GM removes ${status.name}.` : `El GM retira ${status.name}.`);
}

function fieldMedicText(target, status, healed) {
  if (!healed) {return en() ? "the treatment fails." : "el tratamiento falla.";}
  return en() ? `<strong>${escape(target.name)}</strong> is cured of ${escape(status.name)}.`
    : `<strong>${escape(target.name)}</strong> se cura de ${escape(status.name)}.`;
}

/* ============================================================
 * POKÉMON TRACKER (TRAINER L13)
 *
 * Only spends the use; the GM shares the list of wild Pokémon nearby.
 * ============================================================ */

async function useTracker(trainer) {
  const resource = getTrainerProgressionResource(trainer, "trackerUses");
  if (!resource?.value) {
    ui.notifications.warn(en() ? "Pokémon Tracker is spent until a long rest." : "Pokémon Tracker está gastado hasta un descanso largo.");
    return;
  }
  const use = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Pokémon Tracker" },
    content: `<p>${en() ? `Search the area for wild Pokémon? Left: ${resource.value}/${resource.max}.`
      : `¿Buscar Pokémon salvajes en la zona? Quedan: ${resource.value}/${resource.max}.`}</p>`,
    rejectClose: false
  });
  if (use !== true || !await spendTrainerProgressionResource(trainer, "trackerUses", 1)) {return;}
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message"><strong>${escape(trainer.name)}</strong> ${en()
      ? "uses <strong>Pokémon Tracker</strong> and searches the area for wild Pokémon."
      : "usa <strong>Pokémon Tracker</strong> y busca Pokémon salvajes en la zona."}</div>` });
  if (pathAtLevel(trainer, "pokemon-collector", 15)) {await expertTrack(trainer);}
}

// Pokémon Collector L15, Expert Tracker: DC 11 Investigation or Nature to find a specific Pokémon of the list.
const EXPERT_TRACKER_DC = 11;

async function expertTrack(trainer) {
  const skill = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Expert Tracker" },
    content: `<p>${en() ? "Look for a specific Pokémon from the local list (DC 11):" : "Buscar un Pokémon específico de la lista local (CD 11):"}</p>
      <div class="form-group"><select name="skill"><option value="inv">${en() ? "Investigation" : "Investigación"}</option>
        <option value="nat">${en() ? "Nature" : "Naturaleza"}</option></select></div>`,
    rejectClose: false,
    ok: { label: en() ? "Roll" : "Tirar", callback: (_event, button) => button.form.elements.skill.value }
  });
  if (!skill) {return;}
  const total = await displayedSkillTotal(trainer, { skill, target: EXPERT_TRACKER_DC }, "Expert Tracker");
  if (total === null) {return;}
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: `<div class="poke5e-turn-message"><strong>Expert Tracker</strong>: ${expertTrackerText(total >= EXPERT_TRACKER_DC)}</div>` });
}

function expertTrackerText(found) {
  if (found) {return en() ? "a specific Pokémon from the local list can be encountered." : "puede encontrar un Pokémon específico de la lista local.";}
  return en() ? "no specific Pokémon is found." : "no encuentra un Pokémon específico.";
}

// Rolls a skill of the trainer and resolves with its total once Dice So Nice has shown it (null if cancelled).
async function displayedSkillTotal(trainer, config, flavor) {
  const display = trackRollDisplay();
  let rolls;
  try {
    rolls = await trainer.rollSkill(config, {}, { data: { flavor, flags: { [MODULE_ID]: display.flags } } });
  } catch (error) {
    display.stop();
    throw error;
  }
  if (!rolls?.length) {
    display.stop();
    return null;
  }
  await display.displayed();
  return Number(rolls[0].total);
}

/* ============================================================
 * RESEARCHER L5 — ANALYST (L15 PROFESSOR)
 *
 * The trainer's Investigation against the targeted Pokémon's Deception; the Pokémon
 * wins ties. On a success the trainer's owners and the GM learn its Ability and one
 * random Move; Professor adds one more Ability or Move.
 * ============================================================ */

const randomOf = entries => entries[Math.floor(Math.random() * entries.length)];
const itemsOfKind = (actor, kind) => actor.items.filter(item => item.getFlag?.(MODULE_ID, "kind") === kind);

export function analystReveal(pokemon, { professor = false, pick = randomOf } = {}) {
  const activeId = activePokemonAbilityId(pokemon);
  const abilities = itemsOfKind(pokemon, "ability");
  const ability = abilities.find(item => item.getFlag(MODULE_ID, "sourceId") === activeId) ?? null;
  const moves = itemsOfKind(pokemon, "move");
  const move = moves.length ? pick(moves) : null;
  const rest = [...abilities, ...moves].filter(item => item !== ability && item !== move);
  const extra = professor && rest.length ? pick(rest) : null;
  return [ability, move, extra].filter(Boolean);
}

async function useAnalyst(trainer) {
  const target = singleTargetActor();
  if (!target) {return;}
  if (!isPokemonActor(target)) {
    ui.notifications.warn(en() ? "Analyst needs a Pokémon as target." : "Analyst necesita un Pokémon como objetivo.");
    return;
  }
  const investigation = await displayedSkillTotal(trainer, { skill: "inv" }, `Analyst → ${target.name}`);
  if (investigation === null) {return;}
  const deception = await new Roll(`1d20 + ${Number(target.system?.skills?.dec?.total ?? 0)}`).evaluate();
  await publishRollBeforeDamage(deception, { speaker: ChatMessage.implementation.getSpeaker({ actor: target }),
    flavor: `${escape(target.name)} — ${en() ? "Deception" : "Engaño"}` });
  const learned = investigation > Number(deception.total) ? analystReveal(target, { professor: pathAtLevel(trainer, "researcher", 15) }) : [];
  const whisper = game.users.filter(user => user.isGM || trainer.testUserPermission(user, "OWNER")).map(user => user.id);
  const content = learned.length
    ? `${en() ? "learns about" : "aprende sobre"} <strong>${escape(target.name)}</strong>: ${learned.map(item => `<strong>${escape(item.name)}</strong>`).join(", ")}.`
    : `${en() ? "learns nothing about" : "no aprende nada sobre"} <strong>${escape(target.name)}</strong>.`;
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }), whisper,
    content: `<div class="poke5e-turn-message"><strong>${escape(trainer.name)}</strong> (Analyst) ${content}</div>` });
}

/* ============================================================
 * NURSE L15 — TIP-TOP SHAPE
 *
 * The trainer's Pokémon save with advantage against Moves that inflict a status.
 * The save engine has already tied the save to its Move (modifierUsage).
 * ============================================================ */

// shortcut: a Move "inflicts a status" when it carries a status effect; saves from other sources are not covered.
const inflictsStatus = item => Array.from(item?.effects ?? []).some(effect =>
  effect.getFlag?.(MODULE_ID, "kind") === "pokemon-status" || effect.statuses?.size > 0);

export function applyTipTopShape(config) {
  const pokemon = config?.subject;
  const trainerUuid = isPokemonActor(pokemon) ? getPokemonTrainerUuid(pokemon) : null;
  const trainer = trainerUuid ? fromUuidSync(trainerUuid, { strict: false }) : null;
  if (!isTrainerActor(trainer) || !pathAtLevel(trainer, "nurse", 15)) {return;}
  for (const rollConfig of config.rolls ?? []) {
    const itemUuid = rollConfig.options?.[MODULE_ID]?.modifierUsage?.itemUuid;
    if (itemUuid && inflictsStatus(fromUuidSync(itemUuid, { strict: false }))) {rollConfig.options.advantage = true;}
  }
}

export async function runTrainerPathAction(action, trainer) {
  if (action === "trainer-skill-dice") {return useSkillDie(trainer);}
  if (action === "trainer-multitalented") {return chooseMultitalentedSkills(trainer);}
  if (action === "trainer-partner") {return choosePartner(trainer);}
  if (action === "trainer-battle-dice") {return useBattleDie(trainer);}
  if (action === "trainer-directed-strike") {return useDirectedStrike(trainer);}
  if (action === "trainer-dark-advantage") {return useDarkAdvantage(trainer);}
  if (action === "trainer-body") {return chooseBodyAbilities(trainer);}
  if (action === "trainer-pokechef") {return usePokechef(trainer);}
  if (action === "trainer-field-medic") {return useFieldMedic(trainer);}
  if (action === "trainer-tracker") {return useTracker(trainer);}
  if (action === "trainer-analyst") {return useAnalyst(trainer);}
  return useTeamBonus(trainer, TEAM_BONUSES[action]);
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
    const ids = pokemon.effects.filter(effect => TEAM_BONUS_KINDS.includes(effect.getFlag(MODULE_ID, "kind"))
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
  Hooks.on("dnd5e.preRollSavingThrow", applyTipTopShape);
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
