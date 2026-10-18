import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { registerAttackOutcomeEngine } from "../scripts/attack-outcome-engine.mjs";
import { registerPokemonReactiveHitAbilityEngine } from "../scripts/reactive-hit-ability-engine.mjs";

installFoundryUtils();
const hooks = createHooks();
const actors = new Map();
let triggerRolls = 0;
globalThis.game = { user: { isGM: true }, settings: { get: () => "es" } };
globalThis.fromUuidSync = uuid => actors.get(uuid);
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => null };
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; }
  static create(formula) { return new this(formula); }
  async evaluate() { triggerRolls++; this.total = 4; return this; }
};

registerAttackOutcomeEngine();
registerPokemonReactiveHitAbilityEngine();

test("Punching Glove and Protective Pads prevent actual Static reactions only for protected contact", async () => {
  for (const [heldId, moveId, protectedHit] of [
    ["punching-glove", "fire-punch", true],
    ["punching-glove", "sucker-punch", false],
    ["protective-pads", "tackle", true],
    ["charcoal", "fire-punch", false]
  ]) {
    const held = { documentName: "Item", id: "held", system: { quantity: 1 },
      getFlag(_moduleId, key) { return { kind: "catalog-item", sourceId: heldId }[key]; }
    };
    const items = [held];
    items.get = id => items.find(item => item.id === id);
    const attacker = createFlagDocument({ uuid: "Actor.attacker", items, flags: {
      "poke5e-local": { kind: "pokemon", sourceId: "hitmonchan", heldItemId: "held" }
    } });
    const defender = createFlagDocument({ uuid: "Actor.defender", items: [createAbilityItem("static")], flags: {
      "poke5e-local": { proficiencyBonus: 3 }
    } });
    const damageCalls = [];
    attacker.applyDamage = async value => { damageCalls.push(value); };
    actors.set(attacker.uuid, attacker);
    actors.set(defender.uuid, defender);
    const subject = {
      actor: attacker, attack: { type: { value: "melee" } },
      item: { uuid: "Actor.attacker.Item.move",
        getFlag(_moduleId, key) { return { kind: "move", sourceId: moveId }[key]; }
      }
    };
    const before = triggerRolls;
    hooks.handler("dnd5e.rollAttack")([{
      total: 18, d20: { results: [{ result: 12, active: true }] },
      options: { target: 12, poke5eTargetActorUuid: defender.uuid }
    }], { subject });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(triggerRolls - before, protectedHit ? 0 : 1, `${heldId}/${moveId}`);
    assert.deepEqual(damageCalls, protectedHit ? [] : [[{ type: "electric", value: 3 }]]);
  }
});
