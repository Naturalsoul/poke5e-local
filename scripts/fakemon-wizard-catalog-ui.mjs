import { escapeHtml } from "./html.mjs";
import {
  POKEMON_TYPES
} from "./types.mjs";
import { normalizeId } from "./ids.mjs";

const {
  DialogV2
} =
  foundry.applications.api;


export async function promptFakemonCatalogRecommendations({
  database,
  recommendations,
  initialSelections = null,
  language = "es"
}) {

  let preservedSelections =
    initialSelections;


  while (true) {

    const result =
      await DialogV2.wait({
        classes: [
          "poke5e-fakemon-wizard-dialog"
        ],

        window: {
          title:
            language === "en"
              ? "Fakemon Wizard · Step 5/6"
              : "Fakemon Wizard · Paso 5/6"
        },

        position: {
          width:
            940
        },

        content:
          renderCatalogStep({
            database,
            recommendations,

            initialSelections:
              preservedSelections,

            language
          }),

        buttons: [
          {
            action:
              "back",

            label:
              language === "en"
                ? "Back"
                : "Volver atrás",

            callback:
              (...callbackArgs) => ({
                action:
                  "back",

                selections:
                  readCatalogSelections(
                    callbackArgs[1]
                      .form
                  )
              })
          },

          {
            action:
              "next",

            label:
              language === "en"
                ? "Review design"
                : "Revisar diseño",

            default:
              true,

            callback:
              (...callbackArgs) => {

                const form =
                  callbackArgs[1]
                    .form;


                return {
                  action:
                    "next",

                  selections:
                    readCatalogSelections(
                      form
                    )
                };
              }
          }
        ],

        rejectClose:
          false,

        modal:
          true
      });


    if (!result) {
      return null;
    }


    if (
      result.action ===
      "back"
    ) {
      return result;
    }


    preservedSelections =
      result.selections;


    if (
      preservedSelections
        ?.abilityIds
        ?.length
    ) {

      return {
        action:
          "next",

        selections:
          preservedSelections
      };
    }


    ui.notifications.warn(
      language === "en"
        ? "Select at least one Ability for the Fakemon."
        : "Selecciona al menos una Ability para el Fakemon."
    );
  }
}


function renderCatalogStep({
  database,
  recommendations,
  initialSelections,
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


  return `
    <div class="fakemon-wizard fakemon-wizard--catalog">

      ${renderProgress(
        language
      )}

      ${renderRecommendationEvidence(
        recommendations.evidence,
        language
      )}

      ${renderEvolutionContinuity(
        recommendations.evolutionContinuity,
        language
      )}

      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-wand-magic-sparkles"></i>

        <div>

          <strong>
            Moves & Abilities
          </strong>

          <span>
            ${
              language === "en"
                ? "Choose which Poke5e recommendations will be copied into the editable Fakemon draft."
                : "Elige qué recomendaciones Poke5e se copiarán al borrador editable del Fakemon."
            }
          </span>

        </div>

      </div>


      <div class="fakemon-wizard__catalog-columns">

        ${renderSection({
          title:
            "Abilities",

          icon:
            "fa-solid fa-sparkles",

          entries:
            recommendations.abilities,

          emptyLabel:
            language === "en"
              ? "No Ability recommendations were found."
              : "No se encontraron recomendaciones de Ability.",

          renderer:
            entry =>
              renderAbility({
                entry:
                  withInitialSelection({
                    entry,
                    initialSelections,
                    key:
                      "abilityIds",
                    id:
                      entry.id
                  }),

                ability:
                  abilityById.get(
                    entry.id
                  ),

                language
              })
        })}


        ${renderSection({
          title:
            "Egg Moves",

          icon:
            "fa-solid fa-egg",

          entries:
            recommendations.eggMoves,

          emptyLabel:
            language === "en"
              ? "No Egg Move recommendations were found."
              : "No se encontraron Egg Moves recomendados.",

          renderer:
            entry =>
              renderMove({
                entry:
                  withInitialSelection({
                    entry,
                    initialSelections,
                    key:
                      "eggMoveIds",
                    id:
                      entry.moveId
                  }),

                move:
                  moveById.get(
                    entry.moveId
                  ),

                inputName:
                  "eggMoveIds",

                kind:
                  "egg",

                language
              })
        })}

      </div>

      ${renderLearnsetProfile(
        recommendations.learnsetProfile,
        language
      )}

      ${renderSection({
        title:
          language === "en"
            ? "Level Learnset"
            : "Learnset por nivel",

        icon:
          "fa-solid fa-book-open",

        entries:
          recommendations.levelMoves,

        wide:
          true,

        emptyLabel:
          language === "en"
            ? "No level Move recommendations were found."
            : "No se encontraron Moves por nivel recomendados.",

        renderer:
          entry =>
            renderMove({
              entry:
                withInitialSelection({
                  entry,
                  initialSelections,
                  key:
                    "levelMoveIds",
                  id:
                    entry.moveId
                }),

              move:
                moveById.get(
                  entry.moveId
                ),

              inputName:
                "levelMoveIds",

              kind:
                "level",

              language
            })
      })}


      ${renderSection({
        title:
          "Technical Machines",

        icon:
          "fa-solid fa-compact-disc",

        entries:
          recommendations.tms,

        wide:
          true,

        emptyLabel:
          language === "en"
            ? "No TM recommendations were found."
            : "No se encontraron TMs recomendadas.",

        renderer:
          entry =>
            renderMove({
              entry:
                withInitialSelection({
                  entry,
                  initialSelections,
                  key:
                    "tmMoveIds",
                  id:
                    entry.moveId
                }),

              move:
                moveById.get(
                  entry.moveId
                ),

              inputName:
                "tmMoveIds",

              kind:
                "tm",

              language
            })
      })}


      <div class="fakemon-wizard__method-note">

        <i class="fa-solid fa-circle-info"></i>

        <span>
          ${
            language === "en"
              ? "Candidates come from normalized Poke5e comparables and same-type species in a comparable power band when enough references exist. Move role affinity uses powerAbilities and structural Move data; it does not create new Poke5e rules."
              : "Los candidatos provienen de comparables Poke5e normalizados y, cuando existe muestra suficiente, de especies del mismo tipo dentro de un rango de poder comparable. La afinidad de rol usa powerAbilities y datos estructurales del Move; no crea reglas Poke5e nuevas."
          }
        </span>

      </div>

    </div>
  `;
}

function renderEvolutionContinuity(
  continuity,
  language
) {

  if (!continuity) {
    return "";
  }


  const channels =
    continuity
      ?.observed
      ?.channels ??
    {};


  const summaries = [
    [
      "Abilities",
      channels.abilities
    ],

    [
      language === "en"
        ? "Level Moves"
        : "Moves por nivel",

      channels.levelMoves
    ],

    [
      "Egg Moves",
      channels.eggMoves
    ],

    [
      "TMs",
      channels.tms
    ]
  ]
    .filter(
      ([
        ,
        channel
      ]) =>
        Number.isFinite(
          Number(
            channel?.retention
          )
        )
    )
    .map(
      ([
        label,
        channel
      ]) =>
        `${label}: ${Math.round(
          Number(
            channel.retention
          ) *
          100
        )}%`
    );


  return `
    <div class="fakemon-wizard__method-note">

      <i class="fa-solid fa-code-branch"></i>

      <span>

        <strong>
          ${
            language === "en"
              ? "Evolution continuity"
              : "Continuidad evolutiva"
          }:
        </strong>

        ${escapeHtml(
          continuity.sourceName ??
          continuity.sourceSpeciesId ??
          "—"
        )}

        ·

        ${
          summaries.length
            ? escapeHtml(
                summaries.join(
                  " · "
                )
              )
            : (
                language === "en"
                  ? "No comparable retention sample"
                  : "Sin muestra comparable de retención"
              )
        }

      </span>

    </div>
  `;
}

function renderLearnsetProfile(
  profile,
  language
) {

  const levels =
    profile?.levels ??
    [];


  if (!levels.length) {
    return "";
  }


  const summary =
    levels
      .filter(
        entry =>
          Number(
            entry?.targetCount
          ) >
          0
      )
      .map(
        entry =>
          `Nv. ${entry.level}: ${entry.targetCount}`
      )
      .join(
        " · "
      );


  return `
    <div class="fakemon-wizard__method-note">

      <i class="fa-solid fa-list-ol"></i>

      <span>

        <strong>
          ${
            language === "en"
              ? "Observed Poke5e learnset shape"
              : "Estructura de Learnset observada en Poke5e"
          }:
        </strong>

        ${escapeHtml(
          summary
        )}

        ·

        ${
          language === "en"
            ? `${profile.selectedMoveCount} preselected Moves`
            : `${profile.selectedMoveCount} Moves preseleccionados`
        }

      </span>

    </div>
  `;
}

function renderRecommendationEvidence(
  evidence,
  language
) {

  const typePeers =
    evidence?.typePeers ??
    [];


  const exact =
    evidence?.exactTypePeers;


  const typeSummary =
    typePeers
      .map(
        entry => {

          const label =
            typeLabel(
              entry.type,
              language
            );


          const band =
            entry.powerBandApplied
              ? (
                  language === "en"
                    ? "power band"
                    : "rango de poder"
                )
              : (
                  language === "en"
                    ? "expanded pool"
                    : "pool ampliado"
                );


          return (
            `${label}: ` +
            `${entry.species} ` +
            `${language === "en" ? "references" : "referencias"} ` +
            `(${band})`
          );
        }
      );


  if (
    exact?.species
  ) {

    typeSummary.push(
      language === "en"
        ? `Exact type combination: ${exact.species} references`
        : `Combinación exacta de tipos: ${exact.species} referencias`
    );
  }


  return `
    <div class="fakemon-wizard__method-note">

      <i class="fa-solid fa-database"></i>

      <span>
        ${escapeHtml(
          typeSummary.join(
            " · "
          )
        )}
      </span>

    </div>
  `;
}

function renderProgress(
  language
) {

  return `
    <div class="fakemon-wizard__progress">

      <span>
        ${
          language === "en"
            ? "Step 5 of 6"
            : "Paso 5 de 6"
        }
      </span>

      <div>

        ${
          Array.from(
            {
              length:
                6
            },
            (
              _,
              index
            ) => `
              <i
                class="${index < 5 ? "is-active" : ""}"
                aria-hidden="true"
              ></i>
            `
          ).join(
            ""
          )
        }

      </div>

    </div>
  `;
}

function renderSection({
  title,
  icon,
  entries,
  emptyLabel,
  renderer,
  wide = false
}) {

  return `
    <section
      class="fakemon-wizard__recommendation-section${
        wide
          ? " fakemon-wizard__recommendation-section--wide"
          : ""
      }"
    >

      <header>

        <div>
          <i class="${icon}"></i>

          <strong>
            ${escapeHtml(
              title
            )}
          </strong>
        </div>


        <span>
          ${entries.length}
        </span>

      </header>


      <div class="fakemon-wizard__recommendation-list">

        ${
          entries.length
            ? entries
                .map(
                  renderer
                )
                .join(
                  ""
                )
            : `
                <div class="fakemon-wizard__recommendation-empty">
                  ${escapeHtml(
                    emptyLabel
                  )}
                </div>
              `
        }

      </div>

    </section>
  `;
}


function renderAbility({
  entry,
  ability,
  language
}) {

  const name =
    localizedName(
      ability,
      language,
      entry.id
    );


  return `
    <label class="fakemon-wizard__recommendation-card">

      <input
        type="checkbox"
        name="abilityIds"
        value="${escapeHtml(
          entry.id
        )}"
        ${
          entry.selected
            ? "checked"
            : ""
        }
      >


      <span class="fakemon-wizard__recommendation-card-body">

        <span class="fakemon-wizard__recommendation-heading">

          <strong>
            ${escapeHtml(
              name
            )}
          </strong>

          ${renderEvolutionBadges(
            entry,
            language
          )}

          ${
            entry.hidden
              ? `
                  <em>
                    <i class="fa-solid fa-eye-slash"></i>
                    Hidden
                  </em>
                `
              : ""
          }

          ${renderAbilityTypeAffinities(
            entry.typeAffinities,
            language
          )}

          ${renderAffinity(
            entry.score,
            language
          )}

        </span>


        <small>
          ${escapeHtml(
            reasonText(
              entry.reasons,
              language
            )
          )}
        </small>

      </span>

    </label>
  `;
}


function renderMove({
  entry,
  move,
  inputName,
  kind,
  language
}) {

  const moveId =
    entry.moveId;


  const type =
    normalizeId(
      move?.type
    );


  const name =
    localizedName(
      move,
      language,
      moveId
    );


  const pp =
    Number(
      move?.pp
    );


  const powerAbilities =
    normalizePowerAbilities(
      move?.powerAbilities
    );


  return `
    <label
      class="
        fakemon-wizard__recommendation-card
        fakemon-wizard__recommendation-card--move
      "
    >

      <input
        type="checkbox"
        name="${escapeHtml(
          inputName
        )}"
        value="${escapeHtml(
          moveId
        )}"
        ${
          entry.selected
            ? "checked"
            : ""
        }
      >


      <span class="fakemon-wizard__recommendation-card-body">

        <span class="fakemon-wizard__recommendation-heading">

          <strong>
            ${escapeHtml(
              name
            )}
          </strong>

          ${renderEvolutionBadges(
            entry,
            language
          )}

          ${renderAffinity(
            entry.score,
            language
          )}

        </span>


        <span class="fakemon-wizard__move-meta">

          <em
            class="fakemon-wizard__move-type"
            style="--wizard-type-color: ${escapeHtml(
              POKEMON_TYPES[
                type
              ]?.color ??
              "#8c969b"
            )}"
          >
            ${escapeHtml(
              typeLabel(
                type,
                language
              )
            )}
          </em>


          <span>
            PP ${
              Number.isFinite(
                pp
              ) &&
              pp > 0
                ? pp
                : "∞"
            }
          </span>


          ${
            powerAbilities.length
              ? `
                  <span>
                    STAT ${escapeHtml(
                      powerAbilities
                        .join(
                          " / "
                        )
                        .toUpperCase()
                    )}
                  </span>
                `
              : ""
          }


          ${
            kind ===
              "level"
              ? `
                  <span>
                    ${escapeHtml(
                      learnsetStageLabel(
                        entry.learnsetStage,
                        language
                      )
                    )}
                    · Nv. ${escapeHtml(
                      entry.level
                    )}
                  </span>
                `
              : ""
          }


          ${
            kind ===
              "tm"
              ? `
                  <span>
                    TM ${escapeHtml(
                      entry.id
                    )}
                    ·
                    ${escapeHtml(
                      entry.cost
                    )}
                  </span>
                `
              : ""
          }

        </span>


        <small>
          ${escapeHtml(
            reasonText(
              entry.reasons,
              language
            )
          )}
        </small>

      </span>

    </label>
  `;
}

function renderEvolutionBadges(
  entry,
  language
) {

  const badges =
    [];


  if (
    entry?.inheritedFromSource
  ) {

    badges.push(
      `<em>
        <i class="fa-solid fa-link"></i>
        ${language === "en" ? "Inherited" : "Heredado"}
      </em>`
    );
  }


  if (
    entry?.newTypeIdentity
  ) {

    badges.push(
      `<em>
        <i class="fa-solid fa-dna"></i>
        ${language === "en" ? "New identity" : "Nueva identidad"}
      </em>`
    );
  }


  return badges.join(
    ""
  );
}

function renderAbilityTypeAffinities(
  affinities,
  language
) {

  return (
    Array.isArray(
      affinities
    )
      ? affinities
      : []
  )
    .filter(
      entry =>
        Number(
          entry?.score
        ) >=
        0.20
    )
    .map(
      entry => {

        const type =
          normalizeId(
            entry.type
          );


        const label =
          typeLabel(
            type,
            language
          );


        const percentage =
          Math.round(
            Number(
              entry.score
            ) *
            100
          );


        return `
          <em
            class="fakemon-wizard__move-type"
            style="--wizard-type-color: ${escapeHtml(
              POKEMON_TYPES[
                type
              ]?.color ??
              "#8c969b"
            )}"
            title="${
              language === "en"
                ? "Statistical affinity with this Pokémon type"
                : "Afinidad estadística con este tipo Pokémon"
            }"
          >
            ${
              language === "en"
                ? "Affinity"
                : "Afinidad"
            }
            ${escapeHtml(
              label
            )}
            ${percentage}%
          </em>
        `;
      }
    )
    .join(
      ""
    );
}

function learnsetStageLabel(
  stage,
  language
) {

  const labels = {
    starting: {
      es:
        "Inicial",

      en:
        "Starting"
    },

    early: {
      es:
        "Temprano",

      en:
        "Early"
    },

    mid: {
      es:
        "Medio",

      en:
        "Mid"
    },

    late: {
      es:
        "Tardío",

      en:
        "Late"
    },

    capstone: {
      es:
        "Final",

      en:
        "Capstone"
    }
  };


  return (
    labels[
      stage
    ]?.[
      language
    ] ??
    labels[
      stage
    ]?.en ??
    (
      language === "en"
        ? "Suggested"
        : "Sugerido"
    )
  );
}

function renderAffinity(
  score,
  language
) {

  return `
    <span class="fakemon-wizard__affinity-score">
      ${
        language === "en"
          ? "Relevance"
          : "Relevancia"
      }
      ${Math.round(
        Number(
          score
        ) *
        100
      )}%
    </span>
  `;
}


function reasonText(
  reasonCodes,
  language
) {

  const labels = {
    "comparable-frequency": {
      es:
        "Frecuente entre comparables",

      en:
        "Frequent among comparables"
    },

    "type-frequency": {
      es:
        "Aparece en especies del mismo tipo",

      en:
        "Observed in same-type species"
    },

    "hidden-pattern": {
      es:
        "Suele aparecer como Hidden Ability",

      en:
        "Often appears as a Hidden Ability"
    },

    stab: {
      es:
        "Coincide con el tipo del Fakemon",

      en:
        "Matches the Fakemon type"
    },

    "physical-fit": {
      es:
        "Compatible con STR / DEX",

      en:
        "Compatible with STR / DEX"
    },

    "special-fit": {
      es:
        "Compatible con INT / WIS / CHA",

      en:
        "Compatible with INT / WIS / CHA"
    },

    "mixed-fit": {
      es:
        "Compatible con perfil mixto",

      en:
        "Compatible with a mixed profile"
    },

    "utility-fit": {
      es:
        "Compatible con Control / Utilidad",

      en:
        "Compatible with Control / Utility"
    },

    "observed-level": {
      es:
        "Aprendido por nivel en Poke5e",

      en:
        "Observed as a level Move in Poke5e"
    },

    "observed-egg": {
      es:
        "Observado como Egg Move en Poke5e",

      en:
        "Observed as an Egg Move in Poke5e"
    },

    "observed-tm": {
      es:
        "Compatibilidad TM observada en Poke5e",

      en:
        "Observed TM compatibility in Poke5e"
    },

    "type-affinity": {
      es:
        "Afinidad estadística con los tipos seleccionados",

      en:
        "Statistical affinity with the selected types"
    },

    "exact-type-frequency": {
      es:
        "Observado en especies con la misma combinación de tipos",

      en:
        "Observed in species with the same type combination"
    },

    "composition-starting": {
      es:
        "Seleccionado para el pool inicial",

      en:
        "Selected for the Starting pool"
    },

    "composition-early": {
      es:
        "Seleccionado para progresión temprana",

      en:
        "Selected for early progression"
    },

    "composition-mid": {
      es:
        "Seleccionado para progresión media",

      en:
        "Selected for mid progression"
    },

    "composition-late": {
      es:
        "Seleccionado para progresión tardía",

      en:
        "Selected for late progression"
    },

    "composition-capstone": {
      es:
        "Seleccionado para el tramo final",

      en:
        "Selected for the final progression tier"
    },

    "composition-stab": {
      es:
        "Aporta ofensiva del tipo del Fakemon",

      en:
        "Provides same-type offense"
    },

    "composition-coverage": {
      es:
        "Aporta cobertura ofensiva",

      en:
        "Provides offensive coverage"
    },

    "composition-utility": {
      es:
        "Aporta utilidad al Learnset",

      en:
        "Provides Learnset utility"
    },

    "composition-offense": {
      es:
        "Aporta una opción ofensiva adicional",

      en:
        "Provides an additional offensive option"
    },

        "source-inheritance": {
      es:
        "Presente en la especie de origen",

      en:
        "Present in the source species"
    },

    "evolution-pattern": {
      es:
        "Observado en evoluciones Poke5e comparables",

      en:
        "Observed in comparable Poke5e Evolutions"
    },

    "new-type-identity": {
      es:
        "Refuerza un tipo nuevo de la Evolution",

      en:
        "Reinforces a new Evolution type"
    },
  };


  return (
    Array.isArray(
      reasonCodes
    )
      ? reasonCodes
      : []
  )
    .map(
      code =>
        labels[
          code
        ]?.[
          language
        ] ??
        labels[
          code
        ]?.en ??
        code
    )
    .join(
      " · "
    );
}

function withInitialSelection({
  entry,
  initialSelections,
  key,
  id
}) {

  const values =
    initialSelections?.[
      key
    ];


  if (
    !Array.isArray(
      values
    )
  ) {
    return entry;
  }


  const selected =
    new Set(
      values.map(
        value =>
          String(
            value ??
            ""
          ).trim()
      )
    );


  return {
    ...entry,

    selected:
      selected.has(
        String(
          id ??
          ""
        ).trim()
      )
  };
}


function readCatalogSelections(
  form
) {

  return {
    abilityIds:
      checkedValues(
        form,
        "abilityIds"
      ),

    levelMoveIds:
      checkedValues(
        form,
        "levelMoveIds"
      ),

    eggMoveIds:
      checkedValues(
        form,
        "eggMoveIds"
      ),

    tmMoveIds:
      checkedValues(
        form,
        "tmMoveIds"
      )
  };
}

function checkedValues(
  form,
  name
) {

  if (!form) {
    return [];
  }


  return [
    ...form.querySelectorAll(
      `input[name="${name}"]:checked`
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


function normalizePowerAbilities(
  value
) {

  if (
    Array.isArray(
      value
    )
  ) {

    return value
      .map(
        normalizeId
      )
      .filter(
        id =>
          id &&
          id !==
            "none"
      );
  }


  const normalized =
    normalizeId(
      value
    );


  return (
    normalized &&
    normalized !==
      "none"
  )
    ? [
        normalized
      ]
    : [];
}


function typeLabel(
  type,
  language
) {

  return (
    POKEMON_TYPES[
      type
    ]?.[
      language
    ] ??
    POKEMON_TYPES[
      type
    ]?.en ??
    type
  );
}