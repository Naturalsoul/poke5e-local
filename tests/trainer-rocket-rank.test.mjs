import assert from "node:assert/strict";
import test from "node:test";
import { createFlagDocument, installFoundryUtils } from "./helpers/foundry-mocks.mjs";
import { getRocketRank, rejectsRocketRankChange, ROCKET_RANKS } from "../scripts/trainer-rocket-rank.mjs";

installFoundryUtils();
const MODULE_ID = "poke5e-local";

test("a trainer is a Recluta until the GM picks another of the five ranks", () => {
  assert.deepEqual(ROCKET_RANKS.map(rank => rank.es),
    ["Recluta", "Alto Rango Recluta", "Ejecutivo", "Administrador", "Administrador Jefe"]);
  assert.equal(getRocketRank(createFlagDocument()).es, "Recluta");
  assert.equal(getRocketRank(createFlagDocument({ flags: { [MODULE_ID]: { rocketRank: "executive" } } })).es, "Ejecutivo");
  assert.equal(getRocketRank(createFlagDocument({ flags: { [MODULE_ID]: { rocketRank: "boss" } } })).es, "Recluta");
});

test("only a GM may change the rank, whatever the update looks like", () => {
  const player = { isGM: false };
  const gm = { isGM: true };
  assert.equal(rejectsRocketRankChange({ flags: { [MODULE_ID]: { rocketRank: "admin" } } }, player), true);
  assert.equal(rejectsRocketRankChange({ [`flags.${MODULE_ID}.rocketRank`]: "admin" }, player), true);
  assert.equal(rejectsRocketRankChange({ flags: { [MODULE_ID]: { rocketRank: "admin" } } }, gm), false);
  assert.equal(rejectsRocketRankChange({ name: "Seraphina" }, player), false, "other changes go through");
});
