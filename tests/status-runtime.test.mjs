import test from "node:test";
import assert from "node:assert/strict";
import {
  activePokemonAbilityId,
  hasEffectiveStatus,
  hasPokemonAbility,
  hasPokemonStatus,
  hasStatusImmunityAbility,
  pokemonTypes
} from "../status-runtime.mjs";
import {
  createAbilityItem,
  createFlagDocument
} from "./helpers/foundry-mocks.mjs";

const MODULE_ID = "poke5e-local";

test("Comatose counts as effective Asleep without creating Asleep", () => {
  const actor = createFlagDocument({
    items: [createAbilityItem("comatose")]
  });

  assert.equal(hasPokemonStatus(actor, "asleep"), false);
  assert.equal(hasEffectiveStatus(actor, "asleep"), true);
  assert.equal(hasStatusImmunityAbility(actor, "asleep"), true);
});

test("Inner Focus grants Flinched immunity", () => {
  const actor = createFlagDocument({
    items: [createAbilityItem("inner-focus")]
  });

  assert.equal(hasStatusImmunityAbility(actor, "flinched"), true);
});

test("explicit activeAbilityId resolves ambiguity", () => {
  const actor = createFlagDocument({
    flags: {
      [MODULE_ID]: {
        activeAbilityId: "torrent",
        types: ["water"]
      }
    },
    items: [
      createAbilityItem("torrent"),
      createAbilityItem("rain-dish")
    ]
  });

  assert.equal(activePokemonAbilityId(actor), "torrent");
  assert.equal(hasPokemonAbility(actor, "torrent"), true);
  assert.deepEqual(pokemonTypes(actor), ["water"]);
});
