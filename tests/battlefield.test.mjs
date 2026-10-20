import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
const chat = [];
globalThis.game = { user: { targets: new Set(), id: "gm", isGM: true }, users: { activeGM: null }, settings: { get: () => "es" }, combat: null };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
const field = await import("../scripts/battlefield-service.mjs");
const rider = await import("../scripts/rider-ability-engine.mjs");
const events = await import("../scripts/event-ability-engine.mjs");

function pokemon(abilityId, { types = ["normal"], dex = 10, level = 7, hp = 20, fly = 0 } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, name: abilityId, items: [createAbilityItem(abilityId)],
    flags: { [MODULE_ID]: { kind: "pokemon", types } },
    system: { abilities: { dex: { value: dex } }, details: { level }, attributes: { hp: { value: hp, max: 20 }, prof: 3, movement: { fly } } } });
  return actor;
}

function combat(actors, state = {}) {
  const flags = { [MODULE_ID]: { battlefield: state } };
  return { id: "c1", round: 2, combatants: actors.map(actor => ({ actor })),
    getFlag: (_module, key) => flags[MODULE_ID][key],
    setFlag: async (_module, key, value) => { flags[MODULE_ID][key] = { ...flags[MODULE_ID][key], ...value }; } };
}

test("weather Moves and the GM write it on the combat with its last round; Primal weathers lock it", async () => {
  game.combat = combat([pokemon("static")]);
  await field.setBattlefield({ weather: { id: "rain", rounds: 5 }, environment: "desert" });
  assert.equal(field.battlefield().weather.endsRound, 7);
  assert.equal(field.hasWeather("rain"), true);
  assert.equal(field.environment(), "desert");
  game.combat = combat([pokemon("desolate-land")], { weather: { id: "rain" } });
  assert.deepEqual(field.activeWeathers(), ["extreme-sun"]);
  assert.equal(field.hasWeather("sun"), true, "extreme sunlight is also sunlight");
  await field.setBattlefield({ weather: { id: "hail", rounds: 5 } });
  assert.equal(field.battlefield().weather.id, "rain", "the primal weather cannot be replaced");
});

test("Cloud Nine turns weather Abilities off, not the weather", () => {
  game.combat = combat([pokemon("cloud-nine")], { weather: { id: "sun" } });
  assert.equal(field.hasWeather("sun"), true);
  assert.equal(field.abilityWeather("sun"), false);
});

test("Drizzle and co.: not indoors, and a tie goes to the highest DEX", () => {
  const politoed = pokemon("drizzle", { dex: 12 });
  game.combat = combat([politoed], { environment: "indoor" });
  assert.equal(field.weatherOnEntry(politoed), null);
  const tyranitar = pokemon("sand-stream", { dex: 14 });
  game.combat = combat([politoed, tyranitar], { weather: { id: "sandstorm", source: { actorUuid: tyranitar.uuid, ability: "sand-stream", dex: 14 } } });
  globalThis.fromUuidSync = uuid => [politoed, tyranitar].find(actor => actor.uuid === uuid);
  assert.equal(field.weatherOnEntry(politoed), null, "lower DEX does not win");
  const ninetales = pokemon("drought", { dex: 16 });
  assert.equal(field.weatherOnEntry(ninetales).id, "sun");
});

test("Sandstorm hurts everyone but Rock, Steel, Ground and its Abilities", () => {
  game.combat = combat([], { weather: { id: "sandstorm", damage: 4 } });
  assert.deepEqual(field.weatherDamageFor(pokemon("static")), { value: 4, type: "rock" });
  assert.equal(field.weatherDamageFor(pokemon("static", { types: ["steel"] })), null);
  assert.equal(field.weatherDamageFor(pokemon("sand-veil")), null);
  assert.equal(field.weatherDamageFor(pokemon("overcoat")), null);
});

test("end of turn: Grassy Terrain heals the grounded, Dry Skin burns in the sun", () => {
  game.combat = combat([], { weather: { id: "sun" }, terrain: { id: "grassy" } });
  assert.deepEqual(field.endTurnHealing(pokemon("dry-skin")), [["grassy", 3], ["dry-skin", -3]]);
  assert.deepEqual(field.endTurnHealing(pokemon("rain-dish", { fly: 30 })), []);
});

test("Forecast and Mimicry follow the weather and terrain", () => {
  game.combat = combat([], { weather: { id: "rain" }, terrain: { id: "misty" } });
  assert.deepEqual(field.shapedTypes(pokemon("forecast")), ["water"]);
  assert.deepEqual(field.shapedTypes(pokemon("mimicry")), ["fairy"]);
  assert.equal(field.shapedTypes(pokemon("static")), null);
});

test("Weather Ball, Solar Power and the terrains change the damage", () => {
  const move = (sourceId, moveType) => ({ getFlag: (_module, key) =>
    ({ kind: "move", sourceId, moveType, moveDefinition: { damage: { modifier: "MOVE" }, powerAbilities: ["dex"] } })[key] });
  game.combat = combat([], { weather: { id: "sun" }, terrain: { id: "electric" } });
  const riders = rider.damageRiders(pokemon("static"), move("weather-ball", "normal"), []);
  assert.deepEqual([riders.type, riders.doubleDice], ["fire", true]);
  assert.equal(rider.damageRiders(pokemon("solar-power"), move("ember", "fire"), []).flat, 2);
  const zapper = pokemon("static");
  zapper.system.abilities.dex.mod = 3;
  assert.equal(rider.damageRiders(zapper, move("spark", "electric"), []).flat, 3, "Electric Terrain doubles MOVE");
});

test("weather and terrain keep statuses away", () => {
  game.combat = combat([], { weather: { id: "sun" }, terrain: { id: "electric" } });
  assert.equal(events.battlefieldBlocksStatus(pokemon("leaf-guard"), "burned"), "leaf-guard");
  assert.equal(events.battlefieldBlocksStatus(pokemon("static"), "asleep"), "electric-terrain");
  assert.equal(events.battlefieldBlocksStatus(pokemon("static"), "burned"), null);
  assert.equal(events.battlefieldBlocksStatus(pokemon("static", { fly: 30 }), "asleep"), null, "not grounded");
  game.combat = null;
});
