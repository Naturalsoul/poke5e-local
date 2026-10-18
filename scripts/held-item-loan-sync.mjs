import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";

const MODULE_ID = "poke5e-local";
export const HELD_ITEM_LOAN = "heldItemLoan";
export const LOAN_SYNC_OPTION = "poke5eHeldItemLoanSync";
const FIELDS = ["max", "spent", "recovery", "autoDestroy"];
const pending = new Map();
let registered = false;

export function loanChargeUpdates(item) {
  const uses = item._source?.system?.uses ?? item.system?.uses ?? {};
  const updates = {};
  for (const field of FIELDS) {
    if (uses[field] !== undefined) {
      updates[`system.uses.${field}`] = foundry.utils.deepClone(uses[field]);
    }
  }
  updates["system.uses.autoDestroy"] = false;
  return updates;
}

function sameLoan(item, loan) {
  const other = item?.getFlag(MODULE_ID, HELD_ITEM_LOAN);
  return other && ["trainerUuid", "trainerItemId", "pokemonUuid", "pokemonItemId"]
    .every(key => other[key] === loan[key]);
}

function validEndpoint(item, loan) {
  const actor = item?.parent;
  if (actor?.uuid === loan.trainerUuid) {
    return actor.getFlag(MODULE_ID, "kind") === "trainer" && item.id === loan.trainerItemId;
  }
  const canonical = actor?.token?.baseActor?.uuid ?? actor?.uuid;
  return isPokemonActor(actor) && getPokemonTrainerUuid(actor) === loan.trainerUuid &&
    (actor.uuid === loan.pokemonUuid || canonical === loan.pokemonUuid) && item.id === loan.pokemonItemId;
}

async function loanPeers(item, loan) {
  const trainer = await fromUuid(loan.trainerUuid);
  const pokemon = await fromUuid(loan.pokemonUuid);
  const peers = new Map();
  for (const actor of [trainer, pokemon]) {
    const id = actor?.uuid === loan.trainerUuid ? loan.trainerItemId : loan.pokemonItemId;
    const peer = actor?.items?.get(id);
    if (peer) {peers.set(peer.uuid, peer);}
  }
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      const peer = token.actor?.items?.get(loan.pokemonItemId);
      if (!token.actorLink && peer) {peers.set(peer.uuid, peer);}
    }
  }
  return [...peers.values()].filter(peer => peer.uuid !== item.uuid && sameLoan(peer, loan) && validEndpoint(peer, loan));
}

export async function loanBorrowerCopies(item) {
  const loan = item.getFlag(MODULE_ID, HELD_ITEM_LOAN);
  return [item, ...await loanPeers(item, loan)].filter(peer => isPokemonActor(peer.parent));
}

export function synchronizeHeldItemLoanCharges(item, changes = loanChargeUpdates(item)) {
  const loan = item?.getFlag(MODULE_ID, HELD_ITEM_LOAN);
  if (!loan || !validEndpoint(item, loan)) {return Promise.resolve();}
  const updates = {};
  for (const field of FIELDS) {
    const key = `system.uses.${field}`;
    const value = Object.hasOwn(changes, key) ? changes[key] : foundry.utils.getProperty(changes, key);
    if (value !== undefined) {updates[key] = foundry.utils.deepClone(value);}
  }
  if (!Object.keys(updates).length) {return Promise.resolve();}
  updates["system.uses.autoDestroy"] = false;
  const key = `${loan.trainerUuid}:${loan.trainerItemId}`;
  const task = (pending.get(key) ?? Promise.resolve()).then(async () => {
    for (const peer of await loanPeers(item, loan)) {
      const different = Object.entries(updates).some(([path, value]) =>
        JSON.stringify(foundry.utils.getProperty(peer._source ?? peer, path)) !== JSON.stringify(value));
      if (different) {await peer.update(updates, { [LOAN_SYNC_OPTION]: true });}
    }
  });
  const settled = task.catch(error => console.error(`[${MODULE_ID}] Error sincronizando cargas prestadas`, error));
  pending.set(key, settled);
  void settled.then(() => { if (pending.get(key) === settled) {pending.delete(key);} });
  return task;
}

export function registerHeldItemLoanSync() {
  if (registered) {return;}
  registered = true;
  Hooks.on("updateItem", (item, changes, options, userId) => {
    if (userId !== game.user.id || options?.[LOAN_SYNC_OPTION]) {return;}
    void synchronizeHeldItemLoanCharges(item, changes)
      .catch(error => ui.notifications.error(error.message));
  });
}
