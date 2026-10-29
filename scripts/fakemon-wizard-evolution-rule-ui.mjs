import { escapeHtml } from "./html.mjs";
import {
  FAKEMON_EVOLUTION_ABILITY_SCORE_MODES,
  FAKEMON_EVOLUTION_CONDITION_TYPES
} from "./fakemon-model.mjs";

import {
  POKEMON_TYPE_IDS
} from "./types.mjs";


const {
  DialogV2
} =
  foundry.applications.api;


const CONDITION_LABELS =
  Object.freeze({
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
  });


const CONDITION_PLACEHOLDERS =
  Object.freeze({
    level:
      "10",

    gender:
      "female",

    move:
      "dragon-pulse",

    "move-type":
      "dragon",

    item:
      "ice-stone",

    loyalty:
      "2",

    time:
      "night",

    special:
      "team-rocket-experiment"
  });


export async function promptFakemonWizardEvolutionRuleStep({
  database,
  initialValue,
  language = "es"
}) {

  let current =
    cloneRule(
      initialValue
    );


  while (true) {

    const result =
      await DialogV2.wait({
        classes: [
          "poke5e-fakemon-wizard-dialog"
        ],

        window: {
          title:
            language === "en"
              ? "Fakemon Wizard · Evolution Requirements"
              : "Fakemon Wizard · Requisitos de Evolution"
        },

        position: {
          width:
            820
        },

        content:
          renderEvolutionRuleStep({
            database,
            value:
              current,
            language
          }),

        buttons:
          buildButtons(
            current,
            language
          ),

        rejectClose:
          false,

        modal:
          true
      });


    if (!result) {
      return null;
    }


    current =
      cloneRule(
        result.value
      );


    if (
      result.action ===
        "back"
    ) {

      return {
        action:
          "back",

        value:
          current
      };
    }


    if (
      result.action ===
        "add-condition"
    ) {

      current.conditions.push({
        type:
          "level",

        value:
          1
      });

      continue;
    }


    if (
      result.action ===
        "remove-condition"
    ) {

      current.conditions.pop();

      continue;
    }


    const validation =
      validateEvolutionRule({
        rule:
          current,

        database,
        language
      });


    if (
      validation.ok
    ) {

      return {
        action:
          "next",

        value:
          current
      };
    }


    ui.notifications.warn(
      validation.message
    );
  }
}


function buildButtons(
  current,
  language
) {

  const capture =
    action =>
      (...args) => ({
        action,

        value:
          readEvolutionRuleForm(
            args[1].form,
            current
          )
      });


  const buttons = [
    {
      action:
        "back",

      label:
        language === "en"
          ? "Back to Moves & Abilities"
          : "Volver a Moves & Abilities",

      callback:
        capture(
          "back"
        )
    }
  ];


  if (
    current.conditions.length >
      1
  ) {

    buttons.push({
      action:
        "remove-condition",

      label:
        language === "en"
          ? "Remove last condition"
          : "Quitar última condición",

      callback:
        capture(
          "remove-condition"
        )
    });
  }


  buttons.push(
    {
      action:
        "add-condition",

      label:
        language === "en"
          ? "Add condition"
          : "Agregar condición",

      callback:
        capture(
          "add-condition"
        )
    },

    {
      action:
        "next",

      label:
        language === "en"
          ? "Continue to review"
          : "Continuar a revisión",

      default:
        true,

      callback:
        capture(
          "next"
        )
    }
  );


  return buttons;
}


function renderEvolutionRuleStep({
  database,
  value,
  language
}) {

  const tradeoff =
    value.abilityScoreMode ===
      "tradeoff";


  return `
    <div class="fakemon-wizard fakemon-wizard--evolution-rule">

      <div class="fakemon-wizard__intro">

        <i class="fa-solid fa-code-branch"></i>

        <div>

          <strong>
            ${
              language === "en"
                ? "Evolution requirements"
                : "Requisitos de Evolution"
            }
          </strong>

          <span>
            ${
              language === "en"
                ? "Define the conditions, Evolution Points and Ability Score policy for the pending source → Fakemon relationship."
                : "Define las condiciones, Evolution Points y política de Ability Scores para la relación pendiente origen → Fakemon."
            }
          </span>

        </div>

      </div>


      <div class="fakemon-wizard__evolution-rule-grid">

        <label class="fakemon-wizard__field">

          <span>
            Evolution Points
          </span>

          <input
            type="number"
            name="evolutionPoints"
            min="0"
            step="1"
            value="${escapeHtml(
              value.evolutionPoints
            )}"
          >

          <small>
            ${
              language === "en"
                ? "The initial value is estimated from comparable Poke5e Evolutions."
                : "El valor inicial se estima desde Evolutions Poke5e comparables."
            }
          </small>

        </label>


        <label class="fakemon-wizard__field">

          <span>
            Ability Score Mode
          </span>

          <select name="abilityScoreMode">
            ${renderModeOptions(
              value.abilityScoreMode,
              language
            )}
          </select>

          <small>
            ${
              language === "en"
                ? "Tradeoff is a custom campaign rule, not standard Poke5e."
                : "Tradeoff es una regla custom de campaña, no Poke5e estándar."
            }
          </small>

        </label>

      </div>


      <div class="fakemon-wizard__evolution-rule-note">

        <i class="fa-solid fa-scale-balanced"></i>

        <span>
          ${
            tradeoff
              ? (
                  language === "en"
                    ? "Tradeoff: -4 to +4 per Ability Score, final maximum 24. Every newly created point above 20 requires one sacrificed point elsewhere."
                    : "Tradeoff: -4 a +4 por Ability Score, máximo final 24. Cada punto nuevo sobre 20 exige un punto sacrificado en otra característica."
                )
              : (
                  language === "en"
                    ? "Standard: only increases, maximum +4 per Ability Score and final maximum 20."
                    : "Standard: solo aumentos, máximo +4 por Ability Score y máximo final 20."
                )
          }
        </span>

      </div>


      <section class="fakemon-wizard__evolution-rule-conditions">

        <header>

          <i class="fa-solid fa-list-check"></i>

          <div>
            <strong>
              ${language === "en" ? "Conditions" : "Condiciones"}
            </strong>

            <small>
              ${value.conditions.length}
            </small>
          </div>

        </header>


        <div class="fakemon-wizard__evolution-rule-condition-list">

          ${value.conditions
            .map(
              (
                condition,
                index
              ) =>
                renderConditionRow({
                  condition,
                  index,
                  database,
                  language
                })
            )
            .join("")}

        </div>

      </section>

    </div>
  `;
}


function renderConditionRow({
  condition,
  index,
  database,
  language
}) {

  const type =
    String(
      condition?.type ??
      "level"
    );


  return `
    <div class="fakemon-wizard__evolution-rule-condition">

      <select name="condition-type-${index}">

        ${FAKEMON_EVOLUTION_CONDITION_TYPES
          .map(
            option => `
              <option
                value="${escapeHtml(option)}"
                ${option === type ? "selected" : ""}
              >
                ${escapeHtml(
                  conditionLabel(
                    option,
                    language
                  )
                )}
              </option>
            `
          )
          .join("")}

      </select>


      <input
        type="text"
        name="condition-value-${index}"
        value="${escapeHtml(
          condition?.value ??
          ""
        )}"
        placeholder="${escapeHtml(
          CONDITION_PLACEHOLDERS[
            type
          ] ??
          "value"
        )}"
      >


      <small>
        ${escapeHtml(
          conditionHint(
            type,
            database,
            language
          )
        )}
      </small>

    </div>
  `;
}


function renderModeOptions(
  selected,
  language
) {

  const labels = {
    standard:
      language === "en"
        ? "Standard Poke5e · maximum 20"
        : "Standard Poke5e · máximo 20",

    tradeoff:
      language === "en"
        ? "Tradeoff · up to 24 with sacrifices"
        : "Tradeoff · hasta 24 con sacrificios"
  };


  return FAKEMON_EVOLUTION_ABILITY_SCORE_MODES
    .map(
      mode => `
        <option
          value="${escapeHtml(mode)}"
          ${mode === selected ? "selected" : ""}
        >
          ${escapeHtml(
            labels[
              mode
            ] ??
            mode
          )}
        </option>
      `
    )
    .join("");
}


function readEvolutionRuleForm(
  form,
  previous
) {

  const fieldValue =
    name =>
      form?.elements
        ?.namedItem(
          name
        )
        ?.value ??
      "";


  return {
    evolutionPoints:
      Number(
        fieldValue(
          "evolutionPoints"
        )
      ),

    abilityScoreMode:
      String(
        fieldValue(
          "abilityScoreMode"
        ) ||
        "standard"
      ).trim(),

    conditions:
      previous.conditions.map(
        (
          condition,
          index
        ) => {

          const type =
            String(
              fieldValue(
                `condition-type-${index}`
              ) ||
              condition.type ||
              "level"
            ).trim();


          const rawValue =
            String(
              fieldValue(
                `condition-value-${index}`
              )
            ).trim();


          return {
            type,

            value:
              numericConditionValue(
                type,
                rawValue
              )
          };
        }
      )
  };
}


function validateEvolutionRule({
  rule,
  database,
  language
}) {

  if (
    !Number.isInteger(
      rule.evolutionPoints
    ) ||
    rule.evolutionPoints <
      0
  ) {

    return invalid(
      language === "en"
        ? "Evolution Points must be a non-negative integer."
        : "Evolution Points debe ser un entero no negativo."
    );
  }


  if (
    !FAKEMON_EVOLUTION_ABILITY_SCORE_MODES.includes(
      rule.abilityScoreMode
    )
  ) {

    return invalid(
      language === "en"
        ? "Choose a valid Ability Score Mode."
        : "Selecciona un Ability Score Mode válido."
    );
  }


  if (!rule.conditions.length) {

    return invalid(
      language === "en"
        ? "Add at least one Evolution condition."
        : "Agrega al menos una condición de Evolution."
    );
  }


  const moveIds =
    catalogIds(
      database?.moves
    );


  const itemIds =
    itemReferenceIds(
      database?.items
    );


  for (
    const condition
    of rule.conditions
  ) {

    const type =
      String(
        condition?.type ??
        ""
      );


    if (
      !FAKEMON_EVOLUTION_CONDITION_TYPES.includes(
        type
      )
    ) {

      return invalid(
        `${language === "en"
          ? "Unsupported Evolution condition"
          : "Condición de Evolution no soportada"}: ${type}.`
      );
    }


    if (
      condition?.value == null ||
      condition.value ===
        ""
    ) {

      return invalid(
        language === "en"
          ? `Complete the value for ${conditionLabel(type, language)}.`
          : `Completa el valor de ${conditionLabel(type, language)}.`
      );
    }


    if (
      type ===
        "level" &&
      (
        !Number.isInteger(
          condition.value
        ) ||
        condition.value <
          1 ||
        condition.value >
          20
      )
    ) {

      return invalid(
        language === "en"
          ? "Evolution level must be 1–20."
          : "El nivel de Evolution debe estar entre 1 y 20."
      );
    }


    if (
      type ===
        "loyalty" &&
      !Number.isFinite(
        Number(
          condition.value
        )
      )
    ) {

      return invalid(
        language === "en"
          ? "Loyalty must be numeric."
          : "Loyalty debe ser numérico."
      );
    }


    const canonicalValue =
      canonicalId(
        condition.value
      );


    if (
      type ===
        "gender" &&
      ![
        "male",
        "female"
      ].includes(
        canonicalValue
      )
    ) {

      return invalid(
        language === "en"
          ? `Invalid gender: ${condition.value}.`
          : `Género no válido: ${condition.value}.`
      );
    }


    if (
      type ===
        "move" &&
      !moveIds.has(
        canonicalValue
      )
    ) {

      return invalid(
        language === "en"
          ? `Unknown Move: ${condition.value}.`
          : `Move inexistente: ${condition.value}.`
      );
    }


    if (
      type ===
        "move-type" &&
      !POKEMON_TYPE_IDS.includes(
        canonicalValue
      )
    ) {

      return invalid(
        language === "en"
          ? `Invalid Move type: ${condition.value}.`
          : `Tipo de Move no válido: ${condition.value}.`
      );
    }


    if (
      type ===
        "item" &&
      !itemIds.has(
        canonicalValue
      )
    ) {

      return invalid(
        language === "en"
          ? `Unknown Evolution Item: ${condition.value}.`
          : `Item de Evolution inexistente: ${condition.value}.`
      );
    }
  }


  return {
    ok:
      true,

    message:
      ""
  };
}


function conditionHint(
  type,
  database,
  language
) {

  const counts = {
    moves:
      Array.isArray(
        database?.moves
      )
        ? database.moves.length
        : 0,

    items:
      Array.isArray(
        database?.items
      )
        ? database.items.length
        : 0
  };


  const hints = {
    level: [
      "Nivel mínimo, 1–20.",
      "Minimum level, 1–20."
    ],

    gender: [
      "Valor canónico: male o female.",
      "Canonical value: male or female."
    ],

    move: [
      `ID canónico del Move. ${counts.moves} Moves cargados.`,
      `Canonical Move ID. ${counts.moves} Moves loaded.`
    ],

    "move-type": [
      "ID canónico de tipo Pokémon.",
      "Canonical Pokémon type ID."
    ],

    item: [
      `ID canónico del Evolution Item. ${counts.items} Items cargados.`,
      `Canonical Evolution Item ID. ${counts.items} Items loaded.`
    ],

    loyalty: [
      "Valor de Loyalty usado por la Evolution; confirmación manual.",
      "Loyalty value used by the Evolution; manual confirmation."
    ],

    time: [
      "Ej.: morning, afternoon, day, night.",
      "E.g. morning, afternoon, day, night."
    ],

    special: [
      "Condición custom confirmada manualmente por el GM.",
      "Custom condition manually confirmed by the GM."
    ]
  };


  return (
    hints[
      type
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    ""
  );
}


function conditionLabel(
  type,
  language
) {

  return (
    CONDITION_LABELS[
      type
    ]?.[
      language === "en"
        ? 1
        : 0
    ] ??
    type
  );
}


function numericConditionValue(
  type,
  value
) {

  if (
    ![
      "level",
      "loyalty"
    ].includes(
      type
    )
  ) {
    return value;
  }


  return value
    ? Number(
        value
      )
    : "";
}


function cloneRule(
  value = {}
) {

  return {
    evolutionPoints:
      Number(
        value.evolutionPoints ??
        0
      ),

    abilityScoreMode:
      String(
        value.abilityScoreMode ??
        "standard"
      ),

    conditions:
      (
        Array.isArray(
          value.conditions
        )
          ? value.conditions
          : []
      ).map(
        condition => ({
          type:
            String(
              condition?.type ??
              "level"
            ),

          value:
            condition?.value ??
            ""
        })
      )
  };
}


function catalogIds(
  entries
) {

  return new Set(
    (
      Array.isArray(
        entries
      )
        ? entries
        : []
    )
      .map(
        entry =>
          canonicalId(
            entry?.id
          )
      )
      .filter(
        Boolean
      )
  );
}


function itemReferenceIds(
  entries
) {

  return new Set(
    (
      Array.isArray(
        entries
      )
        ? entries
        : []
    )
      .flatMap(
        entry => [
          canonicalId(
            entry?.id
          ),

          canonicalId(
            entry?.name
          )
        ]
      )
      .filter(
        Boolean
      )
  );
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


function invalid(
  message
) {

  return {
    ok:
      false,

    message
  };
}