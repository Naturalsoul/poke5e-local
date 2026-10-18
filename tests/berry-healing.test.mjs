import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { prepareBerryHealing, publishBerryHealing, registerBerryHealingChat } from "../scripts/berry-healing.mjs";
import { usePokemonHeldItem } from "../scripts/pokemon-held-item-actions.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
const hooks = createHooks();
const actors = new Map();
const frames = [];
const published = [];
const observers = new Set();
let sequence = 0;
globalThis.game = { user: { id: "player", isGM: false }, settings: { get: () => "es" } };
globalThis.ui = { notifications: { error(message) { assert.fail(message); } } };
globalThis.requestAnimationFrame = callback => { frames.push(callback); };
globalThis.MutationObserver = class {
  constructor(callback) { this.callback = callback; }
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
};
globalThis.fromUuid = async uuid => actors.get(uuid);
globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.uuid }) };
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; }
  async evaluate() { this.total = this.formula === "30" ? 30 : 9; return this; }
  async toMessage(options) {
    const message = createFlagDocument({ documentName: "ChatMessage", uuid: `ChatMessage.${++sequence}`, flags: options.flags });
    message.rolls = [this];
    message.speaker = options.speaker;
    published.push(message);
    return message;
  }
};
registerBerryHealingChat();

function fixture({ id = "oran-berry", hp = 5, max = 30, uuid = `Actor.${++sequence}` } = {}) {
  const pokemon = createFlagDocument({ uuid, flags: { [MODULE_ID]: { kind: "pokemon" } },
    system: { attributes: { hp: { value: hp, max } } } });
  pokemon.isOwner = true;
  pokemon.updates = [];
  pokemon.update = async changes => {
    pokemon.updates.push(changes);
    for (const [key, value] of Object.entries(changes)) {
      if (key.startsWith(`flags.${MODULE_ID}.`)) {
        await pokemon.setFlag(MODULE_ID, key.slice(`flags.${MODULE_ID}.`.length), value);
      } else {
        foundry.utils.setProperty(pokemon, key, value);
      }
    }
  };
  actors.set(uuid, pokemon);
  const item = createFlagDocument({ flags: { [MODULE_ID]: { sourceId: id,
    rolls: id === "oran-berry" ? [{ kind: "healing", formula: "2d4 + 2" }] : [] } } });
  return { pokemon, item };
}

async function flushPaints() {
  for (let index = 0; index < 8; index++) {
    while (frames.length) {frames.shift()();}
    await Promise.resolve();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function show(message, html = { isConnected: true }) {
  hooks.handler("dnd5e.renderChatMessage")(message, html);
  await flushPaints();
}

test("Oran rolls 2d4 + 2 and heals its holder only after the result has rendered", async () => {
  const { item, pokemon } = fixture();
  const roll = await prepareBerryHealing(item, pokemon);
  assert.equal(roll.formula, "(2d4 + 2)");
  const message = await publishBerryHealing(roll, { pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.oran" } });
  assert.equal(pokemon.system.attributes.hp.value, 5);
  const handler = hooks.handler("dnd5e.renderChatMessage");
  handler(message, { isConnected: true });
  handler(message, { isConnected: true });
  frames.shift()();
  assert.equal(pokemon.updates.length, 0, "the first frame must paint the result before HP changes");
  await flushPaints();
  assert.equal(pokemon.system.attributes.hp.value, 14);
  assert.equal(pokemon.updates.length, 1);
  await show(message);
  assert.equal(pokemon.updates.length, 1, "rerendering cannot repeat healing");
  assert.deepEqual(pokemon.getFlag(MODULE_ID, "berryHealingUses"), ["Usage.oran"]);
});

test("Sitrus recovers its fixed 30 HP up to the maximum and other berry types do not roll HP healing", async () => {
  const { item, pokemon } = fixture({ id: "sitrus-berry", hp: 12, max: 20 });
  const roll = await prepareBerryHealing(item, pokemon);
  assert.equal(roll.total, 30);
  const message = await publishBerryHealing(roll, { pokemon, itemName: "Sitrus", usageMessage: { uuid: "Usage.sitrus" } });
  await show(message);
  assert.equal(pokemon.system.attributes.hp.value, 20);
  const statusBerry = fixture({ id: "pecha-berry" });
  assert.equal(await prepareBerryHealing(statusBerry.item, statusBerry.pokemon), null);
  assert.equal(await publishBerryHealing(null, { pokemon, usageMessage: {} }), null);
});

test("a different client cannot apply healing; the owner can apply it once even after the final berry was deleted", async () => {
  const { item, pokemon } = fixture({ uuid: "Scene.battle.Token.pokemon.Actor.synthetic" });
  const roll = await prepareBerryHealing(item, pokemon);
  const message = await publishBerryHealing(roll, { pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.last" } });
  game.user.id = "observer";
  await show(message);
  assert.equal(pokemon.updates.length, 0);
  game.user.id = "player";
  assert.equal(pokemon.items.length, 0);
  await show(message);
  assert.equal(pokemon.system.attributes.hp.value, 14);
});

test("concurrent berries heal serially and never revive a fainted Pokémon", async () => {
  const { item, pokemon } = fixture({ max: 100 });
  const messages = [];
  for (const uuid of ["Usage.first", "Usage.second"]) {
    messages.push(await publishBerryHealing(await prepareBerryHealing(item, pokemon), {
      pokemon, itemName: "Oran", usageMessage: { uuid }
    }));
  }
  for (const message of messages) {hooks.handler("dnd5e.renderChatMessage")(message, { isConnected: true });}
  await flushPaints();
  assert.equal(pokemon.system.attributes.hp.value, 23);
  const fainted = fixture({ hp: 0 });
  const message = await publishBerryHealing(await prepareBerryHealing(fainted.item, fainted.pokemon), {
    pokemon: fainted.pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.fainted" }
  });
  await show(message);
  assert.equal(fainted.pokemon.system.attributes.hp.value, 0);
});

test("unattached previews cannot heal and the render hook is registered only once", async () => {
  registerBerryHealingChat();
  assert.equal(hooks.handlers("dnd5e.renderChatMessage").length, 1);
  const { item, pokemon } = fixture();
  const message = await publishBerryHealing(await prepareBerryHealing(item, pokemon), {
    pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.preview" }
  });
  await show(message, { isConnected: false });
  assert.equal(pokemon.updates.length, 0);
  await show(message);
  assert.equal(pokemon.system.attributes.hp.value, 14);
});

test("the sheet confirms, consumes the last Oran, publishes its dice and heals only when that roll renders", async () => {
  const { item, pokemon } = fixture();
  const steps = [];
  foundry.applications = { api: { DialogV2: { confirm: async () => {
    steps.push("confirm");
    return true;
  } } } };
  game.user.isGM = true;
  try {
    item.documentName = "Item";
    item.system = { quantity: 1, uses: { max: 1, spent: 0 } };
    await item.setFlag(MODULE_ID, "kind", "catalog-item");
    const activity = { id: "berry", flags: { [MODULE_ID]: { consumeBerry: true } },
      name: "Consumir baya", activation: { type: "reaction" },
      consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] },
      async use() {
        steps.push("consume");
        pokemon.items.length = 0;
        return { message: { uuid: "Usage.complete" } };
      }
    };
    item.system.activities = new Map([[activity.id, activity]]);
    pokemon.items.push(item);
    pokemon.items.get = id => pokemon.items.find(entry => entry.id === id);
    const before = published.length;
    await usePokemonHeldItem({ pokemon, itemId: item.id, activityId: activity.id });
    assert.deepEqual(steps, ["confirm", "consume"]);
    assert.equal(published.length, before + 1);
    assert.equal(published.at(-1).rolls[0].total, 9);
    assert.equal(pokemon.system.attributes.hp.value, 5);
    assert.equal(pokemon.items.length, 0);
    await show(published.at(-1));
    assert.equal(pokemon.system.attributes.hp.value, 14);
  } finally {
    game.user.isGM = false;
  }
});

test("Dice So Nice must finish the animation before healing even when chat HTML is already connected", async () => {
  const { item, pokemon } = fixture();
  const message = await publishBerryHealing(await prepareBerryHealing(item, pokemon), {
    pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.animation" }
  });
  let finishAnimation;
  let waits = 0;
  game.dice3d = { waitFor3DAnimationByMessageID(id) {
    assert.equal(id, message.id);
    waits++;
    return new Promise(resolve => { finishAnimation = resolve; });
  } };
  try {
    const handler = hooks.handler("dnd5e.renderChatMessage");
    handler(message, { isConnected: true });
    handler(message, { isConnected: true });
    await flushPaints();
    assert.equal(pokemon.updates.length, 0, "rendering HTML cannot reveal the healing total through HP during animation");
    assert.equal(waits, 1);
    finishAnimation();
    assert.equal(pokemon.updates.length, 0);
    await flushPaints();
    assert.equal(pokemon.system.attributes.hp.value, 14);
  } finally {
    delete game.dice3d;
  }
});

test("a masked chat result cannot heal until it is revealed and painted", async () => {
  const { item, pokemon } = fixture();
  const message = await publishBerryHealing(await prepareBerryHealing(item, pokemon), {
    pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.mask" }
  });
  let hidden = true;
  const result = { closest: () => hidden ? {} : null, checkVisibility: () => !hidden };
  const html = { isConnected: true, querySelector: () => result };
  await show(message, html);
  assert.equal(pokemon.updates.length, 0);
  hidden = false;
  for (const observer of [...observers]) { observer.callback(); }
  assert.equal(pokemon.updates.length, 0, "unmasking must be painted before applying HP");
  await flushPaints();
  assert.equal(pokemon.system.attributes.hp.value, 14);
  assert.equal(observers.size, 0);
});

test("rerendering during a dice animation uses the latest chat element and heals once", async () => {
  const { item, pokemon } = fixture();
  const message = await publishBerryHealing(await prepareBerryHealing(item, pokemon), {
    pokemon, itemName: "Oran", usageMessage: { uuid: "Usage.replace" }
  });
  let finishAnimation;
  game.dice3d = { waitFor3DAnimationByMessageID: () => new Promise(resolve => { finishAnimation = resolve; }) };
  try {
    await show(message, { isConnected: false });
    await show(message, { isConnected: true });
    assert.equal(pokemon.updates.length, 0);
    finishAnimation();
    await flushPaints();
    assert.equal(pokemon.updates.length, 1);
    await show(message);
    finishAnimation();
    await flushPaints();
    assert.equal(pokemon.updates.length, 1);
  } finally {
    delete game.dice3d;
  }
});
