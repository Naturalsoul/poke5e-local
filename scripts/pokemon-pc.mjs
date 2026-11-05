import { pokemonLevel } from "./encounter-difficulty.mjs";
import { escapeHtml } from "./html.mjs";
import { getLanguage } from "./i18n.mjs";
import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { applyPcMove, BOX_COLUMNS, BOX_SIZE, moveSlot, pcBoxCount, pcMoveContext, planPcMove, staticSpriteSource, trainerPcEntries } from "./pokemon-pc-boxes.mjs";
import { getPokemonTypes } from "./pokemon-type-service.mjs";
import { getPokemonShinyState } from "./shiny-runtime.mjs";
import { localizedType } from "./trainer-command-center.mjs";
import { isPokemonActive } from "./trainer-party-service.mjs";

const APP_ID = "poke5e-pc";
const FALLBACK_SPRITE = "icons/svg/mystery-man.svg";
const WALLPAPERS = 6;

const LABELS = {
  es: {
    title: "PC Pokémon",
    box: (box, boxes) => `Caja ${box} de ${boxes}`,
    trainer: "Entrenador",
    previous: "Caja anterior",
    next: "Caja siguiente",
    party: "Party",
    inParty: "En la party",
    inPc: "En el PC",
    deployed: "Desplegado",
    level: "Nv.",
    hp: "HP",
    fainted: "Debilitado",
    shiny: "Shiny",
    item: "Objeto",
    noItem: "Sin objeto",
    emptySlot: "Casilla vacía",
    emptyBox: "Esta caja está vacía.",
    pick: "Elige un Pokémon para ver sus datos.",
    open: "Abrir ficha",
    move: "Mover",
    cancel: "Cancelar",
    moving: name => `Moviendo a ${name}: elige una casilla. Esc para cancelar.`,
    keys: "Enter toma y suelta. RePág y AvPág cambian de caja.",
    active: name => `${name} está desplegado: retíralo antes de sacarlo de la party.`,
    full: limit => `La party está llena (${limit} Pokéslots).`,
    moveFailed: "No se pudo mover el Pokémon.",
    noTrainers: "No hay entrenadores que mostrar.",
    noTrainersPlayer: "No tienes ningún entrenador. Pídele al GM que te asigne uno.",
    failed: "No se pudieron cargar las cajas. Revisa la consola (F12) para ver el detalle.",
    retry: "Reintentar",
    openFailed: "No se pudo abrir el PC Pokémon."
  },
  en: {
    title: "Pokémon PC",
    box: (box, boxes) => `Box ${box} of ${boxes}`,
    trainer: "Trainer",
    previous: "Previous box",
    next: "Next box",
    party: "Party",
    inParty: "In the party",
    inPc: "In the PC",
    deployed: "Deployed",
    level: "Lv.",
    hp: "HP",
    fainted: "Fainted",
    shiny: "Shiny",
    item: "Item",
    noItem: "No item",
    emptySlot: "Empty slot",
    emptyBox: "This box is empty.",
    pick: "Pick a Pokémon to see its details.",
    open: "Open sheet",
    move: "Move",
    cancel: "Cancel",
    moving: name => `Moving ${name}: pick a slot. Esc to cancel.`,
    keys: "Enter picks up and drops. Page Up and Page Down change box.",
    active: name => `${name} is deployed: recall it before taking it out of the party.`,
    full: limit => `The party is full (${limit} Pokéslots).`,
    moveFailed: "The Pokémon could not be moved.",
    noTrainers: "There are no trainers to show.",
    noTrainersPlayer: "You have no trainer. Ask the GM to assign you one.",
    failed: "The boxes could not be loaded. Check the console (F12) for details.",
    retry: "Retry",
    openFailed: "The Pokémon PC could not be opened."
  }
};

const labels = () => LABELS[getLanguage()];

const hpOf = pokemon => {
  const { value = 0, max = 0 } = pokemon.system?.attributes?.hp ?? {};
  return { value: Number(value) || 0, max: Number(max) || 0 };
};
const isFainted = pokemon => {
  const { value, max } = hpOf(pokemon);
  return max > 0 && value <= 0;
};
const isShiny = pokemon => getPokemonShinyState(pokemon)?.isShiny === true;

function hpState(ratio) {
  if (ratio <= 0.2) {return "low";}
  return ratio <= 0.5 ? "mid" : "high";
}

function spriteMarkup(pokemon) {
  const fallback = pokemon.img && !/\.webm$/i.test(pokemon.img) ? pokemon.img : FALLBACK_SPRITE;
  return `<img src="${escapeHtml(staticSpriteSource(pokemon) ?? fallback)}" data-fallback="${escapeHtml(fallback)}" alt="" draggable="false">`;
}

function slotMarkup(pokemon, { zone, index, focus, tabStop, selected, held }) {
  const text = labels();
  const label = pokemon
    ? [pokemon.name, `${text.level} ${pokemonLevel(pokemon)}`, isShiny(pokemon) && text.shiny, isFainted(pokemon) && text.fainted].filter(Boolean).join(", ")
    : text.emptySlot;
  const classes = ["poke5e-pc__slot", selected && "is-selected", held && "is-held",
    pokemon && isFainted(pokemon) && "is-fainted", pokemon && isShiny(pokemon) && "is-shiny"].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" tabindex="${tabStop ? 0 : -1}" data-pc-slot data-pc-focus="${focus}"
    data-pc-zone="${zone}" data-pc-index="${index}" ${pokemon ? `data-uuid="${escapeHtml(pokemon.uuid)}" draggable="true" title="${escapeHtml(label)}"` : ""}
    aria-label="${escapeHtml(label)}">${pokemon ? spriteMarkup(pokemon) : ""}</button>`;
}

function hpMarkup(pokemon) {
  const { value, max } = hpOf(pokemon);
  if (max <= 0) {return "";}
  const ratio = Math.max(0, Math.min(1, value / max));
  return `<p class="poke5e-pc__hp"><span>${labels().hp} ${value}/${max}</span>
    <span class="poke5e-pc__hp-bar" data-state="${hpState(ratio)}" aria-hidden="true"><span style="width:${ratio * 100}%"></span></span></p>`;
}

function statusesMarkup(pokemon) {
  const names = [...(pokemon.effects ?? [])].filter(effect => !effect.disabled && Array.from(effect.statuses ?? []).length).map(effect => effect.name);
  return names.length ? `<p class="poke5e-pc__statuses">${names.map(name => `<span>${escapeHtml(name)}</span>`).join("")}</p>` : "";
}

function placeLabel(entry, pokemon) {
  const text = labels();
  if (!entry.party.includes(pokemon)) {return text.inPc;}
  return isPokemonActive(entry.trainer, pokemon) ? text.deployed : text.inParty;
}

function previewMarkup(entry, pokemon, holding) {
  const text = labels();
  if (!pokemon) {return `<p class="poke5e-pc__hint">${text.pick}</p>`;}
  let types = [];
  let item = null;
  try {
    types = getPokemonTypes(pokemon);
    item = getPokemonHeldItem(pokemon);
  } catch (error) {
    // A Pokémon with broken flags is still worth showing.
    console.warn(`[poke5e-local] ${APP_ID}`, error);
  }
  return `
    <div class="poke5e-pc__portrait">${spriteMarkup(pokemon)}</div>
    <h3 class="poke5e-pc__name">${escapeHtml(pokemon.name)}${isShiny(pokemon) ? ` <i class="fa-solid fa-star" title="${text.shiny}" aria-label="${text.shiny}"></i>` : ""}</h3>
    <p class="poke5e-pc__level">${text.level} ${pokemonLevel(pokemon)}</p>
    <p class="poke5e-pc__types">${types.map(type => `<span>${escapeHtml(localizedType(type))}</span>`).join("")}</p>
    ${hpMarkup(pokemon)}
    ${isFainted(pokemon) ? `<p class="poke5e-pc__fainted">${text.fainted}</p>` : ""}
    ${statusesMarkup(pokemon)}
    <p class="poke5e-pc__item">${item ? `${text.item}: ${escapeHtml(item.name)}` : text.noItem}</p>
    <p class="poke5e-pc__place">${placeLabel(entry, pokemon)}</p>
    <div class="poke5e-pc__actions">
      <button type="button" data-action="toggleMove" data-pc-focus="move">${holding ? text.cancel : text.move}</button>
      <button type="button" data-action="openSheet" data-pc-focus="open">${text.open}</button>
    </div>`;
}

function messageMarkup(message, retry = false) {
  return `<div class="poke5e-pc__message"><p>${message}</p>${retry
    ? `<button type="button" data-action="retry" data-pc-focus="retry">${labels().retry}</button>` : ""}</div>`;
}

function trainerPickerMarkup(entries, entry) {
  if (entries.length < 2) {return "";}
  const options = entries.map(({ trainer }) => `<option value="${escapeHtml(trainer.uuid)}" ${trainer === entry.trainer ? "selected" : ""}>${escapeHtml(trainer.name)}</option>`);
  return `<label class="poke5e-pc__trainer">${labels().trainer}
    <select data-pc-trainer data-pc-focus="trainer">${options.join("")}</select></label>`;
}

function statusMarkup(held) {
  const text = labels();
  return held ? `<span class="poke5e-pc__sprite-small">${spriteMarkup(held)}</span><span>${escapeHtml(text.moving(held.name))}</span>` : `<span>${text.keys}</span>`;
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
      toggleMove: PokemonPc.#toggleMove,
      retry: PokemonPc.#retry
    }
  };

  entry = null;
  trainerUuid = null;
  boxIndex = 0;
  selectedUuid = null;
  heldUuid = null;

  get title() {
    return labels().title;
  }

  async _renderHTML() {
    let entries;
    try {
      entries = trainerPcEntries();
    } catch (error) {
      console.error(`[poke5e-local] ${APP_ID}`, error);
      this.entry = null;
      return messageMarkup(labels().failed, true);
    }
    const text = labels();
    this.entry = entries.find(({ trainer }) => trainer.uuid === this.trainerUuid) ?? entries[0] ?? null;
    if (!this.entry) {return messageMarkup(game.user.isGM ? text.noTrainers : text.noTrainersPlayer);}
    this.trainerUuid = this.entry.trainer.uuid;
    if (!this.entry.pokemon.has(this.heldUuid)) {this.heldUuid = null;}
    const boxes = pcBoxCount(this.entry.slots);
    this.boxIndex = Math.min(this.boxIndex, boxes - 1);
    return this.#markup(entries, boxes);
  }

  #markup(entries, boxes) {
    const text = labels();
    const { entry, boxIndex } = this;
    const offset = boxIndex * BOX_SIZE;
    const boxUuids = Array.from({ length: BOX_SIZE }, (_, index) => entry.slots[offset + index] ?? null);
    const partyUuids = Array.from({ length: entry.partySlots }, (_, index) => entry.party[index]?.uuid ?? null);
    const visible = [...boxUuids, ...partyUuids].filter(Boolean);
    if (!visible.includes(this.selectedUuid)) {this.selectedUuid = visible[0] ?? null;}
    const selected = entry.pokemon.get(this.selectedUuid) ?? null;
    const held = entry.pokemon.get(this.heldUuid) ?? null;
    const stop = Math.max(0, [...boxUuids, ...partyUuids].indexOf(this.selectedUuid));
    const slot = (uuid, position, zone, index, focus) => slotMarkup(entry.pokemon.get(uuid), {
      zone, index, focus, tabStop: position === stop, selected: uuid && uuid === this.selectedUuid, held: uuid && uuid === this.heldUuid
    });
    return `
      <section class="poke5e-pc__preview" data-pc-preview>${selected ? previewMarkup(entry, selected, Boolean(held)) : ""}</section>
      <section class="poke5e-pc__storage">
        ${trainerPickerMarkup(entries, entry)}
        <header class="poke5e-pc__header">
          <button type="button" class="poke5e-pc__arrow" data-action="previousBox" data-pc-focus="previousBox" aria-label="${text.previous}" title="${text.previous}"><i class="fa-solid fa-caret-left" aria-hidden="true"></i></button>
          <h2 class="poke5e-pc__title">${text.box(boxIndex + 1, boxes)}${entries.length > 1 ? "" : `<small>${escapeHtml(entry.trainer.name)}</small>`}</h2>
          <button type="button" class="poke5e-pc__arrow" data-action="nextBox" data-pc-focus="nextBox" aria-label="${text.next}" title="${text.next}"><i class="fa-solid fa-caret-right" aria-hidden="true"></i></button>
        </header>
        <div class="poke5e-pc__box" data-wallpaper="${boxIndex % WALLPAPERS}" role="group" aria-label="${text.box(boxIndex + 1, boxes)}">
          ${boxUuids.map((uuid, index) => slot(uuid, index, "box", offset + index, `box-${index}`)).join("")}
          ${boxUuids.some(Boolean) ? "" : `<p class="poke5e-pc__box-empty">${text.emptyBox}</p>`}
        </div>
        <h3 class="poke5e-pc__party-title">${text.party}</h3>
        <div class="poke5e-pc__party" role="group" aria-label="${text.party}">
          ${partyUuids.map((uuid, index) => slot(uuid, BOX_SIZE + index, "party", index, `party-${index}`)).join("")}
        </div>
        <p class="poke5e-pc__status" role="status" data-pc-status>${statusMarkup(held)}</p>
      </section>`;
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
    root.addEventListener("click", event => this.#onClick(event));
    root.addEventListener("dblclick", event => this.#openFromSlot(event.target.closest("[data-pc-slot]")));
    root.addEventListener("keydown", event => this.#onKeyDown(event));
    root.addEventListener("change", event => this.#onChange(event));
    root.addEventListener("dragstart", event => this.#onDragStart(event));
    root.addEventListener("dragover", event => {
      if (event.target.closest("[data-pc-slot]")) {event.preventDefault();}
    });
    root.addEventListener("drop", event => {
      const slot = event.target.closest("[data-pc-slot]");
      if (!slot) {return;}
      event.preventDefault();
      this.#dropOn(slot);
    });
    root.addEventListener("dragend", () => {
      if (this.heldUuid) {this.#setHeld(null);}
    });
  }

  #useFallback(image) {
    if (image.tagName !== "IMG") {return;}
    const next = image.getAttribute("src") === image.dataset.fallback ? FALLBACK_SPRITE : image.dataset.fallback;
    if (next !== image.getAttribute("src")) {image.src = next;}
  }

  #selectSlot(slot) {
    if (!slot) {return;}
    const root = this.element;
    for (const each of root.querySelectorAll("[data-pc-slot]")) {each.tabIndex = each === slot ? 0 : -1;}
    root.querySelector(".poke5e-pc__slot.is-selected")?.classList.remove("is-selected");
    const pokemon = this.entry.pokemon.get(slot.dataset.uuid) ?? null;
    slot.classList.toggle("is-selected", Boolean(pokemon));
    this.selectedUuid = pokemon?.uuid ?? null;
    this.#drawPreview();
  }

  #drawPreview() {
    const preview = this.element.querySelector("[data-pc-preview]");
    const focusKey = preview.contains(document.activeElement) ? document.activeElement.dataset.pcFocus : null;
    preview.innerHTML = previewMarkup(this.entry, this.entry.pokemon.get(this.selectedUuid) ?? null, Boolean(this.heldUuid));
    if (focusKey) {preview.querySelector(`[data-pc-focus="${focusKey}"]`)?.focus();}
  }

  // Redraws in place: a full render would abort a mouse drag in progress.
  #setHeld(uuid) {
    this.heldUuid = uuid;
    const root = this.element;
    root.querySelector(".poke5e-pc__slot.is-held")?.classList.remove("is-held");
    if (uuid) {root.querySelector(`[data-uuid="${CSS.escape(uuid)}"]`)?.classList.add("is-held");}
    root.querySelector("[data-pc-status]").innerHTML = statusMarkup(this.entry.pokemon.get(uuid) ?? null);
    this.#drawPreview();
  }

  async #dropOn(slot) {
    const text = labels();
    const held = this.entry.pokemon.get(this.heldUuid);
    if (!held) {return;}
    const plan = planPcMove(pcMoveContext(this.entry), held.uuid, { zone: slot.dataset.pcZone, index: Number(slot.dataset.pcIndex) });
    if (plan?.error) {
      // Whoever is deployed: the Pokémon it would swap out of the party, or the one being dropped.
      const blocker = slot.dataset.pcZone === "party" ? this.entry.pokemon.get(slot.dataset.uuid) : held;
      ui.notifications.warn(plan.error === "full" ? text.full(this.entry.limit) : text.active(blocker.name));
      return;
    }
    this.#setHeld(null);
    if (!plan) {return;}
    this.selectedUuid = held.uuid;
    try {
      await applyPcMove(this.entry, plan);
    } catch (error) {
      console.error(`[poke5e-local] ${APP_ID}`, error);
      ui.notifications.error(text.moveFailed);
    }
    this.render();
  }

  #openFromSlot(slot) {
    if (!slot || this.heldUuid) {return;}
    this.entry.pokemon.get(slot.dataset.uuid)?.sheet?.render(true);
  }

  #changeBox(step) {
    const boxes = pcBoxCount(this.entry.slots);
    this.boxIndex = (this.boxIndex + step + boxes) % boxes;
    this.selectedUuid = null;
    this.render();
  }

  #onClick(event) {
    const slot = event.target.closest("[data-pc-slot]");
    // Enter and Space already acted on keydown; they also fire a click with detail 0.
    if (!slot || event.detail === 0) {return;}
    slot.focus();
    if (this.heldUuid) {this.#dropOn(slot);}
  }

  #onChange(event) {
    if (!event.target.matches("[data-pc-trainer]")) {return;}
    this.trainerUuid = event.target.value;
    this.boxIndex = 0;
    this.selectedUuid = null;
    this.heldUuid = null;
    this.render();
  }

  #onDragStart(event) {
    const uuid = event.target.closest?.("[data-pc-slot]")?.dataset.uuid;
    if (!uuid) {return;}
    // A type of our own: Foundry's canvas ignores the drop if it lands outside the window.
    event.dataTransfer.setData("application/x-poke5e-pc", uuid);
    event.dataTransfer.effectAllowed = "move";
    this.#setHeld(uuid);
  }

  #onKeyDown(event) {
    if (!this.entry) {return;}
    const slot = event.target.closest("[data-pc-slot]");
    if (event.key === "Escape" && this.heldUuid) {
      this.#setHeld(null);
    } else if ((event.key === "PageUp" || event.key === "PageDown") && !event.target.matches("select")) {
      this.#changeBox(event.key === "PageUp" ? -1 : 1);
    } else if (slot && (event.key === "Enter" || event.key === " ")) {
      if (this.heldUuid) {this.#dropOn(slot);} else if (slot.dataset.uuid) {this.#setHeld(slot.dataset.uuid);}
    } else if (slot && event.key.startsWith("Arrow")) {
      const slots = [...this.element.querySelectorAll("[data-pc-slot]")];
      slots[moveSlot(slots.indexOf(slot), event.key, BOX_COLUMNS, slots.length)].focus();
    } else {
      return;
    }
    // Foundry pans the canvas with the arrow keys and closes windows with Esc from a listener on window.
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
    this.entry.pokemon.get(this.selectedUuid)?.sheet?.render(true);
  }

  static #toggleMove() {
    this.#setHeld(this.heldUuid ? null : this.selectedUuid);
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
