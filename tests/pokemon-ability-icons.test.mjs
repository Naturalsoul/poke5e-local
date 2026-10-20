import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { POKEMON_ABILITY_ICON_PATHS, pokemonAbilityIcon, refreshPokemonAbilityIcons } from "../scripts/pokemon-ability-icons.mjs";

const FOUNDRY_PUBLIC = "G:/Foundry/Foundry Virtual Tabletop/resources/app/public/";

test("every Pokémon Ability has an icon", () => {
  const { items } = JSON.parse(readFileSync(new URL("../data/normalized/abilities.json", import.meta.url), "utf8"));
  assert.ok(items.length >= 300);
  assert.deepEqual(items.map(ability => ability.id).filter(id => !pokemonAbilityIcon(id)), []);
  assert.equal(pokemonAbilityIcon("static"), "icons/magic/lightning/bolt-strike-sparks-teal.webp");
  assert.equal(pokemonAbilityIcon("unknown"), null);
});

test("existing Pokémon swap only the default aura icon", async () => {
  const item = (id, sourceId, img) => ({ id, img, getFlag: (_module, key) => ({ kind: "ability", sourceId })[key] });
  let updates = null;
  const actor = { items: [item("a", "static", "icons/svg/aura.svg"), item("b", "blaze", "custom.webp"), item("c", "unknown", "icons/svg/aura.svg")],
    updateEmbeddedDocuments: async (_type, data) => { updates = data; } };
  await refreshPokemonAbilityIcons(actor);
  assert.deepEqual(updates, [{ _id: "a", img: "icons/magic/lightning/bolt-strike-sparks-teal.webp" }]);
});

test("icon files exist in the Foundry install", { skip: !existsSync(FOUNDRY_PUBLIC) }, () => {
  assert.deepEqual(POKEMON_ABILITY_ICON_PATHS.filter(path => !existsSync(FOUNDRY_PUBLIC + path)), []);
});
