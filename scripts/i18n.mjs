const MODULE_ID = "poke5e-local";

// Falls back to Spanish before the setting is registered (early init, tests).
export function getLanguage() {
  try {
    return game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}
