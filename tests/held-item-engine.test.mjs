import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createHooks, installFoundryUtils, MockRoll, renderMockRollMessage } from "./helpers/foundry-mocks.mjs";
import { HELD_ITEM_DAMAGE_TYPES, heldItemCriticalRange, heldItemDamageBonus, PUNCHING_MOVE_IDS } from "../scripts/held-item-rules.mjs";
import {
  applyHeldItemRollBonuses, captureHeldItemAppliedDamage, processHeldItemAppliedDamage,
  processHeldItemEndTurn, synchronizeHeldItemPassives, registerHeldItemEngine,
  applyExpertBeltDamage, heldItemPreventsContactReactions, applyHeldItemDefenses,
  validateHeldItemMove, validateHeldItemHealing, processHeldItemHealing, repairHeldAirBalloon
} from "../scripts/held-item-engine.mjs";
import { heldItemConfiguration } from "../scripts/held-item-config.mjs";

installFoundryUtils();
createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };
globalThis.game = { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, settings: { get: () => "es" } };
globalThis.Roll = class extends MockRoll {
  async evaluate() { return this.evaluateSync(); }
  async toMessage(data) { rolled.push(data); return renderMockRollMessage(data); }
};
const chat = [];
const rolled = [];
globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor }), create: async data => { chat.push(data.content); return data; } };
const said = text => chat.some(content => content.includes(text));
let sequence = 0;

function pokemon(itemSourceId, { species = "pikachu", pb = 3, quantity = 1, types = ["electric"], itemType } = {}) {
  const flags = { kind: "pokemon", sourceId: species, proficiencyBonus: pb, types, heldItemId: "held" };
  const itemFlags = { kind: "catalog-item", sourceId: itemSourceId, itemType };
  const held = {
    documentName: "Item", id: "held", uuid: `Item.${++sequence}`, name: itemSourceId, system: { quantity },
    getFlag(_moduleId, key) { return itemFlags[key]; },
    async setFlag(_moduleId, key, value) { itemFlags[key] = value; },
    async unsetFlag(_moduleId, key) { delete itemFlags[key]; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {foundry.utils.setProperty(this, key, value);}
      if (changes["flags.poke5e-local.heldItemConfiguration"]) {itemFlags.heldItemConfiguration = 1;}
    },
    toObject() { return { name: this.name, system: structuredClone(this.system), flags: { [MODULE_ID]: itemFlags } }; },
    async delete() { this.parent.items.splice(this.parent.items.indexOf(this), 1); }
  };
  const items = [held];
  items.get = id => items.find(item => item.id === id);
  const actor = {
    documentName: "Actor", uuid: `Actor.${sequence}`, items, effects: [],
    system: { attributes: { prof: pb, hp: { value: 12, max: 20, temp: 0 } } },
    damage: [], writes: [],
    getFlag(_moduleId, key) { return flags[key]; },
    async setFlag(_moduleId, key, value) { flags[key] = value; },
    async unsetFlag(_moduleId, key) { delete flags[key]; },
    async applyDamage(value) {
      this.damage.push(value);
      const delta = Array.isArray(value) ? value.reduce((sum, part) => sum + part.value, 0) : value;
      this.system.attributes.hp.value = Math.max(0, Math.min(20, this.system.attributes.hp.value - delta));
    },
    async createEmbeddedDocuments(type, sources) {
      this.writes.push({ type, sources });
      if (type === "Item") {
        return sources.map(source => {
          const created = { ...source, id: "received", documentName: "Item", parent: this,
            getFlag(moduleId, key) { return source.flags?.[moduleId]?.[key]; },
            async delete() { this.parent.items.splice(this.parent.items.indexOf(this), 1); }
          };
          this.items.push(created);
          return created;
        });
      }
      for (const source of sources) {
        this.effects.push({ ...source, id: String(this.effects.length),
          getFlag(moduleId, key) { return source.flags?.[moduleId]?.[key]; }
        });
      }
      return this.effects;
    },
    async deleteEmbeddedDocuments(type, ids) {
      assert.equal(type, "ActiveEffect");
      this.effects = this.effects.filter(effect => !ids.includes(effect.id));
    }
  };
  held.parent = actor;
  return actor;
}

function activity(actor, { scope = "melee", kind = "move", struggle = false, moveId = "tackle" } = {}) {
  return { actor, type: scope ? "attack" : "save", item: { actor,
    getFlag(_moduleId, key) {
      return { kind, sourceId: moveId, moveDefinition: { id: moveId, attack: scope ? { scope } : null }, struggle: { noAmplification: struggle } }[key];
    }
  } };
}

function config(subject, hook = "damage") {
  return { subject, hookNames: new Set([hook]) };
}

function messageFor(subject, rolls = [], id = `Message.${++sequence}`) {
  return { uuid: id, rolls, getAssociatedItem: () => subject.item, getOriginatingMessage: () => ({ uuid: id }) };
}

test("Rocky Helmet retaliates once per target and usage, with no reaction to ranged or prevented contact", async () => {
  const attacker = pokemon("charcoal");
  const target = pokemon("rocky-helmet", { pb: 4 });
  const options = { originatingMessage: messageFor(activity(attacker)) };
  await Promise.all([processHeldItemAppliedDamage(target, 5, options), processHeldItemAppliedDamage(target, 5, options)]);
  assert.deepEqual(attacker.damage, [4]);
  assert.ok(said("recibe 4 de daño"));
  await processHeldItemAppliedDamage(pokemon("rocky-helmet"), 5, options);
  assert.deepEqual(attacker.damage, [4, 3]);
  for (const [item, scope, effective] of [["protective-pads", "melee", 5], ["punching-glove", "melee", 5], ["charcoal", "ranged", 5], ["charcoal", "melee", 0]]) {
    const source = pokemon(item);
    await processHeldItemAppliedDamage(target, 5, {
      originatingMessage: messageFor(activity(source, { scope, moveId: "fire-punch" })),
      [MODULE_ID]: { heldItemDamageApplied: effective }
    });
    assert.deepEqual(source.damage, []);
  }
});

test("Sticky Barb transfers intact only to an itemless contact attacker and deals no transfer damage", async () => {
  const attacker = pokemon("charcoal");
  attacker.items.length = 0;
  const target = pokemon("sticky-barb");
  await processHeldItemEndTurn(target);
  assert.deepEqual(target.damage, [3]);
  await processHeldItemAppliedDamage(target, 2, { originatingMessage: messageFor(activity(attacker)) });
  assert.equal(target.items.length, 0);
  assert.equal(attacker.items[0].getFlag(MODULE_ID, "sourceId"), "sticky-barb");
  assert.deepEqual(attacker.damage, []);
  assert.ok(said("se pega a"));
  await processHeldItemEndTurn(attacker);
  assert.deepEqual(attacker.damage, [3]);
  const occupied = pokemon("charcoal");
  const second = pokemon("sticky-barb");
  await processHeldItemAppliedDamage(second, 2, { originatingMessage: messageFor(activity(occupied)) });
  assert.equal(second.items.length, 1);
});

test("Sticky Barb remains with its holder when transfer cannot create the item", async () => {
  const attacker = pokemon("charcoal");
  attacker.items.length = 0;
  attacker.createEmbeddedDocuments = async () => [];
  const target = pokemon("sticky-barb");
  await processHeldItemAppliedDamage(target, 2, { originatingMessage: messageFor(activity(attacker)) });
  assert.equal(target.items.length, 1);
  assert.equal(attacker.items.length, 0);
});

test("Focus Sash intercepts lethal damage once, includes temporary HP, and never revives", async () => {
  const actor = pokemon("focus-sash");
  const options = {};
  const updates = { "system.attributes.hp.value": 0, "system.attributes.hp.temp": 0 };
  actor.system.attributes.hp.temp = 2;
  captureHeldItemAppliedDamage(actor, 30, updates, options);
  assert.equal(updates["system.attributes.hp.value"], 1);
  assert.equal(options[MODULE_ID].heldItemDamageApplied, 13);
  const concurrent = { "system.attributes.hp.value": 0 };
  captureHeldItemAppliedDamage(actor, 30, concurrent, {});
  assert.equal(concurrent["system.attributes.hp.value"], 0);
  await processHeldItemAppliedDamage(actor, 30, options);
  assert.equal(actor.items[0].system.uses.spent, 1);
  assert.ok(said("aguanta con 1 PG"));
  const second = { "system.attributes.hp.value": 0 };
  captureHeldItemAppliedDamage(actor, 30, second, {});
  assert.equal(second["system.attributes.hp.value"], 0);
  actor.system.attributes.hp.value = 0;
  actor.items[0].system.uses.spent = 0;
  captureHeldItemAppliedDamage(actor, 30, second, {});
  assert.equal(second["system.attributes.hp.value"], 0);
});

test("Air Balloon blocks Ground parts until actual damage pops it; rest repairs it", async () => {
  const actor = pokemon("air-balloon");
  const damages = [{ type: "ground", value: 8 }, { type: "fire", value: 2 }];
  damages.amount = 10;
  applyHeldItemDefenses(actor, damages);
  applyHeldItemDefenses(actor, damages);
  assert.equal(damages.amount, 2);
  await processHeldItemAppliedDamage(actor, 8, { [MODULE_ID]: { heldItemDamageApplied: 0 } });
  assert.equal(actor.items[0].getFlag(MODULE_ID, "popped"), undefined);
  await processHeldItemAppliedDamage(actor, 2, { [MODULE_ID]: { heldItemDamageApplied: 2 } });
  assert.equal(actor.items[0].getFlag(MODULE_ID, "popped"), true);
  assert.ok(said("el globo explota"));
  const popped = [{ type: "ground", value: 8 }]; popped.amount = 8;
  applyHeldItemDefenses(actor, popped);
  assert.equal(popped.amount, 8);
  await repairHeldAirBalloon(actor);
  applyHeldItemDefenses(actor, popped);
  assert.equal(popped.amount, 0);
});

test("Leftovers and Poison Black Sludge get bonus-action healing, ten dawn charges and capped self healing", async () => {
  globalThis.ui = { notifications: { warn() {} } };
  for (const id of ["leftovers", "black-sludge"]) {
    const actor = pokemon(id, { types: ["poison"] });
    actor.items[0].system.uses = { spent: 4 };
    await synchronizeHeldItemPassives(actor);
    assert.equal(actor.items[0].system.uses.spent, 4);
    assert.equal(actor.items[0].system.uses.max, "10");
    const configuration = heldItemConfiguration(id);
    const [data] = Object.values(configuration.activities);
    assert.equal(data._id.length, 16, "native activity ids must contain 16 characters");
    assert.equal(data.activation.type, "bonus");
    assert.equal(configuration.uses.recovery[0].period, "dawn");
    const use = { id: data._id, item: actor.items[0], actor };
    assert.equal(validateHeldItemHealing(use), true);
    await processHeldItemHealing(use);
    assert.equal(actor.system.attributes.hp.value, 15);
    actor.system.attributes.hp.value = 19;
    await processHeldItemHealing(use);
    assert.equal(actor.system.attributes.hp.value, 20);
    assert.equal(validateHeldItemHealing(use), false);
    actor.system.attributes.hp.value = 0;
    assert.equal(validateHeldItemHealing(use), false);
  }
  const actor = pokemon("black-sludge");
  assert.equal(validateHeldItemHealing({ id: "P5heldItemHeal00", item: actor.items[0], actor }), false);
});

test("healing accepts the keepId clone passed by native Activity.use and still rejects other holders", async () => {
  globalThis.ui = { notifications: { warn() {} } };
  for (const id of ["leftovers", "black-sludge"]) {
    const actor = pokemon(id, { types: ["poison"] });
    const held = actor.items[0];
    held.system.uses = { max: 10, spent: 9 };
    // El sistema pasa un Item clonado a los hooks preUseActivity y postUseActivity.
    const clone = { ...held, actor, system: structuredClone(held.system) };
    const nativeActivity = { id: "P5heldItemHeal00", item: clone };
    assert.notEqual(clone, held);
    assert.equal(validateHeldItemHealing(nativeActivity), true);
    held.system.uses.spent = 10; // consume() ocurre antes de postUseActivity.
    await processHeldItemHealing(nativeActivity);
    assert.equal(actor.system.attributes.hp.value, 15);
    assert.equal(held.system.uses.spent, 10);
    assert.equal(validateHeldItemHealing({ ...nativeActivity, item: { ...clone, uuid: "Actor.other.Item.held" } }), false);
    held.system.quantity = 0;
    assert.equal(validateHeldItemHealing(nativeActivity), false);
  }
});

test("existing held berries gain a consumable activity without changing their inventory quantity", async () => {
  const actor = pokemon("oran-berry", { itemType: "berry", quantity: 3 });
  const held = actor.items[0];
  await synchronizeHeldItemPassives(actor);
  assert.equal(held.system.quantity, 3);
  assert.equal(held.system.uses.max, "1");
  assert.equal(held.system.uses.spent, 0);
  assert.equal(held.system.uses.autoDestroy, true);
  const [berryAction] = Object.values(held.system.activities);
  assert.equal(berryAction.flags[MODULE_ID].consumeBerry, true);
  held.system.quantity = 2;
  await synchronizeHeldItemPassives(actor);
  assert.equal(held.system.quantity, 2);
});

test("Assault Vest enforces damaging moves, and species passives disappear when their conditions change", async () => {
  globalThis.ui = { notifications: { warn() {} } };
  const vest = pokemon("assault-vest");
  await synchronizeHeldItemPassives(vest);
  assert.equal(vest.effects[0].changes[0].key, "system.attributes.ac.bonus");
  vest.system.attributes.ac = { calc: "flat", flat: 15 };
  await synchronizeHeldItemPassives(vest);
  assert.equal(vest.effects[0].changes[0].key, "system.attributes.ac.flat");
  assert.equal(validateHeldItemMove(activity(vest)), false);
  const attack = { actor: vest, item: { actor: vest, getFlag(_module, key) {
    return { kind: "move", moveDefinition: { damage: { dice: { 1: "1d6" } } } }[key];
  } } };
  assert.equal(validateHeldItemMove(attack), true);
  const ditto = pokemon("metal-powder", { species: "ditto" });
  await synchronizeHeldItemPassives(ditto);
  assert.equal(ditto.effects[0].changes[0].key, "system.abilities.con.value");
  await ditto.setFlag(MODULE_ID, "sourceId", "pikachu");
  await synchronizeHeldItemPassives(ditto);
  assert.equal(ditto.effects.length, 0);
});

test("all 23 type boosters include every catalog item that adds PB to a damage type", () => {
  const { items } = JSON.parse(readFileSync(new URL("../data/normalized/items.json", import.meta.url), "utf8"));
  const catalogBoosters = items.filter(item => /proficiency bonus to [a-z]+-type damage/.test(item.description?.en));
  assert.equal(Object.keys(HELD_ITEM_DAMAGE_TYPES).length, 23);
  assert.deepEqual(Object.keys(HELD_ITEM_DAMAGE_TYPES).sort(), catalogBoosters.map(item => item.id).sort());
  for (const [id, type] of Object.entries(HELD_ITEM_DAMAGE_TYPES)) {
    const item = items.find(entry => entry.id === id);
    assert.ok(item.description.en.includes(`proficiency bonus to ${type}-type damage`), id);
    assert.equal(heldItemDamageBonus(id, { type, proficiency: 4 }), 4);
    assert.equal(heldItemDamageBonus(id, { type: "unmatched", proficiency: 4 }), 0);
  }
});

test("incenses and Metal Coat add the current PB once to the correct damage type", () => {
  for (const id of ["odd-incense", "rock-incense", "rose-incense", "sea-incense", "wave-incense", "metal-coat"]) {
    for (const pb of [2, 3, 4, 6]) {
      const actor = pokemon(id, { pb });
      const subject = activity(actor);
      const type = HELD_ITEM_DAMAGE_TYPES[id];
      const rolls = [new MockRoll("1d6", {}, { type }), new MockRoll("1d4", {}, { type })];
      applyHeldItemRollBonuses(rolls, config(subject));
      assert.equal(rolls[0].formula, `(1d6) + ${pb}`, id);
      assert.equal(rolls[1].formula, "1d4", id);
      actor.items.length = 0;
      const unequipped = [new MockRoll("1d6", {}, { type })];
      applyHeldItemRollBonuses(unequipped, config(subject));
      assert.equal(unequipped[0].formula, "1d6", id);
    }
  }
});

test("Punching Glove boosts punching moves but not Sucker Punch or other attacks", () => {
  const actor = pokemon("punching-glove");
  for (const moveId of [...PUNCHING_MOVE_IDS, "sucker-punch", "flamethrower", "tackle"]) {
    const subject = activity(actor, { moveId });
    const rolls = [new MockRoll("1d6", {}, { type: "fighting" })];
    applyHeldItemRollBonuses(rolls, config(subject));
    assert.equal(rolls[0].formula, PUNCHING_MOVE_IDS.includes(moveId) ? "(1d6) + 3" : "1d6", moveId);
    assert.equal(heldItemPreventsContactReactions(actor, moveId), PUNCHING_MOVE_IDS.includes(moveId));
  }
  assert.equal(heldItemPreventsContactReactions(pokemon("protective-pads"), "tackle"), true);
  assert.equal(heldItemPreventsContactReactions(pokemon("charcoal"), "fire-punch"), false);
});

function expertBeltOptions() {
  const actor = pokemon("expert-belt");
  const subject = activity(actor);
  const rolls = [new MockRoll("1d6", {}, { type: "fire" })];
  applyHeldItemRollBonuses(rolls, config(subject));
  assert.equal(rolls[0].formula, "1d6");
  return { actor, options: { originatingMessage: messageFor(subject, rolls) } };
}

test("Expert Belt checks each target and adds PB after vulnerability once across all damage parts", () => {
  const { actor, options } = expertBeltOptions();
  const vulnerable = () => ({ type: "fire", value: 12, active: { type: { vulnerability: true }, multiplier: 2 } });
  const damages = Object.assign([{ type: "normal", value: 5 }, vulnerable(), vulnerable()], { amount: 29 });
  applyExpertBeltDamage(null, damages, options);
  assert.equal(damages.amount, 32); // +3, nunca +6 por vulnerabilidad.
  assert.deepEqual(damages.map(part => part.value), [5, 15, 12]);
  applyExpertBeltDamage(null, damages, options);
  assert.equal(damages.amount, 32);
  const neutral = Object.assign([{ type: "fire", value: 6 }], { amount: 6 });
  applyExpertBeltDamage(null, neutral, options);
  assert.equal(neutral.amount, 6);
  assert.equal(actor.getFlag(MODULE_ID, "heldItemTriggers"), undefined); // Previsualizar no consume el bono.
  assert.deepEqual(actor.damage, []);
});

test("Expert Belt respects immunity, resistance, save multipliers, healing and Struggle", () => {
  const { options } = expertBeltOptions();
  const half = Object.assign([{ type: "fire", value: 6, active: { type: { vulnerability: true } } }], { amount: 6 });
  applyExpertBeltDamage(null, half, { ...options, multiplier: 0.5 });
  assert.equal(half.amount, 7);
  for (const part of [
    { type: "fire", value: 0, active: { type: { immunity: true, vulnerability: true } } },
    { type: "fire", value: 6, active: { type: { vulnerability: true, resistance: true } } },
    { type: "healing", value: 6, active: { type: { vulnerability: true } } }
  ]) {
    const summary = Object.assign([part], { amount: part.value });
    applyExpertBeltDamage(null, summary, options);
    assert.equal(summary.amount, part.value);
  }
  const struggle = activity(pokemon("expert-belt"), { struggle: true });
  const rolls = [new MockRoll("2", {}, { type: "fire" })];
  applyHeldItemRollBonuses(rolls, config(struggle));
  assert.equal(rolls[0].options[MODULE_ID]?.heldItemBonus, undefined);
});

test("type booster adds PB once to the matching damage part and preserves roll options", () => {
  const subject = activity(pokemon("charcoal"));
  const rolls = [new MockRoll("1d6", {}, { type: "normal" }), new MockRoll("2d6 + 2", { value: 7 }, { type: "fire", critical: true })];
  applyHeldItemRollBonuses(rolls, config(subject));
  assert.equal(rolls[0].formula, "1d6");
  assert.equal(rolls[1].formula, "(2d6 + 2) + 3");
  assert.equal(rolls[1].options.critical, true);
  assert.deepEqual(rolls[1].data, { value: 7 });
  applyHeldItemRollBonuses(rolls, config(subject));
  assert.equal(rolls[1].formula, "(2d6 + 2) + 3");
});

test("Muscle Band and Wise Glasses distinguish melee/ranged attacks from save moves", () => {
  for (const [id, scope] of [["muscle-band", "melee"], ["wise-glasses", "ranged"]]) {
    for (const candidate of ["melee", "ranged", null]) {
      const rolls = [new MockRoll("1d6", {}, { type: "fire" })];
      applyHeldItemRollBonuses(rolls, config(activity(pokemon(id), { scope: candidate })));
      assert.equal(rolls[0].formula, scope === candidate ? "(1d6) + 3" : "1d6");
    }
  }
});

test("a type booster is not repeated on a second damage roll from the same usage card", () => {
  const actor = pokemon("charcoal");
  const subject = activity(actor);
  const first = [new MockRoll("1d6", {}, { type: "fire" })];
  const message = { data: { flags: { dnd5e: { originatingMessage: "use-fire" } } } };
  applyHeldItemRollBonuses(first, config(subject), null, message);
  game.messages = [{ rolls: first }];
  try {
    const second = [new MockRoll("1d6", {}, { type: "fire" })];
    applyHeldItemRollBonuses(second, config(subject), null, message);
    assert.equal(second[0].formula, "1d6");
    applyHeldItemRollBonuses(second, config(subject), null,
      { data: { "flags.dnd5e.originatingMessage": "another-use" } });
    assert.equal(second[0].formula, "(1d6) + 3");
  } finally {
    game.messages = [];
  }
});

test("healing, Struggle, trainers, empty items, unrelated items and unknown objects do not gain damage", () => {
  const subjects = [
    activity(pokemon("life-orb"), { struggle: true }),
    activity(pokemon("life-orb", { quantity: 0 })),
    activity(pokemon("life-orb"), { kind: "catalog-item" }),
    activity(pokemon("ability-shield"))
  ];
  const trainer = pokemon("life-orb");
  trainer.getFlag = () => "trainer";
  subjects.push(activity(trainer));
  for (const subject of subjects) {
    const rolls = [new MockRoll("1d6", {}, { type: "fire" })];
    applyHeldItemRollBonuses(rolls, config(subject));
    assert.equal(rolls[0].formula, "1d6");
  }
  const healing = [new MockRoll("1d6", {}, { type: "healing" })];
  applyHeldItemRollBonuses(healing, config(activity(pokemon("life-orb"))));
  assert.equal(healing[0].formula, "1d6");
});

test("Wide Lens adds accuracy once and Scope Lens extends existing critical ranges", () => {
  const lens = activity(pokemon("wide-lens"));
  const attack = [new MockRoll("1d20 + 2", {}, { criticalSuccess: 20 })];
  applyHeldItemRollBonuses(attack, config(lens, "attack"));
  applyHeldItemRollBonuses(attack, config(lens, "attack"));
  assert.equal(attack[0].formula, "(1d20 + 2) + 1");
  const slash = [new MockRoll("1d20", {}, { criticalSuccess: 19 })];
  const scope = config(activity(pokemon("scope-lens")), "attack");
  applyHeldItemRollBonuses(slash, scope);
  applyHeldItemRollBonuses(slash, scope);
  assert.equal(slash[0].options.criticalSuccess, 18);
  assert.equal(heldItemCriticalRange("lucky-punch", "chansey"), 1);
  assert.equal(heldItemCriticalRange("lucky-punch", "pikachu"), 0);
  assert.equal(heldItemCriticalRange("leek", "galarian-farfetchd"), 2);
  assert.equal(heldItemCriticalRange("leek", "sirfetchd"), 2);
});

test("Life Orb adds PB and charges recoil once for an activation with several targets", async () => {
  const actor = pokemon("life-orb");
  const subject = activity(actor);
  const rolls = [new MockRoll("1d6", {}, { type: "fire" })];
  applyHeldItemRollBonuses(rolls, config(subject));
  const options = { originatingMessage: messageFor(subject, rolls) };
  await Promise.all([processHeldItemAppliedDamage(null, 5, options), processHeldItemAppliedDamage(null, 7, options)]);
  assert.deepEqual(actor.damage, [3]);
  assert.equal(actor.system.attributes.hp.value, 9);
  await processHeldItemAppliedDamage(null, 7, options);
  assert.deepEqual(actor.damage, [3]);
  await processHeldItemAppliedDamage(null, 7, { originatingMessage: messageFor(subject, rolls) });
  assert.deepEqual(actor.damage, [3, 3]);
});

test("Life Orb does not charge for immunity, Struggle or damage without the item bonus", async () => {
  const actor = pokemon("life-orb");
  const subject = activity(actor);
  const options = { originatingMessage: messageFor(subject) };
  await processHeldItemAppliedDamage(null, 0, options);
  await processHeldItemAppliedDamage(null, 5, options);
  const struggle = activity(actor, { struggle: true });
  await processHeldItemAppliedDamage(null, 5, { originatingMessage: messageFor(struggle, [
    new MockRoll("2 + 3", {}, { [MODULE_ID]: { heldItemBonus: {
      sourceId: "life-orb", itemId: "held", bonus: 3
    } } })
  ]) });
  assert.deepEqual(actor.damage, []);
});

test("separate damage rolls from one activation charge Life Orb separately but heal Shell Bell once", async () => {
  for (const id of ["life-orb", "shell-bell"]) {
    const actor = pokemon(id);
    const subject = activity(actor);
    const rolls = [new MockRoll("1d6", {}, { type: "fire" })];
    applyHeldItemRollBonuses(rolls, config(subject));
    const first = messageFor(subject, rolls);
    const second = messageFor(subject, rolls);
    first.getOriginatingMessage = second.getOriginatingMessage = () => ({ uuid: "Use.multi-hit" });
    await processHeldItemAppliedDamage(null, 4, { originatingMessage: first });
    await processHeldItemAppliedDamage(null, 4, { originatingMessage: second });
    assert.deepEqual(actor.damage, id === "life-orb" ? [3, 3] : [-3]);
  }
});

test("Shell Bell heals once per activation, caps at max HP and ignores zero effective damage", async () => {
  const actor = pokemon("shell-bell");
  actor.system.attributes.hp.value = 19;
  const subject = activity(actor);
  const options = { originatingMessage: messageFor(subject) };
  captureHeldItemAppliedDamage(actor, 7, { "system.attributes.hp.value": 19 }, options);
  await processHeldItemAppliedDamage(actor, 7, options);
  assert.deepEqual(actor.damage, []);
  captureHeldItemAppliedDamage(actor, 7, { "system.attributes.hp.value": 12 }, options);
  await processHeldItemAppliedDamage(actor, 7, options);
  await processHeldItemAppliedDamage(actor, 7, options);
  assert.deepEqual(actor.damage, [-1]);
  assert.equal(actor.system.attributes.hp.value, 20);
});

test("temporary HP loss also counts as effective damage", () => {
  const actor = pokemon("shell-bell");
  actor.system.attributes.hp.temp = 5;
  const options = { originatingMessage: {} };
  captureHeldItemAppliedDamage(actor, 3, { "system.attributes.hp.value": 12, "system.attributes.hp.temp": 2 }, options);
  assert.equal(options[MODULE_ID].heldItemDamageApplied, 3);
});

test("Quick Claw passive is idempotent, stacks through native bonuses and disappears on removal", async () => {
  const actor = pokemon("quick-claw");
  await Promise.all([synchronizeHeldItemPassives(actor), synchronizeHeldItemPassives(actor)]);
  assert.equal(actor.effects.length, 1);
  assert.deepEqual(actor.effects[0].changes, [{ key: "system.attributes.init.bonus", mode: 2, value: "3" }]);
  actor.effects[0].changes[0].priority = null; // Campos añadidos por el DataModel de Foundry.
  await synchronizeHeldItemPassives(actor);
  assert.equal(actor.writes.length, 1);
  actor.items.length = 0;
  await synchronizeHeldItemPassives(actor);
  assert.equal(actor.effects.length, 0);
});

test("only the active GM synchronizes passives", async () => {
  const actor = pokemon("quick-claw");
  game.users.activeGM = { id: "other-gm" };
  try {
    await synchronizeHeldItemPassives(actor);
    assert.equal(actor.effects.length, 0);
  } finally {
    game.users.activeGM = { id: "gm" };
  }
});

test("Flame Orb uses native status creation and Black Sludge damages only non-Poison holders", async () => {
  for (const [id, status] of [["flame-orb", "burned"]]) {
    const actor = pokemon(id);
    await processHeldItemEndTurn(actor);
    assert.equal(actor.writes[0].type, "ActiveEffect");
    assert.equal(actor.writes[0].sources[0].flags[MODULE_ID].status, status);
    assert.equal(actor.writes[0].sources[0].origin, actor.items[0].uuid);
  }
  const sludge = pokemon("black-sludge");
  await processHeldItemEndTurn(sludge);
  assert.deepEqual(sludge.damage, [[{ type: "poison", value: 1 }]]);
  assert.match(rolled.at(-1).flavor, /^black-sludge — /);
  const poison = pokemon("black-sludge", { types: ["poison"] });
  await processHeldItemEndTurn(poison);
  assert.deepEqual(poison.damage, []);
  const fainted = pokemon("flame-orb");
  fainted.system.attributes.hp.value = 0;
  await processHeldItemEndTurn(fainted);
  assert.equal(fainted.writes.length, 0);
});

test("registers native roll and damage hooks only once", () => {
  const hooks = new Map();
  globalThis.Hooks = { on(name, callback) { hooks.set(name, [...(hooks.get(name) ?? []), callback]); },
    once(name, callback) { this.on(name, callback); }
  };
  registerHeldItemEngine();
  registerHeldItemEngine();
  for (const name of ["dnd5e.postRollConfiguration", "dnd5e.preApplyDamage", "dnd5e.applyDamage", "updateActor", "ready"]) {
    assert.equal(hooks.get(name).length, 1);
  }
});
