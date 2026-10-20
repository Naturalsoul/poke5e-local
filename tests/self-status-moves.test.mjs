import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" }, combat: null };
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
const moves = await import("../scripts/self-status-moves.mjs");
moves.registerSelfStatusMoves();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function pokemon(statuses = []) {
  const actor = createFlagDocument({ uuid: `Actor.${Math.random()}`, flags: { [MODULE_ID]: { kind: "pokemon" } } });
  actor.isOwner = true;
  actor.effects = statuses.map(status => ({ deleted: false, flags: { [MODULE_ID]: { status } }, async delete() { this.deleted = true; } }));
  return actor;
}

const move = id => {
  const item = { uuid: `Item.${id}`, getFlag: (_module, key) => ({ kind: "move", sourceId: id })[key] };
  documents.set(item.uuid, item);
  return item;
};

const use = async (actor, id) => {
  hooks.handler("dnd5e.postUseActivity")({ actor, item: move(id) });
  await tick();
};

test("Refresh cures its own poison, paralysis or burn; Flame Wheel thaws it out", async () => {
  const actor = pokemon(["burned"]);
  await use(actor, "refresh");
  assert.equal(actor.effects[0].deleted, true);
  const frozen = pokemon(["frozen"]);
  await use(frozen, "flame-wheel");
  assert.equal(frozen.effects[0].deleted, true);
  const asleep = pokemon(["asleep"]);
  await use(asleep, "refresh");
  assert.equal(asleep.effects[0].deleted, false, "Refresh does not wake it up");
});

test("Rest and Thrash leave a status for the end of the turn; Petal Dance only on its second round in a row", async () => {
  const resting = pokemon();
  await use(resting, "rest");
  assert.equal(resting.getFlag(MODULE_ID, "selfStatusAtEndOfTurn"), "asleep");
  game.combat = { started: true, round: 3 };
  const dancer = pokemon();
  await use(dancer, "petal-dance");
  assert.equal(dancer.getFlag(MODULE_ID, "selfStatusAtEndOfTurn"), undefined, "first round");
  game.combat.round = 4;
  await use(dancer, "petal-dance");
  assert.equal(dancer.getFlag(MODULE_ID, "selfStatusAtEndOfTurn"), "confused");
  assert.equal(moves.endOfTurnStatus(dancer, "petal-dance", 6), null, "a round skipped");
  assert.equal(moves.endOfTurnStatus(dancer, "thrash", 0), "confused");
  game.combat = null;
});

test("Raging Fury's concentration ending in combat confuses its user", () => {
  const actor = pokemon();
  const concentration = item => ({ parent: actor, statuses: new Set(["concentrating"]), origin: item.uuid,
    getFlag: (scope, key) => (scope === "dnd5e" && key === "item" ? { uuid: item.uuid } : undefined) });
  assert.equal(moves.ragingFuryEnded(concentration(move("raging-fury"))), null, "outside combat");
  game.combat = { started: true, round: 1 };
  assert.equal(moves.ragingFuryEnded(concentration(move("raging-fury"))), actor);
  assert.equal(moves.ragingFuryEnded(concentration(move("agility"))), null);
  game.combat = null;
});
