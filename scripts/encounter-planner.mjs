import {
  EncounterGenerationService
} from "./encounter-generation-service.mjs";

import {
  EncounterDeletionService
} from "./encounter-deletion-service.mjs";

import {
  EncounterQueryService
} from "./encounter-query-service.mjs";

import {
  awardEncounterXp
} from "./encounter-xp-award.mjs";

import {
  selectEncounterItem
} from "./encounter-item-selector.mjs";

import {
  encounterShare,
  getEncounterXpRules,
  levelProgress,
  calculatePokemonEncounterXp
} from "./encounter-xp-service.mjs";

import {
  EncounterRandomCatalog,
  RANDOM_BIOME_ROUTE,
  RANDOM_REGION_ALL
} from "./encounter-random-catalog.mjs";

import {
  generateRandomEncounterRows,
  RANDOM_ENCOUNTER_SIZES
} from "./encounter-randomizer.mjs";

import {
  getTrainerLevelRule
} from "./trainer-rules.mjs";

import {
  DIFFICULTIES,
  detectEncounterParty,
  encounterDifficulty,
  generateForDifficulty,
  getTrainerRank,
  rankLevels,
  TRAINER_RANKS
} from "./encounter-difficulty.mjs";

import {
  generateRandomTrainerEncounter,
  rerollRandomTrainerTeam
} from "./encounter-trainer-randomizer.mjs";

import {
  getTrainerArchetype,
  getTrainerArchetypeDescription,
  getTrainerArchetypeGroupLabel,
  getTrainerArchetypeLabel,
  listTrainerArchetypeGroups,
  listTrainerArchetypes
} from "./encounter-trainer-archetypes.mjs";

import {
  getDefaultEncounterItemPolicy
} from "./encounter-item-policy.mjs";

const MODULE_ID =
  "poke5e-local";

const SEARCH_LIMIT =
  60;

const ENCOUNTER_STUDIO_TABS =
  new Set([
    "composition",
    "generator",
    "trainers",
    "options"
  ]);

const MIXED_TRAINER_ARCHETYPE_ID =
  "mixed";

const {
  ApplicationV2
} =
  foundry.applications.api;

function prepareEncounterRow({
  row,
  database,
  language,
  encounterType,
  xpContext = null
}) {

  const pokemon =
    findPokemon(
      database.pokemon,
      row.pokemonId
    );


  if (!pokemon) {

    return null;
  }


  const level =
    clampPokemonLevel(
      pokemon,
      row.level
    );


  const quantity =
    clampInteger(
      row.quantity,
      1,
      999,
      1
    );


  const defeated =
    clampInteger(
      row.defeated,
      0,
      quantity,
      0
    );


  const captured =
    encounterType ===
      "trainer"

      ? 0

      : clampInteger(
          row.captured,
          0,
          quantity -
            defeated,
          0
        );


  const xp =
    calculatePokemonEncounterXp({
      level,
      sr:
        pokemon.sr,
      context:
        xpContext
    });


  return {
    ...row,

    pokemon,
    level,
    quantity,
    defeated,
    captured,
    xp,

    earnedXp:
      (
        xp.defeated *
        defeated
      ) +
      (
        xp.captured *
        captured
      ),

    localizedName:
      localized(
        pokemon.name,
        language,
        pokemon.id
      ),

    moveNames:
      resolveMoveNames(
        row.moveIds,
        database.moves,
        language
      ),

    abilityName:
      resolveAbilityName(
        row.abilityId,
        database.abilities,
        language
      ),

    abilityHidden:
      isPokemonHiddenAbility(
        pokemon,
        row.abilityId
      ),

    itemName:
      resolveItemName(
        row.itemId,
        database.items,
        language
      ),

    itemTypeLabel:
      resolveItemTypeLabel(
        row.itemId,
        database.items,
        language
      )
  };
}


function calculateEncounterTotals(
  rows,
  encounterType
) {

  return rows.reduce(
    (
      accumulator,
      row
    ) => {

      accumulator.defeated +=
        row.xp.defeated *
        row.quantity;


      if (
        encounterType !==
        "trainer"
      ) {

        accumulator.captured +=
          row.xp.captured *
          row.quantity;
      }


      accumulator.earned +=
        row.earnedXp;


      accumulator.tokens +=
        row.quantity;


      return accumulator;
    },
    {
      defeated:
        0,

      captured:
        0,

      earned:
        0,

      tokens:
        0
    }
  );
}

function renderSearchResultsMarkup({
  search,
  searchResults,
  language
}) {

  if (
    !String(
      search ??
      ""
    ).trim()
  ) {
    return "";
  }


  if (
    !searchResults.length
  ) {
    return `
      <div class="poke5e-encounter-planner__search-empty">

        <i
          class="fa-solid fa-magnifying-glass"
          aria-hidden="true"
        ></i>

        <span>
          No se encontraron Pokémon que coincidan con la búsqueda.
        </span>

      </div>
    `;
  }


  return searchResults
    .map(
      pokemon =>
        renderSearchResultCard(
          pokemon,
          language
        )
    )
    .join("");
}

export class PokemonEncounterPlanner
  extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id:
      "poke5e-encounter-planner",

    classes: [
      "poke5e-encounter-planner"
    ],

    tagName:
      "div",

    position: {
      width:
        1320,

      height:
        780
    },

    window: {
      frame:
        true,

      positioned:
        true,

      resizable:
        true,

      title:
        "Encounter Studio",

      icon:
        "poke5e-icon-ultraball"
    }
  };


  constructor(
    database,
    options = {}
  ) {
    super(
      options
    );


    this.database =
      database ?? {
        pokemon: [],
        moves: [],
        abilities: [],
        evolutions: [],
        items: []
      };

    this.randomCatalog =
      new EncounterRandomCatalog(
        this.database.pokemon
      );


    const randomRegion =
      this.randomCatalog
        .regions()[0] ??
      "";


    const randomBiome =
      this.randomCatalog
        .biomes(
          randomRegion
        )[0] ??
      "";


    /*
    * ApplicationV2 ya posee una propiedad
    * "state" de solo lectura.
    *
    * El estado propio del Planificador debe
    * utilizar un nombre independiente para
    * evitar colisiones con Foundry.
    */
    this._encounterState = {
      activeTab:
        "composition",

      compositionView:
        "compact",

      collapsedTrainerIds:
        new Set(),

      type:
        "wild",

      location:
        "",

      name:
        "",

      encounterKey:
        null,

      selectedEncounterKey:
        "",

      selectedEncounterLocation:
        "",

      search:
        "",

      rows:
        [],

      trainers:
        [],

      selectedTrainerId:
        "",

      randomRegion,

      randomBiome,

      randomMinLevel:
        1,

      randomMaxLevel:
        5,

      randomSize:
        "normal",

      randomMinSr:
        "",

      randomMaxSr:
        "",

      trainerRandomRegion:
        "",

      trainerRandomCount:
        "auto",

      trainerRandomOnField:
        "auto",


      trainerRandomPokemonCount:
        "auto",

      trainerRandomRank:
        "route",

      trainerRandomArchetype:
        "generic",

      trainerRandomMixedArchetypes:
        getDefaultMixedTrainerArchetypeIds(),
      
      rerollMoves:
        false,

      rerollAbilities:
        false,

      rerollItems:
        false,

      itemPolicies: {

        wild:
          getDefaultEncounterItemPolicy(
            "wild"
          ),

        trainer:
          getDefaultEncounterItemPolicy(
            "trainer"
          )
      },

      allowHiddenAbilities:
        true,

      hiddenAbilityChancePercent:
        5,

      busy:
        false
    };

    this.renderUiState =
      null;

    this.rowSequence =
      0;

    this.trainerSequence =
      0;

    this.abilityRepairPromise =
      null;

    this.abilityRepairCompleted =
      false;
  }


  async _prepareContext() {

    const language =
      getWorldLanguage();

    const deletionService =
      new EncounterDeletionService();


    await deletionService.cleanupPending();

    await this.#ensureEncounterAbilityRepair();

    const queryService =
      new EncounterQueryService();

    const existingEncounters =
      queryService.list();

    const savedEncounterLocations =
      buildSavedEncounterLocations(
        existingEncounters
      );


    const savedEncountersForLocation =
      filterSavedEncountersByLocation(
        existingEncounters,
        this._encounterState
          .selectedEncounterLocation
      );

    const searchResults =
      filterPokemon(
        this.database.pokemon,
        this._encounterState.search,
        language
      ).slice(
        0,
        SEARCH_LIMIT
      );


    const xpContext =
      this.#xpContext();

    const rows =
      this._encounterState.rows
        .map(
          row =>
            prepareEncounterRow({
              row,
              database:
                this.database,
              language,
              encounterType:
                this._encounterState.type,
              xpContext
            })
        )
        .filter(Boolean);


    const totals =
      calculateEncounterTotals(
        rows,
        this._encounterState.type
      );

    const randomRegions =
      this.randomCatalog
        .regions();


    const wildRandomRegions =
      getWildRandomRegionOptions(
        randomRegions
      );


    const randomBiomes =
      getWildRandomBiomeOptions(
        this.randomCatalog,
        this._encounterState
          .randomRegion
      );

    const randomSrValues =
      this.randomCatalog
        .srValues();

    const randomCandidateCount =
      countRandomCandidates({
        catalog:
          this.randomCatalog,

        region:
          this._encounterState
            .randomRegion,

        biome:
          this._encounterState
            .randomBiome,

        maxLevel:
          this._encounterState
            .randomMaxLevel,

        minSr:
          this._encounterState
            .randomMinSr,

        maxSr:
          this._encounterState
            .randomMaxSr,

        excludedPokemonIds:
          getLockedPokemonIds(
            this._encounterState
              .rows
          )
      });

    const trainerRandomCandidateCount =
      countTrainerRandomCandidates({
        catalog:
          this.randomCatalog,

        ...this.#trainerPool()
      });

    const trainerArchetypeGroups =
      listTrainerArchetypeGroups();

    const selectedTrainerArchetype =
      getTrainerArchetype(
        this._encounterState
          .trainerRandomArchetype
      );

    return {
      language,
      existingEncounters,
      savedEncounterLocations,
      savedEncountersForLocation,
      searchResults,
      rows,
      totals,
      randomRegions,
      wildRandomRegions,
      randomBiomes,
      randomSrValues,
      randomCandidateCount,

      randomLockedCount:
        this._encounterState.rows
          .filter(
            row =>
              row.locked ===
                true
          )
          .length,

      trainerRandomCandidateCount,
      trainerArchetypeGroups,
      selectedTrainerArchetype,
      trainerRandomMixedArchetypes: [
        ...this._encounterState
          .trainerRandomMixedArchetypes
      ]
    };
  }


  async _renderHTML(
    context
  ) {
    const searchResultsMarkup =
      renderSearchResultsMarkup({
        search:
          this._encounterState.search,

        searchResults:
          context.searchResults,

        language:
          context.language
      });

    const savedLocationOptions =
      renderSavedEncounterLocationOptions(
        context.savedEncounterLocations,
        this._encounterState
          .selectedEncounterLocation
      );


    const existingOptions =
      renderSavedEncounterOptions(
        context.savedEncountersForLocation,
        this._encounterState
          .selectedEncounterKey
      );

    const editingLabel =
      this._encounterState.encounterKey

        ? (
            `Editando: ` +
            `${this._encounterState.location} — ` +
            `${this._encounterState.name}`
          )

        : "Nuevo encuentro";


    const displayName =
      this._encounterState.name
        .trim() ||
      "Nuevo encuentro";


    const displayLocation =
      this._encounterState.location
        .trim() ||
      "Sin ubicación";


    const trainerEncounter =
      this._encounterState.type ===
      "trainer";

    const itemPolicy =
      getPlannerItemPolicy(
        this._encounterState
      );

    const activeStudioTab =
      normalizeEncounterStudioTab(
        this._encounterState
          .activeTab,
        trainerEncounter
      );


    this._encounterState.activeTab =
      activeStudioTab;

    const compositionView =
      normalizeEncounterCompositionView(
        this._encounterState
          .compositionView
      );


    this._encounterState.compositionView =
      compositionView;


    const compositionSummary =
      buildCompositionSummary({
        encounterType:
          this._encounterState.type,

        rowCount:
          context.rows.length,

        trainerCount:
          this._encounterState
            .trainers
            .length,

        tokens:
          context.totals.tokens
      });


    const encounterCompositionMarkup =
      renderEncounterComposition({
        rows:
          context.rows,

        encounterType:
          this._encounterState.type,

        trainers:
          this._encounterState
            .trainers,

        compositionView,

        collapsedTrainerIds:
          this._encounterState
            .collapsedTrainerIds
      });

    return `
      <section
        class="poke5e-encounter-planner__content"
        data-encounter-type="${escapeAttribute(
          this._encounterState.type
        )}"
      >

        <aside class="poke5e-encounter-planner__sidebar">
          <header class="poke5e-encounter-planner__hero">

            <div class="poke5e-encounter-planner__hero-icon">

              <i
                class="poke5e-icon-ultraball"
                aria-hidden="true"
              ></i>

            </div>


            <div class="poke5e-encounter-planner__hero-body">

              <small class="poke5e-encounter-planner__eyebrow">
                Encounter Studio
              </small>

              <h2 data-role="header-name">
                ${escapeHtml(displayName)}
              </h2>

              <span class="poke5e-encounter-planner__location">

                <i
                  class="fa-solid fa-location-dot"
                  aria-hidden="true"
                ></i>

                <span data-role="header-location">
                  ${escapeHtml(displayLocation)}
                </span>

              </span>

            </div>


            <span
              class="poke5e-encounter-planner__type-badge"
              data-role="encounter-type-badge"
              data-encounter-type="${escapeAttribute(
                this._encounterState.type
              )}"
            >

              <i
                class="${
                  trainerEncounter
                    ? "fa-solid fa-user"
                    : "fa-solid fa-leaf"
                }"
                aria-hidden="true"
              ></i>

              <span>
                ${
                  trainerEncounter
                    ? "Entrenador"
                    : "Salvaje"
                }
              </span>

            </span>

          </header>


          <section class="poke5e-encounter-planner__panel">

            <header class="poke5e-encounter-planner__panel-header">

              <i
                class="fa-solid fa-box-archive"
                aria-hidden="true"
              ></i>

              <h3>
                Encuentros guardados
              </h3>

              <small data-role="editing-label">
                ${escapeHtml(editingLabel)}
              </small>

            </header>


            <div class="poke5e-encounter-planner__saved-grid">

              <div>

                <label>
                  Ubicación

                  <select data-role="existing-encounter-location">

                    <option value="">
                      Seleccionar ubicación…
                    </option>

                    ${savedLocationOptions}

                  </select>

                </label>


                <label>
                  Encuentro

                  <select
                    data-role="existing-encounter"
                    ${
                      this._encounterState.selectedEncounterLocation
                        ? ""
                        : " disabled"
                    }
                  >

                    <option value="">
                      Seleccionar encuentro…
                    </option>

                    ${existingOptions}

                  </select>

                </label>

              </div>


              <button
                type="button"
                data-action="load-encounter"
                ${
                  this._encounterState.selectedEncounterKey
                    ? ""
                    : " disabled"
                }
              >

                <i
                  class="fa-solid fa-folder-open"
                  aria-hidden="true"
                ></i>

                Cargar

              </button>

              <button
                type="button"
                data-action="delete-encounter"
                title="Eliminar encuentro"
                aria-label="Eliminar encuentro"
                ${
                  this._encounterState.selectedEncounterKey
                    ? ""
                    : " disabled"
                }
              >

                <i
                  class="fa-solid fa-trash"
                  aria-hidden="true"
                ></i>

                Eliminar

              </button>

              <button
                type="button"
                data-action="new-encounter"
              >

                <i
                  class="fa-solid fa-plus"
                  aria-hidden="true"
                ></i>

                Nuevo

              </button>

            </div>

            <div data-role="route-summary">
              ${this.#routeSummary(context.savedEncountersForLocation)}
            </div>

          </section>


          <section class="poke5e-encounter-planner__panel">

            <header class="poke5e-encounter-planner__panel-header">

              <i
                class="fa-solid fa-sliders"
                aria-hidden="true"
              ></i>

              <h3>
                Configuración
              </h3>

            </header>


            <div class="poke5e-encounter-planner__config-grid">

              <label>
                Tipo

                <select data-role="encounter-type">

                  <option
                    value="wild"
                    ${
                      this._encounterState.type ===
                        "wild"
                        ? " selected"
                        : ""
                    }
                  >
                    Pokémon salvajes
                  </option>

                  <option
                    value="trainer"
                    ${
                      trainerEncounter
                        ? " selected"
                        : ""
                    }
                  >
                    Entrenador
                  </option>

                </select>

              </label>


              <label>
                Ubicación

                <input
                  type="text"
                  data-role="encounter-location"
                  placeholder="Ej. Ruta 3"
                  value="${escapeAttribute(
                    this._encounterState.location
                  )}"
                >

              </label>


              <label>
                Nombre del encuentro

                <input
                  type="text"
                  data-role="encounter-name"
                  placeholder="Ej. Emboscada al atardecer"
                  value="${escapeAttribute(
                    this._encounterState.name
                  )}"
                >

              </label>

            </div>

          </section>

        </aside>

        <main class="poke5e-encounter-planner__workspace">
          <div class="poke5e-encounter-planner__workspace-toolbar">
            <header class="poke5e-encounter-planner__workspace-header">

              <div>

                <small>
                  Encounter Workspace
                </small>

                <h2>
                  Diseño del encuentro
                </h2>

                <span>
                  Compón, genera y configura antes de crear Actors.
                </span>

              </div>


              <div class="poke5e-encounter-planner__workspace-actions">

                <button
                  type="button"
                  class="poke5e-encounter-planner__optional-toggle${this._encounterState.optional ? " is-active" : ""}"
                  data-action="toggle-optional"
                  aria-pressed="${this._encounterState.optional ? "true" : "false"}"
                  title="Un encuentro opcional no hace falta para avanzar: da XP de recuperación (más a los Pokémon más débiles) y sugiere un botín. En un encuentro guardado, se guarda al momento."
                >
                  <i
                    class="fa-solid ${this._encounterState.optional ? "fa-route" : "fa-flag-checkered"}"
                    aria-hidden="true"
                  ></i>

                  ${this._encounterState.optional ? "Opcional" : "Obligatorio"}
                </button>

                <span class="poke5e-encounter-planner__workspace-counter">

                  <i
                    class="fa-solid fa-paw"
                    aria-hidden="true"
                  ></i>

                  ${context.rows.length} fila(s)

                </span>

              </div>

            </header>


            <nav
              class="poke5e-encounter-planner__studio-tabs"
              role="tablist"
              aria-label="Secciones del Encounter Studio"
            >

              <button
                type="button"
                class="poke5e-encounter-planner__studio-tab${
                  activeStudioTab ===
                    "composition"
                    ? " is-active"
                    : ""
                }"
                data-action="switch-studio-tab"
                data-tab="composition"
                role="tab"
                aria-selected="${
                  activeStudioTab ===
                    "composition"
                    ? "true"
                    : "false"
                }"
              >
                <i
                  class="fa-solid fa-paw"
                  aria-hidden="true"
                ></i>

                Composición
              </button>


              <button
                type="button"
                class="poke5e-encounter-planner__studio-tab${
                  activeStudioTab ===
                    "generator"
                    ? " is-active"
                    : ""
                }"
                data-action="switch-studio-tab"
                data-tab="generator"
                role="tab"
                aria-selected="${
                  activeStudioTab ===
                    "generator"
                    ? "true"
                    : "false"
                }"
              >
                <i
                  class="fa-solid fa-dice-d20"
                  aria-hidden="true"
                ></i>

                Generador
              </button>


              <button
                type="button"
                class="poke5e-encounter-planner__studio-tab${
                  activeStudioTab ===
                    "trainers"
                    ? " is-active"
                    : ""
                }"
                data-action="switch-studio-tab"
                data-tab="trainers"
                role="tab"
                aria-selected="${
                  activeStudioTab ===
                    "trainers"
                    ? "true"
                    : "false"
                }"
                ${trainerEncounter ? "" : "hidden"}
              >
                <i
                  class="fa-solid fa-users"
                  aria-hidden="true"
                ></i>

                Entrenadores
              </button>


              <button
                type="button"
                class="poke5e-encounter-planner__studio-tab${
                  activeStudioTab ===
                    "options"
                    ? " is-active"
                    : ""
                }"
                data-action="switch-studio-tab"
                data-tab="options"
                role="tab"
                aria-selected="${
                  activeStudioTab ===
                    "options"
                    ? "true"
                    : "false"
                }"
              >
                <i
                  class="fa-solid fa-sliders"
                  aria-hidden="true"
                ></i>

                Opciones
              </button>

            </nav>

          </div>

          <section
            class="poke5e-encounter-planner__studio-panel"
            data-studio-tab="generator"
            role="tabpanel"
            ${activeStudioTab === "generator" ? "" : "hidden"}
          >
            ${renderRandomEncounterControls({
              regions:
                context.wildRandomRegions,

              biomes:
                context.randomBiomes,

              region:
                this._encounterState
                  .randomRegion,

              biome:
                this._encounterState
                  .randomBiome,

              minLevel:
                this._encounterState
                  .randomMinLevel,

              maxLevel:
                this._encounterState
                  .randomMaxLevel,

              size:
                this._encounterState
                  .randomSize,

              srValues:
                context.randomSrValues,

              minSr:
                this._encounterState
                  .randomMinSr,

              maxSr:
                this._encounterState
                  .randomMaxSr,

              difficulty:
                this._encounterState
                  .randomDifficulty,

              party:
                this.#party(),

              candidateCount:
                context.randomCandidateCount,

              lockedCount:
                context.randomLockedCount,

              visible:
                !trainerEncounter
            })}

            ${renderTrainerRandomControls({
              regions:
                context.randomRegions,

              region:
                this._encounterState
                  .trainerRandomRegion,

              trainerCount:
                this._encounterState
                  .trainerRandomCount,

              onField:
                this._encounterState
                  .trainerRandomOnField,

              pokemonCount:
                this._encounterState
                  .trainerRandomPokemonCount,

              candidateCount:
                context.trainerRandomCandidateCount,

              visible:
                trainerEncounter,

              archetypeGroups:
                context.trainerArchetypeGroups,

              archetype:
                context.selectedTrainerArchetype,

              archetypeId:
                this._encounterState
                  .trainerRandomArchetype,

              mixedArchetypeIds:
                context.trainerRandomMixedArchetypes,

              language:
                context.language,
              rank:
                this._encounterState
                  .trainerRandomRank,
              party:
                this.#party(),
              boosts:
                this.#boosts(),
              weakTo:
                this._encounterState
                  .partyWeakTo ??
                []
            })}

          </section>

          <section
            class="poke5e-encounter-planner__studio-panel"
            data-studio-tab="trainers"
            role="tabpanel"
            ${activeStudioTab === "trainers" ? "" : "hidden"}
          >
            ${renderTrainerControls({
              trainers:
                this._encounterState.trainers,

              selectedTrainerId:
                this._encounterState
                  .selectedTrainerId,

              rows:
                this._encounterState.rows,

              archetypes:
                context.trainerArchetypes,

              candidateCount:
                context.trainerRandomCandidateCount,

              language:
                context.language,

              visible:
                trainerEncounter
            })}
          </section>

          <section
            class="
              poke5e-encounter-planner__studio-panel
              poke5e-encounter-planner__composition
            "
            data-studio-tab="composition"
            role="tabpanel"
            ${activeStudioTab === "composition" ? "" : "hidden"}
          >

            <section class="poke5e-encounter-planner__composition-shell">

              <header class="poke5e-encounter-planner__composition-header">

                <div>

                  <span class="poke5e-encounter-planner__composition-icon">
                    <i
                      class="poke5e-icon-pokeball"
                      aria-hidden="true"
                    ></i>
                  </span>

                  <div>
                    <small>Composición</small>

                    <h3>
                      Pokémon del encuentro
                    </h3>

                    <span>
                      Edita nivel, cantidad, resultado de combate y recursos generados.
                    </span>
                  </div>

                </div>


                <div class="poke5e-encounter-planner__composition-tools">
                  <span
                    class="poke5e-encounter-planner__composition-count"
                    data-role="composition-summary"
                  >
                    ${escapeHtml(compositionSummary)}
                  </span>


                  <div
                    class="poke5e-encounter-planner__composition-view-switch"
                    role="group"
                    aria-label="Vista de composición"
                  >

                    <button
                      type="button"
                      class="poke5e-encounter-planner__composition-view-button${
                        compositionView ===
                          "cards"
                          ? " is-active"
                          : ""
                      }"
                      data-action="switch-composition-view"
                      data-role="composition-view-cards"
                      data-view="cards"
                      aria-pressed="${
                        compositionView ===
                          "cards"
                          ? "true"
                          : "false"
                      }"
                      title="Vista detallada"
                    >
                      <i
                        class="fa-solid fa-table-cells-large"
                        aria-hidden="true"
                      ></i>

                      Detallada
                    </button>


                    <button
                      type="button"
                      class="poke5e-encounter-planner__composition-view-button${
                        compositionView ===
                          "compact"
                          ? " is-active"
                          : ""
                      }"
                      data-action="switch-composition-view"
                      data-role="composition-view-compact"
                      data-view="compact"
                      aria-pressed="${
                        compositionView ===
                          "compact"
                          ? "true"
                          : "false"
                      }"
                      title="Vista compacta"
                    >
                      <i
                        class="fa-solid fa-bars"
                        aria-hidden="true"
                      ></i>

                      Compacta
                    </button>

                  </div>

                </div>

              </header>


              <div class="poke5e-encounter-planner__composition-search">

                <div class="poke5e-encounter-planner__search">

                  <i
                    class="fa-solid fa-magnifying-glass"
                    aria-hidden="true"
                  ></i>

                  <input
                    type="search"
                    data-role="pokemon-search"
                    placeholder="Buscar Pokémon para agregar por nombre, ID o Pokédex"
                    value="${escapeAttribute(
                      this._encounterState.search
                    )}"
                  >

                  <span class="poke5e-encounter-planner__search-limit">
                    Máx. ${SEARCH_LIMIT}
                  </span>

                </div>


                <div
                  class="poke5e-encounter-planner__search-results"
                  data-role="pokemon-search-results"
                  ${
                    this._encounterState.search.trim()
                      ? ""
                      : "hidden"
                  }
                >
                  ${searchResultsMarkup}
                </div>

              </div>
              ${encounterCompositionMarkup}
            </section>

          </section>

          <section
            class="poke5e-encounter-planner__studio-panel"
            data-studio-tab="options"
            role="tabpanel"
            ${activeStudioTab === "options" ? "" : "hidden"}
          >

            <section class="poke5e-encounter-planner__options">

              <div class="poke5e-encounter-planner__options-intro">

                <span class="poke5e-encounter-planner__options-icon">
                  <i
                    class="fa-solid fa-sliders"
                    aria-hidden="true"
                  ></i>
                </span>

                <div>
                  <strong>
                    Opciones de generación
                  </strong>

                  <span class="hint">
                    Configura qué puede regenerarse y las probabilidades
                    especiales antes de crear o actualizar el encuentro.
                  </span>
                </div>

              </div>


              <div class="poke5e-encounter-planner__options-grid">

                <fieldset
                  class="
                    poke5e-encounter-planner__option-group
                    poke5e-encounter-planner__option-group--reroll
                  "
                >

                  <legend>
                    <i
                      class="fa-solid fa-dice"
                      aria-hidden="true"
                    ></i>

                    Regeneración
                  </legend>


                  <div class="poke5e-encounter-planner__toggle-list">

                    <label class="poke5e-encounter-planner__toggle">

                      <input
                        type="checkbox"
                        data-role="reroll-moves"
                        ${
                          this._encounterState.rerollMoves
                            ? " checked"
                            : ""
                        }
                      >

                      <span>
                        <strong>Moves</strong>
                        <small>Generar nuevamente los movimientos.</small>
                      </span>

                    </label>


                    <label class="poke5e-encounter-planner__toggle">

                      <input
                        type="checkbox"
                        data-role="reroll-abilities"
                        ${
                          this._encounterState.rerollAbilities
                            ? " checked"
                            : ""
                        }
                      >

                      <span>
                        <strong>Habilidades</strong>
                        <small>Volver a resolver la Ability activa.</small>
                      </span>

                    </label>


                    <label class="poke5e-encounter-planner__toggle">

                      <input
                        type="checkbox"
                        data-role="reroll-items"
                        ${
                          this._encounterState.rerollItems
                            ? " checked"
                            : ""
                        }
                      >

                      <span>
                        <strong>Objetos</strong>
                        <small>Volver a sortear el objeto transportado.</small>
                      </span>

                    </label>

                  </div>

                </fieldset>


                <fieldset
                  class="
                    poke5e-encounter-planner__option-group
                    poke5e-encounter-planner__option-group--items
                  "
                >

                  <legend>
                    <i
                      class="fa-solid fa-box-archive"
                      aria-hidden="true"
                    ></i>

                    Objetos
                  </legend>


                  <div class="poke5e-encounter-planner__option-group-header">

                    <label class="poke5e-encounter-planner__toggle">

                      <input
                        type="checkbox"
                        data-role="allow-encounter-items"
                        ${
                          itemPolicy.enabled
                            ? " checked"
                            : ""
                        }
                      >

                      <span>
                        <strong>Permitir objetos</strong>
                        <small>Máximo un objeto por Actor Pokémon.</small>
                      </span>

                    </label>


                    <label class="poke5e-encounter-planner__compact-field">

                      <span>Probabilidad</span>

                      <span class="poke5e-encounter-planner__input-suffix">

                        <input
                          type="number"
                          data-role="encounter-item-chance"
                          min="0"
                          max="100"
                          step="1"
                          value="${itemPolicy.chancePercent}"
                          ${
                            itemPolicy.enabled
                              ? ""
                              : " disabled"
                          }
                        >

                        <span>%</span>

                      </span>

                    </label>

                  </div>


                  <div class="poke5e-encounter-planner__weight-grid">

                    <label class="poke5e-encounter-planner__weight-field">
                      <span>Bayas</span>

                      <input
                        type="number"
                        data-role="encounter-item-weight-berry"
                        min="0"
                        max="100"
                        step="1"
                        value="${itemPolicy.categoryWeights.berry}"
                        ${
                          itemPolicy.enabled
                            ? ""
                            : " disabled"
                        }
                      >
                    </label>


                    <label class="poke5e-encounter-planner__weight-field">
                      <span>Medicina</span>

                      <input
                        type="number"
                        data-role="encounter-item-weight-medicine"
                        min="0"
                        max="100"
                        step="1"
                        value="${itemPolicy.categoryWeights.medicine}"
                        ${
                          itemPolicy.enabled
                            ? ""
                            : " disabled"
                        }
                      >
                    </label>


                    <label class="poke5e-encounter-planner__weight-field">
                      <span>Poké Ball</span>

                      <input
                        type="number"
                        data-role="encounter-item-weight-pokeball"
                        min="0"
                        max="100"
                        step="1"
                        value="${itemPolicy.categoryWeights.pokeball}"
                        ${
                          itemPolicy.enabled
                            ? ""
                            : " disabled"
                        }
                      >
                    </label>


                    <label class="poke5e-encounter-planner__weight-field">
                      <span>Held Item</span>

                      <input
                        type="number"
                        data-role="encounter-item-weight-held-item"
                        min="0"
                        max="100"
                        step="1"
                        value="${itemPolicy.categoryWeights["held-item"]}"
                        ${
                          itemPolicy.enabled
                            ? ""
                            : " disabled"
                        }
                      >
                    </label>

                  </div>

                </fieldset>


                <fieldset
                  class="
                    poke5e-encounter-planner__option-group
                    poke5e-encounter-planner__option-group--abilities
                  "
                >

                  <legend>
                    <i
                      class="fa-solid fa-wand-magic-sparkles"
                      aria-hidden="true"
                    ></i>

                    Habilidades
                  </legend>


                  <div class="poke5e-encounter-planner__ability-options">

                    <label class="poke5e-encounter-planner__toggle">

                      <input
                        type="checkbox"
                        data-role="allow-hidden-abilities"
                        ${
                          this._encounterState.allowHiddenAbilities
                            ? " checked"
                            : ""
                        }
                      >

                      <span>
                        <strong>Permitir ocultas</strong>
                        <small>Incluye Hidden Abilities en la tirada.</small>
                      </span>

                    </label>


                    <label class="poke5e-encounter-planner__compact-field">

                      <span>Probabilidad oculta</span>

                      <span class="poke5e-encounter-planner__input-suffix">

                        <input
                          type="number"
                          data-role="hidden-ability-chance"
                          min="0"
                          max="100"
                          step="1"
                          value="${this._encounterState.hiddenAbilityChancePercent}"
                          ${
                            this._encounterState.allowHiddenAbilities
                              ? ""
                              : " disabled"
                          }
                        >

                        <span>%</span>

                      </span>

                    </label>

                  </div>

                </fieldset>

              </div>

            </section>
          </section>

          <footer class="poke5e-encounter-planner__footer">
            <div class="poke5e-encounter-planner__statusbar">
              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--tokens
                "
              >

                <i
                  class="fa-solid fa-cubes"
                  aria-hidden="true"
                ></i>

                <span>
                  Tokens
                </span>

                <strong data-total="tokens">
                  ${formatNumber(context.totals.tokens)}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--defeat
                "
              >

                <i
                  class="fa-solid fa-burst"
                  aria-hidden="true"
                ></i>

                <span>
                  EXP derrota
                </span>

                <strong data-total="defeated">
                  ${formatNumber(context.totals.defeated)}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--capture
                "
              >

                <i
                  class="fa-solid fa-circle-dot"
                  aria-hidden="true"
                ></i>

                <span>
                  EXP captura
                </span>

                <strong data-total="captured">
                  ${formatNumber(context.totals.captured)}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--earned
                "
              >

                <i
                  class="fa-solid fa-star"
                  aria-hidden="true"
                ></i>

                <span>
                  EXP obtenida
                </span>

                <strong data-total="earned">
                  ${formatNumber(context.totals.earned)}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--difficulty
                "
                data-role="difficulty-status"
                data-tier="${this.#describeDifficulty(context.rows).tier}"
                title="${this.#describeDifficulty(context.rows).title}"
              >

                <i
                  class="fa-solid fa-skull"
                  aria-hidden="true"
                ></i>

                <span>
                  Dificultad
                </span>

                <strong data-total="difficulty">
                  ${this.#describeDifficulty(context.rows).label}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--progress
                "
                data-role="progress-status"
                title="${escapeAttribute(this.#describeProgress(context.rows).title)}"
              >

                <i
                  class="fa-solid fa-arrow-trend-up"
                  aria-hidden="true"
                ></i>

                <span>
                  Avance
                </span>

                <strong data-total="progress">
                  ${this.#describeProgress(context.rows).label}
                </strong>

              </div>

            </div>
            <button
              type="button"
              data-action="award-xp"
              title="Tras el combate: marca los Pokémon que participaron y siguen en pie, y se les entrega su XP."
              ${context.rows.length ? "" : " disabled"}
            >
              <i
                class="fa-solid fa-gift"
                aria-hidden="true"
              ></i>
              Repartir XP
            </button>

            <button
              type="button"
              data-action="generate"
              ${
                this._encounterState.busy ||
                !context.rows.length
                  ? " disabled"
                  : ""
              }
            >

              <i
                class="fa-solid fa-wand-magic-sparkles"
                aria-hidden="true"
              ></i>

              ${
                this._encounterState.busy
                  ? "Generando…"
                  : "Generar / actualizar encuentro"
              }

            </button>

          </footer>

        </main>

      </section>
    `;
  }


  _replaceHTML(
    result,
    content
  ) {

    this.renderUiState =
      capturePlannerUiState(
        content
      );


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

    root.querySelectorAll(
      '[data-action="switch-studio-tab"]'
    ).forEach(
      button => {

        button.addEventListener(
          "click",

          () => {

            this.#activateStudioTab(
              root,
              String(
                button.dataset
                  .tab ??
                ""
              )
            );
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-action="switch-composition-view"]'
    ).forEach(
      button => {

        button.addEventListener(
          "click",

          () => {

            const nextView =
              normalizeEncounterCompositionView(
                button.dataset
                  .view
              );


            if (
              nextView ===
                this._encounterState
                  .compositionView
            ) {

              return;
            }


            this._encounterState.compositionView =
              nextView;


            void this.render({
              force:
                true
            });
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-action="toggle-trainer-composition"]'
    ).forEach(
      button => {

        button.addEventListener(
          "click",

          () => {

            this.#toggleTrainerCompositionGroup(
              root,
              String(
                button.dataset
                  .trainerId ??
                ""
              )
            );
          }
        );
      }
    );

    root.querySelector(
      '[data-role="existing-encounter-location"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.selectedEncounterLocation =
          String(
            event.currentTarget.value ??
            ""
          );


        /*
        * Una ubicación nueva invalida cualquier
        * encuentro previamente seleccionado.
        */
        this._encounterState.selectedEncounterKey =
          "";


        this.#refreshSavedEncounterPickerUi(
          root,
          context.existingEncounters
        );
      }
    );

    root.querySelector(
      '[data-role="existing-encounter"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.selectedEncounterKey =
          String(
            event.currentTarget.value ??
            ""
          );


        const disabled =
          !this._encounterState.selectedEncounterKey;


        const loadButton =
          root.querySelector(
            '[data-action="load-encounter"]'
          );


        const deleteButton =
          root.querySelector(
            '[data-action="delete-encounter"]'
          );


        if (loadButton) {
          loadButton.disabled =
            disabled;
        }


        if (deleteButton) {
          deleteButton.disabled =
            disabled;
        }
      }
    );


    root.querySelector(
      '[data-action="load-encounter"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#loadEncounter();
      }
    );

    root.querySelector(
      '[data-action="delete-encounter"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#deleteEncounter();
      }
    );

    root.querySelector(
      '[data-action="new-encounter"]'
    )?.addEventListener(
      "click",

      () => {
        this.#newEncounter();
      }
    );

    root.querySelector(
      '[data-role="encounter-type"]'
    )?.addEventListener(
      "change",

      event => {

        this._encounterState.type =
          event.currentTarget.value;


        if (
          this._encounterState.type ===
            "trainer"
        ) {

          this._encounterState.rows.forEach(
            row => {

              row.captured =
                0;
            }
          );
        }


        this.#refreshEncounterTypeUi(
          root
        );


        this.#refreshAllEncounterRowsUi(
          root
        );

        /*
        * El tipo cambia también la estructura
        * visual de Composición (Wild / Trainer).
        */
        void this.render({
          force:
            true
        });
      }
    );

    root.querySelector(
      '[data-role="random-region"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomRegion =
          String(
            event.currentTarget.value ??
            ""
          );


        const biomes =
          getWildRandomBiomeOptions(
            this.randomCatalog,
            this._encounterState
              .randomRegion
          );


        this._encounterState.randomBiome =
          biomes.includes(
            this._encounterState
              .randomBiome
          )
            ? this._encounterState
                .randomBiome
            : getDefaultWildRandomBiome(
                biomes
              );


        this.#refreshRandomizerUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="random-biome"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomBiome =
          String(
            event.currentTarget.value ??
            ""
          );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="random-min-level"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomMinLevel =
          clampInteger(
            event.currentTarget.value,
            1,
            20,
            1
          );


        if (
          this._encounterState.randomMinLevel >
          this._encounterState.randomMaxLevel
        ) {
          this._encounterState.randomMaxLevel =
            this._encounterState.randomMinLevel;
        }


        this.#refreshRandomizerLevelInputsUi(
          root
        );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="random-max-level"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomMaxLevel =
          clampInteger(
            event.currentTarget.value,
            1,
            20,
            5
          );


        if (
          this._encounterState.randomMaxLevel <
          this._encounterState.randomMinLevel
        ) {
          this._encounterState.randomMinLevel =
            this._encounterState.randomMaxLevel;
        }


        this.#refreshRandomizerLevelInputsUi(
          root
        );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="random-size"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomSize =
          String(
            event.currentTarget.value ??
            "normal"
          );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );

    root.querySelector(
      '[data-role="random-min-sr"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomMinSr =
          normalizeOptionalNumberInput(
            event.currentTarget.value
          );


        const minSr =
          optionalNumber(
            this._encounterState
              .randomMinSr
          );


        const maxSr =
          optionalNumber(
            this._encounterState
              .randomMaxSr
          );


        if (
          minSr != null &&
          maxSr != null &&
          minSr >
            maxSr
        ) {
          this._encounterState.randomMaxSr =
            this._encounterState
              .randomMinSr;
        }


        this.#refreshRandomizerSrInputsUi(
          root
        );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="random-max-sr"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.randomMaxSr =
          normalizeOptionalNumberInput(
            event.currentTarget.value
          );


        const minSr =
          optionalNumber(
            this._encounterState
              .randomMinSr
          );


        const maxSr =
          optionalNumber(
            this._encounterState
              .randomMaxSr
          );


        if (
          minSr != null &&
          maxSr != null &&
          maxSr <
            minSr
        ) {
          this._encounterState.randomMinSr =
            this._encounterState
              .randomMaxSr;
        }


        this.#refreshRandomizerSrInputsUi(
          root
        );


        this.#refreshRandomCandidateCountUi(
          root
        );
      }
    );

    root.querySelector(
      '[data-action="randomize-encounter"]'
    )?.addEventListener(
      "click",

      () => {
        this.#generateRandomEncounter();
      }
    );

    for (
      const [
        role,
        key
      ]
      of [
        ["random-difficulty", "randomDifficulty"]
      ]
    ) {
      root.querySelector(
        `[data-role="${role}"]`
      )?.addEventListener(
        "change",

        event => {
          this._encounterState[key] =
            String(
              event.currentTarget.value ??
              ""
            );
        }
      );
    }

    for (
      const [
        role,
        key,
        max
      ]
      of [
        ["party-size", "partySize", 12],
        ["party-level", "partyLevel", 20],
        ["party-team", "partyTeam", 6],
        ["party-participants", "partyParticipants", 24]
      ]
    ) {
      const inputs =
        root.querySelectorAll(
          `[data-role="${role}"]`
        );

      for (const input of inputs) {
        input.addEventListener(
          "change",

          event => {
            this._encounterState[key] =
              clampInteger(
                event.currentTarget.value,
                1,
                max,
                1
              );

            for (const other of inputs) {
              other.value =
                String(
                  this._encounterState[key]
                );
            }

            this.#refreshTotalsUi(
              root
            );

            this.#refreshTrainerRandomCandidateCountUi(
              root
            );
          }
        );
      }
    }

    for (
      const [
        role,
        key
      ]
      of [
        ["boost-stats", "boostStats"],
        ["boost-coverage", "boostCoverage"],
        ["boost-items", "boostItems"]
      ]
    ) {
      root.querySelector(
        `[data-role="${role}"]`
      )?.addEventListener(
        "change",

        event => {
          this._encounterState[key] =
            event.currentTarget.type ===
              "checkbox"
              ? event.currentTarget.checked
              : Number(
                  event.currentTarget.value
                );

          this.#refreshTotalsUi(
            root
          );
        }
      );
    }

    // A rank brings its extras; they can still be changed by hand.
    root.querySelector(
      '[data-role="trainer-random-rank"]'
    )?.addEventListener(
      "change",

      event => {
        const rank =
          getTrainerRank(
            event.currentTarget.value
          );

        Object.assign(
          this._encounterState,
          {
            trainerRandomRank:
              rank.id,
            boostStats:
              rank.extras.statBonus ??
              0,
            boostCoverage:
              rank.extras.coverage ===
                true,
            boostItems:
              rank.extras.items ===
                true
          }
        );

        void this.render({
          force:
            true
        });
      }
    );

    for (
      const button
      of root.querySelectorAll(
        '[data-action="detect-party"]'
      )
    ) {
      button.addEventListener(
        "click",

        () => {
          const party =
            detectPartyOrDefault();

          Object.assign(
            this._encounterState,
            {
              partySize:
                party.size,
              partyLevel:
                party.level,
              partyTeam:
                party.team,
              partyWeakTo:
                party.weakTo,
              partyPokemon:
                party.pokemon,
              partyStrongest:
                party.strongest
            }
          );

          ui.notifications.info(
            party.detected
              ? `Grupo: ${party.size} jugador(es), nivel ${party.level}, ${party.team} Pokémon cada uno.`
              : "No hay entrenadores de jugadores con Pokémon; ajusta el grupo a mano."
          );

          void this.render({
            force:
              true
          });
        }
      );
    }

    root.querySelector(
      '[data-role="trainer-random-region"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.trainerRandomRegion =
          String(
            event.currentTarget.value ??
            ""
          );


        this.#refreshTrainerRandomCandidateCountUi(
          root
        );
      }
    );


    for (
      const [
        role,
        key
      ]
      of [
        ["trainer-random-count", "trainerRandomCount"],
        ["trainer-random-on-field", "trainerRandomOnField"]
      ]
    ) {
      root.querySelector(
        `[data-role="${role}"]`
      )?.addEventListener(
        "change",

        event => {
          this._encounterState[key] =
            normalizeTrainerTeamSize(
              event.currentTarget.value
            );
        }
      );
    }


    root.querySelector(
      '[data-role="trainer-random-pokemon-count"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.trainerRandomPokemonCount =
          String(
            event.currentTarget.value ??
            "auto"
          );


        this.#refreshTrainerRandomCandidateCountUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="trainer-random-archetype"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.trainerRandomArchetype =
          String(
            event.currentTarget.value ??
            "generic"
          );


        this.#refreshTrainerArchetypeUi(
          root
        );


        this.#refreshTrainerRandomCandidateCountUi(
          root
        );
      }
    );

    root.querySelectorAll(
      '[data-role="trainer-mixed-archetype"]'
    ).forEach(
      input => {
        input.addEventListener(
          "change",

          () => {
            const archetypeId =
              String(
                input.value ??
                ""
              );


            const selected =
              new Set(
                this._encounterState
                  .trainerRandomMixedArchetypes
              );


            if (
              input.checked
            ) {
              selected.add(
                archetypeId
              );

            } else {
              selected.delete(
                archetypeId
              );
            }


            this._encounterState.trainerRandomMixedArchetypes =
              [
                ...selected
              ];


            this.#refreshTrainerArchetypeUi(
              root
            );


            this.#refreshTrainerRandomCandidateCountUi(
              root
            );
          }
        );
      }
    );

    root.querySelector(
      '[data-role="trainer-mixed-search"]'
    )?.addEventListener(
      "input",

      event => {
        filterTrainerMixedArchetypeOptions(
          root,
          event.currentTarget.value
        );
      }
    );


    root.querySelector(
      '[data-action="trainer-mixed-select-all"]'
    )?.addEventListener(
      "click",

      () => {
        this.#setTrainerMixedArchetypes(
          root,
          listTrainerArchetypes()
            .map(
              archetype =>
                archetype.id
            )
        );
      }
    );


    root.querySelector(
      '[data-action="trainer-mixed-select-none"]'
    )?.addEventListener(
      "click",

      () => {
        this.#setTrainerMixedArchetypes(
          root,
          []
        );
      }
    );

    root.querySelector(
      '[data-action="randomize-trainers"]'
    )?.addEventListener(
      "click",

      () => {
        this.#generateRandomTrainerEncounter();
      }
    );

    root.querySelector(
      '[data-action="add-trainer"]'
    )?.addEventListener(
      "click",

      () => {
        this.#addTrainer();
      }
    );


    root.querySelectorAll(
      '[data-role="trainer-name"]'
    ).forEach(
      input => {
        input.addEventListener(
          "input",

          () => {
            const trainerId =
              String(
                input.dataset
                  .trainerId ??
                ""
              );


            const trainer =
              this._encounterState
                .trainers
                .find(
                  entry =>
                    entry.id ===
                    trainerId
                );


            if (!trainer) {

              return;
            }


            trainer.name =
              input.value;


            const targetSelect =
              root.querySelector(
                '[data-role="trainer-target"]'
              );


            const targetOption =
              targetSelect
                ? [
                    ...targetSelect.options
                  ].find(
                    option =>
                      option.value ===
                      trainer.id
                  )
                : null;


            if (targetOption) {

              targetOption.textContent =
                trainer.name.trim() ||
                "Entrenador sin nombre";
            }

            this.#refreshTrainerNameInRowsUi(
              root,
              trainer.id,
              trainer.name
            );
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-role="trainer-archetype"]'
    ).forEach(
      select => {
        select.addEventListener(
          "change",

          () => {
            const trainer =
              this.#getTrainer(
                select.dataset
                  .trainerId
              );


            if (!trainer) {
              return;
            }


            trainer.archetypeId =
              getTrainerArchetype(
                select.value
              ).id;


            this.#refreshTrainerCardRerollButtonsUi(
              root
            );
          }
        );
      }
    );


    root.querySelectorAll(
      '[data-role="trainer-on-field"]'
    ).forEach(
      select => {
        select.addEventListener(
          "change",

          () => {
            const trainer =
              this.#getTrainer(
                select.dataset
                  .trainerId
              );

            if (!trainer) {
              return;
            }

            trainer.onField =
              clampInteger(
                select.value,
                1,
                6,
                1
              );

            this.#refreshTotalsUi(
              root
            );
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-role="trainer-team-size"]'
    ).forEach(
      select => {
        select.addEventListener(
          "change",

          () => {
            const trainer =
              this.#getTrainer(
                select.dataset
                  .trainerId
              );


            if (!trainer) {
              return;
            }


            trainer.teamSize =
              normalizeTrainerTeamSize(
                select.value
              );


            this.#refreshTrainerCardRerollButtonsUi(
              root
            );
          }
        );
      }
    );


    root.querySelectorAll(
      '[data-action="reroll-trainer-team"]'
    ).forEach(
      button => {
        button.addEventListener(
          "click",

          () => {
            this.#rerollTrainerTeam(
              String(
                button.dataset
                  .trainerId ??
                ""
              )
            );
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-action="remove-trainer"]'
    ).forEach(
      button => {
        button.addEventListener(
          "click",

          () => {
            this.#removeTrainer(
              String(
                button.dataset
                  .trainerId ??
                ""
              )
            );
          }
        );
      }
    );


    root.querySelector(
      '[data-role="trainer-target"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.selectedTrainerId =
          String(
            event.currentTarget.value ??
            ""
          );
      }
    );

    root.querySelector(
      '[data-role="encounter-location"]'
    )?.addEventListener(
      "input",

      event => {

        this._encounterState.location =
          event.currentTarget.value;


        this.#refreshIdentityUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-action="toggle-optional"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#toggleOptional();
      }
    );

    root.querySelector(
      '[data-role="encounter-name"]'
    )?.addEventListener(
      "input",

      event => {

        this._encounterState.name =
          event.currentTarget.value;


        this.#refreshIdentityUi(
          root
        );
      }
    );


    const searchInput =
      root.querySelector(
        '[data-role="pokemon-search"]'
      );


    searchInput?.addEventListener(
      "input",

      event => {

        this._encounterState.search =
          event.currentTarget.value;


        this.#refreshSearchResultsUi(
          root
        );
      }
    );


    root.addEventListener(
      "click",

      event => {

        const button =
          event.target
            ?.closest?.(
              '[data-action="add-pokemon"]'
            );


        if (
          !button ||
          !root.contains(
            button
          )
        ) {

          return;
        }


        const pokemonId =
          String(
            button.dataset
              .pokemonId ??
            ""
          );


        this.#addPokemon(
          pokemonId
        );
      }
    );

    const liveRowInputSelector =
      [
        '[data-role="encounter-level"]',
        '[data-role="encounter-quantity"]',
        '[data-role="encounter-defeated"]',
        '[data-role="encounter-captured"]'
      ].join(
        ","
      );


    root.addEventListener(
      "input",

      event => {

        const input =
          event.target
            ?.closest?.(
              liveRowInputSelector
            );


        if (
          !input ||
          !root.contains(
            input
          ) ||
          input.value ===
            ""
        ) {

          return;
        }


        this.#updateEncounterRowFromInput(
          root,
          input
        );
      }
    );


    root.addEventListener(
      "change",

      event => {

        const input =
          event.target
            ?.closest?.(
              liveRowInputSelector
            );


        if (
          !input ||
          !root.contains(
            input
          )
        ) {

          return;
        }


        /*
         * Si el usuario dejó temporalmente el
         * input vacío, recuperamos el valor real.
         */
        if (
          input.value ===
          ""
        ) {

          const row =
            this.#getRowFromElement(
              input
            );


          if (row) {

            this.#refreshEncounterRowUi(
              root,
              row
            );
          }


          return;
        }


        this.#updateEncounterRowFromInput(
          root,
          input
        );
      }
    );

    root.querySelectorAll(
      '[data-action="remove-pokemon"]'
    ).forEach(
      button => {

        button.addEventListener(
          "click",

          () => {
            const rowId =
              String(
                button.dataset
                  .rowId ??
                ""
              );


            this._encounterState.rows =
              this._encounterState.rows.filter(
                row =>
                  row.id !==
                  rowId
              );


            void this.render({
              force:
                true
            });
          }
        );
      }
    );

    root.querySelectorAll(
      '[data-action="toggle-random-lock"]'
    ).forEach(
      button => {
        button.addEventListener(
          "click",

          () => {
            this.#toggleRandomLock(
              String(
                button.dataset
                  .rowId ??
                ""
              )
            );
          }
        );
      }
    );

    root.querySelector(
      '[data-role="reroll-moves"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.rerollMoves =
          Boolean(
            event.currentTarget
              .checked
          );
      }
    );

    root.querySelector(
      '[data-role="reroll-abilities"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.rerollAbilities =
          Boolean(
            event.currentTarget
              .checked
          );
      }
    );

    root.querySelector(
      '[data-role="reroll-items"]'
    )?.addEventListener(
      "change",

      event => {

        this._encounterState.rerollItems =
          Boolean(
            event.currentTarget
              .checked
          );
      }
    );


    root.querySelector(
      '[data-role="allow-encounter-items"]'
    )?.addEventListener(
      "change",

      event => {

        const policy =
          getPlannerItemPolicy(
            this._encounterState
          );


        policy.enabled =
          Boolean(
            event.currentTarget
              .checked
          );


        this.#refreshEncounterItemPolicyUi(
          root
        );
      }
    );


    root.querySelector(
      '[data-role="encounter-item-chance"]'
    )?.addEventListener(
      "change",

      event => {

        const policy =
          getPlannerItemPolicy(
            this._encounterState
          );


        policy.chancePercent =
          clampInteger(
            event.currentTarget.value,
            0,
            100,
            policy.chancePercent
          );


        event.currentTarget.value =
          String(
            policy.chancePercent
          );
      }
    );


    const itemWeightRoles = {

      "encounter-item-weight-berry":
        "berry",

      "encounter-item-weight-medicine":
        "medicine",

      "encounter-item-weight-pokeball":
        "pokeball",

      "encounter-item-weight-held-item":
        "held-item"
    };


    for (
      const [
        role,
        category
      ]
      of Object.entries(
        itemWeightRoles
      )
    ) {

      root.querySelector(
        `[data-role="${role}"]`
      )?.addEventListener(
        "change",

        event => {

          const policy =
            getPlannerItemPolicy(
              this._encounterState
            );


          policy.categoryWeights[
            category
          ] =
            clampInteger(
              event.currentTarget.value,
              0,
              100,

              policy.categoryWeights[
                category
              ]
            );


          event.currentTarget.value =
            String(
              policy.categoryWeights[
                category
              ]
            );
        }
      );
    }

    root.querySelector(
      '[data-role="allow-hidden-abilities"]'
    )?.addEventListener(
      "change",

      event => {
        this._encounterState.allowHiddenAbilities =
          Boolean(
            event.currentTarget
              .checked
          );


        const chanceInput =
          root.querySelector(
            '[data-role="hidden-ability-chance"]'
          );


        if (chanceInput) {
          chanceInput.disabled =
            !this._encounterState
              .allowHiddenAbilities;
        }
      }
    );


    root.querySelector(
      '[data-role="hidden-ability-chance"]'
    )?.addEventListener(
      "change",

      event => {
        const value =
          clampInteger(
            event.currentTarget.value,
            0,
            100,
            5
          );


        this._encounterState.hiddenAbilityChancePercent =
          value;


        event.currentTarget.value =
          String(
            value
          );
      }
    );

    root.querySelector(
      '[data-action="award-xp"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#awardXp();
      }
    );

    root.querySelector(
      '[data-action="generate"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#generateEncounter();
      }
    );


    restorePlannerUiState(
      this.renderUiState
    );


    this.renderUiState =
      null;
  }

  #activateStudioTab(
    root,
    tab
  ) {

    const normalizedTab =
      normalizeEncounterStudioTab(
        tab,
        this._encounterState.type ===
          "trainer"
      );


    this._encounterState.activeTab =
      normalizedTab;


    root.querySelectorAll(
      '[data-action="switch-studio-tab"]'
    ).forEach(
      button => {

        const active =
          button.dataset.tab ===
            normalizedTab;


        button.classList.toggle(
          "is-active",
          active
        );


        button.setAttribute(
          "aria-selected",
          String(
            active
          )
        );


        button.tabIndex =
          active
            ? 0
            : -1;
      }
    );


    root.querySelectorAll(
      "[data-studio-tab]"
    ).forEach(
      panel => {

        panel.hidden =
          panel.dataset
            .studioTab !==
          normalizedTab;
      }
    );
  }

  #toggleTrainerCompositionGroup(
    root,
    trainerId
  ) {

    const normalizedTrainerId =
      String(
        trainerId ??
        ""
      );


    if (!normalizedTrainerId) {

      return;
    }


    const collapsedIds =
      this._encounterState
        .collapsedTrainerIds instanceof
        Set

        ? this._encounterState
            .collapsedTrainerIds

        : new Set();


    this._encounterState.collapsedTrainerIds =
      collapsedIds;


    const collapsed =
      !collapsedIds.has(
        normalizedTrainerId
      );


    if (collapsed) {

      collapsedIds.add(
        normalizedTrainerId
      );

    } else {

      collapsedIds.delete(
        normalizedTrainerId
      );
    }


    const group =
      [
        ...root.querySelectorAll(
          "[data-trainer-group-id]"
        )
      ].find(
        element =>
          String(
            element.dataset
              .trainerGroupId ??
            ""
          ) ===
          normalizedTrainerId
      );


    if (!group) {

      return;
    }


    group.classList.toggle(
      "is-collapsed",
      collapsed
    );


    const body =
      group.querySelector(
        '[data-role="trainer-composition-body"]'
      );


    if (body) {

      body.hidden =
        collapsed;
    }


    const button =
      group.querySelector(
        '[data-action="toggle-trainer-composition"]'
      );


    if (!button) {

      return;
    }


    button.setAttribute(
      "aria-expanded",
      String(
        !collapsed
      )
    );


    button.title =
      collapsed
        ? "Expandir Entrenador"
        : "Minimizar Entrenador";


    button.setAttribute(
      "aria-label",
      button.title
    );


    const icon =
      button.querySelector(
        "i"
      );


    if (icon) {

      icon.className =
        collapsed
          ? "fa-solid fa-chevron-right"
          : "fa-solid fa-chevron-down";
    }
  }

  #refreshSavedEncounterPickerUi(
    root,
    existingEncounters
  ) {
    const encounterSelect =
      root.querySelector(
        '[data-role="existing-encounter"]'
      );


    const encounters =
      filterSavedEncountersByLocation(
        existingEncounters,
        this._encounterState
          .selectedEncounterLocation
      );


    if (encounterSelect) {
      encounterSelect.innerHTML =
        `
          <option value="">
            Seleccionar encuentro…
          </option>
        ` +
        renderSavedEncounterOptions(
          encounters,
          ""
        );


      encounterSelect.disabled =
        !this._encounterState
          .selectedEncounterLocation ||
        !encounters.length;


      encounterSelect.value =
        "";
    }

    const routeSummary =
      root.querySelector(
        '[data-role="route-summary"]'
      );

    if (routeSummary) {
      routeSummary.innerHTML =
        this.#routeSummary(
          encounters
        );
    }


    const loadButton =
      root.querySelector(
        '[data-action="load-encounter"]'
      );


    const deleteButton =
      root.querySelector(
        '[data-action="delete-encounter"]'
      );


    if (loadButton) {
      loadButton.disabled =
        true;
    }


    if (deleteButton) {
      deleteButton.disabled =
        true;
    }
  }

  async #ensureEncounterAbilityRepair() {
    if (
      this.abilityRepairCompleted ||
      !game.user.isGM
    ) {
      return;
    }


    if (
      !this.abilityRepairPromise
    ) {
      this.abilityRepairPromise =
        this.#runEncounterAbilityRepair();
    }


    await this.abilityRepairPromise;
  }


  async #runEncounterAbilityRepair() {
    try {
      const service =
        new EncounterGenerationService(
          this.database,
          getWorldLanguage()
        );


      const result =
        await service
          .repairMissingAbilities({
            allowHiddenAbilities:
              this._encounterState
                .allowHiddenAbilities,

            hiddenAbilityChancePercent:
              this._encounterState
                .hiddenAbilityChancePercent
          });


      if (
        result.affected > 0
      ) {
        ui.notifications.info(
          `Habilidades de encuentros: ${result.repaired} agregada(s)` +
          (
            result.adopted
              ? ` · ${result.adopted} existente(s) adoptada(s)`
              : ""
          ) +
          "."
        );
      }


      if (
        result.failed > 0
      ) {
        ui.notifications.warn(
          `Habilidades de encuentros: ${result.failed} Pokémon no pudieron repararse. Revisa la consola.`
        );
      }

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error reparando Habilidades de encuentros`,
        error
      );


      ui.notifications.warn(
        "No se pudo completar la reparación automática de Habilidades de encuentros."
      );

    } finally {
      this.abilityRepairCompleted =
        true;

      this.abilityRepairPromise =
        null;
    }
  }

  #addPokemon(
    pokemonId
  ) {
    const pokemon =
      findPokemon(
        this.database.pokemon,
        pokemonId
      );


    if (!pokemon) {
      return;
    }


    let trainerId =
      null;


    if (
      this._encounterState.type ===
        "trainer"
    ) {
      const trainer =
        this.#ensureTrainerExists();


      trainerId =
        this._encounterState
          .selectedTrainerId ||
        trainer.id;
    }


    this.rowSequence +=
      1;


    this._encounterState.rows.push({
      id:
        `row-${this.rowSequence}`,

      pokemonId:
        String(
          pokemon.id
        ),

      trainerId,

      level:
        getPokemonMinimumLevel(
          pokemon
        ),

      quantity:
        1,

      defeated:
        0,

      captured:
        0,

      moveIds:
        [],

      abilityId:
        null,

      itemId:
        null,

      itemResolved:
        false,

      locked:
        false
    });


    void this.render({
      force:
        true
    });
  }

  #ensureTrainerExists() {
    const existing =
      this._encounterState
        .trainers[0];


    if (existing) {
      if (
        !this._encounterState
          .selectedTrainerId
      ) {
        this._encounterState.selectedTrainerId =
          existing.id;
      }


      return existing;
    }


    return this.#createTrainer();
  }


  #allocateTrainerId(
    reservedIds = new Set()
  ) {
    let id =
      "";


    do {
      this.trainerSequence +=
        1;

      id =
        `trainer-${this.trainerSequence}`;

    } while (
      reservedIds.has(
        id
      ) ||
      this._encounterState
        .trainers
        .some(
          trainer =>
            trainer.id ===
            id
        )
    );


    return id;
  }

  #getTrainer(
    trainerId
  ) {
    const id =
      String(
        trainerId ??
        ""
      );


    return (
      this._encounterState
        .trainers
        .find(
          trainer =>
            trainer.id ===
              id
        ) ??
      null
    );
  }

  #createTrainer() {
    const id =
      this.#allocateTrainerId();


    const trainer = {
      id,

      name:
        `Entrenador ${this.trainerSequence}`,

      archetypeId:
        "generic",

      teamSize:
        "auto",

      onField:
        1
    };

    this._encounterState.trainers.push(
      trainer
    );


    this._encounterState.selectedTrainerId =
      trainer.id;


    return trainer;
  }


  #addTrainer() {
    this.#createTrainer();


    void this.render({
      force:
        true
    });
  }


  #removeTrainer(
    trainerId
  ) {
    const exists =
      this._encounterState
        .trainers
        .some(
          trainer =>
            trainer.id ===
            trainerId
        );


    if (!exists) {
      return;
    }

    this._encounterState
      .collapsedTrainerIds
      ?.delete(
        trainerId
      );

    this._encounterState.trainers =
      this._encounterState
        .trainers
        .filter(
          trainer =>
            trainer.id !==
            trainerId
        );


    this._encounterState.rows =
      this._encounterState
        .rows
        .filter(
          row =>
            row.trainerId !==
            trainerId
        );


    if (
      this._encounterState
        .selectedTrainerId ===
        trainerId
    ) {
      this._encounterState.selectedTrainerId =
        this._encounterState
          .trainers[0]
          ?.id ??
        "";
    }


    void this.render({
      force:
        true
    });
  }

  async #loadEncounter() {
    const encounterKey =
      this._encounterState
        .selectedEncounterKey;


    if (!encounterKey) {
      ui.notifications.warn(
        "Selecciona un encuentro guardado."
      );

      return;
    }


    const queryService =
      new EncounterQueryService();


    const encounter =
      queryService.get(
        encounterKey
      );


    if (!encounter) {
      ui.notifications.warn(
        "El encuentro seleccionado ya no existe o no contiene Pokémon activos."
      );


      this._encounterState.selectedEncounterKey =
        "";


      await this.render({
        force:
          true
      });

      return;
    }


    this.#applyEncounter(
      encounter
    );

    this._encounterState.collapsedTrainerIds =
      new Set();

    await this.render({
      force:
        true
    });
  }


  #newEncounter() {
    this.#resetEncounterState();


    void this.render({
      force:
        true
    });
  }


  #resetEncounterState() {
    this._encounterState.activeTab =
      "composition";

    this._encounterState.collapsedTrainerIds =
      new Set();

    this._encounterState.type =
      "wild";

    this._encounterState.location =
      "";

    this._encounterState.name =
      "";

    this._encounterState.optional =
      false;

    this._encounterState.encounterKey =
      null;

    this._encounterState.selectedEncounterKey =
      "";

    this._encounterState.selectedEncounterLocation =
      "";

    this._encounterState.search =
      "";

    this._encounterState.rows =
      [];

    this._encounterState.rerollMoves =
      false;

    this._encounterState.trainers =
      [];

    this._encounterState.selectedTrainerId =
      "";

    this._encounterState.rerollAbilities =
      false;

    this._encounterState.rerollItems =
      false;
  }


  #applyEncounter(
    encounter,
    {
      preserveTransientTrainerPreferences =
        false
    } = {}
  ) {
    const existingTrainerPreferences =
      preserveTransientTrainerPreferences
        ? new Map(
            this._encounterState
              .trainers
              .map(
                trainer => [
                  trainer.id,
                  {
                    archetypeId:
                      trainer.archetypeId,

                    teamSize:
                      normalizeTrainerTeamSize(
                        trainer.teamSize
                      ),

                    onField:
                      trainer.onField
                  }
                ]
              )
          )
        : new Map();


    this._encounterState.type =
      encounter.type ===
        "trainer"
        ? "trainer"
        : "wild";

    this._encounterState.activeTab =
      normalizeEncounterStudioTab(
        this._encounterState
          .activeTab,
        this._encounterState.type ===
          "trainer"
      );

    this._encounterState.location =
      encounter.location;

    this._encounterState.name =
      encounter.name;

    this._encounterState.optional =
      encounter.optional ===
        true;

    this._encounterState.encounterKey =
      encounter.key;

    this._encounterState.selectedEncounterKey =
      encounter.key;

    this._encounterState.selectedEncounterLocation =
      normalizeSavedEncounterLocation(
        encounter.location
      );

    this._encounterState.search =
      "";

    this._encounterState.rerollMoves =
      false;

    this._encounterState.rerollAbilities =
      false;

    this._encounterState.rerollItems = false;


    if (
      this._encounterState.type ===
        "trainer"
    ) {
      this._encounterState.trainers =
        (
          encounter.trainers ??
          []
        ).map(
          trainer => {
            const existingPreference =
              existingTrainerPreferences.get(
                trainer.id
              );


            return {
              id:
                trainer.id,

              name:
                trainer.name,

              archetypeId:
                getTrainerArchetype(
                  trainer.archetypeId ??
                  existingPreference
                    ?.archetypeId ??
                  "generic"
                ).id,

              teamSize:
                normalizeTrainerTeamSize(
                  existingPreference
                    ?.teamSize ??
                  "auto"
                ),

              // shortcut: kept for this session like the team size, not saved with the encounter; save it if a
              // reopened encounter's difficulty matters.
              onField:
                clampInteger(
                  existingPreference
                    ?.onField,
                  1,
                  6,
                  1
                )
            };
          }
        );

      this._encounterState.selectedTrainerId =
        this._encounterState
          .trainers[0]
          ?.id ??
        "";


      this._encounterState.rows =
        (
          encounter.trainers ??
          []
        ).flatMap(
          trainer => {
            const pokemon =
              trainer.pokemon ??
              [];


            const archetype =
              getTrainerArchetype(
                trainer.archetypeId
              );


            const aceIndex =
              archetype.ace &&
              pokemon.length
                ? pokemon.length - 1
                : -1;


            return pokemon.map(
              (
                entry,
                index
              ) => {
                this.rowSequence +=
                  1;


                return {
                  id:
                    `row-${this.rowSequence}`,

                  pokemonId:
                    entry.pokemonId,

                  trainerId:
                    trainer.id,

                  level:
                    entry.level,

                  quantity:
                    entry.quantity,

                  defeated:
                    entry.defeated,

                  captured:
                    0,

                  moveIds:
                    Array.isArray(
                      entry.moveIds
                    )
                      ? [
                          ...entry.moveIds
                        ]
                      : [],

                  abilityId:
                    normalizeOptionalCanonicalId(
                      entry.abilityId
                    ),

                  itemId:
                    normalizeOptionalCanonicalId(
                      entry.itemId
                    ),

                  itemResolved:
                    entry.itemResolved ===
                      true ||
                    Boolean(
                      entry.itemId
                    ),

                  locked:
                    false,

                  ace:
                    index ===
                      aceIndex
                };
              }
            );
          }
        );


      return;
    }


    this._encounterState.trainers =
      [];

    this._encounterState.selectedTrainerId =
      "";


    this._encounterState.rows =
      encounter.pokemon.map(
        entry => {
          this.rowSequence +=
            1;


          return {
            id:
              `row-${this.rowSequence}`,

            pokemonId:
              entry.pokemonId,

            trainerId:
              null,

            level:
              entry.level,

            quantity:
              entry.quantity,

            defeated:
              entry.defeated,

            captured:
              entry.captured,

            moveIds:
              Array.isArray(
                entry.moveIds
              )
                ? [
                    ...entry.moveIds
                  ]
                : [],

            abilityId:
              normalizeOptionalCanonicalId(
                entry.abilityId
              ),

            itemId:
              normalizeOptionalCanonicalId(
                entry.itemId
              ),

            itemResolved:
              entry.itemResolved ===
                true ||
              Boolean(
                entry.itemId
              ),

            locked:
              false
          };
        }
      );
  }

  #getRowFromElement(
    element
  ) {
    const rowId =
      String(
        element.dataset
          .rowId ??
        ""
      );


    return (
      this._encounterState.rows.find(
        row =>
          row.id ===
          rowId
      ) ??
      null
    );
  }

  #prepareRow(
    row
  ) {

    return prepareEncounterRow({
      row,
      database:
        this.database,
      language:
        getWorldLanguage(),
      encounterType:
        this._encounterState.type,
      xpContext:
        this.#xpContext()
    });
  }

  #refreshSearchResultsUi(
  root
) {

  const container =
    root.querySelector(
      '[data-role="pokemon-search-results"]'
    );


  if (!container) {

    return;
  }


  const language =
    getWorldLanguage();


  const search =
    this._encounterState.search;


  const searchResults =
    filterPokemon(
      this.database.pokemon,
      search,
      language
    ).slice(
      0,
      SEARCH_LIMIT
    );


  container.hidden =
    !String(
      search ??
      ""
    ).trim();


  container.innerHTML =
    renderSearchResultsMarkup({
      search,
      searchResults,
      language
    });
}

  #refreshEncounterRowUi(
    root,
    row,
    refreshTotals = true
  ) {

    const prepared =
      this.#prepareRow(
        row
      );


    if (!prepared) {

      return;
    }


    row.level =
      prepared.level;

    row.quantity =
      prepared.quantity;

    row.defeated =
      prepared.defeated;

    row.captured =
      prepared.captured;


    const rowElement =
      [
        ...root.querySelectorAll(
          "[data-encounter-row-id]"
        )
      ].find(
        element =>
          element.dataset
            .encounterRowId ===
          row.id
      );


    if (!rowElement) {

      return;
    }


    const levelInput =
      rowElement.querySelector(
        '[data-role="encounter-level"]'
      );


    const quantityInput =
      rowElement.querySelector(
        '[data-role="encounter-quantity"]'
      );


    const defeatedInput =
      rowElement.querySelector(
        '[data-role="encounter-defeated"]'
      );


    const capturedInput =
      rowElement.querySelector(
        '[data-role="encounter-captured"]'
      );


    if (levelInput) {

      levelInput.value =
        String(
          prepared.level
        );
    }


    if (quantityInput) {

      quantityInput.value =
        String(
          prepared.quantity
        );
    }


    if (defeatedInput) {

      defeatedInput.value =
        String(
          prepared.defeated
        );


      defeatedInput.max =
        String(
          prepared.quantity
        );
    }


    if (capturedInput) {

      capturedInput.value =
        String(
          prepared.captured
        );


      capturedInput.max =
        String(
          Math.max(
            0,
            prepared.quantity -
              prepared.defeated
          )
        );


      capturedInput.disabled =
        this._encounterState.type ===
        "trainer";
    }


    const defeatedXp =
      rowElement.querySelector(
        '[data-role="row-xp-defeated"]'
      );


    if (defeatedXp) {

      defeatedXp.textContent =
        formatNumber(
          prepared.xp.defeated
        );
    }


    const capturedXp =
      rowElement.querySelector(
        '[data-role="row-xp-captured"]'
      );


    if (capturedXp) {

      capturedXp.textContent =
        formatNumber(
          this._encounterState.type ===
            "trainer"
            ? 0
            : prepared.xp.captured
        );
    }


    const earnedXp =
      rowElement.querySelector(
        '[data-role="row-earned-xp"]'
      );


    if (earnedXp) {

      earnedXp.textContent =
        formatNumber(
          prepared.earnedXp
        );
    }


    if (refreshTotals) {

      this.#refreshTotalsUi(
        root
      );
    }
  }


  #refreshAllEncounterRowsUi(
    root
  ) {

    for (
      const row
      of this._encounterState.rows
    ) {

      this.#refreshEncounterRowUi(
        root,
        row,
        false
      );
    }


    this.#refreshTotalsUi(
      root
    );
  }


  // The party random encounters are measured against: detected when first needed, then editable.


  // The species a rival can bring up to a level: their region's, within poke5e's SR cap for a trainer of that level.
  #trainerPool(
    maxLevel = rankLevels(
      this.#party().level,
      getTrainerRank(
        this._encounterState
          .trainerRandomRank
      )
    ).max
  ) {
    return {
      region:
        this._encounterState
          .trainerRandomRegion,

      maxLevel,

      minSr:
        null,

      maxSr:
        getTrainerLevelRule(
          maxLevel
        ).maxSr
    };
  }

  // The trainer rivals' extras: +1/+2 to their scores, a super effective Move, an item or berry each.
  #boosts() {
    return {
      statBonus:
        Number(
          this._encounterState
            .boostStats
        ) || 0,

      coverage:
        this._encounterState
          .boostCoverage ===
          true,

      items:
        this._encounterState
          .boostItems ===
          true
    };
  }

  #pokemonTypes(
    pokemonId
  ) {
    this._typesById ??=
      new Map(
        this.database
          .pokemon
          .map(
            pokemon => [
              String(
                pokemon.id
              ),
              pokemon.types ??
                []
            ]
          )
      );

    return this._typesById.get(
      String(
        pokemonId
      )
    ) ?? [];
  }

  #party() {
    if (!this._encounterState.partySize) {
      const party =
        detectPartyOrDefault();

      this._encounterState.partySize =
        party.size;

      this._encounterState.partyLevel =
        party.level;

      this._encounterState.partyTeam =
        party.team;

      this._encounterState.partyWeakTo =
        party.weakTo;

      this._encounterState.partyPokemon =
        party.pokemon;

      this._encounterState.partyStrongest =
        party.strongest;
    }

    return {
      size:
        this._encounterState
          .partySize,

      level:
        this._encounterState
          .partyLevel,

      team:
        this._encounterState
          .partyTeam,

      pokemon:
        this._encounterState
          .partyPokemon ??
        [],

      strongest:
        this._encounterState
          .partyStrongest ??
        null,

      // One per player unless changed: those that take part and stay standing share the XP.
      participants:
        this._encounterState
          .partyParticipants ??
        this._encounterState
          .partySize
    };
  }

  // The rows' difficulty against the party: trainer rivals with their types, Pokémon on the field and extras.
  #difficulty(
    rows,
    encounter = null
  ) {
    const party =
      this.#party();

    const trainerBattle =
      encounter
        ? encounter.trainerBattle
        : this._encounterState.type ===
          "trainer";

    return encounterDifficulty(
        party,
        trainerBattle
          ? rows.map(
              row => ({
                ...row,
                types:
                  this.#pokemonTypes(
                    row.pokemonId
                  )
              })
            )
          : rows,
        {
          boosts:
            encounter
              ? {}
              : this.#boosts(),

          onField:
            encounter?.onField ??
            (
              trainerBattle
              ? this._encounterState
                  .trainers
                  .reduce(
                    (
                      total,
                      trainer
                    ) =>
                      total +
                      Math.min(
                        trainer.onField ??
                          1,
                        countTrainerRowQuantity(
                          rows.filter(
                            row =>
                              row.trainerId ===
                                trainer.id
                          )
                        )
                      ),
                    0
                  )
              : 0
            )
        }
      );
  }

  /*
   * What each Pokémon's XP needs from the whole encounter (null for poke5e's rule as written): with the pace, the
   * encounter's strength against the party and how many Pokémon share it; with level scaling, the party's level.
   */
  #xpContext(
    rows = null,
    encounter = null
  ) {
    const rules =
      getEncounterXpRules();

    if (
      rules.style !==
        "pace" &&
      !rules.scaling
    ) {
      return null;
    }

    const party =
      this.#party();

    const {
      power,
      partyPower,
      weight
    } =
      this.#difficulty(
        rows ??
        this._encounterState
          .rows
          .map(
            row => ({
              ...row,
              level:
                clampInteger(
                  row.level,
                  1,
                  20,
                  1
                ),
              quantity:
                clampInteger(
                  row.quantity,
                  1,
                  999,
                  1
                )
            })
          ),
        encounter
      );

    return {
      ...rules,
      partyLevel:
        party.level,
      participants:
        party.participants,
      // A Medium encounter is the party's own strength: one Pokémon per player, or their teams against trainers.
      partyPower,
      // Crowd, trainer bonus, types and extras: each Pokémon's XP is its share of the encounter's strength.
      multiplier:
        weight
          ? power / weight
          : 1
    };
  }

  /*
   * The selected location's saved encounters, as a route: how many are mandatory and optional, and what each kind
   * gives the players' strongest Pokémon (if it fights all of them, with the party's participants).
   * shortcut: a saved trainer encounter counts one Pokémon on the field per trainer and no extras (neither is
   * saved); save them if the route's numbers must match the planner's exactly.
   */
  #routeSummary(
    encounters
  ) {
    const party =
      this.#party();

    if (
      !encounters.length ||
      !party.strongest
    ) {
      return "";
    }

    const query =
      new EncounterQueryService();

    const totals = {
      mandatory: {
        count: 0,
        xp: 0
      },
      optional: {
        count: 0,
        xp: 0
      }
    };

    for (const summary of encounters) {
      const encounter =
        query.get(
          summary.key
        );

      if (!encounter) {
        continue;
      }

      const trainerBattle =
        encounter.type ===
          "trainer";

      const rows =
        (
          trainerBattle
            ? encounter.trainers.flatMap(
                trainer =>
                  trainer.pokemon.map(
                    entry => ({
                      ...entry,
                      trainerId:
                        trainer.id
                    })
                  )
              )
            : encounter.pokemon
        )
          .map(
            row =>
              prepareEncounterRow({
                row,
                database:
                  this.database,
                language:
                  getWorldLanguage(),
                encounterType:
                  encounter.type
              })
          )
          .filter(Boolean);

      const kind =
        encounter.optional
          ? totals.optional
          : totals.mandatory;

      kind.count += 1;

      kind.xp +=
        encounterShare(
          this.#xpRows(
            rows
          ),
          party.strongest.level,
          party.participants,
          {
            context:
              this.#xpContext(
                rows,
                {
                  trainerBattle,
                  onField:
                    trainerBattle
                      ? encounter.trainers.length
                      : 0
                }
              ),
            optional:
              encounter.optional
          }
        );
    }

    const percent = xp =>
      `${Math.round(levelProgress(party.strongest.xp, xp).share * 100)} %`;

    const end =
      levelProgress(
        party.strongest.xp,
        totals.mandatory.xp +
          totals.optional.xp
      ).after;

    return `
      <p
        class="poke5e-encounter-planner__route-summary"
        title="Lo que gana ${escapeAttribute(party.strongest.name)} (Nv. ${party.strongest.level}) si combate en todos, con ${party.participants} Pokémon que participan."
      >
        <i class="fa-solid fa-route" aria-hidden="true"></i>
        ${totals.mandatory.count} obligatorio(s): +${percent(totals.mandatory.xp)} ·
        ${totals.optional.count} opcional(es): +${percent(totals.optional.xp)} ·
        con todos, Nv. ${end.level} (${Math.round(end.progress * 100)} %)
      </p>`;
  }

  async #toggleOptional() {
    const optional =
      !this._encounterState.optional;

    this._encounterState.optional =
      optional;

    const key =
      this._encounterState
        .encounterKey;

    if (key) {
      const updates =
        game.actors
          .filter(
            actor =>
              actor.getFlag(
                MODULE_ID,
                "encounter"
              )?.key ===
                key
          )
          .map(
            actor => ({
              _id:
                actor.id,
              [`flags.${MODULE_ID}.encounter.optional`]:
                optional
            })
          );

      if (updates.length) {
        await Actor.updateDocuments(
          updates
        );
      }
    }

    await this.render();
  }

  #xpRows(
    rows
  ) {
    return rows.map(
      row => ({
        level:
          row.level,
        sr:
          row.pokemon.sr,
        quantity:
          row.quantity
      })
    );
  }

  // An optional encounter's suggested loot: an item or berry, and a TM one of the rivals' species can learn.
  #suggestLoot(
    rows
  ) {
    const language =
      getWorldLanguage();

    const item =
      selectEncounterItem({
        items:
          this.database.items,
        chancePercent:
          100,
        categoryWeights: {
          berry:
            1,
          "held-item":
            1,
          medicine:
            1,
          pokeball:
            0
        }
      });

    const tms =
      rows.flatMap(
        row =>
          row.pokemon
            .learnset
            ?.tms ??
          []
      );

    const tm =
      tms[
        Math.floor(
          Math.random() *
          tms.length
        )
      ];

    return [
      item &&
        localized(
          item.name,
          language,
          item.id
        ),
      tm &&
        `MT ${tm.id}: ${resolveMoveNames([tm.moveId], this.database.moves, language)[0] ?? tm.moveId}`
    ].filter(Boolean);
  }

  async #awardXp() {
    const rows =
      this._encounterState.rows
        .map(
          row =>
            this.#prepareRow(
              row
            )
        )
        .filter(Boolean);

    if (!rows.length) {
      return;
    }

    const optional =
      this._encounterState
        .optional ===
        true;

    await awardEncounterXp({
      rows:
        this.#xpRows(
          rows
        ),
      context:
        this.#xpContext(),
      optional,
      name:
        this._encounterState.name.trim() ||
        "Encuentro",
      trainers:
        this._encounterState.type ===
          "trainer"
          ? this._encounterState
              .trainers
              .length
          : 0,
      loot:
        optional
          ? this.#suggestLoot(
              rows
            )
          : []
    });
  }

  /*
   * What the encounter is worth to the players' strongest Pokémon, if they defeat every rival: its total XP divided
   * among the Pokémon that take part (and stay standing), as a share of a level, and how many like it make a level.
   */
  #describeProgress(
    rows
  ) {
    const party =
      this.#party();

    if (!rows.length) {
      return {
        label:
          "—",
        title:
          "Añade Pokémon para ver cuánto avanza el Pokémon más fuerte de los jugadores."
      };
    }

    if (!party.strongest) {
      return {
        label:
          "—",
        title:
          "Detecta el grupo para conocer al Pokémon más fuerte de los jugadores."
      };
    }

    const context =
      this.#xpContext();

    const total =
      rows.reduce(
        (
          sum,
          row
        ) =>
          sum +
          calculatePokemonEncounterXp({
            level:
              row.level,
            sr:
              row.pokemon.sr,
            context
          }).defeated *
          row.quantity,
        0
      );

    // Its own share: in an optional encounter (catch-up XP), less than an even split.
    const gained =
      encounterShare(
        this.#xpRows(
          rows
        ),
        party.strongest.level,
        party.participants,
        {
          context,
          optional:
            this._encounterState
              .optional ===
              true
        }
      );

    const {
      before,
      after,
      share,
      toLevel
    } =
      levelProgress(
        party.strongest.xp,
        gained
      );

    const percent = value =>
      `${Math.round(value * 100)} %`;

    return {
      label:
        `+${percent(share)}`,
      title:
        `${party.strongest.name} (Nv. ${before.level}, ${percent(before.progress)}): ` +
        `${formatNumber(total)} XP si se derrota a todos ÷ ${party.participants} Pokémon que participan = ` +
        `${formatNumber(gained)} XP` +
        (
          this._encounterState.optional
            ? " (opcional: XP de recuperación según su nivel)"
            : ""
        ) +
        ` → Nv. ${after.level}, ${percent(after.progress)}.` +
        (
          toLevel
            ? ` Con ${toLevel} encuentro(s) así sube de nivel.`
            : ""
        )
    };
  }

  // The encounter's difficulty against the party, and how it was reached (as the tooltip).
  #describeDifficulty(
    rows
  ) {
    if (!rows.length) {
      return {
        tier:
          "",

        label:
          "—",

        title:
          "Añade Pokémon para ver la dificultad."
      };
    }

    const party =
      this.#party();

    const trainerBattle =
      this._encounterState.type ===
        "trainer";

    const {
      tier,
      power,
      partyPower,
      matchup
    } =
      this.#difficulty(
        rows
      );

    const group =
      trainerBattle
        ? `${party.size} jugador(es), nivel ${party.level}, ${party.team} Pokémon cada uno` +
          (
            party.pokemon.length
              ? `; tipos ×${matchup.toFixed(2)}`
              : "; detecta el grupo para contar los tipos"
          )
        : `${party.size} jugador(es), nivel ${party.level}`;

    return {
      tier:
        tier.id,

      label:
        tier.label,

      title:
        `Fuerza ${formatNumber(power)} contra ${formatNumber(partyPower)} del grupo (${group}). ` +
        (
          trainerBattle
            ? "Un combate parejo, con tantos Pokémon en campo como los jugadores, es Difícil."
            : "Una pelea pareja es Media."
        )
    };
  }

  #refreshTotalsUi(
    root
  ) {

    const rows =
      this._encounterState.rows
        .map(
          row =>
            this.#prepareRow(
              row
            )
        )
        .filter(Boolean);


    const totals =
      calculateEncounterTotals(
        rows,
        this._encounterState.type
      );


    const values = {
      tokens:
        totals.tokens,

      defeated:
        totals.defeated,

      captured:
        totals.captured,

      earned:
        totals.earned
    };


    for (
      const [
        key,
        value
      ]
      of Object.entries(
        values
      )
    ) {

      const element =
        root.querySelector(
          `[data-total="${key}"]`
        );


      if (element) {

        element.textContent =
          formatNumber(
            value
          );
      }
    }

    const difficulty =
      this.#describeDifficulty(
        rows
      );

    const progress =
      this.#describeProgress(
        rows
      );

    const progressStatus =
      root.querySelector(
        '[data-role="progress-status"]'
      );

    if (progressStatus) {
      progressStatus.title =
        progress.title;

      progressStatus.querySelector(
        '[data-total="progress"]'
      ).textContent =
        progress.label;
    }

    const difficultyStatus =
      root.querySelector(
        '[data-role="difficulty-status"]'
      );

    if (difficultyStatus) {
      difficultyStatus.title =
        difficulty.title;

      difficultyStatus.dataset.tier =
        difficulty.tier;

      difficultyStatus.querySelector(
        '[data-total="difficulty"]'
      ).textContent =
        difficulty.label;
    }

    const compositionSummary =
      root.querySelector(
        '[data-role="composition-summary"]'
      );


    if (compositionSummary) {

      compositionSummary.textContent =
        buildCompositionSummary({
          encounterType:
            this._encounterState.type,

          rowCount:
            rows.length,

          trainerCount:
            this._encounterState
              .trainers
              .length,

          tokens:
            totals.tokens
        });
    }
  }

  #refreshTrainerNameInRowsUi(
    root,
    trainerId,
    trainerName
  ) {
    const normalizedTrainerId =
      String(
        trainerId ??
        ""
      );


    const displayName =
      String(
        trainerName ??
        ""
      ).trim() ||
      "Entrenador sin nombre";


    root.querySelectorAll(
      "[data-encounter-row-id]"
    ).forEach(
      rowElement => {

        if (
          String(
            rowElement.dataset
              .trainerId ??
            ""
          ) !==
          normalizedTrainerId
        ) {
          return;
        }


        const nameElement =
          rowElement.querySelector(
            '[data-role="row-trainer-name"]'
          );


        if (nameElement) {
          nameElement.textContent =
            displayName;
        }
      }
    );

    root.querySelectorAll(
      '[data-role="composition-trainer-name"]'
    ).forEach(
      nameElement => {

        if (
          String(
            nameElement.dataset
              .trainerId ??
            ""
          ) !==
          normalizedTrainerId
        ) {

          return;
        }


        nameElement.textContent =
          displayName;
      }
    );
  }

  #refreshIdentityUi(
    root
  ) {

    const name =
      this._encounterState.name
        .trim() ||
      "Nuevo encuentro";


    const location =
      this._encounterState.location
        .trim() ||
      "Sin ubicación";


    const nameElement =
      root.querySelector(
        '[data-role="header-name"]'
      );


    if (nameElement) {

      nameElement.textContent =
        name;
    }


    const locationElement =
      root.querySelector(
        '[data-role="header-location"]'
      );


    if (locationElement) {

      locationElement.textContent =
        location;
    }


    const editingElement =
      root.querySelector(
        '[data-role="editing-label"]'
      );


    if (editingElement) {

      editingElement.textContent =
        this._encounterState
          .encounterKey

          ? (
              `Editando: ` +
              `${this._encounterState.location} — ` +
              `${this._encounterState.name}`
            )

          : "Nuevo encuentro";
    }
  }


  #refreshEncounterTypeUi(
    root
  ) {

    const trainerEncounter =
      this._encounterState.type ===
      "trainer";

    const trainerTabButton =
      root.querySelector(
        '[data-action="switch-studio-tab"][data-tab="trainers"]'
      );


    if (trainerTabButton) {

      trainerTabButton.hidden =
        !trainerEncounter;
    }


    if (
      !trainerEncounter &&
      this._encounterState.activeTab ===
        "trainers"
    ) {

      this.#activateStudioTab(
        root,
        "composition"
      );
    }

    const trainerSection =
      root.querySelector(
        '[data-role="trainer-section"]'
      );


    if (trainerSection) {

      trainerSection.hidden =
        !trainerEncounter;
    }

    const randomSection =
      root.querySelector(
        '[data-role="random-section"]'
      );


    if (randomSection) {
      randomSection.hidden =
        trainerEncounter;
    }

    const trainerRandomSection =
      root.querySelector(
        '[data-role="trainer-random-section"]'
      );


    if (trainerRandomSection) {
      trainerRandomSection.hidden =
        !trainerEncounter;
    }

    const content =
      root.querySelector(
        ".poke5e-encounter-planner__content"
      );


    if (content) {

      content.dataset
        .encounterType =
        this._encounterState.type;
    }

    this.#refreshEncounterItemPolicyUi(
      root
    );

    const badge =
      root.querySelector(
        '[data-role="encounter-type-badge"]'
      );


    if (!badge) {

      return;
    }


    badge.dataset.encounterType =
      this._encounterState.type;


    const icon =
      badge.querySelector(
        "i"
      );


    if (icon) {

      icon.className =
        trainerEncounter
          ? "fa-solid fa-user"
          : "fa-solid fa-leaf";
    }


    const label =
      badge.querySelector(
        "span"
      );


    if (label) {

      label.textContent =
        trainerEncounter
          ? "Entrenador"
          : "Salvaje";
    }
  }

  #refreshEncounterItemPolicyUi(
    root
  ) {

    const policy =
      getPlannerItemPolicy(
        this._encounterState
      );


    const enabledInput =
      root.querySelector(
        '[data-role="allow-encounter-items"]'
      );


    if (enabledInput) {

      enabledInput.checked =
        policy.enabled;
    }


    const chanceInput =
      root.querySelector(
        '[data-role="encounter-item-chance"]'
      );


    if (chanceInput) {

      chanceInput.value =
        String(
          policy.chancePercent
        );


      chanceInput.disabled =
        !policy.enabled;
    }


    const weightInputs = {

      berry:
        root.querySelector(
          '[data-role="encounter-item-weight-berry"]'
        ),

      medicine:
        root.querySelector(
          '[data-role="encounter-item-weight-medicine"]'
        ),

      pokeball:
        root.querySelector(
          '[data-role="encounter-item-weight-pokeball"]'
        ),

      "held-item":
        root.querySelector(
          '[data-role="encounter-item-weight-held-item"]'
        )
    };


    for (
      const [
        category,
        input
      ]
      of Object.entries(
        weightInputs
      )
    ) {

      if (!input) {

        continue;
      }


      input.value =
        String(
          policy.categoryWeights[
            category
          ]
        );


      input.disabled =
        !policy.enabled;
    }
  }

  #updateEncounterRowFromInput(
    root,
    input
  ) {

    const row =
      this.#getRowFromElement(
        input
      );


    if (!row) {

      return;
    }


    const role =
      input.dataset.role;


    const handlers = {

      "encounter-level":
        () => {

          const pokemon =
            findPokemon(
              this.database.pokemon,
              row.pokemonId
            );


          if (!pokemon) {

            return;
          }


          row.level =
            clampPokemonLevel(
              pokemon,
              input.value
            );
        },


      "encounter-quantity":
        () => {

          row.quantity =
            clampInteger(
              input.value,
              1,
              999,
              1
            );


          row.defeated =
            clampInteger(
              row.defeated,
              0,
              row.quantity,
              0
            );


          row.captured =
            this._encounterState.type ===
              "trainer"

              ? 0

              : clampInteger(
                  row.captured,
                  0,
                  row.quantity -
                    row.defeated,
                  0
                );
        },


      "encounter-defeated":
        () => {

          const quantity =
            clampInteger(
              row.quantity,
              1,
              999,
              1
            );


          row.defeated =
            clampInteger(
              input.value,
              0,
              quantity,
              0
            );


          row.captured =
            this._encounterState.type ===
              "trainer"

              ? 0

              : clampInteger(
                  row.captured,
                  0,
                  quantity -
                    row.defeated,
                  0
                );
        },


      "encounter-captured":
        () => {

          const quantity =
            clampInteger(
              row.quantity,
              1,
              999,
              1
            );


          const defeated =
            clampInteger(
              row.defeated,
              0,
              quantity,
              0
            );


          row.captured =
            this._encounterState.type ===
              "trainer"

              ? 0

              : clampInteger(
                  input.value,
                  0,
                  quantity -
                    defeated,
                  0
                );
        }
    };


    const handler =
      handlers[
        role
      ];


    if (!handler) {

      return;
    }


    handler();


    this.#refreshEncounterRowUi(
      root,
      row
    );
  }

  async #deleteEncounter() {
    if (
      this._encounterState.busy
    ) {
      return;
    }


    const encounterKey =
      this._encounterState
        .selectedEncounterKey;


    if (!encounterKey) {
      ui.notifications.warn(
        "Selecciona un encuentro guardado para eliminarlo."
      );

      return;
    }


    const queryService =
      new EncounterQueryService();


    const encounter =
      queryService.get(
        encounterKey
      );


    const encounterName =
      encounter?.name ??
      "este encuentro";


    const confirmed =
      await foundry.applications.api
        .DialogV2.confirm({
          window: {
            title:
              "Eliminar encuentro"
          },

          content:
            `<p>¿Eliminar <strong>${escapeHtml(encounterName)}</strong>?</p>` +
            "<p>Los Pokémon que no estén desplegados se eliminarán. " +
            "Los que todavía estén en alguna Scene se conservarán temporalmente hasta que dejen de estar en uso.</p>",

          yes: {
            label:
              "Eliminar",

            icon:
              "fa-solid fa-trash"
          },

          no: {
            label:
              "Cancelar",

            icon:
              "fa-solid fa-xmark"
          },

          rejectClose:
            false,

          modal:
            true
        });


    if (!confirmed) {
      return;
    }


    this._encounterState.busy =
      true;


    try {
      const service =
        new EncounterDeletionService();


      const result =
        await service.deleteEncounter(
          encounterKey
        );


      this.#resetEncounterState();


      const details = [
        `${result.deleted} Actor(s) eliminado(s)`
      ];


      if (
        result.retained
      ) {
        details.push(
          `${result.retained} conservado(s) por estar desplegado(s)`
        );
      }


      ui.notifications.info(
        `Encuentro "${encounterName}" eliminado: ` +
        `${details.join(" · ")}.`
      );

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error eliminando encuentro Pokémon`,
        error
      );


      ui.notifications.error(
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el encuentro Pokémon."
      );

    } finally {
      this._encounterState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }

  #refreshRandomizerUi(
    root
  ) {
    const biomeSelect =
      root.querySelector(
        '[data-role="random-biome"]'
      );


    const biomes =
      getWildRandomBiomeOptions(
        this.randomCatalog,
        this._encounterState
          .randomRegion
      );


    if (biomeSelect) {
      biomeSelect.innerHTML =
        renderRandomSelectOptions(
          biomes,
          this._encounterState
            .randomBiome
        );


      biomeSelect.value =
        this._encounterState
          .randomBiome;
    }


    this.#refreshRandomCandidateCountUi(
      root
    );
  }


  #refreshRandomizerLevelInputsUi(
    root
  ) {
    const minInput =
      root.querySelector(
        '[data-role="random-min-level"]'
      );


    const maxInput =
      root.querySelector(
        '[data-role="random-max-level"]'
      );


    if (minInput) {
      minInput.value =
        String(
          this._encounterState
            .randomMinLevel
        );
    }


    if (maxInput) {
      maxInput.value =
        String(
          this._encounterState
            .randomMaxLevel
        );
    }
  }

  #refreshRandomizerSrInputsUi(
    root
  ) {
    const minSelect =
      root.querySelector(
        '[data-role="random-min-sr"]'
      );


    const maxSelect =
      root.querySelector(
        '[data-role="random-max-sr"]'
      );


    if (minSelect) {
      minSelect.value =
        this._encounterState
          .randomMinSr;
    }


    if (maxSelect) {
      maxSelect.value =
        this._encounterState
          .randomMaxSr;
    }
  }

  #refreshRandomCandidateCountUi(
    root
  ) {
    const count =
      countRandomCandidates({
        catalog:
          this.randomCatalog,

        region:
          this._encounterState
            .randomRegion,

        biome:
          this._encounterState
            .randomBiome,

        maxLevel:
          this._encounterState
            .randomMaxLevel,

        minSr:
          this._encounterState
            .randomMinSr,

        maxSr:
          this._encounterState
            .randomMaxSr,

        excludedPokemonIds:
          getLockedPokemonIds(
            this._encounterState
              .rows
          )
      });


    const countElement =
      root.querySelector(
        '[data-role="random-candidate-count"]'
      );


    if (countElement) {
      countElement.textContent =
        `${count} especies compatibles`;
    }


    const button =
      root.querySelector(
        '[data-action="randomize-encounter"]'
      );


    if (button) {
      button.disabled =
        !canGenerateRandomEncounter(
          count,
          this._encounterState
            .randomSize,

          countLockedSpecies(
            this._encounterState
              .rows
          )
        );
    }
  }

  #toggleRandomLock(
    rowId
  ) {
    const row =
      this._encounterState.rows
        .find(
          entry =>
            entry.id ===
              rowId
        );


    if (!row) {
      return;
    }


    row.locked =
      row.locked !==
        true;


    void this.render({
      force:
        true
    });
  }

  #setTrainerMixedArchetypes(
    root,
    archetypeIds
  ) {
    const knownIds =
      new Set(
        listTrainerArchetypes()
          .map(
            archetype =>
              archetype.id
          )
      );


    const selectedIds =
      [
        ...new Set(
          (
            archetypeIds ??
            []
          )
            .map(
              archetypeId =>
                String(
                  archetypeId ??
                  ""
                )
            )
            .filter(
              archetypeId =>
                knownIds.has(
                  archetypeId
                )
            )
        )
      ];


    const selected =
      new Set(
        selectedIds
      );


    this._encounterState.trainerRandomMixedArchetypes =
      selectedIds;


    root.querySelectorAll(
      '[data-role="trainer-mixed-archetype"]'
    ).forEach(
      input => {
        input.checked =
          selected.has(
            String(
              input.value ??
              ""
            )
          );
      }
    );


    this.#refreshTrainerArchetypeUi(
      root
    );


    this.#refreshTrainerRandomCandidateCountUi(
      root
    );
  }

  #refreshTrainerArchetypeUi(
    root
  ) {
    const archetypeId =
      this._encounterState
        .trainerRandomArchetype;


    const isMixed =
      archetypeId ===
        MIXED_TRAINER_ARCHETYPE_ID;


    const mixedContainer =
      root.querySelector(
        '[data-role="trainer-mixed-archetypes"]'
      );


    if (mixedContainer) {
      mixedContainer.hidden =
        !isMixed;
    }


    const descriptionElement =
      root.querySelector(
        '[data-role="trainer-archetype-description-text"]'
      );


    const metaElement =
      root.querySelector(
        '[data-role="trainer-archetype-description-meta"]'
      );


    if (
      isMixed
    ) {
      const selectedArchetypes =
        resolveTrainerRandomArchetypes(
          archetypeId,
          this._encounterState
            .trainerRandomMixedArchetypes
        );


      if (descriptionElement) {
        descriptionElement.textContent =
          selectedArchetypes.length
            ? "Cada Entrenador recibe uno de los arquetipos permitidos."
            : "Selecciona al menos un arquetipo permitido.";
      }


      if (metaElement) {
        metaElement.textContent =
          selectedArchetypes.length
            ? `${selectedArchetypes.length} arquetipo(s) permitido(s).`
            : "";
      }


      return;
    }


    const archetype =
      getTrainerArchetype(
        archetypeId
      );


    if (descriptionElement) {
      descriptionElement.textContent =
        getTrainerArchetypeDescription(
          archetype,
          getWorldLanguage()
        );
    }


    if (metaElement) {
      metaElement.textContent =
        "";
    }
  }


  #refreshTrainerRandomCandidateCountUi(
    root
  ) {
    const count =
      countTrainerRandomCandidates({
        catalog:
          this.randomCatalog,

        ...this.#trainerPool()
      });


    const countElement =
      root.querySelector(
        '[data-role="trainer-random-candidate-count"]'
      );


    if (countElement) {
      countElement.textContent =
        `${count} especies compatibles`;
    }


    const button =
      root.querySelector(
        '[data-action="randomize-trainers"]'
      );


    if (button) {
      button.disabled =
        !canGenerateRandomTrainerEncounter(
          count,
          this._encounterState
            .trainerRandomPokemonCount,

          this._encounterState
            .trainerRandomArchetype,

          this._encounterState
            .trainerRandomMixedArchetypes
        );
    }

    this.#refreshTrainerCardRerollButtonsUi(
      root,
      count
    );
  }

  #refreshTrainerCardRerollButtonsUi(
    root,
    candidateCount = null
  ) {
    const count =
      candidateCount ??
      countTrainerRandomCandidates({
        catalog:
          this.randomCatalog,

        ...this.#trainerPool()
      });


    root.querySelectorAll(
      '[data-action="reroll-trainer-team"]'
    ).forEach(
      button => {
        const trainer =
          this.#getTrainer(
            button.dataset
              .trainerId
          );


        if (!trainer) {
          button.disabled =
            true;

          return;
        }


        const rows =
          this._encounterState
            .rows
            .filter(
              row =>
                row.trainerId ===
                  trainer.id
            );


        const pokemonCount =
          countTrainerRowQuantity(
            rows
          );


        const lockedCount =
          countTrainerRowQuantity(
            rows.filter(
              row =>
                row.locked ===
                  true
            )
          );


        const rerollState =
          getTrainerRerollUiState({
            candidateCount:
              count,

            pokemonCount,
            lockedCount,

            teamSize:
              normalizeTrainerTeamSize(
                trainer.teamSize
              ),

            archetype:
              getTrainerArchetype(
                trainer.archetypeId
              )
          });


        button.disabled =
          !rerollState.canReroll;


        button.title =
          rerollState.title;


        const label =
          button.querySelector(
            '[data-role="trainer-reroll-label"]'
          );


        if (label) {
          label.textContent =
            rerollState.label;
        }
      }
    );
  }

  #rerollTrainerTeam(
    trainerId
  ) {
    if (
      this._encounterState.type !==
        "trainer"
    ) {
      return;
    }


    const trainer =
      this.#getTrainer(
        trainerId
      );


    if (!trainer) {
      ui.notifications.warn(
        "El Entrenador seleccionado ya no existe."
      );

      return;
    }


    // A reroll keeps the team's strength: its levels, or the party's when it has none.
    const levels =
      this._encounterState
        .rows
        .filter(
          row =>
            row.trainerId ===
              trainer.id
        )
        .map(
          row =>
            clampInteger(
              row.level,
              1,
              20,
              1
            )
        );

    const maxLevel =
      levels.length
        ? Math.max(
            ...levels
          )
        : this.#party().level;

    const minLevel =
      levels.length
        ? Math.min(
            ...levels
          )
        : Math.max(
            1,
            maxLevel - 3
          );

    try {
      const candidates =
        this.randomCatalog
          .trainerCandidates(
            this.#trainerPool(
              maxLevel
            )
          );

      const currentRows =
        this._encounterState
          .rows
          .filter(
            row =>
              row.trainerId ===
                trainer.id
          );


      const lockedRows =
        currentRows.filter(
          row =>
            row.locked ===
              true
        );


      const result =
        rerollRandomTrainerTeam({
          candidates,

          lockedPokemon:
            lockedRows.map(
              row => ({
                pokemonId:
                  row.pokemonId,

                quantity:
                  row.quantity,

                ace:
                  row.ace ===
                    true
              })
            ),

          currentTeamSize:
            countTrainerRowQuantity(
              currentRows
            ),

          pokemonPerTrainer:
            normalizeTrainerTeamSize(
              trainer.teamSize
            ),

          minLevel,
          maxLevel,

          archetypeId:
            getTrainerArchetype(
              trainer.archetypeId
            ).id
        });


      const generatedRows =
        result.pokemon.map(
          pokemon => {
            this.rowSequence +=
              1;


            return {
              id:
                `row-${this.rowSequence}`,

              trainerId:
                trainer.id,

              ...pokemon,

              abilityId:
                null,

              itemId:
                null,

              itemResolved:
                false,
            };
          }
        );


      if (
        !generatedRows.length
      ) {
        ui.notifications.info(
          `El equipo de "${trainer.name}" no tiene cupos sin bloquear para regenerar.`
        );

        return;
      }


      const replacementRows =
        mergeTrainerRerollRows(
          currentRows,
          generatedRows
        );


      this.#replaceTrainerRows(
        trainer.id,
        replacementRows
      );


      const lockedCount =
        countTrainerRowQuantity(
          lockedRows
        );


      ui.notifications.info(
        `Equipo de "${trainer.name}": ` +
        `${generatedRows.length} Pokémon regenerado(s)` +
        (
          lockedCount
            ? ` · ${lockedCount} bloqueado(s).`
            : "."
        )
      );


      void this.render({
        force:
          true
      });

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error regenerando equipo de Entrenador`,
        error
      );


      ui.notifications.warn(
        error instanceof Error
          ? error.message
          : "No se pudo regenerar el equipo del Entrenador."
      );
    }
  }


  #replaceTrainerRows(
    trainerId,
    generatedRows
  ) {
    const nextRows =
      [];


    let inserted =
      false;


    for (
      const row
      of this._encounterState.rows
    ) {
      if (
        row.trainerId ===
          trainerId
      ) {
        if (!inserted) {
          nextRows.push(
            ...generatedRows
          );

          inserted =
            true;
        }


        continue;
      }


      nextRows.push(
        row
      );
    }


    if (!inserted) {
      nextRows.push(
        ...generatedRows
      );
    }


    this._encounterState.rows =
      nextRows;
  }

  #generateRandomTrainerEncounter() {
    if (
      this._encounterState.type !==
        "trainer"
    ) {
      ui.notifications.warn(
        "La generación aleatoria de Entrenadores solo está disponible en encuentros de Entrenador."
      );

      return;
    }


    const party =
      this.#party();

    const rank =
      getTrainerRank(
        this._encounterState
          .trainerRandomRank
      );

    const levels =
      rankLevels(
        party.level,
        rank
      );

    const boosts =
      this.#boosts();

    const pick = (
      [
        min,
        max
      ]
    ) =>
      min +
      Math.floor(
        Math.random() *
        (max - min + 1)
      );

    // "auto" takes the rank's range; otherwise the number chosen.
    const chosen = (
      value,
      range
    ) =>
      value === "auto"
        ? pick(
            range
          )
        : clampInteger(
            value,
            1,
            6,
            1
          );

    let failure =
      null;

    try {
      const candidates =
        this.randomCatalog
          .trainerCandidates(
            this.#trainerPool(
              levels.max
            )
          );

      // One roll: team, Pokémon on the field and (for Gym Leaders and the Elite Four) one type for every trainer.
      const roll = trainerCount => {
        const options = {
          trainerCount,
          pokemonPerTrainer:
            String(
              chosen(
                this._encounterState
                  .trainerRandomPokemonCount,
                rank.team
              )
            ),
          minLevel:
            levels.min,
          maxLevel:
            levels.max,
          archetypeId:
            this._encounterState
              .trainerRandomArchetype,
          archetypeIds:
            this._encounterState
              .trainerRandomArchetype ===
                MIXED_TRAINER_ARCHETYPE_ID
              ? this._encounterState
                  .trainerRandomMixedArchetypes
              : []
        };

        const typed =
          rank.monotype
            ? monotypePool(
                candidates,
                Number(
                  options.pokemonPerTrainer
                )
              )
            : candidates;

        let generated;

        try {
          generated =
            generateRandomTrainerEncounter({
              ...options,
              candidates:
                typed
            });
        } catch (
          error
        ) {
          failure =
            error;

          if (typed === candidates) {
            return [];
          }

          try {
            generated =
              generateRandomTrainerEncounter({
                ...options,
                candidates
              });
          } catch (
            fallbackError
          ) {
            failure =
              fallbackError;

            return [];
          }
        }

        const onField =
          chosen(
            this._encounterState
              .trainerRandomOnField,
            rank.onField
          );

        return generated.map(
          (
            trainer,
            trainerIndex
          ) => withAce(
            {
              ...trainer,
              onField:
                Math.min(
                  onField,
                  trainer.pokemon.length
                )
            },
            // The boss's ace only: the others are their gym helpers.
            trainerIndex === 0
              ? levels.ace
              : null,
            pick
          )
        );
      };

      const measure = generated =>
        encounterDifficulty(
          party,
          generated.flatMap(
            trainer =>
              trainer.pokemon.map(
                pokemon => ({
                  ...pokemon,
                  types:
                    this.#pokemonTypes(
                      pokemon.pokemonId
                    )
                })
              )
          ),
          {
            boosts,

            onField:
              Math.max(
                1,
                generated.reduce(
                  (
                    total,
                    trainer
                  ) =>
                    total +
                    trainer.onField,
                  0
                )
              )
          }
        );

      // Fewest trainers first: helpers join only when the rival alone can't reach the rank's difficulty.
      const trainerCounts =
        this._encounterState
          .trainerRandomCount ===
          "auto"
          ? Array.from(
              {
                length:
                  rank.trainers[1] -
                  rank.trainers[0] +
                  1
              },
              (
                _,
                index
              ) =>
                rank.trainers[0] +
                index
            )
          : [
              chosen(
                this._encounterState
                  .trainerRandomCount,
                rank.trainers
              )
            ];

      let best =
        null;

      for (const trainerCount of trainerCounts) {
        const attempt =
          generateForDifficulty(
            () =>
              roll(
                trainerCount
              ),
            measure,
            rank.target,
            100
          );

        if (
          !best ||
          attempt.distance <
            best.distance
        ) {
          best =
            attempt;
        }

        if (best.distance === 0) {
          break;
        }
      }

      const generatedTrainers =
        best.result;

      if (!generatedTrainers.length) {
        throw failure ??
          new Error(
            "No hay especies compatibles para estos Entrenadores."
          );
      }

      if (best.distance > 0) {
        const wanted =
          DIFFICULTIES.find(
            entry =>
              entry.id ===
                rank.target
          )?.label;

        ui.notifications.warn(
          `${rank.label} apunta a ${wanted} y con este grupo queda ${best.tier.label}. Prueba fijar más o menos Pokémon por Entrenador o en campo.`
        );
      }

      /*
      * Conservamos también los IDs actuales como
      * reservados para que un reroll completo no
      * pueda reutilizar accidentalmente la identidad
      * de un Trainer anterior del mismo encuentro.
      */
      const reservedIds =
        new Set(
          this._encounterState
            .trainers
            .map(
              trainer =>
                trainer.id
            )
        );


      const trainers =
        [];


      const rows =
        [];

      const archetypeCounters =
        new Map();

      generatedTrainers.forEach(
        generatedTrainer => {
          const trainerId =
            this.#allocateTrainerId(
              reservedIds
            );


          reservedIds.add(
            trainerId
          );


          const generatedArchetype =
            getTrainerArchetype(
              generatedTrainer.archetypeId
            );


          const archetypeCount =
            (
              archetypeCounters.get(
                generatedArchetype.id
              ) ??
              0
            ) +
            1;


          archetypeCounters.set(
            generatedArchetype.id,
            archetypeCount
          );


          const archetypeLabel =
            getTrainerArchetypeLabel(
              generatedArchetype,
              getWorldLanguage()
            );


          trainers.push({
            id:
              trainerId,

            name:
              `${archetypeLabel} ${archetypeCount}`,

            archetypeId:
              generatedArchetype.id,

            teamSize:
              normalizeTrainerTeamSize(
                this._encounterState
                  .trainerRandomPokemonCount
              ),
            onField:
              generatedTrainer.onField
          });


          generatedTrainer.pokemon.forEach(
            pokemon => {
              this.rowSequence +=
                1;


              rows.push({
                id:
                  `row-${this.rowSequence}`,

                trainerId,

                ...pokemon,

                abilityId:
                  null,

                itemId:
                  null,

                itemResolved:
                  false,
              });
            }
          );
        }
      );


      this._encounterState.trainers =
        trainers;

      this._encounterState.rows =
        rows;

      this._encounterState.selectedTrainerId =
        trainers[0]?.id ??
        "";

      this._encounterState.search =
        "";


      ui.notifications.info(
        `Encuentro aleatorio: ${trainers.length} Entrenador(es), ${rows.length} Pokémon.`
      );


      void this.render({
        force:
          true
      });

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error generando Entrenadores aleatorios`,
        error
      );


      ui.notifications.warn(
        error instanceof Error
          ? error.message
          : "No se pudo generar el encuentro aleatorio de Entrenadores."
      );
    }
  }

  #generateRandomEncounter() {
    if (
      this._encounterState.type !==
        "wild"
    ) {
      ui.notifications.warn(
        "La generación aleatoria está disponible solo para encuentros salvajes."
      );

      return;
    }


    const minLevel =
      clampInteger(
        this._encounterState
          .randomMinLevel,
        1,
        20,
        1
      );


    const maxLevel =
      clampInteger(
        this._encounterState
          .randomMaxLevel,
        1,
        20,
        5
      );


    if (
      minLevel >
      maxLevel
    ) {
      ui.notifications.warn(
        "El nivel mínimo no puede ser mayor que el nivel máximo."
      );

      return;
    }


    try {
      const candidates =
        this.randomCatalog
          .candidates({
            region:
              this._encounterState
                .randomRegion,

            biome:
              this._encounterState
                .randomBiome,

            maxLevel,

            minSr:
              this._encounterState
                .randomMinSr,

            maxSr:
              this._encounterState
                .randomMaxSr
          });


      const lockedRows =
        this._encounterState.rows
          .filter(
            row =>
              row.locked ===
                true
          );


      const lockedAbilityIds =
        new Map(
          lockedRows.map(
            row => [
              buildEncounterRowAbilityKey(
                row
              ),

              normalizeOptionalCanonicalId(
                row.abilityId
              )
            ]
          )
        );

      const lockedItemStates =
        new Map(
          lockedRows.map(
            row => [

              buildEncounterRowAbilityKey(
                row
              ),

              {
                itemId:
                  normalizeOptionalCanonicalId(
                    row.itemId
                  ),

                itemResolved:
                  row.itemResolved ===
                    true ||
                  Boolean(
                    row.itemId
                  )
              }
            ]
          )
        );


      const options = {
        candidates,
        minLevel,
        maxLevel,

        size:
          this._encounterState
            .randomSize,

        lockedRows
      };

      const difficulty =
        this._encounterState
          .randomDifficulty;

      const party =
        this.#party();

      const generatedRows =
        rollForDifficulty(
          () =>
            generateRandomEncounterRows(
              options
            ),
          rows =>
            encounterDifficulty(
              party,
              rows
            ),
          difficulty,
          "Prueba otro rango de niveles o tamaño."
        );


      this._encounterState.rows =
        generatedRows.map(
          row => {
            this.rowSequence +=
              1;


            return {
              id:
                `row-${this.rowSequence}`,

              trainerId:
                null,

              ...row,

              abilityId:
                row.locked ===
                  true
                  ? lockedAbilityIds.get(
                      buildEncounterRowAbilityKey(
                        row
                      )
                    ) ??
                    null
                  : null,

              itemId:
                row.locked ===
                  true
                  ? lockedItemStates.get(
                      buildEncounterRowAbilityKey(
                        row
                      )
                    )?.itemId ??
                    null
                  : null,

              itemResolved:
                row.locked ===
                  true
                  ? lockedItemStates.get(
                      buildEncounterRowAbilityKey(
                        row
                      )
                    )?.itemResolved ===
                    true
                  : false,
            };
          }
        );


      this._encounterState.search =
        "";


      const total =
        generatedRows.reduce(
          (
            sum,
            row
          ) =>
            sum +
            row.quantity,
          0
        );


      ui.notifications.info(
        `Encuentro aleatorio: ${generatedRows.length} especie(s), ${total} Pokémon.`
      );


      void this.render({
        force:
          true
      });

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error generando encuentro aleatorio`,
        error
      );


      ui.notifications.warn(
        error instanceof Error
          ? error.message
          : "No se pudo generar el encuentro aleatorio."
      );
    }
  }

  async #generateEncounter() {
    if (
      this._encounterState.busy
    ) {
      return;
    }


    const location =
      this._encounterState.location
        .trim();


    const name =
      this._encounterState.name
        .trim();


    if (!location) {
      ui.notifications.warn(
        "Debes indicar la ubicación del encuentro."
      );

      return;
    }


    if (!name) {
      ui.notifications.warn(
        "Debes indicar el nombre del encuentro."
      );

      return;
    }


    if (
      !this._encounterState.rows.length
    ) {
      ui.notifications.warn(
        "Debes agregar al menos un Pokémon."
      );

      return;
    }

    const trainerValidation =
      validateTrainerState(
        this._encounterState
      );


    if (
      trainerValidation
    ) {
      ui.notifications.warn(
        trainerValidation
      );

      return;
    }

    const definition =
      buildEncounterDefinition(
        this._encounterState,
        location,
        name
      );


    this._encounterState.busy =
      true;


    await this.render({
      force:
        true
    });


    try {
      const service =
        new EncounterGenerationService(
          this.database,
          getWorldLanguage()
        );


      const result =
        await service.generate(
          definition,
          {
            rerollMoves:
              this._encounterState
                .rerollMoves,

            rerollAbilities:
              this._encounterState
                .rerollAbilities,

            allowHiddenAbilities:
              this._encounterState
                .allowHiddenAbilities,

            hiddenAbilityChancePercent:
              this._encounterState
                .hiddenAbilityChancePercent,

            rerollItems:
              this._encounterState
                .rerollItems,

            itemPolicy:
              getPlannerItemPolicy(
                this._encounterState
              ),

            boosts: {
              statBonus:
                this.#boosts().statBonus,

              coverageTypes:
                this.#boosts().coverage
                  ? this._encounterState
                      .partyWeakTo ??
                    []
                  : [],

              guaranteedItems:
                this.#boosts().items
            }
          }
        );


      const details = [
        `${result.created} creado(s)`,
        `${result.updated} actualizado(s)`
      ];


      if (
        result.deleted
      ) {
        details.push(
          `${result.deleted} eliminado(s)`
        );
      }


      if (
        result.retained
      ) {
        details.push(
          `${result.retained} conservado(s) por estar desplegado(s)`
        );
      }

      this._encounterState.rerollAbilities =
        false;

      const queryService =
        new EncounterQueryService();


      const persistedEncounter =
        queryService.get(
          result.encounter.key
        );


      if (
        persistedEncounter
      ) {
        this.#applyEncounter(
          persistedEncounter,
          {
            preserveTransientTrainerPreferences:
              true
          }
        );

      } else {
        this._encounterState.encounterKey =
          result.encounter.key;

        this._encounterState.selectedEncounterKey =
          result.encounter.key;

        this._encounterState.selectedEncounterLocation =
          normalizeSavedEncounterLocation(
            result.encounter.location
          );
      }


      ui.notifications.info(
        `Encuentro "${result.encounter.name}": ` +
        `${details.join(" · ")}.`
      );


      this._encounterState.rerollMoves =
        false;

      this._encounterState.rerollItems =
        false;

    } catch (
      error
    ) {
      console.error(
        `[${MODULE_ID}] Error generando encuentro Pokémon`,
        error
      );


      ui.notifications.error(
        error instanceof Error
          ? error.message
          : "No se pudo generar el encuentro Pokémon."
      );

    } finally {
      this._encounterState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }
}

function buildSavedEncounterLocations(
  encounters
) {
  const groups =
    new Map();


  for (
    const encounter
    of encounters ??
      []
  ) {
    const key =
      normalizeSavedEncounterLocation(
        encounter?.location
      );


    if (!key) {
      continue;
    }


    const existing =
      groups.get(
        key
      );


    if (existing) {
      existing.count +=
        1;

      continue;
    }


    groups.set(
      key,
      {
        key,

        label:
          String(
            encounter.location ??
            ""
          ).trim(),

        count:
          1
      }
    );
  }


  return [
    ...groups.values()
  ].sort(
    (
      left,
      right
    ) =>
      left.label.localeCompare(
        right.label,
        "es",
        {
          sensitivity:
            "base"
        }
      )
  );
}


function filterSavedEncountersByLocation(
  encounters,
  locationKey
) {
  const selected =
    normalizeSavedEncounterLocation(
      locationKey
    );


  if (!selected) {
    return [];
  }


  return (
    encounters ??
    []
  ).filter(
    encounter =>
      normalizeSavedEncounterLocation(
        encounter?.location
      ) ===
        selected
  );
}


function renderSavedEncounterLocationOptions(
  locations,
  selectedValue
) {
  const selectedKey =
    normalizeSavedEncounterLocation(
      selectedValue
    );


  return (
    locations ??
    []
  )
    .map(
      location => {
        const selected =
          location.key ===
            selectedKey
            ? " selected"
            : "";


        return (
          `<option ` +
          `value="${escapeAttribute(location.key)}"` +
          `${selected}>` +
          `${escapeHtml(location.label)} (${location.count})` +
          `</option>`
        );
      }
    )
    .join(
      ""
    );
}


function renderSavedEncounterOptions(
  encounters,
  selectedEncounterKey
) {
  const selectedKey =
    String(
      selectedEncounterKey ??
      ""
    );


  return (
    encounters ??
    []
  )
    .map(
      encounter => {
        const selected =
          String(
            encounter.key
          ) ===
            selectedKey
            ? " selected"
            : "";


        return (
          `<option ` +
          `value="${escapeAttribute(encounter.key)}"` +
          `${selected}>` +
          `${escapeHtml(encounter.name)}` +
          `${encounter.optional ? " (opcional)" : ""}` +
          `</option>`
        );
      }
    )
    .join(
      ""
    );
}


function normalizeSavedEncounterLocation(
  value
) {
  return normalizeSearch(
    value
  );
}

function renderRandomEncounterControls({
  regions,
  biomes,
  region,
  biome,
  minLevel,
  maxLevel,
  size,
  srValues,
  minSr,
  maxSr,
  difficulty,
  party,
  candidateCount,
  lockedCount,
  visible
}) {
  const regionOptions =
    renderRandomSelectOptions(
      regions,
      region
    );


  const biomeOptions =
    renderRandomSelectOptions(
      biomes,
      biome
    );

  const minSrOptions =
    renderRandomSrOptions(
      srValues,
      minSr,
      "Sin mínimo"
    );


  const maxSrOptions =
    renderRandomSrOptions(
      srValues,
      maxSr,
      "Sin máximo"
    );

  return `
    <section
      class="
        poke5e-encounter-planner__panel
        poke5e-encounter-planner__random-panel
      "
      data-role="random-section"
      ${visible ? "" : "hidden"}
    >

      <header class="poke5e-encounter-planner__panel-header">

        <i
          class="fa-solid fa-dice"
          aria-hidden="true"
        ></i>

        <h3>
          Encuentro aleatorio
        </h3>

        <small data-role="random-candidate-count">
          ${candidateCount} especies compatibles
        </small>

      </header>


      <div class="poke5e-encounter-planner__random-grid">

        <label>
          Región

          <select data-role="random-region">
            ${regionOptions}
          </select>
        </label>


        <label>
          Bioma

          <select data-role="random-biome">
            ${biomeOptions}
          </select>
        </label>


        <label>
          Nivel mínimo

          <input
            type="number"
            data-role="random-min-level"
            min="1"
            max="20"
            step="1"
            value="${minLevel}"
          >
        </label>


        <label>
          Nivel máximo

          <input
            type="number"
            data-role="random-max-level"
            min="1"
            max="20"
            step="1"
            value="${maxLevel}"
          >
        </label>

        <label>
          SR mínimo

          <select data-role="random-min-sr">
            ${minSrOptions}
          </select>
        </label>


        <label>
          SR máximo

          <select data-role="random-max-sr">
            ${maxSrOptions}
          </select>
        </label>

        <label>
          Tamaño

          <select data-role="random-size">
            <option
              value="small"
              ${size === "small" ? " selected" : ""}
            >
              Pequeño
            </option>

            <option
              value="normal"
              ${size === "normal" ? " selected" : ""}
            >
              Normal
            </option>

            <option
              value="large"
              ${size === "large" ? " selected" : ""}
            >
              Grande
            </option>
          </select>
        </label>



        <button
          type="button"
          class="poke5e-encounter-planner__random-button"
          data-action="randomize-encounter"
          ${
            canGenerateRandomEncounter(
              candidateCount,
              size,
              lockedCount
            )
              ? ""
              : " disabled"
          }
        >
          <i
            class="fa-solid fa-dice-d20"
            aria-hidden="true"
          ></i>

          ${
            lockedCount > 0
              ? "Reroll no bloqueados"
              : "Generar aleatorio"
          }
        </button>

      </div>


      ${renderDifficultyControls({
        role:
          "random-difficulty",
        difficulty,
        party,
        trainerBattle:
          false
      })}

      <div class="poke5e-encounter-planner__random-hint">
        ${
          lockedCount > 0
            ? `${lockedCount} fila(s) bloqueada(s). Solo se reemplazarán las demás.`
            : "El resultado reemplaza la selección actual de Pokémon."
        }
        No se crean Actors hasta guardar el encuentro.
      </div>

    </section>
  `;
}


function renderRandomSelectOptions(
  values,
  selectedValue
) {
  if (
    !Array.isArray(
      values
    ) ||
    !values.length
  ) {
    return `
      <option value="">
        Sin opciones
      </option>
    `;
  }


  return values
    .map(
      value => {
        const selected =
          value ===
            selectedValue
            ? " selected"
            : "";


        return `
          <option
            value="${escapeAttribute(value)}"
            ${selected}
          >
            ${escapeHtml(
              formatRandomCatalogLabel(
                value
              )
            )}
          </option>
        `;
      }
    )
    .join("");
}

function renderRandomSrOptions(
  values,
  selectedValue,
  emptyLabel
) {
  const normalizedSelected =
    String(
      selectedValue ??
      ""
    );


  const options = [
    `
      <option
        value=""
        ${normalizedSelected === "" ? " selected" : ""}
      >
        ${escapeHtml(emptyLabel)}
      </option>
    `
  ];


  for (
    const value
    of values ??
    []
  ) {
    const normalizedValue =
      String(
        value
      );


    const selected =
      normalizedValue ===
        normalizedSelected
        ? " selected"
        : "";


    options.push(
      `
        <option
          value="${escapeAttribute(normalizedValue)}"
          ${selected}
        >
          ${escapeHtml(
            formatRandomSrValue(
              value
            )
          )}
        </option>
      `
    );
  }


  return options.join("");
}


function formatRandomSrValue(
  value
) {
  const numeric =
    Number(
      value
    );


  const fractions =
    new Map([
      [
        0.125,
        "1/8"
      ],
      [
        0.25,
        "1/4"
      ],
      [
        0.5,
        "1/2"
      ]
    ]);


  return (
    fractions.get(
      numeric
    ) ??
    String(
      numeric
    )
  );
}

function formatRandomCatalogLabel(
  value
) {
  if (
    value ===
      RANDOM_REGION_ALL
  ) {
    return "Todas las regiones";
  }


  if (
    value ===
      RANDOM_BIOME_ROUTE
  ) {
    return "Ruta (mixto)";
  }


  return String(
    value ??
    ""
  )
    .replace(
      /[-_]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      character =>
        character.toUpperCase()
    );
}

function getWildRandomRegionOptions(
  regions
) {
  return [
    RANDOM_REGION_ALL,
    ...(
      regions ??
      []
    )
  ];
}


function getWildRandomBiomeOptions(
  catalog,
  region
) {
  const sourceRegion =
    region ===
      RANDOM_REGION_ALL
      ? ""
      : region;


  return [
    RANDOM_BIOME_ROUTE,
    ...catalog.biomes(
      sourceRegion
    )
  ];
}


function getDefaultWildRandomBiome(
  biomes
) {
  return (
    (
      biomes ??
      []
    ).find(
      biome =>
        biome !==
          RANDOM_BIOME_ROUTE
    ) ??
    RANDOM_BIOME_ROUTE
  );
}

// One random roll, or (with a difficulty) the closest of many to it, warning when the filters can't reach it.
function rollForDifficulty(
  generate,
  measure,
  difficulty,
  advice
) {
  if (!difficulty) {
    return generate();
  }

  const best =
    generateForDifficulty(
      generate,
      measure,
      difficulty
    );

  if (best.distance > 0) {
    const wanted =
      DIFFICULTIES.find(
        entry =>
          entry.id ===
            difficulty
      )?.label;

    ui.notifications.warn(
      `Con estos filtros no se llega a ${wanted}: queda ${best.tier.label}. ${advice}`
    );
  }

  return best.result;
}

// The "Difficulty and party" strip of both random generators.
function renderDifficultyControls({
  role,
  difficulty,
  party,
  trainerBattle,
  boosts = {},
  weakTo = []
}) {
  // Trainer battles pick the rival's rank (and show the difficulty it aims at); wild ones a difficulty.
  const targetLabel = entry =>
    entry.target
      ? ` · ${DIFFICULTIES.find(tier => tier.id === entry.target)?.label}`
      : "";

  const options =
    (
      trainerBattle
        ? TRAINER_RANKS
        : DIFFICULTIES.filter(
            entry =>
              entry.id !==
                "trivial"
          )
    )
      .map(
        entry =>
          `<option value="${entry.id}"${entry.id === difficulty ? " selected" : ""}>${entry.label}${targetLabel(entry)}</option>`
      )
      .join("");

  const number = (
    inputRole,
    label,
    value,
    max
  ) => `
        <label>
          ${label}

          <input
            type="number"
            data-role="${inputRole}"
            min="1"
            max="${max}"
            step="1"
            value="${value}"
          >
        </label>`;



  return `
    <div
      class="
        poke5e-encounter-planner__difficulty-bar
        ${trainerBattle ? "poke5e-encounter-planner__difficulty-bar--trainer" : ""}
      "
    >

      <label class="poke5e-encounter-planner__difficulty-select">
        <span>
          <i
            class="fa-solid ${trainerBattle ? "fa-ranking-star" : "fa-skull"}"
            aria-hidden="true"
          ></i>
          ${trainerBattle ? "Rango del rival" : "Dificultad"}
        </span>

        <select data-role="${role}">
          ${
            trainerBattle
              ? ""
              : `<option value=""${difficulty ? "" : " selected"}>Cualquiera</option>`
          }
          ${options}
        </select>
      </label>

      ${number("party-size", "Jugadores", party.size, 12)}
      ${number("party-level", "Nivel del grupo", party.level, 20)}
      ${trainerBattle ? number("party-team", "Pokémon / jugador", party.team, 6) : ""}
      ${number("party-participants", "Pokémon que participan", party.participants, 24)}

      <button
        type="button"
        class="poke5e-encounter-planner__difficulty-detect"
        data-action="detect-party"
        title="Lee los entrenadores de los jugadores: uno por jugador, al nivel de su Pokémon más fuerte y con su equipo."
      >
        <i
          class="fa-solid fa-users"
          aria-hidden="true"
        ></i>

        Detectar grupo
      </button>

      ${trainerBattle ? renderTrainerExtras({ boosts, weakTo }) : ""}

    </div>`;
}

// The trainer's ace, at the rank's ace level: the one the archetype chose, or else its last Pokémon.
function withAce(
  trainer,
  aceLevels,
  pick
) {
  if (!aceLevels) {
    return trainer;
  }

  const marked =
    trainer.pokemon.findIndex(
      pokemon =>
        pokemon.ace
    );

  const aceIndex =
    marked >= 0
      ? marked
      : trainer.pokemon.length - 1;

  return {
    ...trainer,
    pokemon:
      trainer.pokemon.map(
        (
          pokemon,
          index
        ) =>
          index ===
            aceIndex
            ? {
                ...pokemon,
                level:
                  pick(
                    aceLevels
                  ),
                ace:
                  true
              }
            : pokemon
      )
  };
}

// Candidates of one type with enough species for a team: a random one of those types, or all when none has.
function monotypePool(
  candidates,
  teamSize
) {
  const counts =
    new Map();

  for (const pokemon of candidates) {
    for (const type of pokemon.types ?? []) {
      counts.set(
        type,
        (counts.get(type) ?? 0) + 1
      );
    }
  }

  const types =
    [
      ...counts
    ]
      .filter(
        ([, count]) =>
          count >=
            teamSize
      )
      .map(
        ([type]) =>
          type
      );

  if (!types.length) {
    return candidates;
  }

  const type =
    types[
      Math.floor(
        Math.random() *
        types.length
      )
    ];

  return candidates.filter(
    pokemon =>
      (pokemon.types ?? [])
        .includes(
          type
        )
  );
}

// The trainer strip's second row: a special encounter and the rivals' extras.
function renderTrainerExtras({
  boosts,
  weakTo
}) {
  const toggle = (
    toggleRole,
    checked,
    label,
    hint
  ) => `
        <label class="poke5e-encounter-planner__toggle">
          <input
            type="checkbox"
            data-role="${toggleRole}"
            ${checked ? " checked" : ""}
          >

          <span>
            <strong>${label}</strong>
            <small>${hint}</small>
          </span>
        </label>`;

  return `
      <div class="poke5e-encounter-planner__difficulty-extras">


        <label class="poke5e-encounter-planner__difficulty-stats">
          Características

          <select data-role="boost-stats">
            ${[0, 1, 2].map(bonus => `<option value="${bonus}"${bonus === boosts.statBonus ? " selected" : ""}>+${bonus}</option>`).join("")}
          </select>
        </label>

        ${toggle(
          "boost-coverage",
          boosts.coverage,
          "Cobertura súper eficaz",
          weakTo.length
            ? "Un Move súper eficaz contra el equipo de los jugadores, si lo aprende."
            : "Detecta el grupo para conocer los tipos de sus Pokémon."
        )}

        ${toggle(
          "boost-items",
          boosts.items,
          "Objetos garantizados",
          "Cada Pokémon lleva un objeto equipado o una baya."
        )}
      </div>`;
}

// The players' party, or 4 players at level 5 with 3 Pokémon when there are no player trainers with Pokémon yet.
function detectPartyOrDefault() {
  try {
    const party =
      detectEncounterParty();

    if (party) {
      return {
        ...party,
        detected:
          true
      };
    }
  } catch (
    error
  ) {
    console.warn(
      `[${MODULE_ID}] No se pudo detectar el grupo`,
      error
    );
  }

  return {
    size:
      4,

    level:
      5,

    team:
      3,

    weakTo:
      [],

    pokemon:
      [],

    strongest:
      null,

    detected:
      false
  };
}

function canGenerateRandomEncounter(
  candidateCount,
  size,
  lockedSpeciesCount = 0
) {
  const preset =
    RANDOM_ENCOUNTER_SIZES[
      size
    ] ??
    RANDOM_ENCOUNTER_SIZES.normal;


  return (
    Number(
      candidateCount
    ) +
    Number(
      lockedSpeciesCount
    ) >=
    preset.speciesMin
  );
}


function countRandomCandidates({
  catalog,
  region,
  biome,
  maxLevel,
  minSr,
  maxSr,
  excludedPokemonIds = []
}) {
  if (
    !region ||
    !biome
  ) {
    return 0;
  }


  try {
    const excluded =
      new Set(
        excludedPokemonIds
      );


    return catalog
      .candidates({
        region,
        biome,
        maxLevel,
        minSr,
        maxSr
      })
      .filter(
        pokemon =>
          !excluded.has(
            String(
              pokemon.id
            )
          )
      )
      .length;

  } catch {
    return 0;
  }
}

function getLockedPokemonIds(
  rows
) {
  return new Set(
    (
      rows ??
      []
    )
      .filter(
        row =>
          row.locked ===
            true
      )
      .map(
        row =>
          String(
            row.pokemonId ??
            ""
          )
      )
      .filter(Boolean)
  );
}


function countLockedSpecies(
  rows
) {
  return getLockedPokemonIds(
    rows
  ).size;
}


function normalizeOptionalNumberInput(
  value
) {
  const numeric =
    optionalNumber(
      value
    );


  return numeric == null
    ? ""
    : String(
        numeric
      );
}


function optionalNumber(
  value
) {
  if (
    value == null ||
    value === ""
  ) {
    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}

function renderTrainerRandomControls({
  regions,
  region,
  trainerCount,
  onField,
  pokemonCount,
  candidateCount,
  archetypeGroups,
  archetype,
  archetypeId,
  mixedArchetypeIds,
  language,
  rank,
  party,
  boosts,
  weakTo,
  visible
}) {
  const regionOptions =
    renderTrainerRegionOptions(
      regions,
      region
    );


  const archetypeOptions =
    renderTrainerArchetypeOptions(
      archetypeGroups,
      archetypeId,
      language
    );


  const pokemonCountOptions =
    renderTrainerPokemonCountOptions(
      pokemonCount
    );


  const isMixed =
    archetypeId ===
      MIXED_TRAINER_ARCHETYPE_ID;


  const mixedOptions =
    renderTrainerMixedArchetypeOptions(
      archetypeGroups,
      mixedArchetypeIds,
      language
    );


  const description =
    isMixed
      ? (
          mixedArchetypeIds.length
            ? "Cada Entrenador recibe uno de los arquetipos permitidos."
            : "Selecciona al menos un arquetipo permitido."
        )
      : getTrainerArchetypeDescription(
          archetype,
          language
        );





  return `
    <section
      class="
        poke5e-encounter-planner__panel
        poke5e-encounter-planner__trainer-random-panel
      "
      data-role="trainer-random-section"
      ${visible ? "" : "hidden"}
    >

      <header class="poke5e-encounter-planner__panel-header">

        <i
          class="fa-solid fa-dice-d20"
          aria-hidden="true"
        ></i>

        <h3>
          Generador de Entrenadores
        </h3>

        <small data-role="trainer-random-candidate-count">
          ${candidateCount} especies compatibles
        </small>

      </header>


      <div class="poke5e-encounter-planner__trainer-random-grid">

        <label>
          Arquetipo

          <select data-role="trainer-random-archetype">
            ${archetypeOptions}
          </select>
        </label>


        <label>
          Región del pool

          <select data-role="trainer-random-region">
            ${regionOptions}
          </select>
        </label>


        <label>
          Entrenadores

          <select data-role="trainer-random-count">
            ${renderTrainerPokemonCountOptions(trainerCount)}
          </select>
        </label>


        <label title="Pokémon que cada Entrenador tiene a la vez en el campo. Automático: 1 o 2, o de 2 a 6 en un encuentro especial.">
          En campo / Entrenador

          <select data-role="trainer-random-on-field">
            ${renderTrainerPokemonCountOptions(onField)}
          </select>
        </label>


        <label>
          Pokémon / Entrenador

          <select data-role="trainer-random-pokemon-count">
            ${pokemonCountOptions}
          </select>
        </label>


        <button
          type="button"
          class="poke5e-encounter-planner__trainer-random-button"
          data-action="randomize-trainers"
          ${
            canGenerateRandomTrainerEncounter(
              candidateCount,
              pokemonCount,
              archetypeId,
              mixedArchetypeIds
            )
              ? ""
              : " disabled"
          }
        >

          <i
            class="fa-solid fa-users-rays"
            aria-hidden="true"
          ></i>

          Generar Entrenadores

        </button>

      </div>

      ${renderDifficultyControls({
        role:
          "trainer-random-rank",
        difficulty:
          rank,
        party,
        trainerBattle:
          true,
        boosts,
        weakTo
      })}

      <div
        class="poke5e-encounter-planner__trainer-mixed-archetypes"
        data-role="trainer-mixed-archetypes"
        ${isMixed ? "" : "hidden"}
      >

        <div class="poke5e-encounter-planner__trainer-mixed-toolbar">

          <div class="poke5e-encounter-planner__trainer-mixed-search">

            <i
              class="fa-solid fa-magnifying-glass"
              aria-hidden="true"
            ></i>

            <input
              type="search"
              data-role="trainer-mixed-search"
              placeholder="Buscar arquetipo…"
              aria-label="Buscar arquetipo permitido"
            >

          </div>


          <div class="poke5e-encounter-planner__trainer-mixed-actions">

            <button
              type="button"
              data-action="trainer-mixed-select-all"
            >
              <i
                class="fa-solid fa-check-double"
                aria-hidden="true"
              ></i>

              Todos
            </button>


            <button
              type="button"
              data-action="trainer-mixed-select-none"
            >
              <i
                class="fa-solid fa-xmark"
                aria-hidden="true"
              ></i>

              Ninguno
            </button>

          </div>

        </div>


        <div class="poke5e-encounter-planner__trainer-mixed-groups">
          ${mixedOptions}
        </div>

      </div>

      <div
        class="poke5e-encounter-planner__trainer-archetype-hint"
        data-role="trainer-archetype-description"
      >
        <span data-role="trainer-archetype-description-text">
          ${escapeHtml(description)}
        </span>

        <span data-role="trainer-archetype-description-meta">
          ${
            isMixed
              ? (
                  mixedArchetypeIds.length
                    ? `${mixedArchetypeIds.length} arquetipo(s) permitido(s).`
                    : ""
                )
              : ""
          }
        </span>
      </div>

    </section>
  `;
}

function renderTrainerRegionOptions(
  regions,
  selectedValue
) {
  const selectedRegion =
    String(
      selectedValue ??
      ""
    );


  const options = [
    `
      <option
        value=""
        ${selectedRegion ? "" : " selected"}
      >
        Todas las regiones
      </option>
    `
  ];


  for (
    const region
    of regions ??
    []
  ) {
    const value =
      String(
        region ??
        ""
      );


    if (!value) {
      continue;
    }


    const selected =
      value ===
        selectedRegion
        ? " selected"
        : "";


    options.push(
      `
        <option
          value="${escapeAttribute(value)}"
          ${selected}
        >
          ${escapeHtml(
            formatRandomCatalogLabel(
              value
            )
          )}
        </option>
      `
    );
  }


  return options.join(
    ""
  );
}

function renderTrainerArchetypeOptions(
  archetypeGroups,
  selectedValue,
  language
) {
  const groupedOptions =
    renderTrainerArchetypeGroupOptions(
      archetypeGroups,
      selectedValue,
      language
    );


  const specialLabel =
    language ===
      "en"
      ? "Special"
      : "Especial";


  const mixedLabel =
    language ===
      "en"
      ? "Mixed"
      : "Mixto";


  return (
    groupedOptions +
    `
      <optgroup
        label="${escapeAttribute(
          specialLabel
        )}"
      >
        <option
          value="${MIXED_TRAINER_ARCHETYPE_ID}"
          ${
            selectedValue ===
              MIXED_TRAINER_ARCHETYPE_ID
              ? " selected"
              : ""
          }
        >
          ${escapeHtml(mixedLabel)}
        </option>
      </optgroup>
    `
  );
}


function renderTrainerArchetypeGroupOptions(
  archetypeGroups,
  selectedValue,
  language
) {
  return (
    archetypeGroups ??
    []
  )
    .map(
      group => {
        const options =
          (
            group.archetypes ??
            []
          )
            .map(
              archetype => {
                const selected =
                  archetype.id ===
                    selectedValue
                    ? " selected"
                    : "";


                return `
                  <option
                    value="${escapeAttribute(
                      archetype.id
                    )}"
                    ${selected}
                  >
                    ${escapeHtml(
                      getTrainerArchetypeLabel(
                        archetype,
                        language
                      )
                    )}
                  </option>
                `;
              }
            )
            .join("");


        if (!options) {
          return "";
        }


        return `
          <optgroup
            label="${escapeAttribute(
              getTrainerArchetypeGroupLabel(
                group,
                language
              )
            )}"
          >
            ${options}
          </optgroup>
        `;
      }
    )
    .join("");
}


function renderTrainerMixedArchetypeOptions(
  archetypeGroups,
  selectedIds,
  language
) {
  const selected =
    new Set(
      selectedIds ??
      []
    );


  return (
    archetypeGroups ??
    []
  )
    .map(
      group => {
        const groupLabel =
          getTrainerArchetypeGroupLabel(
            group,
            language
          );


        const options =
          (
            group.archetypes ??
            []
          )
            .map(
              archetype => {
                const label =
                  getTrainerArchetypeLabel(
                    archetype,
                    language
                  );


                const searchText =
                  normalizeSearch(
                    `${label} ${archetype.id} ${groupLabel}`
                  );


                return `
                  <label
                    class="poke5e-encounter-planner__trainer-mixed-option"
                    data-role="trainer-mixed-option"
                    data-search="${escapeAttribute(
                      searchText
                    )}"
                  >

                    <input
                      type="checkbox"
                      data-role="trainer-mixed-archetype"
                      value="${escapeAttribute(
                        archetype.id
                      )}"
                      ${selected.has(archetype.id) ? " checked" : ""}
                    >

                    <span>
                      ${escapeHtml(label)}
                    </span>

                  </label>
                `;
              }
            )
            .join("");


        if (!options) {
          return "";
        }


        return `
          <section
            class="poke5e-encounter-planner__trainer-mixed-group"
            data-role="trainer-mixed-group"
          >

            <header class="poke5e-encounter-planner__trainer-mixed-group-header">

              <strong>
                ${escapeHtml(groupLabel)}
              </strong>

              <small>
                ${(group.archetypes ?? []).length}
              </small>

            </header>


            <div class="poke5e-encounter-planner__trainer-mixed-options">
              ${options}
            </div>

          </section>
        `;
      }
    )
    .join("");
}

function filterTrainerMixedArchetypeOptions(
  root,
  value
) {
  const search =
    normalizeSearch(
      value
    );


  root.querySelectorAll(
    '[data-role="trainer-mixed-option"]'
  ).forEach(
    option => {
      const searchText =
        String(
          option.dataset
            .search ??
          ""
        );


      option.hidden =
        Boolean(
          search &&
          !searchText.includes(
            search
          )
        );
    }
  );


  root.querySelectorAll(
    '[data-role="trainer-mixed-group"]'
  ).forEach(
    group => {
      const hasVisibleOptions =
        [
          ...group.querySelectorAll(
            '[data-role="trainer-mixed-option"]'
          )
        ]
          .some(
            option =>
              !option.hidden
          );


      group.hidden =
        !hasVisibleOptions;
    }
  );
}

function renderTrainerPokemonCountOptions(
  selectedValue
) {
  const value =
    String(
      selectedValue ??
      "auto"
    );


  const options = [
    `
      <option
        value="auto"
        ${value === "auto" ? " selected" : ""}
      >
        Automático
      </option>
    `
  ];


  for (
    let count =
      1;
    count <=
      6;
    count += 1
  ) {
    const normalized =
      String(
        count
      );


    options.push(
      `
        <option
          value="${normalized}"
          ${value === normalized ? " selected" : ""}
        >
          ${normalized}
        </option>
      `
    );
  }


  return options.join("");
}


function canGenerateRandomTrainerEncounter(
  candidateCount,
  pokemonCount,
  archetypeId,
  mixedArchetypeIds = []
) {
  const archetypes =
    resolveTrainerRandomArchetypes(
      archetypeId,
      mixedArchetypeIds
    );


  if (
    !archetypes.length
  ) {
    return false;
  }


  const required =
    String(
      pokemonCount ??
      ""
    ) ===
      "auto"

      ? Math.max(
          ...archetypes.map(
            archetype =>
              clampInteger(
                archetype.teamSize?.min,
                1,
                6,
                1
              )
          )
        )

      : clampInteger(
          pokemonCount,
          1,
          6,
          3
        );


  return (
    Number(
      candidateCount
    ) >=
    required
  );
}


function resolveTrainerRandomArchetypes(
  archetypeId,
  mixedArchetypeIds = []
) {
  if (
    archetypeId !==
      MIXED_TRAINER_ARCHETYPE_ID
  ) {
    return [
      getTrainerArchetype(
        archetypeId
      )
    ];
  }


  const known =
    new Map(
      listTrainerArchetypes()
        .map(
          archetype => [
            archetype.id,
            archetype
          ]
        )
    );


  const seen =
    new Set();


  return (
    mixedArchetypeIds ??
    []
  )
    .map(
      id =>
        String(
          id ??
          ""
        )
    )
    .filter(
      id => {
        if (
          !known.has(
            id
          ) ||
          seen.has(
            id
          )
        ) {
          return false;
        }


        seen.add(
          id
        );

        return true;
      }
    )
    .map(
      id =>
        known.get(
          id
        )
    );
}


function getDefaultMixedTrainerArchetypeIds() {
  return listTrainerArchetypes()
    .map(
      archetype =>
        archetype.id
    )
    .filter(
      id =>
        id !==
          "generic"
    );
}


function countTrainerRandomCandidates({
  catalog,
  region,
  maxLevel,
  minSr,
  maxSr
}) {
  try {
    return catalog
      .trainerCandidates({
        region,
        maxLevel,
        minSr,
        maxSr
      })
      .length;

  } catch {
    return 0;
  }
}

function renderTrainerControls({
  trainers,
  selectedTrainerId,
  rows,
  archetypeGroups,
  candidateCount,
  language,
  visible
}) {

  const cards =
    trainers.length

      ? trainers
          .map(
            trainer => {

              const pokemonCount =
                rows
                  .filter(
                    row =>
                      row.trainerId ===
                      trainer.id
                  )
                  .reduce(
                    (
                      total,
                      row
                    ) =>
                      total +
                      clampInteger(
                        row.quantity,
                        1,
                        999,
                        1
                      ),
                    0
                  );

              const lockedCount =
                countTrainerRowQuantity(
                  rows.filter(
                    row =>
                      row.trainerId ===
                        trainer.id &&
                      row.locked ===
                        true
                  )
                );

              const trainerArchetype =
                getTrainerArchetype(
                  trainer.archetypeId
                );


              const teamSize =
                normalizeTrainerTeamSize(
                  trainer.teamSize
                );


              const archetypeOptions =
                renderTrainerCardArchetypeOptions(
                  archetypeGroups,
                  trainerArchetype.id,
                  language
                );

              const teamSizeOptions =
                renderTrainerPokemonCountOptions(
                  teamSize
                );


              const rerollState =
                getTrainerRerollUiState({
                  candidateCount,
                  pokemonCount,
                  lockedCount,
                  teamSize,

                  archetype:
                    trainerArchetype
                });


              return `
                <article
                  class="poke5e-encounter-planner__trainer-card"
                  data-trainer-id="${escapeAttribute(
                    trainer.id
                  )}"
                >

                  <div class="poke5e-encounter-planner__trainer-icon">

                    <i
                      class="fa-solid fa-user"
                      aria-hidden="true"
                    ></i>

                  </div>


                  <div class="poke5e-encounter-planner__trainer-body">

                    <label>
                      Nombre del entrenador

                      <input
                        type="text"
                        data-role="trainer-name"
                        data-trainer-id="${escapeAttribute(
                          trainer.id
                        )}"
                        value="${escapeAttribute(
                          trainer.name
                        )}"
                      >
                    </label>


                    <div class="poke5e-encounter-planner__trainer-settings">

                      <label>
                        Arquetipo

                        <select
                          data-role="trainer-archetype"
                          data-trainer-id="${escapeAttribute(
                            trainer.id
                          )}"
                        >
                          ${archetypeOptions}
                        </select>
                      </label>


                      <label>
                        Equipo

                        <select
                          data-role="trainer-team-size"
                          data-trainer-id="${escapeAttribute(
                            trainer.id
                          )}"
                        >
                          ${teamSizeOptions}
                        </select>
                      </label>


                      <label title="Pokémon que este Entrenador tiene a la vez en el campo.">
                        En campo

                        <select
                          data-role="trainer-on-field"
                          data-trainer-id="${escapeAttribute(
                            trainer.id
                          )}"
                        >
                          ${
                            [1, 2, 3, 4, 5, 6]
                              .map(
                                count =>
                                  `<option value="${count}"${count === (trainer.onField ?? 1) ? " selected" : ""}>${count}</option>`
                              )
                              .join("")
                          }
                        </select>
                      </label>



                      <button
                        type="button"
                        class="poke5e-encounter-planner__trainer-reroll"
                        data-action="reroll-trainer-team"
                        data-trainer-id="${escapeAttribute(
                          trainer.id
                        )}"
                        title="${escapeAttribute(
                          rerollState.title
                        )}"
                        ${rerollState.canReroll ? "" : " disabled"}
                      >

                        <i
                          class="fa-solid fa-dice"
                          aria-hidden="true"
                        ></i>

                        <span data-role="trainer-reroll-label">
                          ${escapeHtml(
                            rerollState.label
                          )}
                        </span>

                      </button>

                    </div>


                    <span class="poke5e-encounter-planner__trainer-meta">

                      <i
                        class="fa-solid fa-paw"
                        aria-hidden="true"
                      ></i>

                      ${pokemonCount}
                      Pokémon

                      ${
                        lockedCount > 0
                          ? ` · ${lockedCount} bloqueado(s)`
                          : ""
                      }

                    </span>

                  </div>


                  <button
                    type="button"
                    class="poke5e-encounter-planner__trainer-remove"
                    data-action="remove-trainer"
                    data-trainer-id="${escapeAttribute(
                      trainer.id
                    )}"
                    title="Eliminar entrenador"
                    aria-label="Eliminar entrenador"
                  >

                    <i
                      class="fa-solid fa-trash"
                      aria-hidden="true"
                    ></i>

                  </button>

                </article>
              `;
            }
          )
          .join("")

      : `
        <div class="poke5e-encounter-planner__trainer-empty">

          <i
            class="fa-solid fa-users"
            aria-hidden="true"
          ></i>

          <span>
            Aún no hay entrenadores en este encuentro.
          </span>

        </div>
      `;


  const options =
    trainers
      .map(
        trainer => {

          const selected =
            trainer.id ===
              selectedTrainerId
              ? " selected"
              : "";


          return `
            <option
              value="${escapeAttribute(
                trainer.id
              )}"
              ${selected}
            >
              ${escapeHtml(
                trainer.name
              )}
            </option>
          `;
        }
      )
      .join("");


  return `
    <section
      class="
        poke5e-encounter-planner__panel
        poke5e-encounter-planner__trainer-panel
      "
      data-role="trainer-section"
      ${visible ? "" : "hidden"}
    >

      <header class="poke5e-encounter-planner__panel-header">

        <i
          class="fa-solid fa-users"
          aria-hidden="true"
        ></i>

        <h3>
          Entrenadores rivales
        </h3>

        <small>
          Organización del encuentro
        </small>

      </header>


      <div class="poke5e-encounter-planner__trainer-list">
        ${cards}
      </div>


      <div class="poke5e-encounter-planner__trainer-actions">

        <button
          type="button"
          data-action="add-trainer"
        >

          <i
            class="fa-solid fa-user-plus"
            aria-hidden="true"
          ></i>

          Agregar entrenador

        </button>


        <label>
          Asignar nuevos Pokémon a

          <select
            data-role="trainer-target"
            ${
              trainers.length
                ? ""
                : " disabled"
            }
          >

            ${
              trainers.length
                ? options
                : `
                  <option
                    value=""
                    selected
                  >
                    Agrega primero un entrenador
                  </option>
                `
            }

          </select>

        </label>

      </div>

    </section>
  `;
}

function renderTrainerCardArchetypeOptions(
  archetypeGroups,
  selectedValue,
  language
) {
  return renderTrainerArchetypeGroupOptions(
    archetypeGroups,
    selectedValue,
    language
  );
}

function normalizeTrainerTeamSize(
  value
) {
  const normalized =
    String(
      value ??
      "auto"
    );


  if (
    normalized ===
      "auto"
  ) {
    return "auto";
  }


  return String(
    clampInteger(
      normalized,
      1,
      6,
      3
    )
  );
}

function countTrainerRowQuantity(
  rows
) {
  return (
    rows ??
    []
  ).reduce(
    (
      total,
      row
    ) =>
      total +
      clampInteger(
        row?.quantity,
        1,
        999,
        1
      ),
    0
  );
}


function getTrainerRerollTargetForUi({
  pokemonCount,
  teamSize,
  archetype
}) {
  if (
    String(
      teamSize ??
      ""
    ) !==
      "auto"
  ) {
    return clampInteger(
      teamSize,
      1,
      6,
      3
    );
  }


  const minimum =
    clampInteger(
      archetype?.teamSize?.min,
      1,
      6,
      1
    );


  const maximum =
    clampInteger(
      archetype?.teamSize?.max,
      minimum,
      6,
      minimum
    );


  const current =
    clampInteger(
      pokemonCount,
      0,
      6,
      0
    );


  return current > 0
    ? Math.min(
        maximum,
        Math.max(
          minimum,
          current
        )
      )
    : minimum;
}


function getTrainerRerollUiState({
  candidateCount,
  pokemonCount,
  lockedCount,
  teamSize,
  archetype
}) {
  const targetCount =
    getTrainerRerollTargetForUi({
      pokemonCount,
      teamSize,
      archetype
    });


  if (
    lockedCount >
      targetCount
  ) {
    return {
      canReroll:
        true,

      label:
        "Revisar bloqueos",

      title:
        `Hay ${lockedCount} Pokémon bloqueados, pero el tamaño objetivo es ${targetCount}.`
    };
  }


  const missingCount =
    targetCount -
    lockedCount;


  if (
    missingCount <=
      0
  ) {
    return {
      canReroll:
        false,

      label:
        "Todos bloqueados",

      title:
        "No hay cupos sin bloquear para regenerar."
    };
  }


  return {
    canReroll:
      Number(
        candidateCount
      ) >=
        missingCount,

    label:
      lockedCount > 0
        ? "Reroll no bloqueados"
        : "Regenerar equipo",

    title:
      lockedCount > 0
        ? "Regenerar solo los Pokémon no bloqueados de este Entrenador"
        : "Regenerar solo el equipo de este Entrenador"
  };
}


function mergeTrainerRerollRows(
  currentRows,
  generatedRows
) {
  const merged =
    [];


  let generatedIndex =
    0;


  for (
    const row
    of currentRows ??
    []
  ) {
    if (
      row.locked ===
        true
    ) {
      merged.push(
        row
      );

      continue;
    }


    if (
      generatedIndex <
        generatedRows.length
    ) {
      merged.push(
        generatedRows[
          generatedIndex
        ]
      );

      generatedIndex +=
        1;
    }
  }


  if (
    generatedIndex <
      generatedRows.length
  ) {
    merged.push(
      ...generatedRows.slice(
        generatedIndex
      )
    );
  }


  return merged;
}

function validateTrainerState(
  state
) {
  if (
    state.type !==
      "trainer"
  ) {
    return null;
  }


  if (
    !state.trainers.length
  ) {
    return (
      "El encuentro requiere al menos un Entrenador."
    );
  }


  const unnamed =
    state.trainers.find(
      trainer =>
        !String(
          trainer.name ??
          ""
        ).trim()
    );


  if (unnamed) {
    return (
      "Todos los Entrenadores requieren un nombre."
    );
  }


  const trainerWithoutPokemon =
    state.trainers.find(
      trainer =>
        !state.rows.some(
          row =>
            row.trainerId ===
              trainer.id
        )
    );


  if (
    trainerWithoutPokemon
  ) {
    return (
      `El Entrenador "${trainerWithoutPokemon.name}" ` +
      "requiere al menos un Pokémon."
    );
  }


  return null;
}

function normalizeEncounterStudioTab(
  value,
  trainerEncounter
) {

  const tab =
    String(
      value ??
      "composition"
    );


  if (
    !ENCOUNTER_STUDIO_TABS.has(
      tab
    )
  ) {
    return "composition";
  }


  if (
    tab ===
      "trainers" &&
    !trainerEncounter
  ) {
    return "composition";
  }


  return tab;
}

function getPlannerItemPolicy(
  state
) {

  const encounterType =
    state.type ===
      "trainer"

      ? "trainer"

      : "wild";


  state.itemPolicies ??=
    {};


  state.itemPolicies[
    encounterType
  ] ??=
    getDefaultEncounterItemPolicy(
      encounterType
    );


  return state.itemPolicies[
    encounterType
  ];
}

function buildEncounterDefinition(
  state,
  location,
  name
) {
  const base = {
    key:
      state.encounterKey,
    type:
      state.type,
    optional:
      state.optional ===
        true,
    location,
    name
  };


  if (
    state.type !==
      "trainer"
  ) {
    return {
      ...base,

      pokemon:
        state.rows.map(
          buildPokemonRequest
        ),

      trainers:
        []
    };
  }


  return {
    ...base,

    pokemon:
      [],

    trainers:
      state.trainers.map(
        trainer => ({
          id:
            trainer.id,

          name:
            String(
              trainer.name
            ).trim(),

          archetypeId:
            getTrainerArchetype(
              trainer.archetypeId
            ).id,

          pokemon:
            state.rows
              .filter(
                row =>
                  row.trainerId ===
                    trainer.id
              )
              .map(
                buildPokemonRequest
              )
        })
      )
  };
}


function buildPokemonRequest(
  row
) {
  return {
    pokemonId:
      row.pokemonId,

    level:
      row.level,

    quantity:
      row.quantity,

    defeated:
      row.defeated,

    captured:
      row.captured,

    abilityId:
      normalizeOptionalCanonicalId(
        row.abilityId
      ),

    itemId:
      normalizeOptionalCanonicalId(
        row.itemId
      ),

    itemResolved:
      row.itemResolved ===
        true ||
      Boolean(
        row.itemId
      )
  };
}

function resolvePlannerScrollHosts(
  content
) {

  if (!content) {

    return {
      sidebar:
        null,

      workspace:
        null
    };
  }


  const root =
    content.querySelector(
      ".poke5e-encounter-planner__content"
    );


  return {
    sidebar:
      root?.querySelector(
        ".poke5e-encounter-planner__sidebar"
      ) ??
      null,

    workspace:
      root?.querySelector(
        ".poke5e-encounter-planner__workspace"
      ) ??
      root ??
      content
  };
}


function capturePlannerUiState(
  content
) {

  const {
    sidebar,
    workspace
  } =
    resolvePlannerScrollHosts(
      content
    );


  const activeElement =
    document.activeElement;


  let focus =
    null;


  if (
    activeElement instanceof
      HTMLElement &&
    content.contains(
      activeElement
    )
  ) {

    focus = {
      tagName:
        activeElement.tagName,

      role:
        activeElement.dataset
          .role ??
        "",

      action:
        activeElement.dataset
          .action ??
        "",

      rowId:
        activeElement.dataset
          .rowId ??
        "",

      pokemonId:
        activeElement.dataset
          .pokemonId ??
        "",

      trainerId:
        activeElement.dataset
          .trainerId ??
        "",

      selectionStart:
        null,

      selectionEnd:
        null
    };


    try {

      if (
        typeof activeElement
          .selectionStart ===
        "number"
      ) {

        focus.selectionStart =
          activeElement.selectionStart;


        focus.selectionEnd =
          activeElement.selectionEnd;
      }

    } catch {
      /*
       * Algunos controles no exponen
       * selección de texto.
       */
    }
  }


  return {
    content,

    sidebarTop:
      sidebar?.scrollTop ??
      0,

    workspaceTop:
      workspace?.scrollTop ??
      0,

    workspaceLeft:
      workspace?.scrollLeft ??
      0,

    focus
  };
}

function findPlannerFocusElement(
  content,
  focus
) {

  if (!focus) {

    return null;
  }


  const candidates =
    content.querySelectorAll(
      "[data-role], [data-action]"
    );


  return (
    [
      ...candidates
    ].find(
      element =>
        element.tagName ===
          focus.tagName &&

        (
          element.dataset.role ??
          ""
        ) ===
          focus.role &&

        (
          element.dataset.action ??
          ""
        ) ===
          focus.action &&

        (
          element.dataset.rowId ??
          ""
        ) ===
          focus.rowId &&

        (
          element.dataset.pokemonId ??
          ""
        ) ===
          focus.pokemonId &&

        (
          element.dataset.trainerId ??
          ""
        ) ===
          focus.trainerId
    ) ??
    null
  );
}


function restorePlannerUiState(
  state
) {

  if (
    !state?.content
  ) {

    return;
  }


  const restore =
    () => {

      if (
        !state.content
          .isConnected
      ) {

        return;
      }


      /*
       * _replaceHTML() reemplaza el contenido
       * interno de ApplicationV2.
       *
       * Por eso resolvemos nuevamente el scroll
       * host después de cada render en lugar de
       * conservar una referencia al elemento
       * anterior, que ya fue destruido.
       */
      const {
        sidebar,
        workspace
      } =
        resolvePlannerScrollHosts(
          state.content
        );


      if (sidebar) {

        sidebar.scrollTop =
          state.sidebarTop ??
          0;
      }


      if (workspace) {

        workspace.scrollTop =
          state.workspaceTop ??
          0;


        workspace.scrollLeft =
          state.workspaceLeft ??
          0;
      }


      const element =
        findPlannerFocusElement(
          state.content,
          state.focus
        );


      if (!element) {

        return;
      }


      element.focus({
        preventScroll:
          true
      });


      if (
        state.focus
          .selectionStart ==
            null
      ) {

        return;
      }


      try {

        element.setSelectionRange(
          state.focus.selectionStart,
          state.focus.selectionEnd
        );

      } catch {
        /*
         * Number, select y button no permiten
         * setSelectionRange.
         */
      }
    };


  restore();


  window.requestAnimationFrame(
    restore
  );
}

function renderSearchResultCard(
  pokemon,
  language
) {

  const name =
    localized(
      pokemon.name,
      language,
      pokemon.id
    );


  return `
    <article class="poke5e-encounter-planner__search-result">

      <span class="poke5e-encounter-planner__search-dex">
        #${escapeHtml(
          String(
            pokemon.dexNumber ??
            "—"
          )
        )}
      </span>


      <div class="poke5e-encounter-planner__search-identity">

        <strong>
          ${escapeHtml(name)}
        </strong>

        <span>
          ${escapeHtml(
            String(
              pokemon.id
            )
          )}
        </span>

      </div>

      ${renderTypeChips(
        pokemon.types
      )}

      <span class="poke5e-encounter-planner__sr">
        ${escapeHtml(
          formatSr(
            pokemon.sr
          )
        )}
      </span>


      <button
        type="button"
        data-action="add-pokemon"
        data-pokemon-id="${escapeAttribute(
          pokemon.id
        )}"
      >

        <i
          class="fa-solid fa-plus"
          aria-hidden="true"
        ></i>

        Añadir

      </button>

    </article>
  `;
}

function normalizeEncounterCompositionView(
  value
) {
  return value ===
    "compact"
    ? "compact"
    : "cards";
}


function buildCompositionSummary({
  encounterType,
  rowCount,
  trainerCount,
  tokens
}) {

  if (
    encounterType ===
      "trainer"
  ) {
    return (
      `${trainerCount} Entrenador(es) · ` +
      `${formatNumber(tokens)} Pokémon`
    );
  }


  return (
    `${rowCount} entrada(s) · ` +
    `${formatNumber(tokens)} Pokémon`
  );
}

function renderEncounterComposition({
  rows,
  encounterType,
  trainers,
  compositionView,
  collapsedTrainerIds
}) {

  const view =
    normalizeEncounterCompositionView(
      compositionView
    );


  if (
    encounterType ===
      "trainer"
  ) {
    return renderTrainerEncounterComposition({
      rows,
      trainers,

      compositionView:
        view,

      collapsedTrainerIds
    });
  }


  if (
    !rows.length
  ) {
    return renderCompositionEmptyState();
  }


  return `
    <div
      class="
        poke5e-encounter-planner__encounter-list
        poke5e-encounter-planner__encounter-list--${view}
      "
    >
      ${
        rows
          .map(
            row =>
              renderEncounterCard(
                row,
                encounterType,
                trainers,
                view
              )
          )
          .join("")
      }
    </div>
  `;
}

function renderTrainerEncounterComposition({
  rows,
  trainers,
  compositionView,
  collapsedTrainerIds
}) {

  const trainerList =
    Array.isArray(
      trainers
    )
      ? trainers
      : [];


  const rowsByTrainer =
    new Map();


  for (
    const row
    of rows
  ) {
    const trainerId =
      String(
        row.trainerId ??
        ""
      );


    const trainerRows =
      rowsByTrainer.get(
        trainerId
      ) ??
      [];


    trainerRows.push(
      row
    );


    rowsByTrainer.set(
      trainerId,
      trainerRows
    );
  }


  const knownTrainerIds =
    new Set(
      trainerList.map(
        trainer =>
          String(
            trainer.id
          )
      )
    );

  const collapsedIds =
  collapsedTrainerIds instanceof
    Set

    ? collapsedTrainerIds

    : new Set();

  const groups =
    trainerList.map(
      trainer => {
        const trainerId =
          String(
            trainer.id
          );


        return renderTrainerCompositionGroup({
          trainerId,

          trainerName:
            String(
              trainer.name ??
              ""
            ).trim() ||
            "Entrenador sin nombre",

          rows:
            rowsByTrainer.get(
              trainerId
            ) ??
            [],

          trainers:
            trainerList,

          compositionView,

          collapsed:
            collapsedIds.has(
              trainerId
            )
        });
      }
    );

  const unassignedRows =
    rows.filter(
      row =>
        !knownTrainerIds.has(
          String(
            row.trainerId ??
            ""
          )
        )
    );


  if (
    unassignedRows.length
  ) {
    groups.push(
      renderTrainerCompositionGroup({
        trainerId:
          "",

        trainerName:
          "Sin entrenador asignado",

        rows:
          unassignedRows,

        trainers:
          trainerList,

        compositionView,

        unassigned:
          true
      })
    );
  }


  if (
    !groups.length
  ) {
    return renderCompositionEmptyState();
  }


  return `
    <div class="poke5e-encounter-planner__trainer-composition-groups">
      ${groups.join("")}
    </div>
  `;
}


function renderTrainerCompositionGroup({
  trainerId,
  trainerName,
  rows,
  trainers,
  compositionView,
  unassigned = false,
  collapsed = false
}) {

  const groupBody =
    rows.length
      ? `
        <div
          class="
            poke5e-encounter-planner__encounter-list
            poke5e-encounter-planner__encounter-list--${compositionView}
          "
        >
          ${
            rows
              .map(
                row =>
                  renderEncounterCard(
                    row,
                    "trainer",
                    trainers,
                    compositionView
                  )
              )
              .join("")
          }
        </div>
      `
      : `
        <div class="poke5e-encounter-planner__trainer-composition-empty">
          Este Entrenador aún no tiene Pokémon.
        </div>
      `;


  return `
    <section
      class="poke5e-encounter-planner__trainer-composition-group${
        unassigned
          ? " is-unassigned"
          : ""
      }${
        collapsed
          ? " is-collapsed"
          : ""
      }"
      data-trainer-group-id="${escapeAttribute(
        trainerId
      )}"
    >

      <header class="poke5e-encounter-planner__trainer-composition-header">

        <div>

          <span class="poke5e-encounter-planner__trainer-composition-icon">
            <i
              class="${
                unassigned
                  ? "fa-solid fa-triangle-exclamation"
                  : "fa-solid fa-user"
              }"
              aria-hidden="true"
            ></i>
          </span>


          <div>

            <small>
              ${
                unassigned
                  ? "Asignación pendiente"
                  : "Entrenador"
              }
            </small>

            <strong
              data-role="composition-trainer-name"
              data-trainer-id="${escapeAttribute(
                trainerId
              )}"
            >
              ${escapeHtml(trainerName)}
            </strong>

          </div>

        </div>


        <div class="poke5e-encounter-planner__trainer-composition-actions">

          <span class="poke5e-encounter-planner__trainer-composition-count">
            ${rows.length} entrada(s)
          </span>

          ${
            unassigned
              ? ""
              : `
                <button
                  type="button"
                  class="poke5e-encounter-planner__trainer-collapse"
                  data-action="toggle-trainer-composition"
                  data-trainer-id="${escapeAttribute(
                    trainerId
                  )}"
                  aria-expanded="${
                    collapsed
                      ? "false"
                      : "true"
                  }"
                  title="${
                    collapsed
                      ? "Expandir Entrenador"
                      : "Minimizar Entrenador"
                  }"
                  aria-label="${
                    collapsed
                      ? "Expandir Entrenador"
                      : "Minimizar Entrenador"
                  }"
                >
                  <i
                    class="${
                      collapsed
                        ? "fa-solid fa-chevron-right"
                        : "fa-solid fa-chevron-down"
                    }"
                    aria-hidden="true"
                  ></i>
                </button>
              `
          }

        </div>

      </header>


      <div
        class="poke5e-encounter-planner__trainer-composition-body"
        data-role="trainer-composition-body"
        ${collapsed ? "hidden" : ""}
      >
        ${groupBody}
      </div>

    </section>
  `;
}


function renderCompositionEmptyState() {
  return `
    <div class="poke5e-encounter-planner__composition-empty">

      <i
        class="poke5e-icon-pokeball"
        aria-hidden="true"
      ></i>

      <strong>
        Aún no hay Pokémon en el encuentro
      </strong>

      <span>
        Usa el buscador o la pestaña Generador para crear la composición.
      </span>

    </div>
  `;
}

function renderEncounterCard(
  row,
  encounterType,
  trainers = [],
  compositionView = "cards"
) {
  const compact =
    normalizeEncounterCompositionView(
      compositionView
    ) ===
      "compact";


  const minimumLevel =
    getPokemonMinimumLevel(
      row.pokemon
    );


  const trainerName =
    encounterType ===
      "trainer"
      ? resolveTrainerName(
          trainers,
          row.trainerId
        )
      : "";


  const lockTitle =
    row.locked ===
      true
      ? (
          encounterType ===
            "trainer"
            ? "Desbloquear para el próximo reroll de este Entrenador"
            : "Desbloquear para el próximo reroll"
        )
      : (
          encounterType ===
            "trainer"
            ? "Conservar en el próximo reroll de este Entrenador"
            : "Conservar en el próximo reroll"
        );


  return `
    <article
      class="poke5e-encounter-planner__encounter-card${
        row.locked ===
          true
          ? " is-locked"
          : ""
      }${
        compact
          ? " is-compact"
          : ""
      }"
      data-encounter-row-id="${escapeAttribute(
        row.id
      )}"
      data-trainer-id="${escapeAttribute(
        row.trainerId ??
        ""
      )}"
    >

      <header class="poke5e-encounter-planner__encounter-card-header">

        <div class="poke5e-encounter-planner__encounter-identity">

          <span class="poke5e-encounter-planner__encounter-ball">
            <i
              class="fa-solid fa-circle-dot"
              aria-hidden="true"
            ></i>
          </span>


          <div>

            <strong>
              ${escapeHtml(row.localizedName)}
            </strong>

            <span>
              ${escapeHtml(
                String(
                  row.pokemon.id
                )
              )}
            </span>

            ${
              trainerName
                ? `
                  <span class="poke5e-encounter-planner__pokemon-trainer">

                    <i
                      class="fa-solid fa-user"
                      aria-hidden="true"
                    ></i>

                    <span data-role="row-trainer-name">
                      ${escapeHtml(trainerName)}
                    </span>

                  </span>
                `
                : ""
            }

          </div>

        </div>


        <div class="poke5e-encounter-planner__encounter-badges">
          ${renderTypeChips(
            row.pokemon.types
          )}

          <span class="poke5e-encounter-planner__sr">
            ${escapeHtml(
              formatSr(
                row.pokemon.sr
              )
            )}
          </span>

        </div>


        <div class="poke5e-encounter-planner__encounter-actions">

          <button
            type="button"
            class="poke5e-encounter-planner__random-lock${
              row.locked ===
                true
                ? " is-locked"
                : ""
            }"
            data-action="toggle-random-lock"
            data-row-id="${escapeAttribute(row.id)}"
            data-trainer-id="${escapeAttribute(
              row.trainerId ??
              ""
            )}"
            title="${escapeAttribute(lockTitle)}"
            aria-label="${escapeAttribute(lockTitle)}"
            aria-pressed="${
              row.locked ===
                true
                ? "true"
                : "false"
            }"
          >

            <i
              class="${
                row.locked ===
                  true
                  ? "fa-solid fa-lock"
                  : "fa-solid fa-lock-open"
              }"
              aria-hidden="true"
            ></i>

          </button>


          <button
            type="button"
            data-action="remove-pokemon"
            data-row-id="${escapeAttribute(row.id)}"
            title="Quitar del encuentro"
            aria-label="Quitar del encuentro"
          >

            <i
              class="fa-solid fa-trash"
              aria-hidden="true"
            ></i>

          </button>

        </div>

      </header>


      <div class="poke5e-encounter-planner__encounter-stats">

        <label class="poke5e-encounter-planner__encounter-field">
          <span>Nivel</span>

          <input
            type="number"
            data-role="encounter-level"
            data-row-id="${escapeAttribute(row.id)}"
            min="${minimumLevel}"
            max="20"
            step="1"
            value="${row.level}"
          >
        </label>


        <label class="poke5e-encounter-planner__encounter-field">
          <span>Cantidad</span>

          <input
            type="number"
            data-role="encounter-quantity"
            data-row-id="${escapeAttribute(row.id)}"
            min="1"
            max="999"
            step="1"
            value="${row.quantity}"
          >
        </label>


        <div class="poke5e-encounter-planner__encounter-metric">
          <span>EXP derrota</span>

          <strong
            class="poke5e-encounter-planner__xp"
            data-role="row-xp-defeated"
          >
            ${formatNumber(row.xp.defeated)}
          </strong>
        </div>


        <div class="poke5e-encounter-planner__encounter-metric">
          <span>EXP captura</span>

          <strong
            class="poke5e-encounter-planner__xp"
            data-role="row-xp-captured"
          >
            ${formatNumber(
              encounterType ===
                "trainer"
                ? 0
                : row.xp.captured
            )}
          </strong>
        </div>


        <label class="poke5e-encounter-planner__encounter-field">
          <span>Derrotados</span>

          <input
            type="number"
            data-role="encounter-defeated"
            data-row-id="${escapeAttribute(row.id)}"
            min="0"
            max="${row.quantity}"
            step="1"
            value="${row.defeated}"
          >
        </label>


        <label class="poke5e-encounter-planner__encounter-field">
          <span>Capturados</span>

          <input
            type="number"
            data-role="encounter-captured"
            data-row-id="${escapeAttribute(row.id)}"
            min="0"
            max="${Math.max(
              0,
              row.quantity -
                row.defeated
            )}"
            step="1"
            value="${row.captured}"
            ${
              encounterType ===
                "trainer"
                ? " disabled"
                : ""
            }
          >
        </label>


        <div
          class="
            poke5e-encounter-planner__encounter-metric
            poke5e-encounter-planner__encounter-metric--earned
          "
        >
          <span>EXP obtenida</span>

          <strong
            class="poke5e-encounter-planner__earned"
            data-role="row-earned-xp"
          >
            ${formatNumber(row.earnedXp)}
          </strong>
        </div>

      </div>


      <div class="poke5e-encounter-planner__encounter-details">

        <div class="poke5e-encounter-planner__encounter-detail">

          <span>
            <i
              class="fa-solid fa-wand-magic-sparkles"
              aria-hidden="true"
            ></i>

            Habilidad
          </span>

          <strong>
            ${
              row.abilityName
                ? escapeHtml(
                    row.abilityName
                  )
                : "Se genera al crear"
            }
          </strong>

          ${
            row.abilityHidden
              ? `
                <small>
                  Habilidad oculta
                </small>
              `
              : ""
          }

        </div>


        <div class="poke5e-encounter-planner__encounter-detail">

          <span>
            <i
              class="fa-solid fa-box-archive"
              aria-hidden="true"
            ></i>

            Objeto
          </span>

          <strong>
            ${
              row.itemResolved ===
                true
                ? (
                    row.itemName ||
                    "Sin objeto"
                  )
                : "Se genera al crear"
            }
          </strong>

          ${
            row.itemResolved ===
              true &&
            row.itemName &&
            row.itemTypeLabel
              ? `
                <small>
                  ${escapeHtml(
                    row.itemTypeLabel
                  )}
                </small>
              `
              : ""
          }

        </div>


        <div
          class="
            poke5e-encounter-planner__encounter-detail
            poke5e-encounter-planner__encounter-detail--moves
          "
        >

          <span>
            <i
              class="fa-solid fa-bolt"
              aria-hidden="true"
            ></i>

            Moves
          </span>

          <strong>
            ${
              row.moveNames.length
                ? escapeHtml(
                    row.moveNames.join(
                      " · "
                    )
                  )
                : "Se generan al crear"
            }
          </strong>

        </div>

      </div>

    </article>
  `;
}

function resolveTrainerName(
  trainers,
  trainerId
) {
  const id =
    String(
      trainerId ??
      ""
    );


  if (!id) {
    return "";
  }


  const trainer =
    (
      trainers ??
      []
    ).find(
      entry =>
        entry.id ===
          id
    );


  return String(
    trainer?.name ??
    ""
  ).trim();
}

function isPokemonHiddenAbility(
  pokemon,
  abilityId
) {
  const id =
    normalizeOptionalCanonicalId(
      abilityId
    );


  if (!id) {
    return false;
  }


  return (
    pokemon?.abilities ??
    []
  ).some(
    ability =>
      normalizeOptionalCanonicalId(
        ability?.id
      ) ===
        id &&

      ability?.hidden ===
        true
  );
}

function resolveAbilityName(
  abilityId,
  abilities,
  language
) {
  const id =
    normalizeOptionalCanonicalId(
      abilityId
    );


  if (!id) {
    return "";
  }


  const ability =
    (
      abilities ??
      []
    ).find(
      entry =>
        String(
          entry?.id ??
          ""
        )
          .trim()
          .toLowerCase() ===
          id
    );


  return ability
    ? localized(
        ability.name,
        language,
        ability.id
      )
    : id;
}

function resolveItemName(
  itemId,
  items,
  language
) {

  const item =
    findEncounterItem(
      itemId,
      items
    );


  if (!item) {

    return "";
  }


  return localized(
    item.name,
    language,
    item.id
  );
}


function resolveItemTypeLabel(
  itemId,
  items,
  language
) {

  const item =
    findEncounterItem(
      itemId,
      items
    );


  const labels = {

    es: {
      berry:
        "Baya",

      medicine:
        "Medicina",

      pokeball:
        "Poké Ball",

      "held-item":
        "Objeto equipado"
    },


    en: {
      berry:
        "Berry",

      medicine:
        "Medicine",

      pokeball:
        "Poké Ball",

      "held-item":
        "Held Item"
    }
  };


  return item

    ? labels[
        language ===
          "en"

          ? "en"

          : "es"
      ][
        item.type
      ] ??
      String(
        item.type ??
        ""
      )

    : "";
}


function findEncounterItem(
  itemId,
  items
) {

  const id =
    normalizeOptionalCanonicalId(
      itemId
    );


  if (!id) {

    return null;
  }


  return (
    items ??
    []
  ).find(
    item =>
      normalizeOptionalCanonicalId(
        item?.id
      ) ===
        id
  ) ??
  null;
}

function resolveMoveNames(
  moveIds,
  moves,
  language
) {
  if (
    !Array.isArray(
      moveIds
    ) ||
    !moveIds.length
  ) {
    return [];
  }


  const moveIndex =
    new Map(
      (
        moves ??
        []
      )
        .filter(
          move =>
            move?.id
        )
        .map(
          move => [
            String(
              move.id
            ),
            move
          ]
        )
    );


  return moveIds
    .map(
      moveId =>
        moveIndex.get(
          String(
            moveId
          )
        )
    )
    .filter(Boolean)
    .map(
      move =>
        localized(
          move.name,
          language,
          move.id
        )
    );
}

function filterPokemon(
  pokemon,
  query,
  language
) {
  const normalizedQuery =
    normalizeSearch(
      query
    );


  if (
    !normalizedQuery
  ) {
    return [];
  }


  return (
    pokemon ??
    []
  ).filter(
    entry => {

      const values = [
        entry.id,

        entry.dexNumber,

        localized(
          entry.name,
          language,
          ""
        ),

        localized(
          entry.name,
          language === "es"
            ? "en"
            : "es",
          ""
        )
      ].map(
        normalizeSearch
      );


      return values.some(
        value =>
          value.includes(
            normalizedQuery
          )
      );
    }
  );
}


function findPokemon(
  pokemon,
  pokemonId
) {
  const id =
    String(
      pokemonId ??
      ""
    );


  return (
    pokemon ??
    []
  ).find(
    entry =>
      String(
        entry?.id
      ) ===
      id
  ) ??
  null;
}


function getPokemonMinimumLevel(
  pokemon
) {
  const numeric =
    Number(
      pokemon?.minimumLevel
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return 1;
  }


  return Math.min(
    20,

    Math.max(
      1,
      Math.trunc(
        numeric
      )
    )
  );
}


function clampPokemonLevel(
  pokemon,
  value
) {
  const minimum =
    getPokemonMinimumLevel(
      pokemon
    );


  return clampInteger(
    value,
    minimum,
    20,
    minimum
  );
}


function getWorldLanguage() {
  try {
    return (
      game.settings.get(
        MODULE_ID,
        "language"
      ) ===
      "en"
        ? "en"
        : "es"
    );

  } catch {
    return "es";
  }
}


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
    fallback
  );
}


function renderTypeChips(
  types
) {
  const normalizedTypes =
    (
      Array.isArray(
        types
      )
        ? types
        : []
    )
      .map(
        type =>
          String(
            type ??
            ""
          )
            .trim()
            .toLowerCase()
      )
      .filter(Boolean);


  if (
    !normalizedTypes.length
  ) {
    return `
      <span class="poke5e-encounter-planner__type-chips">
        <span
          class="poke5e-encounter-planner__type-chip"
          data-type="unknown"
        >
          —
        </span>
      </span>
    `;
  }


  return `
    <span class="poke5e-encounter-planner__type-chips">
      ${
        normalizedTypes
          .map(
            type => `
              <span
                class="poke5e-encounter-planner__type-chip"
                data-type="${escapeAttribute(type)}"
              >
                ${escapeHtml(type)}
              </span>
            `
          )
          .join("")
      }
    </span>
  `;
}


function formatSr(
  sr
) {
  return (
    `SR ${String(
      sr ??
      "—"
    )}`
  );
}


function formatNumber(
  value
) {
  return new Intl
    .NumberFormat(
      "es-CL"
    )
    .format(
      Number(
        value
      ) ||
      0
    );
}

function buildEncounterRowAbilityKey(
  row
) {
  return (
    `${String(
      row?.pokemonId ??
      ""
    )}@${clampInteger(
      row?.level,
      1,
      20,
      1
    )}`
  );
}


function normalizeOptionalCanonicalId(
  value
) {
  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    id ||
    null
  );
}

function normalizeSearch(
  value
) {
  return String(
    value ??
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase();
}


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }


  return Math.min(
    max,

    Math.max(
      min,
      Math.trunc(
        numeric
      )
    )
  );
}


function escapeHtml(
  value
) {
  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(
  value
) {
  return escapeHtml(
    value
  );
}