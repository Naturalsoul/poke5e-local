import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { user: { targets: new Set(), id: "u1" }, settings: { get: () => "es" }, combat: null, actors: [] };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async () => ({}) } };
const passive = await import("../scripts/passive-ability-engine.mjs");
const rider = await import("../scripts/rider-ability-engine.mjs");
const events = await import("../scripts/event-ability-engine.mjs");

function pokemon(abilityId, { statuses = [], effects = [], side = 1, hp = 20, abilities = {}, resists = [] } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, name: abilityId, items: [createAbilityItem(abilityId)],
    effects: [...statuses.map(status => ({ flags: { [MODULE_ID]: { status } } })), ...effects],
    flags: { [MODULE_ID]: { kind: "pokemon" } },
    system: { abilities, attributes: { hp: { value: hp, max: 20 }, prof: 3 }, traits: { dr: { value: new Set(resists) } } } });
  actor.getActiveTokens = () => [{ document: { disposition: side } }];
  actor.isOwner = true;
  return actor;
}

const move = (sourceId, moveType, flags = {}, actor = null) => ({ actor, getFlag: (_module, key) =>
  ({ kind: "move", sourceId, moveType, moveDefinition: { damage: { modifier: "MOVE" }, powerAbilities: ["str", "dex"] }, ...flags })[key] });

test("attack modifiers: Defiant, Supreme Overlord, Slow Start and Mind's Eye", () => {
  assert.equal(passive.attackAbilityModifiers(pokemon("defiant", { statuses: ["burned"] }), null, []).bonus, 2);
  const debuff = { changes: [{ value: "-1" }], getFlag: (_module, key) => ({ kind: "pokemon-modifier", sourceActorUuid: "Actor.foe" })[key] };
  assert.equal(passive.attackAbilityModifiers(pokemon("defiant", { effects: [debuff] }), null, []).bonus, 2);
  assert.equal(passive.attackAbilityModifiers(pokemon("defiant"), null, []).bonus, 0);
  const overlord = pokemon("supreme-overlord");
  game.combat = { started: true, round: 1, combatants: [overlord, pokemon("a", { hp: 0 }), pokemon("b", { hp: 0, side: -1 }), pokemon("c")].map(actor => ({ actor })) };
  assert.equal(passive.attackAbilityModifiers(overlord, null, []).bonus, 1, "only downed allies count");
  assert.equal(passive.attackAbilityModifiers(pokemon("slow-start"), null, []).disadvantage, true);
  game.combat.round = 3;
  assert.equal(passive.attackAbilityModifiers(pokemon("slow-start"), null, []).disadvantage, false);
  game.combat = null;
  const confused = pokemon("tangled-feet", { statuses: ["confused"] });
  assert.equal(passive.attackAbilityModifiers(pokemon("minds-eye"), null, [confused]).disadvantage, false);
});

test("Mega Launcher adds the proficiency bonus to pulse Moves; Poison Heal absorbs poison damage", () => {
  assert.equal(passive.damageAbilityBonus(pokemon("mega-launcher"), move("dark-pulse", "dark"), []), 3);
  assert.equal(passive.damageAbilityBonus(pokemon("mega-launcher"), move("crunch", "dark"), []), 0);
  const poison = [{ type: "poison", value: 9, properties: new Set() }];
  passive.applyDefensiveAbilities(pokemon("poison-heal"), poison);
  assert.deepEqual(poison.map(entry => [entry.type, entry.value]), [["poison", 0], ["healing", 4]]);
});

test("damage riders: type changes, Merciless, Sharpness, Tough Claws, Reckless and the electric charges", () => {
  assert.equal(rider.changedMoveType(pokemon("pixilate"), move("tackle", "normal")), "fairy");
  assert.equal(rider.changedMoveType(pokemon("pixilate"), move("ember", "fire")), "fire");
  assert.equal(rider.changedMoveType(pokemon("normalize"), move("ember", "fire")), "normal");
  assert.equal(rider.changedMoveType(pokemon("liquid-voice"), move("hyper-voice", "normal")), "water");
  const strong = { str: { mod: 4 }, dex: { mod: 2 } };
  assert.equal(rider.damageRiders(pokemon("merciless"), move("tackle", "normal"), [pokemon("x", { statuses: ["poisoned"] })]).doubleDice, true);
  assert.equal(rider.damageRiders(pokemon("sharpness", { abilities: strong }), move("night-slash", "dark"), []).flat, 4);
  assert.equal(rider.damageRiders(pokemon("tough-claws"), move("tackle", "normal"), [], { melee: true }).flat, 3, "STAB it did not have");
  assert.equal(rider.damageRiders(pokemon("tough-claws"), move("tackle", "normal", { stab: { eligible: true, bonus: 3 } }), [], { melee: true }).flat, 3);
  assert.equal(rider.damageRiders(pokemon("reckless"), move("double-edge", "normal", { stab: { eligible: true, bonus: 3 }, instantRecoil: {} }), []).flat, 3);
  const charged = pokemon("electromorphosis", { abilities: strong });
  charged._flags[MODULE_ID].abilityCharge = { electromorphosis: true };
  assert.equal(rider.damageRiders(charged, move("spark", "electric"), []).flat, 4);
  assert.equal(rider.damageRiders(charged, move("tackle", "normal"), []).flat, 0, "kept for the next Electric Move");
  assert.equal(rider.damageRiders(pokemon("sniper"), move("tackle", "normal"), []).critical, 3);
});

test("damage taken: Tinted Lens, Scrappy and Ice Scales", () => {
  const options = attacker => ({ originatingMessage: { getAssociatedItem: () => ({ documentName: "Item", actor: attacker,
    getFlag: (_module, key) => ({ kind: "move", sourceId: "psychic", moveDefinition: { powerAbilities: ["int", "wis"] } })[key] }) } });
  const lens = options(pokemon("tinted-lens"));
  rider.applyRiderDefenses(pokemon("static"), [], lens);
  assert.equal(lens.ignore.resistance, true);
  const scrappy = options(pokemon("scrappy"));
  rider.applyRiderDefenses(pokemon("static"), [], scrappy);
  assert.deepEqual([...scrappy.ignore.immunity], ["normal", "fighting"]);
  const damages = [{ type: "psychic", value: 9 }];
  rider.applyRiderDefenses(pokemon("ice-scales"), damages, options(pokemon("static")));
  assert.equal(damages[0].value, 4);
});

test("Truant blocks the same Move the round right after", () => {
  const slaking = pokemon("truant");
  slaking._flags[MODULE_ID].truantLastMove = { id: "slash", round: 2 };
  assert.equal(rider.truantBlocks(slaking, move("slash", "normal"), 3), true);
  assert.equal(rider.truantBlocks(slaking, move("slash", "normal"), 4), false);
  assert.equal(rider.truantBlocks(slaking, move("tackle", "normal"), 3), false);
});

test("stat protection drops only what an opponent would lower", () => {
  const lowerAll = [{ key: "system.attributes.ac.bonus", value: "-1" }, { key: "system.bonuses.mwak.attack", value: "-1" },
    { key: "system.attributes.movement.bonus", value: "10" }];
  assert.deepEqual(events.protectedChanges(pokemon("clear-body"), lowerAll).map(change => change.value), ["10"]);
  assert.deepEqual(events.protectedChanges(pokemon("big-pecks"), lowerAll).map(change => change.key),
    ["system.bonuses.mwak.attack", "system.attributes.movement.bonus"]);
  assert.deepEqual(events.protectedChanges(pokemon("hyper-cutter"), lowerAll).map(change => change.key),
    ["system.attributes.ac.bonus", "system.attributes.movement.bonus"]);
  assert.equal(events.protectedChanges(pokemon("static"), lowerAll), null);
});

test("stacked Ability effects grow up to their maximum", async () => {
  const actor = pokemon("weak-armor");
  actor.effects = [];
  actor.createEmbeddedDocuments = async (_type, [data]) => {
    const effect = { ...data, getFlag: (_module, key) => effect.flags[MODULE_ID][key], update: async changes => Object.assign(effect, changes) };
    actor.effects.push(effect);
  };
  const changes = [{ key: "system.attributes.ac.bonus", mode: 2, value: "-1" }];
  for (let hit = 0; hit < 7; hit++) {await events.stackAbilityEffect(actor, "weak-armor", { changes, max: 5 });}
  assert.equal(actor.effects.length, 1);
  assert.equal(actor.effects[0].changes[0].value, "-5");
});

test("Wonder Skin only offers a second roll for a failed save against those statuses", () => {
  const smeargle = pokemon("wonder-skin");
  const toxic = { effects: [{ getFlag: (_module, key) => ({ status: "poisoned" })[key] }] };
  const growl = { effects: [] };
  assert.ok(events.wonderSkinOffer({ total: 9 }, { actor: smeargle, dc: 13, move: toxic }));
  assert.equal(events.wonderSkinOffer({ total: 14 }, { actor: smeargle, dc: 13, move: toxic }), null);
  assert.equal(events.wonderSkinOffer({ total: 9 }, { actor: smeargle, dc: 13, move: growl }), null);
});

test("Unaware attacks ignore the AC its target gained in battle", () => {
  const raised = { disabled: false, getFlag: (_module, key) => (key === "kind" ? "pokemon-modifier" : undefined),
    changes: [{ key: "system.attributes.ac.bonus", value: "2" }] };
  const target = pokemon("static", { effects: [raised] });
  assert.equal(passive.attackAbilityModifiers(pokemon("unaware"), null, [target]).bonus, 2);
  assert.equal(passive.attackAbilityModifiers(pokemon("static"), null, [target]).bonus, 0);
});
