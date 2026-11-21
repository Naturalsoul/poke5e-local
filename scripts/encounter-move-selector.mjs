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
// Self-drawbacks that make a nuke worse than its dice: a charge or recharge turn (in its activation), exhaustion, recoil.
const CHARGE = /charge/i;
const DRAWBACK = /consecutive turns|action on your next turn|on your next turn, if you keep|exhausts you|next attack is done at disadvantage|recoil/i;
const concentrates = move => /concentration/i.test(move?.duration ?? "");
// Offensive setup: one turn spent pays off in every attack after it (Dragon Dance, Nasty Plot, Belly Drum).
// A bonus, never a penalty: Charm and Sand Attack add -2 or -1 to the target's attack rolls.
const SETUP = /double your (proficiency|STAB)|advantage on any attacks|\+\d to [^.]*attack (and damage )?rolls|add (1d4|a d4) to (all|any) attack rolls?|add proficiency to all damage|increase your (strength|dexterity|constitution|intelligence|wisdom|charisma) score/i;
// Only on its first turn in combat (Fake Out): the lead's opener.
const OPENER = /first turn that the user has entered combat/i;

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
  // Swagger and Flatter raise a target's attacks to confuse it: that's a status Move.
  if (SETUP.test(text) && !damage && !tags.has("status")) {tags.add("setup");}
  if (OPENER.test(text)) {tags.add("opener");}
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
  pressure: { es: "Presión", hint: "usa acciones adicionales y reacciones para atacar fuera de turno" },
  sweeper: { es: "Barredor", hint: "se potencia en su primer turno y después barre con su STAB" }
});

// The role a finished moveset plays (any moveset, also one chosen by hand).
export function roleOf(moves, pokemon, level) {
  const tags = moves.map(move => moveTags(move, pokemon, level));
  if (tags.some(each => each.has("field"))) {return "setter";}
  if (tags.some(each => each.has("setup"))) {return "sweeper";}
  // Only control picks status Moves on purpose; the others take one only when nothing else is left.
  // A real status condition, or two support Moves: one Sand Attack doesn't make a control Pokémon.
  const support = tags.filter(each => !each.has("damage") && ["status", "debuff", "heal"].some(tag => each.has(tag)));
  if (support.some(each => each.has("status")) || support.length >= 2) {return "control";}
  if (tags.some(each => each.has("hazard") || (each.has("fast") && each.has("damage")))) {return "pressure";}
  return "attacker";
}

// Damage that lasts: few PP and self-drawbacks lower a Move (Hyper Beam, Overheat).
const sustainedScore = (move, pokemon, level) => scoreMove(move, pokemon, level) *
  Math.min(1, ((Number(move.pp) || 5) + 3) / 10) *
  (CHARGE.test(move.activation?.raw ?? "") || DRAWBACK.test(describe(move)) ? 0.7 : 1);

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
    // Only a weather or terrain that powers its team: sandstorm or hail would hurt teammates of other types.
    setter: fields.filter(each => teamTypes.has(FIELD_TYPES[each.move.id])).length,
    // A real status condition (sleep, paralysis…): Leer or Tail Whip alone don't make a control Pokémon.
    control: tagged.some(each => !each.tags.has("damage") && each.tags.has("status"))
      ? tagged.filter(each => !each.tags.has("damage") && ["status", "debuff", "heal"].some(tag => each.tags.has(tag))).length
      : 0,
    pressure: tagged.filter(each => each.tags.has("hazard") || (each.tags.has("fast") && each.tags.has("damage"))).length,
    sweeper: tagged.filter(each => each.tags.has("setup")).length
  };
}

// The roles a trainer's team should have, in order: an attacker first (the ace), then a setter, control, a sweeper, pressure.
const ROLE_ORDER = ["attacker", "setter", "control", "sweeper", "pressure", "control"];

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
  // One concentration Move at most: a second would end the first.
  const open = filter => tagged.filter(each => !chosen.includes(each.move) &&
    !(concentrates(each.move) && chosen.some(concentrates)) && filter(each));
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
    take(open(each => each.tags.has("field") && teamTypes.has(FIELD_TYPES[each.move.id]))[0]?.move);
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
  } else if (role === "sweeper") {
    take(pickUtility(each => each.tags.has("setup")));
    take(stab());
    take(cover());
    take(otherType());
  } else {
    take(stab());
    take(cover());
    take(otherType());
    take(pickUtility(each => each.tags.has("buff") && !each.tags.has("status") && !each.tags.has("setup")));
  }
  // A setup Move outside the sweeper would read back as one.
  while (chosen.length < count) {
    const next = otherType() ?? pickDamage(() => true) ??
      pickUtility(each => each.tags.size > 0 && freshCondition(each) && (role === "sweeper" || !each.tags.has("setup")));
    if (!next) {break;}
    take(next);
  }
  return { role, moves: chosen };
}

/*
 * The DM's game plan for one trainer: who opens, who controls, who presses and who finishes, with the Moves for it.
 * `members`: [{ name, role, moves }]. Returns lines of text.
 */
export function teamTactics(members, language = "es", { weakTo = [], onField = 1 } = {}) {
  const name = move => move?.name?.[language] ?? move?.name?.en ?? move?.id;
  const { order, ace } = battleOrder(members);
  // The first ones out together (the ace held back while others remain), the rest as those faint; all of them
  // when the trainer sends its whole team at once.
  const all = order.length > 1 && Number(onField) >= order.length;
  const together = all ? order.length : Math.max(1, Math.min(Number(onField) || 1, order.length > 1 ? order.length - 1 : 1));
  const lines = order.map((member, index) => {
    const role = MOVE_ROLES[member.role] ?? MOVE_ROLES.attacker;
    const tagsOf = move => moveTags(move, member.pokemon, member.level);
    const key = member.moves.find(move => {
      const tags = tagsOf(move);
      return { setter: tags.has("field"), control: tags.has("status"), pressure: tags.has("fast") || tags.has("hazard"),
        sweeper: tags.has("setup") }[member.role];
    }) ?? member.moves[0];
    const parts = [`${member.name} (${role.es}${member === ace ? ", As" : ""}): ${role.hint}.`];
    if (key) {parts.push(`Move clave: ${name(key)}.`);}
    if (index < together && (all || member !== ace)) {
      const opener = member.moves.find(move => tagsOf(move).has("opener"));
      if (ENTRY_ABILITIES.has(member.abilityId)) {parts.push(`${member.abilityName ?? member.abilityId} actúa al entrar.`);}
      if (opener) {parts.push(`Abre con ${name(opener)}.`);}
    }
    if (member === ace) {
      // The coverage the players won't expect from its type (Gyarados's Earthquake).
      const surprise = member.moves.find(move => tagsOf(move).has("damage") && weakTo.includes(move.type) &&
        !(member.pokemon?.types ?? []).includes(move.type));
      if (surprise) {parts.push(`Move sorpresa: ${name(surprise)}, guárdalo para cuando el grupo no lo espere.`);}
      if (member.itemName) {parts.push(`Lleva ${member.itemName}.`);}
    }
    return parts.join(" ");
  });
  if (order.length < 2) {return lines;}
  const names = list => list.map(member => member.name).join(", ");
  const first = order.slice(0, together);
  const middle = order.slice(together, -1);
  const head = all ? `Salen todos a la vez: ${names(order)}.` : [
    `${together > 1 ? "Salen juntos" : "Sale primero"}: ${names(first)}.`,
    middle.length ? `Después, al caer alguno: ${names(middle)}.` : "",
    `El As, ${ace.name}, entra al final.`
  ].filter(Boolean).join(" ");
  return [head, ...lines];
}

// A trainer's ace: the one the archetype marked, or else the first of the highest level (rows, members or entries).
export const aceOf = list => list.find(each => each.ace) ??
  list.reduce((best, each) => (!best || Number(each.level) > Number(best.level) ? each : best), null);

// Abilities that act as the Pokémon enters: worth leading with (Intimidate, the weather and terrain setters).
const ENTRY_ABILITIES = new Set([
  "intimidate", "drizzle", "drought", "sand-stream", "snow-warning",
  "electric-surge", "grassy-surge", "misty-surge", "psychic-surge"
]);

/*
 * Who goes out first and last, as boss trainers do: the ace (the one marked, or the highest level) last; the lead an
 * entry ability, a Fake Out, the setter or the control; the others setter, control, pressure, sweeper, attacker.
 */
export function battleOrder(members) {
  if (!members.length) {return { order: [], lead: null, ace: null };}
  const ace = aceOf(members);
  const rest = members.filter(member => member !== ace);
  const opens = member => member.moves.some(move => OPENER.test(describe(move)));
  const lead = rest.find(member => ENTRY_ABILITIES.has(member.abilityId)) ?? rest.find(opens) ??
    rest.find(member => member.role === "setter") ?? rest.find(member => member.role === "control") ?? rest[0] ?? null;
  const rank = ["setter", "control", "pressure", "sweeper", "attacker"];
  const middle = rest.filter(member => member !== lead).sort((left, right) => rank.indexOf(left.role) - rank.indexOf(right.role));
  return { order: [lead, ...middle, ace].filter(Boolean), lead: lead ?? ace, ace };
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