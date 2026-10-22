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

test("wider critical ranges are set on the attack roll, keeping a wider one already there", async () => {
  const { onPreRollAttackCritical } = await import("../scripts/move-riders.mjs");
  const item = id => createFlagDocument({ flags: { [M]: { kind: "move", sourceId: id } } });
  const config = (id, criticalSuccess) => ({ subject: { item: item(id) }, rolls: [{ options: criticalSuccess ? { criticalSuccess } : {} }] });
  const slash = config("slash");
  onPreRollAttackCritical(slash);
  assert.equal(slash.rolls[0].options.criticalSuccess, 19);
  const frost = config("frost-breath");
  onPreRollAttackCritical(frost);
  assert.equal(frost.rolls[0].options.criticalSuccess, 16);
  const lucky = config("slash", 18);
  onPreRollAttackCritical(lucky);
  assert.equal(lucky.rolls[0].options.criticalSuccess, 18);
  const tackle = config("tackle");
  onPreRollAttackCritical(tackle);
  assert.equal(tackle.rolls[0].options.criticalSuccess, undefined);
  assert.equal(tackle.rolls[0].options.advantage, undefined);
  const feint = config("feint-attack");
  onPreRollAttackCritical(feint);
  assert.equal(feint.rolls[0].options.advantage, true);
});

test("HP-based damage: low HP multiplies Flail, a hurt target doubles Brine, bonuses join the roll", async () => {
  const { onPreRollDamageRiders } = await import("../scripts/move-riders.mjs");
  const actor = (value, max = 100, extra = {}) => ({ system: { attributes: { hp: { value, max }, prof: 3 }, abilities: { str: { mod: 4 } } },
    effects: [], getFlag: (_m, key) => (key === "types" ? ["fire"] : undefined), ...extra });
  const roll = (id, user, target = null, type = "normal") => {
    game.user = { targets: target ? new Set([{ actor: target }]) : new Set() };
    const item = createFlagDocument({ flags: { [M]: { kind: "move", sourceId: id, moveDefinition: { type } } } });
    const config = { subject: { item, actor: user, attack: { ability: "str" } }, rolls: [{ parts: ["1d6 + 4"] }] };
    onPreRollDamageRiders(config);
    return config.rolls[0].parts;
  };
  assert.deepEqual(roll("flail", actor(60)), ["1d6 + 4"]);
  assert.deepEqual(roll("flail", actor(40)), ["1d6 + 4", "1d6 + 4"]);
  assert.deepEqual(roll("reversal", actor(10)), ["1d6 + 4", "1d6 + 4", "1d6 + 4"]);
  assert.deepEqual(roll("brine", actor(100), actor(30)), ["1d6 + 4", "1d6 + 4"]);
  assert.deepEqual(roll("brine", actor(100), actor(80)), ["1d6 + 4"]);
  assert.deepEqual(roll("wring-out", actor(100), actor(80)), ["1d6 + 4", "4"]);
  assert.deepEqual(roll("hard-press", actor(100), actor(50)), ["1d6 + 4"]);
  const poisoned = actor(50, 100, { effects: [{ disabled: false, getFlag: () => "pokemon-status" }] });
  assert.deepEqual(roll("hex", actor(100), poisoned), ["1d6 + 4", "4"]);
  assert.deepEqual(roll("eruption", actor(100), null, "fire"), ["1d6 + 4", "3"]);
  assert.deepEqual(roll("eruption", actor(99), null, "fire"), ["1d6 + 4"]);
  assert.deepEqual(roll("dragon-energy", actor(65)), ["1d6 + 4", "3d6"]);
  assert.deepEqual(roll("rage-fist", actor(35)), ["1d6 + 4", "6"]);
  assert.deepEqual(roll("tackle", actor(10)), ["1d6 + 4"]);
  game.user = undefined;
});
