import {
  getTrainerArchetype
} from "./encounter-trainer-archetypes.mjs";

import {
  selectTrainerArchetypePokemon
} from "./encounter-trainer-archetype-selector.mjs";


export function generateRandomTrainerEncounter({
  candidates,
  trainerCount = 1,
  pokemonPerTrainer = "auto",
  minLevel,
  maxLevel,
  archetypeId = "generic",
  archetypeIds = [],
  random = Math.random
}) {
  const pool =
    normalizeCandidates(
      candidates
    );


  const archetypes =
    resolveTrainerArchetypes({
      archetypeId,
      archetypeIds
    });


  const normalizedTrainerCount =
    clampInteger(
      trainerCount,
      1,
      6,
      1
    );


  const minimumLevel =
    clampInteger(
      minLevel,
      1,
      20,
      1
    );


  const maximumLevel =
    clampInteger(
      maxLevel,
      minimumLevel,
      20,
      minimumLevel
    );


  const eligible =
    pool.filter(
      pokemon =>
        getPokemonMinimumLevel(
          pokemon
        ) <=
          maximumLevel
    );


  const requiredMinimum =
    getRequiredMinimumTeamSizeForArchetypes(
      pokemonPerTrainer,
      archetypes
    );


  if (
    eligible.length <
      requiredMinimum
  ) {
    throw new Error(
      "No hay suficientes especies compatibles para completar el equipo de cada Entrenador."
    );
  }


  const allocatedArchetypes =
    allocateTrainerArchetypes(
      archetypes,
      normalizedTrainerCount,
      random
    );


  return allocatedArchetypes.map(
    archetype => {
      const teamSize =
        resolveTrainerTeamSize({
          requested:
            pokemonPerTrainer,

          archetype,

          availableCount:
            eligible.length,

          random
        });


      return {
        archetypeId:
          archetype.id,

        pokemon:
          buildTrainerPokemon({
            candidates:
              eligible,

            count:
              teamSize,

            minLevel:
              minimumLevel,

            maxLevel:
              maximumLevel,

            archetype,
            random
          })
      };
    }
  );
}

export function rerollRandomTrainerTeam({
  candidates,
  lockedPokemon = [],
  currentTeamSize = 0,
  pokemonPerTrainer = "auto",
  minLevel,
  maxLevel,
  archetypeId = "generic",
  random = Math.random
}) {
  const pool =
    normalizeCandidates(
      candidates
    );


  const archetype =
    getTrainerArchetype(
      archetypeId
    );


  const minimumLevel =
    clampInteger(
      minLevel,
      1,
      20,
      1
    );


  const maximumLevel =
    clampInteger(
      maxLevel,
      minimumLevel,
      20,
      minimumLevel
    );


  const locked =
    normalizeLockedPokemon(
      lockedPokemon
    );


  const lockedCount =
    countPokemonQuantity(
      locked
    );


  const lockedPokemonIds =
    new Set(
      locked.map(
        pokemon =>
          pokemon.pokemonId
      )
    );


  const eligible =
    pool.filter(
      pokemon =>
        getPokemonMinimumLevel(
          pokemon
        ) <=
          maximumLevel &&

        !lockedPokemonIds.has(
          String(
            pokemon.id
          )
        )
    );


  const targetTeamSize =
    resolveRerollTargetTeamSize({
      requested:
        pokemonPerTrainer,

      archetype,

      currentTeamSize,
      lockedCount,

      availableCount:
        eligible.length,

      random
    });


  const missingCount =
    targetTeamSize -
    lockedCount;


  if (
    missingCount <=
      0
  ) {
    return {
      archetypeId:
        archetype.id,

      targetTeamSize,

      pokemon: []
    };
  }


  if (
    eligible.length <
      missingCount
  ) {
    throw new Error(
      "No hay suficientes especies compatibles para completar los cupos no bloqueados del Entrenador."
    );
  }


  const hasLockedAce =
    locked.some(
      pokemon =>
        pokemon.ace ===
          true
    );


  return {
    archetypeId:
      archetype.id,

    targetTeamSize,

    pokemon:
      buildTrainerPokemon({
        candidates:
          eligible,

        count:
          missingCount,

        minLevel:
          minimumLevel,

        maxLevel:
          maximumLevel,

        archetype,

        assignAce:
          archetype.ace &&
          !hasLockedAce,

        random
      })
  };
}

function resolveTrainerArchetypes({
  archetypeId,
  archetypeIds
}) {
  const requestedIds =
    Array.isArray(
      archetypeIds
    ) &&
    archetypeIds.length
      ? archetypeIds
      : [
          archetypeId
        ];


  const seen =
    new Set();


  const resolved =
    [];


  for (
    const requestedId
    of requestedIds
  ) {
    const normalizedId =
      String(
        requestedId ??
        ""
      ).trim();


    if (!normalizedId) {
      continue;
    }


    const archetype =
      getTrainerArchetype(
        normalizedId
      );


    if (
      !archetype ||
      seen.has(
        archetype.id
      )
    ) {
      continue;
    }


    seen.add(
      archetype.id
    );


    resolved.push(
      archetype
    );
  }


  if (
    resolved.length
  ) {
    return resolved;
  }


  return [
    getTrainerArchetype(
      "generic"
    )
  ];
}


function allocateTrainerArchetypes(
  archetypes,
  trainerCount,
  random
) {
  const allocated =
    [];


  while (
    allocated.length <
      trainerCount
  ) {
    const cycle =
      shuffleValues(
        archetypes,
        random
      );


    const remaining =
      trainerCount -
      allocated.length;


    allocated.push(
      ...cycle.slice(
        0,
        remaining
      )
    );
  }


  return allocated;
}


function shuffleValues(
  values,
  random
) {
  const copy = [
    ...values
  ];


  for (
    let index =
      copy.length - 1;
    index > 0;
    index -= 1
  ) {
    const target =
      Math.floor(
        normalizeRandom(
          random
        ) *
        (
          index + 1
        )
      );


    [
      copy[index],
      copy[target]
    ] = [
      copy[target],
      copy[index]
    ];
  }


  return copy;
}


function getRequiredMinimumTeamSizeForArchetypes(
  requested,
  archetypes
) {
  if (
    String(
      requested ??
      ""
    ) !==
      "auto"
  ) {
    return clampInteger(
      requested,
      1,
      6,
      3
    );
  }


  return Math.max(
    1,

    ...archetypes.map(
      archetype =>
        clampInteger(
          archetype.teamSize?.min,
          1,
          6,
          1
        )
    )
  );
}


function buildTrainerPokemon({
  candidates,
  count,
  minLevel,
  maxLevel,
  archetype,
  assignAce = archetype.ace,
  random
}) {
  const selected =
    selectTrainerArchetypePokemon({
      candidates,
      count,
      archetype,
      random
    });


  const aceIndex =
    assignAce &&
    selected.length
      ? selected.length - 1
      : -1;


  return selected.map(
    (
      pokemon,
      index
    ) => {
      const speciesMinimum =
        getPokemonMinimumLevel(
          pokemon
        );


      const levelMinimum =
        Math.max(
          minLevel,
          speciesMinimum
        );


      const isAce =
        index ===
          aceIndex;


      const level =
        isAce
          ? maxLevel
          : randomBiasedLevel({
              min:
                levelMinimum,

              max:
                maxLevel,

              bias:
                archetype.levelBias,

              random
            });


      return {
        pokemonId:
          String(
            pokemon.id
          ),

        level,

        quantity:
          1,

        defeated:
          0,

        captured:
          0,

        moveIds:
          [],

        locked:
          false,

        ace:
          isAce
      };
    }
  );
}


function resolveTrainerTeamSize({
  requested,
  archetype,
  availableCount,
  random
}) {
  if (
    String(
      requested ??
      ""
    ) ===
      "auto"
  ) {
    const minimum =
      clampInteger(
        archetype.teamSize?.min,
        1,
        6,
        1
      );


    const maximum =
      Math.min(
        availableCount,

        clampInteger(
          archetype.teamSize?.max,
          minimum,
          6,
          minimum
        )
      );


    if (
      maximum <
        minimum
    ) {
      throw new Error(
        "No hay suficientes especies compatibles para el tamaño automático del arquetipo."
      );
    }


    return randomInteger(
      minimum,
      maximum,
      random
    );
  }


  const manual =
    clampInteger(
      requested,
      1,
      6,
      3
    );


  if (
    manual >
      availableCount
  ) {
    throw new Error(
      "No hay suficientes especies compatibles para completar el equipo de cada Entrenador."
    );
  }


  return manual;
}

function resolveRerollTargetTeamSize({
  requested,
  archetype,
  currentTeamSize,
  lockedCount,
  availableCount,
  random
}) {
  const maximumAvailable =
    lockedCount +
    availableCount;


  if (
    String(
      requested ??
      ""
    ) !==
      "auto"
  ) {
    const manual =
      clampInteger(
        requested,
        1,
        6,
        3
      );


    if (
      lockedCount >
        manual
    ) {
      throw new Error(
        `Hay ${lockedCount} Pokémon bloqueados, pero el tamaño solicitado del equipo es ${manual}.`
      );
    }


    if (
      manual >
        maximumAvailable
    ) {
      throw new Error(
        "No hay suficientes especies compatibles para completar los cupos no bloqueados del Entrenador."
      );
    }


    return manual;
  }


  const minimum =
    clampInteger(
      archetype.teamSize?.min,
      1,
      6,
      1
    );


  const archetypeMaximum =
    clampInteger(
      archetype.teamSize?.max,
      minimum,
      6,
      minimum
    );


  if (
    lockedCount >
      archetypeMaximum
  ) {
    throw new Error(
      `Hay ${lockedCount} Pokémon bloqueados, pero el arquetipo admite un máximo automático de ${archetypeMaximum}.`
    );
  }


  const normalizedCurrentSize =
    clampInteger(
      currentTeamSize,
      0,
      6,
      0
    );


  if (
    normalizedCurrentSize >
      0
  ) {
    const target =
      Math.min(
        archetypeMaximum,

        Math.max(
          minimum,
          normalizedCurrentSize,
          lockedCount
        )
      );


    if (
      target >
        maximumAvailable
    ) {
      throw new Error(
        "No hay suficientes especies compatibles para completar los cupos no bloqueados del Entrenador."
      );
    }


    return target;
  }


  const maximum =
    Math.min(
      archetypeMaximum,
      maximumAvailable
    );


  const effectiveMinimum =
    Math.max(
      minimum,
      lockedCount
    );


  if (
    maximum <
      effectiveMinimum
  ) {
    throw new Error(
      "No hay suficientes especies compatibles para el tamaño automático del arquetipo."
    );
  }


  return randomInteger(
    effectiveMinimum,
    maximum,
    random
  );
}

function normalizeLockedPokemon(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return value
    .map(
      pokemon => ({
        pokemonId:
          String(
            pokemon?.pokemonId ??
            ""
          ).trim(),

        quantity:
          clampInteger(
            pokemon?.quantity,
            1,
            999,
            1
          ),

        ace:
          pokemon?.ace ===
            true
      })
    )
    .filter(
      pokemon =>
        Boolean(
          pokemon.pokemonId
        )
    );
}


function countPokemonQuantity(
  pokemon
) {
  return pokemon.reduce(
    (
      total,
      entry
    ) =>
      total +
      entry.quantity,
    0
  );
}

function randomBiasedLevel({
  min,
  max,
  bias,
  random
}) {
  const first =
    randomInteger(
      min,
      max,
      random
    );


  if (
    bias ===
      "low"
  ) {
    return Math.min(
      first,

      randomInteger(
        min,
        max,
        random
      )
    );
  }


  if (
    bias ===
      "high"
  ) {
    return Math.max(
      first,

      randomInteger(
        min,
        max,
        random
      )
    );
  }


  return first;
}


function normalizeCandidates(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  const seen =
    new Set();


  return value.filter(
    pokemon => {
      const id =
        String(
          pokemon?.id ??
          ""
        ).trim();


      if (
        !id ||
        seen.has(
          id
        )
      ) {
        return false;
      }


      seen.add(
        id
      );


      return true;
    }
  );
}


function randomInteger(
  min,
  max,
  random
) {
  if (
    max <= min
  ) {
    return min;
  }


  return (
    min +
    Math.floor(
      normalizeRandom(
        random
      ) *
      (
        max -
        min +
        1
      )
    )
  );
}


function normalizeRandom(
  random
) {
  const value =
    Number(
      random()
    );


  if (
    !Number.isFinite(
      value
    )
  ) {
    return 0;
  }


  return Math.min(
    0.999999999999,
    Math.max(
      0,
      value
    )
  );
}


function getPokemonMinimumLevel(
  pokemon
) {
  return clampInteger(
    pokemon?.minimumLevel,
    1,
    20,
    1
  );
}


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(
      value
    );


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