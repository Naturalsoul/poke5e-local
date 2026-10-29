import { assertPokemon } from "./trainer-party-service.mjs";


const MODULE_ID =
  "poke5e-local";

const EXPERIENCE_VERSION =
  1;

const MAX_POKEMON_LEVEL =
  20;


const EXPERIENCE_BY_LEVEL =
  Object.freeze({
    1: 0,
    2: 200,
    3: 800,
    4: 2000,
    5: 6000,
    6: 12000,
    7: 20000,
    8: 30000,
    9: 44000,
    10: 62000,
    11: 82000,
    12: 104000,
    13: 128000,
    14: 158000,
    15: 194000,
    16: 234000,
    17: 278000,
    18: 326000,
    19: 382000,
    20: 450000
  });


/* ============================================================
 * LEVEL CAP
 *
 * Table rule against power creep: a Pokémon can't level above its
 * trainer's level, and the XP it gains past that is lost. Wild and
 * rival Pokémon (no trainer) have no cap.
 * ============================================================ */

export function getPokemonLevelCap(
  pokemon
) {

  const uuid =
    pokemon?.getFlag?.(
      MODULE_ID,
      "trainerOwnerUuid"
    );

  const trainer =
    uuid
      ? globalThis.fromUuidSync?.(
        String(uuid)
      )
      : null;

  if (!trainer) {

    return null;
  }

  // Same reading as getTrainerLevel (trainer-service.mjs), without importing its folder and party services.
  return Math.min(
    MAX_POKEMON_LEVEL,
    Math.max(
      1,
      Math.trunc(
        Number(
          trainer.getFlag(
            MODULE_ID,
            "trainerLevel"
          )
        )
      ) || 1
    )
  );
}


function pokemonLevel(
  pokemon
) {

  const value =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "level"
      )
    );


  if (
    !Number.isFinite(
      value
    )
  ) {

    throw new Error(
      `${pokemon.name} no posee un nivel Pokémon válido.`
    );
  }


  return Math.min(
    MAX_POKEMON_LEVEL,
    Math.max(
      1,
      Math.trunc(
        value
      )
    )
  );
}


function normalizeExperience(
  value
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

    throw new Error(
      "La experiencia debe ser un número válido."
    );
  }


  return Math.max(
    0,
    Math.trunc(
      numeric
    )
  );
}


/* ============================================================
 * EXPERIENCE TABLE
 * ============================================================ */

export function getPokemonExperienceThreshold(
  level
) {

  const normalizedLevel =
    Math.min(
      MAX_POKEMON_LEVEL,
      Math.max(
        1,
        Math.trunc(
          Number(
            level
          )
        )
      )
    );


  return EXPERIENCE_BY_LEVEL[
    normalizedLevel
  ];
}


/* ============================================================
 * STATE
 * ============================================================ */

export function getPokemonExperienceState(
  pokemon
) {

  assertPokemon(
    pokemon
  );


  const level =
    pokemonLevel(
      pokemon
    );


  const levelStartXp =
    getPokemonExperienceThreshold(
      level
    );


  const progression =
    pokemon.getFlag(
      MODULE_ID,
      "pokemonProgression"
    ) ??
    {};


  const storedTotal =
    Number(
      progression
        ?.experience
        ?.total
    );


  /*
   * Pokémon existentes/importados que todavía
   * no tienen XP guardada comienzan exactamente
   * en el mínimo correspondiente a su nivel.
   *
   * Ej:
   * Pokémon importado directamente a Nv.3
   * comienza en 800 XP, no en 0.
   */
  const total =
    Number.isFinite(
      storedTotal
    )
      ? Math.max(
          levelStartXp,
          Math.trunc(
            storedTotal
          )
        )
      : levelStartXp;


  const isMaxLevel =
    level >=
    MAX_POKEMON_LEVEL;


  const nextLevelXp =
    isMaxLevel
      ? null
      : getPokemonExperienceThreshold(
          level + 1
        );


  const xpIntoLevel =
    Math.max(
      0,
      total -
      levelStartXp
    );


  const xpForNextLevel =
    isMaxLevel
      ? 0
      : Math.max(
          1,
          nextLevelXp -
          levelStartXp
        );


  const xpRemaining =
    isMaxLevel
      ? 0
      : Math.max(
          0,
          nextLevelXp -
          total
        );


  const percent =
    isMaxLevel
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            (
              xpIntoLevel /
              xpForNextLevel
            ) *
            100
          )
        );


  const levelCap =
    getPokemonLevelCap(
      pokemon
    );

  const atLevelCap =
    levelCap != null &&
    level >= levelCap;

  const readyToLevel =
    !isMaxLevel &&
    !atLevelCap &&
    total >=
      nextLevelXp;


  return {
    level,

    levelCap,

    atLevelCap,

    total,

    levelStartXp,

    nextLevelXp,

    xpIntoLevel,

    xpForNextLevel,

    xpRemaining,

    percent,

    readyToLevel,

    isMaxLevel
  };
}


/* ============================================================
 * WRITE
 * ============================================================ */

export async function setPokemonExperience(
  pokemon,
  value
) {

  assertPokemon(
    pokemon
  );


  const currentState =
    getPokemonExperienceState(
      pokemon
    );


  const requested =
    normalizeExperience(
      value
    );


  /*
   * No permitimos XP incompatible con el nivel
   * actual del Actor.
   *
   * Un Pokémon Nv.3 no puede quedar con 100 XP,
   * porque Nv.3 comienza en 800 XP.
   */
  /*
   * Lo que pase del umbral del nivel de su Entrenador
   * se pierde: al tope no gana XP.
   */
  const ceiling =
    currentState.levelCap != null
      ? getPokemonExperienceThreshold(
        currentState.levelCap
      )
      : Infinity;

  const total =
    Math.max(
      currentState.levelStartXp,
      Math.min(
        requested,
        ceiling
      )
    );


  const progression =
    foundry.utils.deepClone(
      pokemon.getFlag(
        MODULE_ID,
        "pokemonProgression"
      ) ??
      {}
    );


  progression.experience = {
    version:
      EXPERIENCE_VERSION,

    total
  };


  await pokemon.setFlag(
    MODULE_ID,
    "pokemonProgression",
    progression
  );


  return getPokemonExperienceState(
    pokemon
  );
}


export async function addPokemonExperience(
  pokemon,
  amount
) {

  const adjustment =
    Number(
      amount
    );


  if (
    !Number.isFinite(
      adjustment
    )
  ) {

    throw new Error(
      "La experiencia a sumar debe ser un número válido."
    );
  }


  const current =
    getPokemonExperienceState(
      pokemon
    );


  return setPokemonExperience(
    pokemon,
    current.total +
      Math.trunc(
        adjustment
      )
  );
}