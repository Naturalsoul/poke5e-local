const FRACTION_VALUES =
  new Map([
    ["1/8", 1 / 8],
    ["1/4", 1 / 4],
    ["1/2", 1 / 2],
    ["⅛", 1 / 8],
    ["¼", 1 / 4],
    ["½", 1 / 2]
  ]);

export function calculatePokemonEncounterXp({
  level,
  sr
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

  const defeated =
    Math.round(
      200 *
      normalizedLevel *
      normalizedSr
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