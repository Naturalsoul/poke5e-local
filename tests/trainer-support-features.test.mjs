import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
createHooks();
const MODULE_ID = "poke5e-local";
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4, OVERRIDE: 5 } };
globalThis.game = { actors: [], user: { isGM: true, targets: new Set() }, users: { activeGM: null }, settings: { get: () => "es" }, combat: null };
globalThis.fromUuidSync = uuid => game.actors.find(actor => actor.uuid === uuid) ?? game.items?.find(item => item.uuid === uuid) ?? null;
const { trainerPathEffectChanges } = await import("../scripts/trainer-path-effects.mjs");
const { hasPokemonAbility } = await import("../scripts/status-runtime.mjs");
const { ensureTrainerPathFeatureResources } = await import("../scripts/trainer-progression-service.mjs");
const actions = await import("../scripts/trainer-path-actions.mjs");

function trainer(pathId, level, abilities = {}) {
  const actor = createFlagDocument({ uuid: `Actor.trainer-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "trainer", trainerLevel: level, trainerProgression: { path: { id: pathId, choices: {} }, resources: {} } } } });
  actor.system = { abilities: Object.fromEntries(Object.entries(abilities).map(([id, value]) => [id, { value }])), traits: { ci: { value: new Set() } } };
  actor.update = async changes => { actor.system.traits.ci.value = new Set(changes["system.traits.ci.value"]); };
  game.actors.push(actor);
  return actor;
}

function pokemon(owner, abilityIds = [], flags = {}) {
  const actor = createFlagDocument({ uuid: `Actor.pokemon-${game.actors.length}`, documentName: "Actor", flags: { [MODULE_ID]: {
    kind: "pokemon", ...(owner ? { trainerOwnerUuid: owner.uuid } : {}), ...flags } } });
  actor.id = `pokemon-${game.actors.length}`;
  actor.name = `Pokémon ${game.actors.length}`;
  actor.items = abilityIds.map(id => ({ name: id, getFlag: (_module, key) => ({ kind: "ability", sourceId: id })[key] }));
  game.actors.push(actor);
  return actor;
}

test("Mind: from Guru 5, WIS save proficiency and the double confusion roll; Body adds the second ability from 9", () => {
  assert.deepEqual(trainerPathEffectChanges({ pathId: "guru", level: 4 }), []);
  const mind = trainerPathEffectChanges({ pathId: "guru", level: 5, bodyAbilityId: "levitate" });
  assert.deepEqual(mind.map(change => [change.key, change.value]), [["system.abilities.wis.proficient", "1"], [`flags.${MODULE_ID}.guruMind`, "true"]]);
  const body = trainerPathEffectChanges({ pathId: "guru", level: 9, bodyAbilityId: "levitate" });
  assert.deepEqual(body.at(-1), { key: `flags.${MODULE_ID}.bodyAbilityId`, mode: 5, value: "levitate", priority: 20 });
});

test("Body: the second ability counts for every engine, only if the Pokémon really has it", () => {
  const gastly = pokemon(null, ["levitate", "cursed-body"], { activeAbilityId: "levitate", bodyAbilityId: "cursed-body" });
  assert.equal(hasPokemonAbility(gastly, "levitate"), true);
  assert.equal(hasPokemonAbility(gastly, "cursed-body"), true);
  const stale = pokemon(null, ["levitate"], { activeAbilityId: "levitate", bodyAbilityId: "cursed-body" });
  assert.equal(hasPokemonAbility(stale, "cursed-body"), false);
});

test("Nurse 5 gets PB Treats and Guru 15 gets 1 + WIS Spirit uses, both per long rest", async () => {
  const joy = trainer("nurse", 5);
  await ensureTrainerPathFeatureResources(joy);
  assert.deepEqual(joy.getFlag(MODULE_ID, "trainerProgression").resources.pokechefUses, { value: 3, max: 3, recovery: "long-rest" });
  const sabrina = trainer("guru", 15, { wis: 16 });
  await ensureTrainerPathFeatureResources(sabrina);
  assert.equal(sabrina.getFlag(MODULE_ID, "trainerProgression").resources.spiritUses.max, 4);
  assert.deepEqual([5, 9, 15].map(level => actions.pokechefFormula(trainer("nurse", level))), ["2d4 + 2", "3d10 + 6", "4d12 + 10"]);
});

test("Spirit gives +WIS to the active Pokémon until their next turn, next to another trainer's Cheerleader", async () => {
  const sabrina = trainer("guru", 15, { wis: 16 });
  await sabrina.setFlag(MODULE_ID, "trainerProgression", { ...sabrina.getFlag(MODULE_ID, "trainerProgression"), resources: { spiritUses: { value: 2, max: 4 } } });
  const abra = pokemon(sabrina);
  const effects = [{ id: "cheer", getFlag: (_module, key) => ({ kind: "trainer-cheerleader" })[key] }];
  abra.effects = { filter: predicate => effects.filter(predicate) };
  abra.deleteEmbeddedDocuments = async () => assert.fail("another trainer's Cheerleader stays");
  abra.createEmbeddedDocuments = async (_type, data) => effects.push(...data);
  await sabrina.setFlag(MODULE_ID, "trainerParty", { pokemonUuids: [abra.uuid], activePokemonUuids: [abra.uuid] });
  globalThis.foundry.applications = { api: { DialogV2: { prompt: async options => {
    assert.doesNotMatch(options.content, /value="ac"/, "Spirit has no AC option");
    return "damage";
  } } } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async () => {} } };
  await actions.runTrainerPathAction("trainer-spirit", sabrina);
  const spirit = effects.at(-1);
  assert.equal(spirit.flags[MODULE_ID].kind, "trainer-spirit");
  assert.equal(spirit.name, "Spirit — Tiradas de daño +3");
  assert.ok(spirit.changes.every(change => change.key.endsWith(".damage") && change.value === "3"));
  assert.equal(sabrina.getFlag(MODULE_ID, "trainerProgression").resources.spiritUses.value, 1);
});

test("Tip-Top Shape: advantage on saves against Moves that inflict a status, for a Nurse 15's Pokémon", () => {
  const status = { uuid: "Item.thunder-wave", effects: [{ getFlag: (_module, key) => ({ kind: "pokemon-status" })[key] }] };
  const plain = { uuid: "Item.surf", effects: [] };
  game.items = [status, plain];
  const save = (actor, item) => {
    const config = { subject: actor, rolls: [{ options: { [MODULE_ID]: { modifierUsage: { itemUuid: item.uuid } } } }] };
    actions.applyTipTopShape(config);
    return config.rolls[0].options.advantage === true;
  };
  const chansey = pokemon(trainer("nurse", 15));
  assert.equal(save(chansey, status), true);
  assert.equal(save(chansey, plain), false);
  assert.equal(save(pokemon(trainer("nurse", 9)), status), false, "not before level 15");
});

test("Trainer's Resolve makes level 10 trainers immune to Frightened; Tracker uses: 1, or 2 for a Collector 15", async () => {
  const resolute = trainer("ace-trainer", 10);
  resolute.system.traits.ci.value = new Set(["charmed"]);
  await ensureTrainerPathFeatureResources(resolute);
  assert.deepEqual([...resolute.system.traits.ci.value], ["charmed", "frightened"]);
  const tracker = trainer("ranger", 13);
  await ensureTrainerPathFeatureResources(tracker);
  assert.equal(tracker.getFlag(MODULE_ID, "trainerProgression").resources.trackerUses.max, 1);
  const collector = trainer("pokemon-collector", 15);
  await ensureTrainerPathFeatureResources(collector);
  assert.equal(collector.getFlag(MODULE_ID, "trainerProgression").resources.trackerUses.max, 2);
  assert.equal(trainer("guru", 12).getFlag(MODULE_ID, "trainerProgression").resources.trackerUses, undefined);
});

test("the Pokémon Tracker button only spends the use and says so in chat", async () => {
  const brock = trainer("ranger", 13);
  await ensureTrainerPathFeatureResources(brock);
  assert.ok(actions.availableTrainerPathActions(brock).includes("trainer-tracker"));
  assert.equal(actions.trainerPathActionLabel(brock, "trainer-tracker"), "Pokémon Tracker 1/1");
  const chat = [];
  globalThis.foundry.applications = { api: { DialogV2: { confirm: async () => true } } };
  globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
  globalThis.ui = { notifications: { warn: text => chat.push(text) } };
  await actions.runTrainerPathAction("trainer-tracker", brock);
  assert.match(chat.at(-1), /usa <strong>Pokémon Tracker<\/strong>/);
  await actions.runTrainerPathAction("trainer-tracker", brock);
  assert.match(chat.at(-1), /gastado hasta un descanso largo/);
});
