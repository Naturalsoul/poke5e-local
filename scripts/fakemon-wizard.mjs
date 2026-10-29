import { escapeHtml } from "./html.mjs";
import {
  buildFakemonBalanceRecommendation
} from "./fakemon-balance-profiler.mjs";

import {
  FAKEMON_EVOLUTION_ORIGIN_IDS,
  FAKEMON_MUTATION_DEGREE_IDS,
  buildFakemonEvolutionBalanceRecommendation,
  listFakemonEvolutionSourceSpecies,
  resolveFakemonEvolutionSourceSpecies
} from "./fakemon-evolution-design-service.mjs";

import {
  buildFakemonCatalogRecommendations
} from "./fakemon-recommendation-engine.mjs";

import {
  promptFakemonCatalogRecommendations
} from "./fakemon-wizard-catalog-ui.mjs";

import {
  buildFakemonWizardReview
} from "./fakemon-wizard-review-service.mjs";

import {
  promptFakemonWizardReview
} from "./fakemon-wizard-review-ui.mjs";

import {
  listFakemonArchetypes
} from "./fakemon-design-profile.mjs";

import {
  promptFakemonWizardEvolutionRuleStep
} from "./fakemon-wizard-evolution-rule-ui.mjs";

import {
  POKEMON_TYPES,
  POKEMON_TYPE_IDS
} from "./types.mjs";

const {
  DialogV2
} =
  foundry.applications.api;


export async function runFakemonDesignWizard({
  database,
  customSpecies = [],
  language = "es"
}) {

  const mode =
    await promptWizardMode(
      language
    );


  if (!mode) {
    return null;
  }


  const evolutionSources =
    mode ===
      "evolution"
      ? listFakemonEvolutionSourceSpecies({
          database,
          customSpecies
        })
      : [];


  const state = {
    mode,

    customSpecies: [
      ...customSpecies
    ],

    evolutionSetup:
      null,

    evolutionSource:
      null,

    step:
      1,

    concept:
      null,

    roles:
      null,

    priorities:
      null,

    recommendation:
      null,

    catalogRecommendations:
      null,

    selections:
      null,

    evolutionRule:
      null,

    recommendationSignature:
      null
  };


  if (
    mode ===
    "evolution"
  ) {

    const configured =
      await configureEvolutionSetup({
        species:
          evolutionSources,

        language
      });


    if (!configured) {
      return null;
    }


    state.evolutionSetup =
      configured.value;

    state.evolutionSource =
      configured.species;

    state.concept =
      seedEvolutionConcept(
        configured.species
      );
  }


  while (true) {

    if (
      state.step ===
      1
    ) {

      const result =
        await promptConceptStep(
          language,
          state.concept,
          {
            allowBack:
              state.mode ===
              "evolution"
          }
        );


      if (!result) {
        return null;
      }


      if (
        result.value
      ) {

        state.concept =
          result.value;
      }


      if (
        result.action ===
        "back"
      ) {

        const previousSourceId =
          String(
            state.evolutionSource
              ?.id ??
            ""
          );
        const previousSetupSignature =
          evolutionSetupSignature(
            state.evolutionSetup
          );
        const configured =
          await configureEvolutionSetup({
            species:
              evolutionSources,

            initialValue:
              state.evolutionSetup,

            language
          });


        if (!configured) {
          return null;
        }


        state.evolutionSetup =
          configured.value;

        if (
          previousSetupSignature !==
            evolutionSetupSignature(
              configured.value
            )
        ) {
          state.evolutionRule =
            null;
        }

        state.evolutionSource =
          configured.species;


        if (
          String(
            configured.species
              ?.id ??
            ""
          ) !==
          previousSourceId
        ) {

          /*
           * Nuevo origen:
           * los tipos vuelven a partir del source.
           */
          state.concept =
            seedEvolutionConcept(
              configured.species
            );
        }


        continue;
      }


      if (
        !Array.isArray(
          state.concept?.types
        ) ||
        !state.concept.types.length
      ) {

        ui.notifications.warn(
          language === "en"
            ? "Choose at least one Pokémon type."
            : "Selecciona al menos un tipo Pokémon."
        );

        continue;
      }


      state.step =
        2;

      continue;
    }


    if (
      state.step ===
      2
    ) {

      const result =
        await promptRoleStep(
          language,
          state.roles
        );


      if (!result) {
        return null;
      }


      if (
        result.value
      ) {

        state.roles =
          result.value;
      }


      if (
        result.action ===
        "back"
      ) {

        state.step =
          1;

        continue;
      }


      state.step =
        3;

      continue;
    }


    if (
      state.step ===
      3
    ) {

      const result =
        await promptPriorityStep(
          language,
          state.priorities
        );


      if (!result) {
        return null;
      }


      if (
        result.value
      ) {

        state.priorities =
          result.value;
      }


      if (
        result.action ===
        "back"
      ) {

        state.step =
          2;

        continue;
      }


      state.step =
        4;

      continue;
    }


    if (
      state.step ===
      4
    ) {

      if (
        !ensureWizardRecommendations({
          state,
          database,
          language
        })
      ) {
        return null;
      }


      const result =
        await promptRecommendationStep({
          concept:
            state.concept,

          recommendation:
            state.recommendation,

          language
        });


      if (!result) {
        return null;
      }


      state.step =
        result.action ===
          "back"
          ? 3
          : 5;

      continue;
    }


    if (
      state.step ===
      5
    ) {

      const result =
        await promptFakemonCatalogRecommendations({
          database,

          recommendations:
            state.catalogRecommendations,

          initialSelections:
            state.selections,

          language
        });


      if (!result) {
        return null;
      }


      if (
        result.selections
      ) {

        state.selections =
          result.selections;
      }


      if (
        result.action ===
        "back"
      ) {

        state.step =
          4;

        continue;
      }


      state.step =
        6;

      continue;
    }


    if (
  state.step ===
    6 &&
  state.mode ===
    "evolution"
) {

  state.evolutionRule ??=
    buildEvolutionRulePreset({
      database,
      state
    });


  const result =
    await promptFakemonWizardEvolutionRuleStep({
      database,

      initialValue:
        state.evolutionRule,

      language
    });


  if (!result) {
    return null;
  }


  if (
    result.value
  ) {

    state.evolutionRule =
      result.value;
  }


  if (
    result.action ===
      "back"
  ) {

    state.step =
      5;

    continue;
  }


  state.step =
    7;

  continue;
}


  if (
    (
      state.step ===
        6 &&
      state.mode !==
        "evolution"
    ) ||
    (
      state.step ===
        7 &&
      state.mode ===
        "evolution"
    )
  ) {

    const evolutionDesign =
      buildWizardEvolutionDesign(
        state
      );


    const review =
      buildFakemonWizardReview({
        database,

        concept:
          state.concept,

        recommendation:
          state.recommendation,

        catalogRecommendations:
          state.catalogRecommendations,

        selections:
          state.selections,

        evolutionDesign
      });


    const result =
      await promptFakemonWizardReview({
        database,
        review,

        catalogRecommendations:
          state.catalogRecommendations,

        selections:
          state.selections,

        language
      });


    if (!result) {
      return null;
    }


    if (
      result.action ===
        "back"
    ) {

      state.step =
        state.mode ===
          "evolution"
          ? 6
          : 5;

      continue;
    }


    return {
      mode:
        state.mode,

      concept:
        state.concept,

      intent:
        state.recommendation.intent,

      recommendation:
        state.recommendation,

      catalogRecommendations:
        state.catalogRecommendations,

      selections:
        state.selections,

      evolutionDesign,

      pendingEvolution:
        evolutionDesign
          ?.pendingEvolution ??
        null,

      review
    };
  }
  }
}

function ensureWizardRecommendations({
  state,
  database,
  language
}) {

  const signature =
    wizardInputSignature(
      state
    );


  if (
    state.recommendation &&
    state.catalogRecommendations &&
    state.recommendationSignature ===
      signature
  ) {
    return true;
  }


  try {

    const intent = {
      primaryArchetype:
        state.roles.primaryArchetype,

      secondaryArchetype:
        state.roles.secondaryArchetype,

      offenseMode:
        state.priorities.offenseMode,

      stage:
        state.concept.stage,

      types:
        state.concept.types,

      dimensions:
        state.priorities.dimensions
    };


    state.recommendation =
      state.mode ===
        "evolution"

        ? buildFakemonEvolutionBalanceRecommendation({
            database,

            sourceSpecies:
              state.evolutionSource,

            customSpecies:
              state.customSpecies,

            mutationDegree:
              state.evolutionSetup
                .mutationDegree,

            narrativeOrigin:
              state.evolutionSetup
                .narrativeOrigin,

            intent
          })

        : buildFakemonBalanceRecommendation({
            database,
            intent
          });


    state.catalogRecommendations =
      buildFakemonCatalogRecommendations({
        database,

        balanceRecommendation:
          state.recommendation,

        evolutionContext:
          state.mode ===
            "evolution"
            ? {
                sourceSpecies:
                  state.evolutionSource,

                mutationDegree:
                  state.evolutionSetup
                    ?.mutationDegree,

                continuityProfile:
                  state.recommendation
                    ?.evolutionProfile
                    ?.catalogContinuity ??
                  null
              }
            : null
      });


    state.recommendationSignature =
      signature;


    /*
     * Cambió algún parámetro que altera el modelo.
     */
    state.selections =
      null;

    return true;

  } catch (
    error
  ) {

    console.error(
      "[poke5e-local] Error generando recomendación del Fakemon Wizard",
      error
    );


    ui.notifications.error(
      error.message ??
      (
        language === "en"
          ? "Could not generate the Fakemon recommendation."
          : "No se pudo generar la recomendación del Fakemon."
      )
    );

    return false;
  }
}


function wizardInputSignature(
  state
) {

  return JSON.stringify({
    mode:
      state.mode,

    evolution:
      state.mode ===
        "evolution"
        ? {
            sourceSpeciesId:
              state.evolutionSource
                ?.id,

            mutationDegree:
              state.evolutionSetup
                ?.mutationDegree,

            narrativeOrigin:
              state.evolutionSetup
                ?.narrativeOrigin
          }
        : null,

    /*
     * El nombre sigue sin participar.
     */
    concept: {
      stage:
        state.concept?.stage,

      types:
        state.concept?.types
    },

    roles:
      state.roles,

    priorities:
      state.priorities
  });
}

function buildWizardEvolutionDesign(
  state
) {

  if (
    state.mode !==
      "evolution" ||
    !state.evolutionSource ||
    !state.evolutionSetup ||
    !state.evolutionRule
  ) {
    return null;
  }


  const pendingEvolution = {
    id:
      null,

    from:
      String(
        state.evolutionSource.id
      ),

    to:
      null,

    abilityScoreMode:
      state.evolutionRule
        .abilityScoreMode,

    conditions:
      state.evolutionRule
        .conditions
        .map(
          condition => ({
            ...condition
          })
        ),

    effects: [
      {
        type:
          "asi",

        value:
          state.evolutionRule
            .evolutionPoints
      }
    ]
  };


  return {
    sourceSpeciesId:
      String(
        state.evolutionSource.id
      ),

    narrativeOrigin:
      state.evolutionSetup
        .narrativeOrigin,

    mutationDegree:
      state.evolutionSetup
        .mutationDegree,

    rule: {
      evolutionPoints:
        state.evolutionRule
          .evolutionPoints,

      abilityScoreMode:
        state.evolutionRule
          .abilityScoreMode,

      conditions:
        state.evolutionRule
          .conditions
          .map(
            condition => ({
              ...condition
            })
          )
    },

    pendingEvolution,

    profile:
      state.recommendation
        ?.evolutionProfile ??
      null
  };
}

function buildEvolutionRulePreset({
  database,
  state
}) {

  const narrativeOrigin =
    String(
      state.evolutionSetup
        ?.narrativeOrigin ??
      "natural"
    );


  const minimumLevel =
    Math.max(
      1,

      Math.min(
        20,

        Math.round(
          Number(
            state.recommendation
              ?.recommendation
              ?.minimumLevel
              ?.value ??
            1
          )
        )
      )
    );


  const conditionsByOrigin = {
    natural: [
      {
        type:
          "level",

        value:
          minimumLevel
      }
    ],

    bond: [
      {
        type:
          "loyalty",

        value:
          2
      }
    ],

    "rocket-experiment": [
      {
        type:
          "special",

        value:
          "team-rocket-experiment"
      }
    ],

    catalyst: [
      {
        type:
          "item",

        value:
          ""
      }
    ],

    "move-mastery": [
      {
        type:
          "move",

        value:
          ""
      }
    ],

    "special-event": [
      {
        type:
          "special",

        value:
          "special-event"
      }
    ]
  };


  return {
    evolutionPoints:
      recommendedEvolutionPoints({
        database,

        customSpecies:
          state.customSpecies,

        profile:
          state.recommendation
            ?.evolutionProfile
      }),

    abilityScoreMode:
      [
        "bond",
        "rocket-experiment"
      ].includes(
        narrativeOrigin
      )
        ? "tradeoff"
        : "standard",

    conditions:
      (
        conditionsByOrigin[
          narrativeOrigin
        ] ??
        conditionsByOrigin.natural
      ).map(
        condition => ({
          ...condition
        })
      )
  };
}

function recommendedEvolutionPoints({
  database,
  customSpecies,
  profile
}) {

  const customSpeciesIds =
    new Set(
      (
        Array.isArray(
          customSpecies
        )
          ? customSpecies
          : []
      )
        .map(
          species =>
            canonicalId(
              species?.id
            )
        )
        .filter(
          Boolean
        )
    );


  const evolutions =
    (
      Array.isArray(
        database?.evolutions
      )
        ? database.evolutions
        : []
    ).filter(
      evolution =>
        !customSpeciesIds.has(
          canonicalId(
            evolution?.from
          )
        ) &&
        !customSpeciesIds.has(
          canonicalId(
            evolution?.to
          )
        )
    );


  const references =
    Array.isArray(
      profile?.comparables
    )
      ? profile.comparables
      : [];


  const samples =
    references
      .map(
        reference => {

          const from =
            canonicalId(
              reference?.from?.id
            );


          const to =
            canonicalId(
              reference?.to?.id
            );


          const pairValues =
            evolutions
              .filter(
                evolution =>
                  canonicalId(
                    evolution?.from
                  ) ===
                    from &&
                  canonicalId(
                    evolution?.to
                  ) ===
                    to
              )
              .map(
                evolution =>
                  evolutionPointValue(
                    evolution
                  )
              )
              .filter(
                Number.isFinite
              );


          if (!pairValues.length) {
            return null;
          }


          return {
            value:
              averageNumbers(
                pairValues
              ),

            weight:
              Math.max(
                0.05,

                Number(
                  reference?.similarity ??
                  0
                )
              )
          };
        }
      )
      .filter(
        Boolean
      );


  if (samples.length) {

    const totalWeight =
      samples.reduce(
        (
          total,
          sample
        ) =>
          total +
          sample.weight,
        0
      );


    return Math.max(
      0,

      Math.round(
        samples.reduce(
          (
            total,
            sample
          ) =>
            total +
            sample.value *
              sample.weight,
          0
        ) /
        totalWeight
      )
    );
  }


  const globalValues =
    evolutions
      .map(
        evolution =>
          evolutionPointValue(
            evolution
          )
      )
      .filter(
        Number.isFinite
      )
      .sort(
        (
          left,
          right
        ) =>
          left -
          right
      );


  if (!globalValues.length) {
    return 0;
  }


  return Math.round(
    globalValues[
      Math.floor(
        (
          globalValues.length -
          1
        ) /
        2
      )
    ]
  );
}


function evolutionPointValue(
  evolution
) {

  const effect =
    (
      Array.isArray(
        evolution?.effects
      )
        ? evolution.effects
        : []
    ).find(
      entry =>
        canonicalId(
          entry?.type
        ) ===
          "asi"
    );


  const value =
    Number(
      effect?.value
    );


  return Number.isInteger(
    value
  ) &&
  value >=
    0
    ? value
    : Number.NaN;
}


function averageNumbers(
  values
) {

  return values.reduce(
    (
      total,
      value
    ) =>
      total +
      Number(
        value
      ),
    0
  ) /
    values.length;
}


function evolutionSetupSignature(
  value
) {

  return JSON.stringify({
    sourceSpeciesId:
      value?.sourceSpeciesId ??
      null,

    narrativeOrigin:
      value?.narrativeOrigin ??
      null,

    mutationDegree:
      value?.mutationDegree ??
      null
  });
}


function canonicalId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[’']/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function seedEvolutionConcept(
  species
) {

  return {
    name:
      "",

    stage:
      "final",

    types:
      Array.isArray(
        species?.types
      ) &&
      species.types.length
        ? [
            ...species.types
          ].slice(
            0,
            2
          )
        : [
            "normal"
          ]
  };
}


async function promptWizardMode(
  language
) {

  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        language === "en"
          ? "Fakemon Wizard · Design Mode"
          : "Fakemon Wizard · Modo de diseño"
    },

    position: {
      width:
        720
    },

    content:
      renderWizardMode(
        language
      ),

    buttons: [
      {
        action:
          "standalone",

        label:
          language === "en"
            ? "New species"
            : "Nueva especie",

        callback:
          () =>
            "standalone"
      },

      {
        action:
          "evolution",

        label:
          language === "en"
            ? "New Evolution"
            : "Nueva evolución",

        default:
          true,

        callback:
          () =>
            "evolution"
      }
    ],

    rejectClose:
      false,

    modal:
      true
  });
}


async function configureEvolutionSetup({
  species,
  initialValue = null,
  language
}) {

  if (!species.length) {

    ui.notifications.error(
      language === "en"
        ? "No valid source Pokémon are available for Evolution design."
        : "No hay Pokémon de origen válidos para diseñar una Evolution."
    );

    return null;
  }


  let preserved =
    initialValue;


  while (true) {

    const result =
      await promptEvolutionSetup({
        species,

        initialValue:
          preserved,

        language
      });


    if (!result) {
      return null;
    }


    preserved =
      result;


    const sourceSpecies =
      resolveFakemonEvolutionSourceSpecies({
        species,

        value:
          result.sourceSpeciesId
      });


    if (sourceSpecies) {

      return {
        value: {
          sourceSpeciesId:
            String(
              sourceSpecies.id
            ),

          narrativeOrigin:
            result.narrativeOrigin,

          mutationDegree:
            result.mutationDegree
        },

        species:
          sourceSpecies
      };
    }


    ui.notifications.warn(
      language === "en"
        ? "Choose a valid source Pokémon from the catalog."
        : "Selecciona un Pokémon de origen válido del catálogo."
    );
  }
}


async function promptEvolutionSetup({
  species,
  initialValue,
  language
}) {

  return DialogV2.prompt({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        language === "en"
          ? "Fakemon Wizard · Evolution Setup"
          : "Fakemon Wizard · Configuración de Evolution"
    },

    position: {
      width:
        760
    },

    content:
      renderEvolutionSetup({
        species,

        values:
          initialValue,

        language
      }),

    ok: {
      label:
        language === "en"
          ? "Design Evolution"
          : "Diseñar Evolution",

      callback:
        (...callbackArgs) => {

          const form =
            callbackArgs[1]
              .form;


          return {
            sourceSpeciesId:
              String(
                form?.elements
                  ?.sourceSpeciesId
                  ?.value ??
                ""
              ).trim(),

            narrativeOrigin:
              String(
                form?.elements
                  ?.narrativeOrigin
                  ?.value ??
                "natural"
              ).trim(),

            mutationDegree:
              String(
                form?.elements
                  ?.mutationDegree
                  ?.value ??
                "moderate"
              ).trim()
          };
        }
    },

    rejectClose:
      false,

    modal:
      true
  });
}


function renderWizardMode(
  language
) {

  return `
    <div class="fakemon-wizard fakemon-wizard--mode">

      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-dna"></i>

        <div>
          <strong>
            ${
              language === "en"
                ? "What do you want to design?"
                : "¿Qué quieres diseñar?"
            }
          </strong>

          <span>
            ${
              language === "en"
                ? "Create an independent species or evolve an existing Pokémon using observed Poke5e evolution deltas."
                : "Crea una especie independiente o evoluciona un Pokémon existente usando deltas observados en Evolutions Poke5e."
            }
          </span>
        </div>

      </div>


      <div class="fakemon-wizard__mode-grid">

        <article class="fakemon-wizard__mode-card">

          <i class="fa-solid fa-seedling"></i>

          <div>
            <strong>
              ${
                language === "en"
                  ? "New species"
                  : "Nueva especie"
              }
            </strong>

            <span>
              ${
                language === "en"
                  ? "Uses the existing v3.0 design flow."
                  : "Usa el flujo de diseño v3.0 existente."
              }
            </span>
          </div>

        </article>


        <article
          class="
            fakemon-wizard__mode-card
            fakemon-wizard__mode-card--evolution
          "
        >

          <i class="fa-solid fa-code-branch"></i>

          <div>
            <strong>
              ${
                language === "en"
                  ? "New Evolution"
                  : "Nueva evolución"
              }
            </strong>

            <span>
              ${
                language === "en"
                  ? "Starts from an official Pokémon or existing Fakemon and studies comparable Poke5e Evolutions."
                  : "Parte de un Pokémon oficial o Fakemon existente y estudia Evolutions Poke5e comparables."
              }
            </span>
          </div>

        </article>

      </div>

    </div>
  `;
}


function renderEvolutionSetup({
  species,
  values,
  language
}) {

  const sourceId =
    String(
      values?.sourceSpeciesId ??
      ""
    );


  const narrativeOrigin =
    String(
      values?.narrativeOrigin ??
      "rocket-experiment"
    );


  const mutationDegree =
    String(
      values?.mutationDegree ??
      "moderate"
    );


  return `
    <div class="fakemon-wizard fakemon-wizard--evolution-setup">

      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-flask-vial"></i>

        <div>

          <strong>
            ${
              language === "en"
                ? "Evolution source"
                : "Origen de la evolución"
            }
          </strong>

          <span>
            ${
              language === "en"
                ? "The source anchors the Delta Profiler. Narrative origin is metadata; mutation degree controls how strongly the source constrains the new form."
                : "El origen ancla el Delta Profiler. El origen narrativo es metadata; el grado de mutación controla cuánto restringe la especie original a la nueva forma."
            }
          </span>

        </div>

      </div>


      <label class="fakemon-wizard__field fakemon-wizard__field--wide">

        <span>
          ${
            language === "en"
              ? "Source Pokémon"
              : "Pokémon de origen"
          }
        </span>

        <input
          type="text"
          name="sourceSpeciesId"
          list="fakemon-wizard-evolution-source-list"
          autocomplete="off"
          placeholder="growlithe"
          value="${escapeHtml(
            sourceId
          )}"
        >

        <datalist id="fakemon-wizard-evolution-source-list">

          ${
            species
              .map(
                entry => `
                  <option value="${escapeHtml(
                    entry.id
                  )}">
                    ${escapeHtml(
                      wizardSpeciesName(
                        entry,
                        language
                      )
                    )}
                    ·
                    ${escapeHtml(
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
                        )
                    )}
                    · SR ${escapeHtml(
                      entry.sr
                    )}
                  </option>
                `
              )
              .join(
                ""
              )
          }

        </datalist>

        <small>
          ${
            language === "en"
              ? `${species.length} valid source species available.`
              : `${species.length} especies de origen válidas disponibles.`
          }
        </small>

      </label>


      <div class="fakemon-wizard__evolution-setup-grid">

        <label class="fakemon-wizard__field">

          <span>
            ${
              language === "en"
                ? "Narrative origin"
                : "Origen narrativo"
            }
          </span>

          <select name="narrativeOrigin">
            ${renderEvolutionOriginOptions(
              narrativeOrigin,
              language
            )}
          </select>

          <small>
            ${
              language === "en"
                ? "Does not change Poke5e rules by itself."
                : "Por sí solo no modifica ninguna regla Poke5e."
            }
          </small>

        </label>


        <label class="fakemon-wizard__field">

          <span>
            ${
              language === "en"
                ? "Mutation degree"
                : "Grado de mutación"
            }
          </span>

          <select name="mutationDegree">
            ${renderMutationDegreeOptions(
              mutationDegree,
              language
            )}
          </select>

          <small>
            ${
              language === "en"
                ? "Controls the blend between observed evolution deltas and the requested target profile."
                : "Controla la mezcla entre los deltas evolutivos observados y el perfil objetivo solicitado."
            }
          </small>

        </label>

      </div>

    </div>
  `;
}


function renderEvolutionOriginOptions(
  selected,
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


  return FAKEMON_EVOLUTION_ORIGIN_IDS
    .map(
      id => `
        <option
          value="${escapeHtml(
            id
          )}"
          ${id === selected ? "selected" : ""}
        >
          ${escapeHtml(
            labels[
              id
            ]?.[
              language === "en"
                ? 1
                : 0
            ] ??
            id
          )}
        </option>
      `
    )
    .join(
      ""
    );
}


function renderMutationDegreeOptions(
  selected,
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


  return FAKEMON_MUTATION_DEGREE_IDS
    .map(
      id => `
        <option
          value="${escapeHtml(
            id
          )}"
          ${id === selected ? "selected" : ""}
        >
          ${escapeHtml(
            labels[
              id
            ]?.[
              language === "en"
                ? 1
                : 0
            ] ??
            id
          )}
        </option>
      `
    )
    .join(
      ""
    );
}


function wizardSpeciesName(
  species,
  language
) {

  const name =
    species?.name;


  if (
    name &&
    typeof name ===
      "object" &&
    !Array.isArray(
      name
    )
  ) {

    return String(
      name[
        language
      ] ??
      name.es ??
      name.en ??
      species?.id ??
      ""
    );
  }


  return String(
    name ??
    species?.id ??
    ""
  );
}

async function promptRecommendationStep({
  concept,
  recommendation,
  language
}) {

  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        wizardTitle(
          language,
          4,
          6
        )
    },

    position: {
      width:
        760
    },

    content:
      renderRecommendationStep({
        concept,
        recommendation,
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
          () => ({
            action:
              "back"
          })
      },

      {
        action:
          "next",

        label:
          language === "en"
            ? "Continue to Moves & Abilities"
            : "Continuar a Moves & Abilities",

        default:
          true,

        callback:
          () => ({
            action:
              "next"
          })
      }
    ],

    rejectClose:
      false,

    modal:
      true
  });
}

async function promptConceptStep(
  language,
  initialValue = null,
  {
    allowBack = false
  } = {}
) {

  const buttons =
    [];


  if (allowBack) {

    buttons.push({
      action:
        "back",

      label:
        language === "en"
          ? "Back to Evolution setup"
          : "Volver a configuración de Evolution",

      callback:
        (...callbackArgs) => ({
          action:
            "back",

          value:
            readConceptForm(
              callbackArgs[1]
                .form
            )
        })
    });
  }


  buttons.push({
    action:
      "next",

    label:
      language === "en"
        ? "Next"
        : "Siguiente",

    default:
      true,

    callback:
      (...callbackArgs) => ({
        action:
          "next",

        value:
          readConceptForm(
            callbackArgs[1]
              .form
          )
      })
  });


  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        wizardTitle(
          language,
          1,
          6
        )
    },

    position: {
      width:
        680
    },

    content:
      renderConceptStep(
        language,
        initialValue
      ),

    buttons,

    rejectClose:
      false,

    modal:
      true
  });
}


function readConceptForm(
  form
) {

  const primaryType =
    String(
      form?.elements
        ?.primaryType
        ?.value ??
      ""
    ).trim();


  const secondaryType =
    String(
      form?.elements
        ?.secondaryType
        ?.value ??
      ""
    ).trim();


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


  return {
    name:
      String(
        form?.elements
          ?.name
          ?.value ??
        ""
      ).trim(),

    stage:
      String(
        form?.elements
          ?.stage
          ?.value ??
        "any"
      ).trim(),

    types
  };
}

async function promptRoleStep(
  language,
  initialValue = null
) {

  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        wizardTitle(
          language,
          2,
          6
        )
    },

    position: {
      width:
        760
    },

    content:
      renderRoleStep(
        language,
        initialValue
      ),

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

            value:
              readRoleForm(
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
            ? "Next"
            : "Siguiente",

        default:
          true,

        callback:
          (...callbackArgs) => ({
            action:
              "next",

            value:
              readRoleForm(
                callbackArgs[1]
                  .form
              )
          })
      }
    ],

    rejectClose:
      false,

    modal:
      true
  });
}

async function promptPriorityStep(
  language,
  initialValue = null
) {

  return DialogV2.wait({
    classes: [
      "poke5e-fakemon-wizard-dialog"
    ],

    window: {
      title:
        wizardTitle(
          language,
          3,
          6
        )
    },

    position: {
      width:
        700
    },

    content:
      renderPriorityStep(
        language,
        initialValue
      ),

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

            value:
              readPriorityForm(
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
            ? "Generate recommendation"
            : "Generar recomendación",

        default:
          true,

        callback:
          (...callbackArgs) => ({
            action:
              "next",

            value:
              readPriorityForm(
                callbackArgs[1]
                  .form
              )
          })
      }
    ],

    rejectClose:
      false,

    modal:
      true
  });
}

function readRoleForm(
  form
) {

  return {
    primaryArchetype:
      String(
        form?.elements
          ?.primaryArchetype
          ?.value ??
        ""
      ).trim(),

    secondaryArchetype:
      String(
        form?.elements
          ?.secondaryArchetype
          ?.value ??
        ""
      ).trim()
  };
}


function readPriorityForm(
  form
) {

  return {
    offenseMode:
      String(
        form?.elements
          ?.offenseMode
          ?.value ??
        ""
      ).trim(),

    dimensions: {
      durability:
        form?.elements
          ?.durability
          ?.value ??
        "",

      offense:
        form?.elements
          ?.offense
          ?.value ??
        "",

      speed:
        form?.elements
          ?.speed
          ?.value ??
        "",

      control:
        form?.elements
          ?.control
          ?.value ??
        ""
    }
  };
}

function renderConceptStep(
  language,
  values = null
) {

  const selectedTypes =
    Array.isArray(
      values?.types
    )
      ? values.types
      : [];


  const primaryType =
    selectedTypes[0] ??
    "normal";


  const secondaryType =
    selectedTypes[1] ??
    "";


  const stage =
    String(
      values?.stage ??
      "final"
    );


  const name =
    String(
      values?.name ??
      ""
    );


  return `
    <div class="fakemon-wizard">

      ${renderProgress(
        1,
        6,
        language
      )}


      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-lightbulb"></i>

        <div>
          <strong>
            ${language === "en" ? "Concept" : "Concepto"}
          </strong>

          <span>
            ${
              language === "en"
                ? "Define the basic identity used to select comparable Poke5e species."
                : "Define la identidad básica que usaremos para buscar especies Poke5e comparables."
            }
          </span>
        </div>

      </div>


      <div class="fakemon-wizard__form-grid">

        <label class="fakemon-wizard__field fakemon-wizard__field--wide">
          <span>
            ${language === "en" ? "Provisional name" : "Nombre provisional"}
          </span>

          <input
            type="text"
            name="name"
            placeholder="Drakeon"
            autocomplete="off"
            value="${escapeHtml(
              name
            )}"
          >

          <small>
            ${
              language === "en"
                ? "Optional. You can rename the draft later."
                : "Opcional. Podrás cambiarlo después en el borrador."
            }
          </small>
        </label>


        <label class="fakemon-wizard__field">
          <span>
            ${language === "en" ? "Primary type" : "Tipo primario"}
          </span>

          <select name="primaryType">
            ${renderTypeOptions(
              primaryType,
              language,
              false
            )}
          </select>
        </label>


        <label class="fakemon-wizard__field">
          <span>
            ${language === "en" ? "Secondary type" : "Tipo secundario"}
          </span>

          <select name="secondaryType">
            ${renderTypeOptions(
              secondaryType,
              language,
              true
            )}
          </select>
        </label>


        <label class="fakemon-wizard__field fakemon-wizard__field--wide">
          <span>
            ${language === "en" ? "Evolution stage" : "Etapa evolutiva"}
          </span>

          <select name="stage">
            ${renderStageOptions(
              language,
              stage
            )}
          </select>

          <small>
            ${
              language === "en"
                ? "The profiler prefers Poke5e species from the same evolutionary stage when enough examples exist."
                : "El profiler prioriza especies Poke5e de la misma etapa cuando existe una muestra suficiente."
            }
          </small>
        </label>

      </div>

    </div>
  `;
}


function renderRoleStep(
  language,
  values = null
) {

  const archetypes =
    listFakemonArchetypes();


  const primaryArchetype =
    String(
      values?.primaryArchetype ??
      archetypes[0]?.id ??
      ""
    );


  const secondaryArchetype =
    String(
      values?.secondaryArchetype ??
      ""
    );


  return `
    <div class="fakemon-wizard">

      ${renderProgress(
        2,
        6,
        language
      )}


      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-chess-knight"></i>

        <div>
          <strong>
            ${language === "en" ? "Combat role" : "Rol de combate"}
          </strong>

          <span>
            ${
              language === "en"
                ? "These are Wizard design profiles, not canonical Poke5e categories."
                : "Son perfiles de diseño del Wizard, no categorías canónicas de Poke5e."
            }
          </span>
        </div>

      </div>


      <div class="fakemon-wizard__archetype-grid">

        ${
          archetypes
            .map(
              archetype => `
                <label class="fakemon-wizard__archetype-choice">

                  <input
                    type="radio"
                    name="primaryArchetype"
                    value="${escapeHtml(
                      archetype.id
                    )}"
                    ${archetype.id === primaryArchetype ? "checked" : ""}
                  >

                  <span>
                    <strong>
                      ${escapeHtml(
                        archetype.labels?.[language] ??
                        archetype.labels?.en ??
                        archetype.id
                      )}
                    </strong>

                    <small>
                      ${escapeHtml(
                        archetype.descriptions?.[language] ??
                        archetype.descriptions?.es ??
                        ""
                      )}
                    </small>
                  </span>

                </label>
              `
            )
            .join("")
        }

      </div>


      <label class="fakemon-wizard__field fakemon-wizard__secondary-role">

        <span>
          ${language === "en" ? "Secondary role" : "Rol secundario"}
        </span>

        <select name="secondaryArchetype">

          <option
            value=""
            ${secondaryArchetype ? "" : "selected"}
          >
            ${language === "en" ? "— None —" : "— Ninguno —"}
          </option>

          ${
            archetypes
              .map(
                archetype => `
                  <option
                    value="${escapeHtml(
                      archetype.id
                    )}"
                    ${archetype.id === secondaryArchetype ? "selected" : ""}
                  >
                    ${escapeHtml(
                      archetype.labels?.[language] ??
                      archetype.labels?.en ??
                      archetype.id
                    )}
                  </option>
                `
              )
              .join("")
          }

        </select>

        <small>
          ${
            language === "en"
              ? "Secondary role influences the profile with less weight than the primary role."
              : "El rol secundario influye con menor peso que el rol principal."
          }
        </small>

      </label>

    </div>
  `;
}


function renderPriorityStep(
  language,
  values = null
) {

  const dimensions =
    values?.dimensions ??
    {};


  const offenseMode =
    String(
      values?.offenseMode ??
      ""
    );


  return `
    <div class="fakemon-wizard">

      ${renderProgress(
        3,
        6,
        language
      )}


      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-sliders"></i>

        <div>
          <strong>
            ${language === "en" ? "Profile priorities" : "Prioridades del perfil"}
          </strong>

          <span>
            ${
              language === "en"
                ? "Leave Automatic to use the role profile, or override only what matters to this species."
                : "Deja Automático para usar el perfil del rol o modifica solo lo que sea importante para esta especie."
            }
          </span>
        </div>

      </div>


      <div class="fakemon-wizard__priority-grid">

        ${renderPriorityField(
          "durability",
          language === "en" ? "Durability" : "Durabilidad",
          "fa-solid fa-shield-heart",
          language,
          dimensions.durability
        )}

        ${renderPriorityField(
          "offense",
          language === "en" ? "Offense" : "Ofensiva",
          "fa-solid fa-burst",
          language,
          dimensions.offense
        )}

        ${renderPriorityField(
          "speed",
          language === "en" ? "Speed" : "Velocidad",
          "fa-solid fa-gauge-high",
          language,
          dimensions.speed
        )}

        ${renderPriorityField(
          "control",
          language === "en" ? "Control / Utility" : "Control / Utilidad",
          "fa-solid fa-wand-magic-sparkles",
          language,
          dimensions.control
        )}

      </div>


      <label class="fakemon-wizard__field fakemon-wizard__offense-mode">

        <span>
          ${language === "en" ? "Offensive orientation" : "Orientación ofensiva"}
        </span>

        <select name="offenseMode">

          <option
            value=""
            ${offenseMode ? "" : "selected"}
          >
            ${language === "en" ? "Automatic by primary role" : "Automática según rol principal"}
          </option>

          <option
            value="physical"
            ${offenseMode === "physical" ? "selected" : ""}
          >
            ${language === "en" ? "Physical — STR / DEX" : "Física — STR / DEX"}
          </option>

          <option
            value="special"
            ${offenseMode === "special" ? "selected" : ""}
          >
            ${language === "en" ? "Special — INT / WIS / CHA" : "Especial — INT / WIS / CHA"}
          </option>

          <option
            value="mixed"
            ${offenseMode === "mixed" ? "selected" : ""}
          >
            ${language === "en" ? "Mixed" : "Mixta"}
          </option>

        </select>

        <small>
          ${
            language === "en"
              ? "The next step uses the real powerAbilities of Poke5e Moves to score recommendations."
              : "El siguiente paso utiliza los powerAbilities reales de los Moves Poke5e para puntuar recomendaciones."
          }
        </small>

      </label>

    </div>
  `;
}


function renderRecommendationStep({
  concept,
  recommendation,
  language
}) {

  const result =
    recommendation.recommendation;

  const attributes =
    result.combat.attributes;

  const comparables =
    recommendation.comparables.slice(
      0,
      6
    );


  return `
    <div class="fakemon-wizard fakemon-wizard--result">

      ${renderProgress(
        4,
        6,
        language
      )}


      <div class="fakemon-wizard__result-header">

        <div>
          <small>
            ${language === "en" ? "Poke5e recommendation" : "Recomendación Poke5e"}
          </small>

          <h3>
            ${escapeHtml(
              concept.name ||
              (
                language === "en"
                  ? "New Fakemon"
                  : "Nuevo Fakemon"
              )
            )}
          </h3>

          <span>
            ${escapeHtml(
              recommendation.intent.types
                .map(
                  type =>
                    pokemonTypeLabel(
                      type,
                      language
                    )
                )
                .join(" / ")
            )}
          </span>
        </div>


        <span
          class="fakemon-wizard__confidence"
          data-level="${escapeHtml(
            recommendation.confidence.level
          )}"
        >
          ${escapeHtml(
            confidenceLabel(
              recommendation.confidence.level,
              language
            )
          )}
        </span>

      </div>


      <div class="fakemon-wizard__headline-metrics">

        ${renderMetric(
          "SR",
          result.sr,
          "fa-solid fa-star"
        )}

        ${renderMetric(
          language === "en"
            ? "Minimum Level"
            : "Nivel mínimo",
          result.minimumLevel,
          "fa-solid fa-arrow-up-1-9"
        )}

        ${renderMetric(
          "HP",
          result.combat.hp,
          "fa-solid fa-heart"
        )}

        ${renderMetric(
          "AC",
          result.combat.ac,
          "fa-solid fa-shield-halved"
        )}

        ${renderMetric(
          language === "en"
            ? "Mobility"
            : "Movilidad",
          result.combat.speed,
          "fa-solid fa-person-running"
        )}


        <div class="fakemon-wizard__metric">
          <i class="fa-solid fa-dice-d20"></i>
          <small>Hit Die</small>

          <strong>
            ${escapeHtml(
              result.combat.hitDie
            )}
          </strong>

          <span>—</span>
        </div>

      </div>


      <div class="fakemon-wizard__attribute-grid">

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
              abilityId =>
                renderAttributeMetric(
                  abilityId,
                  attributes[
                    abilityId
                  ]
                )
            )
            .join("")
        }

      </div>


      <section class="fakemon-wizard__comparables">

        <header>
          <div>
            <i class="fa-solid fa-scale-balanced"></i>

            <strong>
              ${
                language === "en"
                  ? "Closest Poke5e references"
                  : "Referencias Poke5e más cercanas"
              }
            </strong>
          </div>

          <small>
            ${recommendation.population.comparedSpecies}
            ${
              language === "en"
                ? "species analyzed"
                : "especies analizadas"
            }
          </small>
        </header>


        <div class="fakemon-wizard__comparable-list">

          ${
            comparables
              .map(
                comparable => `
                  <div class="fakemon-wizard__comparable">

                    <div>
                      <strong>
                        ${escapeHtml(
                          comparable.name
                        )}
                      </strong>

                      <small>
                        ${escapeHtml(
                          comparable.types
                            .map(
                              type =>
                                pokemonTypeLabel(
                                  type,
                                  language
                                )
                            )
                            .join(" / ")
                        )}
                        · SR ${escapeHtml(
                          comparable.sr
                        )}
                        · Nv. ${escapeHtml(
                          comparable.minimumLevel
                        )}
                      </small>
                    </div>

                    <span>
                      ${Math.round(
                        comparable.similarity *
                        100
                      )}%
                    </span>

                  </div>
                `
              )
              .join("")
          }

        </div>

      </section>

      ${renderEvolutionBalanceProfile(
        recommendation.evolutionProfile,
        language
      )}

      <div class="fakemon-wizard__method-note">

        <i class="fa-solid fa-circle-info"></i>

        <span>
          ${
            language === "en"
              ? "SR and minimum level come from comparable normalized Poke5e species. They are not D&D Challenge Rating calculations. Continue to review the suggested Abilities and Moves."
              : "SR y nivel mínimo provienen de especies Poke5e normalizadas comparables. No son cálculos de Challenge Rating de D&D. Continúa para revisar las Abilities y Moves sugeridos."
          }
        </span>

      </div>

    </div>
  `;
}

function renderEvolutionBalanceProfile(
  profile,
  language
) {

  if (!profile) {
    return "";
  }


  const source =
    profile.source ??
    {};


  const metrics = [
    [
      "SR",
      profile.metrics?.sr
    ],

    [
      language === "en"
        ? "Minimum Level"
        : "Nivel mínimo",

      profile.metrics
        ?.minimumLevel
    ],

    [
      "HP",
      profile.metrics?.hp
    ],

    [
      "AC",
      profile.metrics?.ac
    ],

    [
      language === "en"
        ? "Mobility"
        : "Movilidad",

      profile.metrics?.speed
    ],

    ...Object.entries(
      profile.metrics
        ?.attributes ??
      {}
    ).map(
      ([
        id,
        metric
      ]) => [
        id.toUpperCase(),
        metric
      ]
    )
  ];


  return `
    <section class="fakemon-wizard__evolution-profile">

      <header>

        <div>
          <i class="fa-solid fa-code-branch"></i>
          <strong>Evolution Delta Profile</strong>
        </div>

        <small>
          ${profile.comparableCount}
          ${
            language === "en"
              ? "comparable Evolutions"
              : "Evolutions comparables"
          }
        </small>

      </header>


      <div class="fakemon-wizard__evolution-profile-summary">

        <span>
          <small>
            ${language === "en" ? "Source" : "Origen"}
          </small>

          <strong>
            ${escapeHtml(
              source.name ??
              source.id ??
              "—"
            )}
          </strong>

          <em>
            SR ${escapeHtml(
              source.sr ??
              "—"
            )}
            ·
            Nv. ${escapeHtml(
              source.minimumLevel ??
              "—"
            )}
          </em>
        </span>


        <span>
          <small>
            ${language === "en" ? "Mutation" : "Mutación"}
          </small>

          <strong>
            ${escapeHtml(
              mutationDegreeLabel(
                profile.mutationDegree,
                language
              )
            )}
          </strong>

          <em>
            ${Math.round(
              Number(
                profile.deltaWeight ??
                0
              ) *
              100
            )}%
            delta
          </em>
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
              evolutionOriginLabel(
                profile.narrativeOrigin,
                language
              )
            )}
          </strong>
        </span>

      </div>


      <div class="fakemon-wizard__evolution-delta-table">

        <div
          class="
            fakemon-wizard__evolution-delta-row
            fakemon-wizard__evolution-delta-row--head
          "
        >
          <span>
            ${language === "en" ? "Metric" : "Métrica"}
          </span>

          <span>
            ${language === "en" ? "Source" : "Origen"}
          </span>

          <span>
            Δ Poke5e
          </span>

          <span>
            Final
          </span>
        </div>


        ${
          metrics
            .map(
              ([
                label,
                metric
              ]) =>
                renderEvolutionDeltaRow(
                  label,
                  metric
                )
            )
            .join(
              ""
            )
        }

      </div>


      ${renderEvolutionPairReferences(
        profile.comparables,
        language
      )}


      ${
        profile.fallback
          ? `
              <div class="fakemon-wizard__method-note">

                <i class="fa-solid fa-triangle-exclamation"></i>

                <span>
                  ${
                    language === "en"
                      ? "No usable official Evolution pairs were found. The recommendation falls back to the normal target-profile balance engine."
                      : "No se encontraron pares oficiales de Evolution utilizables. La recomendación usa como fallback el motor normal de balance por perfil objetivo."
                  }
                </span>

              </div>
            `
          : ""
      }

    </section>
  `;
}


function renderEvolutionPairReferences(
  comparables,
  language
) {

  const entries =
    Array.isArray(
      comparables
    )
      ? comparables.slice(
          0,
          6
        )
      : [];


  if (!entries.length) {
    return "";
  }


  return `
    <div class="fakemon-wizard__evolution-pairs">

      <small>
        ${
          language === "en"
            ? "Observed Evolution references"
            : "Referencias de Evolution observadas"
        }
      </small>

      <div class="fakemon-wizard__evolution-pair-list">

        ${
          entries
            .map(
              entry => `
                <span>

                  <strong>
                    ${escapeHtml(
                      entry.from?.name ??
                      entry.from?.id ??
                      "?"
                    )}
                    →
                    ${escapeHtml(
                      entry.to?.name ??
                      entry.to?.id ??
                      "?"
                    )}
                  </strong>

                  <em>
                    ${Math.round(
                      Number(
                        entry.similarity ??
                        0
                      ) *
                      100
                    )}%
                  </em>

                </span>
              `
            )
            .join(
              ""
            )
        }

      </div>

    </div>
  `;
}


function renderEvolutionDeltaRow(
  label,
  metric
) {

  if (!metric) {
    return "";
  }


  return `
    <div class="fakemon-wizard__evolution-delta-row">

      <strong>
        ${escapeHtml(
          label
        )}
      </strong>

      <span>
        ${escapeHtml(
          metric.source ??
          "—"
        )}
      </span>

      <span>
        ${escapeHtml(
          formatSignedDelta(
            metric.observedDelta
              ?.value
          )
        )}
      </span>

      <span>
        ${escapeHtml(
          metric.final?.value ??
          "—"
        )}
      </span>

    </div>
  `;
}


function formatSignedDelta(
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
    return "—";
  }


  return numeric >
    0
    ? `+${numeric}`
    : String(
        numeric
      );
}


function mutationDegreeLabel(
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


function evolutionOriginLabel(
  value,
  language
) {

  const labels = {
    natural: [
      "Natural / estándar",
      "Natural / standard"
    ],

    bond: [
      "Vínculo",
      "Bond"
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

function renderProgress(
  current,
  total,
  language
) {

  return `
    <div class="fakemon-wizard__progress">

      <span>
        ${
          language === "en"
            ? `Step ${current} of ${total}`
            : `Paso ${current} de ${total}`
        }
      </span>

      <div>
        ${
          Array.from(
            {
              length:
                total
            },
            (_, index) => `
              <i
                class="${index < current ? "is-active" : ""}"
                aria-hidden="true"
              ></i>
            `
          ).join("")
        }
      </div>

    </div>
  `;
}


function renderPriorityField(
  name,
  label,
  icon,
  language,
  selectedValue = ""
) {
  return `
    <label class="fakemon-wizard__priority-card">

      <i class="${icon}"></i>

      <span>
        ${escapeHtml(
          label
        )}
      </span>

      <select name="${escapeHtml(
        name
      )}">

        <option
          value=""
          ${String(selectedValue) ? "" : "selected"}
        >
          ${language === "en" ? "Automatic" : "Automático"}
        </option>

        <option
          value="0.25"
          ${String(selectedValue) === "0.25" ? "selected" : ""}
        >
          ${language === "en" ? "Low" : "Baja"}
        </option>

        <option
          value="0.5"
          ${String(selectedValue) === "0.5" ? "selected" : ""}
        >
          ${language === "en" ? "Medium" : "Media"}
        </option>

        <option
          value="0.75"
          ${String(selectedValue) === "0.75" ? "selected" : ""}
        >
          ${language === "en" ? "High" : "Alta"}
        </option>

        <option
          value="0.9"
          ${String(selectedValue) === "0.9" ? "selected" : ""}
        >
          ${language === "en" ? "Very high" : "Muy alta"}
        </option>

      </select>

    </label>
  `;
}


function renderMetric(
  label,
  recommendation,
  icon
) {

  return `
    <div class="fakemon-wizard__metric">

      <i class="${icon}"></i>

      <small>
        ${escapeHtml(
          label
        )}
      </small>

      <strong>
        ${escapeHtml(
          recommendation.value
        )}
      </strong>

      <span>
        ${escapeHtml(
          recommendation.min
        )}
        –
        ${escapeHtml(
          recommendation.max
        )}
      </span>

    </div>
  `;
}


function renderAttributeMetric(
  abilityId,
  recommendation
) {

  return `
    <div class="fakemon-wizard__attribute">

      <strong>
        ${escapeHtml(
          abilityId.toUpperCase()
        )}
      </strong>

      <span>
        ${escapeHtml(
          recommendation.value
        )}
      </span>

      <small>
        ${escapeHtml(
          recommendation.min
        )}
        –
        ${escapeHtml(
          recommendation.max
        )}
      </small>

    </div>
  `;
}


function renderTypeOptions(
  selected,
  language,
  allowEmpty
) {

  const empty =
    allowEmpty
      ? `
          <option value="">
            ${language === "en" ? "— None —" : "— Ninguno —"}
          </option>
        `
      : "";


  return (
    empty +
    POKEMON_TYPE_IDS
      .map(
        type => `
          <option
            value="${escapeHtml(
              type
            )}"
            ${type === selected ? "selected" : ""}
          >
            ${escapeHtml(
              pokemonTypeLabel(
                type,
                language
              )
            )}
          </option>
        `
      )
      .join("")
  );
}


function renderStageOptions(
  language,
  selectedValue = "final"
) {

  const options = [
    [
      "base",
      language === "en"
        ? "Base stage"
        : "Etapa base"
    ],
    [
      "intermediate",
      language === "en"
        ? "Intermediate evolution"
        : "Evolución intermedia"
    ],
    [
      "final",
      language === "en"
        ? "Final evolution"
        : "Evolución final"
    ],
    [
      "standalone",
      language === "en"
        ? "Standalone species"
        : "Especie sin evolución"
    ],
    [
      "any",
      language === "en"
        ? "Do not filter by stage"
        : "No filtrar por etapa"
    ]
  ];


  return options
    .map(
      ([
        value,
        label
      ]) => `
        <option
          value="${escapeHtml(
            value
          )}"
          ${value === selectedValue ? "selected" : ""}
        >
          ${escapeHtml(
            label
          )}
        </option>
      `
    )
    .join("");
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


function confidenceLabel(
  level,
  language
) {

  const labels = {
    high: {
      es:
        "Confianza alta",

      en:
        "High confidence"
    },

    medium: {
      es:
        "Confianza media",

      en:
        "Medium confidence"
    },

    low: {
      es:
        "Confianza baja",

      en:
        "Low confidence"
    }
  };


  return (
    labels[
      level
    ]?.[language] ??
    labels[
      level
    ]?.en ??
    level
  );
}


function wizardTitle(
  language,
  step,
  total
) {

  return (
    language === "en"
      ? `Fakemon Wizard · Step ${step}/${total}`
      : `Fakemon Wizard · Paso ${step}/${total}`
  );
}