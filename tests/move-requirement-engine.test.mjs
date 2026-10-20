import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbilityItem,
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const warnings = [];

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  }
};

globalThis.ui = {
  notifications: {
    warn(message) {
      warnings.push(message);
    }
  }
};

const actors = new Map();
globalThis.fromUuidSync = uuid => actors.get(uuid) ?? null;

const {
  registerMoveRequirementEngine
} = await import("../scripts/move-requirement-engine.mjs");

registerMoveRequirementEngine();

function dreamEaterActivity() {
  const item = {
    name: "Dream Eater",
    documentName: "Item",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") return undefined;
      if (key === "kind") return "move";
      if (key === "sourceId") return "dream-eater";
      return undefined;
    }
  };

  return { item };
}

function messageConfig(uuid) {
  return {
    data: {
      flags: {
        dnd5e: {
          targets: [{ uuid }]
        }
      }
    }
  };
}

test("Dream Eater accepts a Comatose target as effectively Asleep", () => {
  const target = createFlagDocument({
    uuid: "Actor.comatose",
    items: [createAbilityItem("comatose")]
  });
  actors.set(target.uuid, target);

  const handler = hooks.handler("dnd5e.preUseActivity");
  const result = handler(
    dreamEaterActivity(),
    {},
    {},
    messageConfig(target.uuid)
  );

  assert.equal(result, true);
});

test("Dream Eater blocks an awake target", () => {
  warnings.length = 0;
  const target = createFlagDocument({ uuid: "Actor.awake" });
  actors.set(target.uuid, target);

  const handler = hooks.handler("dnd5e.preUseActivity");
  const result = handler(
    dreamEaterActivity(),
    {},
    {},
    messageConfig(target.uuid)
  );

  assert.equal(result, false);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Dormido/);
});
