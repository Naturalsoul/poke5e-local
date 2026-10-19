/* ============================================================
 * TRAINER REACTIONS
 *
 * Features that change a result after it is rolled (Sabotage, Raise Your Defenses,
 * Battle Die, Not This Time…) ask the player who owns the trainer, even when the GM
 * rolled. The asking client waits for the answer; no answer in time means "not used".
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const REQUEST = "trainer-reaction-request";
const RESPONSE = "trainer-reaction-response";
export const REACTION_TIMEOUT_MS = 60000;
const pending = new Map();
let registered = false;

const en = () => game.settings.get(MODULE_ID, "language") === "en";

// The connected player owning the trainer decides; without one, the active GM.
export function reactionDecider(trainer) {
  const owner = game.users.find(user => user.active && !user.isGM && trainer.testUserPermission(user, "OWNER"));
  return owner ?? game.users.activeGM ?? null;
}

function formValues(form) {
  return Object.fromEntries([...form?.elements ?? []].filter(element => element.name)
    .map(element => [element.name, element.type === "checkbox" ? element.checked : element.value]));
}

/**
 * prompt: { title, content, use } — content may hold form fields; resolves to their values
 * (an object, possibly empty) when used, or null when declined or closed.
 */
async function showPrompt(prompt) {
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: prompt.title },
    content: prompt.content,
    rejectClose: false,
    buttons: [
      { action: "use", label: prompt.use ?? (en() ? "Use" : "Usar"), default: true, callback: (_event, button) => formValues(button.form) },
      { action: "skip", label: en() ? "Don't use" : "No usar" }
    ]
  });
  return result && typeof result === "object" ? result : null;
}

export function askTrainerReaction(trainer, prompt) {
  const decider = reactionDecider(trainer);
  if (!decider) {return Promise.resolve(null);}
  if (decider.id === game.user.id) {return showPrompt(prompt);}
  const requestId = `${game.user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      resolve(null);
    }, REACTION_TIMEOUT_MS);
    pending.set(requestId, { resolve, timeout, userId: decider.id });
    game.socket.emit(SOCKET_CHANNEL, { type: REQUEST, requestId, senderId: game.user.id, targetUserId: decider.id, prompt });
  });
}

async function handleRequest(payload) {
  if (payload?.type !== REQUEST || payload.targetUserId !== game.user.id) {return;}
  let values = null;
  try {
    values = await showPrompt(payload.prompt);
  } finally {
    game.socket.emit(SOCKET_CHANNEL, { type: RESPONSE, requestId: payload.requestId, senderId: game.user.id,
      recipientId: payload.senderId, values });
  }
}

function handleResponse(payload) {
  if (payload?.type !== RESPONSE || payload.recipientId !== game.user.id) {return;}
  const entry = pending.get(payload.requestId);
  // Only the user who was asked can answer.
  if (!entry || entry.userId !== payload.senderId) {return;}
  pending.delete(payload.requestId);
  clearTimeout(entry.timeout);
  entry.resolve(payload.values && typeof payload.values === "object" ? payload.values : null);
}

export function registerTrainerReactionService() {
  if (registered) {return;}
  registered = true;
  Hooks.once("ready", () => {
    game.socket.on(SOCKET_CHANNEL, payload => {
      handleResponse(payload);
      void handleRequest(payload).catch(error => console.error(`[${MODULE_ID}] Error mostrando reacción de entrenador`, error));
    });
  });
}
