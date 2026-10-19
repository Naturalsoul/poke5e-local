import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const chat = [];
globalThis.game = { actors: [], user: { id: "player", targets: new Set() }, users: [], settings: { get: () => "es" } };
globalThis.document = { addEventListener() {} };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
globalThis.ui = { notifications: { warn: message => chat.push(message) } };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
const service = await import("../scripts/active-ability-service.mjs");
service.registerActiveAbilityService();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function pokemon(abilityId, { disposition = 1 } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${game.actors.length}`, items: [createAbilityItem(abilityId)],
    flags: { [MODULE_ID]: { kind: "pokemon" } } });
  actor.name = `Pokémon ${game.actors.length}`;
  actor.isOwner = true;
  actor.getActiveTokens = () => [{ document: { disposition } }];
  game.actors.push(actor);
  return actor;
}
const token = (actor, disposition = 1) => ({ actor, document: { disposition } });

test("Intimidate is switched on beforehand: the next attack against it has disadvantage, then it is used until a short rest", async () => {
  const arbok = pokemon("intimidate");
  assert.equal(await service.useActiveAbility(arbok), true);
  assert.match(chat.at(-1), /usa <strong>intimidate<\/strong>: el próximo ataque contra Pokémon 0 tendrá desventaja/);
  game.user.targets = new Set([token(arbok)]);
  const attack = { rolls: [{}] };
  hooks.handler("dnd5e.preRollAttack", 0)(attack);
  assert.equal(attack.rolls[0].options.disadvantage, true);
  hooks.handler("dnd5e.rollAttack")([{ options: attack.rolls[0].options }]);
  await tick();
  assert.equal(arbok.getFlag(MODULE_ID, "abilityGuard"), undefined, "used up");
  game.user.targets = new Set();
  assert.equal(await service.useActiveAbility(arbok), false);
  assert.match(chat.at(-1), /ya usada hasta un descanso corto/);
  await service.restoreAbilityUses(arbok, false);
  assert.equal(service.abilityUsesLeft(arbok, "intimidate"), 1);
});

test("Fur Coat halves the next attack's damage; Friend Guard needs a targeted ally", async () => {
  const furfrou = pokemon("fur-coat");
  await service.useActiveAbility(furfrou);
  const damages = [{ type: "normal", value: 9 }];
  const options = { originatingMessage: {} };
  service.applyGuardHalving(furfrou, damages, options);
  assert.equal(damages[0].value, 4);
  hooks.handler("dnd5e.applyDamage")(furfrou, 4, options);
  await tick();
  assert.equal(furfrou.getFlag(MODULE_ID, "abilityGuard"), undefined);
  await service.restoreAbilityUses(furfrou, false);
  assert.equal(service.abilityUsesLeft(furfrou, "fur-coat"), 0, "long rest only");

  const clefairy = pokemon("friend-guard");
  assert.equal(await service.useActiveAbility(clefairy), false, "no ally targeted");
  const ally = pokemon("static");
  game.user.targets = new Set([token(pokemon("static"), -1)]);
  assert.equal(await service.useActiveAbility(clefairy), false, "an enemy is not an ally");
  game.user.targets = new Set([token(ally)]);
  assert.equal(await service.useActiveAbility(clefairy), true);
  assert.deepEqual(ally.getFlag(MODULE_ID, "abilityGuard"), { halve: "friend-guard" });
  game.user.targets = new Set();
});

test("Huge Power doubles the dice of the next damage roll", async () => {
  const azumarill = pokemon("huge-power");
  await service.useActiveAbility(azumarill);
  const roll = { options: {}, terms: [{ faces: 6, number: 2, options: {} }, { number: 3, options: {} }], resetFormula() { this.reset = true; } };
  hooks.handler("dnd5e.postRollConfiguration")([roll], { hookNames: ["damage"], subject: { actor: azumarill } });
  assert.deepEqual([roll.terms[0].number, roll.terms[1].number, roll.reset], [4, 3, true]);
  await tick();
  assert.equal(azumarill.getFlag(MODULE_ID, "abilityGuard"), undefined);
});

test("Shield Dust blocks the next status only", async () => {
  const venomoth = pokemon("shield-dust");
  await service.useActiveAbility(venomoth);
  const status = { parent: venomoth, name: "Envenenado", flags: { [MODULE_ID]: { status: "poisoned" } } };
  assert.equal(hooks.handler("preCreateActiveEffect")(status, {}, {}, "player"), false);
  await tick();
  assert.equal(hooks.handler("preCreateActiveEffect")(status, {}, {}, "player"), true);
});

test("Heavy Metal and Steadfast are only offered when they would change the result", () => {
  const aggron = pokemon("heavy-metal");
  const attack = total => ({ total, isCritical: false, isFumble: false, options: { target: 15, poke5eTargetActorUuid: aggron.uuid } });
  assert.equal(typeof service.heavyMetalOffer(attack(16)), "function");
  assert.equal(service.heavyMetalOffer(attack(17)), null, "+2 AC would not make it miss");
  assert.equal(service.heavyMetalOffer(attack(14)), null, "already a miss");
  const lucario = pokemon("steadfast");
  const statusMove = { name: "Thunder Wave", effects: [{ getFlag: (_module, key) => ({ kind: "pokemon-status" })[key] }] };
  assert.equal(typeof service.steadfastOffer({ total: 11 }, { actor: lucario, dc: 13, move: statusMove }), "function");
  assert.equal(service.steadfastOffer({ total: 11 }, { actor: lucario, dc: 13, move: { effects: [] } }), null, "no status on a failure");
  assert.equal(service.steadfastOffer({ total: 14 }, { actor: lucario, dc: 13, move: statusMove }), null);
});

test("the Ability card shows a play button with the uses left, 'activa' while switched on, and no button for reactions", async () => {
  const gyarados = pokemon("intimidate");
  assert.match(service.activeAbilityButton(gyarados), /data-poke5e-ability-action="use"[\s\S]*>1\/1</);
  await service.useActiveAbility(gyarados);
  assert.match(service.activeAbilityButton(gyarados), /disabled[\s\S]*>activa</);
  assert.doesNotMatch(service.activeAbilityButton(pokemon("steadfast")), /<button/);
  assert.equal(service.activeAbilityButton(pokemon("static")), "");
});
