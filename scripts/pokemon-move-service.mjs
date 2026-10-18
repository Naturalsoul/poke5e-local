import {
  STRUGGLE_MOVE_ID
} from "./struggle-rules.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";

const MODULE_ID =
  "poke5e-local";

const DEFAULT_MOVE_LIMIT =
  4;

const MAX_MOVE_LIMIT =
  6;

const MAX_EXTRA_MOVE_SLOTS =
  MAX_MOVE_LIMIT -
  DEFAULT_MOVE_LIMIT;


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertPokemon(
  pokemon
) {
  if (
    !isPokemonActor(
      pokemon
    )
  ) {
    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}


function normalizeCanonicalId(
  value
) {
  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


function uniqueCanonicalIds(
  values
) {
  return [
    ...new Set(
      values
        .map(
          normalizeCanonicalId
        )
        .filter(Boolean)
    )
  ];
}


/* ============================================================
 * MOVE ITEMS
 * ============================================================ */

function getMoveSourceId(
  item
) {
  if (
    item?.documentName !==
      "Item" ||
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !== "move"
  ) {
    return null;
  }

  return (
    normalizeCanonicalId(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      )
    ) ||
    null
  );
}


function getPokemonMoveItems(
  pokemon
) {
  assertPokemon(
    pokemon
  );

  return pokemon.items.filter(
    item =>
      Boolean(
        getMoveSourceId(
          item
        )
      )
  );
}


export function getPokemonAvailableMoves(
  pokemon
) {
  return getPokemonMoveItems(
    pokemon
  ).filter(
    item =>
      getMoveSourceId(
        item
      ) !==
        STRUGGLE_MOVE_ID
  );
}


export function getPokemonStruggleMove(
  pokemon
) {
  return (
    getPokemonMoveItems(
      pokemon
    ).find(
      item =>
        getMoveSourceId(
          item
        ) ===
          STRUGGLE_MOVE_ID
    ) ??
    null
  );
}


/* ============================================================
 * MOVE LIMIT
 * ============================================================ */

export function getPokemonExtraMoveSlots(
  pokemon
) {
  assertPokemon(
    pokemon
  );

  const stored =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "extraMoveSlots"
      ) ??
      0
    );

  if (
    !Number.isFinite(
      stored
    )
  ) {
    return 0;
  }

  return Math.min(
    MAX_EXTRA_MOVE_SLOTS,
    Math.max(
      0,
      Math.trunc(
        stored
      )
    )
  );
}


export function getPokemonMoveLimit(
  pokemon
) {
  return (
    DEFAULT_MOVE_LIMIT +
    getPokemonExtraMoveSlots(
      pokemon
    )
  );
}


export async function setPokemonExtraMoveSlots(
  pokemon,
  value
) {
  assertPokemon(
    pokemon
  );

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
      "extraMoveSlots debe ser un número."
    );
  }

  const extraMoveSlots =
    Math.min(
      MAX_EXTRA_MOVE_SLOTS,
      Math.max(
        0,
        Math.trunc(
          numeric
        )
      )
    );

  const nextLimit =
    DEFAULT_MOVE_LIMIT +
    extraMoveSlots;

  const knownMoveIds =
    getPokemonKnownMoveIds(
      pokemon
    );

  if (
    knownMoveIds.length >
    nextLimit
  ) {
    throw new Error(
      `${pokemon.name} conoce ${knownMoveIds.length} Moves y el nuevo límite sería ${nextLimit}.`
    );
  }

  await pokemon.setFlag(
    MODULE_ID,
    "extraMoveSlots",
    extraMoveSlots
  );

  return extraMoveSlots;
}


/* ============================================================
 * KNOWN MOVES
 * ============================================================ */

function availableMoveIds(
  pokemon
) {
  return getPokemonAvailableMoves(
    pokemon
  ).map(
    getMoveSourceId
  );
}


function defaultKnownMoveIds(
  pokemon
) {
  return availableMoveIds(
    pokemon
  ).slice(
    0,
    getPokemonMoveLimit(
      pokemon
    )
  );
}


export function getPokemonKnownMoveIds(
  pokemon
) {
  assertPokemon(
    pokemon
  );

  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "knownMoveIds"
    );

  if (
    !Array.isArray(
      stored
    )
  ) {
    return defaultKnownMoveIds(
      pokemon
    );
  }

  const available =
    new Set(
      availableMoveIds(
        pokemon
      )
    );

  return uniqueCanonicalIds(
    stored
  )
    .filter(
      moveId =>
        moveId !==
          STRUGGLE_MOVE_ID &&
        available.has(
          moveId
        )
    )
    .slice(
      0,
      getPokemonMoveLimit(
        pokemon
      )
    );
}


export function getPokemonKnownMoves(
  pokemon
) {
  const knownIds =
    new Set(
      getPokemonKnownMoveIds(
        pokemon
      )
    );

  return getPokemonAvailableMoves(
    pokemon
  ).filter(
    item =>
      knownIds.has(
        getMoveSourceId(
          item
        )
      )
  );
}


export function getPokemonBattleMoves(
  pokemon
) {
  const knownMoves =
    getPokemonKnownMoves(
      pokemon
    );

  const struggle =
    getPokemonStruggleMove(
      pokemon
    );

  return struggle
    ? [
        ...knownMoves,
        struggle
      ]
    : knownMoves;
}


export function isPokemonMoveKnown(
  pokemon,
  moveOrId
) {
  const moveId =
    typeof moveOrId ===
      "string"
      ? normalizeCanonicalId(
          moveOrId
        )
      : getMoveSourceId(
          moveOrId
        );

  if (!moveId) {
    return false;
  }

  if (
    moveId ===
    STRUGGLE_MOVE_ID
  ) {
    return Boolean(
      getPokemonStruggleMove(
        pokemon
      )
    );
  }

  return getPokemonKnownMoveIds(
    pokemon
  ).includes(
    moveId
  );
}


export async function setPokemonKnownMoveIds(
  pokemon,
  moveIds
) {
  assertPokemon(
    pokemon
  );

  if (
    !Array.isArray(
      moveIds
    )
  ) {
    throw new Error(
      "knownMoveIds debe ser un array."
    );
  }

  const requested =
    uniqueCanonicalIds(
      moveIds
    ).filter(
      moveId =>
        moveId !==
        STRUGGLE_MOVE_ID
    );

  const available =
    new Set(
      availableMoveIds(
        pokemon
      )
    );

  const unavailable =
    requested.find(
      moveId =>
        !available.has(
          moveId
        )
    );

  if (unavailable) {
    throw new Error(
      `${pokemon.name} no tiene disponible el Move ${unavailable}.`
    );
  }

  const limit =
    getPokemonMoveLimit(
      pokemon
    );

  if (
    requested.length >
    limit
  ) {
    throw new Error(
      `${pokemon.name} solo puede conocer ${limit} Moves a la vez.`
    );
  }

  await pokemon.setFlag(
    MODULE_ID,
    "knownMoveIds",
    requested
  );

  return requested;
}