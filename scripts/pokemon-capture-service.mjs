import { afterPaint } from "./chat-roll-display.mjs";
import { loadDatabase } from "./importer.mjs";
import { hasPokemonStatus } from "./status-runtime.mjs";
import { getPokemonTrainerUuid, getTrainerOwnedPokemon, getTrainerPartyState, isPokemonActor } from "./trainer-party-service.mjs";
import { getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource } from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";

/* ============================================================
 * THROW POKÉBALL (poke5e "Catching Pokémon", 2024 rules)
 *
 * Animal Handling vs DC 10 + floor(SR) + level, −5 below half HP, −5 more below 10%,
 * minus the ball's reduction. Advantage on a negative status. The ball is spent either way.
 * Moving the caught Pokémon to the party or PC stays with the GM.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const GOTTA_CATCH_RESOURCE_ID = "gottaCatchUses";
const ADVANTAGE_STATUSES = ["poisoned", "paralysis", "asleep", "burned", "frozen", "confused"];
const MEDIUM_OR_LARGER = ["med", "lg", "huge", "grg"];

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const modifier = score => Math.floor((Number(score ?? 10) - 10) / 2);

// Balls whose condition the table knows better than the module: offered as a checkbox.
export const SITUATIONAL_BALLS = {
  "dive-ball": { reduction: 10, es: "Bajo el agua", en: "Underwater" },
  "dusk-ball": { reduction: 10, es: "De noche o en oscuridad", en: "At night or in darkness" },
  "lure-ball": { reduction: 10, es: "Pescando", en: "While fishing" }
};

export function parseSr(value) {
  if (typeof value === "string" && value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    return denominator ? numerator / denominator : 0;
  }
  return Number(value) || 0;
}

function pokemonLevel(pokemon) {
  return Number(pokemon.getFlag(MODULE_ID, "level")) || 0;
}

function pokemonTypes(pokemon) {
  return Array.from(pokemon.getFlag(MODULE_ID, "types") ?? []).map(type => String(type).toLowerCase());
}

const trainerSkill = id => ({ trainer }) => Number(trainer.system?.skills?.[id]?.total ?? 0);
const when = (reduction, applies) => (context, situation) => (applies(context, situation) ? reduction : 0);

// One rule per ball: (context, situation) → DC reduction.
const BALL_REDUCTIONS = {
  "great-ball": () => 5,
  "ultra-ball": () => 10,
  "safari-ball": trainerSkill("nat"),
  "friend-ball": trainerSkill("per"),
  "sport-ball": trainerSkill("ath"),
  "level-ball": when(5, ({ trainer, target }) => (getTrainerLevel(trainer) ?? 0) > pokemonLevel(target)),
  "heavy-ball": when(10, ({ target }) => MEDIUM_OR_LARGER.includes(target.system?.traits?.size)),
  "love-ball": ({ activePokemon }) => (activePokemon ? 2 * modifier(activePokemon.system?.abilities?.cha?.value) : 0),
  "moon-ball": when(10, context => context.evolvesWithMoonStone),
  "net-ball": when(10, ({ target }) => pokemonTypes(target).some(type => type === "water" || type === "bug")),
  "nest-ball": when(5, ({ target }) => pokemonLevel(target) <= 5),
  "repeat-ball": when(10, context => context.caughtBefore),
  "quick-ball": when(15, context => context.firstRound),
  "dream-ball": when(5, ({ target }) => hasPokemonStatus(target, "asleep")),
  "timer-ball": (_context, situation) => Math.min(10, Math.max(0, Math.trunc(Number(situation.timerTurns) || 0))),
  ...Object.fromEntries(Object.entries(SITUATIONAL_BALLS).map(([id, ball]) => [id, when(ball.reduction, (_context, situation) => situation.situational)]))
};

/**
 * The ball's DC reduction from what the module can see. `situation` holds the
 * table's answers: { situational: bool, timerTurns: 0-10 }.
 */
export function ballReduction(ballId, context, situation = {}) {
  return BALL_REDUCTIONS[ballId]?.(context, situation) ?? 0;
}

export function captureDc(target, reduction) {
  const hp = target.system?.attributes?.hp ?? {};
  const value = Number(hp.value ?? 0);
  const max = Math.max(1, Number(hp.max ?? 1));
  const health = (value < max / 2 ? 5 : 0) + (value < max * 0.1 ? 5 : 0);
  const base = 10 + Math.floor(parseSr(target.getFlag(MODULE_ID, "sr"))) + pokemonLevel(target);
  return { base, health, reduction, dc: base - health - reduction };
}

function pathAtLevel(trainer, pathId, level) {
  return getTrainerProgressionState(trainer)?.path?.id === pathId && (getTrainerLevel(trainer) ?? 0) >= level;
}

export function captureAdvantageReasons(trainer, target) {
  const reasons = ADVANTAGE_STATUSES.filter(status => hasPokemonStatus(target, status));
  if (target.statuses?.has?.("restrained")) {reasons.push("restrained");}
  // Ranger L15, Poké Assist: the target shares a type with the Partner.
  const partner = fromUuidSync(trainer.getFlag(MODULE_ID, "rangerPartnerUuid") ?? "", { strict: false });
  if (pathAtLevel(trainer, "ranger", 15) && partner && pokemonTypes(partner).some(type => pokemonTypes(target).includes(type))) {
    reasons.push("Poké Assist");
  }
  return reasons;
}

// Why this Pokémon cannot be caught, or null.
export function captureBlocker(trainer, target) {
  if (!isPokemonActor(target)) {return en() ? "Target exactly one wild Pokémon." : "Selecciona como objetivo exactamente un Pokémon salvaje.";}
  if (getPokemonTrainerUuid(target)) {return en() ? `${target.name} already belongs to a trainer.` : `${target.name} ya pertenece a un entrenador.`;}
  if (Number(target.system?.attributes?.hp?.value ?? 0) <= 0) {return en() ? "A fainted Pokémon cannot be caught." : "No se puede capturar un Pokémon debilitado.";}
  if (pokemonLevel(target) > (getTrainerLevel(trainer) ?? 0)) {
    return en() ? `${target.name} is above ${trainer.name}'s level.` : `${target.name} tiene más nivel que ${trainer.name}.`;
  }
  return null;
}

async function evolvesWithMoonStone(target) {
  const database = await loadDatabase();
  const sourceId = target.getFlag(MODULE_ID, "sourceId");
  return Array.from(database?.evolutions ?? []).some(evolution => evolution.from === sourceId
    && (evolution.conditions ?? []).some(condition => condition.type === "item" && String(condition.value).toLowerCase() === "moon stone"));
}

async function captureContext(trainer, target, ballId) {
  const sourceId = target.getFlag(MODULE_ID, "sourceId");
  const activeUuid = getTrainerPartyState(trainer).activePokemonUuids[0];
  return {
    trainer,
    target,
    activePokemon: activeUuid ? fromUuidSync(activeUuid, { strict: false }) : null,
    evolvesWithMoonStone: ballId === "moon-ball" ? await evolvesWithMoonStone(target) : false,
    caughtBefore: getTrainerOwnedPokemon(trainer).some(pokemon => pokemon.getFlag(MODULE_ID, "sourceId") === sourceId),
    firstRound: Boolean(game.combat?.started && game.combat.round === 1)
  };
}

/* ============================================================
 * DIALOG
 * ============================================================ */

function dcLine(target, ball, ballId, context) {
  if (ballId === "master-ball") {return `<p>${en() ? "Automatic success." : "Éxito automático."}</p>`;}
  const { base, health, reduction, dc } = captureDc(target, ballReduction(ballId, context));
  const parts = [String(base), health ? `${health} (HP)` : "", reduction ? `${reduction} (${escape(ball.name)})` : ""].filter(Boolean);
  return `<p>${en() ? "DC" : "CD"} ${dc} = ${parts.join(" − ")}</p>`;
}

function checkbox(name, label) {
  return `<div class="form-group"><label><input type="checkbox" name="${name}"> ${label}</label></div>`;
}

function featureOptions(trainer, reasons) {
  const gotta = pathAtLevel(trainer, "pokemon-collector", 5) && getTrainerProgressionResource(trainer, GOTTA_CATCH_RESOURCE_ID)?.value > 0;
  return [
    pathAtLevel(trainer, "ranger", 5) ? checkbox("styler", en() ? "Capture Styler: you circled it (+10)" : "Capture Styler: lo rodeaste (+10)") : "",
    gotta && !reasons.length ? checkbox("gotta", en() ? "Gotta Catch 'Em All: advantage (1/long rest)" : "Gotta Catch 'Em All: ventaja (1/descanso largo)") : ""
  ];
}

function captureDialogContent({ trainer, target, ball, ballId, context, reasons }) {
  const situational = SITUATIONAL_BALLS[ballId];
  return [
    `<p><strong>${escape(trainer.name)}</strong> → <strong>${escape(target.name)}</strong> (${escape(ball.name)})</p>`,
    dcLine(target, ball, ballId, context),
    reasons.length ? `<p>${en() ? "Advantage" : "Ventaja"}: ${reasons.map(escape).join(", ")}</p>` : "",
    situational ? checkbox("situational", `${situational[en() ? "en" : "es"]} (−${situational.reduction})`) : "",
    ballId === "timer-ball" ? `<div class="form-group"><label>${en() ? "Turns concentrating" : "Turnos concentrando"}</label>
      <input type="number" name="timerTurns" min="0" max="10" value="0"></div>` : "",
    ...featureOptions(trainer, reasons)
  ].join("");
}

async function promptCapture(options) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: en() ? "Throw Pokéball" : "Lanzar Pokéball" },
    content: captureDialogContent(options),
    rejectClose: false,
    ok: {
      label: en() ? "Throw" : "Lanzar",
      callback: (_event, button) => {
        const elements = button.form.elements;
        return { situational: Boolean(elements.situational?.checked), timerTurns: Number(elements.timerTurns?.value ?? 0),
          styler: Boolean(elements.styler?.checked), gotta: Boolean(elements.gotta?.checked) };
      }
    }
  });
}

/* ============================================================
 * THROW
 * ============================================================ */

function singleTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

function resultText(trainer, target, ball, caught) {
  const [pokemon, ballName, trainerName] = [target.name, ball.name, trainer.name].map(escape);
  if (caught) {
    return en()
      ? `<p><strong>${pokemon}</strong> was caught in a ${ballName}! The GM moves it to ${trainerName}'s party or PC.</p>`
      : `<p>¡<strong>${pokemon}</strong> fue capturado en una ${ballName}! El GM lo mueve al equipo o al PC de ${trainerName}.</p>`;
  }
  return en()
    ? `<p><strong>${pokemon}</strong> broke free. The ${ballName} was destroyed.</p>`
    : `<p><strong>${pokemon}</strong> se escapó. La ${ballName} se destruyó.</p>`;
}

async function postResult(trainer, target, ball, caught) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: resultText(trainer, target, ball, caught),
    flags: { [MODULE_ID]: { capture: { trainerUuid: trainer.uuid, targetUuid: target.uuid, ballId: ball.getFlag(MODULE_ID, "sourceId"), caught } } } });
}

// Animal Handling against the DC; true when caught.
async function rollCapture({ trainer, target, ball, ballId, context, reasons, choice }) {
  const gotta = choice.gotta && await spendTrainerProgressionResource(trainer, GOTTA_CATCH_RESOURCE_ID, 1);
  const { dc } = captureDc(target, ballReduction(ballId, context, choice));
  const message = { data: { flavor: `${escape(ball.name)} → ${escape(target.name)} (${en() ? "DC" : "CD"} ${dc})` } };
  const rolls = await trainer.rollSkill(
    { skill: "ani", target: dc, advantage: reasons.length > 0 || Boolean(gotta), ...(choice.styler ? { bonus: "10" } : {}) },
    { configure: false },
    message
  );
  const roll = rolls?.[0];
  if (!roll) {return null;}
  // The result is announced once Dice So Nice has shown the roll; dnd5e leaves the created message in message.document.
  if (message.document?.id) {await game.dice3d?.waitFor3DAnimationByMessageID?.(message.document.id);}
  await afterPaint();
  return Number(roll.total) >= dc;
}

export async function throwPokeball(ball) {
  const trainer = ball.parent;
  if (!isTrainerActor(trainer)) {
    ui.notifications.warn(en() ? "Only a trainer can throw a Pokéball." : "Solo un entrenador puede lanzar una Pokéball.");
    return;
  }
  const target = singleTarget();
  const blocker = captureBlocker(trainer, target);
  if (blocker) {
    ui.notifications.warn(blocker);
    return;
  }
  const ballId = ball.getFlag(MODULE_ID, "sourceId");
  const context = await captureContext(trainer, target, ballId);
  const reasons = captureAdvantageReasons(trainer, target);
  const choice = await promptCapture({ trainer, target, ball, ballId, context, reasons });
  if (!choice) {return;}

  const quantity = Math.trunc(Number(ball.system?.quantity ?? 0));
  if (quantity <= 0) {
    ui.notifications.warn(en() ? `No ${ball.name} left.` : `No quedan ${ball.name}.`);
    return;
  }
  // Spent on success (it now holds the Pokémon) and on failure (destroyed).
  await ball.update({ "system.quantity": quantity - 1 });
  const caught = ballId === "master-ball" || await rollCapture({ trainer, target, ball, ballId, context, reasons, choice });
  if (caught !== null) {await postResult(trainer, target, ball, caught);}
}
