const PARTY_VERSION =
  2;


/* ============================================================
 * UUID COLLECTION
 * ============================================================ */

function normalizeUuids(
  values
) {

  if (
    !Array.isArray(
      values
    )
  ) {

    return [];
  }


  return [
    ...new Set(
      values
        .map(
          value =>
            String(
              value ??
              ""
            ).trim()
        )
        .filter(Boolean)
    )
  ];
}


function sameArray(
  left,
  right
) {

  if (
    !Array.isArray(
      left
    ) ||
    left.length !==
      right.length
  ) {

    return false;
  }


  return left.every(
    (
      value,
      index
    ) =>
      value ===
      right[index]
  );
}


/* ============================================================
 * INITIAL STATE
 * ============================================================ */

export function buildInitialTrainerPartyState() {

  return {

    version:
      PARTY_VERSION,

    pokemonUuids:
      [],

    activePokemonUuids:
      []
  };
}


/* ============================================================
 * NORMALIZATION
 * ============================================================ */

export function normalizeTrainerPartyState(
  state
) {

  const source =
    state &&
    typeof state ===
      "object"
      ? state
      : {};


  const pokemonUuids =
    normalizeUuids(
      source.pokemonUuids
    );


  const activeSource =
    Array.isArray(
      source.activePokemonUuids
    )
      ? source.activePokemonUuids
      : [
          source.activePokemonUuid
        ];


  const pokemonUuidSet =
    new Set(
      pokemonUuids
    );


  const activePokemonUuids =
    normalizeUuids(
      activeSource
    ).filter(
      uuid =>
        pokemonUuidSet.has(
          uuid
        )
    );


  return {

    version:
      PARTY_VERSION,

    pokemonUuids,

    activePokemonUuids
  };
}


/* ============================================================
 * MIGRATION CHECK
 * ============================================================ */

export function trainerPartyStateNeedsMigration(
  state
) {

  if (
    !state ||
    typeof state !==
      "object"
  ) {

    return true;
  }


  const normalized =
    normalizeTrainerPartyState(
      state
    );


  if (
    state.version !==
    PARTY_VERSION
  ) {

    return true;
  }


  if (
    Object.hasOwn(
      state,
      "activePokemonUuid"
    )
  ) {

    return true;
  }


  if (
    !sameArray(
      state.pokemonUuids,
      normalized.pokemonUuids
    )
  ) {

    return true;
  }


  return !sameArray(
    state.activePokemonUuids,
    normalized.activePokemonUuids
  );
}