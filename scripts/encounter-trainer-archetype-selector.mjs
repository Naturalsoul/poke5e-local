export function selectTrainerArchetypePokemon({
  candidates,
  count,
  archetype,
  random = Math.random
}) {
  const pool =
    normalizeCandidates(
      candidates
    );


  const targetCount =
    clampInteger(
      count,
      1,
      6,
      1
    );


  if (
    pool.length <
      targetCount
  ) {
    throw new Error(
      "No hay suficientes especies compatibles para completar el equipo del Entrenador."
    );
  }


  const available = [
    ...pool
  ];


  const selected =
    [];


  while (
    selected.length <
      targetCount
  ) {
    const index =
      pickWeightedIndex(
        available,
        archetype,
        random
      );


    selected.push(
      available[index]
    );


    available.splice(
      index,
      1
    );
  }


  return selected;
}



export function getTrainerArchetypePokemonWeight(
  pokemon,
  archetype
) {
  const typeWeights =
    archetype?.typeWeights ?? {};

  const speciesWeights =
    archetype?.speciesWeights ?? {};

  const types =
    normalizeTypes(pokemon?.types);

  let weight = 1;

  for (const type of types) {
    const configured =
      Number(typeWeights[type]);

    if (
      Number.isFinite(configured) &&
      configured > weight
    ) {
      weight = configured;
    }
  }

  const speciesId =
    String(pokemon?.id ?? "")
      .trim()
      .toLowerCase();

  const speciesWeight =
    Number(speciesWeights[speciesId]);

  if (
    Number.isFinite(speciesWeight) &&
    speciesWeight > weight
  ) {
    return speciesWeight;
  }

  return weight;
}



function pickWeightedIndex(
  values,
  archetype,
  random
) {
  const weights =
    values.map(
      value =>
        getTrainerArchetypePokemonWeight(
          value,
          archetype
        )
    );


  const total =
    weights.reduce(
      (
        sum,
        weight
      ) =>
        sum +
        weight,
      0
    );


  if (
    !(total > 0)
  ) {
    return 0;
  }


  const target =
    normalizeRandom(
      random
    ) *
    total;


  let cursor =
    0;


  for (
    let index =
      0;
    index <
      weights.length;
    index += 1
  ) {
    cursor +=
      weights[index];


    if (
      target <
        cursor
    ) {
      return index;
    }
  }


  return (
    weights.length -
    1
  );
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


function normalizeTypes(
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
      type =>
        String(
          type ??
          ""
        )
          .trim()
          .toLowerCase()
    )
    .filter(Boolean);
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