import { groundSprite, staticSpriteSource } from "./pokemon-pc-boxes.mjs";

/* ============================================================
 * POKÉMON SHEET DESIGN
 *
 * The pixel designs keep the classic sheet's markup and actions and
 * only move its panels into tabs, next to a PC-style card; "rocket"
 * recolours "pc" (Pixel Base). The GM picks the design for the whole
 * table; the classic one stays available.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "pokemonSheetDesign";
const FALLBACK_SPRITE = "icons/svg/mystery-man.svg";

export const POKEMON_SHEET_DESIGNS = Object.freeze({
  classic: { es: "Clásica", en: "Classic", size: { width: 900, height: 780 } },
  pc: { es: "Pixel Base", en: "Pixel Base", size: { width: 860, height: 620 } },
  rocket: { es: "Pixel Team Rocket", en: "Pixel Team Rocket", size: { width: 860, height: 620 } }
});

const PC_TABS = Object.freeze([
  {
    id: "combat", es: "Combate", en: "Combat",
    panels: [".poke5e-pokemon-panel--concentration", ".poke5e-pokemon-panel--statuses", ".poke5e-pokemon-panel--moves"]
  },
  {
    id: "stats", es: "Estadísticas", en: "Stats",
    panels: [".poke5e-pokemon-panel:has(.poke5e-pokemon-stats)", ".poke5e-pokemon-panel:has(.poke5e-pokemon-battle-grid)", ".poke5e-pokemon-panel--skills"]
  },
  {
    id: "info", es: "Datos", en: "Info",
    panels: [".poke5e-pokemon-panel--ability", ".poke5e-pokemon-panel--held-item", ".poke5e-pokemon-panel--matchups"]
  }
]);

// The sheet rebuilds on every actor change, so the open tab has to outlive the DOM.
const openTabs = new Map();

export function currentPokemonSheetDesign() {
  const design = game.settings.get(MODULE_ID, SETTING);
  return POKEMON_SHEET_DESIGNS[design] ? design : "classic";
}

export function pokemonSheetSize() {
  return POKEMON_SHEET_DESIGNS[currentPokemonSheetDesign()].size;
}

function openPokemonSheets() {
  return [...foundry.applications.instances.values()].filter(app => app.options?.classes?.includes("poke5e-pokemon-sheet"));
}

export function registerPokemonSheetDesign() {
  const lang = game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
  game.settings.register(MODULE_ID, SETTING, {
    name: lang === "en" ? "Poke5e - Pokémon sheet" : "Poke5e - Hoja de Pokémon",
    hint: lang === "en" ? "Classic shows everything at once. The Pixel ones are smaller and group the panels in tabs. Applies to everyone."
      : "La clásica muestra todo a la vez. Las Pixel son más pequeñas y agrupan los paneles en pestañas. Se aplica a todos.",
    scope: "world", config: true, type: String, default: "classic",
    choices: Object.fromEntries(Object.entries(POKEMON_SHEET_DESIGNS).map(([id, design]) => [id, design[lang]])),
    onChange: () => {
      for (const sheet of openPokemonSheets()) {
        sheet.setPosition(pokemonSheetSize());
        sheet.render();
      }
    }
  });
}

function selectTab(root, id) {
  for (const button of root.querySelectorAll("[data-pc-tab-button]")) {
    button.setAttribute("aria-pressed", String(button.dataset.pcTabButton === id));
  }
  for (const panel of root.querySelectorAll("[data-pc-tab]")) {
    panel.hidden = panel.dataset.pcTab !== id;
  }
}

function usePcSprite(root, pokemon) {
  const image = root.querySelector(".poke5e-pokemon-summary__portrait img");
  if (!image) {return;}
  const fallback = pokemon.img && !/\.webm$/i.test(pokemon.img) ? pokemon.img : FALLBACK_SPRITE;
  image.addEventListener("load", () => groundSprite(image));
  image.addEventListener("error", () => {
    const next = image.getAttribute("src") === fallback ? FALLBACK_SPRITE : fallback;
    if (next !== image.getAttribute("src")) {image.src = next;}
  });
  image.src = staticSpriteSource(pokemon) ?? fallback;
}

export function applyPcLayout(root, pokemon, language) {
  root.classList.add("poke5e-pokemon-summary--pc");
  root.classList.toggle("poke5e-pokemon-summary--rocket", currentPokemonSheetDesign() === "rocket");
  const dashboard = root.querySelector(".poke5e-pokemon-summary__dashboard");
  const nav = document.createElement("nav");
  nav.className = "poke5e-pokemon-pc-tabs";
  const panels = PC_TABS.map(tab => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.pcTabButton = tab.id;
    button.textContent = tab[language] ?? tab.es;
    nav.append(button);
    const panel = document.createElement("div");
    panel.className = "poke5e-pokemon-pc-panel";
    panel.dataset.pcTab = tab.id;
    panel.append(...tab.panels.flatMap(selector => [...dashboard.querySelectorAll(selector)]));
    return panel;
  });
  dashboard.replaceChildren(nav, ...panels);
  nav.addEventListener("click", event => {
    const id = event.target.closest("[data-pc-tab-button]")?.dataset.pcTabButton;
    if (!id) {return;}
    openTabs.set(pokemon.uuid, id);
    selectTab(root, id);
  });
  selectTab(root, openTabs.get(pokemon.uuid) ?? PC_TABS[0].id);
  usePcSprite(root, pokemon);
}
