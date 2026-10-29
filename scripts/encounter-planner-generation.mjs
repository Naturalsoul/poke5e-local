import { clampInteger } from "./numbers.mjs";
import { DIFFICULTIES, encounterDifficulty, generateForDifficulty } from "./encounter-difficulty.mjs";
import { generateRandomEncounterRows } from "./encounter-randomizer.mjs";
import { generateRandomTrainerEncounter, rerollRandomTrainerTeam } from "./encounter-trainer-randomizer.mjs";
import { getTrainerArchetype, getTrainerArchetypeLabel } from "./encounter-trainer-archetypes.mjs";
import { getTrainerLevelRule } from "./trainer-rules.mjs";
import {
  MIXED_TRAINER_ARCHETYPE_ID,
  countTrainerRowQuantity,
  getPlannerItemPolicy,
  normalizeOptionalCanonicalId,
  normalizeTrainerTeamSize
} from "./encounter-planner-data.mjs";

// The trainer rivals' extras: +1/+2 to their scores, a super effective Move, an item or berry each.
export function plannerBoosts(state) {
  return {
    statBonus: Number(state.boostStats) || 0,
    coverage: state.boostCoverage === true,
    items: state.boostItems === true,
    bestMoves: state.boostBestMoves === true,
    tmMoves: state.boostTmMoves === true
  };
}

export function trainerCandidatePool(state, maxLevel) {
  return { region: state.trainerRandomRegion, maxLevel, minSr: null, maxSr: getTrainerLevelRule(maxLevel).maxSr };
}

/**
 * Rolls rival trainers for the planner's rank and keeps the roll closest to the rank's target difficulty.
 * `missedTarget` is set when no roll reached it. Throws when no species fit the trainers.
 */
export function rollTrainerEncounter({ state, party, rank, levels, boosts, candidates, pokemonTypes }) {
  const pick = ([min, max]) => min + Math.floor(Math.random() * (max - min + 1));
  // "auto" takes the rank's range; otherwise the number chosen.
  const chosen = (value, range) => (value === "auto" ? pick(range) : clampInteger(value, 1, 6, 1));
  let failure = null;

  // One roll: team, Pokémon on the field and (for Gym Leaders and the Elite Four) one type for every trainer.
  const roll = trainerCount => {
    const options = {
      trainerCount,
      pokemonPerTrainer: String(chosen(state.trainerRandomPokemonCount, rank.team)),
      minLevel: levels.min,
      maxLevel: levels.max,
      archetypeId: state.trainerRandomArchetype,
      archetypeIds: state.trainerRandomArchetype === MIXED_TRAINER_ARCHETYPE_ID ? state.trainerRandomMixedArchetypes : []
    };
    const typed = rank.monotype ? monotypePool(candidates, Number(options.pokemonPerTrainer)) : candidates;
    let generated;
    try {
      generated = generateRandomTrainerEncounter({ ...options, candidates: typed });
    } catch (error) {
      failure = error;
      if (typed === candidates) {
        return [];
      }
      try {
        generated = generateRandomTrainerEncounter({ ...options, candidates });
      } catch (fallbackError) {
        failure = fallbackError;
        return [];
      }
    }
    const onField = chosen(state.trainerRandomOnField, rank.onField);
    return generated.map((trainer, trainerIndex) => withAce(
      { ...trainer, onField: Math.min(onField, trainer.pokemon.length) },
      // The boss's ace only: the others are their gym helpers.
      trainerIndex === 0 ? levels.ace : null,
      pick
    ));
  };

  const measure = generated => encounterDifficulty(
    party,
    generated.flatMap(trainer => trainer.pokemon.map(pokemon => ({ ...pokemon, types: pokemonTypes(pokemon.pokemonId) }))),
    { boosts, onField: Math.max(1, generated.reduce((total, trainer) => total + trainer.onField, 0)) }
  );

  // Fewest trainers first: helpers join only when the rival alone can't reach the rank's difficulty.
  const trainerCounts = state.trainerRandomCount === "auto"
    ? Array.from({ length: rank.trainers[1] - rank.trainers[0] + 1 }, (_, index) => rank.trainers[0] + index)
    : [chosen(state.trainerRandomCount, rank.trainers)];
  let best = null;
  for (const trainerCount of trainerCounts) {
    const attempt = generateForDifficulty(() => roll(trainerCount), measure, rank.target, 100);
    if (!best || attempt.distance < best.distance) {
      best = attempt;
    }
    if (best.distance === 0) {
      break;
    }
  }

  if (!best.result.length) {
    throw failure ?? new Error("No hay especies compatibles para estos Entrenadores.");
  }
  const missedTarget = best.distance > 0
    ? { wanted: DIFFICULTIES.find(entry => entry.id === rank.target)?.label, reached: best.tier.label }
    : null;
  return { generatedTrainers: best.result, missedTarget };
}

// Names count up per archetype ("Rocket Grunt 1", "Rocket Grunt 2"); ids come from the planner's sequences.
export function buildTrainerRoster({ generatedTrainers, teamSize, language, nextTrainerId, nextRowId }) {
  const trainers = [];
  const rows = [];
  const archetypeCounters = new Map();
  for (const generatedTrainer of generatedTrainers) {
    const trainerId = nextTrainerId();
    const archetype = getTrainerArchetype(generatedTrainer.archetypeId);
    const archetypeCount = (archetypeCounters.get(archetype.id) ?? 0) + 1;
    archetypeCounters.set(archetype.id, archetypeCount);
    trainers.push({
      id: trainerId,
      name: `${getTrainerArchetypeLabel(archetype, language)} ${archetypeCount}`,
      archetypeId: archetype.id,
      teamSize: normalizeTrainerTeamSize(teamSize),
      onField: generatedTrainer.onField
    });
    for (const pokemon of generatedTrainer.pokemon) {
      rows.push({ id: nextRowId(), trainerId, ...pokemon, abilityId: null, itemId: null, itemResolved: false });
    }
  }
  return { trainers, rows };
}

// Locked rows survive the reroll with the Ability and item they had.
export function rollWildEncounterRows({ state, candidates, party, minLevel, maxLevel, nextRowId }) {
  const lockedRows = state.rows.filter(row => row.locked === true);
  const lockedById = new Map(lockedRows.map(row => [buildEncounterRowAbilityKey(row), {
    abilityId: normalizeOptionalCanonicalId(row.abilityId),
    itemId: normalizeOptionalCanonicalId(row.itemId),
    itemResolved: row.itemResolved === true || Boolean(row.itemId)
  }]));
  const options = { candidates, minLevel, maxLevel, size: state.randomSize, lockedRows };
  const generatedRows = rollForDifficulty(
    () => generateRandomEncounterRows(options),
    rows => encounterDifficulty(party, rows),
    state.randomDifficulty,
    "Prueba otro rango de niveles o tamaño."
  );
  return generatedRows.map(row => {
    const kept = row.locked === true ? lockedById.get(buildEncounterRowAbilityKey(row)) : null;
    return {
      id: nextRowId(),
      trainerId: null,
      ...row,
      abilityId: kept?.abilityId ?? null,
      itemId: kept?.itemId ?? null,
      itemResolved: kept?.itemResolved === true
    };
  });
}

// A reroll keeps the team's strength: its levels, or the party's when it has none.
export function trainerTeamLevels(rows, trainerId, partyLevel) {
  const levels = rows.filter(row => row.trainerId === trainerId).map(row => clampInteger(row.level, 1, 20, 1));
  const maxLevel = levels.length ? Math.max(...levels) : partyLevel;
  return { minLevel: levels.length ? Math.min(...levels) : Math.max(1, maxLevel - 3), maxLevel };
}

// Rerolls a trainer's unlocked slots; `rows` is the whole encounter with the new team in the old team's place.
export function rerollTrainerTeamRows({ trainer, rows, candidates, minLevel, maxLevel, nextRowId }) {
  const currentRows = rows.filter(row => row.trainerId === trainer.id);
  const lockedRows = currentRows.filter(row => row.locked === true);
  const result = rerollRandomTrainerTeam({
    candidates,
    lockedPokemon: lockedRows.map(row => ({ pokemonId: row.pokemonId, quantity: row.quantity, ace: row.ace === true })),
    currentTeamSize: countTrainerRowQuantity(currentRows),
    pokemonPerTrainer: normalizeTrainerTeamSize(trainer.teamSize),
    minLevel,
    maxLevel,
    archetypeId: getTrainerArchetype(trainer.archetypeId).id
  });
  const generatedRows = result.pokemon.map(pokemon => ({
    id: nextRowId(), trainerId: trainer.id, ...pokemon, abilityId: null, itemId: null, itemResolved: false
  }));
  return {
    generatedRows,
    lockedCount: countTrainerRowQuantity(lockedRows),
    rows: generatedRows.length
      ? replaceTrainerRows(rows, trainer.id, mergeTrainerRerollRows(currentRows, generatedRows))
      : rows
  };
}

export function replaceTrainerRows(rows, trainerId, replacement) {
  const nextRows = [];
  let inserted = false;
  for (const row of rows) {
    if (row.trainerId !== trainerId) {
      nextRows.push(row);
    } else if (!inserted) {
      nextRows.push(...replacement);
      inserted = true;
    }
  }
  if (!inserted) {
    nextRows.push(...replacement);
  }
  return nextRows;
}

// Options for EncounterGenerationService.generate from the planner's rerolls, item policy and boosts.
export function buildGenerationOptions(state) {
  const boosts = plannerBoosts(state);
  return {
    rerollMoves: state.rerollMoves,
    rerollAbilities: state.rerollAbilities,
    allowHiddenAbilities: state.allowHiddenAbilities,
    hiddenAbilityChancePercent: state.hiddenAbilityChancePercent,
    rerollItems: state.rerollItems,
    itemPolicy: getPlannerItemPolicy(state),
    boosts: {
      statBonus: boosts.statBonus,
      coverageTypes: boosts.coverage ? state.partyWeakTo ?? [] : [],
      guaranteedItems: boosts.items,
      bestMoves: boosts.bestMoves,
      tmMoves: boosts.tmMoves
    }
  };
}

// One random roll, or (with a difficulty) the closest of many to it, warning when the filters can't reach it.
export function rollForDifficulty(
  generate,
  measure,
  difficulty,
  advice
) {
  if (!difficulty) {
    return generate();
  }

  const best =
    generateForDifficulty(
      generate,
      measure,
      difficulty
    );

  if (best.distance > 0) {
    const wanted =
      DIFFICULTIES.find(
        entry =>
          entry.id ===
            difficulty
      )?.label;

    ui.notifications.warn(
      `Con estos filtros no se llega a ${wanted}: queda ${best.tier.label}. ${advice}`
    );
  }

  return best.result;
}

// The trainer's ace, at the rank's ace level: the one the archetype chose, or else its last Pokémon.
export function withAce(
  trainer,
  aceLevels,
  pick
) {
  if (!aceLevels) {
    return trainer;
  }

  const marked =
    trainer.pokemon.findIndex(
      pokemon =>
        pokemon.ace
    );

  const aceIndex =
    marked >= 0
      ? marked
      : trainer.pokemon.length - 1;

  return {
    ...trainer,
    pokemon:
      trainer.pokemon.map(
        (
          pokemon,
          index
        ) =>
          index ===
            aceIndex
            ? {
                ...pokemon,
                level:
                  pick(
                    aceLevels
                  ),
                ace:
                  true
              }
            : pokemon
      )
  };
}

// Candidates of one type with enough species for a team: a random one of those types, or all when none has.
export function monotypePool(
  candidates,
  teamSize
) {
  const counts =
    new Map();

  for (const pokemon of candidates) {
    for (const type of pokemon.types ?? []) {
      counts.set(
        type,
        (counts.get(type) ?? 0) + 1
      );
    }
  }

  const types =
    [
      ...counts
    ]
      .filter(
        ([, count]) =>
          count >=
            teamSize
      )
      .map(
        ([type]) =>
          type
      );

  if (!types.length) {
    return candidates;
  }

  const type =
    types[
      Math.floor(
        Math.random() *
        types.length
      )
    ];

  return candidates.filter(
    pokemon =>
      (pokemon.types ?? [])
        .includes(
          type
        )
  );
}

export function mergeTrainerRerollRows(
  currentRows,
  generatedRows
) {
  const merged =
    [];


  let generatedIndex =
    0;


  for (
    const row
    of currentRows ??
    []
  ) {
    if (
      row.locked ===
        true
    ) {
      merged.push(
        row
      );

      continue;
    }


    if (
      generatedIndex <
        generatedRows.length
    ) {
      merged.push(
        generatedRows[
          generatedIndex
        ]
      );

      generatedIndex +=
        1;
    }
  }


  if (
    generatedIndex <
      generatedRows.length
  ) {
    merged.push(
      ...generatedRows.slice(
        generatedIndex
      )
    );
  }


  return merged;
}

export function buildEncounterRowAbilityKey(
  row
) {
  return (
    `${String(
      row?.pokemonId ??
      ""
    )}@${clampInteger(
      row?.level,
      1,
      20,
      1
    )}`
  );
}
