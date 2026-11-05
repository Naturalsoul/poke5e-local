import { getLanguage } from "./i18n.mjs";
import { openTrainerBag } from "./trainer-bag.mjs";
import { getTrainerLevel } from "./trainer-service.mjs";
import { currentTrainerSheetDesign } from "./trainer-sheet-design.mjs";

/* ============================================================
 * TRAINER PIXEL SHEET
 *
 * The trainer sheet in the PC's look. dnd5e still provides the
 * rules: rolls, configuration dialogs, the Details and Features
 * tabs. Everything else is this module's own: header and sidebar
 * come from its templates instead of being patched after dnd5e
 * draws them, and items live in the Bag (trainer-bag.mjs).
 *
 * The Pokémon tab is mounted by trainer-sheet-ui.mjs, like on the
 * classic sheet, so both share the command center.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const TEMPLATES = `modules/${MODULE_ID}/templates/actors`;
const SIZE = Object.freeze({ width: 900, height: 720 });

const TEXT = {
  es: { bag: "Mochila", noEffects: "Sin efectos activos." },
  en: { bag: "Bag", noEffects: "No active effects." }
};

const CharacterActorSheet = globalThis.dnd5e.applications.actor.CharacterActorSheet;

const { details, features, abilityScores, warnings, tabs } = CharacterActorSheet.PARTS;

function effectRows(actor) {
  const rows = [...actor.allApplicableEffects()].map(effect => ({
    uuid: effect.uuid,
    name: effect.name,
    img: effect.img,
    disabled: effect.disabled,
    source: effect.parent === actor ? null : effect.parent?.name
  }));
  return rows.sort((left, right) => Number(left.disabled) - Number(right.disabled) || left.name.localeCompare(right.name));
}

export class TrainerPixelSheet extends CharacterActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["poke5e-pc", "poke5e-trainer-pixel-sheet"],
    actions: {
      deleteEffect: TrainerPixelSheet.#deleteEffect,
      openBag: TrainerPixelSheet.#openBag,
      toggleEffect: TrainerPixelSheet.#toggleEffect
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATES}/trainer-pixel-header.hbs` },
    sidebar: {
      container: { classes: ["main-content"], id: "main" },
      template: `${TEMPLATES}/trainer-pixel-sidebar.hbs`
    },
    pokemon: {
      container: { classes: ["tab-body"], id: "tabs" },
      template: `${TEMPLATES}/trainer-pokemon-tab.hbs`,
      scrollable: [""]
    },
    details,
    features,
    abilityScores,
    warnings,
    tabs
  };

  static TABS = [
    { tab: "pokemon", label: "Pokémon", icon: "poke5e-icon-pokeball" },
    ...CharacterActorSheet.TABS.filter(({ tab }) => tab === "details" || tab === "features")
  ];

  tabGroups = { primary: "pokemon" };

  // dnd5e keeps one saved size for all character sheets; this one must not overwrite what the classic sheet uses.
  _saveSheetPosition = () => {};

  // dnd5e reserves the width of nav.tabs as an overhang beside the window; here the tabs are a row inside it.
  _updatePosition(position) {
    return foundry.applications.api.ApplicationV2.prototype._updatePosition.call(this, position);
  }

  _initializeApplicationOptions(options) {
    const applicationOptions = super._initializeApplicationOptions(options);
    Object.assign(applicationOptions.position, SIZE);
    return applicationOptions;
  }

  async _prepareContext(options) {
    return { ...await super._prepareContext(options), pixelText: TEXT[getLanguage()], trainerLevel: getTrainerLevel(this.actor) };
  }

  async _prepareSidebarContext(context, options) {
    const prepared = await super._prepareSidebarContext(context, options);
    const { hp, death } = this.actor.system.attributes;
    prepared.trainerEffects = effectRows(this.actor);
    prepared.showDeathSaves = hp.value <= 0 || death.success > 0 || death.failure > 0;
    return prepared;
  }

  // dnd5e draws this into the inventory tab, which this sheet does not have.
  _renderAttunement() {}

  async _onRender(context, options) {
    await super._onRender(context, options);
    const rocket = currentTrainerSheetDesign() === "rocket";
    this.element.classList.toggle("poke5e-trainer-pixel-sheet--rocket", rocket);
    // Each design has one palette, whatever Foundry theme the player uses: dnd5e's parts of the sheet have to match it.
    this.element.classList.remove("theme-light", "theme-dark");
    this.element.classList.add("themed", rocket ? "theme-dark" : "theme-light");
  }

  static #openBag() {
    void openTrainerBag(this.actor);
  }

  static async #toggleEffect(event, target) {
    const effect = await fromUuid(target.closest("[data-effect-uuid]").dataset.effectUuid);
    await effect?.update({ disabled: !effect.disabled });
  }

  static async #deleteEffect(event, target) {
    const effect = await fromUuid(target.closest("[data-effect-uuid]").dataset.effectUuid);
    await effect?.deleteDialog();
  }
}
