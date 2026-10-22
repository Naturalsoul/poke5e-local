import { MOVE_COVERAGE } from "./move-coverage.mjs";

/* ============================================================
 * MANUAL MOVE NOTICE
 *
 * The usage card of a Move the module does not fully resolve says so, so nobody waits for an effect
 * that never comes: pending and manual Moves are "not automated", automated ones with a GM note are
 * "partly automated", with the note (English, from move-coverage.mjs). Only the GM sees it.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const NOTICE_CLASS = "poke5e-coverage-notice";

const LABELS = {
  es: { manual: "Su efecto especial no está automatizado: lo resuelve el DM.",
    partial: "Automatizado en parte: el resto lo resuelve el DM." },
  en: { manual: "Its special effect is not automated: the GM resolves it.",
    partial: "Partly automated: the GM resolves the rest." }
};

// What the usage card of this Move must warn about, or null.
export function coverageNotice(moveId) {
  const coverage = MOVE_COVERAGE[moveId];
  if (["pending", "manual"].includes(coverage?.status)) {return { kind: "manual", note: coverage.note ?? null };}
  return coverage?.status === "automated" && coverage.note ? { kind: "partial", note: coverage.note } : null;
}

function onRenderChatMessage(message, html) {
  if (!game.user.isGM || message.type !== "usage" || !html?.append || html.querySelector?.(`.${NOTICE_CLASS}`)) {return;}
  const item = message.getAssociatedItem?.();
  const notice = item?.getFlag?.(MODULE_ID, "kind") === "move" ? coverageNotice(item.getFlag(MODULE_ID, "sourceId")) : null;
  if (!notice) {return;}
  const element = document.createElement("p");
  element.className = NOTICE_CLASS;
  element.textContent = LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"][notice.kind];
  if (notice.note) {
    const note = document.createElement("small");
    note.textContent = notice.note;
    element.append(note);
  }
  html.append(element);
}

export function registerMoveCoverageNotice() {
  Hooks.on("dnd5e.renderChatMessage", onRenderChatMessage);
}
