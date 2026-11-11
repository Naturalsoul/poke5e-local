import assert from "node:assert/strict";
import test from "node:test";
import { BALL_TYPES, pickBallType, resolveSceneTransitionEffect, SCENE_TRANSITION_EFFECTS } from "../scripts/scene-transition-service.mjs";

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

test("the Team Rocket R is chosen on purpose, never by random", () => {
  assert.equal(resolveSceneTransitionEffect("rocket", "none"), "rocket");
  assert.ok(!SCENE_TRANSITION_EFFECTS.includes("rocket"));
});

test("the GBA effects are available", () => {
  for (const effect of ["stripes", "spiral", "mosaic"]) {
    assert.equal(resolveSceneTransitionEffect(effect, "none"), effect);
  }
});

test("unknown values mean no transition", () => {
  assert.equal(resolveSceneTransitionEffect("iris", "none"), null);
  assert.equal(resolveSceneTransitionEffect("flash", "none"), null);
});

test("ball types cover every ball and the random pick stays in range", () => {
  assert.deepEqual([...BALL_TYPES], ["poke", "great", "ultra", "master", "premier"]);
  assert.equal(pickBallType(() => 0), "poke");
  assert.equal(pickBallType(() => 0.999), "premier");
});
