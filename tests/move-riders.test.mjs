import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
globalThis.foundry.utils.escapeHTML ??= value => String(value);
globalThis.foundry.applications = { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: c => c, DialogV2: class {} }, handlebars: {} };
globalThis.game = { settings: { get: () => "es" } };
const chat = [];
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
const { HIT_RIDERS, eternabeamEffect } = await import("../scripts/move-riders.mjs");
const M = "poke5e-local";

test("Clear Smog resets the target's stat changes and leaves the rest", async () => {
  const effect = (id, kind) => ({ id, getFlag: (_m, key) => (key === "kind" ? kind : undefined) });
  let deleted = null;
  const target = { name: "Muk", effects: [effect("a", "pokemon-modifier"), effect("b", "pokemon-status"), effect("c", "pokemon-modifier")],
    deleteEmbeddedDocuments: async (_type, ids) => { deleted = ids; } };
  await HIT_RIDERS["clear-smog"](target);
  assert.deepEqual(deleted, ["a", "c"]);
});

test("Incinerate burns a held berry, not another held item", async () => {
  const holder = itemType => {
    const item = createFlagDocument({ documentName: "Item", uuid: "Actor.p.Item.held", name: "Oran Berry", flags: { [M]: { kind: "catalog-item", itemType } } });
    item.deleted = false;
    item.delete = async () => { item.deleted = true; };
    const pokemon = createFlagDocument({ name: "Oddish", flags: { [M]: { kind: "pokemon", heldItemId: item.id } } });
    pokemon.items.get = id => (id === item.id ? item : null);
    pokemon.items.push(item);
    item.parent = pokemon;
    return { pokemon, item };
  };
  const berry = holder("berry");
  await HIT_RIDERS.incinerate(berry.pokemon);
  assert.equal(berry.item.deleted, true);
  assert.match(chat.at(-1), /cenizas/);
  const band = holder("held-item");
  await HIT_RIDERS.incinerate(band.pokemon);
  assert.equal(band.item.deleted, false);
});

test("Eternabeam incapacitates its user until the end of its next turn", () => {
  const effect = eternabeamEffect();
  assert.deepEqual(effect.statuses, ["incapacitated"]);
  assert.equal(effect.flags[M].expireAtEndOfNextTurn, true);
});
