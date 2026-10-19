import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { user: { targets: new Set() }, settings: { get: () => "es" }, combat: null };
const { berryHealingFormula } = await import("../scripts/berry-healing.mjs");
const engine = await import("../scripts/berry-ability-engine.mjs");

function pokemon(abilityId, { side = 1, hpMax = 35 } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, name: abilityId, items: [createAbilityItem(abilityId)],
    flags: { [MODULE_ID]: { kind: "pokemon" } }, system: { attributes: { hp: { value: hpMax, max: hpMax } } } });
  actor.getActiveTokens = () => [{ document: { disposition: side } }];
  return actor;
}

test("Ripen doubles the berry's healing and Cheek Pouch adds 10% of the maximum HP, rounded up", () => {
  assert.equal(berryHealingFormula(["(2d4)"], pokemon("static")), "(2d4)");
  assert.equal(berryHealingFormula(["(2d4)"], pokemon("ripen")), "2 * ((2d4))");
  assert.equal(berryHealingFormula(["(2d4)"], pokemon("cheek-pouch")), "(2d4) + 4");
  assert.equal(berryHealingFormula([], pokemon("cheek-pouch")), "4", "a berry that does not heal still heals with Cheek Pouch");
  assert.equal(berryHealingFormula([], pokemon("ripen")), null);
});

test("Unnerve only stops opponents in the same combat", () => {
  const eater = pokemon("gluttony");
  const ally = pokemon("unnerve");
  const foe = pokemon("unnerve", { side: -1 });
  game.combat = { combatants: [{ actor: eater }, { actor: ally }] };
  assert.equal(engine.unnervedBy(eater), null);
  game.combat = { combatants: [{ actor: eater }, { actor: foe }] };
  assert.equal(engine.unnervedBy(eater), foe);
  game.combat = null;
  assert.equal(engine.unnervedBy(eater), null);
});

test("Gluttony eats when the HP falls to half or less, once", () => {
  assert.equal(engine.fellBelowHalf(20, 17, 34), true);
  assert.equal(engine.fellBelowHalf(17, 10, 34), false, "already at half");
  assert.equal(engine.fellBelowHalf(20, 18, 34), false);
  assert.equal(engine.fellBelowHalf(20, 0, 34), false, "fainted");
});

test("only Harvest and Cud Chew remember the berry they ate", async () => {
  const tropius = pokemon("harvest");
  const snorlax = pokemon("gluttony");
  await engine.rememberEatenBerry(tropius, { name: "Oran Berry" });
  await engine.rememberEatenBerry(snorlax, { name: "Oran Berry" });
  assert.equal(tropius.getFlag(MODULE_ID, "eatenBerry").source.name, "Oran Berry");
  assert.equal(snorlax.getFlag(MODULE_ID, "eatenBerry"), undefined);
});
