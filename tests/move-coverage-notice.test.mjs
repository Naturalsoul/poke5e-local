import assert from "node:assert/strict";
import test from "node:test";
import { coverageNotice, registerMoveCoverageNotice } from "../scripts/move-coverage-notice.mjs";
import { MOVE_COVERAGE } from "../scripts/move-coverage.mjs";

test("the usage card warns about every Move the module does not fully resolve", () => {
  assert.deepEqual(coverageNotice("aerial-ace"), { kind: "manual", note: null });
  assert.equal(coverageNotice("assist").kind, "manual");
  assert.deepEqual(coverageNotice("amnesia"), { kind: "partial", note: MOVE_COVERAGE.amnesia.note });
  assert.equal(coverageNotice("absorb"), null, "fully automated");
  assert.equal(coverageNotice("aqua-jet"), null, "plain damage is rolled by the card");
  assert.equal(coverageNotice("not-a-move"), null);
  const pending = Object.entries(MOVE_COVERAGE).filter(([, entry]) => ["pending", "manual"].includes(entry.status));
  assert.ok(pending.every(([id]) => coverageNotice(id)?.kind === "manual"));
});

test("only the GM sees the notice on the card", () => {
  const renders = [];
  globalThis.Hooks = { on: (_name, fn) => renders.push(fn) };
  globalThis.game = { user: { isGM: false }, settings: { get: () => "es" } };
  globalThis.document = { createElement: () => ({ append() {} }) };
  registerMoveCoverageNotice();
  const move = { getFlag: (_m, key) => ({ kind: "move", sourceId: "aerial-ace" })[key] };
  const message = { type: "usage", getAssociatedItem: () => move };
  const card = () => { const appended = []; return { appended, append: node => appended.push(node), querySelector: () => null }; };
  const player = card();
  renders.forEach(render => render(message, player));
  assert.equal(player.appended.length, 0, "a player sees nothing");
  game.user.isGM = true;
  const gm = card();
  renders.forEach(render => render(message, gm));
  assert.equal(gm.appended.length, 1);
});
