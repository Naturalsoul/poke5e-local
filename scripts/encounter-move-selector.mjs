import { clampInteger } from "./numbers.mjs";

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

/*
 * Every Move a Pokémon can know at a level: its level-up Moves up to it and, if allowed, its egg Moves and its TMs
 * (a trainer's Pokémon can be taught those).
 */
export function learnableMoveIds(
  pokemon,
  level,
  { egg = true, tm = true } = {}
) {
  return [
    ...new Set([
      ...collectAvailableMoveIds(pokemon, level),
      ...(egg ? pokemon?.learnset?.eggMoveIds ?? [] : []).map(String),
      ...(tm ? pokemon?.learnset?.tms ?? [] : []).map(each => String(each.moveId))
    ])
  ].filter(id => id && id !== STRUGGLE_MOVE_ID);
}

const averageDice = dice => {
  const match = /(\d+)d(\d+)/.exec(String(dice ?? ""));
  return match ? Number(match[1]) * (Number(match[2]) + 1) / 2 : 0;
};

// The dice a damaging Move rolls at a level (they grow at 5, 10 and 17).
const diceAt = (move, level) => {
  const tiers = Object.entries(move.damage?.dice ?? {})
    .map(([from, dice]) => [Number(from), dice])
    .filter(([from]) => from <= level)
    .sort(([left], [right]) => right - left);
  return averageDice(tiers[0]?.[1]);
};

/*
 * How good a damaging Move is for this Pokémon at this level: its average dice, with STAB, hitting an area, and
 * powered by one of its best ability scores. Status Moves score 0.
 */
export function scoreMove(move, pokemon, level) {
  // Damage of a type: healing and the like aren't damage.
  const dice = Array.isArray(move.damage?.type) && move.damage.type.length ? diceAt(move, level) : 0;
  if (!dice) {return 0;}
  const scores = pokemon?.combat?.attributes ?? {};
  const best = Math.max(0, ...Object.values(scores).map(Number).filter(Number.isFinite));
  // An array of scores, or "none", "any" or "varies": the latter two as its best, none as no fit.
  const abilities = Array.isArray(move.powerAbilities) ? move.powerAbilities : [];
  const power = ["any", "varies"].includes(move.powerAbilities)
    ? best
    : Math.max(0, ...abilities.map(ability => Number(scores[ability]) || 0));
  return dice *
    ((pokemon?.types ?? []).includes(move.type) ? 1.5 : 1) *
    (/cone|line|radius|sphere|cube|burst/i.test(move.range?.raw ?? "") || move.area ? 1.2 : 1) *
    (power >= best - 1 ? 1.1 : 1);
}

/**
 * The best moveset from the Moves it can learn (level-up and, as allowed, egg and TM): its strongest STAB Move, a super effective one
 * against the players' Pokémon if it can, the strongest of other types (one per type), and a status Move; then the
 * strongest left.
 */
export function selectBestMoves({
  pokemon,
  moves,
  level,
  coverageTypes = [],
  sources = {},
  maxMoves = MAX_MOVES,
  random = Math.random
}) {
  const moveIndex = createMoveIndex(moves);
  const learnable = learnableMoveIds(pokemon, level, sources).map(id => moveIndex.get(id)).filter(Boolean);
  const count = clampInteger(maxMoves, 0, MAX_MOVES, MAX_MOVES);
  const damaging = learnable
    .map(move => ({ move, score: scoreMove(move, pokemon, level) }))
    .filter(each => each.score > 0)
    .sort((left, right) => right.score - left.score)
    .map(each => each.move);
  const status = shuffle(learnable.filter(move => !scoreMove(move, pokemon, level)), random);
  const chosen = [];
  const take = move => {
    if (move && chosen.length < count && !chosen.includes(move)) {chosen.push(move);}
  };
  take(damaging.find(move => (pokemon?.types ?? []).includes(move.type)));
  take(damaging.find(move => coverageTypes.includes(move.type)));
  for (const move of damaging) {
    if (chosen.length >= count - (status.length ? 1 : 0)) {break;}
    if (!chosen.some(each => each.type === move.type)) {take(move);}
  }
  take(status[0]);
  damaging.forEach(take);
  return chosen;
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