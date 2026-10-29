import assert from "node:assert/strict";
import test from "node:test";
import { actorFromUuid, isAuthority } from "../scripts/foundry-runtime.mjs";
import { getLanguage } from "../scripts/i18n.mjs";
import { clampInteger, fractionalAmount } from "../scripts/numbers.mjs";

test("only the active GM is the automation authority", () => {
  globalThis.game = { user: { id: "gm2", isGM: true }, users: { activeGM: { id: "gm1" } } };
  assert.equal(isAuthority(), false);
  game.user.id = "gm1";
  assert.equal(isAuthority(), true);
  globalThis.game = { user: { id: "p1", isGM: false }, users: { activeGM: null } };
  assert.equal(isAuthority(), false);
  game.user.isGM = true;
  assert.equal(isAuthority(), true);
});

test("actorFromUuid returns Actors, Token actors, or null", () => {
  const actor = { documentName: "Actor" };
  const docs = { "Actor.a": actor, "Scene.s.Token.t": { documentName: "Token", actor }, "Scene.s": { documentName: "Scene" } };
  globalThis.fromUuidSync = uuid => {
    if (uuid === "bad") { throw new Error("invalid"); }
    return docs[uuid] ?? null;
  };
  assert.equal(actorFromUuid("Actor.a"), actor);
  assert.equal(actorFromUuid("Scene.s.Token.t"), actor);
  assert.equal(actorFromUuid("Scene.s"), null);
  assert.equal(actorFromUuid("bad"), null);
  assert.equal(actorFromUuid(""), null);
});

test("getLanguage falls back to Spanish when the setting is unavailable", () => {
  globalThis.game = { settings: { get: () => "en" } };
  assert.equal(getLanguage(), "en");
  game.settings.get = () => { throw new Error("not registered"); };
  assert.equal(getLanguage(), "es");
});

test("fractionalAmount rounds down by default and never goes negative", () => {
  assert.equal(fractionalAmount(7, 0.5), 3);
  assert.equal(fractionalAmount(7, 0.5, "ceil"), 4);
  assert.equal(fractionalAmount(7, 0.5, "round"), 4);
  assert.equal(fractionalAmount(-7, 0.5), 0);
  assert.equal(clampInteger("12.9", 1, 10, 5), 10);
  assert.equal(clampInteger("x", 1, 10, 5), 5);
});
