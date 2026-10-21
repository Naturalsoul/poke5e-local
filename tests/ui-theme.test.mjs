import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applySheetDesign, registerSheetDesign } from "../scripts/ui-theme.mjs";

const read = file => readFileSync(new URL(`../styles/${file}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = read("theme.css");
const tokens = selector => {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `${selector} is missing`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--poke5e-ui-([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
};
const root = tokens(":root {");
const palettes = {
  "rocket (slate windows)": root,
  "rocket (trainer windows)": { ...root, ...tokens(".poke5e-trainer-sheet,\n.poke5e-trainer-party-dialog {") },
  "dnd5e light": tokens("body.poke5e-design-dnd5e,"),
  "dnd5e dark": tokens("body.poke5e-design-dnd5e.theme-dark,")
};

const luminance = hex => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

test("both dnd5e palettes redefine every colour token", () => {
  const colours = Object.keys(root).filter(name => !name.startsWith("text-"));
  for (const id of ["dnd5e light", "dnd5e dark"]) {
    assert.deepEqual(colours.filter(name => !palettes[id][name]), [], `${id} misses tokens`);
  }
});

test("text stays readable on the panels of every design", () => {
  for (const [id, set] of Object.entries(palettes)) {
    for (const surface of ["bg", "surface", "panel"]) {
      for (const [ink, minimum] of [["text", 4.5], ["muted", 4.5], ["cream", 4.5], ["accent", 3]]) {
        const ratio = contrast(set[ink], set[surface]);
        assert.ok(ratio >= minimum, `${id}: ${ink} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("the trainer sheet's Rocket skin of dnd5e's own parts is off in the dnd5e design", () => {
  const trainer = read("trainer.css");
  const skin = [...trainer.matchAll(/([^{}]*)\{[^{}]*\}/g)].map(([, selector]) => selector.trim())
    .filter(selector => selector && !selector.startsWith("@"))
    .flatMap(selector => selector.split(/,(?![^()]*\))/).map(part => part.trim()))
    .filter(part => /poke5e-trainer-sheet/.test(part) && !/\.poke5e-/.test(part.replace(/^[\s\S]*?poke5e-trainer-sheet/, "")));
  const ungated = skin.filter(part => !part.startsWith(":where(body:not(.poke5e-design-dnd5e))"));
  // Only the rule that keeps the --poke5e-* variables the module's panels read.
  assert.deepEqual(ungated, [".dnd5e2.sheet.actor.character.poke5e-trainer-sheet"]);
  const shared = trainer.slice(trainer.indexOf(`${ungated[0]} {`));
  assert.doesNotMatch(shared.slice(0, shared.indexOf("}")), /(^|[;{]\s*)(?!--poke5e-)[a-z-]+\s*:/);
});

test("the setting puts exactly one design class on <body>, Team Rocket for an unknown one", () => {
  const classes = new Set(["poke5e-design-dnd5e", "foundry"]);
  const body = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  applySheetDesign("rocket", body);
  assert.deepEqual([...classes].sort(), ["foundry", "poke5e-design-rocket"]);
  applySheetDesign("dnd5e", body);
  assert.deepEqual([...classes].sort(), ["foundry", "poke5e-design-dnd5e"]);
  applySheetDesign("firered", body);
  assert.deepEqual([...classes].sort(), ["foundry", "poke5e-design-rocket"]);
});

test("changing the setting applies the design: Foundry calls onChange(value, options)", () => {
  const classes = new Set();
  globalThis.document = { body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } } };
  const registered = {};
  globalThis.game = { settings: {
    get: (_module, key) => (key === "language" ? "es" : "rocket"),
    register: (_module, key, config) => { registered[key] = config; }
  } };
  registerSheetDesign();
  registered.sheetDesign.onChange("dnd5e", { render: true });
  assert.ok(classes.has("poke5e-design-dnd5e"));
  assert.ok(!classes.has("poke5e-design-rocket"));
});
