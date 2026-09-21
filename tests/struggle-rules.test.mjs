import test from "node:test";
import assert from "node:assert/strict";

import {
  STRUGGLE_ACTIVITY_IDS,
  STRUGGLE_MOVE_ID,
  STRUGGLE_RULE,
  buildStruggleDamageFormula,
  getStruggleActivityVariants,
  isStruggleMove
} from "../struggle-rules.mjs";

test("Struggle exposes the canonical move id and activity ids", () => {
  assert.equal(STRUGGLE_MOVE_ID, "struggle");
  assert.deepEqual(STRUGGLE_ACTIVITY_IDS, {
    melee: "P5eStruggleMelee",
    ranged: "P5eStruggleRange"
  });
});

test("Struggle rule keeps typeless, fixed base damage and no amplification", () => {
  assert.deepEqual(STRUGGLE_RULE, {
    baseDamage: 2,
    damageType: "typeless",
    meleeRange: 5,
    rangedRange: 60,
    noAmplification: true
  });
});

test("isStruggleMove normalizes the move id", () => {
  assert.equal(isStruggleMove({ id: "Struggle" }), true);
  assert.equal(isStruggleMove({ id: "tackle" }), false);
});

test("buildStruggleDamageFormula preserves positive, zero and negative MOVE modifiers", () => {
  assert.equal(buildStruggleDamageFormula(3), "2 + 3");
  assert.equal(buildStruggleDamageFormula(0), "2");
  assert.equal(buildStruggleDamageFormula(-2), "2 - 2");
});

test("buildStruggleDamageFormula rejects non-numeric MOVE modifiers", () => {
  assert.throws(
    () => buildStruggleDamageFormula("MOVE"),
    /modificador MOVE numérico/
  );
});

test("Struggle activity variants use the real melee and ranged contracts", () => {
  const spanish = getStruggleActivityVariants("es");
  const english = getStruggleActivityVariants("en");

  assert.equal(spanish.length, 2);
  assert.equal(spanish[0].activityId, STRUGGLE_ACTIVITY_IDS.melee);
  assert.equal(spanish[0].scope, "melee");
  assert.equal(spanish[0].range.type, "melee");
  assert.equal(spanish[1].activityId, STRUGGLE_ACTIVITY_IDS.ranged);
  assert.equal(spanish[1].scope, "ranged");
  assert.equal(spanish[1].range.value, STRUGGLE_RULE.rangedRange);
  assert.equal(spanish[1].range.unit, "ft");

  assert.equal(english[0].nameSuffix, "Melee");
  assert.equal(english[1].nameSuffix, "Ranged");
});
