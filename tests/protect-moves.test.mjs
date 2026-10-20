import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" }, combat: { id: "C1" } };
const protect = await import("../scripts/protect-moves.mjs");

const move = (id, spent = 0, max = 10) => createFlagDocument({ name: id,
  flags: { [MODULE_ID]: { kind: "move", sourceId: id } }, system: { uses: { spent, max: String(max) } } });

function pokemon(name, items) {
  const actor = createFlagDocument({ uuid: `Actor.${name}`, flags: { [MODULE_ID]: { kind: "pokemon" } } });
  actor.items = items;
  documents.set(actor.uuid, actor);
  return actor;
}

const melee = { attack: { type: { value: "melee" } }, item: { name: "Tackle" } };
const ranged = { attack: { type: { value: "ranged" } }, item: { name: "Ember" } };
const attackRoll = (target, total, extra = {}) => ({ total, options: { target: 14, poke5eTargetActorUuid: target.uuid }, ...extra });

test("the family is offered on a hit, never on a miss, a natural 20, or without PP", () => {
  const holder = pokemon("shuckle", [move("tackle"), move("protect")]);
  assert.equal(typeof protect.protectOffer(attackRoll(holder, 15), ranged), "function");
  assert.equal(protect.protectOffer(attackRoll(holder, 10), ranged), null, "a miss");
  assert.equal(protect.protectOffer(attackRoll(holder, 25, { isCritical: true }), ranged), null, "a natural 20");
  const spent = pokemon("tired", [move("detect", 5, 5)]);
  assert.equal(protect.protectOffer(attackRoll(spent, 15), ranged), null, "no PP left");
  assert.equal(protect.protectOffer(attackRoll(pokemon("plain", [move("tackle")]), 15), ranged), null);
});

test("Spiky Shield only answers melee attacks", () => {
  const holder = pokemon("chesnaught", [move("spiky-shield")]);
  assert.equal(protect.protectMoveFor(holder, ranged), null);
  assert.equal(protect.protectMoveFor(holder, melee)?.getFlag(MODULE_ID, "sourceId"), "spiky-shield");
});

test("King's Shield blocks every attack until the start of its user's next turn", async () => {
  const holder = pokemon("aegislash", []);
  await holder.setFlag(MODULE_ID, "kingsShieldUp", "C1");
  assert.equal(typeof protect.protectOffer(attackRoll(holder, 15), melee), "function");
  await protect.processProtectStartTurn(holder);
  assert.equal(protect.protectOffer(attackRoll(holder, 15), melee), null);
});
