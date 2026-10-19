import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildMovement, missingHoverMovementUpdate } from "../scripts/builder.mjs";

const { items: pokemon } = JSON.parse(readFileSync(new URL("../data/normalized/pokemon.json", import.meta.url), "utf8"));
const species = id => pokemon.find(entry => entry.id === id);
// The actor builder writes buildMovement(pokemon.combat.speed) as system.attributes.movement.
const movementOf = id => buildMovement(species(id).combat.speed);

test("every Pokémon gets the walking speed from its data and at least one way to move", () => {
  for (const entry of pokemon) {
    const movement = movementOf(entry.id);
    const walking = entry.combat.speed.find(speed => speed.type === "walking")?.value ?? 0;
    assert.equal(Number(movement.walk), walking, entry.id);
    assert.ok(["walk", "fly", "swim", "climb", "burrow"].some(key => Number(movement[key]) > 0), entry.id);
  }
});

test("hover speeds become a fly speed that hovers", () => {
  assert.deepEqual([movementOf("magnemite").fly, movementOf("magnemite").hover], [20, true]);
  assert.deepEqual([movementOf("gengar").walk, movementOf("gengar").fly, movementOf("gengar").hover], [35, 35, true]);
  assert.equal(movementOf("pidgey").hover, false);
});

test("the migration only fills in hover for movement that has no fly speed", () => {
  const gastly = species("gastly").combat.speed;
  assert.deepEqual(missingHoverMovementUpdate({ walk: "0", fly: "0", hover: false }, gastly),
    { "system.attributes.movement.fly": 25, "system.attributes.movement.hover": true });
  assert.equal(missingHoverMovementUpdate({ fly: "40", hover: false }, gastly), null, "hand-edited fly speed stays");
  assert.equal(missingHoverMovementUpdate({ fly: "0", hover: false }, species("bulbasaur").combat.speed), null);
});
