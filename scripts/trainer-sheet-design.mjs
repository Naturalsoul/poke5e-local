/* ============================================================
 * TRAINER SHEET DESIGN
 *
 * The GM picks the trainer sheet for the whole table. "classic" is
 * the sheet built on top of dnd5e's look (trainer-actor-sheet.mjs);
 * the pixel designs are trainer-pixel-sheet.mjs, and "rocket" only
 * recolours "pc". Once the pixel sheet has been played enough, the
 * classic one goes away by removing its entry here.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "trainerSheetDesign";

export const TRAINER_SHEET_DESIGNS = Object.freeze({
  classic: { es: "Clásica", en: "Classic", sheet: "TrainerActorSheet" },
  pc: { es: "Pixel Base", en: "Pixel Base", sheet: "TrainerPixelSheet" },
  rocket: { es: "Pixel Team Rocket", en: "Pixel Team Rocket", sheet: "TrainerPixelSheet" }
});

export function currentTrainerSheetDesign() {
  const design = game.settings.get(MODULE_ID, SETTING);
  return TRAINER_SHEET_DESIGNS[design] ? design : "classic";
}

export function trainerSheetClassId(design = currentTrainerSheetDesign()) {
  return `${MODULE_ID}.${(TRAINER_SHEET_DESIGNS[design] ?? TRAINER_SHEET_DESIGNS.classic).sheet}`;
}

export function registerTrainerSheetDesign() {
  const lang = game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
  game.settings.register(MODULE_ID, SETTING, {
    name: lang === "en" ? "Poke5e - Trainer sheet" : "Poke5e - Hoja de entrenador",
    hint: lang === "en" ? "The Pixel ones are a new, smaller sheet with Pokémon, Details and Features; items are in the Bag. Applies to everyone and reloads the world."
      : "Las Pixel son una hoja nueva y más pequeña con Pokémon, Detalles y Rasgos; los objetos están en la Mochila. Se aplica a todos y recarga el mundo.",
    scope: "world", config: true, type: String, default: "classic", requiresReload: true,
    choices: Object.fromEntries(Object.entries(TRAINER_SHEET_DESIGNS).map(([id, design]) => [id, design[lang]]))
  });
}
