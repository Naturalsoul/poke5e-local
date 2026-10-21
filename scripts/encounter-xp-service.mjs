const FRACTION_VALUES =
  new Map([
    ["1/8", 1 / 8],
    ["1/4", 1 / 4],
    ["1/2", 1 / 2],
    ["⅛", 1 / 8],
    ["¼", 1 / 4],
    ["½", 1 / 2]
  ]);

import { pokemonPower } from "./encounter-difficulty.mjs";
import { getPokemonExperienceThreshold } from "./pokemon-experience-service.mjs";

const MODULE_ID =
  "poke5e-local";

/* ============================================================
 * EXPERIENCE RULES
 *
 * poke5e's rule (200 × Level × SR per Pokémon defeated) levels a Pokémon about once per defeat of one of its level,
 * and pays by SR, which poke5e says isn't strength: a power creep. So, by default, a pace: the encounter's XP is
 * set so that, divided among the players' Pokémon that take part, a Medium encounter gives each 1/N of a level at
 * the party's level; each rival gives its part of the encounter's strength (harder encounters give more). Optional,
 * Gen V's level scaling: weaker rivals give much less, stronger ones more. levelProgress tells what an encounter is
 * worth to one Pokémon, to plan how many fit in a route or dungeon.
 * ============================================================ */

export const XP_STYLES = Object.freeze({
  pace: "Ritmo: N encuentros Medios por nivel (contra el power creep)",
  poke5e: "Regla de poke5e: 200 × Nivel × SR"
});

export function registerEncounterXpSettings() {
  game.settings.register(MODULE_ID, "encounterXpStyle", {
    name: "Poke5e - Experiencia de encuentros",
    hint: "Cómo calcula el planificador la XP. El ritmo la ajusta para que, dividida entre los Pokémon que participan, una pelea Media dé a cada uno 1/N de nivel, sin depender del SR. La regla de poke5e da casi un nivel por Pokémon de nivel parecido derrotado.",
    scope: "world",
    config: true,
    type: String,
    choices: XP_STYLES,
    default: "pace"
  });
  game.settings.register(MODULE_ID, "encounterXpPace", {
    name: "Poke5e - Encuentros Medios por nivel",
    hint: "Con el ritmo: cuántos encuentros Medios necesita cada Pokémon que participa para subir un nivel.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 30, step: 1 },
    default: 8
  });
  game.settings.register(MODULE_ID, "encounterXpLevelScaling", {
    name: "Poke5e - XP según diferencia de nivel",
    hint: "Como en la Gen V: derrotar Pokémon de menor nivel que el grupo da mucha menos XP, y de mayor nivel, más.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

export function getEncounterXpRules() {
  try {
    return {
      style: game.settings.get(MODULE_ID, "encounterXpStyle"),
      pace: game.settings.get(MODULE_ID, "encounterXpPace"),
      scaling: game.settings.get(MODULE_ID, "encounterXpLevelScaling")
    };
  } catch {
    return { style: "pace", pace: 8, scaling: false };
  }
}

/**
 * What gaining some XP does to a Pokémon with this total: its level and progress in it (0–1) before and after, the
 * gain as a share of its current level, and how many gains like it it needs to level up.
 */
export function levelProgress(total, gained) {
  const levelAt = xp => {
    let level = 1;
    while (level < 20 && xp >= getPokemonExperienceThreshold(level + 1)) {level += 1;}
    return level;
  };
  const progressAt = xp => {
    const level = levelAt(xp);
    if (level >= 20) {return { level, progress: 1 };}
    const start = getPokemonExperienceThreshold(level);
    return { level, progress: (xp - start) / (getPokemonExperienceThreshold(level + 1) - start) };
  };
  const before = progressAt(total);
  const after = progressAt(total + gained);
  const span = before.level >= 20 ? 0 : getPokemonExperienceThreshold(before.level + 1) - getPokemonExperienceThreshold(before.level);
  return {
    before,
    after,
    share: span ? gained / span : 0,
    toLevel: span && gained > 0 ? Math.ceil((getPokemonExperienceThreshold(before.level + 1) - total) / gained) : null
  };
}

/**
 * One receiving Pokémon's share: the XP of every rival (as many as each row's quantity) divided among those taking
 * part. With level scaling, or in an optional encounter (catch-up XP), each rival's part is scaled against the
 * receiver's own level, so the party's weaker Pokémon get more and the strongest less.
 */
export function encounterShare(rows, receiverLevel, participants, { context = null, optional = false } = {}) {
  const scaled = optional || context?.scaling;
  const total = rows.reduce((sum, row) => sum +
    calculatePokemonEncounterXp({ level: row.level, sr: row.sr, context: context && { ...context, scaling: false } }).defeated *
    (scaled ? levelScaling(row.level, receiverLevel) : 1) * row.quantity, 0);
  return Math.round(total / Math.max(1, participants));
}

// Gen V's level factor: ((2 × rival + 10) ÷ (rival + party + 10))^2.5. Two levels below at 10 is ×0.83; five, ×0.57.
export function levelScaling(level, partyLevel) {
  return ((2 * level + 10) / (level + partyLevel + 10)) ** 2.5;
}

/**
 * @param {{ level: number, sr: any, context?: { style: string, pace: number, scaling: boolean, partyLevel: number,
 *   participants: number, partyPower: number, multiplier: number } }} options  without a context, poke5e's rule
 */
export function calculatePokemonEncounterXp({
  level,
  sr,
  context = null
}) {
  const normalizedLevel =
    clampInteger(
      level,
      1,
      20,
      1
    );

  const normalizedSr =
    parseSpeciesRating(
      sr
    );

  const base =
    context?.style ===
      "pace"
      ? (
          getPokemonExperienceThreshold(context.partyLevel + 1) -
          getPokemonExperienceThreshold(context.partyLevel)
        ) /
        Math.max(1, context.pace) *
        Math.max(1, context.participants) *
        pokemonPower(normalizedLevel) *
        context.multiplier /
        Math.max(1, context.partyPower)
      : 200 *
        normalizedLevel *
        normalizedSr;

  const defeated =
    Math.round(
      base *
      (
        context?.scaling
          ? levelScaling(
              normalizedLevel,
              context.partyLevel
            )
          : 1
      )
    );

  return {
    defeated,

    captured:
      Math.round(
        defeated / 5
      )
  };
}

export function parseSpeciesRating(
  value
) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  ) {
    return value;
  }

  const text =
    String(
      value ?? ""
    ).trim();

  if (
    FRACTION_VALUES.has(
      text
    )
  ) {
    return FRACTION_VALUES.get(
      text
    );
  }

  const fraction =
    text.match(
      /^(\d+)\s*\/\s*(\d+)$/
    );

  if (fraction) {
    const numerator =
      Number(
        fraction[1]
      );

    const denominator =
      Number(
        fraction[2]
      );

    if (denominator > 0) {
      return (
        numerator /
        denominator
      );
    }
  }

  const numeric =
    Number(text);

  if (
    Number.isFinite(
      numeric
    ) &&
    numeric >= 0
  ) {
    return numeric;
  }

  throw new Error(
    `SR Pokémon inválido: ${String(value)}`
  );
}

function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.trunc(
        numeric
      )
    )
  );
}