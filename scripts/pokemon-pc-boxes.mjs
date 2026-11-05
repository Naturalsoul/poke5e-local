import { canCurrentUserOperateTrainer } from "./trainer-ownership-service.mjs";
import { addPokemonToParty, getTrainerOwnedPokemon, getTrainerPartyState, getTrainerPokeslotLimit, isPokemonActive,
  removePokemonFromParty, setTrainerPartyOrder } from "./trainer-party-service.mjs";
import { isTrainerActor } from "./trainer-service.mjs";

const MODULE_ID = "poke5e-local";
const SLOTS_FLAG = "pcSlots";

export const BOX_COLUMNS = 6;
export const BOX_SIZE = BOX_COLUMNS * 5;
export const PC_BOXES = 8;

// The token may be the animated WebM when the animated tokens setting is on; its PNG sits next to it.
export function staticSpriteSource(pokemon) {
  const token = String(pokemon?.prototypeToken?.texture?.src ?? "");
  const still = token.replace(/sprite-animated(-shiny)?\.webm$/i, "sprite$1.png");
  return still && !/\.webm$/i.test(still) ? still : pokemon?.img;
}

/**
 * How far to shift a sprite so its lowest visible row rests on `ground`, because each sprite leaves a different blank
 * margin under its feet. `alpha` is RGBA from a square canvas of `size` pixels, `rendered` the height it is shown at. A
 * tall sprite stops rising when its top reaches the edge. Nothing visible: no shift.
 */
export function spriteGroundShift(alpha, size, rendered, ground) {
  const rows = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (alpha[(row * size + column) * 4 + 3] > 16) {
        rows.push(row);
        break;
      }
    }
  }
  if (!rows.length) {return 0;}
  const scale = rendered / size;
  return Math.max(ground - (rows.at(-1) + 1) * scale, -rows[0] * scale);
}

// Imported actors carry their level in the name, and the PC already shows it on its own.
export const pcDisplayName = name => String(name).replace(/\s*\((?:lv|nv)\.?\s*\d+\)\s*$/i, "");

const byName = (left, right) => left.name.localeCompare(right.name);

/**
 * Where each stored Pokémon sits: an array of UUIDs (or null) whose index counts slots across every box. Saved places
 * are kept; a Pokémon without one, such as a new capture or one back from the party, takes the first free slot.
 */
export function resolvePcLayout(stored, saved) {
  const storedUuids = new Set(stored.map(pokemon => pokemon.uuid));
  const placed = new Set();
  const slots = [];
  (Array.isArray(saved) ? saved : []).forEach((uuid, index) => {
    if (!storedUuids.has(uuid) || placed.has(uuid)) {return;}
    slots[index] = uuid;
    placed.add(uuid);
  });
  let free = 0;
  for (const { uuid } of stored) {
    if (placed.has(uuid)) {continue;}
    while (slots[free]) {free += 1;}
    slots[free] = uuid;
  }
  return Array.from(slots, uuid => uuid ?? null);
}

// Every trainer has the same boxes; a PC that outgrows them gets more, so nobody is ever out of reach.
export const pcBoxCount = slots => Math.max(PC_BOXES, Math.ceil(slots.length / BOX_SIZE));

// The trainers this user may operate, players' first, each with their party and their PC: whatever they own outside it.
export function trainerPcEntries() {
  const trainers = game.actors.filter(actor => isTrainerActor(actor) && canCurrentUserOperateTrainer(actor));
  trainers.sort((left, right) => Number(Boolean(right.hasPlayerOwner)) - Number(Boolean(left.hasPlayerOwner)) || byName(left, right));
  return trainers.map(trainer => {
    const party = getTrainerPartyState(trainer).pokemonUuids.map(uuid => fromUuidSync(uuid, { strict: false })).filter(Boolean);
    const partyUuids = new Set(party.map(pokemon => pokemon.uuid));
    const stored = getTrainerOwnedPokemon(trainer).filter(pokemon => !partyUuids.has(pokemon.uuid)).sort(byName);
    const limit = getTrainerPokeslotLimit(trainer);
    return {
      trainer,
      party,
      limit,
      partySlots: Math.max(limit, party.length),
      slots: resolvePcLayout(stored, trainer.getFlag(MODULE_ID, SLOTS_FLAG)),
      pokemon: new Map([...party, ...stored].map(pokemon => [pokemon.uuid, pokemon]))
    };
  });
}

/**
 * The party and slots after dropping `held` on `target` ({ zone: "party" | "box", index }), swapping with whoever is
 * there. Null when nothing changes, { error } when the rules forbid it: "full" with no Pokéslot left, "active" when a
 * deployed Pokémon would have to leave the party.
 */
export function planPcMove({ party, slots, limit, isActive }, held, { zone, index }) {
  const nextParty = [...party];
  const nextSlots = [...slots];
  const partyIndex = party.indexOf(held);
  const slotIndex = slots.indexOf(held);
  const occupant = (zone === "party" ? party[index] : slots[index]) ?? null;
  if (occupant === held) {return null;}

  if (zone === "party" && partyIndex >= 0) {
    if (!occupant) {return null;}
    nextParty[partyIndex] = occupant;
    nextParty[index] = held;
  } else if (zone === "party") {
    if (occupant && isActive(occupant)) {return { error: "active" };}
    if (!occupant && party.length >= limit) {return { error: "full" };}
    if (occupant) {nextParty[index] = held;} else {nextParty.push(held);}
    nextSlots[slotIndex] = occupant;
  } else if (partyIndex >= 0) {
    if (isActive(held)) {return { error: "active" };}
    if (occupant) {nextParty[partyIndex] = occupant;} else {nextParty.splice(partyIndex, 1);}
    nextSlots[index] = held;
  } else {
    nextSlots[slotIndex] = occupant;
    nextSlots[index] = held;
  }
  return { party: nextParty, slots: Array.from(nextSlots, uuid => uuid ?? null) };
}

export const pcMoveContext = entry => ({
  party: entry.party.map(pokemon => pokemon.uuid),
  slots: entry.slots,
  limit: entry.limit,
  isActive: uuid => isPokemonActive(entry.trainer, entry.pokemon.get(uuid))
});

// The slots go first: if a party write fails, a Pokémon still in the party is simply ignored by the layout.
export async function applyPcMove({ trainer, party, pokemon }, plan) {
  await trainer.setFlag(MODULE_ID, SLOTS_FLAG, plan.slots);
  const before = party.map(each => each.uuid);
  for (const uuid of before.filter(each => !plan.party.includes(each))) {await removePokemonFromParty(trainer, pokemon.get(uuid));}
  for (const uuid of plan.party.filter(each => !before.includes(each))) {await addPokemonToParty(trainer, pokemon.get(uuid));}
  await setTrainerPartyOrder(trainer, plan.party);
}

// The slot an arrow key lands on; it stops at the edges of the grid. Other keys leave it where it is.
export function moveSlot(index, key, columns, count) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key] ?? 0;
  const next = index + step;
  if (next < 0 || next >= count) {return index;}
  if (Math.abs(step) === 1 && Math.floor(next / columns) !== Math.floor(index / columns)) {return index;}
  return next;
}
