import test from "node:test";
import assert from "node:assert/strict";
import {
  crossedHpThreshold,
  currentPokemonHpState,
  isAtOrBelowHpRatio,
  isBelowHpRatio,
  projectedPokemonHpState
} from "../hp-runtime.mjs";

function actor(value, max) {
  return {
    system: {
      attributes: {
        hp: { value, max }
      }
    }
  };
}

test("HP state exposes value, maximum and ratio", () => {
  assert.deepEqual(
    currentPokemonHpState(actor(25, 100)),
    { value: 25, maximum: 100, ratio: 0.25 }
  );
});

test("at-or-below and strictly-below preserve the 25% boundary", () => {
  const target = actor(25, 100);
  assert.equal(isAtOrBelowHpRatio(target, 0.25), true);
  assert.equal(isBelowHpRatio(target, 0.25), false);
});

test("projected HP reads Foundry update paths", () => {
  assert.deepEqual(
    projectedPokemonHpState(
      actor(40, 100),
      { "system.attributes.hp.value": 20 }
    ),
    { before: 40, after: 20, maximum: 100 }
  );
});

test("crossedHpThreshold distinguishes below from at-or-below", () => {
  const state = { before: 30, after: 25, maximum: 100 };
  assert.equal(
    crossedHpThreshold(state, { ratio: 0.25, direction: "below" }),
    false
  );
  assert.equal(
    crossedHpThreshold(state, { ratio: 0.25, direction: "at-or-below" }),
    true
  );
});
