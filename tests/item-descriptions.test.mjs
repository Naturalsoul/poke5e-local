import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import {
  buildPoke5eCatalogItem,
  synchronizeMissingCatalogDescriptions
} from "../scripts/item-catalog-service.mjs";
import { adaptedItemSource, ADAPTED_ITEM_NOTICES, itemDescriptionFingerprint } from "../scripts/item-description-format.mjs";
import { hideAdaptedItemSource } from "../scripts/item-source-ui.mjs";

installFoundryUtils();
const { items } = JSON.parse(readFileSync(
  new URL("../data/normalized/items.json", import.meta.url), "utf8"
));
const adaptations = items.filter(item => item.rulesOrigin?.kind === "homebrew-adaptation");

test("the full item catalog has usable English and Spanish descriptions", () => {
  assert.equal(items.length, 366);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  for (const item of items) {
    for (const language of ["en", "es"]) {
      assert.equal(typeof item.description[language], "string", `${item.id}: ${language}`);
      assert.ok(item.description[language].trim(), item.id);
      assert.doesNotMatch(item.description[language], /\[object Object\]|undefined|\ufffd|TODO|FIXME/, item.id);
    }
  }
});

test("all 61 additions have explicit provenance and an accurate automation status", () => {
  const automated = new Set(["odd-incense", "rock-incense", "rose-incense", "sea-incense", "wave-incense", "expert-belt", "punching-glove", "binding-band", "rocky-helmet", "sticky-barb"]);
  assert.equal(adaptations.length, 61);
  assert.equal(adaptations.filter(item => item.type === "held-item").length, 51);
  assert.equal(adaptations.filter(item => item.type === "medicine").length, 10);
  for (const item of adaptations) {
    assert.equal(item.rulesOrigin.automation, automated.has(item.id) ? "automatic" : "manual", item.id);
    assert.equal(item.rulesOrigin.version, "2026-10-17", item.id);
    assert.ok(item.referenceEffect?.trim(), item.id);
    if (item.rulesOrigin.basis === "web-research") {
      assert.ok(item.rulesOrigin.sources.length, item.id);
      for (const source of item.rulesOrigin.sources) {
        assert.equal(new URL(source).hostname, "bulbapedia.bulbagarden.net", item.id);
      }
    } else {
      assert.equal(item.rulesOrigin.basis, "catalog-reference", item.id);
    }
    for (const language of ["en", "es"]) {
      const source = buildPoke5eCatalogItem(item, language);
      assert.doesNotMatch(source.system.description.value, /House rule|Regla casera|this catalog|este catálogo/);
      assert.equal(source.system.source.custom, adaptedItemSource(language));
      assert.doesNotMatch(source.system.description.value, /\[object Object\]|Sin descripción|No Poke5e description/);
      assert.deepEqual(source.flags["poke5e-local"].rulesOrigin, item.rulesOrigin);
      assert.equal(source.effects, undefined);
      assert.equal(source.system.activities, undefined);
    }
  }
  const existing = buildPoke5eCatalogItem(items.find(item => item.id === "charcoal"));
  assert.doesNotMatch(existing.system.description.value, /Regla casera/);
});

function storedItem(id, text = "", kind = "catalog-item") {
  return {
    id, system: { description: { value: text }, quantity: 4, uses: { spent: 2 } },
    getFlag(_moduleId, key) { return { sourceId: id, kind, rulesOrigin: this.rulesOrigin }[key]; }
  };
}

function actorWith(stored) {
  return {
    items: stored, writes: [],
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, "Item");
      this.writes.push(updates);
      for (const update of updates) {
        assert.ok(Object.keys(update).every(key => ["_id", "flags.poke5e-local.referenceEffect",
          "flags.poke5e-local.rulesOrigin", "system.description.value", "system.source.custom"].includes(key)));
        const item = stored.find(entry => entry.id === update._id);
        if (Object.hasOwn(update, "system.description.value")) {
          item.system.description.value = update["system.description.value"];
        }
        if (Object.hasOwn(update, "system.source.custom")) {
          item.system.source = { ...item.system.source, custom: update["system.source.custom"] };
        }
        if (Object.hasOwn(update, "flags.poke5e-local.rulesOrigin")) {
          item.rulesOrigin = update["flags.poke5e-local.rulesOrigin"];
        }
      }
    }
  };
}

test("fills empty descriptions on actors, unlinked tokens and world items, preserving inventory state", async () => {
  const actor = actorWith([
    storedItem("clear-amulet", "<p><em>Sin descripción Poke5e disponible.</em></p>"),
    storedItem("red-card", "Regla propia del GM"),
    storedItem("charcoal"), storedItem("unknown"), storedItem("ability-shield", "", "custom")
  ]);
  const synthetic = actorWith([storedItem("loaded-dice", "<p><br></p>")]);
  const worldItem = storedItem("max-honey", "<p><em>No Poke5e description available.</em></p>");
  let worldWrites = 0;
  globalThis.game = {
    user: { isGM: true }, actors: [actor], items: [worldItem],
    scenes: [{ tokens: [{ actorLink: false, actor: synthetic }, { actorLink: true, actor }] }]
  };
  globalThis.Item = { implementation: {
    async updateDocuments(updates) {
      worldWrites++;
      assert.equal(updates.length, 1);
      worldItem.system.description.value = updates[0]["system.description.value"];
      worldItem.system.source = { custom: updates[0]["system.source.custom"] };
    }
  } };
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 4);
  for (const item of [actor.items[0], synthetic.items[0], worldItem]) {
    assert.doesNotMatch(item.system.description.value, /Regla casera|House rule/);
    assert.equal(item.system.source.custom, adaptedItemSource("es"));
    assert.equal(item.system.quantity, 4);
    assert.equal(item.system.uses.spent, 2);
  }
  assert.equal(actor.items[1].system.description.value, "Regla propia del GM");
  assert.equal(actor.items[2].system.description.value, "");
  assert.equal(actor.items[3].system.description.value, "");
  assert.equal(actor.items[4].system.description.value, "");
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 0);
  assert.equal(worldWrites, 1);
  assert.equal(actor.writes.length, 1);
  assert.equal(synthetic.writes.length, 1);
});

test("updates the former generated prose and moves notices into Source without replacing GM edits", async () => {
  const oldText = "The holder adds its proficiency bonus to psychic-type damage it deals, once per move. Apply the bonus only once across that move's damage parts; it is not extra damage per hit. This follows the same rule as the existing type-boosting held items. The incense is not consumed.";
  const oldBody = `<p>${oldText.replaceAll("'", "&#039;")}</p>`;
  const definition = items.find(item => item.id === "odd-incense");
  assert.ok(definition.rulesOrigin.previousDescriptionHashes.includes(itemDescriptionFingerprint(oldBody)));
  const legacy = storedItem("odd-incense", `<p><em>${ADAPTED_ITEM_NOTICES[0]}</em></p>${oldBody}`);
  const edited = storedItem("red-card", `<p><em>${ADAPTED_ITEM_NOTICES[1]}</em></p><p>Texto del GM.</p>`);
  edited.system.source = { custom: "Campaña del GM" };
  const actor = actorWith([legacy, edited]);
  globalThis.game = { user: { isGM: true }, actors: [actor] };
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 2);
  assert.equal(legacy.system.description.value, buildPoke5eCatalogItem(definition).system.description.value);
  assert.equal(legacy.system.source.custom, adaptedItemSource("es"));
  assert.equal(edited.system.description.value, "<p>Texto del GM.</p>");
  assert.equal(edited.system.source.custom, "Campaña del GM");
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 0);
  edited.system.description.value = "\n<p>Texto del GM.</p>\n";
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 0);
  assert.equal(edited.system.description.value, "\n<p>Texto del GM.</p>\n");
});

test("shows the adapted Source to the GM and removes the Source header for players", () => {
  let removed = 0;
  const html = { querySelectorAll(selector) {
    assert.ok(selector.includes(".source-book"));
    return [{ remove() { removed++; } }];
  } };
  const item = {
    documentName: "Item", system: { source: { custom: adaptedItemSource("es") } },
    getFlag(_moduleId, key) { return key === "rulesOrigin" ? { kind: "homebrew-adaptation" } : null; }
  };
  globalThis.game = { user: { isGM: true } };
  hideAdaptedItemSource({ document: item }, html);
  assert.equal(removed, 0);
  game.user.isGM = false;
  hideAdaptedItemSource({ document: item }, html);
  assert.equal(removed, 1);
  hideAdaptedItemSource({ document: item }, [html]);
  assert.equal(removed, 2);
  item.system.source.custom = "Otro libro";
  hideAdaptedItemSource({ document: item }, html);
  assert.equal(removed, 2);
  hideAdaptedItemSource({ document: { documentName: "Actor" } }, html);
  assert.equal(removed, 2);
});

test("description synchronization never writes as a player", async () => {
  const actor = actorWith([storedItem("clear-amulet")]);
  globalThis.game = { user: { isGM: false }, actors: [actor] };
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 0);
  assert.equal(actor.writes.length, 0);
});

test("existing custom descriptions receive updated automation metadata without being replaced", async () => {
  const definition = items.find(item => item.id === "odd-incense");
  const item = storedItem("odd-incense", "<p>Texto personalizado.</p>");
  item.system.source = { custom: adaptedItemSource("es") };
  item.rulesOrigin = { ...definition.rulesOrigin, automation: "manual" };
  const actor = actorWith([item]);
  globalThis.game = { user: { isGM: true }, actors: [actor] };
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 1);
  assert.equal(item.system.description.value, "<p>Texto personalizado.</p>");
  assert.equal(item.rulesOrigin.automation, "automatic");
  assert.equal(await synchronizeMissingCatalogDescriptions(items), 0);
});
