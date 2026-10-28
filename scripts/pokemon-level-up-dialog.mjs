import { escapeHtml } from "./html.mjs";
import {
  getPokemonLevelUpPreview,
  levelUpPokemon
} from "./pokemon-level-up-service.mjs";

import {
  openPokemonEvolutionDialog
} from "./pokemon-evolution-dialog.mjs";

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



function signedNumber(
  value
) {

  const numeric =
    Number(
      value ??
      0
    );


  return numeric >= 0
    ? `+${numeric}`
    : String(
        numeric
      );
}

function pokemonImage(
  pokemon
) {

  return escapeHtml(
    pokemon?.img ||
    "icons/svg/mystery-man.svg"
  );
}

function abilityScoreIncreaseMarkup(
  preview,
  language
) {

  const asi =
    preview
      .abilityScoreIncrease;


  if (
    !asi?.required
  ) {

    return "";
  }


  const isPeakPower =
    asi.kind ===
    "peak-power";


  const title =
    isPeakPower
      ? "Peak Power"
      : language === "en"
        ? "Ability Score Improvement"
        : "Mejora de características";


  const hint =
    isPeakPower
      ? (
          language === "en"
            ? (
                `Peak Power grants another Ability Score Improvement. ` +
                `Allocate exactly ${asi.points} points. ` +
                `Ability scores may now reach ${asi.cap}.`
              )
            : (
                `Peak Power otorga otra Mejora de Características. ` +
                `Distribuye exactamente ${asi.points} puntos. ` +
                `Las características ahora pueden alcanzar ${asi.cap}.`
              )
        )
      : (
          language === "en"
            ? (
                `Allocate exactly ${asi.points} points. ` +
                `Maximum score: ${asi.cap}.`
              )
            : (
                `Distribuye exactamente ${asi.points} puntos. ` +
                `Máximo por característica: ${asi.cap}.`
              )
        );


  const stagesLabel =
    language === "en"
      ? `Evolutionary stages: ${asi.evolutionStages}`
      : `Etapas evolutivas: ${asi.evolutionStages}`;


  const peakPowerLabel =
    isPeakPower
      ? (
          language === "en"
            ? `SR ${asi.sourceSr} · Peak Power maximum: ${asi.cap}`
            : `SR ${asi.sourceSr} · Máximo de Peak Power: ${asi.cap}`
        )
      : "";


  const currentLabel =
    language === "en"
      ? "Current"
      : "Actual";


  const resultLabel =
    language === "en"
      ? "Result"
      : "Resultado";


  const assignedLabel =
    language === "en"
      ? "Assigned"
      : "Asignados";


  const remainingLabel =
    language === "en"
      ? "Remaining"
      : "Restantes";


  const maximumLabel =
    language === "en"
      ? "Maximum"
      : "Máximo";


  const decreaseLabel =
    language === "en"
      ? "Decrease"
      : "Quitar punto";


  const increaseLabel =
    language === "en"
      ? "Increase"
      : "Agregar punto";


  const fields =
    ABILITY_IDS.map(
      abilityId => {

        const current =
          Number(
            asi.currentScores[
              abilityId
            ] ??
            10
          );


        const maximumIncrease =
          Math.max(
            0,
            asi.cap -
            current
          );


        const cappedClass =
          maximumIncrease <= 0
            ? " is-at-cap"
            : "";


        return `
          <article
            class="
              poke5e-pokemon-level-up__asi-field
              ${cappedClass}
            "
            data-asi-field
            data-ability-id="${escapeHtml(abilityId)}"
            data-current-score="${escapeHtml(current)}"
            data-max-increase="${escapeHtml(maximumIncrease)}"
          >

            <header class="poke5e-pokemon-level-up__asi-field-header">

              <strong>
                ${escapeHtml(
                  abilityId.toUpperCase()
                )}
              </strong>

              <small>
                ${escapeHtml(maximumLabel)}
                ${escapeHtml(asi.cap)}
              </small>

            </header>


            <div class="poke5e-pokemon-level-up__asi-score">

              <span>

                <small>
                  ${escapeHtml(currentLabel)}
                </small>

                <strong>
                  ${escapeHtml(current)}
                </strong>

              </span>


              <i
                class="fa-solid fa-arrow-right"
                aria-hidden="true"
              ></i>


              <span class="poke5e-pokemon-level-up__asi-result">

                <small>
                  ${escapeHtml(resultLabel)}
                </small>

                <strong
                  data-asi-result
                  aria-live="polite"
                >
                  ${escapeHtml(current)}
                </strong>

              </span>

            </div>


            <div class="poke5e-pokemon-level-up__asi-controls">

              <button
                type="button"
                data-asi-action="decrease"
                data-ability-id="${escapeHtml(abilityId)}"
                title="${escapeHtml(
                  `${decreaseLabel}: ${abilityId.toUpperCase()}`
                )}"
                aria-label="${escapeHtml(
                  `${decreaseLabel}: ${abilityId.toUpperCase()}`
                )}"
                disabled
              >

                <i
                  class="fa-solid fa-minus"
                  aria-hidden="true"
                ></i>

              </button>


              <output data-asi-increase>
                0
              </output>


              <input
                type="hidden"
                name="asi-${escapeHtml(abilityId)}"
                value="0"
                data-asi-input
              >


              <button
                type="button"
                data-asi-action="increase"
                data-ability-id="${escapeHtml(abilityId)}"
                title="${escapeHtml(
                  `${increaseLabel}: ${abilityId.toUpperCase()}`
                )}"
                aria-label="${escapeHtml(
                  `${increaseLabel}: ${abilityId.toUpperCase()}`
                )}"
                ${maximumIncrease <= 0 ? "disabled" : ""}
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
    )
    .join("");


  return `
    <section
      class="
        poke5e-level-up-dialog__section
        poke5e-pokemon-level-up__asi-section
      "
      data-asi-root
      data-asi-kind="${escapeHtml(
        asi.kind ??
        "standard"
      )}"
      data-asi-points="${escapeHtml(asi.points)}"
      data-asi-cap="${escapeHtml(asi.cap)}"
      data-asi-complete="false"
    >

      <header>

        <i
          class="fa-solid fa-arrow-up-right-dots"
          aria-hidden="true"
        ></i>

        <div>

          <h3>
            ${escapeHtml(title)}
          </h3>

          <p>
            ${escapeHtml(hint)}
          </p>

          <div class="poke5e-pokemon-level-up__asi-context">

            <small>
              ${escapeHtml(stagesLabel)}
            </small>

            ${
              peakPowerLabel
                ? `
                  <small>
                    ${escapeHtml(peakPowerLabel)}
                  </small>
                `
                : ""
            }

          </div>

        </div>

      </header>


      <div class="poke5e-pokemon-level-up__asi-summary">

        <span>

          <small>
            ${escapeHtml(assignedLabel)}
          </small>

          <strong>
            <b data-asi-spent>
              0
            </b>

            /

            ${escapeHtml(asi.points)}
          </strong>

        </span>


        <span>

          <small>
            ${escapeHtml(remainingLabel)}
          </small>

          <strong data-asi-remaining>
            ${escapeHtml(asi.points)}
          </strong>

        </span>


        <span>

          <small>
            ${escapeHtml(maximumLabel)}
          </small>

          <strong>
            ${escapeHtml(asi.cap)}
          </strong>

        </span>

      </div>


      <div class="poke5e-pokemon-level-up__asi-grid">

        ${fields}

      </div>


      <p
        class="poke5e-pokemon-level-up__asi-status"
        data-asi-status
        role="status"
        aria-live="polite"
      ></p>

    </section>
  `;
}

function abilityScoreIncreaseInput(
  form,
  abilityId
) {

  const input =
    form.elements.namedItem(
      `asi-${abilityId}`
    );


  return input instanceof
    HTMLInputElement
      ? input
      : null;
}


function abilityScorePointsSpent(
  form
) {

  return ABILITY_IDS.reduce(
    (
      total,
      abilityId
    ) => {

      const input =
        abilityScoreIncreaseInput(
          form,
          abilityId
        );


      const value =
        Number(
          input?.value ??
          0
        );


      return (
        total +
        (
          Number.isInteger(
            value
          ) &&
          value > 0
            ? value
            : 0
        )
      );
    },
    0
  );
}


function syncAbilityScoreIncreaseUi(
  form,
  root,
  preview,
  language
) {

  const asi =
    preview
      .abilityScoreIncrease;


  const points =
    Number(
      asi.points ??
      0
    );


  const cap =
    Number(
      asi.cap ??
      0
    );


  const spent =
    abilityScorePointsSpent(
      form
    );


  const remaining =
    Math.max(
      0,
      points -
        spent
    );


  const complete =
    spent ===
    points;


  root.dataset.asiComplete =
    complete
      ? "true"
      : "false";


  form.dataset.asiComplete =
    complete
      ? "true"
      : "false";


  const spentElement =
    root.querySelector(
      "[data-asi-spent]"
    );


  const remainingElement =
    root.querySelector(
      "[data-asi-remaining]"
    );


  const statusElement =
    root.querySelector(
      "[data-asi-status]"
    );


  if (spentElement) {

    spentElement.textContent =
      String(
        spent
      );
  }


  if (remainingElement) {

    remainingElement.textContent =
      String(
        remaining
      );
  }


  if (statusElement) {

    statusElement.textContent =
      complete
        ? (
            language === "en"
              ? "Distribution complete. You can level up."
              : "Distribución completa. Puedes subir de nivel."
          )
        : (
            language === "en"
              ? (
                  remaining === 1
                    ? "1 point remaining."
                    : `${remaining} points remaining.`
                )
              : (
                  remaining === 1
                    ? "Queda 1 punto por asignar."
                    : `Quedan ${remaining} puntos por asignar.`
                )
          );
  }


  for (
    const field
    of root.querySelectorAll(
      "[data-asi-field]"
    )
  ) {

    const abilityId =
      String(
        field.dataset
          .abilityId ??
        ""
      );


    const input =
      abilityScoreIncreaseInput(
        form,
        abilityId
      );


    if (!input) {

      continue;
    }


    const currentScore =
      Number(
        field.dataset
          .currentScore ??
        0
      );


    const maximumIncrease =
      Number(
        field.dataset
          .maxIncrease ??
        0
      );


    const rawIncrease =
      Number(
        input.value ??
        0
      );


    const increase =
      Number.isInteger(
        rawIncrease
      )
        ? Math.max(
            0,
            Math.min(
              maximumIncrease,
              rawIncrease
            )
          )
        : 0;


    if (
      String(
        increase
      ) !==
      input.value
    ) {

      input.value =
        String(
          increase
        );
    }


    const result =
      currentScore +
      increase;


    field.classList.toggle(
      "has-increase",
      increase > 0
    );


    field.classList.toggle(
      "is-at-cap",
      Number.isFinite(
        cap
      ) &&
      result >=
        cap
    );


    const resultElement =
      field.querySelector(
        "[data-asi-result]"
      );


    const increaseElement =
      field.querySelector(
        "[data-asi-increase]"
      );


    if (resultElement) {

      resultElement.textContent =
        String(
          result
        );
    }


    if (increaseElement) {

      increaseElement.textContent =
        String(
          increase
        );
    }


    const decreaseButton =
      field.querySelector(
        '[data-asi-action="decrease"]'
      );


    const increaseButton =
      field.querySelector(
        '[data-asi-action="increase"]'
      );


    if (
      decreaseButton instanceof
        HTMLButtonElement
    ) {

      decreaseButton.disabled =
        increase <= 0;
    }


    if (
      increaseButton instanceof
        HTMLButtonElement
    ) {

      increaseButton.disabled =
        increase >=
          maximumIncrease ||
        remaining <= 0;
    }
  }


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


function activateAbilityScoreIncreaseUi(
  dialog,
  preview,
  language
) {

  const asi =
    preview
      .abilityScoreIncrease;


  if (
    !asi?.required
  ) {

    return;
  }


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
      "[data-asi-root]"
    );


  if (
    !root ||
    root.dataset
      .asiReady ===
      "true"
  ) {

    return;
  }


  root.dataset.asiReady =
    "true";


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
          "button[data-asi-action]"
        );


      if (
        !(button instanceof
          HTMLButtonElement) ||
        !root.contains(
          button
        )
      ) {

        return;
      }


      const abilityId =
        String(
          button.dataset
            .abilityId ??
          ""
        );


      if (
        !ABILITY_IDS.includes(
          abilityId
        )
      ) {

        return;
      }


      const input =
        abilityScoreIncreaseInput(
          form,
          abilityId
        );


      const field =
        button.closest(
          "[data-asi-field]"
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


      const maximumIncrease =
        Number(
          field.dataset
            .maxIncrease ??
          0
        );


      const spent =
        abilityScorePointsSpent(
          form
        );


      const points =
        Number(
          asi.points ??
          0
        );


      const action =
        String(
          button.dataset
            .asiAction ??
          ""
        );


      if (
        action ===
        "increase"
      ) {

        if (
          spent >=
            points ||
          value >=
            maximumIncrease
        ) {

          return;
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
          value <= 0
        ) {

          return;
        }


        input.value =
          String(
            value -
            1
          );

      } else {

        return;
      }


      syncAbilityScoreIncreaseUi(
        form,
        root,
        preview,
        language
      );
    }
  );


  form.addEventListener(
    "submit",
    event => {

      const spent =
        abilityScorePointsSpent(
          form
        );


      const points =
        Number(
          asi.points ??
          0
        );


      if (
        spent ===
        points
      ) {

        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      syncAbilityScoreIncreaseUi(
        form,
        root,
        preview,
        language
      );
    },
    true
  );


  syncAbilityScoreIncreaseUi(
    form,
    root,
    preview,
    language
  );
}

function readAbilityScoreIncreases(
  button,
  preview
) {
  if (
    !preview
      .abilityScoreIncrease
      .required
  ) {
    return {};
  }


  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const input =
          button.form
            ?.elements
            ?.namedItem(
              `asi-${abilityId}`
            );


        return [
          abilityId,

          Number(
            input?.value ??
            0
          )
        ];
      }
    )
  );
}

function levelUpLabels(
  language
) {

  if (
    language ===
    "en"
  ) {

    return {
      eyebrow:
        "Pokémon Level Up",

      level:
        "Lv.",

      hpTitle:
        "Hit Points",

      hpHint:
        "HP gain will be rolled when you confirm the level up.",

      hpFormula:
        "HP Gain",

      progressionTitle:
        "Level Progression",

      progressionHint:
        "Level-dependent values are rebuilt automatically.",

      proficiency:
        "Proficiency Bonus",

      proficiencyHint:
        "Updated for the new level",

      statistics:
        "Statistics",

      statisticsHint:
        "Base and derived statistics are rebuilt",

      preservedTitle:
        "Preserved State",

      preservedHint:
        "These parts of the Pokémon are kept intact by Level Up.",

      moves:
        "Current Moves",

      abilities:
        "Ability Items",

      activeAbility:
        "Active Ability",

      trainer:
        "Trainer Owner",

      placement:
        "Party / PC",

      progression:
        "Pokémon Progression"
    };
  }


  return {
    eyebrow:
      "Subir nivel de Pokémon",

    level:
      "Nv.",

    hpTitle:
      "Puntos de Golpe",

    hpHint:
      "La ganancia de HP se tirará al confirmar la subida de nivel.",

    hpFormula:
      "Ganancia de HP",

    progressionTitle:
      "Progresión de nivel",

    progressionHint:
      "Los valores dependientes del nivel se reconstruyen automáticamente.",

    proficiency:
      "Proficiency Bonus",

    proficiencyHint:
      "Se actualiza para el nuevo nivel",

    statistics:
      "Estadísticas",

    statisticsHint:
      "Se reconstruyen las estadísticas base y derivadas",

    preservedTitle:
      "Estado preservado",

    preservedHint:
      "Estas partes del Pokémon se mantienen intactas durante Level Up.",

    moves:
      "Moves actuales",

    abilities:
      "Ability Items",

    activeAbility:
      "Ability activa",

    trainer:
      "Trainer propietario",

    placement:
      "Party / PC",

    progression:
      "Progresión Pokémon"
  };
}

function localizedPokemonName(
  pokemon,
  language,
  fallback
) {

  const value =
    pokemon?.name;


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
    fallback ??
    ""
  );
}


function evolutionPreviewMarkup(
  preview,
  language
) {

  if (
    !preview.evolution
  ) {

    return "";
  }


  const targetName =
    localizedPokemonName(
      preview
        .evolution
        .targetSpecies,

      language,

      preview
        .evolution
        .to
    );


  return `
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
                ? "Evolution"
                : "Evolución"
            }
          </h3>

          <p>
            ${
              language === "en"
                ? `This Level Up will evolve the Pokémon into ${escapeHtml(targetName)}.`
                : `Esta subida de nivel evolucionará al Pokémon a ${escapeHtml(targetName)}.`
            }
          </p>

        </div>

      </header>

      <div class="poke5e-pokemon-level-up__progress-card">

        <i
          class="fa-solid fa-arrow-right"
          aria-hidden="true"
        ></i>

        <div>

          <strong>
            ${escapeHtml(targetName)}
          </strong>

          <small>
            ${escapeHtml(
              `${preview.evolution.evolutionPoints} Evolution Points`
            )}
          </small>

        </div>

      </div>

    </section>
  `;
}

function pokemonLevelUpContent(
  pokemon,
  preview,
  language
) {

  const labels =
    levelUpLabels(
      language
    );


  const hpFormula =
    `1d${preview.hitDieSides} ${signedNumber(preview.conModifier)}`;


  return `
    <div
      class="poke5e-level-up-dialog"
      data-level-up-kind="pokemon"
    >

      <header class="poke5e-level-up-dialog__hero">

        <img
          class="poke5e-pokemon-level-up__portrait"
          src="${pokemonImage(pokemon)}"
          alt="${escapeHtml(pokemon.name)}"
        >


        <div class="poke5e-level-up-dialog__identity">

          <small>
            ${escapeHtml(labels.eyebrow)}
          </small>

          <h2>
            ${escapeHtml(pokemon.name)}
          </h2>

        </div>


        <div class="poke5e-level-up-dialog__levels">

          <span>
            ${escapeHtml(labels.level)}
            ${preview.currentLevel}
          </span>

          <i
            class="fa-solid fa-arrow-right"
            aria-hidden="true"
          ></i>

          <strong>
            ${escapeHtml(labels.level)}
            ${preview.nextLevel}
          </strong>

        </div>

      </header>

      ${evolutionPreviewMarkup(
        preview,
        language
      )}

      <section
        class="
          poke5e-level-up-dialog__section
          poke5e-pokemon-level-up__hp-section
        "
      >

        <header>

          <i
            class="fa-solid fa-heart"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${escapeHtml(labels.hpTitle)}
            </h3>

            <p>
              ${escapeHtml(labels.hpHint)}
            </p>

          </div>

        </header>


        <div class="poke5e-pokemon-level-up__hp-card">

          <span class="poke5e-pokemon-level-up__dice">

            <i
              class="fa-solid fa-dice-d6"
              aria-hidden="true"
            ></i>

          </span>


          <div>

            <small>
              ${escapeHtml(labels.hpFormula)}
            </small>

            <strong>
              ${escapeHtml(hpFormula)}
            </strong>

          </div>

        </div>

      </section>

      ${abilityScoreIncreaseMarkup(
        preview,
        language
      )}


      <section class="poke5e-level-up-dialog__section">

        <header>

          <i
            class="fa-solid fa-chart-line"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${escapeHtml(labels.progressionTitle)}
            </h3>

            <p>
              ${escapeHtml(labels.progressionHint)}
            </p>

          </div>

        </header>


        <div class="poke5e-pokemon-level-up__progress-grid">

          <article class="poke5e-pokemon-level-up__progress-card">

            <span>

              <i
                class="fa-solid fa-arrow-trend-up"
                aria-hidden="true"
              ></i>

            </span>

            <div>

              <strong>
                ${escapeHtml(labels.proficiency)}
              </strong>

              <small>
                ${escapeHtml(labels.proficiencyHint)}
              </small>

            </div>

          </article>


          <article class="poke5e-pokemon-level-up__progress-card">

            <span>

              <i
                class="fa-solid fa-chart-simple"
                aria-hidden="true"
              ></i>

            </span>

            <div>

              <strong>
                ${escapeHtml(labels.statistics)}
              </strong>

              <small>
                ${escapeHtml(labels.statisticsHint)}
              </small>

            </div>

          </article>

        </div>

      </section>


      <section class="poke5e-level-up-dialog__section">

        <header>

          <i
            class="fa-solid fa-lock"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${escapeHtml(labels.preservedTitle)}
            </h3>

            <p>
              ${escapeHtml(labels.preservedHint)}
            </p>

          </div>

        </header>


        <div class="poke5e-pokemon-level-up__preserved-grid">

          <span>
            <i
              class="fa-solid fa-bolt"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.moves)}
          </span>


          <span>
            <i
              class="fa-solid fa-star"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.abilities)}
          </span>


          <span>
            <i
              class="fa-solid fa-circle-check"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.activeAbility)}
          </span>


          <span>
            <i
              class="fa-solid fa-user"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.trainer)}
          </span>


          <span>
            <i
              class="fa-solid fa-box-archive"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.placement)}
          </span>


          <span>
            <i
              class="fa-solid fa-arrow-trend-up"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.progression)}
          </span>

        </div>

      </section>

    </div>
  `;
}


export async function openPokemonLevelUpDialog(
  pokemon
) {

  const language =
    getLanguage();


  /*
   * Preview inicial:
   * solamente valida nivel/XP y determina
   * cuál sería el próximo nivel.
   */

  const initialPreview =
    await getPokemonLevelUpPreview(
      pokemon
    );


  if (
    !initialPreview
      .levelSupported
  ) {

    const maximumLevelReached =
      initialPreview.currentLevel >=
      20;


    ui.notifications.warn(
      maximumLevelReached
        ? (
            language === "en"
              ? `${pokemon.name} has already reached the maximum Pokémon level.`
              : `${pokemon.name} ya alcanzó el nivel máximo Pokémon.`
          )
        : (
            language === "en"
              ? "Pokémon progression is currently implemented up to level 20."
              : "La progresión Pokémon está implementada actualmente hasta nivel 20."
          )
    );


    return null;
  }


  if (
    initialPreview
      .experience
      .atLevelCap
  ) {

    ui.notifications.warn(
      language === "en"
        ? `${pokemon.name} is already at its trainer's level (Lv. ${initialPreview.experience.levelCap}).`
        : `${pokemon.name} ya está al nivel de su Entrenador (Nv. ${initialPreview.experience.levelCap}).`
    );

    return null;
  }


  if (
    !initialPreview
      .experience
      .readyToLevel
  ) {

    ui.notifications.warn(
      language === "en"
        ? `${pokemon.name} needs ${initialPreview.experience.xpRemaining} more XP to reach level ${initialPreview.nextLevel}.`
        : `${pokemon.name} necesita ${initialPreview.experience.xpRemaining} XP más para alcanzar Nv. ${initialPreview.nextLevel}.`
    );


    return null;
  }


  /*
   * ==========================================================
   * EVOLUTION PHASE
   * ========================================================== */

  let evolution;


  try {

    evolution =
      await openPokemonEvolutionDialog(
        pokemon,
        {
          evolutionLevel:
            initialPreview
              .nextLevel
        }
      );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error preparando Pokémon Evolution`,
      error
    );


    ui.notifications.error(
      error?.message ??
      (
        language === "en"
          ? "Pokémon Evolution could not be prepared."
          : "No se pudo preparar la Evolución del Pokémon."
      )
    );


    return null;
  }


  /*
   * Cerrar el diálogo de Evolution cancela
   * toda la operación.
   *
   * Para subir sin evolucionar existe la opción
   * explícita "No evolucionar".
   */

  if (
    evolution == null
  ) {

    return null;
  }


  /*
   * Recalculamos Preview considerando Evolution.
   *
   * Aquí ya usamos:
   * - especie objetivo;
   * - Evolution Points;
   * - Hit Die nuevo;
   * - CON post-Evolution;
   * - scores post-Evolution para el ASI normal.
   */

  let preview;


  try {

    preview =
      await getPokemonLevelUpPreview(
        pokemon,
        {
          evolution
        }
      );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error validando Pokémon Evolution`,
      error
    );


    ui.notifications.error(
      error?.message ??
      (
        language === "en"
          ? "Pokémon Evolution validation failed."
          : "No se pudo validar la Evolución del Pokémon."
      )
    );


    return null;
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
            680
        },

        window: {
          title:
            language === "en"
              ? "Pokémon Level Up"
              : "Subir nivel de Pokémon"
        },

        content:
          pokemonLevelUpContent(
            pokemon,
            preview,
            language
          ),

        rejectClose:
          false,

        render:
          (
            ...args
          ) => {

            const dialog =
              args[1];


            activateAbilityScoreIncreaseUi(
              dialog,
              preview,
              language
            );
          },

        ok: {
          label:
            language === "en"
              ? `Level Up to ${preview.nextLevel}`
              : `Subir a Nv. ${preview.nextLevel}`,

          callback:
            (
              event,
              button
            ) => ({

              abilityScoreIncreases:
                readAbilityScoreIncreases(
                  button,
                  preview
                )
            })
        }
      });


  if (!choices) {

    return null;
  }


  let result;


  try {

    result =
      await levelUpPokemon(
        pokemon,
        {
          ...choices,

          evolution
        }
      );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error durante Pokémon Level Up`,
      error
    );


    ui.notifications.error(
      error?.message ??
      (
        language === "en"
          ? "Pokémon Level Up failed."
          : "No se pudo subir de nivel al Pokémon."
      )
    );


    return null;
  }


  if (
    result.evolution
  ) {

    ui.notifications.info(
      language === "en"
        ? (
            `${result.pokemon.name} evolved and reached level ${result.level}. ` +
            `HP +${result.evolution.hpBonus} from Evolution +${result.hpGain.total} from Level Up.`
          )
        : (
            `${result.pokemon.name} evolucionó y alcanzó Nv. ${result.level}. ` +
            `HP +${result.evolution.hpBonus} por Evolution +${result.hpGain.total} por Level Up.`
          )
    );

  } else {

    ui.notifications.info(
      language === "en"
        ? `${result.pokemon.name} reached level ${result.level}. HP +${result.hpGain.total}.`
        : `${result.pokemon.name} alcanzó Nv. ${result.level}. HP +${result.hpGain.total}.`
    );
  }


  return result;
}