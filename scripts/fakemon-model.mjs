import { POKEMON_TYPE_IDS } from "./types.mjs";

export const FAKEMON_SCHEMA_VERSION = 3;

export const FAKEMON_EVOLUTION_CONDITION_TYPES = Object.freeze([
  "level",
  "gender",
  "move",
  "move-type",
  "item",
  "loyalty",
  "time",
  "special"
]);

export const FAKEMON_EVOLUTION_EFFECT_TYPES = Object.freeze([
  "asi",
  "special"
]);

export const FAKEMON_EVOLUTION_ABILITY_SCORE_MODES = Object.freeze([
  "standard",
  "tradeoff"
]);

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

const POKEMON_SIZES = new Set([
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan"
]);

const CONDITION_TYPES =
  new Set(
    FAKEMON_EVOLUTION_CONDITION_TYPES
  );

const EFFECT_TYPES =
  new Set(
    FAKEMON_EVOLUTION_EFFECT_TYPES
  );

export function normalizeFakemonSpecies(
  value
) {
  const source =
    requireObject(
      value,
      "La especie Fakemon debe ser un objeto."
    );

  const id =
    canonicalId(
      source.id,
      "La especie Fakemon requiere un ID canónico."
    );

  const types =
    canonicalIdArray(
      source.types
    );

  if (
    types.length < 1 ||
    types.length > 2
  ) {
    throw new Error(
      `${id}: types debe contener uno o dos tipos Pokémon.`
    );
  }

  for (const type of types) {
    if (
      !POKEMON_TYPE_IDS.includes(
        type
      )
    ) {
      throw new Error(
        `${id}: tipo Pokémon no válido: ${type}.`
      );
    }
  }

  const primaryType =
    canonicalId(
      source.primaryType ??
        types[0],
      `${id}: primaryType es obligatorio.`
    );

  if (
    !types.includes(
      primaryType
    )
  ) {
    throw new Error(
      `${id}: primaryType debe pertenecer a types.`
    );
  }

  const size =
    String(
      source.size ??
        "medium"
    )
      .trim()
      .toLowerCase();

  if (
    !POKEMON_SIZES.has(
      size
    )
  ) {
    throw new Error(
      `${id}: tamaño Pokémon no válido: ${size}.`
    );
  }

  return {
    id,

    name:
      requiredText(
        source.name,
        `${id}: name es obligatorio.`
      ),

    dexNumber:
      integer(
        source.dexNumber ??
          0,
        `${id}: dexNumber`,
        0
      ),

    description:
      localizedDescription(
        source.description
      ),

    types,
    primaryType,
    size,

    sr:
      finiteNumber(
        source.sr,
        `${id}: SR`,
        0
      ),

    minimumLevel:
      integer(
        source.minimumLevel,
        `${id}: minimumLevel`,
        1,
        20
      ),

    biology:
      normalizeBiology(
        source.biology
      ),

    combat:
      normalizeCombat(
        source.combat,
        id
      ),

    abilities:
      normalizeAbilities(
        source.abilities,
        id
      ),

    learnset:
      normalizeLearnset(
        source.learnset,
        id
      ),

    media:
      normalizeMedia(
        source.media,
        id
      ),

    habitat:
      normalizeHabitat(
        source.habitat
      ),

    /*
     * No son editadas manualmente.
     * El catálogo compuesto las reconstruye
     * desde la gráfica de Evolutions.
     */
    evolutionRefs: {
      incoming: [],
      outgoing: []
    }
  };
}

export function normalizeFakemonEvolution(
  value
) {
  const source =
    requireObject(
      value,
      "La Evolution Fakemon debe ser un objeto."
    );

  const from =
    canonicalId(
      source.from,
      "La Evolution requiere una especie de origen."
    );

  const to =
    canonicalId(
      source.to,
      "La Evolution requiere una especie de destino."
    );

  const id =
    canonicalId(
      source.id ??
        `${from}-to-${to}`,
      "La Evolution requiere un ID canónico."
    );

  if (from === to) {
    throw new Error(
      `${id}: from y to no pueden ser la misma especie.`
    );
  }

  return {
    id,
    from,
    to,
    abilityScoreMode:
      normalizeEvolutionAbilityScoreMode(
        source.abilityScoreMode,
        id
      ),
    conditions:
      normalizeEvolutionConditions(
        source.conditions,
        id
      ),

    effects:
      normalizeEvolutionEffects(
        source.effects,
        id
      )
  };
}

export function normalizeFakemonOptions(
  value = {}
) {
  const source =
    isObject(value)
      ? value
      : {};

  const encounters =
    isObject(
      source.encounters
    )
      ? source.encounters
      : {};

  return {
    enabled:
      source.enabled !== false,

    encounters: {
      manual:
        encounters.manual !==
          false,

      wildRandom:
        encounters.wildRandom ===
          true,

      trainerRandom:
        encounters.trainerRandom !==
          false
    }
  };
}

export function normalizeFakemonStore(
  value = {}
) {
  const source =
    isObject(value)
      ? value
      : {};

  const species =
    asArray(
      source.species
    ).map(
      normalizeFakemonSpecies
    );

  const evolutions =
    asArray(
      source.evolutions
    ).map(
      normalizeFakemonEvolution
    );

  const optionsSource =
    isObject(
      source.optionsBySpeciesId
    )
      ? source.optionsBySpeciesId
      : {};

  assertUniqueSpeciesIds(
    species
  );

  return {
    schemaVersion:
      FAKEMON_SCHEMA_VERSION,

    species,
    evolutions,

    optionsBySpeciesId:
      Object.fromEntries(
        species.map(
          entry => [
            entry.id,

            normalizeFakemonOptions(
              optionsSource[
                entry.id
              ]
            )
          ]
        )
      )
  };
}

function normalizeBiology(
  value
) {
  const source =
    isObject(value)
      ? value
      : {};

  return {
    eggGroups:
      stringArray(
        source.eggGroups
      ),

    genderRatio:
      optionalText(
        source.genderRatio
      ) ??
      "0:0"
  };
}

function normalizeCombat(
  value,
  speciesId
) {
  const source =
    requireObject(
      value,
      `${speciesId}: combat es obligatorio.`
    );

  const attributesSource =
    requireObject(
      source.attributes,
      `${speciesId}: combat.attributes es obligatorio.`
    );

  const hitDie =
    String(
      source.hitDie ??
        ""
    )
      .trim()
      .toLowerCase();

  if (
    !/^d(4|6|8|10|12|20)$/.test(
      hitDie
    )
  ) {
    throw new Error(
      `${speciesId}: hitDie no válido: ${hitDie || "vacío"}.`
    );
  }

  return {
    ac:
      integer(
        source.ac,
        `${speciesId}: AC`,
        1
      ),

    hp:
      integer(
        source.hp,
        `${speciesId}: HP`,
        1
      ),

    hitDie,

    attributes:
      Object.fromEntries(
        ABILITY_IDS.map(
          abilityId => [
            abilityId,

            integer(
              attributesSource[
                abilityId
              ],
              `${speciesId}: ${abilityId.toUpperCase()}`,
              1
            )
          ]
        )
      ),

    speed:
      asArray(
        source.speed
      ).map(
        (
          entry,
          index
        ) =>
          normalizeSpeed(
            entry,
            speciesId,
            index
          )
      ),

    skills:
      canonicalIdArray(
        source.skills
      ),

    savingThrows:
      canonicalIdArray(
        source.savingThrows
      ).filter(
        id =>
          ABILITY_IDS.includes(
            id
          )
      ),

    senses:
      asArray(
        source.senses
      ).map(
        (
          entry,
          index
        ) =>
          normalizeSense(
            entry,
            speciesId,
            index
          )
      )
  };
}

function normalizeSpeed(
  value,
  speciesId,
  index
) {
  const source =
    requireObject(
      value,
      `${speciesId}: speed[${index}] no es válido.`
    );

  return {
    type:
      requiredText(
        source.type,
        `${speciesId}: speed[${index}].type es obligatorio.`
      )
        .toLowerCase(),

    value:
      finiteNumber(
        source.value,
        `${speciesId}: speed[${index}].value`,
        0
      ),

    unit:
      optionalText(
        source.unit
      ) ??
      "ft"
  };
}

function normalizeSense(
  value,
  speciesId,
  index
) {
  const source =
    requireObject(
      value,
      `${speciesId}: senses[${index}] no es válido.`
    );

  return {
    type:
      requiredText(
        source.type,
        `${speciesId}: senses[${index}].type es obligatorio.`
      )
        .toLowerCase(),

    value:
      finiteNumber(
        source.value,
        `${speciesId}: senses[${index}].value`,
        0
      )
  };
}

function normalizeAbilities(
  value,
  speciesId
) {
  const entries =
    asArray(value);

  if (!entries.length) {
    throw new Error(
      `${speciesId}: la especie requiere al menos una Ability.`
    );
  }

  const byId =
    new Map();

  for (const entry of entries) {
    const source =
      typeof entry === "string"
        ? {
            id: entry,
            hidden: false
          }
        : entry;

    const object =
      requireObject(
        source,
        `${speciesId}: Ability no válida.`
      );

    const id =
      canonicalId(
        object.id,
        `${speciesId}: Ability sin ID.`
      );

    byId.set(
      id,
      {
        id,
        hidden:
          object.hidden === true
      }
    );
  }

  return [
    ...byId.values()
  ];
}

function normalizeLearnset(
  value,
  speciesId
) {
  const source =
    isObject(value)
      ? value
      : {};

  const groups =
    new Map();

  for (
    const entry
    of asArray(
      source.level
    )
  ) {
    const group =
      requireObject(
        entry,
        `${speciesId}: grupo de learnset no válido.`
      );

    const level =
      integer(
        group.level,
        `${speciesId}: nivel de learnset`,
        1,
        20
      );

    const previous =
      groups.get(
        level
      ) ??
      [];

    groups.set(
      level,
      [
        ...new Set([
          ...previous,
          ...canonicalIdArray(
            group.moveIds
          )
        ])
      ]
    );
  }

  return {
    level:
      [
        ...groups.entries()
      ]
        .sort(
          ([left], [right]) =>
            left - right
        )
        .map(
          ([level, moveIds]) => ({
            level,
            moveIds
          })
        ),

    eggMoveIds:
      canonicalIdArray(
        source.eggMoveIds
      ),

    tms:
      asArray(
        source.tms
      ).map(
        (
          entry,
          index
        ) =>
          normalizeTm(
            entry,
            speciesId,
            index
          )
      )
  };
}

function normalizeTm(
  value,
  speciesId,
  index
) {
  const source =
    requireObject(
      value,
      `${speciesId}: TM[${index}] no válida.`
    );

  return {
    id:
      integer(
        source.id,
        `${speciesId}: TM[${index}].id`,
        0
      ),

    moveId:
      canonicalId(
        source.moveId,
        `${speciesId}: TM[${index}].moveId es obligatorio.`
      ),

    cost:
      finiteNumber(
        source.cost ??
          0,
        `${speciesId}: TM[${index}].cost`,
        0
      ),

    source:
      optionalText(
        source.source
      ) ??
      "moves.json"
  };
}

function normalizeMedia(
  value,
  speciesId
) {
  const source =
    isObject(value)
      ? value
      : {};

  return {
    portrait:
      optionalText(
        source.portrait
      ),

    token:
      optionalText(
        source.token
      ),

    tokenAnimated:
      optionalWebmPath(
        source.tokenAnimated,
        `${speciesId}: media.tokenAnimated`
      ),

    portraitShiny:
      optionalText(
        source.portraitShiny
      ),

    tokenShiny:
      optionalText(
        source.tokenShiny
      ),

    tokenShinyAnimated:
      optionalWebmPath(
        source.tokenShinyAnimated,
        `${speciesId}: media.tokenShinyAnimated`
      )
  };
}

function normalizeHabitat(
  value
) {
  const source =
    isObject(value)
      ? value
      : {};

  return {
    biomes:
      stringArray(
        source.biomes
      ),

    nativeRegion:
      optionalText(
        source.nativeRegion
      ) ??
      "",

    regions:
      stringArray(
        source.regions
      )
  };
}

function normalizeEvolutionAbilityScoreMode(
  value,
  evolutionId
) {

  const mode =
    String(
      value ??
        "standard"
    )
      .trim()
      .toLowerCase();


  if (
    !FAKEMON_EVOLUTION_ABILITY_SCORE_MODES.includes(
      mode
    )
  ) {

    throw new Error(
      `${evolutionId}: modo de Ability Scores no soportado: ${mode}.`
    );
  }


  return mode;
}

function normalizeEvolutionConditions(
  value,
  evolutionId
) {
  return asArray(
    value
  ).map(
    (
      entry,
      index
    ) => {
      const source =
        requireObject(
          entry,
          `${evolutionId}: condition[${index}] no válida.`
        );

      const type =
        canonicalId(
          source.type,
          `${evolutionId}: condition[${index}].type es obligatorio.`
        );

      if (
        !CONDITION_TYPES.has(
          type
        )
      ) {
        throw new Error(
          `${evolutionId}: condición de Evolution no soportada: ${type}.`
        );
      }

      if (
        source.value == null ||
        source.value === ""
      ) {
        throw new Error(
          `${evolutionId}: condition[${index}].value es obligatorio.`
        );
      }

      return {
        type,

        value:
          type === "level"
            ? integer(
                source.value,
                `${evolutionId}: nivel de Evolution`,
                1,
                20
              )
            : source.value
      };
    }
  );
}

function normalizeEvolutionEffects(
  value,
  evolutionId
) {
  const entries =
    asArray(value);

  if (!entries.length) {
    throw new Error(
      `${evolutionId}: la Evolution requiere al menos un effect.`
    );
  }

  return entries.map(
    (
      entry,
      index
    ) => {
      const source =
        requireObject(
          entry,
          `${evolutionId}: effect[${index}] no válido.`
        );

      const type =
        canonicalId(
          source.type,
          `${evolutionId}: effect[${index}].type es obligatorio.`
        );

      if (
        !EFFECT_TYPES.has(
          type
        )
      ) {
        throw new Error(
          `${evolutionId}: effect de Evolution no soportado: ${type}.`
        );
      }

      if (
        source.value == null ||
        source.value === ""
      ) {
        throw new Error(
          `${evolutionId}: effect[${index}].value es obligatorio.`
        );
      }

      return {
        type,

        value:
          type === "asi"
            ? integer(
                source.value,
                `${evolutionId}: Evolution Points`,
                0
              )
            : source.value
      };
    }
  );
}

function canonicalId(
  value,
  errorMessage
) {
  const id =
    String(
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

  if (!id) {
    throw new Error(
      errorMessage
    );
  }

  return id;
}

function canonicalIdArray(
  value
) {
  return [
    ...new Set(
      asArray(value)
        .map(
          entry =>
            String(
              entry ??
                ""
            ).trim()
        )
        .filter(Boolean)
        .map(
          entry =>
            canonicalId(
              entry,
              "ID canónico vacío."
            )
        )
    )
  ];
}

function stringArray(
  value
) {
  return [
    ...new Set(
      asArray(value)
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

function localizedDescription(
  value
) {
  if (
    typeof value === "string"
  ) {
    const text =
      value.trim();

    return {
      es: text,
      en: text
    };
  }

  const source =
    isObject(value)
      ? value
      : {};

  return {
    es:
      String(
        source.es ??
          source.en ??
          ""
      ).trim(),

    en:
      String(
        source.en ??
          source.es ??
          ""
      ).trim()
  };
}

function integer(
  value,
  label,
  min = null,
  max = null
) {
  const numeric =
    Number(value);

  if (
    !Number.isInteger(
      numeric
    )
  ) {
    throw new Error(
      `${label} debe ser un entero.`
    );
  }

  if (
    min != null &&
    numeric < min
  ) {
    throw new Error(
      `${label} no puede ser menor que ${min}.`
    );
  }

  if (
    max != null &&
    numeric > max
  ) {
    throw new Error(
      `${label} no puede ser mayor que ${max}.`
    );
  }

  return numeric;
}

function finiteNumber(
  value,
  label,
  min = null
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    throw new Error(
      `${label} debe ser un número válido.`
    );
  }

  if (
    min != null &&
    numeric < min
  ) {
    throw new Error(
      `${label} no puede ser menor que ${min}.`
    );
  }

  return numeric;
}

function requiredText(
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

function optionalText(
  value
) {
  const text =
    String(
      value ??
        ""
    ).trim();

  return text ||
    null;
}


function optionalWebmPath(
  value,
  label
) {
  const path =
    optionalText(
      value
    );

  if (!path) {
    return null;
  }

  const cleanPath =
    path.replace(
      /[?#].*$/,
      ""
    );

  if (
    !cleanPath
      .toLowerCase()
      .endsWith(
        ".webm"
      )
  ) {
    throw new Error(
      `${label} debe apuntar a un archivo .webm.`
    );
  }

  return path;
}

function requireObject(
  value,
  errorMessage
) {
  if (
    !isObject(value)
  ) {
    throw new Error(
      errorMessage
    );
  }

  return value;
}

function isObject(
  value
) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function asArray(
  value
) {
  return Array.isArray(value)
    ? value
    : [];
}

function assertUniqueSpeciesIds(
  species
) {
  const ids =
    new Set();

  for (const entry of species) {
    if (
      ids.has(
        entry.id
      )
    ) {
      throw new Error(
        `ID Fakemon duplicado: ${entry.id}.`
      );
    }

    ids.add(
      entry.id
    );
  }
}