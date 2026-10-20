import { findStatusEffect } from "./status-runtime.mjs";
import { applyPokemonStatus } from "./pokemon-status-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";

/* ============================================================
 * MOVES THAT CHANGE THEIR USER'S STATUS
 *
 * - on use: Refresh cures its poison, paralysis or burn; Flame Wheel and Fusion Flare thaw it out;
 * - at the end of its turn: Rest puts it to sleep, Thrash confuses it, and so does Petal Dance used
 *   two rounds in a row (the "hit automatically" second use);
 * - Raging Fury confuses it when its concentration ends during a combat;
 * - on other Pokémon (applied by the GM from the usage card's targets): Yawn puts its target to sleep at
 *   the end of the target's next turn unless it leaves the battle, and Venom Drench turns poison into
 *   badly poisoned (a failed save against it poisons, through the status table).
 * The statuses go through the Turn Engine, so immunities and the one non-volatile rule still apply.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const PENDING_FLAG = "selfStatusAtEndOfTurn";
const PETAL_FLAG = "petalDanceRound";

const CURES = {
  refresh: ["poisoned", "paralysis", "burned"],
  "flame-wheel": ["frozen"],
  "fusion-flare": ["frozen"]
};

const AT_END_OF_TURN = { rest: "asleep", thrash: "confused" };

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] self status moves`, error)); };
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);

// Which status the Move gives its user at the end of the turn, or null.
export function endOfTurnStatus(actor, id, round) {
  if (AT_END_OF_TURN[id]) {return AT_END_OF_TURN[id];}
  return id === "petal-dance" && round && actor.getFlag(MODULE_ID, PETAL_FLAG) === round - 1 ? "confused" : null;
}

async function onMoveUsed(activity) {
  const actor = activity?.actor;
  const id = moveId(activity?.item);
  if (!id || !isPokemonActor(actor) || !actor.isOwner) {return;}
  for (const status of CURES[id] ?? []) {await findStatusEffect(actor, status)?.delete();}
  const round = game.combat?.started ? game.combat.round : 0;
  const status = endOfTurnStatus(actor, id, round);
  if (status) {await actor.setFlag(MODULE_ID, PENDING_FLAG, status);}
  if (id === "petal-dance" && round) {await actor.setFlag(MODULE_ID, PETAL_FLAG, round);}
}

// Called by the Turn Engine at the end of the Pokémon's turn.
export async function processSelfStatusMovesEndTurn(actor) {
  const status = actor?.getFlag?.(MODULE_ID, PENDING_FLAG);
  if (!status) {return;}
  await actor.unsetFlag(MODULE_ID, PENDING_FLAG);
  await applyPokemonStatus(actor, status, { language: en() ? "en" : "es" });
}

const authority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const targetActor = uuid => {
  const document = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return document?.actor ?? document;
};

// Yawn and Venom Drench on the targets dnd5e stored on the usage card.
export async function onCreateUsageMessage(message) {
  if (!authority() || message.type !== "usage") {return;}
  const id = moveId(message.getAssociatedItem?.());
  if (id !== "yawn" && id !== "venom-drench") {return;}
  const targets = (message.getFlag("dnd5e", "targets") ?? []).map(target => targetActor(target.uuid)).filter(isPokemonActor);
  for (const target of targets) {
    const poison = findStatusEffect(target, "poisoned");
    if (id === "yawn") {await target.setFlag(MODULE_ID, PENDING_FLAG, "asleep");}
    else if (poison && !poison.getFlag(MODULE_ID, "badlyPoisoned")) {
      await poison.delete();
      await applyPokemonStatus(target, "badly-poisoned", { language: en() ? "en" : "es" });
    }
  }
}

// A Pokémon that leaves the battle drops what was waiting for its end of turn (Yawn, Rest, Thrash).
async function onSwitched({ outgoing }) {
  if (authority() && outgoing?.getFlag?.(MODULE_ID, PENDING_FLAG)) {await outgoing.unsetFlag(MODULE_ID, PENDING_FLAG);}
}

// Raging Fury: its concentration effect points to the Move (flags.dnd5e.item, or its origin).
export function ragingFuryEnded(effect) {
  if (!effect?.statuses?.has?.("concentrating") || !game.combat?.started) {return null;}
  const uuid = effect.getFlag?.("dnd5e", "item")?.uuid ?? effect.origin;
  const item = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  return moveId(item) === "raging-fury" && isPokemonActor(effect.parent) ? effect.parent : null;
}

function onDeleteEffect(effect, _options, userId) {
  const actor = userId === game.user.id ? ragingFuryEnded(effect) : null;
  if (actor) {logged(applyPokemonStatus(actor, "confused", { language: en() ? "en" : "es" }));}
}

let registered = false;

export function registerSelfStatusMoves() {
  if (registered) {return;}
  registered = true;
  Hooks.on("dnd5e.postUseActivity", activity => logged(onMoveUsed(activity)));
  Hooks.on("deleteActiveEffect", onDeleteEffect);
  Hooks.on("createChatMessage", message => logged(onCreateUsageMessage(message)));
  Hooks.on("poke5ePokemonSwitched", event => logged(onSwitched(event)));
}
