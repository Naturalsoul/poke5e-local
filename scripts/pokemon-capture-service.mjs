import { applyFollowMe } from "./pokemon-bond-service.mjs";
import { trackRollDisplay } from "./chat-roll-display.mjs";
import { loadDatabase } from "./importer.mjs";
import { hasPokemonStatus } from "./status-runtime.mjs";
import { getPokemonTrainerUuid, getTrainerOwnedPokemon, getTrainerPartyState, getTrainerPokeslotLimit, isPokemonActor } from "./trainer-party-service.mjs";
import { getTrainerProgressionResource, getTrainerProgressionState, spendTrainerProgressionResource } from "./trainer-progression-service.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";
import { acquireWildPokemonToken } from "./trainer-wild-pokemon-service.mjs";

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
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const ACQUIRE_REQUEST = "pokemon-capture-acquire-request";
const ACQUIRE_RESPONSE = "pokemon-capture-acquire-response";
const REQUEST_TIMEOUT_MS = 30000;
const pendingRequests = new Map();
let registered = false;

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
 * USE WINDOW EXTRAS
 *
 * The usual "use item" window is kept; it only gains the questions the module
 * cannot answer itself. The DC is never shown.
 * ============================================================ */

function checkbox(name, label) {
  return `<div class="form-group"><label><input type="checkbox" name="${name}"> ${label}</label></div>`;
}

export function captureQuestions(trainer, ballId, reasons) {
  const situational = SITUATIONAL_BALLS[ballId];
  const gotta = pathAtLevel(trainer, "pokemon-collector", 5) && getTrainerProgressionResource(trainer, GOTTA_CATCH_RESOURCE_ID)?.value > 0;
  return [
    situational ? checkbox("situational", situational[en() ? "en" : "es"]) : "",
    ballId === "timer-ball" ? `<div class="form-group"><label>${en() ? "Turns concentrating" : "Turnos concentrando"}</label>
      <input type="number" name="timerTurns" min="0" max="10" value="0"></div>` : "",
    pathAtLevel(trainer, "ranger", 5) ? checkbox("styler", en() ? "Capture Styler: you circled it" : "Capture Styler: lo rodeaste") : "",
    gotta && !reasons.length ? checkbox("gotta", en() ? "Gotta Catch 'Em All (1/long rest)" : "Gotta Catch 'Em All (1/descanso largo)") : ""
  ].join("");
}

/* ============================================================
 * THROW
 * ============================================================ */

function singleTargetToken() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].document ?? null : null;
}

function resultText(trainer, target, ball, outcome) {
  const [pokemon, ballName, trainerName] = [target.name, ball.name, trainer.name].map(escape);
  if (!outcome.caught) {
    return en()
      ? `<p><strong>${pokemon}</strong> broke free. The ${ballName} was destroyed.</p>`
      : `<p><strong>${pokemon}</strong> se escapó. La ${ballName} se destruyó.</p>`;
  }
  const caught = en() ? `<strong>${pokemon}</strong> was caught in a ${ballName}!` : `¡<strong>${pokemon}</strong> fue capturado en una ${ballName}!`;
  const destination = {
    party: en() ? `It joins ${trainerName}'s party.` : `Se une al equipo de ${trainerName}.`,
    pc: en() ? `${trainerName}'s party is full: it goes to the PC.` : `El equipo de ${trainerName} está lleno: va al PC.`
  }[outcome.destination] ?? "";
  return `<p>${caught} ${destination}</p>`;
}

async function postResult(trainer, target, ball, outcome) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: trainer }),
    content: resultText(trainer, target, ball, outcome),
    flags: { [MODULE_ID]: { capture: { trainerUuid: trainer.uuid, targetUuid: target.uuid, ballId: ball.getFlag(MODULE_ID, "sourceId"), ...outcome } } } });
}

/* ============================================================
 * MOVING THE CAUGHT POKÉMON
 *
 * acquireWildPokemonToken (GM only) turns the wild token into the trainer's own
 * Pokémon, keeping its HP, moves, nature, gender and shininess, and removes the token.
 * Players ask the active GM over the socket.
 * ============================================================ */

export function captureDestination(trainer) {
  return getTrainerPartyState(trainer).pokemonUuids.length < getTrainerPokeslotLimit(trainer) ? "party" : "pc";
}

async function acquireAsGm(trainer, tokenDocument) {
  const destination = captureDestination(trainer);
  const { pokemon } = await acquireWildPokemonToken(trainer, tokenDocument, { destination });
  await applyFollowMe(trainer, pokemon);
  return { destination, pokemonUuid: pokemon.uuid };
}

function requestAcquisition(trainer, tokenDocument) {
  if (game.user.isGM) {return acquireAsGm(trainer, tokenDocument);}
  const gm = game.users.activeGM;
  if (!gm) {return Promise.reject(new Error(en() ? "No active GM to move the Pokémon." : "No hay un GM activo para mover al Pokémon."));}
  const requestId = `${game.user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(en() ? "The GM did not answer." : "El GM no respondió."));
    }, REQUEST_TIMEOUT_MS);
    pendingRequests.set(requestId, { resolve, reject, timeout });
    game.socket.emit(SOCKET_CHANNEL, { type: ACQUIRE_REQUEST, requestId, senderId: game.user.id, targetGmId: gm.id,
      trainerUuid: trainer.uuid, tokenUuid: tokenDocument.uuid });
  });
}

// The GM only acts for someone who owns the trainer, on a wild token (acquireWildPokemonToken checks the token).
// shortcut: the GM trusts the player's capture roll; a server-side reroll would be needed against a hostile client.
async function handleAcquireRequest(payload) {
  if (payload?.type !== ACQUIRE_REQUEST || payload.targetGmId !== game.user.id) {return;}
  const reply = data => game.socket.emit(SOCKET_CHANNEL, { type: ACQUIRE_RESPONSE, requestId: payload.requestId, recipientId: payload.senderId, ...data });
  try {
    const trainer = await fromUuid(payload.trainerUuid);
    const tokenDocument = await fromUuid(payload.tokenUuid);
    const sender = game.users.get(payload.senderId);
    if (!isTrainerActor(trainer) || !sender || !trainer.testUserPermission(sender, "OWNER")) {throw new Error("Solicitud de captura no autorizada.");}
    reply({ ok: true, result: await acquireAsGm(trainer, tokenDocument) });
  } catch (error) {
    reply({ ok: false, error: error?.message ?? String(error) });
  }
}

function handleAcquireResponse(payload) {
  if (payload?.type !== ACQUIRE_RESPONSE || payload.recipientId !== game.user.id) {return;}
  const pending = pendingRequests.get(payload.requestId);
  if (!pending) {return;}
  pendingRequests.delete(payload.requestId);
  clearTimeout(pending.timeout);
  if (payload.ok) {pending.resolve(payload.result);} else {pending.reject(new Error(payload.error));}
}

export function registerPokemonCaptureService() {
  if (registered) {return;}
  registered = true;
  Hooks.once("ready", () => {
    game.socket.on(SOCKET_CHANNEL, payload => {
      handleAcquireResponse(payload);
      void handleAcquireRequest(payload);
    });
  });
}

// Caught: move it; if that fails the capture still stands and the GM is told why.
async function settleCapture(trainer, tokenDocument) {
  try {
    return { caught: true, ...await requestAcquisition(trainer, tokenDocument) };
  } catch (error) {
    console.error(`[${MODULE_ID}] Error moviendo el Pokémon capturado`, error);
    ui.notifications.error(en() ? `The Pokémon could not be moved: ${error.message}` : `No se pudo mover al Pokémon: ${error.message}`);
    return { caught: true, destination: null };
  }
}

// Animal Handling against the hidden DC; true when caught, null when the roll was cancelled.
async function rollCapture({ trainer, target, ball, ballId, context, reasons, choice }) {
  const gotta = choice.gotta && await spendTrainerProgressionResource(trainer, GOTTA_CATCH_RESOURCE_ID, 1);
  const { dc } = captureDc(target, ballReduction(ballId, context, choice));
  const display = trackRollDisplay();
  // No `target` option: dnd5e would show the DC on the card.
  const rolls = await trainer.rollSkill(
    { skill: "ani", advantage: reasons.length > 0 || Boolean(gotta), ...(choice.styler ? { bonus: "10" } : {}) },
    { configure: false },
    { data: { flavor: `${escape(ball.name)} → ${escape(target.name)}`, flags: { [MODULE_ID]: display.flags } } }
  );
  const roll = rolls?.[0];
  if (!roll) {
    display.stop();
    return null;
  }
  await display.displayed();
  return Number(roll.total) >= dc;
}

/**
 * Checks the throw before the use window opens. Returns null (already warned) or
 * { questions, throwBall(answers) } where answers come from the window's fields.
 */
export async function prepareCapture(ball) {
  const trainer = ball.parent;
  if (!isTrainerActor(trainer)) {
    ui.notifications.warn(en() ? "Only a trainer can throw a Pokéball." : "Solo un entrenador puede lanzar una Pokéball.");
    return null;
  }
  const tokenDocument = singleTargetToken();
  const target = tokenDocument?.actor ?? null;
  const blocker = captureBlocker(trainer, target);
  if (blocker) {
    ui.notifications.warn(blocker);
    return null;
  }
  const ballId = ball.getFlag(MODULE_ID, "sourceId");
  const context = await captureContext(trainer, target, ballId);
  const reasons = captureAdvantageReasons(trainer, target);
  return {
    questions: captureQuestions(trainer, ballId, reasons),
    async throwBall(answers = {}) {
      const choice = { situational: Boolean(answers.situational), timerTurns: Number(answers.timerTurns ?? 0),
        styler: Boolean(answers.styler), gotta: Boolean(answers.gotta) };
      const quantity = Math.trunc(Number(ball.system?.quantity ?? 0));
      if (quantity <= 0) {
        ui.notifications.warn(en() ? `No ${ball.name} left.` : `No quedan ${ball.name}.`);
        return;
      }
      // Spent on success (it now holds the Pokémon) and on failure (destroyed).
      await ball.update({ "system.quantity": quantity - 1 });
      const caught = ballId === "master-ball" || await rollCapture({ trainer, target, ball, ballId, context, reasons, choice });
      if (caught === null) {return;}
      await postResult(trainer, target, ball, caught ? await settleCapture(trainer, tokenDocument) : { caught: false });
    }
  };
}
