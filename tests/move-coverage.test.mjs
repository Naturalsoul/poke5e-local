import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { MOVE_COVERAGE } from "../scripts/move-coverage.mjs";
import { buildMoveStatusEffects } from "../scripts/status-effects.mjs";
import { AUTOMATED_MODIFIER_MOVES } from "../scripts/modifier-effects.mjs";
import { buildMovePeriodicEffects } from "../scripts/periodic-effects.mjs";
import { buildMoveDrainData } from "../scripts/drain-effects.mjs";
import { buildMoveRecoilData } from "../scripts/recoil-effects.mjs";
import { buildMoveSelfDamageData } from "../scripts/self-damage-effects.mjs";
import { buildMoveForcedRecoilData } from "../scripts/forced-recoil-effects.mjs";
import { buildMoveMultiTargetData } from "../scripts/multi-target-effects.mjs";
import { buildMoveSaveResultData } from "../scripts/save-result-effects.mjs";
import { isStruggleMove } from "../scripts/struggle-rules.mjs";

installFoundryUtils();
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.game = { settings: { get: () => "es" } };

// Module ids from CAPABILITY-MAP-moves.md.
const MODULES = new Set(["status-riders", "stat-modifiers", "attack-riders", "healing",
  "forced-movement", "field-effects", "special-mechanics"]);
const STATUSES = new Set(["automated", "pending", "manual", "plain-damage"]);
const { moves } = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));
const has = data => Boolean(data && (Array.isArray(data.effects) ? data.effects.length : true));

// Modifiers outside AUTOMATED_MODIFIER_MOVES only get a GM chat button, so they don't count.
function detectedEngines(move) {
  return [
    ["status-effects", has(buildMoveStatusEffects(move, "es", {}))],
    ["modifier-effects", AUTOMATED_MODIFIER_MOVES.has(move.id)],
    ["periodic-effects", has(buildMovePeriodicEffects(move, "es", {}))],
    ["drain-effects", has(buildMoveDrainData(move))],
    ["recoil-effects", has(buildMoveRecoilData(move))],
    ["self-damage-effects", has(buildMoveSelfDamageData(move))],
    ["forced-recoil-effects", has(buildMoveForcedRecoilData(move))],
    ["multi-target-effects", has(buildMoveMultiTargetData(move))],
    ["save-result-effects", has(buildMoveSaveResultData(move))],
    ["struggle-rules", isStruggleMove(move)]
  ].filter(([, on]) => on).map(([name]) => name);
}

test("every move has exactly one coverage entry", () => {
  assert.deepEqual(Object.keys(MOVE_COVERAGE).sort(), moves.map(move => move.id).sort());
});

test("coverage entries are well formed", () => {
  for (const [id, entry] of Object.entries(MOVE_COVERAGE)) {
    assert.ok(STATUSES.has(entry.status), `${id}: unknown status ${entry.status}`);
    if (entry.status === "automated") {
      assert.ok(entry.engines?.length, `${id}: automated without engines`);
      for (const engine of entry.engines) {
        assert.ok(existsSync(new URL(`../scripts/${engine}.mjs`, import.meta.url)), `${id}: no scripts/${engine}.mjs`);
      }
    }
    if (entry.status === "pending") {
      for (const module of [entry.module, ...(entry.also ?? [])]) {
        assert.ok(MODULES.has(module), `${id}: unknown module ${module}`);
      }
    }
    if (entry.status === "manual") {assert.ok(entry.reason, `${id}: manual without reason`);}
  }
});

test("moves the builders automate are marked automated", () => {
  for (const move of moves) {
    const engines = detectedEngines(move);
    if (!engines.length) {continue;}
    const entry = MOVE_COVERAGE[move.id];
    assert.equal(entry.status, "automated", `${move.id}: automated by ${engines.join(", ")}`);
    for (const engine of engines) {assert.ok(entry.engines.includes(engine), `${move.id}: missing ${engine}`);}
  }
});

test("every suggestion has been reviewed by hand", () => {
  const unreviewed = Object.keys(MOVE_COVERAGE).filter(id => MOVE_COVERAGE[id].reviewed === false);
  assert.deepEqual(unreviewed, []);
});

test("coverage summary", t => {
  const counts = {};
  for (const entry of Object.values(MOVE_COVERAGE)) {
    const key = entry.status === "pending" ? `pending:${entry.module}` : entry.status;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  for (const [key, count] of Object.entries(counts).sort()) {t.diagnostic(`${key}: ${count}`);}
  t.diagnostic(`total: ${Object.keys(MOVE_COVERAGE).length}`);
});
