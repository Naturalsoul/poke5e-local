import assert from "node:assert/strict";
import test from "node:test";
import { coverageNotice } from "../scripts/move-coverage-notice.mjs";
import { MOVE_COVERAGE } from "../scripts/move-coverage.mjs";

test("the usage card warns about every Move the module does not fully resolve", () => {
  assert.deepEqual(coverageNotice("acid"), { kind: "manual", note: null });
  assert.equal(coverageNotice("assist").kind, "manual");
  assert.deepEqual(coverageNotice("amnesia"), { kind: "partial", note: MOVE_COVERAGE.amnesia.note });
  assert.equal(coverageNotice("absorb"), null, "fully automated");
  assert.equal(coverageNotice("aqua-jet"), null, "plain damage is rolled by the card");
  assert.equal(coverageNotice("not-a-move"), null);
  const pending = Object.entries(MOVE_COVERAGE).filter(([, entry]) => ["pending", "manual"].includes(entry.status));
  assert.ok(pending.every(([id]) => coverageNotice(id)?.kind === "manual"));
});
