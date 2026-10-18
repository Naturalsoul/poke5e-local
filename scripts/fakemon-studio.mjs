import {
  importPokemon,
  loadDatabase
} from "./importer.mjs";

import {
  normalizeFakemonOptions,
  normalizeFakemonSpecies
} from "./fakemon-model.mjs";

import {
  fakemonRepository
} from "./fakemon-repository.mjs";

import {
  FakemonEvolutionEditor
} from "./fakemon-evolution-editor.mjs";

import {
  bindFakemonMediaEditor,
  renderFakemonMediaEditor
} from "./fakemon-media-editor.mjs";

import {
  bindFakemonIdentityUi,
  renderFakemonEditorIdentity,
  renderFakemonSpeciesThumbnail
} from "./fakemon-identity-ui.mjs";

import {
  renderFakemonProficiencies,
  renderFakemonSenseRow,
  renderFakemonSpeedRow,
  renderFakemonStatsDatalists
} from "./fakemon-stats-editor.mjs";

import {
  bindFakemonReferenceUi
} from "./fakemon-reference-ui.mjs";

import {
  bindFakemonInlineValidationUi
} from "./fakemon-inline-validation-ui.mjs";

import {
  bindFakemonAbilityDrop,
  renderFakemonAbilityEditor
} from "./fakemon-moves-abilities-ui.mjs";

import {
  bindFakemonMoveDrops,
  renderFakemonEggMoveEditor,
  renderFakemonLevelMoveEditor,
  renderFakemonTmEditor
} from "./fakemon-move-editor-ui.mjs";

import {
  createFakemonDraftFromOfficial,
  getOfficialTemplateSpecies
} from "./fakemon-template-service.mjs";

import {
  runFakemonDesignWizard
} from "./fakemon-wizard.mjs";

import {
  applyFakemonWizardRecommendation
} from "./fakemon-wizard-draft-service.mjs";

import {
  preflightFakemonBackup,
  readFakemonBackupFile,
  saveFakemonBackup
} from "./fakemon-backup-service.mjs";

import {
  validateFakemonEvolutionDefinition
} from "./fakemon-evolution-service.mjs";

import {
  POKEMON_TYPES,
  POKEMON_TYPE_IDS
} from "./types.mjs";

const MODULE_ID =
  "poke5e-local";

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

const SIZE_OPTIONS = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan"
];

const STUDIO_TABS = new Set([
  "general",
  "stats",
  "moves",
  "evolution",
  "media"
]);

const {
  ApplicationV2,
  DialogV2
} =
  foundry.applications.api;

let studioApp =
  null;


/* ============================================================
 * APPLICATION
 * ============================================================ */

export class FakemonStudio
  extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id:
      "poke5e-fakemon-studio",

    classes: [
      "poke5e-fakemon-studio"
    ],

    tagName:
      "div",

    position: {
      width:
        1220,

      height:
        760
    },

    window: {
      frame:
        true,

      positioned:
        true,

      resizable:
        true,

      title:
        "Fakemon Studio",

      icon:
        "poke5e-icon-pokedex-window"
    }
  };


  constructor(
    options = {}
  ) {
    super(
      options
    );

    this._studioState = {
      search:
        "",

      activeTab:
        "general",

      selectedId:
        null,

      originalId:
        null,

      draft:
        null,

      options:
        normalizeFakemonOptions(),

      validation:
        null,

      dirty:
        false,

      pendingEvolution:
        null,

      busy:
        false
    };

    this.database =
      null;

    this.evolutionEditor =
      new FakemonEvolutionEditor();

    this._pendingScrollState =
      null;

    this._resetWorkspaceScrollOnNextRender =
      false;
  }

  async close(
    options = {}
  ) {

    if (
      !await this.#confirmDiscardWork()
    ) {
      return this;
    }


    return super.close(
      options
    );
  }

  async _prepareContext() {

    await fakemonRepository.load();

    this.database =
      await loadDatabase();


    const species =
      fakemonRepository.species
        .sort(
          compareSpecies
        );


    return {
      species,

      totalCount:
        species.length,

      visibleCount:
        species.length,

      language:
        currentLanguage(),

      moves:
        this.database.moves ??
        [],

      abilities:
        this.database.abilities ??
        []
    };
  }


  async _renderHTML(
    context
  ) {

    const listMarkup =
      renderSpeciesList(
        context.species,
        this._studioState
          .selectedId,
        context.language
      );

    const evolutionMarkup =
      this._studioState.draft

        ? this.evolutionEditor.render({
            database:
              this.database,

            speciesId:
              this._studioState
                .originalId,

            language:
              context.language
          })

        : "";

    const editorMarkup =
      this._studioState.draft

        ? renderEditor({
            draft:
              this._studioState.draft,

            options:
              this._studioState.options,

            originalId:
              this._studioState.originalId,

            validation:
              this._studioState.validation,

            activeTab:
              this._studioState.activeTab,

            language:
              context.language,

            moves:
              context.moves,

            abilities:
              context.abilities,

            evolutionMarkup,

            dirty:
              this._studioState.dirty,

            busy:
              this._studioState.busy
          })

        : renderEmptyEditor();


    return `
      <section class="fakemon-studio__content">

        <aside class="fakemon-studio__sidebar">

          <header class="fakemon-studio__hero">

            <div>
              <small>
                Custom Species
              </small>

              <h2>
                Fakemon Studio
              </h2>
            </div>


            <div class="fakemon-studio__hero-actions">
              <button
                type="button"
                data-action="new-from-official"
                ${
                  this._studioState.busy
                    ? "disabled"
                    : ""
                }
              >
                <i class="fa-regular fa-clone"></i>
                Desde Pokémon
              </button>


              <button
                type="button"
                data-action="new-species"
                ${
                  this._studioState.busy
                    ? "disabled"
                    : ""
                }
              >
                <i class="fa-solid fa-plus"></i>
                Nuevo
              </button>

              <button
                type="button"
                class="fakemon-studio__wizard-launch"
                data-action="new-from-wizard"
                ${
                  this._studioState.busy
                    ? "disabled"
                    : ""
                }
              >
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                Wizard guiado
              </button>

            </div>

          </header>


          <div class="fakemon-studio__search">

            <i class="fa-solid fa-magnifying-glass"></i>

            <input
              type="search"
              data-role="species-search"
              placeholder="Buscar Fakemon..."
              value="${escapeAttribute(
                this._studioState.search
              )}"
            >

          </div>


          <div class="fakemon-studio__counter">
            ${context.visibleCount}/${context.totalCount} especies
          </div>

          <div class="fakemon-studio__backup-actions">
            <button
              type="button"
              data-action="export-backup"
              title="Exportar backup JSON"
              ${
                this._studioState.busy
                  ? "disabled"
                  : ""
              }
            >
              <i class="fa-solid fa-download"></i>
              Exportar
            </button>


            <button
              type="button"
              data-action="restore-backup"
              title="Restaurar backup JSON"
              ${
                this._studioState.busy
                  ? "disabled"
                  : ""
              }
            >
              <i class="fa-solid fa-upload"></i>
              Restaurar
            </button>

          </div>


          <div class="fakemon-studio__species-list">

            ${
              listMarkup ||
              `
                <div class="fakemon-studio__empty-list">

                  <i class="fa-solid fa-dna"></i>

                  <span>
                    No hay Fakemon guardados.
                  </span>

                </div>
              `
            }

          </div>

        </aside>


        <main class="fakemon-studio__workspace">

          ${editorMarkup}

        </main>

      </section>
    `;
  }


  _replaceHTML(
    result,
    content
  ) {

    this._pendingScrollState =
      captureStudioScrollState(
        content
      );


    if (
      this._resetWorkspaceScrollOnNextRender &&
      this._pendingScrollState
    ) {

      this._pendingScrollState.workspaceTop =
        0;
    }


    this._resetWorkspaceScrollOnNextRender =
      false;


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


    root
      .querySelector(
        '[data-role="species-search"]'
      )
      ?.addEventListener(
        "input",
        event => {

          this._studioState.search =
            event.currentTarget.value;

          this.#applySearchFilter(
            root
          );
        }
      );

    root
      .querySelectorAll(
        '[data-action="switch-tab"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const tab =
                String(
                  button.dataset.tab ??
                  ""
                );


              if (
                !STUDIO_TABS.has(
                  tab
                ) ||
                tab ===
                  this._studioState.activeTab
              ) {
                return;
              }


              this.#activateTab(
                root,
                tab
              );
            }
          );
        }
      );

    root
      .querySelector(
        '[data-action="new-species"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardWork()
          ) {
            return;
          }


          this.#newSpecies();
        }
      );

    root
      .querySelector(
        '[data-action="new-from-official"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardWork()
          ) {
            return;
          }


          await this.#newSpeciesFromOfficial();
        }
      );

    root
      .querySelector(
        '[data-action="new-from-wizard"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#newSpeciesFromWizard();
        }
      );

    root
      .querySelector(
        '[data-action="export-backup"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#exportBackup();
        }
      );

    root
      .querySelector(
        '[data-action="restore-backup"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#restoreBackup();
        }
      );

    root
      .querySelectorAll(
        '[data-action="edit-species"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              if (
                !await this.#confirmDiscardWork()
              ) {
                return;
              }


              this.#editSpecies(
                button.dataset
                  .speciesId
              );
            }
          );
        }
      );


    root
      .querySelectorAll(
        '[data-action="duplicate-species"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              if (
                !await this.#confirmDiscardWork()
              ) {
                return;
              }


              this.#duplicateSpecies(
                button.dataset
                  .speciesId
              );
            }
          );
        }
      );


    root
      .querySelectorAll(
        '[data-action="delete-species"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              void this.#deleteSpecies(
                button.dataset
                  .speciesId
              );
            }
          );
        }
      );


    root
      .querySelector(
        '[data-action="cancel-edit"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardWork()
          ) {
            return;
          }


          this.#clearEditor();
        }
      );


    root
      .querySelector(
        '[data-action="validate-species"]'
      )
      ?.addEventListener(
        "click",
        () => {

          this.#validateDraft();
        }
      );


    root
      .querySelector(
        '[data-action="save-species"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#saveDraft();
        }
      );


    root
      .querySelector(
        '[data-action="import-species"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#importSpecies();
        }
      );


    this.#bindCollectionActions(
      root
    );

    bindFakemonMediaEditor(
      root
    );

    bindFakemonIdentityUi(
      root,
      {
        language:
          context.language
      }
    );

    bindFakemonReferenceUi(
      root,
      {
        moveLabels:
          catalogNameMap(
            context.moves,
            context.language
          ),

        abilityLabels:
          catalogNameMap(
            context.abilities,
            context.language
          )
      }
    );

    bindFakemonInlineValidationUi(
      root
    );

    bindFakemonAbilityDrop(
      root,
      {
        onAbilityDrop:
          ({
            sourceId
          }) => {

            this.#addDroppedAbility(
              root,
              sourceId
            );
          }
      }
    );

    bindFakemonMoveDrops(
      root,
      {
        onLevelMoveDrop:
          ({
            sourceId
          }) => {

            this.#addDroppedLevelMove(
              root,
              sourceId
            );
          },

        onEggMoveDrop:
          ({
            sourceId
          }) => {

            this.#addDroppedEggMove(
              root,
              sourceId
            );
          },

        onTmDrop:
          ({
            sourceId
          }) => {

            this.#addDroppedTm(
              root,
              sourceId
            );
          }
      }
    );

    this.#bindSpeciesDirtyTracking(
      root
    );

    this.evolutionEditor.bind(
      root,
      {
        database:
          this.database,

        speciesId:
          this._studioState
            .originalId,

        requestRender:
          () => {

            /*
            * Muy importante:
            * preservamos posibles cambios aún no
            * guardados en el formulario de especie
            * antes de reconstruir la UI por una
            * operación de Evolution.
            */
            this.#captureDraft();


            void this.render({
              force:
                true
            });
          }
      }
    );

    this.#applySearchFilter(
      root
    );

    restoreStudioScrollState(
      root,
      this._pendingScrollState
    );


    this._pendingScrollState =
      null;
  }

  /* ============================================================
  * UNSAVED CHANGES
  * ============================================================ */

  #bindSpeciesDirtyTracking(
    root
  ) {

    const editor =
      root.querySelector(
        ".fakemon-studio__editor"
      );


    if (!editor) {
      return;
    }


    const markDirty =
      event => {

        const target =
          event.target;


        if (
          !(target instanceof HTMLElement) ||
          !target.matches(
            "input, select, textarea"
          ) ||
          target.closest(
            ".fakemon-studio__evolution-editor"
          )
        ) {
          return;
        }


        this.#setSpeciesDirty(
          root,
          true
        );
      };


    editor.addEventListener(
      "input",
      markDirty
    );

    editor.addEventListener(
      "change",
      markDirty
    );


    this.#syncSpeciesDirtyIndicator(
      root
    );
  }


  #setSpeciesDirty(
    root,
    dirty
  ) {

    this._studioState.dirty =
      dirty ===
        true;


    this.#syncSpeciesDirtyIndicator(
      root
    );
  }


  #syncSpeciesDirtyIndicator(
    root
  ) {

    const indicator =
      root.querySelector(
        '[data-role="species-dirty-indicator"]'
      );


    if (!indicator) {
      return;
    }


    indicator.dataset.dirty =
      String(
        this._studioState.dirty ===
          true
      );
  }


  async #confirmDiscardWork() {
    const speciesDirty =
      this._studioState.dirty ===
        true;

    const evolutionDirty =
      this.evolutionEditor
        .hasUnsavedChanges();


    if (
      !speciesDirty &&
      !evolutionDirty
    ) {
      return true;
    }


    const pending =
      [];


    if (speciesDirty) {

      pending.push(
        "la especie"
      );
    }


    if (evolutionDirty) {

      pending.push(
        "la Evolution"
      );
    }


    const confirmed =
      await DialogV2.confirm({
        window: {
          title:
            "Cambios sin guardar"
        },

        content: `
          <p>
            Hay cambios sin guardar en
            <strong>
              ${escapeHtml(
                pending.join(
                  " y "
                )
              )}
            </strong>.
          </p>

          <p>
            Si continúas, esos cambios se perderán.
          </p>
        `,

        yes: {
          label:
            "Descartar cambios"
        },

        no: {
          label:
            "Conservar"
        },

        rejectClose:
          false,

        modal:
          true
      });


    return (
      confirmed ===
        true
    );
  }


  #capturePreservedDrafts() {

    this.#captureDraft();

    this.evolutionEditor
      .captureCurrentDraft(
        this.element
      );
  }

  /* ============================================================
  * TABS
  * ============================================================ */

  #activateTab(
    root,
    tab
  ) {

    if (
      !STUDIO_TABS.has(
        tab
      )
    ) {
      return;
    }


    this._studioState.activeTab =
      tab;


    root
      .querySelectorAll(
        '[data-action="switch-tab"]'
      )
      .forEach(
        button => {

          const active =
            button.dataset.tab ===
              tab;


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
        }
      );


    root
      .querySelectorAll(
        "[data-studio-tab]"
      )
      .forEach(
        panel => {

          panel.hidden =
            panel.dataset
              .studioTab !==
            tab;
        }
      );
  }

  /* ============================================================
   * SEARCH
   * ============================================================ */

  #applySearchFilter(
    root
  ) {

    const query =
      normalizeSearch(
        this._studioState.search
      );


    let visible =
      0;


    root
      .querySelectorAll(
        ".fakemon-studio__species-card"
      )
      .forEach(
        card => {

          const matches =
            !query ||
            String(
              card.dataset.search ??
              ""
            ).includes(
              query
            );


          card.hidden =
            !matches;


          if (matches) {
            visible +=
              1;
          }
        }
      );


    const counter =
      root.querySelector(
        ".fakemon-studio__counter"
      );


    if (counter) {

      counter.textContent =
        `${visible}/${fakemonRepository.species.length} especies`;
    }
  }

  /* ============================================================
  * BACKUP / RESTORE
  * ============================================================ */

  async #exportBackup() {
    if (
      this._studioState.busy
    ) {
      return;
    }


    try {

      const result =
        await saveFakemonBackup(
          fakemonRepository
            .snapshot()
        );


      if (
        result.cancelled
      ) {
        return;
      }


      if (
        this._studioState.dirty ||
        this.evolutionEditor
          .hasUnsavedChanges()
      ) {

        ui.notifications.warn(
          "El backup contiene solo cambios ya guardados."
        );
      }


      if (
        result.mode ===
          "download"
      ) {

        ui.notifications.warn(
          "Este entorno no permite elegir manualmente la ubicación; " +
          "se usó la carpeta de descargas configurada por el navegador."
        );
      }


      ui.notifications.info(
        `Backup exportado: ${result.summary.speciesCount} especies ` +
        `y ${result.summary.evolutionCount} Evolutions. ` +
        `Archivo: ${result.filename}.`
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error exportando backup Fakemon`,
        error
      );


      ui.notifications.error(
        error.message
      );
    }
  }

  async #restoreBackup() {
    if (
      this._studioState.busy
    ) {
      return;
    }


    const file =
      await this.#promptBackupFile();


    if (!file) {
      return;
    }


    let candidateStore;
    let summary;


    try {

      const parsed =
        await readFakemonBackupFile(
          file
        );


      const preflight =
        preflightFakemonBackup({
          candidateStore:
            parsed.store,

          currentStore:
            fakemonRepository
              .snapshot(),

          database:
            this.database
        });


      candidateStore =
        preflight.store;

      summary =
        preflight.summary;

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Backup Fakemon rechazado`,
        error
      );


      ui.notifications.error(
        error.message
      );

      return;
    }


    /*
    * El archivo ya pasó el preflight.
    * Recién ahora preguntamos por posibles drafts
    * sin guardar.
    */
    if (
      !await this.#confirmDiscardWork()
    ) {
      return;
    }


    const confirmed =
      await DialogV2.confirm({
        classes: [
          "poke5e-fakemon-backup-dialog"
        ],

        window: {
          title:
            "Restaurar backup Fakemon"
        },

        content:
          renderBackupRestoreConfirmation({
            filename:
              file.name,

            summary
          }),

        yes: {
          label:
            "Reemplazar catálogo"
        },

        no: {
          label:
            "Cancelar"
        },

        rejectClose:
          false,

        modal:
          true
      });


    if (
      confirmed !==
        true
    ) {
      return;
    }


    /*
    * Guardamos un snapshot previo incluso después
    * del preflight.
    *
    * Si ocurre un fallo inesperado después de
    * persistir, podemos revertir automáticamente.
    */
    const previousStore =
      fakemonRepository
        .snapshot();


    this._studioState.busy =
      true;


    let replaced =
      false;


    try {

      await fakemonRepository
        .replaceAll(
          candidateStore
        );


      replaced =
        true;


      await fakemonRepository
        .load();


      this.database =
        await loadDatabase();


      this.#resetEditorState();


      ui.notifications.info(
        `Backup restaurado: ${summary.speciesCount} especies ` +
        `y ${summary.evolutionCount} Evolutions.`
      );

    } catch (
      error
    ) {

      if (replaced) {

        try {

          await fakemonRepository
            .replaceAll(
              previousStore
            );


          await fakemonRepository
            .load();


          this.database =
            await loadDatabase();

        } catch (
          rollbackError
        ) {

          console.error(
            `[${MODULE_ID}] Error revirtiendo restauración de backup`,
            rollbackError
          );


          ui.notifications.error(
            "La restauración falló y no fue posible revertirla automáticamente."
          );
        }
      }


      console.error(
        `[${MODULE_ID}] Error restaurando backup Fakemon`,
        error
      );


      ui.notifications.error(
        `No se pudo restaurar el backup: ${error.message}`
      );

    } finally {

      this._studioState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }

  async #promptBackupFile() {
    return DialogV2.prompt({
      classes: [
        "poke5e-fakemon-backup-dialog"
      ],

      window: {
        title:
          "Seleccionar backup Fakemon"
      },

      position: {
        width:
          560
      },

      content:
        renderBackupFilePicker(),

      ok: {
        label:
          "Analizar backup",

        callback:
          (...callbackArgs) => {

            const button =
              callbackArgs[1];

            const input =
              button.form
                ?.elements
                ?.backupFile;


            return (
              input?.files?.[0] ??
              null
            );
          }
      },

      rejectClose:
        false,

      modal:
        true
    });
  }

  /* ============================================================
   * SPECIES CRUD
   * ============================================================ */

    async #newSpeciesFromWizard() {
      const wizardResult =
        await runFakemonDesignWizard({
          database:
            this.database,

          customSpecies:
            fakemonRepository.species,

          language:
            currentLanguage()
        });


      if (!wizardResult) {
        return;
      }


      /*
      * El Wizard no toca el draft actual.
      *
      * Solo cuando el usuario acepta el resultado
      * preguntamos por cambios sin guardar.
      */
      if (
        !await this.#confirmDiscardWork()
      ) {
        return;
      }


      const defaultAbilityId =
        String(
          this.database
            ?.abilities
            ?.[0]
            ?.id ??
          ""
        ).trim();


      if (!defaultAbilityId) {

        ui.notifications.error(
          "El catálogo Poke5e no contiene Abilities para crear el borrador del Wizard."
        );

        return;
      }


      let draft;


      try {

        draft =
          applyFakemonWizardRecommendation({
            baseDraft:
              createDefaultDraft(
                defaultAbilityId
              ),

            wizardResult
          });

      } catch (
        error
      ) {

        console.error(
          `[${MODULE_ID}] Error aplicando recomendación del Fakemon Wizard`,
          error
        );


        ui.notifications.error(
          error.message
        );

        return;
      }


      const comparables =
        wizardResult
          .recommendation
          .comparables
          .slice(
            0,
            3
          )
          .map(
            entry =>
              entry.name
          )
          .join(
            ", "
          );


      this.evolutionEditor.reset();


      /*
      * v3.0.2 termina en la selección de catálogo.
      * Abrimos Moves & Abilities para que el GM
      * pueda revisar inmediatamente el resultado.
      */
      this._studioState.activeTab =
        "moves";


      this._studioState.selectedId =
        null;


      /*
      * Sigue siendo una especie NUEVA.
      * El ID canónico permanece editable.
      */
      this._studioState.originalId =
        null;


      this._studioState.draft =
        createEditableDraft(
          draft
        );


      this._studioState.options =
        normalizeFakemonOptions();

      this._studioState.pendingEvolution =
        wizardResult.pendingEvolution
          ? foundry.utils.deepClone(
              wizardResult.pendingEvolution
            )
          : null;

      const levelMoveCount =
        (
          draft.learnset
            ?.level ??
          []
        ).reduce(
          (
            total,
            group
          ) =>
            total +
            (
              group?.moveIds
                ?.length ??
              0
            ),
          0
        );

      this._studioState.validation = {
        kind:
          "info",

        message:
          `Borrador generado por Fakemon Wizard. ` +
          `SR ${draft.sr} · Nv. mínimo ${draft.minimumLevel}. ` +
          `${draft.abilities.length} Abilities · ` +
          `${levelMoveCount} Moves · ` +
          `${draft.learnset?.eggMoveIds?.length ?? 0} Egg · ` +
          `${draft.learnset?.tms?.length ?? 0} TMs. ` +
          `Referencias: ${comparables || "sin comparables visibles"}.`
      };


      /*
      * Todavía no existe en Repository.
      */
      this._studioState.dirty =
        true;


      this.#resetWorkspaceScroll();


      void this.render({
        force:
          true
      });
    }

  async #newSpeciesFromOfficial() {
    const sourceSpecies =
      await this.#promptOfficialTemplate();


    if (!sourceSpecies) {
      return;
    }


    /*
    * database.pokemon contiene oficiales +
    * Fakemon habilitados.
    *
    * Repository añade además los Fakemon
    * deshabilitados, que también deben reservar
    * su ID.
    */
    const occupiedIds = [
      ...(
        this.database
          ?.pokemon ??
        []
      ).map(
        species =>
          species?.id
      ),

      ...fakemonRepository.species.map(
        species =>
          species.id
      )
    ];


    let draft;


    try {

      draft =
        createFakemonDraftFromOfficial({
          sourceSpecies,
          occupiedIds
        });


      /*
      * Además del modelo estructural comprobamos
      * que Moves y Abilities siguen existiendo en
      * el catálogo actual.
      */
      validateSpeciesReferences(
        draft,
        this.database
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error creando Fakemon desde ${sourceSpecies.id}`,
        error
      );


      ui.notifications.error(
        error.message
      );

      return;
    }


    this.evolutionEditor.reset();


    this._studioState.activeTab =
      "general";


    this._studioState.selectedId =
      null;


    /*
    * Muy importante:
    *
    * originalId=null significa que estamos
    * creando una especie NUEVA.
    *
    * Por tanto el ID permanece editable.
    */
    this._studioState.originalId =
      null;


    this._studioState.draft =
      createEditableDraft(
        draft
      );


    this._studioState.options =
      normalizeFakemonOptions();

    this._studioState.pendingEvolution =
      null;

    this._studioState.validation = {
      kind:
        "info",

      message:
        `Borrador creado desde ${
          localizedCatalogName(
            sourceSpecies,
            currentLanguage()
          )
        }. El Pokémon Poke5e original no ha sido modificado.`
    };


    /*
    * Este borrador aún no existe en Repository.
    * Cerrarlo debe activar la protección v2.5.
    */
    this._studioState.dirty =
      true;


    void this.render({
      force:
        true
    });
  }

  async #promptOfficialTemplate() {
    const species =
      getOfficialTemplateSpecies(
        this.database
      );


    if (!species.length) {

      ui.notifications.warn(
        "No hay Pokémon Poke5e disponibles para usar como base."
      );

      return null;
    }


    const speciesId =
      await DialogV2.prompt({
        classes: [
          "poke5e-fakemon-template-dialog"
        ],

        window: {
          title:
            "Crear Fakemon desde Pokémon"
        },

        position: {
          width:
            560
        },

        content:
          renderOfficialTemplatePicker(
            species,
            currentLanguage()
          ),

        ok: {
          label:
            "Crear borrador",

          callback:
            (...callbackArgs) => {

              const button =
                callbackArgs[1];


              return String(
                button.form
                  ?.elements
                  ?.sourceId
                  ?.value ??
                ""
              ).trim();
            }
        },

        rejectClose:
          false,

        modal:
          true
      });


    if (!speciesId) {
      return null;
    }


    const selected =
      species.find(
        entry =>
          String(
            entry.id
          ) ===
            speciesId
      );


    if (!selected) {

      ui.notifications.warn(
        "Selecciona un Pokémon Poke5e válido del catálogo."
      );

      return null;
    }


    return selected;
  }

  #newSpecies() {
    this.evolutionEditor.reset();
    this._studioState.activeTab =
      "general";
    const defaultAbilityId =
      String(
        this.database
          ?.abilities
          ?.[0]
          ?.id ??
        ""
      );


    this._studioState.selectedId =
      null;

    this._studioState.originalId =
      null;

    this._studioState.draft =
      createDefaultDraft(
        defaultAbilityId
      );

    this._studioState.options =
      normalizeFakemonOptions();

    this._studioState.validation =
      null;

    this._studioState.dirty =
      false;

    this._studioState.pendingEvolution =
      null;

    this.#resetWorkspaceScroll();

    void this.render({
      force:
        true
    });
  }


  #editSpecies(
    speciesId
  ) {
    this.evolutionEditor.reset();
    this._studioState.activeTab =
      "general";
    const species =
      fakemonRepository
        .getSpecies(
          speciesId
        );


    if (!species) {

      ui.notifications.warn(
        `Fakemon no encontrado: ${speciesId}`
      );

      return;
    }


    this._studioState.selectedId =
      species.id;

    this._studioState.originalId =
      species.id;

    this._studioState.draft =
      createEditableDraft(
        species
      );

    this._studioState.options =
      fakemonRepository
        .getOptions(
          species.id
        ) ??
      normalizeFakemonOptions();

    this._studioState.validation =
      null;
    this._studioState.pendingEvolution =
      null;
    this._studioState.dirty =
      false;
    this.#resetWorkspaceScroll();
    void this.render({
      force:
        true
    });
  }


  #duplicateSpecies(
    speciesId
  ) {
    this.evolutionEditor.reset();
    this._studioState.activeTab =
      "general";
    const species =
      fakemonRepository
        .getSpecies(
          speciesId
        );


    if (!species) {

      ui.notifications.warn(
        `Fakemon no encontrado: ${speciesId}`
      );

      return;
    }


    const customIds =
      new Set(
        fakemonRepository.species.map(
          entry =>
            entry.id
        )
      );


    const allIds =
      new Set(
        (
          this.database
            ?.pokemon ??
          []
        ).map(
          entry =>
            String(
              entry.id
            )
        )
      );


    const draft =
      createEditableDraft(
        species
      );


    draft.id =
      nextCopyId(
        species.id,
        customIds,
        allIds
      );


    draft.name =
      `${species.name} Copy`;


    this._studioState.selectedId =
      null;

    this._studioState.originalId =
      null;

    this._studioState.draft =
      draft;

    this._studioState.options =
      fakemonRepository
        .getOptions(
          species.id
        ) ??
      normalizeFakemonOptions();
    this._studioState.pendingEvolution =
      null;
    this._studioState.validation = {
      kind:
        "info",

      message:
        "Copia preparada. Ajusta nombre/ID y guarda para crear la nueva especie."
    };

    this._studioState.dirty =
      true;
    this.#resetWorkspaceScroll();
    void this.render({
      force:
        true
    });
  }


  async #deleteSpecies(
    speciesId
  ) {

    const species =
      fakemonRepository
        .getSpecies(
          speciesId
        );


    if (!species) {
      return;
    }


    const confirmed =
      await DialogV2.confirm({
        window: {
          title:
            "Eliminar Fakemon"
        },

        content: `
          <p>
            ¿Eliminar
            <strong>
              ${escapeHtml(
                species.name
              )}
            </strong>
            (${escapeHtml(
              species.id
            )})?
          </p>

          <p>
            También se eliminarán sus
            Evolutions Fakemon relacionadas.
          </p>
        `,

        yes: {
          label:
            "Eliminar"
        },

        no: {
          label:
            "Cancelar"
        },

        rejectClose:
          false,

        modal:
          true
      });


    if (
      confirmed !==
        true
    ) {
      return;
    }

    this.#capturePreservedDrafts();

    this._studioState.busy =
      true;


    try {

      await fakemonRepository
        .deleteSpecies(
          species.id,
          {
            deleteRelatedEvolutions:
              true
          }
        );


      if (
        this._studioState
          .originalId ===
        species.id
      ) {

        this.#resetEditorState();
      }


      ui.notifications.info(
        `${species.name} eliminado de Fakemon Studio.`
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error eliminando Fakemon ${species.id}`,
        error
      );


      ui.notifications.error(
        error.message
      );

    } finally {

      this._studioState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }


  /* ============================================================
   * VALIDATION / SAVE
   * ============================================================ */

  #validateDraft() {
    this.evolutionEditor
      .captureCurrentDraft(
        this.element
      );
    try {

      const {
        species
      } =
        this.#normalizedDraft();


      this.#assertSaveIdentity(
        species.id
      );


      this._studioState.validation = {
        kind:
          "success",

        message:
          `${species.name} es válido y todas sus referencias existen.`
      };

    } catch (
      error
    ) {

      this._studioState.validation = {
        kind:
          "error",

        message:
          error.message
      };
    }


    void this.render({
      force:
        true
    });
  }


  async #saveDraft() {

    if (
      this._studioState.busy
    ) {
      return;
    }

    this.evolutionEditor
      .captureCurrentDraft(
        this.element
      );

    let normalized;


    try {

      normalized =
        this.#normalizedDraft();


      this.#assertSaveIdentity(
        normalized.species.id
      );

    } catch (
      error
    ) {

      this._studioState.validation = {
        kind:
          "error",

        message:
          error.message
      };


      await this.render({
        force:
          true
      });


      return;
    }


    this._studioState.busy =
      true;


    try {

      const saved =
        await fakemonRepository
          .saveSpecies(
            normalized.species,
            {
              options:
                normalized.options
            }
          );


      await fakemonRepository.load();


      this._studioState.selectedId =
        saved.id;

      this._studioState.originalId =
        saved.id;

      this._studioState.draft =
        createEditableDraft(
          saved
        );

      this._studioState.options =
        fakemonRepository
          .getOptions(
            saved.id
          ) ??
        normalizeFakemonOptions();

      this._studioState.dirty =
        false;
      
      const evolutionResult =
        await this.#savePendingWizardEvolution(
          saved
        );


      if (
        evolutionResult.error
      ) {

        this._studioState.validation = {
          kind:
            "info",

          message:
            `${saved.name} fue guardado, pero su Evolution quedó pendiente: ` +
            evolutionResult.error.message
        };


        ui.notifications.warn(
          `${saved.name} fue guardado. Revisa la Evolution pendiente.`
        );

      } else {

        const evolutionMessage =
          evolutionResult.evolution
            ? ` Evolution ${evolutionResult.evolution.from} → ` +
              `${evolutionResult.evolution.to} guardada.`
            : "";


        this._studioState.validation = {
          kind:
            "success",

          message:
            `${saved.name} guardado correctamente.${evolutionMessage}`
        };


        ui.notifications.info(
          evolutionResult.evolution
            ? `${saved.name} y su Evolution fueron guardados en Fakemon Studio.`
            : `${saved.name} guardado en Fakemon Studio.`
        );
      }

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error guardando Fakemon`,
        error
      );


      this._studioState.validation = {
        kind:
          "error",

        message:
          error.message
      };


      ui.notifications.error(
        error.message
      );

    } finally {

      this._studioState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }

  async #savePendingWizardEvolution(
    savedSpecies
  ) {
    const pending =
      this._studioState
        .pendingEvolution;


    if (!pending) {

      return {
        evolution:
          null,

        error:
          null
      };
    }


    const definition = {
      ...foundry.utils.deepClone(
        pending
      ),

      to:
        savedSpecies.id
    };


    try {

      const evolution =
        validateFakemonEvolutionDefinition({
          definition,

          database:
            this.database,

          fakemonStore:
            fakemonRepository
              .snapshot()
        });


      const savedEvolution =
        await fakemonRepository
          .saveEvolution(
            evolution
          );


      await fakemonRepository.load();


      this._studioState.pendingEvolution =
        null;


      return {
        evolution:
          savedEvolution,

        error:
          null
      };

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error guardando Evolution pendiente del Wizard`,
        error
      );


      /*
      * La especie NO se revierte.
      *
      * Transferimos la relación fallida al editor visible
      * para que el GM pueda corregirla.
      */
      this._studioState.pendingEvolution =
        null;


      this._studioState.activeTab =
        "evolution";


      this.evolutionEditor.loadDraft(
        definition,
        {
          validation: {
            kind:
              "error",

            message:
              `La especie fue guardada, pero la Evolution pendiente no pudo guardarse: ${error.message}`
          }
        }
      );


      return {
        evolution:
          null,

        error
      };
    }
  }

  async #importSpecies() {

    const speciesId =
      this._studioState
        .originalId;


    if (!speciesId) {

      ui.notifications.warn(
        "Guarda el Fakemon antes de importarlo."
      );

      return;
    }


    const options =
      fakemonRepository
        .getOptions(
          speciesId
        );


    if (
      options?.enabled ===
      false
    ) {

      ui.notifications.warn(
        "Este Fakemon está deshabilitado en el catálogo compuesto."
      );

      return;
    }

    this.#capturePreservedDrafts();

    this._studioState.busy =
      true;


    try {

      const result =
        await importPokemon(
          speciesId
        );


      const statusLabel =
        result.status ===
          "created"
          ? "creado"
          : result.status ===
              "updated"
            ? "actualizado"
            : "ya existía";


      ui.notifications.info(
        `${result.pokemon.name}: ${statusLabel}.`
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error importando Fakemon ${speciesId}`,
        error
      );


      ui.notifications.error(
        error.message
      );

    } finally {

      this._studioState.busy =
        false;


      await this.render({
        force:
          true
      });
    }
  }


  #normalizedDraft() {

    const raw =
      this.#readDraftFromForm();


    /*
     * Conservamos primero el estado que el
     * usuario está viendo.
     *
     * Así un error de validación no revierte
     * accidentalmente los campos escritos.
     */

    this._studioState.draft =
      createEditableDraft(
        raw.species
      );

    this._studioState.options =
      raw.options;


    const species =
      normalizeFakemonSpecies(
        raw.species
      );


    validateSpeciesReferences(
      species,
      this.database
    );


    return {
      species,

      options:
        normalizeFakemonOptions(
          raw.options
        )
    };
  }


  #assertSaveIdentity(
    speciesId
  ) {

    const customIds =
      new Set(
        fakemonRepository.species.map(
          entry =>
            entry.id
        )
      );


    const officialCollision =
      (
        this.database
          ?.pokemon ??
        []
      ).some(
        entry =>
          String(
            entry.id
          ) ===
            speciesId &&
          !customIds.has(
            speciesId
          )
      );


    if (
      officialCollision
    ) {

      throw new Error(
        `El ID ${speciesId} pertenece al catálogo Poke5e y no puede sobrescribirse.`
      );
    }


    if (
      this._studioState
        .originalId &&
      speciesId !==
        this._studioState
          .originalId
    ) {

      throw new Error(
        "El ID canónico queda bloqueado al editar. Usa Duplicar para crear otro ID."
      );
    }


    if (
      customIds.has(
        speciesId
      ) &&
      speciesId !==
        this._studioState
          .originalId
    ) {

      throw new Error(
        `Ya existe un Fakemon con ID ${speciesId}.`
      );
    }
  }


  /* ============================================================
   * COLLECTIONS
   * ============================================================ */

  #bindCollectionActions(
    root
  ) {

    const addActions = [
      [
        "add-ability",

        () => ({
          id:
            "",

          hidden:
            false
        })
      ],

      [
        "add-level-move",

        () => ({
          level:
            1,

          moveId:
            ""
        })
      ],

      [
        "add-egg-move",

        () =>
          ""
      ],

      [
        "add-tm",

        () => ({
          id:
            0,

          moveId:
            "",

          cost:
            0,

          source:
            "moves.json"
        })
      ],

      [
        "add-speed",

        () => ({
          type:
            "walking",

          value:
            30,

          unit:
            "ft"
        })
      ],

      [
        "add-sense",

        () => ({
          type:
            "darkvision",

          value:
            30
        })
      ]
    ];


    for (
      const [
        action,
        factory
      ]
      of addActions
    ) {

      root
        .querySelector(
          `[data-action="${action}"]`
        )
        ?.addEventListener(
          "click",
          () => {

            this.#capturePreservedDrafts();


            collectionForAction(
              this._studioState.draft,
              action
            ).push(
              factory()
            );

            this.#setSpeciesDirty(
              root,
              true
            );

            this._studioState.validation =
              null;


            void this.render({
              force:
                true
            });
          }
        );
    }


    root
      .querySelectorAll(
        '[data-action^="remove-"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              this.#capturePreservedDrafts();


              const collection =
                collectionForRemoveAction(
                  this._studioState.draft,
                  button.dataset.action
                );


              const index =
                Number(
                  button.dataset.index
                );


              if (
                !collection ||
                !Number.isInteger(
                  index
                )
              ) {
                return;
              }


              collection.splice(
                index,
                1
              );

              this.#setSpeciesDirty(
                root,
                true
              );

              this._studioState.validation =
                null;


              void this.render({
                force:
                  true
              });
            }
          );
        }
      );
  }
  
  #addDroppedAbility(
    root,
    sourceId
  ) {

    const abilityId =
      String(
        sourceId ??
        ""
      )
        .trim()
        .toLowerCase();


    if (!abilityId) {
      return;
    }


    const abilityExists =
      (
        this.database
          ?.abilities ??
        []
      ).some(
        ability =>
          String(
            ability?.id ??
            ""
          ) ===
            abilityId
      );


    if (!abilityExists) {

      ui.notifications.warn(
        `La Ability ${abilityId} no existe en el catálogo Poke5e cargado.`
      );

      return;
    }


    /*
    * Conservamos cualquier cambio que todavía
    * esté únicamente en el formulario.
    */
    this.#capturePreservedDrafts();


    const abilities =
      this._studioState
        .draft
        ?.abilities;


    if (
      !Array.isArray(
        abilities
      )
    ) {
      return;
    }


    if (
      abilities.some(
        entry =>
          String(
            entry?.id ??
            ""
          ) ===
            abilityId
      )
    ) {

      ui.notifications.warn(
        "Esa Ability ya está configurada para este Fakemon."
      );

      return;
    }


    abilities.push({
      id:
        abilityId,

      hidden:
        false
    });


    this._studioState.validation =
      null;


    this.#setSpeciesDirty(
      root,
      true
    );


    void this.render({
      force:
        true
    });
  }

  #addDroppedLevelMove(
    root,
    sourceId
  ) {

    const move =
      this.#catalogMove(
        sourceId
      );


    if (!move) {
      return;
    }


    this.#capturePreservedDrafts();


    const levelMoves =
      this._studioState
        .draft
        ?.levelMoves;


    if (
      !Array.isArray(
        levelMoves
      )
    ) {
      return;
    }


    if (
      levelMoves.some(
        entry =>
          String(
            entry?.moveId ??
            ""
          ) ===
          move.id
      )
    ) {

      ui.notifications.warn(
        "Ese Move ya está configurado en el Learnset por nivel."
      );

      return;
    }


    levelMoves.push({
      level:
        1,

      moveId:
        move.id
    });


    this.#finishMoveDrop(
      root
    );
  }


  #addDroppedEggMove(
    root,
    sourceId
  ) {

    const move =
      this.#catalogMove(
        sourceId
      );


    if (!move) {
      return;
    }


    this.#capturePreservedDrafts();


    const eggMoveIds =
      this._studioState
        .draft
        ?.learnset
        ?.eggMoveIds;


    if (
      !Array.isArray(
        eggMoveIds
      )
    ) {
      return;
    }


    if (
      eggMoveIds.some(
        moveId =>
          String(
            moveId ??
            ""
          ) ===
          move.id
      )
    ) {

      ui.notifications.warn(
        "Ese Move ya está configurado como Egg Move."
      );

      return;
    }


    eggMoveIds.push(
      move.id
    );


    this.#finishMoveDrop(
      root
    );
  }


  #addDroppedTm(
    root,
    sourceId
  ) {

    const move =
      this.#catalogMove(
        sourceId
      );


    if (!move) {
      return;
    }


    const tmId =
      Number(
        move.tm?.id
      );


    if (
      !Number.isInteger(
        tmId
      ) ||
      tmId < 0
    ) {

      ui.notifications.warn(
        `${localizedCatalogName(
          move,
          currentLanguage()
        )} no tiene metadata TM en el catálogo Poke5e. ` +
        "Puedes usar Agregar manual si necesitas una TM custom."
      );

      return;
    }


    this.#capturePreservedDrafts();


    const tms =
      this._studioState
        .draft
        ?.learnset
        ?.tms;


    if (
      !Array.isArray(
        tms
      )
    ) {
      return;
    }


    if (
      tms.some(
        entry =>
          String(
            entry?.moveId ??
            ""
          ) ===
          move.id
      )
    ) {

      ui.notifications.warn(
        "Ese Move ya está configurado como TM."
      );

      return;
    }


    if (
      tms.some(
        entry =>
          Number(
            entry?.id
          ) ===
          tmId
      )
    ) {

      ui.notifications.warn(
        `La TM ${tmId} ya está configurada para este Fakemon.`
      );

      return;
    }


    const numericCost =
      Number(
        move.tm?.cost
      );


    tms.push({
      id:
        tmId,

      moveId:
        move.id,

      cost:
        Number.isFinite(
          numericCost
        ) &&
        numericCost >= 0
          ? numericCost
          : 0,

      source:
        "moves.json"
    });


    this.#finishMoveDrop(
      root
    );
  }


  #catalogMove(
    sourceId
  ) {

    const moveId =
      String(
        sourceId ??
        ""
      )
        .trim()
        .toLowerCase();


    if (!moveId) {
      return null;
    }


    const move =
      (
        this.database
          ?.moves ??
        []
      ).find(
        entry =>
          String(
            entry?.id ??
            ""
          ) ===
          moveId
      );


    if (!move) {

      ui.notifications.warn(
        `El Move ${moveId} no existe en el catálogo Poke5e cargado.`
      );

      return null;
    }


    return move;
  }


  #finishMoveDrop(
    root
  ) {

    this._studioState.validation =
      null;


    this.#setSpeciesDirty(
      root,
      true
    );


    void this.render({
      force:
        true
    });
  }

  #captureDraft() {

    if (
      !this._studioState.draft
    ) {
      return;
    }


    const raw =
      this.#readDraftFromForm();


    this._studioState.draft =
      createEditableDraft(
        raw.species
      );


    this._studioState.options =
      raw.options;
  }


  /* ============================================================
   * FORM SERIALIZATION
   * ============================================================ */

  #readDraftFromForm() {

    const root =
      this.element;


    const value =
      role =>
        root
          .querySelector(
            `[data-role="${role}"]`
          )
          ?.value ??
        "";


    const checked =
      role =>
        Boolean(
          root
            .querySelector(
              `[data-role="${role}"]`
            )
            ?.checked
        );


    const primaryType =
      value(
        "primary-type"
      );


    const secondaryType =
      value(
        "secondary-type"
      );


    const types = [
      primaryType,
      secondaryType
    ].filter(
      (
        type,
        index,
        values
      ) =>
        type &&
        values.indexOf(
          type
        ) ===
          index
    );


    const attributes =
      Object.fromEntries(
        ABILITY_IDS.map(
          abilityId => [
            abilityId,

            value(
              `attribute-${abilityId}`
            )
          ]
        )
      );


    const abilities =
      readRows(
        root,
        "ability-row",
        row => ({
          id:
            row
              .querySelector(
                '[data-field="id"]'
              )
              ?.value ??
            "",

          hidden:
            Boolean(
              row
                .querySelector(
                  '[data-field="hidden"]'
                )
                ?.checked
            )
        })
      );


    const levelMoves =
      readRows(
        root,
        "level-move-row",
        row => ({
          level:
            row
              .querySelector(
                '[data-field="level"]'
              )
              ?.value ??
            "",

          moveId:
            row
              .querySelector(
                '[data-field="moveId"]'
              )
              ?.value ??
            ""
        })
      );

    const eggMoveIds =
      readRows(
        root,
        "egg-move-row",
        row =>
          row
            .querySelector(
              '[data-field="moveId"]'
            )
            ?.value ??
          ""
      );

    const tms =
      readRows(
        root,
        "tm-row",
        row => ({
          id:
            row
              .querySelector(
                '[data-field="id"]'
              )
              ?.value ??
            "",

          moveId:
            row
              .querySelector(
                '[data-field="moveId"]'
              )
              ?.value ??
            "",

          cost:
            row
              .querySelector(
                '[data-field="cost"]'
              )
              ?.value ??
            "",

          source:
            "moves.json"
        })
      );


    const speeds =
      readRows(
        root,
        "speed-row",
        row => ({
          type:
            row
              .querySelector(
                '[data-field="type"]'
              )
              ?.value ??
            "",

          value:
            row
              .querySelector(
                '[data-field="value"]'
              )
              ?.value ??
            "",

          unit:
            row
              .querySelector(
                '[data-field="unit"]'
              )
              ?.value ??
            "ft"
        })
      );


    const senses =
      readRows(
        root,
        "sense-row",
        row => ({
          type:
            row
              .querySelector(
                '[data-field="type"]'
              )
              ?.value ??
            "",

          value:
            row
              .querySelector(
                '[data-field="value"]'
              )
              ?.value ??
            ""
        })
      );


    return {
      species: {
        id:
          value(
            "species-id"
          ),

        name:
          value(
            "species-name"
          ),

        dexNumber:
          value(
            "dex-number"
          ),

        description: {
          es:
            value(
              "description-es"
            ),

          en:
            value(
              "description-en"
            )
        },

        types,
        primaryType,

        size:
          value(
            "size"
          ),

        sr:
          value(
            "sr"
          ),

        minimumLevel:
          value(
            "minimum-level"
          ),

        biology: {
          eggGroups:
            splitCsv(
              value(
                "egg-groups"
              )
            ),

          genderRatio:
            value(
              "gender-ratio"
            )
        },

        combat: {
          ac:
            value(
              "ac"
            ),

          hp:
            value(
              "hp"
            ),

          hitDie:
            value(
              "hit-die"
            ),

          attributes,

          speed:
            speeds,

          skills:
            uniqueStrings([
              ...readCheckedValues(
                root,
                "skill-choice"
              ),

              ...splitCsv(
                value(
                  "skills-extra"
                )
              )
            ]),

          savingThrows:
            readCheckedValues(
              root,
              "saving-throw-choice"
            ),

          senses
        },

        abilities,

        learnset: {
          level:
            groupLevelMoves(
              levelMoves
            ),

          eggMoveIds,

          tms
        },

        media: {
          portrait:
            emptyToNull(
              value(
                "portrait"
              )
            ),

          token:
            emptyToNull(
              value(
                "token"
              )
            ),

          tokenAnimated:
            emptyToNull(
              value(
                "token-animated"
              )
            ),

          portraitShiny:
            emptyToNull(
              value(
                "portrait-shiny"
              )
            ),

          tokenShiny:
            emptyToNull(
              value(
                "token-shiny"
              )
            ),

          tokenShinyAnimated:
            emptyToNull(
              value(
                "token-shiny-animated"
              )
            )
        },

        habitat: {
          nativeRegion:
            value(
              "native-region"
            ),

          regions:
            splitCsv(
              value(
                "regions"
              )
            ),

          biomes:
            splitCsv(
              value(
                "biomes"
              )
            )
        },

        evolutionRefs: {
          incoming:
            [],

          outgoing:
            []
        }
      },

      options: {
        enabled:
          checked(
            "enabled"
          ),

        encounters: {
          manual:
            checked(
              "encounter-manual"
            ),

          /*
          * Los encuentros aleatorios no forman parte
          * de la UI actual del Fakemon Studio.
          *
          * Conservamos su estado persistido para que
          * un cambio visual no modifique datos.
          */
          wildRandom:
            this._studioState
              .options
              ?.encounters
              ?.wildRandom ===
                true,

          trainerRandom:
            this._studioState
              .options
              ?.encounters
              ?.trainerRandom !==
                false
        }
      }
    };
  }

  #resetWorkspaceScroll() {
    this._resetWorkspaceScrollOnNextRender =
      true;
  }

  #clearEditor() {
    this.#resetEditorState();
    this.#resetWorkspaceScroll();
    void this.render({
      force:
        true
    });
  }


  #resetEditorState() {
    this.#resetWorkspaceScroll();
    this.evolutionEditor.reset();
    this._studioState.activeTab =
      "general";
    this._studioState.selectedId =
      null;

    this._studioState.originalId =
      null;

    this._studioState.draft =
      null;

    this._studioState.options =
      normalizeFakemonOptions();

    this._studioState.validation =
      null;
    this._studioState.pendingEvolution =
      null;
    this._studioState.dirty =
      false;
  }
}

/* ============================================================
 * SCROLL STATE
 * ============================================================ */

function captureStudioScrollState(
  root
) {

  const workspace =
    root.querySelector(
      ".fakemon-studio__workspace"
    );


  const speciesList =
    root.querySelector(
      ".fakemon-studio__species-list"
    );


  const tabs =
    root.querySelector(
      ".fakemon-studio__tabs"
    );


  if (
    !workspace &&
    !speciesList &&
    !tabs
  ) {
    return null;
  }


  return {
    workspaceTop:
      workspace?.scrollTop ??
      0,

    speciesListTop:
      speciesList?.scrollTop ??
      0,

    tabsLeft:
      tabs?.scrollLeft ??
      0
  };
}


function restoreStudioScrollState(
  root,
  state
) {

  if (!state) {
    return;
  }


  const workspace =
    root.querySelector(
      ".fakemon-studio__workspace"
    );


  if (workspace) {

    workspace.scrollTop =
      state.workspaceTop;
  }


  const speciesList =
    root.querySelector(
      ".fakemon-studio__species-list"
    );


  if (speciesList) {

    speciesList.scrollTop =
      state.speciesListTop;
  }


  const tabs =
    root.querySelector(
      ".fakemon-studio__tabs"
    );


  if (tabs) {

    tabs.scrollLeft =
      state.tabsLeft;
  }
}

/* ============================================================
 * OPEN
 * ============================================================ */

export function openFakemonStudio() {

  if (
    !game.user.isGM
  ) {

    ui.notifications.warn(
      "Solo el GM puede abrir Fakemon Studio."
    );

    return null;
  }


  if (
    studioApp?.rendered
  ) {

    studioApp.bringToFront();

    return studioApp;
  }


  studioApp =
    new FakemonStudio();


  void studioApp.render({
    force:
      true
  });


  return studioApp;
}


/* ============================================================
 * DRAFTS
 * ============================================================ */

function createDefaultDraft(
  defaultAbilityId
) {

  return {
    id:
      "",

    name:
      "",

    dexNumber:
      0,

    description: {
      es:
        "",

      en:
        ""
    },

    types: [
      "normal"
    ],

    primaryType:
      "normal",

    size:
      "medium",

    sr:
      1,

    minimumLevel:
      1,

    biology: {
      eggGroups:
        [],

      genderRatio:
        "1:1"
    },

    combat: {
      ac:
        10,

      hp:
        10,

      hitDie:
        "d6",

      attributes: {
        str:
          10,

        dex:
          10,

        con:
          10,

        int:
          10,

        wis:
          10,

        cha:
          10
      },

      speed: [
        {
          type:
            "walking",

          value:
            30,

          unit:
            "ft"
        }
      ],

      skills:
        [],

      savingThrows:
        [],

      senses:
        []
    },

    abilities: [
      {
        id:
          defaultAbilityId,

        hidden:
          false
      }
    ],

    learnset: {
      level:
        [],

      eggMoveIds:
        [],

      tms:
        []
    },

    media: {
      portrait:
        null,

      token:
        null,

      tokenAnimated:
        null,

      portraitShiny:
        null,

      tokenShiny:
        null,

      tokenShinyAnimated:
        null
    },

    habitat: {
      biomes:
        [],

      nativeRegion:
        "",

      regions:
        []
    },

    evolutionRefs: {
      incoming:
        [],

      outgoing:
        []
    }
  };
}


function createEditableDraft(
  species
) {

  const source =
    foundry.utils.deepClone(
      species
    );


  source.combat ??=
    {};

  source.combat.attributes ??=
    {};

  source.combat.speed ??=
    [];

  source.combat.skills ??=
    [];

  source.combat.savingThrows ??=
    [];

  source.combat.senses ??=
    [];

  source.abilities ??=
    [];

  source.learnset ??=
    {};

  source.learnset.level ??=
    [];

  source.learnset.eggMoveIds ??=
    [];

  source.learnset.tms ??=
    [];

  source.media ??=
    {};

  source.habitat ??=
    {};

  source.habitat.regions ??=
    [];

  source.habitat.biomes ??=
    [];

  source.biology ??=
    {};

  source.biology.eggGroups ??=
    [];


  source.levelMoves =
    source.learnset.level
      .flatMap(
        group =>
          (
            group.moveIds ??
            []
          ).map(
            moveId => ({
              level:
                group.level,

              moveId
            })
          )
      );


  return source;
}


/* ============================================================
 * LIST
 * ============================================================ */

function renderSpeciesList(
  species,
  selectedId,
  language
) {

  return species
    .map(
      entry => {

        const selected =
          entry.id ===
            selectedId
            ? " is-selected"
            : "";


        const typeLabels =
          (
            entry.types ??
            []
          )
            .map(
              type =>
                pokemonTypeLabel(
                  type,
                  language
                )
            )
            .join(
              " / "
            );


        const searchText =
          normalizeSearch(
            [
              entry.id,
              entry.name,
              entry.types?.join(
                " "
              ),
              entry.sr
            ].join(
              " "
            )
          );


        return `
          <article
            class="fakemon-studio__species-card${selected}"
            data-search="${escapeAttribute(
              searchText
            )}"
          >

            <button
              type="button"
              class="fakemon-studio__species-main"
              data-action="edit-species"
              data-species-id="${escapeAttribute(
                entry.id
              )}"
            >

              ${renderFakemonSpeciesThumbnail(
                entry
              )}


              <span class="fakemon-studio__species-copy">

                <strong>
                  ${escapeHtml(
                    entry.name
                  )}
                </strong>

                <small>
                  ${escapeHtml(
                    entry.id
                  )}
                </small>

                <span>
                  ${escapeHtml(
                    typeLabels ||
                    "Sin tipo"
                  )}
                  · SR ${escapeHtml(
                    String(
                      entry.sr
                    )
                  )}
                  · Nv. ${escapeHtml(
                    String(
                      entry.minimumLevel
                    )
                  )}
                </span>

              </span>

            </button>


            <div class="fakemon-studio__species-actions">

              <button
                type="button"
                data-action="duplicate-species"
                data-species-id="${escapeAttribute(
                  entry.id
                )}"
                title="Duplicar"
              >
                <i class="fa-regular fa-copy"></i>
              </button>


              <button
                type="button"
                data-action="delete-species"
                data-species-id="${escapeAttribute(
                  entry.id
                )}"
                title="Eliminar"
              >
                <i class="fa-solid fa-trash"></i>
              </button>

            </div>

          </article>
        `;
      }
    )
    .join(
      ""
    );
}


function renderEmptyEditor() {

  return `
    <div class="fakemon-studio__empty-workspace">

      <i class="poke5e-icon-pokedex"></i>

      <h2>
        Fakemon Studio
      </h2>

      <p>
        Selecciona una especie o crea una nueva para comenzar.
      </p>

      <p class="hint">
        Los Fakemon se guardan fuera de los datos normalizados oficiales de Poke5e.
      </p>

    </div>
  `;
}


/* ============================================================
 * EDITOR
 * ============================================================ */

function renderStudioTabs(
  selectedTab
) {

  const tabs = [
    {
      id:
        "general",

      label:
        "General",

      icon:
        "fa-solid fa-id-card"
    },

    {
      id:
        "stats",

      label:
        "Stats",

      icon:
        "fa-solid fa-chart-simple"
    },

    {
      id:
        "moves",

      label:
        "Moves & Abilities",

      icon:
        "fa-solid fa-bolt"
    },

    {
      id:
        "evolution",

      label:
        "Evolution",

      icon:
        "fa-solid fa-code-branch"
    },

    {
      id:
        "media",

      label:
        "Media",

      icon:
        "fa-solid fa-image"
    }
  ];


  return `
    <nav
      class="fakemon-studio__tabs"
      aria-label="Secciones de Fakemon Studio"
    >

      ${
        tabs
          .map(
            tab => {

              const active =
                tab.id ===
                  selectedTab;


              return `
                <button
                  type="button"
                  class="fakemon-studio__tab${active ? " is-active" : ""}"
                  data-action="switch-tab"
                  data-tab="${escapeAttribute(
                    tab.id
                  )}"
                  aria-selected="${active ? "true" : "false"}"
                >

                  <i
                    class="${tab.icon}"
                    aria-hidden="true"
                  ></i>

                  <span>
                    ${escapeHtml(
                      tab.label
                    )}
                  </span>

                </button>
              `;
            }
          )
          .join("")
      }

    </nav>
  `;
}

function renderEditor({
  draft,
  options,
  originalId,
  validation,
  dirty,
  activeTab,
  language,
  moves,
  abilities,
  evolutionMarkup,
  busy
}) {

  const levelMoves =
    draft.levelMoves ??
    draft.learnset
      ?.level
      ?.flatMap(
        group =>
          (
            group.moveIds ??
            []
          ).map(
            moveId => ({
              level:
                group.level,

              moveId
            })
          )
      ) ??
    [];

  const selectedTab =
    STUDIO_TABS.has(
      activeTab
    )
      ? activeTab
      : "general";


  return `
    ${renderCatalogDatalists(
      moves,
      abilities,
      language
    )}

    ${renderFakemonStatsDatalists(
      language
    )}

    <form
      class="fakemon-studio__editor"
      onsubmit="return false;"
    >

      <header class="fakemon-studio__editor-header">

        ${renderFakemonEditorIdentity({
          draft,
          originalId,
          language
        })}


        <div class="fakemon-studio__editor-actions">
          <span
            class="fakemon-studio__dirty-indicator"
            data-role="species-dirty-indicator"
            data-dirty="${dirty ? "true" : "false"}"
          >
            <i class="fa-solid fa-circle"></i>
            Cambios sin guardar
          </span>
          <button
            type="button"
            data-action="cancel-edit"
            ${busy ? "disabled" : ""}
          >
            Cancelar
          </button>


          ${
            originalId
              ? `
                <button
                  type="button"
                  data-action="import-species"
                  ${
                    busy ||
                    options.enabled ===
                      false
                      ? "disabled"
                      : ""
                  }
                >
                  <i class="fa-solid fa-file-import"></i>
                  Importar
                </button>
              `
              : ""
          }


          <button
            type="button"
            data-action="validate-species"
            ${busy ? "disabled" : ""}
          >
            <i class="fa-solid fa-check"></i>
            Validar
          </button>


          <button
            type="button"
            class="primary"
            data-action="save-species"
            ${busy ? "disabled" : ""}
          >
            <i class="fa-solid fa-floppy-disk"></i>
            ${busy ? "Guardando…" : "Guardar"}
          </button>

        </div>

      </header>

      ${renderStudioTabs(
        selectedTab
      )}

      ${renderValidation(
        validation
      )}


      <section
        class="fakemon-studio__panel"
        data-studio-tab="general"
        ${selectedTab === "general" ? "" : "hidden"}
      >

        <header>
          <i class="fa-solid fa-id-card"></i>
          <h3>General</h3>
        </header>


        <div class="fakemon-studio__grid fakemon-studio__grid--4">

          ${renderField({
            label:
              "Nombre",

            role:
              "species-name",

            value:
              draft.name
          })}


          ${renderField({
            label:
              "ID canónico",

            role:
              "species-id",

            value:
              draft.id,

            readonly:
              Boolean(
                originalId
              ),

            hint:
              originalId
                ? "Bloqueado para preservar referencias."
                : "Inglés, minúsculas y guiones."
          })}


          ${renderNumberField({
            label:
              "Pokédex #",

            role:
              "dex-number",

            value:
              draft.dexNumber ??
              0,

            min:
              0
          })}


          ${renderNumberField({
            label:
              "SR",

            role:
              "sr",

            value:
              draft.sr ??
              0,

            min:
              0,

            step:
              "any"
          })}


          ${renderTypeSelect({
            label:
              "Tipo primario",

            role:
              "primary-type",

            value:
              draft.primaryType ??
              draft.types?.[0] ??
              "normal",

            language
          })}


          ${renderSecondaryTypeSelect({
            role:
              "secondary-type",

            value:
              draft.types?.[1] ??
              "",

            language
          })}


          ${renderSelectField({
            label:
              "Tamaño",

            role:
              "size",

            value:
              draft.size ??
              "medium",

            options:
              SIZE_OPTIONS.map(
                size => ({
                  value:
                    size,

                  label:
                    size
                })
              )
          })}


          ${renderNumberField({
            label:
              "Nivel mínimo",

            role:
              "minimum-level",

            value:
              draft.minimumLevel ??
              1,

            min:
              1,

            max:
              20
          })}

        </div>


        <div class="fakemon-studio__grid fakemon-studio__grid--2">

          ${renderTextarea({
            label:
              "Descripción ES",

            role:
              "description-es",

            value:
              draft.description?.es ??
              ""
          })}


          ${renderTextarea({
            label:
              "Description EN",

            role:
              "description-en",

            value:
              draft.description?.en ??
              ""
          })}

        </div>

        <div class="fakemon-studio__section-label">

          <i class="fa-solid fa-dna"></i>

          <span>
            Biology
          </span>

        </div>


        <div class="fakemon-studio__grid fakemon-studio__grid--2">

          ${renderField({
            label:
              "Egg Groups",

            role:
              "egg-groups",

            value:
              (
                draft.biology
                  ?.eggGroups ??
                []
              ).join(
                ", "
              ),

            hint:
              "Grupos separados por coma."
          })}


          ${renderField({
            label:
              "Gender Ratio",

            role:
              "gender-ratio",

            value:
              draft.biology
                ?.genderRatio ??
              "1:1",

            hint:
              "Formato Poke5e, por ejemplo 1:1 o 1:7."
          })}

        </div>

      </section>


      <section
        class="fakemon-studio__panel fakemon-studio__panel--stats"
        data-studio-tab="stats"
        ${selectedTab === "stats" ? "" : "hidden"}
      >

        <header>

          <i class="fa-solid fa-chart-simple"></i>

          <h3>
            Stats & Combat
          </h3>

          <small>
            Perfil base de especie
          </small>

        </header>


        <div class="fakemon-studio__stats-overview">

          <label class="fakemon-studio__metric-card">

            <span class="fakemon-studio__metric-icon">
              <i class="fa-solid fa-shield-halved"></i>
            </span>


            <span class="fakemon-studio__metric-copy">

              <small>
                Armor Class
              </small>

              <strong>
                AC
              </strong>

            </span>


            <input
              type="number"
              data-role="ac"
              min="1"
              step="1"
              value="${escapeAttribute(
                draft.combat?.ac ??
                10
              )}"
            >

          </label>


          <label class="fakemon-studio__metric-card">

            <span class="fakemon-studio__metric-icon">
              <i class="fa-solid fa-heart"></i>
            </span>


            <span class="fakemon-studio__metric-copy">

              <small>
                Base Hit Points
              </small>

              <strong>
                HP
              </strong>

            </span>


            <input
              type="number"
              data-role="hp"
              min="1"
              step="1"
              value="${escapeAttribute(
                draft.combat?.hp ??
                10
              )}"
            >

          </label>


          <label class="fakemon-studio__metric-card">

            <span class="fakemon-studio__metric-icon">
              <i class="fa-solid fa-dice-d20"></i>
            </span>


            <span class="fakemon-studio__metric-copy">

              <small>
                Hit Die
              </small>

              <strong>
                HD
              </strong>

            </span>


            <select data-role="hit-die">

              ${
                [
                  "d4",
                  "d6",
                  "d8",
                  "d10",
                  "d12",
                  "d20"
                ]
                  .map(
                    die => `
                      <option
                        value="${die}"
                        ${
                          die ===
                            (
                              draft.combat
                                ?.hitDie ??
                              "d6"
                            )
                            ? "selected"
                            : ""
                        }
                      >
                        ${die}
                      </option>
                    `
                  )
                  .join(
                    ""
                  )
              }

            </select>

          </label>

        </div>


        <div class="fakemon-studio__stats-block">

          <div class="fakemon-studio__stats-block-header">

            <div>

              <i class="fa-solid fa-chart-column"></i>

              <strong>
                Base Attributes
              </strong>

            </div>


            <small>
              Estadísticas base Poke5e
            </small>

          </div>


          <div class="fakemon-studio__stat-grid">

            ${
              ABILITY_IDS
                .map(
                  abilityId =>
                    renderAbilityStatCard(
                      abilityId,
                      draft.combat
                        ?.attributes
                        ?.[abilityId] ??
                      10
                    )
                )
                .join(
                  ""
                )
            }

          </div>

        </div>


        <div class="fakemon-studio__stats-block">

          <div class="fakemon-studio__stats-block-header">

            <div>

              <i class="fa-solid fa-graduation-cap"></i>

              <strong>
                Proficiencies
              </strong>

            </div>

          </div>

          ${renderFakemonProficiencies({
            skills:
              draft.combat
                ?.skills ??
              [],

            savingThrows:
              draft.combat
                ?.savingThrows ??
              [],

            language
          })}

        </div>


        <div class="fakemon-studio__stats-detail-grid">

          <div class="fakemon-studio__stats-block">

            <div class="fakemon-studio__stats-block-header">

              <div>

                <i class="fa-solid fa-person-running"></i>

                <strong>
                  Movement
                </strong>

              </div>

            </div>


            ${renderCollectionSection({
              title:
                "Velocidades",

              addAction:
                "add-speed",

              rows:
                draft.combat
                  ?.speed ??
                [],

              rowRenderer:
                renderFakemonSpeedRow
            })}

          </div>


          <div class="fakemon-studio__stats-block">

            <div class="fakemon-studio__stats-block-header">

              <div>

                <i class="fa-solid fa-eye"></i>

                <strong>
                  Senses
                </strong>

              </div>

            </div>


            ${renderCollectionSection({
              title:
                "Sentidos especiales",

              addAction:
                "add-sense",

              rows:
                draft.combat
                  ?.senses ??
                [],

              rowRenderer:
                renderFakemonSenseRow
            })}

          </div>

        </div>

      </section>


      ${renderMovesWorkspace({
        draft,
        levelMoves,
        moves,
        abilities,
        language,
        selectedTab
      })}


      <section
        class="fakemon-studio__panel"
        data-studio-tab="general"
        ${selectedTab === "general" ? "" : "hidden"}
      >

        <header>
          <i class="fa-solid fa-map"></i>
          <h3>Habitat & Catálogo</h3>
        </header>


        <div class="fakemon-studio__grid fakemon-studio__grid--3">

          ${renderField({
            label:
              "Región nativa",

            role:
              "native-region",

            value:
              draft.habitat
                ?.nativeRegion ??
              ""
          })}


          ${renderField({
            label:
              "Regiones",

            role:
              "regions",

            value:
              (
                draft.habitat
                  ?.regions ??
                []
              ).join(
                ", "
              )
          })}


          ${renderField({
            label:
              "Biomas",

            role:
              "biomes",

            value:
              (
                draft.habitat
                  ?.biomes ??
                []
              ).join(
                ", "
              )
          })}

        </div>


        <div class="fakemon-studio__toggles">

          ${renderCheckbox({
            label:
              "Especie habilitada",

            role:
              "enabled",

            checked:
              options.enabled !==
              false
          })}


          ${renderCheckbox({
            label:
              "Selección manual",

            role:
              "encounter-manual",

            checked:
              options.encounters
                ?.manual !==
              false
          })}

        </div>

      </section>

      <div
        data-studio-tab="evolution"
        ${selectedTab === "evolution" ? "" : "hidden"}
      >
        ${evolutionMarkup}
      </div>

      ${renderFakemonMediaEditor({
        media:
          draft.media,

        visible:
          selectedTab ===
            "media"
      })}

    </form>
  `;
}

function renderMovesWorkspace({
  draft,
  levelMoves,
  moves,
  abilities,
  language,
  selectedTab
}) {

  const abilityRows =
    draft.abilities ??
    [];

  const tmRows =
    draft.learnset
      ?.tms ??
    [];

  const eggMoveIds =
    draft.learnset
      ?.eggMoveIds ??
    [];


  return `
    <section
      class="fakemon-studio__panel fakemon-studio__panel--moves"
      data-studio-tab="moves"
      ${selectedTab === "moves" ? "" : "hidden"}
    >

      <header>

        <i class="fa-solid fa-bolt"></i>

        <h3>
          Moves & Abilities
        </h3>

        <small>
          ${abilityRows.length} Abilities
          · ${levelMoves.length} Moves
          · ${eggMoveIds.length} Egg
          · ${tmRows.length} TMs
        </small>

      </header>


      <div class="fakemon-studio__moves-top-grid">

        <section class="fakemon-studio__moves-card">

          <div class="fakemon-studio__moves-card-header">

            <div>

              <i class="fa-solid fa-sparkles"></i>

              <span>
                Abilities
              </span>

            </div>


            <button
              type="button"
              data-action="add-ability"
            >
              <i class="fa-solid fa-plus"></i>
              Agregar manual
            </button>

          </div>


          ${renderFakemonAbilityEditor({
            abilityRefs:
              abilityRows,

            catalog:
              abilities,

            language
          })}

        </section>


        <section
          class="
            fakemon-studio__moves-card
            fakemon-studio__moves-card--egg
          "
        >

          <div class="fakemon-studio__moves-card-header">

            <div>

              <i class="fa-solid fa-egg"></i>

              <span>
                Egg Moves
              </span>

            </div>


            <div class="fakemon-studio__moves-card-header-actions">

              <span class="fakemon-studio__moves-count">
                ${eggMoveIds.length}
              </span>

              <button
                type="button"
                data-action="add-egg-move"
              >
                <i class="fa-solid fa-plus"></i>
                Agregar manual
              </button>

            </div>

          </div>


          ${renderFakemonEggMoveEditor({
            moveIds:
              eggMoveIds,

            catalog:
              moves,

            language
          })}

        </section>

      </div>


      <section class="fakemon-studio__moves-card">

        <div class="fakemon-studio__moves-card-header">

          <div>

            <i class="fa-solid fa-book-open"></i>

            <span>
              Learnset por nivel
            </span>

          </div>


          <button
            type="button"
            data-action="add-level-move"
          >
            <i class="fa-solid fa-plus"></i>
            Agregar manual
          </button>

        </div>


        ${renderFakemonLevelMoveEditor({
          rows:
            levelMoves,

          catalog:
            moves,

          language
        })}

      </section>


      <section class="fakemon-studio__moves-card">

        <div class="fakemon-studio__moves-card-header">

          <div>

            <i class="fa-solid fa-compact-disc"></i>

            <span>
              Technical Machines
            </span>

          </div>


          <button
            type="button"
            data-action="add-tm"
          >
            <i class="fa-solid fa-plus"></i>
            Agregar manual
          </button>

        </div>


        ${renderFakemonTmEditor({
          rows:
            tmRows,

          catalog:
            moves,

          language
        })}

      </section>

    </section>
  `;
}

/* ============================================================
 * VALIDATION MARKUP
 * ============================================================ */

function renderValidation(
  validation
) {

  if (!validation) {
    return "";
  }


  const icon =
    validation.kind ===
      "success"
      ? "fa-solid fa-circle-check"
      : validation.kind ===
          "error"
        ? "fa-solid fa-triangle-exclamation"
        : "fa-solid fa-circle-info";


  return `
    <div
      class="fakemon-studio__validation"
      data-kind="${escapeAttribute(
        validation.kind
      )}"
    >

      <i class="${icon}"></i>

      <span>
        ${escapeHtml(
          validation.message
        )}
      </span>

    </div>
  `;
}


/* ============================================================
 * CATALOG DATALISTS
 * ============================================================ */

function renderCatalogDatalists(
  moves,
  abilities,
  language
) {

  const moveOptions =
    moves
      .filter(
        move =>
          move?.id
      )
      .map(
        move => `
          <option value="${escapeAttribute(
            move.id
          )}">
            ${escapeHtml(
              localizedCatalogName(
                move,
                language
              )
            )}
          </option>
        `
      )
      .join(
        ""
      );


  const abilityOptions =
    abilities
      .filter(
        ability =>
          ability?.id
      )
      .map(
        ability => `
          <option value="${escapeAttribute(
            ability.id
          )}">
            ${escapeHtml(
              localizedCatalogName(
                ability,
                language
              )
            )}
          </option>
        `
      )
      .join(
        ""
      );


  return `
    <datalist id="fakemon-studio-moves">
      ${moveOptions}
    </datalist>

    <datalist id="fakemon-studio-abilities">
      ${abilityOptions}
    </datalist>
  `;
}


/* ============================================================
 * COLLECTION MARKUP
 * ============================================================ */

function renderCollectionSection({
  title,
  addAction,
  rows,
  rowRenderer
}) {

  return `
    <div class="fakemon-studio__collection">

      <div class="fakemon-studio__collection-header">

        <strong>
          ${escapeHtml(
            title
          )}
        </strong>


        <button
          type="button"
          data-action="${escapeAttribute(
            addAction
          )}"
        >
          <i class="fa-solid fa-plus"></i>
          Agregar
        </button>

      </div>


      <div class="fakemon-studio__collection-rows">

        ${
          rows.length
            ? rows
                .map(
                  (
                    row,
                    index
                  ) =>
                    rowRenderer(
                      row,
                      index
                    )
                )
                .join(
                  ""
                )

            : '<span class="hint">Sin entradas.</span>'
        }

      </div>

    </div>
  `;
}

function renderAbilityStatCard(
  abilityId,
  value
) {

  const labels = {
    str:
      {
        name:
          "Strength",

        icon:
          "fa-solid fa-dumbbell"
      },

    dex:
      {
        name:
          "Dexterity",

        icon:
          "fa-solid fa-person-running"
      },

    con:
      {
        name:
          "Constitution",

        icon:
          "fa-solid fa-heart-pulse"
      },

    int:
      {
        name:
          "Intelligence",

        icon:
          "fa-solid fa-brain"
      },

    wis:
      {
        name:
          "Wisdom",

        icon:
          "fa-solid fa-eye"
      },

    cha:
      {
        name:
          "Charisma",

        icon:
          "fa-solid fa-comments"
      }
  };


  const definition =
    labels[
      abilityId
    ] ??
    {
      name:
        abilityId,

      icon:
        "fa-solid fa-circle"
    };


  return `
    <label class="fakemon-studio__stat-card">

      <span class="fakemon-studio__stat-card-icon">

        <i class="${definition.icon}"></i>

      </span>


      <span class="fakemon-studio__stat-card-copy">

        <strong>
          ${escapeHtml(
            abilityId.toUpperCase()
          )}
        </strong>

        <small>
          ${escapeHtml(
            definition.name
          )}
        </small>

      </span>


      <input
        type="number"
        data-role="attribute-${escapeAttribute(
          abilityId
        )}"
        min="1"
        step="1"
        value="${escapeAttribute(
          value
        )}"
      >

    </label>
  `;
}

/* ============================================================
 * GENERIC FIELDS
 * ============================================================ */

function renderField({
  label,
  role,
  value,
  readonly = false,
  hint = ""
}) {

  return `
    <label class="fakemon-studio__field">

      <span>
        ${escapeHtml(
          label
        )}
      </span>


      <input
        type="text"
        data-role="${escapeAttribute(
          role
        )}"
        value="${escapeAttribute(
          value ??
          ""
        )}"
        ${readonly ? "readonly" : ""}
      >


      ${
        hint
          ? `
            <small>
              ${escapeHtml(
                hint
              )}
            </small>
          `
          : ""
      }

    </label>
  `;
}


function renderNumberField({
  label,
  role,
  value,
  min = null,
  max = null,
  step = 1
}) {

  return `
    <label class="fakemon-studio__field">

      <span>
        ${escapeHtml(
          label
        )}
      </span>


      <input
        type="number"
        data-role="${escapeAttribute(
          role
        )}"
        value="${escapeAttribute(
          value ??
          ""
        )}"
        ${
          min == null
            ? ""
            : `min="${min}"`
        }
        ${
          max == null
            ? ""
            : `max="${max}"`
        }
        step="${escapeAttribute(
          step
        )}"
      >

    </label>
  `;
}


function renderTextarea({
  label,
  role,
  value
}) {

  return `
    <label class="fakemon-studio__field">

      <span>
        ${escapeHtml(
          label
        )}
      </span>


      <textarea
        data-role="${escapeAttribute(
          role
        )}"
        rows="4"
      >${escapeHtml(
        value ??
        ""
      )}</textarea>

    </label>
  `;
}


function renderSelectField({
  label,
  role,
  value,
  options
}) {

  return `
    <label class="fakemon-studio__field">

      <span>
        ${escapeHtml(
          label
        )}
      </span>


      <select
        data-role="${escapeAttribute(
          role
        )}"
      >

        ${
          options
            .map(
              option => `
                <option
                  value="${escapeAttribute(
                    option.value
                  )}"
                  ${
                    option.value ===
                      value
                      ? "selected"
                      : ""
                  }
                >
                  ${escapeHtml(
                    option.label
                  )}
                </option>
              `
            )
            .join(
              ""
            )
        }

      </select>

    </label>
  `;
}


function renderTypeSelect({
  label,
  role,
  value,
  language
}) {

  return renderSelectField({
    label,
    role,
    value,

    options:
      POKEMON_TYPE_IDS.map(
        type => ({
          value:
            type,

          label:
            pokemonTypeLabel(
              type,
              language
            )
        })
      )
  });
}


function renderSecondaryTypeSelect({
  role,
  value,
  language
}) {

  return renderSelectField({
    label:
      "Tipo secundario",

    role,
    value,

    options: [
      {
        value:
          "",

        label:
          "— Ninguno —"
      },

      ...POKEMON_TYPE_IDS.map(
        type => ({
          value:
            type,

          label:
            pokemonTypeLabel(
              type,
              language
            )
        })
      )
    ]
  });
}


function renderCheckbox({
  label,
  role,
  checked
}) {

  return `
    <label class="fakemon-studio__toggle">

      <input
        type="checkbox"
        data-role="${escapeAttribute(
          role
        )}"
        ${checked ? "checked" : ""}
      >

      <span>
        ${escapeHtml(
          label
        )}
      </span>

    </label>
  `;
}


/* ============================================================
 * REFERENCE VALIDATION
 * ============================================================ */

function validateSpeciesReferences(
  species,
  database
) {

  const abilityIds =
    new Set(
      (
        database?.abilities ??
        []
      )
        .map(
          entry =>
            String(
              entry?.id ??
              ""
            )
        )
        .filter(
          Boolean
        )
    );


  const moveIds =
    new Set(
      (
        database?.moves ??
        []
      )
        .map(
          entry =>
            String(
              entry?.id ??
              ""
            )
        )
        .filter(
          Boolean
        )
    );


  for (
    const ability
    of species.abilities
  ) {

    if (
      !abilityIds.has(
        ability.id
      )
    ) {

      throw new Error(
        `${species.id}: Ability inexistente: ${ability.id}.`
      );
    }
  }


  const referencedMoveIds = [
    ...species.learnset.level
      .flatMap(
        group =>
          group.moveIds
      ),

    ...species.learnset
      .eggMoveIds,

    ...species.learnset.tms
      .map(
        tm =>
          tm.moveId
      )
  ];


  const missingMoveId =
    referencedMoveIds.find(
      moveId =>
        !moveIds.has(
          moveId
        )
    );


  if (
    missingMoveId
  ) {

    throw new Error(
      `${species.id}: Move inexistente: ${missingMoveId}.`
    );
  }
}


/* ============================================================
 * COLLECTION HELPERS
 * ============================================================ */

function groupLevelMoves(
  rows
) {

  const groups =
    new Map();


  for (
    const row
    of rows
  ) {

    const moveId =
      String(
        row.moveId ??
        ""
      ).trim();


    if (!moveId) {
      continue;
    }


    const numericLevel =
      Number(
        row.level
      );


    const level =
      Number.isFinite(
        numericLevel
      )
        ? Math.trunc(
            numericLevel
          )
        : row.level;


    const moveIds =
      groups.get(
        level
      ) ??
      [];


    if (
      !moveIds.includes(
        moveId
      )
    ) {

      moveIds.push(
        moveId
      );
    }


    groups.set(
      level,
      moveIds
    );
  }


  return [
    ...groups.entries()
  ].map(
    (
      [
        level,
        moveIds
      ]
    ) => ({
      level,
      moveIds
    })
  );
}


function collectionForAction(
  draft,
  action
) {

  if (
    action ===
      "add-ability"
  ) {

    draft.abilities ??=
      [];

    return draft.abilities;
  }


  if (
    action ===
      "add-level-move"
  ) {

    draft.levelMoves ??=
      [];

    return draft.levelMoves;
  }

  if (
    action ===
      "add-egg-move"
  ) {

    draft.learnset ??=
      {};

    draft.learnset.eggMoveIds ??=
      [];

    return draft.learnset.eggMoveIds;
  }

  if (
    action ===
      "add-tm"
  ) {

    draft.learnset ??=
      {};

    draft.learnset.tms ??=
      [];

    return draft.learnset.tms;
  }


  if (
    action ===
      "add-speed"
  ) {

    draft.combat ??=
      {};

    draft.combat.speed ??=
      [];

    return draft.combat.speed;
  }


  draft.combat ??=
    {};

  draft.combat.senses ??=
    [];

  return draft.combat.senses;
}


function collectionForRemoveAction(
  draft,
  action
) {

  const mapping = {
    "remove-ability":
      draft.abilities,

    "remove-level-move":
      draft.levelMoves,

    "remove-egg-move":
      draft.learnset?.eggMoveIds,

    "remove-tm":
      draft.learnset?.tms,

    "remove-speed":
      draft.combat?.speed,

    "remove-sense":
      draft.combat?.senses
  };


  return (
    mapping[
      action
    ] ??
    null
  );
}


function readRows(
  root,
  role,
  mapper
) {

  return [
    ...root.querySelectorAll(
      `[data-role="${role}"]`
    )
  ].map(
    mapper
  );
}

function readCheckedValues(
  root,
  role
) {

  return [
    ...root.querySelectorAll(
      `[data-role="${role}"]:checked`
    )
  ]
    .map(
      input =>
        String(
          input.value ??
          ""
        ).trim()
    )
    .filter(
      Boolean
    );
}

function splitCsv(
  value
) {

  return String(
    value ??
    ""
  )
    .split(
      ","
    )
    .map(
      entry =>
        entry.trim()
    )
    .filter(
      Boolean
    );
}

function uniqueStrings(
  values
) {

  return [
    ...new Set(
      (
        Array.isArray(
          values
        )
          ? values
          : []
      )
        .map(
          value =>
            String(
              value ??
              ""
            ).trim()
        )
        .filter(
          Boolean
        )
    )
  ];
}

function emptyToNull(
  value
) {

  const text =
    String(
      value ??
      ""
    ).trim();


  return (
    text ||
    null
  );
}

/* ============================================================
 * OFFICIAL TEMPLATE PICKER
 * ============================================================ */

function renderOfficialTemplatePicker(
  species,
  language
) {

  const options =
    species
      .map(
        entry => {

          const typeLabel =
            (
              entry.types ??
              []
            )
              .map(
                type =>
                  pokemonTypeLabel(
                    type,
                    language
                  )
              )
              .join(
                " / "
              );


          const label = [
            localizedCatalogName(
              entry,
              language
            ),

            typeLabel,

            `SR ${String(
              entry.sr ??
              "?"
            )}`
          ]
            .filter(
              Boolean
            )
            .join(
              " · "
            );


          return `
            <option
              value="${escapeAttribute(
                entry.id
              )}"
              label="${escapeAttribute(
                label
              )}"
            ></option>
          `;
        }
      )
      .join(
        ""
      );


  return `
    <div class="fakemon-template-picker">

      <p class="fakemon-template-picker__intro">
        Selecciona una especie oficial de Poke5e para usarla
        como punto de partida.
      </p>


      <label class="fakemon-template-picker__field">

        <span>
          Pokémon base
        </span>

        <input
          type="text"
          name="sourceId"
          list="fakemon-template-species"
          placeholder="Escribe un nombre o ID, por ejemplo dragonair"
          autocomplete="off"
          required
          autofocus
        >

      </label>


      <datalist id="fakemon-template-species">
        ${options}
      </datalist>


      <div class="fakemon-template-picker__notice">

        <i class="fa-solid fa-copy"></i>

        <div>

          <strong>
            Se crea una copia independiente
          </strong>

          <span>
            Se copian Stats, tipos, SR, nivel, Biology,
            Abilities, Moves, TMs, Habitat y Media.
            Las Evolutions no se copian y el Pokédex # parte en 0.
          </span>

        </div>

      </div>

    </div>
  `;
}

/* ============================================================
 * BACKUP MARKUP
 * ============================================================ */

function renderBackupFilePicker() {

  return `
    <div class="fakemon-backup-picker">

      <p class="fakemon-backup-picker__intro">
        Selecciona un backup JSON exportado por Fakemon Studio.
        El archivo será analizado antes de modificar el world.
      </p>


      <label class="fakemon-backup-picker__field">

        <span>
          Archivo JSON
        </span>

        <input
          type="file"
          name="backupFile"
          accept=".json,application/json"
          required
        >

      </label>


      <div class="fakemon-backup-picker__notice">

        <i class="fa-solid fa-shield-halved"></i>

        <div>

          <strong>
            Restauración segura
          </strong>

          <span>
            El backup se normaliza y valida contra el catálogo
            Poke5e actual antes de reemplazar los Fakemon guardados.
          </span>

        </div>

      </div>

    </div>
  `;
}


function renderBackupRestoreConfirmation({
  filename,
  summary
}) {

  return `
    <div class="fakemon-backup-confirm">

      <p>
        El archivo
        <strong>
          ${escapeHtml(
            filename
          )}
        </strong>
        pasó la validación previa.
      </p>


      <div class="fakemon-backup-confirm__summary">

        <span>
          <strong>
            ${summary.speciesCount}
          </strong>
          especies
        </span>

        <span>
          <strong>
            ${summary.enabledSpeciesCount}
          </strong>
          habilitadas
        </span>

        <span>
          <strong>
            ${summary.evolutionCount}
          </strong>
          Evolutions
        </span>

        <span>
          <strong>
            v${summary.schemaVersion}
          </strong>
          schema
        </span>

      </div>


      <p class="fakemon-backup-confirm__warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
        Esto reemplazará por completo el catálogo Fakemon actual.
      </p>

    </div>
  `;
}

/* ============================================================
 * DISPLAY HELPERS
 * ============================================================ */

function currentLanguage() {

  try {

    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
      ? "en"
      : "es";

  } catch {

    return "es";
  }
}


function pokemonTypeLabel(
  type,
  language
) {

  return (
    POKEMON_TYPES[
      type
    ]?.[language] ??
    POKEMON_TYPES[
      type
    ]?.en ??
    type
  );
}


function localizedCatalogName(
  entry,
  language
) {

  const name =
    entry?.name;


  if (
    typeof name ===
      "string"
  ) {

    return name;
  }


  if (
    name &&
    typeof name ===
      "object"
  ) {

    return String(
      name[language] ??
      name.en ??
      name.es ??
      entry.id
    );
  }


  return String(
    entry?.id ??
    ""
  );
}

function catalogNameMap(
  entries,
  language
) {

  return new Map(
    (
      Array.isArray(
        entries
      )
        ? entries
        : []
    )
      .filter(
        entry =>
          entry?.id
      )
      .map(
        entry => [
          String(
            entry.id
          ),

          localizedCatalogName(
            entry,
            language
          )
        ]
      )
  );
}

function nextCopyId(
  sourceId,
  customIds,
  allIds
) {

  const base =
    `${sourceId}-copy`;


  let candidate =
    base;


  let suffix =
    2;


  while (
    customIds.has(
      candidate
    ) ||
    allIds.has(
      candidate
    )
  ) {

    candidate =
      `${base}-${suffix}`;

    suffix +=
      1;
  }


  return candidate;
}


function compareSpecies(
  left,
  right
) {

  return String(
    left?.name ??
    left?.id ??
    ""
  ).localeCompare(
    String(
      right?.name ??
      right?.id ??
      ""
    ),
    "es",
    {
      sensitivity:
        "base"
    }
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