import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitsHolderTypes } from "../scripts/encounter-item-selector.mjs";

const items = JSON.parse(readFileSync(new URL("../data/normalized/items.json", import.meta.url), "utf8"));
const byId = id => (Array.isArray(items) ? items : Object.values(items.items ?? items)).find(item => item.id === id);

test("type-bound items only fit a holder of that type", () => {
  assert.equal(fitsHolderTypes(byId("mystic-water"), ["psychic"]), false);
  assert.equal(fitsHolderTypes(byId("mystic-water"), ["water", "ground"]), true);
  assert.equal(fitsHolderTypes(byId("fire-gem"), ["grass"]), false);
  assert.equal(fitsHolderTypes(byId("odd-incense"), ["psychic"]), true);
  assert.equal(fitsHolderTypes(byId("black-sludge"), ["fire"]), false);
  assert.equal(fitsHolderTypes(byId("occa-berry"), ["grass"]), true);
  assert.equal(fitsHolderTypes(byId("mystic-water"), []), true);
});
