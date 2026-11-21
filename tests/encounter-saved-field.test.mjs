import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEncounterDefinition } from "../scripts/encounter-model.mjs";
import { ENCOUNTER_STRATEGY_FLAG, EncounterQueryService } from "../scripts/encounter-query-service.mjs";

test("a trainer's Pokémon on the field, its actions and the tactics plan come back with the saved encounter", () => {
  const definition = normalizeEncounterDefinition({ name: "Boss", location: "Cueva", type: "trainer",
    trainers: [{ id: "t1", name: "Giovanni", onField: 4, actions: 9, pokemon: [{ pokemonId: "rattata", level: 10 }] }] });
  assert.deepEqual([definition.trainers[0].onField, definition.trainers[0].actions], [4, 3]);

  const flags = (encounter, strategy) => ({ "poke5e-local": { encounter, [ENCOUNTER_STRATEGY_FLAG]: strategy } });
  const actor = (pokemonId, order, strategy) => {
    const data = flags({ key: "cueva::boss", name: "Boss", location: "Cueva", type: "trainer", pokemonId, level: 10, quantity: 1,
      entryKey: pokemonId, trainer: { id: "t1", name: "Giovanni", onField: 4, actions: 2, order } }, strategy);
    return { id: pokemonId, name: pokemonId, items: { get: () => null, find: () => null },
      getFlag: (scope, key) => data[scope]?.[key] };
  };
  globalThis.game = { actors: [actor("rattata", 0, "<h3>Plan táctico</h3>"), actor("zubat", 0, undefined)] };
  const loaded = new EncounterQueryService().get("cueva::boss");
  assert.equal(loaded.trainers[0].onField, 4);
  assert.equal(loaded.trainers[0].actions, 2);
  assert.equal(loaded.strategy, "<h3>Plan táctico</h3>");
  delete globalThis.game;
});
