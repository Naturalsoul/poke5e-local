export const RANDOM_ENCOUNTER_SIZES = Object.freeze({
  small: Object.freeze({
    speciesMin: 1,
    speciesMax: 2,
    totalMin: 1,
    totalMax: 3
  }),

  normal: Object.freeze({
    speciesMin: 2,
    speciesMax: 3,
    totalMin: 3,
    totalMax: 5
  }),

  large: Object.freeze({
    speciesMin: 3,
    speciesMax: 4,
    totalMin: 5,
    totalMax: 8
  })
});


export function generateRandomEncounterRows({
  candidates,
  minLevel,
  maxLevel,
  size = "normal",
  lockedRows = [],
  random = Math.random
}) {
  const pool =
    normalizeCandidates(
      candidates
    );


  const preserved =
    normalizeLockedRows(
      lockedRows
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


  if (
    maximumLevel <
    minimumLevel
  ) {
    throw new Error(
      "El nivel máximo no puede ser menor que el nivel mínimo."
    );
  }


  const preset =
    RANDOM_ENCOUNTER_SIZES[
      size
    ] ??
    RANDOM_ENCOUNTER_SIZES.normal;


  const lockedPokemonIds =
    new Set(
      preserved.map(
        row =>
          row.pokemonId
      )
    );


  const eligible =
    pool.filter(
      pokemon =>
        !lockedPokemonIds.has(
          String(
            pokemon.id
          )
        ) &&
        getPokemonMinimumLevel(
          pokemon
        ) <=
          maximumLevel
    );


  const lockedSpeciesCount =
    lockedPokemonIds.size;


  const minimumSpecies =
    Math.max(
      preset.speciesMin,
      lockedSpeciesCount
    );


  const maximumSpecies =
    Math.max(
      minimumSpecies,
      Math.min(
        preset.speciesMax,
        lockedSpeciesCount +
          eligible.length
      )
    );


  if (
    lockedSpeciesCount +
      eligible.length <
    minimumSpecies
  ) {
    throw new Error(
      "No hay suficientes especies compatibles con los filtros seleccionados."
    );
  }


  const speciesCount =
    randomInteger(
      minimumSpecies,
      maximumSpecies,
      random
    );


  const newSpeciesCount =
    Math.max(
      0,
      speciesCount -
        lockedSpeciesCount
    );


  if (
    newSpeciesCount === 0
  ) {
    return preserved;
  }


  const selected =
    sampleWithoutReplacement(
      eligible,
      newSpeciesCount,
      random
    );


  const lockedQuantity =
    preserved.reduce(
      (
        total,
        row
      ) =>
        total +
        row.quantity,
      0
    );


  const totalMin =
    Math.max(
      preset.totalMin,
      lockedQuantity +
        newSpeciesCount
    );


  const totalMax =
    Math.max(
      totalMin,
      preset.totalMax
    );


  const totalQuantity =
    randomInteger(
      totalMin,
      totalMax,
      random
    );


  const generatedQuantity =
    totalQuantity -
    lockedQuantity;


  const quantities =
    allocateQuantities(
      newSpeciesCount,
      generatedQuantity,
      random
    );


  const generated =
    selected.map(
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
            minimumLevel,
            speciesMinimum
          );


        const level =
          randomInteger(
            levelMinimum,
            maximumLevel,
            random
          );


        return {
          pokemonId:
            String(
              pokemon.id
            ),

          level,

          quantity:
            quantities[index],

          defeated:
            0,

          captured:
            0,

          moveIds:
            [],

          locked:
            false
        };
      }
    );


  return [
    ...preserved,
    ...generated
  ];
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


function normalizeLockedRows(
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
      row => {
        const pokemonId =
          String(
            row?.pokemonId ??
            ""
          ).trim();


        if (!pokemonId) {
          return null;
        }


        const quantity =
          clampInteger(
            row?.quantity,
            1,
            999,
            1
          );


        const defeated =
          clampInteger(
            row?.defeated,
            0,
            quantity,
            0
          );


        const captured =
          clampInteger(
            row?.captured,
            0,
            Math.max(
              0,
              quantity -
                defeated
            ),
            0
          );


        return {
          pokemonId,

          level:
            clampInteger(
              row?.level,
              1,
              20,
              1
            ),

          quantity,
          defeated,
          captured,

          moveIds:
            normalizeStringArray(
              row?.moveIds
            ),

          locked:
            true
        };
      }
    )
    .filter(Boolean);
}


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return [
    ...new Set(
      value
        .map(
          entry =>
            String(
              entry ??
              ""
            ).trim()
        )
        .filter(Boolean)
    )
  ];
}


function sampleWithoutReplacement(
  values,
  count,
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


  return copy.slice(
    0,
    count
  );
}


function allocateQuantities(
  speciesCount,
  totalQuantity,
  random
) {
  const quantities =
    Array.from(
      {
        length:
          speciesCount
      },
      () => 1
    );


  let remaining =
    totalQuantity -
    speciesCount;


  while (
    remaining > 0
  ) {
    const index =
      randomInteger(
        0,
        speciesCount - 1,
        random
      );


    quantities[index] +=
      1;

    remaining -=
      1;
  }


  return quantities;
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