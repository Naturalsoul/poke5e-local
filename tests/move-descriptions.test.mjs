import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installFoundryUtils, MockRoll } from "./helpers/foundry-mocks.mjs";
import { buildMoveCatalogItem, buildMoveItem } from "../scripts/builder.mjs";

installFoundryUtils();
Math.clamp = (value, min, max) => Math.min(max, Math.max(min, value));
globalThis.Roll = MockRoll;
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2, MULTIPLY: 1 } };

const { moves } = JSON.parse(readFileSync(
  new URL("../data/normalized/moves.json", import.meta.url), "utf8"
));
const pokemon = {
  id: "test-pokemon",
  name: { en: "Test", es: "Prueba" },
  types: ["normal"],
  combat: { attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }
};

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

for (const language of ["es", "en"]) {
  test(`all canonical moves retain their description, tables and scaling in ${language}`, () => {
    for (const move of moves) {
      const label = `${move.id} (${language})`;
      assert.ok(move.name[language]?.trim(), label);
      assert.ok(move.description[language]?.length, label);
      const catalog = buildMoveCatalogItem(move, language);
      const item = buildMoveItem(move, pokemon, 1, language);
      const html = catalog.system.description.value;
      assert.equal(item.system.description.value, html, label);
      assert.doesNotMatch(html, /\[object Object\]|undefined|\ufffd|\u00c3.|\u00c2.|\u00e2\u20ac/, label);

      const tables = [];
      for (const block of move.description[language]) {
        if (typeof block === "string") {
          assert.ok(block.trim(), label);
          assert.ok(html.includes(escapeHtml(block).replace(/\n/g, "<br>")), label);
          continue;
        }
        assert.equal(block.type, "table", label);
        tables.push(block);
        assert.ok(block.headers.length && block.rows.length, label);
        for (const header of block.headers) {
          assert.ok(html.includes(`<th>${escapeHtml(header)}</th>`), label);
        }
        for (const row of block.rows) {
          assert.equal(row.length, block.headers.length, label);
          for (const cell of row) {
            assert.equal(typeof cell, "string", label);
            assert.ok(html.includes(`<td>${escapeHtml(cell)}</td>`), label);
          }
        }
      }
      assert.equal((html.match(/<table>/g) ?? []).length, tables.length, label);
      const higher = move.higherLevels[language] ?? move.higherLevels.en ?? move.higherLevels.es;
      if (higher) {
        assert.ok(html.includes(escapeHtml(higher)), label);
      }
    }
  });
}

test("mixed descriptions escape table cells and preserve paragraph order and language fallback", () => {
  const move = structuredClone(moves[0]);
  move.description = { en: [
    "Before\nsecond line\n\nNext paragraph",
    { type: "table", headers: ["<Header>"], rows: [["<script> & text"]] },
    "After"
  ] };
  move.higherLevels = { en: "Stronger <damage>" };
  const html = buildMoveCatalogItem(move, "es").system.description.value;
  assert.equal(html,
    "<p>Before<br>second line</p><p>Next paragraph</p>" +
    "<table><thead><tr><th>&lt;Header&gt;</th></tr></thead>" +
    "<tbody><tr><td>&lt;script&gt; &amp; text</td></tr></tbody></table>" +
    "<p>After</p><p><strong>Niveles superiores:</strong> Stronger &lt;damage&gt;</p>"
  );
});

test("unknown description objects never become object coercion artifacts", () => {
  const move = structuredClone(moves[0]);
  move.description = { es: ["Text", { unexpected: true }, null] };
  assert.equal(buildMoveCatalogItem(move, "es").system.description.value.split("<p><strong>")[0], "<p>Text</p>");
});
