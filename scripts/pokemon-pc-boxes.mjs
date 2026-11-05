import { canCurrentUserOperateTrainer } from "./trainer-ownership-service.mjs";
import { getTrainerOwnedPokemon, getTrainerPartyState, getTrainerPokeslotLimit } from "./trainer-party-service.mjs";
import { isTrainerActor } from "./trainer-service.mjs";

export const BOX_COLUMNS = 6;
export const BOX_SIZE = BOX_COLUMNS * 5;

// The token may be the animated WebM when the animated tokens setting is on; its PNG sits next to it.
export function staticSpriteSource(pokemon) {
  const token = String(pokemon?.prototypeToken?.texture?.src ?? "");
  const still = token.replace(/sprite-animated(-shiny)?\.webm$/i, "sprite$1.png");
  return still && !/\.webm$/i.test(still) ? still : pokemon?.img;
}

const byName = (left, right) => left.name.localeCompare(right.name);

// The trainers this user may operate, players' first, each with their party and their PC: whatever they own outside it.
export function trainerPcEntries() {
  const trainers = game.actors.filter(actor => isTrainerActor(actor) && canCurrentUserOperateTrainer(actor));
  trainers.sort((left, right) => Number(Boolean(right.hasPlayerOwner)) - Number(Boolean(left.hasPlayerOwner)) || byName(left, right));
  return trainers.map(trainer => {
    const party = getTrainerPartyState(trainer).pokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
    const partyUuids = new Set(party.map(pokemon => pokemon.uuid));
    return {
      trainer,
      party,
      partySlots: Math.max(getTrainerPokeslotLimit(trainer), party.length),
      stored: getTrainerOwnedPokemon(trainer).filter(pokemon => !partyUuids.has(pokemon.uuid)).sort(byName)
    };
  });
}

// One box per trainer, or as many as their PC fills. A trainer with an empty PC still gets one.
export function buildPcBoxes(entries) {
  return entries.flatMap(({ trainer, party, partySlots, stored }) => {
    const pages = Math.max(1, Math.ceil(stored.length / BOX_SIZE));
    return Array.from({ length: pages }, (_, index) => ({
      trainer,
      party,
      partySlots,
      page: index + 1,
      pages,
      pokemon: stored.slice(index * BOX_SIZE, (index + 1) * BOX_SIZE)
    }));
  });
}

// The slot an arrow key lands on; it stops at the edges of the grid. Other keys leave it where it is.
export function moveSlot(index, key, columns, count) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0;
  const next = index + step;
  if (next < 0 || next >= count) {return index;}
  if (Math.abs(step) === 1 && Math.floor(next / columns) !== Math.floor(index / columns)) {return index;}
  return next;
}
