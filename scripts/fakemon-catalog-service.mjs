import {
  normalizeFakemonStore
} from "./fakemon-model.mjs";

export function buildCompositePokemonDatabase({
  official,
  fakemonStore
}) {
  const store =
    normalizeFakemonStore(
      fakemonStore
    );

  const officialPokemon =
    cloneArray(
      official?.pokemon
    );

  const moves =
    cloneArray(
      official?.moves
    );

  const abilities =
    cloneArray(
      official?.abilities
    );

  const officialEvolutions =
    cloneArray(
      official?.evolutions
    );

  const items =
    cloneArray(
      official?.items
    );

  assertNoSpeciesIdCollisions(
    officialPokemon,
    store.species
  );

  validateFakemonReferences({
    species:
      store.species,

    moves,
    abilities
  });

  assertEvolutionEndpointsExist(
    [
      ...officialPokemon,
      ...store.species
    ],
    store.evolutions
  );

  assertNoEvolutionCollisions(
    officialEvolutions,
    store.evolutions
  );

  const enabledSpecies =
    store.species.filter(
      species =>
        store.optionsBySpeciesId[
          species.id
        ]?.enabled !== false
    );

  const pokemon = [
    ...officialPokemon,

    ...foundry.utils.deepClone(
      enabledSpecies
    )
  ];

  const activeSpeciesIds =
    new Set(
      pokemon.map(
        species =>
          normalizeKey(
            species.id
          )
      )
    );

  const customEvolutions =
    store.evolutions.filter(
      evolution =>
        activeSpeciesIds.has(
          evolution.from
        ) &&
        activeSpeciesIds.has(
          evolution.to
        )
    );

  const evolutions = [
    ...officialEvolutions,

    ...foundry.utils.deepClone(
      customEvolutions
    )
  ];

  applyEvolutionReferences(
    pokemon,
    evolutions
  );

  return {
    pokemon,
    moves,
    abilities,
    evolutions,
    items,

    fakemon: {
      schemaVersion:
        store.schemaVersion,

      speciesIds:
        enabledSpecies.map(
          species =>
            species.id
        ),

      optionsBySpeciesId:
        foundry.utils.deepClone(
          store.optionsBySpeciesId
        )
    }
  };
}

export function validateFakemonStoreAgainstCompositeDatabase({
  database,
  currentStore,
  candidateStore
}) {

  const current =
    normalizeFakemonStore(
      currentStore
    );

  const candidate =
    normalizeFakemonStore(
      candidateStore
    );


  /*
   * loadDatabase() entrega el catálogo compuesto,
   * no la base oficial pura.
   *
   * Para validar un backup reconstruimos esa base
   * oficial eliminando del composite los Fakemon
   * que pertenecen al store actualmente cargado.
   */
  const currentSpeciesIds =
    new Set(
      current.species.map(
        species =>
          normalizeKey(
            species.id
          )
      )
    );


  const currentEvolutionKeys =
    new Set(
      current.evolutions.map(
        evolutionSignature
      )
    );


  const official = {
    pokemon:
      cloneArray(
        database?.pokemon
      ).filter(
        species =>
          !currentSpeciesIds.has(
            normalizeKey(
              species?.id
            )
          )
      ),

    moves:
      cloneArray(
        database?.moves
      ),

    abilities:
      cloneArray(
        database?.abilities
      ),

    evolutions:
      cloneArray(
        database?.evolutions
      ).filter(
        evolution =>
          !currentEvolutionKeys.has(
            evolutionSignature(
              evolution
            )
          )
      ),

    items:
      cloneArray(
        database?.items
      )
  };


  /*
   * Esta llamada es deliberada:
   *
   * reutiliza exactamente las mismas validaciones
   * que el catálogo compuesto utiliza en runtime.
   */
  buildCompositePokemonDatabase({
    official,

    fakemonStore:
      candidate
  });


  return foundry.utils.deepClone(
    candidate
  );
}

function validateFakemonReferences({
  species,
  moves,
  abilities
}) {
  const moveIds =
    new Set(
      moves
        .map(
          entry =>
            String(
              entry?.id ??
                ""
            )
        )
        .filter(Boolean)
    );

  const abilityIds =
    new Set(
      abilities
        .map(
          entry =>
            String(
              entry?.id ??
                ""
            )
        )
        .filter(Boolean)
    );

  for (
    const pokemon
    of species
  ) {
    for (
      const reference
      of pokemon.abilities
    ) {
      if (
        !abilityIds.has(
          reference.id
        )
      ) {
        throw new Error(
          `${pokemon.id}: Ability inexistente: ${reference.id}.`
        );
      }
    }

    for (
      const moveId
      of collectSpeciesMoveIds(
        pokemon
      )
    ) {
      if (
        !moveIds.has(
          moveId
        )
      ) {
        throw new Error(
          `${pokemon.id}: Move inexistente: ${moveId}.`
        );
      }
    }
  }
}

function collectSpeciesMoveIds(
  pokemon
) {
  const levelMoves =
    (
      pokemon.learnset
        ?.level ??
      []
    ).flatMap(
      group =>
        group.moveIds ??
        []
    );

  const eggMoves =
    pokemon.learnset
      ?.eggMoveIds ??
    [];

  const tmMoves =
    (
      pokemon.learnset
        ?.tms ??
      []
    ).map(
      tm =>
        tm.moveId
    );

  return [
    ...new Set([
      ...levelMoves,
      ...eggMoves,
      ...tmMoves
    ])
  ];
}

function assertNoSpeciesIdCollisions(
  officialPokemon,
  fakemonSpecies
) {
  const officialIds =
    new Set(
      officialPokemon
        .map(
          species =>
            normalizeKey(
              species?.id
            )
        )
        .filter(Boolean)
    );

  const collision =
    fakemonSpecies.find(
      species =>
        officialIds.has(
          species.id
        )
    );

  if (collision) {
    throw new Error(
      `Fakemon Studio no puede sobrescribir la especie normalizada ${collision.id}.`
    );
  }
}

function assertEvolutionEndpointsExist(
  pokemon,
  evolutions
) {
  const speciesIds =
    new Set(
      pokemon
        .map(
          species =>
            normalizeKey(
              species?.id
            )
        )
        .filter(Boolean)
    );

  for (
    const evolution
    of evolutions
  ) {
    if (
      !speciesIds.has(
        evolution.from
      )
    ) {
      throw new Error(
        `Evolution Fakemon referencia un origen inexistente: ${evolution.from}.`
      );
    }

    if (
      !speciesIds.has(
        evolution.to
      )
    ) {
      throw new Error(
        `Evolution Fakemon referencia un destino inexistente: ${evolution.to}.`
      );
    }
  }
}

function assertNoEvolutionCollisions(
  officialEvolutions,
  fakemonEvolutions
) {
  const officialKeys =
    new Set(
      officialEvolutions.map(
        evolutionSignature
      )
    );

  const customKeys =
    new Set();

  for (
    const evolution
    of fakemonEvolutions
  ) {
    const key =
      evolutionSignature(
        evolution
      );

    if (
      officialKeys.has(
        key
      )
    ) {
      throw new Error(
        `Evolution Fakemon duplicada respecto de Poke5e: ` +
        `${evolution.from} → ${evolution.to}.`
      );
    }

    if (
      customKeys.has(
        key
      )
    ) {
      throw new Error(
        `Evolution Fakemon duplicada: ` +
        `${evolution.from} → ${evolution.to}.`
      );
    }

    customKeys.add(
      key
    );
  }
}

function evolutionSignature(
  evolution
) {
  const conditions =
    Array.isArray(
      evolution?.conditions
    )
      ? evolution.conditions
      : [];

  const conditionKey =
    conditions
      .map(
        condition =>
          `${normalizeKey(
            condition?.type
          )}:${normalizeKey(
            condition?.value
          )}`
      )
      .join("|");

  return (
    `${normalizeKey(
      evolution?.from
    )}>` +
    `${normalizeKey(
      evolution?.to
    )}|` +
    `${conditionKey}`
  );
}

function applyEvolutionReferences(
  pokemon,
  evolutions
) {
  const pokemonById =
    new Map(
      pokemon.map(
        species => [
          normalizeKey(
            species.id
          ),
          species
        ]
      )
    );

  for (
    const species
    of pokemon
  ) {
    species.evolutionRefs = {
      incoming: [],
      outgoing: []
    };
  }

  for (
    const evolution
    of evolutions
  ) {
    const evolutionId =
      String(
        evolution?.id ??
          ""
      ).trim();

    if (!evolutionId) {
      continue;
    }

    const from =
      pokemonById.get(
        normalizeKey(
          evolution?.from
        )
      );

    const to =
      pokemonById.get(
        normalizeKey(
          evolution?.to
        )
      );

    if (
      from &&
      !from
        .evolutionRefs
        .outgoing
        .includes(
          evolutionId
        )
    ) {
      from
        .evolutionRefs
        .outgoing
        .push(
          evolutionId
        );
    }

    if (
      to &&
      !to
        .evolutionRefs
        .incoming
        .includes(
          evolutionId
        )
    ) {
      to
        .evolutionRefs
        .incoming
        .push(
          evolutionId
        );
    }
  }
}

function normalizeKey(
  value
) {
  return String(
    value ??
      ""
  )
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’']/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function cloneArray(
  value
) {
  return foundry.utils.deepClone(
    Array.isArray(value)
      ? value
      : []
  );
}