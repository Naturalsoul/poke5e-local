import { calculatePokemonDefenses, hasStab } from "./types.mjs";
import { buildMoveStatusEffects } from "./status-effects.mjs";
import { buildMoveModifierEffects } from "./modifier-effects.mjs";
import { buildMovePeriodicEffects } from "./periodic-effects.mjs";
import { BINDING_CONTINUATIONS } from "./binding-rules.mjs";
import { buildMoveDrainData } from "./drain-effects.mjs";
import { buildMoveRecoilData } from "./recoil-effects.mjs";
import {
  buildMoveForcedRecoilData
} from "./forced-recoil-effects.mjs";
import {
  buildMoveSelfDamageData
} from "./self-damage-effects.mjs";
import {
  buildMoveMultiTargetData
} from "./multi-target-effects.mjs";
import {
  buildMoveSaveResultData
} from "./save-result-effects.mjs";
import {
  buildStruggleDamageFormula,
  getStruggleActivityVariants,
  isStruggleMove,
  STRUGGLE_ACTIVITY_IDS,
  STRUGGLE_MOVE_ID,
  STRUGGLE_RULE
} from "./struggle-rules.mjs";

const MODULE_ID = "poke5e-local";
const BUILDER_VERSION = "0.18.22";
const ABILITY_IDS = ["str", "dex", "con", "int", "wis", "cha"];
const DEFAULT_MOVE_ICON = "icons/svg/sword.svg";
const MOVE_ICON_ROOT =
  `modules/${MODULE_ID}/assets/attacks`;
const DEFAULT_ABILITY_ICON = "icons/svg/aura.svg";
const DEFAULT_POKEMON_ICON = "icons/svg/mystery-man.svg";

const SIZE_MAP = {
  tiny: "tiny",
  small: "sm",
  medium: "med",
  large: "lg",
  huge: "huge",
  gargantuan: "grg"
};

const MOVEMENT_MAP = {
  walk: "walk",
  walking: "walk",
  land: "walk",
  fly: "fly",
  flying: "fly",
  swim: "swim",
  swimming: "swim",
  climb: "climb",
  climbing: "climb",
  burrow: "burrow",
  burrowing: "burrow"
};

const SKILL_MAP = {
  acrobatics: "acr",
  acr: "acr",
  "animal-handling": "ani",
  "animal handling": "ani",
  ani: "ani",
  arcana: "arc",
  arc: "arc",
  athletics: "ath",
  ath: "ath",
  deception: "dec",
  dec: "dec",
  history: "his",
  his: "his",
  insight: "ins",
  ins: "ins",
  intimidation: "itm",
  itm: "itm",
  investigation: "inv",
  inv: "inv",
  medicine: "med",
  med: "med",
  nature: "nat",
  nat: "nat",
  perception: "prc",
  prc: "prc",
  performance: "prf",
  prf: "prf",
  persuasion: "per",
  per: "per",
  religion: "rel",
  rel: "rel",
  "sleight-of-hand": "slt",
  "sleight of hand": "slt",
  slt: "slt",
  stealth: "ste",
  ste: "ste",
  survival: "sur",
  sur: "sur"
};

const DYNAMIC_DAMAGE_KINDS = {
  magnitude: "magnitude",
  rollout: "rollout",
  outrage: "outrage"
};

const IMPLEMENTED_DYNAMIC_DAMAGE_KINDS =
  new Set([
    "magnitude",
    "rollout",
    "outrage"
  ]);


const DYNAMIC_DAMAGE_PLACEHOLDER_FORMULA =
  "0";

const POKEMON_DAMAGE_TYPES = new Set([
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy"
]);

function getPokemonMinimumLevel(pokemon) {
  const value = Number(
    pokemon?.minimumLevel ??
    pokemon?.minLevel ??
    1
  );

  return Math.clamp(
    Number.isFinite(value) ? Math.trunc(value) : 1,
    1,
    20
  );
}

function getPokemonBaseHp(pokemon) {
  const value = Number(
    pokemon?.combat?.hp ??
    pokemon?.hp ??
    1
  );

  return Math.max(
    1,
    Number.isFinite(value)
      ? Math.trunc(value)
      : 1
  );
}

function getPokemonHitDie(
  pokemon
) {
  const value =
    String(
      pokemon
        ?.combat
        ?.hitDie ??
      pokemon
        ?.combat
        ?.hitDice ??
      pokemon
        ?.hitDie ??
      pokemon
        ?.hitDice ??
      "d6"
    )
      .trim()
      .toLowerCase();


  return /^d(4|6|8|10|12|20)$/.test(
    value
  )
    ? value
    : "d6";
}

function getHitDieAverage(hitDie) {
  const match = String(hitDie).match(/^d(\d+)$/i);
  const sides = Number(match?.[1] ?? 6);

  /*
   * Promedio fijo de D&D:
   *
   * d6  -> 4
   * d8  -> 5
   * d10 -> 6
   * d12 -> 7
   */
  return Math.floor(sides / 2) + 1;
}

function abilityScoreModifier(score) {
  return Math.floor(
    (Number(score ?? 10) - 10) / 2
  );
}

function calculatePokemonHp(
  pokemon,
  level,
  abilities
) {
  const minimumLevel =
    getPokemonMinimumLevel(
      pokemon
    );

  const targetLevel =
    clampInteger(
      level,
      minimumLevel,
      20,
      minimumLevel
    );

  const baseHp =
    getPokemonBaseHp(
      pokemon
    );

  const hitDie =
    getPokemonHitDie(
      pokemon
    );

  const dieAverage =
    getHitDieAverage(
      hitDie
    );

  const conScore =
    Number(
      abilities?.con?.value ??
      10
    );

  const conModifier =
    abilityScoreModifier(
      conScore
    );

  /*
   * Para imports deterministas usamos el
   * promedio fijo del dado en lugar de
   * volver a tirar HP cada vez que se
   * reimporta el mismo Pokémon.
   */
  const hpPerExtraLevel =
    Math.max(
      1,
      dieAverage +
      conModifier
    );

  const extraLevels =
    Math.max(
      0,
      targetLevel -
      minimumLevel
    );

  return {
    max:
      baseHp +
      (
        extraLevels *
        hpPerExtraLevel
      ),

    /*
     * D&D5e utiliza esta fórmula también
     * para identificar cantidad y tipo
     * de Hit Dice del NPC.
     */
    formula:
      `${targetLevel}${hitDie}`,

    baseHp,
    minimumLevel,
    targetLevel,
    hitDie,
    dieAverage,
    conModifier,
    hpPerExtraLevel,
    extraLevels
  };
}

export function proficiency(level) {
  const normalizedLevel = Math.clamp(
    Math.trunc(Number(level) || 1),
    1,
    20
  );

  return Math.min(
    6,
    2 + Math.floor(
      (normalizedLevel - 1) / 4
    )
  );
}

function buildPokemonProficiencyEffect(level) {
  const pb = proficiency(level);

  return {
    name: "Pokémon Proficiency",
    img: "icons/svg/upgrade.svg",
    disabled: false,
    transfer: false,

    changes: [
      {
        key: "system.attributes.prof",
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: String(pb),
        priority: 20
      }
    ],

    flags: {
      [MODULE_ID]: {
        managed: true,
        kind: "pokemon-proficiency",
        level,
        proficiencyBonus: pb
      }
    }
  };
}

export function buildPokemonMedia(
  pokemon
) {

  const portrait =
    resolveModuleAsset(
      pokemon?.media?.portrait
    ) ??
    DEFAULT_POKEMON_ICON;


  const token =
    resolveModuleAsset(
      pokemon?.media?.token
    ) ??
    portrait;


  const tokenAnimated =
    resolveModuleAsset(
      pokemon?.media
        ?.tokenAnimated
    );


  const portraitShiny =
    resolveModuleAsset(
      pokemon?.media
        ?.portraitShiny
    );


  const tokenShiny =
    resolveModuleAsset(
      pokemon?.media
        ?.tokenShiny
    ) ??
    portraitShiny;


  const tokenShinyAnimated =
    resolveModuleAsset(
      pokemon?.media
        ?.tokenShinyAnimated
    );


  return {
    portrait,
    token,
    tokenAnimated,
    portraitShiny,
    tokenShiny,
    tokenShinyAnimated
  };
}

export function buildActorSource(arg1, arg2, arg3, arg4) {
  const input = normalizeBuildArguments(arg1, arg2, arg3, arg4);
  const context = createBuildContext(input);
  const source = buildPokemonActor(context);

  validateActorSource(source);

  return source;
}

export function buildMoveItem(move, pokemon, level, language = "es") {
  const context = createBuildContext({
    pokemon,
    moves: [move],
    abilities: [],
    language,
    forceLevel: level
  });

  return createMoveItem(move, context);
}

function buildMovePokemonSnapshotFromActor(
  actor,
  level
) {
  const configuredTypes =
    normalizeStringArray(
      actor.getFlag(
        MODULE_ID,
        "types"
      )
    );

  const primaryType =
    normalizeType(
      actor.getFlag(
        MODULE_ID,
        "primaryType"
      )
    ) ||
    configuredTypes[0] ||
    "normal";

  const types =
    configuredTypes.length
      ? configuredTypes
      : [
          primaryType
        ];

  const attributes =
    Object.fromEntries(
      ABILITY_IDS.map(
        abilityId => [
          abilityId,
          clampInteger(
            actor.system
              ?.abilities
              ?.[abilityId]
              ?.value,
            1,
            30,
            10
          )
        ]
      )
    );

  return {
    id:
      normalizeCanonicalId(
        actor.getFlag(
          MODULE_ID,
          "sourceId"
        )
      ) ||
      String(
        actor.id
      ),

    minimumLevel:
      level,

    types,
    primaryType,

    abilities: [],

    combat: {
      attributes
    }
  };
}


/**
 * Construye una instancia de Move para un Actor Pokémon ya existente.
 *
 * El compendio conserva Moves como templates independientes del receptor.
 * Esta función adapta únicamente el estado necesario del Actor al contrato
 * canónico que ya consume buildMoveItem().
 */
export function buildMoveItemForActor(
  move,
  actor,
  language = "es"
) {
  if (
    !move?.id
  ) {
    throw new Error(
      "buildMoveItemForActor requiere un Move normalizado válido."
    );
  }

  if (
    actor?.documentName !==
      "Actor" ||
    actor.getFlag(
      MODULE_ID,
      "kind"
    ) !== "pokemon"
  ) {
    throw new Error(
      "buildMoveItemForActor requiere un Actor Pokémon Poke5e."
    );
  }

  const level =
    clampInteger(
      actor.getFlag(
        MODULE_ID,
        "level"
      ),
      1,
      20,
      1
    );

  const pokemon =
    buildMovePokemonSnapshotFromActor(
      actor,
      level
    );

  return buildMoveItem(
    move,
    pokemon,
    level,
    language
  );
}

export function buildMoveCatalogItem(
  move,
  language = "es"
) {
  if (!move?.id) {
    throw new Error(
      "buildMoveCatalogItem requiere un Move normalizado válido."
    );
  }

  const normalizedLanguage =
    language === "en"
      ? "en"
      : "es";

  const name =
    localized(
      move.name,
      normalizedLanguage,
      move.id
    );

  const description =
    buildMoveDescription(
      move,
      normalizedLanguage
    );

  const itemType =
    move.attack
      ? "weapon"
      : "feat";

  return {
    name,
    type: itemType,

    img:
      resolveMoveIcon(
        move.type
      ),

    system:
      itemType === "weapon"
        ? buildWeaponSystem(
            move,
            name,
            description,
            {}
          )
        : buildFeatSystem(
            move,
            name,
            description,
            {}
          ),

    effects: [],

    flags: {
      [MODULE_ID]: {
        kind:
          "move-template",

        sourceId:
          move.id,

        moveType:
          normalizeType(
            move.type
          ),

        pp:
          positiveInteger(
            move.pp,
            0
          ),

        beta:
          Boolean(
            move.beta
          ),

        deprecated:
          Boolean(
            move.deprecated
          ),

        /*
         * El template conserva la definición
         * canónica para poder reconstruirse
         * según el Pokémon receptor.
         */
        moveDefinition:
          foundry.utils.deepClone(
            move
          ),

        builderVersion:
          BUILDER_VERSION
      }
    }
  };
}

export function buildAbilityItem(
  ability,
  language = "es",
  {
    hiddenAbility = false
  } = {}
) {
  if (!ability?.id) {
    throw new Error(
      "buildAbilityItem requiere una Ability normalizada válida."
    );
  }

  return createAbilityItem(
    ability,
    language === "en"
      ? "en"
      : "es",
    {
      hiddenAbility
    }
  );
}

export function buildAbilityCatalogItem(
  ability,
  language = "es"
) {
  const source =
    buildAbilityItem(
      ability,
      language
    );

  source.flags[
    MODULE_ID
  ].kind =
    "ability-template";

  return source;
}

function normalizeBuildArguments(
  arg1,
  arg2,
  arg3,
  arg4
) {

  if (
    isPlainBuildObject(
      arg1
    )
  ) {

    return {
      pokemon:
        arg1.pokemon,

      moves:
        arg1.moves ??
        arg1.movesById ??
        arg1.moveIndex ??
        arg1.moveDb,

      abilities:
        arg1.abilities ??
        arg1.abilitiesById ??
        arg1.abilityIndex ??
        arg1.abilityDb,

      language:
        arg1.language ??
        "es",

      forceLevel:
        arg1.level ??
        arg1.forceLevel ??
        null,

      grantedHiddenAbilities:
        arg1.grantedHiddenAbilities ??
        [],

      activeAbilityId:
        arg1.activeAbilityId ??
        null,

      abilityScoreGains:
        arg1.abilityScoreGains ??
        {},

      abilityScoreBase:
        arg1.abilityScoreBase ??
        {},

      additionalSavingThrows:
        arg1.additionalSavingThrows ??
        [],

      additionalSkillProficiencies:
        arg1.additionalSkillProficiencies ??
        {}
    };
  }


  return {
    pokemon:
      arg1,

    moves:
      arg2,

    abilities:
      arg3,

    language:
      typeof arg4 ===
        "object"
        ? arg4?.language ??
          "es"
        : arg4 ??
          "es",

    forceLevel:
      null,

    grantedHiddenAbilities:
      [],

    activeAbilityId:
      null,

    abilityScoreGains:
      {},

    abilityScoreBase:
      {},

    additionalSavingThrows:
      [],

    additionalSkillProficiencies:
      {}
  };
}

function formatPokemonActorName(
  pokemonName,
  level,
  language
) {
  const levelLabel =
    language === "es"
      ? "Nv."
      : "Lv.";

  return `${pokemonName} (${levelLabel} ${level})`;
}

function isPlainBuildObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    "pokemon" in value
  );
}

function createBuildContext({
  pokemon,
  moves,
  abilities,
  language,
  forceLevel = null,
  grantedHiddenAbilities = [],
  activeAbilityId = null,
  abilityScoreGains = {},
  abilityScoreBase = {},
  additionalSavingThrows = [],
  additionalSkillProficiencies = {}
}) {

  if (!pokemon?.id) {

    throw new Error(
      "buildActorSource requiere un Pokémon normalizado válido."
    );
  }


  const level =
    clampInteger(
      forceLevel ??
      pokemon.minimumLevel,
      1,
      20,
      1
    );


  const moveIndex =
    createIndex(
      moves,
      [
        "moves",
        "items"
      ]
    );


  const abilityIndex =
    createIndex(
      abilities,
      [
        "items",
        "abilities"
      ]
    );


  const types =
    normalizeStringArray(
      pokemon.types
    );


  const primaryType =
    pokemon.primaryType ??
    types[0] ??
    "normal";


  const pb =
    proficiency(
      level
    );


  const defenses =
    calculatePokemonDefenses(
      types
    ) ??
    {};


  const grantedHiddenAbilityIds =
    resolveGrantedHiddenAbilityIds(
      pokemon,
      grantedHiddenAbilities
    );


  return {
    pokemon,
    level,

    language:
      language ===
        "en"
        ? "en"
        : "es",

    moveIndex,
    abilityIndex,
    types,
    primaryType,
    pb,
    defenses,
    grantedHiddenAbilityIds,

    requestedActiveAbilityId:
      normalizeCanonicalId(
        activeAbilityId
      ),

    abilityScoreGains:
      normalizeAbilityScoreGains(
        abilityScoreGains
      ),

    abilityScoreBase:
      normalizeAbilityScoreBase(
        abilityScoreBase
      ),

    additionalSavingThrows:
      normalizeStringArray(
        additionalSavingThrows
      )
        .filter(
          abilityId =>
            ABILITY_IDS.includes(
              abilityId
            )
        ),

    additionalSkillProficiencies:
      normalizeAdditionalSkillProficiencies(
        additionalSkillProficiencies
      )
  };
}

function createIndex(
  source,
  collectionKeys = []
) {
  if (source instanceof Map) {
    return source;
  }

  let collection = source;

  for (const key of collectionKeys) {
    if (
      Array.isArray(
        source?.[key]
      )
    ) {
      collection =
        source[key];

      break;
    }
  }

  if (
    Array.isArray(
      collection
    )
  ) {
    return new Map(
      collection
        .filter(Boolean)
        .map(
          entry => [
            String(entry.id),
            entry
          ]
        )
    );
  }

  if (
    collection &&
    typeof collection ===
      "object"
  ) {
    return new Map(
      Object.entries(
        collection
      ).map(
        ([key, value]) => [
          String(
            value?.id ??
            key
          ),
          value
        ]
      )
    );
  }

  return new Map();
}

function validatePokemonDefenseTraits(
  pokemon,
  defenses,
  traits
) {
  const multipliers =
    extractDefenseMultipliers(
      defenses
    );

  if (!Object.keys(multipliers).length) {
    console.warn(
      `[${MODULE_ID}] ${pokemon.id}: ` +
      "calculatePokemonDefenses() no entregó multiplicadores reconocibles.",
      defenses
    );

    return;
  }

  const expectedSpecial =
    Object.values(
      multipliers
    ).some(
      multiplier =>
        Number(multiplier) !== 1
    );

  const actualSpecial =
    (
      traits.di.value.length +
      traits.dr.value.length +
      traits.dv.value.length
    ) > 0;

  if (
    expectedSpecial &&
    !actualSpecial
  ) {
    console.error(
      `[${MODULE_ID}] ${pokemon.id}: ` +
      "existen multiplicadores Pokémon especiales, " +
      "pero no se generaron traits D&D5e.",
      {
        multipliers,
        traits
      }
    );
  }
}

function buildPokemonActor(
  context
) {
  const {
    pokemon,
    level,
    language,
    types,
    primaryType,
    pb,
    defenses,
    grantedHiddenAbilityIds
  } = context;

  const moveItems =
    getSystemMoves(
      context
    ).map(
      move =>
        createMoveItem(
          move,
          context,
          {
            importManaged: true
          }
        )
    );

  const items = [
    ...moveItems
  ];

  const localizedName =
    localized(
      pokemon.name,
      language,
      pokemon.id
    );

  const name =
    formatPokemonActorName(
      localizedName,
      level,
      language
    );

  const abilities =
    buildAbilities(
      pokemon,
      context.abilityScoreGains,
      context.abilityScoreBase,
      context.additionalSavingThrows
    );

  const media =
    buildPokemonMedia(
      pokemon
    );


  const {
    portrait,
    token
  } =
    media;

  const hpData =
    calculatePokemonHp(
      pokemon,
      level,
      abilities
    );

  const traits =
    buildTraits(
      defenses,
      pokemon.size
    );

  validatePokemonDefenseTraits(
    pokemon,
    defenses,
    traits
  );

  return {
    name,
    type: "npc",
    img: portrait,

    prototypeToken: {
      name,

      /*
      * Un Pokémon importado sin Trainer es una
      * plantilla de encuentro. Cada Token colocado
      * en una Scene mantiene su propio Actor sintético.
      *
      * Trainer/Party enlaza el Prototype Token cuando
      * el Pokémon pasa a pertenecer a un Trainer.
      */
      actorLink: false,

      displayName:
        CONST.TOKEN_DISPLAY_MODES.ALWAYS,

      displayBars:
        CONST.TOKEN_DISPLAY_MODES.ALWAYS,

      texture: {
        src: token
      },

      bar1: {
        attribute:
          "attributes.hp"
      },

      vision: true
    },

    system: {
      abilities,

      attributes: {
        ac: {
          calc: "natural",
          flat:
            positiveInteger(
              pokemon.combat?.ac,
              10
            )
        },

        hp: {
          value: hpData.max,
          max: hpData.max,
          temp: 0,
          formula: hpData.formula
        },

        movement:
          buildMovement(
            pokemon.combat
              ?.speed
          ),

        senses:
          buildSenses(
            pokemon.combat
              ?.senses
          )
      },

      details: {
        /*
        * SR Pokémon NO es Challenge Rating.
        *
        * El nivel Pokémon se mantiene en
        * flags.poke5e-local.level.
        */
        cr: 0,

        type: {
          value: "custom",
          subtype: "",
          swarm: "",
          custom: "Pokémon"
        }
      },

      skills:
        buildSkills(
          pokemon.combat
            ?.skills,
          context
            .additionalSkillProficiencies
        ),

      traits,

      source: {
        custom: "Poke5e"
      }
    },

    items,

    effects: [
      buildPokemonProficiencyEffect(level)
    ],

    flags: {
      [MODULE_ID]: {
        kind: "pokemon",
        sourceId:
          pokemon.id,

        dexNumber:
          pokemon.dexNumber ??
          null,

        level,

        proficiencyBonus: pb,

        importKey: `${pokemon.id}@${level}`,

        sr:
          pokemon.sr ??
          null,

        genderRatio:
          pokemon.biology
            ?.genderRatio ??
          null,

        types,
        primaryType,
        proficiency: pb,

        media:
          foundry.utils.deepClone(
            media
          ),

        defenses:
          extractDefenseMetadata(
            defenses
          ),

        abilities:
          normalizeAbilityRefs(
            pokemon.abilities
          ),

        hiddenAbilities:
          normalizeAbilityRefs(
            pokemon.abilities
          ).filter(
            entry =>
              entry.hidden
          ),

        grantedHiddenAbilities:
          [
            ...grantedHiddenAbilityIds
          ],

        activeAbilityId:
          null,

        builderVersion:
          BUILDER_VERSION
      }
    }
  };
}

function getSystemMoves(
  context
) {
  const {
    pokemon,
    moveIndex
  } = context;

  const struggle =
    moveIndex.get(
      STRUGGLE_MOVE_ID
    );

  if (!struggle) {
    console.warn(
      `[${MODULE_ID}] ${pokemon.id}: ` +
      "Struggle no está disponible en la base de Moves."
    );

    return [];
  }

  return [
    struggle
  ];
}


function normalizeCanonicalId(
  value
) {
  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}

function normalizeAbilityRefs(
  abilities
) {
  if (
    !Array.isArray(
      abilities
    )
  ) {
    return [];
  }

  return abilities
    .map(
      entry =>
        typeof entry ===
        "string"
          ? {
              id: entry,
              hidden: false
            }
          : {
              id: String(
                entry?.id ??
                ""
              ),
              hidden:
                Boolean(
                  entry?.hidden
                )
            }
    )
    .filter(
      entry =>
        entry.id
    );
}

function resolveGrantedHiddenAbilityIds(
  pokemon,
  grantedHiddenAbilities
) {
  const hiddenAbilityIds =
    new Set(
      normalizeAbilityRefs(
        pokemon.abilities
      )
        .filter(
          reference =>
            reference.hidden
        )
        .map(
          reference =>
            reference.id
        )
    );

  const requested =
    grantedHiddenAbilities instanceof Set
      ? [
          ...grantedHiddenAbilities
        ]
      : Array.isArray(
          grantedHiddenAbilities
        )
        ? grantedHiddenAbilities
        : [];

  return new Set(
    requested
      .map(
        id =>
          String(
            id ?? ""
          ).trim()
      )
      .filter(
        id =>
          id &&
          hiddenAbilityIds.has(
            id
          )
      )
  );
}

function normalizeAbilityScoreGains(
  value
) {

  const source =
    value &&
    typeof value ===
      "object"
      ? value
      : {};


  return Object.fromEntries(
    ABILITY_IDS.map(
      abilityId => {

        const numeric =
          Number(
            source[
              abilityId
            ]
          );


        return [
          abilityId,

          Number.isFinite(
            numeric
          )
            ? Math.max(
                0,
                Math.trunc(
                  numeric
                )
              )
            : 0
        ];
      }
    )
  );
}

function normalizeAbilityScoreBase(
  value
) {

  const source =
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
      ? value
      : {};


  const result =
    {};


  for (
    const abilityId
    of ABILITY_IDS
  ) {

    const numeric =
      Number(
        source[
          abilityId
        ]
      );


    if (
      !Number.isFinite(
        numeric
      )
    ) {

      continue;
    }


    result[
      abilityId
    ] =
      Math.clamp(
        Math.trunc(
          numeric
        ),
        1,
        30
      );
  }


  return result;
}


function normalizeAdditionalSkillProficiencies(
  value
) {

  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {

    return {};
  }


  const result =
    {};


  for (
    const [
      rawId,
      rawEntry
    ]
    of Object.entries(
      value
    )
  ) {

    const skillId =
      normalizeSkillId(
        rawId
      );


    if (!skillId) {

      continue;
    }


    const entry =
      rawEntry &&
      typeof rawEntry ===
        "object"
        ? rawEntry
        : {};


    result[
      skillId
    ] = {

      value:
        clampInteger(
          entry.value ??
          entry.proficient,
          0,
          2,
          1
        ),

      ability:
        String(
          entry.ability ??
          ""
        )
    };
  }


  return result;
}

function buildAbilities(
  pokemon,
  abilityScoreGains = {},
  abilityScoreBase = {},
  additionalSavingThrows = []
) {

  const speciesScores =
    pokemon.combat
      ?.attributes ??
    {};


  const proficientSaves =
    new Set([
      ...normalizeStringArray(
        pokemon.combat
          ?.savingThrows
      ),

      ...normalizeStringArray(
        additionalSavingThrows
      )
    ]);


  return Object.fromEntries(
    ABILITY_IDS.map(
      id => {

        const hasIndividualBase =
          Object.prototype
            .hasOwnProperty
            .call(
              abilityScoreBase,
              id
            );


        const baseScore =
          clampInteger(
            hasIndividualBase
              ? abilityScoreBase[
                  id
                ]
              : speciesScores[
                  id
                ],
            1,
            30,
            10
          );


        const bonus =
          Math.max(
            0,
            Math.trunc(
              Number(
                abilityScoreGains[
                  id
                ] ??
                0
              )
            )
          );


        return [
          id,

          {
            value:
              Math.min(
                30,
                baseScore +
                bonus
              ),

            proficient:
              proficientSaves.has(
                id
              )
                ? 1
                : 0,

            bonuses: {
              check:
                "",

              save:
                ""
            }
          }
        ];
      }
    )
  );
}

function buildSkills(
  rawSkills,
  additionalSkills = {}
) {

  const skills =
    {};


  for (
    const entry
    of Array.isArray(
      rawSkills
    )
      ? rawSkills
      : []
  ) {

    const rawId =
      typeof entry ===
        "string"
        ? entry
        : entry?.id ??
          entry?.name;


    const skillId =
      normalizeSkillId(
        rawId
      );


    if (!skillId) {

      continue;
    }


    skills[
      skillId
    ] = {

      value:
        clampInteger(
          typeof entry ===
            "object"
            ? entry.value ??
              entry.proficient
            : 1,
          0,
          2,
          1
        ),

      ability:
        typeof entry ===
          "object"
          ? entry.ability ??
            ""
          : "",

      bonuses: {
        check:
          "",

        passive:
          ""
      }
    };
  }


  for (
    const [
      skillId,
      entry
    ]
    of Object.entries(
      additionalSkills
    )
  ) {

    const normalizedSkillId =
      normalizeSkillId(
        skillId
      );


    if (!normalizedSkillId) {

      continue;
    }


    const retainedValue =
      clampInteger(
        entry?.value ??
        entry?.proficient,
        0,
        2,
        1
      );


    const current =
      skills[
        normalizedSkillId
      ];


    if (!current) {

      skills[
        normalizedSkillId
      ] = {

        value:
          retainedValue,

        ability:
          String(
            entry?.ability ??
            ""
          ),

        bonuses: {
          check:
            "",

          passive:
            ""
        }
      };


      continue;
    }


    current.value =
      Math.max(
        current.value,
        retainedValue
      );


    if (
      !current.ability
    ) {

      current.ability =
        String(
          entry?.ability ??
          ""
        );
    }
  }


  return skills;
}

function normalizeSkillId(
  value
) {
  const key =
    String(
      value ?? ""
    )
      .trim()
      .toLowerCase()
      .replace(
        /_/g,
        "-"
      );

  return (
    SKILL_MAP[key] ??
    null
  );
}

function buildMovement(
  rawSpeed
) {
  const movement = {
    walk: 0,
    burrow: 0,
    climb: 0,
    fly: 0,
    swim: 0,
    units: "ft",
    hover: false
  };

  for (
    const entry
    of Array.isArray(rawSpeed)
      ? rawSpeed
      : []
  ) {
    const key =
      MOVEMENT_MAP[
        String(
          entry?.type ??
          ""
        )
          .trim()
          .toLowerCase()
      ];

    if (!key) {
      continue;
    }

    movement[key] =
      Math.max(
        movement[key],

        nonNegativeNumber(
          entry?.value,
          0
        )
      );
  }

  return movement;
}

function buildSenses(
  rawSenses
) {
  const senses = {
    darkvision: 0,
    blindsight: 0,
    tremorsense: 0,
    truesight: 0,
    units: "ft",
    special: ""
  };

  const special = [];

  for (
    const entry
    of Array.isArray(rawSenses)
      ? rawSenses
      : []
  ) {
    const raw =
      typeof entry ===
      "string"
        ? entry
        : entry?.name ??
          entry?.type ??
          "";

    const value =
      typeof entry ===
      "object"
        ? entry?.value
        : null;

    const text =
      String(raw).trim();

    const match =
      text.match(
        /(darkvision|blindsight|tremorsense|truesight)\s*(\d+)?/i
      );

    if (!match) {
      if (text) {
        special.push(text);
      }

      continue;
    }

    const key =
      match[1]
        .toLowerCase();

    const distance =
      nonNegativeNumber(
        value ??
        match[2],
        0
      );

    senses[key] =
      Math.max(
        senses[key],
        distance
      );
  }

  senses.special =
    special.join("; ");

  return senses;
}

function buildTraits(defenses, size) {
  const categorized = categorizeDefenses(defenses);

  return {
    size: normalizeSize(size),

    di: {
      value: categorized.immunities,
      custom: ""
    },

    dr: {
      value: categorized.resistances,
      custom: ""
    },

    dv: {
      value: categorized.vulnerabilities,
      custom: ""
    },

    ci: {
      value: [],
      custom: ""
    }
  };
}

function categorizeDefenses(defenses) {
  const explicitImmunities = extractExplicitDefenseList(
    defenses,
    ["immunities", "immune", "di"]
  );

  const explicitResistances = extractExplicitDefenseList(
    defenses,
    ["resistances", "resistant", "dr"]
  );

  const explicitVulnerabilities = extractExplicitDefenseList(
    defenses,
    ["vulnerabilities", "vulnerable", "dv"]
  );

  const multipliers = extractDefenseMultipliers(defenses);

  const immunities = new Set(explicitImmunities);
  const resistances = new Set(explicitResistances);
  const vulnerabilities = new Set(explicitVulnerabilities);

  for (const [type, multiplier] of Object.entries(multipliers)) {
    const normalizedType = normalizeType(type);
    const value = Number(multiplier);

    if (
      !normalizedType ||
      !Number.isFinite(value)
    ) {
      continue;
    }

    /*
     * Reiniciamos cualquier clasificación previa
     * para que el multiplicador sea la autoridad.
     */
    immunities.delete(normalizedType);
    resistances.delete(normalizedType);
    vulnerabilities.delete(normalizedType);

    if (value <= 0) {
      immunities.add(normalizedType);
      continue;
    }

    if (value < 1) {
      resistances.add(normalizedType);
      continue;
    }

    if (value > 1) {
      vulnerabilities.add(normalizedType);
    }
  }

  return {
    immunities: [...immunities],
    resistances: [...resistances],
    vulnerabilities: [...vulnerabilities]
  };
}

function extractExplicitDefenseList(defenses, keys) {
  for (const key of keys) {
    const candidates = [
      defenses?.[key],
      defenses?.traits?.[key],
      defenses?.dnd?.[key]
    ];

    for (const value of candidates) {
      if (Array.isArray(value)) {
        return unique(
          value
            .map(normalizeType)
            .filter(Boolean)
        );
      }

      if (value instanceof Set) {
        return unique(
          [...value]
            .map(normalizeType)
            .filter(Boolean)
        );
      }

      if (Array.isArray(value?.value)) {
        return unique(
          value.value
            .map(normalizeType)
            .filter(Boolean)
        );
      }

      if (value?.value instanceof Set) {
        return unique(
          [...value.value]
            .map(normalizeType)
            .filter(Boolean)
        );
      }
    }
  }

  return [];
}

function extractDefenseMultipliers(defenses) {
  if (!defenses) {
    return {};
  }

  const candidates = [
    defenses.multipliers,
    defenses.rawMultipliers,
    defenses.typeMultipliers,
    defenses.raw,
    defenses.chart
  ];

  for (const candidate of candidates) {
    const normalized = normalizeMultiplierCollection(candidate);

    if (Object.keys(normalized).length) {
      return normalized;
    }
  }

  /*
   * Compatibilidad por si calculatePokemonDefenses()
   * devuelve directamente:
   *
   * {
   *   fire: 0.5,
   *   water: 2,
   *   ...
   * }
   */
  return normalizeMultiplierCollection(defenses);
}

function normalizeMultiplierCollection(value) {
  if (!value) {
    return {};
  }

  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()]
        .filter(
          ([type, multiplier]) =>
            isPokemonDamageType(type) &&
            Number.isFinite(Number(multiplier))
        )
        .map(
          ([type, multiplier]) => [
            normalizeType(type),
            Number(multiplier)
          ]
        )
    );
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([type, multiplier]) =>
          isPokemonDamageType(type) &&
          Number.isFinite(Number(multiplier))
      )
      .map(
        ([type, multiplier]) => [
          normalizeType(type),
          Number(multiplier)
        ]
      )
  );
}

function isPokemonDamageType(value) {
  return POKEMON_DAMAGE_TYPES.has(
    normalizeType(value)
  );
}

function extractDefenseMetadata(defenses) {
  return extractDefenseMultipliers(defenses);
}

function normalizeSize(
  value
) {
  const key =
    String(
      value ??
      "medium"
    )
      .trim()
      .toLowerCase();

  return (
    SIZE_MAP[key] ??
    "med"
  );
}

function createAbilityItem(
  ability,
  language,
  {
    hiddenAbility = false
  } = {}
) {
  return {
    name:
      localized(
        ability.name,
        language,
        ability.id
      ),

    type: "feat",

    img:
      DEFAULT_ABILITY_ICON,

    system: {
      description: {
        value:
          toHtml(
            localized(
              ability.description,
              language
            )
          ),

        chat: ""
      },

      identifier:
        ability.id,

      source: {
        custom: "Poke5e"
      },

      type: {
        value: "monster",
        subtype: ""
      },

      requirements: null,
      properties: [],
      activities: {},

      uses: {
        spent: 0,
        max: "",
        recovery: []
      }
    },

    effects: [],

    flags: {
      [MODULE_ID]: {
        kind:
          "ability",

        sourceId:
          ability.id,

        hiddenAbility:
          Boolean(
            hiddenAbility
          ),

        deprecated:
          Boolean(
            ability.deprecated
          ),

        importManaged:
          false,

        catalog:
          "abilities",

        abilityDefinition:
          foundry.utils.deepClone(
            ability
          ),

        builderVersion:
          BUILDER_VERSION
      }
    }
  };
}

function createMoveItem(
  move,
  context,
  {
    importManaged = false
  } = {}
) {
  const mechanics =
    buildMoveMechanics(
      move,
      context
    );

  const effects =
    mergeEffectSources(
      mechanics
        .statusEffects
        .effects,

      mechanics
        .modifierEffects
        .effects,

      mechanics
        .periodicEffects
        .effects
    );

  const activityEffectRefs =
    mergeEffectSources(
      mechanics
        .statusEffects
        .activityEffects,

      mechanics
        .modifierEffects
        .activityEffects,

      mechanics
        .periodicEffects
        .activityEffects
    );

  const activitiesResult =
    buildActivities(
      move,
      context,
      mechanics,
      activityEffectRefs
    );

  const itemType =
    move.attack
      ? "weapon"
      : "feat";

  const name =
    localized(
      move.name,
      context.language,
      move.id
    );

  const description =
    buildMoveDescription(
      move,
      context.language
    );

  return {
    name,
    type: itemType,
    img:
      resolveMoveIcon(
        move.type
      ),

    system:
      itemType ===
      "weapon"
        ? buildWeaponSystem(
            move,
            name,
            description,
            activitiesResult
              .activities
          )
        : buildFeatSystem(
            move,
            name,
            description,
            activitiesResult
              .activities
          ),

    effects,

    flags: {
      [MODULE_ID]: {
        kind: "move",

        sourceId:
          move.id,

        moveType:
          normalizeType(
            move.type
          ),

        level:
          context.level,

        pp:
          positiveInteger(
            move.pp,
            0
          ),

        stab:
          mechanics.stab,

        instantDrain:
          mechanics.drainData,

        instantRecoil:
          mechanics.recoilData,

        selfDamage:
          mechanics.selfDamageData,

        forcedRecoil:
          mechanics.forcedRecoilData,

        multiTarget:
          mechanics.multiTargetData,

        saveResult:
          mechanics.saveResultData,

        struggle:
          buildStruggleMetadata(
            move,
            context
          ),

        dynamicDamage:
          buildDynamicDamageMetadata(
            move,
            context,
            activitiesResult
              .rejectedFormulas
          ),

        rejectedDamageFormulas:
          activitiesResult
            .rejectedFormulas,

        importManaged:
          Boolean(
            importManaged
          ),

        catalog:
          importManaged
            ? "system"
            : "moves",

        moveDefinition:
          foundry.utils.deepClone(
            move
          ),

        builderVersion:
          BUILDER_VERSION
      }
    }
  };
}

function buildMoveMechanics(
  move,
  context
) {
  const moveType =
    normalizeType(
      move.type
    );

  const stabEligible =
    !isStruggleMove(
      move
    ) &&
    hasStab(
      context.types,
      moveType
    );

  const commonContext = {
    level:
      context.level,

    sourceProficiency:
      context.pb
  };

  return {
    stab: {
      eligible:
        stabEligible,

      bonus:
        stabEligible
          ? context.pb
          : 0
    },

    statusEffects:
      buildMoveStatusEffects(
        move,
        context.language,
        commonContext
      ),

    modifierEffects:
      buildMoveModifierEffects(
        move,
        context.language,
        commonContext
      ),

    periodicEffects:
      buildMovePeriodicEffects(
        move,
        context.language,
        commonContext
      ),

    drainData:
      buildMoveDrainData(
        move
      ),

    recoilData:
      buildMoveRecoilData(
        move
      ),

    selfDamageData:
      buildMoveSelfDamageData(
        move
      ),

    forcedRecoilData:
      buildMoveForcedRecoilData(
        move
      ),

    multiTargetData:
      buildMoveMultiTargetData(
        move
      ),

    saveResultData:
      buildMoveSaveResultData(
        move
      )
  };
}

function buildWeaponSystem(
  move,
  name,
  description,
  activities
) {
  return {
    description: {
      value:
        description,
      chat: ""
    },

    identifier:
      move.id,

    source: {
      custom: "Poke5e"
    },

    type: {
      value: "natural",
      baseItem: ""
    },

    proficient: 1,
    equipped: true,
    properties: [],

    activities,

    uses:
      buildItemUses(
        move.pp
      ),

    range:
      buildItemRange(
        move.range
      ),

    damage: {
      base:
        emptyDamagePart(),

      versatile:
        emptyDamagePart()
    }
  };
}

function buildFeatSystem(
  move,
  name,
  description,
  activities
) {
  return {
    description: {
      value:
        description,
      chat: ""
    },

    identifier:
      move.id,

    source: {
      custom: "Poke5e"
    },

    type: {
      value: "monster",
      subtype: ""
    },

    requirements: null,
    properties: [],

    activities,

    uses:
      buildItemUses(
        move.pp
      )
  };
}

function buildItemUses(
  pp
) {
  const max =
    positiveInteger(
      pp,
      0
    );

  return {
    spent: 0,

    max:
      max > 0
        ? String(max)
        : "",

    recovery: []
  };
}

function buildItemRange(
  range
) {
  const parsed =
    parseRange(
      range
    );

  return {
    value:
      parsed.value,

    long: null,

    reach:
      parsed.isMelee
        ? 5
        : null,

    units:
      parsed.units === "self"
        ? "ft"
        : parsed.units
  };
}

function buildActivities(
  move,
  context,
  mechanics,
  activityEffectRefs
) {
    if (
      isStruggleMove(
        move
      )
    ) {
      return buildStruggleActivities(
        move,
        context,
        mechanics,
        activityEffectRefs
      );
    }

  const activities = {};
  const rejectedFormulas = [];

  const primaryType =
    resolvePrimaryActivityType(
      move,
      mechanics
        .periodicEffects
    );

  const primary =
    createActivity(
      primaryType,
      move,
      context,
      mechanics,
      activityEffectRefs,
      true
    );

  const sanitizedPrimary =
    sanitizeActivityDamage(
      primary,
      move
    );

  activities[
    sanitizedPrimary
      .activity
      ._id
  ] =
    sanitizedPrimary
      .activity;

  rejectedFormulas.push(
    ...sanitizedPrimary
      .rejectedFormulas
  );

  /*
   * Algunos Moves hacen attack roll
   * y luego requieren una save.
   * Se crea una actividad secundaria
   * sin consumir PP ni repetir daño.
   */
  if (
    move.attack &&
    move.save
  ) {
    const secondary =
      createActivity(
        "save",
        move,
        context,
        mechanics,
        activityEffectRefs,
        false,
        {
          includeDamage:
            false,

          nameSuffix:
            context.language ===
            "en"
              ? "Save"
              : "Salvación"
        }
      );

    const sanitizedSecondary =
      sanitizeActivityDamage(
        secondary,
        move
      );

    activities[
      sanitizedSecondary
        .activity
        ._id
    ] =
      sanitizedSecondary
        .activity;

    rejectedFormulas.push(
      ...sanitizedSecondary
        .rejectedFormulas
    );
  }

  const continuation = BINDING_CONTINUATIONS[move.id];
  if (continuation) {
    const recurringMove = foundry.utils.deepClone(move);
    recurringMove.damage.modifier = continuation.modifier;
    recurringMove.duration = "instantaneous";
    recurringMove.activation = { type: continuation.activation, cost: 1 };
    const recurring = createActivity("damage", recurringMove, context, mechanics, [], false, {
      includeDamage: true, nameSuffix: context.language === "en" ? "Continue binding" : "Continuar atrapamiento"
    });
    recurring.flags = { [MODULE_ID]: { bindingContinuation: true } };
    activities[recurring._id] = recurring;
  }

  return {
    activities,

    rejectedFormulas:
      unique(
        rejectedFormulas
      )
  };
}

function buildStruggleActivities(
  move,
  context,
  mechanics,
  activityEffectRefs
) {
  const activities = {};
  const rejectedFormulas = [];

  const variants =
    getStruggleActivityVariants(
      context.language
    );

  for (
    const variant
    of variants
  ) {
    const adaptedMove = {
      ...move,

      attack: {
        ...(
          move.attack ??
          {}
        ),

        scope:
          variant.scope
      },

      range:
        variant.range
    };

    const activity =
      createActivity(
        "attack",
        adaptedMove,
        context,
        mechanics,
        activityEffectRefs,
        true,
        {
          nameSuffix:
            variant.nameSuffix
        }
      );

    activity._id =
      variant.activityId;

    const sanitized =
      sanitizeActivityDamage(
        activity,
        move
      );

    activities[
      sanitized.activity._id
    ] =
      sanitized.activity;

    rejectedFormulas.push(
      ...sanitized
        .rejectedFormulas
    );
  }

  return {
    activities,

    rejectedFormulas:
      unique(
        rejectedFormulas
      )
  };
}

function resolvePrimaryActivityType(
  move,
  periodicEffects
) {
  if (move.attack) {
    return "attack";
  }

  if (move.save) {
    return "save";
  }

  if (
    move.damage &&
    !periodicEffects
      .delayedDamage
  ) {
    return "damage";
  }

  return "utility";
}

function createActivity(
  type,
  move,
  context,
  mechanics,
  effectRefs,
  consumesPp,
  options = {}
) {
  const name =
    localized(
      move.name,
      context.language,
      move.id
    );

  const suffix =
    options.nameSuffix
      ? ` — ${options.nameSuffix}`
      : "";

  const activity = {
    _id:
      stableId(
        type === "save" &&
        move.attack
          ? "P5s"
          : "P5e",
        `${move.id}-${type}`
      ),

    type,

    name:
      `${name}${suffix}`,

    activation:
      buildActivation(
        move.activation
      ),

    consumption:
      buildConsumption(
        consumesPp &&
        positiveInteger(
          move.pp,
          0
        ) > 0
      ),

    description: {
      chatFlavor: ""
    },

    duration:
      buildDuration(
        move.duration
      ),

    effects:
      normalizeActivityEffectRefs(
        effectRefs,
        type
      ),

    range:
      buildActivityRange(
        move.range
      ),

    target:
      buildTarget(
        move
      ),

    uses: {
      spent: 0,
      max: "",
      recovery: []
    }
  };

  const includeDamage =
    options.includeDamage ??
    !mechanics
      .periodicEffects
      .delayedDamage;

  if (type === "attack") {
    Object.assign(
      activity,

      buildAttackActivityData(
        move,
        context,
        mechanics,
        includeDamage
      )
    );
  } else if (
    type === "save"
  ) {
    Object.assign(
      activity,

      buildSaveActivityData(
        move,
        context,
        mechanics,
        includeDamage
      )
    );
  } else if (
    type === "damage"
  ) {
    Object.assign(
      activity,

      buildDamageActivityData(
        move,
        context,
        mechanics,
        includeDamage
      )
    );
  } else {
    activity.roll = {
      formula: "",
      name: "",
      prompt: false,
      visible: false
    };
  }

  return activity;
}

function buildActivation(
  activation
) {
  const type =
    activation?.type ??
    inferActivationType(
      activation?.raw
    );

  const value =
    Number.isFinite(
      Number(
        activation?.cost
      )
    )
      ? Number(
          activation.cost
        )
      : 1;

  return {
    type:
      type ??
      "action",

    value,
    condition: "",
    override: true
  };
}

function inferActivationType(
  raw
) {
  const text =
    String(
      raw ?? ""
    ).toLowerCase();

  if (
    text.includes(
      "reaction"
    )
  ) {
    return "reaction";
  }

  if (
    text.includes(
      "bonus"
    )
  ) {
    return "bonus";
  }

  return "action";
}

function buildConsumption(
  consumesPp
) {
  return {
    scaling: {
      allowed: false,
      max: ""
    },

    spellSlot: false,

    targets:
      consumesPp
        ? [
            {
              type:
                "itemUses",

              target: "",
              value: "1",

              scaling: {
                mode: "",
                formula: ""
              }
            }
          ]
        : []
  };
}

function buildDuration(
  rawDuration
) {
  const text =
    String(
      rawDuration ?? ""
    )
      .trim()
      .toLowerCase();

  const concentration =
    text.includes(
      "concentration"
    );

  const minute =
    text.match(
      /(\d+)\s*minute/
    );

  const round =
    text.match(
      /(\d+)\s*round/
    );

  const hour =
    text.match(
      /(\d+)\s*hour/
    );

  if (minute) {
    return {
      value:
        Number(
          minute[1]
        ),

      units: "minute",
      special: "",
      concentration,
      override: true
    };
  }

  if (round) {
    return {
      value:
        Number(
          round[1]
        ),

      units: "round",
      special: "",
      concentration,
      override: true
    };
  }

  if (hour) {
    return {
      value:
        Number(
          hour[1]
        ),

      units: "hour",
      special: "",
      concentration,
      override: true
    };
  }

  return {
    value: null,
    units: "inst",
    special: "",
    concentration,
    override: true
  };
}

function buildActivityRange(
  range
) {
  const parsed =
    parseRange(
      range
    );

  return {
    value:
      parsed.value,

    units:
      parsed.units,

    special: "",
    override: true
  };
}

function parseRange(
  range
) {
  if (!range) {
    return {
      value: null,
      units: "",
      isMelee: false,
      isSelf: false,
      raw: ""
    };
  }

  if (
    typeof range ===
    "object"
  ) {
    if (
      range.type ===
      "melee"
    ) {
      return {
        value: 5,
        units: "ft",
        isMelee: true,
        isSelf: false,
        raw:
          range.raw ??
          "melee"
      };
    }

    if (
      range.type ===
      "self"
    ) {
      return {
        value: null,
        units: "self",
        isMelee: false,
        isSelf: true,
        raw:
          range.raw ??
          "self"
      };
    }

    if (
      Number.isFinite(
        Number(
          range.value
        )
      )
    ) {
      return {
        value:
          Number(
            range.value
          ),

        units:
          range.unit ??
          "ft",

        isMelee: false,
        isSelf: false,

        raw:
          range.raw ??
          ""
      };
    }

    return parseRange(
      range.raw
    );
  }

  const text =
    String(range)
      .trim()
      .toLowerCase();

  if (
    text ===
    "melee"
  ) {
    return {
      value: 5,
      units: "ft",
      isMelee: true,
      isSelf: false,
      raw: text
    };
  }

  if (
    text.startsWith(
      "self"
    )
  ) {
    return {
      value: null,
      units: "self",
      isMelee: false,
      isSelf: true,
      raw: text
    };
  }

  const feet =
    text.match(
      /(\d+)\s*ft/
    );

  return {
    value:
      feet
        ? Number(
            feet[1]
          )
        : null,

    units:
      feet
        ? "ft"
        : "",

    isMelee: false,
    isSelf: false,
    raw: text
  };
}

function legacyMoveArea(
  move
) {

  const englishDescription =
    localized(
      move?.description,
      "en",
      ""
    );


  const radius =
    englishDescription.match(
      /\b(\d+)\s*(?:foot|feet|ft)\s+radius\b/i
    );


  if (!radius) {

    return null;
  }


  const centeredOnSelf =
    /\bcentered\s+on\s+(?:you|yourself)\b/i.test(
      englishDescription
    );


  const centeredOnPoint =
    /\bcentered\s+on\s+(?:a\s+)?point\b/i.test(
      englishDescription
    );


  return {
    type:
      "radius",

    size:
      Number(
        radius[1]
      ),

    unit:
      "ft",

    origin:
      centeredOnSelf
        ? "self"
        : centeredOnPoint
          ? "point"
          : null
  };
}


function resolveMoveArea(
  move
) {

  const canonical =
    move?.area;


  if (
    canonical &&
    Number.isFinite(
      Number(
        canonical.size
      )
    )
  ) {

    return {
      type:
        String(
          canonical.type ??
          ""
        )
          .trim()
          .toLowerCase(),

      size:
        Number(
          canonical.size
        ),

      unit:
        String(
          canonical.unit ??
          "ft"
        )
          .trim()
          .toLowerCase(),

      origin:
        canonical.origin ??
        null
    };
  }


  /*
   * Compatibilidad temporal.
   *
   * Algunos Move Items existentes conservan
   * moveDefinition de schema 0.3.0 y aún no
   * poseen move.area.
   *
   * No contiene reglas específicas de Poison Gas.
   */

  return legacyMoveArea(
    move
  );
}

function buildTarget(
  move
) {

  const parsedRange =
    parseRange(
      move.range
    );


  const canonicalArea =
    resolveMoveArea(
      move
    );


  /*
   * Contrato nuevo:
   *
   * Move normalizado
   *       ↓
   * move.area
   *       ↓
   * D&D5e Activity Template
   */

  if (
    canonicalArea?.type &&
    canonicalArea.size > 0
  ) {

    return {
      template: {
        count:
          "",

        contiguous:
          false,

        type:
          canonicalArea.type,

        size:
          String(
            canonicalArea.size
          ),

        width:
          canonicalArea.type ===
            "line"
            ? "5"
            : "",

        height:
          "",

        units:
          canonicalArea.unit ||
          "ft"
      },

      affects: {
        count:
          "",

        type:
          "",

        choice:
          false,

        special:
          ""
      },

      prompt:
        true,

      override:
        true
    };
  }


  /*
   * Compatibilidad con rangos que ya expresaban
   * directamente su propia área, por ejemplo:
   *
   * self (20ft radius)
   *
   * Esto se mantiene mientras completamos la
   * normalización de todas las áreas.
   */

  const raw =
    parsedRange.raw;


  const legacyRangeArea =
    raw.match(
      /(\d+)\s*ft\s*(radius|cone|line|cube|sphere)/i
    );


  if (
    legacyRangeArea
  ) {

    const type =
      legacyRangeArea[2]
        .toLowerCase();


    return {
      template: {
        count:
          "",

        contiguous:
          false,

        type,

        size:
          String(
            legacyRangeArea[1]
          ),

        width:
          type === "line"
            ? "5"
            : "",

        height:
          "",

        units:
          "ft"
      },

      affects: {
        count:
          "",

        type:
          "",

        choice:
          false,

        special:
          ""
      },

      prompt:
        true,

      override:
        true
    };
  }


  return {
    template: {
      count:
        "",

      contiguous:
        false,

      type:
        "",

      size:
        "",

      width:
        "",

      height:
        "",

      units:
        "ft"
    },

    affects: {
      count:
        "1",

      type:
        parsedRange.isSelf
          ? "self"
          : "creature",

      choice:
        false,

      special:
        ""
    },

    prompt:
      !parsedRange.isSelf,

    override:
      true
  };
}

function buildAttackActivityData(
  move,
  context,
  mechanics,
  includeDamage
) {
  const ability =
    resolveMoveAbility(
      move,
      context.pokemon
    );

  const scope =
    String(
      move.attack?.scope ??
      (
        parseRange(
          move.range
        ).isMelee
          ? "melee"
          : "ranged"
      )
    )
      .toLowerCase();

  return {
    attack: {
      ability,

      /*
       * D&D5e ya suma:
       * ability mod + proficiency.
       */
      bonus: "",

      critical: {
        threshold: null
      },

      flat: false,

      type: {
        value:
          scope === "melee"
            ? "melee"
            : "ranged",

        classification:
          "weapon"
      }
    },

    damage: {
      critical: {
        bonus: ""
      },

      includeBase: false,

      parts:
        includeDamage
          ? buildDamageParts(
              move,
              context,
              mechanics
            )
          : []
    }
  };
}

function buildSaveActivityData(
  move,
  context,
  mechanics,
  includeDamage
) {
  const ability =
    normalizeAbilityId(
      Array.isArray(
        move.save?.attribute
      )
        ? move.save
            .attribute[0]
        : move.save
            ?.attribute
    );

  return {
    save: {
      ability:
        ability
          ? [ability]
          : [],

      dc: {
        calculation: "",

        formula:
          String(
            resolveMoveDc(
              move,
              context
            )
          )
      }
    },

    damage: {
      onSave:
        resolveOnSaveMode(
          move
        ),

      parts:
        includeDamage
          ? buildDamageParts(
              move,
              context,
              mechanics
            )
          : []
    }
  };
}

function buildDamageActivityData(
  move,
  context,
  mechanics,
  includeDamage
) {
  return {
    damage: {
      critical: {
        allow: false,
        bonus: ""
      },

      parts:
        includeDamage
          ? buildDamageParts(
              move,
              context,
              mechanics
            )
          : []
    }
  };
}

function buildDamageParts(
  move,
  context,
  mechanics
) {
  const formula =
    buildDamageFormula(
      move,
      context,
      mechanics
    );

  if (!formula) {
    return [];
  }

  return [
    {
      number: null,
      denomination: null,
      bonus: "",

      types:
        isStruggleMove(
          move
        )
          ? []
          : resolveDamageTypes(
              move
            ),

      custom: {
        enabled: true,
        formula
      },

      scaling: {
        mode: "",
        number: 1,
        formula: ""
      }
    }
  ];
}

function buildDamageFormula(
  move,
  context,
  mechanics
) {
  const ability =
    resolveMoveAbility(
      move,
      context.pokemon
    );

  const abilityMod =
    abilityModifier(
      context.pokemon,
      ability
    );

  if (
    isStruggleMove(
      move
    )
  ) {
    return buildStruggleDamageFormula(
      abilityMod
    );
  }

  const dice =
    selectLevelValue(
      move.damage?.dice,
      context.level
    );

  if (!dice) {
    return "";
  }

  const moveModifier =
    resolveDamageModifier(
      move.damage?.modifier,
      abilityMod
    );

  const stabBonus =
    mechanics.stab.eligible
      ? context.pb
      : 0;

  return joinFormulaParts(
    String(dice).trim(),
    moveModifier,
    stabBonus
  );
}

function selectLevelValue(
  value,
  level
) {
  if (value == null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (
    typeof value !==
    "object"
  ) {
    return null;
  }

  const thresholds =
    Object.keys(value)
      .map(Number)
      .filter(
        Number.isFinite
      )
      .sort(
        (a, b) =>
          a - b
      );

  const selected =
    thresholds
      .filter(
        threshold =>
          threshold <=
          level
      )
      .at(-1) ??
    thresholds[0];

  return selected == null
    ? null
    : value[
        String(selected)
      ] ??
      value[selected];
}

function resolveDamageModifier(
  modifier,
  abilityMod
) {
  if (
    modifier == null ||
    modifier === ""
  ) {
    return 0;
  }

  if (
    typeof modifier ===
    "number"
  ) {
    return modifier;
  }

  const text =
    String(modifier)
      .trim();

  if (
    text.toUpperCase() ===
    "MOVE"
  ) {
    return abilityMod;
  }

  /*
   * También admite expresiones como:
   * "2 * MOVE".
   */
  if (
    /\bMOVE\b/i.test(
      text
    )
  ) {
    return text.replace(
      /\bMOVE\b/gi,
      String(
        abilityMod
      )
    );
  }

  const numeric =
    Number(text);

  return Number.isFinite(
    numeric
  )
    ? numeric
    : text;
}

function joinFormulaParts(
  base,
  ...parts
) {
  let formula = base;

  for (const part of parts) {
    if (
      part == null ||
      part === "" ||
      part === 0 ||
      part === "0"
    ) {
      continue;
    }

    if (
      typeof part ===
      "number"
    ) {
      formula +=
        part < 0
          ? ` - ${Math.abs(part)}`
          : ` + ${part}`;

      continue;
    }

    const text =
      String(part)
        .trim();

    if (!text) {
      continue;
    }

    formula +=
      text.startsWith("-")
        ? ` - ${text.slice(1).trim()}`
        : ` + ${text}`;
  }

  return formula.trim();
}

function resolveDamageTypes(
  move
) {
  const explicit =
    move.damage?.type;

  if (
    Array.isArray(
      explicit
    ) &&
    explicit.length
  ) {
    return unique(
      explicit.map(
        normalizeType
      )
    );
  }

  if (
    typeof explicit ===
      "string" &&
    explicit
  ) {
    return [
      normalizeType(
        explicit
      )
    ];
  }

  return move.type
    ? [
        normalizeType(
          move.type
        )
      ]
    : [];
}

function resolveMoveAbility(
  move,
  pokemon
) {
  const candidates =
    Array.isArray(
      move.powerAbilities
    )
      ? move.powerAbilities
      : Array.isArray(
          move.power
        )
        ? move.power
        : [
            move.powerAbilities ??
            move.power
          ];

  const valid =
    candidates
      .map(
        normalizeAbilityId
      )
      .filter(Boolean);

  if (!valid.length) {
    return parseRange(
      move.range
    ).isMelee
      ? "str"
      : "dex";
  }

  return valid.reduce(
    (
      best,
      current
    ) =>
      abilityModifier(
        pokemon,
        current
      ) >
      abilityModifier(
        pokemon,
        best
      )
        ? current
        : best
  );
}

function resolveMoveDc(
  move,
  context
) {
  const raw =
    move.save?.dc;

  if (
    String(
      raw ?? ""
    )
      .trim()
      .toUpperCase() ===
    "MOVE"
  ) {
    const ability =
      resolveMoveAbility(
        move,
        context.pokemon
      );

    return (
      8 +
      context.pb +
      abilityModifier(
        context.pokemon,
        ability
      )
    );
  }

  const numeric =
    Number(raw);

  if (
    Number.isFinite(
      numeric
    )
  ) {
    return numeric;
  }

  const ability =
    resolveMoveAbility(
      move,
      context.pokemon
    );

  return (
    8 +
    context.pb +
    abilityModifier(
      context.pokemon,
      ability
    )
  );
}

function resolveOnSaveMode(
  move
) {
  if (!move.damage) {
    return "none";
  }

  const english =
    localized(
      move.description,
      "en",
      ""
    )
      .toLowerCase();

  const halfPatterns = [
    /half(?:\s+as\s+much|\s+damage)?\s+on\s+(?:a\s+)?success/,
    /half(?:\s+as\s+much|\s+damage)?\s+on\s+(?:a\s+)?save\b/,
    /half\s+on\s+(?:a\s+)?success/,
    /or\s+half(?:\s+as\s+much|\s+damage)?\s+on\s+(?:a\s+)?successful/,
    /on\s+(?:a\s+)?successful\s+save[^.]*half/
  ];

  return halfPatterns.some(
    pattern =>
      pattern.test(
        english
      )
  )
    ? "half"
    : "none";
}

function abilityModifier(
  pokemon,
  ability
) {
  const score =
    Number(
      pokemon.combat
        ?.attributes
        ?.[ability] ??
      10
    );

  return Math.floor(
    (score - 10) /
    2
  );
}

function normalizeAbilityId(
  value
) {
  const id =
    String(
      value ?? ""
    )
      .trim()
      .toLowerCase();

  return ABILITY_IDS.includes(
    id
  )
    ? id
    : null;
}

function normalizeActivityEffectRefs(
  refs,
  activityType
) {
  return mergeEffectSources(
    refs
  ).map(
    ref =>
      activityType ===
      "save"
        ? {
            _id:
              ref._id,

            onSave:
              Boolean(
                ref.onSave
              )
          }
        : {
            _id:
              ref._id
          }
  );
}

function mergeEffectSources(
  ...collections
) {
  const byId =
    new Map();

  for (
    const entry
    of collections
      .flat()
      .filter(Boolean)
  ) {
    const id =
      entry._id ??
      stableId(
        "P5x",
        JSON.stringify(
          entry
        )
      );

    if (
      !byId.has(id)
    ) {
      byId.set(
        id,
        entry
      );
    }
  }

  return [
    ...byId.values()
  ];
}

function buildStruggleMetadata(
  move,
  context
) {
  if (
    !isStruggleMove(
      move
    )
  ) {
    return null;
  }

  const ability =
    resolveMoveAbility(
      move,
      context.pokemon
    );

  const moveModifier =
    abilityModifier(
      context.pokemon,
      ability
    );

  return {
    kind:
      "struggle",

    ability,

    damageFormula:
      buildStruggleDamageFormula(
        moveModifier
      ),

    damageType:
      STRUGGLE_RULE.damageType,

    noAmplification:
      STRUGGLE_RULE.noAmplification,

    meleeActivityId:
      STRUGGLE_ACTIVITY_IDS.melee,

    rangedActivityId:
      STRUGGLE_ACTIVITY_IDS.ranged,

    meleeRange:
      STRUGGLE_RULE.meleeRange,

    rangedRange:
      STRUGGLE_RULE.rangedRange
  };
}

function isImplementedDynamicDamage(
  move
) {

  const kind =
    DYNAMIC_DAMAGE_KINDS[
      move?.id
    ];


  return Boolean(
    kind &&
    IMPLEMENTED_DYNAMIC_DAMAGE_KINDS.has(
      kind
    )
  );
}


function buildDynamicDamagePlaceholder(
  move
) {

  const part =
    emptyDamagePart();


  part.types =
    resolveDamageTypes(
      move
    );


  part.custom = {
    enabled: true,
    formula:
      DYNAMIC_DAMAGE_PLACEHOLDER_FORMULA
  };


  return part;
}

function sanitizeActivityDamage(
  activity,
  move
) {

  const parts =
    activity
      ?.damage
      ?.parts;


  if (
    !Array.isArray(parts) ||
    !parts.length
  ) {

    return {
      activity,
      rejectedFormulas: []
    };
  }


  const validParts = [];
  const rejectedFormulas = [];


  for (
    const part
    of parts
  ) {

    const formula =
      getDamagePartFormula(
        part
      );


    if (
      !formula ||
      isValidFoundryFormula(
        formula
      )
    ) {

      validParts.push(
        part
      );

      continue;
    }


    rejectedFormulas.push(
      formula
    );
  }


  if (
    rejectedFormulas.length
  ) {

    const dynamicImplemented =
      isImplementedDynamicDamage(
        move
      );


    activity.damage.parts =
      dynamicImplemented

        ? [
            ...validParts,
            buildDynamicDamagePlaceholder(
              move
            )
          ]

        : validParts;


    console.warn(

      `[${MODULE_ID}] ${move.id}: ` +

      (
        dynamicImplemented

          ? "fórmula dinámica delegada al Core Engine:"

          : "se omitieron fórmulas de daño incompatibles con Foundry:"
      ),

      rejectedFormulas
    );
  }


  return {
    activity,
    rejectedFormulas
  };
}

function getDamagePartFormula(
  part
) {
  if (
    part?.custom
      ?.enabled
  ) {
    return String(
      part.custom
        .formula ??
      ""
    ).trim();
  }

  const number =
    Number(
      part?.number ??
      0
    );

  const denomination =
    Number(
      part?.denomination ??
      0
    );

  const bonus =
    String(
      part?.bonus ??
      ""
    ).trim();

  const dice =
    number > 0 &&
    denomination > 0
      ? `${number}d${denomination}`
      : "";

  return joinFormulaParts(
    dice,
    bonus
  );
}

function isValidFoundryFormula(
  formula
) {
  const text =
    String(
      formula ?? ""
    ).trim();

  if (!text) {
    return true;
  }

  try {
    /*
     * Primera barrera: parser de Foundry.
     */
    if (
      !Roll.validate(
        text
      )
    ) {
      return false;
    }

    /*
     * Segunda barrera:
     * no permitimos StringTerms sin resolver
     * como Rd10, 3×dice, etc.
     */
    const roll =
      Roll.create(
        text
      );

    roll.evaluateSync({
      strict: true,
      allowStrings: false,
      maximize: true
    });

    return Number.isFinite(
      roll.total
    );
  } catch {
    return false;
  }
}

function buildDynamicDamageMetadata(
  move,
  context,
  rejectedFormulas
) {

  if (
    !rejectedFormulas.length
  ) {

    return null;
  }


  return {

    kind:
      DYNAMIC_DAMAGE_KINDS[
        move.id
      ] ??
      "unsupported-formula",


    implemented:
      isImplementedDynamicDamage(
        move
      ),


    level:
      context.level,


    type:
      normalizeType(
        move.type
      ),


    rejectedFormulas,


    sourceDamage:
      foundry.utils.deepClone(
        move.damage ??
        null
      )
  };
}

function validateActorSource(
  source
) {
  const problems = [];

  for (
    const item
    of source.items ??
      []
  ) {
    const activities =
      Object.values(
        item.system
          ?.activities ??
        {}
      );

    for (
      const activity
      of activities
    ) {
      const parts =
        activity
          ?.damage
          ?.parts ??
        [];

      for (const part of parts) {
        const formula =
          getDamagePartFormula(
            part
          );

        if (
          formula &&
          !isValidFoundryFormula(
            formula
          )
        ) {
          problems.push({
            item:
              item.name,

            activity:
              activity.name ??
              activity._id,

            formula
          });
        }
      }
    }
  }

  if (
    problems.length
  ) {
    console.error(
      `[${MODULE_ID}] El builder intentó producir fórmulas inválidas.`,
      problems
    );

    throw new Error(
      "Builder inválido: " +
      `${problems.length} fórmula(s) de daño ` +
      "no compatibles con Foundry."
    );
  }
}

export function buildMoveDescription(
  move,
  language
) {
  const description =
    localizedContent(
      move.description,
      language,
      ""
    );

  const higher =
    localized(
      move.higherLevels,
      language,
      ""
    );

  const sections = [];

  if (description) {
    sections.push(
      toHtml(
        description
      )
    );
  }

  if (higher) {
    const label =
      language === "en"
        ? "Higher Levels"
        : "Niveles superiores";

    sections.push(
      `<p><strong>${label}:</strong> ` +
      `${escapeHtml(higher)}</p>`
    );
  }

  return sections.join("");
}

function localized(
  value,
  language,
  fallback = ""
) {
  return contentText(
    localizedContent(value, language, fallback)
  );
}

function localizedContent(
  value,
  language,
  fallback = ""
) {
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return value[language] ?? value.en ?? value.es ?? fallback;
  }

  return fallback;
}

function contentText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(contentText).filter(Boolean).join("\n\n");
  }

  if (value?.type === "table") {
    return [value.headers, ...(value.rows ?? [])]
      .filter(Array.isArray)
      .map(row => row.map(contentText).join(" | "))
      .join("\n");
  }

  return "";
}

function toHtml(
  value
) {
  if (Array.isArray(value)) {
    return value.map(toHtml).join("");
  }

  if (value?.type === "table") {
    const cells = (row, tag) =>
      row.map(cell => `<${tag}>${escapeHtml(contentText(cell))}</${tag}>`).join("");
    const headers = Array.isArray(value.headers)
      ? `<thead><tr>${cells(value.headers, 'th')}</tr></thead>`
      : "";
    const rows = (value.rows ?? [])
      .filter(Array.isArray)
      .map(row => `<tr>${cells(row, 'td')}</tr>`)
      .join("");

    return `<table>${headers}<tbody>${rows}</tbody></table>`;
  }

  const text = contentText(value);

  if (!text.trim()) {
    return "";
  }

  return text
    .split(
      /\n{2,}/
    )
    .map(
      paragraph =>
        `<p>${
          escapeHtml(
            paragraph
          ).replace(
            /\n/g,
            "<br>"
          )
        }</p>`
    )
    .join("");
}

function escapeHtml(
  value
) {
  const text =
    String(
      value ?? ""
    );

  if (
    globalThis
      .foundry
      ?.utils
      ?.escapeHTML
  ) {
    return foundry.utils
      .escapeHTML(
        text
      );
  }

  return text
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

function resolveMoveIcon(
  moveType
) {
  const normalizedType =
    normalizeType(
      moveType
    );

  if (
    !POKEMON_DAMAGE_TYPES.has(
      normalizedType
    )
  ) {
    return DEFAULT_MOVE_ICON;
  }

  return (
    `${MOVE_ICON_ROOT}/${normalizedType}.png`
  );
}

function resolveModuleAsset(
  value
) {
  if (!value) {
    return null;
  }

  let path =
    String(value)
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      );

  path =
    path.replace(
      /^assets\//i,
      ""
    );

  return (
    `modules/${MODULE_ID}/assets/${path}`
  );
}

function normalizeType(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return unique(
    value
      .map(
        entry =>
          String(entry)
            .trim()
            .toLowerCase()
      )
      .filter(Boolean)
  );
}

function validOrFallbackFormula(
  candidate,
  fallback
) {
  const formula =
    String(
      candidate ?? ""
    ).trim();

  return (
    formula &&
    isValidFoundryFormula(
      formula
    )
  )
    ? formula
    : fallback;
}

function emptyDamagePart() {
  return {
    number: null,
    denomination: null,
    bonus: "",
    types: [],

    custom: {
      enabled: false,
      formula: ""
    },

    scaling: {
      mode: "",
      number: 1,
      formula: ""
    }
  };
}

function stableId(
  prefix,
  value
) {
  const safe =
    String(
      value ?? ""
    )
      .normalize("NFKD")
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      )
      .slice(
        0,
        13
      );

  return (
    `${prefix}${safe}`
      .padEnd(
        16,
        "0"
      )
      .slice(
        0,
        16
      )
  );
}

function unique(
  values
) {
  return [
    ...new Set(values)
  ];
}

function positiveInteger(
  value,
  fallback = 0
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.trunc(
      numeric
    )
  );
}

function nonNegativeNumber(
  value,
  fallback = 0
) {
  const numeric =
    Number(value);

  return Number.isFinite(
    numeric
  )
    ? Math.max(
        0,
        numeric
      )
    : fallback;
}

function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.min(
    max,

    Math.max(
      min,
      Math.trunc(
        numeric
      )
    )
  );
}
