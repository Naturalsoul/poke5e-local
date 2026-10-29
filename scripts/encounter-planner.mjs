import { escapeHtml } from "./html.mjs";
import { getLanguage } from "./i18n.mjs";
import { EncounterGenerationService } from "./encounter-generation-service.mjs";
import { EncounterDeletionService } from "./encounter-deletion-service.mjs";
import { EncounterQueryService } from "./encounter-query-service.mjs";
import { publishEncounterReward } from "./encounter-xp-reward.mjs";
import {
  climbToNextTier,
  previewSteps
} from "./encounter-difficulty-steps.mjs";
import { selectEncounterItem } from "./encounter-item-selector.mjs";
import {
  selectBestMoves,
  selectEncounterMoves
} from "./encounter-move-selector.mjs";
import {
  encounterShare,
  getEncounterXpRules,
  levelProgress,
  calculatePokemonEncounterXp
} from "./encounter-xp-service.mjs";
import { EncounterRandomCatalog } from "./encounter-random-catalog.mjs";
import {
  encounterDifficulty,
  getTrainerRank,
  rankLevels
} from "./encounter-difficulty.mjs";
import { generateRandomTrainerEncounter } from "./encounter-trainer-randomizer.mjs";
import {
  getTrainerArchetype,
  getTrainerArchetypeDescription,
  getTrainerArchetypeLabel,
  listTrainerArchetypeGroups,
  listTrainerArchetypes
} from "./encounter-trainer-archetypes.mjs";
import { getDefaultEncounterItemPolicy } from "./encounter-item-policy.mjs";
import { clampInteger } from "./numbers.mjs";
import {
  SEARCH_LIMIT,
  MIXED_TRAINER_ARCHETYPE_ID,
  buildEncounterDefinition,
  buildSavedEncounterLocations,
  calculateEncounterTotals,
  canGenerateRandomEncounter,
  canGenerateRandomTrainerEncounter,
  clampPokemonLevel,
  countLockedSpecies,
  countRandomCandidates,
  countTrainerRandomCandidates,
  countTrainerRowQuantity,
  detectPartyOrDefault,
  filterPokemon,
  filterSavedEncountersByLocation,
  filterTrainerMixedArchetypeOptions,
  findPokemon,
  getDefaultMixedTrainerArchetypeIds,
  getDefaultWildRandomBiome,
  getLockedPokemonIds,
  getPlannerItemPolicy,
  getPokemonMinimumLevel,
  getTrainerRerollUiState,
  getWildRandomBiomeOptions,
  getWildRandomRegionOptions,
  normalizeEncounterCompositionView,
  normalizeEncounterStudioTab,
  normalizeOptionalCanonicalId,
  normalizeOptionalNumberInput,
  normalizeSavedEncounterLocation,
  normalizeTrainerTeamSize,
  optionalNumber,
  prepareEncounterRow,
  resolveTrainerRandomArchetypes,
  validateTrainerState
} from "./encounter-planner-data.mjs";
import {
  buildCompositionSummary,
  formatNumber,
  renderRandomSelectOptions,
  renderSavedEncounterOptions,
  renderSearchResultsMarkup,
  renderStepPanel,
  renderPlannerContent
} from "./encounter-planner-markup.mjs";
import {
  capturePlannerUiState,
  restorePlannerUiState
} from "./encounter-planner-ui-state.mjs";
import {
  buildGenerationOptions,
  buildTrainerRoster,
  plannerBoosts,
  rerollTrainerTeamRows,
  rollTrainerEncounter,
  rollWildEncounterRows,
  trainerCandidatePool,
  trainerTeamLevels
} from "./encounter-planner-generation.mjs";

const MODULE_ID =
  "poke5e-local";

const {
  ApplicationV2
} =
  foundry.applications.api;

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
      getLanguage();

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
    const state =
      this._encounterState;

    const trainerEncounter =
      state.type === "trainer";

    const itemPolicy =
      getPlannerItemPolicy(state);

    state.activeTab =
      normalizeEncounterStudioTab(state.activeTab, trainerEncounter);

    state.compositionView =
      normalizeEncounterCompositionView(state.compositionView);

    return renderPlannerContent(state, context, {
      itemPolicy,
      party: this.#party(),
      boosts: this.#boosts(),
      routeSummary: this.#routeSummary(context.savedEncountersForLocation),
      stepPanel: trainerEncounter ? this.#stepPanel() : "",
      difficulty: this.#describeDifficulty(context.rows),
      progress: this.#describeProgress(context.rows)
    });
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

    this.#bindStudioViewListeners(root);

    this.#bindSavedEncounterListeners(root, context);

    this.#bindIdentityListeners(root);

    this.#bindWildRandomListeners(root);

    this.#bindPartyListeners(root);

    this.#bindTrainerRandomListeners(root);

    this.#bindTrainerListeners(root);

    this.#bindPokemonRowListeners(root);

    this.#bindGenerationOptionListeners(root);

    this.#bindActionListeners(root);

    restorePlannerUiState(
      this.renderUiState
    );

    this.renderUiState =
      null;
  }

  #bindStudioViewListeners(root) {
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
  }

  #bindSavedEncounterListeners(root, context) {
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
  }

  #bindIdentityListeners(root) {
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
  }

  #bindWildRandomListeners(root) {
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
  }

  // Party size, level and team, the rivals' boosts and the Detect party buttons.
  #bindPartyListeners(root) {
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
  }

  #bindTrainerRandomListeners(root) {
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
  }

  #bindTrainerListeners(root) {
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
  }

  // Search, add, edit, remove and lock rows; row inputs are delegated from root so re-rendered rows keep working.
  #bindPokemonRowListeners(root) {
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
  }

  #bindGenerationOptionListeners(root) {
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
  }

  // Difficulty steps, the XP reward and creating the encounter.
  #bindActionListeners(root) {
    for (
      const button
      of root.querySelectorAll(
        '[data-action="apply-step"]'
      )
    ) {
      button.addEventListener(
        "click",

        () => {
          void this
            .#applyStep(
              button.dataset.step
            );
        }
      );
    }

    root.querySelector(
      '[data-action="undo-step"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#undoStep();
      }
    );

    root.querySelector(
      '[data-action="publish-reward"]'
    )?.addEventListener(
      "click",

      () => {
        void this
          .#publishReward();
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
          getLanguage()
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


    this._encounterState.rows.push({
      id:
        this.#nextRowId(),

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

    this._encounterState.stepHistory =
      [];

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
                return {
                  id:
                    this.#nextRowId(),

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
          return {
            id:
              this.#nextRowId(),

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
        getLanguage(),
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
    getLanguage();


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
    return trainerCandidatePool(this._encounterState, maxLevel);
  }

  #boosts() {
    return plannerBoosts(this._encounterState);
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
              ? encounter.boosts ??
                {}
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
   * What each Pokémon's XP needs from the whole encounter: null for poke5e's rule as written, the party's level with
   * level scaling.
   */
  #xpContext() {
    const rules =
      getEncounterXpRules();

    if (!rules.scaling) {
      return null;
    }

    return {
      ...rules,
      partyLevel:
        this.#party().level
    };
  }

  /*
   * The selected location's saved encounters, as a route: how many are mandatory and optional, and what each kind
   * gives the players' strongest Pokémon (if it fights all of them, with the party's participants).
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
                  getLanguage(),
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
              this.#xpContext()
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
        title="Lo que gana ${escapeHtml(party.strongest.name)} (Nv. ${party.strongest.level}) si combate en todos, con ${party.participants} Pokémon que participan."
      >
        <i class="fa-solid fa-route" aria-hidden="true"></i>
        ${totals.mandatory.count} obligatorio(s): +${percent(totals.mandatory.xp)} ·
        ${totals.optional.count} opcional(es): +${percent(totals.optional.xp)} ·
        con todos, Nv. ${end.level} (${Math.round(end.progress * 100)} %)
      </p>`;
  }

  // One trainer of an archetype, with this many Pokémon between these levels (null if none fits).
  #generateTrainer(
    archetypeId,
    pokemonPerTrainer,
    minLevel,
    maxLevel
  ) {
    try {
      return generateRandomTrainerEncounter({
        candidates:
          this.randomCatalog
            .trainerCandidates(
              this.#trainerPool(
                maxLevel
              )
            ),
        trainerCount:
          1,
        pokemonPerTrainer:
          String(
            pokemonPerTrainer
          ),
        minLevel,
        maxLevel,
        archetypeId:
          archetypeId ??
          "generic"
      })[0] ??
      null;
    } catch {
      return null;
    }
  }

  #newTrainerRow(
    trainerId,
    pokemon
  ) {
    return {
      id:
        this.#nextRowId(),
      trainerId,
      ...pokemon,
      abilityId:
        null,
      itemId:
        null,
      itemResolved:
        false
    };
  }

  // A row's Moves with these extras: the best moveset (TMs if allowed), or the usual pick; a covering Move either way.
  #pickMoves(
    row,
    boosts
  ) {
    const pokemon =
      this.database.pokemon.find(
        each =>
          each.id ===
            row.pokemonId
      );

    if (!pokemon) {
      return row.moveIds;
    }

    const coverageTypes =
      boosts.coverage
        ? this._encounterState
            .partyWeakTo ??
          []
        : [];

    return (
      boosts.bestMoves
        ? selectBestMoves
        : selectEncounterMoves
    )({
      pokemon,
      moves:
        this.database.moves,
      level:
        row.level,
      coverageTypes,
      sources: {
        tm:
          boosts.tmMoves
      }
    }).map(
      move =>
        move.id
    );
  }

  // What the steps need: new Pokémon and trainers of an archetype, and how high levels may go.
  #stepTools() {
    const party =
      this.#party();

    return {
      maxAceLevel:
        Math.min(
          20,
          party.level +
            3
        ),

      pickMoves: (
        row,
        boosts
      ) =>
        this.#pickMoves(
          row,
          boosts
        ),

      rollItem: () =>
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
              0,
            pokeball:
              0
          }
        })?.id ??
        null,

      maxLevel:
        Math.min(
          20,
          party.level +
            2
        ),

      // shortcut: a Gym Leader's new Pokémon follows its archetype, not its single type; pick by type if it matters.
      addPokemon: (
        trainer,
        team
      ) => {
        const lowest =
          Math.min(
            ...team.map(
              row =>
                row.level
            )
          );

        const generated =
          this.#generateTrainer(
            trainer.archetypeId,
            1,
            lowest,
            lowest + 1
          );

        return generated?.pokemon[0]
          ? this.#newTrainerRow(
              trainer.id,
              generated.pokemon[0]
            )
          : null;
      },

      addTrainer: main => {
        const levels =
          rankLevels(
            party.level,
            getTrainerRank(
              "route"
            )
          );

        const generated =
          this.#generateTrainer(
            main.archetypeId,
            2,
            levels.min,
            levels.max
          );

        if (!generated?.pokemon.length) {
          return null;
        }

        const id =
          this.#allocateTrainerId();

        const archetype =
          getTrainerArchetype(
            main.archetypeId
          );

        return {
          trainer: {
            id,
            name:
              `${getTrainerArchetypeLabel(archetype, getLanguage())} (apoyo)`,
            archetypeId:
              archetype.id,
            teamSize:
              "auto",
            onField:
              1
          },
          rows:
            generated.pokemon.map(
              pokemon =>
                this.#newTrainerRow(
                  id,
                  pokemon
                )
            )
        };
      }
    };
  }

  #measureStep(
    state
  ) {
    return this.#difficulty(
      state.rows.map(
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
      {
        trainerBattle:
          true,
        boosts:
          state.boosts,
        onField:
          Math.max(
            1,
            state.trainers.reduce(
              (
                total,
                trainer
              ) =>
                total +
                Math.min(
                  trainer.onField ??
                    1,
                  countTrainerRowQuantity(
                    state.rows.filter(
                      row =>
                        row.trainerId ===
                          trainer.id
                    )
                  )
                ),
              0
            )
          )
      }
    );
  }

  // The current encounter and each step's outcome; kept, so a step applies exactly what it previewed.
  #stepPanel() {
    if (
      this._encounterState.type !==
        "trainer" ||
      !this._encounterState.trainers.length ||
      !this._encounterState.rows.length
    ) {
      this._stepPreviews =
        [];

      return renderStepPanel({
        current:
          null
      });
    }

    const state = {
      trainers:
        this._encounterState.trainers,
      rows:
        this._encounterState.rows,
      boosts:
        this.#boosts()
    };

    const current =
      this.#measureStep(
        state
      );

    const measure = next =>
      this.#measureStep(
        next
      );

    this._stepPreviews =
      previewSteps(
        state,
        this.#stepTools(),
        measure
      );

    this._stepClimb =
      climbToNextTier(
        state,
        this.#stepTools(),
        measure
      );

    return renderStepPanel({
      current,
      previews:
        this._stepPreviews,
      climb:
        this._stepClimb,
      canUndo:
        Boolean(
          this._encounterState
            .stepHistory
            ?.length
        )
    });
  }

  #setStepState(
    state
  ) {
    this._encounterState.trainers =
      state.trainers;

    this._encounterState.rows =
      state.rows;

    this._encounterState.boostStats =
      state.boosts.statBonus;

    this._encounterState.boostCoverage =
      state.boosts.coverage;

    this._encounterState.boostItems =
      state.boosts.items;

    this._encounterState.boostBestMoves =
      state.boosts.bestMoves;

    this._encounterState.boostTmMoves =
      state.boosts.tmMoves;
  }

  async #applyStep(
    stepId
  ) {
    const preview =
      stepId ===
        "next"
        ? this._stepClimb
        : (
            this._stepPreviews ??
            []
          ).find(
            each =>
              each.step.id ===
                stepId
          );

    if (!preview?.state) {
      return;
    }

    this._encounterState.stepHistory = [
      ...(
        this._encounterState
          .stepHistory ??
        []
      ),
      structuredClone({
        trainers:
          this._encounterState.trainers,
        rows:
          this._encounterState.rows,
        boosts:
          this.#boosts()
      })
    ];

    this.#setStepState(
      preview.state
    );

    await this.render();
  }

  async #undoStep() {
    const history =
      this._encounterState
        .stepHistory ??
      [];

    if (!history.length) {
      return;
    }

    this.#setStepState(
      history.at(
        -1
      )
    );

    this._encounterState.stepHistory =
      history.slice(
        0,
        -1
      );

    await this.render();
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


  async #publishReward() {
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

    await publishEncounterReward({
      rows:
        this.#xpRows(
          rows
        ),
      context:
        this.#xpContext(),
      name:
        this._encounterState.name.trim() ||
        "Encuentro"
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

    // Its own share: an even split.
    const gained =
      encounterShare(
        this.#xpRows(
          rows
        ),
        party.strongest.level,
        party.participants,
        {
          context
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
          getLanguage()
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

  #nextRowId() {
    this.rowSequence += 1;
    return `row-${this.rowSequence}`;
  }

  #rerollTrainerTeam(
    trainerId
  ) {
    if (this._encounterState.type !== "trainer") {
      return;
    }

    const trainer = this.#getTrainer(trainerId);
    if (!trainer) {
      ui.notifications.warn("El Entrenador seleccionado ya no existe.");
      return;
    }

    const state = this._encounterState;
    const hasTeam = state.rows.some(row => row.trainerId === trainer.id);
    const { minLevel, maxLevel } = trainerTeamLevels(state.rows, trainer.id, hasTeam ? null : this.#party().level);

    try {
      const { generatedRows, lockedCount, rows } = rerollTrainerTeamRows({
        trainer,
        rows: state.rows,
        candidates: this.randomCatalog.trainerCandidates(this.#trainerPool(maxLevel)),
        minLevel,
        maxLevel,
        nextRowId: () => this.#nextRowId()
      });

      if (!generatedRows.length) {
        ui.notifications.info(`El equipo de "${trainer.name}" no tiene cupos sin bloquear para regenerar.`);
        return;
      }

      state.rows = rows;
      ui.notifications.info(
        `Equipo de "${trainer.name}": ${generatedRows.length} Pokémon regenerado(s)` +
        (lockedCount ? ` · ${lockedCount} bloqueado(s).` : ".")
      );
      void this.render({ force: true });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error regenerando equipo de Entrenador`, error);
      ui.notifications.warn(
        error instanceof Error ? error.message : "No se pudo regenerar el equipo del Entrenador."
      );
    }
  }

  #generateRandomTrainerEncounter() {
    if (this._encounterState.type !== "trainer") {
      ui.notifications.warn(
        "La generación aleatoria de Entrenadores solo está disponible en encuentros de Entrenador."
      );
      return;
    }

    const state = this._encounterState;
    const party = this.#party();
    const rank = getTrainerRank(state.trainerRandomRank);
    const levels = rankLevels(party.level, rank);

    try {
      const { generatedTrainers, missedTarget } = rollTrainerEncounter({
        state,
        party,
        rank,
        levels,
        boosts: this.#boosts(),
        candidates: this.randomCatalog.trainerCandidates(this.#trainerPool(levels.max)),
        pokemonTypes: pokemonId => this.#pokemonTypes(pokemonId)
      });

      if (missedTarget) {
        ui.notifications.warn(
          `${rank.label} apunta a ${missedTarget.wanted} y con este grupo queda ${missedTarget.reached}. ` +
          "Prueba fijar más o menos Pokémon por Entrenador o en campo."
        );
      }

      // Current ids stay reserved so a full reroll never reuses an earlier Trainer's identity.
      const reservedIds = new Set(state.trainers.map(trainer => trainer.id));
      const { trainers, rows } = buildTrainerRoster({
        generatedTrainers,
        teamSize: state.trainerRandomPokemonCount,
        language: getLanguage(),
        nextTrainerId: () => {
          const id = this.#allocateTrainerId(reservedIds);
          reservedIds.add(id);
          return id;
        },
        nextRowId: () => this.#nextRowId()
      });

      state.trainers = trainers;
      state.rows = rows;
      state.stepHistory = [];
      state.selectedTrainerId = trainers[0]?.id ?? "";
      state.search = "";
      ui.notifications.info(`Encuentro aleatorio: ${trainers.length} Entrenador(es), ${rows.length} Pokémon.`);
      void this.render({ force: true });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error generando Entrenadores aleatorios`, error);
      ui.notifications.warn(
        error instanceof Error ? error.message : "No se pudo generar el encuentro aleatorio de Entrenadores."
      );
    }
  }

  #generateRandomEncounter() {
    if (this._encounterState.type !== "wild") {
      ui.notifications.warn("La generación aleatoria está disponible solo para encuentros salvajes.");
      return;
    }

    const state = this._encounterState;
    const minLevel = clampInteger(state.randomMinLevel, 1, 20, 1);
    const maxLevel = clampInteger(state.randomMaxLevel, 1, 20, 5);
    if (minLevel > maxLevel) {
      ui.notifications.warn("El nivel mínimo no puede ser mayor que el nivel máximo.");
      return;
    }

    try {
      const rows = rollWildEncounterRows({
        state,
        candidates: this.randomCatalog.candidates({
          region: state.randomRegion,
          biome: state.randomBiome,
          maxLevel,
          minSr: state.randomMinSr,
          maxSr: state.randomMaxSr
        }),
        party: this.#party(),
        minLevel,
        maxLevel,
        nextRowId: () => this.#nextRowId()
      });

      state.rows = rows;
      state.search = "";
      const total = rows.reduce((sum, row) => sum + row.quantity, 0);
      ui.notifications.info(`Encuentro aleatorio: ${rows.length} especie(s), ${total} Pokémon.`);
      void this.render({ force: true });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error generando encuentro aleatorio`, error);
      ui.notifications.warn(
        error instanceof Error ? error.message : "No se pudo generar el encuentro aleatorio."
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
          getLanguage()
        );


      const result =
        await service.generate(
          definition,
          buildGenerationOptions(this._encounterState)
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
