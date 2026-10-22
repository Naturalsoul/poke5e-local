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

const { assertCanLeaveField, processConditionRidersStartTurn } = await import("../scripts/condition-riders.mjs");
const marked = (condition, hp = 20, types = []) => {
  const [template] = buildConditionEffects(move(condition === "trapped" ? "mean-look" : "salt-cure"));
  const effect = Object.assign(createFlagDocument({ uuid: "Actor.p.ActiveEffect.e", name: template.name, flags: template.flags }), { disabled: false });
  const applied = [];
  return { name: "Gastly", effects: [effect], applied, system: { attributes: { hp: { value: hp } } },
    getFlag: (_m, key) => (key === "types" ? types : undefined), applyDamage: async parts => applied.push(...parts) };
};

test("Mean Look keeps the Pokémon from being switched out or recalled, unless it fainted", () => {
  assert.equal(buildConditionEffects(move("mean-look"))[0].duration.rounds, 3);
  assert.deepEqual(buildConditionEffects(move("mean-look"))[0].statuses, []);
  assert.throws(() => assertCanLeaveField(marked("trapped")), /Mean Look/);
  assert.doesNotThrow(() => assertCanLeaveField(marked("trapped", 0)));
  assert.doesNotThrow(() => assertCanLeaveField({ name: "Abra", effects: [], system: { attributes: { hp: { value: 9 } } } }));
});

test("Salt Cure deals 1d4 rock at the start of each turn, double to Water and Steel", async () => {
  globalThis.Roll = class { constructor(formula) { this.formula = formula; } async evaluate() { this.total = 3; return this; } async toMessage() { return { id: "m" }; } };
  const plain = marked("salted");
  await processConditionRidersStartTurn(plain);
  assert.deepEqual(plain.applied, [{ value: 3, type: "rock" }]);
  const water = marked("salted", 20, ["water"]);
  await processConditionRidersStartTurn(water);
  assert.deepEqual(water.applied, [{ value: 6, type: "rock" }]);
});

test("Thousand Arrows knocks prone whoever fails the save", () => {
  const [effect] = buildConditionEffects(move("thousand-arrows"));
  assert.deepEqual(effect.statuses, ["prone"]);
  assert.equal(effect.flags["poke5e-local"].trigger, "failed-save");
});
