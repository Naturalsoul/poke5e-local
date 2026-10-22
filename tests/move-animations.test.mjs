import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const settings = { moveAnimations: true, moveSounds: true, language: "es" };
const played = [];
const heard = [];
globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(`../${url.replace("modules/poke5e-local/", "")}`, import.meta.url), "utf8")) });
const sent = [];
const socketHandlers = [];
globalThis.game = { user: { id: "u1", targets: [] }, settings: { get: (_m, key) => settings[key], register() {} },
  modules: { get: () => ({ active: true }) },
  socket: { emit: (channel, message) => sent.push([channel, message]), on: (_channel, handler) => socketHandlers.push(handler) } };
globalThis.foundry = { ...globalThis.foundry, audio: { AudioHelper: { play: data => heard.push(data.src) } } };
globalThis.canvas = { scene: { grid: { distance: 5 } } };
globalThis.fromUuidSync = () => null;
// Records each effect step and the calls made on it.
globalThis.Sequence = class {
  effect() {
    const step = { calls: [] };
    for (const name of ["file", "tint", "atLocation", "stretchTo", "scaleToObject", "size", "missed", "delay", "mask",
      "copySprite", "forUsers", "filter", "duration", "fadeOut", "animateProperty"]) {
      step[name] = (...args) => { step.calls.push([name, ...args]); return step; };
    }
    (this.steps ??= []).push(step);
    return step;
  }
  canvasPan() {
    const step = { calls: [["canvasPan"]] };
    for (const name of ["shake", "forUsers", "delay"]) {step[name] = (...args) => { step.calls.push([name, ...args]); return step; };}
    (this.steps ??= []).push(step);
    return step;
  }
  async play() { played.push(this.steps ?? []); }
};
const animations = await import("../scripts/move-animations.mjs");
animations.registerMoveAnimations();
Hooks.callAll("ready");
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

test("a Move that helps an ally plays a buff (or a heal) on it, never the curse", () => {
  const ids = new Set(moves.map(entry => entry.id));
  for (const id of animations.SUPPORT_MOVES) {
    assert.ok(ids.has(id), `${id} is a Move`);
    assert.doesNotMatch(animations.moveAnimation(move(id)).file, /curse/, id);
  }
  assert.deepEqual(animations.moveAnimation(move("helping-hand")),
    { file: "jb2a.on_token_buff.001.001.orangeyellow", at: "target", tint: animations.TYPE_ANIMATIONS.normal.color });
  assert.equal(animations.moveAnimation(move("floral-healing")).file, "jb2a.healing_generic.burst.greenorange");
  assert.equal(animations.moveAnimation(move("tailwind")).at, "user", "an aura around the user");
  assert.match(animations.moveAnimation(move("leer")).file, /curse/, "hindering an enemy still curses");
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

test("an attack's animation and sound wait for Dice So Nice to show the roll in chat", async () => {
  let reveal;
  globalThis.game.dice3d = { waitFor3DAnimationByMessageID: id => (id === "roll-message" ? new Promise(resolve => { reveal = resolve; }) : null) };
  globalThis.requestAnimationFrame = callback => setImmediate(callback);
  played.length = 0;
  heard.length = 0;
  const item = move("ember");
  animations.onAttackOutcome({ hit: false }, { activity: { type: "attack", item }, roll: { parent: { id: "roll-message" } } });
  for (let tick = 0; tick < 5; tick++) {await settle();}
  assert.equal(played.length, 0, "nothing gives the miss away while the dice roll");
  assert.equal(heard.length, 0);
  reveal();
  for (let tick = 0; tick < 10; tick++) {await settle();}
  assert.equal(played.length, 1);
  assert.equal(heard.length, 1);
  delete globalThis.game.dice3d;
  delete globalThis.requestAnimationFrame;
});

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

test("each Move plays its own Pokémon sound with its animation; the rest sound like their type", async () => {
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
  sent.length = 0;
  animations.playMoveAnimation(move("ember"), ["foe"], { missed: true });
  await settle();
  assert.deepEqual(heard, [`${root}/gen7-ember.ogg`], "a miss still sounds");
  assert.deepEqual(sent, [["module.poke5e-local", { type: "move-sound", src: `${root}/gen7-ember.ogg` }]], "sent to the others");
});

test("each player can mute Move sounds just for themselves", async () => {
  const root = "modules/poke5e-local/assets/audio/moves";
  const receive = message => socketHandlers.forEach(handler => handler(message));
  heard.length = 0;
  sent.length = 0;
  settings.moveSounds = false;
  animations.playMoveAnimation(move("ember"), ["foe"], {});
  await settle();
  assert.deepEqual(heard, [], "muted: this player doesn't hear it…");
  assert.equal(sent.length, 1, "…but the others still get it");
  receive({ type: "move-sound", src: `${root}/gen7-ember.ogg` });
  assert.deepEqual(heard, [], "nor what the others play");
  settings.moveSounds = true;
  receive({ type: "move-sound", src: `${root}/gen7-ember.ogg` });
  receive({ type: "move-sound", src: "https://example.com/anything.mp3" });
  assert.deepEqual(heard, [`${root}/gen7-ember.ogg`], "only the module's own sounds");
});

test("a hit flashes and knocks back the target with a burst; a critical also shakes; players who turned it off don't see it", () => {
  const item = move("tackle");
  const source = { center: { x: 0, y: 0 } };
  const target = { center: { x: 100, y: 0 } };
  const animation = animations.moveAnimation(item);
  const run = options => { const sequence = new globalThis.Sequence(); animations.addImpact(sequence, animation, source, target, options); return sequence.steps ?? []; };
  const hit = run({ viewers: ["u1"] });
  assert.equal(hit.length, 2, "the flash and the burst, no shake");
  const recoil = hit[0].calls.filter(([name]) => name === "animateProperty");
  assert.deepEqual(recoil.map(([, , property, { to }]) => [property, to > 0]), [["position.x", true]], "pushed away from the attacker");
  assert.ok(hit.every(step => step.calls.some(([name, users]) => name === "forUsers" && users.includes("u1"))));
  const critical = run({ critical: true, viewers: ["u1"] });
  assert.equal(critical.length, 3);
  assert.equal(critical[2].calls[0][0], "canvasPan");
  assert.equal(run({ viewers: [] }).length, 0);
  game.users = [{ id: "u1", active: true, getFlag: () => false }, { id: "u2", active: true, getFlag: () => true }, { id: "u3", active: false }];
  assert.deepEqual(animations.impactViewers(), ["u1"]);
  delete game.users;
});

test("a missed attack gets no impact", () => {
  game.users = [{ id: "u1", active: true, getFlag: () => false }];
  played.length = 0;
  animations.playMoveAnimation(move("tackle"), [{ center: { x: 5, y: 5 } }], { missed: true, impact: { critical: false } });
  assert.equal(played[0].length, 1);
  delete game.users;
});
