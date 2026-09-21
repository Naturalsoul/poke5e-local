import {
  getPokemonEvolutionPreview
} from "./pokemon-evolution-service.mjs";

import {
  analyzeEvolutionAbilityScoreAllocation,
  evolutionAbilityScorePolicy
} from "./pokemon-evolution-rules.mjs";

const MODULE_ID =
  "poke5e-local";

const SKIP_EVOLUTION =
  "__skip__";

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];


/* ============================================================
 * BASICS
 * ============================================================ */

function getLanguage() {

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


function escapeHtml(
  value
) {

  return foundry.utils.escapeHTML(
    String(
      value ??
      ""
    )
  );
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
      value[
        language
      ] ??
      value.en ??
      value.es ??
      fallback
    );
  }


  return String(
    fallback
  );
}


function candidateName(
  candidate,
  language
) {

  return localized(
    candidate.targetSpecies
      ?.name,
    language,
    candidate.to
  );
}


function abilityName(
  choice,
  language
) {

  return localized(
    choice?.definition
      ?.name,
    language,
    choice?.id ??
    ""
  );
}

function abilityDescription(
  choice,
  language
) {

  const fallback =
    language === "en"
      ? "No description available."
      : "Descripción no disponible.";


  const description =
    localized(
      choice?.definition
        ?.description,
      language,
      fallback
    ).trim();


  return description ||
    fallback;
}

/* ============================================================
 * CANDIDATES
 * ============================================================ */

function selectableCandidate(
  candidate
) {

  return Boolean(
    candidate.standard &&
    candidate.targetSpecies &&
    !candidate
      .evaluation
      .unsupported &&
    candidate
      .evaluation
      .automaticSatisfied &&
    candidate
      .abilityChoices
      .length >
      0 &&
    candidate
      .abilityDefinitionsComplete
  );
}


function evolutionChoiceContent(
  pokemon,
  candidates,
  language
) {

  const options =
    candidates
      .map(
        candidate => `
          <option
            value="${escapeHtml(candidate.key)}"
          >
            ${escapeHtml(
              candidateName(
                candidate,
                language
              )
            )}
            ·
            ${escapeHtml(
              candidate.evolutionPoints
            )}
            EP
          </option>
        `
      )
      .join("");


  return `
    <div class="poke5e-level-up-dialog">

      <section class="poke5e-level-up-dialog__section">

        <header>

          <i
            class="fa-solid fa-dna"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${
                language === "en"
                  ? "Evolution available"
                  : "Evolution disponible"
              }
            </h3>

            <p>
              ${
                language === "en"
                  ? `${escapeHtml(pokemon.name)} may evolve during this Level Up.`
                  : `${escapeHtml(pokemon.name)} puede evolucionar durante esta subida de nivel.`
              }
            </p>

          </div>

        </header>


        <label>

          <strong>
            ${
              language === "en"
                ? "Evolution"
                : "Evolución"
            }
          </strong>

          <select
            name="evolution-key"
          >

            <option
              value="${SKIP_EVOLUTION}"
              selected
            >
              ${
                language === "en"
                  ? "Do not evolve at this level"
                  : "No evolucionar en este nivel"
              }
            </option>

            ${options}

          </select>

        </label>


        <p class="hint">
          ${
            language === "en"
              ? "Only evolutions whose automatically verifiable requirements are currently met are shown."
              : "Solo se muestran evoluciones cuyos requisitos verificables automáticamente se cumplen actualmente."
          }
        </p>

      </section>

    </div>
  `;
}


/* ============================================================
 * CONDITIONS
 * ============================================================ */

function conditionTypeLabel(
  condition,
  language
) {

  const type =
    String(
      condition?.type ??
      ""
    );


  const labels = {

    es: {
      level:
        "Nivel",

      gender:
        "Género",

      move:
        "Move conocido",

      "move-type":
        "Move de tipo",

      item:
        "Objeto requerido",

      loyalty:
        "Lealtad",

      time:
        "Momento",

      special:
        "Condición especial"
    },

    en: {
      level:
        "Level",

      gender:
        "Gender",

      move:
        "Known Move",

      "move-type":
        "Move type",

      item:
        "Required Item",

      loyalty:
        "Loyalty",

      time:
        "Time",

      special:
        "Special condition"
    }
  };


  return (
    labels[
      language
    ]?.[type] ??
    type
  );
}


function conditionValue(
  condition
) {

  const value =
    String(
      condition?.value ??
      ""
    ).trim();


  return value ||
    "—";
}


function conditionsMarkup(
  candidate,
  language
) {

  return candidate
    .evaluation
    .conditions
    .map(
      condition => {

        const typeLabel =
          conditionTypeLabel(
            condition,
            language
          );


        const value =
          conditionValue(
            condition
          );


        if (
          condition.mode ===
            "manual"
        ) {

          return `
            <label
              class="
                poke5e-pokemon-evolution__requirement
                poke5e-pokemon-evolution__requirement--manual
              "
              data-requirement-state="manual"
              data-condition-type="${escapeHtml(condition.type)}"
            >

              <input
                type="checkbox"
                value="${escapeHtml(condition.key)}"
                data-evolution-manual-condition
              >


              <span
                class="poke5e-pokemon-evolution__requirement-icon"
                aria-hidden="true"
              >

                <i
                  class="fa-solid fa-user-check"
                ></i>

              </span>


              <span class="poke5e-pokemon-evolution__requirement-body">

                <small>
                  ${escapeHtml(typeLabel)}
                </small>

                <strong>
                  ${escapeHtml(value)}
                </strong>

                <span class="poke5e-pokemon-evolution__requirement-status">

                  <span data-manual-pending>
                    ${
                      language === "en"
                        ? "GM confirmation required"
                        : "Requiere confirmación del GM"
                    }
                  </span>

                  <span
                    data-manual-confirmed
                    hidden
                  >
                    ${
                      language === "en"
                        ? "Confirmed by GM"
                        : "Confirmado por el GM"
                    }
                  </span>

                </span>

              </span>

            </label>
          `;
        }


        const satisfied =
          Boolean(
            condition.satisfied
          );


        return `
          <article
            class="poke5e-pokemon-evolution__requirement"
            data-requirement-state="${
              satisfied
                ? "met"
                : "blocked"
            }"
            data-condition-type="${escapeHtml(condition.type)}"
          >

            <span
              class="poke5e-pokemon-evolution__requirement-icon"
              aria-hidden="true"
            >

              <i
                class="fa-solid ${
                  satisfied
                    ? "fa-check"
                    : "fa-xmark"
                }"
              ></i>

            </span>


            <span class="poke5e-pokemon-evolution__requirement-body">

              <small>
                ${escapeHtml(typeLabel)}
              </small>

              <strong>
                ${escapeHtml(value)}
              </strong>

              <span class="poke5e-pokemon-evolution__requirement-status">

                ${
                  satisfied
                    ? (
                        language === "en"
                          ? "Requirement met"
                          : "Requisito cumplido"
                      )
                    : (
                        language === "en"
                          ? "Requirement not met"
                          : "Requisito no cumplido"
                      )
                }

              </span>

            </span>

          </article>
        `;
      }
    )
    .join("");
}


/* ============================================================
 * EVOLUTION POINTS
 * ============================================================ */

function pokemonAbilityScores(
  pokemon
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          pokemon.system
            ?.abilities
            ?.[abilityId]
            ?.value ??
          10
        )
      ]
    )
  );
}


function evolutionPointFields(
  pokemon,
  candidate,
  language
) {

  const scores =
    pokemonAbilityScores(
      pokemon
    );


  const policy =
    evolutionAbilityScorePolicy(
      candidate.abilityScoreMode
    );


  return ABILITY_IDS.map(
    abilityId => {

      const current =
        Number(
          scores[
            abilityId
          ] ??
          10
        );


      const maximumChange =
        Math.max(
          0,

          Math.min(
            policy.maximumChange,

            policy.cap -
              current
          )
        );


      const minimumChange =
        policy.allowsSacrifice
          ? Math.max(
              policy.minimumChange,

              policy.minimumScore -
                current
            )
          : 0;


      const rangeLabel =
        policy.allowsSacrifice
          ? `${minimumChange} / +${maximumChange}`
          : (
              language === "en"
                ? `Maximum +${maximumChange}`
                : `Máximo +${maximumChange}`
            );


      return `
        <article
          class="poke5e-pokemon-level-up__asi-field"
          data-evolution-point-field
          data-ability-id="${escapeHtml(abilityId)}"
          data-current-score="${escapeHtml(current)}"
          data-min-change="${escapeHtml(minimumChange)}"
          data-max-change="${escapeHtml(maximumChange)}"
        >

          <header class="poke5e-pokemon-level-up__asi-field-header">

            <strong>
              ${escapeHtml(
                abilityId.toUpperCase()
              )}
            </strong>

            <small>
              ${escapeHtml(
                rangeLabel
              )}
            </small>

          </header>


          <div class="poke5e-pokemon-level-up__asi-score">

            <span>
              <small>
                ${language === "en" ? "Current" : "Actual"}
              </small>

              <strong>
                ${escapeHtml(current)}
              </strong>
            </span>


            <i
              class="fa-solid fa-arrow-right"
              aria-hidden="true"
            ></i>


            <span>

              <small>
                ${language === "en" ? "Result" : "Resultado"}
              </small>

              <strong data-evolution-point-result>
                ${escapeHtml(current)}
              </strong>

            </span>

          </div>


          <div class="poke5e-pokemon-level-up__asi-controls">

            <button
              type="button"
              data-evolution-point-action="decrease"
              data-ability-id="${escapeHtml(abilityId)}"
              ${minimumChange >= 0 ? "disabled" : ""}
            >
              <i
                class="fa-solid fa-minus"
                aria-hidden="true"
              ></i>
            </button>


            <output data-evolution-point-value>
              0
            </output>


            <input
              type="hidden"
              name="evolution-${escapeHtml(abilityId)}"
              value="0"
              data-evolution-point-input
            >


            <button
              type="button"
              data-evolution-point-action="increase"
              data-ability-id="${escapeHtml(abilityId)}"
              ${maximumChange <= 0 ? "disabled" : ""}
            >
              <i
                class="fa-solid fa-plus"
                aria-hidden="true"
              ></i>
            </button>

          </div>

        </article>
      `;
    }
  ).join("");
}

/* ============================================================
 * ABILITY
 * ============================================================ */

function abilityCardMarkup(
  choice,
  language,
  {
    mode =
      "new"
  } = {}
) {

  const eyebrow =
    mode ===
      "retained"
      ? (
          language === "en"
            ? "Ability retained"
            : "Ability conservada"
        )
      : (
          language === "en"
            ? "New Ability"
            : "Nueva Ability"
        );


  return `
    <article class="poke5e-pokemon-evolution__ability-card">

      <span
        class="poke5e-pokemon-evolution__ability-icon"
        aria-hidden="true"
      >

        <i class="fa-solid fa-star"></i>

      </span>


      <div class="poke5e-pokemon-evolution__ability-body">

        <div class="poke5e-pokemon-evolution__ability-heading">

          <small>
            ${escapeHtml(eyebrow)}
          </small>

          ${
            choice.hidden
              ? `
                <span>
                  ${
                    language === "en"
                      ? "Hidden"
                      : "Oculta"
                  }
                </span>
              `
              : ""
          }

        </div>


        <strong>
          ${escapeHtml(
            abilityName(
              choice,
              language
            )
          )}
        </strong>


        <p>
          ${escapeHtml(
            abilityDescription(
              choice,
              language
            )
          )}
        </p>

      </div>

    </article>
  `;
}

function abilitySelectionMarkup(
  candidate,
  language
) {

  const currentChoice =
    candidate
      .abilityChoices
      .find(
        choice =>
          choice.id ===
            candidate
              .currentAbilityId
      );


  if (
    candidate
      .currentAbilityValid &&
    currentChoice
  ) {

    return `
      <input
        type="hidden"
        name="evolution-ability"
        value="${escapeHtml(currentChoice.id)}"
      >

      ${abilityCardMarkup(
        currentChoice,
        language,
        {
          mode:
            "retained"
        }
      )}
    `;
  }


  if (
    candidate
      .abilityChoices
      .length === 1
  ) {

    const choice =
      candidate
        .abilityChoices[0];


    return `
      <input
        type="hidden"
        name="evolution-ability"
        value="${escapeHtml(choice.id)}"
      >

      ${abilityCardMarkup(
        choice,
        language
      )}
    `;
  }


  const options =
    candidate
      .abilityChoices
      .map(
        choice => `
          <option
            value="${escapeHtml(choice.id)}"
            data-ability-name="${escapeHtml(
              abilityName(
                choice,
                language
              )
            )}"
            data-ability-description="${escapeHtml(
              abilityDescription(
                choice,
                language
              )
            )}"
            data-ability-hidden="${String(
              Boolean(
                choice.hidden
              )
            )}"
          >
            ${escapeHtml(
              abilityName(
                choice,
                language
              )
            )}
            ${
              choice.hidden
                ? (
                    language === "en"
                      ? " (Hidden)"
                      : " (Oculta)"
                  )
                : ""
            }
          </option>
        `
      )
      .join("");


  return `
    <div class="poke5e-pokemon-evolution__ability-selection">

      <label>

        <strong>
          ${
            language === "en"
              ? "Choose Ability"
              : "Elegir Ability"
          }
        </strong>

        <select
          name="evolution-ability"
          data-evolution-ability
        >

          <option
            value=""
            selected
          >
            ${
              language === "en"
                ? "Select an Ability"
                : "Selecciona una Ability"
            }
          </option>

          ${options}

        </select>

      </label>


      <article
        class="poke5e-pokemon-evolution__ability-card"
        data-evolution-ability-preview
        hidden
      >

        <span
          class="poke5e-pokemon-evolution__ability-icon"
          aria-hidden="true"
        >
          <i class="fa-solid fa-star"></i>
        </span>


        <div class="poke5e-pokemon-evolution__ability-body">

          <div class="poke5e-pokemon-evolution__ability-heading">

            <small>
              ${
                language === "en"
                  ? "Selected Ability"
                  : "Ability seleccionada"
              }
            </small>

            <span
              data-evolution-ability-hidden
              hidden
            >
              ${
                language === "en"
                  ? "Hidden"
                  : "Oculta"
              }
            </span>

          </div>


          <strong data-evolution-ability-name></strong>

          <p data-evolution-ability-description></p>

        </div>

      </article>

    </div>
  `;
}


/* ============================================================
 * CONFIG CONTENT
 * ============================================================ */

function evolutionConfigurationContent(
  pokemon,
  candidate,
  language
) {

  const conditions =
    candidate
      .evaluation
      .conditions;


  const manualConditionCount =
    conditions.filter(
      condition =>
        condition.mode ===
          "manual"
    ).length;

  return `
    <div
      class="poke5e-level-up-dialog"
      data-evolution-config
      data-evolution-points="${escapeHtml(candidate.evolutionPoints)}"
      data-evolution-ability-score-mode="${escapeHtml(candidate.abilityScoreMode)}"
    >

      <section
        class="
          poke5e-level-up-dialog__section
          poke5e-pokemon-evolution__requirements-section
        "
      >

        <header>

          <i
            class="fa-solid fa-dna"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${escapeHtml(
                candidateName(
                  candidate,
                  language
                )
              )}
            </h3>

            <p>
              ${
                language === "en"
                  ? "Confirm the evolution requirements."
                  : "Confirma los requisitos de evolución."
              }
            </p>

          </div>

        </header>

        <div class="poke5e-pokemon-evolution__requirements-summary">

          <span>

            <small>
              ${
                language === "en"
                  ? "Requirements"
                  : "Requisitos"
              }
            </small>

            <strong>
              ${escapeHtml(conditions.length)}
            </strong>

          </span>


          <span>

            <small>
              ${
                language === "en"
                  ? "GM confirmations"
                  : "Confirmaciones GM"
              }
            </small>

            <strong>
              ${escapeHtml(manualConditionCount)}
            </strong>

          </span>

        </div>


        <div class="poke5e-pokemon-evolution__requirements-grid">

          ${conditionsMarkup(
            candidate,
            language
          )}

        </div>

      </section>


      <section
        class="
          poke5e-level-up-dialog__section
          poke5e-pokemon-level-up__asi-section
        "
      >

        <header>

          <i
            class="fa-solid fa-arrow-up-right-dots"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              Evolution Points
            </h3>

            <p>
              ${
                candidate.abilityScoreMode ===
                  "tradeoff"
                  ? (
                      language === "en"
                        ? `Reach a net balance of ${candidate.evolutionPoints} points. Individual changes may range from -4 to +4 and final scores may reach 24. Every new point above 20 requires one sacrificed point elsewhere.`
                        : `Alcanza un balance neto de ${candidate.evolutionPoints} puntos. Los cambios individuales pueden ir de -4 a +4 y los scores finales pueden llegar a 24. Cada punto nuevo sobre 20 exige un punto sacrificado en otra característica.`
                    )
                  : (
                      language === "en"
                        ? `Allocate exactly ${candidate.evolutionPoints} points. Maximum +4 to one Ability Score and maximum final score 20.`
                        : `Distribuye exactamente ${candidate.evolutionPoints} puntos. Máximo +4 a una característica y puntuación final máxima 20.`
                    )
              }
            </p>

          </div>

        </header>


        <div class="poke5e-pokemon-level-up__asi-summary">

          <span>

            <small>
              ${
                language === "en"
                  ? "Assigned"
                  : "Asignados"
              }
            </small>

            <strong>
              <b data-evolution-points-spent>
                0
              </b>

              /

              ${escapeHtml(candidate.evolutionPoints)}
            </strong>

          </span>


          <span>

            <small>
              ${
                language === "en"
                  ? "Remaining"
                  : "Restantes"
              }
            </small>

            <strong data-evolution-points-remaining>
              ${escapeHtml(candidate.evolutionPoints)}
            </strong>

            ${
              candidate.abilityScoreMode ===
                "tradeoff"
                ? `
                    <span>
                      <small>
                        ${language === "en" ? "Sacrificed" : "Sacrificados"}
                      </small>

                      <strong data-evolution-points-sacrificed>
                        0
                      </strong>
                    </span>

                    <span>
                      <small>
                        ${
                          language === "en"
                            ? "New points above 20"
                            : "Puntos nuevos sobre 20"
                        }
                      </small>

                      <strong data-evolution-points-overcap>
                        0
                      </strong>
                    </span>
                  `
                : ""
            }

          </span>

        </div>

        <p
          class="hint"
          data-evolution-tradeoff-status
          ${candidate.abilityScoreMode === "tradeoff" ? "" : "hidden"}
        ></p>

        <div class="poke5e-pokemon-level-up__asi-grid">

          ${evolutionPointFields(
            pokemon,
            candidate,
            language
          )}

        </div>

      </section>


      <section
        class="
          poke5e-level-up-dialog__section
          poke5e-pokemon-evolution__ability-section
        "
      >

        <header>

          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              Ability
            </h3>

            <p>
              ${
                language === "en"
                  ? "Review the Ability the evolved Pokémon will use."
                  : "Revisa la Ability que utilizará el Pokémon evolucionado."
              }
            </p>

          </div>

        </header>


        ${abilitySelectionMarkup(
          candidate,
          language
        )}

      </section>

    </div>
  `;
}


/* ============================================================
 * CONFIG UI
 * ============================================================ */

function evolutionPointInput(
  form,
  abilityId
) {

  const input =
    form.elements.namedItem(
      `evolution-${abilityId}`
    );


  return input instanceof
    HTMLInputElement
      ? input
      : null;
}


function evolutionPointChanges(
  form
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          evolutionPointInput(
            form,
            abilityId
          )?.value ??
          0
        )
      ]
    )
  );
}

function evolutionCurrentScores(
  root
) {

  return Object.fromEntries(
    [
      ...root.querySelectorAll(
        "[data-evolution-point-field]"
      )
    ].map(
      field => [
        String(
          field.dataset
            .abilityId ??
          ""
        ),

        Number(
          field.dataset
            .currentScore ??
          0
        )
      ]
    )
  );
}

function manualConditionsComplete(
  form
) {

  const inputs =
    [
      ...form.querySelectorAll(
        "[data-evolution-manual-condition]"
      )
    ];


  return inputs.every(
    input =>
      input instanceof
        HTMLInputElement &&
      input.checked
  );
}


function abilitySelectionComplete(
  form
) {

  const field =
    form.elements.namedItem(
      "evolution-ability"
    );


  return Boolean(
    String(
      field?.value ??
      ""
    ).trim()
  );
}

function syncEvolutionAbilityPreview(
  form,
  root
) {

  const select =
    form.querySelector(
      "[data-evolution-ability]"
    );


  const preview =
    root.querySelector(
      "[data-evolution-ability-preview]"
    );


  if (
    !(
      select instanceof
        HTMLSelectElement
    ) ||
    !preview
  ) {

    return;
  }


  const option =
    select.selectedOptions[0];


  const abilityId =
    String(
      option?.value ??
      ""
    ).trim();


  preview.hidden =
    !abilityId;


  if (!abilityId) {

    return;
  }


  const name =
    preview.querySelector(
      "[data-evolution-ability-name]"
    );


  const description =
    preview.querySelector(
      "[data-evolution-ability-description]"
    );


  const hiddenBadge =
    preview.querySelector(
      "[data-evolution-ability-hidden]"
    );


  if (name) {

    name.textContent =
      String(
        option.dataset
          .abilityName ??
        option.textContent ??
        ""
      ).trim();
  }


  if (description) {

    description.textContent =
      String(
        option.dataset
          .abilityDescription ??
        ""
      );
  }


  if (hiddenBadge) {

    hiddenBadge.hidden =
      option.dataset
        .abilityHidden !==
      "true";
  }
}


function syncEvolutionConfigurationUi(
  form,
  root
) {

  const points =
    Number(
      root.dataset
        .evolutionPoints ??
      0
    );


  const mode =
    String(
      root.dataset
        .evolutionAbilityScoreMode ??
      "standard"
    );


  for (
    const field
    of root.querySelectorAll(
      "[data-evolution-point-field]"
    )
  ) {

    const abilityId =
      String(
        field.dataset
          .abilityId ??
        ""
      );


    const input =
      evolutionPointInput(
        form,
        abilityId
      );


    if (!input) {
      continue;
    }


    const current =
      Number(
        field.dataset
          .currentScore ??
        0
      );


    const minimumChange =
      Number(
        field.dataset
          .minChange ??
        0
      );


    const maximumChange =
      Number(
        field.dataset
          .maxChange ??
        0
      );


    const change =
      Math.max(
        minimumChange,

        Math.min(
          maximumChange,

          Number(
            input.value ??
            0
          )
        )
      );


    input.value =
      String(
        change
      );


    const result =
      field.querySelector(
        "[data-evolution-point-result]"
      );


    const output =
      field.querySelector(
        "[data-evolution-point-value]"
      );


    if (result) {

      result.textContent =
        String(
          current +
          change
        );
    }


    if (output) {

      output.textContent =
        formatAbilityScoreChange(
          change
        );
    }


    const decreaseButton =
      field.querySelector(
        '[data-evolution-point-action="decrease"]'
      );


    const increaseButton =
      field.querySelector(
        '[data-evolution-point-action="increase"]'
      );


    if (
      decreaseButton instanceof
        HTMLButtonElement
    ) {

      decreaseButton.disabled =
        change <=
          minimumChange;
    }


    if (
      increaseButton instanceof
        HTMLButtonElement
    ) {

      increaseButton.disabled =
        change >=
          maximumChange;
    }
  }


  let allocation;


  try {

    allocation =
      analyzeEvolutionAbilityScoreAllocation({
        currentScores:
          evolutionCurrentScores(
            root
          ),

        requestedChanges:
          evolutionPointChanges(
            form
          ),

        points,
        mode
      });

  } catch {

    allocation =
      null;
  }


  const netPoints =
    Number(
      allocation?.netPoints ??
      0
    );


  /*
   * En Standard mantenemos la UX anterior:
   * una vez usados todos los puntos ya no se
   * pueden sumar más.
   *
   * En Tradeoff sí se puede superar temporalmente
   * el total positivo porque luego debe compensarse
   * con sacrificios.
   */
  if (
    mode ===
      "standard" &&
    netPoints >=
      points
  ) {

    for (
      const button
      of root.querySelectorAll(
        '[data-evolution-point-action="increase"]'
      )
    ) {

      if (
        button instanceof
          HTMLButtonElement
      ) {

        button.disabled =
          true;
      }
    }
  }


  const difference =
    points -
    netPoints;


  const spentElement =
    root.querySelector(
      "[data-evolution-points-spent]"
    );


  const remainingElement =
    root.querySelector(
      "[data-evolution-points-remaining]"
    );


  const sacrificedElement =
    root.querySelector(
      "[data-evolution-points-sacrificed]"
    );


  const overcapElement =
    root.querySelector(
      "[data-evolution-points-overcap]"
    );


  if (spentElement) {

    spentElement.textContent =
      String(
        netPoints
      );
  }


  if (remainingElement) {

    remainingElement.textContent =
      formatAbilityScoreChange(
        difference
      );
  }


  if (sacrificedElement) {

    sacrificedElement.textContent =
      String(
        allocation
          ?.sacrificedPoints ??
        0
      );
  }


  if (overcapElement) {

    overcapElement.textContent =
      String(
        allocation
          ?.overcapPoints ??
        0
      );
  }


  const tradeoffStatus =
    root.querySelector(
      "[data-evolution-tradeoff-status]"
    );


  if (
    tradeoffStatus &&
    mode ===
      "tradeoff"
  ) {

    const requiredSacrifice =
      Number(
        allocation?.overcapPoints ??
        0
      );


    const sacrificed =
      Number(
        allocation?.sacrificedPoints ??
        0
      );


    const language =
      getLanguage();


    tradeoffStatus.textContent =
      requiredSacrifice >
        sacrificed
        ? (
            language === "en"
              ? `${requiredSacrifice - sacrificed} additional sacrifice point(s) are required to sustain the new scores above 20.`
              : `Faltan ${requiredSacrifice - sacrificed} punto(s) de sacrificio para sostener los scores nuevos sobre 20.`
          )
        : (
            language === "en"
              ? "The sacrifice covers the new points above 20."
              : "El sacrificio cubre los puntos nuevos sobre 20."
          );
  }


  syncEvolutionAbilityPreview(
    form,
    root
  );


  const complete =
    allocation?.valid ===
      true &&
    manualConditionsComplete(
      form
    ) &&
    abilitySelectionComplete(
      form
    );


  const confirmButton =
    form.querySelector(
      "footer button"
    );


  if (
    confirmButton instanceof
      HTMLButtonElement
  ) {

    confirmButton.disabled =
      !complete;
  }
}

function formatAbilityScoreChange(
  value
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
    return "0";
  }


  return numeric >
    0
    ? `+${numeric}`
    : String(
        numeric
      );
}

function activateEvolutionConfigurationUi(
  dialog
) {

  const form =
    dialog?.form ??
    dialog?.element
      ?.querySelector(
        "form"
      );


  if (
    !(form instanceof
      HTMLFormElement)
  ) {

    return;
  }


  const root =
    form.querySelector(
      "[data-evolution-config]"
    );


  if (!root) {

    return;
  }


  root.addEventListener(
    "click",
    event => {

      if (
        !(event.target instanceof
          Element)
      ) {

        return;
      }


      const button =
        event.target.closest(
          "button[data-evolution-point-action]"
        );


      if (
        !(button instanceof
          HTMLButtonElement)
      ) {

        return;
      }


      const abilityId =
        String(
          button.dataset
            .abilityId ??
          ""
      );


      const input =
        evolutionPointInput(
          form,
          abilityId
        );


      const field =
        button.closest(
          "[data-evolution-point-field]"
        );


      if (
        !input ||
        !field
      ) {

        return;
      }


      const value =
        Number(
          input.value ??
          0
        );


      const minimumChange =
        Number(
          field.dataset
            .minChange ??
          0
        );


      const maximumChange =
        Number(
          field.dataset
            .maxChange ??
          0
        );


      const action =
        String(
          button.dataset
            .evolutionPointAction ??
          ""
        );


      const mode =
        String(
          root.dataset
            .evolutionAbilityScoreMode ??
          "standard"
        );


      if (
        action ===
          "increase"
      ) {

        if (
          value >=
            maximumChange
        ) {
          return;
        }


        if (
          mode ===
            "standard"
        ) {

          const allocation =
            analyzeEvolutionAbilityScoreAllocation({
              currentScores:
                evolutionCurrentScores(
                  root
                ),

              requestedChanges:
                evolutionPointChanges(
                  form
                ),

              points:
                Number(
                  root.dataset
                    .evolutionPoints ??
                  0
                ),

              mode
            });


          if (
            allocation.netPoints >=
              allocation.points
          ) {
            return;
          }
        }


        input.value =
          String(
            value +
            1
          );

      } else if (
        action ===
          "decrease"
      ) {

        if (
          value <=
            minimumChange
        ) {
          return;
        }


        input.value =
          String(
            value -
            1
          );
      }


      syncEvolutionConfigurationUi(
        form,
        root
      );


      syncEvolutionConfigurationUi(
        form,
        root
      );
    }
  );


  form.addEventListener(
    "change",
    () => {

      syncEvolutionConfigurationUi(
        form,
        root
      );
    }
  );


  syncEvolutionConfigurationUi(
    form,
    root
  );
}


/* ============================================================
 * READ CONFIG
 * ============================================================ */

function readEvolutionPointIncreases(
  form
) {

  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => [
        abilityId,

        Number(
          evolutionPointInput(
            form,
            abilityId
          )?.value ??
          0
        )
      ]
    )
  );
}


function readManualConditionKeys(
  form
) {

  return [
    ...form.querySelectorAll(
      "[data-evolution-manual-condition]:checked"
    )
  ].map(
    input =>
      String(
        input.value
      )
  );
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export async function openPokemonEvolutionDialog(
  pokemon,
  {
    evolutionLevel
  }
) {

  const language =
    getLanguage();


  const preview =
    await getPokemonEvolutionPreview(
      pokemon,
      {
        evolutionLevel
      }
    );


  const candidates =
    preview.candidates.filter(
      selectableCandidate
    );


  if (!candidates.length) {

    return {
      evolve:
        false
    };
  }


  const selectedKey =
    await foundry.applications.api
      .DialogV2.prompt({

        classes: [
          "poke5e-level-up-window",
          "poke5e-pokemon-level-up-window"
        ],

        position: {
          width:
            620
        },

        window: {
          title:
            language === "en"
              ? "Pokémon Evolution"
              : "Evolución Pokémon"
        },

        content:
          evolutionChoiceContent(
            pokemon,
            candidates,
            language
          ),

        rejectClose:
          false,

        ok: {
          label:
            language === "en"
              ? "Continue"
              : "Continuar",

          callback:
            (...args) => {

              const button =
                args[1];


              return String(
                button.form
                  ?.elements
                  ?.namedItem(
                    "evolution-key"
                  )
                  ?.value ??
                SKIP_EVOLUTION
              );
            }
        }
      });


  if (
    selectedKey == null
  ) {

    return null;
  }


  if (
    selectedKey ===
      SKIP_EVOLUTION
  ) {

    return {
      evolve:
        false
    };
  }


  const candidate =
    candidates.find(
      entry =>
        entry.key ===
          selectedKey
    );


  if (!candidate) {

    throw new Error(
      "No se pudo resolver la Evolution seleccionada."
    );
  }


  const choices =
    await foundry.applications.api
      .DialogV2.prompt({

        classes: [
          "poke5e-level-up-window",
          "poke5e-pokemon-level-up-window"
        ],

        position: {
          width:
            720
        },

        window: {
          title:
            language === "en"
              ? `Evolve into ${candidateName(candidate, language)}`
              : `Evolucionar a ${candidateName(candidate, language)}`
        },

        content:
          evolutionConfigurationContent(
            pokemon,
            candidate,
            language
          ),

        rejectClose:
          false,

        render:
          (
            ...args
          ) => {

            activateEvolutionConfigurationUi(
              args[1]
            );
          },

        ok: {
          label:
            language === "en"
              ? "Evolve"
              : "Evolucionar",

          callback:
            (...args) => {

              const button =
                args[1];


              const form =
                button.form;


              return {
                evolve:
                  true,

                evolutionKey:
                  candidate.key,

                abilityScoreIncreases:
                  readEvolutionPointIncreases(
                    form
                  ),

                manualConditionKeys:
                  readManualConditionKeys(
                    form
                  ),

                activeAbilityId:
                  String(
                    form.elements
                      .namedItem(
                        "evolution-ability"
                      )
                      ?.value ??
                    ""
                  ) ||
                  null
              };
            }
        }
      });


  return choices ??
    null;
}