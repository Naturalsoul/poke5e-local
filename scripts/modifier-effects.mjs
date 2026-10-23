import { endOfNextTurnFlags } from "./turn-duration-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

export const AUTOMATED_MODIFIER_MOVES = new Set(["growl", "leer", "screech", "tail-whip", "mud-slap", "defense-curl", "agility", "amnesia",
  "acid-armor", "aqua-ring", "defend-order", "bubble-beam", "mud-shot", "acid-spray",
  // Batch 5a: AC modifiers (COMPACT_DEFINITIONS).
  "cotton-guard", "minimize", "coil", "quiver-dance", "victory-dance", "swords-dance", "charge", "iron-defense",
  "psyshield-bash", "rock-polish", "whirlwind", "shell-smash", "stuff-cheeks", "stockpile", "clangorous-soul",
  "scale-shot", "shelter", "steel-wing", "crunch", "iron-tail", "liquidation", "razor-shell", "rock-smash",
  "shadow-bone", "grav-apple", "clanging-scales",
  // Batch 5b: attack modifiers.
  "octazooka", "play-rough", "sand-attack", "shadow-ball", "feather-dance", "meditate", "sharpen", "work-up",
  "ancient-power", "silver-wind", "ominous-wind",
  // Batch 5c: saving-throw modifiers.
  "apple-acid", "aromatic-mist", "cosmic-power", "hammer-arm", "ice-hammer", "lumina-crash", "tearful-look",
  // Batch 5d: speed modifiers.
  "aqua-step", "autotomize", "esper-wing", "flame-charge", "trailblaze", "shift-gear", "tar-shot",
  // Batch 5e: leftovers.
  "belly-drum", "dragon-dance", "hone-claws", "rage", "superpower", "trop-kick",
  // Batch 5f: roll modes (decorate stays on the chat button).
  "armor-cannon", "aurora-beam", "bitter-malice", "breaking-swipe", "bug-buzz", "chilling-water", "close-combat",
  "crush-claw", "dragon-ascent", "earth-power", "energy-ball", "fake-tears", "fillet-away", "flash-cannon",
  "fleur-cannon", "focus-blast", "geomancy", "glaive-rush", "headlong-rush", "hyperspace-fury", "leaf-tornado",
  "lunge", "luster-purge", "metal-claw", "metal-sound", "meteor-mash", "mirror-shot", "mist-ball", "moonblast",
  "mud-bomb", "muddy-water", "mystical-fire", "night-daze", "no-retreat", "overheat", "play-nice", "psycho-boost",
  "seed-flare", "snarl", "spicy-extract", "spirit-break", "spotlight", "sweet-scent",
  // Status riders batch 2.
  "fire-lash", "charm", "v-create", "glaciate", "leaf-storm", "focus-energy", "tail-glow", "calm-mind", "laser-focus"]);


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    growl:
      "Gruñido — Ataques -1",

    acidSpray:
      "Ácido corrosivo — AC -1",

    acidArmor:
      "Armadura Ácida — AC +2",

    agility:
      "Agilidad — Velocidad +20 ft",

    amnesia:
      "Amnesia — Salvaciones +2",

    defendOrder:
      "Orden de Defensa",

    tailWhip:
        "Tail Whip — ataques aliados +1",

    leer:
        "Leer — ataques aliados +1",

    screech:
        "Screech — ataques aliados +1",

    growth:
        "Growth — Ataques y salvaciones",

    defenseCurl:
        "Defense Curl — Defensa",

    aquaRing:
        "Aqua Ring — Regeneración",
  },


  en: {

    growl:
      "Growl — Attacks -1",

    acidSpray:
      "Acid Spray — AC -1",

    acidArmor:
      "Acid Armor — AC +2",

    agility:
      "Agility — Speed +20 ft",

    amnesia:
      "Amnesia — Saves +2",

    defendOrder:
      "Defend Order",

    tailWhip:
        "Tail Whip — ally attacks +1",

    leer:
        "Leer — ally attacks +1",

    screech:
        "Screech — ally attacks +1",

    growth:
        "Growth — Attacks & Saves",

    defenseCurl:
        "Defense Curl — Defense",

    aquaRing:
        "Aqua Ring — Regeneration",
  }
};


/* ============================================================
 * EFFECT ID
 * ============================================================ */

function effectId(
  moveId
) {

  return (
    "P5m" +
    String(moveId)
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      )
  )
    .padEnd(
      16,
      "0"
    )
    .slice(
      0,
      16
    );
}


/* ============================================================
 * ACTIVE EFFECT CHANGE
 * ============================================================ */

function add(
  key,
  value,
  priority = 20
) {

  return {

    key,

    mode:
      CONST.ACTIVE_EFFECT_MODES.ADD,

    value:
      String(value),

    priority
  };
}


/* ============================================================
 * TODOS LOS ATTACK TYPES D&D5e
 * ============================================================ */

function movementChanges(factor) {
  return ["walk", "fly", "swim", "climb", "burrow"].map(movement => ({
    key: `system.attributes.movement.${movement}`, mode: CONST.ACTIVE_EFFECT_MODES.MULTIPLY,
    value: String(factor), priority: 20
  }));
}

function attackChanges(
  value
) {

  return [

    add(
      "system.bonuses.mwak.attack",
      value
    ),

    add(
      "system.bonuses.rwak.attack",
      value
    ),

    add(
      "system.bonuses.msak.attack",
      value
    ),

    add(
      "system.bonuses.rsak.attack",
      value
    )
  ];
}


/* ============================================================
 * DEFEND ORDER SCALING
 *
 * Poke5e:
 *
 * Lv 1  → +1
 * Lv 5  → +2
 * Lv 10 → +3
 * Lv 17 → +4
 * ============================================================ */

function defendOrderBonus(
  level
) {

  const value =
    Number(level) || 1;


  if (
    value >= 17
  ) {

    return 4;
  }


  if (
    value >= 10
  ) {

    return 3;
  }


  if (
    value >= 5
  ) {

    return 2;
  }


  return 1;
}


/* ============================================================
 * DEFINICIONES COMPACTAS (stat-modifiers por lotes)
 * ============================================================ */

const ac = value => add("system.attributes.ac.bonus", value);
const damageChanges = value => ["mwak", "rwak", "msak", "rsak"].map(key => add(`system.bonuses.${key}.damage`, value));
const saveBonus = value => add("system.bonuses.abilities.save", value);
const speedBonus = value => add("system.attributes.movement.bonus", value);
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const abilityScores = value => ABILITIES.map(key => add(`system.abilities.${key}.value`, value));
const abilitySaves = (keys, value) => keys.map(key => add(`system.abilities.${key}.bonuses.save`, value));
// dnd5e counts each ADD of 1 / -1 on roll.mode as a source of advantage / disadvantage.
const saveModes = (keys, mode) => keys.map(key => add(`system.abilities.${key}.save.roll.mode`, mode));
// "+5 speed with each hit, until switched out or the combat ends, max +30".
const speedOnHit = name => ({ name, target: "self", trigger: "hit", duration: {}, removeOnCombatEnd: true,
  stack: { max: 6 }, changes: [speedBonus(5)] });
const levelTier = (level, tiers) => tiers.filter(([minimum]) => level >= minimum).at(-1)[1];

const selfBuff = (name, changes, extra = {}) =>
  ({ name, target: "self", trigger: "self", duration: { seconds: 60 }, changes, ...extra });
const concentrationBuff = (name, changes) => selfBuff(name, changes, { concentration: true });
const untilNextTurn = { duration: {}, expireAtEndOfNextTurn: true };
const untilTurnStart = { duration: {}, expireAtStartTurn: true };
// Debuffs that last "for the rest of combat" / "while it remains in battle".
const combatDebuff = (name, trigger, max = 1, changes = [ac(-1)]) =>
  ({ name, target: "target", trigger, duration: {}, removeOnCombatEnd: true, stack: { max }, changes });

// Batch 5f roll modes, read by targeted-modifier-engine. own: the bearer's attacks; against: attacks on the bearer;
// vsSource: only toward / from whoever applied it; nextAttack: how many of those attacks it lasts.
const untilNextAttack = { duration: {}, removeOnCombatEnd: true };
const rollModeDebuff = (name, trigger, rollModes, timing = untilNextTurn) =>
  ({ name, target: "target", trigger, changes: [], rollModes, ...timing });
const attacksAtDisadvantage = (name, trigger) => rollModeDebuff(name, trigger, { own: -1 });
const nextAttackDisadvantage = (name, trigger) => rollModeDebuff(name, trigger, { own: -1, nextAttack: 1 }, untilNextAttack);
const nextAttackAgainstAdvantage = name => rollModeDebuff(name, "natural-attack-19+", { against: 1, nextAttack: 1 }, untilNextAttack);
// "Any attack you make against the user": natural 1+ means on use, hit or miss.
const retaliation = name => rollModeDebuff(name, "natural-attack-1+", { own: 1, vsSource: true });
const exposed = name => selfBuff(name, [], { ...untilTurnStart, rollModes: { against: 1 } });
const exhausted = name => selfBuff(name, [], { ...untilNextAttack, rollModes: { own: -1, nextAttack: 1 } });
const attackedWithBonus = name => ({ name, target: "target", trigger: "failed-save", ...untilNextTurn, changes: [],
  targetedAttack: { bonusPerStack: 5, alliesOnly: false, excludeSource: false } });
const COMPACT_DEFINITIONS = Object.freeze({
  "cotton-guard": en => concentrationBuff(en ? "Cotton Guard — AC +2" : "Rizo Algodón — CA +2", [ac(2)]),
  minimize: en => concentrationBuff(en ? "Minimize — AC +2" : "Reducción — CA +2", [ac(2)]),
  coil: en => concentrationBuff(en ? "Coil — Attacks, damage and AC +1" : "Enrosque — Ataques, daño y CA +1",
    [...attackChanges(1), ...damageChanges(1), ac(1)]),
  "quiver-dance": (en, level) => concentrationBuff(
    en ? "Quiver Dance — AC, attacks and damage up" : "Danza Aleteo — CA, ataques y daño",
    [ac(level >= 10 ? 2 : 1), ...attackChanges(1), ...damageChanges(1)]),
  "victory-dance": (en, level) => {
    const bonus = level >= 10 ? 2 : 1;
    return concentrationBuff(en ? `Victory Dance — AC, attacks and saves +${bonus}` : `Danza Triunfal — CA, ataques y salvaciones +${bonus}`,
      [ac(bonus), ...attackChanges(bonus), saveBonus(bonus)]);
  },
  // Sapped: its next damaging Moves deal MOVE less, until the end of its next turn.
  "leaf-storm": en => selfBuff(en ? "Leaf Storm — Sapped, damage -MOVE" : "Lluevehojas — Agotado, daño -MOV",
    damageChanges("-max(@abilities.str.mod, @abilities.dex.mod)"), untilNextTurn),
  // Markers while concentrating: move-riders reads them on the attack and damage rolls.
  "focus-energy": en => concentrationBuff(en ? "Focus Energy — Critical range +2" : "Foco Energía — Rango de crítico +2", []),
  "tail-glow": en => concentrationBuff(en ? "Tail Glow — STAB doubled" : "Ráfaga — STAB doble", []),
  "laser-focus": en => concentrationBuff(en ? "Laser Focus — Next attack is a critical hit" : "Aguzar — El próximo ataque es crítico", []),
  "calm-mind": en => concentrationBuff(en ? "Calm Mind — STAB doubled" : "Paz Mental — STAB doble", []),
  "swords-dance": (en, level) => {
    const bonus = level >= 10 ? 2 : 1;
    return concentrationBuff(en ? `Swords Dance — AC +${bonus}` : `Danza Espada — CA +${bonus}`, [ac(bonus)]);
  },
  charge: en => selfBuff(en ? "Charge — AC +2" : "Carga — CA +2", [ac(2)], { ...untilTurnStart, concentration: true }),
  "iron-defense": en => selfBuff(en ? "Iron Defense — AC +6" : "Defensa Férrea — CA +6", [ac(6)], untilNextTurn),
  "psyshield-bash": en => selfBuff(en ? "Psyshield Bash — AC +1" : "Asalto Barrera — CA +1", [ac(1)], untilNextTurn),
  "rock-polish": en => selfBuff(en ? "Rock Polish — AC +2, speed +20 ft" : "Pulimento — CA +2, velocidad +20 ft",
    [ac(2), speedBonus(20)], { duration: { rounds: 3 } }),
  whirlwind: en => selfBuff(en ? "Whirlwind — AC +2" : "Remolino — CA +2", [ac(2)], untilTurnStart),
  "shell-smash": en => selfBuff(en ? "Shell Smash — AC -1, damage +PB" : "Rompecoraza — CA -1, daño +BC",
    [ac(-1), ...damageChanges("@prof")]),
  "stuff-cheeks": en => selfBuff(en ? "Stuff Cheeks — AC +2" : "Atiborramiento — CA +2", [ac(2)],
    { duration: { seconds: 600 }, stack: { max: 2 } }),
  stockpile: en => selfBuff(en ? "Stockpile — AC +1" : "Reserva — CA +1", [ac(1)], { duration: {}, stack: { max: 3 } }),
  "clangorous-soul": en => selfBuff(en ? "Clangorous Soul — Attacks, AC and damage +1" : "Clangorous Soul — Ataques, CA y daño +1",
    [...attackChanges(1), ac(1), ...damageChanges(1)], { duration: {}, removeOnCombatEnd: true, stack: { max: 5 } }),
  "scale-shot": en => selfBuff(en ? "Scale Shot — Speed +10 ft, AC -2" : "Ráfaga Escamas — Velocidad +10 ft, CA -2",
    [speedBonus(10), ac(-2)], untilNextTurn),
  shelter: en => selfBuff(en ? "Shelter — AC +5" : "Retracción — CA +5", [ac(5)], untilTurnStart),
  "steel-wing": en => ({ ...selfBuff(en ? "Steel Wing — AC +1" : "Ala de Acero — CA +1", [ac(1)], untilNextTurn),
    trigger: "natural-attack-19+" }),
  crunch: en => combatDebuff(en ? "Crunch — AC -1" : "Triturar — CA -1", "natural-attack-18+", 5),
  "iron-tail": en => combatDebuff(en ? "Iron Tail — AC -1" : "Cola Férrea — CA -1", "natural-attack-19+"),
  liquidation: en => combatDebuff(en ? "Liquidation — AC -1" : "Hidroariete — CA -1", "natural-attack-18+", 5),
  "razor-shell": en => combatDebuff(en ? "Razor Shell — AC -1" : "Concha Filo — CA -1", "natural-attack-18+", 5),
  "rock-smash": en => combatDebuff(en ? "Rock Smash — AC -1" : "Golpe Roca — CA -1", "natural-attack-19+"),
  "shadow-bone": en => combatDebuff(en ? "Shadow Bone — AC -1" : "Hueso Sombrío — CA -1", "natural-attack-18+", 5),
  "grav-apple": en => combatDebuff(en ? "Grav Apple — AC -1" : "Fuerza G — CA -1", "hit-and-failed-save", 3),
  "clanging-scales": en => combatDebuff(en ? "Clanging Scales — AC -1" : "Fragor Escamas — CA -1", "failed-save-by-5"),
  "bubble-beam": en => ({ name: en ? "Bubble Beam — Speed halved" : "Rayo Burbuja — Velocidad a la mitad",
    target: "target", trigger: "natural-attack-19+", ...untilNextTurn, changes: movementChanges(0.5) }),
  "mud-shot": en => ({ name: en ? "Mud Shot — Speed 0" : "Disparo Lodo — Velocidad 0",
    target: "target", trigger: "natural-attack-16+", ...untilNextTurn, changes: movementChanges(0) }),

  // Batch 5b: attack modifiers.
  octazooka: en => combatDebuff(en ? "Octazooka — Attacks -1" : "Pulpocañón — Ataques -1", "natural-attack-18+", 1, attackChanges(-1)),
  "play-rough": en => combatDebuff(en ? "Play Rough — Attacks -1" : "Carantoña — Ataques -1", "natural-attack-19+", 5, attackChanges(-1)),
  "sand-attack": en => combatDebuff(en ? "Sand Attack — Attacks -1" : "Ataque Arena — Ataques -1", "failed-save", 5, attackChanges(-1)),
  "shadow-ball": en => ({ name: en ? "Shadow Ball — Attacks -2" : "Bola Sombra — Ataques -2",
    target: "target", trigger: "hit", ...untilNextTurn, changes: attackChanges(-2) }),
  "feather-dance": en => ({ name: en ? "Feather Dance — No proficiency on attacks" : "Danza Pluma — Sin competencia en ataques",
    target: "target", trigger: "failed-save", duration: { seconds: 60 }, concentration: true, changes: attackChanges("-@prof") }),
  meditate: (en, level) => {
    const bonus = levelTier(level, [[1, 1], [5, 2], [10, 3], [17, 4]]);
    return concentrationBuff(en ? `Meditate — Attacks and saves +${bonus}` : `Meditación — Ataques y salvaciones +${bonus}`,
      [...attackChanges(bonus), saveBonus(bonus)]);
  },
  sharpen: (en, level) => {
    const die = level >= 10 ? "1d6" : "1d4";
    return concentrationBuff(en ? `Sharpen — Attacks +${die}` : `Afilar — Ataques +${die}`, attackChanges(die));
  },
  "work-up": en => selfBuff(en ? "Work Up — Attacks +2" : "Avivar — Ataques +2", attackChanges(2)),
  "ancient-power": en => ({ ...selfBuff(en ? "Ancient Power — Ability scores +1" : "Poder Pasado — Características +1",
    abilityScores(1), { duration: {}, removeOnCombatEnd: true, stack: { max: 5 } }), trigger: "natural-attack-19+" }),
  "silver-wind": en => ({ ...selfBuff(en ? "Silver Wind — Ability scores +1" : "Viento Plata — Características +1",
    abilityScores(1), { duration: {}, removeOnCombatEnd: true, stack: { max: 5 } }), trigger: "natural-attack-19+" }),
  // Not described as stackable, unlike Ancient Power and Silver Wind.
  "ominous-wind": en => ({ ...selfBuff(en ? "Ominous Wind — Ability scores +1" : "Viento Aciago — Características +1",
    abilityScores(1), { duration: {}, removeOnCombatEnd: true }), trigger: "natural-attack-19+" }),

  // Batch 5c: saving-throw modifiers.
  "apple-acid": en => combatDebuff(en ? "Apple Acid — DEX and CON saves -2" : "Ácido Málico — Salvaciones DES y CON -2",
    "failed-save", 3, abilitySaves(["dex", "con"], -2)),
  "aromatic-mist": (en, level) => {
    const die = level >= 10 ? "1d6" : "1d4";
    return selfBuff(en ? `Aromatic Mist — Saves +${die}` : `Niebla Aromática — Salvaciones +${die}`, [saveBonus(die)]);
  },
  "cosmic-power": en => concentrationBuff(en ? "Cosmic Power — Advantage on saves" : "Masa Cósmica — Ventaja en salvaciones",
    saveModes(ABILITIES, 1)),
  "hammer-arm": en => selfBuff(en ? "Hammer Arm — DEX saves at disadvantage, speed halved" : "Machada — Salvaciones DES con desventaja, velocidad a la mitad",
    [...saveModes(["dex"], -1), ...movementChanges(0.5)], untilTurnStart),
  "ice-hammer": en => selfBuff(en ? "Ice Hammer — DEX saves at disadvantage, speed halved" : "Martillo Hielo — Salvaciones DES con desventaja, velocidad a la mitad",
    [...saveModes(["dex"], -1), ...movementChanges(0.5)], untilTurnStart),
  "lumina-crash": en => ({ name: en ? "Lumina Crash — WIS saves -2" : "Fotocolisión — Salvaciones SAB -2",
    target: "target", trigger: "failed-save", ...untilNextTurn, changes: abilitySaves(["wis"], -2) }),
  "tearful-look": en => ({ name: en ? "Tearful Look — Attacks -1" : "Ojos Llorosos — Ataques -1",
    target: "target", trigger: "failed-save", duration: { seconds: 60 }, stack: { max: 5 }, changes: attackChanges(-1) }),

  // Batch 5d: speed modifiers.
  "aqua-step": en => selfBuff(en ? "Aqua Step — Speed +10" : "Danza Acuática — Velocidad +10", [speedBonus(10)], untilNextTurn),
  autotomize: en => selfBuff(en ? "Autotomize — Speed +10" : "Aligerar — Velocidad +10", [speedBonus(10)], { stack: { max: 3 } }),
  "esper-wing": en => speedOnHit(en ? "Esper Wing — Speed +5" : "Ala Aural — Velocidad +5"),
  "flame-charge": en => speedOnHit(en ? "Flame Charge — Speed +5" : "Nitrocarga — Velocidad +5"),
  trailblaze: en => speedOnHit(en ? "Trailblaze — Speed +5" : "Abrecaminos — Velocidad +5"),
  "shift-gear": en => concentrationBuff(en ? "Shift Gear — Attacks and damage +1, speed +10" : "Cambio de Marcha — Ataques y daño +1, velocidad +10",
    [...attackChanges(1), ...damageChanges(1), speedBonus(10)]),
  // dnd5e clamps speed at 0, so the cap only bounds the stack; the non-numeric "fire" isn't scaled by stacking.
  "tar-shot": en => combatDebuff(en ? "Tar Shot — Speed -10, fire vulnerability" : "Alquitranazo — Velocidad -10, vulnerable al fuego",
    "hit", 12, [speedBonus(-10), add("system.traits.dv.value", "fire")]),

  // Batch 5e: leftovers.
  "belly-drum": en => selfBuff(en ? "Belly Drum — STR +10" : "Tambor — FUE +10", [add("system.abilities.str.value", 10)],
    { duration: {}, removeOnCombatEnd: true }),
  "dragon-dance": en => concentrationBuff(en ? "Dragon Dance — Proficiency doubled on attacks" : "Danza Dragón — Competencia doble en ataques",
    attackChanges("@prof")),
  "hone-claws": en => selfBuff(en ? "Hone Claws — Attacks and damage +1" : "Afilagarras — Ataques y daño +1",
    [...attackChanges(1), ...damageChanges(1)], { stack: { max: 3 } }),
  rage: (en, level) => {
    const bonus = levelTier(level, [[1, 1], [5, 2], [10, 4], [17, 6]]);
    return concentrationBuff(en ? `Rage — Damage +${bonus}, normal resistance` : `Furia — Daño +${bonus}, resistencia a normal`,
      [...damageChanges(bonus), add("system.traits.dr.value", "normal"), add("system.abilities.str.check.roll.mode", 1)]);
  },
  superpower: en => selfBuff(en ? "Superpower — STR and DEX -10" : "Fuerza Bruta — FUE y DES -10",
    [add("system.abilities.str.value", -10), add("system.abilities.dex.value", -10)], untilNextTurn),
  "trop-kick": en => combatDebuff(en ? "Trop Kick — Attacks -1" : "Patada Tropical — Ataques -1", "natural-attack-16+", 3, attackChanges(-1)),
  // Batch 5f: roll modes.
  "armor-cannon": en => selfBuff(en ? "Armor Cannon — Attacked with advantage, CON saves at disadvantage" : "Cañón Armadura — Atacado con ventaja, salvaciones CON con desventaja",
    saveModes(["con"], -1), { ...untilNextTurn, rollModes: { against: 1 } }),
  "aurora-beam": en => attacksAtDisadvantage(en ? "Aurora Beam — Attacks at disadvantage" : "Rayo Aurora — Ataques con desventaja", "natural-attack-15+"),
  "bitter-malice": en => attacksAtDisadvantage(en ? "Bitter Malice — Attacks at disadvantage" : "Rencor Reprimido — Ataques con desventaja", "hit-and-failed-save"),
  "breaking-swipe": en => attacksAtDisadvantage(en ? "Breaking Swipe — Attacks at disadvantage" : "Vasto Impacto — Ataques con desventaja", "failed-save"),
  "bug-buzz": en => nextAttackDisadvantage(en ? "Bug Buzz — Next attack at disadvantage" : "Zumbido — Próximo ataque con desventaja", "failed-save-by-5"),
  "chilling-water": en => attacksAtDisadvantage(en ? "Chilling Water — Attacks at disadvantage" : "Agua Fría — Ataques con desventaja", "hit-and-failed-save"),
  "close-combat": en => retaliation(en ? "Close Combat — Advantage against the user" : "A Bocajarro — Ventaja contra el usuario"),
  "crush-claw": en => rollModeDebuff(en ? "Crush Claw — User's next attack with advantage" : "Garra Brutal — Próximo ataque del usuario con ventaja",
    "natural-attack-15+", { against: 1, vsSource: true, nextAttack: 1 }, untilNextAttack),
  "dragon-ascent": en => exposed(en ? "Dragon Ascent — Attacked with advantage" : "Ascenso Draco — Atacado con ventaja"),
  "earth-power": en => nextAttackAgainstAdvantage(en ? "Earth Power — Next attack against it with advantage" : "Tierra Viva — Próximo ataque en su contra con ventaja"),
  "energy-ball": en => nextAttackAgainstAdvantage(en ? "Energy Ball — Next attack against it with advantage" : "Energibola — Próximo ataque en su contra con ventaja"),
  "fake-tears": en => attackedWithBonus(en ? "Fake Tears — Attacks against it +5" : "Llanto Falso — Ataques en su contra +5"),
  "fillet-away": en => selfBuff(en ? "Fillet Away — Next attack with advantage, speed +15" : "Deslome — Próximo ataque con ventaja, velocidad +15",
    [speedBonus(15)], { ...untilTurnStart, rollModes: { own: 1, nextAttack: 1 } }),
  "flash-cannon": en => nextAttackAgainstAdvantage(en ? "Flash Cannon — Next attack against it with advantage" : "Cañón Resplandor — Próximo ataque en su contra con ventaja"),
  "fleur-cannon": en => exhausted(en ? "Fleur Cannon — Next attack at disadvantage" : "Cañón Floral — Próximo ataque con desventaja"),
  "focus-blast": en => nextAttackAgainstAdvantage(en ? "Focus Blast — Next attack against it with advantage" : "Onda Certera — Próximo ataque en su contra con ventaja"),
  geomancy: en => selfBuff(en ? "Geomancy — Advantage on attacks and saves, speed +10" : "Geocontrol — Ventaja en ataques y salvaciones, velocidad +10",
    [speedBonus(10), ...saveModes(ABILITIES, 1)], { duration: { rounds: 3 }, concentration: true, rollModes: { own: 1 } }),
  "glaive-rush": en => exposed(en ? "Glaive Rush — Attacked with advantage" : "Asalto Espadón — Atacado con ventaja"),
  "headlong-rush": en => retaliation(en ? "Headlong Rush — Advantage against the user" : "Arremetida — Ventaja contra el usuario"),
  "hyperspace-fury": en => exposed(en ? "Hyperspace Fury — Attacked with advantage" : "Cerco Dimensión — Atacado con ventaja"),
  "leaf-tornado": en => nextAttackDisadvantage(en ? "Leaf Tornado — Next attack at disadvantage" : "Ciclón de Hojas — Próximo ataque con desventaja", "natural-attack-15+"),
  lunge: en => nextAttackDisadvantage(en ? "Lunge — Next attack at disadvantage" : "Plancha — Próximo ataque con desventaja", "natural-attack-15+"),
  "luster-purge": en => rollModeDebuff(en ? "Luster Purge — Attacked with advantage" : "Resplandor — Atacado con ventaja", "failed-save-by-5", { against: 1 }),
  // The +1 is a plain change; own: 0 only makes the next attack consume it.
  "metal-claw": en => selfBuff(en ? "Metal Claw — Next attack +1" : "Garra Metal — Próximo ataque +1", attackChanges(1),
    { ...untilNextAttack, trigger: "natural-attack-19+", rollModes: { own: 0, nextAttack: 1 } }),
  "metal-sound": en => attackedWithBonus(en ? "Metal Sound — Attacks against it +5" : "Eco Metálico — Ataques en su contra +5"),
  "meteor-mash": en => selfBuff(en ? "Meteor Mash — Next attack with advantage" : "Puño Meteoro — Próximo ataque con ventaja", [],
    { ...untilNextAttack, trigger: "natural-attack-18+", rollModes: { own: 1, nextAttack: 1 } }),
  "mirror-shot": en => nextAttackDisadvantage(en ? "Mirror Shot — Next attack at disadvantage" : "Disparo Espejo — Próximo ataque con desventaja", "hit-and-failed-save"),
  "mist-ball": en => attacksAtDisadvantage(en ? "Mist Ball — Attacks at disadvantage" : "Bola Neblina — Ataques con desventaja", "natural-attack-11+"),
  moonblast: en => nextAttackDisadvantage(en ? "Moonblast — Next attack at disadvantage" : "Fuerza Lunar — Próximo ataque con desventaja", "natural-attack-15+"),
  "mud-bomb": en => nextAttackDisadvantage(en ? "Mud Bomb — Next attack at disadvantage" : "Bomba Fango — Próximo ataque con desventaja", "hit-and-failed-save"),
  "muddy-water": en => nextAttackDisadvantage(en ? "Muddy Water — Next attack at disadvantage" : "Agua Lodosa — Próximo ataque con desventaja", "natural-attack-15+"),
  "mystical-fire": en => attacksAtDisadvantage(en ? "Mystical Fire — Attacks at disadvantage" : "Llama Embrujada — Ataques con desventaja", "hit"),
  "night-daze": en => nextAttackDisadvantage(en ? "Night Daze — Next attack at disadvantage" : "Pulso Noche — Próximo ataque con desventaja", "natural-attack-13+"),
  "no-retreat": en => selfBuff(en ? "No Retreat — Advantage on attacks and saves" : "Bastión Final — Ventaja en ataques y salvaciones",
    saveModes(ABILITIES, 1), { rollModes: { own: 1 } }),
  overheat: en => exhausted(en ? "Overheat — Next attack at disadvantage" : "Sofoco — Próximo ataque con desventaja"),
  "play-nice": en => attacksAtDisadvantage(en ? "Play Nice — Attacks at disadvantage" : "Camaradería — Ataques con desventaja", "failed-save"),
  "psycho-boost": en => exhausted(en ? "Psycho Boost — Next attack at disadvantage" : "Psicoataque — Próximo ataque con desventaja"),
  "seed-flare": en => rollModeDebuff(en ? "Seed Flare — Attacked with advantage" : "Fulgor Semilla — Atacado con ventaja", "failed-save", { against: 1 }),
  snarl: en => rollModeDebuff(en ? "Snarl — Next attack against the user at disadvantage" : "Alarido — Próximo ataque contra el usuario con desventaja",
    "failed-save", { own: -1, vsSource: true, nextAttack: 1 }, untilNextAttack),
  "spicy-extract": en => rollModeDebuff(en ? "Spicy Extract — Attacks with and against it at advantage" : "Extracto Picante — Ventaja en sus ataques y en su contra",
    "failed-save", { own: 1, against: 1 }, { duration: { seconds: 60 } }),
  "spirit-break": en => nextAttackDisadvantage(en ? "Spirit Break — Next attack at disadvantage" : "Choque Anímico — Próximo ataque con desventaja", "hit"),
  spotlight: en => rollModeDebuff(en ? "Spotlight — Attacked with advantage" : "Foco — Atacado con ventaja", "failed-save", { against: 1 },
    { duration: { seconds: 60 }, concentration: true }),
  "sweet-scent": en => rollModeDebuff(en ? "Sweet Scent — User's next two attacks with advantage" : "Dulce Aroma — Próximos dos ataques del usuario con ventaja",
    "failed-save", { against: 1, vsSource: true, nextAttack: 2 }, untilNextAttack),
  // Like Leer, after a hit and a failed save.
  "fire-lash": en => ({ name: en ? "Fire Lash — ally attacks +1" : "Látigo Ígneo — ataques aliados +1", target: "target",
    trigger: "hit-and-failed-save", duration: { seconds: 60 }, stack: { key: "fire-lash", max: 5 }, changes: [],
    targetedAttack: { bonusPerStack: 1, alliesOnly: true, excludeSource: true } }),
  // Only its attacks against the user: read by targeted-modifier-engine.
  charm: en => ({ name: en ? "Charm — Attacks against the user -2" : "Encanto — Ataques contra el usuario -2", target: "target",
    trigger: "failed-save", duration: { seconds: 60 }, changes: [], attackVsSource: -2 }),
  "v-create": en => selfBuff(en ? "V-create — AC -2" : "V de Fuego — CA -2", [ac(-2)], untilTurnStart),
  // shortcut: freezing at speed 0 and warming up (an action) are the GM's.
  glaciate: en => combatDebuff(en ? "Glaciate — Speed -5 ft" : "Mundo Gélido — Velocidad -5 ft", "hit", 12, [speedBonus(-5)]),
  // Not automated: the GM targets the creature and applies it with the chat button, like Growth.
  decorate: en => ({ name: en ? "Decorate — Attacks with advantage" : "Decoración — Ataques con ventaja", target: "target",
    trigger: "manual", duration: { seconds: 60 }, changes: [], rollModes: { own: 1 } })
});


/* ============================================================
 * DEFINICIONES
 *
 * target:
 *
 * self   → usuario
 * target → objetivo del move
 *
 * trigger es metadata.
 * ============================================================ */

function definitionFor(
  move,
  language,
  context
) {

  switch (
    move.id
  ) {

    case "mud-slap":
      return {
        name: language === "en" ? "Mud-Slap — Attacks -1" : "Bofetón Lodo — Ataques -1",
        target: "target", trigger: "hit", duration: {},
        stack: { key: "mud-slap", max: 5 }, changes: attackChanges(-1),
        removeOnCombatEnd: true
      };


    /* ========================================================
     * GROWL
     *
     * Failed WIS save
     * -1 attacks
     * 1 minute
     * stack max -5
     * ======================================================== */

    case "growl":

      return {

        name:
          LABELS[
            language
          ].growl,

        target:
          "target",

        trigger:
          "failed-save",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "growl",

          max:
            5
        },

        changes:
          attackChanges(
            -1
          )
      };


    /* ========================================================
     * ACID SPRAY
     *
     * Hit + failed CON save
     * AC -1
     * 1 minute
     * stack max -3
     * ======================================================== */

    case "acid-spray":

      return {

        name:
          LABELS[
            language
          ].acidSpray,

        target:
          "target",

        trigger:
          "hit-and-failed-save",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "acid-spray",

          max:
            3
        },

        changes: [

          add(
            "system.attributes.ac.bonus",
            -1
          )
        ]
      };


    /* ========================================================
     * ACID ARMOR
     *
     * AC +2
     * 1 minute concentration
     *
     * El daño reactivo se automatizará después.
     * ======================================================== */

    case "acid-armor":

      return {

        name:
          LABELS[
            language
          ].acidArmor,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "acid-armor",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.ac.bonus",
            2
          )
        ],

        pending: {

          meleeRetaliation:
            true
        }
      };


    /* ========================================================
     * AGILITY
     *
     * +20 ft a cualquier movement type existente.
     * ======================================================== */

    case "agility":

      return {

        name:
          LABELS[
            language
          ].agility,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "agility",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.movement.bonus",
            20
          )
        ]
      };


    /* ========================================================
     * AMNESIA
     *
     * +2 ALL SAVES
     *
     * El usuario además olvida un move,
     * que todavía queda manual.
     * ======================================================== */

    case "amnesia":

      return {

        name:
          LABELS[
            language
          ].amnesia,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "amnesia",

          max:
            1
        },

        changes: [

          add(
            "system.bonuses.abilities.save",
            2
          )
        ],

        pending: {

          disableSelectedMove:
            true
        }
      };

    /* ============================================================
        * TAIL WHIP
        *
        * Failed WIS save:
        * allies gain +1 attacks against this target.
        *
        * Stack max +5.
        * ============================================================ */

        case "tail-whip":

        return {

            name:
                LABELS[
                    language
                ].tailWhip,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "tail-whip",
                max: 5
            },

            /*
            * No modifica directamente el Actor.
            *
            * El Targeted Modifier Engine lo leerá
            * cuando alguien ataque a este Actor.
            */

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };


        /* ============================================================
        * LEER
        * ============================================================ */

        case "leer":

        return {

            name:
                LABELS[
                    language
                ].leer,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "leer",
                max: 5
            },

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };


        /* ============================================================
        * SCREECH
        *
        * Area move.
        *
        * Failed WIS save:
        * allies gain +1 attacks against affected target.
        *
        * Stack max +3.
        * ============================================================ */

        case "screech":

        return {

            name:
                LABELS[
                    language
                ].screech,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "screech",
                max: 3
            },

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };

        /* ============================================================
        * GROWTH
        *
        * +1d4 attacks & saves
        * Lv10+ -> +1d6
        *
        * 1 minute, concentration
        * ============================================================ */

        case "growth": {

            const level =
                Number(
                    context.level ??
                    1
                );


            const die =
                level >= 10
                ? "1d6"
                : "1d4";


            return {

                name:
                `${LABELS[
                    language
                ].growth} +${die}`,

                /*
                * Poke5e permite escoger una criatura
                * en rango o al propio usuario.
                *
                * Para usarlo sobre uno mismo:
                * targetea tu propio token.
                */

                target:
                    "target",

                trigger:
                    "manual",

                duration: {
                    seconds: 60
                },

                stack: {
                    key: "growth",
                    max: 1
                },

                concentration:
                    true,

                changes: [

                    /*
                    * Todos los ataques.
                    */

                    ...attackChanges(
                        die
                    ),


                    /*
                    * Todas las salvaciones.
                    */

                    add(
                        "system.bonuses.abilities.save",
                        die
                    )
                ]
            };
        }

        /* ============================================================
        * DEFENSE CURL
        *
        * Hasta el próximo turno:
        *
        * AC +4
        * Resistance to Normal
        * ============================================================ */

        case "defense-curl":

        return {

            name:
            LABELS[
                language
            ].defenseCurl,

            target: "self",
            trigger: "self",

            /*
            * La eliminación exacta la manejará
            * nuestro Turn Engine.
            */

            duration: {},

            stack: {
                key: "defense-curl",
                max: 1
            },

            changes: [

                /*
                * +4 AC
                */

                add(
                    "system.attributes.ac.bonus",
                    4
                ),


                /*
                * Resistencia al tipo Pokémon Normal.
                *
                * "normal" ya está registrado por
                * types.mjs como damage type.
                */

                add(
                    "system.traits.dr.value",
                    "normal"
                )
            ],


            /*
            * NUEVO:
            *
            * indicar al Turn Engine que debe
            * desaparecer cuando vuelva a empezar
            * el turno de este Actor.
            */

            expireAtStartTurn: true
        };

        /* ============================================================
        * AQUA RING
        *
        * End of each turn:
        * heal PB HP.
        *
        * 1 minute, concentration.
        * ============================================================ */

        case "aqua-ring":

          return {

            name:
              LABELS[
                language
              ].aquaRing,

            target:
              "self",

            trigger:
              "self",

            duration: {
              seconds: 60
            },

            stack: {
              key:
                "aqua-ring",

              max:
                1
            },

            concentration:
              true,

            /*
            * No cambia directamente ningún
            * atributo del Actor.
            */

            changes: [],


            /* ========================================================
            * NUEVO TIPO DE EFECTO PERIÓDICO
            * ======================================================== */

            endTurnHealing: {

              formula:
                "@prof",

              source:
                "aqua-ring"
            }
          };


    /* ========================================================
     * DEFEND ORDER
     * ======================================================== */

    case "defend-order": {

      const bonus =
        defendOrderBonus(
          context.level
        );


      return {

        name:

          `${LABELS[
            language
          ].defendOrder} — AC +${bonus}`,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "defend-order",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.ac.bonus",
            bonus
          )
        ]
      };
    }


    default:

      return COMPACT_DEFINITIONS[move.id]?.(language === "en", Number(context.level ?? 1)) ?? null;
  }
}


/* ============================================================
 * BUILD EFFECT
 * ============================================================ */

function buildEffect(
  move,
  definition
) {

  return {

    _id:
      effectId(
        move.id
      ),


    name:
      definition.name,


    img:
      "icons/svg/aura.svg",


    disabled:
      false,


    transfer:
      false,


    duration:
      definition.duration,


    changes:
      definition.changes,


    flags: {

        [MODULE_ID]: {

            kind:
            "pokemon-modifier",

            sourceMove:
            move.id,

            removeOnCombatEnd: Boolean(definition.removeOnCombatEnd),

            trigger:
            definition.trigger,

            target:
            definition.target,

            concentration:
            Boolean(
                definition.concentration
            ),

            stackKey:
            definition.stack
                ?.key ??
            move.id,

            maxStacks:
            definition.stack
                ?.max ??
            1,


            /*
            * NUEVO
            *
            * El Actor tendrá UN solo Active Effect.
            */

            stackCount:
            1,


            /*
            * Efectos con maxStacks > 1 utilizarán
            * nuestro motor propio en vez del
            * aplicador nativo de D&D5e.
            */

            stackMode:

            (
                definition.stack
                ?.max ??
                1
            ) > 1

                ? "intensity"

                : "single",


            /*
            * Conservamos los cambios base.
            *
            * Growl:
            * -1
            *
            * Acid Spray:
            * -1 AC
            */

            baseChanges:
            foundry.utils.deepClone(
                definition.changes
            ),
            targetedAttack:
            definition.targetedAttack ??
            null,
            rollModes: definition.rollModes ?? null,
            attackVsSource: definition.attackVsSource ?? null,

            expireAtStartTurn:
                Boolean(
                    definition.expireAtStartTurn
                ),

            endTurnHealing:
              definition.endTurnHealing ??
              null,
            ...(
              definition.expireAtEndOfNextTurn
                ? endOfNextTurnFlags()
                : {}
            ),

            pending:
                definition.pending ??
                {}

        }
    }
  };
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export function buildMoveModifierEffects(
  move,
  language = "es",
  context = {}
) {

  const definition =
    definitionFor(
      move,
      language,
      context
    );


  if (!definition) {

    return {

      effects:
        [],

      activityEffects:
        []
    };
  }


  const effect =
    buildEffect(
      move,
      definition
    );


  const maxStacks =
  Number(
    effect.flags
      ?.[MODULE_ID]
      ?.maxStacks ??
    1
  );


// Automated moves apply themselves; dnd5e's apply button would duplicate them.
const nativeApplication =
  maxStacks <= 1 &&
  !AUTOMATED_MODIFIER_MOVES.has(move.id);


    return {

        /*
        * La plantilla SIEMPRE queda dentro
        * del Move.
        */

        effects: [
            effect
        ],


        /*
        * Solo efectos NO acumulables usan
        * el aplicador nativo D&D5e.
        *
        * Growl / Acid Spray:
        * activityEffects = []
        *
        * Agility / Acid Armor:
        * siguen usando Foundry normalmente.
        */

        activityEffects:

            nativeApplication

            ? [
                {
                    _id:
                    effect._id
                }
                ]

            : []
    };
}
