import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { actors: [], user: { isGM: true }, settings: { get: () => undefined } };
globalThis.fromUuidSync = uuid => game.actors.find(each => each.uuid === uuid) ?? null;
const { BOX_SIZE, buildPcBoxes, moveSlot, staticSpriteSource, trainerPcEntries } = await import("../scripts/pokemon-pc-boxes.mjs");

function actor(name, flags, extra = {}) {
  const document = createFlagDocument({ uuid: `Actor.${name}`, documentName: "Actor", flags: { [MODULE_ID]: flags } });
  Object.assign(document, { name, testUserPermission: () => false }, extra);
  game.actors.push(document);
  return document;
}

const trainer = (name, partyUuids = [], extra = {}) => actor(name, { kind: "trainer", trainerLevel: 1, trainerParty: { pokemonUuids: partyUuids } }, extra);
const pokemon = (name, owner) => actor(name, { kind: "pokemon", trainerOwnerUuid: `Actor.${owner}` });
const sprite = (src, img) => staticSpriteSource({ prototypeToken: { texture: { src } }, img });

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

test("boxes page every 30 Pokémon, and an empty PC still gets a box", () => {
  const stored = Array.from({ length: BOX_SIZE + 1 }, (_, index) => ({ uuid: `p${index}` }));
  const boxes = buildPcBoxes([
    { trainer: { name: "Ash" }, party: [], partySlots: 3, stored },
    { trainer: { name: "Misty" }, party: [], partySlots: 3, stored: [] }
  ]);
  assert.deepEqual(boxes.map(box => [box.trainer.name, box.page, box.pages, box.pokemon.length]),
    [["Ash", 1, 2, 30], ["Ash", 2, 2, 1], ["Misty", 1, 1, 0]]);
  assert.equal(boxes[1].pokemon[0].uuid, "p30");
  assert.equal(BOX_SIZE, 30);
});

test("exactly a full box does not open an empty page", () => {
  const stored = Array.from({ length: BOX_SIZE }, (_, index) => ({ uuid: `p${index}` }));
  assert.equal(buildPcBoxes([{ trainer: {}, party: [], partySlots: 3, stored }]).length, 1);
});

test("arrow keys move through the grid and stop at its edges", () => {
  assert.equal(moveSlot(0, "ArrowRight", 6, 30), 1);
  assert.equal(moveSlot(0, "ArrowDown", 6, 30), 6);
  assert.equal(moveSlot(7, "ArrowUp", 6, 30), 1);
  assert.equal(moveSlot(0, "ArrowLeft", 6, 30), 0);
  assert.equal(moveSlot(0, "ArrowUp", 6, 30), 0);
  assert.equal(moveSlot(29, "ArrowDown", 6, 30), 29);
  assert.equal(moveSlot(5, "ArrowRight", 6, 30), 5, "no wrapping onto the next row");
  assert.equal(moveSlot(6, "ArrowLeft", 6, 30), 6, "no wrapping onto the previous row");
  assert.equal(moveSlot(2, "ArrowDown", 3, 3), 2, "a one-row party has nowhere below");
});

test("the entries split party from PC, drop deleted party members, and list player trainers first", () => {
  game.actors.length = 0;
  game.user.isGM = true;
  trainer("Zed", [], { hasPlayerOwner: true });
  const npc = trainer("Alma", ["Actor.Onix", "Actor.gone"]);
  pokemon("Onix", "Alma");
  pokemon("Zubat", "Alma");
  pokemon("Abra", "Alma");
  const [first, second] = trainerPcEntries();
  assert.equal(first.trainer.name, "Zed");
  assert.equal(second.trainer, npc);
  assert.deepEqual(second.party.map(each => each.name), ["Onix"]);
  assert.deepEqual(second.stored.map(each => each.name), ["Abra", "Zubat"]);
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
