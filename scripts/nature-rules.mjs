const NATURE_DEFINITIONS =
  Object.freeze([
    nature("hardy", 1, 4, "Hardy", "Fuerte"),
    nature("lonely", 5, 8, "Lonely", "Huraña", "str", "con"),
    nature("brave", 9, 12, "Brave", "Audaz", "str", "dex"),
    nature("adamant", 13, 16, "Adamant", "Firme", "str", "wis"),
    nature("naughty", 17, 20, "Naughty", "Pícara", "str", "cha"),
    nature("bold", 21, 24, "Bold", "Osada", "con", "str"),
    nature("docile", 25, 28, "Docile", "Dócil"),
    nature("relaxed", 29, 32, "Relaxed", "Plácida", "con", "dex"),
    nature("impish", 33, 36, "Impish", "Agitada", "con", "wis"),
    nature("lax", 37, 40, "Lax", "Floja", "con", "cha"),
    nature("timid", 41, 44, "Timid", "Miedosa", "dex", "str"),
    nature("hasty", 45, 48, "Hasty", "Activa", "dex", "con"),
    nature("serious", 49, 52, "Serious", "Seria"),
    nature("jolly", 53, 56, "Jolly", "Alegre", "dex", "wis"),
    nature("naive", 57, 60, "Naive", "Ingenua", "dex", "cha"),
    nature("modest", 61, 64, "Modest", "Modesta", "wis", "str"),
    nature("mild", 65, 68, "Mild", "Afable", "wis", "con"),
    nature("quiet", 69, 72, "Quiet", "Mansa", "wis", "dex"),
    nature("bashful", 73, 76, "Bashful", "Tímida"),
    nature("rash", 77, 80, "Rash", "Alocada", "wis", "cha"),
    nature("calm", 81, 84, "Calm", "Serena", "cha", "str"),
    nature("gentle", 85, 88, "Gentle", "Amable", "cha", "con"),
    nature("sassy", 89, 92, "Sassy", "Grosera", "cha", "dex"),
    nature("careful", 93, 96, "Careful", "Cauta", "cha", "wis"),
    nature("quirky", 97, 100, "Quirky", "Rara")
  ]);


const NATURES_BY_ID =
  new Map(
    NATURE_DEFINITIONS.map(
      definition => [
        definition.id,
        definition
      ]
    )
  );


function nature(
  id,
  minRoll,
  maxRoll,
  englishName,
  spanishName,
  increase = null,
  decrease = null
) {

  return Object.freeze({
    id,

    roll:
      Object.freeze({
        min:
          minRoll,

        max:
          maxRoll
      }),

    name:
      Object.freeze({
        en:
          englishName,

        es:
          spanishName
      }),

    increase,
    decrease
  });
}


function normalizedNatureId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


export function getNatureDefinition(
  id
) {

  return (
    NATURES_BY_ID.get(
      normalizedNatureId(
        id
      )
    ) ??
    null
  );
}


export function natureFromD100(
  value
) {

  const roll =
    Number(
      value
    );


  if (
    !Number.isInteger(
      roll
    ) ||
    roll < 1 ||
    roll > 100
  ) {

    throw new RangeError(
      "natureFromD100 requiere un entero entre 1 y 100."
    );
  }


  return (
    NATURE_DEFINITIONS.find(
      definition =>
        roll >=
          definition.roll.min &&
        roll <=
          definition.roll.max
    ) ??
    null
  );
}


export function localizedNatureName(
  definition,
  language = "es"
) {

  if (!definition) {

    return "";
  }


  return (
    language === "en"

      ? definition.name.en

      : definition.name.es
  );
}


export function listNatureDefinitions() {

  return NATURE_DEFINITIONS;
}