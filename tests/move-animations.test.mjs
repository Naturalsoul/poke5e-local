import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const settings = { moveAnimations: true, language: "es" };
const played = [];
const heard = [];
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(`../${url.replace("modules/poke5e-local/", "")}`, import.meta.url), "utf8")) });
globalThis.game = { user: { id: "u1", targets: [] }, settings: { get: (_m, key) => settings[key], register() {} },
  modules: { get: () => ({ active: true }) } };
globalThis.canvas = { scene: { grid: { distance: 5 } } };
globalThis.fromUuidSync = () => null;
// Records each effect step and the calls made on it.
globalThis.Sequence = class {
  effect() {
    const step = { calls: [] };
    for (const name of ["file", "tint", "atLocation", "stretchTo", "scaleToObject", "size", "missed", "delay", "mask"]) {
      step[name] = (...args) => { step.calls.push([name, ...args]); return step; };
    }
    (this.steps ??= []).push(step);
    return step;
  }
  sound() {
    const sound = { calls: [] };
    for (const name of ["file", "audioChannel", "volume"]) {
      sound[name] = (...args) => { sound.calls.push([name, ...args]); return sound; };
    }
    (this.sounds ??= []).push(sound);
    return sound;
  }
  async play() { played.push(this.steps ?? []); heard.push(...(this.sounds ?? []).map(sound => sound.calls[0][1])); }
};
const animations = await import("../scripts/move-animations.mjs");
animations.registerMoveAnimations();
await animations.loadMoveSounds();
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

const settle = () => new Promise(resolve => setImmediate(resolve));

test("Moves imported with an old definition (no area) still get their size and their template", async () => {
  const legacy = move("earthquake");
  legacy.setFlag(MODULE_ID, "moveDefinition", { ...legacy.getFlag(MODULE_ID, "moveDefinition"), area: undefined });
  assert.equal(animations.moveAnimation(legacy).size, 20, "from \"self (20ft radius)\"");
  const gas = move("poison-gas");
  gas.setFlag(MODULE_ID, "moveDefinition", { ...gas.getFlag(MODULE_ID, "moveDefinition"), area: undefined });
  played.length = 0;
  hooks.handler("dnd5e.postUseActivity")({ type: "save", item: gas, target: { template: { type: "radius" } } });
  assert.equal(played.length, 0, "it waits for its template");
  game.user.id = "u1";
  const template = { t: "circle", distance: 15, object: { shape: {} }, getFlag: () => "Item.gas" };
  globalThis.fromUuidSync = () => gas;
  hooks.handler("createMeasuredTemplate")(template, {}, "u1");
  await settle();
  globalThis.fromUuidSync = () => null;
  assert.equal(played.length, 1);
  const [step] = played[0];
  assert.deepEqual(step.calls.find(([name]) => name === "atLocation"), ["atLocation", { x: 0, y: 0 }]);
  assert.deepEqual(step.calls.find(([name]) => name === "size")?.slice(0, 2), ["size", (30 * 1.3) / 5], "past the edge…");
  assert.deepEqual(step.calls.at(-1), ["mask", template], "…and masked to it");
});

test("any Move with a template plays over it without targets, filling its shape", async () => {
  const onTemplate = async (id, template) => {
    const item = move(id);
    played.length = 0;
    globalThis.fromUuidSync = () => item;
    hooks.handler("createMeasuredTemplate")({ object: { shape: {} }, ...template, getFlag: () => "Item.x" }, {}, game.user.id);
    await settle();
    globalThis.fromUuidSync = () => null;
    return played[0][0].calls;
  };
  // An attack with an area: no target needed, and no second animation from its attack.
  played.length = 0;
  hooks.handler("dnd5e.postUseActivity")({ type: "save", item: move("flamethrower"), target: { template: { type: "cone" } } });
  assert.equal(played.length, 0);
  // Dragon Breath: placed but not drawn yet, so its points come from its data, not from Sequencer measuring it.
  globalThis.canvas.dimensions = { size: 100, distance: 5 };
  const breath = await onTemplate("dragon-breath", { t: "cone", x: 100, y: 200, distance: 40, direction: 90 });
  assert.equal(breath[0][1], "jb2a.breath_weapons.fire.cone.orange.01");
  assert.deepEqual(breath.slice(1).map(([name, at]) => [name, at && { x: Math.round(at.x ?? 0), y: Math.round(at.y ?? 0) }]),
    [["atLocation", { x: 100, y: 200 }], ["stretchTo", { x: 100, y: 1000 }], ["mask", { x: 100, y: 200 }]]);
  const square = await onTemplate("ember", { t: "rect", x: 0, y: 0, distance: 20 * Math.SQRT2, direction: 45 });
  assert.deepEqual(square.find(([name]) => name === "atLocation")[1], { x: 200.00000000000003, y: 200 }, "a square plays on its center");
  delete globalThis.canvas.dimensions;
  const cone = await onTemplate("flamethrower", { t: "cone", distance: 15 });
  assert.deepEqual(cone.map(([name]) => name), ["file", "atLocation", "stretchTo", "mask"]);
  assert.equal(cone[0][1], "jb2a.breath_weapons.fire.cone.orange.01");
  const waterCone = await onTemplate("water-gun", { t: "cone", distance: 15 });
  assert.equal(waterCone[0][1], "jb2a.liquid.splash.blue", "no Water cone file: its burst, masked to the cone");
  assert.ok(waterCone.some(([name]) => name === "size"));
  const ray = await onTemplate("ember", { t: "ray", distance: 30, width: 5 });
  assert.equal(ray[0][1], "jb2a.fire_bolt.orange", "a Fire line: its projectile along the ray");
  assert.ok(ray.some(([name]) => name === "stretchTo") && ray.at(-1)[0] === "mask");
  const rect = await onTemplate("ember", { t: "rect", distance: 20 });
  assert.deepEqual(rect.find(([name]) => name === "size")?.slice(0, 2), ["size", (20 * 1.3) / 5], "a square's distance is its diagonal");
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

test("a just-created template waits until it is drawn to be masked; its Move is found by its activity too", async () => {
  const item = move("dragon-breath");
  const template = { t: "cone", x: 0, y: 0, distance: 40, direction: 0, object: null,
    getFlag: (_scope, key) => (key === "origin" ? "Activity.breath" : undefined) };
  globalThis.fromUuidSync = uuid => (uuid === "Activity.breath" ? { item } : null);
  let frames = 0;
  globalThis.requestAnimationFrame = callback => {
    if (++frames === 3) {template.object = { shape: {} };}
    setImmediate(callback);
  };
  played.length = 0;
  hooks.handler("createMeasuredTemplate")(template, {}, game.user.id);
  for (let tick = 0; tick < 10; tick++) {await settle();}
  globalThis.fromUuidSync = () => null;
  delete globalThis.requestAnimationFrame;
  assert.equal(played.length, 1);
  assert.equal(frames, 3, "it waited for the drawing");
  assert.deepEqual(played[0][0].calls.at(-1), ["mask", template]);
});

test("Foundry 14: a placed template is a Region, and its Move plays over it", async () => {
  globalThis.canvas.dimensions = { size: 100, distance: 5 };
  const item = move("dragon-breath");
  const region = { shapes: [{ type: "cone", x: 100, y: 200, radius: 800, rotation: 90, angle: 53 }],
    getFlag: (scope, key) => ({ "core.MeasuredTemplate": true, "dnd5e.item": "Item.breath" })[`${scope}.${key}`] };
  globalThis.fromUuidSync = uuid => (uuid === "Item.breath" ? item : null);
  played.length = 0;
  hooks.handler("createRegion")(region, {}, game.user.id);
  await settle();
  globalThis.fromUuidSync = () => null;
  const calls = played[0][0].calls;
  assert.equal(calls[0][1], "jb2a.breath_weapons.fire.cone.orange.01");
  assert.deepEqual(calls.find(([name]) => name === "atLocation")[1], { x: 100, y: 200 });
  const end = calls.find(([name]) => name === "stretchTo")[1];
  assert.deepEqual([Math.round(end.x), Math.round(end.y)], [100, 1000], "40 ft down");
  assert.deepEqual(calls.at(-1), ["mask", region]);
  assert.deepEqual(animations.regionTemplate({ shapes: [{ type: "rectangle", x: 0, y: 0, width: 400, height: 300, rotation: 0 }] }).distance, 25);
  played.length = 0;
  hooks.handler("createRegion")({ ...region, getFlag: () => undefined }, {}, game.user.id);
  await settle();
  assert.equal(played.length, 0, "a Region that isn't a template plays nothing");
  delete globalThis.canvas.dimensions;
});

test("each Move plays its own Pokémon sound with its animation; the rest sound like their type", () => {
  const root = "modules/poke5e-local/assets/audio/moves";
  assert.equal(animations.moveSound(move("ember")), `${root}/gen7-ember.ogg`);
  assert.equal(animations.moveSound(move("dragon-breath")), `${root}/gen7-dragon-breath.ogg`);
  assert.equal(animations.moveSound(move("body-press")), `${root}/slam.ogg`, "a Gen 8 Move: from the Essentials pack");
  assert.equal(animations.moveSound(move("tera-blast")), `${root}/gen7-tackle.ogg`, "no sound of its own: its type's");
  const sounds = JSON.parse(readFileSync(new URL("../data/move-sounds.json", import.meta.url), "utf8"));
  for (const [type, id] of Object.entries(animations.TYPE_SOUND_MOVES)) {assert.ok(sounds[id], `${type}: ${id}`);}
  for (const file of new Set(Object.values(sounds))) {
    assert.ok(readFileSync(new URL(`../assets/audio/moves/${file}`, import.meta.url)).length > 0, file);
  }
  heard.length = 0;
  animations.playMoveAnimation(move("ember"), ["foe"], { missed: true });
  assert.deepEqual(heard, [`${root}/gen7-ember.ogg`], "a miss still sounds");
});
