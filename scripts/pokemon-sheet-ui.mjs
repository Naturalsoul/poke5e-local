import { bondMarkup } from "./pokemon-bond-service.mjs";
import { applyStoringPowerMatchups } from "./trainer-path-effects.mjs";
import {
  getPokemonExperienceState
} from "./pokemon-experience-service.mjs";

import {
  getPokemonMoveLimit,
  getPokemonKnownMoves,
  getPokemonStruggleMove
} from "./pokemon-move-service.mjs";

import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  PokemonActorSheet
} from "./pokemon-actor-sheet.mjs";

import {
  activatePokemonSheetActions
} from "./pokemon-sheet-actions.mjs";

import {
  canCurrentUserTransferPokemonHeldItem,
  getPokemonHeldItem
} from "./pokemon-held-item-service.mjs";
import { canUsePokemonHeldItem, heldItemActionButtons } from "./pokemon-held-item-actions.mjs";

import {
  getPokemonNature
} from "./nature-runtime.mjs";

import {
  listNatureDefinitions,
  localizedNatureName
} from "./nature-rules.mjs";

import {
  getPokemonShinyState
} from "./shiny-runtime.mjs";

import {
  canCurrentUserRenamePokemon
} from "./pokemon-name-service.mjs";

import {
  POKEMON_TYPE_IDS
} from "./types.mjs";

import {
  canCurrentUserModifyPokemonStatuses,
  getPokemonAppliedStatuses,
  getPokemonStatusOptions
} from "./pokemon-status-service.mjs";

import {
  canCurrentUserModifyPokemonGender,
  getPokemonGender
} from "./gender-runtime.mjs";

import {
  POKEMON_GENDER_IDS,
  localizedPokemonGenderName
} from "./gender-rules.mjs";

import {
  canCurrentUserEditPokemonAbilityScores,
  getPokemonPermanentAbilityScores
} from "./pokemon-ability-score-service.mjs";

import {
  getPokemonConcentrations
} from "./pokemon-concentration-service.mjs";
import { pokemonMoveEffectsMarkup } from "./pokemon-move-effects.mjs";

const MODULE_ID =
  "poke5e-local";

const SUMMARY_CLASS =
  "poke5e-pokemon-summary";

const SUMMARY_HOST_SELECTOR =
  "[data-poke5e-pokemon-summary-host]";

const SUMMARY_SCROLL_HOST_SELECTOR =
  ".poke5e-pokemon-sheet__host";

const APPLICATION_SCROLL_STATE =
  new WeakMap();


const TRACKED_SCROLL_HOSTS =
  new WeakSet();

const DEFAULT_IMAGE =
  "icons/svg/mystery-man.svg";


const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

const SKILL_DEFINITIONS = {

  acr: {
    ability: "dex",
    es: "Acrobacias",
    en: "Acrobatics"
  },

  ani: {
    ability: "wis",
    es: "Trato con Animales",
    en: "Animal Handling"
  },

  arc: {
    ability: "int",
    es: "Arcano",
    en: "Arcana"
  },

  ath: {
    ability: "str",
    es: "Atletismo",
    en: "Athletics"
  },

  dec: {
    ability: "cha",
    es: "Engaño",
    en: "Deception"
  },

  his: {
    ability: "int",
    es: "Historia",
    en: "History"
  },

  ins: {
    ability: "wis",
    es: "Perspicacia",
    en: "Insight"
  },

  itm: {
    ability: "cha",
    es: "Intimidación",
    en: "Intimidation"
  },

  inv: {
    ability: "int",
    es: "Investigación",
    en: "Investigation"
  },

  med: {
    ability: "wis",
    es: "Medicina",
    en: "Medicine"
  },

  nat: {
    ability: "int",
    es: "Naturaleza",
    en: "Nature"
  },

  prc: {
    ability: "wis",
    es: "Percepción",
    en: "Perception"
  },

  prf: {
    ability: "cha",
    es: "Interpretación",
    en: "Performance"
  },

  per: {
    ability: "cha",
    es: "Persuasión",
    en: "Persuasion"
  },

  rel: {
    ability: "int",
    es: "Religión",
    en: "Religion"
  },

  slt: {
    ability: "dex",
    es: "Juego de Manos",
    en: "Sleight of Hand"
  },

  ste: {
    ability: "dex",
    es: "Sigilo",
    en: "Stealth"
  },

  sur: {
    ability: "wis",
    es: "Supervivencia",
    en: "Survival"
  }
};

const MOVEMENT_TYPES = [
  {
    id:
      "walk",

    icon:
      "fa-solid fa-person-walking"
  },

  {
    id:
      "fly",

    icon:
      "fa-solid fa-feather"
  },

  {
    id:
      "swim",

    icon:
      "fa-solid fa-water"
  },

  {
    id:
      "climb",

    icon:
      "fa-solid fa-mountain"
  },

  {
    id:
      "burrow",

    icon:
      "fa-solid fa-circle-down"
  }
];

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


const SIZE_LABELS = {
  es: {
    tiny: "Diminuto",
    sm: "Pequeño",
    med: "Mediano",
    lg: "Grande",
    huge: "Enorme",
    grg: "Gargantuesco"
  },

  en: {
    tiny: "Tiny",
    sm: "Small",
    med: "Medium",
    lg: "Large",
    huge: "Huge",
    grg: "Gargantuan"
  }
};


const LABELS = {
  es: {
    data:
      "Datos Pokémon",

    level:
      "Nv.",

    hp:
      "PS",

    stats:
      "Estadísticas",

    battle:
      "Combate",

    speed:
      "Velocidad",

    size:
      "Tamaño",

    trainer:
      "Trainer",

    noTrainer:
      "Sin Trainer",

    ability:
      "Ability activa",

    noAbility:
      "Sin Ability activa",

    matchups:
      "Afinidades de tipo",

    storingPower:
      "Type Master — Storing Power",

    resistances:
      "Resiste",

    weaknesses:
      "Débil a",

    immunities:
      "Inmune",

    none:
      "Ninguna",

    moves:
      "Moves",

    defaultMove:
      "Move predeterminado",

    attack:
      "Ataque",

    melee:
      "Cuerpo a cuerpo",

    ranged:
      "A distancia",

    use:
      "Usar",

    damage:
      "Daño",

    noActivity:
      "Sin actividad utilizable",

    save:
      "Salvación",

    utility:
      "Estado",

    range:
      "Rango",

    movement:
      "Movimiento",

    walk:
      "Tierra",

    fly:
      "Vuelo",

    swim:
      "Nado",

    climb:
      "Escalada",

    burrow:
      "Excavación",

    hover:
      "Hover",

    details:
      "Ver detalles",

    hpDecrease:
      "Reducir PS",

    hpIncrease:
      "Recuperar PS",

    openTrainer:
      "Abrir Trainer",

    technicalDetails:
      "Detalles",

    evolvePokemon:
      "Evolucionar",

    technicalData:
      "Datos técnicos",

    actorId:
      "Actor ID",

    actorUuid:
      "UUID",

    actorType:
      "Tipo de Actor",

    sourceId:
      "Source ID",

    primaryTypeId:
      "Tipo primario",

    activeAbilityId:
      "Ability activa",

    trainerUuid:
      "Trainer UUID",

    sheetClass:
      "Sheet Class",

    moveSlots:
      "Moves conocidos",

    checkShort:
      "Check",

    saveShort:
      "Save",

    abilityCheck:
      "Prueba de característica",

    editAbilityScore:
      "Editar valor permanente de característica",

    effectiveAbilityScore:
      "Valor efectivo",

    savingThrow:
      "Tirada de salvación",

    saveProficient:
      "Competente en salvaciones",

    skills:
      "Skills",

    rollSkill:
      "Tirar Skill",

    skillProficient:
      "Competente",

    skillExpertise:
      "Expertise",

    initiative:
      "Iniciativa",

    rollInitiative:
      "Tirar iniciativa",

    deleteMove:
      "Eliminar Move",

    movePowerAbilities:
      "Características disponibles para este Move",

    editMovePp:
      "Editar PP actuales",

    deleteAbility:
      "Eliminar Ability",

    experience:
      "Experiencia",

    experienceTotal:
      "XP total",

    experienceRemaining:
      "Faltan",

    readyToLevel:
      "Listo para subir de nivel",

    maxLevel:
      "Nivel máximo",

    editExperience:
      "XP total o ajuste (+150 / -150)",

    heldItem:
      "Objeto",

    noHeldItem:
      "Sin objeto",

    removeHeldItem:
      "Quitar objeto",

    transferHeldItem:
      "Dar al Trainer",

    nature:
      "Naturaleza",

    noNature:
      "Sin Nature",

    natureNeutral:
      "Sin cambios",

    editNature:
      "Cambiar Nature del Pokémon",

    shiny:
      "Shiny",

    normalAppearance:
      "Normal",

    unresolvedShiny:
      "Sin resolver",

    editShiny:
      "Cambiar estado Shiny del Pokémon",

    editNickname:
      "Cambiar nombre o mote del Pokémon",

    statuses:
      "Estados",

    noStatuses:
      "Sin estados",

    addStatus:
      "Agregar estado",

    removeStatus:
      "Quitar estado",

    volatileStatus:
      "Volátil",

    nonVolatileStatus:
      "No volátil",

    activeStatus:
      "Estado activo",

    primaryType:
      "Tipo primario",

    secondaryType:
      "Tipo secundario",

    noSecondaryType:
      "Sin segundo tipo",

    editTypes:
      "Cambiar tipos del Pokémon",

    genderUnresolved:
      "Género sin resolver",

    editGender:
      "Cambiar género del Pokémon",
    
    concentration:
      "Concentración",

    concentrationMaintaining:
      "Manteniendo",

    endConcentration:
      "Finalizar concentración",
  },

  en: {
    data:
      "Pokémon Data",

    level:
      "Lv.",

    hp:
      "HP",

    stats:
      "Stats",

    battle:
      "Battle",

    speed:
      "Speed",

    size:
      "Size",

    trainer:
      "Trainer",

    noTrainer:
      "No Trainer",

    ability:
      "Active Ability",

    noAbility:
      "No active Ability",

    matchups:
      "Type Matchups",

    storingPower:
      "Type Master — Storing Power",

    resistances:
      "Resists",

    weaknesses:
      "Weak To",

    immunities:
      "Immune",

    none:
      "None",

    moves:
      "Moves",

    defaultMove:
      "Default Move",

    attack:
      "Attack",

    melee:
      "Melee",

    ranged:
      "Ranged",

    use:
      "Use",

    damage:
      "Damage",

    noActivity:
      "No usable activity",

    save:
      "Save",

    utility:
      "Status",

    range:
      "Range",

    movement:
      "Movement",

    walk:
      "Walk",

    fly:
      "Fly",

    swim:
      "Swim",

    climb:
      "Climb",

    burrow:
      "Burrow",

    hover:
      "Hover",

    details:
      "View details",

    hpDecrease:
      "Decrease HP",

    hpIncrease:
      "Restore HP",

    openTrainer:
      "Open Trainer",

    technicalDetails:
      "Details",

    evolvePokemon:
      "Evolve",

    technicalData:
      "Technical Data",

    actorId:
      "Actor ID",

    actorUuid:
      "UUID",

    actorType:
      "Actor Type",

    sourceId:
      "Source ID",

    primaryTypeId:
      "Primary Type",

    activeAbilityId:
      "Active Ability",

    trainerUuid:
      "Trainer UUID",

    sheetClass:
      "Sheet Class",

    moveSlots:
      "Known Moves",

    checkShort:
      "Check",

    saveShort:
      "Save",

    abilityCheck:
      "Ability Check",

    editAbilityScore:
      "Edit permanent Ability Score",

    effectiveAbilityScore:
      "Effective score",

    savingThrow:
      "Saving Throw",

    saveProficient:
      "Proficient in saving throws",

    skills:
      "Skills",

    rollSkill:
      "Roll Skill",

    skillProficient:
      "Proficient",

    skillExpertise:
      "Expertise",

    initiative:
      "Initiative",

    rollInitiative:
      "Roll initiative",

    deleteMove:
      "Delete Move",

    movePowerAbilities:
      "Ability scores available for this Move",

    editMovePp:
      "Edit current PP",

    deleteAbility:
      "Delete Ability",

    experience:
      "Experience",

    experienceTotal:
      "Total XP",

    experienceRemaining:
      "Remaining",

    readyToLevel:
      "Ready to level up",

    maxLevel:
      "Maximum level",

    editExperience:
      "Total XP or adjustment (+150 / -150)",

    heldItem:
      "Held Item",

    noHeldItem:
      "No Item",

    removeHeldItem:
      "Remove Item",

    transferHeldItem:
      "Give to Trainer",

    nature:
      "Nature",

    noNature:
      "No Nature",

    natureNeutral:
      "No changes",

    editNature:
      "Change Pokémon Nature",

    shiny:
      "Shiny",

    normalAppearance:
      "Normal",

    unresolvedShiny:
      "Unresolved",

    editShiny:
      "Change Pokémon Shiny state",

    editNickname:
      "Change Pokémon name or nickname",

    statuses:
      "Statuses",

    noStatuses:
      "No statuses",

    addStatus:
      "Add status",

    removeStatus:
      "Remove status",

    volatileStatus:
      "Volatile",

    nonVolatileStatus:
      "Non-volatile",

    activeStatus:
      "Active status",

    primaryType:
      "Primary type",

    secondaryType:
      "Secondary type",

    noSecondaryType:
      "No secondary type",

    editTypes:
      "Change Pokémon types",

    genderUnresolved:
      "Unresolved gender",

    editGender:
      "Change Pokémon gender",

    concentration:
      "Concentration",

    concentrationMaintaining:
      "Maintaining",

    endConcentration:
      "End concentration",
  }
};


/* ============================================================
 * GENERIC
 * ============================================================ */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
};


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


function getLanguage() {

  return (
    game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
  )
    ? "en"
    : "es";
}


function signedNumber(
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


  return numeric >= 0
    ? `+${numeric}`
    : String(numeric);
}


function cleanPokemonName(
  name
) {

  return String(
    name ??
    ""
  ).replace(
    /\s*\((?:Lv\.|Nv\.)\s*\d+\)\s*$/i,
    ""
  );
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


/* ============================================================
 * POKÉMON DATA
 * ============================================================ */

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
  ];
}


function pokemonPrimaryType(
  pokemon
) {

  return (
    normalizeType(
      pokemon.getFlag(
        MODULE_ID,
        "primaryType"
      )
    ) ||
    pokemonTypes(
      pokemon
    )[0] ||
    "typeless"
  );
}


function pokemonHp(
  pokemon
) {

  const hp =
    pokemon.system
      ?.attributes
      ?.hp;


  const value =
    Number(
      hp?.value ??
      0
    );


  const max =
    Number(
      hp?.max ??
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

function pokemonMovement(
  pokemon,
  labels
) {

  const movement =
    pokemon.system
      ?.attributes
      ?.movement ??
    {};


  const units =
    String(
      movement.units ??
      "ft"
    );


  const entries =
    MOVEMENT_TYPES
      .map(
        definition => {

          const value =
            Number(
              movement[
                definition.id
              ] ??
              0
            );


          if (
            !Number.isFinite(value) ||
            value <= 0
          ) {

            return null;
          }


          return {
            id:
              definition.id,

            icon:
              definition.icon,

            label:
              labels[
                definition.id
              ],

            value,
            units
          };
        }
      )
      .filter(Boolean);


  return {
    entries,

    hover:
      Boolean(
        movement.hover
      ) &&
      entries.some(
        entry =>
          entry.id ===
          "fly"
      )
  };
}

function pokemonInitiative(
  pokemon
) {

  const initiative =
    pokemon.system
      ?.attributes
      ?.init ??
    {};


  const total =
    Number(
      initiative.total
    );


  const configuredAbility =
    String(
      initiative.ability ??
      ""
    )
      .trim()
      .toLowerCase();


  const defaultAbility =
    String(
      CONFIG.DND5E
        ?.defaultAbilities
        ?.initiative ??
      "dex"
    )
      .trim()
      .toLowerCase();


  return {
    total:
      Number.isFinite(
        total
      )
        ? total
        : null,

    abilityId:
      configuredAbility ||
      defaultAbility
  };
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
      ) *
      100
    )
  );
}


function pokemonTrainer(
  pokemon
) {

  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (!trainerUuid) {

    return null;
  }


  return (
    game.actors.find(
      actor =>
        actor.uuid ===
        trainerUuid
    ) ??
    null
  );
}


function pokemonActiveAbility(
  pokemon
) {

  const activeAbilityId =
    normalizeType(
      pokemon.getFlag(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (!activeAbilityId) {

    return null;
  }


  return (
    pokemon.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) === "ability" &&
        normalizeType(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          )
        ) === activeAbilityId
    ) ??
    null
  );
}

function heldItemMarkup(
  item,
  labels,
  {
    canTransfer = false,
    canUse = false,
    language = "es"
  } = {}
) {

  if (!item) {

    return `
      <div class="poke5e-pokemon-held-item-empty">

        <i
          class="fa-solid fa-box-open"
          aria-hidden="true"
        ></i>

        <span>
          ${escapeHtml(labels.noHeldItem)}
        </span>

      </div>
    `;
  }


  const description =
    htmlToText(
      item.system
        ?.description
        ?.value
    );

  const useButtons = heldItemActionButtons(item, { language, canUse });


  return `
    <article class="poke5e-pokemon-held-item">

      <div class="poke5e-pokemon-held-item__header">

        <div class="poke5e-pokemon-held-item__portrait">

          <img
            src="${escapeHtml(
              item.img ||
              DEFAULT_IMAGE
            )}"
            alt=""
          >

        </div>


        <div class="poke5e-pokemon-held-item__identity">

          <div class="poke5e-pokemon-held-item__title-row">

          <button
            type="button"
            class="poke5e-pokemon-held-item__details"
            data-pokemon-sheet-action="item-open"
            data-item-id="${escapeHtml(item.id)}"
            title="${escapeHtml(
              `${labels.details}: ${item.name}`
            )}"
            aria-label="${escapeHtml(
              `${labels.details}: ${item.name}`
            )}"
          >

            <span>
              ${escapeHtml(item.name)}
            </span>

            <i
              class="fa-solid fa-circle-info"
              aria-hidden="true"
            ></i>

          </button>

          ${useButtons ? `<div class="poke5e-pokemon-held-item__use-controls">${useButtons}</div>` : ""}

          </div>


          <small class="poke5e-pokemon-held-item__hint">

            <i
              class="fa-solid fa-up-right-from-square"
              aria-hidden="true"
            ></i>

            ${escapeHtml(labels.details)}

          </small>

        </div>


        <button
          type="button"
          class="poke5e-pokemon-held-item__remove"
          data-pokemon-sheet-action="held-item-remove"
          data-item-id="${escapeHtml(item.id)}"
          title="${escapeHtml(labels.removeHeldItem)}"
          aria-label="${escapeHtml(labels.removeHeldItem)}"
        >

          <i
            class="fa-solid fa-xmark"
            aria-hidden="true"
          ></i>

        </button>

      </div>


      ${
        description
          ? `
            <p class="poke5e-pokemon-held-item__description">
              ${escapeHtml(description)}
            </p>
          `
          : ""
      }


      ${
        canTransfer
          ? `
            <footer class="poke5e-pokemon-held-item__actions">

              <button
                type="button"
                class="poke5e-pokemon-held-item__transfer"
                data-pokemon-sheet-action="held-item-transfer"
                data-item-id="${escapeHtml(item.id)}"
                title="${escapeHtml(labels.transferHeldItem)}"
                aria-label="${escapeHtml(labels.transferHeldItem)}"
              >

                <i
                  class="fa-solid fa-arrow-right-arrow-left"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHtml(labels.transferHeldItem)}
                </span>

                <i
                  class="fa-solid fa-chevron-right"
                  aria-hidden="true"
                ></i>

              </button>

            </footer>
          `
          : ""
      }

    </article>
  `;
}

function heldItemPanelMarkup(
  item,
  labels,
  {
    canTransfer = false,
    canUse = false,
    language = "es"
  } = {}
) {

  return `
    <section
      class="
        poke5e-pokemon-panel
        poke5e-pokemon-panel--held-item
      "
    >

      <header>

        <i
          class="fa-solid fa-bag-shopping"
          aria-hidden="true"
        ></i>

        <h3>
          ${escapeHtml(labels.heldItem)}
        </h3>

      </header>


      ${heldItemMarkup(
        item,
        labels,
        {
          canTransfer, canUse, language
        }
      )}

    </section>
  `;
}

/* ============================================================
 * NATURE
 * ============================================================ */

function natureOptionLabel(
  definition,
  language,
  labels
) {

  const name =
    localizedNatureName(
      definition,
      language
    );


  if (
    !definition.increase ||
    !definition.decrease
  ) {

    return (
      `${name} — ` +
      labels.natureNeutral
    );
  }


  return (
    `${name} — ` +
    `${definition.increase.toUpperCase()} +1 / ` +
    `${definition.decrease.toUpperCase()} −1`
  );
}


function natureModifiersMarkup(
  definition,
  labels
) {

  if (!definition) {

    return `
      <span
        class="
          poke5e-pokemon-nature__modifier
          poke5e-pokemon-nature__modifier--neutral
        "
      >
        —
      </span>
    `;
  }


  if (
    !definition.increase ||
    !definition.decrease
  ) {

    return `
      <span
        class="
          poke5e-pokemon-nature__modifier
          poke5e-pokemon-nature__modifier--neutral
        "
      >
        ${escapeHtml(labels.natureNeutral)}
      </span>
    `;
  }


  return `
    <div class="poke5e-pokemon-nature__modifiers">

      <span class="poke5e-pokemon-nature__modifier--increase">

        <i
          class="fa-solid fa-arrow-up"
          aria-hidden="true"
        ></i>

        <strong>
          ${escapeHtml(
            definition.increase.toUpperCase()
          )}
        </strong>

        <small>
          +1
        </small>

      </span>


      <span class="poke5e-pokemon-nature__modifier--decrease">

        <i
          class="fa-solid fa-arrow-down"
          aria-hidden="true"
        ></i>

        <strong>
          ${escapeHtml(
            definition.decrease.toUpperCase()
          )}
        </strong>

        <small>
          −1
        </small>

      </span>

    </div>
  `;
}


function natureMarkup(
  nature,
  labels,
  language
) {

  const definition =
    nature?.definition ??
    null;


  const currentId =
    String(
      nature?.id ??
      ""
    );


  const currentName =
    definition
      ? localizedNatureName(
          definition,
          language
        )
      : labels.noNature;


  const controlMarkup =
    game.user.isGM
      ? `
        <select
          data-pokemon-sheet-field="nature"
          data-nature-current="${escapeHtml(currentId)}"
          title="${escapeHtml(labels.editNature)}"
          aria-label="${escapeHtml(labels.editNature)}"
        >

          ${
            currentId
              ? ""
              : `
                <option
                  value=""
                  selected
                  disabled
                >
                  ${escapeHtml(labels.noNature)}
                </option>
              `
          }

          ${
            listNatureDefinitions()
              .map(
                natureDefinition => `
                  <option
                    value="${escapeHtml(natureDefinition.id)}"
                    ${
                      natureDefinition.id ===
                        currentId
                        ? "selected"
                        : ""
                    }
                  >
                    ${escapeHtml(
                      natureOptionLabel(
                        natureDefinition,
                        language,
                        labels
                      )
                    )}
                  </option>
                `
              )
              .join("")
          }

        </select>
      `
      : `
        <strong class="poke5e-pokemon-nature__name">
          ${escapeHtml(currentName)}
        </strong>
      `;


  return `
    <div
      class="poke5e-pokemon-nature"
      data-nature-id="${escapeHtml(currentId)}"
    >

      <span class="poke5e-pokemon-nature__label">

        <i
          class="fa-solid fa-sparkles"
          aria-hidden="true"
        ></i>

        ${escapeHtml(labels.nature)}

      </span>


      <div class="poke5e-pokemon-nature__control">

        ${controlMarkup}

      </div>


      ${natureModifiersMarkup(
        definition,
        labels
      )}

    </div>
  `;
}

/* ============================================================
 * SHINY
 * ============================================================ */

function shinyMarkup(
  shinyState,
  labels
) {

  const resolved =
    Boolean(
      shinyState
    );


  const isShiny =
    shinyState?.isShiny ===
    true;


  /*
   * Para Players solo mostramos información
   * cuando el Pokémon realmente es Shiny.
   */
  if (
    !game.user.isGM &&
    !isShiny
  ) {

    return "";
  }


  const stateId =
    !resolved
      ? "unresolved"
      : isShiny
        ? "shiny"
        : "normal";


  /*
   * Player: badge informativo.
   */
  if (
    !game.user.isGM
  ) {

    return `
      <span
        class="poke5e-pokemon-shiny-badge"
        data-shiny-state="shiny"
      >

        <i
          class="fa-solid fa-star"
          aria-hidden="true"
        ></i>

        ${escapeHtml(labels.shiny)}

      </span>
    `;
  }


  /*
   * GM: selector explícito.
   *
   * No confundimos un estado no resuelto
   * con "Normal".
   */
  const currentValue =
    resolved
      ? String(
          isShiny
        )
      : "";


  return `
    <label
      class="poke5e-pokemon-shiny-control"
      data-shiny-state="${escapeHtml(stateId)}"
    >

      <i
        class="fa-solid fa-star"
        aria-hidden="true"
      ></i>

      <select
        data-pokemon-sheet-field="shiny"
        data-shiny-current="${escapeHtml(currentValue)}"
        title="${escapeHtml(labels.editShiny)}"
        aria-label="${escapeHtml(labels.editShiny)}"
      >

        ${
          resolved
            ? ""
            : `
              <option
                value=""
                selected
                disabled
              >
                ${escapeHtml(labels.unresolvedShiny)}
              </option>
            `
        }

        <option
          value="false"
          ${resolved && !isShiny ? "selected" : ""}
        >
          ${escapeHtml(labels.normalAppearance)}
        </option>

        <option
          value="true"
          ${isShiny ? "selected" : ""}
        >
          ${escapeHtml(labels.shiny)}
        </option>

      </select>

    </label>
  `;
}

/* ============================================================
 * NAME
 * ============================================================ */

function pokemonNameMarkup(
  pokemon,
  labels
) {

  const displayName =
    cleanPokemonName(
      pokemon.name
    );


  if (
    !canCurrentUserRenamePokemon(
      pokemon
    )
  ) {

    return `
      <h2
        class="
          poke5e-pokemon-nickname
          poke5e-pokemon-nickname--readonly
        "
      >

        <span class="poke5e-pokemon-nickname__text">
          ${escapeHtml(displayName)}
        </span>

      </h2>
    `;
  }


  return `
    <h2 class="poke5e-pokemon-nickname">

      <span class="poke5e-pokemon-nickname__field">

        <input
          type="text"
          class="poke5e-pokemon-nickname__input"
          autocomplete="off"
          spellcheck="false"
          value="${escapeHtml(displayName)}"
          data-pokemon-sheet-field="nickname"
          data-nickname-current="${escapeHtml(displayName)}"
          title="${escapeHtml(labels.editNickname)}"
          aria-label="${escapeHtml(labels.editNickname)}"
        >


        <i
          class="
            fa-solid
            fa-pen
            poke5e-pokemon-nickname__edit-icon
          "
          aria-hidden="true"
        ></i>

      </span>

    </h2>
  `;
}

/* ============================================================
 * GENDER
 * ============================================================ */

function pokemonGenderSymbol(
  genderId
) {

  if (
    genderId ===
      "male"
  ) {

    return "♂";
  }


  if (
    genderId ===
      "female"
  ) {

    return "♀";
  }


  return "○";
}


function pokemonGenderMarkup(
  pokemon,
  gender,
  labels,
  language
) {

  const canModify =
    canCurrentUserModifyPokemonGender(
      pokemon
    );


  if (
    !gender &&
    !canModify
  ) {

    return "";
  }


  /*
   * Player:
   * badge informativo compacto.
   */
  if (!canModify) {

    const genderId =
      gender?.id;


    if (!genderId) {

      return "";
    }


    return `
      <span
        class="
          poke5e-pokemon-gender
          poke5e-pokemon-gender--readonly
        "
        data-gender="${escapeHtml(genderId)}"
      >

        <span
          class="poke5e-pokemon-gender__symbol"
          aria-hidden="true"
        >
          ${escapeHtml(
            pokemonGenderSymbol(
              genderId
            )
          )}
        </span>


        <span class="poke5e-pokemon-gender__name">
          ${escapeHtml(
            localizedPokemonGenderName(
              genderId,
              language
            )
          )}
        </span>

      </span>
    `;
  }


  /*
   * GM:
   * mismo lenguaje visual,
   * pero con selector editable.
   */
  const currentId =
    gender?.id ??
    "";


  return `
    <label
      class="
        poke5e-pokemon-gender
        poke5e-pokemon-gender--editable
      "
      data-gender="${escapeHtml(
        currentId ||
        "unresolved"
      )}"
    >

      <span
        class="poke5e-pokemon-gender__symbol"
        aria-hidden="true"
      >
        ${escapeHtml(
          currentId
            ? pokemonGenderSymbol(
                currentId
              )
            : "?"
        )}
      </span>


      <select
        class="poke5e-pokemon-gender__select"
        data-pokemon-sheet-field="gender"
        data-gender-current="${escapeHtml(currentId)}"
        title="${escapeHtml(labels.editGender)}"
        aria-label="${escapeHtml(labels.editGender)}"
      >

        ${
          currentId
            ? ""
            : `
              <option
                value=""
                selected
                disabled
              >
                ${escapeHtml(labels.genderUnresolved)}
              </option>
            `
        }

        ${
          POKEMON_GENDER_IDS
            .map(
              genderId => `
                <option
                  value="${escapeHtml(genderId)}"
                  ${genderId === currentId ? "selected" : ""}
                >
                  ${escapeHtml(
                    localizedPokemonGenderName(
                      genderId,
                      language
                    )
                  )}
                </option>
              `
            )
            .join("")
        }

      </select>

    </label>
  `;
}

/* ============================================================
 * TEXT
 * ============================================================ */

function htmlToText(
  value
) {

  const element =
    document.createElement(
      "div"
    );


  element.innerHTML =
    String(
      value ??
      ""
    );


  return String(
    element.textContent ??
    ""
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


/* ============================================================
 * DISPLAY
 * ============================================================ */

function formatDexNumber(
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

    return "#???";
  }


  return `#${String(
    Math.trunc(
      numeric
    )
  ).padStart(
    3,
    "0"
  )}`;
}


function formatSr(
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
    String(numeric)
  );
}


function typeLabel(
  type,
  language
) {

  const normalized =
    normalizeType(
      type
    );


  return (
    TYPE_LABELS[
      language
    ]?.[
      normalized
    ] ??
    TYPE_LABELS.en[
      normalized
    ] ??
    normalized
  );
}


function typeBadgeMarkup(
  type,
  language,
  multiplier = null,
  title = null
) {

  const normalized =
    normalizeType(
      type
    );


  const multiplierMarkup =
    multiplier == null
      ? ""
      : `
        <small>
          ×${escapeHtml(multiplier)}
        </small>
      `;


  return `
    <span
      class="poke5e-pokemon-type-badge"
      data-type="${escapeHtml(normalized)}"
      ${title ? `title="${escapeHtml(title)}"` : ""}
    >
      ${escapeHtml(
        typeLabel(
          normalized,
          language
        )
      )}

      ${multiplierMarkup}
    </span>
  `;
}

function typeSelectOptionsMarkup({
  selected,
  disabledType = null,
  language,
  includeEmpty = false,
  emptyLabel = ""
}) {

  const emptyOption =
    includeEmpty
      ? `
        <option
          value=""
          ${selected ? "" : "selected"}
        >
          ${escapeHtml(emptyLabel)}
        </option>
      `
      : "";


  const options =
    POKEMON_TYPE_IDS
      .map(
        type => `
          <option
            value="${escapeHtml(type)}"
            ${type === selected ? "selected" : ""}
            ${type === disabledType ? "disabled" : ""}
          >
            ${escapeHtml(
              typeLabel(
                type,
                language
              )
            )}
          </option>
        `
      )
      .join("");


  return (
    emptyOption +
    options
  );
}


function pokemonTypesMarkup(
  types,
  language,
  labels
) {

  /*
   * Players siguen viendo los badges.
   *
   * No reciben controles de edición.
   */
  if (
    !game.user.isGM
  ) {

    return types
      .map(
        type =>
          typeBadgeMarkup(
            type,
            language
          )
      )
      .join("");
  }


  const primary =
    types[0] ??
    "normal";


  const secondary =
    types[1] ??
    "";


  return `
    <div
      class="poke5e-pokemon-type-controls"
      title="${escapeHtml(labels.editTypes)}"
    >

      <label
        class="
          poke5e-pokemon-type-control
          poke5e-pokemon-type-control--primary
        "
        data-type="${escapeHtml(primary)}"
      >

        <span class="poke5e-pokemon-type-control__label">

          <i
            class="fa-solid fa-circle-dot"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHtml(labels.primaryType)}
          </span>

        </span>


        <span class="poke5e-pokemon-type-control__select-wrap">

          <span
            class="poke5e-pokemon-type-control__swatch"
            aria-hidden="true"
          ></span>

          <select
            data-pokemon-sheet-field="type-primary"
            data-type-current="${escapeHtml(primary)}"
            aria-label="${escapeHtml(labels.primaryType)}"
          >
            ${typeSelectOptionsMarkup({
              selected:
                primary,

              disabledType:
                secondary ||
                null,

              language
            })}
          </select>

        </span>

      </label>


      <label
        class="
          poke5e-pokemon-type-control
          poke5e-pokemon-type-control--secondary
        "
        data-type="${escapeHtml(
          secondary ||
          "typeless"
        )}"
      >

        <span class="poke5e-pokemon-type-control__label">

          <i
            class="fa-solid fa-circle-half-stroke"
            aria-hidden="true"
          ></i>

          <span>
            ${escapeHtml(labels.secondaryType)}
          </span>

        </span>


        <span class="poke5e-pokemon-type-control__select-wrap">

          <span
            class="poke5e-pokemon-type-control__swatch"
            aria-hidden="true"
          ></span>

          <select
            data-pokemon-sheet-field="type-secondary"
            data-type-current="${escapeHtml(secondary)}"
            aria-label="${escapeHtml(labels.secondaryType)}"
          >
            ${typeSelectOptionsMarkup({
              selected:
                secondary,

              disabledType:
                primary,

              language,

              includeEmpty:
                true,

              emptyLabel:
                labels.noSecondaryType
            })}
          </select>

        </span>

      </label>

    </div>
  `;
}

function movementMarkup(
  movement,
  labels
) {

  const entriesMarkup =
    movement.entries.length
      ? movement.entries
          .map(
            entry => `
              <span
                class="poke5e-pokemon-movement__entry"
                title="${escapeHtml(entry.label)}"
              >

                <i
                  class="${escapeHtml(entry.icon)}"
                  aria-hidden="true"
                ></i>

                <strong>
                  ${escapeHtml(entry.value)}
                </strong>

                <small>
                  ${escapeHtml(entry.units)}
                </small>

              </span>
            `
          )
          .join("")
      : `
        <span class="poke5e-pokemon-empty">
          —
        </span>
      `;


  const hoverMarkup =
    movement.hover
      ? `
        <span
          class="
            poke5e-pokemon-movement__entry
            poke5e-pokemon-movement__entry--hover
          "
          title="${escapeHtml(labels.hover)}"
        >

          <i
            class="fa-solid fa-wind"
            aria-hidden="true"
          ></i>

          <strong>
            ${escapeHtml(labels.hover)}
          </strong>

        </span>
      `
      : "";


  return `
    <div class="poke5e-pokemon-movement">

      ${entriesMarkup}

      ${hoverMarkup}

    </div>
  `;
}

function initiativeMarkup(
  initiative,
  labels
) {

  const total =
    initiative.total == null
      ? "—"
      : signedNumber(
          initiative.total
        );


  const abilityId =
    String(
      initiative.abilityId ??
      ""
    )
      .trim()
      .toUpperCase();


  return `
    <button
      type="button"
      class="poke5e-pokemon-initiative"
      data-pokemon-sheet-action="initiative-roll"
      title="${escapeHtml(labels.rollInitiative)}"
      aria-label="${escapeHtml(labels.rollInitiative)}"
    >

      <span class="poke5e-pokemon-initiative__label">

        <i
          class="fa-solid fa-dice-d20"
          aria-hidden="true"
        ></i>

        <span>
          ${escapeHtml(labels.initiative)}
        </span>

      </span>


      <strong>
        ${escapeHtml(total)}
      </strong>


      <small>
        ${escapeHtml(abilityId)}
      </small>

    </button>
  `;
}

function experienceMarkup(
  experience,
  labels
) {

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


  const thresholdMarkup =
    experience.isMaxLevel
      ? `
        <span class="poke5e-pokemon-experience__max">
          ${escapeHtml(labels.maxLevel)}
        </span>
      `
      : `
        <span>
          /
          ${escapeHtml(
            experience.nextLevelXp
          )}
        </span>
      `;


  const remainingMarkup =
    !experience.isMaxLevel &&
    !experience.readyToLevel
      ? `
        <small>
          ${escapeHtml(labels.experienceRemaining)}
          ${escapeHtml(experience.xpRemaining)}
          XP
        </small>
      `
      : "";


  const readyMarkup =
    game.user.isGM &&
    experience.readyToLevel
      ? `
        <strong class="poke5e-pokemon-experience__ready">

          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          ${escapeHtml(labels.readyToLevel)}

        </strong>
      `
      : "";


  return `
    <section
      class="poke5e-pokemon-experience"
      data-ready-to-level="${
        experience.readyToLevel
          ? "true"
          : "false"
      }"
      data-max-level="${
        experience.isMaxLevel
          ? "true"
          : "false"
      }"
    >

      <div class="poke5e-pokemon-experience__header">

        <div class="poke5e-pokemon-experience__label">

          <i
            class="fa-solid fa-chart-line"
            aria-hidden="true"
          ></i>

          <strong>
            ${escapeHtml(labels.experience)}
          </strong>

        </div>


        <div class="poke5e-pokemon-experience__value">

          <span>
            EXP
          </span>

          <input
            type="text"
            inputmode="numeric"
            autocomplete="off"
            value="${escapeHtml(experience.total)}"
            data-pokemon-sheet-field="experience"
            data-experience-current="${escapeHtml(experience.total)}"
            title="${escapeHtml(labels.editExperience)}"
            aria-label="${escapeHtml(labels.editExperience)}"
          >

          ${thresholdMarkup}

        </div>

      </div>


      <div class="poke5e-pokemon-experience__track">

        <span
          style="width: ${percent}%"
        ></span>

      </div>


      <div class="poke5e-pokemon-experience__footer">

        ${remainingMarkup}

        ${readyMarkup}

      </div>

    </section>
  `;
}

function technicalValueMarkup(
  label,
  value
) {

  return `
    <div class="poke5e-pokemon-technical__field">

      <span>
        ${escapeHtml(label)}
      </span>

      <code>
        ${escapeHtml(
          value ??
          "—"
        )}
      </code>

    </div>
  `;
}


function technicalDetailsMarkup({
  pokemon,
  trainer,
  flags,
  primaryType,
  knownMoves,
  moveLimit,
  labels,
  open
}) {

  if (
    !game.user.isGM
  ) {

    return "";
  }


  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  const sheetClass =
    pokemon.getFlag(
      "core",
      "sheetClass"
    );


  return `
    <section
      class="poke5e-pokemon-technical"
      data-pokemon-technical-panel
      ${open ? "" : "hidden"}
    >

      <header>

        <i
          class="fa-solid fa-code"
          aria-hidden="true"
        ></i>

        <strong>
          ${escapeHtml(labels.technicalData)}
        </strong>

      </header>


      <div class="poke5e-pokemon-technical__grid">

        ${technicalValueMarkup(
          labels.actorId,
          pokemon.id
        )}

        ${technicalValueMarkup(
          labels.actorUuid,
          pokemon.uuid
        )}

        ${technicalValueMarkup(
          labels.actorType,
          pokemon.type
        )}

        ${technicalValueMarkup(
          labels.sourceId,
          flags.sourceId
        )}

        ${technicalValueMarkup(
          "Dex",
          formatDexNumber(
            flags.dexNumber
          )
        )}

        ${technicalValueMarkup(
          labels.level,
          flags.level
        )}

        ${technicalValueMarkup(
          "SR",
          formatSr(
            flags.sr
          )
        )}

        ${technicalValueMarkup(
          labels.primaryTypeId,
          primaryType
        )}

        ${technicalValueMarkup(
          labels.activeAbilityId,
          flags.activeAbilityId
        )}

        ${technicalValueMarkup(
          labels.trainerUuid,
          trainerUuid ??
          trainer?.uuid
        )}

        ${technicalValueMarkup(
          labels.sheetClass,
          sheetClass
        )}

        ${technicalValueMarkup(
          labels.moveSlots,
          `${knownMoves.length}/${moveLimit}`
        )}

      </div>

    </section>
  `;
}

/* ============================================================
 * STATS
 * ============================================================ */

function statsMarkup(
  pokemon,
  labels
) {

  const permanentScores =
    getPokemonPermanentAbilityScores(
      pokemon
    );


  const canEdit =
    canCurrentUserEditPokemonAbilityScores(
      pokemon
    );


  return ABILITY_IDS
    .map(
      abilityId => {

        const ability =
          pokemon.system
            ?.abilities
            ?.[abilityId];


        const effectiveValue =
          Number(
            ability?.value ??
            0
          );


        const permanentValue =
          Number(
            permanentScores[
              abilityId
            ] ??
            effectiveValue
          );


        const modifier =
          Number(
            ability?.mod ??
            0
          );


        const saveProficient =
          Boolean(
            ability
              ?.saveProf
              ?.hasProficiency
          );


        const checkTitle =
          `${labels.abilityCheck}: ${abilityId.toUpperCase()}`;


        const saveTitle =
          `${labels.savingThrow}: ${abilityId.toUpperCase()}`;


        const normalizedPermanentValue =
          Number.isFinite(
            permanentValue
          )
            ? permanentValue
            : 10;


        const normalizedEffectiveValue =
          Number.isFinite(
            effectiveValue
          )
            ? effectiveValue
            : null;


        const scoreTitle =
          `${labels.editAbilityScore}: ${abilityId.toUpperCase()} · ` +
          `${labels.effectiveAbilityScore}: ${
            normalizedEffectiveValue ??
            "—"
          }`;


        const scoreMarkup =
          canEdit
            ? `
              <div class="poke5e-pokemon-stat__score-editor">

                <input
                  type="number"
                  class="poke5e-pokemon-stat__score-input"
                  inputmode="numeric"
                  min="1"
                  max="30"
                  step="1"
                  value="${escapeHtml(normalizedPermanentValue)}"
                  data-pokemon-sheet-field="ability-score"
                  data-ability-id="${escapeHtml(abilityId)}"
                  data-ability-score-current="${escapeHtml(
                    normalizedPermanentValue
                  )}"
                  title="${escapeHtml(scoreTitle)}"
                  aria-label="${escapeHtml(scoreTitle)}"
                >

                <i
                  class="fa-solid fa-pen"
                  aria-hidden="true"
                ></i>

              </div>
            `
            : `
              <strong class="poke5e-pokemon-stat__score-value">
                ${
                  normalizedEffectiveValue ??
                  "—"
                }
              </strong>
            `;


        return `
          <article
            class="poke5e-pokemon-stat"
            data-ability-id="${escapeHtml(abilityId)}"
            data-save-proficient="${
              saveProficient
                ? "true"
                : "false"
            }"
            data-score-editable="${
              canEdit
                ? "true"
                : "false"
            }"
          >

            <header class="poke5e-pokemon-stat__header">

              <span class="poke5e-pokemon-stat__label">

                ${escapeHtml(
                  abilityId.toUpperCase()
                )}

                ${
                  saveProficient
                    ? `
                      <i
                        class="fa-solid fa-star"
                        title="${escapeHtml(labels.saveProficient)}"
                        aria-label="${escapeHtml(labels.saveProficient)}"
                      ></i>
                    `
                    : ""
                }

              </span>


              <span class="poke5e-pokemon-stat__modifier">

                <small>
                  MOD
                </small>

                <strong>
                  ${escapeHtml(
                    signedNumber(
                      modifier
                    )
                  )}
                </strong>

              </span>

            </header>


            <div class="poke5e-pokemon-stat__score">

              ${scoreMarkup}

            </div>


            <div class="poke5e-pokemon-stat__actions">

              <button
                type="button"
                data-pokemon-sheet-action="ability-roll"
                data-ability-id="${escapeHtml(abilityId)}"
                data-roll-type="check"
                title="${escapeHtml(checkTitle)}"
                aria-label="${escapeHtml(checkTitle)}"
              >

                <i
                  class="fa-solid fa-dice-d20"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHtml(labels.checkShort)}
                </span>

              </button>


              <button
                type="button"
                class="${
                  saveProficient
                    ? "is-proficient"
                    : ""
                }"
                data-pokemon-sheet-action="ability-roll"
                data-ability-id="${escapeHtml(abilityId)}"
                data-roll-type="save"
                title="${escapeHtml(saveTitle)}"
                aria-label="${escapeHtml(saveTitle)}"
              >

                <i
                  class="fa-solid fa-shield-halved"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHtml(labels.saveShort)}
                </span>

              </button>

            </div>

          </article>
        `;
      }
    )
    .join("");
}

function pokemonSkills(
  pokemon,
  language
) {

  const systemSkills =
    pokemon.system
      ?.skills ??
    {};


  const rollData =
    typeof pokemon
      .getRollData ===
    "function"
      ? pokemon.getRollData()
      : {};


  const derivedSkills =
    rollData
      ?.skills ??
    {};


  return Object.entries(
    SKILL_DEFINITIONS
  )
    .map(
      (
        [
          skillId,
          definition
        ]
      ) => {

        const skill =
          systemSkills[
            skillId
          ];


        const proficiency =
          Number(
            skill?.value ??
            0
          );


        /*
         * El DataModel D&D puede contener
         * las 18 Skills aunque el Pokémon
         * no sea competente en ellas.
         *
         * Poke5e solo nos interesa aquí
         * cuando value > 0.
         */
        if (
          !skill ||
          !Number.isFinite(
            proficiency
          ) ||
          proficiency <= 0
        ) {

          return null;
        }


        const configuredAbility =
          String(
            skill.ability ??
            ""
          )
            .trim()
            .toLowerCase();


        const dndAbility =
          String(
            CONFIG.DND5E
              ?.skills
              ?.[skillId]
              ?.ability ??
            ""
          )
            .trim()
            .toLowerCase();


        const abilityId =
          configuredAbility ||
          dndAbility ||
          definition.ability;


        const total =
          Number(
            derivedSkills
              ?.[skillId]
              ?.total
          );


        return {
          id:
            skillId,

          name:
            definition[
              language
            ] ??
            definition.en,

          abilityId,

          proficiency,

          expertise:
            proficiency >= 2,

          total:
            Number.isFinite(
              total
            )
              ? total
              : null
        };
      }
    )
    .filter(Boolean)
    .sort(
      (
        left,
        right
      ) =>
        left.name.localeCompare(
          right.name,
          language
        )
    );
}

function skillMarkup(
  skill,
  labels
) {

  const proficiencyLabel =
    skill.expertise
      ? labels.skillExpertise
      : labels.skillProficient;


  const proficiencyIcon =
    skill.expertise
      ? "fa-solid fa-star"
      : "fa-solid fa-circle";


  const expertiseClass =
    skill.expertise
      ? " poke5e-pokemon-skill--expertise"
      : "";


  const title =
    `${labels.rollSkill}: ${skill.name}`;


  const total =
    skill.total == null
      ? "—"
      : signedNumber(
          skill.total
        );


  return `
    <button
      type="button"
      class="poke5e-pokemon-skill${expertiseClass}"
      data-pokemon-sheet-action="skill-roll"
      data-skill-id="${escapeHtml(skill.id)}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >

      <span class="poke5e-pokemon-skill__name">

        <i
          class="${escapeHtml(proficiencyIcon)}"
          title="${escapeHtml(proficiencyLabel)}"
          aria-label="${escapeHtml(proficiencyLabel)}"
        ></i>

        <span>
          ${escapeHtml(skill.name)}
        </span>

      </span>


      <strong>
        ${escapeHtml(total)}
      </strong>


      <small>
        ${escapeHtml(
          skill.abilityId.toUpperCase()
        )}
      </small>

    </button>
  `;
}

function skillsPanelMarkup(
  skills,
  labels
) {

  if (
    !skills.length
  ) {

    return "";
  }


  return `
    <section
      class="
        poke5e-pokemon-panel
        poke5e-pokemon-panel--skills
      "
    >

      <header>

        <i
          class="fa-solid fa-list-check"
          aria-hidden="true"
        ></i>

        <h3>
          ${escapeHtml(labels.skills)}
        </h3>

      </header>


      <div class="poke5e-pokemon-skills">

        ${
          skills
            .map(
              skill =>
                skillMarkup(
                  skill,
                  labels
                )
            )
            .join("")
        }

      </div>

    </section>
  `;
}

/* ============================================================
 * CONCENTRATION
 * ============================================================ */

function pokemonConcentrationMarkup(
  concentrations,
  labels
) {

  if (
    !concentrations.length
  ) {

    return "";
  }


  return `
    <section
      class="
        poke5e-pokemon-panel
        poke5e-pokemon-panel--concentration
      "
    >

      <header>

        <i
          class="fa-solid fa-brain"
          aria-hidden="true"
        ></i>

        <h3>
          ${escapeHtml(labels.concentration)}
        </h3>

      </header>


      <div class="poke5e-pokemon-concentrations">

        ${
          concentrations
            .map(
              concentration => `
                <article
                  class="poke5e-pokemon-concentration"
                  data-effect-id="${escapeHtml(
                    concentration.effectId
                  )}"
                >

                  <div class="poke5e-pokemon-concentration__icon">

                    <img
                      src="${escapeHtml(
                        concentration.img ||
                        DEFAULT_IMAGE
                      )}"
                      alt=""
                    >

                  </div>


                  <div class="poke5e-pokemon-concentration__body">

                    <small>
                      ${escapeHtml(
                        labels.concentrationMaintaining
                      )}
                    </small>

                    <strong>
                      ${escapeHtml(
                        concentration.name
                      )}
                    </strong>

                  </div>


                  ${
                    game.user.isGM
                      ? `
                        <button
                          type="button"
                          class="poke5e-pokemon-concentration__end"
                          data-pokemon-sheet-action="concentration-end"
                          data-effect-id="${escapeHtml(
                            concentration.effectId
                          )}"
                          title="${escapeHtml(
                            labels.endConcentration
                          )}"
                          aria-label="${escapeHtml(
                            labels.endConcentration
                          )}"
                        >

                          <i
                            class="fa-solid fa-xmark"
                            aria-hidden="true"
                          ></i>

                          <span>
                            ${escapeHtml(
                              labels.endConcentration
                            )}
                          </span>

                        </button>
                      `
                      : ""
                  }

                </article>
              `
            )
            .join("")
        }

      </div>

    </section>
  `;
}

/* ============================================================
 * STATUSES
 * ============================================================ */

function pokemonStatusKindLabel(
  status,
  labels
) {

  if (
    status.nonVolatile
  ) {

    return labels
      .nonVolatileStatus;
  }


  if (
    status.volatile
  ) {

    return labels
      .volatileStatus;
  }


  return labels
    .activeStatus;
}

function pokemonStatusesMarkup({
  statuses,
  options,
  labels,
  canModify
}) {

  const activeIds =
    new Set(
      statuses.map(
        status =>
          status.id
      )
    );


  const available =
    options.filter(
      option =>
        !activeIds.has(
          option.id
        )
    );


  const statusMarkup =
    statuses.length
      ? statuses
          .map(
            status => {

              const kind =
                status.nonVolatile
                  ? "non-volatile"
                  : status.volatile
                    ? "volatile"
                    : "other";


              return `
                <article
                  class="poke5e-pokemon-status"
                  data-status-id="${escapeHtml(status.id)}"
                  data-status-kind="${escapeHtml(kind)}"
                >

                  <div class="poke5e-pokemon-status__icon">

                    <img
                      src="${escapeHtml(
                        status.img ||
                        DEFAULT_IMAGE
                      )}"
                      alt=""
                    >

                  </div>


                  <div class="poke5e-pokemon-status__body">

                    <strong>
                      ${escapeHtml(status.name)}
                    </strong>

                    <small>
                      ${escapeHtml(
                        pokemonStatusKindLabel(
                          status,
                          labels
                        )
                      )}
                    </small>

                  </div>


                  ${
                    canModify
                      ? `
                        <button
                          type="button"
                          class="poke5e-pokemon-status__remove"
                          data-pokemon-sheet-action="status-remove"
                          data-effect-id="${escapeHtml(status.effectId)}"
                          title="${escapeHtml(
                            `${labels.removeStatus}: ${status.name}`
                          )}"
                          aria-label="${escapeHtml(
                            `${labels.removeStatus}: ${status.name}`
                          )}"
                        >

                          <i
                            class="fa-solid fa-xmark"
                            aria-hidden="true"
                          ></i>

                        </button>
                      `
                      : ""
                  }

                </article>
              `;
            }
          )
          .join("")
      : `
        <div class="poke5e-pokemon-statuses__empty">

          <span class="poke5e-pokemon-statuses__empty-icon">

            <i
              class="fa-solid fa-heart-pulse"
              aria-hidden="true"
            ></i>

          </span>

          <div>

            <strong>
              ${escapeHtml(labels.noStatuses)}
            </strong>

            <small>
              ${escapeHtml(labels.activeStatus)}
            </small>

          </div>

        </div>
      `;


  const addMarkup =
    canModify
      ? `
        <label class="poke5e-pokemon-status-add">

          <i
            class="fa-solid fa-plus"
            aria-hidden="true"
          ></i>

          <select
            data-pokemon-sheet-field="status-add"
            aria-label="${escapeHtml(labels.addStatus)}"
            title="${escapeHtml(labels.addStatus)}"
            ${available.length ? "" : "disabled"}
          >

            <option
              value=""
              selected
              disabled
            >
              ${escapeHtml(labels.addStatus)}
            </option>

            ${
              available
                .map(
                  option => `
                    <option value="${escapeHtml(option.id)}">
                      ${escapeHtml(option.name)}
                    </option>
                  `
                )
                .join("")
            }

          </select>

        </label>
      `
      : "";


  return `
    <section
      class="
        poke5e-pokemon-panel
        poke5e-pokemon-panel--statuses
      "
    >

      <header>

        <i
          class="fa-solid fa-heart-pulse"
          aria-hidden="true"
        ></i>

        <h3>
          ${escapeHtml(labels.statuses)}
        </h3>


        <span class="poke5e-pokemon-statuses__count">

          ${statuses.length}

          <small>
            ${
              statuses.length ===
                1
                ? "ACTIVE"
                : "ACTIVE"
            }
          </small>

        </span>


        ${addMarkup}

      </header>


      <div class="poke5e-pokemon-statuses">

        ${statusMarkup}

      </div>

    </section>
  `;
}

/* ============================================================
 * MATCHUPS
 * ============================================================ */

function pokemonMatchups(
  pokemon
) {

  const defenses =
    pokemon.getFlag(
      MODULE_ID,
      "defenses"
    );


  if (
    !defenses ||
    typeof defenses !==
      "object"
  ) {

    return {
      immunities: [],
      resistances: [],
      weaknesses: []
    };
  }


  const result = {
    immunities: [],
    resistances: [],
    weaknesses: []
  };


  for (
    const [
      type,
      rawMultiplier
    ]
    of Object.entries(
      defenses
    )
  ) {

    const multiplier =
      Number(
        rawMultiplier
      );


    if (
      !Number.isFinite(
        multiplier
      )
    ) {

      continue;
    }


    if (
      multiplier === 0
    ) {

      result.immunities.push({
        type,
        multiplier:
          "0"
      });

      continue;
    }


    /*
     * Poke5e no acumula resistencias
     * hasta ×0.25 / ×0.125.
     *
     * Cualquier resultado inferior a 1
     * se considera Resistance: ×0.5.
     */
    if (
      multiplier < 1
    ) {

      result.resistances.push({
        type,
        multiplier:
          "½"
      });

      continue;
    }


    /*
     * Poke5e no acumula vulnerabilidades
     * hasta ×4 / ×8.
     *
     * Cualquier resultado superior a 1
     * se considera Vulnerability: ×2.
     */
    if (
      multiplier > 1
    ) {

      result.weaknesses.push({
        type,
        multiplier:
          "2"
      });
    }
  }

  applyStoringPowerMatchups(
    pokemon,
    result
  );

  return result;
}



function matchupGroupMarkup(
  title,
  entries,
  language
) {

  const content =
    entries.length
      ? entries
          .map(
            entry =>
              typeBadgeMarkup(
                entry.type,
                language,
                entry.multiplier,
                entry.storingPower ? LABELS[language].storingPower : null
              )
          )
          .join("")
      : `
        <span class="poke5e-pokemon-empty">
          ${
            LABELS[
              language
            ].none
          }
        </span>
      `;


  return `
    <div class="poke5e-pokemon-matchup-group">

      <strong>
        ${escapeHtml(title)}
      </strong>

      <div>
        ${content}
      </div>

    </div>
  `;
}


/* ============================================================
 * MOVES
 * ============================================================ */

function getMoveActivities(
  move
) {

  const activities =
    move.system
      ?.activities;


  if (
    !activities ||
    typeof activities.values !==
      "function"
  ) {

    return [];
  }


  return Array.from(
    activities.values()
  ).filter(
    activity =>
      activity?.canUse !== false
  );
}


function activityAttackScope(
  activity
) {

  const scope =
    String(
      activity?.attack
        ?.type
        ?.value ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    scope === "melee" ||
    scope === "ranged"
  )
    ? scope
    : null;
}


function hasAttackScopeVariants(
  activities
) {

  const scopes =
    new Set(
      activities
        .map(
          activityAttackScope
        )
        .filter(Boolean)
    );


  return scopes.size > 1;
}


function activityLabel(
  move,
  activity,
  labels
) {

  const scope =
    activityAttackScope(
      activity
    );


  if (
    activity?.type ===
      "attack" &&
    scope
  ) {

    return labels[
      scope
    ];
  }


  const activityName =
    String(
      activity?.name ??
      ""
    ).trim();


  const moveName =
    String(
      move.name ??
      ""
    ).trim();


  if (
    activityName &&
    moveName &&
    activityName !==
      moveName
  ) {

    const prefix =
      `${moveName} — `;


    return activityName.startsWith(
      prefix
    )
      ? activityName.slice(
          prefix.length
        )
      : activityName;
  }


  return (
    labels[
      activity?.type
    ] ??
    labels.use
  );
}


function activityIcon(
  activity
) {

  const scope =
    activityAttackScope(
      activity
    );


  if (
    scope ===
    "melee"
  ) {

    return "fa-solid fa-hand-fist";
  }


  if (
    scope ===
    "ranged"
  ) {

    return "fa-solid fa-crosshairs";
  }


  if (
    activity?.type ===
    "save"
  ) {

    return "fa-solid fa-shield-halved";
  }


  if (
    activity?.type ===
    "attack"
  ) {

    return "fa-solid fa-dice-d20";
  }


  return "fa-solid fa-sparkles";
}


function activityRange(
  activity
) {

  const value =
    activity?.range
      ?.value;


  const units =
    activity?.range
      ?.units;


  if (!value) {

    return "—";
  }


  return `${value}${
    units
      ? ` ${units}`
      : ""
  }`;
}


function moveActivityButtonMarkup(
  move,
  activity,
  labels,
  compactAttackScopes
) {

  const scope =
    compactAttackScopes
      ? activityAttackScope(
          activity
        )
      : null;


  const label =
    scope
      ? labels[
          scope
        ]
      : activityLabel(
          move,
          activity,
          labels
        );


  const icon =
    activityIcon(
      activity
    );


  const title =
    scope
      ? `${move.name} — ${label}`
      : (
          activity.name ||
          move.name
        );


  const compactClass =
    scope
      ? " poke5e-pokemon-move-card__activity--scope"
      : "";


  return `
    <button
      type="button"
      class="
        poke5e-pokemon-move-card__activity
        ${compactClass}
      "
      data-pokemon-sheet-action="move-use"
      data-move-id="${escapeHtml(move.id)}"
      data-activity-id="${escapeHtml(activity.id)}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
    >

      <i
        class="${escapeHtml(icon)}"
        aria-hidden="true"
      ></i>

      ${
        scope
          ? ""
          : `
            <span>
              ${escapeHtml(label)}
            </span>

            <small>
              ${escapeHtml(
                activityRange(
                  activity
                )
              )}
            </small>
          `
      }

    </button>
  `;
}


function moveActivityButtonsMarkup(
  move,
  labels
) {

  const activities =
    getMoveActivities(
      move
    );


  if (
    !activities.length
  ) {

    return `
      <span class="poke5e-pokemon-move-card__unavailable">
        ${escapeHtml(labels.noActivity)}
      </span>
    `;
  }


  const compactAttackScopes =
    hasAttackScopeVariants(
      activities
    );


  return activities
    .map(
      activity =>
        moveActivityButtonMarkup(
          move,
          activity,
          labels,
          compactAttackScopes
        )
    )
    .join("");
}

function movePp(
  move
) {

  const max =
    Number(
      move.system
        ?.uses
        ?.max ??
      move.getFlag(
        MODULE_ID,
        "pp"
      ) ??
      0
    );


  if (
    !Number.isFinite(
      max
    ) ||
    max <= 0
  ) {

    return {
      current:
        "∞",

      max:
        "∞"
    };
  }


  const spent =
    Number(
      move.system
        ?.uses
        ?.spent ??
      0
    );


  const normalizedSpent =
    Number.isFinite(
      spent
    )
      ? spent
      : 0;


  return {
    current:
      Math.max(
        0,
        max -
          normalizedSpent
      ),

    max
  };
}

function movePowerAbilities(
  move
) {

  const definition =
    move.getFlag(
      MODULE_ID,
      "moveDefinition"
    );


  const configured =
    Array.isArray(
      definition
        ?.powerAbilities
    )
      ? definition
          .powerAbilities
      : [];


  const abilities =
    configured
      .map(
        abilityId =>
          normalizeType(
            abilityId
          )
      )
      .filter(
        abilityId =>
          ABILITY_IDS.includes(
            abilityId
          )
      );


  if (abilities.length) {

    return [
      ...new Set(
        abilities
      )
    ];
  }


  /*
   * Struggle es especial.
   *
   * Su característica ya fue resuelta por el
   * builder y está persistida en metadata.
   * La UI solo la consume; no recalcula reglas.
   */
  const struggleAbility =
    normalizeType(
      move.getFlag(
        MODULE_ID,
        "struggle"
      )
        ?.ability
    );


  return ABILITY_IDS.includes(
    struggleAbility
  )
    ? [
        struggleAbility
      ]
    : [];
}


function movePowerAbilitiesMarkup(
  move,
  labels
) {

  const abilities =
    movePowerAbilities(
      move
    );


  if (!abilities.length) {

    return "";
  }


  return `
    <span
      class="poke5e-pokemon-move-power"
      title="${escapeHtml(labels.movePowerAbilities)}"
      aria-label="${escapeHtml(labels.movePowerAbilities)}"
    >

      <span class="poke5e-pokemon-move-power__label">
        STAT
      </span>

      <span class="poke5e-pokemon-move-power__values">

        ${
          abilities
            .map(
              abilityId => `
                <strong
                  class="poke5e-pokemon-move-power__ability"
                  data-ability="${escapeHtml(abilityId)}"
                >
                  ${escapeHtml(
                    abilityId.toUpperCase()
                  )}
                </strong>
              `
            )
            .join("")
        }

      </span>

    </span>
  `;
}

function moveCardMarkup(
  move,
  labels,
  language
) {

  const type =
    normalizeType(
      move.getFlag(
        MODULE_ID,
        "moveType"
      )
    ) ||
    "typeless";


  const pp =
    movePp(
      move
    );


  const editablePp =
    Number.isFinite(
      pp.current
    ) &&
    Number.isFinite(
      pp.max
    );


  const ppMarkup =
    editablePp
      ? `
        <span class="poke5e-pokemon-move-card__pp">

          <span>
            PP
          </span>

          <input
            type="number"
            inputmode="numeric"
            min="0"
            max="${escapeHtml(pp.max)}"
            step="1"
            value="${escapeHtml(pp.current)}"
            data-pokemon-sheet-field="move-pp"
            data-move-id="${escapeHtml(move.id)}"
            data-move-pp-current="${escapeHtml(pp.current)}"
            title="${escapeHtml(labels.editMovePp)}"
            aria-label="${escapeHtml(
              `${labels.editMovePp}: ${move.name}`
            )}"
          >

          <strong>
            /
            ${escapeHtml(pp.max)}
          </strong>

        </span>
      `
      : `
        <span class="poke5e-pokemon-move-card__pp">

          <span>
            PP
          </span>

          <strong>
            ∞
          </strong>

        </span>
      `;


  return `
    <article
      class="poke5e-pokemon-move-card"
      data-move-type="${escapeHtml(type)}"
      data-move-id="${escapeHtml(move.id)}"
      title="${escapeHtml(move.name)}"
    >

      <img
        src="${escapeHtml(
          move.img ||
          DEFAULT_IMAGE
        )}"
        alt=""
      >


      <div class="poke5e-pokemon-move-card__body">

        <div class="poke5e-pokemon-move-card__heading">

          <button
            type="button"
            class="poke5e-pokemon-move-card__details"
            data-pokemon-sheet-action="item-open"
            data-item-id="${escapeHtml(move.id)}"
            title="${escapeHtml(
              `${labels.details}: ${move.name}`
            )}"
          >

            <span>
              ${escapeHtml(move.name)}
            </span>

            <i
              class="fa-solid fa-circle-info"
              aria-hidden="true"
            ></i>

          </button>


          ${
            game.user.isGM
              ? `
                <button
                  type="button"
                  class="poke5e-pokemon-item-delete"
                  data-pokemon-sheet-action="item-delete"
                  data-item-id="${escapeHtml(move.id)}"
                  title="${escapeHtml(labels.deleteMove)}"
                  aria-label="${escapeHtml(labels.deleteMove)}"
                >

                  <i
                    class="fa-solid fa-trash"
                    aria-hidden="true"
                  ></i>

                </button>
              `
              : ""
          }

        </div>


        <div class="poke5e-pokemon-move-card__meta">

          ${typeBadgeMarkup(
            type,
            language
          )}

          ${ppMarkup}

          ${movePowerAbilitiesMarkup(
            move,
            labels
          )}

        </div>

      </div>


      <div class="poke5e-pokemon-move-card__activities">

        ${moveActivityButtonsMarkup(
          move,
          labels
        )}

      </div>

    </article>
  `;
}

function struggleMarkup(
  struggle,
  labels
) {

  return `
    <div class="poke5e-pokemon-struggle">

      <span>
        ${escapeHtml(labels.defaultMove)}
      </span>

      <img
        src="${escapeHtml(
          struggle.img ||
          DEFAULT_IMAGE
        )}"
        alt=""
      >

      <button
        type="button"
        class="poke5e-pokemon-struggle__details"
        data-pokemon-sheet-action="item-open"
        data-item-id="${escapeHtml(struggle.id)}"
        title="${escapeHtml(
          `${labels.details}: ${struggle.name}`
        )}"
      >

        <span>
          ${escapeHtml(struggle.name)}
        </span>

        <i
          class="fa-solid fa-circle-info"
          aria-hidden="true"
        ></i>

      </button>

      <small>
        PP ∞
      </small>

      ${movePowerAbilitiesMarkup(
        struggle,
        labels
      )}

      <div class="poke5e-pokemon-struggle__activities">

        ${moveActivityButtonsMarkup(
          struggle,
          labels
        )}

      </div>

    </div>
  `;
}

/* ============================================================
 * SUMMARY
 * ============================================================ */

function buildPokemonSummary(
  pokemon,
  {
    technicalOpen =
      false
  } = {}
) {

  const language =
    getLanguage();


  const labels =
    LABELS[
      language
    ];


  const flags =
    pokemon.flags
      ?.[MODULE_ID] ??
    {};


  const types =
    pokemonTypes(
      pokemon
    );


  const primaryType =
    pokemonPrimaryType(
      pokemon
    );


  const hp =
    pokemonHp(
      pokemon
    );

  const experience =
    getPokemonExperienceState(
      pokemon
    );


  const trainer =
    pokemonTrainer(
      pokemon
    );

  const ability =
    pokemonActiveAbility(
      pokemon
    );

  const nature =
    getPokemonNature(
      pokemon
    );


  const shinyState =
    getPokemonShinyState(
      pokemon
    );


  const heldItem =
    getPokemonHeldItem(
      pokemon
    );

  const canTransferHeldItem =
    Boolean(
      heldItem &&
      trainer &&
      canCurrentUserTransferPokemonHeldItem(
        pokemon,
        trainer
      )
    );

  const gender =
    getPokemonGender(
      pokemon
    );

  const statuses =
    getPokemonAppliedStatuses(
      pokemon,
      language
    );


  const statusOptions =
    getPokemonStatusOptions(
      language
    );


  const canModifyStatuses =
    canCurrentUserModifyPokemonStatuses(
      pokemon
    );

  const concentrations =
    getPokemonConcentrations(
      pokemon
    );

  const movement =
    pokemonMovement(
      pokemon,
      labels
    );

  const initiative =
    pokemonInitiative(
      pokemon
    );

  const matchups =
    pokemonMatchups(
      pokemon
    );

  const skills =
    pokemonSkills(
      pokemon,
      language
    );


  const knownMoves =
    getPokemonKnownMoves(
      pokemon
    );


  const struggle =
    getPokemonStruggleMove(
      pokemon
    );


  const moveLimit =
    getPokemonMoveLimit(
      pokemon
    );


  const level =
    Number(
      flags.level ??
      1
    );


  const ac =
    Number(
      pokemon.system
        ?.attributes
        ?.ac
        ?.value ??
      pokemon.system
        ?.attributes
        ?.ac
        ?.flat ??
      0
    );


  const pb =
    Number(
      flags.proficiencyBonus ??
      flags.proficiency ??
      0
    );

  const size =
    String(
      pokemon.system
        ?.traits
        ?.size ??
      ""
    );


  const sizeLabel =
  (
    SIZE_LABELS[
      language
    ]?.[
      size
    ] ??
    size
  ) ||
  "—";

  const abilityDescription =
    ability
      ? htmlToText(
          ability.system
            ?.description
            ?.value
        )
      : "";

  const root =
    document.createElement(
      "section"
    );


  root.className =
    SUMMARY_CLASS;


  root.dataset.pokemonId =
    pokemon.id;

  root.dataset.pokemonUuid =
    pokemon.uuid;


  root.dataset.pokemonType =
    primaryType;

  root.dataset.shinyState =
    !shinyState
      ? "unresolved"
      : shinyState.isShiny
        ? "shiny"
        : "normal";

  root.dataset.fainted =
    hp.value <= 0
      ? "true"
      : "false";

  root.dataset.technicalOpen =
    technicalOpen
      ? "true"
      : "false";

  root.innerHTML = `
    <header class="poke5e-pokemon-summary__hero">

      <div class="poke5e-pokemon-summary__dex">
        ${escapeHtml(
          formatDexNumber(
            flags.dexNumber
          )
        )}
      </div>

      <div class="poke5e-pokemon-summary__toolbar">

        ${
          trainer
            ? `
              <button
                type="button"
                data-pokemon-sheet-action="trainer-open"
                title="${escapeHtml(labels.openTrainer)}"
                aria-label="${escapeHtml(labels.openTrainer)}"
              >

                <i
                  class="fa-solid fa-user"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHtml(labels.trainer)}
                </span>

              </button>
            `
            : ""
        }


        ${
          game.user.isGM && trainer
            ? `
              <button
                type="button"
                data-pokemon-sheet-action="evolution-on-demand"
                title="${escapeHtml(labels.evolvePokemon)}"
                aria-label="${escapeHtml(labels.evolvePokemon)}"
              >
                <i
                  class="fa-solid fa-dna"
                  aria-hidden="true"
                ></i>
                <span>${escapeHtml(labels.evolvePokemon)}</span>
              </button>
            `
            : ""
        }


        ${
          game.user.isGM
            ? `
              <button
                type="button"
                data-pokemon-sheet-action="technical-toggle"
                title="${escapeHtml(labels.technicalDetails)}"
                aria-label="${escapeHtml(labels.technicalDetails)}"
                aria-expanded="${
                  technicalOpen
                    ? "true"
                    : "false"
                }"
                class="${
                  technicalOpen
                    ? "is-active"
                    : ""
                }"
              >

                <i
                  class="fa-solid fa-sliders"
                  aria-hidden="true"
                ></i>

                <span>
                  ${escapeHtml(labels.technicalDetails)}
                </span>

              </button>
            `
            : ""
        }

      </div>

      <div class="poke5e-pokemon-summary__portrait">

        <img
          src="${escapeHtml(
            pokemon.img ||
            DEFAULT_IMAGE
          )}"
          alt="${escapeHtml(pokemon.name)}"
        >

      </div>


      <div class="poke5e-pokemon-summary__identity">

        <small>
          ${escapeHtml(labels.data)}
        </small>

        ${pokemonNameMarkup(
          pokemon,
          labels
        )}

        <div class="poke5e-pokemon-summary__identity-meta">

          <strong class="poke5e-pokemon-meta-chip">
            ${escapeHtml(labels.level)}
            ${level}
          </strong>

          <span class="poke5e-pokemon-meta-chip">
            ${escapeHtml(sizeLabel)}
          </span>

          ${pokemonGenderMarkup(
            pokemon,
            gender,
            labels,
            language
          )}

          ${shinyMarkup(
            shinyState,
            labels
          )}

        </div>


        <div class="poke5e-pokemon-summary__types">

          ${pokemonTypesMarkup(
            types,
            language,
            labels
          )}

        </div>

        ${natureMarkup(
          nature,
          labels,
          language
        )}

        ${bondMarkup(
          pokemon
        )}

      </div>


      <div class="poke5e-pokemon-summary__hp">

        <div>

          <strong>
            ${escapeHtml(labels.hp)}
          </strong>

          <div class="poke5e-pokemon-summary__hp-controls">

            <button
              type="button"
              data-pokemon-sheet-action="hp-adjust"
              data-hp-delta="-1"
              title="${escapeHtml(labels.hpDecrease)}"
              aria-label="${escapeHtml(labels.hpDecrease)}"
            >

              <i
                class="fa-solid fa-minus"
                aria-hidden="true"
              ></i>

            </button>


            <span>
              ${hp.value}/${hp.max}
            </span>


            <button
              type="button"
              data-pokemon-sheet-action="hp-adjust"
              data-hp-delta="1"
              title="${escapeHtml(labels.hpIncrease)}"
              aria-label="${escapeHtml(labels.hpIncrease)}"
            >

              <i
                class="fa-solid fa-plus"
                aria-hidden="true"
              ></i>

            </button>

          </div>

        </div>

        <div class="poke5e-pokemon-summary__hp-track">

          <span
            style="width: ${hpPercent(hp)}%"
          ></span>

        </div>

        ${experienceMarkup(
          experience,
          labels
        )}

      </div>

    </header>

    ${technicalDetailsMarkup({
      pokemon,
      trainer,
      flags,
      primaryType,
      knownMoves,
      moveLimit,
      labels,
      open:
        technicalOpen
    })}

    <div class="poke5e-pokemon-summary__dashboard">

      ${pokemonConcentrationMarkup(
        concentrations,
        labels
      )}

      ${pokemonMoveEffectsMarkup(pokemon, language)}

      ${pokemonStatusesMarkup({
        statuses,

        options:
          statusOptions,

        labels,

        canModify:
          canModifyStatuses
      })}

      <section class="poke5e-pokemon-panel">

        <header>
          <i
            class="fa-solid fa-chart-simple"
            aria-hidden="true"
          ></i>

          <h3>
            ${escapeHtml(labels.stats)}
          </h3>
        </header>

        <div class="poke5e-pokemon-stats">
          ${statsMarkup(
            pokemon,
            labels
          )}
        </div>

      </section>


      <section class="poke5e-pokemon-panel">

        <header>
          <i
            class="fa-solid fa-shield"
            aria-hidden="true"
          ></i>

          <h3>
            ${escapeHtml(labels.battle)}
          </h3>
        </header>

        <div class="poke5e-pokemon-battle-grid">

          <div>
            <span>AC</span>
            <strong>${ac}</strong>
          </div>

          <div>
            <span>PB</span>
            <strong>${signedNumber(pb)}</strong>
          </div>

          <div>
            <span>SR</span>
            <strong>
              ${escapeHtml(
                formatSr(
                  flags.sr
                )
              )}
            </strong>
          </div>

          <div>
            <span>${escapeHtml(labels.size)}</span>
            <strong>${escapeHtml(sizeLabel)}</strong>
          </div>

          <div>
            <span>${escapeHtml(labels.trainer)}</span>
            <strong>
              ${escapeHtml(
                trainer
                  ?.name ??
                labels.noTrainer
              )}
            </strong>
          </div>

          <div class="poke5e-pokemon-battle-grid__movement">

            <span>
              ${escapeHtml(labels.movement)}
            </span>

            ${movementMarkup(
              movement,
              labels
            )}

          </div>

          ${initiativeMarkup(
            initiative,
            labels
          )}

        </div>

      </section>

      <div class="poke5e-pokemon-utility-row">

        ${skillsPanelMarkup(
          skills,
          labels
        )}

        ${heldItemPanelMarkup(
          heldItem,
          labels,
          {
            canTransfer:
              canTransferHeldItem,
            canUse: canUsePokemonHeldItem(pokemon, trainer),
            language
          }
        )}

      </div>

      <section
        class="
          poke5e-pokemon-panel
          poke5e-pokemon-panel--ability
        "
      >

        <header>
          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          <h3>
            ${escapeHtml(labels.ability)}
          </h3>
        </header>

        ${
          ability
            ? `
              <div class="poke5e-pokemon-ability">

                <img
                  src="${escapeHtml(
                    ability.img ||
                    DEFAULT_IMAGE
                  )}"
                  alt=""
                >


                <div>

                  <div class="poke5e-pokemon-ability__heading">

                    <button
                      type="button"
                      class="poke5e-pokemon-ability__details"
                      data-pokemon-sheet-action="item-open"
                      data-item-id="${escapeHtml(ability.id)}"
                      title="${escapeHtml(
                        `${labels.details}: ${ability.name}`
                      )}"
                    >

                      <span>
                        ${escapeHtml(ability.name)}
                      </span>

                      <i
                        class="fa-solid fa-circle-info"
                        aria-hidden="true"
                      ></i>

                    </button>


                    ${
                      game.user.isGM
                        ? `
                          <button
                            type="button"
                            class="poke5e-pokemon-item-delete"
                            data-pokemon-sheet-action="item-delete"
                            data-item-id="${escapeHtml(ability.id)}"
                            title="${escapeHtml(labels.deleteAbility)}"
                            aria-label="${escapeHtml(labels.deleteAbility)}"
                          >

                            <i
                              class="fa-solid fa-trash"
                              aria-hidden="true"
                            ></i>

                          </button>
                        `
                        : ""
                    }

                  </div>


                  <p>
                    ${escapeHtml(abilityDescription)}
                  </p>

                </div>

              </div>
            `
            : `
              <div class="poke5e-pokemon-empty">
                ${escapeHtml(labels.noAbility)}
              </div>
            `
        }

      </section>

      <section
        class="
          poke5e-pokemon-panel
          poke5e-pokemon-panel--matchups
        "
      >

        <header>
          <i
            class="fa-solid fa-circle-half-stroke"
            aria-hidden="true"
          ></i>

          <h3>
            ${escapeHtml(labels.matchups)}
          </h3>
        </header>

        <div class="poke5e-pokemon-matchups">

          ${matchupGroupMarkup(
            labels.resistances,
            matchups.resistances,
            language
          )}

          ${matchupGroupMarkup(
            labels.weaknesses,
            matchups.weaknesses,
            language
          )}

          ${
            matchups.immunities.length
              ? matchupGroupMarkup(
                  labels.immunities,
                  matchups.immunities,
                  language
                )
              : ""
          }
          ${
            [...matchups.resistances, ...matchups.weaknesses].some(entry => entry.storingPower)
              ? `<small class="poke5e-pokemon-matchup-note">* ${escapeHtml(labels.storingPower)}</small>`
              : ""
          }
        </div>

      </section>


      <section
        class="
          poke5e-pokemon-panel
          poke5e-pokemon-panel--moves
        "
      >

        <header>

          <div>
            <i
              class="fa-solid fa-bolt"
              aria-hidden="true"
            ></i>

            <h3>
              ${escapeHtml(labels.moves)}
            </h3>
          </div>

          <strong>
            ${knownMoves.length}/${moveLimit}
          </strong>

        </header>


        <div class="poke5e-pokemon-moves">

          ${
            knownMoves
              .map(
                move =>
                  moveCardMarkup(
                    move,
                    labels,
                    language
                  )
              )
              .join("")
          }

        </div>


        ${
          struggle
            ? struggleMarkup(
                struggle,
                labels
              )
            : ""
        }

      </section>

    </div>
  `;

  activatePokemonSheetActions({
    root,
    pokemon,
    trainer,

    refresh:
      () =>
        refreshRenderedPokemonSummaries(
          pokemon
        )
  });

  return root;
}


/* ============================================================
 * REFRESH
 * ============================================================ */

function refreshRenderedPokemonSummaries(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  const roots =
    [
      ...document.querySelectorAll(
        `.${SUMMARY_CLASS}`
      )
    ];


  const exactUuidMatches =
    roots.filter(
      root =>
        root.dataset
          .pokemonUuid ===
        pokemon.uuid
    );


  const targets =
    exactUuidMatches.length
      ? exactUuidMatches
      : roots.filter(
          root =>
            root.dataset
              .pokemonId ===
            pokemon.id
        );


  for (
    const root
    of targets
  ) {

    const technicalOpen =
      root.dataset
        .technicalOpen ===
      "true";


    const scrollHost =
      resolveSummaryScrollHost(
        root
      );


    const scrollPosition =
      captureScrollPosition(
        scrollHost
      );


    root.replaceWith(
      buildPokemonSummary(
        pokemon,
        {
          technicalOpen
        }
      )
    );


    restoreScrollPosition(
      scrollHost,
      scrollPosition
    );
  }
}


function actorFromOwnedDocument(
  documentValue
) {

  let current =
    documentValue ??
    null;


  while (current) {

    if (
      current.documentName ===
      "Actor"
    ) {

      return current;
    }


    /*
     * TokenDocument y otros documentos
     * vinculados al canvas pueden exponer
     * directamente el Actor runtime.
     *
     * Esto es importante para ActiveEffects
     * aplicados desde Tokens.
     */
    if (
      current.actor
        ?.documentName ===
      "Actor"
    ) {

      return current.actor;
    }


    current =
      current.parent ??
      null;
  }


  return null;
}

/* ============================================================
 * SCROLL STATE
 * ============================================================ */

function resolveSummaryScrollHost(
  element
) {

  return (
    element.closest(
      SUMMARY_SCROLL_HOST_SELECTOR
    ) ??
    element.closest(
      SUMMARY_HOST_SELECTOR
    ) ??
    null
  );
}


function captureScrollPosition(
  scrollHost
) {

  if (!scrollHost) {

    return {
      top: 0,
      left: 0
    };
  }


  return {
    top:
      scrollHost.scrollTop,

    left:
      scrollHost.scrollLeft
  };
}


function restoreScrollPosition(
  scrollHost,
  position
) {

  if (!scrollHost) {

    return;
  }


  const restore =
    () => {

      if (
        !scrollHost.isConnected
      ) {

        return;
      }


      scrollHost.scrollTop =
        position.top;


      scrollHost.scrollLeft =
        position.left;
    };


  /*
   * Primera restauración inmediata.
   */
  restore();


  /*
   * Segunda restauración después del layout.
   *
   * Evita que el navegador vuelva a reajustar
   * el scroll cuando el Summary recién creado
   * termina de ocupar su altura definitiva.
   */
  window.requestAnimationFrame(
    restore
  );
}

function trackApplicationScroll(
  application,
  scrollHost
) {

  if (
    !application ||
    !scrollHost ||
    TRACKED_SCROLL_HOSTS.has(
      scrollHost
    )
  ) {

    return;
  }


  scrollHost.addEventListener(
    "scroll",
    () => {

      if (
        !scrollHost.isConnected
      ) {

        return;
      }


      APPLICATION_SCROLL_STATE.set(
        application,
        captureScrollPosition(
          scrollHost
        )
      );
    },
    {
      passive:
        true
    }
  );


  TRACKED_SCROLL_HOSTS.add(
    scrollHost
  );
}


function restoreApplicationScroll(
  application,
  scrollHost
) {

  if (
    !application ||
    !scrollHost
  ) {

    return;
  }


  const position =
    APPLICATION_SCROLL_STATE.get(
      application
    );


  if (!position) {

    return;
  }


  restoreScrollPosition(
    scrollHost,
    position
  );
}

/* ============================================================
 * SHEET
 * ============================================================ */

function onRenderApplicationV2(
  application,
  element
) {

  const pokemon =
    application
      ?.document;


  if (
    !(
      application instanceof
        PokemonActorSheet
    ) ||
    !(element instanceof HTMLElement) ||
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  const host =
    element.querySelector(
      SUMMARY_HOST_SELECTOR
    );


  if (!host) {

    return;
  }


  const scrollHost =
    resolveSummaryScrollHost(
      host
    );


  host.replaceChildren(
    buildPokemonSummary(
      pokemon
    )
  );


  /*
   * El scroll host puede ser un elemento completamente
   * nuevo después de un render de ApplicationV2.
   *
   * Primero conectamos el nuevo elemento al estado
   * persistente de esta instancia de Sheet.
   */
  trackApplicationScroll(
    application,
    scrollHost
  );


  /*
   * Después restauramos la última posición conocida.
   *
   * restoreScrollPosition() ya realiza una restauración
   * inmediata y otra en requestAnimationFrame.
   */
  restoreApplicationScroll(
    application,
    scrollHost
  );
}

function onCloseApplicationV2(
  application
) {

  if (
    !(
      application instanceof
        PokemonActorSheet
    )
  ) {

    return;
  }


  APPLICATION_SCROLL_STATE.delete(
    application
  );
}

/* ============================================================
 * LIVE REFRESH
 * ============================================================ */

function schedulePokemonSummaryRefresh(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  window.requestAnimationFrame(
    () => {

      refreshRenderedPokemonSummaries(
        pokemon
      );
    }
  );
}

function onUpdateActor(
  actor
) {

  schedulePokemonSummaryRefresh(
    actor
  );
}


function onOwnedDocumentChange(
  documentValue
) {

  const pokemon =
    actorFromOwnedDocument(
      documentValue
    );


  schedulePokemonSummaryRefresh(
    pokemon
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerPokemonSheetUi() {

  Hooks.on(
    "renderApplicationV2",
    onRenderApplicationV2
  );

  Hooks.on(
    "closeApplicationV2",
    onCloseApplicationV2
  );

  Hooks.on(
    "updateActor",
    onUpdateActor
  );


  Hooks.on(
    "createItem",
    onOwnedDocumentChange
  );

  Hooks.on(
    "updateItem",
    onOwnedDocumentChange
  );

  Hooks.on(
    "deleteItem",
    onOwnedDocumentChange
  );


  Hooks.on(
    "createActiveEffect",
    onOwnedDocumentChange
  );

  Hooks.on(
    "updateActiveEffect",
    onOwnedDocumentChange
  );

  Hooks.on(
    "deleteActiveEffect",
    onOwnedDocumentChange
  );
}
