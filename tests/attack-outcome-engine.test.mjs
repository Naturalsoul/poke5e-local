import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAttackOutcome,
  isAttackCritical,
  isAttackHit,
  isAttackMiss,
  isMeleeAttack,
  isNaturalAttackAtLeast
} from "../attack-outcome-engine.mjs";

function item() {
  return {
    uuid: "Item.tackle",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      if (key === "sourceId") return "tackle";
      return undefined;
    }
  };
}

function activity() {
  return {
    id: "attack",
    actor: { uuid: "Actor.pikachu" },
    item: item(),
    attack: { type: { value: "melee" } }
  };
}

function roll({ natural = 10, total = 15, target = 12, critical = false, fumble = false } = {}) {
  return {
    d20: {
      results: [
        { result: natural, active: true, discarded: false }
      ]
    },
    total,
    isCritical: critical,
    isFumble: fumble,
    hasAdvantage: false,
    hasDisadvantage: false,
    options: {
      target,
      poke5eTargetActorUuid: "Actor.target"
    }
  };
}

test("AttackOutcome resolves a normal hit and preserves natural d20", () => {
  const outcome = buildAttackOutcome(roll(), activity());
  assert.equal(isAttackHit(outcome), true);
  assert.equal(isAttackMiss(outcome), false);
  assert.equal(outcome.natural, 10);
  assert.equal(outcome.targetActorUuid, "Actor.target");
  assert.equal(isMeleeAttack(outcome), true);
});

test("critical overrides AC and fumble forces miss", () => {
  const critical = buildAttackOutcome(
    roll({ natural: 20, total: 5, target: 99, critical: true }),
    activity()
  );
  const fumble = buildAttackOutcome(
    roll({ natural: 1, total: 99, target: 1, fumble: true }),
    activity()
  );

  assert.equal(isAttackCritical(critical), true);
  assert.equal(isAttackHit(critical), true);
  assert.equal(isAttackMiss(fumble), true);
});

test("without target AC the hit result remains unresolved", () => {
  const unresolvedRoll = roll();
  unresolvedRoll.options.target = null;
  const outcome = buildAttackOutcome(unresolvedRoll, activity());

  assert.equal(outcome.hit, null);
  assert.equal(outcome.miss, null);
});

test("natural threshold predicates use the selected d20 face", () => {
  const outcome = buildAttackOutcome(
    roll({ natural: 16, total: 18 }),
    activity()
  );
  assert.equal(isNaturalAttackAtLeast(outcome, 16), true);
  assert.equal(isNaturalAttackAtLeast(outcome, 17), false);
});
