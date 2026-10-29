import { escapeHtml } from "./html.mjs";
import {
  buildActorSource,
  buildPokemonMedia,
  missingHoverMovementUpdate
} from "./builder.mjs";

import {
  assignPokemonShinyState,
  getPokemonShinyState,
  synchronizePokemonShinyArtwork
} from "./shiny-runtime.mjs";

import {
  getDefaultShinyRuleId
} from "./shiny-rules.mjs";

import {
  getPokemonGender,
  getPokemonGenderRatio,
  rollPokemonGender
} from "./gender-runtime.mjs";

import {
  buildCompositePokemonDatabase
} from "./fakemon-catalog-service.mjs";

import {
  fakemonRepository
} from "./fakemon-repository.mjs";

const MODULE_ID = "poke5e-local";
const IMPORTER_VERSION = "0.18.9";
const DATA_ROOT = `modules/${MODULE_ID}/data/normalized`;

const DATA_PATHS = {
  pokemon:
    `${DATA_ROOT}/pokemon.json`,

  moves:
    `${DATA_ROOT}/moves.json`,

  abilities:
    `${DATA_ROOT}/abilities.json`,

  evolutions:
    `${DATA_ROOT}/evolutions.json`,

  items:
    `${DATA_ROOT}/items.json`
};

const POKEMON_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy"
];

const TYPE_LABELS = {
  es: {
    normal: "Normal",
    fire: "Fuego",
    water: "Agua",
    electric: "Eléctrico",
    grass: "Planta",
    ice: "Hielo",
    fighting: "Lucha",
    poison: "Veneno",
    ground: "Tierra",
    flying: "Volador",
    psychic: "Psíquico",
    bug: "Bicho",
    rock: "Roca",
    ghost: "Fantasma",
    dragon: "Dragón",
    dark: "Siniestro",
    steel: "Acero",
    fairy: "Hada"
  },
  en: {
    normal: "Normal",
    fire: "Fire",
    water: "Water",
    electric: "Electric",
    grass: "Grass",
    ice: "Ice",
    fighting: "Fighting",
    poison: "Poison",
    ground: "Ground",
    flying: "Flying",
    psychic: "Psychic",
    bug: "Bug",
    rock: "Rock",
    ghost: "Ghost",
    dragon: "Dragon",
    dark: "Dark",
    steel: "Steel",
    fairy: "Fairy"
  }
};

const TYPE_COLORS = {
  normal: "#A8A77A",
  fire: "#EE8130",
  water: "#6390F0",
  electric: "#F7D02C",
  grass: "#7AC74C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dragon: "#6F35FC",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD"
};

const ROOT_FOLDER_COLOR = "#D32F2F";
const REIMPORT_MANAGED_ITEM_KINDS =
  new Set([
    "move",
    "ability"
  ]);
const MANAGED_ACTOR_EFFECT_KINDS =
  new Set([
    "pokemon-proficiency"
  ]);
const PRESERVED_POKEMON_STATE_FLAGS = [
  "trainerOwnerUuid",
  "knownMoveIds",
  "extraMoveSlots",
  "pokemonProgression",
  "grantedHiddenAbilities",
  "heldItemId",
  "nickname",
  "nature",
  "shiny",
  "gender"
];
const { ApplicationV2 } = foundry.applications.api;

/* ============================================================
 * REPOSITORY
 * ============================================================ */

class PokemonRepository {
  #loadPromise = null;
  #pokemon = [];
  #moves = [];
  #abilities = [];
  #evolutions = [];
  #items = [];
  #pokemonById = new Map();
  #abilityById = new Map();

  async load() {
    if (!this.#loadPromise) {
      this.#loadPromise = this.#loadData().catch(error => {
        this.#loadPromise = null;
        throw error;
      });
    }

    await this.#loadPromise;
    return this;
  }

  get pokemon() {
    return this.#pokemon;
  }

  get moves() {
    return this.#moves;
  }

  get abilities() {
    return this.#abilities;
  }

  get evolutions() {
    return this.#evolutions;
  }

  get items() {
    return this.#items;
  }

  getPokemon(id) {
    return this.#pokemonById.get(String(id)) ?? null;
  }

  getAbility(id) {
    return this.#abilityById.get(
      String(id)
    ) ?? null;
  }

  get srValues() {
    return [
      ...new Set(
        this.#pokemon
          .map(entry => entry.sr)
          .filter(value => value != null)
      )
    ]
      .sort(compareNumericLike)
      .map(String);
  }

  async #loadData() {
    const [
      pokemonData,
      movesData,
      abilitiesData,
      evolutionsData,
      itemsData
    ] = await Promise.all([
      loadJson(
        DATA_PATHS.pokemon
      ),

      loadJson(
        DATA_PATHS.moves
      ),

      loadJson(
        DATA_PATHS.abilities
      ),

      loadJson(
        DATA_PATHS.evolutions
      ),

      loadJson(
        DATA_PATHS.items
      )
    ]);


    this.#pokemon =
      extractCollection(
        pokemonData,
        [
          "pokemon",
          "items"
        ]
      )
        .filter(
          entry =>
            entry?.id
        )
        .sort(
          comparePokemon
        );


    this.#moves =
      extractCollection(
        movesData,
        [
          "moves",
          "items"
        ]
      );


    this.#abilities =
      extractCollection(
        abilitiesData,
        [
          "abilities",
          "items"
        ]
      );


    this.#evolutions =
      extractCollection(
        evolutionsData,
        [
          "evolutions",
          "items"
        ]
      );

    this.#items =
      extractCollection(
        itemsData,
        [
          "items"
        ]
      );


    this.#pokemonById =
      new Map(
        this.#pokemon.map(
          entry => [
            String(
              entry.id
            ),
            entry
          ]
        )
      );


    this.#abilityById =
      new Map(
        this.#abilities
          .filter(
            entry =>
              entry?.id
          )
          .map(
            entry => [
              String(
                entry.id
              ),
              entry
            ]
          )
      );


    console.log(
      `[${MODULE_ID}] Datos cargados: ` +
      `${this.#pokemon.length} Pokémon, ` +
      `${this.#moves.length} moves, ` +
      `${this.#abilities.length} abilities, ` +
      `${this.#evolutions.length} evolutions, ` +
      `${this.#items.length} items.`
    );
  }
}

/* ============================================================
 * FOLDERS
 * ============================================================ */

class PokemonFolderService {
  constructor(language) {
    this.language = normalizeLanguage(language);
  }

  async prepareAllTypes() {
    const root = await this.#ensureRootFolder();

    for (const type of POKEMON_TYPES) {
      await this.#ensureTypeFolder(
        root,
        type
      );
    }

    return root;
  }

  async folderFor(pokemon) {
    const root = await this.#ensureRootFolder();

    const primaryType = normalizeType(
      pokemon.primaryType ??
      pokemon.types?.[0] ??
      "normal"
    );

    const typeFolder = await this.#ensureTypeFolder(
      root,
      primaryType
    );

    const srFolder = await this.#ensureSrFolder(
      typeFolder,
      pokemon.sr
    );

    return this.#ensureSpeciesFolder(
      srFolder,
      pokemon
    );
  }

  async #ensureRootFolder() {
    const existing = findFolder({
      kind: "pokemon-root",
      parentId: null
    });

    const name = "Pokemon";

    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name,
          color: ROOT_FOLDER_COLOR
        }
      );

      return existing;
    }

    return Folder.create({
      name,
      type: "Actor",
      folder: null,
      color: ROOT_FOLDER_COLOR,

      flags: {
        [MODULE_ID]: {
          kind: "pokemon-root"
        }
      }
    });
  }

  async #ensureTypeFolder(
    root,
    type
  ) {
    const normalizedType =
      POKEMON_TYPES.includes(type)
        ? type
        : "normal";

    const existing = findFolder({
      kind: "pokemon-type",
      parentId: root.id,

      predicate: folder =>
        folder.getFlag(
          MODULE_ID,
          "type"
        ) === normalizedType
    });

    const name =
      TYPE_LABELS[this.language][normalizedType] ??
      normalizedType;

    const color =
      TYPE_COLORS[normalizedType] ??
      null;

    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name,
          color
        }
      );

      return existing;
    }

    return Folder.create({
      name,
      type: "Actor",
      folder: root.id,
      color,

      flags: {
        [MODULE_ID]: {
          kind: "pokemon-type",
          type: normalizedType
        }
      }
    });
  }

  async #ensureSrFolder(
    typeFolder,
    sr
  ) {
    const srKey = normalizeSr(sr);

    const existing = findFolder({
      kind: "pokemon-sr",
      parentId: typeFolder.id,

      predicate: folder =>
        normalizeSr(
          folder.getFlag(
            MODULE_ID,
            "sr"
          )
        ) === srKey
    });

    const name = `SR ${srKey}`;

    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name,
          color: null
        }
      );

      return existing;
    }

    return Folder.create({
      name,
      type: "Actor",
      folder: typeFolder.id,
      color: null,

      flags: {
        [MODULE_ID]: {
          kind: "pokemon-sr",
          sr: srKey
        }
      }
    });
  }

  async #ensureSpeciesFolder(srFolder, pokemon) {
    const sourceId = String(pokemon.id);

    const existing = findFolder({
      kind: "pokemon-species",
      parentId: srFolder.id,
      predicate: folder =>
        String(
          folder.getFlag(
            MODULE_ID,
            "sourceId"
          ) ?? ""
        ) === sourceId
    });

    const name = localized(
      pokemon.name,
      this.language,
      sourceId
    );

    if (existing) {
      const changes = {};

      if (existing.name !== name) {
        changes.name = name;
      }

      if (existing.sorting !== "m") {
        changes.sorting = "m";
      }

      if (Object.keys(changes).length) {
        await existing.update(changes);
      }

      return existing;
    }

    return Folder.create({
      name,
      type: "Actor",
      folder: srFolder.id,
      color: null,
      sorting: "m",

      flags: {
        [MODULE_ID]: {
          kind: "pokemon-species",
          sourceId
        }
      }
    });
  }
}


/* ============================================================
 * IMPORT SERVICE
 * ============================================================ */

class PokemonImportService {
  constructor(
    repository,
    language
  ) {
    this.repository = repository;
    this.language = normalizeLanguage(language);
    this.folders = new PokemonFolderService(
      this.language
    );
  }

  async prepare() {
    await this.repository.load();
    await this.folders.prepareAllTypes();
  }

  async importPokemon(
    pokemon,
    {
      updateExisting = false,
      createNewInstance = false,
      targetActor = null,
      level = null,
      abilityScoreGains = null,
      abilityScoreBase = null,
      additionalSavingThrows = null,
      additionalSkillProficiencies = null,
      allowSpeciesChange = false
    } = {}
  ) {
    if (!pokemon?.id) {
      throw new Error(
        "Pokémon inválido."
      );
    }

    const importLevel =
      clampPokemonLevel(
        pokemon,
        level ??
        pokemon.minimumLevel
      );

    const explicitTarget =
      targetActor ??
      null;


    if (
      explicitTarget &&
      createNewInstance
    ) {

      throw new Error(
        "targetActor y createNewInstance no pueden utilizarse simultáneamente."
      );
    }


    if (
      explicitTarget
    ) {

      const targetSourceId =
        String(
          getDocumentFlag(
            explicitTarget,
            "sourceId"
          ) ??
          ""
        );


      const speciesMatches =
        targetSourceId ===
          String(
            pokemon.id
          );


      if (
        explicitTarget.documentName !==
          "Actor" ||
        (
          !speciesMatches &&
          !allowSpeciesChange
        )
      ) {

        throw new Error(
          "targetActor no corresponde al Pokémon solicitado."
        );
      }
    }


    const existing =
      explicitTarget ??
      (
        createNewInstance
          ? null
          : resolvePokemonImportTarget(
              pokemon.id,
              importLevel,
              {
                updateExisting
              }
            )
      );


    if (
      existing &&
      !updateExisting &&
      !explicitTarget
    ) {

      return {
        status:
          "skipped",

        actor:
          existing,

        pokemon,

        level:
          importLevel
      };
    }

    if (
      existing &&
      !updateExisting
    ) {
      return {
        status: "skipped",
        actor: existing,
        pokemon,
        level: importLevel
      };
    }

    const folder =
      await this.folders.folderFor(
        pokemon
      );

    const existingProgression =
      existing
        ? getDocumentFlag(
            existing,
            "pokemonProgression"
          ) ??
          {}
        : {};


    const retainedProficiencies =
      existingProgression
        .retainedProficiencies &&
      typeof existingProgression
        .retainedProficiencies ===
          "object"
        ? existingProgression
            .retainedProficiencies
        : {};


    const resolvedAbilityScoreGains =
      abilityScoreGains == null
        ? foundry.utils.deepClone(
            existingProgression
              .abilityScoreGains ??
            {}
          )
        : foundry.utils.deepClone(
            abilityScoreGains
          );


    const resolvedAbilityScoreBase =
      abilityScoreBase == null
        ? foundry.utils.deepClone(
            existingProgression
              .abilityScoreBase ??
            {}
          )
        : foundry.utils.deepClone(
            abilityScoreBase
          );


    const resolvedAdditionalSavingThrows =
      additionalSavingThrows == null
        ? foundry.utils.deepClone(
            retainedProficiencies
              .savingThrows ??
            []
          )
        : foundry.utils.deepClone(
            additionalSavingThrows
          );


    const resolvedAdditionalSkillProficiencies =
      additionalSkillProficiencies == null
        ? foundry.utils.deepClone(
            retainedProficiencies
              .skills ??
            {}
          )
        : foundry.utils.deepClone(
            additionalSkillProficiencies
          );

    /*
    * Primero construimos el source.
    *
    * Solo después de esto podemos consultar
    * source.flags para validar el nivel que
    * produjo el Builder.
    */
    const source =
      buildActorSource({
        pokemon,

        moves:
          this.repository.moves,

        abilities:
          this.repository.abilities,

        language:
          this.language,

        level:
          importLevel,

        abilityScoreGains:
          resolvedAbilityScoreGains,

        abilityScoreBase:
          resolvedAbilityScoreBase,

        additionalSavingThrows:
          resolvedAdditionalSavingThrows,

        additionalSkillProficiencies:
          resolvedAdditionalSkillProficiencies,
      });

    /*
    * Contrato Importer -> Builder.
    *
    * Si el Importer pidió un nivel concreto,
    * el Builder debe producir exactamente
    * ese mismo nivel.
    */
    const builtLevel =
      Number(
        source?.flags
          ?.[MODULE_ID]
          ?.level
      );

    if (
      !Number.isFinite(
        builtLevel
      ) ||
      builtLevel !==
        importLevel
    ) {
      throw new Error(
        `[${MODULE_ID}] Nivel inconsistente para ${pokemon.id}: ` +
        `Importer=${importLevel}, Builder=${String(builtLevel)}.`
      );
    }

    const placement =
      resolvePokemonImportPlacement(
        existing,
        folder,
        importLevel
      );

    source.folder =
      placement.folderId;

    source.sort =
      placement.sort;

    if (existing) {
      const actor =
        await updateActor(
          existing,
          source
        );

      return {
        status: "updated",
        actor,
        pokemon,
        level: importLevel
      };
    }

    const actor =
      await Actor.create(
        source,
        {
          renderSheet: false
        }
      );

    return {
      status: "created",
      actor,
      pokemon,
      level: importLevel
    };
  }
}

function createImporterState(initial = {}) {
  const selected =
    initial.selected instanceof Set
      ? initial.selected
      : new Set(
          Array.isArray(initial.selected)
            ? initial.selected
            : []
        );

  const levels =
    initial.levels instanceof Map
      ? initial.levels
      : new Map(
          Array.isArray(initial.levels)
            ? initial.levels
            : []
        );

  return {
    search:
      typeof initial.search === "string"
        ? initial.search
        : "",

    type:
      typeof initial.type === "string"
        ? initial.type
        : "",

    sr:
      typeof initial.sr === "string"
        ? initial.sr
        : "",

    language:
      normalizeLanguage(
        initial.language ??
        getWorldLanguage()
      ),

    updateExisting:
      Boolean(
        initial.updateExisting
      ),

    createNewInstance:
      Boolean(
        initial.createNewInstance
      ),

    selected,
    levels,

    busy:
      Boolean(initial.busy)
  };
}

function ensureImporterState(app) {
  const current =
    app._poke5eImporterState;

  if (!current) {
    app._poke5eImporterState =
      createImporterState();

    return app._poke5eImporterState;
  }

  /*
   * Reparación defensiva.
   *
   * Esto también protege el importer si en una
   * futura modificación se crea un estado parcial.
   */
  if (
    !(current.selected instanceof Set)
  ) {
    current.selected =
      new Set(
        Array.isArray(
          current.selected
        )
          ? current.selected
          : []
      );
  }

  if (!(current.levels instanceof Map)) {
    current.levels =
      new Map(
        Array.isArray(current.levels)
          ? current.levels
          : []
      );
  }

  current.search ??= "";
  current.type ??= "";
  current.sr ??= "";

  current.language =
    normalizeLanguage(
      current.language ??
      getWorldLanguage()
    );

  current.updateExisting =
    Boolean(
      current.updateExisting
    );

  current.createNewInstance =
    Boolean(
      current.createNewInstance
    );

  current.busy =
    Boolean(
      current.busy
    );

  return current;
}

/* ============================================================
 * APPLICATION
 * ============================================================ */

export class Poke5eImporter extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "poke5e-importer",

    classes: [
      "poke5e-importer"
    ],

    tagName: "div",

    position: {
      width: 1100,
      height: 720
    },

    window: {
      frame: true,
      positioned: true,
      resizable: true,
      title: "Poke5e Importer",
      icon: "poke5e-icon-pokeball"
    }
  };

  constructor(options = {}) {
    super(options);

    this._poke5eImporterState =
      createImporterState();

    this._poke5eSearchTimer =
      null;

    this._poke5eSearchFocus =
      null;

    this._catalogPokemon =
      [];

    this._catalogPokemonById =
      new Map();

    this._catalogSrValues =
      [];
  }

  get importerState() {
    return ensureImporterState(this);
  }

  async _prepareContext() {

    const database =
      await loadDatabase();


    this.#setCatalogPokemon(
      database.pokemon
    );


    const visible =
      filterPokemon(
        this._catalogPokemon,
        this.importerState
      );


    return {
      pokemon:
        visible,

      srValues:
        this._catalogSrValues,

      selectedCount:
        this.importerState.selected.size,

      totalCount:
        this._catalogPokemon.length,

      visibleCount:
        visible.length
    };
  }


  #setCatalogPokemon(
    pokemon
  ) {

    this._catalogPokemon =
      Array.isArray(
        pokemon
      )
        ? pokemon
        : [];


    this._catalogPokemonById =
      new Map(
        this._catalogPokemon
          .filter(
            entry =>
              entry?.id
          )
          .map(
            entry => [
              String(
                entry.id
              ),

              entry
            ]
          )
      );


    this._catalogSrValues =
      [
        ...new Set(
          this._catalogPokemon
            .map(
              entry =>
                entry.sr
            )
            .filter(
              value =>
                value != null
            )
        )
      ]
        .sort(
          compareNumericLike
        )
        .map(
          String
        );
  }


  #getCatalogPokemon(
    id
  ) {

    return (
      this._catalogPokemonById
        .get(
          String(
            id
          )
        ) ??
      null
    );
  }

  async _renderHTML(
    context
  ) {
    const state =
      this.importerState;
    const typeOptions =
      POKEMON_TYPES
        .map(type => {
          const selected =
            state.type === type
              ? " selected"
              : "";

          return (
            `<option value="${escapeHtml(type)}"${selected}>` +
            `${escapeHtml(TYPE_LABELS[state.language][type])}` +
            `</option>`
          );
        })
        .join("");

    const srOptions =
      context.srValues
        .map(sr => {
          const selected =
            this.importerState.sr === sr
              ? " selected"
              : "";

          return (
            `<option value="${escapeHtml(sr)}"${selected}>` +
            `SR ${escapeHtml(sr)}` +
            `</option>`
          );
        })
        .join("");

    const rows =
      context.pokemon
        .map(pokemon => {
          const id =
            String(
              pokemon.id
            );

          const checked =
            state.selected.has(id)
              ? " checked"
              : "";

          const minimumLevel =
            getPokemonMinimumLevel(
              pokemon
            );

          const importLevel =
            getPokemonImportLevel(
              state,
              pokemon
            );

          const matchingActors =
            findPokemonActors(
              id,
              importLevel
            );

          const imported =
            matchingActors.length >
            0;

          const name =
            localized(
              pokemon.name,
              state.language,
              id
            );

          const dex =
            pokemon.dexNumber ??
            "—";

          const primaryType =
            normalizeType(
              pokemon.primaryType ??
              pokemon.types?.[0] ??
              "normal"
            );

          const typeLabel =
            TYPE_LABELS[
              this.importerState.language
            ][primaryType] ??
            primaryType;

          const status =
            imported
              ? `
                <i
                  class="fa-solid fa-circle-check"
                  title="${matchingActors.length} instancia(s) de este Pokémon y nivel ya importada(s)"
                ></i>
              `
              : "";

          return `
            <tr data-pokemon-id="${escapeHtml(id)}">
              <td>
                <input
                  type="checkbox"
                  data-role="pokemon-checkbox"
                  value="${escapeHtml(id)}"
                  ${checked}
                >
              </td>

              <td>
                ${escapeHtml(String(dex))}
              </td>

              <td>
                <strong>
                  ${escapeHtml(name)}
                </strong>

                <div class="hint">
                  ${escapeHtml(id)}
                </div>
              </td>

              <td>
                ${escapeHtml(typeLabel)}
              </td>

              <td>
                SR ${escapeHtml(normalizeSr(pokemon.sr))}
              </td>

              <td class="poke5e-importer__level">
                <input
                  type="number"
                  data-role="level-input"
                  data-pokemon-id="${escapeHtml(id)}"
                  min="${minimumLevel}"
                  max="20"
                  step="1"
                  value="${importLevel}"
                  title="Nivel permitido: ${minimumLevel}–20"
                >
              </td>

              <td class="poke5e-importer__status">
                ${status}
              </td>
            </tr>
          `;
        })
        .join("");

    return `
      <section class="poke5e-importer__content">
        <div class="poke5e-importer__filters">
          <input
            type="search"
            data-role="search"
            placeholder="Buscar por nombre, ID o Pokédex"
            value="${escapeHtml(state.search)}"
          >

          <select data-role="type-filter">
            <option value="">
              Todos los tipos
            </option>

            ${typeOptions}
          </select>

          <select data-role="sr-filter">
            <option value="">
              Todos los SR
            </option>

            ${srOptions}
          </select>

          <select data-role="language">
            <option
              value="es"
              ${this.importerState.language === "es" ? " selected" : ""}
            >
              Español
            </option>

            <option
              value="en"
              ${this.importerState.language === "en" ? " selected" : ""}
            >
              English
            </option>
          </select>
        </div>

        <div class="poke5e-importer__actions">
          <button
            type="button"
            data-action="select-visible"
          >
            <i class="fa-solid fa-check-double"></i>
            Seleccionar visibles
          </button>

          <button
            type="button"
            data-action="clear-selection"
          >
            <i class="fa-solid fa-xmark"></i>
            Deseleccionar
          </button>

          <label>
            <input
              type="checkbox"
              data-role="create-new-instance"
              ${this.importerState.createNewInstance ? " checked" : ""}
            >

            Crear nueva instancia aunque ya exista
          </label>

          <label>
            <input
              type="checkbox"
              data-role="update-existing"
              ${this.importerState.updateExisting ? " checked" : ""}
            >

            Actualizar Pokémon que ya existen
          </label>

          <span class="poke5e-importer__counter">
            ${context.visibleCount}/${context.totalCount} visibles ·
            ${context.selectedCount} seleccionados
          </span>
        </div>

        <div class="poke5e-importer__table-wrap">
          <table class="poke5e-importer__table">
            <colgroup>
              <col style="width: 38px;">
              <col style="width: 55px;">
              <col style="width: 230px;">
              <col style="width: 125px;">
              <col style="width: 70px;">
              <col style="width: 75px;">
              <col style="width: 38px;">
            </colgroup>
            <thead>
              <tr>
                <th></th>
                <th>#</th>
                <th>Pokémon</th>
                <th>Tipo principal</th>
                <th>SR</th>
                <th>Nivel</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              ${
                rows ||
                '<tr><td colspan="7">No hay resultados.</td></tr>'
              }
            </tbody>
          </table>
        </div>

        <footer class="poke5e-importer__footer">
          <button
            type="button"
            data-action="repair"
            ${this.importerState.busy ? " disabled" : ""}
          >
            <i class="fa-solid fa-screwdriver-wrench"></i>
            Reparar datos antiguos
          </button>

          <button
            type="button"
            data-action="import"
            ${
              this.importerState.busy ||
              !this.importerState.selected.size
                ? " disabled"
                : ""
            }
          >
            <i class="fa-solid fa-file-import"></i>

            ${
              this.importerState.busy
                ? "Procesando…"
                : "Importar seleccionados"
            }
          </button>
        </footer>
      </section>
    `;
  }

  _replaceHTML(
    result,
    content
  ) {
    content.innerHTML =
      result;
  }

  async _onRender(
    context,
    options
  ) {
    await super._onRender(
      context,
      options
    );

    const root =
      this.element;
    
    const state =
      this.importerState;

    const searchInput =
      root.querySelector(
        '[data-role="search"]'
      );

    searchInput?.addEventListener(
      "input",
      event => {
        const input =
          event.currentTarget;

        state.search =
          input.value;

        this.#scheduleSearchRender(
          input
        );
      }
    );

    root
      .querySelector(
        '[data-role="type-filter"]'
      )
      ?.addEventListener(
        "change",
        event => {
          state.type =
            event.currentTarget.value;

          void this.render({
            force: true
          });
        }
      );

    root
      .querySelector(
        '[data-role="sr-filter"]'
      )
      ?.addEventListener(
        "change",
        event => {
          state.sr =
            event.currentTarget.value;

          void this.render({
            force: true
          });
        }
      );

    root
      .querySelector(
        '[data-role="language"]'
      )
      ?.addEventListener(
        "change",
        async event => {
          state.language =
            normalizeLanguage(
              event.currentTarget.value
            );

          await setWorldLanguage(
            state.language
          );

          await this.render({
            force: true
          });
        }
      );

    root
      .querySelector(
        '[data-role="update-existing"]'
      )
      ?.addEventListener(
        "change",
        event => {
          const checked =
            Boolean(
              event.currentTarget.checked
            );

          state.updateExisting =
            checked;

          if (!checked) {
            return;
          }

          state.createNewInstance =
            false;

          const createNewInput =
            root.querySelector(
              '[data-role="create-new-instance"]'
            );

          if (createNewInput) {
            createNewInput.checked =
              false;
          }
        }
      );

    root
      .querySelector(
        '[data-role="create-new-instance"]'
      )
      ?.addEventListener(
        "change",
        event => {
          const checked =
            Boolean(
              event.currentTarget.checked
            );

          state.createNewInstance =
            checked;

          if (!checked) {
            return;
          }

          state.updateExisting =
            false;

          const updateInput =
            root.querySelector(
              '[data-role="update-existing"]'
            );

          if (updateInput) {
            updateInput.checked =
              false;
          }
        }
      );

    root
      .querySelectorAll(
        '[data-role="pokemon-checkbox"]'
      )
      .forEach(input => {
        input.addEventListener(
          "change",
          event => {
            const id =
              String(
                event.currentTarget.value
              );

            if (
              event.currentTarget.checked
            ) {
              state.selected.add(
                id
              );
            } else {
              state.selected.delete(
                id
              );
            }

            this.#updateSelectionUi();
          }
        );
      });

    root
      .querySelector(
        '[data-action="select-visible"]'
      )
      ?.addEventListener(
        "click",
        async () => {
          const visible =
            filterPokemon(
              this._catalogPokemon,
              this.importerState
            );

          visible.forEach(
            pokemon =>
              this.importerState.selected.add(
                String(
                  pokemon.id
                )
              )
          );

          await this.render({
            force: true
          });
        }
      );

    root
      .querySelectorAll(
        '[data-role="level-input"]'
      )
      .forEach(input => {
        input.addEventListener(
          "input",
          event => {
            const element =
              event.currentTarget;

            const id =
              String(
                element.dataset.pokemonId
              );

            const pokemon =
              this.#getCatalogPokemon(
                id
              );

            if (!pokemon) {
              return;
            }

            state.levels.set(
              id,
              clampPokemonLevel(
                pokemon,
                element.value
              )
            );
          }
        );

        input.addEventListener(
          "change",
          event => {
            const element =
              event.currentTarget;

            const id =
              String(
                element.dataset.pokemonId
              );

            const pokemon =
              this.#getCatalogPokemon(
                id
              );

            if (!pokemon) {
              return;
            }

            const level =
              clampPokemonLevel(
                pokemon,
                element.value
              );

            /*
            * Guardar nivel específico para este Pokémon.
            */
            state.levels.set(
              id,
              level
            );

            /*
            * Reflejar cualquier corrección.
            *
            * Ej:
            * Rampardos min 5
            * usuario escribe 2
            * → vuelve automáticamente a 5.
            */
            element.value =
              String(level);

            const row =
              element.closest("tr");

            const status =
              row?.querySelector(
                ".poke5e-importer__status"
              );

            if (status) {
              const imported =
                findPokemonActors(
                  id,
                  level
                ).length > 0;

              status.innerHTML =
                imported
                  ? `
                    <i
                      class="fa-solid fa-circle-check"
                      title="Este Pokémon y nivel ya están importados"
                    ></i>
                  `
                  : "";
            }
          }
        );
      });

    root
      .querySelector(
        '[data-action="clear-selection"]'
      )
      ?.addEventListener(
        "click",
        async () => {
          this.importerState.selected.clear();

          await this.render({
            force: true
          });
        }
      );

    root
      .querySelector(
        '[data-action="import"]'
      )
      ?.addEventListener(
        "click",
        () => {
          void this.importSelected();
        }
      );

    root
      .querySelector(
        '[data-action="repair"]'
      )
      ?.addEventListener(
        "click",
        () => {
          void this.repairLegacyData();
        }
      );

    this.#restoreSearchFocus(
      root
    );

    this.#updateSelectionUi();
  }

  async importSelected() {
    const state =
      this.importerState;

    if (
      state.busy ||
      !state.selected.size
    ) {
      return;
    }

    /*
    * Snapshot inmutable de lo que el usuario
    * ve y seleccionó ANTES de reconstruir la UI.
    *
    * Desde este punto la importación no vuelve
    * a consultar los inputs ni recalcula el nivel.
    */
    const importPlan =
      this.#createImportPlan();

    const updateExisting =
      state.updateExisting;

    const createNewInstance =
      state.createNewInstance;

    state.busy = true;

    await this.render({
      force: true
    });

    const service =
      new PokemonImportService(
        repository,
        state.language
      );

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0
    };

    try {
      await service.prepare();

      for (
        const request
        of importPlan
      ) {
        const {
          id,
          pokemon,
          level
        } = request;

        if (!pokemon) {
          results.failed += 1;

          console.error(
            `[${MODULE_ID}] Pokémon no encontrado: ${id}`
          );

          continue;
        }

        try {
          const result =
            await service.importPokemon(
              pokemon,
              {
                updateExisting,
                createNewInstance,
                level
              }
            );

          results[
            result.status
          ] += 1;

          if (
            result.status !==
            "skipped"
          ) {
            state.selected.delete(
              id
            );
          }
        } catch (error) {
          results.failed += 1;

          console.error(
            `[${MODULE_ID}] ${pokemon.id}`,
            error
          );
        }
      }

      notifyImportResults(
        results
      );
    } finally {
      state.busy =
        false;

      await this.render({
        force: true
      });
    }
  }

  #createImportPlan() {
    const state =
      this.importerState;

    const visibleLevels =
      new Map();

    this.element
      .querySelectorAll(
        '[data-role="level-input"]'
      )
      .forEach(input => {
        const id =
          String(
            input.dataset.pokemonId ??
            ""
          );

        if (!id) {
          return;
        }

        const pokemon =
          this.#getCatalogPokemon(
            id
          )

        if (!pokemon) {
          return;
        }

        visibleLevels.set(
          id,
          clampPokemonLevel(
            pokemon,
            input.value
          )
        );
      });

    return [
      ...state.selected
    ].map(id => {
      const pokemon =
        this.#getCatalogPokemon(
          id
        )

      if (!pokemon) {
        return {
          id,
          pokemon: null,
          level: null
        };
      }

      const level =
        visibleLevels.has(
          id
        )
          ? visibleLevels.get(
              id
            )
          : getPokemonImportLevel(
              state,
              pokemon
            );

      state.levels.set(
        id,
        level
      );

      return {
        id,
        pokemon,
        level
      };
    });
  }

  async repairLegacyData() {

    const state =
      this.importerState;


    if (
      state.busy
    ) {

      return;
    }


    state.busy =
      true;


    await this.render({
      force:
        true
    });


    try {

      const itemRepair =
        await repairLegacyInvalidPokemonActors({
          language:
            state.language,

          notify:
            true
        });


      const shinyMigration =
        await migrateLegacyTrainerPokemonShiny({
          notify:
            true
        });

      const genderMigration =
        await migrateLegacyPokemonGender({
          notify:
            true
        });


      if (
        !itemRepair.affected &&
        !shinyMigration.affected &&
        !genderMigration.affected
      ) {

        ui.notifications.info(
          "No se encontraron datos Poke5e antiguos que reparar."
        );
      }

    } finally {

      state.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }

  #updateSelectionUi() {
    const state =
      this.importerState;

    /*
    * CONTADOR
    */
    const counter =
      this.element.querySelector(
        ".poke5e-importer__counter"
      );

    if (counter) {
      const visibleCount =
        filterPokemon(
          this._catalogPokemon,
          state
        ).length;

      counter.textContent =
        `${visibleCount}/${this._catalogPokemon.length} visibles · ` +
        `${state.selected.size} seleccionados`;
    }


    /*
    * BOTÓN IMPORTAR
    */
    const importButton =
      this.element.querySelector(
        '[data-action="import"]'
      );

    if (importButton) {
      importButton.disabled =
        state.busy ||
        state.selected.size === 0;
    }
  }

  #scheduleSearchRender(input) {
    if (
      this._poke5eSearchTimer
    ) {
      clearTimeout(
        this._poke5eSearchTimer
      );
    }

    const length =
      input.value.length;

    this._poke5eSearchFocus = {
      start:
        input.selectionStart ??
        length,

      end:
        input.selectionEnd ??
        length
    };

    /*
    * No renderizamos en cada tecla.
    *
    * Esperamos una pequeña pausa para:
    * - evitar reconstruir hasta 1151 filas continuamente;
    * - mantener una escritura fluida;
    * - reducir parpadeos.
    */
    this._poke5eSearchTimer =
      window.setTimeout(
        () => {
          this._poke5eSearchTimer =
            null;

          void this.render({
            force: true
          });
        },
        150
      );
  }


  #restoreSearchFocus(root) {
    const focus =
      this._poke5eSearchFocus;

    if (!focus) {
      return;
    }

    const input =
      root.querySelector(
        '[data-role="search"]'
      );

    if (!input) {
      return;
    }

    input.focus({
      preventScroll: true
    });

    const length =
      input.value.length;

    const start =
      Math.min(
        focus.start,
        length
      );

    const end =
      Math.min(
        focus.end,
        length
      );

    try {
      input.setSelectionRange(
        start,
        end
      );
    } catch {
      /*
      * No hacemos nada si el navegador
      * no permite seleccionar el rango.
      */
    }

    this._poke5eSearchFocus =
      null;
  }
}

/* ============================================================
 * SINGLETONS
 * ============================================================ */

const repository =
  new PokemonRepository();

let importerApp = null;
let importerRegistered = false;

/* ============================================================
 * PUBLIC API
 * ============================================================ */

export async function loadDatabase() {
  await Promise.all([
    repository.load(),
    fakemonRepository.load()
  ]);

  return buildCompositePokemonDatabase({
    official: {
      pokemon:
        repository.pokemon,

      moves:
        repository.moves,

      abilities:
        repository.abilities,

      evolutions:
        repository.evolutions,

      items:
        repository.items
    },

    fakemonStore:
      fakemonRepository.snapshot()
  });
}

async function resolvePokemonDefinition(
  idOrPokemon
) {
  if (
    idOrPokemon &&
    typeof idOrPokemon ===
      "object"
  ) {
    return idOrPokemon;
  }

  const id =
    String(
      idOrPokemon ??
        ""
    ).trim();

  if (!id) {
    return null;
  }

  const database =
    await loadDatabase();

  return (
    database.pokemon.find(
      pokemon =>
        String(
          pokemon?.id ??
            ""
        ) === id
    ) ??
    null
  );
}

export function registerPokemonImporter() {
  if (importerRegistered) {
    return;
  }

  importerRegistered = true;

  Hooks.on(
    "getSceneControlButtons",
    controls => {
      if (
        !controls.tokens
          ?.tools
      ) {
        return;
      }

      controls.tokens.tools
        .poke5eImporter = {
          name:
            "poke5eImporter",

          title:
            "Importar Pokémon Poke5e",

          icon:
            "poke5e-icon-pokeball",

          order:
            Object.keys(
              controls.tokens.tools
            ).length,

          button: true,

          visible:
            game.user.isGM,

          onChange:
            () =>
              openPokemonImporter()
        };
    }
  );

  /*
   * Reparación automática.
   *
   * IMPORTANTE:
   * Los errores de inicialización pueden aparecer
   * una vez antes de llegar a ready.
   *
   * Después de reparar es necesario recargar
   * nuevamente el mundo.
   */
  const runRepair = () => {
  if (!game.user.isGM) {
    return;
  }

  void migratePokemonPrototypeTokens({
    notify: true
  }).catch(error => {
    console.error(
      `[${MODULE_ID}] Error migrando Prototype Tokens Pokémon:`,
      error
    );
  });

  void repairLegacyInvalidPokemonActors({
    language:
      getWorldLanguage(),

    notify: true,

    automatic: true
  }).catch(error => {
    console.error(
      `[${MODULE_ID}] Error durante reparación automática:`,
      error
    );
  });

  void migrateLegacyPokemonGender({
    notify:
      true
  }).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error migrando género Pokémon legacy:`,
        error
      );
    }
  );
};

  if (game.ready) {
    runRepair();
  } else {
    Hooks.once(
      "ready",
      runRepair
    );
  }

  const module =
    game.modules.get(
      MODULE_ID
    );

  if (module) {
    module.api = {
      ...(module.api ?? {}),
      loadDatabase,
      openImporter:
        openPokemonImporter,

      repairLegacyInvalidPokemonActors,

      migratePokemonPrototypeTokens,
      migrateLegacyTrainerPokemonShiny,

      /*
      * Alias temporal para consumidores externos
      * que todavía usen el nombre anterior.
      */
      migratePokemonLinkedPrototypeTokens:
        migratePokemonPrototypeTokens,
      
      migrateLegacyPokemonGender,

      importPokemon,
      repository
    };
  }

  console.log(
    `[${MODULE_ID}] Importer ${IMPORTER_VERSION} registrado.`
  );
}

export function openPokemonImporter() {
  if (!game.user.isGM) {
    ui.notifications.warn(
      "Solo el GM puede abrir el importador Pokémon."
    );

    return null;
  }

  if (
    importerApp?.rendered
  ) {
    importerApp.bringToFront();

    return importerApp;
  }

  importerApp =
    new Poke5eImporter();

  void importerApp.render({
    force: true
  });

  return importerApp;
}

export async function importPokemon(
  idOrPokemon,
  options = {}
) {
  await repository.load();

  const pokemon =
    await resolvePokemonDefinition(
      idOrPokemon
    );

  if (!pokemon) {
    throw new Error(
      `Pokémon no encontrado: ${idOrPokemon}`
    );
  }

  const language =
    normalizeLanguage(
      options.language ??
      getWorldLanguage()
    );

  const service =
    new PokemonImportService(
      repository,
      language
    );

  await service.prepare();

  return service.importPokemon(
    pokemon,
    {
      updateExisting:
        Boolean(
          options.updateExisting
        ),

      createNewInstance:
        Boolean(
          options.createNewInstance
        ),

      targetActor:
        options.targetActor ??
        null,

      level:
        options.level ??
        pokemon.minimumLevel,

      abilityScoreGains:
        options.abilityScoreGains ??
        null,

      abilityScoreBase:
        options.abilityScoreBase ??
        null,

      additionalSavingThrows:
        options.additionalSavingThrows ??
        null,

      additionalSkillProficiencies:
        options.additionalSkillProficiencies ??
        null,
    }
  );
}

export async function rebuildPokemonAsSpecies(
  targetActor,
  idOrPokemon,
  options = {}
) {

  if (
    targetActor?.documentName !==
      "Actor" ||
    !isPoke5eActor(
      targetActor
    )
  ) {

    throw new Error(
      "rebuildPokemonAsSpecies requiere un Actor Pokémon Poke5e."
    );
  }


  await repository.load();


  const pokemon =
    await resolvePokemonDefinition(
      idOrPokemon
    );


  if (!pokemon?.id) {

    throw new Error(
      `Pokémon no encontrado: ${String(idOrPokemon)}`
    );
  }


  const currentLevel =
    getActorPokemonLevel(
      targetActor
    );


  const requestedLevel =
    Number(
      options.level ??
      currentLevel
    );


  if (
    !Number.isInteger(
      requestedLevel
    ) ||
    requestedLevel < 1 ||
    requestedLevel > 20
  ) {

    throw new Error(
      `${targetActor.name} no posee un nivel válido para reconstrucción de especie.`
    );
  }


  const minimumLevel =
    getPokemonMinimumLevel(
      pokemon
    );


  if (
    requestedLevel <
      minimumLevel
  ) {

    throw new Error(
      `${pokemon.id} requiere como mínimo Nv. ${minimumLevel}.`
    );
  }


  const language =
    normalizeLanguage(
      options.language ??
      getWorldLanguage()
    );


  const service =
    new PokemonImportService(
      repository,
      language
    );


  await service.prepare();


  const result =
    await service.importPokemon(
      pokemon,
      {
        updateExisting:
          true,

        targetActor,

        level:
          requestedLevel,

        abilityScoreGains:
          options
            .abilityScoreGains ??
          null,

        abilityScoreBase:
          options
            .abilityScoreBase ??
          null,

        additionalSavingThrows:
          options
            .additionalSavingThrows ??
          null,

        additionalSkillProficiencies:
          options
            .additionalSkillProficiencies ??
          null,

        allowSpeciesChange:
          true
      }
    );


  const updatedActor =
    result?.actor ??
    targetActor;


  if (
    updatedActor.uuid !==
      targetActor.uuid ||
    String(
      getDocumentFlag(
        updatedActor,
        "sourceId"
      ) ??
      ""
    ) !==
      String(
        pokemon.id
      )
  ) {

    throw new Error(
      "La reconstrucción de especie no conservó la instancia esperada."
    );
  }


  return result;
}

export async function migratePokemonPrototypeTokens({
  notify = false
} = {}) {
  if (!game.user.isGM) {
    return {
      affected: 0,
      updated: 0,
      failed: 0
    };
  }

  const displayMode =
    CONST.TOKEN_DISPLAY_MODES.ALWAYS;

  const affectedActors =
    game.actors.filter(
      actor => {
        if (
          !isPoke5eActor(
            actor
          )
        ) {
          return false;
        }

        const expectedActorLink =
          Boolean(
            getDocumentFlag(
              actor,
              "trainerOwnerUuid"
            )
          );

        return (
          actor.prototypeToken
            ?.actorLink !==
              expectedActorLink ||
          actor.prototypeToken
            ?.displayName !==
              displayMode ||
          actor.prototypeToken
            ?.displayBars !==
              displayMode ||
          actor.prototypeToken
            ?.bar1
            ?.attribute !==
              "attributes.hp"
        );
      }
    );

  let updated = 0;
  let failed = 0;

  for (
    const actor
    of affectedActors
  ) {
    const expectedActorLink =
      Boolean(
        getDocumentFlag(
          actor,
          "trainerOwnerUuid"
        )
      );

    try {
      await actor.update({
        "prototypeToken.actorLink":
          expectedActorLink,

        "prototypeToken.displayName":
          displayMode,

        "prototypeToken.displayBars":
          displayMode,

        "prototypeToken.bar1.attribute":
          "attributes.hp"
      });

      updated += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `[${MODULE_ID}] No se pudo actualizar el Prototype Token de ${actor.name}.`,
        error
      );
    }
  }

  if (
    notify &&
    affectedActors.length
  ) {
    const message =
      `Poke5e: ${updated} Prototype Token(s) actualizado(s)` +
      (
        failed
          ? ` · ${failed} error(es)`
          : ""
      );

    if (failed) {
      ui.notifications.warn(
        message
      );
    } else {
      ui.notifications.info(
        message
      );
    }
  }

  return {
    affected:
      affectedActors.length,

    updated,

    failed
  };
}

/*
 * Compatibilidad con integraciones externas que
 * todavía importen el nombre histórico.
 */
export const migratePokemonLinkedPrototypeTokens =
  migratePokemonPrototypeTokens;

/* ============================================================
 * SHINY LEGACY MIGRATION
 *
 * Pokémon pertenecientes a Trainers creados antes del sistema
 * Shiny necesitan:
 *
 * - metadata de media normal + shiny;
 * - un estado Shiny explícitamente resuelto.
 *
 * No realizamos una tirada retroactiva.
 * Los Pokémon legacy se inicializan como no Shiny.
 * ============================================================ */

function isTrainerPokemonActor(
  actor
) {

  return Boolean(
    actor?.documentName ===
      "Actor" &&

    getDocumentFlag(
      actor,
      "kind"
    ) ===
      "pokemon" &&

    getDocumentFlag(
      actor,
      "trainerOwnerUuid"
    )
  );
}


function compatibleLegacyShinyMedia(
  actor,
  canonicalMedia,
  shinyState
) {

  const stored =
    getDocumentFlag(
      actor,
      "media"
    ) ??
    {};


  /*
   * Si el Pokémon todavía no tenía estado Shiny,
   * conservamos sus imágenes actuales como artwork
   * normal.
   *
   * Así una migración nunca pisa un portrait/token
   * personalizado que ya estuvieras utilizando.
   */

  const preserveCurrentNormalArtwork =
    !shinyState;


  const portrait =
    stored.portrait ??
    (
      preserveCurrentNormalArtwork

        ? actor.img

        : canonicalMedia.portrait
    ) ??
    canonicalMedia.portrait;


  const token =
    stored.token ??
    (
      preserveCurrentNormalArtwork

        ? actor.prototypeToken
            ?.texture
            ?.src

        : canonicalMedia.token
    ) ??
    canonicalMedia.token ??
    portrait;


  const portraitShiny =
    stored.portraitShiny ??
    canonicalMedia.portraitShiny ??
    null;


  const tokenShiny =
    stored.tokenShiny ??
    canonicalMedia.tokenShiny ??
    portraitShiny;


  return {
    portrait,
    token,
    portraitShiny,
    tokenShiny
  };
}


function samePokemonMedia(
  left,
  right
) {

  const keys = [
    "portrait",
    "token",
    "portraitShiny",
    "tokenShiny"
  ];


  return keys.every(
    key =>
      (
        left?.[key] ??
        null
      ) ===
      (
        right?.[key] ??
        null
      )
  );
}


export async function migrateLegacyTrainerPokemonShiny({
  notify = false
} = {}) {

  if (
    !game.user.isGM
  ) {

    return {
      affected: 0,
      updated: 0,
      failed: 0,
      missingSource: 0,
      missingShinyArtwork: 0
    };
  }


  await repository.load();


  const candidates =
    game.actors.filter(
      isTrainerPokemonActor
    );


  let affected =
    0;

  let updated =
    0;

  let failed =
    0;

  let missingSource =
    0;

  let missingShinyArtwork =
    0;


  for (
    const actor
    of candidates
  ) {

    const sourceId =
      String(
        getDocumentFlag(
          actor,
          "sourceId"
        ) ??
        ""
      );


    const pokemon =
      repository.getPokemon(
        sourceId
      );


    if (!pokemon) {

      missingSource +=
        1;


      console.warn(
        `[${MODULE_ID}] ${actor.name}: no se encontró sourceId ${sourceId} para migrar Shiny.`
      );


      continue;
    }


    const canonicalMedia =
      buildPokemonMedia(
        pokemon
      );


    const shinyState =
      getPokemonShinyState(
        actor
      );


    const media =
      compatibleLegacyShinyMedia(
        actor,
        canonicalMedia,
        shinyState
      );


    const currentMedia =
      getDocumentFlag(
        actor,
        "media"
      );


    const needsMedia =
      !samePokemonMedia(
        currentMedia,
        media
      );


    const needsState =
      !shinyState;


    if (
      !needsMedia &&
      !needsState
    ) {

      continue;
    }


    affected +=
      1;


    try {

      if (
        needsMedia
      ) {

        await actor.setFlag(
          MODULE_ID,
          "media",
          media
        );
      }


      if (
        !media.portraitShiny &&
        !media.tokenShiny
      ) {

        missingShinyArtwork +=
          1;
      }


      /*
       * Pokémon anteriores al sistema Shiny:
       *
       * se inicializan NORMAL.
       * No inventamos una tirada retroactiva.
       */

      if (
        needsState
      ) {

        await assignPokemonShinyState(
          actor,
          false,
          {
            ruleId:
              getDefaultShinyRuleId(),

            roll:
              null
          }
        );

      } else {

        /*
         * Ya tenía estado Shiny.
         *
         * Solo necesitaba completar/sincronizar media.
         */

        await synchronizePokemonShinyArtwork(
          actor
        );
      }


      updated +=
        1;

    } catch (
      error
    ) {

      failed +=
        1;


      console.error(
        `[${MODULE_ID}] No se pudo migrar Shiny para ${actor.name}.`,
        error
      );
    }
  }


  if (
    notify &&
    affected
  ) {

    const details = [
      `${updated} actualizado(s)`
    ];


    if (
      failed
    ) {

      details.push(
        `${failed} error(es)`
      );
    }


    if (
      missingSource
    ) {

      details.push(
        `${missingSource} sin sourceId válido`
      );
    }


    if (
      missingShinyArtwork
    ) {

      details.push(
        `${missingShinyArtwork} sin artwork Shiny`
      );
    }


    const message =
      `Poke5e Shiny legacy: ${details.join(" · ")}`;


    if (
      failed ||
      missingSource
    ) {

      ui.notifications.warn(
        message
      );

    } else {

      ui.notifications.info(
        message
      );
    }
  }


  return {
    affected,
    updated,
    failed,
    missingSource,
    missingShinyArtwork
  };
}

/* ============================================================
 * GENDER LEGACY MIGRATION
 * ============================================================ */

function normalizedCanonicalGenderRatio(
  pokemon
) {

  const value =
    String(
      pokemon?.biology
        ?.genderRatio ??
      ""
    ).trim();


  return value ||
    null;
}


function missingHoverUpdate(actor) {
  const species = repository.getPokemon(String(getDocumentFlag(actor, "sourceId") ?? ""));
  return species ? missingHoverMovementUpdate(actor.system?.attributes?.movement, species.combat?.speed) : null;
}

export async function migratePokemonHoverMovement({ notify = false } = {}) {
  if (!game.user.isGM) {return { affected: 0 };}
  await repository.load();
  let affected = 0;
  const repair = async actor => {
    const update = getDocumentFlag(actor, "kind") === "pokemon" ? missingHoverUpdate(actor) : null;
    if (!update) {return;}
    await actor.update(update);
    affected += 1;
  };
  for (const actor of game.actors ?? []) {await repair(actor);}
  // Unlinked tokens follow their base actor, so this only catches deltas that override the movement.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {await repair(token.actor);}
    }
  }
  if (notify && affected) {
    ui.notifications.info(`Poke5e: velocidad de levitación reparada en ${affected} Pokémon.`);
  }
  return { affected };
}

export async function migrateLegacyPokemonGender({
  notify = false
} = {}) {

  if (
    !game.user.isGM
  ) {

    return {
      affected: 0,
      updated: 0,
      failed: 0,
      missingSource: 0,
      missingRatio: 0,
      tokensUpdated: 0
    };
  }


  await repository.load();


  const candidates =
    game.actors.filter(
      actor =>
        actor?.documentName ===
          "Actor" &&
        getDocumentFlag(
          actor,
          "kind"
        ) ===
          "pokemon"
    );


  let affected =
    0;

  let updated =
    0;

  let failed =
    0;

  let missingSource =
    0;

  let missingRatio =
    0;


  for (
    const actor
    of candidates
  ) {

    const sourceId =
      String(
        getDocumentFlag(
          actor,
          "sourceId"
        ) ??
        ""
      );


    const pokemon =
      repository.getPokemon(
        sourceId
      );


    if (!pokemon) {

      missingSource +=
        1;

      continue;
    }


    const genderRatio =
      normalizedCanonicalGenderRatio(
        pokemon
      );


    if (!genderRatio) {

      missingRatio +=
        1;

      continue;
    }


    const currentRatio =
      String(
        getDocumentFlag(
          actor,
          "genderRatio"
        ) ??
        ""
      );


    const trainerOwned =
      Boolean(
        getDocumentFlag(
          actor,
          "trainerOwnerUuid"
        )
      );


    const needsRatio =
      currentRatio !==
        genderRatio;


    const needsGender =
      trainerOwned &&
      !getPokemonGender(
        actor
      );


    if (
      !needsRatio &&
      !needsGender
    ) {

      continue;
    }


    affected +=
      1;


    try {

      /*
       * Todos los Actors reciben la ratio canónica,
       * incluidos los templates salvajes.
       */

      if (needsRatio) {

        await actor.setFlag(
          MODULE_ID,
          "genderRatio",
          genderRatio
        );
      }


      /*
       * Solo los individuos pertenecientes a Trainer
       * reciben Gender en el Actor world.
       */

      if (needsGender) {

        await rollPokemonGender(
          actor
        );
      }


      updated +=
        1;

    } catch (error) {

      failed +=
        1;


      console.error(
        `[${MODULE_ID}] No se pudo migrar género para ${actor.name}.`,
        error
      );
    }
  }


  /*
   * Tokens salvajes de la Scene actualmente abierta.
   *
   * Cada Synthetic Actor recibe una tirada independiente.
   */

  let tokensUpdated =
    0;


  if (
    canvas.ready &&
    canvas.scene
  ) {

    for (
      const tokenDocument
      of canvas.scene.tokens
    ) {

      const actor =
        tokenDocument.actor ??
        null;


      if (
        tokenDocument.actorLink ===
          true ||
        actor?.getFlag?.(
          MODULE_ID,
          "kind"
        ) !==
          "pokemon" ||
        actor.getFlag?.(
          MODULE_ID,
          "trainerOwnerUuid"
        ) ||
        getPokemonGender(
          actor
        ) ||
        !getPokemonGenderRatio(
          actor
        )
      ) {

        continue;
      }


      try {

        await rollPokemonGender(
          actor
        );


        tokensUpdated +=
          1;

      } catch (error) {

        failed +=
          1;


        console.error(
          `[${MODULE_ID}] No se pudo migrar género para Token ${tokenDocument.name}.`,
          error
        );
      }
    }
  }


  if (
    notify &&
    (
      affected ||
      tokensUpdated
    )
  ) {

    const details = [
      `${updated} Actor(es) actualizado(s)`,
      `${tokensUpdated} Token(s) salvaje(s)`
    ];


    if (failed) {

      details.push(
        `${failed} error(es)`
      );
    }


    if (missingSource) {

      details.push(
        `${missingSource} sin sourceId válido`
      );
    }


    if (missingRatio) {

      details.push(
        `${missingRatio} sin genderRatio`
      );
    }


    const message =
      `Poke5e Gender legacy: ${details.join(" · ")}`;


    if (
      failed ||
      missingSource ||
      missingRatio
    ) {

      ui.notifications.warn(
        message
      );

    } else {

      ui.notifications.info(
        message
      );
    }
  }


  return {
    affected,
    updated,
    failed,
    missingSource,
    missingRatio,
    tokensUpdated
  };
}

/* ============================================================
 * LEGACY REPAIR
 * ============================================================ */

export async function repairLegacyInvalidPokemonActors({
  language = getWorldLanguage(),
  notify = false,
  automatic = false
} = {}) {
  if (!game.user.isGM) {
    return {
      affected: 0,
      repaired: 0,
      failed: 0
    };
  }

  await repository.load();

  const affectedActors =
    game.actors
      .filter(
        actor =>
          isPoke5eActor(
            actor
          ) &&
          !isEncounterPokemonActor(
            actor
          )
      )
      .map(actor => ({
        actor,

        invalidItems:
          findInvalidManagedRawItems(
            actor
          )
      }))
      .filter(
        entry =>
          entry.invalidItems.length
      );

  if (!affectedActors.length) {
    return {
      affected: 0,
      repaired: 0,
      failed: 0
    };
  }

  console.warn(
    `[${MODULE_ID}] Detectados ` +
    `${affectedActors.length} Actor(es) ` +
    "con Items Poke5e inválidos persistidos.",

    affectedActors.map(
      entry => ({
        actor:
          entry.actor.name,

        items:
          entry.invalidItems.map(
            item => ({
              id:
                item._id,

              name:
                item.name,

              formulas:
                collectRawDamageFormulas(
                  item
                )
            })
          )
      })
    )
  );

  const service =
    new PokemonImportService(
      repository,
      language
    );

  let repaired = 0;
  let failed = 0;

  for (
    const {
      actor
    }
    of affectedActors
  ) {
    const sourceId =
      getDocumentFlag(
        actor,
        "sourceId"
      );

    const pokemon =
      repository.getPokemon(
        sourceId
      );

    try {
      if (pokemon) {
        const actorLevel =
          clampPokemonLevel(
            pokemon,
            getDocumentFlag(
              actor,
              "level"
            ) ??
            pokemon.minimumLevel
          );

        await service.importPokemon(
          pokemon,
          {
            updateExisting: true,
            level: actorLevel
          }
        );
      } else {
        await deleteManagedItemsSafely(
          actor,
          rawManagedItemIds(actor)
        );
      }

      repaired += 1;
    } catch (error) {
      failed += 1;

      console.error(
        `[${MODULE_ID}] No se pudo reparar ${actor.name}:`,
        error
      );
    }
  }

  if (notify) {
    const prefix =
      automatic
        ? "Reparación automática Poke5e"
        : "Reparación Poke5e";

    if (failed) {
      ui.notifications.warn(
        `${prefix}: ` +
        `${repaired} reparado(s), ` +
        `${failed} con error.`
      );
    } else {
      ui.notifications.info(
        `${prefix}: ` +
        `${repaired} Pokémon reparado(s). ` +
        "Recarga Foundry para confirmar que no queden errores de inicialización antiguos."
      );
    }
  }

  return {
    affected:
      affectedActors.length,

    repaired,

    failed
  };
}

/* ============================================================
 * ACTOR UPDATE
 * ============================================================ */

async function updateActor(
  actor,
  source
) {
  const hpSnapshot =
    getHpSnapshot(actor);

  const itemState =
    collectManagedItemState(
      actor
    );

  const oldItemIds =
    rawManagedItemIds(
      actor
    );

  if (oldItemIds.length) {
    await deleteManagedItemsSafely(
      actor,
      oldItemIds
    );
  }

  const newItems =
    foundry.utils.deepClone(
      source.items ?? []
    );

  const newEffects =
    foundry.utils.deepClone(
      source.effects ?? []
    );

  restoreManagedItemState(
    newItems,
    itemState
  );

  const sourceFlags =
    foundry.utils.deepClone(
      source.flags ??
      {}
    );

  preservePokemonStateFlags(
    actor,
    sourceFlags
  );

  const displayName =
    resolvePokemonImportDisplayName(
      actor,
      source.name
    );

  const updateData = {
    name:
      displayName,

    type:
      source.type,

    img:
      source.img,

    folder:
      source.folder ??
      actor.folder?.id ??
      null,

    sort:
      Number.isFinite(
        Number(source.sort)
      )
        ? Number(source.sort)
        : actor.sort,

    prototypeToken:
      buildPrototypeTokenForActor(
        actor,
        source.prototypeToken,
        displayName
      ),

    system:
      foundry.utils.deepClone(
        source.system ??
        {}
      ),

    flags:
      sourceFlags
      };

  preserveHp(
    updateData,
    hpSnapshot
  );

  await actor.update(
    updateData
  );

  if (newItems.length) {
    await actor.createEmbeddedDocuments(
      "Item",
      newItems
    );
  }

  await replaceManagedActorEffects(
    actor,
    newEffects
  );

  await synchronizePokemonShinyArtwork(
    actor
  );

  return actor;
}

function resolvePokemonImportDisplayName(
  actor,
  fallbackName
) {

  const nickname =
    String(
      getDocumentFlag(
        actor,
        "nickname"
      ) ??
      ""
    ).trim();


  return nickname ||
    fallbackName;
}

function buildPrototypeTokenForActor(
  actor,
  sourcePrototypeToken,
  displayName
) {

  const prototypeToken =
    foundry.utils.deepClone(
      sourcePrototypeToken ??
      {}
    );


  prototypeToken.actorLink =
    Boolean(
      getDocumentFlag(
        actor,
        "trainerOwnerUuid"
      )
    );


  prototypeToken.name =
    displayName;


  return prototypeToken;
}

function preservePokemonStateFlags(
  actor,
  sourceFlags
) {
  sourceFlags[MODULE_ID] ??= {};

  for (
    const key
    of PRESERVED_POKEMON_STATE_FLAGS
  ) {
    const value =
      getDocumentFlag(
        actor,
        key
      );

    if (
      value == null
    ) {
      continue;
    }

    sourceFlags[
      MODULE_ID
    ][key] =
      foundry.utils.deepClone(
        value
      );
  }

  const activeAbilityId =
    String(
      getDocumentFlag(
        actor,
        "activeAbilityId"
      ) ??
      ""
    )
      .trim()
      .toLowerCase();

  const activeAbilityExists =
    activeAbilityId &&
    rawActorItems(
      actor
    ).some(
      item => {
        const scope =
          getRawModuleFlags(
            item
          );

        return (
          scope.kind ===
            "ability" &&
          scope.importManaged ===
            false &&
          String(
            scope.sourceId ??
            ""
          )
            .trim()
            .toLowerCase() ===
            activeAbilityId
        );
      }
    );

  sourceFlags[
    MODULE_ID
  ].activeAbilityId =
    activeAbilityExists
      ? activeAbilityId
      : null;
}

async function replaceManagedActorEffects(
  actor,
  effectSources
) {
  const newManagedEffects =
    effectSources.filter(
      effect => {
        const scope =
          effect?.flags
            ?.[MODULE_ID] ??
          {};

        return (
          scope.managed === true &&
          MANAGED_ACTOR_EFFECT_KINDS
            .has(scope.kind)
        );
      }
    );

  /*
   * Si el builder no produjo efectos gestionados,
   * no eliminamos nada por seguridad.
   */
  if (!newManagedEffects.length) {
    return;
  }

  const oldManagedIds =
    actor.effects
      .filter(effect => {
        const managed =
          getDocumentFlag(
            effect,
            "managed"
          );

        const kind =
          getDocumentFlag(
            effect,
            "kind"
          );

        return (
          managed === true &&
          MANAGED_ACTOR_EFFECT_KINDS
            .has(kind)
        );
      })
      .map(
        effect =>
          effect.id
      )
      .filter(Boolean);

  if (oldManagedIds.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      oldManagedIds
    );
  }

  await actor.createEmbeddedDocuments(
    "ActiveEffect",
    newManagedEffects
  );
}

/* ============================================================
 * ACTOR STATE
 * ============================================================ */

function getHpSnapshot(actor) {
  const hp =
    actor.system
      ?.attributes
      ?.hp ??
    actor._source
      ?.system
      ?.attributes
      ?.hp ??
    {};

  const progression =
    getDocumentFlag(
      actor,
      "pokemonProgression"
    );

  return {
    value:
      finiteNumber(
        hp.value,
        0
      ),

    max:
      finiteNumber(
        hp.max,
        0
      ),

    temp:
      finiteNumber(
        hp.temp,
        0
      ),

    preserveMaximum:
      Boolean(
        progression
          ?.hpGains &&
        Object.keys(
          progression.hpGains
        ).length
      )
  };
}

function preserveHp(
  updateData,
  snapshot
) {
  const hp =
    updateData.system
      ?.attributes
      ?.hp;

  if (!hp) {
    return;
  }

  const builtMaximum =
    Math.max(
      0,
      finiteNumber(
        hp.max,
        snapshot.max
      )
    );

  /*
   * Si este Pokémon ya tiene Progression
   * real, su máximo de HP proviene de las
   * tiradas de Level Up y no del promedio
   * determinista del Builder.
   */
  const newMax =
    snapshot.preserveMaximum &&
    snapshot.max > 0
      ? snapshot.max
      : builtMaximum;

  if (newMax <= 0) {
    return;
  }

  if (snapshot.value <= 0) {
    hp.value = 0;
  } else if (
    snapshot.max > 0 &&
    snapshot.value >=
      snapshot.max
  ) {
    hp.value =
      newMax;
  } else {
    const missingHp =
      Math.max(
        0,
        snapshot.max -
        snapshot.value
      );

    hp.value =
      Math.min(
        newMax,
        Math.max(
          0,
          newMax -
          missingHp
        )
      );
  }

  hp.max =
    newMax;

  hp.temp =
    Math.max(
      0,
      snapshot.temp
    );
}

/* ============================================================
 * MOVE / ABILITY STATE
 * ============================================================ */

function collectManagedItemState(
  actor
) {
  const state =
    new Map();

  for (
    const item
    of rawActorItems(actor)
  ) {
    if (
      !isManagedRawItem(
        item
      )
    ) {
      continue;
    }

    const scope =
      getRawModuleFlags(
        item
      );

    const sourceId =
      scope.sourceId;

    if (!sourceId) {
      continue;
    }

    state.set(
      `${scope.kind ?? "item"}:${sourceId}`,
      {
        spent:
          finiteNumber(
            item.system
              ?.uses
              ?.spent,
            0
          )
      }
    );
  }

  return state;
}

function restoreManagedItemState(
  items,
  state
) {
  for (
    const item
    of items
  ) {
    const scope =
      getRawModuleFlags(
        item
      );

    const sourceId =
      scope.sourceId;

    if (!sourceId) {
      continue;
    }

    const saved =
      state.get(
        `${scope.kind ?? "item"}:${sourceId}`
      );

    if (
      !saved ||
      !item.system?.uses
    ) {
      continue;
    }

    const max =
      finiteNumber(
        item.system.uses.max,
        Number.POSITIVE_INFINITY
      );

    item.system.uses.spent =
      Math.min(
        Math.max(
          0,
          saved.spent
        ),
        max
      );
  }
}

/* ============================================================
 * RAW EMBEDDED ITEM ACCESS
 * ============================================================ */

function rawActorItems(
  actor
) {
  return Array.isArray(
    actor?._source?.items
  )
    ? actor._source.items
    : [];
}

function rawManagedItemIds(
  actor
) {
  return rawActorItems(
    actor
  )
    .filter(
      isManagedRawItem
    )
    .map(
      item =>
        item._id
    )
    .filter(Boolean);
}

function isManagedRawItem(
  item
) {
  const scope =
    getRawModuleFlags(
      item
    );

  if (
    !scope ||
    !Object.keys(scope).length
  ) {
    return false;
  }

  /*
   * Moves y Abilities de versiones antiguas
   * eran gestionados por el Importer.
   *
   * Los documentos arrastrados desde los
   * Compendiums actuales llevan
   * importManaged=false y forman parte del
   * estado individual del Pokémon.
   *
   * Struggle mantiene importManaged=true,
   * por lo que sigue reconstruyéndose.
   */
  if (
    REIMPORT_MANAGED_ITEM_KINDS.has(
      scope.kind
    )
  ) {
    return (
      scope.importManaged !==
      false
    );
  }

  /*
   * Compatibilidad con Items Poke5e muy antiguos
   * que todavía no tenían "kind".
   */
  return (
    !scope.kind &&
    Boolean(
      scope.sourceId
    )
  );
}

function getRawModuleFlags(
  item
) {
  return (
    item?.flags?.[MODULE_ID] ??
    {}
  );
}

/* ============================================================
 * SAFE ITEM DELETION
 * ============================================================ */

async function deleteManagedItemsSafely(actor, ids) {
  const requestedIds = [...new Set(ids.filter(Boolean))];

  if (!requestedIds.length) {
    return;
  }

  console.debug(
    `[${MODULE_ID}] ${actor.name}: eliminando Items Poke5e`,
    requestedIds
  );

  /*
   * Primera estrategia:
   * API normal para Embedded Documents válidos.
   */
  try {
    await actor.deleteEmbeddedDocuments(
      "Item",
      requestedIds
    );
  } catch (error) {
    console.warn(
      `[${MODULE_ID}] ${actor.name}: ` +
      "deleteEmbeddedDocuments produjo un error.",
      error
    );
  }

  /*
   * MUY IMPORTANTE:
   *
   * No asumimos que la operación anterior haya eliminado
   * realmente todos los Items.
   *
   * Un Item inválido puede continuar existiendo en _source
   * aunque no aparezca normalmente en actor.items.
   */
  let remainingIds = findRawItemIds(
    actor,
    requestedIds
  );

  if (!remainingIds.length) {
    console.debug(
      `[${MODULE_ID}] ${actor.name}: ` +
      "Items eliminados mediante deleteEmbeddedDocuments."
    );

    return;
  }

  console.warn(
    `[${MODULE_ID}] ${actor.name}: ` +
    "quedan Items persistidos tras la eliminación normal.",
    remainingIds
  );

  /*
   * Segunda estrategia:
   *
   * Foundry permite recuperar explícitamente
   * Embedded Documents inválidos mediante:
   *
   * { invalid: true }
   */
  for (const id of remainingIds) {
    let item = null;

    try {
      item = actor.getEmbeddedDocument(
        "Item",
        id,
        {
          invalid: true,
          strict: false
        }
      );
    } catch (error) {
      console.warn(
        `[${MODULE_ID}] ${actor.name}: ` +
        `no se pudo recuperar el Item inválido ${id}.`,
        error
      );
    }

    if (!item) {
      continue;
    }

    try {
      console.warn(
        `[${MODULE_ID}] Eliminando Item inválido:`,
        {
          actor: actor.name,
          item: item.name,
          id: item.id,
          invalid: item.invalid
        }
      );

      await item.delete();
    } catch (error) {
      console.warn(
        `[${MODULE_ID}] ${actor.name}: ` +
        `item.delete() falló para ${id}.`,
        error
      );
    }
  }

  /*
   * Volvemos a comprobar la FUENTE REAL.
   */
  remainingIds = findRawItemIds(
    actor,
    requestedIds
  );

  if (!remainingIds.length) {
    console.debug(
      `[${MODULE_ID}] ${actor.name}: ` +
      "Items inválidos eliminados correctamente."
    );

    return;
  }

  /*
   * Tercera y última estrategia:
   *
   * Eliminación estática explícita con parent.
   */
  console.warn(
    `[${MODULE_ID}] ${actor.name}: ` +
    "intentando eliminación estática.",
    remainingIds
  );

  try {
    await Item.implementation.deleteDocuments(
      remainingIds,
      {
        parent: actor
      }
    );
  } catch (error) {
    console.error(
      `[${MODULE_ID}] ${actor.name}: ` +
      "falló la eliminación estática.",
      error
    );
  }

  /*
   * Comprobación definitiva.
   */
  remainingIds = findRawItemIds(
    actor,
    requestedIds
  );

  if (remainingIds.length) {
    throw new Error(
      `[${MODULE_ID}] No fue posible eliminar ` +
      `${remainingIds.length} Item(s) persistidos de ${actor.name}: ` +
      remainingIds.join(", ")
    );
  }

  console.log(
    `[${MODULE_ID}] ${actor.name}: ` +
    "limpieza de Items completada."
  );
}

function findRawItemIds(actor, ids) {
  const requested =
    new Set(ids);

  return rawActorItems(actor)
    .filter(
      item =>
        requested.has(
          item._id
        )
    )
    .map(
      item =>
        item._id
    )
    .filter(Boolean);
}

/* ============================================================
 * INVALID FORMULA DETECTION
 * ============================================================ */

function findInvalidManagedRawItems(
  actor
) {
  return rawActorItems(
    actor
  ).filter(
    item =>
      isManagedRawItem(item) &&
      rawItemHasInvalidDamageFormula(
        item
      )
  );
}

function rawItemHasInvalidDamageFormula(
  item
) {
  const formulas =
    collectRawDamageFormulas(
      item
    );

  return formulas.some(
    formula =>
      !isExecutableFormula(
        formula
      )
  );
}

function collectRawDamageFormulas(
  item
) {
  const formulas = [];

  const activities =
    item?.system
      ?.activities ??
    {};

  for (
    const activity
    of Object.values(
      activities
    )
  ) {
    for (
      const part
      of activity
        ?.damage
        ?.parts ??
        []
    ) {
      const formula =
        String(
          part?.custom
            ?.formula ??
          ""
        ).trim();

      if (formula) {
        formulas.push(
          formula
        );
      }
    }
  }

  /*
   * También auditamos la estructura base de Weapon,
   * aunque actualmente el builder deja estas fórmulas vacías.
   */
  const baseFormula =
    String(
      item?.system
        ?.damage
        ?.base
        ?.custom
        ?.formula ??
      ""
    ).trim();

  const versatileFormula =
    String(
      item?.system
        ?.damage
        ?.versatile
        ?.custom
        ?.formula ??
      ""
    ).trim();

  if (baseFormula) {
    formulas.push(
      baseFormula
    );
  }

  if (versatileFormula) {
    formulas.push(
      versatileFormula
    );
  }

  return formulas;
}

function isExecutableFormula(
  formula
) {
  const text =
    String(
      formula ??
      ""
    ).trim();

  if (!text) {
    return true;
  }

  try {
    /*
     * Primera barrera:
     * parser de Foundry.
     */
    if (
      !Roll.validate(
        text
      )
    ) {
      return false;
    }

    /*
     * Segunda barrera:
     *
     * Rd10 o similares pueden terminar siendo
     * interpretados como StringTerms.
     *
     * allowStrings:false fuerza que sean rechazados.
     */
    const roll =
      Roll.create(
        text
      );

    roll.evaluateSync({
      strict: true,
      allowStrings: false,
      maximize: true
    });

    return Number.isFinite(
      roll.total
    );
  } catch {
    return false;
  }
}

/* ============================================================
 * ACTOR LOOKUP
 * ============================================================ */

function pokemonImportKey(
  sourceId,
  level
) {
  return `${sourceId}@${level}`;
}

function findPokemonActors(
  sourceId,
  level
) {
  const id =
    String(
      sourceId
    );


  const normalizedLevel =
    Math.trunc(
      Number(
        level
      )
    );


  if (
    !Number.isFinite(
      normalizedLevel
    )
  ) {
    return [];
  }


  const importKey =
    pokemonImportKey(
      id,
      normalizedLevel
    );


  return game.actors.filter(
    actor => {

      /*
       * Un Actor creado específicamente para
       * Encounter Planner no es una instancia
       * libre del Importador general.
       */
      if (
        isEncounterPokemonActor(
          actor
        )
      ) {
        return false;
      }


      const actorImportKey =
        getDocumentFlag(
          actor,
          "importKey"
        );


      if (
        actorImportKey ===
        importKey
      ) {
        return true;
      }


      /*
       * Compatibilidad con Actors anteriores
       * a importKey.
       */
      const actorSourceId =
        String(
          getDocumentFlag(
            actor,
            "sourceId"
          ) ??
          ""
        );


      const actorLevel =
        Number(
          getDocumentFlag(
            actor,
            "level"
          )
        );


      return (
        actorSourceId ===
          id &&

        actorLevel ===
          normalizedLevel
      );
    }
  );
}

function isEncounterPokemonActor(
  actor
) {
  return Boolean(
    getDocumentFlag(
      actor,
      "encounter"
    )?.key
  );
}

function selectPreferredPokemonActor(
  actors
) {
  const unowned =
    actors.filter(
      actor =>
        !getDocumentFlag(
          actor,
          "trainerOwnerUuid"
        )
    );

  return unowned.length === 1
    ? unowned[0]
    : null;
}

function resolvePokemonImportTarget(
  sourceId,
  level,
  {
    updateExisting = false
  } = {}
) {
  const matches =
    findPokemonActors(
      sourceId,
      level
    );

  if (!matches.length) {
    return null;
  }

  /*
   * Comportamiento histórico:
   * si ya existe y no se pidió actualizar,
   * importPokemon() lo marcará como skipped.
   */
  if (!updateExisting) {
    return matches[0];
  }

  /*
   * Nunca elegimos automáticamente un Pokémon
   * perteneciente a un Trainer.
   *
   * Solo se permite actualización automática
   * cuando existe exactamente UNA instancia libre.
   */
  const preferred =
    selectPreferredPokemonActor(
      matches
    );

  if (preferred) {
    return preferred;
  }

  const unownedCount =
    matches.filter(
      actor =>
        !getDocumentFlag(
          actor,
          "trainerOwnerUuid"
        )
    ).length;

  if (!unownedCount) {
    throw new Error(
      `[${MODULE_ID}] ${sourceId} Nv. ${level} ya existe, ` +
      "pero todas sus instancias pertenecen a Trainers. " +
      'Usa "Crear nueva instancia aunque ya exista".'
    );
  }

  throw new Error(
    `[${MODULE_ID}] Existen ${unownedCount} instancias libres de ` +
    `${sourceId} al nivel ${level}. ` +
    "No se puede elegir automáticamente cuál actualizar."
  );
}

function getPokemonMinimumLevel(pokemon) {
  const minimum =
    Number(pokemon?.minimumLevel);

  if (!Number.isFinite(minimum)) {
    return 1;
  }

  return Math.min(
    20,
    Math.max(
      1,
      Math.trunc(minimum)
    )
  );
}

function clampPokemonLevel(pokemon, value) {
  const minimum =
    getPokemonMinimumLevel(pokemon);

  const numeric =
    Number(value);

  if (!Number.isFinite(numeric)) {
    return minimum;
  }

  return Math.min(
    20,
    Math.max(
      minimum,
      Math.trunc(numeric)
    )
  );
}

function getActorPokemonLevel(actor) {
  if (!actor) {
    return null;
  }

  const flagLevel =
    Number(
      getDocumentFlag(
        actor,
        "level"
      )
    );

  if (Number.isFinite(flagLevel)) {
    return Math.trunc(flagLevel);
  }

  return null;
}

function getPokemonImportLevel(
  state,
  pokemon
) {
  const id =
    String(
      pokemon.id
    );

  if (
    state.levels.has(id)
  ) {
    return clampPokemonLevel(
      pokemon,
      state.levels.get(id)
    );
  }

  return getPokemonMinimumLevel(
    pokemon
  );
}

function isPoke5eActor(
  actor
) {
  return Boolean(
    getDocumentFlag(
      actor,
      "sourceId"
    )
  );
}

function getDocumentFlag(
  document,
  key
) {
  if (
    typeof document?.getFlag ===
    "function"
  ) {
    return document.getFlag(
      MODULE_ID,
      key
    );
  }

  return document
    ?.flags
    ?.[MODULE_ID]
    ?.[key];
}

/* ============================================================
 * FILTERING
 * ============================================================ */

function filterPokemon(
  pokemon,
  state
) {
  const query =
    normalizeSearch(
      state.search
    );

  return pokemon.filter(
    entry => {
      const primaryType =
        normalizeType(
          entry.primaryType ??
          entry.types?.[0] ??
          "normal"
        );

      if (
        state.type &&
        primaryType !==
        state.type
      ) {
        return false;
      }

      if (
        state.sr &&
        normalizeSr(
          entry.sr
        ) !== state.sr
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      const names = [
        entry.id,
        entry.dexNumber,

        localized(
          entry.name,
          "es",
          ""
        ),

        localized(
          entry.name,
          "en",
          ""
        )
      ].map(
        normalizeSearch
      );

      return names.some(
        value =>
          value.includes(
            query
          )
      );
    }
  );
}

/* ============================================================
 * FOLDER HELPERS
 * ============================================================ */

function resolvePokemonImportPlacement(
  existingActor,
  defaultFolder,
  importLevel
) {
  const trainerOwnerUuid =
    existingActor
      ? getDocumentFlag(
          existingActor,
          "trainerOwnerUuid"
        )
      : null;

  if (
    existingActor &&
    trainerOwnerUuid
  ) {
    return {
      folderId:
        existingActor.folder?.id ??
        null,

      sort:
        existingActor.sort
    };
  }

  return {
    folderId:
      defaultFolder.id,

    sort:
      importLevel * 100000
  };
}

function findFolder({
  kind,
  parentId,
  predicate = () => true
}) {
  return (
    game.folders.find(
      folder => {
        if (
          folder.type !==
          "Actor"
        ) {
          return false;
        }

        if (
          folder.getFlag(
            MODULE_ID,
            "kind"
          ) !== kind
        ) {
          return false;
        }

        if (
          folderParentId(
            folder
          ) !== parentId
        ) {
          return false;
        }

        return predicate(
          folder
        );
      }
    ) ??
    null
  );
}

function folderParentId(
  folder
) {
  const parent =
    folder?.folder;

  if (!parent) {
    return null;
  }

  return typeof parent ===
    "string"
    ? parent
    : parent.id ??
      null;
}

async function updateFolderIfNeeded(
  folder,
  {
    name,
    color
  }
) {
  const changes = {};

  if (
    folder.name !== name
  ) {
    changes.name =
      name;
  }

  if (
    (folder.color ?? null) !==
    (color ?? null)
  ) {
    changes.color =
      color ??
      null;
  }

  if (
    Object.keys(changes).length
  ) {
    await folder.update(
      changes
    );
  }
}

/* ============================================================
 * DATA LOADING
 * ============================================================ */

async function loadJson(
  path
) {
  const version =
    game.modules.get(
      MODULE_ID
    )?.version ??
    Date.now();

  const response =
    await fetch(
      `${path}?v=${encodeURIComponent(version)}`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${path}: HTTP ${response.status}`
    );
  }

  return response.json();
}

function extractCollection(
  data,
  keys
) {
  if (
    Array.isArray(data)
  ) {
    return data;
  }

  for (const key of keys) {
    if (
      Array.isArray(
        data?.[key]
      )
    ) {
      return data[key];
    }
  }

  if (
    data &&
    typeof data ===
    "object"
  ) {
    return Object
      .values(data)
      .filter(
        value =>
          value &&
          typeof value ===
          "object"
      );
  }

  return [];
}

/* ============================================================
 * NOTIFICATIONS
 * ============================================================ */

function notifyImportResults(
  results
) {
  const message = [
    `${results.created} creado(s)`,
    `${results.updated} actualizado(s)`,
    `${results.skipped} omitido(s)`,
    `${results.failed} error(es)`
  ].join(" · ");

  if (
    results.failed
  ) {
    ui.notifications.warn(
      `Poke5e: ${message}`
    );
  } else {
    ui.notifications.info(
      `Poke5e: ${message}`
    );
  }
}

/* ============================================================
 * SETTINGS
 * ============================================================ */

function getWorldLanguage() {
  try {
    return normalizeLanguage(
      game.settings.get(
        MODULE_ID,
        "language"
      )
    );
  } catch {
    return "es";
  }
}

async function setWorldLanguage(
  language
) {
  try {
    await game.settings.set(
      MODULE_ID,
      "language",
      normalizeLanguage(
        language
      )
    );
  } catch (error) {
    console.debug(
      `[${MODULE_ID}] No se pudo guardar el idioma del mundo.`,
      error
    );
  }
}

/* ============================================================
 * STRING / VALUE HELPERS
 * ============================================================ */

function localized(
  value,
  language,
  fallback = ""
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .filter(Boolean)
      .join(" ");
  }

  if (
    value &&
    typeof value ===
    "object"
  ) {
    return String(
      value[language] ??
      value.en ??
      value.es ??
      fallback
    );
  }

  return String(
    fallback ??
    ""
  );
}

function normalizeLanguage(
  value
) {
  return value === "en"
    ? "en"
    : "es";
}

function normalizeType(
  value
) {
  return String(
    value ??
    "normal"
  )
    .trim()
    .toLowerCase();
}

function normalizeSr(
  value
) {
  if (
    value == null ||
    value === ""
  ) {
    return "0";
  }

  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? String(numeric)
    : String(value);
}

function normalizeSearch(
  value
) {
  return String(
    value ??
    ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();
}

function comparePokemon(
  a,
  b
) {
  const dexA =
    finiteNumber(
      a?.dexNumber,
      Number.MAX_SAFE_INTEGER
    );

  const dexB =
    finiteNumber(
      b?.dexNumber,
      Number.MAX_SAFE_INTEGER
    );

  if (
    dexA !== dexB
  ) {
    return dexA - dexB;
  }

  return String(
    a?.id ??
    ""
  ).localeCompare(
    String(
      b?.id ??
      ""
    )
  );
}

function compareNumericLike(
  a,
  b
) {
  const numberA =
    Number(a);

  const numberB =
    Number(b);

  if (
    Number.isFinite(numberA) &&
    Number.isFinite(numberB)
  ) {
    return (
      numberA -
      numberB
    );
  }

  return String(a)
    .localeCompare(
      String(b)
    );
}

function finiteNumber(
  value,
  fallback = 0
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : fallback;
}

/* ============================================================
 * COMPATIBILITY EXPORTS
 * ============================================================ */

export const registerImporter =
  registerPokemonImporter;

export const registerPoke5eImporter =
  registerPokemonImporter;

export const openImporter =
  openPokemonImporter;