import {
  POKEMON_TYPE_IDS
} from "./types.mjs";


export const FAKEMON_ARCHETYPE_IDS =
  Object.freeze([
    "tank",
    "offensive-tank",
    "physical-attacker",
    "special-attacker",
    "mixed-attacker",
    "fast-striker",
    "support-controller",
    "glass-cannon"
  ]);


export const FAKEMON_EVOLUTION_STAGE_IDS =
  Object.freeze([
    "base",
    "intermediate",
    "final",
    "standalone",
    "any"
  ]);


const DIMENSION_IDS =
  Object.freeze([
    "durability",
    "offense",
    "speed",
    "control"
  ]);


const OFFENSE_MODES =
  new Set([
    "physical",
    "special",
    "mixed"
  ]);


const SECONDARY_ARCHETYPE_WEIGHT =
  0.35;


const ARCHETYPES =
  Object.freeze({

    tank:
      createArchetype({
        id:
          "tank",

        es:
          "Tank",

        en:
          "Tank",

        descriptionEs:
          "Prioriza supervivencia, AC, HP y CON por sobre el daño.",

        offenseMode:
          "mixed",

        dimensions: {
          durability:
            0.90,

          offense:
            0.35,

          speed:
            0.25,

          control:
            0.45
        }
      }),


    "offensive-tank":
      createArchetype({
        id:
          "offensive-tank",

        es:
          "Tank ofensivo",

        en:
          "Offensive Tank",

        descriptionEs:
          "Combina alta supervivencia con presión ofensiva consistente.",

        offenseMode:
          "mixed",

        dimensions: {
          durability:
            0.80,

          offense:
            0.78,

          speed:
            0.35,

          control:
            0.35
        }
      }),


    "physical-attacker":
      createArchetype({
        id:
          "physical-attacker",

        es:
          "Atacante físico",

        en:
          "Physical Attacker",

        descriptionEs:
          "Busca alto rendimiento ofensivo mediante STR y/o DEX.",

        offenseMode:
          "physical",

        dimensions: {
          durability:
            0.45,

          offense:
            0.86,

          speed:
            0.62,

          control:
            0.22
        }
      }),


    "special-attacker":
      createArchetype({
        id:
          "special-attacker",

        es:
          "Atacante especial",

        en:
          "Special Attacker",

        descriptionEs:
          "Busca alto rendimiento ofensivo mediante INT, WIS y/o CHA.",

        offenseMode:
          "special",

        dimensions: {
          durability:
            0.40,

          offense:
            0.86,

          speed:
            0.60,

          control:
            0.42
        }
      }),


    "mixed-attacker":
      createArchetype({
        id:
          "mixed-attacker",

        es:
          "Atacante mixto",

        en:
          "Mixed Attacker",

        descriptionEs:
          "Mantiene opciones ofensivas físicas y especiales.",

        offenseMode:
          "mixed",

        dimensions: {
          durability:
            0.45,

          offense:
            0.82,

          speed:
            0.55,

          control:
            0.30
        }
      }),


    "fast-striker":
      createArchetype({
        id:
          "fast-striker",

        es:
          "Atacante veloz",

        en:
          "Fast Striker",

        descriptionEs:
          "Prioriza movilidad y ofensiva sacrificando durabilidad.",

        offenseMode:
          "mixed",

        dimensions: {
          durability:
            0.30,

          offense:
            0.84,

          speed:
            0.90,

          control:
            0.20
        }
      }),


    "support-controller":
      createArchetype({
        id:
          "support-controller",

        es:
          "Support / Controller",

        en:
          "Support / Controller",

        descriptionEs:
          "Prioriza utilidad, control y atributos mentales.",

        offenseMode:
          "special",

        dimensions: {
          durability:
            0.55,

          offense:
            0.35,

          speed:
            0.50,

          control:
            0.90
        }
      }),


    "glass-cannon":
      createArchetype({
        id:
          "glass-cannon",

        es:
          "Glass Cannon",

        en:
          "Glass Cannon",

        descriptionEs:
          "Maximiza ofensiva y velocidad a cambio de supervivencia.",

        offenseMode:
          "mixed",

        dimensions: {
          durability:
            0.20,

          offense:
            0.95,

          speed:
            0.82,

          control:
            0.18
        }
      })
  });


export function listFakemonArchetypes() {

  return FAKEMON_ARCHETYPE_IDS
    .map(
      id =>
        ARCHETYPES[
          id
        ]
    );
}


export function getFakemonArchetype(
  value
) {

  return (
    ARCHETYPES[
      normalizeId(
        value
      )
    ] ??
    null
  );
}


export function createFakemonDesignIntent(
  value = {}
) {

  const source =
    isObject(
      value
    )
      ? value
      : {};


  const primaryArchetype =
    requireArchetypeId(
      source.primaryArchetype
    );


  const requestedSecondary =
    optionalArchetypeId(
      source.secondaryArchetype
    );


  const secondaryArchetype =
    requestedSecondary ===
      primaryArchetype
      ? null
      : requestedSecondary;


  const primary =
    ARCHETYPES[
      primaryArchetype
    ];


  const secondary =
    secondaryArchetype
      ? ARCHETYPES[
          secondaryArchetype
        ]
      : null;


  const dimensions =
    resolveDimensions({
      primary:
        primary.dimensions,

      secondary:
        secondary
          ?.dimensions,

      overrides:
        source.dimensions
    });


  const requestedMode =
    normalizeId(
      source.offenseMode
    );


  const offenseMode =
    OFFENSE_MODES.has(
      requestedMode
    )
      ? requestedMode
      : primary.offenseMode;


  const types =
    normalizeTypes(
      source.types
    );


  return {
    primaryArchetype,
    secondaryArchetype,
    offenseMode,

    stage:
      normalizeStage(
        source.stage
      ),

    types,
    dimensions
  };
}


function createArchetype({
  id,
  es,
  en,
  descriptionEs,
  offenseMode,
  dimensions
}) {

  return Object.freeze({
    id,

    labels:
      Object.freeze({
        es,
        en
      }),

    descriptions:
      Object.freeze({
        es:
          descriptionEs,

        en:
          descriptionEs
      }),

    offenseMode,

    dimensions:
      Object.freeze({
        ...dimensions
      })
  });
}


function resolveDimensions({
  primary,
  secondary,
  overrides
}) {

  const defaults =
    secondary

      ? Object.fromEntries(
          DIMENSION_IDS.map(
            dimensionId => [
              dimensionId,

              primary[
                dimensionId
              ] *
                (
                  1 -
                  SECONDARY_ARCHETYPE_WEIGHT
                ) +

              secondary[
                dimensionId
              ] *
                SECONDARY_ARCHETYPE_WEIGHT
            ]
          )
        )

      : {
          ...primary
        };


  return Object.fromEntries(
    DIMENSION_IDS.map(
      dimensionId => [
        dimensionId,

        normalizeDimension(
          overrides
            ?.[dimensionId],

          defaults[
            dimensionId
          ]
        )
      ]
    )
  );
}


function normalizeTypes(
  value
) {

  const types = [
    ...new Set(
      (
        Array.isArray(
          value
        )
          ? value
          : []
      )
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    )
  ];


  const invalid =
    types.find(
      type =>
        !POKEMON_TYPE_IDS.includes(
          type
        )
    );


  if (invalid) {

    throw new Error(
      `Tipo Pokémon no válido en el Wizard: ${invalid}.`
    );
  }


  if (
    types.length < 1 ||
    types.length > 2
  ) {

    throw new Error(
      "El Wizard requiere uno o dos tipos Pokémon."
    );
  }


  return types;
}


function normalizeStage(
  value
) {

  const stage =
    normalizeId(
      value
    ) ||
    "any";


  if (
    !FAKEMON_EVOLUTION_STAGE_IDS
      .includes(
        stage
      )
  ) {

    throw new Error(
      `Etapa evolutiva no válida: ${stage}.`
    );
  }


  return stage;
}


function requireArchetypeId(
  value
) {

  const id =
    normalizeId(
      value
    );


  if (
    !FAKEMON_ARCHETYPE_IDS
      .includes(
        id
      )
  ) {

    throw new Error(
      `Arquetipo Fakemon no válido: ${id || "vacío"}.`
    );
  }


  return id;
}


function optionalArchetypeId(
  value
) {

  const id =
    normalizeId(
      value
    );


  if (!id) {
    return null;
  }


  if (
    !FAKEMON_ARCHETYPE_IDS
      .includes(
        id
      )
  ) {

    throw new Error(
      `Arquetipo secundario no válido: ${id}.`
    );
  }


  return id;
}


function normalizeDimension(
  value,
  fallback
) {

  if (
    value == null ||
    value ===
      ""
  ) {

    return fallback;
  }


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
      "Las prioridades del Wizard deben ser números válidos."
    );
  }


  return Math.min(
    1,
    Math.max(
      0,
      numeric
    )
  );
}


function normalizeId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


function isObject(
  value
) {

  return Boolean(
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}