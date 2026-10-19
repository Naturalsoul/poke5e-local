import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";
import { getTrainerProgressionState } from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";

/* ============================================================
 * BONDS SUPPLEMENT (BASIC) AND COMMANDER
 *
 * Each Pokémon has a Bond Level from −3 to +3, set by the GM on its sheet (the rules
 * leave it to the DM). A positive level gives that many Bond Points per long rest,
 * one more with a Commander trainer. A point gives advantage on the Pokémon's next
 * check, attack or save, or disadvantage on the next attack against it. At −2 and −3
 * the Pokémon may hesitate or disobey when told to use a Move.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
export const BONDS_SETTING = "bondsEnabled";
const BOND_FLAG = "bond";
const ARMED_FLAG = "bondArmed";
const ROLL_KINDS = ["Attack", "Skill", "SavingThrow", "AbilityCheck"];
const hesitating = new Set();
let registered = false;

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);

export function bondsEnabled() {
  try {
    return game.settings.get(MODULE_ID, BONDS_SETTING) === true;
  } catch {
    return false;
  }
}

function trainerOf(pokemon) {
  const uuid = isPokemonActor(pokemon) ? getPokemonTrainerUuid(pokemon) : null;
  const trainer = uuid ? game.actors.find(actor => actor.uuid === uuid) : null;
  return isTrainerActor(trainer) ? trainer : null;
}

export function commanderAt(trainer, level) {
  return Boolean(trainer) && getTrainerProgressionState(trainer)?.path?.id === "commander" && (getTrainerLevel(trainer) ?? 0) >= level;
}

const bondState = pokemon => pokemon?.getFlag?.(MODULE_ID, BOND_FLAG) ?? {};

export function bondLevel(pokemon) {
  return Math.max(-3, Math.min(3, Math.trunc(Number(bondState(pokemon).level) || 0)));
}

// Commander: one more Bond Point for every Pokémon with a positive level.
export function bondPointMax(pokemon) {
  const level = bondLevel(pokemon);
  return level > 0 ? level + (commanderAt(trainerOf(pokemon), 1) ? 1 : 0) : 0;
}

export function bondPointsLeft(pokemon) {
  return Math.max(0, bondPointMax(pokemon) - (Number(bondState(pokemon).spent) || 0));
}

async function setBond(pokemon, changes) {
  await pokemon.setFlag(MODULE_ID, BOND_FLAG, { ...bondState(pokemon), ...changes });
}

/* ============================================================
 * SHEET
 * ============================================================ */

export function bondMarkup(pokemon) {
  if (!bondsEnabled() || !isPokemonActor(pokemon)) {return "";}
  const level = bondLevel(pokemon);
  const sign = value => (value > 0 ? `+${value}` : String(value));
  const control = game.user.isGM
    ? `<select data-poke5e-bond-level data-actor-uuid="${escape(pokemon.uuid)}" aria-label="Bond Level">${[3, 2, 1, 0, -1, -2, -3]
      .map(value => `<option value="${value}" ${value === level ? "selected" : ""}>${sign(value)}</option>`).join("")}</select>`
    : `<strong class="poke5e-pokemon-nature__name">${sign(level)}</strong>`;
  const max = bondPointMax(pokemon);
  const spend = max && pokemon.isOwner
    ? `<button type="button" class="poke5e-pokemon-bond__spend" data-poke5e-bond-action="spend" data-actor-uuid="${escape(pokemon.uuid)}"
        ${bondPointsLeft(pokemon) ? "" : "disabled"}>${en() ? "Use" : "Usar"}</button>`
    : "";
  return `
    <div class="poke5e-pokemon-nature poke5e-pokemon-bond">
      <span class="poke5e-pokemon-nature__label"><i class="fa-solid fa-heart" aria-hidden="true"></i>Bond</span>
      <div class="poke5e-pokemon-nature__control">${control}</div>
      <div class="poke5e-pokemon-nature__modifiers">
        <span class="poke5e-pokemon-bond__points">${bondPointsLeft(pokemon)}/${max} ${en() ? "points" : "puntos"}</span>${spend}
      </div>
    </div>`;
}

/* ============================================================
 * SPENDING A BOND POINT
 * ============================================================ */

function spendChoices(pokemon) {
  const trainer = trainerOf(pokemon);
  const choices = { advantage: en() ? "Advantage on its next check, attack or save" : "Ventaja en su próxima prueba, ataque o salvación",
    defend: en() ? "Disadvantage on the next attack against it" : "Desventaja en el próximo ataque en su contra" };
  // Show Me What You've Got (Commander 9): once per long rest per Pokémon.
  if (commanderAt(trainer, 9) && !bondState(pokemon).showMeUsed) {
    choices.showMe = en() ? "Show Me What You've Got: a Move one tier higher" : "Show Me What You've Got: un Move de un tier superior";
  }
  return choices;
}

// We're a Team (Commander 15): the benefit may go to the targeted allied Pokémon instead.
function allyTarget(pokemon) {
  const targets = [...game.user.targets].map(token => token.actor);
  return commanderAt(trainerOf(pokemon), 15) && targets.length === 1 && isPokemonActor(targets[0]) && targets[0] !== pokemon ? targets[0] : null;
}

async function askSpend(pokemon) {
  const choices = spendChoices(pokemon);
  const ally = allyTarget(pokemon);
  const allyField = ally
    ? `<div class="form-group"><label><input type="checkbox" name="ally"> We're a Team: ${en() ? "give it to" : "dárselo a"} ${escape(ally.name)}</label></div>`
    : "";
  return foundry.applications.api.DialogV2.prompt({
    window: { title: `Bond Point — ${pokemon.name}` },
    content: `<div class="form-group"><select name="use">${Object.entries(choices)
      .map(([id, label]) => `<option value="${id}">${escape(label)}</option>`).join("")}</select></div>${allyField}`,
    rejectClose: false,
    ok: { label: en() ? "Spend" : "Gastar",
      callback: (_event, button) => ({ use: button.form.elements.use.value, ally: Boolean(button.form.elements.ally?.checked) }) }
  }).then(result => (result && { ...result, ally: result.ally ? ally : null }));
}

const USE_TEXT = {
  advantage: { en: "will roll its next check, attack or save with advantage", es: "tirará con ventaja su próxima prueba, ataque o salvación" },
  defend: { en: "imposes disadvantage on the next attack against it", es: "impone desventaja al próximo ataque en su contra" },
  showMe: { en: "may use a Move one tier higher than its current tier", es: "puede usar un Move de un tier superior al suyo" }
};

export async function spendBondPoint(pokemon) {
  if (!bondPointsLeft(pokemon)) {
    ui.notifications.warn(en() ? "No Bond Points left until a long rest." : "No quedan Bond Points hasta un descanso largo.");
    return;
  }
  const answer = await askSpend(pokemon);
  if (!answer?.use || !(answer.use in spendChoices(pokemon))) {return;}
  const recipient = answer.ally ?? pokemon;
  if (answer.use !== "showMe" && !recipient.isOwner) {
    // shortcut: arming another player's Pokémon needs its owner or the GM; a socket relay would let anyone do it.
    ui.notifications.warn(en() ? `Only ${recipient.name}'s owner or the GM can give it the benefit.` : `Solo el dueño de ${recipient.name} o el GM pueden darle el beneficio.`);
    return;
  }
  await setBond(pokemon, { spent: (Number(bondState(pokemon).spent) || 0) + 1, ...(answer.use === "showMe" ? { showMeUsed: true } : {}) });
  if (answer.use !== "showMe") {await recipient.setFlag(MODULE_ID, ARMED_FLAG, { [answer.use]: true });}
  await announceSpend(pokemon, recipient, answer);
}

async function announceSpend(pokemon, recipient, answer) {
  const text = USE_TEXT[answer.use][en() ? "en" : "es"];
  const team = answer.ally ? ` (We're a Team → <strong>${escape(recipient.name)}</strong>)` : "";
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }),
    content: `<div class="poke5e-turn-message"><strong>${escape(pokemon.name)}</strong> ${en() ? "spends a Bond Point" : "gasta un Bond Point"}`
      + `${team}: ${escape(recipient.name)} ${text}.</div>` });
}

/* ============================================================
 * ROLLS
 * ============================================================ */

const rollSubject = data => (data?.subject?.documentName === "Actor" ? data.subject : data?.subject?.actor ?? null);

function markRolls(config, option, marker) {
  for (const rollConfig of config.rolls ?? []) {
    rollConfig.options ??= {};
    rollConfig.options[option] = true;
    rollConfig.options[MODULE_ID] = { ...rollConfig.options[MODULE_ID], ...marker };
  }
}

function singleTargetActor() {
  const targets = [...(game.user?.targets ?? [])];
  return targets.length === 1 ? targets[0].actor ?? null : null;
}

export function applyBondRollModifiers(config) {
  const actor = rollSubject(config);
  if (actor?.getFlag?.(MODULE_ID, ARMED_FLAG)?.advantage) {markRolls(config, "advantage", { bondAdvantage: actor.uuid });}
  if (config?.subject?.documentName === "Actor") {return;}
  // Attacks: a defending Bond Point on the target, or a hesitating attacker at −2.
  const target = singleTargetActor();
  if (target?.getFlag?.(MODULE_ID, ARMED_FLAG)?.defend) {markRolls(config, "disadvantage", { bondDefend: target.uuid });}
  if (actor && hesitating.has(actor.uuid)) {markRolls(config, "disadvantage", { bondHesitation: actor.uuid });}
}

function consumeArmed(uuid, key) {
  const actor = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  const armed = actor?.getFlag?.(MODULE_ID, ARMED_FLAG);
  if (!armed?.[key]) {return;}
  const rest = { ...armed };
  delete rest[key];
  const done = Object.keys(rest).length ? actor.setFlag(MODULE_ID, ARMED_FLAG, rest) : actor.unsetFlag(MODULE_ID, ARMED_FLAG);
  void done.catch(error => console.error(`[${MODULE_ID}] Error consumiendo Bond Point`, error));
}

export function consumeBondRollModifiers(rolls) {
  const marker = rolls?.[0]?.options?.[MODULE_ID] ?? {};
  consumeArmed(marker.bondAdvantage, "advantage");
  consumeArmed(marker.bondDefend, "defend");
  if (marker.bondHesitation) {hesitating.delete(marker.bondHesitation);}
}

/* ============================================================
 * OBEDIENCE
 *
 * When told to use a Move: at −2, a d20 of 10 or lower means it hesitates (the attack
 * has disadvantage); at −3 it disobeys and the Move is not used.
 * ============================================================ */

export function obedienceCheck(pokemon, roll) {
  const level = bondLevel(pokemon);
  if (level > -2 || Number(roll) > 10) {return "obeys";}
  return level === -2 ? "hesitates" : "disobeys";
}

const OBEDIENCE_TEXT = {
  hesitates: { en: "hesitates, then follows the command with disadvantage", es: "duda y luego obedece con desventaja" },
  disobeys: { en: "disobeys the command", es: "desobedece la orden" }
};

export function onPreUseMove(activity) {
  const pokemon = activity?.actor;
  if (!bondsEnabled() || activity?.item?.getFlag?.(MODULE_ID, "kind") !== "move" || !trainerOf(pokemon)) {return true;}
  hesitating.delete(pokemon.uuid);
  if (bondLevel(pokemon) > -2) {return true;}
  const roll = new Roll("1d20").evaluateSync();
  const result = obedienceCheck(pokemon, roll.total);
  void roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }),
    flavor: `Bond ${bondLevel(pokemon)} — ${escape(pokemon.name)}${result === "obeys" ? "" : `: ${OBEDIENCE_TEXT[result][en() ? "en" : "es"]}`}` });
  if (result === "hesitates") {hesitating.add(pokemon.uuid);}
  return result !== "disobeys";
}

/* ============================================================
 * COMMANDER L5 — FOLLOW ME
 * ============================================================ */

// A Pokémon a Commander 5 catches starts with one more Bond Level (max +2).
export async function applyFollowMe(trainer, pokemon) {
  if (!bondsEnabled() || !commanderAt(trainer, 5) || !isPokemonActor(pokemon)) {return;}
  const level = bondLevel(pokemon);
  if (level < 2) {await setBond(pokemon, { level: level + 1 });}
}

/* ============================================================
 * LONG REST
 * ============================================================ */

async function restoreBondPoints(pokemon) {
  const state = bondState(pokemon);
  if (state.spent || state.showMeUsed) {await setBond(pokemon, { spent: 0, showMeUsed: false });}
}

function onRestCompleted(actor, result, config) {
  if (!bondsEnabled() || !(result?.longRest === true || config?.type === "long")) {return;}
  const pokemon = isTrainerActor(actor)
    ? game.actors.filter(entry => isPokemonActor(entry) && getPokemonTrainerUuid(entry) === actor.uuid)
    : [actor].filter(isPokemonActor);
  void Promise.all(pokemon.map(restoreBondPoints)).catch(error => console.error(`[${MODULE_ID}] Error restaurando Bond Points`, error));
}

/* ============================================================
 * REGISTER
 * ============================================================ */

function onDocumentChange(event) {
  const select = event.target?.closest?.("select[data-poke5e-bond-level]");
  if (!select || !game.user.isGM) {return;}
  const pokemon = fromUuidSync(select.dataset.actorUuid, { strict: false });
  if (pokemon) {void setBond(pokemon, { level: Number(select.value) }).catch(error => console.error(`[${MODULE_ID}] Error guardando Bond Level`, error));}
}

function onDocumentClick(event) {
  const button = event.target?.closest?.('[data-poke5e-bond-action="spend"]');
  if (!button) {return;}
  event.preventDefault();
  event.stopPropagation();
  const pokemon = fromUuidSync(button.dataset.actorUuid, { strict: false });
  if (pokemon) {void spendBondPoint(pokemon).catch(error => console.error(`[${MODULE_ID}] Error gastando Bond Point`, error));}
}

export function registerPokemonBondService() {
  if (registered) {return;}
  registered = true;
  game.settings.register(MODULE_ID, BONDS_SETTING, {
    name: "Poke5e - Bonds",
    hint: "Usa el suplemento Bonds: Bond Level y Bond Points en la hoja de cada Pokémon (necesario para el camino Commander).",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  for (const kind of ROLL_KINDS) {
    Hooks.on(`dnd5e.preRoll${kind}`, config => { if (bondsEnabled()) {applyBondRollModifiers(config);} });
    Hooks.on(`dnd5e.roll${kind}`, consumeBondRollModifiers);
  }
  Hooks.on("dnd5e.preUseActivity", onPreUseMove);
  Hooks.on("dnd5e.restCompleted", onRestCompleted);
  document.addEventListener("change", onDocumentChange);
  document.addEventListener("click", onDocumentClick);
}
