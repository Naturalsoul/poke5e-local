import assert from "node:assert/strict";
import test from "node:test";
import { resolveSceneTransitionEffect, SCENE_TRANSITION_EFFECTS } from "../scripts/scene-transition-service.mjs";

test("the scene flag wins over the world default", () => {
  assert.equal(resolveSceneTransitionEffect("rain", "grow"), "rain");
  assert.equal(resolveSceneTransitionEffect("none", "grow"), null);
});

test("an empty flag falls back to the world default", () => {
  assert.equal(resolveSceneTransitionEffect("", "close"), "close");
  assert.equal(resolveSceneTransitionEffect(undefined, "none"), null);
  assert.equal(resolveSceneTransitionEffect("", undefined), null);
});

test("random picks one of the real effects", () => {
  assert.equal(resolveSceneTransitionEffect("random", "none", () => 0), SCENE_TRANSITION_EFFECTS[0]);
  assert.equal(resolveSceneTransitionEffect("random", "none", () => 0.999), SCENE_TRANSITION_EFFECTS.at(-1));
});

test("unknown values mean no transition", () => {
  assert.equal(resolveSceneTransitionEffect("iris", "none"), null);
});
