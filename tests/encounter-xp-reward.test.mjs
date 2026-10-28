import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
globalThis.game = { settings: { get: () => "es" } };

const { claimReward } = await import("../scripts/encounter-xp-reward.mjs");
const { getPokemonExperienceThreshold } = await import("../scripts/pokemon-experience-service.mjs");

const M = "poke5e-local";
const world = new Map();
globalThis.fromUuidSync = uuid => world.get(uuid) ?? null;
const add = doc => (world.set(doc.uuid, doc), doc);

const trainer = add(createFlagDocument({ uuid: "Actor.seraphina", flags: { [M]: { kind: "trainer", trainerLevel: 9 } } }));
const pokemon = (uuid, level) => add(createFlagDocument({ uuid, name: uuid.split(".")[1],
  flags: { [M]: { kind: "pokemon", level, trainerOwnerUuid: trainer.uuid } } }));
const card = (id, entries) => ({ id, getFlag: (module, key) => (module === M && key === "reward" ? { name: "Ruta 3", entries } : undefined) });

test("a Pokémon receives its share once; a second claim is refused", async () => {
  const goomy = pokemon("Actor.goomy", 7);
  const message = card("msg1", [{ uuid: goomy.uuid, xp: 3000 }]);
  const { before, after, gained, lost } = await claimReward(message, goomy.uuid);
  assert.equal(before.total, getPokemonExperienceThreshold(7));
  assert.equal(after.total, getPokemonExperienceThreshold(7) + 3000);
  assert.deepEqual([gained, lost], [3000, 0]);
  await assert.rejects(claimReward(message, goomy.uuid), /ya recibió/);
  assert.deepEqual(goomy.getFlag(M, "claimedRewards"), ["msg1"]);
});

test("at the trainer's level a Pokémon gains nothing: all the XP comes back as lost", async () => {
  const houndoom = pokemon("Actor.houndoom", 9);
  const result = await claimReward(card("msg2", [{ uuid: houndoom.uuid, xp: 30000 }]), houndoom.uuid);
  assert.deepEqual([result.gained, result.lost], [0, 30000]);
  assert.equal(result.after.total, getPokemonExperienceThreshold(9));
  assert.equal(result.after.atLevelCap, true);
  assert.equal(result.after.readyToLevel, false);
});

test("a Pokémon that isn't on the card, or no longer exists, gets nothing", async () => {
  await assert.rejects(claimReward(card("msg3", []), "Actor.goomy"), /ya no existe/);
});

test("names without their level suffix, where the level is shown apart", async () => {
  const { withoutLevel } = await import("../scripts/xp-gain-animation.mjs");
  assert.deepEqual(["Toxel (Lv. 5)", "Xiaomi (Nv. 10)", "Cutie", "Mr. Mime (Lv 3)"].map(withoutLevel),
    ["Toxel", "Xiaomi", "Cutie", "Mr. Mime"]);
});

test("one claimer per share: the owner, or the GM only while no owning player is online", async () => {
  const { canClaimReward } = await import("../scripts/encounter-xp-reward.mjs");
  const player = { id: "p", isGM: false, active: true };
  const gm = { id: "g", isGM: true, active: true };
  const stranger = { id: "s", isGM: false, active: true };
  const owned = { testUserPermission: user => user === player || user === gm };
  assert.equal(canClaimReward(owned, player, [player, gm]), true);
  assert.equal(canClaimReward(owned, gm, [player, gm]), false);
  assert.equal(canClaimReward(owned, gm, [{ ...player, active: false }, gm]), true);
  assert.equal(canClaimReward(owned, stranger, [player, gm, stranger]), false);
  assert.equal(canClaimReward(null, gm, [gm]), false);
});
