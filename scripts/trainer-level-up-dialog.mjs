import {
  getTrainerLevelUpPreview,
  levelUpTrainer
} from "./trainer-level-up-service.mjs";

import {
  MAX_SUPPORTED_TRAINER_LEVEL,
  TRAINER_ORIGINS,
  TRAINER_PATHS,
  TRAINER_SKILLS,
  TRAINER_SPECIALIZATIONS,
  getTrainerProgressionLimits
} from "./trainer-rules.mjs";

import {
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";


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

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
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
          Math.min(
            2,
            Math.max(
              0,
              asi.cap -
              current
            )
          );


        return `
          <label class="poke5e-pokemon-level-up__asi-field">

            <span>
              ${escapeHtml(
                abilityId.toUpperCase()
              )}
            </span>

            <strong>
              ${escapeHtml(current)}
            </strong>

            <span>
              +
            </span>

            <input
              type="number"
              name="asi-${escapeHtml(abilityId)}"
              min="0"
              max="${escapeHtml(maximumIncrease)}"
              step="1"
              value="0"
            >

          </label>
        `;
      }
    )
    .join("");


  return `
    <section class="poke5e-level-up-dialog__section">

      <header>

        <i
          class="fa-solid fa-arrow-up-right-dots"
          aria-hidden="true"
        ></i>

        <div>

          <h3>
            ${
              language === "en"
                ? "Ability Score Improvement"
                : "Mejora de características"
            }
          </h3>

          <p>
            ${
              language === "en"
                ? `Allocate exactly ${asi.points} points. Maximum score: ${asi.cap}.`
                : `Distribuye exactamente ${asi.points} puntos. Máximo por característica: ${asi.cap}.`
            }
          </p>

        </div>

      </header>


      <div class="poke5e-pokemon-level-up__asi-grid">

        ${fields}

      </div>

    </section>
  `;
}

function pathOptions(
  language
) {

  return Object.values(
    TRAINER_PATHS
  )
    .map(
      path => {

        const blocked =
          Boolean(
            path.requires
          );


        const suffix =
          blocked
            ? language ===
                "en"
              ? ` — Requires ${path.requires}`
              : ` — Requiere ${path.requires}`
            : "";


        return `
          <option
            value="${escapeHtml(path.id)}"
            ${blocked ? " disabled" : ""}
          >
            ${escapeHtml(path.name)}${escapeHtml(suffix)}
          </option>
        `;
      }
    )
    .join("");
}


function specializationOptions(
  primaryId
) {

  return Object.values(
    TRAINER_SPECIALIZATIONS
  )
    .filter(
      specialization =>
        specialization.id !==
        primaryId
    )
    .map(
      specialization => `
        <option value="${escapeHtml(specialization.id)}">
          ${escapeHtml(specialization.name)}
        </option>
      `
    )
    .join("");
}


function hobbyistExistingSkillIds(
  progression
) {

  const origin =
    TRAINER_ORIGINS[
      progression
        ?.origin
        ?.id
    ];


  const existing =
    new Set([
      "ani",

      ...(
        progression
          ?.classSkillIds ??
        []
      ),

      ...(
        origin
          ?.skillProficiencies ??
        []
      )
    ]);


  if (
    origin?.id ===
      "unovan"
  ) {

    for (
      const skillId
      of progression
        ?.origin
        ?.choices
        ?.unovanExtraSkillIds ??
      []
    ) {

      existing.add(
        skillId
      );
    }
  }


  return existing;
}


function skillOptions(
  progression,
  language
) {

  const existing =
    hobbyistExistingSkillIds(
      progression
    );


  return Object.entries(
    TRAINER_SKILLS
  )
    .filter(
      ([skillId]) =>
        !existing.has(
          skillId
        )
    )
    .map(
      ([
        id,
        labels
      ]) => `
        <option value="${escapeHtml(id)}">
          ${escapeHtml(
            labels[
              language
            ] ??
            labels.en ??
            id
          )}
        </option>
      `
    )
    .join("");
}

function higherLevelChoiceMarkup(
  preview,
  progression,
  language
) {

  const sections = [];


  if (
    preview.requiresSpecialization
  ) {

    const options =
      Object.values(
        TRAINER_SPECIALIZATIONS
      )
        .map(
          specialization => `
            <option value="${escapeHtml(specialization.id)}">
              ${escapeHtml(specialization.name)}
            </option>
          `
        )
        .join("");


    sections.push(`
      <section class="poke5e-level-up-dialog__section">

        <header>
          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          <div>
            <h3>
              Specialization
            </h3>

            <p>
              ${
                language === "en"
                  ? `Choose your level ${preview.nextLevel} Specialization. Specializations may be stacked.`
                  : `Elige tu Specialization de nivel ${preview.nextLevel}. Las Specializations pueden acumularse.`
              }
            </p>
          </div>
        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            Specialization
          </span>

          <select name="levelSpecializationId">

            <option value="">
              —
            </option>

            ${options}

          </select>

        </label>

      </section>
    `);
  }


  if (
    preview.pathFeatureChoice ===
    "ace-trainer-ability"
  ) {

    const abilityOptions =
      ABILITY_IDS
        .map(
          abilityId => `
            <option value="${escapeHtml(abilityId)}">
              ${escapeHtml(abilityId.toUpperCase())}
            </option>
          `
        )
        .join("");


    sections.push(`
      <section class="poke5e-level-up-dialog__section">

        <header>
          <i
            class="fa-solid fa-crosshairs"
            aria-hidden="true"
          ></i>

          <div>
            <h3>
              Tactical Mastery
            </h3>

            <p>
              ${
                language === "en"
                  ? "Choose the Ability Score increased by +1 for all of your Pokémon."
                  : "Elige el Ability Score que aumentará en +1 para todos tus Pokémon."
              }
            </p>
          </div>
        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            Ability Score
          </span>

          <select name="pathFeatureAbilityId">

            <option value="">
              —
            </option>

            ${abilityOptions}

          </select>

        </label>

      </section>
    `);
  }


  if (
    preview.pathFeatureChoice ===
    "type-master-resistance"
  ) {

    const specializationTypes =
      [
        ...new Set(
          (
            progression
              ?.specializationIds ??
            []
          )
            .map(
              specializationId =>
                TRAINER_SPECIALIZATIONS[
                  specializationId
                ]?.type
            )
            .filter(Boolean)
        )
      ];


    const typeOptions =
      specializationTypes
        .map(
          type => `
            <option value="${escapeHtml(type)}">
              ${escapeHtml(
                String(type)
                  .charAt(0)
                  .toUpperCase() +
                String(type).slice(1)
              )}
            </option>
          `
        )
        .join("");


    sections.push(`
      <section class="poke5e-level-up-dialog__section">

        <header>
          <i
            class="fa-solid fa-shield-halved"
            aria-hidden="true"
          ></i>

          <div>
            <h3>
              Storing Power
            </h3>

            <p>
              ${
                language === "en"
                  ? "Choose one of your specialized types as the permanent resistance type."
                  : "Elige uno de tus tipos especializados como tipo de resistencia permanente."
              }
            </p>
          </div>
        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            ${
              language === "en"
                ? "Resistance Type"
                : "Tipo de resistencia"
            }
          </span>

          <select name="pathFeatureResistanceType">

            <option value="">
              —
            </option>

            ${typeOptions}

          </select>

        </label>

      </section>
    `);
  }


  if (
    preview.requiresTrainerResolveSave
  ) {

    const existingSaveIds =
      new Set(
        progression
          ?.managedSaveIds ??
        []
      );


    const saveOptions =
      ABILITY_IDS
        .filter(
          abilityId =>
            !existingSaveIds.has(
              abilityId
            )
        )
        .map(
          abilityId => `
            <option value="${escapeHtml(abilityId)}">
              ${escapeHtml(abilityId.toUpperCase())}
            </option>
          `
        )
        .join("");


    sections.push(`
      <section class="poke5e-level-up-dialog__section">

        <header>
          <i
            class="fa-solid fa-shield"
            aria-hidden="true"
          ></i>

          <div>
            <h3>
              Trainer's Resolve
            </h3>

            <p>
              ${
                language === "en"
                  ? "Choose a new Saving Throw proficiency. You also become immune to being Frightened."
                  : "Elige una nueva Saving Throw proficiency. Además, te vuelves inmune a Frightened."
              }
            </p>
          </div>
        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            Saving Throw
          </span>

          <select name="trainerResolveSaveId">

            <option value="">
              —
            </option>

            ${saveOptions}

          </select>

        </label>

      </section>
    `);
  }

  if (
    preview.requiresEpicBoon
  ) {

    sections.push(`
      <section class="poke5e-level-up-dialog__section">

        <header>

          <i
            class="fa-solid fa-crown"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              Epic Boon
            </h3>

            <p>
              ${
                language === "en"
                  ? "Choose an Epic Boon feat or another feat for which the Trainer qualifies. Boon of Fate is the recommended option."
                  : "Elige un Epic Boon feat u otro feat para el que el Trainer cumpla los requisitos. Boon of Fate es la opción recomendada."
              }
            </p>

          </div>

        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            ${
              language === "en"
                ? "Chosen Feat"
                : "Feat elegido"
            }
          </span>

          <input
            type="text"
            name="epicBoonFeatName"
            placeholder="Boon of Fate"
            autocomplete="off"
          >

        </label>

      </section>
    `);
  }

  return sections.join("");
}

function trainerLevelUpContent(
  trainer,
  preview,
  progression,
  language
) {

  const requiresPath =
    preview.requiresPath;


  const primarySpecializationId =
    progression
      .specializationIds[0];


  const currentLimits =
    getTrainerProgressionLimits({
      level:
        preview.currentLevel,

      pathId:
        progression
          .path
          ?.id ??
        null
    });


  const nextLimits =
    preview.pathId
      ? getTrainerProgressionLimits({
          level:
            preview.nextLevel,

          pathId:
            preview.pathId
        })
      : null;


  const pathMarkup =
    requiresPath
      ? `
        <section class="poke5e-level-up-dialog__section">

          <header>
            <i
              class="fa-solid fa-route"
              aria-hidden="true"
            ></i>

            <div>
              <h3>
                Trainer Path
              </h3>

              <p>
                ${
                  language === "en"
                    ? "Choose the Path this Trainer will follow from level 2."
                    : "Elige el Path que seguirá este Trainer desde nivel 2."
                }
              </p>
            </div>
          </header>


          <label class="poke5e-level-up-dialog__field">

            <span>
              Trainer Path
            </span>

            <select
              name="pathId"
              data-level-up-role="path"
            >
              <option value="">
                ${
                  language === "en"
                    ? "Choose a Path"
                    : "Elige un Path"
                }
              </option>

              ${pathOptions(
                language
              )}
            </select>

          </label>


          <div
            class="poke5e-level-up-dialog__conditional"
            data-level-up-role="hobbyist"
            hidden
          >

            <strong>
              Hobbyist
            </strong>

            <p>
              ${
                language === "en"
                  ? "Choose an additional Specialization and two new Skill Proficiencies."
                  : "Elige una Specialization adicional y dos nuevas Skill Proficiencies."
              }
            </p>


            <label class="poke5e-level-up-dialog__field">

              <span>
                ${
                  language === "en"
                    ? "Additional Specialization"
                    : "Specialization adicional"
                }
              </span>

              <select
                name="hobbyistSpecializationId"
              >
                <option value="">
                  —
                </option>

                ${specializationOptions(
                  primarySpecializationId
                )}
              </select>

            </label>


            <div class="poke5e-level-up-dialog__choice-grid">

              <label class="poke5e-level-up-dialog__field">

                <span>
                  ${
                    language === "en"
                      ? "New Skill 1"
                      : "Nueva Skill 1"
                  }
                </span>

                <select
                  name="hobbyistSkill1"
                >
                  <option value="">
                    —
                  </option>

                  ${skillOptions(
                    progression,
                    language
                  )}
                </select>

              </label>


              <label class="poke5e-level-up-dialog__field">

                <span>
                  ${
                    language === "en"
                      ? "New Skill 2"
                      : "Nueva Skill 2"
                  }
                </span>

                <select
                  name="hobbyistSkill2"
                >
                  <option value="">
                    —
                  </option>

                  ${skillOptions(
                    progression,
                    language
                  )}
                </select>

              </label>

            </div>

          </div>

        </section>
      `
      : `
        <section class="poke5e-level-up-dialog__section">

          <header>
            <i
              class="fa-solid fa-route"
              aria-hidden="true"
            ></i>

            <div>
              <h3>
                Trainer Path
              </h3>

              <p>
                ${
                  language === "en"
                    ? "Your existing Path is preserved."
                    : "Tu Trainer Path actual se mantiene."
                }
              </p>
            </div>
          </header>

          <div class="poke5e-level-up-dialog__value">

            <strong>
              ${escapeHtml(
                TRAINER_PATHS[
                  preview.pathId
                ]?.name ??
                preview.pathId ??
                "—"
              )}
            </strong>

          </div>

        </section>
      `;


  return `
    <div
      class="poke5e-level-up-dialog"
      data-level-up-kind="trainer"
    >

      <header class="poke5e-level-up-dialog__hero">

        <span class="poke5e-level-up-dialog__icon">
          <i
            class="fa-solid fa-arrow-up"
            aria-hidden="true"
          ></i>
        </span>

        <div class="poke5e-level-up-dialog__identity">

          <small>
            Trainer Level Up
          </small>

          <h2>
            ${escapeHtml(
              trainer.name
            )}
          </h2>

        </div>


        <div class="poke5e-level-up-dialog__levels">

          <span>
            ${
              language === "en"
                ? "Lv."
                : "Nv."
            }
            ${preview.currentLevel}
          </span>

          <i
            class="fa-solid fa-arrow-right"
            aria-hidden="true"
          ></i>

          <strong>
            ${
              language === "en"
                ? "Lv."
                : "Nv."
            }
            ${preview.nextLevel}
          </strong>

        </div>

      </header>


      ${pathMarkup}

      ${higherLevelChoiceMarkup(
        preview,
        progression,
        language
      )}

      <section class="poke5e-level-up-dialog__section">

        <header>

          <i
            class="fa-solid fa-heart"
            aria-hidden="true"
          ></i>

          <div>

            <h3>
              ${
                language === "en"
                  ? "Hit Points"
                  : "Puntos de Golpe"
              }
            </h3>

            <p>
              ${
                language === "en"
                  ? "Choose the HP increase for the new Trainer level."
                  : "Elige cómo obtener los HP del nuevo nivel de Trainer."
              }
            </p>

          </div>

        </header>


        <label class="poke5e-level-up-dialog__field">

          <span>
            ${
              language === "en"
                ? "HP Gain"
                : "Ganancia de HP"
            }
          </span>

          <select name="hpMode">

            <option value="fixed">
              4 + CON
            </option>

            <option value="roll">
              1d6 + CON
            </option>

          </select>

        </label>

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
              ${
                language === "en"
                  ? "Progression"
                  : "Progresión"
              }
            </h3>

            <p>
              ${
                language === "en"
                  ? "Progression values are applied automatically when the level is confirmed."
                  : "Los valores de progresión se aplican automáticamente al confirmar el nivel."
              }
            </p>
          </div>
        </header>


        <div class="poke5e-level-up-dialog__limits">

          <span>
            <small>Max SR</small>

            <strong>
              ${currentLimits.maxSr}
              ${
                nextLimits
                  ? ` → ${nextLimits.maxSr}`
                  : ""
              }
            </strong>
          </span>


          <span>
            <small>Pokéslots</small>

            <strong>
              ${currentLimits.pokeslots}
              ${
                nextLimits
                  ? ` → ${nextLimits.pokeslots}`
                  : ""
              }
            </strong>
          </span>

        </div>

      </section>

    </div>
  `;
}

function syncTrainerLevelUpDialog(
  dialog
) {

  const root =
    dialog?.element;


  if (!root) {

    return;
  }


  const pathSelect =
    root.querySelector(
      '[data-level-up-role="path"]'
    );


  const hobbyist =
    root.querySelector(
      '[data-level-up-role="hobbyist"]'
    );


  if (
    !pathSelect ||
    !hobbyist
  ) {

    return;
  }


  const hobbyistSelects =
    hobbyist.querySelectorAll(
      "select"
    );


  const sync =
    () => {

      const active =
        pathSelect.value ===
        "hobbyist";


      hobbyist.hidden =
        !active;


      for (
        const select
        of hobbyistSelects
      ) {

        select.disabled =
          !active;
      }
    };


  pathSelect.addEventListener(
    "change",
    sync
  );


  sync();
}

function readAbilityScoreIncreases(
  form,
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
          form.elements
            .namedItem(
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

function readTrainerChoices(
  button,
  preview,
  language
) {

  const form =
    button.form;

  const hpMode =
    String(
      form.elements
        .hpMode
        ?.value ??
      "fixed"
    );


  if (
    hpMode !== "fixed" &&
    hpMode !== "roll"
  ) {

    throw new Error(
      language === "en"
        ? "You must choose a valid HP gain method."
        : "Debes elegir un método válido para la ganancia de HP."
    );
  }


  const abilityScoreIncreases =
    readAbilityScoreIncreases(
      form,
      preview
    );

  const specializationId =
    preview.requiresSpecialization
      ? String(
          form.elements
            .namedItem(
              "levelSpecializationId"
            )
            ?.value ??
          ""
        )
      : null;


  if (
    preview.requiresSpecialization &&
    !specializationId
  ) {

    throw new Error(
      language === "en"
        ? "You must choose a Specialization."
        : "Debes seleccionar una Specialization."
    );
  }


  const trainerResolveSaveId =
    preview.requiresTrainerResolveSave
      ? String(
          form.elements
            .namedItem(
              "trainerResolveSaveId"
            )
            ?.value ??
          ""
        )
      : null;


  if (
    preview.requiresTrainerResolveSave &&
    !trainerResolveSaveId
  ) {

    throw new Error(
      language === "en"
        ? "Trainer's Resolve requires a new Saving Throw proficiency."
        : "Trainer's Resolve requiere elegir una nueva Saving Throw proficiency."
    );
  }

  const epicBoonFeatName =
    preview.requiresEpicBoon
      ? String(
          form.elements
            .namedItem(
              "epicBoonFeatName"
            )
            ?.value ??
          ""
        ).trim()
      : null;


  if (
    preview.requiresEpicBoon &&
    !epicBoonFeatName
  ) {

    throw new Error(
      language === "en"
        ? "Epic Boon requires choosing a feat."
        : "Epic Boon requiere seleccionar un feat."
    );
  }

  const pathId =
    preview.requiresPath
      ? String(
          form.elements
            .pathId
            .value ??
          ""
        )
      : preview.pathId;


  if (
    preview.requiresPath &&
    !pathId
  ) {

    throw new Error(
      language === "en"
        ? "You must choose a Trainer Path."
        : "Debes seleccionar un Trainer Path."
    );
  }


  const pathChoices = {};


  if (
    preview.requiresPath &&
    pathId ===
      "hobbyist"
  ) {

    const specializationId =
      String(
        form.elements
          .hobbyistSpecializationId
          ?.value ??
        ""
      );


    const skill1 =
      String(
        form.elements
          .hobbyistSkill1
          ?.value ??
        ""
      );


    const skill2 =
      String(
        form.elements
          .hobbyistSkill2
          ?.value ??
        ""
      );


    if (
      !specializationId ||
      !skill1 ||
      !skill2 ||
      skill1 ===
        skill2
    ) {

      throw new Error(
        language === "en"
          ? "Hobbyist requires an additional Specialization and two different new Skills."
          : "Hobbyist requiere una Specialization adicional y dos Skills nuevas diferentes."
      );
    }


    pathChoices
      .hobbyistSpecializationId =
        specializationId;


    pathChoices
      .hobbyistSkillIds = [
        skill1,
        skill2
      ];
  }

  if (
    preview.pathFeatureChoice ===
    "ace-trainer-ability"
  ) {

    const abilityId =
      String(
        form.elements
          .namedItem(
            "pathFeatureAbilityId"
          )
          ?.value ??
        ""
      );


    if (!abilityId) {

      throw new Error(
        language === "en"
          ? "Tactical Mastery requires an Ability Score."
          : "Tactical Mastery requiere seleccionar un Ability Score."
      );
    }


    pathChoices
      .tacticalMasteryAbilityId =
        abilityId;
  }


  if (
    preview.pathFeatureChoice ===
    "type-master-resistance"
  ) {

    const resistanceType =
      String(
        form.elements
          .namedItem(
            "pathFeatureResistanceType"
          )
          ?.value ??
        ""
      );


    if (!resistanceType) {

      throw new Error(
        language === "en"
          ? "Storing Power requires a resistance type."
          : "Storing Power requiere seleccionar un tipo de resistencia."
      );
    }


    pathChoices
      .storingPowerResistanceType =
        resistanceType;
  }

  return {
    pathId,
    pathChoices,
    specializationId,
    trainerResolveSaveId,
    epicBoonFeatName,
    hpMode,
    abilityScoreIncreases
  };
}


export async function openTrainerLevelUpDialog(
  trainer
) {

  const language =
    getLanguage();


  const preview =
    getTrainerLevelUpPreview(
      trainer
    );


  if (
    !preview.canLevelUp
  ) {

    ui.notifications.warn(
      language === "en"
        ? `Trainer progression is currently implemented up to level ${MAX_SUPPORTED_TRAINER_LEVEL}.`
        : `La progresión de Trainer está implementada actualmente hasta nivel ${MAX_SUPPORTED_TRAINER_LEVEL}.`
    );

    return null;
  }


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const choices =
    await foundry.applications.api
      .DialogV2.prompt({

        classes: [
          "poke5e-level-up-window",
          "poke5e-trainer-level-up-window"
        ],

        position: {
          width:
            680
        },

        window: {
          title:
            language === "en"
              ? "Trainer Level Up"
              : "Subir nivel de Trainer"
        },

        content:
          trainerLevelUpContent(
            trainer,
            preview,
            progression,
            language
          ),

        rejectClose:
          false,

        render: (
          event,
          dialog
        ) => {

          syncTrainerLevelUpDialog(
            dialog
          );
        },

        ok: {
          label:
            language === "en"
              ? `Level Up to ${preview.nextLevel}`
              : `Subir a Nv. ${preview.nextLevel}`,

          callback:
            (...args) =>
              readTrainerChoices(
                args[1],
                preview,
                language
              )
        }
      });


  if (!choices) {

    return null;
  }


  const result =
    await levelUpTrainer(
      trainer,
      choices
    );


  ui.notifications.info(
    language === "en"
      ? `${trainer.name} reached level ${result.level}.`
      : `${trainer.name} alcanzó Nv. ${result.level}.`
  );


  return result;
}