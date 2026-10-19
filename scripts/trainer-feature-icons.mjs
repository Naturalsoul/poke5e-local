// Core Foundry painted icons for trainer features, keyed by feature sourceId (or featureKey for general features).
const ICONS = {
  // Origins: a landmark of each region.
  alolan: "environment/wilderness/island-palm-white",
  galarian: "environment/settlement/castle",
  hoennian: "magic/earth/volcano-explosion-lava-orange",
  johtoan: "environment/settlement/temple-night",
  kalosian: "commodities/flowers/bouquet-pink",
  kantoan: "commodities/treasure/medal-ribbon-gold-blue",
  sinnoan: "magic/time/hourglass-tilted-glowing-gold",
  unovan: "environment/settlement/city-night-spire",

  // Specializations: the type they specialize in.
  "poke-fan": "creatures/abilities/paw-print-orange",
  "black-belt": "magic/earth/strike-fist-stone",
  "bird-keeper": "creatures/abilities/wings-birdlike-blue",
  punk: "consumables/potions/potion-bottle-skull-label-poison-teal",
  camper: "magic/fire/flame-burning-campfire-rocks",
  hiker: "commodities/stone/boulder-grey",
  "bug-maniac": "creatures/invertebrates/beetle-stag-yellow-green",
  mystic: "creatures/magical/spirit-undead-ghost-purple",
  worker: "skills/trades/smithing-anvil-silver-red",
  kindler: "creatures/magical/spirit-fire-orange",
  swimmer: "magic/water/elemental-water",
  gardener: "magic/nature/leaf-glow-green",
  engineer: "magic/symbols/symbol-lightning-bolt",
  psychic: "magic/perception/orb-crystal-ball-scrying",
  skier: "magic/water/snowflake-ice-blue",
  "dragon-tamer": "creatures/abilities/dragon-breath-purple",
  delinquent: "magic/perception/silhouette-stealth-shadow",
  actor: "creatures/magical/fae-fairy-winged-glowing-green",

  // Paths.
  "ace-trainer": "commodities/treasure/cup-trophy-gold",
  hobbyist: "tools/instruments/lute-gold-brown",
  "poke-mentor": "sundries/books/book-open-purple",
  researcher: "tools/scribal/magnifying-glass",
  "pokemon-collector": "environment/traps/net",
  nurse: "magic/life/heart-cross-purple-orange",
  "type-master": "magic/symbols/elements-air-earth-fire-water",
  commander: "sundries/flags/banner-flag-blue",
  grunt: "sundries/flags/banner-skull-red",
  tactician: "sundries/gaming/chess-knight-white",
  ranger: "tools/navigation/compass-brass-blue-red",
  guru: "magic/symbols/circle-ouroboros",
  "pokemon-breeder": "consumables/eggs/egg-nest-pink",

  // Path features, levels 5 / 9 / 15.
  "battle-master": "skills/melee/strike-sword-steel-yellow",
  "follow-me": "skills/social/diplomacy-unity-alliance",
  "show-me-what-youve-got": "magic/fire/flame-burning-fist-strike",
  "were-a-team": "skills/social/intimidation-impressing",
  versatile: "sundries/gaming/dice-pair-white-green",
  retention: "sundries/books/book-notes-ragged-green",
  analyst: "magic/perception/eye-ringed-glow-angry-teal",
  "gotta-catch-em-all": "environment/traps/cage-wooden-yellow",
  pokechef: "consumables/food/bowl-stew-brown",
  "drawing-power": "magic/light/beam-rays-yellow-blue",
  "dark-advantage": "magic/unholy/silhouette-robe-evil-power",
  "directed-strike": "skills/targeting/crosshair-hex-red",
  "capture-styler": "magic/movement/trail-streak-zigzag-teal",
  mind: "commodities/biological/organ-brain-pink-purple",
  "tactical-mastery": "magic/control/buff-strength-muscle-damage-orange",
  generalist: "sundries/books/book-open-brown",
  cheerleader: "tools/instruments/megaphone",
  "evolution-expert": "magic/light/explosion-star-small-blue-yellow",
  "disciplined-strikes": "magic/earth/strike-fist-stone-light",
  "field-medic": "tools/medical/bandages-gauze-rough",
  "storing-power": "magic/defensive/barrier-shield-dome-blue-purple",
  "sinister-dodge": "magic/fire/explosion-embers-evade-silhouette",
  "raise-your-defenses": "magic/defensive/barrier-shield-dome-deflect-teal",
  partners: "skills/social/diplomacy-handshake-yellow",
  body: "magic/control/buff-strength-muscle-damage-red",
  "rapid-switching": "magic/movement/portal-vortex-orange",
  multitalented: "magic/symbols/runes-star-blue",
  "master-teacher": "sundries/books/book-open-red",
  professor: "magic/perception/orb-eye-scrying",
  "expert-tracker": "creatures/abilities/paw-print-pair-purple",
  "tip-top-shape": "magic/life/heart-pink",
  "releasing-power": "magic/sonic/explosion-shock-wave-teal",
  "nefarious-stagger": "magic/control/debuff-energy-hold-blue-yellow",
  "not-this-time": "magic/time/hourglass-brown-orange",
  "poke-assist": "magic/control/energy-stream-link-spiral-white",
  spirit: "magic/holy/chalice-glowing-yellow-blue",

  // General trainer features.
  "control-upgrade": "magic/control/control-influence-crown-yellow",
  "trainers-resolve": "magic/holy/barrier-shield-winged-blue",
  "pokemon-tracker": "tools/navigation/spyglass-telescope-brass-blue",
  "epic-boon": "commodities/treasure/crown-gold-laurel-wreath",
  "master-trainer": "commodities/treasure/medal-ribbon-star-gold-red"
};

export function trainerFeatureIcon(sourceId, key) {
  const icon = ICONS[sourceId] ?? ICONS[key];
  return icon ? `icons/${icon}.webp` : null;
}

export const TRAINER_FEATURE_ICON_PATHS = Object.values(ICONS).map(icon => `icons/${icon}.webp`);
