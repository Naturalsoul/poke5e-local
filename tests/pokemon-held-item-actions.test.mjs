import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import {
  canUsePokemonHeldItem, getHeldItemActions, heldItemActionButtons, usePokemonHeldItem
} from "../scripts/pokemon-held-item-actions.mjs";
import { heldItemConfiguration, BERRY_ACTIVITY_ID } from "../scripts/held-item-config.mjs";
import { buildPoke5eCatalogItem } from "../scripts/item-catalog-service.mjs";

installFoundryUtils();
foundry.applications = { api: { DialogV2: { confirm: async () => true } } };

const MODULE_ID = "poke5e-local";
globalThis.game = { user: { isGM: true } };
globalThis.CONFIG = { DND5E: { activityActivationTypes: {
  "": { passive: true }, custom: { label: "Custom action" }
} } };

function fixture({ owner = true, quantity = 1, spent = 3 } = {}) {
  const trainer = createFlagDocument({ uuid: "Actor.trainer", flags: { [MODULE_ID]: { kind: "trainer" } } });
  trainer.testUserPermission = () => owner;
  const pokemon = createFlagDocument({ flags: { [MODULE_ID]: {
    kind: "pokemon", heldItemId: "held", trainerOwnerUuid: trainer.uuid
  } } });
  pokemon.testUserPermission = () => owner;
  let calls = 0;
  const activity = { id: "healing", name: "Recuperar PG", canUse: true,
    activation: { type: "bonus", value: 1 }, consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] },
    async use() { calls++; return "used"; }
  };
  const item = createFlagDocument({ uuid: "Item.held", documentName: "Item", flags: { [MODULE_ID]: {
    kind: "catalog-item", sourceId: "leftovers"
  } }, system: { quantity, uses: { max: "10", spent }, activities: new Map([[activity.id, activity]]) } });
  pokemon.items.push(item);
  pokemon.items.get = id => pokemon.items.find(entry => entry.id === id);
  return { trainer, pokemon, item, activity, calls: () => calls,
    use: () => usePokemonHeldItem({ pokemon, trainer, itemId: item.id, activityId: activity.id }) };
}

test("held-item buttons expose the native action and remaining charges in both languages", () => {
  const { item } = fixture();
  const [action] = getHeldItemActions(item);
  assert.equal(action.action, "Acción adicional");
  assert.equal(action.charges, "7/10 cargas");
  const markup = heldItemActionButtons(item, { canUse: true });
  assert.match(markup, /data-pokemon-sheet-action="held-item-use"/);
  assert.match(markup, /data-item-id="held"/);
  assert.match(markup, /data-activity-id="healing"/);
  assert.match(markup, /Usar: Recuperar PG/);
  assert.doesNotMatch(markup, /\bdisabled\b/);
  const english = heldItemActionButtons(item, { canUse: true, language: "en" });
  assert.match(english, /Bonus action · 7\/10 charges/);
});

test("supports multiple actions, reactions, duration costs, native labels, and activity-specific charges", () => {
  const { item, activity } = fixture();
  item.system.activities = new Map([
    ["action", { ...activity, id: "action", activation: { type: "action" }, consumption: { targets: [] } }],
    ["reaction", { ...activity, id: "reaction", activation: { type: "reaction" },
      uses: { max: 2, spent: 1 }, consumption: { targets: [{ type: "activityUses", target: "", value: "1" }] } }],
    ["minute", { ...activity, id: "minute", activation: { type: "minute", value: 2 } }],
    ["custom", { ...activity, id: "custom", activation: { type: "custom" } }]
  ]);
  const actions = getHeldItemActions(item);
  assert.deepEqual(actions.map(entry => entry.action), ["Acción", "Reacción", "2 × Minuto", "Custom action"]);
  assert.equal(actions[0].charges, "");
  assert.equal(actions[1].charges, "1/2 cargas");
  assert.equal((heldItemActionButtons(item, { canUse: true }).match(/data-activity-id=/g) ?? []).length, 4);
});

test("compact use controls show an icon, with charges to its right and an accessible action label", () => {
  const { item, activity } = fixture();
  const markup = heldItemActionButtons(item, { canUse: true });
  assert.match(markup, /aria-label="Usar: Recuperar PG · Acción adicional · 7\/10 cargas"/);
  assert.match(markup, /<i class="fa-solid fa-play" aria-hidden="true"><\/i>/);
  assert.match(markup, /<\/button>\s*<span class="poke5e-pokemon-held-item__charges"[^>]*>7\/10<\/span>/);
  assert.doesNotMatch(markup, /__use-label|<small>/);
  activity.consumption.targets = [];
  assert.doesNotMatch(heldItemActionButtons(item, { canUse: true }), /__charges/);
});

test("exhausted charges disable use and are rechecked when the button is clicked", async () => {
  const fixtureValue = fixture({ spent: 10 });
  assert.match(heldItemActionButtons(fixtureValue.item, { canUse: true }), /disabled/);
  await assert.rejects(fixtureValue.use(), /Sin cargas/);
  assert.equal(fixtureValue.calls(), 0);
  fixtureValue.item.system.uses.spent = 0;
  assert.equal(await fixtureValue.use(), "used");
  assert.equal(fixtureValue.calls(), 1);
  fixtureValue.item.system.quantity = 0;
  await assert.rejects(fixtureValue.use(), /no está disponible/);
});

test("permission checks allow the trainer's owner and GM, and reject observers and unrelated trainers", async () => {
  game.user.isGM = false;
  try {
    const owned = fixture();
    assert.equal(canUsePokemonHeldItem(owned.pokemon, owned.trainer), true);
    await owned.use();
    const observer = fixture({ owner: false });
    assert.equal(canUsePokemonHeldItem(observer.pokemon, observer.trainer), false);
    assert.match(heldItemActionButtons(observer.item), /disabled/);
    await assert.rejects(observer.use(), /No tienes permiso/);
    owned.trainer.uuid = "Actor.unrelated";
    await assert.rejects(owned.use(), /No tienes permiso/);
    game.user.isGM = true;
    assert.equal(await observer.use(), "used");
  } finally {
    game.user.isGM = true;
  }
});

test("rejects stale item ids, missing activities, native restrictions and passive activities", async () => {
  const fixtureValue = fixture();
  const { pokemon, trainer, item, activity } = fixtureValue;
  await assert.rejects(usePokemonHeldItem({ pokemon, trainer, itemId: "old", activityId: activity.id }), /ya no lleva/);
  await assert.rejects(usePokemonHeldItem({ pokemon, trainer, itemId: item.id, activityId: "missing" }), /no está disponible/);
  activity.canUse = false;
  assert.deepEqual(getHeldItemActions(item), []);
  await assert.rejects(fixtureValue.use(), /no está disponible/);
  activity.canUse = true;
  activity.activation.type = "";
  assert.equal(heldItemActionButtons(item, { canUse: true }), "");
  item.system.activities.clear();
  assert.equal(heldItemActionButtons(item, { canUse: true }), "");
});

test("uses the native activity once, prevents double clicks, and releases the lock after cancellation or failure", async () => {
  const fixtureValue = fixture();
  let complete;
  fixtureValue.activity.use = () => new Promise(resolve => { complete = resolve; });
  const pending = fixtureValue.use();
  await assert.rejects(fixtureValue.use(), /ya se está usando/);
  complete(undefined);
  assert.equal(await pending, undefined);
  fixtureValue.activity.use = async () => { throw new Error("Native failure"); };
  await assert.rejects(fixtureValue.use(), /Native failure/);
  fixtureValue.activity.use = async () => "recovered";
  assert.equal(await fixtureValue.use(), "recovered");
});

test("escapes activity names and ids before inserting them into the sheet", () => {
  const { item, activity } = fixture();
  activity.name = '<img src=x onerror="bad()">';
  activity.id = '" onclick="bad()';
  const markup = heldItemActionButtons(item, { canUse: true });
  assert.doesNotMatch(markup, /<img|data-activity-id="" onclick=/);
  assert.match(markup, /&lt;img/);
  assert.match(markup, /data-activity-id="&quot; onclick=&quot;/);
});

test("all 28 catalog berries have a native one-unit consumption activity in both languages", () => {
  const { items } = JSON.parse(readFileSync(new URL("../data/normalized/items.json", import.meta.url), "utf8"));
  const berries = items.filter(item => item.type === "berry");
  assert.equal(berries.length, 28);
  for (const berry of berries) {
    for (const language of ["es", "en"]) {
      const source = buildPoke5eCatalogItem(berry, language);
      assert.equal(source.type, "consumable");
      assert.equal(source.system.uses.max, "1");
      assert.equal(source.system.uses.spent, 0);
      assert.equal(source.system.uses.autoDestroy, true);
      assert.deepEqual(source.system.uses.recovery, []);
      const activity = source.system.activities[BERRY_ACTIVITY_ID];
      assert.equal(activity._id.length, 16);
      assert.equal(activity.flags[MODULE_ID].consumeBerry, true);
      assert.equal(activity.activation.type, "reaction");
      assert.deepEqual(activity.consumption.targets, [{ type: "itemUses", target: "", value: "1" }]);
      assert.equal(activity.consumption.scaling.allowed, false);
    }
  }
});

test("berry buttons show stock and delegate one-unit consumption and final removal to the native activity", async () => {
  const value = fixture({ quantity: 3, spent: 0 });
  const config = heldItemConfiguration("oran-berry", "es", "berry");
  value.item.system.uses = config.uses;
  Object.assign(value.activity, config.activities[BERRY_ACTIVITY_ID]);
  // El fixture conserva el ID de su actividad para resolver el click.
  const action = getHeldItemActions(value.item)[0];
  assert.equal(action.chargeCount, "3");
  assert.equal(action.charges, "3 unidades");
  assert.match(heldItemActionButtons(value.item, { canUse: true }), /__charges"[^>]*>3<\/span>/);
  let activations = 0;
  value.activity.use = async (usage, dialog) => {
    assert.deepEqual(usage, { consume: { resources: true }, scaling: false });
    assert.deepEqual(dialog, { configure: false });
    activations++;
    // Contrato nativo de autoDestroy: restar una unidad, borrar el último Item.
    value.item.system.quantity--;
    if (value.item.system.quantity === 0) {
      value.pokemon.items.length = 0;
      await value.pokemon.unsetFlag(MODULE_ID, "heldItemId");
    }
    return { message: { id: `usage-${activations}` } };
  };
  await value.use();
  assert.equal(value.item.system.quantity, 2, "the sheet must not consume a second unit");
  await value.use();
  await value.use();
  assert.equal(activations, 3);
  assert.equal(value.pokemon.items.length, 0);
  assert.equal(value.pokemon.getFlag(MODULE_ID, "heldItemId"), undefined);
  await assert.rejects(value.use(), /ya no lleva/);
});

test("canceled or rejected berry use leaves stock intact", async () => {
  const value = fixture({ quantity: 2 });
  Object.assign(value.activity, { flags: { [MODULE_ID]: { consumeBerry: true } } });
  value.activity.use = async () => undefined;
  await value.use();
  assert.equal(value.item.system.quantity, 2);
  value.activity.use = async () => { throw new Error("Rejected"); };
  await assert.rejects(value.use(), /Rejected/);
  assert.equal(value.item.system.quantity, 2);
});

test("berry confirmation cancel and close do not consume anything or invoke the activity", async () => {
  const value = fixture({ quantity: 2 });
  value.activity.flags = { [MODULE_ID]: { consumeBerry: true } };
  const confirm = foundry.applications.api.DialogV2.confirm;
  try {
    for (const answer of [false, null]) {
      foundry.applications.api.DialogV2.confirm = async options => {
        assert.equal(options.rejectClose, false);
        assert.match(options.content, /Se consumirá una unidad/);
        return answer;
      };
      assert.equal(await value.use(), undefined);
      assert.equal(value.calls(), 0);
      assert.equal(value.item.system.quantity, 2);
    }
  } finally {
    foundry.applications.api.DialogV2.confirm = confirm;
  }
});

test("berry confirmation rechecks stock after the dialog before consuming", async () => {
  const value = fixture({ quantity: 1 });
  value.activity.flags = { [MODULE_ID]: { consumeBerry: true } };
  const confirm = foundry.applications.api.DialogV2.confirm;
  try {
    foundry.applications.api.DialogV2.confirm = async () => {
      value.item.system.quantity = 0;
      return true;
    };
    await assert.rejects(value.use(), /no está disponible/);
    assert.equal(value.calls(), 0);
  } finally {
    foundry.applications.api.DialogV2.confirm = confirm;
  }
});
