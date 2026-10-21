const MAX_MOVES = 4;
const STRUGGLE_MOVE_ID =
  "struggle";

export function selectEncounterMoves({
  pokemon,
  moves,
  level,
  maxMoves = MAX_MOVES,
  // Attacking types that are super effective against the players' Pokémon: one damaging Move of them, if it can.
  coverageTypes = [],
  random = Math.random
}) {
  if (!pokemon?.id) {
    throw new Error(
      "selectEncounterMoves requiere un Pokémon normalizado válido."
    );
  }

  const moveIndex =
    createMoveIndex(
      moves
    );

  const availableIds =
    collectAvailableMoveIds(
      pokemon,
      level
    );

  const candidates =
    availableIds
      .filter(
        moveId =>
          moveId !==
          STRUGGLE_MOVE_ID
      )
      .map(
        moveId =>
          moveIndex.get(
            moveId
          )
      )
      .filter(Boolean);

  const selected =
    shuffle(
      candidates,
      random
    );

  const count =
    clampInteger(
      maxMoves,
      0,
      MAX_MOVES,
      MAX_MOVES
    );

  const covers = move =>
    move.damage &&
    coverageTypes.includes(
      move.type
    );

  const coverage =
    selected.findIndex(
      covers
    );

  // Brings the first covering Move into the last slot when none made it.
  if (
    count > 0 &&
    coverage >= count
  ) {
    [
      selected[count - 1],
      selected[coverage]
    ] = [
      selected[coverage],
      selected[count - 1]
    ];
  }

  return selected.slice(
    0,
    count
  );
}

export function collectAvailableMoveIds(
  pokemon,
  level
) {
  const targetLevel =
    clampInteger(
      level,
      1,
      20,
      1
    );

  const groups =
    Array.isArray(
      pokemon?.learnset?.level
    )
      ? pokemon.learnset.level
      : [];

  const ids = [];

  for (
    const group
    of groups
  ) {
    const groupLevel =
      Number(
        group?.level
      );

    if (
      !Number.isFinite(
        groupLevel
      ) ||
      groupLevel >
        targetLevel
    ) {
      continue;
    }

    for (
      const moveId
      of Array.isArray(
        group?.moveIds
      )
        ? group.moveIds
        : []
    ) {
      const normalizedId =
        String(
          moveId ?? ""
        ).trim();

      if (normalizedId) {
        ids.push(
          normalizedId
        );
      }
    }
  }

  return [
    ...new Set(ids)
  ];
}

function createMoveIndex(
  moves
) {
  if (
    moves instanceof Map
  ) {
    return moves;
  }

  const collection =
    Array.isArray(moves)
      ? moves
      : Array.isArray(
          moves?.moves
        )
        ? moves.moves
        : Array.isArray(
            moves?.items
          )
          ? moves.items
          : [];

  return new Map(
    collection
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
}

function shuffle(
  values,
  random
) {
  const result = [
    ...values
  ];

  for (
    let index =
      result.length - 1;
    index > 0;
    index -= 1
  ) {
    const swapIndex =
      Math.floor(
        random() *
        (index + 1)
      );

    [
      result[index],
      result[swapIndex]
    ] = [
      result[swapIndex],
      result[index]
    ];
  }

  return result;
}

function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(value);

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