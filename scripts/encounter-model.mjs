export const ENCOUNTER_TYPES = Object.freeze({
  WILD: "wild",
  TRAINER: "trainer"
});

const VALID_TYPES = new Set(
  Object.values(
    ENCOUNTER_TYPES
  )
);


export function normalizeEncounterDefinition(
  value
) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};


  const name =
    normalizeRequiredText(
      source.name,
      "El encuentro requiere un nombre."
    );


  const location =
    normalizeRequiredText(
      source.location,
      "El encuentro requiere una ubicación."
    );


  const type =
    VALID_TYPES.has(
      source.type
    )
      ? source.type
      : ENCOUNTER_TYPES.WILD;


  const pokemon =
    type ===
      ENCOUNTER_TYPES.WILD
      ? normalizeEntries(
          source.pokemon,
          {
            allowCapture: true
          }
        )
      : [];


  const trainers =
    type ===
      ENCOUNTER_TYPES.TRAINER
      ? normalizeTrainers(
          source.trainers,
          source.pokemon
        )
      : [];


  if (
    type ===
      ENCOUNTER_TYPES.WILD &&
    !pokemon.length
  ) {
    throw new Error(
      "El encuentro requiere al menos un Pokémon."
    );
  }


  if (
    type ===
      ENCOUNTER_TYPES.TRAINER &&
    !trainers.length
  ) {
    throw new Error(
      "El encuentro contra Entrenadores requiere al menos un Entrenador."
    );
  }


  return {
    key:
      normalizeEncounterKey(
        source.key
      ) ??
      buildEncounterKey(
        location,
        name
      ),

    name,
    location,
    type,
    // Optional encounters (not needed to move on) give catch-up XP: more to the party's weaker Pokémon.
    optional:
      source.optional ===
        true,
    pokemon,
    trainers
  };
}

export function buildEncounterKey(
  location,
  name
) {
  return (
    `${normalizeKeyText(location)}::` +
    `${normalizeKeyText(name)}`
  );
}


export function buildEncounterEntryKey(
  encounterKey,
  pokemonId,
  level
) {
  return (
    `${encounterKey}::` +
    `${String(pokemonId)}@` +
    `${Math.trunc(Number(level))}`
  );
}

export function buildTrainerEncounterEntryKey(
  encounterKey,
  trainerId,
  pokemonId,
  level
) {
  return (
    `${encounterKey}::` +
    `${String(trainerId)}::` +
    `${String(pokemonId)}@` +
    `${Math.trunc(Number(level))}`
  );
}

function normalizeTrainers(
  value,
  legacyPokemon
) {
  const source =
    Array.isArray(
      value
    )
      ? value
      : [];


  /*
   * Compatibilidad con encuentros Trainer
   * creados antes de existir trainers[].
   */
  const trainers =
    source.length
      ? source
      : Array.isArray(
          legacyPokemon
        ) &&
        legacyPokemon.length
        ? [
            {
              id:
                "trainer-1",

              name:
                "Entrenador",

              pokemon:
                legacyPokemon
            }
          ]
        : [];


  const usedIds =
    new Set();


  return trainers.map(
    (
      trainer,
      index
    ) => {
      const name =
        normalizeRequiredText(
          trainer?.name,
          `El Entrenador ${index + 1} requiere un nombre.`
        );


      const id =
        resolveUniqueTrainerId(
          trainer?.id,
          index,
          usedIds
        );


      const pokemon =
        normalizeEntries(
          trainer?.pokemon,
          {
            allowCapture:
              false
          }
        );


      if (!pokemon.length) {
        throw new Error(
          `El Entrenador "${name}" requiere al menos un Pokémon.`
        );
      }


      return {
        id,
        name,

        archetypeId:
          normalizeTrainerArchetypeId(
            trainer?.archetypeId
          ),

        pokemon
      };
    }
  );
}


function resolveUniqueTrainerId(
  value,
  index,
  usedIds
) {
  const requested =
    normalizeTrainerId(
      value
    );


  const base =
    requested ||
    `trainer-${index + 1}`;


  let candidate =
    base;

  let suffix =
    2;


  while (
    usedIds.has(
      candidate
    )
  ) {
    candidate =
      `${base}-${suffix}`;

    suffix +=
      1;
  }


  usedIds.add(
    candidate
  );


  return candidate;
}

export function normalizeTrainerArchetypeId(
  value
) {
  const text =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );


  return (
    text ||
    "generic"
  );
}

function normalizeTrainerId(
  value
) {
  const text =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9_-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      );


  return (
    text ||
    null
  );
}

function normalizeEntries(
  value,
  {
    allowCapture = true
  } = {}
) {

  const rows =
    Array.isArray(
      value
    )
      ? value
      : [];


  const merged =
    new Map();


  for (
    const row
    of rows
  ) {

    const pokemonId =
      String(
        row?.pokemonId ??
        ""
      ).trim();


    if (!pokemonId) {

      continue;
    }


    const level =
      clampInteger(
        row?.level,
        1,
        20,
        1
      );


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
      allowCapture

        ? clampInteger(
            row?.captured,
            0,
            quantity -
              defeated,
            0
          )

        : 0;


    const abilityId =
      normalizeEncounterAbilityId(
        row?.abilityId
      );


    const itemId =
      normalizeEncounterItemId(
        row?.itemId
      );


    const itemResolved =
      row?.itemResolved ===
        true ||
      Boolean(
        itemId
      );


    // Moves chosen in the planner (the best moveset, coverage): the sheet gets them if it can learn them.
    const moveIds =
      normalizeMoveIds(
        row?.moveIds
      );

    const key =
      `${pokemonId}@${level}`;


    const existing =
      merged.get(
        key
      );


    if (existing) {

      existing.quantity +=
        quantity;


      existing.defeated +=
        defeated;


      existing.captured +=
        captured;


      const overflow =
        Math.max(
          0,

          existing.defeated +
          existing.captured -
          existing.quantity
        );


      if (
        overflow > 0
      ) {

        existing.captured =
          Math.max(
            0,

            existing.captured -
            overflow
          );
      }


      if (
        !existing.abilityId &&
        abilityId
      ) {

        existing.abilityId =
          abilityId;
      }


      /*
       * La primera fila que posea un resultado
       * de Item resuelto define el estado del
       * Actor compartido.
       */
      if (
        !existing.itemResolved &&
        itemResolved
      ) {

        existing.itemId =
          itemId;


        existing.itemResolved =
          true;
      }


      continue;
    }


    merged.set(
      key,
      {
        pokemonId,
        level,
        quantity,
        defeated,
        captured,
        abilityId,
        itemId,
        itemResolved,
        moveIds
      }
    );
  }


  return [
    ...merged.values()
  ];
}

function normalizeMoveIds(
  value
) {
  return Array.isArray(
    value
  )
    ? value
        .map(String)
        .filter(Boolean)
        .slice(0, 4)
    : [];
}

export function normalizeEncounterAbilityId(
  value
) {
  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    id ||
    null
  );
}

export function normalizeEncounterItemId(
  value
) {

  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    id ||
    null
  );
}

function normalizeEncounterKey(
  value
) {
  const key =
    String(
      value ??
      ""
    ).trim();


  return (
    key ||
    null
  );
}


function normalizeRequiredText(
  value,
  errorMessage
) {
  const text =
    String(
      value ??
      ""
    ).trim();


  if (!text) {
    throw new Error(
      errorMessage
    );
  }


  return text;
}


function normalizeKeyText(
  value
) {
  return String(
    value ??
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
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