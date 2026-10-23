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

test("Jump Kick and Supercell Slam hurt their user on a miss", async () => {
  const { MISS_RIDERS } = await import("../scripts/move-riders.mjs");
  const user = { system: { attributes: { prof: 3 } } };
  assert.equal(MISS_RIDERS["jump-kick"](user), 1);
  assert.equal(MISS_RIDERS["high-jump-kick"](user), 1);
  assert.equal(MISS_RIDERS["supercell-slam"](user), 3);
});

test("battle-state damage: boosts add dice, a missed last attack powers up, consecutive hits double", async () => {
  const { onPreRollDamageRiders, recordAttack, clearAttackHistory } = await import("../scripts/move-riders.mjs");
  const boost = value => ({ disabled: false, changes: [{ value }], getFlag: (_m, key) => (key === "kind" ? "pokemon-modifier" : undefined) });
  const user = { uuid: "Actor.u", effects: [boost("2"), boost("5"), boost("-5")], system: { attributes: { hp: { value: 10, max: 10 } } } };
  const roll = (id, target = null, parts = ["2d6 + 4"]) => {
    game.user = { targets: target ? new Set([{ actor: target }]) : new Set() };
    const item = createFlagDocument({ flags: { [M]: { kind: "move", sourceId: id } } });
    const config = { subject: { item, actor: user, attack: { ability: "str" } }, rolls: [{ parts: [...parts] }] };
    onPreRollDamageRiders(config);
    return config.rolls[0].parts;
  };
  const attack = (moveId, hit, round = null, targetActorUuid = "Actor.t") => {
    game.combat = round === null ? null : { round };
    recordAttack({ actorUuid: "Actor.u", moveId, hit, targetActorUuid });
  };
  assert.deepEqual(roll("stored-power"), ["2d6 + 4", "2d6"], "two boosts, the penalty doesn't count");
  assert.deepEqual(roll("punishment", { effects: [boost("1")] }), ["2d6 + 4", "1d6"]);
  clearAttackHistory();
  attack("tackle", false);
  attack("stomping-tantrum", true);
  assert.deepEqual(roll("stomping-tantrum"), ["2d6 + 4", "2d6"]);
  assert.deepEqual(roll("temper-flare"), ["2d6 + 4", "1d6"]);
  clearAttackHistory();
  attack("fury-cutter", true, 1);
  attack("fury-cutter", true, 2);
  attack("fury-cutter", true, 3);
  assert.deepEqual(roll("fury-cutter", null, ["1d4 + 4"]), ["1d4 + 4", "3d4"], "third round: x4");
  attack("fury-cutter", true, 5);
  assert.deepEqual(roll("fury-cutter", null, ["1d4 + 4"]), ["1d4 + 4"], "a skipped round resets it");
  clearAttackHistory();
  attack("power-up-punch", true);
  attack("power-up-punch", true);
  attack("power-up-punch", true);
  assert.deepEqual(roll("power-up-punch", null, ["1d6 + 4"]), ["1d6 + 4", "1d6"], "capped at double the dice");
  attack("power-up-punch", true, null, "Actor.other");
  assert.deepEqual(roll("power-up-punch", null, ["1d6 + 4"]), ["1d6 + 4"], "a new target resets it");
  game.user = undefined;
  game.combat = undefined;
});

test("size, DEX and frustration change the damage; Hold Back leaves 1 HP", async () => {
  const { onPreRollDamageRiders, onPreRollAttackCritical, onPreApplyDamage, recordAttack, clearAttackHistory } = await import("../scripts/move-riders.mjs");
  const actor = (size, dex = 10, effects = []) => ({ uuid: `Actor.${size}`, effects, system: { traits: { size }, abilities: { str: { mod: 4 }, dex: { value: dex } },
    attributes: { hp: { value: 20, max: 20 } } } });
  const item = id => createFlagDocument({ flags: { [M]: { kind: "move", sourceId: id } } });
  const roll = (id, user, target = null) => {
    game.user = { targets: target ? new Set([{ actor: target }]) : new Set() };
    const config = { subject: { item: item(id), actor: user, attack: { ability: "str" } }, rolls: [{ parts: ["1d8 + 4"] }] };
    onPreRollDamageRiders(config);
    return config.rolls[0].parts;
  };
  assert.deepEqual(roll("heavy-slam", actor("huge"), actor("med")), ["1d8 + 4", "8"], "two sizes above: MOVE twice");
  assert.deepEqual(roll("body-press", actor("med"), actor("med")), ["1d8 + 4"]);
  assert.deepEqual(roll("gyro-ball", actor("med", 8), actor("med", 16)), ["1d8 + 4", "1d8"]);
  clearAttackHistory();
  const sniper = actor("sm");
  recordAttack({ actorUuid: sniper.uuid, moveId: "snipe-shot", hit: true, advantage: true });
  assert.deepEqual(roll("snipe-shot", sniper), ["1d8 + 4", "1d8"]);
  const lowered = actor("med", 10, [{ disabled: false, changes: [{ value: "-1" }], getFlag: (_m, key) => (key === "kind" ? "pokemon-modifier" : undefined) }]);
  assert.deepEqual(roll("lash-out", lowered), ["1d8 + 4", "4"]);
  const attack = { subject: { item: item("lash-out"), actor: lowered }, rolls: [{ options: {} }] };
  onPreRollAttackCritical(attack);
  assert.equal(attack.rolls[0].options.advantage, true);
  const holdBack = { getAssociatedItem: () => item("hold-back") };
  const updates = { "system.attributes.hp.value": -3 };
  onPreApplyDamage(actor("med"), 23, updates, { originatingMessage: holdBack });
  assert.equal(updates["system.attributes.hp.value"], 1);
  const other = { "system.attributes.hp.value": -3 };
  onPreApplyDamage(actor("med"), 23, other, { originatingMessage: { getAssociatedItem: () => item("tackle") } });
  assert.equal(other["system.attributes.hp.value"], -3);
  game.user = undefined;
});
