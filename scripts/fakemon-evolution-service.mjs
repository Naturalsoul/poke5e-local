import {
  normalizeFakemonEvolution
} from "./fakemon-model.mjs";

import {
  canonicalEvolutionValue
} from "./pokemon-evolution-rules.mjs";

import {
  POKEMON_TYPE_IDS
} from "./types.mjs";


export function evolutionIdentity(
  evolution
) {
  return [
    canonicalEvolutionValue(
      evolution?.id
    ),

    canonicalEvolutionValue(
      evolution?.from
    ),

    canonicalEvolutionValue(
      evolution?.to
    )
  ].join("|");
}


export function evolutionRuleSignature(
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
          `${canonicalEvolutionValue(
            condition?.type
          )}:${canonicalEvolutionValue(
            condition?.value
          )}`
      )
      .join("|");


  return (
    `${canonicalEvolutionValue(
      evolution?.from
    )}>` +
    `${canonicalEvolutionValue(
      evolution?.to
    )}|` +
    conditionKey
  );
}


export function buildEvolutionStudioContext({
  database,
  fakemonStore,
  speciesId
}) {
  const store =
    normalizeStoreShape(
      fakemonStore
    );


  const species =
    mergedSpecies(
      database?.pokemon,
      store.species
    );


  const customSignatures =
    new Set(
      store.evolutions.map(
        evolutionRuleSignature
      )
    );


  const officialEvolutions =
    (
      Array.isArray(
        database?.evolutions
      )
        ? database.evolutions
        : []
    ).filter(
      evolution =>
        !customSignatures.has(
          evolutionRuleSignature(
            evolution
          )
        )
    );


  const currentSpeciesId =
    canonicalEvolutionValue(
      speciesId
    );


  const relationships = [
    ...officialEvolutions.map(
      evolution => ({
        evolution,

        custom:
          false
      })
    ),

    ...store.evolutions.map(
      evolution => ({
        evolution,

        custom:
          true
      })
    )
  ];


  return {
    species,

    incoming:
      relationships.filter(
        entry =>
          canonicalEvolutionValue(
            entry.evolution?.to
          ) ===
            currentSpeciesId
      ),

    outgoing:
      relationships.filter(
        entry =>
          canonicalEvolutionValue(
            entry.evolution?.from
          ) ===
            currentSpeciesId
      )
  };
}


export function validateFakemonEvolutionDefinition({
  definition,
  database,
  fakemonStore,
  currentIdentity = null
}) {
  const evolution =
    normalizeFakemonEvolution(
      definition
    );


  const store =
    normalizeStoreShape(
      fakemonStore
    );


  const species =
    mergedSpecies(
      database?.pokemon,
      store.species
    );


  const speciesIds =
    new Set(
      species.map(
        entry =>
          canonicalEvolutionValue(
            entry.id
          )
      )
    );


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


  const customSpeciesIds =
    new Set(
      store.species.map(
        entry =>
          canonicalEvolutionValue(
            entry.id
          )
      )
    );


  if (
    !customSpeciesIds.has(
      evolution.from
    ) &&
    !customSpeciesIds.has(
      evolution.to
    )
  ) {
    throw new Error(
      "Fakemon Studio solo administra Evolutions donde al menos una especie sea Fakemon."
    );
  }


  if (
    !evolution.conditions.length
  ) {
    throw new Error(
      "La Evolution requiere al menos una condición."
    );
  }


  validateStandardEffects(
    evolution
  );


  validateConditionReferences(
    evolution,
    database
  );


  const normalizedCurrentIdentity =
    currentIdentity
      ? String(
          currentIdentity
        )
      : null;


  const currentCustomSignatures =
    new Set(
      store.evolutions.map(
        evolutionRuleSignature
      )
    );


  const officialCollision =
    (
      Array.isArray(
        database?.evolutions
      )
        ? database.evolutions
        : []
    )
      .filter(
        entry =>
          !currentCustomSignatures.has(
            evolutionRuleSignature(
              entry
            )
          )
      )
      .some(
        entry =>
          evolutionRuleSignature(
            entry
          ) ===
            evolutionRuleSignature(
              evolution
            )
      );


  if (
    officialCollision
  ) {
    throw new Error(
      `${evolution.from} → ${evolution.to} duplica una Evolution Poke5e existente.`
    );
  }


  const identityCollision =
    store.evolutions.some(
      entry =>
        (
          !normalizedCurrentIdentity ||
          evolutionIdentity(
            entry
          ) !==
            normalizedCurrentIdentity
        ) &&
        evolutionIdentity(
          entry
        ) ===
          evolutionIdentity(
            evolution
          )
    );


  if (
    identityCollision
  ) {
    throw new Error(
      "Ya existe una Evolution Fakemon con el mismo ID, origen y destino. Usa un ID distinto para otra variante."
    );
  }


  const customCollision =
    store.evolutions.some(
      entry =>
        (
          !normalizedCurrentIdentity ||
          evolutionIdentity(
            entry
          ) !==
            normalizedCurrentIdentity
        ) &&
        evolutionRuleSignature(
          entry
        ) ===
          evolutionRuleSignature(
            evolution
          )
    );


  if (
    customCollision
  ) {
    throw new Error(
      `${evolution.from} → ${evolution.to} ya posee una Evolution Fakemon con las mismas condiciones.`
    );
  }


  if (
    normalizedCurrentIdentity &&
    evolutionIdentity(
      evolution
    ) !==
      normalizedCurrentIdentity
  ) {
    throw new Error(
      "ID, origen y destino quedan bloqueados al editar una Evolution. Crea una nueva relación para cambiarlos."
    );
  }


  return evolution;
}


function validateStandardEffects(
  evolution
) {
  const effects =
    Array.isArray(
      evolution.effects
    )
      ? evolution.effects
      : [];


  if (
    effects.length !==
      1 ||
    canonicalEvolutionValue(
      effects[0]?.type
    ) !==
      "asi"
  ) {
    throw new Error(
      "La Evolution debe usar exactamente un efecto ASI para ser compatible con el Evolution Engine actual."
    );
  }
}


function validateConditionReferences(
  evolution,
  database
) {
  const moveIds =
    new Set(
      (
        Array.isArray(
          database?.moves
        )
          ? database.moves
          : []
      )
        .map(
          entry =>
            canonicalEvolutionValue(
              entry?.id
            )
        )
        .filter(
          Boolean
        )
    );


  const itemIds =
    new Set(
      (
        Array.isArray(
          database?.items
        )
          ? database.items
          : []
      )
        .flatMap(
          entry => [
            canonicalEvolutionValue(
              entry?.id
            ),

            canonicalEvolutionValue(
              entry?.name
            )
          ]
        )
        .filter(
          Boolean
        )
    );


  for (
    const condition
    of evolution.conditions
  ) {
    const type =
      canonicalEvolutionValue(
        condition.type
      );


    const value =
      canonicalEvolutionValue(
        condition.value
      );


    if (
      type ===
        "move" &&
      !moveIds.has(
        value
      )
    ) {
      throw new Error(
        `Move de Evolution inexistente: ${condition.value}.`
      );
    }


    if (
      type ===
        "move-type" &&
      !POKEMON_TYPE_IDS.includes(
        value
      )
    ) {
      throw new Error(
        `Tipo de Move no válido para Evolution: ${condition.value}.`
      );
    }


    if (
      type ===
        "item" &&
      !itemIds.has(
        value
      )
    ) {
      throw new Error(
        `Item de Evolution inexistente: ${condition.value}.`
      );
    }
  }
}


function mergedSpecies(
  databaseSpecies,
  customSpecies
) {
  const byId =
    new Map();


  for (
    const species
    of (
      Array.isArray(
        databaseSpecies
      )
        ? databaseSpecies
        : []
    )
  ) {
    const id =
      canonicalEvolutionValue(
        species?.id
      );


    if (id) {
      byId.set(
        id,
        species
      );
    }
  }


  /*
   * Incluimos también Fakemon deshabilitados.
   *
   * Así una relación puede conservarse aunque
   * temporalmente la especie no participe en el
   * catálogo compuesto activo.
   */
  for (
    const species
    of (
      Array.isArray(
        customSpecies
      )
        ? customSpecies
        : []
    )
  ) {
    const id =
      canonicalEvolutionValue(
        species?.id
      );


    if (id) {
      byId.set(
        id,
        species
      );
    }
  }


  return [
    ...byId.values()
  ].sort(
    (
      left,
      right
    ) =>
      String(
        left?.name ??
        left?.id ??
        ""
      ).localeCompare(
        String(
          right?.name ??
          right?.id ??
          ""
        ),
        "es",
        {
          sensitivity:
            "base"
        }
      )
  );
}


function normalizeStoreShape(
  value
) {
  return {
    species:
      Array.isArray(
        value?.species
      )
        ? value.species
        : [],

    evolutions:
      Array.isArray(
        value?.evolutions
      )
        ? value.evolutions
        : []
  };
}