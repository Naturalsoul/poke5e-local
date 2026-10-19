import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { TRAINER_FEATURE_ICON_PATHS, trainerFeatureIcon } from "../scripts/trainer-feature-icons.mjs";
import { TRAINER_ORIGINS, TRAINER_PATHS, TRAINER_SPECIALIZATIONS } from "../scripts/trainer-rules.mjs";

const FOUNDRY_PUBLIC = "G:/Foundry/Foundry Virtual Tabletop/resources/app/public/";

test("every origin, specialization, path and path feature has an icon", () => {
  const featureIds = [...readFileSync(new URL("../scripts/trainer-feature-service.mjs", import.meta.url), "utf8")
    .matchAll(/^\s+id:\s*\n?\s*"([a-z-]+)",/gm)].map(match => match[1]);
  assert.ok(featureIds.length >= 33);
  const ids = [TRAINER_ORIGINS, TRAINER_SPECIALIZATIONS, TRAINER_PATHS].flatMap(group => Object.values(group).map(entry => entry.id));
  const missing = [...ids, ...featureIds].filter(id => !trainerFeatureIcon(id));
  assert.deepEqual(missing, []);
  assert.equal(trainerFeatureIcon("unknown", "epic-boon"), "icons/commodities/treasure/crown-gold-laurel-wreath.webp");
});

test("icon files exist in the Foundry install", { skip: !existsSync(FOUNDRY_PUBLIC) }, () => {
  assert.deepEqual(TRAINER_FEATURE_ICON_PATHS.filter(path => !existsSync(FOUNDRY_PUBLIC + path)), []);
});
