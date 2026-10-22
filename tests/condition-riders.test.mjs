import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
globalThis.foundry.utils.escapeHTML ??= value => String(value);
const { buildConditionEffects, processConditionRidersEndTurn, CONDITION_KIND } = await import("../scripts/condition-riders.mjs");
const { buildMoveStatusEffects } = await import("../scripts/status-effects.mjs");
const { bindingDefinition } = await import("../scripts/binding-rules.mjs");

const M = "poke5e-local";
const { moves } = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));
const move = id => moves.find(entry => entry.id === id);
const chat = [];
globalThis.game = { settings: { get: () => "es" } };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };

test("Glare frightens on a failed save, with a WIS save at the end of each turn; Flash blinds until its next turn ends", () => {
  const [glare] = buildConditionEffects(move("glare"));
  assert.deepEqual(glare.statuses, ["frightened"]);
  assert.equal(glare.flags[M].kind, CONDITION_KIND);
  assert.equal(glare.flags[M].trigger, "failed-save");
  assert.equal(glare.flags[M].repeatSave, "wis");
  const [flash] = buildConditionEffects(move("flash"));
  assert.deepEqual(flash.statuses, ["blinded"]);
  assert.equal(flash.flags[M].expireAtEndOfNextTurn, true);
  assert.equal(buildConditionEffects(move("crush-grip"))[0].flags[M].trigger, "hit");
  assert.deepEqual(buildConditionEffects(move("tackle")), []);
});

test("the condition rides on the Move with its status templates, so existing Moves get it too", () => {
  const { effects } = buildMoveStatusEffects(move("scary-face"));
  assert.deepEqual(effects.map(effect => effect.flags[M].kind), [CONDITION_KIND]);
});

test("Constrict, Vice Grip and Jaw Lock grapple like Bind, with their continuation", () => {
  for (const id of ["constrict", "vice-grip", "jaw-lock"]) {
    assert.equal(bindingDefinition(move(id))?.timing, "continuation", id);
  }
});

test("a successful save at the end of its turn ends the fear; a failed one keeps it", async () => {
  const glareItem = { system: { activities: [{ type: "save", save: { dc: { value: 13 } } }] } };
  globalThis.fromUuidSync = uuid => (uuid === "Item.glare" ? glareItem : null);
  const frightened = () => Object.assign(createFlagDocument({ uuid: "Actor.zubat.ActiveEffect.fear", name: "Asustado",
    flags: { [M]: { kind: CONDITION_KIND, repeatSave: "wis" } } }), { origin: "Item.glare" });
  const actor = total => {
    const effect = frightened();
    const result = { name: "Zubat", deleted: false, rolled: null,
      effects: Object.assign([effect], { get: id => (result.deleted || id !== effect.id ? null : effect) }),
      rollSavingThrow: async config => { result.rolled = config; return [{ total }]; } };
    effect.delete = async () => { result.deleted = true; };
    return result;
  };
  const saved = actor(15);
  await processConditionRidersEndTurn(saved);
  assert.deepEqual(saved.rolled, { ability: "wis", target: 13 });
  assert.equal(saved.deleted, true);
  assert.match(chat.at(-1), /se sobrepone a/);
  const failed = actor(9);
  await processConditionRidersEndTurn(failed);
  assert.equal(failed.deleted, false);
});
