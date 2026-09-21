import {
  normalizeFakemonSpecies
} from "./fakemon-model.mjs";


export function getOfficialTemplateSpecies(
  database
) {

  const customIds =
    new Set(
      (
        database?.fakemon
          ?.speciesIds ??
        []
      )
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    );


  return (
    Array.isArray(
      database?.pokemon
    )
      ? database.pokemon
      : []
  )
    .filter(
      species =>
        species?.id
    )
    .filter(
      species =>
        !customIds.has(
          normalizeId(
            species.id
          )
        )
    )
    .sort(
      compareSpecies
    );
}


export function createFakemonDraftFromOfficial({
  sourceSpecies,
  occupiedIds = []
}) {

  /*
   * Pasamos primero por el modelo Fakemon.
   *
   * Esto elimina cualquier metadata futura del
   * catálogo oficial que no forme parte del
   * contrato canónico de Fakemon Studio.
   */
  const source =
    normalizeFakemonSpecies(
      sourceSpecies
    );


  const id =
    generateAvailableVariantId(
      source.id,
      occupiedIds
    );


  /*
   * El Pokédex # oficial no debe heredarse:
   * estamos creando una especie custom distinta.
   *
   * Todo lo demás sí sirve como punto de partida:
   * Stats, tipos, Abilities, Learnset, Media, etc.
   *
   * normalizeFakemonSpecies() reconstruirá además
   * evolutionRefs como arrays vacíos.
   */
  return normalizeFakemonSpecies({
    ...source,

    id,

    name:
      `${source.name} Variant`,

    dexNumber:
      0,

    evolutionRefs: {
      incoming:
        [],

      outgoing:
        []
    }
  });
}


export function generateAvailableVariantId(
  sourceId,
  occupiedIds = []
) {

  const normalizedSourceId =
    normalizeId(
      sourceId
    );


  if (!normalizedSourceId) {

    throw new Error(
      "No se puede generar un ID Fakemon desde una especie sin ID."
    );
  }


  const usedIds =
    new Set(
      [
        ...occupiedIds
      ]
        .map(
          normalizeId
        )
        .filter(
          Boolean
        )
    );


  const base =
    `${normalizedSourceId}-variant`;


  if (
    !usedIds.has(
      base
    )
  ) {
    return base;
  }


  let suffix =
    2;


  while (
    usedIds.has(
      `${base}-${suffix}`
    )
  ) {
    suffix +=
      1;
  }


  return `${base}-${suffix}`;
}


function compareSpecies(
  left,
  right
) {

  return String(
    left?.name ??
    left?.id ??
    ""
  ).localeCompare(
    String(
      right?.name ??
      right?.id ??
      ""
    ),
    "en",
    {
      sensitivity:
        "base"
    }
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