const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ENTITIES[character]);
}

const ACTIVE_TAGS = "script, iframe, object, embed, base, meta";

/**
 * Removes what could run code from chat HTML: script-like tags, on* handlers and javascript: URLs. Names typed by
 * players reach the module's chat cards unescaped. Anything else is left as written, and clean HTML comes back
 * unchanged so dnd5e's own cards are never rewritten.
 */
export function stripActiveHtml(html, parse = text => new DOMParser().parseFromString(text, "text/html")) {
  if (typeof html !== "string" || !html.includes("<")) {return html;}
  const body = parse(`<body>${html}</body>`).body;
  let changed = false;
  for (const node of body.querySelectorAll(ACTIVE_TAGS)) {
    node.remove();
    changed = true;
  }
  for (const node of body.querySelectorAll("*")) {
    for (const { name, value } of [...node.attributes]) {
      // Browsers ignore tabs and line breaks inside a URL scheme, so "java\tscript:" still runs.
      if (/^on/i.test(name) || /^javascript:/i.test([...value].filter(character => character > " ").join(""))) {
        node.removeAttribute(name);
        changed = true;
      }
    }
  }
  return changed ? body.innerHTML : html;
}

function onPreCreateChatMessage(message) {
  const changes = {};
  for (const key of ["content", "flavor"]) {
    const clean = stripActiveHtml(message[key]);
    if (clean !== message[key]) {changes[key] = clean;}
  }
  if (Object.keys(changes).length) {message.updateSource(changes);}
}

export function registerChatHtmlGuard() {
  Hooks.on("preCreateChatMessage", onPreCreateChatMessage);
}
