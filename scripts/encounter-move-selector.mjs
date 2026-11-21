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

// Weather and terrain Moves, and the type each one powers up.
const FIELD_TYPES = Object.freeze({
  "sunny-day": "fire", "rain-dance": "water", sandstorm: "rock", hail: "ice", snowscape: "ice",
  "electric-terrain": "electric", "grassy-terrain": "grass", "misty-terrain": "fairy", "psychic-terrain": "psychic"
});
const CONDITIONS = ["paralyzed", "poisoned", "burned", "asleep", "frozen", "confused", "flinch", "frightened", "charmed"];
const HAZARD = /switched into battle|enters? the (battle|area)/i;
const PROTECT = /avoid the damage/i;
const DEBUFF = /disadvantage on|reduc\w+ (its|their|the target)|-\d to (its|their)/i;
const BUFF = /your AC by|increas\w+ your|you have advantage|you gain \+|\+\d to your|bonus to your/i;
const HEAL = /(regain|recover|restore)\w* [^.]*hit points/i;
// Self-drawbacks that make a nuke worse than its dice: a charge or recharge turn, exhaustion, recoil.
const DRAWBACK = /charge|consecutive turns|on your next turn|exhausts you|next attack is done at disadvantage|recoil/i;

const describe = move => JSON.stringify(move?.description?.en ?? "");
const conditionOf = move => CONDITIONS.find(each => describe(move).toLowerCase().includes(each)) ?? null;

/*
 * What a Move does in a team plan, from its own fields first (activation, save, healing) and its description last:
 * damage, field (weather/terrain), status (with the condition), debuff, buff, heal, protect, hazard, fast (bonus or
 * reaction).
 */
export function moveTags(move, pokemon, level) {
  const text = describe(move);
  const damage = scoreMove(move, pokemon, level) > 0;
  const tags = new Set();
  if (damage) {tags.add("damage");}
  if (FIELD_TYPES[move.id]) {tags.add("field");}
  // On others: Rest puts itself to sleep.
  const onSelf = /^self\b/i.test(move.range?.raw ?? "");
  if ((conditionOf(move) && !onSelf) || (move.save && !damage)) {tags.add("status");}
  if (DEBUFF.test(text)) {tags.add("debuff");}
  if (BUFF.test(text) && !damage) {tags.add("buff");}
  if (move.damage?.type === "healing" || HEAL.test(text)) {tags.add("heal");}
  if (PROTECT.test(text)) {tags.add("protect");}
  if (HAZARD.test(text)) {tags.add("hazard");}
  if (/bonus|reaction/i.test(move.activation?.raw ?? move.activation?.type ?? "") && !tags.has("protect")) {tags.add("fast");}
  return tags;
}

export const MOVE_ROLES = Object.freeze({
  attacker: { es: "Atacante", hint: "remata con su STAB y su cobertura" },
  setter: { es: "Preparador", hint: "abre poniendo el clima o el terreno y se potencia" },
  control: { es: "Control", hint: "inutiliza al Pokémon más peligroso del grupo con estados" },
  pressure: { es: "Presión", hint: "usa acciones adicionales y reacciones para atacar fuera de turno" }
});

// The role a finished moveset plays (any moveset, also one chosen by hand).
export function roleOf(moves, pokemon, level) {
  const tags = moves.map(move => moveTags(move, pokemon, level));
  if (tags.some(each => each.has("field"))) {return "setter";}
  // Only control picks status Moves on purpose; the others take one only when nothing else is left.
  if (tags.some(each => ["status", "debuff", "heal"].some(tag => each.has(tag)) && !each.has("damage"))) {
    return "control";
  }
  if (tags.some(each => each.has("hazard") || (each.has("fast") && each.has("damage")))) {return "pressure";}
  return "attacker";
}

// Damage that lasts: few PP and self-drawbacks lower a Move (Hyper Beam, Overheat).
const sustainedScore = (move, pokemon, level) => scoreMove(move, pokemon, level) *
  Math.min(1, ((Number(move.pp) || 5) + 3) / 10) *
  (DRAWBACK.test(`${move.activation?.raw ?? ""} ${describe(move)}`) ? 0.7 : 1);

// One of the near-best (within 85% of the top), not always the same one.
const pickNearBest = (scored, random) => {
  if (!scored.length) {return null;}
  const top = Math.max(...scored.map(each => each.score));
  const near = scored.filter(each => each.score >= top * 0.85);
  return near[Math.floor(random() * near.length)].move;
};

// How well a Pokémon fills each role, from what it can learn and what its teammates are.
function roleFit(learnable, pokemon, level, teamTypes) {
  const tagged = learnable.map(move => ({ move, tags: moveTags(move, pokemon, level) }));
  const fields = tagged.filter(each => each.tags.has("field"));
  return {
    attacker: 1,
    setter: fields.length ? 2 + fields.filter(each => teamTypes.has(FIELD_TYPES[each.move.id])).length : 0,
    control: tagged.filter(each => !each.tags.has("damage") && ["status", "debuff", "heal"].some(tag => each.tags.has(tag))).length,
    pressure: tagged.filter(each => each.tags.has("hazard") || (each.tags.has("fast") && each.tags.has("damage"))).length
  };
}

// The roles a trainer's team should have, in order: an attacker first (the ace), then a setter, control, pressure.
const ROLE_ORDER = ["attacker", "setter", "control", "pressure", "attacker", "control"];

/**
 * A moveset with a role in its trainer's team. `teammates` are the Pokémon already chosen ({ pokemon, level, moves,
 * role? }, the role read from the Moves when missing):
 * this one takes the first role of ROLE_ORDER they don't have that it can fill, and the team never repeats a weather
 * or terrain, a status condition or a covering type (the players' weaknesses go round the team).
 * Returns { role, moves }.
 */
export function selectTeamMoves({
  pokemon,
  moves,
  level,
  teammates = [],
  coverageTypes = [],
  sources = {},
  maxMoves = MAX_MOVES,
  random = Math.random
}) {
  const moveIndex = createMoveIndex(moves);
  const learnable = learnableMoveIds(pokemon, level, sources).map(id => moveIndex.get(id)).filter(Boolean);
  const count = clampInteger(maxMoves, 0, MAX_MOVES, MAX_MOVES);
  const ownTypes = pokemon?.types ?? [];
  const teamTypes = new Set([...ownTypes, ...teammates.flatMap(each => each.pokemon?.types ?? [])]);
  const taken = teammates.flatMap(each => each.moves ?? []);
  const fieldTaken = taken.some(move => FIELD_TYPES[move.id]);
  const conditionsTaken = new Set(taken.map(conditionOf).filter(Boolean));
  const coveredTaken = new Set(taken.filter(move => move.damage && coverageTypes.includes(move.type)).map(move => move.type));
  const roles = teammates.map(each => each.role ?? roleOf(each.moves ?? [], each.pokemon, each.level));

  const fit = roleFit(learnable.filter(move => !(fieldTaken && FIELD_TYPES[move.id])), pokemon, level, teamTypes);
  const missing = [...ROLE_ORDER];
  roles.forEach(role => {
    const at = missing.indexOf(role);
    if (at >= 0) {missing.splice(at, 1);}
  });
  const role = missing.find(each => fit[each] > 0) ?? "attacker";

  // Only the setter brings the team's one weather or terrain.
  const tagged = learnable
    .map(move => ({ move, tags: moveTags(move, pokemon, level), score: sustainedScore(move, pokemon, level) }))
    .filter(each => !each.tags.has("field") || (role === "setter" && !fieldTaken));
  const chosen = [];
  const take = move => {
    if (move && chosen.length < count && !chosen.includes(move)) {chosen.push(move);}
  };
  const open = filter => tagged.filter(each => !chosen.includes(each.move) && filter(each));
  const pickDamage = filter => pickNearBest(open(each => each.tags.has("damage") && filter(each)), random);
  const pickUtility = filter => {
    const options = open(each => !each.tags.has("damage") && filter(each));
    return options.length ? options[Math.floor(random() * options.length)].move : null;
  };
  const freshCondition = each => {
    const condition = conditionOf(each.move);
    return !condition || (!conditionsTaken.has(condition) && !chosen.some(move => conditionOf(move) === condition));
  };
  const coverType = coverageTypes.find(type => !coveredTaken.has(type) && !ownTypes.includes(type)) ?? coverageTypes[0];
  const stab = () => pickDamage(each => ownTypes.includes(each.move.type));
  const cover = () => pickDamage(each => each.move.type === coverType) ??
    pickDamage(each => coverageTypes.includes(each.move.type));
  const otherType = () => pickDamage(each => !chosen.some(move => move.type === each.move.type));

  if (role === "setter") {
    const fields = open(each => each.tags.has("field") && !fieldTaken);
    take((fields.find(each => teamTypes.has(FIELD_TYPES[each.move.id])) ?? fields[0])?.move);
    take(stab());
    take(pickUtility(each => each.tags.has("buff")));
    take(cover());
  } else if (role === "control") {
    take(pickUtility(each => each.tags.has("status") && freshCondition(each)) ?? pickUtility(each => each.tags.has("status")));
    take(stab());
    take(pickUtility(each => ["debuff", "heal", "protect"].some(tag => each.tags.has(tag))));
    take(cover());
  } else if (role === "pressure") {
    take(pickDamage(each => each.tags.has("fast")));
    take(stab());
    take(pickUtility(each => each.tags.has("hazard")) ?? pickDamage(each => each.tags.has("hazard")));
    take(cover());
  } else {
    take(stab());
    take(cover());
    take(otherType());
    take(pickUtility(each => each.tags.has("buff") && !each.tags.has("status")));
  }
  while (chosen.length < count) {
    const next = otherType() ?? pickDamage(() => true) ?? pickUtility(freshCondition);
    if (!next) {break;}
    take(next);
  }
  return { role, moves: chosen };
}

/*
 * The DM's game plan for one trainer: who opens, who controls, who presses and who finishes, with the Moves for it.
 * `members`: [{ name, role, moves }]. Returns lines of text.
 */
export function teamTactics(members, language = "es") {
  const name = move => move?.name?.[language] ?? move?.name?.en ?? move?.id;
  const order = ["setter", "control", "pressure", "attacker"];
  return [...members]
    .sort((left, right) => order.indexOf(left.role) - order.indexOf(right.role))
    .map(member => {
      const role = MOVE_ROLES[member.role] ?? MOVE_ROLES.attacker;
      const key = member.moves.find(move => {
        const tags = moveTags(move, member.pokemon, member.level);
        return { setter: tags.has("field"), control: tags.has("status"), pressure: tags.has("fast") || tags.has("hazard") }[member.role];
      }) ?? member.moves[0];
      return `${member.name} (${role.es}): ${role.hint}${key ? ` — ${name(key)}` : ""}.`;
    });
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