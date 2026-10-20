import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const warnings = [];
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.ui = { notifications: { warn: text => warnings.push(text) } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" } };
const sleep = await import("../scripts/sleep-moves.mjs");
sleep.registerSleepMoves();

function pokemon(value, statuses = []) {
  const actor = createFlagDocument({ flags: { [MODULE_ID]: { kind: "pokemon" } } });
  actor.system = { attributes: { hp: { value } } };
  actor.effects = statuses.map(status => ({ flags: { [MODULE_ID]: { status } } }));
  return actor;
}

const move = (id, activation = "action") => createFlagDocument({ name: id,
  flags: { [MODULE_ID]: { kind: "move", sourceId: id, moveDefinition: { activation: { type: activation } } } } });

test("Sing puts creatures to sleep from its pool, lowest hit points first, skipping the asleep", () => {
  const [low, mid, high, sleeping] = [pokemon(8), pokemon(12), pokemon(15), pokemon(1, ["asleep"])];
  assert.deepEqual(sleep.singTargets(22, [high, mid, sleeping, low]), [low, mid]);
  assert.deepEqual(sleep.singTargets(7, [low]), []);
});

test("Snore and Sleep Talk can only be used while asleep", () => {
  const preUse = hooks.handler("dnd5e.preUseActivity");
  assert.equal(preUse({ actor: pokemon(10), item: move("snore") }), false);
  assert.equal(warnings.length, 1);
  assert.equal(preUse({ actor: pokemon(10, ["asleep"]), item: move("sleep-talk") }), true);
  assert.equal(preUse({ actor: pokemon(10), item: move("tackle") }), true);
});

test("Sleep Talk picks among its other 1-action Moves", () => {
  const actor = pokemon(10);
  actor.items = [move("sleep-talk"), move("tackle"), move("quick-attack", "bonus"), move("ember")];
  assert.deepEqual(sleep.sleepTalkMoves(actor).map(item => item.getFlag(MODULE_ID, "sourceId")), ["tackle", "ember"]);
});
