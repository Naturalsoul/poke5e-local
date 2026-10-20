import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const settings = { moveAnimations: true, language: "es" };
const played = [];
globalThis.game = { user: { id: "u1", targets: [] }, settings: { get: (_m, key) => settings[key], register() {} },
  modules: { get: () => ({ active: true }) } };
globalThis.canvas = { scene: { grid: { distance: 5 } } };
globalThis.fromUuidSync = () => null;
// Records each effect step and the calls made on it.
globalThis.Sequence = class {
  effect() {
    const step = { calls: [] };
    for (const name of ["file", "tint", "atLocation", "stretchTo", "scaleToObject", "size", "missed", "delay"]) {
      step[name] = (...args) => { step.calls.push([name, ...args]); return step; };
    }
    (this.steps ??= []).push(step);
    return step;
  }
  async play() { played.push(this.steps ?? []); }
};
const animations = await import("../scripts/move-animations.mjs");
animations.registerMoveAnimations();
const { moves } = JSON.parse(readFileSync(new URL("../data/normalized/moves.json", import.meta.url), "utf8"));

const user = { getActiveTokens: () => ["userToken"] };
const move = id => {
  const definition = moves.find(entry => entry.id === id);
  const item = createFlagDocument({ flags: { [MODULE_ID]: { kind: "move", sourceId: id, moveType: definition.type, moveDefinition: definition } } });
  item.actor = user;
  return item;
};
const files = steps => steps.map(step => step.calls.find(([name]) => name === "file")[1]);

test("every Move gets a JB2A animation from its type and shape", () => {
  for (const definition of moves) {
    const animation = animations.moveAnimation(move(definition.id));
    assert.match(animation.file, /^jb2a\./, definition.id);
  }
  assert.equal(animations.moveAnimation(move("ember")).file, "jb2a.fire_bolt.orange");
  assert.equal(animations.moveAnimation(move("bite")).file, "jb2a.bite.200px.red");
  assert.equal(animations.moveAnimation(move("flamethrower")).at, "from-user", "a cone toward the target");
  assert.equal(animations.moveAnimation(move("earthquake")).at, "user", "a burst around the user");
  assert.equal(animations.moveAnimation(move("growl")).at, "target", "a debuff on the target");
});

test("an attack plays toward its target once shown, and a miss goes past it", () => {
  const item = move("ember");
  played.length = 0;
  animations.playMoveAnimation(item, ["foe"], { missed: true });
  const [step] = played[0];
  assert.deepEqual(step.calls.filter(([name]) => name !== "file" && name !== "tint"), [["atLocation", "userToken"], ["stretchTo", "foe"], ["missed"]]);
});

test("non-attack Moves play on use, attacks and areas on a point wait; the setting turns it off", () => {
  played.length = 0;
  game.user.targets = ["foe"];
  const use = hooks.handler("dnd5e.postUseActivity");
  use({ type: "save", item: move("thunder-wave") });
  use({ type: "attack", item: move("ember") });
  assert.equal(played.length, 1);
  assert.deepEqual(files(played[0]), [animations.moveAnimation(move("thunder-wave")).file]);
  settings.moveAnimations = false;
  use({ type: "save", item: move("thunder-wave") });
  assert.equal(played.length, 1);
  settings.moveAnimations = true;
});

test("Moves imported with an old definition (no area) still get their size and their template", () => {
  const legacy = move("earthquake");
  legacy.setFlag(MODULE_ID, "moveDefinition", { ...legacy.getFlag(MODULE_ID, "moveDefinition"), area: undefined });
  assert.equal(animations.moveAnimation(legacy).size, 20, "from \"self (20ft radius)\"");
  const gas = move("poison-gas");
  gas.setFlag(MODULE_ID, "moveDefinition", { ...gas.getFlag(MODULE_ID, "moveDefinition"), area: undefined });
  played.length = 0;
  hooks.handler("dnd5e.postUseActivity")({ type: "save", item: gas, target: { template: { type: "radius" } } });
  assert.equal(played.length, 0, "it waits for its template");
  game.user.id = "u1";
  const template = { distance: 15, getFlag: () => "Item.gas" };
  globalThis.fromUuidSync = () => gas;
  hooks.handler("createMeasuredTemplate")(template, {}, "u1");
  globalThis.fromUuidSync = () => null;
  assert.equal(played.length, 1);
  const [step] = played[0];
  assert.deepEqual(step.calls.find(([name]) => name === "atLocation"), ["atLocation", template]);
  assert.deepEqual(step.calls.find(([name]) => name === "size"), ["size", 6, { gridUnits: true }]);
});

test("a melee Move hits the way its name or description says, then adds its element", () => {
  const strike = id => animations.moveAnimation(move(id)).file;
  const fist = "jb2a.melee_generic.creature_attack.fist.001.red";
  assert.equal(strike("feint-attack"), fist, "\"a sucker punch\", not the Dark bite");
  assert.equal(strike("bite"), "jb2a.bite.200px.red");
  assert.equal(strike("crush-claw"), "jb2a.claws.200px.red");
  assert.equal(strike("tackle"), "jb2a.impact.004.blue", "\"attack roll\" is not a roll");
  assert.equal(strike("megahorn"), "jb2a.spear.melee.01.white", "\"30 feet\" is not a kick");
  const firePunch = animations.moveAnimation(move("fire-punch"));
  assert.equal(firePunch.file, fist);
  assert.equal(firePunch.overlay.file, "jb2a.impact.fire.01.orange");
  played.length = 0;
  animations.playMoveAnimation(move("fire-punch"), ["foe"], {});
  assert.deepEqual(files(played[0]), [fist, "jb2a.impact.fire.01.orange"]);
  played.length = 0;
  animations.playMoveAnimation(move("fire-punch"), ["foe"], { missed: true });
  assert.deepEqual(files(played[0]), [fist], "a miss has no element");
});

test("big tokens: bursts count from the user's edge and strikes stop at the target's edge", () => {
  globalThis.canvas.grid = { size: 100 };
  const big = { center: { x: 0, y: 0 }, document: { width: 4, height: 4 } };
  const quake = move("earthquake");
  quake.actor = { getActiveTokens: () => [big] };
  played.length = 0;
  animations.playMoveAnimation(quake, [], {});
  assert.deepEqual(played[0][0].calls.find(([name]) => name === "size"), ["size", 12, { gridUnits: true }], "8 squares + the 4×4 token");
  const huge = { center: { x: 500, y: 0 }, document: { width: 3, height: 3 } };
  const punch = move("mega-punch");
  punch.actor = { getActiveTokens: () => [{ center: { x: 0, y: 0 }, document: { width: 1, height: 1 } }] };
  played.length = 0;
  animations.playMoveAnimation(punch, [huge], {});
  assert.deepEqual(played[0][0].calls.find(([name]) => name === "stretchTo"), ["stretchTo", { x: 400, y: 0 }]);
  const ember = move("ember");
  played.length = 0;
  animations.playMoveAnimation(ember, [huge], {});
  assert.deepEqual(played[0][0].calls.find(([name]) => name === "stretchTo"), ["stretchTo", huge], "projectiles still fly to the center");
  delete globalThis.canvas.grid;
});
