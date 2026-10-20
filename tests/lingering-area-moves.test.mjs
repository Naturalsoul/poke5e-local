import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" } };
const documents = new Map();
globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
const areas = await import("../scripts/lingering-area-moves.mjs");

function pokemon(name) {
  const actor = createFlagDocument({ uuid: `Actor.${name}`, flags: { [MODULE_ID]: { kind: "pokemon", level: 5 } } });
  actor.system = { abilities: {}, attributes: { prof: 3 } };
  return actor;
}

function area(id, user, inside) {
  const item = createFlagDocument({ uuid: `Item.${id}`, flags: { [MODULE_ID]: { kind: "move", sourceId: id } } });
  item.actor = user;
  documents.set(item.uuid, item);
  const template = createFlagDocument({ flags: { dnd5e: { item: item.uuid } } });
  Object.assign(template, { x: 0, y: 0, deleted: false, object: { shape: { contains: () => inside } }, async delete() { this.deleted = true; } });
  return template;
}

test("lingering areas are the scene's templates of Poison Gas, Smog and Sludge Bomb", () => {
  const user = pokemon("koffing");
  const scene = { templates: [area("smog", user, true), area("flamethrower", user, true)] };
  assert.deepEqual(areas.lingeringAreas(scene).map(entry => entry.rule), [areas.LINGERING_AREAS.smog]);
});

test("Poison Gas dissipates at the start of its user's next turn", async () => {
  const user = pokemon("grimer");
  const gas = area("poison-gas", user, false);
  user.getActiveTokens = () => [{ center: { x: 0, y: 0 }, scene: { templates: [gas] } }];
  await areas.processLingeringAreasStartTurn(user);
  assert.equal(gas.deleted, true);
});
