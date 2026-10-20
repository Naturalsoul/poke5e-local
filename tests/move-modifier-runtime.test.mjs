import test from "node:test";
import assert from "node:assert/strict";
import {
  activeDamageDiceModifier,
  activateFollowingTurnMoveModifiers,
  armFollowingTurnMoveModifier,
  consumeActiveMoveModifier,
  expireActiveMoveModifiers
} from "../scripts/move-modifier-runtime.mjs";
import {
  createFlagDocument,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();

test("following-turn modifier transitions armed -> active -> consumed", async () => {
  const actor = createFlagDocument({ uuid: "Actor.anger-point" });

  await armFollowingTurnMoveModifier(actor, {
    sourceAbility: "anger-point",
    damageDiceMultiplier: 2,
    usesRemaining: 1
  });

  assert.equal(activeDamageDiceModifier(actor), null);

  const activated = await activateFollowingTurnMoveModifiers(actor);
  assert.equal(activated.length, 1);
  assert.equal(activeDamageDiceModifier(actor)?.damageDiceMultiplier, 2);

  assert.equal(consumeActiveMoveModifier(actor, "anger-point"), true);
  assert.equal(activeDamageDiceModifier(actor), null);
});

test("unused active modifiers expire at end of turn", async () => {
  const actor = createFlagDocument({ uuid: "Actor.expire" });

  await armFollowingTurnMoveModifier(actor, {
    sourceAbility: "anger-point",
    damageDiceMultiplier: 2
  });
  await activateFollowingTurnMoveModifiers(actor);

  const expired = await expireActiveMoveModifiers(actor);
  assert.equal(expired.length, 1);
  assert.equal(activeDamageDiceModifier(actor), null);
});
