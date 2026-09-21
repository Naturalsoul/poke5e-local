export const POKEMON_GENDER_IDS =
  Object.freeze([
    "male",
    "female",
    "genderless"
  ]);

const GENDER_LABELS =
  Object.freeze({
    male: {
      es: "Macho",
      en: "Male"
    },

    female: {
      es: "Hembra",
      en: "Female"
    },

    genderless: {
      es: "Sin género",
      en: "Genderless"
    }
  });


export function normalizePokemonGenderId(
  value
) {

  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return POKEMON_GENDER_IDS.includes(
    id
  )
    ? id
    : null;
}


export function parsePokemonGenderRatio(
  value
) {

  const match =
    String(
      value ??
      ""
    )
      .trim()
      .match(
        /^(\d+)\s*:\s*(\d+)$/
      );


  if (!match) {

    return null;
  }


  /*
   * Poke5e utiliza:
   *
   * female : male
   *
   * 1:0 = solo hembra
   * 0:1 = solo macho
   * 0:0 = sin género
   * 1:7 = 12.5% hembra / 87.5% macho
   */

  const femaleWeight =
    Number(
      match[1]
    );

  const maleWeight =
    Number(
      match[2]
    );


  if (
    !Number.isSafeInteger(
      femaleWeight
    ) ||
    !Number.isSafeInteger(
      maleWeight
    ) ||
    femaleWeight < 0 ||
    maleWeight < 0
  ) {

    return null;
  }


  const totalWeight =
    femaleWeight +
    maleWeight;


  return Object.freeze({
    id:
      `${femaleWeight}:${maleWeight}`,

    femaleWeight,
    maleWeight,
    totalWeight,

    genderless:
      totalWeight === 0
  });
}


export function deterministicPokemonGender(
  ratioValue
) {

  const ratio =
    parsePokemonGenderRatio(
      ratioValue
    );


  if (!ratio) {

    return null;
  }


  if (
    ratio.genderless
  ) {

    return "genderless";
  }


  if (
    ratio.femaleWeight === 0
  ) {

    return "male";
  }


  if (
    ratio.maleWeight === 0
  ) {

    return "female";
  }


  return null;
}


export function pokemonGenderFromRoll(
  ratioValue,
  roll
) {

  const ratio =
    parsePokemonGenderRatio(
      ratioValue
    );


  if (!ratio) {

    throw new RangeError(
      `Ratio de género inválido: ${String(ratioValue)}.`
    );
  }


  const deterministic =
    deterministicPokemonGender(
      ratio.id
    );


  if (deterministic) {

    return deterministic;
  }


  const numericRoll =
    Number(
      roll
    );


  if (
    !Number.isInteger(
      numericRoll
    ) ||
    numericRoll < 1 ||
    numericRoll >
      ratio.totalWeight
  ) {

    throw new RangeError(
      `Tirada de género fuera de rango: ${String(roll)}.`
    );
  }


  return numericRoll <=
    ratio.femaleWeight
    ? "female"
    : "male";
}


export function pokemonGenderRollFormula(
  ratioValue
) {

  const ratio =
    parsePokemonGenderRatio(
      ratioValue
    );


  if (
    !ratio ||
    ratio.genderless ||
    ratio.femaleWeight === 0 ||
    ratio.maleWeight === 0
  ) {

    return null;
  }


  return `1d${ratio.totalWeight}`;
}


export function localizedPokemonGenderName(
  genderId,
  language = "es"
) {

  const id =
    normalizePokemonGenderId(
      genderId
    );


  if (!id) {

    return "";
  }


  const lang =
    language === "en"
      ? "en"
      : "es";


  return GENDER_LABELS[
    id
  ][lang];
}