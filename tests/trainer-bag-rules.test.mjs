import assert from "node:assert/strict";
import test from "node:test";
import { BAG_CREATABLE_TYPES, BAG_CREATE_POCKET, BAG_MIN_SLOTS, bagContents, bagPocketOf, bagSlotCount, canUseBagItem, isEquippable } from "../scripts/trainer-bag-rules.mjs";

const item = (name, itemType, system = { quantity: 1 }, type = "consumable") => ({
  name, type, system, getFlag: () => itemType
});

test("the catalog's item types go to their pocket, and everything else to the gear pocket", () => {
  assert.equal(bagPocketOf(item("Poké Ball", "pokeball")), "pokeball");
  assert.equal(bagPocketOf(item("Potion", "medicine")), "medicine");
  assert.equal(bagPocketOf(item("Oran", "berry")), "berry");
  assert.equal(bagPocketOf(item("Leftovers", "held-item")), "held");
  assert.equal(bagPocketOf(item("Fire Stone", "evolution")), "held");
  assert.equal(bagPocketOf(item("Rope", "trainer-gear")), "other");
  assert.equal(bagPocketOf(item("Dagger", undefined)), "other");
});

test("the bag leaves out what has no quantity and sorts each pocket by name", () => {
  const contents = bagContents([
    item("Super Potion", "medicine"), item("Potion", "medicine"),
    item("Researcher", undefined, { levels: 3 }, "class"), item("Bite", undefined, {}, "feat")
  ]);
  assert.deepEqual(contents.get("medicine").map(each => each.name), ["Potion", "Super Potion"]);
  assert.deepEqual(contents.get("other"), []);
  assert.deepEqual([...contents.keys()], ["pokeball", "medicine", "berry", "held", "other"]);
});

test("a stack at zero is still in the bag: a lent item's record has to be seen", () => {
  assert.equal(bagContents([item("Leftovers", "held-item", { quantity: 0 })]).get("held").length, 1);
});

test("a pocket shows four rows at least, and always one row free when it grows past them", () => {
  assert.equal(bagSlotCount(0), BAG_MIN_SLOTS);
  assert.equal(bagSlotCount(23), BAG_MIN_SLOTS);
  assert.equal(bagSlotCount(24), 30);
  assert.equal(bagSlotCount(29), 30);
  assert.equal(bagSlotCount(30), 36);
});

test("an item is usable while there is one left, with or without activities", () => {
  assert.equal(canUseBagItem(item("Poké Ball", "pokeball", { quantity: 1, activities: new Map() })), true);
  assert.equal(canUseBagItem(item("Potion", "medicine", { quantity: 0, activities: new Map([["a", {}]]) })), false);
});

test("only weapons and armour offer equipping", () => {
  assert.equal(isEquippable(item("Dagger", undefined, { quantity: 1 }, "weapon")), true);
  assert.equal(isEquippable(item("Potion", "medicine")), false);
});

test("everything a player can create lands in the pocket offered, and has a stack to show", () => {
  for (const type of BAG_CREATABLE_TYPES) {
    const created = item("New", undefined, { quantity: 1 }, type);
    assert.equal(bagPocketOf(created), BAG_CREATE_POCKET);
    assert.equal(bagContents([created]).get(BAG_CREATE_POCKET).length, 1);
  }
});
