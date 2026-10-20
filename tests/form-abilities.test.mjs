import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
const chat = [];
globalThis.game = { user: { targets: new Set(), id: "gm", isGM: true }, users: { activeGM: null }, settings: { get: () => "es" }, combat: null };
globalThis.ChatMessage = { implementation: { getSpeaker: () => ({}), create: async data => chat.push(data.content) } };
const forms = await import("../scripts/form-ability-engine.mjs");
const field = await import("../scripts/battlefield-service.mjs");

function pokemon(abilityId, { hp = 20, level = 5, str = 14, wis = 8, held = null } = {}) {
  const items = [createAbilityItem(abilityId)];
  if (held) {items.push({ id: "held", documentName: "Item", name: held, getFlag: (_module, key) => ({ kind: "catalog-item", sourceId: held })[key] });}
  items.get = id => items.find(item => item.id === id);
  return createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, name: abilityId, items,
    flags: { [MODULE_ID]: { kind: "pokemon", ...(held ? { heldItemId: "held" } : {}) } },
    system: { abilities: { str: { value: str }, wis: { value: wis } }, details: { level }, attributes: { hp: { value: hp, max: 20 } } } });
}

const keys = actor => forms.wantedForms(actor).map(([abilityId, changes]) => [abilityId, changes.map(change => `${change.key}=${change.value}`)]);

test("Zen Mode below half HP: +4 AC, STR and WIS swapped, Fire/Psychic", () => {
  assert.deepEqual(keys(pokemon("zen-mode", { hp: 15 })), []);
  const statue = pokemon("zen-mode", { hp: 9 });
  assert.deepEqual(keys(statue), [["zen-mode", ["system.attributes.ac.bonus=4", "system.abilities.str.value=8", "system.abilities.wis.value=14"]]]);
  assert.deepEqual(forms.formTypes(statue), ["fire", "psychic"]);
});

test("Multitype follows the Plate, RKS System the Memory; Embody Aspect raises a score to 23", () => {
  assert.deepEqual(forms.formTypes(pokemon("multitype", { held: "flame-plate" })), ["fire"]);
  assert.equal(forms.formTypes(pokemon("multitype")), null);
  assert.deepEqual(forms.formTypes(pokemon("rks-system", { held: "water-memory" })), ["water"]);
  assert.deepEqual(forms.formTypes(pokemon("rks-system")), ["normal"]);
  assert.deepEqual(keys(pokemon("embody-aspect-teal")), [["embody-aspect-teal", ["system.abilities.dex.value=23"]]]);
});

test("Schooling starts at the start of its turn from level 5; Hunger Switch flips each turn", async () => {
  const wishiwashi = pokemon("schooling");
  await forms.processFormAbilitiesStartTurn(wishiwashi);
  assert.equal(keys(wishiwashi)[0][1].length, 4, "School Form: AC, STR, DEX, CON");
  const young = pokemon("schooling", { level: 4 });
  await forms.processFormAbilitiesStartTurn(young);
  assert.deepEqual(keys(young), []);
  const morpeko = pokemon("hunger-switch");
  await forms.processFormAbilitiesStartTurn(morpeko);
  assert.equal(morpeko.getFlag(MODULE_ID, "formSpent")["hunger-switch"], true);
});

test("Teraform Zero clears the weather and the terrain", () => {
  game.combat = { combatants: [{ actor: pokemon("teraform-zero") }],
    getFlag: () => ({ weather: { id: "rain" }, terrain: { id: "grassy" } }) };
  assert.deepEqual(field.activeWeathers(), []);
  assert.equal(field.activeTerrain(), null);
  game.combat = null;
});

test("Protean, Libero and Color Change take the type they were given; Stakeout marks the replacement", async () => {
  const greninja = pokemon("protean");
  await greninja.setFlag(MODULE_ID, "shiftedType", "water");
  assert.deepEqual(forms.formTypes(greninja), ["water"]);
  const other = pokemon("static");
  await other.setFlag(MODULE_ID, "shiftedType", "water");
  assert.equal(forms.formTypes(other), null, "only with the Ability");
  const { staked } = await import("../scripts/rider-ability-engine.mjs");
  const gumshoos = pokemon("stakeout");
  const replacement = pokemon("static");
  game.combat = { round: 3, combatants: [] };
  await gumshoos.setFlag(MODULE_ID, "stakeout", { target: replacement.uuid, round: 3 });
  assert.equal(staked(gumshoos, replacement), true);
  game.combat.round = 4;
  assert.equal(staked(gumshoos, replacement), false, "it lasts until the round after the switch");
  game.combat = null;
});

test("Shields Down blocks every non-volatile status in Meteor Form, Paralysis included", () => {
  globalThis.ui = { notifications: { info() {} } };
  const minior = pokemon("shields-down");
  const status = id => ({ parent: minior, getFlag: (_module, key) => ({ kind: "pokemon-status", status: id })[key] });
  minior.documentName = "Actor";
  assert.equal(forms.onPreCreateEffect(status("paralysis")), false);
  assert.equal(forms.onPreCreateEffect(status("asleep")), false);
  assert.equal(forms.onPreCreateEffect(status("confused")), true, "volatile");
});
