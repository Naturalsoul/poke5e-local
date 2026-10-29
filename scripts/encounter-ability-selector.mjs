import { normalizeId } from "./ids.mjs";

export function listEncounterAbilities({
  pokemon,
  abilities,
  includeHidden = false
}) {
  return listEncounterAbilityCandidates({
    pokemon,
    abilities
  })
    .filter(
      candidate =>
        includeHidden ||
        !candidate.hidden
    )
    .map(
      candidate =>
        candidate.ability
    );
}


export function selectEncounterAbility({
  pokemon,
  abilities,
  currentAbilityId = null,
  allowHiddenAbilities = false,
  hiddenAbilityChancePercent = 5,
  random = Math.random
}) {
  const candidates =
    listEncounterAbilityCandidates({
      pokemon,
      abilities
    });


  const normalCandidates =
    candidates.filter(
      candidate =>
        !candidate.hidden
    );


  const hiddenCandidates =
    candidates.filter(
      candidate =>
        candidate.hidden
    );


  const hiddenChance =
    normalizePercentage(
      hiddenAbilityChancePercent
    );


  const hiddenEnabled =
    Boolean(
      allowHiddenAbilities
    ) &&
    hiddenChance > 0 &&
    hiddenCandidates.length > 0;


  if (
    !normalCandidates.length &&
    !hiddenEnabled
  ) {
    throw new Error(
      `El Pokémon ${String(
        pokemon?.id ??
        "desconocido"
      )} no tiene una Ability normal válida disponible.`
    );
  }


  const useHidden =
    hiddenEnabled &&
    (
      !normalCandidates.length ||
      normalizeRandom(
        random
      ) * 100 <
        hiddenChance
    );


  const preferred =
    useHidden
      ? hiddenCandidates
      : normalCandidates;


  const currentId =
    normalizeId(
      currentAbilityId
    );


  const selectable =
    currentId &&
    preferred.length > 1
      ? preferred.filter(
          candidate =>
            normalizeId(
              candidate.ability.id
            ) !==
            currentId
        )
      : preferred;


  const selected =
    selectable[
      Math.floor(
        normalizeRandom(
          random
        ) *
        selectable.length
      )
    ] ??
    selectable[0];


  if (!selected) {
    throw new Error(
      `No se pudo seleccionar una Ability válida para ${String(
        pokemon?.id ??
        "desconocido"
      )}.`
    );
  }


  return selected.ability;
}


function listEncounterAbilityCandidates({
  pokemon,
  abilities
}) {
  const abilityIndex =
    createAbilityIndex(
      abilities
    );


  const seen =
    new Set();


  const result =
    [];


  for (
    const reference
    of normalizeAbilityReferences(
      pokemon?.abilities
    )
  ) {
    if (
      seen.has(
        reference.id
      )
    ) {
      continue;
    }


    const ability =
      abilityIndex.get(
        reference.id
      );


    if (
      !ability ||
      ability.deprecated ===
        true
    ) {
      continue;
    }


    seen.add(
      reference.id
    );


    result.push({
      ability,

      hidden:
        reference.hidden
    });
  }


  return result;
}


function createAbilityIndex(
  source
) {
  if (
    source instanceof
      Map
  ) {
    return source;
  }


  const collection =
    Array.isArray(
      source
    )
      ? source
      : Array.isArray(
          source?.items
        )
        ? source.items
        : Array.isArray(
            source?.abilities
          )
          ? source.abilities
          : [];


  return new Map(
    collection
      .filter(
        ability =>
          ability?.id
      )
      .map(
        ability => [
          normalizeId(
            ability.id
          ),
          ability
        ]
      )
  );
}


function normalizeAbilityReferences(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  return value
    .map(
      entry => ({
        id:
          normalizeId(
            typeof entry ===
              "string"
              ? entry
              : entry?.id
          ),

        hidden:
          typeof entry ===
            "object" &&
          entry !==
            null
            ? entry.hidden ===
              true
            : false
      })
    )
    .filter(
      entry =>
        Boolean(
          entry.id
        )
    );
}


function normalizePercentage(
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
    return 0;
  }


  return Math.min(
    100,

    Math.max(
      0,
      numeric
    )
  );
}


function normalizeRandom(
  random
) {
  const value =
    Number(
      random()
    );


  if (
    !Number.isFinite(
      value
    )
  ) {
    return 0;
  }


  return Math.min(
    0.999999999999,

    Math.max(
      0,
      value
    )
  );
}