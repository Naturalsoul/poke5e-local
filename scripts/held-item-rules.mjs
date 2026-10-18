// Solo contratos explícitos de data/normalized/items.json (Pokémon 5e).
export const HELD_ITEM_DAMAGE_TYPES = Object.freeze({
  "black-belt": "fighting",
  "black-glasses": "dark",
  charcoal: "fire",
  "dragon-fang": "dragon",
  "fairy-feather": "fairy",
  "hard-stone": "rock",
  magnet: "electric",
  "metal-coat": "steel",
  "miracle-seed": "grass",
  "mystic-water": "water",
  "never-melt-ice": "ice",
  "poison-barb": "poison",
  "sharp-beak": "flying",
  "silk-scarf": "normal",
  "silver-powder": "bug",
  "soft-sand": "ground",
  "spell-tag": "ghost",
  "twisted-spoon": "psychic",
  "odd-incense": "psychic",
  "rock-incense": "rock",
  "rose-incense": "grass",
  "sea-incense": "water",
  "wave-incense": "water"
});

// Lista de movimientos de puñetazo; Sucker Punch no pertenece a esta categoría.
// https://bulbapedia.bulbagarden.net/wiki/Iron_Fist_(Ability)#Affected_moves
export const PUNCHING_MOVE_IDS = Object.freeze([
  "bullet-punch", "comet-punch", "dizzy-punch", "double-iron-bash", "double-shock",
  "drain-punch", "dynamic-punch", "fire-punch", "focus-punch", "hammer-arm",
  "headlong-rush", "ice-hammer", "ice-punch", "jet-punch", "mach-punch", "mega-punch",
  "meteor-mash", "plasma-fists", "power-up-punch", "rage-fist", "shadow-punch",
  "sky-uppercut", "surging-strikes", "thunder-punch", "wicked-blow"
]);

export function heldItemDamageBonus(sourceId, { type, scope, proficiency, moveId }) {
  const bonus = Math.max(0, Number(proficiency) || 0);
  if (HELD_ITEM_DAMAGE_TYPES[sourceId] === type && type) {
    return bonus;
  }
  if (sourceId === "muscle-band" && scope === "melee") {
    return bonus;
  }
  if (sourceId === "wise-glasses" && scope === "ranged") {
    return bonus;
  }
  if (sourceId === "punching-glove" && PUNCHING_MOVE_IDS.includes(moveId)) {
    return bonus;
  }
  return sourceId === "life-orb" ? bonus : 0;
}

export function heldItemCriticalRange(sourceId, speciesId) {
  if (sourceId === "scope-lens") {
    return 1;
  }
  if (sourceId === "lucky-punch" && speciesId === "chansey") {
    return 1;
  }
  if (sourceId === "leek" && ["farfetchd", "galarian-farfetchd", "sirfetchd"].includes(speciesId)) {
    return 2;
  }
  return 0;
}
