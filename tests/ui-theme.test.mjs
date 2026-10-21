import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyUiTheme, registerUiTheme, UI_THEMES } from "../scripts/ui-theme.mjs";

const css = readFileSync(new URL("../styles/theme.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = selector => {
  const start = css.indexOf(selector);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--poke5e-ui-([a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
};
const root = tokens(":root {");
const themes = {
  slate: root,
  ...Object.fromEntries(Object.keys(UI_THEMES).filter(id => id !== "slate")
    .map(id => [id, tokens(`body.poke5e-theme-${id},`)]))
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

test("every theme redefines every colour token", () => {
  const colours = Object.keys(root).filter(name => !name.startsWith("text-"));
  for (const [id, set] of Object.entries(themes)) {
    assert.deepEqual(colours.filter(name => !set[name]), [], `${id} misses tokens`);
  }
});

test("text stays readable on the panels of every theme", () => {
  for (const [id, set] of Object.entries(themes)) {
    for (const surface of ["bg", "surface", "panel", "panel-alt"]) {
      for (const [ink, minimum] of [["text", 4.5], ["muted", 4.5], ["cream", 4.5], ["accent", 3]]) {
        const ratio = contrast(set[ink], set[surface]);
        assert.ok(ratio >= minimum, `${id}: ${ink} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("the setting puts exactly one theme class on <body>, slate for an unknown one", () => {
  const classes = new Set(["poke5e-theme-rocket", "foundry"]);
  const body = { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } };
  applyUiTheme("emerald", body);
  assert.deepEqual([...classes].sort(), ["foundry", "poke5e-theme-emerald"]);
  applyUiTheme("neon", body);
  assert.deepEqual([...classes].sort(), ["foundry", "poke5e-theme-slate"]);
});

test("changing the setting applies the theme: Foundry calls onChange(value, options)", () => {
  const classes = new Set();
  globalThis.document = { body: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } } };
  const registered = {};
  globalThis.game = { settings: {
    get: (_module, key) => (key === "language" ? "es" : "slate"),
    register: (_module, key, config) => { registered[key] = config; }
  } };
  registerUiTheme();
  registered.uiTheme.onChange("rocket", { render: true });
  assert.ok(classes.has("poke5e-theme-rocket"));
  assert.ok(!classes.has("poke5e-theme-slate"));
});
