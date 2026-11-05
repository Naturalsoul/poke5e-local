import { pokemonLevel } from "./encounter-difficulty.mjs";
import { HELD_ITEM_LOAN } from "./held-item-loan-sync.mjs";
import { escapeHtml } from "./html.mjs";
import { getLanguage } from "./i18n.mjs";
import { canCurrentUserTransferPokemonHeldItem, getPokemonHeldItem, isTrainerInventoryBerry, isTrainerInventoryHeldItem,
  transferPokemonHeldItemToTrainer, transferTrainerBerryToPokemon, transferTrainerHeldItemToPokemon } from "./pokemon-held-item-service.mjs";
import { moveSlot, pcDisplayName, staticSpriteSource, trainerPcEntries } from "./pokemon-pc-boxes.mjs";
import { BAG_COLUMNS, BAG_POCKETS, bagContents, bagSlotCount, canUseBagItem, isEquippable } from "./trainer-bag-rules.mjs";

/* ============================================================
 * TRAINER BAG
 *
 * The trainer's items, laid out like the PC: a card on the left,
 * a pocket of slots and the party on the right. Reuses the PC's
 * look (styles/pokemon-pc.css) on purpose; styles/trainer-bag.css
 * only adds what a Pokémon box does not have.
 * ============================================================ */

const APP_ID = "poke5e-bag";
const MODULE_ID = "poke5e-local";
const FALLBACK_ITEM = "icons/svg/item-bag.svg";
const FALLBACK_SPRITE = "icons/svg/mystery-man.svg";
const CURRENCIES = ["pp", "gp", "ep", "sp", "cp"];

const LABELS = {
  es: {
    title: "Mochila",
    trainer: "Entrenador",
    pockets: "Bolsillos",
    money: "Dinero",
    party: "Party",
    empty: "Este bolsillo está vacío. Arrastra aquí un objeto para guardarlo.",
    emptySlot: "Casilla vacía",
    pick: "Elige un objeto para ver qué hace.",
    quantity: "Cantidad",
    less: "Quitar uno",
    more: "Añadir uno",
    use: "Usar",
    give: "Dar a un Pokémon",
    cancel: "Cancelar",
    equip: "Equipar",
    unequip: "Desequipar",
    open: "Abrir ficha",
    drop: "Tirar",
    uses: "Usos",
    lent: name => `Lo lleva ${name}.`,
    lentUnknown: "Está prestado a un Pokémon.",
    level: "Nv.",
    holding: "Lleva",
    noItem: "Sin objeto",
    takeBack: "Guardar en la mochila",
    openPokemon: "Abrir ficha",
    giving: name => `Dando ${name}: elige un Pokémon de la party. Esc para cancelar.`,
    keys: "RePág y AvPág cambian de bolsillo.",
    noTrainers: "No hay entrenadores que mostrar.",
    noTrainersPlayer: "No tienes ningún entrenador. Pídele al GM que te asigne uno.",
    failed: "No se pudo cargar la mochila. Revisa la consola (F12) para ver el detalle.",
    retry: "Reintentar",
    openFailed: "No se pudo abrir la mochila.",
    actionFailed: "No se pudo completar la acción."
  },
  en: {
    title: "Bag",
    trainer: "Trainer",
    pockets: "Pockets",
    money: "Money",
    party: "Party",
    empty: "This pocket is empty. Drag an item here to store it.",
    emptySlot: "Empty slot",
    pick: "Pick an item to see what it does.",
    quantity: "Quantity",
    less: "Remove one",
    more: "Add one",
    use: "Use",
    give: "Give to a Pokémon",
    cancel: "Cancel",
    equip: "Equip",
    unequip: "Unequip",
    open: "Open sheet",
    drop: "Discard",
    uses: "Uses",
    lent: name => `${name} is holding it.`,
    lentUnknown: "It is lent to a Pokémon.",
    level: "Lv.",
    holding: "Holding",
    noItem: "No item",
    takeBack: "Put in the bag",
    openPokemon: "Open sheet",
    giving: name => `Giving ${name}: pick a Pokémon from the party. Esc to cancel.`,
    keys: "Page Up and Page Down change pocket.",
    noTrainers: "There are no trainers to show.",
    noTrainersPlayer: "You have no trainer. Ask the GM to assign you one.",
    failed: "The bag could not be loaded. Check the console (F12) for details.",
    retry: "Retry",
    openFailed: "The bag could not be opened.",
    actionFailed: "The action could not be completed."
  }
};

const labels = () => LABELS[getLanguage()];
const language = () => (getLanguage() === "en" ? "en" : "es");
const textEditor = () => foundry.applications.ux.TextEditor.implementation;

const isLent = item => Boolean(item.getFlag(MODULE_ID, HELD_ITEM_LOAN));
const canGive = item => (isTrainerInventoryBerry(item) || isTrainerInventoryHeldItem(item)) && !isLent(item) && Number(item.system.quantity) > 0;

function itemImage(item, className = "") {
  return `<img class="${className}" src="${escapeHtml(item.img || FALLBACK_ITEM)}" data-fallback="${FALLBACK_ITEM}" alt="" draggable="false">`;
}

function spriteImage(pokemon) {
  return `<img src="${escapeHtml(staticSpriteSource(pokemon) ?? FALLBACK_SPRITE)}" data-fallback="${FALLBACK_SPRITE}" alt="" draggable="false">`;
}

function itemSlotMarkup(item, index, { selected, giving, tabStop }) {
  const text = labels();
  const focus = `item-${index}`;
  if (!item) {
    return `<button type="button" class="poke5e-pc__slot" tabindex="-1" data-pc-slot data-pc-focus="${focus}" aria-label="${text.emptySlot}"></button>`;
  }
  const quantity = Number(item.system.quantity);
  const label = `${item.name}, ${text.quantity.toLowerCase()} ${quantity}`;
  const classes = ["poke5e-pc__slot", "poke5e-bag__item", selected && "is-selected", giving && "is-held", quantity < 1 && "is-spent"].filter(Boolean).join(" ");
  return `<button type="button" class="${classes}" tabindex="${tabStop ? 0 : -1}" data-pc-slot data-pc-focus="${focus}" data-bag-item="${escapeHtml(item.id)}"
    draggable="true" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${itemImage(item)}<span class="poke5e-bag__quantity" aria-hidden="true">${quantity}</span></button>`;
}

function partySlotMarkup(pokemon, index, { selected, tabStop }) {
  const text = labels();
  const focus = `party-${index}`;
  if (!pokemon) {
    return `<button type="button" class="poke5e-pc__slot" tabindex="-1" data-pc-slot data-pc-focus="${focus}" aria-label="${text.emptySlot}"></button>`;
  }
  const held = getPokemonHeldItem(pokemon);
  const name = pcDisplayName(pokemon.name);
  const label = `${name}, ${held ? `${text.holding} ${held.name}` : text.noItem}`;
  return `<button type="button" class="poke5e-pc__slot${selected ? " is-selected" : ""}" tabindex="${tabStop ? 0 : -1}" data-pc-slot data-pc-focus="${focus}"
    data-uuid="${escapeHtml(pokemon.uuid)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${spriteImage(pokemon)}${held ? itemImage(held, "poke5e-bag__held") : ""}</button>`;
}

function chargesMarkup(item) {
  const max = Number(item.system.uses?.max);
  if (!(max > 0)) {return "";}
  return `<p class="poke5e-bag__fact">${labels().uses}: ${Number(item.system.uses.value ?? 0)}/${max}</p>`;
}

function lentMarkup(item) {
  const loan = item.getFlag(MODULE_ID, HELD_ITEM_LOAN);
  if (!loan) {return "";}
  const holder = fromUuidSync(loan.pokemonUuid, { strict: false });
  return `<p class="poke5e-bag__fact">${holder ? escapeHtml(labels().lent(pcDisplayName(holder.name))) : labels().lentUnknown}</p>`;
}

function itemPreviewMarkup(item, { editable, giving }) {
  const text = labels();
  const quantity = Number(item.system.quantity);
  const lent = isLent(item);
  const button = (action, label, focus = action) => `<button type="button" data-action="${action}" data-pc-focus="${focus}">${label}</button>`;
  const actions = editable ? [
    canUseBagItem(item) && button("useItem", text.use),
    canGive(item) && button("toggleGive", giving ? text.cancel : text.give),
    isEquippable(item) && button("toggleEquip", item.system.equipped ? text.unequip : text.equip),
    button("openItem", text.open),
    !lent && button("dropItem", text.drop)
  ].filter(Boolean) : [button("openItem", text.open)];
  return `
    <div class="poke5e-bag__stage">${itemImage(item)}</div>
    <div class="poke5e-pc__nameplate">
      <h3 class="poke5e-pc__name">${escapeHtml(item.name)}</h3>
      ${editable && !lent ? `
        <p class="poke5e-bag__stepper" role="group" aria-label="${text.quantity}">
          <button type="button" data-action="changeQuantity" data-step="-1" data-pc-focus="less" aria-label="${text.less}" title="${text.less}" ${quantity < 1 ? "disabled" : ""}><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
          <span>${quantity}</span>
          <button type="button" data-action="changeQuantity" data-step="1" data-pc-focus="more" aria-label="${text.more}" title="${text.more}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </p>` : `<p class="poke5e-pc__level">x${quantity}</p>`}
    </div>
    ${lentMarkup(item)}
    ${chargesMarkup(item)}
    <div class="poke5e-bag__description" tabindex="0" data-bag-description></div>
    <div class="poke5e-pc__actions poke5e-bag__actions">${actions.join("")}</div>`;
}

function pokemonPreviewMarkup(pokemon, trainer) {
  const text = labels();
  const held = getPokemonHeldItem(pokemon);
  const canTake = canCurrentUserTransferPokemonHeldItem(pokemon, trainer);
  return `
    <div class="poke5e-bag__stage poke5e-bag__stage--pokemon">${spriteImage(pokemon)}</div>
    <div class="poke5e-pc__nameplate">
      <h3 class="poke5e-pc__name">${escapeHtml(pcDisplayName(pokemon.name))}</h3>
      <p class="poke5e-pc__level">${text.level} ${pokemonLevel(pokemon)}</p>
    </div>
    <p class="poke5e-pc__item">${held ? `${text.holding}: ${escapeHtml(held.name)}` : text.noItem}</p>
    <div class="poke5e-pc__actions poke5e-bag__actions">
      ${canTake ? `<button type="button" data-action="takeBack" data-pc-focus="takeBack">${text.takeBack}</button>` : ""}
      <button type="button" data-action="openPokemon" data-pc-focus="openPokemon">${text.openPokemon}</button>
    </div>`;
}

function moneyMarkup(trainer, editable) {
  const text = labels();
  const fields = CURRENCIES.map(key => {
    const label = game.i18n.localize(CONFIG.DND5E?.currencies?.[key]?.abbreviation ?? key);
    return `<label class="poke5e-bag__coin">${escapeHtml(label)}
      <input type="number" min="0" step="1" value="${Number(trainer.system.currency?.[key] ?? 0)}" data-bag-currency="${key}" data-pc-focus="coin-${key}" ${editable ? "" : "disabled"}></label>`;
  });
  return `<div class="poke5e-bag__money" role="group" aria-label="${text.money}"><h3 class="poke5e-pc__party-title">${text.money}</h3><div class="poke5e-bag__coins">${fields.join("")}</div></div>`;
}

function messageMarkup(message, retry = false) {
  return `<div class="poke5e-pc__message"><p>${message}</p>${retry
    ? `<button type="button" data-action="retry" data-pc-focus="retry">${labels().retry}</button>` : ""}</div>`;
}

function trainerPickerMarkup(entries, entry) {
  if (entries.length < 2) {return "";}
  const options = entries.map(({ trainer }) => `<option value="${escapeHtml(trainer.uuid)}" ${trainer === entry.trainer ? "selected" : ""}>${escapeHtml(trainer.name)}</option>`);
  return `<label class="poke5e-pc__trainer">${labels().trainer}
    <select data-bag-trainer data-pc-focus="trainer">${options.join("")}</select></label>`;
}

function statusText(giving) {
  const text = labels();
  return giving ? escapeHtml(text.giving(giving.name)) : text.keys;
}

export class TrainerBag extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["poke5e-pc", "poke5e-bag"],
    tagName: "div",
    position: { width: 860, height: "auto" },
    window: { frame: true, positioned: true, resizable: false, icon: "fa-solid fa-suitcase" },
    actions: {
      changeQuantity: TrainerBag.#changeQuantity,
      dropItem: TrainerBag.#dropItem,
      openItem: TrainerBag.#openItem,
      openPokemon: TrainerBag.#openPokemon,
      retry: TrainerBag.#retry,
      selectPocket: TrainerBag.#selectPocket,
      takeBack: TrainerBag.#takeBack,
      toggleEquip: TrainerBag.#toggleEquip,
      toggleGive: TrainerBag.#toggleGive,
      useItem: TrainerBag.#useItem
    }
  };

  entry = null;
  trainerUuid = null;
  pocketId = BAG_POCKETS[0].id;
  selectedItemId = null;
  selectedPokemonUuid = null;
  givingId = null;
  #descriptionRequest = 0;

  constructor({ trainerUuid = null, ...options } = {}) {
    super(options);
    this.trainerUuid = trainerUuid;
  }

  get title() {
    return labels().title;
  }

  get #trainer() {
    return this.entry?.trainer ?? null;
  }

  get #selectedItem() {
    return this.#trainer?.items.get(this.selectedItemId) ?? null;
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
    return this.#markup(entries);
  }

  #markup(entries) {
    const text = labels();
    const { entry } = this;
    const { trainer } = entry;
    const contents = bagContents(trainer.items);
    const pocket = contents.get(this.pocketId);
    if (!trainer.items.has(this.givingId)) {this.givingId = null;}
    if (!entry.pokemon.has(this.selectedPokemonUuid)) {this.selectedPokemonUuid = null;}
    if (!this.selectedPokemonUuid && !pocket.some(item => item.id === this.selectedItemId)) {this.selectedItemId = pocket[0]?.id ?? null;}

    const partyUuids = Array.from({ length: entry.partySlots }, (_, index) => entry.party[index]?.uuid ?? null);
    const hasItemStop = pocket.some(item => item.id === this.selectedItemId);
    const tabs = BAG_POCKETS.map(each => `
      <button type="button" class="poke5e-bag__tab" data-action="selectPocket" data-pocket="${each.id}" data-pc-focus="pocket-${each.id}" aria-pressed="${each.id === this.pocketId}">
        ${each[language()]} <small>${contents.get(each.id).length}</small></button>`).join("");
    const items = Array.from({ length: bagSlotCount(pocket.length) }, (_, index) => {
      const item = pocket[index] ?? null;
      return itemSlotMarkup(item, index, {
        selected: item?.id === this.selectedItemId && !this.selectedPokemonUuid,
        giving: item?.id === this.givingId,
        tabStop: item && (hasItemStop ? item.id === this.selectedItemId : index === 0)
      });
    }).join("");
    const party = partyUuids.map((uuid, index) => partySlotMarkup(entry.pokemon.get(uuid), index, {
      selected: uuid && uuid === this.selectedPokemonUuid,
      tabStop: uuid && (uuid === this.selectedPokemonUuid || (!pocket.length && index === 0))
    })).join("");
    const pocketIndex = BAG_POCKETS.findIndex(each => each.id === this.pocketId);
    return `
      <section class="poke5e-pc__preview" data-pc-preview></section>
      <section class="poke5e-pc__storage">
        ${trainerPickerMarkup(entries, entry)}
        <nav class="poke5e-bag__tabs" aria-label="${text.pockets}">${tabs}</nav>
        <div class="poke5e-pc__box poke5e-bag__box" data-wallpaper="${pocketIndex}" role="group" aria-label="${escapeHtml(BAG_POCKETS[pocketIndex][language()])}">
          ${items}
          ${pocket.length ? "" : `<p class="poke5e-pc__box-empty">${text.empty}</p>`}
        </div>
        <div class="poke5e-pc__tray">
          <h3 class="poke5e-pc__party-title">${text.party}</h3>
          <div class="poke5e-pc__party" role="group" aria-label="${text.party}">${party}</div>
        </div>
        ${moneyMarkup(trainer, trainer.isOwner)}
        <p class="poke5e-pc__status" role="status" data-pc-status>${statusText(this.#trainer.items.get(this.givingId))}</p>
      </section>`;
  }

  // Replacing the HTML drops the focus; a keyboard user has to stay on the same control.
  _replaceHTML(result, content) {
    const focusKey = content.contains(document.activeElement) ? document.activeElement.dataset.pcFocus : null;
    content.innerHTML = `<div class="poke5e-pc__layout">${result}</div>`;
    if (this.entry) {this.#drawPreview();}
    if (focusKey) {content.querySelector(`[data-pc-focus="${focusKey}"]`)?.focus();}
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const root = this.element;
    root.classList.add("is-booting");
    // Image errors do not bubble.
    root.addEventListener("error", event => this.#useFallback(event.target), true);
    root.addEventListener("focusin", event => this.#select(event.target.closest?.("[data-pc-slot]")));
    root.addEventListener("click", event => this.#onClick(event));
    root.addEventListener("dblclick", event => this.#openFromSlot(event.target.closest("[data-pc-slot]")));
    root.addEventListener("keydown", event => this.#onKeyDown(event));
    root.addEventListener("change", event => this.#onChange(event));
    root.addEventListener("dragstart", event => this.#onDragStart(event));
    root.addEventListener("dragover", event => event.preventDefault());
    root.addEventListener("drop", event => this.#onDrop(event));
  }

  #useFallback(image) {
    if (image.tagName === "IMG" && image.getAttribute("src") !== image.dataset.fallback) {image.src = image.dataset.fallback;}
  }

  #drawPreview() {
    const preview = this.element.querySelector("[data-pc-preview]");
    const trainer = this.#trainer;
    const pokemon = this.entry.pokemon.get(this.selectedPokemonUuid);
    const item = this.#selectedItem;
    const focusKey = preview.contains(document.activeElement) ? document.activeElement.dataset.pcFocus : null;
    if (pokemon) {
      preview.innerHTML = pokemonPreviewMarkup(pokemon, trainer);
    } else if (item) {
      preview.innerHTML = itemPreviewMarkup(item, { editable: trainer.isOwner, giving: this.givingId === item.id });
      void this.#drawDescription(item);
    } else {
      preview.innerHTML = `<p class="poke5e-pc__hint">${labels().pick}</p>`;
    }
    if (focusKey) {preview.querySelector(`[data-pc-focus="${focusKey}"]`)?.focus();}
  }

  async #drawDescription(item) {
    this.#descriptionRequest += 1;
    const request = this.#descriptionRequest;
    const { description, identified } = item.system;
    // A player must not read what an unidentified item really does.
    const source = identified === false && !game.user.isGM ? item.system.unidentified?.description : description?.value;
    const html = await textEditor().enrichHTML(source ?? "", { secrets: item.isOwner, relativeTo: item, rollData: item.getRollData?.() });
    if (request !== this.#descriptionRequest) {return;}
    const host = this.element?.querySelector("[data-bag-description]");
    if (host) {host.innerHTML = html;}
  }

  #select(slot) {
    if (!slot || !this.entry) {return;}
    const itemId = slot.dataset.bagItem ?? null;
    const uuid = slot.dataset.uuid ?? null;
    if (!itemId && !uuid) {return;}
    const root = this.element;
    for (const each of root.querySelectorAll("[data-pc-slot]")) {each.tabIndex = each === slot ? 0 : -1;}
    root.querySelector(".poke5e-pc__slot.is-selected")?.classList.remove("is-selected");
    slot.classList.add("is-selected");
    const changed = itemId !== this.selectedItemId || uuid !== this.selectedPokemonUuid;
    this.selectedPokemonUuid = uuid;
    if (itemId) {this.selectedItemId = itemId;}
    // While giving, the card stays on the item being handed over.
    if (changed && !this.givingId) {this.#drawPreview();}
  }

  // Redraws in place: a full render would throw away the description just enriched.
  #setGiving(itemId) {
    this.givingId = itemId;
    const root = this.element;
    root.querySelector(".poke5e-bag__item.is-held")?.classList.remove("is-held");
    if (itemId) {root.querySelector(`[data-bag-item="${CSS.escape(itemId)}"]`)?.classList.add("is-held");}
    root.querySelector("[data-pc-status]").innerHTML = statusText(this.#trainer.items.get(itemId));
    this.#drawPreview();
  }

  async #run(task) {
    try {
      await task();
    } catch (error) {
      console.error(`[poke5e-local] ${APP_ID}`, error);
      ui.notifications.error(error?.message || labels().actionFailed);
    }
  }

  async #giveTo(pokemon, item) {
    if (!pokemon || !item) {return;}
    const transfer = isTrainerInventoryBerry(item) ? transferTrainerBerryToPokemon : transferTrainerHeldItemToPokemon;
    this.givingId = null;
    this.selectedPokemonUuid = pokemon.uuid;
    await this.#run(() => transfer(pokemon, this.#trainer, item.id));
    await this.render();
  }

  #changePocket(step) {
    const index = BAG_POCKETS.findIndex(pocket => pocket.id === this.pocketId);
    this.#showPocket(BAG_POCKETS[(index + step + BAG_POCKETS.length) % BAG_POCKETS.length].id);
  }

  #showPocket(id) {
    this.pocketId = id;
    this.selectedItemId = null;
    this.selectedPokemonUuid = null;
    this.givingId = null;
    this.render();
  }

  #openFromSlot(slot) {
    if (!slot || this.givingId) {return;}
    if (slot.dataset.bagItem) {this.#trainer.items.get(slot.dataset.bagItem)?.sheet?.render(true);}
    if (slot.dataset.uuid) {this.entry.pokemon.get(slot.dataset.uuid)?.sheet?.render(true);}
  }

  #onClick(event) {
    const slot = event.target.closest("[data-pc-slot]");
    // Enter and Space already acted on keydown; they also fire a click with detail 0.
    if (!slot || event.detail === 0) {return;}
    slot.focus();
    this.#select(slot);
    if (this.givingId && slot.dataset.uuid) {
      void this.#giveTo(this.entry.pokemon.get(slot.dataset.uuid), this.#trainer.items.get(this.givingId));
    }
  }

  #onChange(event) {
    if (event.target.matches("[data-bag-trainer]")) {
      this.trainerUuid = event.target.value;
      this.selectedItemId = null;
      this.selectedPokemonUuid = null;
      this.givingId = null;
      this.render();
      return;
    }
    const key = event.target.dataset.bagCurrency;
    if (!key) {return;}
    const value = Math.floor(Number(event.target.value));
    if (!Number.isFinite(value) || value < 0) {
      event.target.value = Number(this.#trainer.system.currency?.[key] ?? 0);
      return;
    }
    void this.#run(() => this.#trainer.update({ [`system.currency.${key}`]: value }));
  }

  #onDragStart(event) {
    const item = this.#trainer?.items.get(event.target.closest?.("[data-bag-item]")?.dataset.bagItem);
    if (item) {event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));}
  }

  #onDrop(event) {
    if (!this.entry) {return;}
    event.preventDefault();
    const data = textEditor().getDragEventData(event);
    if (data?.type !== "Item") {return;}
    const trainer = this.#trainer;
    // An item of this trainer's own: dropped on a Pokémon it is handed over, anywhere else nothing moves.
    if (String(data.uuid).startsWith(`${trainer.uuid}.Item.`)) {
      const item = trainer.items.get(String(data.uuid).split(".").at(-1));
      const pokemon = this.entry.pokemon.get(event.target.closest("[data-pc-slot]")?.dataset.uuid);
      if (item && canGive(item)) {void this.#giveTo(pokemon, item);}
      return;
    }
    if (!trainer.isOwner) {return;}
    // The sheet already knows how to stack items, and it does not need to be open for that.
    void this.#run(async () => {
      const item = await Item.implementation.fromDropData(data);
      if (item) {await trainer.sheet._onDropCreateItems(event, [item], "copy");}
    });
  }

  #onKeyDown(event) {
    if (!this.entry) {return;}
    const slot = event.target.closest("[data-pc-slot]");
    if (event.key === "Escape" && this.givingId) {
      this.#setGiving(null);
    } else if ((event.key === "PageUp" || event.key === "PageDown") && !event.target.matches("select, input")) {
      this.#changePocket(event.key === "PageUp" ? -1 : 1);
    } else if (slot?.dataset.uuid && this.givingId && (event.key === "Enter" || event.key === " ")) {
      void this.#giveTo(this.entry.pokemon.get(slot.dataset.uuid), this.#trainer.items.get(this.givingId));
    } else if (slot && event.key.startsWith("Arrow")) {
      const slots = [...this.element.querySelectorAll("[data-pc-slot]")];
      slots[moveSlot(slots.indexOf(slot), event.key, BAG_COLUMNS, slots.length)].focus();
    } else {
      return;
    }
    // Foundry pans the canvas with the arrow keys and closes windows with Esc from a listener on window.
    event.preventDefault();
    event.stopPropagation();
  }

  static #selectPocket(event, target) {
    this.#showPocket(target.dataset.pocket);
  }

  static #changeQuantity(event, target) {
    const item = this.#selectedItem;
    if (!item) {return;}
    const quantity = Math.max(0, Number(item.system.quantity) + Number(target.dataset.step));
    void this.#run(() => item.update({ "system.quantity": quantity }));
  }

  static #useItem(event) {
    const item = this.#selectedItem;
    if (item) {void this.#run(() => item.use({ event, legacy: false }));}
  }

  static #toggleGive() {
    this.#setGiving(this.givingId ? null : this.selectedItemId);
  }

  static #toggleEquip() {
    const item = this.#selectedItem;
    if (item) {void this.#run(() => item.update({ "system.equipped": !item.system.equipped }));}
  }

  static #openItem() {
    this.#selectedItem?.sheet?.render(true);
  }

  static #dropItem() {
    const item = this.#selectedItem;
    if (item) {void this.#run(() => item.deleteDialog());}
  }

  static #takeBack() {
    const pokemon = this.entry.pokemon.get(this.selectedPokemonUuid);
    if (pokemon) {void this.#run(() => transferPokemonHeldItemToTrainer(pokemon, this.#trainer));}
  }

  static #openPokemon() {
    this.entry.pokemon.get(this.selectedPokemonUuid)?.sheet?.render(true);
  }

  static #retry() {
    this.render();
  }
}

export async function openTrainerBag(trainer = null) {
  const existing = foundry.applications.instances.get(APP_ID);
  try {
    if (existing) {
      if (trainer) {existing.trainerUuid = trainer.uuid;}
      await existing.render({ force: true });
      existing.bringToFront();
      return;
    }
    await new TrainerBag({ trainerUuid: trainer?.uuid ?? null }).render({ force: true });
  } catch (error) {
    console.error(`[poke5e-local] ${APP_ID}`, error);
    ui.notifications.error(labels().openFailed);
  }
}

export async function toggleTrainerBag() {
  const existing = foundry.applications.instances.get(APP_ID);
  if (existing) {
    await existing.close();
    return;
  }
  await openTrainerBag();
}

export function registerTrainerBag() {
  const refresh = () => {
    const app = foundry.applications.instances.get(APP_ID);
    if (app?.rendered) {app.render();}
  };
  for (const hook of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, refresh);
  }
}
