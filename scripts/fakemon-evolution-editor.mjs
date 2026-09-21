import {
  FAKEMON_EVOLUTION_ABILITY_SCORE_MODES,
  FAKEMON_EVOLUTION_CONDITION_TYPES
} from "./fakemon-model.mjs";

import {
  fakemonRepository
} from "./fakemon-repository.mjs";

import {
  buildEvolutionStudioContext,
  evolutionIdentity,
  validateFakemonEvolutionDefinition
} from "./fakemon-evolution-service.mjs";

import {
  POKEMON_TYPE_IDS,
  POKEMON_TYPES
} from "./types.mjs";


const MODULE_ID =
  "poke5e-local";

const EVOLUTION_GENDER_OPTIONS =
  Object.freeze([
    {
      value:
        "male",

      es:
        "Macho",

      en:
        "Male"
    },

    {
      value:
        "female",

      es:
        "Hembra",

      en:
        "Female"
    }
  ]);


const EVOLUTION_TIME_SUGGESTIONS =
  Object.freeze([
    {
      value:
        "morning",

      es:
        "Mañana",

      en:
        "Morning"
    },

    {
      value:
        "afternoon",

      es:
        "Tarde",

      en:
        "Afternoon"
    },

    {
      value:
        "day",

      es:
        "Día",

      en:
        "Day"
    },

    {
      value:
        "night",

      es:
        "Noche",

      en:
        "Night"
    }
  ]);

const {
  DialogV2
} =
  foundry.applications.api;

export class FakemonEvolutionEditor {

  constructor() {

    this.state = {
      draft:
        null,

      currentIdentity:
        null,

      validation:
        null,

      dirty:
        false,

      busy:
        false
    };
  }


  reset() {

    this.#resetDraft();

    this.state.busy =
      false;
  }

  loadDraft(
    definition,
    {
      validation =
        null
    } = {}
  ) {

    this.state.draft =
      foundry.utils.deepClone(
        definition
      );

    this.state.currentIdentity =
      null;

    this.state.validation =
      validation;

    this.state.dirty =
      true;

    this.state.busy =
      false;
  }

  hasUnsavedChanges() {
    return (
      this.state.dirty ===
        true
    );
  }


  captureCurrentDraft(
    root
  ) {

    this.#captureDraft(
      root
    );
  }


  render({
    database,
    speciesId,
    language
  }) {

    if (!speciesId) {

      return `
        <section class="fakemon-studio__panel">

          <header>
            <i class="fa-solid fa-code-branch"></i>
            <h3>Evolution</h3>
          </header>

          <p class="hint">
            Guarda primero la especie para administrar sus Evolutions.
          </p>

        </section>
      `;
    }


    const store =
      fakemonRepository.snapshot();


    const context =
      buildEvolutionStudioContext({
        database,

        fakemonStore:
          store,

        speciesId
      });


    return `
      ${renderEvolutionDatalists({
        species:
          context.species,

        moves:
          database?.moves ??
          [],

        items:
          database?.items ??
          [],

        language
      })}


      <section
        class="fakemon-studio__panel fakemon-studio__evolution-panel"
      >

        <header>
          <i class="fa-solid fa-code-branch"></i>

          <h3>
            Evolution
          </h3>
        </header>


        <div class="fakemon-studio__evolution-toolbar">

          <button
            type="button"
            data-evolution-action="new-incoming"
            ${this.state.busy ? "disabled" : ""}
          >
            <i class="fa-solid fa-arrow-right-to-bracket"></i>
            Nueva entrante
          </button>


          <button
            type="button"
            data-evolution-action="new-outgoing"
            ${this.state.busy ? "disabled" : ""}
          >
            <i class="fa-solid fa-arrow-right-from-bracket"></i>
            Nueva saliente
          </button>

        </div>


        <div class="fakemon-studio__evolution-columns">

          ${renderEvolutionRelationGroup({
            title:
              "Entrantes",

            icon:
              "fa-solid fa-arrow-right-to-bracket",

            entries:
              context.incoming,

            species:
              context.species,

            language
          })}


          ${renderEvolutionRelationGroup({
            title:
              "Salientes",

            icon:
              "fa-solid fa-arrow-right-from-bracket",

            entries:
              context.outgoing,

            species:
              context.species,

            language
          })}

        </div>


        ${
          this.state.draft

            ? renderEvolutionForm({
                draft:
                  this.state.draft,

                currentIdentity:
                  this.state.currentIdentity,

                validation:
                  this.state.validation,

                dirty:
                  this.state.dirty,

                language,

                busy:
                  this.state.busy
              })

            : ""
        }

      </section>
    `;
  }


  bind(
    root,
    {
      database,
      speciesId,
      requestRender
    }
  ) {

    if (!speciesId) {
      return;
    }

    this.#bindDirtyTracking(
      root
    );

    root
      .querySelector(
        '[data-evolution-action="new-incoming"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardDraft()
          ) {
            return;
          }


          this.#startNew(
            "incoming",
            speciesId
          );

          requestRender?.();
        }
      );


    root
      .querySelector(
        '[data-evolution-action="new-outgoing"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardDraft()
          ) {
            return;
          }


          this.#startNew(
            "outgoing",
            speciesId
          );

          requestRender?.();
        }
      );


    root
      .querySelectorAll(
        '[data-evolution-action="edit"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {
              if (
                !await this.#confirmDiscardDraft()
              ) {
                return;
              }


              const identity =
                String(
                  button.dataset
                    .evolutionIdentity ??
                  ""
                );


              const evolution =
                fakemonRepository
                  .evolutions
                  .find(
                    entry =>
                      evolutionIdentity(
                        entry
                      ) ===
                        identity
                  );


              if (!evolution) {

                ui.notifications.warn(
                  "Evolution Fakemon no encontrada."
                );

                return;
              }


              this.state.draft =
                foundry.utils.deepClone(
                  evolution
                );


              this.state.currentIdentity =
                identity;


              this.state.validation =
                null;

              this.state.dirty =
                false;


              requestRender?.();
            }
          );
        }
      );


    root
      .querySelectorAll(
        '[data-evolution-action="delete"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {
              this.#captureDraft(
                root
              );
              void this.#deleteEvolution(
                button.dataset,
                requestRender
              );
            }
          );
        }
      );

    root
      .querySelector(
        '[data-evolution-action="cancel"]'
      )
      ?.addEventListener(
        "click",
        async () => {

          if (
            !await this.#confirmDiscardDraft()
          ) {
            return;
          }


          this.#resetDraft();

          requestRender?.();
        }
      );


    root
      .querySelector(
        '[data-evolution-action="add-condition"]'
      )
      ?.addEventListener(
        "click",
        () => {

          this.#captureDraft(
            root
          );


          this.state.draft
            .conditions
            .push({
              type:
                "level",

              value:
                1
            });


          this.state.validation =
            null;

          this.state.dirty =
            true;

          requestRender?.();
        }
      );


    root
      .querySelectorAll(
        '[data-evolution-action="delete-condition"]'
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              this.#captureDraft(
                root
              );


              const index =
                Number(
                  button.dataset.index
                );


              if (
                !Number.isInteger(
                  index
                )
              ) {
                return;
              }


              this.state.draft
                .conditions
                .splice(
                  index,
                  1
                );


              this.state.validation =
                null;

              this.state.dirty =
                true;

              requestRender?.();
            }
          );
        }
      );


    /*
    * Cambiar el tipo de condición reconstruye
    * solo esa entrada.
    *
    * El valor anterior no se reutiliza porque
    * pertenece a otro contrato.
    *
    * Ej:
    * "night" -> level no debe convertirse en NaN.
    */
    root
      .querySelectorAll(
        '[data-role="evolution-condition-type"]'
      )
      .forEach(
        select => {

          select.addEventListener(
            "change",
            () => {

              const row =
                select.closest(
                  '[data-role="evolution-condition-row"]'
                );


              const index =
                Number(
                  row?.dataset.index
                );


              const draft =
                this.#readDraft(
                  root
                );


              if (
                !Number.isInteger(
                  index
                ) ||
                !draft.conditions[
                  index
                ]
              ) {
                return;
              }


              const type =
                String(
                  select.value ??
                  ""
                );


              draft.conditions[
                index
              ] = {
                type,

                value:
                  defaultConditionValue(
                    type
                  )
              };


              this.state.draft =
                draft;


              this.state.validation =
                null;

              this.state.dirty =
                true;

              requestRender?.();
            }
          );
        }
      );


    root
      .querySelector(
        '[data-evolution-action="validate"]'
      )
      ?.addEventListener(
        "click",
        () => {

          this.#validate(
            root,
            database
          );


          requestRender?.();
        }
      );


    root
      .querySelector(
        '[data-evolution-action="save"]'
      )
      ?.addEventListener(
        "click",
        () => {

          void this.#save(
            root,
            database,
            requestRender
          );
        }
      );
  }

  #bindDirtyTracking(
    root
  ) {

    const editor =
      root.querySelector(
        ".fakemon-studio__evolution-editor"
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
          )
        ) {
          return;
        }


        this.state.dirty =
          true;


        this.#syncDirtyIndicator(
          root
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


    this.#syncDirtyIndicator(
      root
    );
  }


  #syncDirtyIndicator(
    root
  ) {

    const indicator =
      root.querySelector(
        "[data-evolution-dirty-indicator]"
      );


    if (!indicator) {
      return;
    }


    indicator.dataset.dirty =
      String(
        this.state.dirty ===
          true
      );
  }


  async #confirmDiscardDraft() {
    if (
      !this.hasUnsavedChanges()
    ) {
      return true;
    }


    const confirmed =
      await DialogV2.confirm({
        window: {
          title:
            "Cambios en Evolution"
        },

        content: `
          <p>
            Hay cambios sin guardar en la
            <strong>Evolution</strong>.
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

  #startNew(
    direction,
    speciesId
  ) {

    const normalizedSpeciesId =
      String(
        speciesId ??
        ""
      )
        .trim()
        .toLowerCase();


    this.state.draft = {
      /*
       * null permite que normalizeFakemonEvolution()
       * genere automáticamente:
       *
       * from-to-target
       */
      id:
        null,

      from:
        direction ===
          "outgoing"

          ? normalizedSpeciesId

          : "",

      to:
        direction ===
          "incoming"

          ? normalizedSpeciesId

          : "",

      abilityScoreMode:
        "standard",

      conditions:
        [],

      effects: [
        {
          type:
            "asi",

          value:
            0
        }
      ]
    };


    this.state.currentIdentity =
      null;


    this.state.validation =
      null;

    this.state.dirty =
      false;
  }


  #captureDraft(
    root
  ) {

    if (
      !this.state.draft
    ) {
      return;
    }


    this.state.draft =
      this.#readDraft(
        root
      );
  }


  #readDraft(
    root
  ) {

    const value =
      role =>
        root
          .querySelector(
            `[data-role="${role}"]`
          )
          ?.value ??
        "";


    const conditions =
      [
        ...root.querySelectorAll(
          '[data-role="evolution-condition-row"]'
        )
      ].map(
        row => {

          const type =
            row
              .querySelector(
                '[data-role="evolution-condition-type"]'
              )
              ?.value ??
            "";


          const rawValue =
            row
              .querySelector(
                '[data-role="evolution-condition-value"]'
              )
              ?.value ??
            "";


          return {
            type,

            value:
              readConditionValue(
                type,
                rawValue
              )
          };
        }
      );


    return {
      id:
        emptyToNull(
          value(
            "evolution-id"
          )
        ),

      from:
        value(
          "evolution-from"
        ),

      to:
        value(
          "evolution-to"
        ),

      abilityScoreMode:
        value(
          "evolution-ability-score-mode"
        ) ||
        "standard",
      conditions,

      effects: [
        {
          type:
            "asi",

          value:
            Number(
              value(
                "evolution-points"
              )
            )
        }
      ]
    };
  }


  #validate(
    root,
    database
  ) {

    try {

      const draft =
        this.#readDraft(
          root
        );


      this.state.draft =
        draft;


      const evolution =
        validateFakemonEvolutionDefinition({
          definition:
            draft,

          database,

          fakemonStore:
            fakemonRepository
              .snapshot(),

          currentIdentity:
            this.state
              .currentIdentity
        });


      this.state.draft =
        evolution;


      this.state.validation = {
        kind:
          "success",

        message:
          `${evolution.from} → ${evolution.to} es una Evolution válida.`
      };

    } catch (
      error
    ) {

      this.state.validation = {
        kind:
          "error",

        message:
          error.message
      };
    }
  }


  async #save(
    root,
    database,
    requestRender
  ) {

    if (
      this.state.busy
    ) {
      return;
    }


    let evolution;


    try {

      const draft =
        this.#readDraft(
          root
        );


      this.state.draft =
        draft;


      evolution =
        validateFakemonEvolutionDefinition({
          definition:
            draft,

          database,

          fakemonStore:
            fakemonRepository
              .snapshot(),

          currentIdentity:
            this.state
              .currentIdentity
        });

    } catch (
      error
    ) {

      this.state.validation = {
        kind:
          "error",

        message:
          error.message
      };


      requestRender?.();

      return;
    }


    this.state.busy =
      true;


    try {

      await fakemonRepository
        .saveEvolution(
          evolution
        );


      await fakemonRepository
        .load();


      this.#resetDraft();


      ui.notifications.info(
        `Evolution ${evolution.from} → ${evolution.to} guardada.`
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error guardando Evolution Fakemon`,
        error
      );


      this.state.validation = {
        kind:
          "error",

        message:
          error.message
      };


      ui.notifications.error(
        error.message
      );

    } finally {

      this.state.busy =
        false;


      requestRender?.();
    }
  }


  async #deleteEvolution(
    dataset,
    requestRender
  ) {

    const id =
      String(
        dataset.evolutionId ??
        ""
      );


    const from =
      String(
        dataset.evolutionFrom ??
        ""
      );


    const to =
      String(
        dataset.evolutionTo ??
        ""
      );


    if (
      !id ||
      !from ||
      !to
    ) {
      return;
    }


    const confirmed =
      await DialogV2.confirm({
        window: {
          title:
            "Eliminar Evolution"
        },

        content: `
          <p>
            ¿Eliminar la Evolution
            <strong>
              ${escapeHtml(
                from
              )}
              →
              ${escapeHtml(
                to
              )}
            </strong>?
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


    this.state.busy =
      true;


    try {

      await fakemonRepository
        .deleteEvolution({
          id,
          from,
          to
        });


      await fakemonRepository
        .load();


      if (
        this.state.currentIdentity ===
          evolutionIdentity({
            id,
            from,
            to
          })
      ) {
        this.#resetDraft();
      }


      ui.notifications.info(
        `Evolution ${from} → ${to} eliminada.`
      );

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error eliminando Evolution Fakemon`,
        error
      );


      ui.notifications.error(
        error.message
      );

    } finally {

      this.state.busy =
        false;


      requestRender?.();
    }
  }


  #resetDraft() {

    this.state.draft =
      null;


    this.state.currentIdentity =
      null;


    this.state.validation =
      null;

    this.state.dirty =
      false;
  }
}


/* ============================================================
 * RELATIONSHIPS
 * ============================================================ */

function renderEvolutionRelationGroup({
  title,
  icon,
  entries,
  species,
  language
}) {

  const speciesById =
    new Map(
      species.map(
        entry => [
          String(
            entry.id
          ),

          entry
        ]
      )
    );


  return `
    <div class="fakemon-studio__evolution-group">

      <div class="fakemon-studio__evolution-group-header">

        <i class="${icon}"></i>

        <strong>
          ${escapeHtml(
            title
          )}
        </strong>

        <span>
          ${entries.length}
        </span>

      </div>


      <div class="fakemon-studio__evolution-list">

        ${
          entries.length

            ? entries
                .map(
                  entry =>
                    renderEvolutionCard({
                      entry,
                      speciesById,
                      language
                    })
                )
                .join(
                  ""
                )

            : `
                <div class="fakemon-studio__evolution-empty">
                  Sin Evolutions.
                </div>
              `
        }

      </div>

    </div>
  `;
}


function renderEvolutionCard({
  entry,
  speciesById,
  language
}) {

  const evolution =
    entry.evolution;


  const from =
    speciesById.get(
      String(
        evolution.from
      )
    );


  const to =
    speciesById.get(
      String(
        evolution.to
      )
    );


  const fromLabel =
    localizedName(
      from,
      language,
      evolution.from
    );


  const toLabel =
    localizedName(
      to,
      language,
      evolution.to
    );


  const identity =
    evolutionIdentity(
      evolution
    );


  return `
    <article class="fakemon-studio__evolution-card">

      <div class="fakemon-studio__evolution-card-route">

        <div
          class="fakemon-studio__evolution-route-node"
          data-kind="from"
        >
          <span>
            <i class="fa-solid fa-circle-dot"></i>
          </span>

          <div>
            <small>
              Origen
            </small>

            <strong>
              ${escapeHtml(
                fromLabel
              )}
            </strong>

            <em>
              ${escapeHtml(
                evolution.from
              )}
            </em>
          </div>
        </div>


        <div class="fakemon-studio__evolution-card-arrow">
          <i class="fa-solid fa-arrow-right"></i>
        </div>


        <div
          class="fakemon-studio__evolution-route-node"
          data-kind="to"
        >
          <span>
            <i class="fa-solid fa-location-dot"></i>
          </span>

          <div>
            <small>
              Destino
            </small>

            <strong>
              ${escapeHtml(
                toLabel
              )}
            </strong>

            <em>
              ${escapeHtml(
                evolution.to
              )}
            </em>
          </div>
        </div>

      </div>


      <div class="fakemon-studio__evolution-condition-badges">

        ${renderConditionBadges(
          evolution.conditions,
          language
        )}

      </div>


      <div class="fakemon-studio__evolution-card-meta">

        <span class="fakemon-studio__evolution-points-badge">
          <i class="fa-solid fa-chart-line"></i>

          ${escapeHtml(
            String(
              evolutionPoints(
                evolution
              )
            )
          )}
          Evolution Points
        </span>


        <span
          class="fakemon-studio__evolution-badge"
          data-kind="${entry.custom ? "custom" : "official"}"
        >
          ${entry.custom ? "Fakemon" : "Poke5e"}
        </span>


        ${
          entry.custom

            ? `
                <div class="fakemon-studio__evolution-card-actions">

                  <button
                    type="button"
                    data-evolution-action="edit"
                    data-evolution-identity="${escapeAttribute(
                      identity
                    )}"
                    title="Editar Evolution"
                  >
                    <i class="fa-solid fa-pen"></i>
                  </button>

                  <button
                    type="button"
                    data-evolution-action="delete"
                    data-evolution-id="${escapeAttribute(
                      evolution.id
                    )}"
                    data-evolution-from="${escapeAttribute(
                      evolution.from
                    )}"
                    data-evolution-to="${escapeAttribute(
                      evolution.to
                    )}"
                    title="Eliminar Evolution"
                  >
                    <i class="fa-solid fa-trash"></i>
                  </button>

                </div>
              `

            : `
                <span
                  class="fakemon-studio__evolution-readonly"
                  title="Evolution Poke5e de solo lectura"
                >
                  <i class="fa-solid fa-lock"></i>
                  Solo lectura
                </span>
              `
        }

      </div>

    </article>
  `;
}


/* ============================================================
 * FORM
 * ============================================================ */

function renderEvolutionForm({
  draft,
  currentIdentity,
  validation,
  dirty,
  language,
  busy
}) {

  const editing =
    Boolean(
      currentIdentity
    );


  const points =
    evolutionPoints(
      draft
    );


  return `
    <div class="fakemon-studio__evolution-editor">

      <div class="fakemon-studio__evolution-editor-header">

        <div>

          <small>
            ${editing ? "Editando Evolution" : "Nueva Evolution"}
          </small>

          <strong>
            ${escapeHtml(
              draft.from ||
              "?"
            )}
            →
            ${escapeHtml(
              draft.to ||
              "?"
            )}
          </strong>

        </div>


        <div class="fakemon-studio__evolution-editor-header-actions">

          <span
            class="fakemon-studio__dirty-indicator fakemon-studio__dirty-indicator--evolution"
            data-evolution-dirty-indicator
            data-dirty="${dirty ? "true" : "false"}"
          >
            <i class="fa-solid fa-circle"></i>
            Cambios sin guardar
          </span>


          <button
            type="button"
            data-evolution-action="cancel"
          >
            <i class="fa-solid fa-xmark"></i>
            Cerrar
          </button>

        </div>

      </div>


      ${renderEvolutionValidation(
        validation
      )}


      <div class="fakemon-studio__grid fakemon-studio__grid--3">

        ${renderEvolutionTextField({
          label:
            "ID",

          role:
            "evolution-id",

          value:
            draft.id ??
            "",

          readonly:
            editing,

          placeholder:
            "Se genera desde from/to si se deja vacío"
        })}


        ${renderEvolutionTextField({
          label:
            "Origen",

          role:
            "evolution-from",

          value:
            draft.from ??
            "",

          readonly:
            editing,

          list:
            "fakemon-evolution-species"
        })}


        ${renderEvolutionTextField({
          label:
            "Destino",

          role:
            "evolution-to",

          value:
            draft.to ??
            "",

          readonly:
            editing,

          list:
            "fakemon-evolution-species"
        })}

      </div>


      <div class="fakemon-studio__evolution-subsection">

        <div class="fakemon-studio__collection-header">

          <strong>
            Conditions
          </strong>

          <button
            type="button"
            data-evolution-action="add-condition"
          >
            <i class="fa-solid fa-plus"></i>
            Agregar condición
          </button>

        </div>


        <div class="fakemon-studio__evolution-condition-list">

          ${
            draft.conditions?.length

              ? draft.conditions
                  .map(
                    (
                      condition,
                      index
                    ) =>
                      renderConditionRow({
                        condition,
                        index,
                        language
                      })
                  )
                  .join(
                    ""
                  )

              : `
                  <p class="hint">
                    Agrega al menos una condición.
                  </p>
                `
          }

        </div>

      </div>


      <div class="fakemon-studio__evolution-subsection">

        <strong>
          Effect
        </strong>

        <label class="fakemon-studio__field">
          <span>
            ${
              language === "en"
                ? "Ability Score Mode"
                : "Modo de Ability Scores"
            }
          </span>

          <select
            data-role="evolution-ability-score-mode"
          >
            ${renderAbilityScoreModeOptions(
              draft.abilityScoreMode,
              language
            )}
          </select>

          <small>
            ${
              language === "en"
                ? "Standard keeps Poke5e's normal cap. Tradeoff allows exceptional custom Evolutions to exceed 20 by sacrificing other Ability Scores."
                : "Standard mantiene el límite normal de Poke5e. Tradeoff permite que Evolutions custom excepcionales superen 20 sacrificando otros Ability Scores."
            }
          </small>

        </label>

        <div class="fakemon-studio__evolution-points">

          <span>
            ASI / Evolution Points
          </span>

          <input
            type="number"
            data-role="evolution-points"
            min="0"
            step="1"
            value="${escapeAttribute(
              points
            )}"
          >

        </div>


        <p class="hint">
          Se utiliza un único efecto ASI porque es el formato estándar ejecutable por el Evolution Engine actual.
        </p>

      </div>


      <div class="fakemon-studio__evolution-editor-actions">

        <button
          type="button"
          data-evolution-action="validate"
          ${busy ? "disabled" : ""}
        >
          <i class="fa-solid fa-check"></i>
          Validar
        </button>


        <button
          type="button"
          class="primary"
          data-evolution-action="save"
          ${busy ? "disabled" : ""}
        >
          <i class="fa-solid fa-floppy-disk"></i>
          ${busy ? "Guardando…" : "Guardar Evolution"}
        </button>

      </div>

    </div>
  `;
}

function renderAbilityScoreModeOptions(
  selected,
  language
) {

  const normalized =
    String(
      selected ??
      "standard"
    );


  const labels = {
    standard: {
      es:
        "Standard Poke5e · máximo 20",

      en:
        "Standard Poke5e · maximum 20"
    },

    tradeoff: {
      es:
        "Tradeoff · hasta 24 con sacrificios",

      en:
        "Tradeoff · up to 24 with sacrifices"
    }
  };


  return FAKEMON_EVOLUTION_ABILITY_SCORE_MODES
    .map(
      mode => `
        <option
          value="${escapeAttribute(
            mode
          )}"
          ${mode === normalized ? "selected" : ""}
        >
          ${escapeHtml(
            labels[
              mode
            ]?.[
              language
            ] ??
            mode
          )}
        </option>
      `
    )
    .join(
      ""
    );
}

function renderConditionRow({
  condition,
  index,
  language
}) {

  const type =
    String(
      condition?.type ??
      "level"
    );


  return `
    <div
      class="fakemon-studio__evolution-condition"
      data-role="evolution-condition-row"
      data-index="${index}"
      data-condition-type="${escapeAttribute(
        type
      )}"
    >

      <div class="fakemon-studio__evolution-condition-header">

        <span class="fakemon-studio__evolution-condition-icon">
          <i class="${conditionTypeIcon(
            type
          )}"></i>
        </span>


        <select
          data-role="evolution-condition-type"
          aria-label="Tipo de condición"
        >

          ${
            FAKEMON_EVOLUTION_CONDITION_TYPES
              .map(
                conditionType => `
                  <option
                    value="${escapeAttribute(
                      conditionType
                    )}"
                    ${
                      conditionType ===
                        type

                        ? "selected"

                        : ""
                    }
                  >
                    ${escapeHtml(
                      conditionTypeLabel(
                        conditionType,
                        language
                      )
                    )}
                  </option>
                `
              )
              .join(
                ""
              )
          }

        </select>


        <button
          type="button"
          class="fakemon-studio__remove"
          data-evolution-action="delete-condition"
          data-index="${index}"
          title="Eliminar condición"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

      </div>


      ${renderConditionValue({
        condition,
        language
      })}

    </div>
  `;
}

function renderConditionValue({
  condition,
  language
}) {

  const type =
    String(
      condition?.type ??
      ""
    );


  const value =
    condition?.value ??
    "";


  if (
    type ===
      "level"
  ) {

    return renderConditionValueShell({
      control: `
        <input
          type="number"
          data-role="evolution-condition-value"
          min="1"
          max="20"
          step="1"
          value="${escapeAttribute(
            value
          )}"
        >
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "gender"
  ) {

    return renderConditionValueShell({
      control: `
        <select
          data-role="evolution-condition-value"
        >
          ${renderGenderOptions(
            value,
            language
          )}
        </select>
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "move"
  ) {

    return renderConditionValueShell({
      control: `
        <input
          type="text"
          data-role="evolution-condition-value"
          list="fakemon-evolution-moves"
          placeholder="move-id"
          value="${escapeAttribute(
            value
          )}"
        >
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "move-type"
  ) {

    return renderConditionValueShell({
      control: `
        <select
          data-role="evolution-condition-value"
        >

          ${
            POKEMON_TYPE_IDS
              .map(
                pokemonType => `
                  <option
                    value="${escapeAttribute(
                      pokemonType
                    )}"
                    ${
                      pokemonType ===
                        value

                        ? "selected"

                        : ""
                    }
                  >
                    ${escapeHtml(
                      pokemonTypeLabel(
                        pokemonType,
                        language
                      )
                    )}
                  </option>
                `
              )
              .join(
                ""
              )
          }

        </select>
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "item"
  ) {

    return renderConditionValueShell({
      control: `
        <input
          type="text"
          data-role="evolution-condition-value"
          list="fakemon-evolution-items"
          placeholder="item-id"
          value="${escapeAttribute(
            value
          )}"
        >
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "loyalty"
  ) {

    return renderConditionValueShell({
      control: `
        <input
          type="number"
          data-role="evolution-condition-value"
          min="0"
          step="1"
          value="${escapeAttribute(
            value
          )}"
        >
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  if (
    type ===
      "time"
  ) {

    return renderConditionValueShell({
      control: `
        <input
          type="text"
          data-role="evolution-condition-value"
          list="fakemon-evolution-times"
          placeholder="day / night / morning / afternoon"
          value="${escapeAttribute(
            value
          )}"
        >
      `,

      hint:
        conditionHint(
          type,
          language
        )
    });
  }


  return renderConditionValueShell({
    control: `
      <textarea
        data-role="evolution-condition-value"
        rows="2"
        placeholder="${escapeAttribute(
          conditionPlaceholder(
            language
          )
        )}"
      >${escapeHtml(
        value
      )}</textarea>
    `,

    hint:
      conditionHint(
        type,
        language
      )
  });
}

/* ============================================================
 * DATALISTS
 * ============================================================ */

function renderEvolutionDatalists({
  species,
  moves,
  items,
  language
}) {

  return `
    <datalist id="fakemon-evolution-species">

      ${
        species
          .filter(
            entry =>
              entry?.id
          )
          .map(
            entry => `
              <option value="${escapeAttribute(
                entry.id
              )}">
                ${escapeHtml(
                  localizedName(
                    entry,
                    language,
                    entry.id
                  )
                )}
              </option>
            `
          )
          .join(
            ""
          )
      }

    </datalist>


    <datalist id="fakemon-evolution-moves">

      ${
        moves
          .filter(
            entry =>
              entry?.id
          )
          .map(
            entry => `
              <option value="${escapeAttribute(
                entry.id
              )}">
                ${escapeHtml(
                  localizedName(
                    entry,
                    language,
                    entry.id
                  )
                )}
              </option>
            `
          )
          .join(
            ""
          )
      }

    </datalist>


    <datalist id="fakemon-evolution-items">

      ${
        items
          .filter(
            entry =>
              entry?.id
          )
          .map(
            entry => `
              <option value="${escapeAttribute(
                entry.id
              )}">
                ${escapeHtml(
                  localizedName(
                    entry,
                    language,
                    entry.id
                  )
                )}
              </option>
            `
          )
          .join(
            ""
          )
      }

    </datalist>


    <datalist id="fakemon-evolution-times">

      ${
        EVOLUTION_TIME_SUGGESTIONS
          .map(
            option => `
              <option
                value="${escapeAttribute(
                  option.value
                )}"
              >
                ${escapeHtml(
                  option[
                    language
                  ] ??
                  option.en
                )}
              </option>
            `
          )
          .join(
            ""
          )
      }

    </datalist>
  `;
}

/* ============================================================
 * DISPLAY HELPERS
 * ============================================================ */

function renderEvolutionTextField({
  label,
  role,
  value,
  readonly = false,
  list = null,
  placeholder = ""
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
          value
        )}"
        ${
          list

            ? `list="${escapeAttribute(
                list
              )}"`

            : ""
        }
        ${readonly ? "readonly" : ""}
        placeholder="${escapeAttribute(
          placeholder
        )}"
      >

    </label>
  `;
}


function renderEvolutionValidation(
  validation
) {

  if (!validation) {
    return "";
  }


  const icon =
    validation.kind ===
      "success"

      ? "fa-solid fa-circle-check"

      : "fa-solid fa-triangle-exclamation";


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


function renderConditionBadges(
  conditions,
  language
) {

  if (
    !Array.isArray(
      conditions
    ) ||
    !conditions.length
  ) {

    return `
      <span
        class="fakemon-studio__evolution-condition-badge"
        data-type="empty"
      >
        Sin condiciones
      </span>
    `;
  }


  return conditions
    .map(
      condition => `
        <span
          class="fakemon-studio__evolution-condition-badge"
          data-type="${escapeAttribute(
            condition?.type ??
            ""
          )}"
        >
          <i class="${conditionTypeIcon(
            condition?.type
          )}"></i>

          <strong>
            ${escapeHtml(
              conditionTypeLabel(
                condition?.type,
                language
              )
            )}
          </strong>

          <span>
            ${escapeHtml(
              conditionDisplayValue(
                condition,
                language
              )
            )}
          </span>
        </span>
      `
    )
    .join(
      ""
    );
}


function conditionDisplayValue(
  condition,
  language
) {

  const type =
    String(
      condition?.type ??
      ""
    );


  const value =
    condition?.value ??
    "";


  if (
    type ===
      "gender"
  ) {

    const option =
      EVOLUTION_GENDER_OPTIONS
        .find(
          entry =>
            entry.value ===
              String(
                value
              )
        );


    return (
      option?.[
        language
      ] ??
      option?.en ??
      String(
        value
      )
    );
  }


  if (
    type ===
      "move-type"
  ) {

    return pokemonTypeLabel(
      String(
        value
      ),
      language
    );
  }


  if (
    type ===
      "time"
  ) {

    const option =
      EVOLUTION_TIME_SUGGESTIONS
        .find(
          entry =>
            entry.value ===
              String(
                value
              )
        );


    return (
      option?.[
        language
      ] ??
      option?.en ??
      String(
        value
      )
    );
  }


  return String(
    value
  );
}


function renderConditionValueShell({
  control,
  hint
}) {

  return `
    <div class="fakemon-studio__evolution-condition-value">

      ${control}

      <small>
        ${escapeHtml(
          hint
        )}
      </small>

    </div>
  `;
}


function renderGenderOptions(
  value,
  language
) {

  const selectedValue =
    String(
      value ??
      ""
    );


  const known =
    EVOLUTION_GENDER_OPTIONS
      .some(
        option =>
          option.value ===
            selectedValue
      );


  /*
   * Si abrimos una Evolution legacy con un valor
   * desconocido no lo destruimos automáticamente.
   */
  const preservedOption =
    selectedValue &&
    !known

      ? `
          <option
            value="${escapeAttribute(
              selectedValue
            )}"
            selected
          >
            ${escapeHtml(
              selectedValue
            )}
          </option>
        `

      : "";


  return [
    preservedOption,

    ...EVOLUTION_GENDER_OPTIONS
      .map(
        option => `
          <option
            value="${escapeAttribute(
              option.value
            )}"
            ${
              option.value ===
                selectedValue
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              option[
                language
              ] ??
              option.en
            )}
          </option>
        `
      )
  ].join(
    ""
  );
}


function readConditionValue(
  type,
  rawValue
) {

  const text =
    String(
      rawValue ??
      ""
    ).trim();


  if (
    type !==
      "level" &&
    type !==
      "loyalty"
  ) {

    return text;
  }


  if (!text) {
    return "";
  }


  return Number(
    text
  );
}


function defaultConditionValue(
  type
) {

  const defaults = {
    level:
      1,

    gender:
      "male",

    "move-type":
      "normal",

    loyalty:
      2,

    time:
      "day"
  };


  return (
    Object.hasOwn(
      defaults,
      type
    )
      ? defaults[
          type
        ]
      : ""
  );
}

function evolutionPoints(
  evolution
) {

  const effect =
    (
      evolution?.effects ??
      []
    ).find(
      entry =>
        entry?.type ===
          "asi"
    );


  return Number(
    effect?.value ??
    0
  );
}

function conditionTypeLabel(
  type,
  language = "es"
) {

  const labels = {
    level: {
      es:
        "Nivel",

      en:
        "Level"
    },

    gender: {
      es:
        "Género",

      en:
        "Gender"
    },

    move: {
      es:
        "Move",

      en:
        "Move"
    },

    "move-type": {
      es:
        "Tipo de Move",

      en:
        "Move Type"
    },

    item: {
      es:
        "Item",

      en:
        "Item"
    },

    loyalty: {
      es:
        "Loyalty",

      en:
        "Loyalty"
    },

    time: {
      es:
        "Momento",

      en:
        "Time"
    },

    special: {
      es:
        "Especial",

      en:
        "Special"
    }
  };


  return (
    labels[
      type
    ]?.[
      language
    ] ??
    labels[
      type
    ]?.en ??
    type
  );
}


function conditionTypeIcon(
  type
) {

  const icons = {
    level:
      "fa-solid fa-arrow-up-1-9",

    gender:
      "fa-solid fa-venus-mars",

    move:
      "fa-solid fa-bolt",

    "move-type":
      "fa-solid fa-tags",

    item:
      "fa-solid fa-gem",

    loyalty:
      "fa-solid fa-heart",

    time:
      "fa-solid fa-clock",

    special:
      "fa-solid fa-wand-magic-sparkles"
  };


  return (
    icons[
      type
    ] ??
    "fa-solid fa-circle"
  );
}


function conditionHint(
  type,
  language
) {

  const hints = {
    level: {
      es:
        "Nivel mínimo requerido.",

      en:
        "Required minimum level."
    },

    gender: {
      es:
        "Debe coincidir con el género individual del Pokémon.",

      en:
        "Must match the individual Pokémon's gender."
    },

    move: {
      es:
        "El Pokémon debe conocer este Move.",

      en:
        "The Pokémon must know this Move."
    },

    "move-type": {
      es:
        "Debe conocer al menos un Move de este tipo.",

      en:
        "Must know at least one Move of this type."
    },

    item: {
      es:
        "Selecciona un Item existente del catálogo.",

      en:
        "Select an existing catalog Item."
    },

    loyalty: {
      es:
        "Valor Poke5e de Loyalty. El engine actual solicita confirmación manual.",

      en:
        "Poke5e Loyalty value. The current engine requests manual confirmation."
    },

    time: {
      es:
        "Sugerencias Poke5e: morning, afternoon, day y night. El engine actual lo confirma manualmente.",

      en:
        "Poke5e suggestions: morning, afternoon, day and night. The current engine confirms it manually."
    },

    special: {
      es:
        "Describe la condición especial. El engine actual requiere confirmación manual.",

      en:
        "Describe the special condition. The current engine requires manual confirmation."
    }
  };


  return (
    hints[
      type
    ]?.[
      language
    ] ??
    hints[
      type
    ]?.en ??
    ""
  );
}


function conditionPlaceholder(
  language
) {

  return (
    language ===
      "en"
      ? "Describe the special condition"
      : "Describe la condición especial"
  );
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


function localizedName(
  entry,
  language,
  fallback
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
      fallback
    );
  }


  return String(
    fallback ??
    ""
  );
}


function emptyToNull(
  value
) {

  const text =
    String(
      value ??
      ""
    ).trim();


  return text ||
    null;
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