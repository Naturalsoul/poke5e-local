import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const settings = { language: "es", bondsEnabled: true };
globalThis.game = { actors: [], user: { isGM: true, targets: new Set() }, combat: null,
  settings: { get: (_module, key) => settings[key], register: () => {} } };
globalThis.document = { addEventListener() {} };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? null;
const chat = [];
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
globalThis.ui = { notifications: { warn: text => chat.push(text) } };
const bonds = await import("../scripts/pokemon-bond-service.mjs");
bonds.registerPokemonBondService();

function trainer(pathId, level) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} } } } } });
  game.actors.push(actor);
  return actor;
}

function pokemon(owner, level = 0) {
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "pokemon", ...(owner ? { trainerOwnerUuid: owner.uuid } : {}), bond: { level } } } });
  actor.name = `Pokémon ${game.actors.length}`;
  actor.isOwner = true;
  game.actors.push(actor);
  return actor;
}

const roll = (kind, config) => hooks.handlers(`dnd5e.preRoll${kind}`).forEach(handler => handler(config));
const rolled = (kind, config, data) => hooks.handlers(`dnd5e.roll${kind}`).forEach(handler => handler([{ options: config.rolls[0].options }], data));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test("Bond Points equal a positive Bond Level, one more with a Commander; the sheet row only with the setting on", () => {
  const ash = trainer("ace-trainer", 5);
  assert.deepEqual([3, 2, 1, 0, -2, 7].map(level => bonds.bondPointMax(pokemon(ash, level))), [3, 2, 1, 0, 0, 3]);
  const commander = trainer("commander", 3);
  assert.deepEqual([2, 0].map(level => bonds.bondPointMax(pokemon(commander, level))), [3, 0]);
  assert.match(bonds.bondMarkup(pokemon(ash, 2)), /2\/2 puntos.*data-poke5e-bond-action="spend"/s);
  settings.bondsEnabled = false;
  assert.equal(bonds.bondMarkup(pokemon(ash, 2)), "");
  settings.bondsEnabled = true;
});

test("a spent Bond Point gives advantage to the next roll only, and is back after a long rest", async () => {
  const eevee = pokemon(trainer("ace-trainer", 5), 2);
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async () => ({ use: "advantage", ally: false }) } } };
  await bonds.spendBondPoint(eevee);
  assert.equal(bonds.bondPointsLeft(eevee), 1);
  const save = { subject: eevee, rolls: [{}] };
  roll("SavingThrow", save);
  assert.equal(save.rolls[0].options.advantage, true);
  rolled("SavingThrow", save, { subject: eevee });
  await tick();
  const next = { subject: eevee, rolls: [{}] };
  roll("Skill", next);
  assert.equal(next.rolls[0].options?.advantage, undefined, "used up");
  hooks.handlers("dnd5e.restCompleted").forEach(handler => handler(eevee, { longRest: true }, {}));
  await tick();
  assert.equal(bonds.bondPointsLeft(eevee), 2);
});

test("a defending Bond Point gives disadvantage to the next attack against the Pokémon", async () => {
  const onix = pokemon(trainer("ace-trainer", 5), 1);
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async () => ({ use: "defend", ally: false }) } } };
  await bonds.spendBondPoint(onix);
  game.user.targets = new Set([{ actor: onix }]);
  const attacker = pokemon(null);
  const attack = { subject: { actor: attacker }, rolls: [{}] };
  roll("Attack", attack);
  assert.equal(attack.rolls[0].options.disadvantage, true);
  rolled("Attack", attack, { subject: { actor: attacker } });
  await tick();
  assert.equal(onix.getFlag(MODULE_ID, "bondArmed") ?? null, null);
  game.user.targets = new Set();
});

test("obedience: at −2 a low d20 means disadvantage on the attack, at −3 the Move is not used", () => {
  assert.equal(bonds.obedienceCheck(pokemon(null, -1), 1), "obeys");
  assert.equal(bonds.obedienceCheck(pokemon(null, -2), 11), "obeys");
  assert.equal(bonds.obedienceCheck(pokemon(null, -2), 10), "hesitates");
  assert.equal(bonds.obedienceCheck(pokemon(null, -3), 4), "disobeys");
  globalThis.Roll = class { evaluateSync() { this.total = 3; return this; } async toMessage(data) { chat.push(data.flavor); } };
  const owner = trainer("ace-trainer", 5);
  const move = actor => ({ actor, item: { getFlag: (_module, key) => ({ kind: "move" })[key] } });
  const angry = pokemon(owner, -3);
  assert.equal(bonds.onPreUseMove(move(angry)), false);
  assert.match(chat.at(-1), /desobedece/);
  const grumpy = pokemon(owner, -2);
  assert.equal(bonds.onPreUseMove(move(grumpy)), true);
  const attack = { subject: { actor: grumpy }, rolls: [{}] };
  roll("Attack", attack);
  assert.equal(attack.rolls[0].options.disadvantage, true);
  assert.equal(bonds.onPreUseMove(move(pokemon(null, -3))), true, "wild Pokémon have no bond to obey");
});

test("Commander: Follow Me raises a caught Pokémon's bond to +2 at most; Show Me once per rest; We're a Team gives it away", async () => {
  const lance = trainer("commander", 15);
  const dratini = pokemon(lance, 1);
  await bonds.applyFollowMe(lance, dratini);
  assert.equal(bonds.bondLevel(dratini), 2);
  await bonds.applyFollowMe(lance, dratini);
  assert.equal(bonds.bondLevel(dratini), 2, "max +2");
  await bonds.applyFollowMe(trainer("commander", 4), dratini);

  let offered = "";
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async options => {
    offered = options.content;
    return { use: "showMe", ally: false };
  } } } };
  await bonds.spendBondPoint(dratini);
  assert.match(offered, /value="showMe"/);
  await bonds.spendBondPoint(dratini);
  assert.doesNotMatch(offered, /value="showMe"/, "once per long rest");
  assert.equal(bonds.bondPointsLeft(dratini), 2, "a choice that was not offered spends nothing");

  const ally = pokemon(trainer("ace-trainer", 5), 0);
  game.user.targets = new Set([{ actor: ally }]);
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async options => {
    assert.match(options.content, /We're a Team/);
    return { use: "advantage", ally: true };
  } } } };
  await bonds.spendBondPoint(dratini);
  assert.deepEqual(ally.getFlag(MODULE_ID, "bondArmed"), { advantage: true });
  assert.equal(bonds.bondPointsLeft(dratini), 1);
  game.user.targets = new Set();
});
