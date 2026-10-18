import assert from "node:assert/strict";
import test from "node:test";
import { getPokemonMoveEffects, managePokemonMoveEffect, pokemonMoveEffectsMarkup } from "../scripts/pokemon-move-effects.mjs";

globalThis.game = { user: { isGM: true }, settings: { get: () => "es" } };

function fixture() {
  const changes = [];
  const pokemon = { effects: [], concentration: { effects: [{ id: "concentration" }] } };
  function effect(id, flags = {}, disabled = false) {
    const result = { id, name: `Effect ${id}`, img: "icons/svg/aura.svg", disabled,
      duration: { label: "3 turns" }, getFlag: (_namespace, key) => flags[key],
      sheet: { render: show => { changes.push(["edit", id, show]); } },
      update: async update => { Object.assign(result, update); changes.push(["update", id, update]); },
      delete: async () => { pokemon.effects.splice(pokemon.effects.indexOf(result), 1); changes.push(["delete", id]); }
    };
    pokemon.effects.push(result);
    return result;
  }
  const binding = effect("binding", { kind: "pokemon-periodic", sourceMove: "bind" });
  effect("concentration", { sourceMove: "fire-spin" });
  effect("status", { kind: "pokemon-status" });
  effect("equipment", { kind: "held-item" });
  const paused = effect("paused", { kind: "pokemon-periodic" }, true);
  return { pokemon, binding, paused, changes };
}

test("received move effects include paused effects without duplicating concentration or equipment/status panels", () => {
  const { pokemon } = fixture();
  assert.deepEqual(getPokemonMoveEffects(pokemon).map(effect => effect.id), ["binding", "paused"]);
  assert.deepEqual(getPokemonMoveEffects({}), []);
});

test("the move effect panel shows durations, escapes document text and provides GM controls", () => {
  const { pokemon, binding } = fixture();
  binding.name = '<script>alert("x")</script>';
  const markup = pokemonMoveEffectsMarkup(pokemon);
  assert.match(markup, /Efectos de movimientos/);
  assert.match(markup, /3 turns/);
  assert.match(markup, /&lt;script&gt;/);
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /move-effect-edit/);
  assert.match(markup, /move-effect-toggle/);
  assert.match(markup, /move-effect-remove/);
  assert.match(markup, /Reactivar efecto/);
  assert.match(markup, /Pausado/);
  assert.equal(pokemonMoveEffectsMarkup({ effects: [] }), "");
});

test("players see received effects but cannot edit, toggle or remove them", async () => {
  const { pokemon, changes } = fixture();
  game.user.isGM = false;
  try {
    const markup = pokemonMoveEffectsMarkup(pokemon, "en");
    assert.match(markup, /Move effects/);
    assert.match(markup, /Effect binding/);
    assert.doesNotMatch(markup, /data-pokemon-sheet-action/);
    for (const action of ["edit", "toggle", "remove"]) {
      await assert.rejects(managePokemonMoveEffect(pokemon, "binding", action), /Solo el GM/);
    }
    assert.equal(changes.length, 0);
  } finally {
    game.user.isGM = true;
  }
});

test("GM controls edit the real effect, disable and resume it, and remove it from the affected actor", async () => {
  const { pokemon, binding, changes } = fixture();
  await managePokemonMoveEffect(pokemon, binding.id, "edit");
  assert.deepEqual(changes[0], ["edit", "binding", true]);
  await managePokemonMoveEffect(pokemon, binding.id, "toggle");
  assert.equal(binding.disabled, true);
  await managePokemonMoveEffect(pokemon, binding.id, "toggle");
  assert.equal(binding.disabled, false);
  await managePokemonMoveEffect(pokemon, binding.id, "remove");
  assert.equal(getPokemonMoveEffects(pokemon).some(effect => effect.id === binding.id), false);
  await assert.rejects(managePokemonMoveEffect(pokemon, binding.id, "remove"), /ya no está disponible/);
});

test("move effect controls cannot modify concentration, other actor effects or invalid actions", async () => {
  const { pokemon, changes } = fixture();
  for (const id of ["concentration", "status", "equipment", "missing"]) {
    await assert.rejects(managePokemonMoveEffect(pokemon, id, "remove"), /ya no está disponible/);
  }
  await assert.rejects(managePokemonMoveEffect(pokemon, "binding", "unknown"), /ya no está disponible/);
  assert.equal(changes.length, 0);
});

test("sheet clicks dispatch effect controls and refresh the affected Pokemon", async () => {
  globalThis.foundry = { applications: { api: { ApplicationV2: class {} } } };
  const { activatePokemonSheetActions } = await import("../scripts/pokemon-sheet-actions.mjs");
  const { pokemon, binding } = fixture();
  let listener;
  let refreshed = 0;
  let busy = false;
  const root = { addEventListener: (type, handler) => { if (type === "click") {listener = handler;} },
    contains: () => true, querySelectorAll: () => [],
    classList: { contains: () => busy, toggle: (_name, value) => { busy = value; } } };
  activatePokemonSheetActions({ root, pokemon, refresh: () => { refreshed++; } });
  const button = { dataset: { pokemonSheetAction: "move-effect-toggle", effectId: binding.id } };
  await listener({ target: { closest: () => button } });
  assert.equal(binding.disabled, true);
  assert.equal(refreshed, 1);
  assert.equal(busy, false);
});
