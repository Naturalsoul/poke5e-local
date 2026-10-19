import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const user = { id: "player", isGM: false, active: true, hotbar: { 3: "theirs", 12: "page2" } };
user.update = async ({ hotbar }) => { user.hotbar = hotbar; };
const macros = [];
globalThis.game = { actors: [], user, users: [user], macros, settings: { get: () => "es" }, combat: null };
globalThis.ui = { hotbar: { page: 1, render() {}, changePage() {}, slots: [] }, notifications: { warn() {} } };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
let nextId = 0;
function macro(data) {
  const doc = { id: `macro-${++nextId}`, author: user, ...data, getFlag: (_module, key) => doc.flags?.[MODULE_ID]?.[key] };
  return doc;
}
macros.documentClass = {
  createDocuments: async list => list.map(data => { const doc = macro(data); macros.push(doc); return doc; }),
  updateDocuments: async list => list.forEach(({ _id, ...data }) => Object.assign(macros.find(doc => doc.id === _id), data))
};
macros.push(macro({ id: "theirs", name: "Mi macro" }));
macros.get = id => macros.find(doc => doc.id === id);
const hotbar = await import("../scripts/battle-hotbar.mjs");
hotbar.registerBattleHotbar();

function trainer(pathId, level) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${game.actors.length}`, flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} },
      resources: { battleDice: { value: 0, max: 3 } } } } } });
  game.actors.push(actor);
  return actor;
}

function pokemon(owner, moves) {
  const items = moves.map(([name, pp]) => ({ id: name, documentName: "Item", name, img: `${name}.webp`, system: { uses: { max: pp, value: pp - 1 } },
    getFlag: (_module, key) => ({ kind: "move", sourceId: name })[key] }));
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${game.actors.length}`, items, flags: { [MODULE_ID]: {
    kind: "pokemon", trainerOwnerUuid: owner.uuid, knownMoveIds: moves.map(([name]) => name) } } });
  actor.items.get = id => items.find(item => item.id === id);
  game.actors.push(actor);
  return actor;
}

test("Moves fill the hotbar from slot 1 and the trainer's actions end at slot 10, with PP and uses left", () => {
  const ace = trainer("ace-trainer", 5);
  const slots = hotbar.battleHotbarSlots(pokemon(ace, [["tackle", 35], ["ember", 25]]), ace);
  assert.deepEqual(Object.keys(slots), ["1", "2", "10"]);
  assert.equal(slots[1].name, "tackle");
  assert.equal(slots[10].name, "Battle Dice");
  assert.deepEqual(hotbar.battleHotbarCounter(slots[1].entry), { value: 34, max: 35 });
  assert.deepEqual(hotbar.battleHotbarCounter(slots[10].entry), { value: 0, max: 3 });
});

test("showing another Pokémon reuses the user's battle macros and leaves their own macros alone", async () => {
  const ace = trainer("ace-trainer", 5);
  await hotbar.showBattleHotbar(pokemon(ace, [["tackle", 35], ["ember", 25], ["growl", 40]]), ace);
  assert.equal(macros.length, 5);
  assert.equal(user.hotbar[3] === "theirs", false, "page 1 slots are the module's");
  assert.equal(user.hotbar[12], "page2");
  await hotbar.showBattleHotbar(pokemon(ace, [["surf", 15]]), ace);
  assert.equal(macros.length, 5, "no new macros");
  assert.deepEqual(Object.keys(user.hotbar).sort(), ["1", "10", "12"]);
  assert.equal(macros.find(doc => doc.id === user.hotbar[1]).name, "surf");
});

test("the hotbar shows the counters and greys out what is spent", () => {
  const added = [];
  const slot = number => ({ dataset: { slot: number }, classList: { toggle: (name, on) => on && added.push(name) },
    insertAdjacentHTML: (_where, html) => added.push(html) });
  hooks.handler("renderHotbar")(null, { querySelectorAll: () => [slot("1"), slot("10"), slot("4")] });
  assert.deepEqual(added, ["<span class=\"poke5e-hotbar-slot__count\">14/15</span>", "poke5e-hotbar-slot--spent",
    "<span class=\"poke5e-hotbar-slot__count\">0/3</span>"]);
});

test("the trainer's player follows a deploy, and the battle slots are cleared when every Pokémon is recalled", async () => {
  const ace = trainer("ace-trainer", 5);
  ace.testUserPermission = () => true;
  const onix = pokemon(ace, [["rock-throw", 15]]);
  const party = active => ({ pokemonUuids: [onix.uuid], activePokemonUuids: active });
  const change = async active => {
    await ace.setFlag(MODULE_ID, "trainerParty", party(active));
    hooks.handler("updateActor")(ace, { flags: { [MODULE_ID]: { trainerParty: party(active) } } });
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  await change([onix.uuid]);
  assert.equal(macros.find(doc => doc.id === user.hotbar[1]).name, "rock-throw");
  await change([]);
  assert.deepEqual(Object.keys(user.hotbar), ["12"]);
});
