import test from "node:test";
import assert from "node:assert/strict";
import { hasActiveBerserk } from "../scripts/berserk-runtime.mjs";
import { resolveStabAbilityBoost } from "../scripts/stab-ability-runtime.mjs";
import {
  createAbilityItem,
  createFlagDocument
} from "./helpers/foundry-mocks.mjs";

function actorWithAbility(abilityId, hp) {
  return createFlagDocument({
    items: [createAbilityItem(abilityId)],
    system: {
      attributes: {
        hp: { value: hp, max: 100 }
      }
    }
  });
}

test("Berserk uses strictly below 25% HP", () => {
  assert.equal(hasActiveBerserk(actorWithAbility("berserk", 24)), true);
  assert.equal(hasActiveBerserk(actorWithAbility("berserk", 25)), false);
});

test("threshold STAB abilities activate at exactly 25% HP", () => {
  const boost = resolveStabAbilityBoost(
    actorWithAbility("torrent", 25),
    2
  );

  assert.deepEqual(
    { sourceAbility: boost.sourceAbility, baseBonus: boost.baseBonus, extraBonus: boost.extraBonus, totalBonus: boost.totalBonus },
    { sourceAbility: "torrent", baseBonus: 2, extraBonus: 2, totalBonus: 4 }
  );
});

test("STAB boost does not activate above threshold", () => {
  assert.equal(
    resolveStabAbilityBoost(actorWithAbility("blaze", 26), 2),
    null
  );
});
