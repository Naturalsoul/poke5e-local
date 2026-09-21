import {
  createTrainer
} from "./trainer-service.mjs";

import {
  TRAINER_CLASS_SKILL_IDS,
  TRAINER_ORIGINS,
  TRAINER_PATHS,
  TRAINER_SKILLS,
  TRAINER_SPECIALIZATIONS,
  getTrainerProgressionLimits
} from "./trainer-rules.mjs";

const MODULE_ID =
  "poke5e-local";

const ABILITIES =
  Object.freeze({
    str: "STR",
    dex: "DEX",
    con: "CON",
    int: "INT",
    wis: "WIS",
    cha: "CHA"
  });

const TYPE_LABELS =
  Object.freeze({
    es: {
      normal: "Normal",
      fighting: "Lucha",
      flying: "Volador",
      poison: "Veneno",
      ground: "Tierra",
      rock: "Roca",
      bug: "Bicho",
      ghost: "Fantasma",
      steel: "Acero",
      fire: "Fuego",
      water: "Agua",
      grass: "Planta",
      electric: "Eléctrico",
      psychic: "Psíquico",
      ice: "Hielo",
      dragon: "Dragón",
      dark: "Siniestro",
      fairy: "Hada"
    },

    en: {
      normal: "Normal",
      fighting: "Fighting",
      flying: "Flying",
      poison: "Poison",
      ground: "Ground",
      rock: "Rock",
      bug: "Bug",
      ghost: "Ghost",
      steel: "Steel",
      fire: "Fire",
      water: "Water",
      grass: "Grass",
      electric: "Electric",
      psychic: "Psychic",
      ice: "Ice",
      dragon: "Dragon",
      dark: "Dark",
      fairy: "Fairy"
    }
  });

const FEATURE_LABELS =
  Object.freeze({
    es: {
      "speak-with-pokemon":
        "Hablar con Pokémon",

      "galarian-damage-reduction":
        "Reducción de daño Galariana",

      "practiced-strikes":
        "Golpes practicados",

      "bon-chance":
        "Bon Chance",

      "pokemon-attack-damage-bonus":
        "Bono al daño de ataques Pokémon",

      "double-tm-use":
        "Uso doble de TM",

      "pokemon-skill-int-bonus":
        "Bono de INT a Skills Pokémon",

      "healing-wisdom-bonus":
        "Bono de WIS a curación",

      "specialization-stab-bonus":
        "Bono STAB de Specialization",

      sabotage:
        "Sabotage",

      "tactical-healing":
        "Tactical Healing",

      "ranger-movement":
        "Movimiento Ranger"
    },

    en: {
      "speak-with-pokemon":
        "Speak with Pokémon",

      "galarian-damage-reduction":
        "Galarian Damage Reduction",

      "practiced-strikes":
        "Practiced Strikes",

      "bon-chance":
        "Bon Chance",

      "pokemon-attack-damage-bonus":
        "Pokémon Attack Damage Bonus",

      "double-tm-use":
        "Double TM Use",

      "pokemon-skill-int-bonus":
        "Pokémon Skill INT Bonus",

      "healing-wisdom-bonus":
        "Healing WIS Bonus",

      "specialization-stab-bonus":
        "Specialization STAB Bonus",

      sabotage:
        "Sabotage",

      "tactical-healing":
        "Tactical Healing",

      "ranger-movement":
        "Ranger Movement"
    }
  });

const ENVIRONMENT_LABELS =
  Object.freeze({
    es: {
      coast: "Costa",
      desert: "Desierto",
      forest: "Bosque",
      mountain: "Montaña"
    },

    en: {
      coast: "Coast",
      desert: "Desert",
      forest: "Forest",
      mountain: "Mountain"
    }
  });

const HTML_ENTITIES =
  Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  });

const LABELS = {
  es: {
    title:
      "Crear Entrenador",

    heading:
      "Nuevo Entrenador",

    intro:
      "Construye el Trainer paso a paso. Las reglas finales se validarán al crear.",

    identity:
      "Identidad",

    identityHint:
      "Define quién es el Trainer y el nivel inicial.",

    name:
      "Nombre",

    level:
      "Nivel",

    abilities:
      "Ability Scores",

    abilitiesHint:
      "Ingresa los valores base. Origin y Specialization se aplican después por progresión.",

    origin:
      "Origin",

    originHint:
      "Elige la región. Solo aparecerán las decisiones que correspondan.",

    originBenefits:
      "Beneficios del Origin",

    specialization:
      "Specialization",

    specializationHint:
      "Elige la Specialization principal según el tipo Pokémon.",

    specializationBenefit:
      "Beneficio del Trainer",

    skills:
      "Trainer Skills",

    skillsHint:
      "Elige exactamente 2 Skills de Trainer Class. Animal Handling se gestiona automáticamente.",

    selected:
      "seleccionadas",

    path:
      "Trainer Path",

    pathHint:
      "Disponible desde Lv. 2. Elige la dirección de progresión del Trainer.",

    pathFeature:
      "Feature Lv. 2",

    pathOptions:
      "Opciones del Path",

    pathOptionsHint:
      "Solo aparecen elecciones adicionales requeridas por el Path.",

    summary:
      "Resumen",

    summaryHint:
      "Revisa la configuración antes de crear el Trainer.",

    create:
      "Crear Entrenador",

    folder:
      "Entrenadores",

    back:
      "Anterior",

    next:
      "Siguiente",

    galarianPattern:
      "Distribución de Ability Scores",

    hoennEnvironment:
      "Environment",

    kantoAbilities:
      "Elige 2 Ability Scores distintos",

    kantoFeat:
      "Feat elegido",

    kantoFeatHint:
      "Se guardará como selección pendiente mientras Feats no esté implementado.",

    unovanSkills:
      "Elige 2 Skills adicionales",

    hobbyistSpecialization:
      "Specialization adicional",

    hobbyistSkills:
      "Elige 2 nuevas Skill Proficiencies",

    alreadyProficient:
      "Esta Skill ya es una proficiency del Trainer.",

    selectionLimitReached:
      "Ya seleccionaste el máximo de 2 opciones.",

    maxSr:
      "Max SR",

    pokeslots:
      "Pokéslots",

    originSummary:
      "Origin",

    specializationSummary:
      "Specialization",

    pathSummary:
      "Path",

    skillsSummary:
      "Skills de Trainer",

    baseAbilitiesSummary:
      "Ability Scores base",

    galarianSummary:
      "Distribución Galarian",

    environmentSummary:
      "Environment",

    abilityChoicesSummary:
      "Ability Scores elegidos",

    featSummary:
      "Feat",

    unovanSkillsSummary:
      "Skills adicionales de Unovan",

    hobbyistSpecializationSummary:
      "Specialization de Hobbyist",

    hobbyistSkillsSummary:
      "Skills de Hobbyist",

    noSelection:
      "—",

    noPath:
      "No disponible en Lv. 1",

    abilityBenefit:
      "Ability",

    skillBenefit:
      "Skill",

    languageBenefit:
      "Idioma",

    featureBenefit:
      "Feature",

    choiceBenefit:
      "Elección",

    extraSkills:
      count =>
        `${count} Skills adicionales`,

    featChoice:
      "Feat a elección",

    environmentChoice:
      "Environment a elección",

    additionalSpecialization:
      "Specialization adicional",

    resource:
      "Recurso",

    expertise:
      "Expertise",

    requires:
      "Requiere",

    maxSrBonus:
      value =>
        `Max SR +${value}`,

    chooseTwo:
      "Debes elegir exactamente 2 opciones distintas.",

    choosePath:
      "Selecciona un Trainer Path para Lv. 2–3.",

    enterName:
      "Ingresa un nombre para el Trainer.",

    invalidAbilities:
      "Revisa los Ability Scores antes de continuar.",

    hobbyistDifferent:
      "Hobbyist requiere una Specialization adicional diferente de la principal.",

    created:
      name =>
        `Entrenador ${name} creado correctamente.`,

    error:
      "No se pudo crear el Entrenador."
  },

  en: {
    title:
      "Create Trainer",

    heading:
      "New Trainer",

    intro:
      "Build the Trainer step by step. Final rules are validated when the Trainer is created.",

    identity:
      "Identity",

    identityHint:
      "Define who the Trainer is and their starting level.",

    name:
      "Name",

    level:
      "Level",

    abilities:
      "Ability Scores",

    abilitiesHint:
      "Enter base values. Origin and Specialization are applied afterward by progression.",

    origin:
      "Origin",

    originHint:
      "Choose the region. Only relevant Origin choices will be shown.",

    originBenefits:
      "Origin Benefits",

    specialization:
      "Specialization",

    specializationHint:
      "Choose the primary Specialization by Pokémon type.",

    specializationBenefit:
      "Trainer Benefit",

    skills:
      "Trainer Skills",

    skillsHint:
      "Choose exactly 2 Trainer Class Skills. Animal Handling is managed automatically.",

    selected:
      "selected",

    path:
      "Trainer Path",

    pathHint:
      "Available from Lv. 2. Choose the Trainer's progression direction.",

    pathFeature:
      "Lv. 2 Feature",

    pathOptions:
      "Path Options",

    pathOptionsHint:
      "Only additional choices required by the selected Path are shown.",

    summary:
      "Summary",

    summaryHint:
      "Review the configuration before creating the Trainer.",

    create:
      "Create Trainer",

    folder:
      "Trainers",

    back:
      "Back",

    next:
      "Next",

    galarianPattern:
      "Ability Score Distribution",

    hoennEnvironment:
      "Environment",

    kantoAbilities:
      "Choose 2 different Ability Scores",

    kantoFeat:
      "Chosen Feat",

    kantoFeatHint:
      "Stored as a pending choice until Feats is implemented.",

    unovanSkills:
      "Choose 2 additional Skills",

    hobbyistSpecialization:
      "Additional Specialization",

    hobbyistSkills:
      "Choose 2 new Skill Proficiencies",

    alreadyProficient:
      "This Skill is already a Trainer proficiency.",

    selectionLimitReached:
      "You already selected the maximum of 2 options.",

    maxSr:
      "Max SR",

    pokeslots:
      "Pokéslots",

    originSummary:
      "Origin",

    specializationSummary:
      "Specialization",

    pathSummary:
      "Path",

    skillsSummary:
      "Trainer Skills",

    baseAbilitiesSummary:
      "Base Ability Scores",

    galarianSummary:
      "Galarian Distribution",

    environmentSummary:
      "Environment",

    abilityChoicesSummary:
      "Chosen Ability Scores",

    featSummary:
      "Feat",

    unovanSkillsSummary:
      "Additional Unovan Skills",

    hobbyistSpecializationSummary:
      "Hobbyist Specialization",

    hobbyistSkillsSummary:
      "Hobbyist Skills",

    noSelection:
      "—",

    noPath:
      "Not available at Lv. 1",

    abilityBenefit:
      "Ability",

    skillBenefit:
      "Skill",

    languageBenefit:
      "Language",

    featureBenefit:
      "Feature",

    choiceBenefit:
      "Choice",

    extraSkills:
      count =>
        `${count} additional Skills`,

    featChoice:
      "Feat choice",

    environmentChoice:
      "Environment choice",

    additionalSpecialization:
      "Additional Specialization",

    resource:
      "Resource",

    expertise:
      "Expertise",

    requires:
      "Requires",

    maxSrBonus:
      value =>
        `Max SR +${value}`,

    chooseTwo:
      "Choose exactly 2 different options.",

    choosePath:
      "Select a Trainer Path for Lv. 2–3.",

    enterName:
      "Enter a Trainer name.",

    invalidAbilities:
      "Review the Ability Scores before continuing.",

    hobbyistDifferent:
      "Hobbyist requires an additional Specialization different from the primary one.",

    created:
      name =>
        `Trainer ${name} created successfully.`,

    error:
      "The Trainer could not be created."
  }
};


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

  return String(
    value ??
    ""
  ).replace(
    /[&<>"']/g,
    character =>
      HTML_ENTITIES[
        character
      ]
  );
}


function localizedName(
  definition,
  language
) {

  if (!definition) {
    return "";
  }


  if (
    typeof definition.name !==
      "object"
  ) {

    return definition.name;
  }


  return (
    definition.name[
      language
    ] ??
    definition.name.en
  );
}


function localizedSkill(
  id,
  language
) {

  return (
    TRAINER_SKILLS[
      id
    ]?.[language] ??
    id
  );
}


function localizedType(
  type,
  language
) {

  return (
    TYPE_LABELS[
      language
    ]?.[type] ??
    type
  );
}


function localizedFeature(
  id,
  language
) {

  return (
    FEATURE_LABELS[
      language
    ]?.[id] ??
    String(
      id ??
      ""
    ).replace(
      /-/g,
      " "
    )
  );
}


function abilityInputs() {

  return Object.entries(
    ABILITIES
  )
    .map(
      (
        [
          id,
          label
        ]
      ) => `
        <label class="poke5e-trainer-create__ability">

          <span>
            ${label}
          </span>

          <input
            type="number"
            name="ability-${id}"
            value="10"
            min="1"
            max="20"
            required
          >

        </label>
      `
    )
    .join("");
}


function choiceCard(
  name,
  value,
  label,
  checked = false
) {

  return `
    <label class="poke5e-trainer-create__choice-card">

      <input
        type="radio"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value)}"
        ${checked ? "checked" : ""}
      >

      <span>
        ${escapeHtml(label)}
      </span>

    </label>
  `;
}


function originCards(
  language
) {

  return Object.values(
    TRAINER_ORIGINS
  )
    .map(
      (
        origin,
        index
      ) =>
        choiceCard(
          "originId",
          origin.id,
          localizedName(
            origin,
            language
          ),
          index === 0
        )
    )
    .join("");
}


function specializationCards(
  language
) {

  return Object.values(
    TRAINER_SPECIALIZATIONS
  )
    .map(
      (
        specialization,
        index
      ) => `
        <label
          class="poke5e-trainer-create__type-card"
          data-pokemon-type="${escapeHtml(
            specialization.type
          )}"
        >

          <input
            type="radio"
            name="specializationId"
            value="${escapeHtml(
              specialization.id
            )}"
            ${index === 0 ? "checked" : ""}
          >

          <span
            class="poke5e-trainer-create__type-dot"
          ></span>

          <strong>
            ${escapeHtml(
              localizedName(
                specialization,
                language
              )
            )}
          </strong>

          <small>
            ${escapeHtml(
              localizedType(
                specialization.type,
                language
              )
            )}
          </small>

        </label>
      `
    )
    .join("");
}


function pathCards(
  language
) {

  return Object.values(
    TRAINER_PATHS
  )
    .map(
      path =>
        choiceCard(
          "pathId",
          path.id,
          localizedName(
            path,
            language
          )
        )
    )
    .join("");
}


function checkboxes(
  name,
  values
) {

  return values
    .map(
      (
        {
          value,
          label
        }
      ) => `
        <label class="poke5e-trainer-create__skill-chip">

          <input
            type="checkbox"
            name="${escapeHtml(name)}"
            value="${escapeHtml(value)}"
          >

          <span>

            <span class="poke5e-trainer-create__skill-text">
              ${escapeHtml(label)}
            </span>

            <i
              class="
                fa-solid
                fa-lock
                poke5e-trainer-create__skill-lock
              "
              aria-hidden="true"
            ></i>

          </span>

        </label>
      `
    )
    .join("");
}


function skillCheckboxes(
  name,
  ids,
  language
) {

  return checkboxes(
    name,

    ids.map(
      id => ({
        value:
          id,

        label:
          localizedSkill(
            id,
            language
          )
      })
    )
  );
}


function abilityCheckboxes(
  name
) {

  return checkboxes(
    name,

    Object.entries(
      ABILITIES
    ).map(
      (
        [
          value,
          label
        ]
      ) => ({
        value,
        label
      })
    )
  );
}


function radioOptions(
  name,
  options
) {

  return options
    .map(
      (
        option,
        index
      ) => `
        <label class="poke5e-trainer-create__radio-option">

          <input
            type="radio"
            name="${escapeHtml(name)}"
            value="${escapeHtml(option.value)}"
            ${index === 0 ? "checked" : ""}
          >

          <span>
            ${escapeHtml(option.label)}
          </span>

        </label>
      `
    )
    .join("");
}


function specializationOptions(
  language
) {

  return Object.values(
    TRAINER_SPECIALIZATIONS
  )
    .map(
      specialization => `
        <option
          value="${escapeHtml(
            specialization.id
          )}"
        >
          ${escapeHtml(
            localizedName(
              specialization,
              language
            )
          )}
        </option>
      `
    )
    .join("");
}


function benefitChip(
  label,
  value
) {

  if (
    value == null ||
    value === ""
  ) {

    return "";
  }


  return `
    <span class="poke5e-trainer-create__benefit-chip">

      <strong>
        ${escapeHtml(label)}
      </strong>

      ${escapeHtml(value)}

    </span>
  `;
}


function originBenefits(
  origin,
  labels,
  language
) {

  const benefits = [];


  for (
    const [
      ability,
      bonus
    ]
    of Object.entries(
      origin.abilityBonuses ??
      {}
    )
  ) {

    benefits.push(
      benefitChip(
        labels.abilityBenefit,
        `${ABILITIES[ability]} +${bonus}`
      )
    );
  }


  for (
    const skill
    of origin.skillProficiencies ??
      []
  ) {

    benefits.push(
      benefitChip(
        labels.skillBenefit,
        localizedSkill(
          skill,
          language
        )
      )
    );
  }


  benefits.push(
    benefitChip(
      labels.languageBenefit,
      origin.regionalLanguage
    )
  );


  if (
    origin.feature
  ) {

    benefits.push(
      benefitChip(
        labels.featureBenefit,
        localizedFeature(
          origin.feature,
          language
        )
      )
    );
  }


  if (
    origin.environmentChoice
  ) {

    benefits.push(
      benefitChip(
        labels.choiceBenefit,
        labels.environmentChoice
      )
    );
  }


  if (
    origin.featChoice
  ) {

    benefits.push(
      benefitChip(
        labels.choiceBenefit,
        labels.featChoice
      )
    );
  }


  if (
    origin.extraSkillChoices
  ) {

    benefits.push(
      benefitChip(
        labels.choiceBenefit,
        labels.extraSkills(
          origin.extraSkillChoices
        )
      )
    );
  }


  return benefits.join("");
}


function specializationBenefits(
  specialization,
  labels,
  language
) {

  if (
    specialization.trainerAbility
  ) {

    return benefitChip(
      labels.abilityBenefit,
      `${ABILITIES[
        specialization
          .trainerAbility
      ]} +1`
    );
  }


  if (
    specialization.trainerSkill
  ) {

    return benefitChip(
      labels.skillBenefit,
      localizedSkill(
        specialization
          .trainerSkill,
        language
      )
    );
  }


  return "";
}


function pathBenefits(
  path,
  labels,
  language
) {

  const benefits = [];


  if (
    path.feature
  ) {

    benefits.push(
      benefitChip(
        labels.pathFeature,
        localizedFeature(
          path.feature,
          language
        )
      )
    );
  }


  if (
    path.trainerSkill
  ) {

    benefits.push(
      benefitChip(
        labels.skillBenefit,
        localizedSkill(
          path.trainerSkill,
          language
        )
      )
    );
  }


  if (
    path.trainerSkillExpertise
  ) {

    benefits.push(
      benefitChip(
        labels.expertise,
        localizedSkill(
          path.trainerSkillExpertise,
          language
        )
      )
    );
  }


  for (
    const skill
    of path.trainerSkills ??
      []
  ) {

    benefits.push(
      benefitChip(
        labels.skillBenefit,
        localizedSkill(
          skill,
          language
        )
      )
    );
  }


  if (
    path.additionalSpecialization
  ) {

    benefits.push(
      benefitChip(
        labels.pathOptions,
        labels.additionalSpecialization
      )
    );
  }


  if (
    path.extraSkillChoices
  ) {

    benefits.push(
      benefitChip(
        labels.pathOptions,
        labels.extraSkills(
          path.extraSkillChoices
        )
      )
    );
  }


  if (
    path.resource
  ) {

    benefits.push(
      benefitChip(
        labels.resource,
        path.resource.id
      )
    );
  }


  if (
    path.maxSrBonus
  ) {

    benefits.push(
      benefitChip(
        labels.pathFeature,
        labels.maxSrBonus(
          path.maxSrBonus
        )
      )
    );
  }


  if (
    path.requires
  ) {

    benefits.push(
      benefitChip(
        labels.requires,
        path.requires
      )
    );
  }


  return benefits.join("");
}


function originChoices(
  originId,
  labels,
  language
) {

  if (
    originId ===
      "galarian"
  ) {

    return `
      <div class="poke5e-trainer-create__conditional-block">

        <strong>
          ${labels.galarianPattern}
        </strong>

        <div class="poke5e-trainer-create__radio-grid">

          ${radioOptions(
            "galarianPattern",
            [
              {
                value:
                  "str2-dex1",

                label:
                  "STR +2 / DEX +1"
              },
              {
                value:
                  "dex2-str1",

                label:
                  "DEX +2 / STR +1"
              }
            ]
          )}

        </div>

      </div>
    `;
  }


  if (
    originId ===
      "hoennian"
  ) {

    const environments =
      Object.entries(
        ENVIRONMENT_LABELS[
          language
        ]
      ).map(
        (
          [
            value,
            label
          ]
        ) => ({
          value,
          label
        })
      );


    return `
      <div class="poke5e-trainer-create__conditional-block">

        <strong>
          ${labels.hoennEnvironment}
        </strong>

        <div class="poke5e-trainer-create__radio-grid">

          ${radioOptions(
            "hoennEnvironment",
            environments
          )}

        </div>

      </div>
    `;
  }


  if (
    originId ===
      "kantoan"
  ) {

    return `
      <div class="poke5e-trainer-create__conditional-block">

        <strong>
          ${labels.kantoAbilities}
        </strong>

        <div
          class="poke5e-trainer-create__skill-grid"
          data-limited-group="kantoAbilityIds"
          data-limit="2"
        >

          ${abilityCheckboxes(
            "kantoAbilityIds"
          )}

        </div>


        <label class="poke5e-trainer-create__stacked-field">

          <span>
            ${labels.kantoFeat}
          </span>

          <input
            type="text"
            name="kantoFeatName"
            autocomplete="off"
          >

          <small>
            ${labels.kantoFeatHint}
          </small>

        </label>

      </div>
    `;
  }


  if (
    originId ===
      "unovan"
  ) {

    return `
      <div class="poke5e-trainer-create__conditional-block">

        <strong>
          ${labels.unovanSkills}
        </strong>

        <div
          class="poke5e-trainer-create__skill-grid"
          data-limited-group="unovanExtraSkillIds"
          data-limit="2"
        >

          ${skillCheckboxes(
            "unovanExtraSkillIds",
            Object.keys(
              TRAINER_SKILLS
            ),
            language
          )}

        </div>

      </div>
    `;
  }


  return "";
}


function originDetailPanels(
  labels,
  language
) {

  return Object.values(
    TRAINER_ORIGINS
  )
    .map(
      origin => `
        <section
          class="poke5e-trainer-create__origin-detail"
          data-origin-detail="${escapeHtml(
            origin.id
          )}"
          hidden
        >

          <div class="poke5e-trainer-create__benefits">

            ${originBenefits(
              origin,
              labels,
              language
            )}

          </div>


          ${originChoices(
            origin.id,
            labels,
            language
          )}

        </section>
      `
    )
    .join("");
}


function specializationDetailPanels(
  labels,
  language
) {

  return Object.values(
    TRAINER_SPECIALIZATIONS
  )
    .map(
      specialization => `
        <div
          class="poke5e-trainer-create__selection-summary"
          data-specialization-detail="${escapeHtml(
            specialization.id
          )}"
          hidden
        >

          <strong>
            ${labels.specializationBenefit}
          </strong>

          <div class="poke5e-trainer-create__benefits">

            ${specializationBenefits(
              specialization,
              labels,
              language
            )}

          </div>

        </div>
      `
    )
    .join("");
}


function pathDetailPanels(
  labels,
  language
) {

  return Object.values(
    TRAINER_PATHS
  )
    .map(
      path => `
        <div
          class="poke5e-trainer-create__selection-summary"
          data-path-detail="${escapeHtml(
            path.id
          )}"
          hidden
        >

          <strong>
            ${labels.pathFeature}
          </strong>

          <div class="poke5e-trainer-create__benefits">

            ${pathBenefits(
              path,
              labels,
              language
            )}

          </div>

        </div>
      `
    )
    .join("");
}


function stepHeader(
  icon,
  title,
  hint
) {

  return `
    <header class="poke5e-trainer-create__step-header">

      <span class="poke5e-trainer-create__step-icon">

        <i
          class="${escapeHtml(icon)}"
          aria-hidden="true"
        ></i>

      </span>

      <div>

        <h3>
          ${escapeHtml(title)}
        </h3>

        <p>
          ${escapeHtml(hint)}
        </p>

      </div>

    </header>
  `;
}


function buildDialogContent(
  labels,
  language
) {

  return `
    <section
      class="
        poke5e-trainer-create
        poke5e-trainer-create--wizard
      "
      data-trainer-create-wizard
      data-current-step="identity"
    >

      <header class="poke5e-trainer-create__hero">

        <div class="poke5e-trainer-create__icon">

          <i
            class="fa-solid fa-user-plus"
            aria-hidden="true"
          ></i>

        </div>

        <div class="poke5e-trainer-create__intro">

          <span class="poke5e-trainer-create__eyebrow">
            Pokémon 5e
          </span>

          <h2>
            ${labels.heading}
          </h2>

          <p>
            ${labels.intro}
          </p>

        </div>

      </header>


      <nav
        class="poke5e-trainer-create__stepper"
        aria-label="${labels.heading}"
      >

        <span data-step-marker="identity">
          <b>1</b>
          ${labels.identity}
        </span>

        <span data-step-marker="abilities">
          <b>2</b>
          ${labels.abilities}
        </span>

        <span data-step-marker="origin">
          <b>3</b>
          ${labels.origin}
        </span>

        <span data-step-marker="specialization">
          <b>4</b>
          ${labels.specialization}
        </span>

        <span data-step-marker="skills">
          <b>5</b>
          ${labels.skills}
        </span>

        <span data-step-marker="path">
          <b>6</b>
          ${labels.path}
        </span>

        <span data-step-marker="path-options">
          <b>7</b>
          ${labels.pathOptions}
        </span>

        <span data-step-marker="summary">
          <b>8</b>
          ${labels.summary}
        </span>

      </nav>


      <div class="poke5e-trainer-create__body">

        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="identity"
        >

          ${stepHeader(
            "fa-solid fa-id-card",
            labels.identity,
            labels.identityHint
          )}


          <div class="poke5e-trainer-create__identity-grid">

            <label class="poke5e-trainer-create__stacked-field">

              <span>
                ${labels.name}
              </span>

              <input
                type="text"
                name="trainerName"
                autocomplete="off"
                autofocus
                required
              >

            </label>


            <label class="poke5e-trainer-create__stacked-field">

              <span>
                ${labels.level}
              </span>

              <select
                name="trainerLevel"
                required
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>

            </label>

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="abilities"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-dumbbell",
            labels.abilities,
            labels.abilitiesHint
          )}

          <div class="poke5e-trainer-create__abilities">

            ${abilityInputs()}

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="origin"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-earth-americas",
            labels.origin,
            labels.originHint
          )}


          <div class="poke5e-trainer-create__choice-grid">

            ${originCards(
              language
            )}

          </div>


          <div class="poke5e-trainer-create__detail-panel">

            <strong>
              ${labels.originBenefits}
            </strong>

            ${originDetailPanels(
              labels,
              language
            )}

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="specialization"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-star",
            labels.specialization,
            labels.specializationHint
          )}


          <div class="poke5e-trainer-create__type-grid">

            ${specializationCards(
              language
            )}

          </div>


          <div class="poke5e-trainer-create__detail-panel">

            ${specializationDetailPanels(
              labels,
              language
            )}

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="skills"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-list-check",
            labels.skills,
            labels.skillsHint
          )}


          <div class="poke5e-trainer-create__selection-counter">

            <strong data-selection-count="classSkillIds">
              0/2
            </strong>

            <span>
              ${labels.selected}
            </span>

          </div>


          <div
            class="poke5e-trainer-create__skill-grid"
            data-limited-group="classSkillIds"
            data-limit="2"
          >

            ${skillCheckboxes(
              "classSkillIds",
              TRAINER_CLASS_SKILL_IDS,
              language
            )}

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="path"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-route",
            labels.path,
            labels.pathHint
          )}


          <div class="poke5e-trainer-create__choice-grid">

            ${pathCards(
              language
            )}

          </div>


          <div class="poke5e-trainer-create__detail-panel">

            ${pathDetailPanels(
              labels,
              language
            )}

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="path-options"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-sliders",
            labels.pathOptions,
            labels.pathOptionsHint
          )}


          <div class="poke5e-trainer-create__conditional-block">

            <label class="poke5e-trainer-create__stacked-field">

              <span>
                ${labels.hobbyistSpecialization}
              </span>

              <select name="hobbyistSpecializationId">

                ${specializationOptions(
                  language
                )}

              </select>

            </label>


            <strong>
              ${labels.hobbyistSkills}
            </strong>


            <div
              class="poke5e-trainer-create__skill-grid"
              data-limited-group="hobbyistSkillIds"
              data-limit="2"
            >

              ${skillCheckboxes(
                "hobbyistSkillIds",
                Object.keys(
                  TRAINER_SKILLS
                ),
                language
              )}

            </div>

          </div>

        </section>


        <section
          class="poke5e-trainer-create__step"
          data-wizard-step="summary"
          hidden
        >

          ${stepHeader(
            "fa-solid fa-clipboard-check",
            labels.summary,
            labels.summaryHint
          )}

          <div data-trainer-summary></div>

        </section>

      </div>


      <div
        class="poke5e-trainer-create__error"
        data-wizard-error
        role="alert"
        hidden
      ></div>


      <footer class="poke5e-trainer-create__wizard-nav">

        <button
          type="button"
          data-wizard-action="back"
        >

          <i
            class="fa-solid fa-arrow-left"
            aria-hidden="true"
          ></i>

          ${labels.back}

        </button>


        <span data-wizard-progress></span>


        <button
          type="button"
          class="poke5e-trainer-create__next"
          data-wizard-action="next"
        >

          ${labels.next}

          <i
            class="fa-solid fa-arrow-right"
            aria-hidden="true"
          ></i>

        </button>

      </footer>

    </section>
  `;
}


function formValue(
  form,
  name
) {

  return form.elements[
    name
  ]?.value;
}


function checkedValues(
  form,
  name
) {

  return [
    ...form.querySelectorAll(
      `input[name="${name}"]:checked`
    )
  ].map(
    input =>
      input.value
  );
}


function progressionFromForm(
  form
) {

  const level =
    Number(
      formValue(
        form,
        "trainerLevel"
      )
    );


  return {
    level,

    baseAbilityScores:
      Object.fromEntries(
        Object.keys(
          ABILITIES
        ).map(
          id => [
            id,
            Number(
              formValue(
                form,
                `ability-${id}`
              )
            )
          ]
        )
      ),

    originId:
      formValue(
        form,
        "originId"
      ),

    specializationId:
      formValue(
        form,
        "specializationId"
      ),

    classSkillIds:
      checkedValues(
        form,
        "classSkillIds"
      ),

    pathId:
      level >= 2
        ? formValue(
            form,
            "pathId"
          )
        : null,

    originChoices: {
      galarianPattern:
        formValue(
          form,
          "galarianPattern"
        ),

      hoennEnvironment:
        formValue(
          form,
          "hoennEnvironment"
        ),

      kantoAbilityIds:
        checkedValues(
          form,
          "kantoAbilityIds"
        ),

      kantoFeatName:
        formValue(
          form,
          "kantoFeatName"
        ),

      unovanExtraSkillIds:
        checkedValues(
          form,
          "unovanExtraSkillIds"
        )
    },

    pathChoices: {
      hobbyistSpecializationId:
        formValue(
          form,
          "hobbyistSpecializationId"
        ),

      hobbyistSkillIds:
        checkedValues(
          form,
          "hobbyistSkillIds"
        )
    }
  };
}


function activeWizardSteps(
  form
) {

  const level =
    Number(
      formValue(
        form,
        "trainerLevel"
      )
    );

  const steps = [
    "identity",
    "abilities",
    "origin",
    "specialization",
    "skills"
  ];


  if (
    level >= 2
  ) {

    steps.push(
      "path"
    );


    if (
      formValue(
        form,
        "pathId"
      ) ===
        "hobbyist"
    ) {

      steps.push(
        "path-options"
      );
    }
  }


  steps.push(
    "summary"
  );


  return steps;
}


function showWizardError(
  root,
  message
) {

  const error =
    root.querySelector(
      "[data-wizard-error]"
    );


  if (!error) {
    return;
  }


  error.textContent =
    message;

  error.hidden =
    !message;
}


function validateWizardStep(
  step,
  form,
  labels
) {

  if (
    step ===
      "identity" &&
    !String(
      formValue(
        form,
        "trainerName"
      ) ??
      ""
    ).trim()
  ) {

    return labels.enterName;
  }


  if (
    step ===
      "abilities"
  ) {

    const invalid =
      Object.keys(
        ABILITIES
      ).some(
        id =>
          !form.elements[
            `ability-${id}`
          ]?.checkValidity()
      );


    if (
      invalid
    ) {

      return labels.invalidAbilities;
    }
  }


  if (
    step ===
      "origin"
  ) {

    const originId =
      formValue(
        form,
        "originId"
      );


    if (
      originId ===
        "kantoan" &&
      checkedValues(
        form,
        "kantoAbilityIds"
      ).length !==
        2
    ) {

      return labels.chooseTwo;
    }


    if (
      originId ===
        "unovan" &&
      checkedValues(
        form,
        "unovanExtraSkillIds"
      ).length !==
        2
    ) {

      return labels.chooseTwo;
    }
  }


  if (
    step ===
      "skills" &&
    checkedValues(
      form,
      "classSkillIds"
    ).length !==
      2
  ) {

    return labels.chooseTwo;
  }


  if (
    step ===
      "path" &&
    Number(
      formValue(
        form,
        "trainerLevel"
      )
    ) >=
      2 &&
    !formValue(
      form,
      "pathId"
    )
  ) {

    return labels.choosePath;
  }


  if (
    step ===
      "path-options" &&
    formValue(
      form,
      "pathId"
    ) ===
      "hobbyist"
  ) {

    if (
      formValue(
        form,
        "hobbyistSpecializationId"
      ) ===
      formValue(
        form,
        "specializationId"
      )
    ) {

      return labels.hobbyistDifferent;
    }


    if (
      checkedValues(
        form,
        "hobbyistSkillIds"
      ).length !==
        2
    ) {

      return labels.chooseTwo;
    }
  }


  return "";
}


function syncLimitedGroup(
  root,
  group,
  labels
) {

  const limit =
    Number(
      group.dataset.limit ??
      0
    );

  const name =
    group.dataset
      .limitedGroup;


  if (
    !name ||
    limit <= 0
  ) {

    return;
  }


  const inputs =
    [
      ...group.querySelectorAll(
        `input[name="${name}"]`
      )
    ];


  const checked =
    inputs.filter(
      input =>
        input.checked
    );


  for (
    const input
    of inputs
  ) {

    const ruleLocked =
      input.dataset
        .ruleLocked ===
      "true";


    const limitLocked =
      !input.checked &&
      checked.length >=
        limit;


    const locked =
      ruleLocked ||
      limitLocked;


    input.disabled =
      locked;


    const chip =
      input.closest(
        ".poke5e-trainer-create__skill-chip"
      );


    if (!chip) {
      continue;
    }


    chip.classList.toggle(
      "is-locked",
      locked
    );


    chip.classList.toggle(
      "is-rule-locked",
      ruleLocked
    );


    chip.classList.toggle(
      "is-limit-locked",
      !ruleLocked &&
      limitLocked
    );


    if (
      ruleLocked
    ) {

      chip.title =
        labels.alreadyProficient;

    } else if (
      limitLocked
    ) {

      chip.title =
        labels.selectionLimitReached;

    } else {

      chip.title =
        "";
    }
  }


  const counter =
    root.querySelector(
      `[data-selection-count="${name}"]`
    );


  if (
    counter
  ) {

    counter.textContent =
      `${checked.length}/${limit}`;
  }
}


function syncLimitedGroups(
  root,
  labels
) {

  for (
    const group
    of root.querySelectorAll(
      "[data-limited-group]"
    )
  ) {

    syncLimitedGroup(
      root,
      group,
      labels
    );
  }
}


function syncConditionalPanels(
  root,
  form,
  labels
) {

  const originId =
    formValue(
      form,
      "originId"
    );

  const specializationId =
    formValue(
      form,
      "specializationId"
    );

  const pathId =
    formValue(
      form,
      "pathId"
    );


  for (
    const panel
    of root.querySelectorAll(
      "[data-origin-detail]"
    )
  ) {

    panel.hidden =
      panel.dataset
        .originDetail !==
      originId;
  }


  for (
    const panel
    of root.querySelectorAll(
      "[data-specialization-detail]"
    )
  ) {

    panel.hidden =
      panel.dataset
        .specializationDetail !==
      specializationId;
  }


  for (
    const panel
    of root.querySelectorAll(
      "[data-path-detail]"
    )
  ) {

    panel.hidden =
      panel.dataset
        .pathDetail !==
      pathId;
  }


  const hobbyistSelect =
    form.elements[
      "hobbyistSpecializationId"
    ];


  if (!hobbyistSelect) {
    return;
  }

  syncHobbyistSkillChoices(
    root,
    form
  );

  for (
    const option
    of hobbyistSelect.options
  ) {

    option.disabled =
      option.value ===
      specializationId;
  }


  if (
    hobbyistSelect.value ===
      specializationId
  ) {

    const replacement =
      [
        ...hobbyistSelect.options
      ].find(
        option =>
          !option.disabled
      );


    if (
      replacement
    ) {

      hobbyistSelect.value =
        replacement.value;
    }
  }
}

function hobbyistExistingSkillIds(
  form
) {

  const origin =
    TRAINER_ORIGINS[
      formValue(
        form,
        "originId"
      )
    ];


  const ids =
    new Set([
      /*
       * Trainer Class siempre concede
       * Animal Handling.
       */
      "ani",

      ...checkedValues(
        form,
        "classSkillIds"
      ),

      ...(
        origin
          ?.skillProficiencies ??
        []
      )
    ]);


  /*
   * Unovan agrega sus dos Skills
   * antes de que Hobbyist valide
   * las nuevas proficiencies.
   */
  if (
    origin?.id ===
      "unovan"
  ) {

    for (
      const id
      of checkedValues(
        form,
        "unovanExtraSkillIds"
      )
    ) {

      ids.add(
        id
      );
    }
  }


  return ids;
}


function syncHobbyistSkillChoices(
  root,
  form
) {

  const existing =
    hobbyistExistingSkillIds(
      form
    );


  for (
    const input
    of root.querySelectorAll(
      'input[name="hobbyistSkillIds"]'
    )
  ) {

    const unavailable =
      existing.has(
        input.value
      );


    /*
     * Si una elección anterior deja
     * de ser válida al cambiar Origin
     * o Trainer Skills, la retiramos.
     */

    if (
      unavailable &&
      input.checked
    ) {

      input.checked =
        false;
    }


    /*
     * No escribimos disabled aquí.
     *
     * Registramos la causa y dejamos
     * que syncLimitedGroup combine
     * todos los motivos de bloqueo.
     */

    input.dataset.ruleLocked =
      unavailable
        ? "true"
        : "false";
  }
}

function summaryRow(
  label,
  value
) {

  if (
    value == null ||
    value === ""
  ) {

    return "";
  }


  return `
    <div>

      <dt>
        ${escapeHtml(label)}
      </dt>

      <dd>
        ${escapeHtml(value)}
      </dd>

    </div>
  `;
}


function baseAbilitySummary(
  form
) {

  return Object.entries(
    ABILITIES
  )
    .map(
      (
        [
          id,
          label
        ]
      ) =>
        `${label} ${
          formValue(
            form,
            `ability-${id}`
          )
        }`
    )
    .join(" · ");
}


function specializationSummary(
  specialization,
  language
) {

  if (!specialization) {
    return "";
  }


  return `${
    localizedName(
      specialization,
      language
    )
  } — ${
    localizedType(
      specialization.type,
      language
    )
  }`;
}


function skillSelectionSummary(
  form,
  name,
  language
) {

  return checkedValues(
    form,
    name
  )
    .map(
      id =>
        localizedSkill(
          id,
          language
        )
    )
    .join(", ");
}


function originSummaryRows(
  form,
  origin,
  labels,
  language
) {

  if (!origin) {
    return "";
  }


  if (
    origin.id ===
      "galarian"
  ) {

    const pattern =
      formValue(
        form,
        "galarianPattern"
      );


    const value =
      pattern ===
        "dex2-str1"
        ? "DEX +2 / STR +1"
        : "STR +2 / DEX +1";


    return summaryRow(
      labels.galarianSummary,
      value
    );
  }


  if (
    origin.id ===
      "hoennian"
  ) {

    const environment =
      formValue(
        form,
        "hoennEnvironment"
      );


    return summaryRow(
      labels.environmentSummary,
      ENVIRONMENT_LABELS[
        language
      ]?.[environment] ??
      environment ??
      labels.noSelection
    );
  }


  if (
    origin.id ===
      "kantoan"
  ) {

    const abilities =
      checkedValues(
        form,
        "kantoAbilityIds"
      )
        .map(
          id =>
            ABILITIES[
              id
            ] ??
            id
        )
        .join(", ");


    const feat =
      String(
        formValue(
          form,
          "kantoFeatName"
        ) ??
        ""
      ).trim();


    return [
      summaryRow(
        labels.abilityChoicesSummary,
        abilities ||
          labels.noSelection
      ),

      summaryRow(
        labels.featSummary,
        feat ||
          labels.noSelection
      )
    ].join("");
  }


  if (
    origin.id ===
      "unovan"
  ) {

    return summaryRow(
      labels.unovanSkillsSummary,
      skillSelectionSummary(
        form,
        "unovanExtraSkillIds",
        language
      ) ||
      labels.noSelection
    );
  }


  return "";
}


function hobbyistSummaryRows(
  form,
  path,
  labels,
  language
) {

  if (
    path?.id !==
      "hobbyist"
  ) {

    return "";
  }


  const specialization =
    TRAINER_SPECIALIZATIONS[
      formValue(
        form,
        "hobbyistSpecializationId"
      )
    ];


  return [
    summaryRow(
      labels.hobbyistSpecializationSummary,
      specializationSummary(
        specialization,
        language
      ) ||
      labels.noSelection
    ),

    summaryRow(
      labels.hobbyistSkillsSummary,
      skillSelectionSummary(
        form,
        "hobbyistSkillIds",
        language
      ) ||
      labels.noSelection
    )
  ].join("");
}


function summaryMarkup(
  form,
  labels,
  language
) {

  const level =
    Number(
      formValue(
        form,
        "trainerLevel"
      )
    );

  const origin =
    TRAINER_ORIGINS[
      formValue(
        form,
        "originId"
      )
    ];

  const primarySpecialization =
    TRAINER_SPECIALIZATIONS[
      formValue(
        form,
        "specializationId"
      )
    ];

  const path =
    level >= 2
      ? TRAINER_PATHS[
          formValue(
            form,
            "pathId"
          )
        ]
      : null;


  const limits =
    getTrainerProgressionLimits({
      level,

      pathId:
        path?.id ??
        null
    });


  const trainerSkills =
    skillSelectionSummary(
      form,
      "classSkillIds",
      language
    );


  return `
    <article class="poke5e-trainer-create__summary-card">

      <header>

        <div>

          <span>
            ${labels.heading}
          </span>

          <h3>
            ${escapeHtml(
              String(
                formValue(
                  form,
                  "trainerName"
                ) ??
                ""
              ).trim()
            )}
            — ${labels.level} ${level}
          </h3>

        </div>

        <i
          class="fa-solid fa-circle-check"
          aria-hidden="true"
        ></i>

      </header>


      <dl>

        ${summaryRow(
          labels.baseAbilitiesSummary,
          baseAbilitySummary(
            form
          )
        )}


        ${summaryRow(
          labels.originSummary,
          localizedName(
            origin,
            language
          )
        )}


        ${originSummaryRows(
          form,
          origin,
          labels,
          language
        )}


        ${summaryRow(
          labels.specializationSummary,
          specializationSummary(
            primarySpecialization,
            language
          )
        )}


        ${summaryRow(
          labels.skillsSummary,
          trainerSkills ||
            labels.noSelection
        )}


        ${summaryRow(
          labels.pathSummary,
          path
            ? localizedName(
                path,
                language
              )
            : labels.noPath
        )}


        ${hobbyistSummaryRows(
          form,
          path,
          labels,
          language
        )}

      </dl>


      <div class="poke5e-trainer-create__summary-limits">

        <span>

          <small>
            ${labels.maxSr}
          </small>

          <strong>
            ${limits.maxSr}
          </strong>

        </span>


        <span>

          <small>
            ${labels.pokeslots}
          </small>

          <strong>
            ${limits.pokeslots}
          </strong>

        </span>

      </div>

    </article>
  `;
}


function syncWizard(
  root,
  form,
  labels,
  language
) {

  syncConditionalPanels(
    root,
    form,
    labels
  );

  syncLimitedGroups(
    root,
    labels
  );


  const steps =
    activeWizardSteps(
      form
    );

  let current =
    root.dataset
      .currentStep;


  if (
    !steps.includes(
      current
    )
  ) {

    current =
      steps[0];

    root.dataset.currentStep =
      current;
  }


  const index =
    steps.indexOf(
      current
    );


  for (
    const section
    of root.querySelectorAll(
      "[data-wizard-step]"
    )
  ) {

    section.hidden =
      section.dataset
        .wizardStep !==
      current;
  }


  for (
    const marker
    of root.querySelectorAll(
      "[data-step-marker]"
    )
  ) {

    const markerStep =
      marker.dataset
        .stepMarker;

    const markerIndex =
      steps.indexOf(
        markerStep
      );


    marker.hidden =
      markerIndex <
      0;


    marker.classList.toggle(
      "is-active",
      markerStep ===
      current
    );


    marker.classList.toggle(
      "is-complete",
      markerIndex >= 0 &&
      markerIndex <
      index
    );


    const number =
      marker.querySelector(
        "b"
      );


    if (
      number &&
      markerIndex >= 0
    ) {

      number.textContent =
        String(
          markerIndex +
          1
        );
    }
  }


  const back =
    root.querySelector(
      '[data-wizard-action="back"]'
    );

  const next =
    root.querySelector(
      '[data-wizard-action="next"]'
    );

  const progress =
    root.querySelector(
      "[data-wizard-progress]"
    );


  if (
    back
  ) {

    back.disabled =
      index === 0;
  }


  if (
    next
  ) {

    next.hidden =
      current ===
      "summary";
  }


  if (
    progress
  ) {

    progress.textContent =
      `${index + 1}/${steps.length}`;
  }


  if (
    current ===
      "summary"
  ) {

    const summary =
      root.querySelector(
        "[data-trainer-summary]"
      );


    if (
      summary
    ) {

      summary.innerHTML =
        summaryMarkup(
          form,
          labels,
          language
        );
    }
  }


  form.dataset
    .wizardComplete =
    current ===
      "summary"
      ? "true"
      : "false";


  showWizardError(
    root,
    ""
  );
}


function moveWizard(
  root,
  form,
  labels,
  language,
  direction
) {

  const steps =
    activeWizardSteps(
      form
    );

  const current =
    root.dataset
      .currentStep;

  const index =
    Math.max(
      0,
      steps.indexOf(
        current
      )
    );


  if (
    direction >
    0
  ) {

    const error =
      validateWizardStep(
        current,
        form,
        labels
      );


    if (
      error
    ) {

      showWizardError(
        root,
        error
      );

      return;
    }
  }


  const nextIndex =
    Math.max(
      0,
      Math.min(
        steps.length -
        1,
        index +
        direction
      )
    );


  root.dataset.currentStep =
    steps[
      nextIndex
    ];


  syncWizard(
    root,
    form,
    labels,
    language
  );
}


function activateTrainerCreateWizard(
  dialog,
  labels,
  language
) {

  const form =
    dialog.form ??
    dialog.element
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
      "[data-trainer-create-wizard]"
    );


  if (
    !root ||
    root.dataset
      .wizardReady ===
      "true"
  ) {

    return;
  }


  root.dataset.wizardReady =
    "true";


  form.classList.add(
    "poke5e-trainer-create-form"
  );


  const backButton =
    root.querySelector(
      '[data-wizard-action="back"]'
    );


  const nextButton =
    root.querySelector(
      '[data-wizard-action="next"]'
    );


  backButton?.addEventListener(
    "click",
    event => {

      event.preventDefault();
      event.stopPropagation();


      moveWizard(
        root,
        form,
        labels,
        language,
        -1
      );
    }
  );


  nextButton?.addEventListener(
    "click",
    event => {

      event.preventDefault();
      event.stopPropagation();


      moveWizard(
        root,
        form,
        labels,
        language,
        1
      );
    }
  );


  form.addEventListener(
    "change",
    () => {

      syncWizard(
        root,
        form,
        labels,
        language
      );
    }
  );


  /*
   * Enter funciona igual que Next
   * mientras todavía no llegamos
   * al resumen final.
   */

  form.addEventListener(
    "submit",
    event => {

      if (
        form.dataset
          .wizardComplete ===
          "true"
      ) {

        return;
      }


      event.preventDefault();
      event.stopImmediatePropagation();


      moveWizard(
        root,
        form,
        labels,
        language,
        1
      );
    },

    true
  );


  syncWizard(
    root,
    form,
    labels,
    language
  );
}


export async function openTrainerCreateDialog() {

  if (
    !game.user.isGM
  ) {

    return null;
  }


  const language =
    getLanguage();

  const labels =
    LABELS[
      language
    ];


  const result =
    await foundry.applications.api
      .DialogV2.prompt({

        classes: [
          "poke5e-trainer-dialog",
          "poke5e-trainer-create-dialog"
        ],

        position: {
          width:
            860
        },

        window: {
          title:
            labels.title
        },

        content:
          buildDialogContent(
            labels,
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


            activateTrainerCreateWizard(
              dialog,
              labels,
              language
            );
          },

        ok: {
          label:
            labels.create,

          callback:
            (
              event,
              button
            ) => {

              if (
                !(event instanceof
                  Event)
              ) {

                return null;
              }


              return {
                name:
                  String(
                    formValue(
                      button.form,
                      "trainerName"
                    ) ??
                    ""
                  ).trim(),

                progression:
                  progressionFromForm(
                    button.form
                  )
              };
            }
        }
      });


  if (
    !result?.name
  ) {

    return null;
  }


  try {

    const trainer =
      await createTrainer({
        name:
          result.name,

        folderName:
          labels.folder,

        progression:
          result.progression
      });


    ui.notifications.info(
      labels.created(
        trainer.name
      )
    );


    return trainer;

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error creando Trainer`,
      error
    );


    ui.notifications.error(
      error?.message ??
      labels.error
    );


    return null;
  }
}