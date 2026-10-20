import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ABILITY_COVERAGE, ABILITY_MODULES } from "../scripts/ability-coverage.mjs";

const { items } = JSON.parse(readFileSync(new URL("../data/normalized/abilities.json", import.meta.url), "utf8"));

test("every current Ability has exactly one coverage entry", () => {
  assert.deepEqual(Object.keys(ABILITY_COVERAGE).sort(), items.filter(ability => !ability.deprecated).map(ability => ability.id).sort());
});

test("coverage entries are well formed", () => {
  for (const [id, entry] of Object.entries(ABILITY_COVERAGE)) {
    if (entry.status === "automated") {
      assert.ok(entry.engines?.length, `${id}: automated without engines`);
      for (const engine of entry.engines) {
        assert.ok(existsSync(new URL(`../scripts/${engine}.mjs`, import.meta.url)), `${id}: no scripts/${engine}.mjs`);
      }
    } else if (entry.status === "pending") {
      assert.ok(ABILITY_MODULES[entry.module], `${id}: unknown module ${entry.module}`);
    } else {
      assert.equal(entry.status, "manual", `${id}: unknown status ${entry.status}`);
      assert.ok(entry.reason, `${id}: manual without a reason`);
    }
  }
});

test("automated Abilities are named in the engines that implement them", () => {
  for (const [id, entry] of Object.entries(ABILITY_COVERAGE).filter(([, coverage]) => coverage.status === "automated")) {
    const source = engine => readFileSync(new URL(`../scripts/${engine}.mjs`, import.meta.url), "utf8");
    const named = entry.engines.some(engine => new RegExp(`"${id}"|\\b${id}:`).test(source(engine)));
    assert.ok(named, `${id}: not found in ${entry.engines.join(", ")}`);
  }
});
