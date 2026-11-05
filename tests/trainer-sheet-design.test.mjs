import assert from "node:assert/strict";
import test from "node:test";
import { currentTrainerSheetDesign, trainerSheetClassId } from "../scripts/trainer-sheet-design.mjs";

const withSetting = value => {
  globalThis.game = { settings: { get: () => value } };
};

test("each design opens its sheet, and both pixel designs share one", () => {
  assert.equal(trainerSheetClassId("classic"), "poke5e-local.TrainerActorSheet");
  assert.equal(trainerSheetClassId("pc"), "poke5e-local.TrainerPixelSheet");
  assert.equal(trainerSheetClassId("rocket"), "poke5e-local.TrainerPixelSheet");
});

test("an unknown design falls back to the classic sheet, so no trainer ends up without one", () => {
  withSetting("removed-design");
  assert.equal(currentTrainerSheetDesign(), "classic");
  assert.equal(trainerSheetClassId(), "poke5e-local.TrainerActorSheet");
});

test("the setting decides the sheet when none is asked for", () => {
  withSetting("rocket");
  assert.equal(currentTrainerSheetDesign(), "rocket");
  assert.equal(trainerSheetClassId(), "poke5e-local.TrainerPixelSheet");
});
