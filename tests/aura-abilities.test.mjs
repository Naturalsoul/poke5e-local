import assert from "node:assert/strict";
import test from "node:test";
import { createAbilityItem, createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";
globalThis.game = { user: { targets: new Set(), id: "gm", isGM: true }, users: { activeGM: null }, settings: { get: () => "es" }, combat: null };
globalThis.canvas = { grid: { measurePath: ([from, to]) => ({ distance: Math.abs(from.x - to.x) }) } };
const auras = await import("../scripts/aura-ability-engine.mjs");
const { hasPokemonAbility } = await import("../scripts/status-runtime.mjs");

function pokemon(abilityId, { x = 0, side = 1, types = ["normal"], cha = 0, level = 5 } = {}) {
  const actor = createFlagDocument({ uuid: `Actor.${abilityId}-${Math.random()}`, name: abilityId, items: [createAbilityItem(abilityId)],
    flags: { [MODULE_ID]: { kind: "pokemon", types } },
    system: { abilities: { cha: { mod: cha } }, details: { level }, attributes: { hp: { value: 20, max: 20 } } } });
  actor.getActiveTokens = () => [{ center: { x }, document: { disposition: side } }];
  return actor;
}

const fight = (...actors) => { game.combat = { combatants: actors.map(actor => ({ actor })) }; };

test("attack auras: Victory Star, Plus and Minus, Costar, Supersweet Syrup", () => {
  const plus = pokemon("plus");
  const minus = pokemon("minus", { x: 100 });
  const star = pokemon("victory-star", { x: 200 });
  const foe = pokemon("supersweet-syrup", { x: 10, side: -1 });
  fight(plus, minus, star, foe);
  assert.equal(auras.auraAttackBonus(plus), 3);
  assert.equal(auras.auraAttackBonus(foe), 0, "Victory Star helps only its side");
  assert.equal(auras.syrupBonus([plus]), "1d4");
  assert.equal(auras.syrupBonus([star]), null, "too far from the syrup");
  const costar = pokemon("costar", { x: 5 });
  fight(plus, costar);
  assert.equal(auras.auraAdvantage(costar), true);
});

test("damage auras: Battery, Power Spot, Steely Spirit, Fairy Aura and Aura Break", () => {
  const user = pokemon("static");
  fight(user, pokemon("battery", { x: 15 }), pokemon("power-spot", { x: 10, level: 10 }), pokemon("steely-spirit", { x: 25, cha: 3 }));
  assert.deepEqual(auras.auraDamage(user, "electric"), { flat: 0, dice: "1d8", doubleDice: true });
  assert.equal(auras.auraDamage(user, "steel").flat, 3);
  fight(pokemon("fairy-aura", { side: -1 }));
  assert.equal(auras.auraDamageMultiplier("fairy"), 2);
  assert.equal(auras.auraDamageMultiplier("dark"), 1);
  fight(pokemon("fairy-aura", { side: -1 }), pokemon("aura-break"));
  assert.equal(auras.auraDamageMultiplier("fairy"), 0.5);
});

test("Telepathy, the veils, Aroma Veil and Screen Cleaner", () => {
  const mind = pokemon("telepathy");
  const ally = pokemon("static", { x: 10 });
  const flower = pokemon("flower-veil", { x: 10 });
  fight(mind, ally, flower, pokemon("sweet-veil", { x: 300 }));
  assert.equal(auras.telepathyBlocks(mind, ally), true);
  assert.equal(auras.auraBlocksStatus(pokemon("static", { types: ["grass"] }), "burned", ["grass"]), null, "not in the combat");
  assert.equal(auras.auraBlocksStatus(ally, "burned", ["grass"]), "flower-veil");
  assert.equal(auras.auraBlocksStatus(ally, "asleep", ["fire"]), null, "Sweet Veil is too far");
  fight(ally, pokemon("aroma-veil", { x: 15 }), pokemon("screen-cleaner", { side: -1 }));
  assert.equal(auras.aromaVeilPasses(ally, "wis"), true);
  assert.equal(auras.aromaVeilPasses(ally, "dex"), false);
  assert.equal(auras.screenCleaned("reflect"), true);
});

test("Ruin lowers everyone else's score; Armor Tail and Dazzling; Neutralizing Gas", () => {
  const chien = pokemon("sword-of-ruin");
  const target = pokemon("static", { side: -1 });
  fight(chien, target, pokemon("armor-tail"));
  assert.deepEqual(auras.ruinChanges(target).map(change => change.key), ["system.abilities.con.value"]);
  assert.deepEqual(auras.ruinChanges(chien), [], "a Ruin holder is spared");
  assert.equal(auras.bonusActionAura(target), "armor-tail");
  const gas = pokemon("neutralizing-gas", { side: -1 });
  fight(chien, gas);
  assert.equal(hasPokemonAbility(chien, "sword-of-ruin"), false);
  assert.equal(hasPokemonAbility(gas, "neutralizing-gas"), true);
  game.combat = null;
  assert.equal(hasPokemonAbility(chien, "sword-of-ruin"), true, "outside the combat");
});
