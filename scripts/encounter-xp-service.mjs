const FRACTION_VALUES =
  new Map([
    ["1/8", 1 / 8],
    ["1/4", 1 / 4],
    ["1/2", 1 / 2],
    ["⅛", 1 / 8],
    ["¼", 1 / 4],
    ["½", 1 / 2]
  ]);

import { getPokemonExperienceThreshold } from "./pokemon-experience-service.mjs";

const MODULE_ID =
  "poke5e-local";

/* ============================================================
 * EXPERIENCE RULES
 *
 * poke5e's rule as written: 200 × Level × SR per Pokémon defeated (a fifth if captured), the encounter's total
 * divided among the players' Pokémon that took part. Power creep is held by the trainer level cap instead
 * (pokemon-experience-service.mjs). Optional, Gen V's level scaling: weaker rivals give much less, stronger ones
 * more. levelProgress tells what an encounter is worth to one Pokémon, to plan how many fit in a route or dungeon.
 * ============================================================ */

// An open planner shows the new XP at once.
const refreshPlanners = () => {
  for (const app of foundry.applications.instances?.values?.() ?? []) {
    if (app.constructor?.name === "PokemonEncounterPlanner") {app.render();}
  }
};

export function registerEncounterXpSettings() {
  const { BooleanField } = foundry.data.fields;
  game.settings.register(MODULE_ID, "encounterXpLevelScaling", {
    name: "Poke5e - Experiencia según la diferencia de nivel",
    hint: "Como en la quinta generación: derrotar a Pokémon de menor nivel que el grupo da mucha menos experiencia, y a Pokémon de mayor nivel, más.",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: false }),
    default: false,
    onChange: refreshPlanners
  });
  game.settings.register(MODULE_ID, "encounterXpExpShareTrainerOnly", {
    name: "Poke5e - Repartir Experiencia: regla casera",
    hint: "El Pokémon con Repartir Experiencia, aunque no combata, cuenta como un participante más: la experiencia se divide también con él, sin sumar de más. Desactivada: entre todos los participantes del combate. Activada: solo entre los Pokémon de su mismo Entrenador.",
    scope: "world",
    config: true,
    type: new BooleanField({ initial: false }),
    default: false
  });
}

export function getEncounterXpRules() {
  try {
    return {
      scaling: game.settings.get(MODULE_ID, "encounterXpLevelScaling"),
      expShareTrainerOnly: game.settings.get(MODULE_ID, "encounterXpExpShareTrainerOnly")
    };
  } catch {
    return { scaling: false, expShareTrainerOnly: false };
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
 * part. With level scaling, each rival's part is scaled against the
 * receiver's own level, so the party's weaker Pokémon get more and the strongest less.
 */
export function encounterShare(rows, receiverLevel, participants, { context = null } = {}) {
  const scaled = context?.scaling;
  const total = rows.reduce((sum, row) => sum +
    calculatePokemonEncounterXp({ level: row.level, sr: row.sr, context: context && { ...context, scaling: false } }).defeated *
    (scaled ? levelScaling(row.level, receiverLevel) : 1) * row.quantity, 0);
  return Math.round(total / Math.max(1, participants));
}

/**
 * Exp. Share, house rule: a holder that didn't fight shares its trainer's Pokémon's XP evenly with them, as one
 * more participant (so nothing is added: 600 + 400 among three is 333 each). Without the house rule it's just
 * one more participant in the whole split, which the caller does with the participant count.
 *
 * @param {{ trainer: string, xp: number, holder?: boolean }[]} shares  fighters, and holders that didn't fight
 * @returns {number[]} each share's XP, in order
 */
export function poolExpShare(shares) {
  const xps = shares.map(share => share.xp);
  for (const trainer of new Set(shares.filter(share => share.holder).map(share => share.trainer))) {
    const team = shares.map((share, index) => ({ share, index })).filter(({ share }) => share.trainer === trainer);
    const pool = team.filter(({ share }) => !share.holder).reduce((sum, { share }) => sum + share.xp, 0);
    for (const { index } of team) {xps[index] = Math.floor(pool / team.length);}
  }
  return xps;
}

// Gen V's level factor: ((2 × rival + 10) ÷ (rival + party + 10))^2.5. Two levels below at 10 is ×0.83; five, ×0.57.
export function levelScaling(level, partyLevel) {
  return ((2 * level + 10) / (level + partyLevel + 10)) ** 2.5;
}

/**
 * @param {{ level: number, sr: any, context?: { scaling: boolean, partyLevel: number } }} options
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
    200 *
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