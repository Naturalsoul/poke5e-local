import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, stripActiveHtml } from "../scripts/html.mjs";

test("escapeHtml turns markup into text", () => {
  assert.equal(escapeHtml(`<b a="1">Tom & 'Jerry'</b>`), "&lt;b a=&quot;1&quot;&gt;Tom &amp; &#039;Jerry&#039;&lt;/b&gt;");
  assert.equal(escapeHtml(null), "");
});

// Node has no HTML parser: a flat stand-in with the few calls stripActiveHtml makes.
function fakeParse(nodes) {
  const all = nodes.map(([tagName, attributes]) => ({
    tagName, attributes: Object.entries(attributes).map(([name, value]) => ({ name, value })), removed: false,
    remove() { this.removed = true; },
    removeAttribute(name) { this.attributes = this.attributes.filter(each => each.name !== name); }
  }));
  const live = () => all.filter(node => !node.removed);
  const body = {
    querySelectorAll: selector => (selector === "*" ? live() : live().filter(node => selector.split(", ").includes(node.tagName))),
    get innerHTML() {
      return live().map(node => `<${node.tagName}${node.attributes.map(({ name, value }) => ` ${name}="${value}"`).join("")}>`).join("");
    }
  };
  return () => ({ body });
}

test("stripActiveHtml removes handlers, javascript: links and script tags", () => {
  const parse = fakeParse([["strong", { class: "name" }], ["img", { src: "x", onerror: "alert(1)" }],
    ["a", { href: "java\tscript:alert(1)" }], ["script", {}]]);
  assert.equal(stripActiveHtml("<strong>…", parse), `<strong class="name"><img src="x"><a>`);
});

test("stripActiveHtml leaves safe HTML exactly as written", () => {
  const html = `<div  class='card'><button data-action="x">Ok</button></div>`;
  assert.equal(stripActiveHtml(html, fakeParse([["div", { class: "card" }], ["button", { "data-action": "x" }]])), html);
  assert.equal(stripActiveHtml("plain text", () => assert.fail("text without tags is not parsed")), "plain text");
  assert.equal(stripActiveHtml(undefined), undefined);
});
