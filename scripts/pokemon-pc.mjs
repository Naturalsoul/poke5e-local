import { pokemonLevel } from "./encounter-difficulty.mjs";
import { escapeHtml } from "./html.mjs";
import { getLanguage } from "./i18n.mjs";
import { BOX_COLUMNS, BOX_SIZE, buildPcBoxes, moveSlot, staticSpriteSource, trainerPcEntries } from "./pokemon-pc-boxes.mjs";
import { getPokemonTypes } from "./pokemon-type-service.mjs";

const APP_ID = "poke5e-pc";
const FALLBACK_SPRITE = "icons/svg/mystery-man.svg";

const LABELS = {
  es: {
    title: "PC Pokémon",
    box: name => `Caja de ${name}`,
    page: (page, pages) => `Página ${page} de ${pages}`,
    previous: "Caja anterior",
    next: "Caja siguiente",
    party: "Party",
    inParty: "En la party",
    inPc: "En el PC",
    level: "Nv.",
    emptySlot: "Casilla vacía",
    emptyBox: "Esta caja está vacía. Los Pokémon que no estén en la party aparecerán aquí.",
    pick: "Elige un Pokémon para ver sus datos.",
    open: "Abrir ficha",
    noTrainers: "No hay entrenadores que mostrar.",
    noTrainersPlayer: "No tienes ningún entrenador. Pídele al GM que te asigne uno.",
    failed: "No se pudieron cargar las cajas. Revisa la consola (F12) para ver el detalle.",
    retry: "Reintentar",
    openFailed: "No se pudo abrir el PC Pokémon."
  },
  en: {
    title: "Pokémon PC",
    box: name => `${name}'s box`,
    page: (page, pages) => `Page ${page} of ${pages}`,
    previous: "Previous box",
    next: "Next box",
    party: "Party",
    inParty: "In the party",
    inPc: "In the PC",
    level: "Lv.",
    emptySlot: "Empty slot",
    emptyBox: "This box is empty. Pokémon outside the party will show up here.",
    pick: "Pick a Pokémon to see its details.",
    open: "Open sheet",
    noTrainers: "There are no trainers to show.",
    noTrainersPlayer: "You have no trainer. Ask the GM to assign you one.",
    failed: "The boxes could not be loaded. Check the console (F12) for details.",
    retry: "Retry",
    openFailed: "The Pokémon PC could not be opened."
  }
};

const labels = () => LABELS[getLanguage()];

function spriteMarkup(pokemon) {
  const fallback = pokemon.img && !/\.webm$/i.test(pokemon.img) ? pokemon.img : FALLBACK_SPRITE;
  return `<img src="${escapeHtml(staticSpriteSource(pokemon) ?? fallback)}" data-fallback="${escapeHtml(fallback)}" alt="">`;
}

function slotsMarkup(pokemon, count, focusGroup, selectedUuid) {
  const text = labels();
  const tabStop = Math.max(0, pokemon.findIndex(each => each.uuid === selectedUuid));
  return Array.from({ length: count }, (_, index) => {
    const each = pokemon[index];
    const name = each ? `${each.name}, ${text.level} ${pokemonLevel(each)}` : text.emptySlot;
    const selected = each && each.uuid === selectedUuid;
    return `<button type="button" class="poke5e-pc__slot${selected ? " is-selected" : ""}" tabindex="${index === tabStop ? 0 : -1}"
      data-pc-slot data-pc-focus="${focusGroup}-${index}" ${each ? `data-uuid="${escapeHtml(each.uuid)}"` : ""}
      aria-label="${escapeHtml(name)}" ${each ? `title="${escapeHtml(name)}"` : ""}>${each ? spriteMarkup(each) : ""}</button>`;
  }).join("");
}

function previewMarkup(pokemon, inParty) {
  const text = labels();
  if (!pokemon) {return `<p class="poke5e-pc__hint">${text.pick}</p>`;}
  let types = [];
  try {
    types = getPokemonTypes(pokemon);
  } catch {
    // A Pokémon with broken type flags is still worth showing.
  }
  return `
    <div class="poke5e-pc__portrait">${spriteMarkup(pokemon)}</div>
    <h3 class="poke5e-pc__name">${escapeHtml(pokemon.name)}</h3>
    <p class="poke5e-pc__level">${text.level} ${pokemonLevel(pokemon)}</p>
    <p class="poke5e-pc__types">${types.map(type => `<span>${escapeHtml(type)}</span>`).join("")}</p>
    <p class="poke5e-pc__place">${inParty ? text.inParty : text.inPc}</p>
    <button type="button" class="poke5e-pc__open" data-action="openSheet" data-pc-focus="open">${text.open}</button>`;
}

function messageMarkup(message, retry = false) {
  return `<div class="poke5e-pc__message"><p>${message}</p>${retry
    ? `<button type="button" data-action="retry" data-pc-focus="retry">${labels().retry}</button>` : ""}</div>`;
}

function boxMarkup(box, multipleBoxes, selected) {
  const text = labels();
  const arrow = (action, icon, label) => `<button type="button" class="poke5e-pc__arrow" data-action="${action}" data-pc-focus="${action}"
    aria-label="${label}" title="${label}" ${multipleBoxes ? "" : "disabled"}><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`;
  const uuid = selected?.uuid;
  return `
    <section class="poke5e-pc__preview" data-pc-preview>${selected ? previewMarkup(selected, box.party.includes(selected)) : ""}</section>
    <section class="poke5e-pc__storage">
      <header class="poke5e-pc__header">
        ${arrow("previousBox", "fa-caret-left", text.previous)}
        <h2 class="poke5e-pc__title">${escapeHtml(text.box(box.trainer.name))}${box.pages > 1
          ? `<small>${text.page(box.page, box.pages)}</small>` : ""}</h2>
        ${arrow("nextBox", "fa-caret-right", text.next)}
      </header>
      <div class="poke5e-pc__box" role="group" aria-label="${escapeHtml(text.box(box.trainer.name))}" data-pc-group data-columns="${BOX_COLUMNS}">
        ${slotsMarkup(box.pokemon, BOX_SIZE, "box", uuid)}
      </div>
      ${box.pokemon.length ? "" : `<p class="poke5e-pc__hint">${text.emptyBox}</p>`}
      <h3 class="poke5e-pc__party-title">${text.party}</h3>
      <div class="poke5e-pc__party" role="group" aria-label="${text.party}" data-pc-group data-columns="${BOX_COLUMNS}">
        ${slotsMarkup(box.party, box.partySlots, "party", uuid)}
      </div>
    </section>`;
}

export class PokemonPc extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["poke5e-pc"],
    tagName: "div",
    position: { width: 720, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, icon: "fa-solid fa-computer" },
    actions: {
      previousBox: PokemonPc.#previousBox,
      nextBox: PokemonPc.#nextBox,
      openSheet: PokemonPc.#openSheet,
      retry: PokemonPc.#retry
    }
  };

  boxIndex = 0;
  selectedUuid = null;
  boxes = [];

  get title() {
    return labels().title;
  }

  async _renderHTML() {
    try {
      this.boxes = buildPcBoxes(trainerPcEntries());
    } catch (error) {
      console.error(`[poke5e-local] ${APP_ID}`, error);
      this.boxes = [];
      return messageMarkup(labels().failed, true);
    }
    const text = labels();
    if (!this.boxes.length) {return messageMarkup(game.user.isGM ? text.noTrainers : text.noTrainersPlayer);}
    this.boxIndex = Math.min(this.boxIndex, this.boxes.length - 1);
    const box = this.#box;
    const visible = [...box.pokemon, ...box.party];
    const selected = visible.find(pokemon => pokemon.uuid === this.selectedUuid) ?? visible[0] ?? null;
    this.selectedUuid = selected?.uuid ?? null;
    return boxMarkup(box, this.boxes.length > 1, selected);
  }

  // Replacing the HTML drops the focus; a keyboard user has to stay on the same control.
  _replaceHTML(result, content) {
    const focusKey = content.contains(document.activeElement) ? document.activeElement.dataset.pcFocus : null;
    content.innerHTML = `<div class="poke5e-pc__layout">${result}</div>`;
    if (focusKey) {content.querySelector(`[data-pc-focus="${focusKey}"]`)?.focus();}
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const root = this.element;
    // Image errors do not bubble.
    root.addEventListener("error", event => this.#useFallback(event.target), true);
    root.addEventListener("focusin", event => this.#selectSlot(event.target.closest?.("[data-pc-slot]")));
    root.addEventListener("click", event => event.target.closest("[data-pc-slot]")?.focus());
    root.addEventListener("dblclick", event => this.#openFromSlot(event.target.closest("[data-pc-slot]")));
    root.addEventListener("keydown", event => this.#onKeyDown(event));
  }

  get #box() {
    return this.boxes[this.boxIndex];
  }

  #useFallback(image) {
    if (image.tagName !== "IMG") {return;}
    const next = image.getAttribute("src") === image.dataset.fallback ? FALLBACK_SPRITE : image.dataset.fallback;
    if (next !== image.getAttribute("src")) {image.src = next;}
  }

  #pokemon(uuid) {
    return uuid ? [...this.#box.pokemon, ...this.#box.party].find(pokemon => pokemon.uuid === uuid) ?? null : null;
  }

  #selectSlot(slot) {
    if (!slot) {return;}
    const root = this.element;
    for (const each of slot.closest("[data-pc-group]").querySelectorAll("[data-pc-slot]")) {each.tabIndex = each === slot ? 0 : -1;}
    root.querySelector(".poke5e-pc__slot.is-selected")?.classList.remove("is-selected");
    const pokemon = this.#pokemon(slot.dataset.uuid);
    slot.classList.toggle("is-selected", Boolean(pokemon));
    this.selectedUuid = pokemon?.uuid ?? null;
    root.querySelector("[data-pc-preview]").innerHTML = previewMarkup(pokemon, this.#box.party.includes(pokemon));
  }

  #openFromSlot(slot) {
    if (!slot) {return;}
    this.#pokemon(slot.dataset.uuid)?.sheet?.render(true);
  }

  #changeBox(step) {
    if (this.boxes.length < 2) {return;}
    this.boxIndex = (this.boxIndex + step + this.boxes.length) % this.boxes.length;
    this.selectedUuid = null;
    this.render();
  }

  #onKeyDown(event) {
    const slot = event.target.closest("[data-pc-slot]");
    if (event.key === "PageUp" || event.key === "PageDown") {
      this.#changeBox(event.key === "PageUp" ? -1 : 1);
    } else if (slot && event.key === "Enter") {
      this.#openFromSlot(slot);
    } else if (slot && event.key.startsWith("Arrow")) {
      const group = slot.closest("[data-pc-group]");
      const slots = [...group.querySelectorAll("[data-pc-slot]")];
      slots[moveSlot(slots.indexOf(slot), event.key, Number(group.dataset.columns), slots.length)].focus();
    } else {
      return;
    }
    // Foundry pans the canvas with the arrow keys from a listener on window.
    event.preventDefault();
    event.stopPropagation();
  }

  static #previousBox() {
    this.#changeBox(-1);
  }

  static #nextBox() {
    this.#changeBox(1);
  }

  static #openSheet() {
    this.#pokemon(this.selectedUuid)?.sheet?.render(true);
  }

  static #retry() {
    this.render();
  }
}

export async function togglePokemonPc() {
  const existing = foundry.applications.instances.get(APP_ID);
  if (existing) {
    await existing.close();
    return;
  }
  try {
    await new PokemonPc().render({ force: true });
  } catch (error) {
    console.error(`[poke5e-local] ${APP_ID}`, error);
    ui.notifications.error(labels().openFailed);
  }
}

export function registerPokemonPc() {
  for (const hook of ["createActor", "updateActor", "deleteActor"]) {
    Hooks.on(hook, () => {
      const app = foundry.applications.instances.get(APP_ID);
      if (app?.rendered) {app.render();}
    });
  }
}
