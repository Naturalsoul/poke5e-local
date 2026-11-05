import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, createHooks, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const MODULE_ID = "poke5e-local";
const chat = [];
let dialog = null;
let answer = "use";
globalThis.game = { actors: [], user: { id: "player", targets: new Set(), isGM: false }, users: [{ id: "player" }, { id: "gm" }, { id: "other" }],
  settings: { get: () => "es" }, time: { worldTime: 100 } };
globalThis.document = { addEventListener() {}, createElement: () => ({ alt: "" }) };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data) } };
globalThis.foundry = { ...globalThis.foundry, applications: { api: { DialogV2: { wait: async options => {
  dialog = options;
  return answer === "use" ? options.buttons[0].callback({}, { form: { elements: [{ name: "model", value: "onix-token" }] } }) : "skip";
} } } } };
globalThis.canvas = { scene: null };
const illusion = await import("../scripts/illusion-ability-service.mjs");
const active = await import("../scripts/active-ability-service.mjs");
illusion.registerIllusionAbilityService();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function pokemon(abilityId, name, level = 2) {
  const actor = createFlagDocument({ uuid: `Actor.${name}`, name, items: [createAbilityItem(abilityId)], flags: { [MODULE_ID]: { kind: "pokemon" } },
    system: { details: { level } } });
  actor.img = `${name}-portrait.webp`;
  actor.isOwner = true;
  actor.getActiveTokens = () => [];
  actor.testUserPermission = user => user.id !== "other";
  return actor;
}

const look = (name, src, width) => ({ name, width, height: width, texture: { src }, ring: { enabled: false } });

function tokenDoc(id, actor, data) {
  const doc = createFlagDocument({ uuid: `Token.${id}`, name: data.name });
  Object.assign(doc, data, { id, actor, actorId: actor.id, hidden: false,
    toObject: () => structuredClone({ name: doc.name, width: doc.width, height: doc.height, texture: doc.texture, ring: doc.ring }),
    update: async changes => { Object.assign(doc, structuredClone(changes)); } });
  return doc;
}

function sceneWith(...tokens) {
  const list = [...tokens];
  list.get = id => list.find(token => token.id === id);
  return { tokens: list };
}

function chatMessage(data) {
  const message = { ...data, updateSource(changes) {
    for (const [key, value] of Object.entries(changes)) {foundry.utils.setProperty(message, key, value);}
  } };
  return message;
}

// A deployed Zoroark: what deployPokemonToken would create after the dialog.
async function deployed(modelId = "onix-token") {
  const zoroark = pokemon("illusion", "Zoroark");
  const onix = pokemon("static", "Onix");
  const model = tokenDoc("onix-token", onix, look("Onix", "onix.webp", 3));
  const scene = sceneWith(model);
  const source = { flags: {}, ...look("Zoroark", "zoroark.webp", 1) };
  await illusion.disguiseTokenSource(zoroark, source, modelId, scene);
  const own = tokenDoc("zoroark-token", zoroark, source);
  own._flags[MODULE_ID] = source.flags[MODULE_ID];
  zoroark.getActiveTokens = () => [{ document: own }];
  scene.tokens.push(own);
  canvas.scene = scene;
  return { zoroark, onix, own, scene, model };
}

test("the deployer is asked only with another visible Pokémon on the scene", async () => {
  const zoroark = pokemon("illusion", "Zoroark");
  const onix = tokenDoc("onix-token", pokemon("static", "Onix"), look("Onix", "onix.webp", 3));
  dialog = null;
  assert.equal(await illusion.offerIllusion(zoroark, sceneWith()), null);
  assert.equal(dialog, null, "nobody to copy");
  onix.hidden = true;
  assert.equal(await illusion.offerIllusion(zoroark, sceneWith(onix)), null);
  assert.equal(dialog, null, "hidden tokens cannot be seen");
  onix.hidden = false;
  assert.equal(await illusion.offerIllusion(pokemon("static", "Pikachu"), sceneWith(onix)), null);
  assert.equal(dialog, null, "without the Ability");

  assert.equal(await illusion.offerIllusion(zoroark, sceneWith(onix)), "onix-token");
  assert.match(dialog.content, /<option value="onix-token">Onix<\/option>/);
  answer = "skip";
  assert.equal(await illusion.offerIllusion(zoroark, sceneWith(onix)), null, "declined");
  answer = "use";
});

test("the token is born disguised, at will, and only owners are told", async () => {
  chat.length = 0;
  const { zoroark, own } = await deployed();
  assert.deepEqual([own.name, own.texture.src, own.width], ["Onix", "onix.webp", 3]);
  assert.equal(active.abilityMaxUses(zoroark, "illusion"), null, "no limit of uses");
  assert.equal(own.getFlag(MODULE_ID, "illusion").until, 3700);
  assert.equal(illusion.illusionName(zoroark), "Onix");
  assert.equal(illusion.illusionName(pokemon("static", "Pikachu")), "Pikachu");
  assert.equal(chat.length, 1);
  assert.deepEqual(chat[0].whisper, ["player", "gm"]);
  assert.match(chat[0].content, /Zoroark<\/strong> usa .*toma la forma de Onix/);
});

test("a bad model id from a request changes nothing", async () => {
  const { zoroark, own } = await deployed("missing");
  assert.equal(own.name, "Zoroark");
  const source = {};
  const self = tokenDoc("self", zoroark, look("Zoroark", "zoroark.webp", 1));
  await illusion.disguiseTokenSource(zoroark, source, "self", sceneWith(self));
  assert.deepEqual(source, {}, "it cannot copy itself");
});

test("chat messages show the copied Pokémon's name and portrait, including when other Pokémon mention it", async () => {
  const { zoroark } = await deployed();
  zoroark.id = "Zoroark";
  const own = chatMessage({ content: "<p>Zoroark usa Pulso Noche</p>", flavor: "Zoroark ataca", speaker: { actor: "Zoroark", alias: "Zoroark" } });
  illusion.disguiseChatMessage(own);
  assert.deepEqual([own.content, own.flavor, own.speaker.alias], ["<p>Onix usa Pulso Noche</p>", "Onix ataca", "Onix"]);
  assert.equal(own.flags[MODULE_ID].illusionImg, "Onix-portrait.webp");

  const other = chatMessage({ content: "Golpea a Zoroark", speaker: { actor: "rival", alias: "Rival" },
    flags: { dnd5e: { targets: [{ uuid: zoroark.uuid, name: "Onix", img: "Zoroark-portrait.webp" }] } } });
  illusion.disguiseChatMessage(other);
  assert.equal(other.content, "Golpea a Onix");
  assert.equal(other.speaker.alias, "Rival");
  assert.equal(other.flags[MODULE_ID], undefined, "the rival keeps its own portrait");
  assert.equal(other.flags.dnd5e.targets[0].img, "Onix-portrait.webp");

  const replaced = [];
  const avatar = { classList: { remove() {} }, replaceChildren: child => replaced.push(child) };
  illusion.disguiseChatPortrait({ getFlag: () => "Onix-portrait.webp", alias: "Onix" }, { querySelector: () => avatar });
  assert.equal(replaced[0].src, "Onix-portrait.webp");
});

test("without an illusion on the scene, messages stay untouched", () => {
  canvas.scene = sceneWith();
  const message = chatMessage({ content: "Zoroark", speaker: { alias: "Zoroark" } });
  illusion.disguiseChatMessage(message);
  assert.equal(message.content, "Zoroark");
});

test("a damaging Move breaks it, other damage does not, and an hour ends it", async () => {
  const { zoroark, own } = await deployed();
  const hit = hooks.handlers("dnd5e.applyDamage").at(-1);
  hit(zoroark, 5, {});
  hit(zoroark, 0, { originatingMessage: {} });
  await tick();
  assert.equal(own.name, "Onix", "no roll message, or no damage");
  chat.length = 0;
  hit(zoroark, 5, { originatingMessage: {} });
  await tick();
  assert.deepEqual([own.name, own.texture.src, own.width], ["Zoroark", "zoroark.webp", 1]);
  assert.equal(own.getFlag(MODULE_ID, "illusion"), undefined);
  assert.match(chat.at(-1).content, /Zoroark<\/strong> pierde su ilusión/);
  assert.equal(chat.at(-1).whisper, undefined, "the reveal is public");

  const later = await deployed();
  game.scenes = [later.scene];
  const expire = hooks.handler("updateWorldTime");
  expire(9999);
  await tick();
  assert.equal(later.own.name, "Onix", "only the GM ends it");
  game.user.isGM = true;
  expire(3699);
  await tick();
  assert.equal(later.own.name, "Onix");
  expire(3700);
  await tick();
  assert.equal(later.own.name, "Zoroark");
  game.user.isGM = false;
});

test("it has no button or uses: the sheet only shows when it is offered", () => {
  const zoroark = pokemon("illusion", "Zoroark");
  const html = active.activeAbilityButton(zoroark);
  assert.doesNotMatch(html, /<button/);
  assert.match(html, /Se ofrece al desplegarlo/);
  assert.doesNotMatch(html, /\d\/\d/);
});
