import { escapeHtml } from "./html.mjs";
import {
  RANDOM_BIOME_ROUTE,
  RANDOM_REGION_ALL
} from "./encounter-random-catalog.mjs";
import {
  DIFFICULTIES,
  TRAINER_RANKS
} from "./encounter-difficulty.mjs";
import {
  getTrainerArchetype,
  getTrainerArchetypeDescription,
  getTrainerArchetypeGroupLabel,
  getTrainerArchetypeLabel
} from "./encounter-trainer-archetypes.mjs";
import { clampInteger } from "./numbers.mjs";
import {
  SEARCH_LIMIT,
  MIXED_TRAINER_ARCHETYPE_ID,
  canGenerateRandomEncounter,
  canGenerateRandomTrainerEncounter,
  countTrainerRowQuantity,
  getPokemonMinimumLevel,
  getTrainerRerollUiState,
  localized,
  normalizeEncounterCompositionView,
  normalizeSavedEncounterLocation,
  normalizeSearch,
  normalizeTrainerTeamSize,
  resolveTrainerName
} from "./encounter-planner-data.mjs";

export function renderSearchResultsMarkup({
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

export function renderSavedEncounterLocationOptions(
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
          `value="${escapeHtml(location.key)}"` +
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

export function renderSavedEncounterOptions(
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
          `value="${escapeHtml(encounter.key)}"` +
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

export function renderRandomEncounterControls({
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

export function renderRandomSelectOptions(
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
            value="${escapeHtml(value)}"
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
          value="${escapeHtml(normalizedValue)}"
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

// "Ajustar paso a paso": where the encounter stands, the next step up, undo, and every step with where it leads.
export function renderStepPanel({
  current,
  previews = [],
  climb = null,
  canUndo = false
}) {
  if (!current) {
    return `
      <section class="poke5e-encounter-planner__panel poke5e-encounter-planner__steps">
        <header class="poke5e-encounter-planner__panel-header">
          <i class="fa-solid fa-stairs" aria-hidden="true"></i>
          <h3>Ajustar paso a paso</h3>
        </header>
        <p class="poke5e-encounter-planner__steps-empty">
          Genera un Entrenador (con el rango Ruta, la base es Fácil) y sube la dificultad desde aquí sin regenerarlo.
        </p>
      </section>`;
  }

  const buttons =
    previews
      .map(
        ({
          step,
          state,
          tier,
          ratio
        }) => `
          <button
            type="button"
            class="poke5e-encounter-planner__step${step.creep ? " is-creep" : ""}"
            data-action="apply-step"
            data-step="${step.id}"
            data-tier="${tier?.id ?? ""}"
            title="${escapeHtml(step.hint)}"
            ${state ? "" : " disabled"}
          >
            <strong>${escapeHtml(step.label)}</strong>
            <small>${
              state
                ? `→ ${escapeHtml(tier.label)} · +${Math.max(0, Math.round((ratio / current.ratio - 1) * 100))} %`
                : "No aplica"
            }</small>
          </button>`
      )
      .join("");

  return `
    <section class="poke5e-encounter-planner__panel poke5e-encounter-planner__steps">
      <header class="poke5e-encounter-planner__panel-header">
        <i class="fa-solid fa-stairs" aria-hidden="true"></i>
        <h3>Ajustar paso a paso</h3>
        <small>Sobre el encuentro actual, sin regenerarlo</small>
      </header>

      <div class="poke5e-encounter-planner__steps-bar">
        <span class="poke5e-encounter-planner__steps-current" data-tier="${current.tier.id}">
          <small>Ahora</small>
          <strong>${escapeHtml(current.tier.label)}</strong>
        </span>

        <button
          type="button"
          data-action="undo-step"
          title="Deshace el último cambio hecho desde aquí."
          ${canUndo ? "" : " disabled"}
        >
          <i class="fa-solid fa-arrow-down" aria-hidden="true"></i>
          Bajar
        </button>

        <button
          type="button"
          class="is-primary"
          data-action="apply-step"
          data-step="next"
          title="${escapeHtml(
            climb
              ? `Con lo más suave primero: ${climb.steps.map(step => step.label).join(", ")}.`
              : "Ya no quedan cambios que suban la dificultad."
          )}"
          ${climb ? "" : " disabled"}
        >
          <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
          ${climb ? `Subir a ${escapeHtml(climb.tier.label)}` : "Subir"}
          ${climb ? `<small>(${climb.steps.length} cambio${climb.steps.length === 1 ? "" : "s"})</small>` : ""}
        </button>
      </div>

      <div class="poke5e-encounter-planner__steps-grid">
        ${buttons}
      </div>
    </section>`;
}

export function renderTrainerRandomControls({
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
          value="${escapeHtml(value)}"
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
        label="${escapeHtml(
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
                    value="${escapeHtml(
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
            label="${escapeHtml(
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
                    data-search="${escapeHtml(
                      searchText
                    )}"
                  >

                    <input
                      type="checkbox"
                      data-role="trainer-mixed-archetype"
                      value="${escapeHtml(
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

export function renderTrainerControls({
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
                  data-trainer-id="${escapeHtml(
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
                        data-trainer-id="${escapeHtml(
                          trainer.id
                        )}"
                        value="${escapeHtml(
                          trainer.name
                        )}"
                      >
                    </label>


                    <div class="poke5e-encounter-planner__trainer-settings">

                      <label>
                        Arquetipo

                        <select
                          data-role="trainer-archetype"
                          data-trainer-id="${escapeHtml(
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
                          data-trainer-id="${escapeHtml(
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
                          data-trainer-id="${escapeHtml(
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
                        data-trainer-id="${escapeHtml(
                          trainer.id
                        )}"
                        title="${escapeHtml(
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
                    data-trainer-id="${escapeHtml(
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
              value="${escapeHtml(
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
        data-pokemon-id="${escapeHtml(
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

export function buildCompositionSummary({
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

export function renderEncounterComposition({
  rows,
  encounterType,
  trainers,
  compositionView,
  collapsedTrainerIds,
  boosts = {}
}) {

  const view =
    normalizeEncounterCompositionView(
      compositionView
    );


  if (
    encounterType ===
      "trainer"
  ) {
    return renderTrainerBoosts(
      boosts
    ) +
    renderTrainerEncounterComposition({
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

// The rivals' extras that only show on the sheets (applied when they're created), as tags over the composition.
function renderTrainerBoosts(
  boosts
) {
  const tags = [
    boosts.statBonus
      ? `<span><i class="fa-solid fa-dumbbell" aria-hidden="true"></i> Características +${boosts.statBonus}</span>`
      : "",
    boosts.coverage
      ? '<span><i class="fa-solid fa-bullseye" aria-hidden="true"></i> Cobertura súper eficaz</span>'
      : "",
    boosts.items
      ? '<span><i class="fa-solid fa-box-archive" aria-hidden="true"></i> Objetos garantizados</span>'
      : "",
    boosts.bestMoves
      ? `<span><i class="fa-solid fa-hand-fist" aria-hidden="true"></i> ${boosts.tmMoves ? "Mejores Moves con MT" : "Mejores Moves"}</span>`
      : ""
  ].filter(Boolean);

  return tags.length
    ? `
      <div
        class="poke5e-encounter-planner__trainer-boosts"
        title="Las características se aplican al crear las hojas. Los Moves y los objetos ya elegidos se ven en cada Pokémon."
      >
        <small>Mejoras del rival</small>
        ${tags.join("")}
      </div>`
    : "";
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


    trainerRows.push(row);


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
          onField: trainer.onField ?? 1,
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

// "3 entrada(s) · 2 en campo": how many it brings and sends out at once.
function trainerCompositionCount(
  count,
  onField
) {
  return onField
    ? `${count} entrada(s) · ${Math.min(onField, count)} en campo`
    : `${count} entrada(s)`;
}

function renderTrainerCompositionGroup({
  trainerId,
  trainerName,
  rows,
  onField,
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
      data-trainer-group-id="${escapeHtml(
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
              data-trainer-id="${escapeHtml(
                trainerId
              )}"
            >
              ${escapeHtml(trainerName)}
            </strong>

          </div>

        </div>


        <div class="poke5e-encounter-planner__trainer-composition-actions">

          <span class="poke5e-encounter-planner__trainer-composition-count">
            ${trainerCompositionCount(rows.length, unassigned ? null : onField)}
          </span>

          ${
            unassigned
              ? ""
              : `
                <button
                  type="button"
                  class="poke5e-encounter-planner__trainer-collapse"
                  data-action="toggle-trainer-composition"
                  data-trainer-id="${escapeHtml(
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
      data-encounter-row-id="${escapeHtml(
        row.id
      )}"
      data-trainer-id="${escapeHtml(
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
            data-row-id="${escapeHtml(row.id)}"
            data-trainer-id="${escapeHtml(
              row.trainerId ??
              ""
            )}"
            title="${escapeHtml(lockTitle)}"
            aria-label="${escapeHtml(lockTitle)}"
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
            data-row-id="${escapeHtml(row.id)}"
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
            data-row-id="${escapeHtml(row.id)}"
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
            data-row-id="${escapeHtml(row.id)}"
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
            data-row-id="${escapeHtml(row.id)}"
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
            data-row-id="${escapeHtml(row.id)}"
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
                data-type="${escapeHtml(type)}"
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

export function formatNumber(
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

// The planner window's whole body. `view` carries what only the window can compute (party, boosts, panels).
export function renderPlannerContent(
  state,
  context,
  view
) {
    const trainerEncounter =
      state.type === "trainer";

    const { itemPolicy } = view;

    const activeStudioTab =
      state.activeTab;

    const compositionView =
      state.compositionView;

    const searchResultsMarkup =
      renderSearchResultsMarkup({
        search:
          state.search,

        searchResults:
          context.searchResults,

        language:
          context.language
      });

    const savedLocationOptions =
      renderSavedEncounterLocationOptions(
        context.savedEncounterLocations,
        state
          .selectedEncounterLocation
      );

    const existingOptions =
      renderSavedEncounterOptions(
        context.savedEncountersForLocation,
        state
          .selectedEncounterKey
      );

    const editingLabel =
      state.encounterKey

        ? (
            `Editando: ` +
            `${state.location} — ` +
            `${state.name}`
          )

        : "Nuevo encuentro";

    const displayName =
      state.name
        .trim() ||
      "Nuevo encuentro";

    const displayLocation =
      state.location
        .trim() ||
      "Sin ubicación";

    const compositionSummary =
      buildCompositionSummary({
        encounterType:
          state.type,

        rowCount:
          context.rows.length,

        trainerCount:
          state
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
          state.type,

        trainers:
          state
            .trainers,

        compositionView,

        collapsedTrainerIds:
          state
            .collapsedTrainerIds,

        boosts:
          view.boosts
      });

    return `
      <section
        class="poke5e-encounter-planner__content"
        data-encounter-type="${escapeHtml(
          state.type
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
              data-encounter-type="${escapeHtml(
                state.type
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
                      state.selectedEncounterLocation
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
                  state.selectedEncounterKey
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
                  state.selectedEncounterKey
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
              ${view.routeSummary}
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
                      state.type ===
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
                  value="${escapeHtml(
                    state.location
                  )}"
                >

              </label>


              <label>
                Nombre del encuentro

                <input
                  type="text"
                  data-role="encounter-name"
                  placeholder="Ej. Emboscada al atardecer"
                  value="${escapeHtml(
                    state.name
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
                  class="poke5e-encounter-planner__optional-toggle${state.optional ? " is-active" : ""}"
                  data-action="toggle-optional"
                  aria-pressed="${state.optional ? "true" : "false"}"
                  title="Un encuentro opcional no hace falta para avanzar; el resumen de la ruta lo cuenta aparte. En un encuentro guardado, se guarda al momento."
                >
                  <i
                    class="fa-solid ${state.optional ? "fa-route" : "fa-flag-checkered"}"
                    aria-hidden="true"
                  ></i>

                  ${state.optional ? "Opcional" : "Obligatorio"}
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
                state
                  .randomRegion,

              biome:
                state
                  .randomBiome,

              minLevel:
                state
                  .randomMinLevel,

              maxLevel:
                state
                  .randomMaxLevel,

              size:
                state
                  .randomSize,

              srValues:
                context.randomSrValues,

              minSr:
                state
                  .randomMinSr,

              maxSr:
                state
                  .randomMaxSr,

              difficulty:
                state
                  .randomDifficulty,

              party:
                view.party,

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
                state
                  .trainerRandomRegion,

              trainerCount:
                state
                  .trainerRandomCount,

              onField:
                state
                  .trainerRandomOnField,

              pokemonCount:
                state
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
                state
                  .trainerRandomArchetype,

              mixedArchetypeIds:
                context.trainerRandomMixedArchetypes,

              language:
                context.language,
              rank:
                state
                  .trainerRandomRank,
              party:
                view.party,
              boosts:
                view.boosts,
              weakTo:
                state
                  .partyWeakTo ??
                []
            })}

            ${view.stepPanel}

          </section>

          <section
            class="poke5e-encounter-planner__studio-panel"
            data-studio-tab="trainers"
            role="tabpanel"
            ${activeStudioTab === "trainers" ? "" : "hidden"}
          >
            ${renderTrainerControls({
              trainers:
                state.trainers,

              selectedTrainerId:
                state
                  .selectedTrainerId,

              rows:
                state.rows,

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
                    value="${escapeHtml(
                      state.search
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
                    state.search.trim()
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
                          state.rerollMoves
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
                          state.rerollAbilities
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
                          state.rerollItems
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
                          state.allowHiddenAbilities
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
                          value="${state.hiddenAbilityChancePercent}"
                          ${
                            state.allowHiddenAbilities
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
                data-tier="${view.difficulty.tier}"
                title="${view.difficulty.title}"
              >

                <i
                  class="fa-solid fa-skull"
                  aria-hidden="true"
                ></i>

                <span>
                  Dificultad
                </span>

                <strong data-total="difficulty">
                  ${view.difficulty.label}
                </strong>

              </div>


              <div
                class="
                  poke5e-encounter-planner__status-item
                  poke5e-encounter-planner__status-item--progress
                "
                data-role="progress-status"
                title="${escapeHtml(view.progress.title)}"
              >

                <i
                  class="fa-solid fa-arrow-trend-up"
                  aria-hidden="true"
                ></i>

                <span>
                  Avance
                </span>

                <strong data-total="progress">
                  ${view.progress.label}
                </strong>

              </div>

            </div>
            <button
              type="button"
              data-action="publish-reward"
              title="Tras el combate: marca los Pokémon que participaron y publica en el chat la XP de cada uno; cada jugador la recibe."
              ${context.rows.length ? "" : " disabled"}
            >
              <i
                class="fa-solid fa-star"
                aria-hidden="true"
              ></i>
              Publicar recompensa
            </button>

            <button
              type="button"
              data-action="generate"
              ${
                state.busy ||
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
                state.busy
                  ? "Generando…"
                  : "Generar / actualizar encuentro"
              }

            </button>

          </footer>

        </main>

      </section>
    `;
}
