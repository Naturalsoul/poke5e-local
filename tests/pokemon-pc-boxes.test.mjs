import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { actors: [], user: { isGM: true }, settings: { get: () => undefined } };
globalThis.fromUuidSync = uuid => game.actors.find(each => each.uuid === uuid) ?? null;
const { BOX_SIZE, moveSlot, pcBoxCount, planPcMove, resolvePcLayout, staticSpriteSource, trainerPcEntries } = await import("../scripts/pokemon-pc-boxes.mjs");

function actor(name, flags, extra = {}) {
  const document = createFlagDocument({ uuid: `Actor.${name}`, documentName: "Actor", flags: { [MODULE_ID]: flags } });
  Object.assign(document, { name, testUserPermission: () => false }, extra);
  game.actors.push(document);
  return document;
}

const trainer = (name, partyUuids = [], extra = {}, flags = {}) => actor(name, { kind: "trainer", trainerLevel: 1, trainerParty: { pokemonUuids: partyUuids }, ...flags }, extra);
const pokemon = (name, owner) => actor(name, { kind: "pokemon", trainerOwnerUuid: `Actor.${owner}` });
const sprite = (src, img) => staticSpriteSource({ prototypeToken: { texture: { src } }, img });
const stored = (...uuids) => uuids.map(uuid => ({ uuid }));
const context = (party, slots, { limit = 3, active = [] } = {}) => ({ party, slots, limit, isActive: uuid => active.includes(uuid) });

test("the static sprite swaps an animated token for the PNG next to it, shiny included", () => {
  const folder = "modules/poke5e-local/assets/pokemon/abra";
  assert.equal(sprite(`${folder}/sprite-animated.webm`, "main.png"), `${folder}/sprite.png`);
  assert.equal(sprite(`${folder}/sprite-animated-shiny.webm`, "main.png"), `${folder}/sprite-shiny.png`);
});

test("the static sprite keeps custom art, and never returns a video it cannot convert", () => {
  assert.equal(sprite("worlds/art/my-abra.png", "main.png"), "worlds/art/my-abra.png");
  assert.equal(sprite("worlds/art/my-abra.webm", "main.png"), "main.png");
  assert.equal(sprite("", "main.png"), "main.png");
});

test("the layout keeps saved places, fills gaps with the rest, and forgets who left the PC", () => {
  assert.deepEqual(resolvePcLayout(stored("a", "b"), undefined), ["a", "b"]);
  assert.deepEqual(resolvePcLayout(stored("a", "b", "c"), [null, "b", null, "a"]), ["c", "b", null, "a"]);
  assert.deepEqual(resolvePcLayout(stored("a"), ["gone", "a"]), [null, "a"]);
  assert.deepEqual(resolvePcLayout(stored("a"), ["a", "a"]), ["a"], "a duplicated uuid keeps its first place");
});

test("there is always one box more than the ones in use", () => {
  assert.equal(pcBoxCount([]), 1);
  assert.equal(pcBoxCount(["a"]), 2);
  assert.equal(pcBoxCount(Array(BOX_SIZE).fill("a")), 2);
  assert.equal(pcBoxCount(Array(BOX_SIZE + 1).fill("a")), 3);
  assert.equal(BOX_SIZE, 30);
});

test("moving inside the PC goes to an empty slot, another box, or swaps", () => {
  const box = { zone: "box" };
  assert.deepEqual(planPcMove(context([], ["a", "b"]), "a", { ...box, index: 3 }).slots, [null, "b", null, "a"]);
  assert.equal(planPcMove(context([], ["a", "b"]), "a", { ...box, index: 31 }).slots[31], "a");
  assert.deepEqual(planPcMove(context([], ["a", "b"]), "a", { ...box, index: 1 }).slots, ["b", "a"]);
  assert.equal(planPcMove(context([], ["a"]), "a", { ...box, index: 0 }), null);
});

test("a planned layout has no holes, which would not survive being saved as a flag", () => {
  const { slots } = planPcMove(context([], ["a"]), "a", { zone: "box", index: 5 });
  assert.deepEqual(slots, [null, null, null, null, null, "a"]);
  assert.equal(Object.keys(slots).length, slots.length);
});

test("moving from the PC to the party respects the Pokéslots and swaps with the member there", () => {
  const added = planPcMove(context(["x"], ["a"]), "a", { zone: "party", index: 1 });
  assert.deepEqual([added.party, added.slots], [["x", "a"], [null]]);
  assert.deepEqual(planPcMove(context(["x", "y"], ["a"], { limit: 2 }), "a", { zone: "party", index: 2 }), { error: "full" });
  const swapped = planPcMove(context(["x", "y"], ["a"], { limit: 2 }), "a", { zone: "party", index: 0 });
  assert.deepEqual([swapped.party, swapped.slots], [["a", "y"], ["x"]]);
});

test("a deployed Pokémon cannot leave the party, either way", () => {
  const deployed = { active: ["x"] };
  assert.deepEqual(planPcMove(context(["x"], [], deployed), "x", { zone: "box", index: 0 }), { error: "active" });
  assert.deepEqual(planPcMove(context(["x"], ["a"], deployed), "a", { zone: "party", index: 0 }), { error: "active" });
});

test("moving from the party to the PC frees its place, or swaps", () => {
  const freed = planPcMove(context(["x", "y"], []), "x", { zone: "box", index: 2 });
  assert.deepEqual([freed.party, freed.slots], [["y"], [null, null, "x"]]);
  const swapped = planPcMove(context(["x", "y"], ["a"]), "x", { zone: "box", index: 0 });
  assert.deepEqual([swapped.party, swapped.slots], [["a", "y"], ["x"]]);
});

test("party members swap places, and dropping on an empty party slot changes nothing", () => {
  assert.deepEqual(planPcMove(context(["x", "y"], []), "x", { zone: "party", index: 1 }).party, ["y", "x"]);
  assert.equal(planPcMove(context(["x"], []), "x", { zone: "party", index: 2 }), null);
});

test("arrow keys cross from the box to the party row and stop at the edges", () => {
  const count = BOX_SIZE + 3;
  assert.equal(moveSlot(0, "ArrowRight", 6, count), 1);
  assert.equal(moveSlot(7, "ArrowUp", 6, count), 1);
  assert.equal(moveSlot(0, "ArrowLeft", 6, count), 0);
  assert.equal(moveSlot(5, "ArrowRight", 6, count), 5, "no wrapping onto the next row");
  assert.equal(moveSlot(24, "ArrowDown", 6, count), 30, "down from the last row lands on the party");
  assert.equal(moveSlot(30, "ArrowUp", 6, count), 24);
  assert.equal(moveSlot(29, "ArrowDown", 6, count), 29, "no party slot below");
});

test("the entries split party from PC, drop deleted party members, keep saved places, and list player trainers first", () => {
  game.actors.length = 0;
  trainer("Zed", [], { hasPlayerOwner: true });
  const npc = trainer("Alma", ["Actor.Onix", "Actor.gone"], {}, { pcSlots: [null, "Actor.Zubat"] });
  pokemon("Onix", "Alma");
  pokemon("Zubat", "Alma");
  pokemon("Abra", "Alma");
  const [first, second] = trainerPcEntries();
  assert.equal(first.trainer.name, "Zed");
  assert.equal(second.trainer, npc);
  assert.deepEqual(second.party.map(each => each.name), ["Onix"]);
  assert.deepEqual(second.slots, ["Actor.Abra", "Actor.Zubat"]);
  assert.equal(second.partySlots, 3);
});

test("a player only gets the trainers they own", () => {
  game.actors.length = 0;
  game.user.isGM = false;
  trainer("Theirs");
  trainer("Mine", [], { testUserPermission: () => true });
  assert.deepEqual(trainerPcEntries().map(entry => entry.trainer.name), ["Mine"]);
  game.user.isGM = true;
});
