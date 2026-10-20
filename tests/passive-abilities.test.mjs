import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
globalThis.game = { user: { targets: new Set() }, settings: { get: () => "es" } };
const passive = await import("../scripts/passive-ability-engine.mjs");
const { hasStatusImmunityAbility } = await import("../scripts/status-runtime.mjs");
passive.registerPassiveAbilityEngine();

function pokemon(abilityId, { types = [], hp = { value: 10, max: 20 }, statuses = [], resists = [] } = {}) {
  const effects = statuses.map(status => ({ flags: { [MODULE_ID]: { status } } }));
  const actor = createFlagDocument({ items: [createAbilityItem(abilityId)], effects,
    flags: { [MODULE_ID]: { kind: "pokemon", types } },
    system: { attributes: { hp, prof: 3 }, traits: { dr: { value: new Set(resists) } } } });
  return actor;
}

const damage = (type, value) => [{ type, value, properties: new Set() }];
const move = sourceId => ({ originatingMessage: { getAssociatedItem: () => ({ documentName: "Item",
  getFlag: (_module, key) => ({ kind: "move", sourceId })[key] }) } });

test("type defenses: immune, absorb half as healing, halve, and resistance that does not stack", () => {
  const levitate = damage("ground", 12);
  passive.applyDefensiveAbilities(pokemon("levitate"), levitate);
  assert.equal(levitate[0].value, 0);
  const volt = damage("electric", 13);
  passive.applyDefensiveAbilities(pokemon("volt-absorb"), volt);
  assert.deepEqual(volt.map(entry => [entry.type, entry.value]), [["electric", 0], ["healing", 6]]);
  const fat = damage("ice", 9);
  passive.applyDefensiveAbilities(pokemon("thick-fat"), fat);
  assert.equal(fat[0].value, 4);
  const bubble = damage("fire", 10);
  passive.applyDefensiveAbilities(pokemon("water-bubble", { resists: ["fire"] }), bubble);
  assert.equal(bubble[0].value, 10, "dnd5e already halves resisted damage");
});

test("Move defenses: Soundproof, Bulletproof and Damp read the Move behind the damage", () => {
  const voice = damage("normal", 8);
  passive.applyDefensiveAbilities(pokemon("soundproof"), voice, move("hyper-voice"));
  assert.equal(voice[0].value, 0);
  const ball = damage("ghost", 8);
  passive.applyDefensiveAbilities(pokemon("bulletproof"), ball, move("shadow-ball"));
  assert.equal(ball[0].value, 0);
  const tackle = damage("normal", 8);
  passive.applyDefensiveAbilities(pokemon("damp"), tackle, move("tackle"));
  assert.equal(tackle[0].value, 8);
});

test("Sap Sipper and Rattled are announced after the damage, and arm advantage on the next attack", async () => {
  const sipper = pokemon("sap-sipper");
  const options = {};
  passive.applyDefensiveAbilities(sipper, damage("grass", 7), options);
  const chat = [];
  globalThis.ChatMessage = { getSpeaker: () => ({}), create: async data => chat.push(data.content) };
  hooks.handler("dnd5e.applyDamage")(sipper, 0, options);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(sipper.getFlag(MODULE_ID, "pendingAttackModifier"), { kind: "next-attack-modifier", sourceAbility: "sap-sipper", advantage: true });
  assert.match(chat[0], /no recibe daño y hará su próximo ataque con ventaja/);
  const rattled = damage("bug", 5);
  passive.applyDefensiveAbilities(pokemon("rattled"), rattled, {});
  assert.equal(rattled[0].value, 5, "Rattled still takes the damage");
});

test("Multiscale halves the damage only at full HP", () => {
  const full = damage("fire", 11);
  passive.applyDefensiveAbilities(pokemon("multiscale", { hp: { value: 20, max: 20 } }), full);
  assert.equal(full[0].value, 5);
  const hurt = damage("fire", 11);
  passive.applyDefensiveAbilities(pokemon("multiscale"), hurt);
  assert.equal(hurt[0].value, 11);
});

test("status immunities from Abilities", () => {
  assert.equal(hasStatusImmunityAbility(pokemon("insomnia"), "asleep"), true);
  assert.equal(hasStatusImmunityAbility(pokemon("heatproof"), "burned"), true);
  assert.equal(hasStatusImmunityAbility(pokemon("own-tempo"), "confused"), true);
  assert.equal(hasStatusImmunityAbility(pokemon("purifying-salt"), "confused"), false, "only non-volatile ones");
});

test("attack and damage modifiers from the attacker's and the targets' Abilities", () => {
  const steel = { getFlag: (_module, key) => ({ kind: "move", moveType: "steel" })[key] };
  assert.deepEqual(passive.attackAbilityModifiers(pokemon("compound-eyes"), null, []), { bonus: 1, advantage: false, disadvantage: false, critical: null });
  assert.equal(passive.attackAbilityModifiers(pokemon("intrepid-sword"), null, [], { melee: true }).advantage, true);
  assert.equal(passive.attackAbilityModifiers(pokemon("static"), null, [pokemon("no-guard")]).advantage, true);
  assert.equal(passive.attackAbilityModifiers(pokemon("static"), null, [pokemon("tangled-feet", { statuses: ["confused"] })]).disadvantage, true);
  assert.equal(passive.attackAbilityModifiers(pokemon("super-luck"), null, []).critical, 19);
  assert.equal(passive.damageAbilityBonus(pokemon("rivalry", { types: ["fire"] }), null, [pokemon("static", { types: ["fire", "flying"] })]), 3);
  assert.equal(passive.damageAbilityBonus(pokemon("rivalry", { types: ["fire"] }), null, [pokemon("static", { types: ["water"] })]), 0);
  assert.equal(passive.damageAbilityBonus(pokemon("steelworker"), steel, []), 3);
  assert.equal(passive.damageAbilityBonus(pokemon("competitive", { statuses: ["burned"] }), null, []), 3);
});

test("a critical hit against a Shell Armor target is rolled as a normal hit", () => {
  let configured = 0;
  const roll = { isCritical: true, options: { isCritical: true }, configureDamage() { configured++; } };
  game.user.targets = new Set([{ actor: pokemon("shell-armor") }]);
  hooks.handler("dnd5e.postRollConfiguration")([roll], { hookNames: ["damage"], subject: { actor: pokemon("static") } });
  assert.equal(roll.options.isCritical, false);
  assert.equal(configured, 1);
  game.user.targets = new Set();
});
