const SKILL_OPTIONS = [
  {
    id: "acrobatics",
    es: "Acrobacias",
    en: "Acrobatics"
  },
  {
    id: "animal-handling",
    es: "Trato con Animales",
    en: "Animal Handling"
  },
  {
    id: "arcana",
    es: "Arcana",
    en: "Arcana"
  },
  {
    id: "athletics",
    es: "Atletismo",
    en: "Athletics"
  },
  {
    id: "deception",
    es: "Engaño",
    en: "Deception"
  },
  {
    id: "history",
    es: "Historia",
    en: "History"
  },
  {
    id: "insight",
    es: "Perspicacia",
    en: "Insight"
  },
  {
    id: "intimidation",
    es: "Intimidación",
    en: "Intimidation"
  },
  {
    id: "investigation",
    es: "Investigación",
    en: "Investigation"
  },
  {
    id: "medicine",
    es: "Medicina",
    en: "Medicine"
  },
  {
    id: "nature",
    es: "Naturaleza",
    en: "Nature"
  },
  {
    id: "perception",
    es: "Percepción",
    en: "Perception"
  },
  {
    id: "performance",
    es: "Interpretación",
    en: "Performance"
  },
  {
    id: "persuasion",
    es: "Persuasión",
    en: "Persuasion"
  },
  {
    id: "religion",
    es: "Religión",
    en: "Religion"
  },
  {
    id: "sleight-of-hand",
    es: "Juego de Manos",
    en: "Sleight of Hand"
  },
  {
    id: "stealth",
    es: "Sigilo",
    en: "Stealth"
  },
  {
    id: "survival",
    es: "Supervivencia",
    en: "Survival"
  }
];

const SAVING_THROW_OPTIONS = [
  {
    id: "str",
    short: "STR",
    es: "Fuerza",
    en: "Strength"
  },
  {
    id: "dex",
    short: "DEX",
    es: "Destreza",
    en: "Dexterity"
  },
  {
    id: "con",
    short: "CON",
    es: "Constitución",
    en: "Constitution"
  },
  {
    id: "int",
    short: "INT",
    es: "Inteligencia",
    en: "Intelligence"
  },
  {
    id: "wis",
    short: "WIS",
    es: "Sabiduría",
    en: "Wisdom"
  },
  {
    id: "cha",
    short: "CHA",
    es: "Carisma",
    en: "Charisma"
  }
];

const MOVEMENT_OPTIONS = [
  {
    id: "walking",
    es: "Terrestre",
    en: "Walking"
  },
  {
    id: "flying",
    es: "Vuelo",
    en: "Flying"
  },
  {
    id: "swimming",
    es: "Nado",
    en: "Swimming"
  },
  {
    id: "climbing",
    es: "Escalada",
    en: "Climbing"
  },
  {
    id: "burrowing",
    es: "Excavación",
    en: "Burrowing"
  },
  {
    id: "hover",
    es: "Levitación",
    en: "Hover"
  }
];

const SENSE_OPTIONS = [
  "darkvision",
  "blindsight",
  "tremorsense",
  "truesight"
];


export function renderFakemonStatsDatalists(
  language
) {

  return `
    <datalist id="fakemon-studio-movement-types">
      ${
        MOVEMENT_OPTIONS
          .map(
            option => `
              <option value="${escapeAttribute(
                option.id
              )}">
                ${escapeHtml(
                  localizedLabel(
                    option,
                    language
                  )
                )}
              </option>
            `
          )
          .join("")
      }
    </datalist>

    <datalist id="fakemon-studio-sense-types">
      ${
        SENSE_OPTIONS
          .map(
            sense => `
              <option value="${escapeAttribute(
                sense
              )}">
                ${escapeHtml(
                  sense
                )}
              </option>
            `
          )
          .join("")
      }
    </datalist>
  `;
}


export function renderFakemonProficiencies({
  skills,
  savingThrows,
  language
}) {

  const normalizedSkills =
    normalizeIds(
      skills
    );

  const knownSkillIds =
    new Set(
      SKILL_OPTIONS.map(
        skill =>
          skill.id
      )
    );

  const selectedSkills =
    new Set(
      normalizedSkills.filter(
        skillId =>
          knownSkillIds.has(
            skillId
          )
      )
    );

  const customSkills =
    normalizedSkills.filter(
      skillId =>
        !knownSkillIds.has(
          skillId
        )
    );

  const selectedSaves =
    new Set(
      normalizeIds(
        savingThrows
      )
    );


  return `
    <div class="fakemon-studio__proficiency-grid">

      <section class="fakemon-studio__proficiency-group">

        <div class="fakemon-studio__proficiency-header">

          <div>
            <i class="fa-solid fa-list-check"></i>

            <strong>
              Skills
            </strong>
          </div>

          <span>
            ${selectedSkills.size}
          </span>

        </div>


        <div
          class="
            fakemon-studio__choice-grid
            fakemon-studio__choice-grid--skills
          "
        >

          ${
            SKILL_OPTIONS
              .map(
                skill =>
                  renderChoice({
                    role:
                      "skill-choice",

                    value:
                      skill.id,

                    shortLabel:
                      localizedLabel(
                        skill,
                        language
                      ),

                    detail:
                      skill.id,

                    checked:
                      selectedSkills.has(
                        skill.id
                      )
                  })
              )
              .join("")
          }

        </div>


        <label class="fakemon-studio__proficiency-extra">

          <span>
            Otros IDs
          </span>

          <input
            type="text"
            data-role="skills-extra"
            value="${escapeAttribute(
              customSkills.join(
                ", "
              )
            )}"
            placeholder="Opcional"
          >

          <small>
            Conserva IDs no estándar sin perder datos existentes.
          </small>

        </label>

      </section>


      <section class="fakemon-studio__proficiency-group">

        <div class="fakemon-studio__proficiency-header">

          <div>
            <i class="fa-solid fa-shield"></i>

            <strong>
              Saving Throws
            </strong>
          </div>

          <span>
            ${selectedSaves.size}
          </span>

        </div>


        <div
          class="
            fakemon-studio__choice-grid
            fakemon-studio__choice-grid--saves
          "
        >

          ${
            SAVING_THROW_OPTIONS
              .map(
                save =>
                  renderChoice({
                    role:
                      "saving-throw-choice",

                    value:
                      save.id,

                    shortLabel:
                      save.short,

                    detail:
                      localizedLabel(
                        save,
                        language
                      ),

                    checked:
                      selectedSaves.has(
                        save.id
                      )
                  })
              )
              .join("")
          }

        </div>

      </section>

    </div>
  `;
}


export function renderFakemonSpeedRow(
  row,
  index
) {

  return `
    <div
      class="
        fakemon-studio__collection-row
        fakemon-studio__collection-row--speed
      "
      data-role="speed-row"
    >

      <input
        type="text"
        data-field="type"
        list="fakemon-studio-movement-types"
        placeholder="walking"
        value="${escapeAttribute(
          row.type ??
          "walking"
        )}"
        aria-label="Tipo de movimiento"
      >


      <input
        type="number"
        data-field="value"
        min="0"
        step="1"
        value="${escapeAttribute(
          row.value ??
          0
        )}"
        aria-label="Velocidad"
      >


      <select
        data-field="unit"
        aria-label="Unidad de movimiento"
      >
        <option
          value="ft"
          ${
            (
              row.unit ??
              "ft"
            ) === "ft"
              ? "selected"
              : ""
          }
        >
          ft
        </option>
      </select>


      ${renderRemoveButton(
        "remove-speed",
        index
      )}

    </div>
  `;
}


export function renderFakemonSenseRow(
  row,
  index
) {

  return `
    <div
      class="
        fakemon-studio__collection-row
        fakemon-studio__collection-row--sense
      "
      data-role="sense-row"
    >

      <input
        type="text"
        data-field="type"
        list="fakemon-studio-sense-types"
        placeholder="darkvision"
        value="${escapeAttribute(
          row.type ??
          ""
        )}"
        aria-label="Tipo de sentido"
      >


      <input
        type="number"
        data-field="value"
        min="0"
        step="1"
        value="${escapeAttribute(
          row.value ??
          0
        )}"
        aria-label="Alcance del sentido"
      >


      ${renderRemoveButton(
        "remove-sense",
        index
      )}

    </div>
  `;
}


function renderChoice({
  role,
  value,
  shortLabel,
  detail,
  checked
}) {

  return `
    <label class="fakemon-studio__choice">

      <input
        type="checkbox"
        data-role="${escapeAttribute(
          role
        )}"
        value="${escapeAttribute(
          value
        )}"
        ${checked ? "checked" : ""}
      >

      <span class="fakemon-studio__choice-copy">

        <strong>
          ${escapeHtml(
            shortLabel
          )}
        </strong>

        <small>
          ${escapeHtml(
            detail
          )}
        </small>

      </span>

    </label>
  `;
}


function renderRemoveButton(
  action,
  index
) {

  return `
    <button
      type="button"
      class="fakemon-studio__remove"
      data-action="${escapeAttribute(
        action
      )}"
      data-index="${index}"
      title="Eliminar"
      aria-label="Eliminar"
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
}


function normalizeIds(
  values
) {

  return (
    Array.isArray(
      values
    )
      ? values
      : []
  )
    .map(
      value =>
        String(
          value ??
          ""
        )
          .trim()
          .toLowerCase()
    )
    .filter(
      Boolean
    );
}


function localizedLabel(
  definition,
  language
) {

  return String(
    definition?.[language] ??
    definition?.en ??
    definition?.es ??
    definition?.id ??
    ""
  );
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