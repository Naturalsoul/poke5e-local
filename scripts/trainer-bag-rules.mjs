/* ============================================================
 * TRAINER BAG RULES
 *
 * What goes in which pocket of the bag (trainer-bag.mjs). No
 * Foundry calls, so it can be tested on its own.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

export const BAG_COLUMNS = 6;
export const BAG_MIN_SLOTS = BAG_COLUMNS * 4;
const EQUIPPABLE_TYPES = new Set(["weapon", "equipment"]);

// "other" takes whatever the catalog does not classify, like the D&D items dropped on a trainer.
export const BAG_POCKETS = Object.freeze([
  { id: "pokeball", es: "Poké Balls", en: "Poké Balls", itemTypes: ["pokeball"] },
  { id: "medicine", es: "Medicina", en: "Medicine", itemTypes: ["medicine"] },
  { id: "berry", es: "Bayas", en: "Berries", itemTypes: ["berry"] },
  { id: "held", es: "Objetos", en: "Items", itemTypes: ["held-item", "evolution"] },
  { id: "other", es: "Equipo", en: "Gear", itemTypes: [] }
]);

// Features, classes and spells have no quantity: they live on the sheet, not in the bag.
export const isBagItem = item => item?.system?.quantity !== undefined;

export function bagPocketOf(item) {
  const itemType = item.getFlag(MODULE_ID, "itemType");
  return BAG_POCKETS.find(pocket => pocket.itemTypes.includes(itemType))?.id ?? "other";
}

export function bagContents(items) {
  const contents = new Map(BAG_POCKETS.map(pocket => [pocket.id, []]));
  for (const item of items) {
    if (isBagItem(item)) {contents.get(bagPocketOf(item)).push(item);}
  }
  for (const pocket of contents.values()) {
    pocket.sort((left, right) => left.name.localeCompare(right.name));
  }
  return contents;
}

// Full rows, with room to spare: a pocket never looks full when it can still take more.
export function bagSlotCount(count) {
  return Math.max(BAG_MIN_SLOTS, (Math.floor(count / BAG_COLUMNS) + 1) * BAG_COLUMNS);
}

export const isEquippable = item => EQUIPPABLE_TYPES.has(item.type);

// Not only items with activities: a Poké Ball has none, its capture button comes on the chat card that using it posts.
export const canUseBagItem = item => Number(item.system.quantity) > 0;
