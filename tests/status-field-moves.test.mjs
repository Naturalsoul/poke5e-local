import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
const positions = new Map();
globalThis.canvas = { grid: { measurePath: ([from, to]) => ({ distance: Math.abs(from.x - to.x) }) } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" },
  combat: { round: 1, combatants: [], getFlag: () => undefined } };
const fields = await import("../scripts/status-field-moves.mjs");
fields.registerStatusFieldMoves();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function pokemon(name, x, disposition = 1) {
  const actor = createFlagDocument({ uuid: `Actor.${name}`, flags: { [MODULE_ID]: { kind: "pokemon" } } });
  actor.system = { attributes: { movement: {} } };
  actor.items = [];
  actor.effects = [];
  positions.set(actor, x);
  actor.getActiveTokens = () => [{ center: { x: positions.get(actor), y: 0 }, document: { disposition } }];
  actor.createEmbeddedDocuments = async (_type, sources) => {
    actor.effects.push(...sources.map(source => Object.assign(createFlagDocument(source), { async delete() {} })));
  };
  game.combat.combatants.push({ actor });
  return actor;
}

const move = id => {
  const item = createFlagDocument({ uuid: `Item.${id}`, flags: { [MODULE_ID]: { kind: "move", sourceId: id } } });
  documents.set(item.uuid, item);
  return item;
};

test("Uproar keeps creatures within 30 ft of its concentrating user from falling asleep", () => {
  const user = pokemon("loudred", 0);
  const near = pokemon("near", 20);
  const far = pokemon("far", 40);
  const uproar = move("uproar");
  user.effects.push({ statuses: new Set(["concentrating"]), origin: uproar.uuid, getFlag: () => ({ uuid: uproar.uuid }) });
  assert.equal(fields.fieldMoveBlocksStatus(near, "asleep"), "uproar");
  assert.equal(fields.fieldMoveBlocksStatus(far, "asleep"), null);
  assert.equal(fields.fieldMoveBlocksStatus(near, "burned"), null);
  assert.equal(fields.fieldMoveBlocksStatus(user, "asleep"), null, "not its user");
  user.effects = [];
  assert.equal(fields.fieldMoveBlocksStatus(near, "asleep"), null, "its concentration ended");
});

test("Safeguard protects its user and allies within 50 ft for 3 rounds", async () => {
  game.combat.combatants = [];
  const user = pokemon("blissey", 0);
  const ally = pokemon("ally", 40);
  const distant = pokemon("distant", 80);
  const foe = pokemon("foe", 10, -1);
  hooks.handler("dnd5e.postUseActivity")({ actor: user, item: move("safeguard") });
  await tick();
  assert.deepEqual([user, ally, distant, foe].map(actor => fields.fieldMoveBlocksStatus(actor, "poisoned")),
    ["safeguard", "safeguard", null, null]);
  game.combat.round = 4;
  assert.equal(fields.fieldMoveBlocksStatus(ally, "poisoned"), null, "from round 4, three rounds later");
  game.combat.round = 1;
});
