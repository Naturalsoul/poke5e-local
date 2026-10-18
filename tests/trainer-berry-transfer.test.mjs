import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import {
  getPokemonHeldItem, isTrainerInventoryBerry, transferTrainerBerryToPokemon
} from "../scripts/pokemon-held-item-service.mjs";

installFoundryUtils();
globalThis.game = { user: { isGM: true } };
let sequence = 0;

function actor(kind, trainerUuid) {
  const result = createFlagDocument({ uuid: `Actor.${kind}-${++sequence}`, name: kind,
    flags: { "poke5e-local": { kind, trainerOwnerUuid: trainerUuid } } });
  result.items.get = id => result.items.find(entry => entry.id === id);
  result.testUserPermission = () => true;
  result.createEmbeddedDocuments = async (type, sources) => {
    assert.equal(type, "Item");
    return sources.map(source => item(result, source));
  };
  return result;
}

function item(parent, source) {
  const id = source._id ?? `berry-${++sequence}`;
  const data = structuredClone({ ...source, _id: id });
  const result = createFlagDocument({ uuid: `${parent.uuid}.Item.${id}`, documentName: "Item",
    name: source.name, system: structuredClone(source.system), flags: source.flags });
  result.parent = parent;
  result.toObject = () => structuredClone({ ...data, system: result.system });
  result.update = async updates => {
    for (const [key, value] of Object.entries(updates)) {
      foundry.utils.setProperty(result, key, value);
    }
    return result;
  };
  result.delete = async () => {
    parent.items.splice(parent.items.indexOf(result), 1);
    return result;
  };
  parent.items.push(result);
  return result;
}

function fixture(quantity = 5) {
  const trainer = actor("trainer");
  const pokemon = actor("pokemon", trainer.uuid);
  const berry = item(trainer, { _id: "oran", name: "Oran Berry", folder: "bag-folder",
    flags: { "poke5e-local": { kind: "catalog-item", itemType: "berry", sourceId: "oran-berry", importManaged: true } },
    system: { quantity, container: "backpack", uses: { max: "1", spent: 0, autoDestroy: true },
      activities: { eat: { type: "utility", flags: { "poke5e-local": { consumeBerry: true } } } } }
  });
  return { trainer, pokemon, berry, transfer: () => transferTrainerBerryToPokemon(pokemon, trainer, berry.id) };
}

test("delivering a berry moves one unit and preserves stock, consumption configuration and metadata", async () => {
  const value = fixture(5);
  const held = await value.transfer();
  assert.equal(value.berry.system.quantity, 4);
  assert.equal(value.trainer.items.length, 1);
  assert.equal(held.system.quantity, 1);
  assert.equal(held.system.container, undefined);
  assert.equal(held.toObject().folder, undefined);
  assert.equal(held.getFlag("poke5e-local", "importManaged"), false);
  assert.equal(held.getFlag("poke5e-local", "sourceId"), "oran-berry");
  assert.deepEqual(held.system.activities, value.berry.system.activities);
  assert.equal(held.system.uses.autoDestroy, true);
  assert.equal(getPokemonHeldItem(value.pokemon), held);
  assert.equal(value.pokemon.getFlag("poke5e-local", "heldItemId"), held.id);
});

test("delivering the last berry removes the trainer item and equips one unit", async () => {
  const value = fixture(1);
  const held = await value.transfer();
  assert.equal(value.trainer.items.length, 0);
  assert.equal(held.system.quantity, 1);
  assert.equal(value.pokemon.items.length, 1);
});

test("failed creation or occupied held-item slots never reduce the trainer's stock", async () => {
  const failed = fixture();
  failed.pokemon.createEmbeddedDocuments = async () => [];
  await assert.rejects(failed.transfer(), /No se pudo entregar/);
  assert.equal(failed.berry.system.quantity, 5);
  const occupied = fixture();
  item(occupied.pokemon, occupied.berry.toObject());
  await assert.rejects(occupied.transfer(), /ya está llevando/);
  assert.equal(occupied.berry.system.quantity, 5);
  assert.equal(occupied.pokemon.items.length, 1);
});

test("assignment and source-update failures roll back the Pokemon item and its held-item flag", async () => {
  for (const failure of ["assignment", "debit", "cancel-debit", "delete", "cancel-delete"]) {
    const value = fixture(failure.includes("delete") ? 1 : 5);
    if (failure === "assignment") {value.pokemon.setFlag = async () => { throw new Error("assignment failed"); };}
    if (failure === "debit") {value.berry.update = async () => { throw new Error("debit failed"); };}
    if (failure === "cancel-debit") {value.berry.update = async () => undefined;}
    if (failure === "delete") {value.berry.delete = async () => { throw new Error("delete failed"); };}
    if (failure === "cancel-delete") {value.berry.delete = async () => undefined;}
    await assert.rejects(value.transfer());
    assert.equal(value.pokemon.items.length, 0, failure);
    assert.equal(value.pokemon.getFlag("poke5e-local", "heldItemId"), undefined, failure);
    assert.equal(value.berry.system.quantity, failure.includes("delete") ? 1 : 5, failure);
  }
});

test("zero stock, missing items, permissions and unrelated trainers prevent delivery", async () => {
  for (const quantity of [0, -1, 0.5]) {
    const value = fixture(quantity);
    await assert.rejects(value.transfer(), /ya no está disponible/);
    assert.equal(value.pokemon.items.length, 0);
  }
  const missing = fixture();
  missing.trainer.items.length = 0;
  await assert.rejects(missing.transfer(), /ya no está disponible/);
  const unrelated = fixture();
  await unrelated.pokemon.setFlag("poke5e-local", "trainerOwnerUuid", "Actor.someone-else");
  await assert.rejects(unrelated.transfer(), /no pertenece/);
  game.user.isGM = false;
  try {
    const denied = fixture();
    denied.trainer.testUserPermission = () => false;
    await assert.rejects(denied.transfer(), /No tienes permisos/);
    assert.equal(denied.berry.system.quantity, 5);
  } finally {
    game.user.isGM = true;
  }
});

test("concurrent deliveries cannot duplicate a last berry or overwrite a single held-item slot", async () => {
  const value = fixture(1);
  const second = actor("pokemon", value.trainer.uuid);
  const results = await Promise.allSettled([value.transfer(), transferTrainerBerryToPokemon(second, value.trainer, value.berry.id)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(value.pokemon.items.length + second.items.length, 1);
  assert.equal(value.trainer.items.length, 0);
  const duplicate = fixture(5);
  const repeated = await Promise.allSettled([duplicate.transfer(), duplicate.transfer()]);
  assert.equal(repeated.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(duplicate.berry.system.quantity, 4);
  assert.equal(duplicate.pokemon.items.length, 1);
});

test("delivery rereads stock changed during creation and rolls back if it runs out", async () => {
  for (const remaining of [3, 0]) {
    const value = fixture(5);
    const create = value.pokemon.createEmbeddedDocuments;
    value.pokemon.createEmbeddedDocuments = async (...args) => {
      const created = await create(...args);
      value.berry.system.quantity = remaining;
      return created;
    };
    if (remaining === 0) {
      await assert.rejects(value.transfer(), /ya no está disponible/);
      assert.equal(value.pokemon.items.length, 0);
      assert.equal(value.berry.system.quantity, 0);
    } else {
      await value.transfer();
      assert.equal(value.berry.system.quantity, 2);
    }
  }
});

test("only inventory berries use the transfer path, excluding compendiums, world items and other held items", () => {
  const value = fixture();
  assert.equal(isTrainerInventoryBerry(value.berry), true);
  const loose = { ...value.berry, parent: null };
  assert.equal(isTrainerInventoryBerry(loose), false);
  assert.equal(isTrainerInventoryBerry({ ...value.berry, parent: value.pokemon }), false);
  assert.equal(isTrainerInventoryBerry({ ...value.berry,
    getFlag(_module, key) { return { kind: "catalog-item", itemType: "held-item" }[key]; }
  }), false);
});

test("the Pokemon sheet transfers a trainer berry instead of calling the default copy handler", async () => {
  let defaultDrops = 0;
  foundry.applications = {
    sheets: { ActorSheetV2: class {
      constructor({ document }) { this.actor = document; }
      async _onDropItem() { defaultDrops++; return "default-copy"; }
    } },
    api: { HandlebarsApplicationMixin: Base => Base }
  };
  const { PokemonActorSheet } = await import("../scripts/pokemon-actor-sheet.mjs");
  const value = fixture(3);
  const sheet = new PokemonActorSheet({ document: value.pokemon });
  const held = await sheet._onDropItem({}, value.berry);
  assert.equal(value.berry.system.quantity, 2);
  assert.equal(held.system.quantity, 1);
  assert.equal(defaultDrops, 0);
  assert.equal(await sheet._onDropItem({}, { ...value.berry, parent: null }), "default-copy");
  assert.equal(defaultDrops, 1);
});
