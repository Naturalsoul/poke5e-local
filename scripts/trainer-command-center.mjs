import { availableTrainerPathActions, trainerPathActionLabel } from "./trainer-path-actions.mjs";
import {
  getTrainerLevel
} from "./trainer-service.mjs";

import {
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";

import {
  getTrainerOwnedPokemon,
  getTrainerPartyState,
  getTrainerPokeslotLimit
} from "./trainer-party-service.mjs";

import {
  canCurrentUserOperateTrainer
} from "./trainer-ownership-service.mjs";

import {
  getPokemonExperienceState
} from "./pokemon-experience-service.mjs";

import {
  MAX_SUPPORTED_TRAINER_LEVEL
} from "./trainer-rules.mjs";

const MODULE_ID =
  "poke5e-local";

const ROOT_CLASS =
  "poke5e-trainer-command-center";

const DEFAULT_POKEMON_ICON =
  "icons/svg/mystery-man.svg";


const LABELS = {

  es: {
    trainer: "Trainer",
    level: "Nv.",
    format: "Combate",
    single: "Single",
    double: "Double",
    active: "Activos",

    noActive:
      "Sin Pokémon desplegados",

    noActiveHint:
      "Despliega un Pokémon de la Party para comenzar.",

    party: "Party",
    pc: "PC",

    emptyPc:
      "No hay Pokémon guardados en el PC.",

    deploy: "Desplegar",
    recall: "Retirar",
    switch: "Cambiar",

    switchCancel:
      "Cancelar cambio",

    switchIncoming:
      "Entrar",

    toPc: "Al PC",
    toParty: "A Party",
    activeBadge: "Activo",

    openPokemonSheet:
      "Abrir ficha",

    switchMode:
      name =>
        `Cambiando a ${name}: elige el Pokémon que entrará.`,

    hp: "HP",
    ac: "AC",

    noStatuses:
      "Sin estados",

    fainted:
      "Debilitado",

    moves:
      "Moves",

    pp:
      "PP",

    use:
      "Usar",

    noMoves:
      "Sin Moves conocidos",

    noActivity:
      "Sin actividad utilizable",

    attack:
      "Ataque",

    save:
      "Salvación",

    damage:
      "Daño",

    utility:
      "Usar",
    
    activeSlot:
      "Slot activo disponible",

    trainerLevelUp:
      "Subir Trainer",

    pokemonLevelUp:
      "Subir nivel",

    pokemonLevelUpLocked:
      remaining =>
        `Faltan ${remaining} XP para subir de nivel`,

    melee:
      "Cuerpo a cuerpo",

    ranged:
      "A distancia",
  },


  en: {
    trainer: "Trainer",
    level: "Lv.",
    format: "Battle",
    single: "Single",
    double: "Double",
    active: "Active",

    noActive:
      "No Pokémon deployed",

    noActiveHint:
      "Deploy a Party Pokémon to begin.",

    party: "Party",
    pc: "PC",

    emptyPc:
      "There are no Pokémon stored in the PC.",

    deploy: "Deploy",
    recall: "Recall",
    switch: "Switch",

    switchCancel:
      "Cancel switch",

    switchIncoming:
      "Switch in",

    toPc: "To PC",
    toParty: "To Party",
    activeBadge: "Active",

    openPokemonSheet:
      "Open sheet",

    switchMode:
      name =>
        `Switching ${name}: choose the incoming Pokémon.`,

    hp: "HP",
    ac: "AC",

    noStatuses:
      "No conditions",

    fainted:
      "Fainted",

    moves:
      "Moves",

    pp:
      "PP",

    use:
      "Use",

    noMoves:
      "No known Moves",

    noActivity:
      "No usable activity",

    attack:
      "Attack",

    save:
      "Save",

    damage:
      "Damage",

    utility:
      "Use",

    activeSlot:
      "Available active slot",

    trainerLevelUp:
      "Level Up Trainer",

    pokemonLevelUp:
      "Level Up",

    pokemonLevelUpLocked:
      remaining =>
        `${remaining} XP remaining to level up`,

    melee:
      "Melee",

    ranged:
      "Ranged",
  }
};

const TYPE_LABELS = {

  es: {
    normal: "Normal",
    fire: "Fuego",
    water: "Agua",
    electric: "Eléctrico",
    grass: "Planta",
    ice: "Hielo",
    fighting: "Lucha",
    poison: "Veneno",
    ground: "Tierra",
    flying: "Volador",
    psychic: "Psíquico",
    bug: "Bicho",
    rock: "Roca",
    ghost: "Fantasma",
    dragon: "Dragón",
    dark: "Siniestro",
    steel: "Acero",
    fairy: "Hada",
    typeless: "Sin tipo"
  },


  en: {
    normal: "Normal",
    fire: "Fire",
    water: "Water",
    electric: "Electric",
    grass: "Grass",
    ice: "Ice",
    fighting: "Fighting",
    poison: "Poison",
    ground: "Ground",
    flying: "Flying",
    psychic: "Psychic",
    bug: "Bug",
    rock: "Rock",
    ghost: "Ghost",
    dragon: "Dragon",
    dark: "Dark",
    steel: "Steel",
    fairy: "Fairy",
    typeless: "Typeless"
  }
};

const RESOURCE_LABELS =
  Object.freeze({

    es:
      Object.freeze({

        researcherUses:
          "Researcher",

        shadowPoints:
          "Shadow Points",

        tacticalPoints:
          "Tactical Points",

        masterTrainerUses:
          "Master Trainer",
        skillDice:
          "Skill Dice",
        cheerleaderUses:
          "Cheerleader"
      }),
    en:
      Object.freeze({

        researcherUses:
          "Researcher",

        shadowPoints:
          "Shadow Points",

        tacticalPoints:
          "Tactical Points",

        masterTrainerUses:
          "Master Trainer",
        skillDice:
          "Skill Dice",
        cheerleaderUses:
          "Cheerleader"
      })
  });

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
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


function pokemonFromUuid(
  uuid
) {

  return (
    game.actors.find(
      actor =>
        actor.uuid ===
        uuid
    ) ??
    null
  );
}


function getTrainerView(
  trainer
) {

  const state =
    getTrainerPartyState(
      trainer
    );

  const partyUuidSet =
    new Set(
      state.pokemonUuids
    );

  const activeUuidSet =
    new Set(
      state.activePokemonUuids
    );

  const partyPokemon =
    state.pokemonUuids
      .map(
        pokemonFromUuid
      )
      .filter(Boolean);

  const activePokemon =
    state.activePokemonUuids
      .map(
        pokemonFromUuid
      )
      .filter(Boolean);

  const pcPokemon =
    getTrainerOwnedPokemon(
      trainer
    )
      .filter(
        pokemon =>
          !partyUuidSet.has(
            pokemon.uuid
          )
      )
      .sort(
        (
          left,
          right
        ) =>
          left.name.localeCompare(
            right.name
          )
      );

  return {
    state,
    activeUuidSet,
    partyPokemon,
    activePokemon,
    pcPokemon,

    pokeslotLimit:
      getTrainerPokeslotLimit(
        trainer
      )
  };
}

/* ============================================================
 * TRAINER RESOURCES
 * ============================================================ */

function normalizeResourceAmount(
  value
) {

  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )
    ? Math.max(
        0,
        Math.trunc(
          numeric
        )
      )
    : 0;
}


function humanizeResourceId(
  resourceId
) {

  const normalized =
    String(
      resourceId ??
      ""
    )
      .replace(
        /([a-z0-9])([A-Z])/g,
        "$1 $2"
      )
      .replace(
        /[-_]+/g,
        " "
      )
      .trim();


  if (!normalized) {

    return "Resource";
  }


  return (
    normalized
      .charAt(0)
      .toUpperCase() +
    normalized.slice(1)
  );
}


function trainerResourceLabel(
  resourceId
) {

  return (
    RESOURCE_LABELS[
      getLanguage()
    ]?.[resourceId] ??
    humanizeResourceId(
      resourceId
    )
  );
}


function trainerResourceCountersMarkup(
  trainer
) {

  const progression =
    getTrainerProgressionState(
      trainer
    );


  const resources =
    progression
      ?.resources ??
    {};


  return Object.entries(
    resources
  )
    .map(
      ([
        resourceId,
        resource
      ]) => {

        const maximum =
          normalizeResourceAmount(
            resource?.max
          );


        if (
          maximum <= 0
        ) {

          return "";
        }


        const value =
          Math.min(
            normalizeResourceAmount(
              resource?.value
            ),
            maximum
          );


        const label =
          trainerResourceLabel(
            resourceId
          );


        return `
          <span
            title="${escapeHtml(label)}"
            data-trainer-resource="${escapeHtml(resourceId)}"
          >
            <i
              class="fa-solid fa-battery-half"
              aria-hidden="true"
            ></i>

            ${escapeHtml(label)}

            <strong>
              ${value}/${maximum}
            </strong>
          </span>
        `;
      }
    )
    .join("");
}

function pokemonImage(
  pokemon
) {

  return escapeHtml(
    pokemon?.img ||
    DEFAULT_POKEMON_ICON
  );
}


function pokemonLevel(
  pokemon
) {

  const value =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "level"
      )
    );

  return Number.isFinite(
    value
  )
    ? Math.trunc(
        value
      )
    : null;
}

function normalizeType(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


function localizedType(
  type
) {

  const normalized =
    normalizeType(
      type
    );


  return (
    TYPE_LABELS[
      getLanguage()
    ]?.[normalized] ??
    normalized
  );
}


function pokemonTypes(
  pokemon
) {

  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "types"
    );


  const primary =
    normalizeType(
      pokemon.getFlag(
        MODULE_ID,
        "primaryType"
      )
    );


  const types =
    Array.isArray(
      stored
    )
      ? stored
          .map(
            normalizeType
          )
          .filter(Boolean)
      : [];


  if (
    !types.length &&
    primary
  ) {

    types.push(
      primary
    );
  }


  return [
    ...new Set(
      types
    )
  ].slice(
    0,
    2
  );
}


function pokemonPrimaryType(
  pokemon
) {

  return (
    pokemonTypes(
      pokemon
    )[0] ??
    "normal"
  );
}


function pokemonTypeBadgesMarkup(
  pokemon
) {

  return pokemonTypes(
    pokemon
  )
    .map(
      type => `
        <span
          class="poke5e-trainer-type-badge"
          data-pokemon-type="${escapeHtml(type)}"
        >
          ${escapeHtml(
            localizedType(
              type
            )
          )}
        </span>
      `
    )
    .join("");
}


function pokemonHp(
  pokemon
) {

  const hp =
    pokemon.system
      ?.attributes
      ?.hp ??
    {};

  const value =
    Number(
      hp.value ??
      0
    );

  const max =
    Number(
      hp.max ??
      0
    );

  return {
    value:
      Number.isFinite(value)
        ? value
        : 0,

    max:
      Number.isFinite(max)
        ? max
        : 0
  };
}


function pokemonAc(
  pokemon
) {

  const ac =
    pokemon.system
      ?.attributes
      ?.ac ??
    {};

  const value =
    Number(
      ac.value ??
      ac.flat
    );

  return Number.isFinite(
    value
  )
    ? value
    : "—";
}


function hpPercent(
  hp
) {

  if (
    hp.max <= 0
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      (
        hp.value /
        hp.max
      ) * 100
    )
  );
}

function pokemonExperienceMarkup(
  pokemon,
  variant
) {

  const experience =
    getPokemonExperienceState(
      pokemon
    );


  const percent =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          experience.percent
        ) ||
        0
      )
    );


  const state =
    experience.isMaxLevel
      ? "max"
      : experience.readyToLevel
        ? "ready"
        : "progress";


  const value =
    experience.isMaxLevel
      ? `${experience.total} MAX`
      : `${experience.total}/${experience.nextLevelXp}`;


  return `
    <div
      class="
        poke5e-trainer-pokemon-exp
        poke5e-trainer-pokemon-exp--${escapeHtml(variant)}
      "
      data-exp-state="${escapeHtml(state)}"
    >

      <div class="poke5e-trainer-pokemon-exp__meta">

        <span>
          EXP
        </span>

        <strong>
          ${escapeHtml(value)}
        </strong>

      </div>


      <div class="poke5e-trainer-pokemon-exp__track">

        <span
          style="width: ${percent}%"
        ></span>

      </div>

    </div>
  `;
}

function isPokemonFainted(
  hp
) {

  return (
    hp.max > 0 &&
    hp.value <= 0
  );
}


function getHpVisualState(
  hp
) {

  if (
    hp.max <= 0
  ) {

    return "unknown";
  }


  if (
    isPokemonFainted(
      hp
    )
  ) {

    return "fainted";
  }


  const ratio =
    hp.value /
    hp.max;


  if (
    ratio <= 0.2
  ) {

    return "critical";
  }


  if (
    ratio <= 0.5
  ) {

    return "warning";
  }


  return "healthy";
}

function activeStatusEffects(
  pokemon
) {

  return [
    ...pokemon.effects
  ].filter(
    effect => {

      if (
        effect.disabled
      ) {
        return false;
      }

      const statuses =
        Array.from(
          effect.statuses ??
          []
        );

      return statuses.length >
        0;
    }
  );
}


function statusMarkup(
  pokemon,
  labels
) {

  const effects =
    activeStatusEffects(
      pokemon
    );

  if (
    !effects.length
  ) {

    return `
      <span
        class="poke5e-trainer-command-card__status-empty"
      >
        ${labels.noStatuses}
      </span>
    `;
  }

  return effects
    .map(
      effect => `
        <span
          class="poke5e-trainer-command-card__status"
          title="${escapeHtml(effect.name)}"
        >
          <img
            src="${escapeHtml(effect.img || DEFAULT_POKEMON_ICON)}"
            alt="${escapeHtml(effect.name)}"
          >
        </span>
      `
    )
    .join("");
}

/* ============================================================
 * QUICK MOVES
 * ============================================================ */

function actionButton({
  action,
  pokemon,
  icon,
  label,
  primary = false,
  iconOnly = false,
  extraClass = "",
  disabled = false,
  title = null
}) {

  const primaryClass =
    primary
      ? " poke5e-trainer-command-action--primary"
      : "";

  const iconOnlyClass =
    iconOnly
      ? " poke5e-trainer-command-action--icon"
      : "";

  const customClass =
    extraClass
      ? ` ${extraClass}`
      : "";

  const buttonTitle =
    title ??
    label;


  return `
    <button
      type="button"
      class="poke5e-trainer-command-action${primaryClass}${iconOnlyClass}${customClass}"
      data-command-action="${escapeHtml(action)}"
      data-pokemon-id="${escapeHtml(pokemon.id)}"
      title="${escapeHtml(buttonTitle)}"
      aria-label="${escapeHtml(buttonTitle)}"
      ${
        disabled
          ? 'disabled data-command-persistent-disabled="true"'
          : ""
      }
    >
      <i
        class="${escapeHtml(icon)}"
        aria-hidden="true"
      ></i>

      ${
        iconOnly
          ? ""
          : `
            <span>
              ${escapeHtml(label)}
            </span>
          `
      }
    </button>
  `;
}

function pokemonSheetButton(
  pokemon,
  labels
) {

  return `
    <button
      type="button"
      class="
        poke5e-trainer-command-action
        poke5e-trainer-command-action--pokemon-sheet
      "
      data-trainer-pokemon-sheet-open
      data-pokemon-id="${escapeHtml(pokemon.id)}"
      title="${escapeHtml(labels.openPokemonSheet)}"
      aria-label="${escapeHtml(labels.openPokemonSheet)}"
    >

      <i
        class="fa-solid fa-up-right-from-square"
        aria-hidden="true"
      ></i>

      <span>
        ${escapeHtml(labels.openPokemonSheet)}
      </span>

    </button>
  `;
}

function pokemonLevelUpButton(
  pokemon,
  labels,
  {
    iconOnly = false,
    extraClass = ""
  } = {}
) {

  const level =
    pokemonLevel(
      pokemon
    );


  if (
    !game.user.isGM ||
    level == null ||
    level >= 20
  ) {

    return "";
  }


  const experience =
    getPokemonExperienceState(
      pokemon
    );


  const readyToLevel =
    experience.readyToLevel;


  const title =
    readyToLevel
      ? labels.pokemonLevelUp
      : labels.pokemonLevelUpLocked(
          experience.xpRemaining
        );


  return actionButton({
    action:
      "pokemon-level-up",

    pokemon,

    icon:
      "fa-solid fa-arrow-up",

    label:
      labels.pokemonLevelUp,

    title,

    disabled:
      !readyToLevel,

    iconOnly,

    extraClass
  });
}

function activeCardMarkup(
  pokemon,
  labels,
  editable
) {

  const hp =
    pokemonHp(
      pokemon
    );


  const level =
    pokemonLevel(
      pokemon
    );


  const primaryType =
    pokemonPrimaryType(
      pokemon
    );

  const hpState =
    getHpVisualState(
      hp
    );


  const fainted =
    isPokemonFainted(
      hp
    );

  const levelUpCornerButton =
    pokemonLevelUpButton(
      pokemon,
      labels,
      {
        iconOnly: true,
        extraClass:
          "poke5e-trainer-command-action--level-up poke5e-trainer-command-action--level-up-corner"
      }
    );


  return `
    <article
      class="
        poke5e-trainer-command-card
        poke5e-trainer-command-card--active
      "
      data-pokemon-type="${escapeHtml(primaryType)}"
      data-pokemon-id="${escapeHtml(pokemon.id)}"
      data-hp-state="${escapeHtml(hpState)}"
      data-fainted="${fainted ? "true" : "false"}"
    >

      ${
        levelUpCornerButton
          ? `
            <div class="poke5e-trainer-command-card__level-up-corner">
              ${levelUpCornerButton}
            </div>
          `
          : ""
      }

      <div class="poke5e-trainer-command-card__main">
        <img
          class="poke5e-trainer-command-card__portrait"
          src="${pokemonImage(pokemon)}"
          alt="${escapeHtml(pokemon.name)}"
        >


        <div class="poke5e-trainer-command-card__identity">

          <div class="poke5e-trainer-command-card__name-row">

            <strong
              title="${escapeHtml(pokemon.name)}"
            >
              ${escapeHtml(pokemon.name)}
            </strong>

            ${
              level == null
                ? ""
                : `
                  <span>
                    ${labels.level} ${level}
                  </span>
                `
            }

          </div>


          <div class="poke5e-trainer-command-card__types">

            ${pokemonTypeBadgesMarkup(
              pokemon
            )}

          </div>


          ${
            fainted
              ? `
                <div
                  class="poke5e-trainer-command-card__fainted"
                  title="${escapeHtml(labels.fainted)}"
                >
                  <i
                    class="fa-solid fa-circle-xmark"
                    aria-hidden="true"
                  ></i>

                  <span>
                    ${escapeHtml(labels.fainted)}
                  </span>
                </div>
              `
              : ""
          }


          <div class="poke5e-trainer-command-card__stats">

            <span>
              ${labels.hp}
              <strong>
                ${hp.value}/${hp.max}
              </strong>
            </span>

            <span>
              ${labels.ac}
              <strong>
                ${pokemonAc(pokemon)}
              </strong>
            </span>

          </div>


          <div class="poke5e-trainer-command-card__hp">

            <span
              style="width: ${hpPercent(hp)}%"
            ></span>

          </div>


          ${pokemonExperienceMarkup(
            pokemon,
            "active"
          )}


          <div class="poke5e-trainer-command-card__statuses">
            ${statusMarkup(
              pokemon,
              labels
            )}

          </div>

        </div>
      </div>

      ${
        editable
          ? `
            <div class="poke5e-trainer-command-card__actions">

              ${pokemonSheetButton(
                pokemon,
                labels
              )}

              ${actionButton({
                action:
                  "switch-start",

                pokemon,

                icon:
                  "fa-solid fa-right-left",

                label:
                  labels.switch,

                primary:
                  true
              })}


              ${actionButton({
                action:
                  "recall",

                pokemon,

                icon:
                  "fa-solid fa-arrow-down",

                label:
                  labels.recall
              })}

            </div>
          `
          : ""
      }

    </article>
  `;
}

function emptyActiveSlotMarkup(
  labels
) {

  return `
    <article
      class="
        poke5e-trainer-command-card
        poke5e-trainer-command-card--empty
      "
    >

      <i
        class="poke5e-icon-pokeball"
        aria-hidden="true"
      ></i>


      <strong>
        ${labels.activeSlot}
      </strong>


      <span>
        ${labels.noActiveHint}
      </span>

    </article>
  `;
}

function activeMarkup(
  view,
  labels,
  editable,
  maxActive
) {

  const cards =
    view.activePokemon.map(
      pokemon =>
        activeCardMarkup(
          pokemon,
          labels,
          editable
        )
    );


  const emptySlots =
    Math.max(
      maxActive -
        cards.length,
      0
    );


  for (
    let index = 0;
    index < emptySlots;
    index += 1
  ) {

    cards.push(
      emptyActiveSlotMarkup(
        labels
      )
    );
  }


  return `
    <div class="poke5e-trainer-command-active-grid">

      ${cards.join("")}

    </div>
  `;
}


function partyCardMarkup(
  pokemon,
  active,
  switchOutgoingUuid,
  labels,
  editable
) {

  const hp =
    pokemonHp(
      pokemon
    );


  const switching =
    Boolean(
      switchOutgoingUuid
    );


  const levelUpButton =
    editable &&
    !active &&
    !switching
      ? pokemonLevelUpButton(
          pokemon,
          labels,
          {
            iconOnly: true,
            extraClass:
              "poke5e-trainer-command-action--level-up"
          }
        )
      : "";


  let actions =
    "";


  if (
    editable &&
    !active
  ) {

    if (
      switching
    ) {

      actions =
        actionButton({
          action:
            "switch-complete",

          pokemon,

          icon:
            "fa-solid fa-arrow-right-to-bracket",

          label:
            labels.switchIncoming,

          primary:
            true
        });

    } else {

      actions = `
        ${actionButton({
          action:
            "deploy",

          pokemon,

          icon:
            "fa-solid fa-bolt",

          label:
            labels.deploy,

          primary:
            true
        })}

        ${actionButton({
          action:
            "party-to-pc",

          pokemon,

          icon:
            "fa-solid fa-box-archive",

          label:
            labels.toPc
        })}
      `;
    }
  }


  const primaryType =
    pokemonPrimaryType(
      pokemon
    );


  const hpState =
    getHpVisualState(
      hp
    );


  const fainted =
    isPokemonFainted(
      hp
    );


  return `
    <article
      class="
        poke5e-trainer-party-card
        ${active ? "is-active" : ""}
        ${switching && !active ? "is-switch-target" : ""}
        ${fainted ? "is-fainted" : ""}
      "
      data-pokemon-id="${escapeHtml(pokemon.id)}"
      data-pokemon-type="${escapeHtml(primaryType)}"
      data-hp-state="${escapeHtml(hpState)}"
      data-fainted="${fainted ? "true" : "false"}"
    >

      <img
        src="${pokemonImage(pokemon)}"
        alt="${escapeHtml(pokemon.name)}"
      >


      <div class="poke5e-trainer-party-card__body">

        <div class="poke5e-trainer-party-card__header">

          <div class="poke5e-trainer-party-card__name">

            <strong
              title="${escapeHtml(pokemon.name)}"
            >
              ${escapeHtml(pokemon.name)}
            </strong>

            ${
              active
                ? `
                  <span class="poke5e-trainer-party-card__active-badge">
                    ${labels.activeBadge}
                  </span>
                `
                : ""
            }


            ${
              fainted
                ? `
                  <span
                    class="poke5e-trainer-party-card__fainted-badge"
                    title="${escapeHtml(labels.fainted)}"
                  >
                    ${escapeHtml(labels.fainted)}
                  </span>
                `
                : ""
            }

          </div>


          ${
            levelUpButton
              ? `
                <div class="poke5e-trainer-party-card__quick-actions">
                  ${levelUpButton}
                </div>
              `
              : ""
          }

        </div>


        <div class="poke5e-trainer-party-card__hp">

          <span>
            ${hp.value}/${hp.max}
          </span>

          <div>
            <span
              style="width: ${hpPercent(hp)}%"
            ></span>
          </div>

        </div>


        ${pokemonExperienceMarkup(
          pokemon,
          "party"
        )}

      </div>


      ${
        actions
          ? `
            <div class="poke5e-trainer-party-card__actions">
              ${actions}
            </div>
          `
          : ""
      }

    </article>
  `;
}


function partyMarkup(
  view,
  state,
  labels,
  editable
) {

  return view.partyPokemon
    .map(
      pokemon =>
        partyCardMarkup(
          pokemon,

          view.activeUuidSet.has(
            pokemon.uuid
          ),

          state.switchOutgoingUuid,
          labels,
          editable
        )
    )
    .join("");
}


function pcMarkup(
  view,
  labels,
  editable
) {

  if (
    !view.pcPokemon.length
  ) {

    return `
      <div class="poke5e-trainer-command-pc-empty">
        ${labels.emptyPc}
      </div>
    `;
  }


  return view.pcPokemon
    .map(
      pokemon => {

        const hp =
          pokemonHp(
            pokemon
          );

        const level =
          pokemonLevel(
            pokemon
          );

        const primaryType =
          pokemonPrimaryType(
            pokemon
          );

        const hpState =
          getHpVisualState(
            hp
          );

        const fainted =
          isPokemonFainted(
            hp
          );

        const levelUpButton =
          editable
            ? pokemonLevelUpButton(
                pokemon,
                labels,
                {
                  iconOnly: true,
                  extraClass:
                    "poke5e-trainer-command-action--level-up"
                }
              )
            : "";

        return `
          <article
            class="poke5e-trainer-pc-card${fainted ? " is-fainted" : ""}"
            data-pokemon-type="${escapeHtml(primaryType)}"
            data-hp-state="${escapeHtml(hpState)}"
            data-fainted="${fainted ? "true" : "false"}"
          >

            <img
              src="${pokemonImage(pokemon)}"
              alt="${escapeHtml(pokemon.name)}"
            >

            <div class="poke5e-trainer-pc-card__body">

              <div class="poke5e-trainer-pc-card__header">

                <div class="poke5e-trainer-pc-card__name">

                  <strong
                    title="${escapeHtml(pokemon.name)}"
                  >
                    ${escapeHtml(pokemon.name)}
                  </strong>

                  ${
                    level == null
                      ? ""
                      : `
                        <span class="poke5e-trainer-pc-card__level">
                          ${labels.level} ${level}
                        </span>
                      `
                  }

                </div>

                ${
                  levelUpButton
                    ? `
                      <div class="poke5e-trainer-pc-card__quick-actions">
                        ${levelUpButton}
                      </div>
                    `
                    : ""
                }

              </div>

              <span>
                ${labels.hp} ${hp.value}/${hp.max}
              </span>

              ${
                fainted
                  ? `
                    <span class="poke5e-trainer-pc-card__fainted">
                      ${escapeHtml(labels.fainted)}
                    </span>
                  `
                  : ""
              }

            </div>

            ${
              editable
                ? `
                  ${actionButton({
                    action:
                      "pc-to-party",

                    pokemon,

                    icon:
                      "fa-solid fa-users",

                    label:
                      labels.toParty,

                    primary:
                      true
                  })}
                `
                : ""
            }

          </article>
        `;
      }
    )
    .join("");
}


function switchBannerMarkup(
  state,
  labels
) {

  if (
    !state.switchOutgoingUuid
  ) {
    return "";
  }


  const outgoing =
    pokemonFromUuid(
      state.switchOutgoingUuid
    );


  if (!outgoing) {
    return "";
  }


  return `
    <div class="poke5e-trainer-switch-banner">

      <span>

        <i
          class="fa-solid fa-right-left"
          aria-hidden="true"
        ></i>

        ${escapeHtml(
          labels.switchMode(
            outgoing.name
          )
        )}

      </span>

      <button
        type="button"
        data-command-action="switch-cancel"
      >
        ${labels.switchCancel}
      </button>

    </div>
  `;
}


export function buildTrainerCommandCenter(
  trainer,
  state
) {

  const labels =
    LABELS[
      getLanguage()
    ];


  const view =
    getTrainerView(
      trainer
    );


  const level =
    getTrainerLevel(
      trainer
    ) ??
    1;


  /*
   * Contrato de permisos:
   *
   * GM:
   * - administración
   * - progresión
   * - órdenes de batalla
   *
   * Owner del Trainer:
   * - órdenes de batalla
   * - uso de Moves
   *
   * Observer / Limited:
   * - solo visualización
   */
  const editable =
    canCurrentUserOperateTrainer(
      trainer
    );


  const root =
    document.createElement(
      "section"
    );


  root.className =
    ROOT_CLASS;

  root.dataset.trainerId =
    trainer.id;

  root.dataset.maxActive =
    String(
      state.maxActive
    );


  root.innerHTML = `
    <header class="poke5e-trainer-command-header">

      <div class="poke5e-trainer-command-header__identity">

        <span class="poke5e-trainer-command-header__badge">

          <i
            class="fa-solid fa-user"
            aria-hidden="true"
          ></i>

          ${labels.trainer}

        </span>

        <strong>
          ${labels.level} ${level}
        </strong>


        ${
          game.user.isGM &&
          level <
            MAX_SUPPORTED_TRAINER_LEVEL
            ? `
              <button
                type="button"
                class="
                  poke5e-trainer-command-action
                  poke5e-trainer-command-action--icon
                "
                data-command-action="trainer-level-up"
                title="${escapeHtml(labels.trainerLevelUp)}"
                aria-label="${escapeHtml(labels.trainerLevelUp)}"
              >
                <i
                  class="fa-solid fa-arrow-up"
                  aria-hidden="true"
                ></i>
              </button>
            `
            : ""
        }

      </div>


      <div class="poke5e-trainer-command-header__counters">

        <span>
          ${labels.party}

          <strong>
            ${view.state.pokemonUuids.length}/${view.pokeslotLimit}
          </strong>
        </span>

        <span>
          ${labels.active}

          <strong>
            ${view.state.activePokemonUuids.length}/${state.maxActive}
          </strong>
        </span>

        <span>
          ${labels.pc}

          <strong>
            ${view.pcPokemon.length}
          </strong>
        </span>


        ${trainerResourceCountersMarkup(
          trainer
        )}
        ${
          editable
            ? availableTrainerPathActions(trainer).map(action => `
              <button type="button" class="poke5e-trainer-command-action" data-command-action="${action}">
                ${escapeHtml(trainerPathActionLabel(trainer, action))}
              </button>`).join("")
            : ""
        }
      </div>


      ${
        editable
          ? `
            <label class="poke5e-trainer-command-format">

              <span>
                ${labels.format}
              </span>

              <select
                data-command-role="battle-format"
              >

                <option
                  value="1"
                  ${state.maxActive === 1 ? "selected" : ""}
                >
                  ${labels.single}
                </option>

                <option
                  value="2"
                  ${state.maxActive === 2 ? "selected" : ""}
                >
                  ${labels.double}
                </option>

              </select>

            </label>
          `
          : ""
      }

    </header>


    ${switchBannerMarkup(
      state,
      labels
    )}


    <section
      class="
        poke5e-trainer-command-section
        poke5e-trainer-command-section--active
      "
    >

      <header>

        <h3>
          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          ${labels.active}
        </h3>

      </header>


      ${activeMarkup(
        view,
        labels,
        editable,
        state.maxActive
      )}

    </section>


    <section class="poke5e-trainer-command-section">

      <header>

        <h3>
          <i
            class="fa-solid fa-users"
            aria-hidden="true"
          ></i>

          ${labels.party}
        </h3>

      </header>


      <div class="poke5e-trainer-party-grid-inline">

        ${partyMarkup(
          view,
          state,
          labels,
          editable
        )}

      </div>

    </section>


    <details class="poke5e-trainer-command-pc">

      <summary>

        <span>

          <i
            class="fa-solid fa-box-archive"
            aria-hidden="true"
          ></i>

          ${labels.pc}

        </span>

        <strong>
          ${view.pcPokemon.length}
        </strong>

      </summary>


      <div class="poke5e-trainer-command-pc__content">

        ${pcMarkup(
          view,
          labels,
          editable
        )}

      </div>

    </details>
  `;


  return root;
}