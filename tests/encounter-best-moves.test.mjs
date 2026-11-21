import assert from "node:assert/strict";
import test from "node:test";

const { battleOrder, learnableMoveIds, moveTags, roleOf, scoreMove, selectTeamMoves, teamTactics } = await import("../scripts/encounter-move-selector.mjs");

const move = (id, type, dice, extra = {}) => ({ id, type, powerAbilities: ["str"], damage: dice ? { dice: { 1: dice }, type: [type] } : null, ...extra });
const moves = [
  move("tackle", "normal", "1d6"), move("ember", "fire", "1d8"), move("flame-burst", "fire", "2d8"),
  move("growl", "normal", null), move("thunder-punch", "electric", "2d6"), move("overheat", "fire", "4d10"),
  move("rest", "psychic", null, { damage: { dice: { 1: "4d6" }, type: "healing" } })
];
const pokemon = {
  id: "charmander", types: ["fire"], combat: { attributes: { str: 14, dex: 12 } },
  learnset: { level: [{ level: 1, moveIds: ["tackle", "ember", "growl", "rest"] }, { level: 6, moveIds: ["flame-burst"] }],
    eggMoveIds: ["thunder-punch"], tms: [{ id: 35, moveId: "overheat" }] }
};

test("learnable: level-up up to the level, egg Moves and TMs as allowed", () => {
  assert.deepEqual(learnableMoveIds(pokemon, 5, { tm: false }).sort(), ["ember", "growl", "rest", "tackle", "thunder-punch"]);
  assert.ok(learnableMoveIds(pokemon, 5).includes("overheat"));
});

test("scores: dice, STAB, and healing is not damage", () => {
  assert.ok(scoreMove(moves[1], pokemon, 5) > scoreMove(moves[0], pokemon, 5), "STAB ember over tackle");
  assert.equal(scoreMove(moves[6], pokemon, 5), 0, "rest heals");
});

// A small team: two who can set weather, one who can paralyze, one fast attacker.
const util = (id, type, description, extra = {}) => ({ id, type, powerAbilities: "none", damage: null,
  description: { en: [description] }, range: { raw: "60ft" }, ...extra });
const teamMoves = [
  ...moves,
  util("sunny-day", "fire", "Harsh sunlight for 5 rounds.", { range: { raw: "self" } }),
  util("self-rest", "psychic", "You fall asleep and regain all hit points.", { range: { raw: "self" } }),
  util("rain-dance", "water", "A heavy rainfall for 5 rounds.", { range: { raw: "self" } }),
  util("thunder-wave", "electric", "The target must make a CON save or become paralyzed.", { save: { attribute: ["con"] } }),
  util("glare", "normal", "The target must make a CON save or become paralyzed.", { save: { attribute: ["con"] } }),
  move("water-gun", "water", "1d6"),
  util("swords-dance", "normal", "Increasing your AC by 1.", { duration: "1 minute, concentration", range: { raw: "self" } }),
  move("fire-focus", "fire", "3d8", { duration: "concentration" }),
  move("quick-attack", "normal", "1d4", { activation: { raw: "1 bonus action", type: "bonus" } })
];
const species = (id, types, moveIds) => ({ id, types, combat: { attributes: { str: 14, dex: 12 } },
  learnset: { level: [{ level: 1, moveIds }] } });
const team = [
  species("charmander", ["fire"], ["ember", "flame-burst", "tackle", "sunny-day", "growl", "swords-dance", "fire-focus"]),
  species("squirtle", ["water"], ["water-gun", "tackle", "rain-dance", "growl"]),
  species("pikachu", ["electric"], ["thunder-punch", "thunder-wave", "glare", "quick-attack"]),
  species("rattata", ["normal"], ["tackle", "quick-attack", "growl"])
];
const plan = (random = () => 0) => team.reduce((chosen, member) => [...chosen, { pokemon: member, level: 6,
  ...selectTeamMoves({ pokemon: member, moves: teamMoves, level: 6, teammates: chosen, coverageTypes: ["electric"], random }) }], []);

test("tags: weather is a field, a CON save to paralyze is a status, a bonus action is fast", () => {
  const byId = id => teamMoves.find(each => each.id === id);
  assert.ok(moveTags(byId("sunny-day"), team[0], 6).has("field"));
  assert.ok(moveTags(byId("thunder-wave"), team[2], 6).has("status"));
  assert.ok(moveTags(byId("quick-attack"), team[3], 6).has("fast"));
  assert.ok(!moveTags(byId("self-rest"), team[0], 6).has("status"), "it puts itself asleep");
});

test("team: different roles, one weather, no repeated status condition", () => {
  for (const random of [() => 0, () => 0.99, Math.random]) {
    const members = plan(random);
    const roles = members.map(each => each.role);
    assert.equal(new Set(roles).size, roles.length, roles.join(", "));
    assert.ok(roles.includes("setter"), roles.join(", "));
    const ids = members.flatMap(each => each.moves.map(m => m.id));
    assert.equal(ids.filter(id => ["sunny-day", "rain-dance"].includes(id)).length, 1, ids.join(", "));
    assert.ok(ids.filter(id => ["thunder-wave", "glare"].includes(id)).length <= 1, ids.join(", "));
    members.forEach(each => assert.ok(each.moves.length <= 4));
    members.forEach(each => assert.ok(each.moves.filter(m => /concentration/.test(m.duration ?? "")).length <= 1, each.pokemon.id));
  }
});

test("team: the role read back from a moveset, and a tactics line per Pokémon", () => {
  const members = plan();
  members.forEach(each => assert.equal(roleOf(each.moves, each.pokemon, each.level), each.role, each.pokemon.id));
  const lines = teamTactics(members.map(each => ({ ...each, name: each.pokemon.id })));
  assert.equal(lines.length, 5);
  assert.match(lines[0], /^Sale primero: \w+\. Después, al caer alguno: .*El As, \w+, entra al final\.$/);
  assert.match(lines.at(-1), /, As\)/);
  const together = teamTactics(members.map(each => ({ ...each, name: each.pokemon.id })), "es", { onField: 2 });
  assert.match(together[0], /^Salen juntos: \w+, \w+\./);
});

test("sweeper: an offensive setup Move makes the role, and it reads back", () => {
  const dance = util("dragon-dance", "dragon", "For the duration, double your proficiency bonus when making an attack.",
    { duration: "1 minute, concentration", range: { raw: "self" } });
  const gyarados = species("gyarados", ["water"], ["water-gun", "tackle", "dragon-dance", "thunder-punch"]);
  const picked = selectTeamMoves({ pokemon: gyarados, moves: [...teamMoves, dance], level: 6, teammates: plan().slice(0, 3),
    random: () => 0 });
  assert.equal(picked.role, "sweeper");
  assert.ok(picked.moves.some(each => each.id === "dragon-dance"));
  assert.equal(roleOf(picked.moves, gyarados, 6), "sweeper");
});

test("battle order: an entry ability leads, the ace goes last with its surprise Move and item", () => {
  const members = plan().map(each => ({ ...each, name: each.pokemon.id }));
  members[3] = { ...members[3], abilityId: "drought", abilityName: "Drought" };
  members[1] = { ...members[1], abilityId: "intimidate", abilityName: "Intimidate" };
  members[0] = { ...members[0], level: 9, itemName: "Sitrus Berry" };
  const { order, lead, ace } = battleOrder(members);
  assert.equal(lead.name, "rattata");
  assert.equal(ace.name, "charmander");
  assert.equal(order.at(-1), ace);
  const lines = teamTactics(members, "es", { weakTo: ["electric"] });
  assert.match(lines[1], /^rattata .*Drought actúa al entrar/);
  assert.match(lines.find(line => line.startsWith("squirtle")), /Intimidate: guárdalo para el ataque más fuerte/);
  assert.ok(!lines.some(line => /Intimidate actúa al entrar/.test(line)));
  const aceLine = lines.at(-1);
  assert.match(aceLine, /charmander \(\w+, As\)/);
  assert.match(aceLine, /Lleva Sitrus Berry/);
});

test("battle order: the whole team on the field goes out at once, with no ace held back", () => {
  const members = plan().map(each => ({ ...each, name: each.pokemon.id }));
  const [head] = teamTactics(members, "es", { onField: 4 });
  assert.match(head, /^Salen todos a la vez: \w+, \w+, \w+, \w+\.$/);
});

test("control: the key Move inflicts a real status, not a save that does nothing to the target", () => {
  const snatch = util("snatch", "dark", "The target must make a WIS save or you steal its next beneficial Move.", { save: { attribute: ["wis"] } });
  const glare = util("scary-face", "normal", "The target must make a WIS save or become frightened.", { save: { attribute: ["wis"] } });
  const wave = util("thunder-wave", "electric", "The target must make a CON save or become paralyzed.", { save: { attribute: ["con"] } });
  const pichu = species("pichu", ["electric"], ["snatch", "scary-face", "thunder-wave", "thunder-punch"]);
  for (const random of [() => 0, () => 0.99]) {
    const picked = selectTeamMoves({ pokemon: pichu, moves: [...teamMoves, snatch, glare, wave], level: 6,
      teammates: plan().slice(0, 2), random });
    if (picked.role !== "control") {continue;}
    assert.equal(picked.moves[0].id, "thunder-wave", picked.moves.map(each => each.id).join(", "));
  }
});
