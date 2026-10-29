import { calculatePokemonEncounterXp } from "./encounter-xp-service.mjs";
import {
  RANDOM_BIOME_ROUTE,
  RANDOM_REGION_ALL
} from "./encounter-random-catalog.mjs";
import { RANDOM_ENCOUNTER_SIZES } from "./encounter-randomizer.mjs";
import { detectEncounterParty } from "./encounter-difficulty.mjs";
import {
  getTrainerArchetype,
  listTrainerArchetypes
} from "./encounter-trainer-archetypes.mjs";
import { getDefaultEncounterItemPolicy } from "./encounter-item-policy.mjs";
import { clampInteger } from "./numbers.mjs";

const MODULE_ID =
  "poke5e-local";

const ENCOUNTER_STUDIO_TABS =
  new Set([
    "composition",
    "generator",
    "trainers",
    "options"
  ]);

export const MIXED_TRAINER_ARCHETYPE_ID =
  "mixed";

export function prepareEncounterRow({
  row,
  database,
  language,
  encounterType,
  xpContext = null
}) {

  const pokemon =
    findPokemon(
      database.pokemon,
      row.pokemonId
    );


  if (!pokemon) {

    return null;
  }


  const level =
    clampPokemonLevel(
      pokemon,
      row.level
    );


  const quantity =
    clampInteger(
      row.quantity,
      1,
      999,
      1
    );


  const defeated =
    clampInteger(
      row.defeated,
      0,
      quantity,
      0
    );


  const captured =
    encounterType ===
      "trainer"

      ? 0

      : clampInteger(
          row.captured,
          0,
          quantity -
            defeated,
          0
        );


  const xp =
    calculatePokemonEncounterXp({
      level,
      sr:
        pokemon.sr,
      context:
        xpContext
    });


  return {
    ...row,

    pokemon,
    level,
    quantity,
    defeated,
    captured,
    xp,

    earnedXp:
      (
        xp.defeated *
        defeated
      ) +
      (
        xp.captured *
        captured
      ),

    localizedName:
      localized(
        pokemon.name,
        language,
        pokemon.id
      ),

    moveNames:
      resolveMoveNames(
        row.moveIds,
        database.moves,
        language
      ),

    abilityName:
      resolveAbilityName(
        row.abilityId,
        database.abilities,
        language
      ),

    abilityHidden:
      isPokemonHiddenAbility(
        pokemon,
        row.abilityId
      ),

    itemName:
      resolveItemName(
        row.itemId,
        database.items,
        language
      ),

    itemTypeLabel:
      resolveItemTypeLabel(
        row.itemId,
        database.items,
        language
      )
  };
}

export function calculateEncounterTotals(
  rows,
  encounterType
) {

  return rows.reduce(
    (
      accumulator,
      row
    ) => {

      accumulator.defeated +=
        row.xp.defeated *
        row.quantity;


      if (
        encounterType !==
        "trainer"
      ) {

        accumulator.captured +=
          row.xp.captured *
          row.quantity;
      }


      accumulator.earned +=
        row.earnedXp;


      accumulator.tokens +=
        row.quantity;


      return accumulator;
    },
    {
      defeated:
        0,

      captured:
        0,

      earned:
        0,

      tokens:
        0
    }
  );
}

export function buildSavedEncounterLocations(
  encounters
) {
  const groups =
    new Map();


  for (
    const encounter
    of encounters ??
      []
  ) {
    const key =
      normalizeSavedEncounterLocation(
        encounter?.location
      );


    if (!key) {
      continue;
    }


    const existing =
      groups.get(
        key
      );


    if (existing) {
      existing.count +=
        1;

      continue;
    }


    groups.set(
      key,
      {
        key,

        label:
          String(
            encounter.location ??
            ""
          ).trim(),

        count:
          1
      }
    );
  }


  return [
    ...groups.values()
  ].sort(
    (
      left,
      right
    ) =>
      left.label.localeCompare(
        right.label,
        "es",
        {
          sensitivity:
            "base"
        }
      )
  );
}

export function filterSavedEncountersByLocation(
  encounters,
  locationKey
) {
  const selected =
    normalizeSavedEncounterLocation(
      locationKey
    );


  if (!selected) {
    return [];
  }


  return (
    encounters ??
    []
  ).filter(
    encounter =>
      normalizeSavedEncounterLocation(
        encounter?.location
      ) ===
        selected
  );
}

export function normalizeSavedEncounterLocation(
  value
) {
  return normalizeSearch(
    value
  );
}

export function getWildRandomRegionOptions(
  regions
) {
  return [
    RANDOM_REGION_ALL,
    ...(
      regions ??
      []
    )
  ];
}

export function getWildRandomBiomeOptions(
  catalog,
  region
) {
  const sourceRegion =
    region ===
      RANDOM_REGION_ALL
      ? ""
      : region;


  return [
    RANDOM_BIOME_ROUTE,
    ...catalog.biomes(
      sourceRegion
    )
  ];
}

export function getDefaultWildRandomBiome(
  biomes
) {
  return (
    (
      biomes ??
      []
    ).find(
      biome =>
        biome !==
          RANDOM_BIOME_ROUTE
    ) ??
    RANDOM_BIOME_ROUTE
  );
}

// The players' party, or 4 players at level 5 with 3 Pokémon when there are no player trainers with Pokémon yet.
export function detectPartyOrDefault() {
  try {
    const party =
      detectEncounterParty();

    if (party) {
      return {
        ...party,
        detected:
          true
      };
    }
  } catch (
    error
  ) {
    console.warn(
      `[${MODULE_ID}] No se pudo detectar el grupo`,
      error
    );
  }

  return {
    size:
      4,

    level:
      5,

    team:
      3,

    weakTo:
      [],

    pokemon:
      [],

    strongest:
      null,

    detected:
      false
  };
}

export function canGenerateRandomEncounter(
  candidateCount,
  size,
  lockedSpeciesCount = 0
) {
  const preset =
    RANDOM_ENCOUNTER_SIZES[
      size
    ] ??
    RANDOM_ENCOUNTER_SIZES.normal;


  return (
    Number(
      candidateCount
    ) +
    Number(
      lockedSpeciesCount
    ) >=
    preset.speciesMin
  );
}

export function countRandomCandidates({
  catalog,
  region,
  biome,
  maxLevel,
  minSr,
  maxSr,
  excludedPokemonIds = []
}) {
  if (
    !region ||
    !biome
  ) {
    return 0;
  }


  try {
    const excluded =
      new Set(
        excludedPokemonIds
      );


    return catalog
      .candidates({
        region,
        biome,
        maxLevel,
        minSr,
        maxSr
      })
      .filter(
        pokemon =>
          !excluded.has(
            String(
              pokemon.id
            )
          )
      )
      .length;

  } catch {
    return 0;
  }
}

export function getLockedPokemonIds(
  rows
) {
  return new Set(
    (
      rows ??
      []
    )
      .filter(
        row =>
          row.locked ===
            true
      )
      .map(
        row =>
          String(
            row.pokemonId ??
            ""
          )
      )
      .filter(Boolean)
  );
}

export function countLockedSpecies(
  rows
) {
  return getLockedPokemonIds(
    rows
  ).size;
}

export function normalizeOptionalNumberInput(
  value
) {
  const numeric =
    optionalNumber(
      value
    );


  return numeric == null
    ? ""
    : String(
        numeric
      );
}

export function optionalNumber(
  value
) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}

export function filterTrainerMixedArchetypeOptions(
  root,
  value
) {
  const search =
    normalizeSearch(
      value
    );


  root.querySelectorAll(
    '[data-role="trainer-mixed-option"]'
  ).forEach(
    option => {
      const searchText =
        String(
          option.dataset
            .search ??
          ""
        );


      option.hidden =
        Boolean(
          search &&
          !searchText.includes(
            search
          )
        );
    }
  );


  root.querySelectorAll(
    '[data-role="trainer-mixed-group"]'
  ).forEach(
    group => {
      const hasVisibleOptions =
        [
          ...group.querySelectorAll(
            '[data-role="trainer-mixed-option"]'
          )
        ]
          .some(
            option =>
              !option.hidden
          );


      group.hidden =
        !hasVisibleOptions;
    }
  );
}

export function canGenerateRandomTrainerEncounter(
  candidateCount,
  pokemonCount,
  archetypeId,
  mixedArchetypeIds = []
) {
  const archetypes =
    resolveTrainerRandomArchetypes(
      archetypeId,
      mixedArchetypeIds
    );


  if (
    !archetypes.length
  ) {
    return false;
  }


  const required =
    String(
      pokemonCount ??
      ""
    ) ===
      "auto"

      ? Math.max(
          ...archetypes.map(
            archetype =>
              clampInteger(
                archetype.teamSize?.min,
                1,
                6,
                1
              )
          )
        )

      : clampInteger(
          pokemonCount,
          1,
          6,
          3
        );


  return (
    Number(
      candidateCount
    ) >=
    required
  );
}

export function resolveTrainerRandomArchetypes(
  archetypeId,
  mixedArchetypeIds = []
) {
  if (
    archetypeId !==
      MIXED_TRAINER_ARCHETYPE_ID
  ) {
    return [
      getTrainerArchetype(
        archetypeId
      )
    ];
  }


  const known =
    new Map(
      listTrainerArchetypes()
        .map(
          archetype => [
            archetype.id,
            archetype
          ]
        )
    );


  const seen =
    new Set();


  return (
    mixedArchetypeIds ??
    []
  )
    .map(
      id =>
        String(
          id ??
          ""
        )
    )
    .filter(
      id => {
        if (
          !known.has(
            id
          ) ||
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
    )
    .map(
      id =>
        known.get(
          id
        )
    );
}

export function getDefaultMixedTrainerArchetypeIds() {
  return listTrainerArchetypes()
    .map(
      archetype =>
        archetype.id
    )
    .filter(
      id =>
        id !==
          "generic"
    );
}

export function countTrainerRandomCandidates({
  catalog,
  region,
  maxLevel,
  minSr,
  maxSr
}) {
  try {
    return catalog
      .trainerCandidates({
        region,
        maxLevel,
        minSr,
        maxSr
      })
      .length;

  } catch {
    return 0;
  }
}

export function normalizeTrainerTeamSize(
  value
) {
  const normalized =
    String(
      value ??
      "auto"
    );


  if (
    normalized ===
      "auto"
  ) {
    return "auto";
  }


  return String(
    clampInteger(
      normalized,
      1,
      6,
      3
    )
  );
}

export function countTrainerRowQuantity(
  rows
) {
  return (
    rows ??
    []
  ).reduce(
    (
      total,
      row
    ) =>
      total +
      clampInteger(
        row?.quantity,
        1,
        999,
        1
      ),
    0
  );
}

function getTrainerRerollTargetForUi({
  pokemonCount,
  teamSize,
  archetype
}) {
  if (
    String(
      teamSize ??
      ""
    ) !==
      "auto"
  ) {
    return clampInteger(
      teamSize,
      1,
      6,
      3
    );
  }


  const minimum =
    clampInteger(
      archetype?.teamSize?.min,
      1,
      6,
      1
    );


  const maximum =
    clampInteger(
      archetype?.teamSize?.max,
      minimum,
      6,
      minimum
    );


  const current =
    clampInteger(
      pokemonCount,
      0,
      6,
      0
    );


  return current > 0
    ? Math.min(
        maximum,
        Math.max(
          minimum,
          current
        )
      )
    : minimum;
}

export function getTrainerRerollUiState({
  candidateCount,
  pokemonCount,
  lockedCount,
  teamSize,
  archetype
}) {
  const targetCount =
    getTrainerRerollTargetForUi({
      pokemonCount,
      teamSize,
      archetype
    });


  if (
    lockedCount >
      targetCount
  ) {
    return {
      canReroll:
        true,

      label:
        "Revisar bloqueos",

      title:
        `Hay ${lockedCount} Pokémon bloqueados, pero el tamaño objetivo es ${targetCount}.`
    };
  }


  const missingCount =
    targetCount -
    lockedCount;


  if (
    missingCount <=
      0
  ) {
    return {
      canReroll:
        false,

      label:
        "Todos bloqueados",

      title:
        "No hay cupos sin bloquear para regenerar."
    };
  }


  return {
    canReroll:
      Number(
        candidateCount
      ) >=
        missingCount,

    label:
      lockedCount > 0
        ? "Reroll no bloqueados"
        : "Regenerar equipo",

    title:
      lockedCount > 0
        ? "Regenerar solo los Pokémon no bloqueados de este Entrenador"
        : "Regenerar solo el equipo de este Entrenador"
  };
}

export function validateTrainerState(
  state
) {
  if (
    state.type !==
      "trainer"
  ) {
    return null;
  }


  if (
    !state.trainers.length
  ) {
    return (
      "El encuentro requiere al menos un Entrenador."
    );
  }


  const unnamed =
    state.trainers.find(
      trainer =>
        !String(
          trainer.name ??
          ""
        ).trim()
    );


  if (unnamed) {
    return (
      "Todos los Entrenadores requieren un nombre."
    );
  }


  const trainerWithoutPokemon =
    state.trainers.find(
      trainer =>
        !state.rows.some(
          row =>
            row.trainerId ===
              trainer.id
        )
    );


  if (
    trainerWithoutPokemon
  ) {
    return (
      `El Entrenador "${trainerWithoutPokemon.name}" ` +
      "requiere al menos un Pokémon."
    );
  }


  return null;
}

export function normalizeEncounterStudioTab(
  value,
  trainerEncounter
) {

  const tab =
    String(
      value ??
      "composition"
    );


  if (
    !ENCOUNTER_STUDIO_TABS.has(
      tab
    )
  ) {
    return "composition";
  }


  if (
    tab ===
      "trainers" &&
    !trainerEncounter
  ) {
    return "composition";
  }


  return tab;
}

export function getPlannerItemPolicy(
  state
) {

  const encounterType =
    state.type ===
      "trainer"

      ? "trainer"

      : "wild";


  state.itemPolicies ??=
    {};


  state.itemPolicies[
    encounterType
  ] ??=
    getDefaultEncounterItemPolicy(
      encounterType
    );


  return state.itemPolicies[
    encounterType
  ];
}

export function buildEncounterDefinition(
  state,
  location,
  name
) {
  const base = {
    key:
      state.encounterKey,
    type:
      state.type,
    optional:
      state.optional ===
        true,
    location,
    name
  };


  if (
    state.type !==
      "trainer"
  ) {
    return {
      ...base,

      pokemon:
        state.rows.map(
          buildPokemonRequest
        ),

      trainers:
        []
    };
  }


  return {
    ...base,

    pokemon:
      [],

    trainers:
      state.trainers.map(
        trainer => ({
          id:
            trainer.id,

          name:
            String(
              trainer.name
            ).trim(),

          archetypeId:
            getTrainerArchetype(
              trainer.archetypeId
            ).id,

          pokemon:
            state.rows
              .filter(
                row =>
                  row.trainerId ===
                    trainer.id
              )
              .map(
                buildPokemonRequest
              )
        })
      )
  };
}

function buildPokemonRequest(
  row
) {
  return {
    pokemonId:
      row.pokemonId,

    level:
      row.level,

    quantity:
      row.quantity,

    defeated:
      row.defeated,

    captured:
      row.captured,

    abilityId:
      normalizeOptionalCanonicalId(
        row.abilityId
      ),

    itemId:
      normalizeOptionalCanonicalId(
        row.itemId
      ),

    itemResolved:
      row.itemResolved ===
        true ||
      Boolean(
        row.itemId
      ),

    // Chosen in the planner (best moveset, coverage); the sheet keeps its own when this is empty.
    moveIds:
      Array.isArray(
        row.moveIds
      )
        ? row.moveIds
        : []
  };
}

export function normalizeEncounterCompositionView(
  value
) {
  return value ===
    "compact"
    ? "compact"
    : "cards";
}

export function resolveTrainerName(
  trainers,
  trainerId
) {
  const id =
    String(
      trainerId ??
      ""
    );


  if (!id) {
    return "";
  }


  const trainer =
    (
      trainers ??
      []
    ).find(
      entry =>
        entry.id ===
          id
    );


  return String(
    trainer?.name ??
    ""
  ).trim();
}

function isPokemonHiddenAbility(
  pokemon,
  abilityId
) {
  const id =
    normalizeOptionalCanonicalId(
      abilityId
    );


  if (!id) {
    return false;
  }


  return (
    pokemon?.abilities ??
    []
  ).some(
    ability =>
      normalizeOptionalCanonicalId(
        ability?.id
      ) ===
        id &&

      ability?.hidden ===
        true
  );
}

function resolveAbilityName(
  abilityId,
  abilities,
  language
) {
  const id =
    normalizeOptionalCanonicalId(
      abilityId
    );


  if (!id) {
    return "";
  }


  const ability =
    (
      abilities ??
      []
    ).find(
      entry =>
        String(
          entry?.id ??
          ""
        )
          .trim()
          .toLowerCase() ===
          id
    );


  return ability
    ? localized(
        ability.name,
        language,
        ability.id
      )
    : id;
}

function resolveItemName(
  itemId,
  items,
  language
) {

  const item =
    findEncounterItem(
      itemId,
      items
    );


  if (!item) {

    return "";
  }


  return localized(
    item.name,
    language,
    item.id
  );
}

function resolveItemTypeLabel(
  itemId,
  items,
  language
) {

  const item =
    findEncounterItem(
      itemId,
      items
    );


  const labels = {

    es: {
      berry:
        "Baya",

      medicine:
        "Medicina",

      pokeball:
        "Poké Ball",

      "held-item":
        "Objeto equipado"
    },


    en: {
      berry:
        "Berry",

      medicine:
        "Medicine",

      pokeball:
        "Poké Ball",

      "held-item":
        "Held Item"
    }
  };


  return item

    ? labels[
        language ===
          "en"

          ? "en"

          : "es"
      ][
        item.type
      ] ??
      String(
        item.type ??
        ""
      )

    : "";
}

function findEncounterItem(
  itemId,
  items
) {

  const id =
    normalizeOptionalCanonicalId(
      itemId
    );


  if (!id) {

    return null;
  }


  return (
    items ??
    []
  ).find(
    item =>
      normalizeOptionalCanonicalId(
        item?.id
      ) ===
        id
  ) ??
  null;
}

function resolveMoveNames(
  moveIds,
  moves,
  language
) {
  if (
    !Array.isArray(
      moveIds
    ) ||
    !moveIds.length
  ) {
    return [];
  }


  const moveIndex =
    new Map(
      (
        moves ??
        []
      )
        .filter(
          move =>
            move?.id
        )
        .map(
          move => [
            String(
              move.id
            ),
            move
          ]
        )
    );


  return moveIds
    .map(
      moveId =>
        moveIndex.get(
          String(
            moveId
          )
        )
    )
    .filter(Boolean)
    .map(
      move =>
        localized(
          move.name,
          language,
          move.id
        )
    );
}

export function filterPokemon(
  pokemon,
  query,
  language
) {
  const normalizedQuery =
    normalizeSearch(
      query
    );


  if (
    !normalizedQuery
  ) {
    return [];
  }


  return (
    pokemon ??
    []
  ).filter(
    entry => {

      const values = [
        entry.id,

        entry.dexNumber,

        localized(
          entry.name,
          language,
          ""
        ),

        localized(
          entry.name,
          language === "es"
            ? "en"
            : "es",
          ""
        )
      ].map(
        normalizeSearch
      );


      return values.some(
        value =>
          value.includes(
            normalizedQuery
          )
      );
    }
  );
}

export function findPokemon(
  pokemon,
  pokemonId
) {
  const id =
    String(
      pokemonId ??
      ""
    );


  return (
    pokemon ??
    []
  ).find(
    entry =>
      String(
        entry?.id
      ) ===
      id
  ) ??
  null;
}

export function getPokemonMinimumLevel(
  pokemon
) {
  const numeric =
    Number(
      pokemon?.minimumLevel
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return 1;
  }


  return Math.min(
    20,

    Math.max(
      1,
      Math.trunc(
        numeric
      )
    )
  );
}

export function clampPokemonLevel(
  pokemon,
  value
) {
  const minimum =
    getPokemonMinimumLevel(
      pokemon
    );


  return clampInteger(
    value,
    minimum,
    20,
    minimum
  );
}

export function localized(
  value,
  language,
  fallback = ""
) {
  if (
    typeof value ===
      "string"
  ) {
    return value;
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {
    return String(
      value[language] ??
      value.en ??
      value.es ??
      fallback
    );
  }


  return String(
    fallback
  );
}

export function normalizeOptionalCanonicalId(
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

export function normalizeSearch(
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
    .toLowerCase();
}
