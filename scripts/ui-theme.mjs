/* ============================================================
 * UI THEME
 *
 * Each player picks the look of the module's windows. A theme is
 * a class on <body> (poke5e-theme-<id>) that redefines the shared
 * colour tokens of styles/theme.css.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "uiTheme";

export const UI_THEMES = Object.freeze({
  slate: { es: "Pizarra (el de siempre)", en: "Slate (the usual one)" },
  rocket: { es: "Team Rocket", en: "Team Rocket" },
  firered: { es: "Rojo Fuego", en: "FireRed" },
  emerald: { es: "Esmeralda", en: "Emerald" }
});

export function applyUiTheme(theme, body = document.body) {
  const chosen = UI_THEMES[theme] ? theme : "slate";
  for (const id of Object.keys(UI_THEMES)) {body.classList.toggle(`poke5e-theme-${id}`, id === chosen);}
}

export function registerUiTheme() {
  const lang = game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
  game.settings.register(MODULE_ID, SETTING, {
    name: lang === "en" ? "Poke5e - Theme" : "Poke5e - Tema",
    hint: lang === "en" ? "Colours of the module's windows (sheets, planner, Fakemon Studio). Only for you."
      : "Colores de las ventanas del módulo (fichas, planificador, Fakemon Studio). Solo para ti.",
    scope: "client", config: true, type: String, default: "slate",
    choices: Object.fromEntries(Object.entries(UI_THEMES).map(([id, labels]) => [id, labels[lang]])),
    onChange: applyUiTheme
  });
  applyUiTheme(game.settings.get(MODULE_ID, SETTING));
}
