/* ============================================================
 * SHEET DESIGN
 *
 * Each player picks the design of the module's sheets, so the look
 * can follow the campaign. A design is a class on <body>
 * (poke5e-design-<id>): "rocket" is the module's own look, "dnd5e"
 * gives back dnd5e's sheet and recolours the module's panels with
 * its colours (styles/theme.css, styles/trainer.css).
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "sheetDesign";

export const SHEET_DESIGNS = Object.freeze({
  rocket: { es: "Team Rocket", en: "Team Rocket" },
  dnd5e: { es: "D&D 5e (el de la hoja por defecto)", en: "D&D 5e (the default sheet)" }
});

export function applySheetDesign(design, body = document.body) {
  const chosen = SHEET_DESIGNS[design] ? design : "rocket";
  for (const id of Object.keys(SHEET_DESIGNS)) {body.classList.toggle(`poke5e-design-${id}`, id === chosen);}
}

export function registerSheetDesign() {
  const lang = game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
  game.settings.register(MODULE_ID, SETTING, {
    name: lang === "en" ? "Poke5e - Sheet design" : "Poke5e - Diseño de las hojas",
    hint: lang === "en" ? "Look of the module's sheets and windows. Only for you."
      : "Aspecto de las hojas y ventanas del módulo. Solo para ti.",
    scope: "client", config: true, type: String, default: "rocket",
    choices: Object.fromEntries(Object.entries(SHEET_DESIGNS).map(([id, labels]) => [id, labels[lang]])),
    // Foundry passes (value, options): only the value is ours.
    onChange: design => applySheetDesign(design)
  });
  applySheetDesign(game.settings.get(MODULE_ID, SETTING));
}
