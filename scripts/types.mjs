/* ============================================================
 * POKE5E LOCAL - POKEMON TYPES
 * ============================================================ */

export const POKEMON_TYPES = {

  normal: {
    es: "Normal",
    en: "Normal",
    color: "#A8A77A",
    icon: "systems/dnd5e/icons/svg/damage/bludgeoning.svg"
  },

  fire: {
    es: "Fuego",
    en: "Fire",
    color: "#EE8130",
    icon: "systems/dnd5e/icons/svg/damage/fire.svg"
  },

  water: {
    es: "Agua",
    en: "Water",
    color: "#6390F0",
    icon: "systems/dnd5e/icons/svg/damage/cold.svg"
  },

  electric: {
    es: "Eléctrico",
    en: "Electric",
    color: "#F7D02C",
    icon: "systems/dnd5e/icons/svg/damage/lightning.svg"
  },

  grass: {
    es: "Planta",
    en: "Grass",
    color: "#7AC74C",
    icon: "systems/dnd5e/icons/svg/damage/poison.svg"
  },

  ice: {
    es: "Hielo",
    en: "Ice",
    color: "#96D9D6",
    icon: "systems/dnd5e/icons/svg/damage/cold.svg"
  },

  fighting: {
    es: "Lucha",
    en: "Fighting",
    color: "#C22E28",
    icon: "systems/dnd5e/icons/svg/damage/bludgeoning.svg"
  },

  poison: {
    es: "Veneno",
    en: "Poison",
    color: "#A33EA1",
    icon: "systems/dnd5e/icons/svg/damage/poison.svg"
  },

  ground: {
    es: "Tierra",
    en: "Ground",
    color: "#E2BF65",
    icon: "systems/dnd5e/icons/svg/damage/thunder.svg"
  },

  flying: {
    es: "Volador",
    en: "Flying",
    color: "#A98FF3",
    icon: "systems/dnd5e/icons/svg/damage/slashing.svg"
  },

  psychic: {
    es: "Psíquico",
    en: "Psychic",
    color: "#F95587",
    icon: "systems/dnd5e/icons/svg/damage/psychic.svg"
  },

  bug: {
    es: "Bicho",
    en: "Bug",
    color: "#A6B91A",
    icon: "systems/dnd5e/icons/svg/damage/acid.svg"
  },

  rock: {
    es: "Roca",
    en: "Rock",
    color: "#B6A136",
    icon: "systems/dnd5e/icons/svg/damage/bludgeoning.svg"
  },

  ghost: {
    es: "Fantasma",
    en: "Ghost",
    color: "#735797",
    icon: "systems/dnd5e/icons/svg/damage/necrotic.svg"
  },

  dragon: {
    es: "Dragón",
    en: "Dragon",
    color: "#6F35FC",
    icon: "systems/dnd5e/icons/svg/damage/fire.svg"
  },

  dark: {
    es: "Siniestro",
    en: "Dark",
    color: "#705746",
    icon: "systems/dnd5e/icons/svg/damage/necrotic.svg"
  },

  steel: {
    es: "Acero",
    en: "Steel",
    color: "#B7B7CE",
    icon: "systems/dnd5e/icons/svg/damage/thunder.svg"
  },

  fairy: {
    es: "Hada",
    en: "Fairy",
    color: "#D685AD",
    icon: "systems/dnd5e/icons/svg/damage/force.svg"
  }
};


export const POKEMON_TYPE_IDS =
  Object.keys(
    POKEMON_TYPES
  );


/* ============================================================
 * TABLA DEFENSIVA
 *
 * La clave exterior es el TIPO DEL DEFENSOR.
 *
 * Solo indicamos valores diferentes de 1.
 *
 * 2   = débil
 * 0.5 = resistente
 * 0   = inmune
 * ============================================================ */

const TYPE_DEFENSE = {

  normal: {
    fighting: 2,
    ghost: 0
  },


  fire: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    ice: 0.5,
    ground: 2,
    bug: 0.5,
    rock: 2,
    steel: 0.5,
    fairy: 0.5
  },


  water: {
    fire: 0.5,
    water: 0.5,
    electric: 2,
    grass: 2,
    ice: 0.5,
    steel: 0.5
  },


  electric: {
    electric: 0.5,
    ground: 2,
    flying: 0.5,
    steel: 0.5
  },


  grass: {
    fire: 2,
    water: 0.5,
    electric: 0.5,
    grass: 0.5,
    ice: 2,
    poison: 2,
    ground: 0.5,
    flying: 2,
    bug: 2
  },


  ice: {
    fire: 2,
    ice: 0.5,
    fighting: 2,
    rock: 2,
    steel: 2
  },


  fighting: {
    flying: 2,
    psychic: 2,
    bug: 0.5,
    rock: 0.5,
    dark: 0.5,
    fairy: 2
  },


  poison: {
    grass: 0.5,
    fighting: 0.5,
    poison: 0.5,
    ground: 2,
    psychic: 2,
    bug: 0.5,
    fairy: 0.5
  },


  ground: {
    water: 2,
    electric: 0,
    grass: 2,
    ice: 2,
    poison: 0.5,
    rock: 0.5
  },


  flying: {
    electric: 2,
    grass: 0.5,
    ice: 2,
    fighting: 0.5,
    ground: 0,
    bug: 0.5,
    rock: 2
  },


  psychic: {
    fighting: 0.5,
    psychic: 0.5,
    bug: 2,
    ghost: 2,
    dark: 2
  },


  bug: {
    fire: 2,
    grass: 0.5,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    rock: 2
  },


  rock: {
    normal: 0.5,
    fire: 0.5,
    water: 2,
    grass: 2,
    fighting: 2,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    steel: 2
  },


  ghost: {
    normal: 0,
    fighting: 0,
    poison: 0.5,
    bug: 0.5,
    ghost: 2,
    dark: 2
  },


  dragon: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    grass: 0.5,
    ice: 2,
    dragon: 2,
    fairy: 2
  },


  dark: {
    fighting: 2,
    psychic: 0,
    bug: 2,
    ghost: 0.5,
    dark: 0.5,
    fairy: 2
  },


  steel: {
    normal: 0.5,
    fire: 2,
    grass: 0.5,
    ice: 0.5,
    fighting: 2,
    poison: 0,
    ground: 2,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 0.5,
    dragon: 0.5,
    steel: 0.5,
    fairy: 0.5
  },


  fairy: {
    fighting: 0.5,
    poison: 2,
    bug: 0.5,
    dragon: 0,
    dark: 0.5,
    steel: 2
  }
};


/* ============================================================
 * NORMALIZAR TIPO
 * ============================================================ */

function normalizeType(
  value
) {

  const type =
    String(
      value ?? ""
    )
      .trim()
      .toLowerCase();


  return POKEMON_TYPES[type]
    ? type
    : null;
}


/* ============================================================
 * MULTIPLICADOR DEFENSIVO
 * ============================================================ */

function defensiveMultiplier(
  defenderType,
  attackingType
) {

  return (
    TYPE_DEFENSE[
      defenderType
    ]
      ?.[attackingType] ??
    1
  );
}


/* ============================================================
 * CALCULAR DEFENSAS
 *
 * Ejemplo:
 *
 * Fire/Flying vs Rock
 *
 * Fire   = x2
 * Flying = x2
 *
 * raw = x4
 *
 * Pero Poke5e / D&D5e lo clasifica simplemente
 * como Vulnerability, por lo que Foundry aplicará x2.
 * ============================================================ */

export function calculatePokemonDefenses(
  types = []
) {

  const pokemonTypes = [

    ...new Set(

      types

        .map(
          normalizeType
        )

        .filter(
          Boolean
        )
    )
  ];


  const multipliers = {};

  const vulnerabilities = [];
  const resistances = [];
  const immunities = [];
  const neutral = [];


  for (
    const attackingType
    of POKEMON_TYPE_IDS
  ) {

    let multiplier = 1;


    for (
      const defenderType
      of pokemonTypes
    ) {

      multiplier *=
        defensiveMultiplier(
          defenderType,
          attackingType
        );
    }


    multipliers[
      attackingType
    ] =
      multiplier;


    if (
      multiplier === 0
    ) {

      immunities.push(
        attackingType
      );
    }


    else if (
      multiplier > 1
    ) {

      vulnerabilities.push(
        attackingType
      );
    }


    else if (
      multiplier < 1
    ) {

      resistances.push(
        attackingType
      );
    }


    else {

      neutral.push(
        attackingType
      );
    }
  }


  return {

    types:
      pokemonTypes,

    vulnerabilities,

    resistances,

    immunities,

    neutral,

    /*
     * Conservamos el multiplicador bruto
     * para diagnóstico y futuras reglas.
     *
     * Ejemplo Charizard/Rock = 4.
     */

    multipliers
  };
}


/* ============================================================
 * STAB
 * ============================================================ */

export function hasStab(
  pokemonTypes,
  moveType
) {

  const type =
    normalizeType(
      moveType
    );


  if (!type) {

    return false;
  }


  return (
    pokemonTypes ??
    []
  )

    .map(
      normalizeType
    )

    .includes(
      type
    );
}


/* ============================================================
 * LABEL
 * ============================================================ */

export function pokemonTypeLabel(
  type,
  language = "es"
) {

  const normalized =
    normalizeType(
      type
    );


  if (!normalized) {

    return String(
      type ??
      ""
    );
  }


  return (
    POKEMON_TYPES[
      normalized
    ][language] ??

    POKEMON_TYPES[
      normalized
    ].en
  );
}


/* ============================================================
 * REGISTRAR TIPOS DE DAÑO EN D&D5e
 *
 * NO eliminamos los damage types originales de D&D.
 *
 * Añadimos:
 *
 * water
 * electric
 * grass
 * etc.
 *
 * fire / poison / psychic ya existen en D&D5e,
 * por lo que reutilizamos su configuración.
 * ============================================================ */

export function setPokemonDamageTypeLanguage(
  language = "es"
) {

  const damageTypes =
    CONFIG
      ?.DND5E
      ?.damageTypes;


  if (!damageTypes) {

    console.warn(
      "[poke5e-local] CONFIG.DND5E.damageTypes aún no está disponible."
    );

    return;
  }


  for (
    const [
      id,
      config
    ]
    of Object.entries(
      POKEMON_TYPES
    )
  ) {

    const existing =
      damageTypes[id] ??
      {};


    damageTypes[id] = {

      ...existing,

      /*
       * Puede ser texto directo.
       * No necesitamos añadir archivos
       * de traducción de Foundry todavía.
       */

      label:
        config[language] ??
        config.en,

      icon:
        existing.icon ??
        config.icon
    };
  }


  console.log(
    `[poke5e-local] ${POKEMON_TYPE_IDS.length} tipos Pokémon disponibles como damage types.`
  );
}


export function registerPokemonDamageTypes(
  language = "es"
) {

  setPokemonDamageTypeLanguage(
    language
  );
}