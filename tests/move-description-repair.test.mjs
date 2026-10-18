import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { buildMoveDescription } from "../scripts/builder.mjs";
import { repairPoke5eMoveDescriptions } from "../scripts/move-description-repair-service.mjs";
import { syncPoke5eMoveCompendium } from "../scripts/item-catalog-service.mjs";

installFoundryUtils();
const data = JSON.parse(readFileSync(
  new URL("../data/normalized/moves.json", import.meta.url), "utf8"
));
const magnitude = data.moves.find(move => move.id === "magnitude");

function moveItem(id, { definition = magnitude, kind = "move", text } = {}) {
  const flags = { kind, sourceId: "magnitude", moveDefinition: definition };
  return {
    id,
    system: { description: { value: text ?? `<p>${magnitude.description.es.join("\n\n")}</p>` }, uses: { spent: 3 } },
    getFlag(_moduleId, key) { return flags[key]; }
  };
}

function actorWith(items) {
  return {
    items,
    writes: [],
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Item");
      this.writes.push(updates);
      for (const update of updates) {
        assert.deepEqual(Object.keys(update).sort(), ["_id", "system.description.value"]);
        items.find(item => item.id === update._id).system.description.value = update["system.description.value"];
      }
    }
  };
}

function setup({ actors = [], items = [], scenes = [], isGM = true } = {}) {
  globalThis.game = { user: { isGM }, actors, items, scenes };
  const writes = [];
  globalThis.Item = { implementation: {
    async updateDocuments(updates) {
      writes.push(updates);
      for (const update of updates) {
        const item = items.find(entry => entry.id === update._id);
        if (item) {
          item.system.description.value = update["system.description.value"];
        }
      }
    }
  } };
  return writes;
}

test("repairs stored Magnitude descriptions on actors, unlinked tokens and world items once", async () => {
  const actor = actorWith([moveItem("actor-move")]);
  const synthetic = actorWith([moveItem("token-move", { definition: null })]);
  const world = moveItem("world-move", { kind: "move-template" });
  const writes = setup({ actors: [actor], items: [world], scenes: [
    { tokens: [{ actorLink: false, actor: synthetic }, { actorLink: true, actor }] }
  ] });
  assert.equal(await repairPoke5eMoveDescriptions([magnitude]), 3);
  for (const item of [actor.items[0], synthetic.items[0], world]) {
    assert.equal(item.system.description.value, buildMoveDescription(magnitude, "es"));
    assert.match(item.system.description.value, /<table>/);
    assert.doesNotMatch(item.system.description.value, /\[object Object\]/);
    assert.equal(item.system.uses.spent, 3);
  }
  assert.equal(writes.length, 1);
  assert.equal(await repairPoke5eMoveDescriptions([magnitude]), 0);
  assert.equal(actor.writes.length, 1);
  assert.equal(synthetic.writes.length, 1);
});

test("preserves custom definitions, valid descriptions and unrelated items", async () => {
  const custom = { ...magnitude, description: { es: ["Descripción propia", magnitude.description.es[1]] } };
  const actor = actorWith([
    moveItem("custom", { definition: custom }),
    moveItem("valid", { text: "Descripción editada por el GM" }),
    moveItem("other", { kind: "catalog-item" })
  ]);
  setup({ actors: [actor] });
  assert.equal(await repairPoke5eMoveDescriptions([magnitude]), 1);
  assert.equal(actor.items[0].system.description.value, buildMoveDescription(custom, "es"));
  assert.equal(actor.items[1].system.description.value, "Descripción editada por el GM");
  assert.match(actor.items[2].system.description.value, /\[object Object\]/);
});

test("does not write as a player", async () => {
  const actor = actorWith([moveItem("move")]);
  setup({ actors: [actor], isGM: false });
  assert.equal(await repairPoke5eMoveDescriptions([magnitude]), 0);
  assert.equal(actor.writes.length, 0);
});

test("startup rebuilds the previous compendium version and repairs copies even with a current signature", async () => {
  const actor = actorWith([moveItem("move")]);
  const writes = setup({ actors: [actor] });
  const pack = {
    collection: "world.poke5e-moves", locked: false, folders: new Map(),
    async getIndex() {
      return [{ _id: "template", flags: { "poke5e-local": { kind: "move-template", sourceId: "magnitude" } } }];
    }
  };
  const settings = new Map([["language", "es"]]);
  game.packs = new Map([[pack.collection, pack]]);
  game.modules = new Map([["poke5e-local", { version: "test" }]]);
  game.settings = {
    get(_moduleId, key) { return settings.get(key); },
    async set(_moduleId, key, value) { settings.set(key, value); }
  };
  const originalFetch = globalThis.fetch;
  const originalFolder = globalThis.Folder;
  globalThis.fetch = async () => ({ ok: true, async json() { return { ...data, moves: [magnitude] }; } });
  globalThis.Folder = { implementation: {
    async createDocuments(sources) {
      return sources.map(source => {
        const folder = { ...source, id: String(pack.folders.size),
          getFlag(moduleId, key) { return source.flags[moduleId]?.[key]; }
        };
        pack.folders.set(folder.id, folder);
        return folder;
      });
    }
  } };
  try {
    await syncPoke5eMoveCompendium();
    const signature = settings.get("moveCatalogSignature");
    settings.set("moveCatalogSignature", signature.replace(/^0\.1\.1:/, "0.1.0:"));
    writes.length = 0;
    assert.equal((await syncPoke5eMoveCompendium()).status, "synced");
    assert.equal(writes.length, 1);
    assert.match(writes[0][0].system.description.value, /<table>/);
    assert.doesNotMatch(writes[0][0].system.description.value, /\[object Object\]/);

    actor.items.push(moveItem("old-copy"));
    assert.equal((await syncPoke5eMoveCompendium()).status, "current");
    assert.doesNotMatch(actor.items[1].system.description.value, /\[object Object\]/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Folder = originalFolder;
  }
});
