import assert from "node:assert/strict";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const calls = [];
globalThis.game = { user: { isGM: true }, users: { activeGM: null }, settings: { get: () => true },
  modules: { get: id => ({ active: id === "fxmaster" }) } };
globalThis.FXMASTER = { api: {
  presets: { play: async (name, opts) => calls.push(["play", name, opts.density ?? null]), stop: async name => calls.push(["stop", name]) },
  effects: { play: async ({ filters }) => { calls.push(["tint", filters[0].options.color.value]); return { filters: ["f1"] }; },
    filters: { stop: async ids => calls.push(["untint", ...ids]) } }
} };
const effects = await import("../scripts/battlefield-effects.mjs");

function scene() {
  let flag = null;
  return { getFlag: () => flag, setFlag: async (_module, _key, value) => { flag = value; } };
}

function combat(state) {
  return { combatants: [], getFlag: (_module, key) => (key === "battlefield" ? state : undefined) };
}

test("the weather and terrain map to FXMaster effects", () => {
  assert.deepEqual(effects.wantedEffects(combat({ weather: { id: "sandstorm" }, terrain: { id: "grassy" } })),
    { preset: "sandstorm", presetOptions: {}, weather: "sandstorm", terrain: "grassy" });
  assert.equal(effects.wantedEffects(combat({ weather: { id: "rain" } }), false).preset, null, "effects turned off");
  assert.equal(effects.wantedEffects(null).preset, null);
});

test("the scene follows the battlefield: it stops what it started and nothing else", async () => {
  const place = scene();
  await effects.syncScene(place, combat({ weather: { id: "rain" }, terrain: { id: "electric" } }));
  assert.deepEqual(calls.splice(0), [["play", "rain", null], ["tint", "#fff1a8"]]);
  await effects.syncScene(place, combat({ weather: { id: "rain" }, terrain: { id: "electric" } }));
  assert.deepEqual(calls.splice(0), [], "nothing changes");
  await effects.syncScene(place, combat({ weather: { id: "sun" }, terrain: null }));
  assert.deepEqual(calls.splice(0), [["stop", "rain"], ["play", "heat-wave", null], ["untint", "f1"]]);
  await effects.syncScene(place, null);
  assert.deepEqual(calls.splice(0), [["stop", "heat-wave"]], "the combat ended");
});
