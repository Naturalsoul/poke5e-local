import { escapeHtml } from "./html.mjs";
import {
  POKEMON_TYPES
} from "./types.mjs";

const {
  DialogV2
} =
  foundry.applications.api;


export async function promptFakemonWizardReview({
  database,
  review,
  catalogRecommendations,
  selections,
  language = "es"
}) {
  const evolutionFlow =
    Boolean(
      review?.summary
        ?.evolution
        ?.rule
    );
  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        evolutionFlow
          ? (
              language === "en"
                ? "Fakemon Wizard · Step 7/7"
                : "Fakemon Wizard · Paso 7/7"
            )
          : (
              language === "en"
                ? "Fakemon Wizard · Step 6/6"
                : "Fakemon Wizard · Paso 6/6"
            )
    },

    position: {
      width:
        900
    },

    content:
      renderReview({
        database,
        review,
        catalogRecommendations,
        selections,
        language
      }),

    buttons: [
      {
        action:
          "back",

        label:
          evolutionFlow
            ? (
                language === "en"
                  ? "Back to Evolution requirements"
                  : "Volver a requisitos de Evolution"
              )
            : (
                language === "en"
                  ? "Back to Moves & Abilities"
                  : "Volver a Moves & Abilities"
              ),

        callback:
          () => ({
            action:
              "back"
          })
      },

      {
        action:
          "create",

        label:
          language === "en"
            ? "Create draft"
            : "Crear borrador",

        default:
          true,

        callback:
          () => ({
            action:
              "create"
          })
      }
    ],

    rejectClose:
      false,

    modal:
      true
  });
}


function renderReview({
  database,
  review,
  catalogRecommendations,
  selections,
  language
}) {

  const abilityById =
    catalogById(
      database?.abilities
    );


  const moveById =
    catalogById(
      database?.moves
    );


  const summary =
    review.summary;


  const selectedMoveIds =
    new Set(
      (
        selections
          ?.levelMoveIds ??
        []
      ).map(
        normalizeId
      )
    );


  const selectedLevelMoves =
    (
      catalogRecommendations
        ?.levelMoves ??
      []
    ).filter(
      entry =>
        selectedMoveIds.has(
          normalizeId(
            entry.moveId
          )
        )
    );


  const abilityNames =
    (
      selections?.abilityIds ??
      []
    ).map(
      abilityId =>
        localizedName(
          abilityById.get(
            normalizeId(
              abilityId
            )
          ),
          language,
          abilityId
        )
    );


  return `
    <div class="fakemon-wizard fakemon-wizard--review">

      ${renderProgress(
        language
      )}


      <div class="fakemon-wizard__review-header">

        <div>

          <small>
            ${
              language === "en"
                ? "Final design review"
                : "Revisión final del diseño"
            }
          </small>

          <h3>
            ${escapeHtml(
              summary.name ||
              (
                language === "en"
                  ? "New Fakemon"
                  : "Nuevo Fakemon"
              )
            )}
          </h3>

          <span>
            ${escapeHtml(
              summary.types
                .map(
                  type =>
                    typeLabel(
                      type,
                      language
                    )
                )
                .join(
                  " / "
                )
            )}
          </span>

        </div>


        <div class="fakemon-wizard__review-status">

          <span
            class="fakemon-wizard__confidence"
            data-level="${escapeAttribute(
              summary.confidence
            )}"
          >
            ${escapeHtml(
              confidenceLabel(
                summary.confidence,
                language
              )
            )}
          </span>

          <span
            class="fakemon-wizard__review-warning-count"
            data-warning="${review.warningCount > 0}"
          >

            <i
              class="${
                review.warningCount >
                  0
                  ? "fa-solid fa-triangle-exclamation"
                  : "fa-solid fa-circle-check"
              }"
            ></i>

            ${review.warningCount}

            ${
              language === "en"
                ? "warnings"
                : "advertencias"
            }

          </span>

        </div>

      </div>


      <div class="fakemon-wizard__review-metrics">

        ${metric(
          "SR",
          summary.sr,
          "fa-solid fa-star"
        )}

        ${metric(
          language === "en"
            ? "Minimum Level"
            : "Nivel mínimo",
          summary.minimumLevel,
          "fa-solid fa-arrow-up-1-9"
        )}

        ${metric(
          "HP",
          summary.combat.hp,
          "fa-solid fa-heart"
        )}

        ${metric(
          "AC",
          summary.combat.ac,
          "fa-solid fa-shield-halved"
        )}

        ${metric(
          language === "en"
            ? "Level Moves"
            : "Moves por nivel",
          summary.levelMoves.selectedCount,
          "fa-solid fa-book-open"
        )}

        ${metric(
          "TMs",
          summary.tms.selectedCount,
          "fa-solid fa-compact-disc"
        )}

      </div>


      <div class="fakemon-wizard__review-grid">

        ${renderIdentityPanel({
          summary,
          abilityNames,
          language
        })}

        ${renderLearnsetPanel({
          summary,
          selectedLevelMoves,
          moveById,
          language
        })}

      </div>

      ${renderEvolutionReviewPanel(
        summary.evolution,
        language
      )}

      ${renderChecks(
        review.checks,
        language
      )}


      <div class="fakemon-wizard__method-note">

        <i class="fa-solid fa-circle-info"></i>

        <span>
          ${
            language === "en"
              ? "Warnings are Wizard design guidance, not new Poke5e legality rules. Use Back to revise the design before creating the editable draft."
              : "Las advertencias son orientación de diseño del Wizard, no nuevas reglas de legalidad Poke5e. Usa Volver para revisar el diseño antes de crear el borrador editable."
          }
        </span>

      </div>

    </div>
  `;
}


function renderIdentityPanel({
  summary,
  abilityNames,
  language
}) {

  const attributes =
    summary.combat.attributes ??
    {};


  const secondary =
    summary.secondaryArchetype
      ? `
          <span>

            <small>
              ${
                language === "en"
                  ? "Secondary role"
                  : "Rol secundario"
              }
            </small>

            <strong>
              ${escapeHtml(
                archetypeLabel(
                  summary.secondaryArchetype,
                  language
                )
              )}
            </strong>

          </span>
        `
      : "";


  return `
    <section class="fakemon-wizard__review-panel">

      <header>
        <i class="fa-solid fa-fingerprint"></i>

        <strong>
          ${
            language === "en"
              ? "Identity"
              : "Identidad"
          }
        </strong>
      </header>


      <div class="fakemon-wizard__review-copy">

        <span>

          <small>
            ${
              language === "en"
                ? "Primary role"
                : "Rol principal"
            }
          </small>

          <strong>
            ${escapeHtml(
              archetypeLabel(
                summary.primaryArchetype,
                language
              )
            )}
          </strong>

        </span>


        ${secondary}


        <span>

          <small>
            ${
              language === "en"
                ? "Offense"
                : "Ofensiva"
            }
          </small>

          <strong>
            ${escapeHtml(
              offenseModeLabel(
                summary.offenseMode,
                language
              )
            )}
          </strong>

        </span>

      </div>


      <div class="fakemon-wizard__review-attributes">

        ${
          [
            "str",
            "dex",
            "con",
            "int",
            "wis",
            "cha"
          ]
            .map(
              id => `
                <span>
                  <small>
                    ${id.toUpperCase()}
                  </small>

                  <strong>
                    ${escapeHtml(
                      attributes[
                        id
                      ] ??
                      "—"
                    )}
                  </strong>
                </span>
              `
            )
            .join(
              ""
            )
        }

      </div>


      <div class="fakemon-wizard__review-abilities">

        <small>
          Abilities ·
          ${summary.abilities.selectedCount}
          · Hidden
          ${summary.abilities.hiddenCount}
        </small>

        <div>
          ${
            abilityNames.length
              ? abilityNames
                  .map(
                    name => `
                      <span>
                        ${escapeHtml(
                          name
                        )}
                      </span>
                    `
                  )
                  .join(
                    ""
                  )
              : "<span>—</span>"
          }
        </div>

      </div>

    </section>
  `;
}


function renderLearnsetPanel({
  summary,
  selectedLevelMoves,
  moveById,
  language
}) {

  const levelEntries =
    Object.entries(
      summary.levelMoves
        .byLevel ??
      {}
    );


  const roleEntries =
    Object.entries(
      summary.levelMoves
        .roleCounts ??
      {}
    ).filter(
      ([
        ,
        count
      ]) =>
        Number(
          count
        ) >
        0
    );


  const sortedMoves = [
    ...selectedLevelMoves
  ].sort(
    (
      left,
      right
    ) =>
      Number(
        left.level
      ) -
        Number(
          right.level
        ) ||
      String(
        left.moveId
      ).localeCompare(
        String(
          right.moveId
        )
      )
  );


  return `
    <section class="fakemon-wizard__review-panel">

      <header>
        <i class="fa-solid fa-book-open"></i>
        <strong>Learnset</strong>
      </header>


      <div class="fakemon-wizard__review-learnset-summary">

        <span>
          <strong>
            ${summary.levelMoves.selectedCount}
          </strong>

          <small>
            ${
              language === "en"
                ? "selected"
                : "seleccionados"
            }
          </small>
        </span>


        <span>
          <strong>
            ${summary.levelMoves.targetCount}
          </strong>

          <small>
            ${
              language === "en"
                ? "observed target"
                : "objetivo observado"
            }
          </small>
        </span>


        <span>
          <strong>
            ${summary.eggMoves.selectedCount}
          </strong>
          <small>Egg</small>
        </span>


        <span>
          <strong>
            ${summary.tms.selectedCount}
          </strong>
          <small>TM</small>
        </span>

      </div>


      ${chipSection(
        language === "en"
          ? "Progression"
          : "Progresión",

        levelEntries.map(
          ([
            level,
            count
          ]) =>
            `Nv. ${level} · ${count}`
        )
      )}


      ${chipSection(
        language === "en"
          ? "Composition"
          : "Composición",

        roleEntries.map(
          ([
            role,
            count
          ]) =>
            `${
              roleLabel(
                role,
                language
              )
            } · ${count}`
        )
      )}


      <div class="fakemon-wizard__review-subsection">

        <small>
          ${
            language === "en"
              ? "Selected Moves"
              : "Moves seleccionados"
          }
        </small>


        <div class="fakemon-wizard__review-move-list">

          ${
            sortedMoves.length
              ? sortedMoves
                  .map(
                    entry => {

                      const move =
                        moveById.get(
                          normalizeId(
                            entry.moveId
                          )
                        );


                      return `
                        <span>

                          <small>
                            Nv. ${escapeHtml(
                              entry.level
                            )}
                          </small>

                          <strong>
                            ${escapeHtml(
                              localizedName(
                                move,
                                language,
                                entry.moveId
                              )
                            )}
                          </strong>

                        </span>
                      `;
                    }
                  )
                  .join(
                    ""
                  )
              : "<span>—</span>"
          }

        </div>

      </div>

    </section>
  `;
}


function chipSection(
  label,
  values
) {

  return `
    <div class="fakemon-wizard__review-subsection">

      <small>
        ${escapeHtml(
          label
        )}
      </small>

      <div class="fakemon-wizard__review-chips">

        ${
          values.length
            ? values
                .map(
                  value => `
                    <span>
                      ${escapeHtml(
                        value
                      )}
                    </span>
                  `
                )
                .join(
                  ""
                )
            : "<span>—</span>"
        }

      </div>

    </div>
  `;
}

function renderEvolutionReviewPanel(
  evolution,
  language
) {

  if (!evolution) {
    return "";
  }


  return `
    <section
      class="
        fakemon-wizard__review-panel
        fakemon-wizard__review-panel--evolution
      "
    >

      <header>
        <i class="fa-solid fa-code-branch"></i>

        <strong>
          ${
            language === "en"
              ? "Evolution Design"
              : "Diseño de Evolution"
          }
        </strong>
      </header>


      <div class="fakemon-wizard__review-evolution-grid">

        <span>
          <small>
            ${language === "en" ? "Source" : "Origen"}
          </small>

          <strong>
            ${escapeHtml(
              evolution.sourceName ||
              evolution.sourceSpeciesId
            )}
          </strong>
        </span>


        <span>
          <small>
            ${
              language === "en"
                ? "Narrative origin"
                : "Origen narrativo"
            }
          </small>

          <strong>
            ${escapeHtml(
              evolutionOriginReviewLabel(
                evolution.narrativeOrigin,
                language
              )
            )}
          </strong>
        </span>


        <span>
          <small>
            ${language === "en" ? "Mutation" : "Mutación"}
          </small>

          <strong>
            ${escapeHtml(
              mutationDegreeReviewLabel(
                evolution.mutationDegree,
                language
              )
            )}
          </strong>
        </span>


        <span>
          <small>
            Delta Poke5e
          </small>

          <strong>
            ${Math.round(
              evolution.deltaWeight *
              100
            )}%
          </strong>
        </span>


        <span>
          <small>
            ${language === "en" ? "References" : "Referencias"}
          </small>

          <strong>
            ${escapeHtml(
              evolution.comparableCount
            )}
          </strong>
        </span>

      </div>

      ${renderEvolutionRuleReview(
        evolution.rule,
        language
      )}

      ${renderEvolutionContinuityReview(
        evolution.continuity,
        language
      )}

    </section>
  `;
}

function renderEvolutionRuleReview(
  rule,
  language
) {

  if (!rule) {
    return "";
  }


  const modeLabel =
    rule.abilityScoreMode ===
      "tradeoff"
      ? (
          language === "en"
            ? "Tradeoff · up to 24 with sacrifices"
            : "Tradeoff · hasta 24 con sacrificios"
        )
      : (
          language === "en"
            ? "Standard Poke5e · maximum 20"
            : "Standard Poke5e · máximo 20"
        );


  return `
    <div class="fakemon-wizard__review-subsection">

      <small>
        ${
          language === "en"
            ? "Evolution requirements"
            : "Requisitos de Evolution"
        }
      </small>

      <div class="fakemon-wizard__review-chips">

        <span>
          EP · ${escapeHtml(
            rule.evolutionPoints
          )}
        </span>

        <span>
          ${escapeHtml(
            modeLabel
          )}
        </span>

        ${rule.conditions
          .map(
            condition => `
              <span>
                ${escapeHtml(
                  evolutionConditionLabel(
                    condition,
                    language
                  )
                )}
              </span>
            `
          )
          .join("")}

      </div>

    </div>
  `;
}


function evolutionConditionLabel(
  condition,
  language
) {

  const labels = {
    level:
      ["Nivel", "Level"],

    gender:
      ["Género", "Gender"],

    move:
      ["Move", "Move"],

    "move-type":
      ["Tipo de Move", "Move Type"],

    item:
      ["Item", "Item"],

    loyalty:
      ["Loyalty", "Loyalty"],

    time:
      ["Momento", "Time"],

    special:
      ["Especial", "Special"]
  };


  const type =
    String(
      condition?.type ??
      ""
    );


  const label =
    labels[
      type
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    type;


  return `${label}: ${String(
    condition?.value ??
    "—"
  )}`;
}

function renderEvolutionContinuityReview(
  continuity,
  language
) {

  if (!continuity) {
    return "";
  }


  const observedChannels =
    continuity
      ?.observed
      ?.channels ??
    {};


  const channels = [
    [
      "Abilities",
      "abilities"
    ],

    [
      language === "en"
        ? "Level Moves"
        : "Moves por nivel",

      "levelMoves"
    ],

    [
      "Egg Moves",
      "eggMoves"
    ],

    [
      "TMs",
      "tms"
    ]
  ];


  const chips =
    channels.map(
      ([
        label,
        key
      ]) => {

        const selected =
          continuity.channels
            ?.[key] ??
          {};


        const retention =
          observedChannels
            ?.[key]
            ?.retention;


        const retentionText =
          Number.isFinite(
            Number(
              retention
            )
          )
            ? ` · Poke5e ${Math.round(
                Number(
                  retention
                ) *
                100
              )}%`
            : "";


        return (
          `${label}: ` +
          `${selected.selectedInheritedCount ?? 0}/` +
          `${selected.selectedCount ?? 0} ` +
          `${language === "en" ? "inherited" : "heredados"}` +
          retentionText
        );
      }
    );


  return `
    <div class="fakemon-wizard__review-subsection">

      <small>
        ${
          language === "en"
            ? "Mechanical continuity"
            : "Continuidad mecánica"
        }
      </small>

      <div class="fakemon-wizard__review-chips">

        ${chips
          .map(
            value => `
              <span>
                ${escapeHtml(
                  value
                )}
              </span>
            `
          )
          .join(
            ""
          )}

      </div>

    </div>
  `;
}

function evolutionOriginReviewLabel(
  value,
  language
) {

  const labels = {
    natural: [
      "Natural / estándar",
      "Natural / standard"
    ],

    bond: [
      "Vínculo fuerte",
      "Strong bond"
    ],

    "rocket-experiment": [
      "Experimento Team Rocket",
      "Team Rocket experiment"
    ],

    catalyst: [
      "Catalizador / Item",
      "Catalyst / Item"
    ],

    "move-mastery": [
      "Dominio de un Move",
      "Move mastery"
    ],

    "special-event": [
      "Evento especial",
      "Special event"
    ]
  };


  return (
    labels[
      value
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    value ??
    "—"
  );
}


function mutationDegreeReviewLabel(
  value,
  language
) {

  const labels = {
    continuity: [
      "Continuidad alta",
      "High continuity"
    ],

    moderate: [
      "Mutación moderada",
      "Moderate mutation"
    ],

    radical: [
      "Mutación radical",
      "Radical mutation"
    ]
  };


  return (
    labels[
      value
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    value ??
    "—"
  );
}

function renderChecks(
  checks,
  language
) {

  const ordered = [
    ...(
      checks ??
      []
    )
  ].sort(
    (
      left,
      right
    ) =>
      statusOrder(
        left.status
      ) -
      statusOrder(
        right.status
      )
  );


  return `
    <section class="fakemon-wizard__review-checks">

      <header>

        <div>
          <i class="fa-solid fa-list-check"></i>
          <strong>Design Check</strong>
        </div>

        <small>
          ${
            language === "en"
              ? "Explainable Wizard signals"
              : "Señales explicables del Wizard"
          }
        </small>

      </header>


      <div class="fakemon-wizard__review-check-list">

        ${
          ordered
            .map(
              entry => `
                <div
                  class="fakemon-wizard__review-check"
                  data-status="${escapeAttribute(
                    entry.status
                  )}"
                >

                  <i class="${checkIcon(
                    entry.status
                  )}"></i>

                  <div>

                    <strong>
                      ${escapeHtml(
                        checkText(
                          entry,
                          language
                        )
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        sectionLabel(
                          entry.section,
                          language
                        )
                      )}
                    </small>

                  </div>

                </div>
              `
            )
            .join(
              ""
            )
        }

      </div>

    </section>
  `;
}


function checkText(
  check,
  language
) {

  const data =
    check.data ??
    {};


  const type =
    data.type
      ? typeLabel(
          data.type,
          language
        )
      : "";


  const text = {
    "reference-confidence-high": [
      "La recomendación estadística tiene confianza alta en sus referencias.",
      "The statistical recommendation has high reference confidence."
    ],

    "reference-confidence-medium": [
      "La confianza de referencias es media; conviene revisar los valores sugeridos.",
      "Reference confidence is medium; review the suggested values."
    ],

    "reference-confidence-low": [
      "La confianza de referencias es baja; el Wizard tuvo evidencia comparable limitada.",
      "Reference confidence is low; the Wizard had limited comparable evidence."
    ],

    "primary-type-represented": [
      `${type} está representado en el Learnset por nivel seleccionado.`,
      `${type} is represented in the selected Level Learnset.`
    ],

    "secondary-type-represented": [
      `${type} está representado en el Learnset por nivel seleccionado.`,
      `${type} is represented in the selected Level Learnset.`
    ],

    "missing-primary-type-representation": [
      `${type} tiene candidatos válidos, pero ninguno está seleccionado para el Learnset por nivel.`,
      `${type} has valid candidates, but none are selected for the Level Learnset.`
    ],

    "missing-secondary-type-representation": [
      `${type} tiene candidatos válidos, pero ninguno está seleccionado para el Learnset por nivel.`,
      `${type} has valid candidates, but none are selected for the Level Learnset.`
    ],

    "type-candidate-unavailable": [
      `No se encontró ningún Move ${type} por nivel en el pool actual de evidencia Poke5e.`,
      `No ${type} Level Move candidate was found in the current Poke5e evidence pool.`
    ],

    "ability-affinity-represented": [
      `Al menos una Ability seleccionada tiene afinidad estadística relevante con ${type}.`,
      `At least one selected Ability has meaningful statistical affinity with ${type}.`
    ],

    "ability-affinity-not-selected": [
      `Hay Abilities con afinidad ${type} en el pool recomendado, pero ninguna está seleccionada.`,
      `There are Abilities with ${type} affinity in the recommendation pool, but none are selected.`
    ],

    "ability-affinity-unavailable": [
      `No se encontró una afinidad estadística fuerte de Ability con ${type}.`,
      `No strong statistical Ability affinity with ${type} was found.`
    ],

    "learnset-count-aligned": [
      `El Learnset seleccionado (${data.selectedCount}) es cercano al objetivo observado (${data.targetCount}).`,
      `The selected Learnset (${data.selectedCount}) is close to the observed target (${data.targetCount}).`
    ],

    "learnset-count-deviation": [
      `El Learnset tiene ${data.selectedCount} Moves y el perfil observado sugiere cerca de ${data.targetCount}.`,
      `The Learnset has ${data.selectedCount} Moves while the observed profile suggests about ${data.targetCount}.`
    ],

    "learnset-target-unavailable": [
      "El Wizard no pudo establecer un tamaño objetivo fiable para el Learnset.",
      "The Wizard could not establish a reliable target Learnset size."
    ],

    "learnset-progression-covered": [
      "Los Moves seleccionados cubren todos los tramos de progresión sugeridos.",
      "The selected Moves cover every suggested progression tier."
    ],

    "learnset-progression-gaps": [
      `Hay tramos sin Moves seleccionados: ${formatLevels(
        data.missingLevels
      )}.`,
      `Some progression tiers have no selected Move: ${formatLevels(
        data.missingLevels
      )}.`
    ],

    "offense-has-damage": [
      "El perfil de ofensiva alta tiene opciones de daño por nivel.",
      "The high-offense profile has damaging Level Moves."
    ],

    "offense-without-damage": [
      "El perfil solicita ofensiva alta, pero no hay Moves de daño seleccionados por nivel.",
      "The profile requests high offense, but no damaging Level Move is selected."
    ],

    "offense-mode-compatible": [
      "La mayoría de los Moves de daño evaluables coincide con la orientación ofensiva.",
      "Most evaluable damaging Moves match the offensive orientation."
    ],

    "offense-mode-mismatch": [
      `Solo ${data.compatible} de ${data.evaluable} Moves de daño evaluables coinciden con la orientación ${data.mode}.`,
      `Only ${data.compatible} of ${data.evaluable} evaluable damaging Moves match the ${data.mode} orientation.`
    ],

    "control-utility-present": [
      "El perfil alto de Control / Utilidad tiene Moves de utilidad seleccionados.",
      "The high Control / Utility profile has utility-oriented Moves selected."
    ],

    "control-utility-missing": [
      "El perfil solicita Control / Utilidad alto, pero no hay Moves de utilidad seleccionados.",
      "The profile requests high Control / Utility, but no utility-oriented Level Move is selected."
    ],

    "durability-tools-present": [
      "El perfil de durabilidad alta incluye herramientas de Defense o Sustain.",
      "The high-durability profile includes Defense or Sustain tools."
    ],

    "durability-tools-missing": [
      "El perfil solicita durabilidad alta, pero no hay Moves de Defense o Sustain seleccionados.",
      "The profile requests high durability, but no Defense or Sustain Level Move is selected."
    ],

    "coverage-present": [
      "El Learnset de daño incluye cobertura fuera de los tipos propios.",
      "The damaging Learnset includes off-type coverage."
    ],

    "coverage-limited": [
      "El Learnset de daño tiene poca o ninguna cobertura fuera de tipo.",
      "The damaging Learnset has little or no off-type coverage."
    ],

    "low-risk-profile-has-risk-moves": [
      `${data.riskCount} Moves seleccionados tienen señales de recoil o self-damage para este perfil de bajo riesgo.`,
      `${data.riskCount} selected Moves carry recoil or self-damage signals for this low-risk profile.`
    ],

    "expanded-type-reference-pool": [
      `El Wizard amplió la búsqueda fuera del rango de poder para: ${formatTypes(
        data.types,
        language
      )}.`,
      `The Wizard expanded the power-band search for: ${formatTypes(
        data.types,
        language
      )}.`
    ],

    "no-exact-type-references": [
      `No había referencias con la combinación exacta ${formatTypes(
        data.types,
        language
      )}.`,
      `No exact ${formatTypes(
        data.types,
        language
      )} type-combination reference was available.`
    ],

    "evolution-delta-supported": [
      `El Delta Profiler encontró ${data.comparableCount} Evolutions Poke5e comparables para la especie de origen.`,
      `The Delta Profiler found ${data.comparableCount} comparable Poke5e Evolutions for the source species.`
    ],

    "evolution-delta-fallback": [
      "No hubo pares de Evolution oficiales utilizables; el balance usa el perfil objetivo general como fallback.",
      "No usable official Evolution pairs were available; balance falls back to the general target profile."
    ],

    "evolution-radical-mutation": [
      "La mutación radical da más peso al perfil nuevo y menos continuidad estadística con la especie de origen.",
      "Radical mutation gives more weight to the new target profile and less statistical continuity with the source species."
    ],

    "evolution-source-identity-present": [
      `La selección conserva ${data.selectedInherited} elementos principales de la especie de origen.`,
      `The selection preserves ${data.selectedInherited} core elements from the source species.`
    ],

    "evolution-source-identity-missing": [
      "La Evolution fue configurada con continuidad alta, pero no conserva ninguna Ability ni Move por nivel de la especie de origen.",
      "The Evolution was configured for high continuity, but keeps no Ability or Level Move from the source species."
    ],

    "evolution-level-inheritance-aligned": [
      `El Learnset conserva ${data.selectedInheritedCount} Moves heredados frente a un objetivo blando de ${data.desiredInheritedCount}.`,
      `The Learnset keeps ${data.selectedInheritedCount} inherited Moves against a soft target of ${data.desiredInheritedCount}.`
    ],

    "evolution-level-inheritance-below-target": [
      `El Learnset conserva ${data.selectedInheritedCount} Moves heredados; la evidencia Poke5e y el grado de mutación sugieren cerca de ${data.desiredInheritedCount}.`,
      `The Learnset keeps ${data.selectedInheritedCount} inherited Moves; Poke5e evidence and mutation degree suggest about ${data.desiredInheritedCount}.`
    ],

    "evolution-requirements-defined": [
      `La Evolution tiene ${data.conditionCount} condición(es) y ${data.evolutionPoints} Evolution Points configurados.`,
      `The Evolution has ${data.conditionCount} condition(s) and ${data.evolutionPoints} Evolution Points configured.`
    ],

    "evolution-tradeoff-mode": [
      `Esta Evolution usa la regla custom Tradeoff: puede llegar a ${data.cap}, pero cada punto nuevo sobre 20 requiere sacrificio en otros Ability Scores.`,
      `This Evolution uses the custom Tradeoff rule: it may reach ${data.cap}, but each new point above 20 requires sacrifice in other Ability Scores.`
    ],
  };


  return (
    text[
      check.code
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    check.code
  );
}


function metric(
  label,
  value,
  icon
) {

  return `
    <div class="fakemon-wizard__review-metric">
      <i class="${icon}"></i>
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}


function statusOrder(
  status
) {

  return {
    warning:
      0,

    info:
      1,

    pass:
      2
  }[
    status
  ] ??
    3;
}


function checkIcon(
  status
) {

  return {
    warning:
      "fa-solid fa-triangle-exclamation",

    info:
      "fa-solid fa-circle-info",

    pass:
      "fa-solid fa-circle-check"
  }[
    status
  ] ??
    "fa-solid fa-circle";
}


function sectionLabel(
  section,
  language
) {

  const labels = {
    references: [
      "Referencias",
      "References"
    ],

    learnset: [
      "Learnset",
      "Learnset"
    ],

    abilities: [
      "Abilities",
      "Abilities"
    ],

    roles: [
      "Perfil mecánico",
      "Mechanical profile"
    ],

    evolution: [
      "Evolution",
      "Evolution"
    ],
  };


  return (
    labels[
      section
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    section
  );
}


function confidenceLabel(
  level,
  language
) {

  const labels = {
    high: [
      "Confianza alta",
      "High confidence"
    ],

    medium: [
      "Confianza media",
      "Medium confidence"
    ],

    low: [
      "Confianza baja",
      "Low confidence"
    ]
  };


  return (
    labels[
      level
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    labels.low[
      language === "en"
        ? 1
        : 0
    ]
  );
}


function archetypeLabel(
  archetype,
  language
) {

  const labels = {
    tank: [
      "Tank",
      "Tank"
    ],

    "offensive-tank": [
      "Tank ofensivo",
      "Offensive Tank"
    ],

    "physical-attacker": [
      "Atacante físico",
      "Physical Attacker"
    ],

    "special-attacker": [
      "Atacante especial",
      "Special Attacker"
    ],

    "mixed-attacker": [
      "Atacante mixto",
      "Mixed Attacker"
    ],

    "fast-striker": [
      "Fast Striker",
      "Fast Striker"
    ],

    "support-controller": [
      "Support / Controller",
      "Support / Controller"
    ],

    "glass-cannon": [
      "Glass Cannon",
      "Glass Cannon"
    ]
  };


  return (
    labels[
      normalizeId(
        archetype
      )
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    String(
      archetype ??
      "—"
    )
  );
}


function offenseModeLabel(
  mode,
  language
) {

  const labels = {
    physical: [
      "Física",
      "Physical"
    ],

    special: [
      "Especial",
      "Special"
    ],

    mixed: [
      "Mixta",
      "Mixed"
    ]
  };


  return (
    labels[
      normalizeId(
        mode
      )
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    (
      language === "en"
        ? "Automatic"
        : "Automática"
    )
  );
}


function roleLabel(
  role,
  language
) {

  const labels = {
    stab: [
      "STAB",
      "STAB"
    ],

    coverage: [
      "Coverage",
      "Coverage"
    ],

    utility: [
      "Utility",
      "Utility"
    ],

    control: [
      "Control",
      "Control"
    ],

    support: [
      "Support",
      "Support"
    ],

    setup: [
      "Setup",
      "Setup"
    ],

    defense: [
      "Defense",
      "Defense"
    ],

    sustain: [
      "Sustain",
      "Sustain"
    ],

    mobility: [
      "Mobility",
      "Mobility"
    ],

    offense: [
      "Ofensiva",
      "Offense"
    ]
  };


  return (
    labels[
      normalizeId(
        role
      )
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    role
  );
}


function formatLevels(
  levels
) {

  return (
    levels ??
    []
  )
    .map(
      level =>
        `Nv. ${level}`
    )
    .join(
      ", "
    );
}


function formatTypes(
  types,
  language
) {

  return (
    types ??
    []
  )
    .map(
      type =>
        typeLabel(
          type,
          language
        )
    )
    .join(
      " / "
    );
}


function typeLabel(
  type,
  language
) {

  const id =
    normalizeId(
      type
    );


  return (
    POKEMON_TYPES[
      id
    ]?.[
      language
    ] ??
    POKEMON_TYPES[
      id
    ]?.en ??
    id
  );
}


function catalogById(
  entries
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
          normalizeId(
            entry.id
          ),
          entry
        ]
      )
  );
}


function localizedName(
  entry,
  language,
  fallback
) {

  const value =
    entry?.name;


  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {

    return String(
      value[
        language
      ] ??
      value.es ??
      value.en ??
      fallback
    );
  }


  return String(
    value ??
    fallback
  );
}


function renderProgress(
  language
) {

  return `
    <div class="fakemon-wizard__progress">

      <span>
        ${
          language === "en"
            ? "Step 6 of 6"
            : "Paso 6 de 6"
        }
      </span>

      <div>
        ${
          Array.from(
            {
              length:
                6
            },
            () =>
              `<i class="is-active" aria-hidden="true"></i>`
          ).join(
            ""
          )
        }
      </div>

    </div>
  `;
}


function normalizeId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}



function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );
}