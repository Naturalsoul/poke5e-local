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

test("Sheer Force doubles MOVE on Moves with an added effect and drops that effect on others", () => {
  const strong = { str: { mod: 4 }, dex: { mod: 2 } };
  const status = { getFlag: (_module, key) => ({ kind: "pokemon-status", trigger: "natural-attack-16+" })[key] };
  const selfBuff = { getFlag: (_module, key) => ({ kind: "pokemon-modifier", trigger: "self" })[key] };
  const nidoking = pokemon("sheer-force", { abilities: strong });
  const poisonJab = { ...move("poison-jab", "poison", {}, nidoking), effects: [status] };
  assert.equal(rider.damageRiders(nidoking, poisonJab, []).flat, 4);
  assert.equal(rider.damageRiders(nidoking, { ...move("close-combat", "fighting"), effects: [selfBuff] }, []).flat, 0, "self effects are not added effects");
  nidoking.items.push(poisonJab);
  globalThis.fromUuidSync = uuid => (uuid === nidoking.uuid ? nidoking : null);
  const target = pokemon("static");
  const poisoned = { parent: target, getFlag: (_module, key) => ({ kind: "pokemon-status", sourceActorUuid: nidoking.uuid, sourceMove: "poison-jab" })[key] };
  assert.equal(events.sheerForceBlocks(target, poisoned), nidoking);
  assert.equal(events.sheerForceBlocks(nidoking, { ...poisoned, parent: nidoking }), null, "its own effects stay");
  assert.equal(events.sheerForceBlocks(target, { ...poisoned, getFlag: (_module, key) => ({ kind: "pokemon-status", sourceActorUuid: "Actor.x" })[key] }), null);
});

test("Gorilla Tactics: MOVE twice on its Move (the first one, if none yet), none on the others", async () => {
  const darmanitan = pokemon("gorilla-tactics", { abilities: { str: { mod: 4 } } });
  assert.equal(rider.damageRiders(darmanitan, move("tackle", "normal"), []).flat, 4);
  await darmanitan.setFlag(MODULE_ID, rider.GORILLA_FLAG, "tackle");
  assert.equal(rider.damageRiders(darmanitan, move("tackle", "normal"), []).flat, 4);
  assert.equal(rider.damageRiders(darmanitan, move("flare-blitz", "fire"), []).flat, -4, "cancels the MOVE in its damage");
});

test("Receiver and Power of Alchemy copy the fainted ally's non-hidden Ability", async () => {
  const { hasPokemonAbility } = await import("../scripts/status-runtime.mjs");
  assert.equal(events.copiableAbility(pokemon("intimidate")), "intimidate");
  assert.equal(events.copiableAbility(pokemon("receiver")), null);
  const hidden = pokemon("drought");
  hidden.items = [{ getFlag: (_module, key) => ({ kind: "ability", sourceId: "drought", hiddenAbility: true })[key] }];
  assert.equal(events.copiableAbility(hidden), null);
  const passimian = pokemon("receiver");
  await passimian.setFlag(MODULE_ID, "copiedAbilityId", "intimidate");
  assert.equal(hasPokemonAbility(passimian, "intimidate"), true);
  assert.equal(hasPokemonAbility(passimian, "receiver"), true);
});

test("combo Moves are the d4-chain ones Skill Link guarantees", () => {
  assert.ok(rider.COMBO_MOVES.has("fury-swipes") && rider.COMBO_MOVES.has("water-shuriken"));
  assert.equal(rider.COMBO_MOVES.has("tackle"), false);
});

test("volatile statuses are cleared on switching out; the combat end only clears the ones it names", async () => {
  const effect = (id, status, volatile) => ({ id, getFlag: (_module, key) => ({ kind: "pokemon-status", status, volatile })[key] });
  const actor = pokemon("static", { effects: [effect("c", "confused", true), effect("f", "flinched", true), effect("b", "burned", false)] });
  const deleted = [];
  actor.deleteEmbeddedDocuments = async (_type, ids) => deleted.push(ids);
  await events.clearVolatileStatuses(actor, ["flinched"]);
  await events.clearVolatileStatuses(actor);
  assert.deepEqual(deleted, [["f"], ["c", "f"]]);
});

test("Moves stronger against a status: doubled dice or MOVE again, only when the status is there", () => {
  const attacker = pokemon("static", { abilities: { str: { mod: 4 } } });
  const plain = pokemon("x");
  const paralyzed = pokemon("x", { statuses: ["paralysis"] });
  assert.equal(rider.damageRiders(attacker, move("smelling-salts", "normal"), [paralyzed]).doubleDice, true);
  assert.equal(rider.damageRiders(attacker, move("smelling-salts", "normal"), [plain]).doubleDice, false);
  assert.equal(rider.damageRiders(attacker, move("venoshock", "poison"), [pokemon("x", { statuses: ["poisoned"] })]).doubleDice, true);
  assert.equal(rider.damageRiders(attacker, move("wake-up-slap", "fighting"), [pokemon("x", { statuses: ["asleep"] })]).flat, 4);
  assert.equal(rider.damageRiders(attacker, move("infernal-parade", "ghost"), [pokemon("x", { statuses: ["confused"] })]).flat, 4, "any status");
  assert.equal(rider.damageRiders(attacker, move("barb-barrage", "poison"), [pokemon("x", { statuses: ["poisoned"] }), plain]).flat, 0,
    "every target of the area roll");
  assert.equal(rider.damageRiders(pokemon("x", { statuses: ["burned"] }), move("facade", "normal"), [plain]).doubleDice, true, "Facade: its own status");
  assert.equal(rider.damageRiders(attacker, move("facade", "normal"), [paralyzed]).doubleDice, false);
});
