import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import {
  getPokemonHeldItem, reconcilePokemonHeldItemLoan, transferTrainerHeldItemToPokemon,
  transferPokemonHeldItemToTrainer, registerPokemonHeldItemService
} from "../scripts/pokemon-held-item-service.mjs";
import { HELD_ITEM_LOAN, LOAN_SYNC_OPTION, registerHeldItemLoanSync } from "../scripts/held-item-loan-sync.mjs";

installFoundryUtils();
const hooks = createHooks();
const documents = new Map();
const MODULE_ID = "poke5e-local";
let sequence = 0;
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
  settings: { get: () => "es" }, scenes: [], actors: [] };
globalThis.ui = { notifications: { error(message) { assert.fail(message); } } };
globalThis.fromUuid = async uuid => documents.get(uuid);
registerHeldItemLoanSync();

function actor(kind, trainer = null, uuid = `Actor.${++sequence}`) {
  const result = createFlagDocument({ uuid, name: kind, flags: { [MODULE_ID]: {
    kind, trainerOwnerUuid: trainer?.uuid
  } } });
  result.items.get = id => result.items.find(entry => entry.id === id);
  result.testUserPermission = () => true;
  result.createEmbeddedDocuments = async (_type, sources) => sources.map(source => inventoryItem(result, source));
  documents.set(uuid, result);
  return result;
}

function inventoryItem(parent, source) {
  const id = source._id ?? `item${++sequence}`;
  const result = createFlagDocument({ documentName: "Item", uuid: `${parent.uuid}.Item.${id}`,
    name: source.name, flags: source.flags, system: structuredClone(source.system) });
  result.parent = parent;
  result._source = { system: structuredClone(source.system) };
  result.updates = [];
  result.toObject = () => ({ _id: id, name: result.name,
    system: structuredClone(result._source.system), flags: structuredClone(result._flags) });
  result.update = async (changes, options = {}) => {
    result.updates.push({ changes, options });
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith(`flags.${MODULE_ID}.`)) {
        const flag = key.slice(`flags.${MODULE_ID}.`.length);
        if (flag.startsWith("-=")) {await result.unsetFlag(MODULE_ID, flag.slice(2));}
        else {await result.setFlag(MODULE_ID, flag, value);}
      } else {
        foundry.utils.setProperty(result, key, structuredClone(value));
        foundry.utils.setProperty(result._source, key, structuredClone(value));
      }
    }
    for (const handler of hooks.handlers("updateItem")) {handler(result, changes, options, game.user.id);}
    return result;
  };
  result.delete = async () => {
    parent.items.splice(parent.items.indexOf(result), 1);
    documents.delete(result.uuid);
    return result;
  };
  parent.items.push(result);
  documents.set(result.uuid, result);
  return result;
}

function fixture(quantity = 1) {
  const trainer = actor("trainer");
  const pokemon = actor("pokemon", trainer);
  const original = inventoryItem(trainer, { name: "Leftovers", flags: { [MODULE_ID]: {
    kind: "catalog-item", itemType: "held-item", sourceId: "leftovers"
  } }, system: { quantity, uses: { max: "10", spent: 0, recovery: [] } } });
  return { trainer, pokemon, original, give: () => transferTrainerHeldItemToPokemon(pokemon, trainer, original.id) };
}

async function flush() { await new Promise(resolve => setTimeout(resolve, 0)); }

test("lending the last Leftovers keeps the trainer row at zero and links the Pokemon copy", async () => {
  const value = fixture();
  const held = await value.give();
  assert.equal(value.trainer.items.length, 1);
  assert.equal(value.original.system.quantity, 0);
  assert.equal(held.system.quantity, 1);
  assert.equal(held.system.uses.autoDestroy, false);
  assert.equal(value.original.system.uses.autoDestroy, false);
  assert.deepEqual(held.getFlag(MODULE_ID, HELD_ITEM_LOAN), value.original.getFlag(MODULE_ID, HELD_ITEM_LOAN));
  await assert.rejects(value.give(), /ya está llevando/);
});

test("spending and restoring charges synchronizes both sheets without changing quantities or looping", async () => {
  const value = fixture();
  const held = await value.give();
  const before = value.original.updates.length;
  await held.update({ "system.uses.spent": 1 });
  await flush();
  assert.equal(value.original.system.uses.spent, 1);
  assert.equal(value.original.updates.length, before + 1);
  assert.equal(value.original.updates.at(-1).options[LOAN_SYNC_OPTION], true);
  await value.original.update({ "system.uses.spent": 0 });
  await flush();
  assert.equal(held.system.uses.spent, 0);
  await held.update({ "system.uses.spent": 10 });
  await flush();
  assert.equal(value.original.system.uses.spent, 10);
  assert.equal(value.original.system.quantity, 0);
  assert.equal(held.system.quantity, 1);
  assert.equal(value.trainer.items.length, 1);
});

test("separate physical units have separate trainer records and independent charges", async () => {
  const value = fixture(2);
  const first = await value.give();
  assert.equal(value.original.system.quantity, 1);
  const firstRecord = value.trainer.items.find(entry => entry.id !== value.original.id);
  assert.equal(firstRecord.system.quantity, 0);
  const secondPokemon = actor("pokemon", value.trainer);
  const second = await transferTrainerHeldItemToPokemon(secondPokemon, value.trainer, value.original.id);
  assert.equal(value.original.system.quantity, 0);
  await first.update({ "system.uses.spent": 3 });
  await flush();
  assert.equal(firstRecord.system.uses.spent, 3);
  assert.equal(value.original.system.uses.spent, 0);
  assert.equal(second.system.uses.spent, 0);
});

test("returning a loan restores its existing trainer row and preserves used charges", async () => {
  const value = fixture();
  const held = await value.give();
  await held.update({ "system.uses.spent": 4 });
  await flush();
  const returned = await transferPokemonHeldItemToTrainer(value.pokemon, value.trainer);
  assert.equal(returned.item, value.original);
  assert.equal(value.trainer.items.length, 1);
  assert.equal(value.original.system.quantity, 1);
  assert.equal(value.original.system.uses.spent, 4);
  assert.equal(value.original.getFlag(MODULE_ID, HELD_ITEM_LOAN), undefined);
  assert.equal(getPokemonHeldItem(value.pokemon), null);
  await value.give();
  assert.equal(getPokemonHeldItem(value.pokemon).system.uses.spent, 4);
});

test("existing assigned items link once using the Pokemon's current charges", async () => {
  const value = fixture();
  const source = value.original.toObject(); delete source._id;
  source.system.uses.spent = 3;
  const held = inventoryItem(value.pokemon, source);
  await reconcilePokemonHeldItemLoan(value.pokemon);
  await reconcilePokemonHeldItemLoan(value.pokemon);
  assert.equal(value.original.system.quantity, 0);
  assert.equal(value.original.system.uses.spent, 3);
  assert.equal(value.trainer.items.length, 1);
  assert.ok(held.getFlag(MODULE_ID, HELD_ITEM_LOAN));
});

test("an assigned item without a trainer row creates a zero-quantity reminder", async () => {
  const value = fixture();
  const source = value.original.toObject(); delete source._id;
  await value.original.delete();
  inventoryItem(value.pokemon, source);
  await reconcilePokemonHeldItemLoan(value.pokemon);
  assert.equal(value.trainer.items.length, 1);
  assert.equal(value.trainer.items[0].system.quantity, 0);
  assert.ok(value.trainer.items[0].getFlag(MODULE_ID, HELD_ITEM_LOAN));
});

test("token charges synchronize with trainer and world copy, and return removes both borrower copies", async () => {
  const value = fixture();
  const held = await value.give();
  const tokenActor = actor("pokemon", value.trainer, `Scene.scene.Token.token.Actor.${++sequence}`);
  tokenActor.token = { baseActor: value.pokemon };
  const tokenItem = inventoryItem(tokenActor, held.toObject());
  game.scenes = [{ tokens: [{ actorLink: false, actor: tokenActor }] }];
  try {
    await tokenItem.update({ "system.uses.spent": 2 });
    await flush();
    assert.equal(held.system.uses.spent, 2);
    assert.equal(value.original.system.uses.spent, 2);
    await transferPokemonHeldItemToTrainer(value.pokemon, value.trainer);
    assert.equal(tokenActor.items.length, 0);
    assert.equal(value.pokemon.items.length, 0);
    assert.equal(value.original.system.quantity, 1);
  } finally {
    game.scenes = [];
  }
});

test("failed loan assignment and debit do not lose or duplicate inventory", async () => {
  for (const quantity of [1, 2]) {
    const value = fixture(quantity);
    const update = value.original.update;
    value.original.update = async changes => {
      if (changes["system.quantity"] === quantity - 1) {throw new Error("debit failed");}
      return update(changes);
    };
    await assert.rejects(value.give(), /debit failed/);
    assert.equal(value.trainer.items.length, 1);
    assert.equal(value.original.system.quantity, quantity);
    assert.equal(value.original.getFlag(MODULE_ID, HELD_ITEM_LOAN), undefined);
    assert.equal(value.pokemon.items.length, 0);
  }
});

test("failed return restores the borrowed item and leaves the zero-quantity row intact", async () => {
  const value = fixture();
  const held = await value.give();
  const update = value.original.update;
  value.original.update = async () => { throw new Error("return failed"); };
  await assert.rejects(transferPokemonHeldItemToTrainer(value.pokemon, value.trainer), /return failed/);
  assert.equal(value.original.system.quantity, 0);
  assert.equal(getPokemonHeldItem(value.pokemon).id, held.id);
  value.original.update = update;
  await transferPokemonHeldItemToTrainer(value.pokemon, value.trainer);
  assert.equal(value.original.system.quantity, 1);
});

test("failed migration restores the existing Pokemon's quantity and charges", async () => {
  const value = fixture();
  const source = value.original.toObject(); delete source._id;
  source.system.quantity = 3;
  source.system.uses.spent = 2;
  const held = inventoryItem(value.pokemon, source);
  value.original.update = async () => { throw new Error("migration failed"); };
  await assert.rejects(reconcilePokemonHeldItemLoan(value.pokemon), /migration failed/);
  assert.equal(held.system.quantity, 3);
  assert.equal(held.system.uses.spent, 2);
  assert.equal(held.getFlag(MODULE_ID, HELD_ITEM_LOAN), undefined);
  assert.equal(value.original.system.quantity, 1);
  assert.equal(value.trainer.items.length, 1);
});

test("only the client that gave a Pokémon an item assigns it: the others would lack permission", async () => {
  registerPokemonHeldItemService();
  const { pokemon } = fixture();
  const berry = inventoryItem(pokemon, { name: "Oran Berry", flags: { [MODULE_ID]: {
    kind: "catalog-item", itemType: "berry", sourceId: "oran-berry"
  } }, system: { quantity: 1 } });
  const created = (userId) => hooks.handlers("createItem").forEach(handler => handler(berry, {}, userId));
  created("player");
  await flush();
  assert.equal(pokemon.getFlag(MODULE_ID, "heldItemId"), undefined, "the GM's client stays out of a player's drop");
  created(game.user.id);
  await flush();
  assert.equal(pokemon.getFlag(MODULE_ID, "heldItemId"), berry.id);
});
