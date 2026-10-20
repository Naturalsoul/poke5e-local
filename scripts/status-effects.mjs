import {
  endOfNextTurnFlags
} from "./turn-duration-runtime.mjs";

const MODULE_ID = "poke5e-local";


/* ============================================================
 * MOVIMIENTOS CON EFECTOS YA VALIDADOS
 *
 * No intentamos interpretar automáticamente
 * las descripciones de los 830 moves todavía.
 * ============================================================ */

const MOVE_STATUS_EFFECTS = {

  "poison-powder": [
    {
      status: "poisoned",
      trigger: "failed-save"
    }
  ],

  "stun-spore": [
    {
      status: "paralysis",
      trigger: "failed-save"
    }
  ],

  "thunder-wave": [
    {
      status: "paralysis",
      trigger: "failed-save"
    }
  ],

  "sleep-powder": [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  toxic: [
    {
      status: "badly-poisoned",
      trigger: "failed-save"
    }
  ],

    /* ==========================================================
   * BURNED
   * ========================================================== */

  "will-o-wisp": [
    {
      status: "burned",
      trigger: "hit"
    }
  ],

  "lava-plume": [
    {
      status: "burned",
      trigger: "failed-save"
    }
  ],

  "scald": [
    {

      status:
        "burned",

      /*
       * Scald:
       *
       * natural attack roll 16+
       * → Burned
       */

      trigger:
        "natural-attack-16+"
    }
  ],


  /* ==========================================================
   * FROZEN
   * ========================================================== */

  "freezing-glare": [
    {
      status: "frozen",
      trigger: "failed-save"
    }
  ],

  /* ==========================================================
   * STATUS RIDERS (batch)
   * ========================================================== */

  ember: [
    {
      status: "burned",
      trigger: "natural-attack-19+"
    }
  ],

  "signal-beam": [
    {
      status: "confused",
      trigger: "natural-attack-19+"
    }
  ],

  inferno: [
    {
      status: "burned",
      trigger: "hit"
    }
  ],

  "venom-drench": [
    {
      status: "poisoned",
      trigger: "failed-save"
    }
  ],

  "air-slash": [
    {
      status: "flinched",
      trigger: "natural-attack-15+"
    }
  ],

  astonish: [
    {
      status: "flinched",
      trigger: "natural-attack-15+"
    }
  ],

  bite: [
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "blaze-kick": [
    {
      status: "burned",
      trigger: "natural-attack-18+"
    }
  ],

  "bone-club": [
    {
      status: "flinched",
      trigger: "natural-attack-18+"
    }
  ],

  bounce: [
    {
      status: "paralysis",
      trigger: "natural-attack-15+"
    }
  ],

  confusion: [
    {
      status: "confused",
      trigger: "natural-attack-15+"
    }
  ],

  "cross-poison": [
    {
      status: "poisoned",
      trigger: "natural-attack-19+"
    }
  ],

  "dark-pulse": [
    {
      status: "flinched",
      trigger: "natural-attack-17+"
    }
  ],

  "dizzy-punch": [
    {
      status: "confused",
      trigger: "natural-attack-18+"
    }
  ],

  "double-iron-bash": [
    {
      status: "flinched",
      trigger: "natural-attack-16+"
    }
  ],

  "dragon-rush": [
    {
      status: "flinched",
      trigger: "natural-attack-17+"
    }
  ],

  extrasensory: [
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "fire-fang": [
    {
      status: "burned",
      trigger: "natural-attack-19+"
    },
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "fire-punch": [
    {
      status: "burned",
      trigger: "natural-attack-19+"
    }
  ],

  "force-palm": [
    {
      status: "paralysis",
      trigger: "natural-attack-16+"
    }
  ],

  "freeze-dry": [
    {
      status: "frozen",
      trigger: "natural-attack-19+"
    }
  ],

  "freeze-shock": [
    {
      status: "paralysis",
      trigger: "natural-attack-15+"
    }
  ],

  "gunk-shot": [
    {
      status: "poisoned",
      trigger: "natural-attack-16+"
    }
  ],

  "hyper-fang": [
    {
      status: "flinched",
      trigger: "natural-attack-18+"
    }
  ],

  "ice-fang": [
    {
      status: "frozen",
      trigger: "natural-attack-19+"
    },
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "ice-punch": [
    {
      status: "frozen",
      trigger: "natural-attack-19+"
    }
  ],

  "icicle-crash": [
    {
      status: "flinched",
      trigger: "natural-attack-15+"
    }
  ],

  "iron-head": [
    {
      status: "flinched",
      trigger: "natural-attack-16+"
    }
  ],

  lick: [
    {
      status: "paralysis",
      trigger: "natural-attack-18+"
    }
  ],

  "low-kick": [
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "needle-arm": [
    {
      status: "flinched",
      trigger: "natural-attack-15+"
    }
  ],

  "poison-jab": [
    {
      status: "poisoned",
      trigger: "natural-attack-16+"
    }
  ],

  "poison-sting": [
    {
      status: "poisoned",
      trigger: "natural-attack-18+"
    }
  ],

  "poison-tail": [
    {
      status: "poisoned",
      trigger: "natural-attack-19+"
    }
  ],

  "powder-snow": [
    {
      status: "frozen",
      trigger: "natural-attack-18+"
    }
  ],

  psychic: [
    {
      status: "confused",
      trigger: "natural-attack-18+"
    }
  ],

  "rock-climb": [
    {
      status: "confused",
      trigger: "natural-attack-17+"
    }
  ],

  "rolling-kick": [
    {
      status: "flinched",
      trigger: "natural-attack-18+"
    }
  ],

  "sacred-fire": [
    {
      status: "burned",
      trigger: "natural-attack-10+"
    }
  ],

  spark: [
    {
      status: "paralysis",
      trigger: "natural-attack-18+"
    }
  ],

  steamroller: [
    {
      status: "flinched",
      trigger: "natural-attack-15+"
    }
  ],

  stomp: [
    {
      status: "flinched",
      trigger: "natural-attack-18+"
    }
  ],

  "thunder-fang": [
    {
      status: "paralysis",
      trigger: "natural-attack-19+"
    },
    {
      status: "flinched",
      trigger: "natural-attack-19+"
    }
  ],

  "thunder-punch": [
    {
      status: "paralysis",
      trigger: "natural-attack-19+"
    }
  ],

  thunderbolt: [
    {
      status: "paralysis",
      trigger: "natural-attack-19+"
    }
  ],

  twineedle: [
    {
      status: "poisoned",
      trigger: "natural-attack-19+"
    }
  ],

  twister: [
    {
      status: "flinched",
      trigger: "natural-attack-16+"
    }
  ],

  "water-pulse": [
    {
      status: "confused",
      trigger: "natural-attack-17+"
    }
  ],

  "zap-cannon": [
    {
      status: "paralysis",
      trigger: "natural-attack-15+"
    }
  ],

  "zen-headbutt": [
    {
      status: "flinched",
      trigger: "natural-attack-17+"
    }
  ],

  "zing-zap": [
    {
      status: "flinched",
      trigger: "natural-attack-18+"
    }
  ],

  chatter: [
    {
      status: "confused",
      trigger: "hit"
    }
  ],

  "confuse-ray": [
    {
      status: "confused",
      trigger: "hit"
    }
  ],

  "dynamic-punch": [
    {
      status: "confused",
      trigger: "hit"
    }
  ],

  "fake-out": [
    {
      status: "flinched",
      trigger: "hit"
    }
  ],

  "alluring-voice": [
    {
      status: "confused",
      trigger: "hit-and-failed-save"
    }
  ],

  "axe-kick": [
    {
      status: "confused",
      trigger: "hit-and-failed-save"
    }
  ],

  "infernal-parade": [
    {
      status: "burned",
      trigger: "hit-and-failed-save"
    }
  ],

  "malignant-chain": [
    {
      status: "badly-poisoned",
      trigger: "hit-and-failed-save"
    }
  ],

  "mountain-gale": [
    {
      status: "flinched",
      trigger: "hit-and-failed-save"
    }
  ],

  nuzzle: [
    {
      status: "paralysis",
      trigger: "hit-and-failed-save"
    }
  ],

  "poison-fang": [
    {
      status: "badly-poisoned",
      trigger: "hit-and-failed-save"
    }
  ],

  "pyro-ball": [
    {
      status: "burned",
      trigger: "hit-and-failed-save"
    }
  ],

  "scorching-sands": [
    {
      status: "burned",
      trigger: "hit-and-failed-save"
    }
  ],

  "shell-side-arm": [
    {
      status: "poisoned",
      trigger: "hit-and-failed-save"
    }
  ],

  sludge: [
    {
      status: "poisoned",
      trigger: "hit-and-failed-save"
    }
  ],

  "barb-barrage": [
    {
      status: "poisoned",
      trigger: "failed-save"
    }
  ],

  "burn-up": [
    {
      status: "burned",
      trigger: "failed-save"
    }
  ],

  "burning-jealousy": [
    {
      status: "burned",
      trigger: "failed-save"
    }
  ],

  confide: [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  "dark-void": [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  "eerie-impulse": [
    {
      status: "flinched",
      trigger: "failed-save"
    }
  ],

  "fiery-wrath": [
    {
      status: "flinched",
      trigger: "failed-save"
    }
  ],

  flatter: [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  "grass-whistle": [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  hypnosis: [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  "lovely-kiss": [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  "mortal-spin": [
    {
      status: "poisoned",
      trigger: "failed-save"
    }
  ],

  psywave: [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  "sandsear-storm": [
    {
      status: "burned",
      trigger: "failed-save"
    }
  ],

  spore: [
    {
      status: "asleep",
      trigger: "failed-save"
    }
  ],

  "strange-steam": [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  supersonic: [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  swagger: [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  "sweet-kiss": [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  "teeter-dance": [
    {
      status: "confused",
      trigger: "failed-save"
    }
  ],

  tickle: [
    {
      status: "flinched",
      trigger: "failed-save"
    }
  ],

  "wildbolt-storm": [
    {
      status: "paralysis",
      trigger: "failed-save"
    }
  ],

  blizzard: [
    {
      status: "frozen",
      trigger: "failed-save-by-5"
    }
  ],

  "blue-flare": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  "bolt-strike": [
    {
      status: "paralysis",
      trigger: "failed-save-by-5"
    }
  ],

  discharge: [
    {
      status: "paralysis",
      trigger: "failed-save-by-5"
    }
  ],

  "dragon-breath": [
    {
      status: "paralysis",
      trigger: "failed-save-by-5"
    }
  ],

  "fire-blast": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  flamethrower: [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  "heat-wave": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  hurricane: [
    {
      status: "confused",
      trigger: "failed-save-by-5"
    }
  ],

  "ice-beam": [
    {
      status: "frozen",
      trigger: "failed-save-by-5"
    }
  ],

  "ice-burn": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  psybeam: [
    {
      status: "confused",
      trigger: "failed-save-by-5"
    }
  ],

  "relic-song": [
    {
      status: "asleep",
      trigger: "failed-save-by-5"
    }
  ],

  "searing-shot": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  "sludge-wave": [
    {
      status: "poisoned",
      trigger: "failed-save-by-5"
    }
  ],

  "steam-eruption": [
    {
      status: "burned",
      trigger: "failed-save-by-5"
    }
  ],

  thunder: [
    {
      status: "paralysis",
      trigger: "failed-save-by-5"
    }
  ],
};


/* ============================================================
 * TEXTOS
 * ============================================================ */

const STATUS_LABELS = {

    poisoned: {
    es: "Envenenado",
    en: "Poisoned"
  },

  "badly-poisoned": {
    es: "Gravemente envenenado",
    en: "Badly Poisoned"
  },


  paralysis: {
    es: "Parálisis",
    en: "Paralysis"
  },

  asleep: {
    es: "Dormido",
    en: "Asleep"
  },

  burned: {
      es: "Quemado",
      en: "Burned"
  },

  frozen: {
      es: "Congelado",
      en: "Frozen"
  },

  confused: {
    es: "Confundido",
    en: "Confused"
  },

  flinched: {
    es: "Retroceso",
    en: "Flinched"
  }
};


/* ============================================================
 * ESTADOS POKEMON CUSTOM
 *
 * Poisoned reutiliza la condición D&D5e nativa.
 *
 * Paralysis NO reutiliza "paralyzed", porque
 * Paralyzed de D&D5e es mucho más fuerte que
 * la parálisis de Poke5e.
 * ============================================================ */

const STATUS_ASSET_BASE =
  "modules/poke5e-local/assets/status";


const CUSTOM_STATUSES = {

  paralysis: {

    id:
      "poke5e-paralysis",

    img:
      `${STATUS_ASSET_BASE}/paralysis.png`
  },

  asleep: {

    id:
      "poke5e-asleep",

    img:
      `${STATUS_ASSET_BASE}/asleep.png`
  },

  burned: {

    id:
      "poke5e-burned",

    img:
      `${STATUS_ASSET_BASE}/burned.png`
  },

  frozen: {

    id:
      "poke5e-frozen",

    img:
      `${STATUS_ASSET_BASE}/frozen.png`
  },

  confused: {

    id:
      "poke5e-confused",

    img:
      `${STATUS_ASSET_BASE}/confused.png`
  },

  flinched: {

    id:
      "poke5e-flinched",

    img:
      `${STATUS_ASSET_BASE}/flinched.png`
  }
};


const MANAGEABLE_STATUS_IDS =
  Object.freeze([
        "poisoned",
    "badly-poisoned",
    "paralysis",
    "asleep",
    "burned",
    "frozen",
    "confused",
    "flinched"
  ]);


const STATUS_IMAGES =
  Object.freeze({

        poisoned:
      `${STATUS_ASSET_BASE}/poisoned.png`,

    "badly-poisoned":
      `${STATUS_ASSET_BASE}/poisoned.png`,


    paralysis:
      CUSTOM_STATUSES
        .paralysis
        .img,

    asleep:
      CUSTOM_STATUSES
        .asleep
        .img,

    burned:
      CUSTOM_STATUSES
        .burned
        .img,

    frozen:
      CUSTOM_STATUSES
        .frozen
        .img,

    confused:
      CUSTOM_STATUSES
        .confused
        .img,

    flinched:
      CUSTOM_STATUSES
        .flinched
        .img
  });


export function listPokemonStatusDefinitions(
  language = "es"
) {

  const lang =
    language === "en"
      ? "en"
      : "es";


  return MANAGEABLE_STATUS_IDS.map(
    statusId => ({

      id:
        statusId,

      name:
        STATUS_LABELS[
          statusId
        ]?.[
          lang
        ] ??
        statusId,

      img:
        STATUS_IMAGES[
          statusId
        ] ??
        "icons/svg/mystery-man.svg"
    })
  );
}

/* ============================================================
 * ID ESTABLE
 * ============================================================ */

function effectId(
  moveId,
  status
) {

  const raw =
    `P5e${moveId}${status}`

      .replace(
        /[^A-Za-z0-9]/g,
        ""
      );


  return raw
    .padEnd(
      16,
      "0"
    )
    .slice(
      0,
      16
    );
}


/* ============================================================
 * CHANGE
 * ============================================================ */

function change(
  key,
  mode,
  value,
  priority = 20
) {

  return {
    key,
    mode,
    value:
      String(value),

    priority
  };
}


/* ============================================================
 * DESVENTAJA EN SAVE
 *
 * D&D5e roll.mode:
 *
 *  +1 = advantage
 *  -1 = disadvantage
 * ============================================================ */

function saveDisadvantage(
  ability
) {

  return change(

    `system.abilities.${ability}.save.roll.mode`,

    CONST.ACTIVE_EFFECT_MODES.ADD,

    -1
  );
}


/* ============================================================
 * MITAD DE VELOCIDAD
 * ============================================================ */

function halfMovementChanges() {

  return [

    "walk",
    "fly",
    "swim",
    "climb",
    "burrow"

  ].map(
    movement =>

      change(

        `system.attributes.movement.${movement}`,

        CONST.ACTIVE_EFFECT_MODES.MULTIPLY,

        0.5
      )
  );
}


/* ============================================================
 * EFFECT: POISONED
 * ============================================================ */

/*
 * Badly Poisoned es Poisoned con el doble de daño:
 * mismo status "poisoned" (penalizaciones, inmunidades
 * y todo lo que reacciona a Poisoned) y badlyPoisoned: true.
 */
function poisonedEffect(
  move,
  language,
  badly = false
) {

  return {

    _id:
      effectId(
        move.id,
        badly
          ? "badlypoisoned"
          : "poisoned"
      ),


    name:
      STATUS_LABELS[
        badly
          ? "badly-poisoned"
          : "poisoned"
      ][language],


    img:
      STATUS_IMAGES
        .poisoned,


    disabled:
      false,


    transfer:
      false,


    /*
     * Usamos el status D&D5e nativo.
     */

    statuses: [
      "poisoned"
    ],


    changes:
      [],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

                status:
          "poisoned",

        badlyPoisoned:
          badly,

        nonVolatile:
          true,

        /*
         * Pendiente para automatización
         * de final de turno.
         */

                endTurnDamage: {
          formula:
            badly
              ? "2 * @prof"
              : "@prof",
          type:
            "poison"
        }
      }
    }
  };
}


/* ============================================================
 * EFFECT: PARALYSIS
 * ============================================================ */

function paralysisEffect(
  move,
  language
) {

  const status =
    CUSTOM_STATUSES
      .paralysis;


  return {

    _id:
      effectId(
        move.id,
        "paralysis"
      ),


    name:
      STATUS_LABELS
        .paralysis[language],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    statuses: [
      status.id
    ],


    changes: [

      /*
       * STR save disadvantage
       */

      saveDisadvantage(
        "str"
      ),


      /*
       * DEX save disadvantage
       */

      saveDisadvantage(
        "dex"
      ),


      /*
       * Todas las velocidades
       * existentes quedan a la mitad.
       */

      ...halfMovementChanges()
    ],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "paralysis",

        nonVolatile:
          true,


        /*
         * Poke5e:
         *
         * al comienzo del turno:
         * 1d4
         *
         * con 1:
         * incapacitated + restrained
         * hasta próximo turno.
         *
         * Esto lo automatizaremos después.
         */

        startTurnCheck: {

          formula:
            "1d4",

          incapacitatedOn:
            1
        }
      }
    }
  };
}


/* ============================================================
 * EFFECT: ASLEEP
 * ============================================================ */

function asleepEffect(
  move,
  language
) {

  const status =
    CUSTOM_STATUSES
      .asleep;


  const saveChanges =
    [

      "str",
      "dex",
      "con",
      "int",
      "wis",
      "cha"

    ].map(
      saveDisadvantage
    );


  return {

    _id:
      effectId(
        move.id,
        "asleep"
      ),


    name:
      STATUS_LABELS
        .asleep[language],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    /*
     * Incapacitated + Restrained son
     * exactamente dos componentes de
     * Asleep Poke5e.
     *
     * poke5e-asleep nos entrega además
     * una condición visual propia.
     */

    statuses: [

      status.id,

      "incapacitated",

      "restrained"
    ],


    changes:
      saveChanges,


    /*
     * Poke5e:
     * duración base de tres rondas.
     */

    duration: {

      rounds:
        3
    },


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "asleep",

        nonVolatile:
          true,


        /*
         * Recuperación anticipada:
         *
         * d20 >= 11
         * al final del turno o
         * después de movimiento forzado.
         *
         * Pendiente para próximo paso.
         */

        recovery: {

          formula:
            "1d20",

          threshold:
            11
        }
      }
    }
  };
}

/* ============================================================
 * EFFECT: BURNED
 * ============================================================ */

function burnedEffect(
  move,
  language
) {

  const status =
    CUSTOM_STATUSES
      .burned;


  return {

    _id:
      effectId(
        move.id,
        "burned"
      ),


    name:
      STATUS_LABELS
        .burned[language],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    statuses: [
      status.id
    ],


    /*
     * No existe un Active Effect nativo fiable
     * equivalente a "damage disadvantage".
     *
     * Lo automatizaremos con un interceptor
     * específico posteriormente.
     */

    changes:
      [],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "burned",

        nonVolatile:
          true,


        /*
         * Daño periódico:
         * PB propio al final del turno.
         */

        endTurnDamage: {

          formula:
            "@prof",

          direct:
            true
        },


        /*
         * Regla que todavía queda manual.
         */

        damageRollRule: {

          rolls:
            2,

          keep:
            "lower",

          automated:
            true,

          engine:
            "dnd5e.postRollConfiguration"
        }
      }
    }
  };
}

/* ============================================================
 * EFFECT: FROZEN
 *
 * DC =
 *
 * 10 + PB de quien produjo Frozen
 * ============================================================ */

function frozenEffect(
  move,
  language,
  context = {}
) {

  const status =
    CUSTOM_STATUSES
      .frozen;


  const sourceProficiency =
    Math.max(
      0,
      Number(
        context.sourceProficiency ??
        2
      )
    );


  const recoveryDc =
    10 +
    sourceProficiency;


  return {

    _id:
      effectId(
        move.id,
        "frozen"
      ),


    name:
      STATUS_LABELS
        .frozen[language],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    statuses: [

      status.id,

      "incapacitated",

      "restrained"
    ],


    changes:
      [],


    /*
     * Frozen puede durar hasta una hora.
     */

    duration: {

      seconds:
        3600
    },


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "frozen",

        nonVolatile:
          true,


        recovery: {

          ability:
            "str",

          dc:
            recoveryDc,

          sourceProficiency
        },


        /*
         * Lo conservamos ya preparado para
         * la siguiente etapa.
         */

        thaw: {

          damageTypes: [
            "fire"
          ],

          burnMove:
            true
        }
      }
    }
  };
}

/* ============================================================
 * EFFECT: FLINCHED
 *
 * Las reglas de tiradas pertenecen a flinch-engine.mjs.
 * ============================================================ */

function flinchedEffect(
  move,
  language,
  context = {}
) {

  const status =
    CUSTOM_STATUSES
      .flinched;


  return {

    _id:
      effectId(
        move.id,
        "flinched"
      ),


    name:
      STATUS_LABELS
        .flinched[
          language
        ],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    statuses: [
      status.id
    ],


    changes:
      [],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "flinched",

        volatile:
          true,

        nonVolatile:
          false,

        sourceMove:
          context.sourceMove ??
          null,

        sourceReason:
          context.sourceReason ??
          null,

        ...endOfNextTurnFlags()
      }
    }
  };
}

export function buildConfusedStatusEffect(
  language = "es",
  context = {}
) {

  const lang =
    language === "en"
      ? "en"
      : "es";


  const status =
    CUSTOM_STATUSES.confused;


  return {

    name:
      STATUS_LABELS
        .confused[lang],


    img:
      status.img,


    disabled:
      false,


    transfer:
      false,


    statuses: [
      status.id
    ],


    changes:
      [],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-status",

        status:
          "confused",

        volatile:
          true,

        nonVolatile:
          false,

        sourceMove:
          context.sourceMove ??
          null,

        sourceReason:
          context.sourceReason ??
          null,


        confusion: {

          formula:
            "1d8",

          checks:
            0,

          maxChecks:
            3,

          expireAfterTurn:
            false
        }
      }
    }
  };
}

/* ============================================================
 * FACTORY
 * ============================================================ */


function createStatusEffect(
  status,
  move,
  language,
  context = {}
) {

  switch (
    status
  ) {

        case "poisoned":
      return poisonedEffect(
        move,
        language
      );

    case "badly-poisoned":
      return poisonedEffect(
        move,
        language,
        true
      );


    case "paralysis":

      return paralysisEffect(
        move,
        language
      );


    case "asleep":

      return asleepEffect(
        move,
        language
      );

    case "burned":

      return burnedEffect(
        move,
        language
      );


    case "frozen":

      return frozenEffect(
        move,
        language,
        context
      );

    case "confused":

      return buildConfusedStatusEffect(
        language,
        context
      );

    case "flinched":

      return flinchedEffect(
        move,
        language,
        context
      );


    default:

      return null;
  }
}

export function buildPokemonStatusEffect(
  status,
  language = "es",
  context = {}
) {

  const lang =
    language === "en"
      ? "en"
      : "es";


  const sourceId =
    String(
      context.sourceId ??
      context.sourceAbility ??
      status ??
      "runtime-status"
    )
      .trim() ||
    "runtime-status";


  const effect =
    createStatusEffect(
      status,
      {
        id: sourceId
      },
      lang,
      context
    );


  if (!effect) {

    return null;
  }


  /*
   * Las plantillas de Move necesitan un _id estable porque
   * Activity.effects referencia ese ID.
   *
   * Una instancia runtime aplicada directamente al Actor debe
   * recibir su ID desde Foundry.
   */

  delete effect._id;


  effect.flags[
    MODULE_ID
  ] = {

    ...(
      effect.flags?.[
        MODULE_ID
      ] ??
      {}
    ),

    sourceAbility:
      context.sourceAbility ??
      null,

    sourceReason:
      context.sourceReason ??
      null
  };


  return effect;
}


/* ============================================================
 * EFECTOS DE UN MOVIMIENTO
 * ============================================================ */

export function buildMoveStatusEffects(
  move,
  language = "es",
  context = {}
) {

  const definitions =
    MOVE_STATUS_EFFECTS[
      move.id
    ] ??
    [];


  const effects =
    [];


  for (
    const definition
    of definitions
  ) {

    const effect =
      createStatusEffect(

        definition.status,

        move,

        language,

        context
      );


    if (!effect) {

      continue;
    }


    effect.flags[
      MODULE_ID
    ].trigger =
      definition.trigger;


    effect.flags[
      MODULE_ID
    ].sourceMove =
      move.id;


    effects.push(
      effect
    );
  }


  return {

    effects,


    activityEffects:

      effects.map(
        effect => ({
          _id:
            effect._id
        })
      )
  };
}


/* ============================================================
 * REGISTRO DE STATUS EN FOUNDRY
 * ============================================================ */

export function registerPokemonStatuses(
  language = "es"
) {

  const lang =
    language === "en"
      ? "en"
      : "es";


  const definitions = [

    {
      ...CUSTOM_STATUSES.paralysis,

      name:
        STATUS_LABELS
          .paralysis[lang]
    },

    {
      ...CUSTOM_STATUSES.asleep,

      name:
        STATUS_LABELS
          .asleep[lang]
    },

    {
      ...CUSTOM_STATUSES.burned,

      name:
        STATUS_LABELS
          .burned[lang]
    },

    {
      ...CUSTOM_STATUSES.frozen,

      name:
        STATUS_LABELS
          .frozen[lang]
    },

    {
      ...CUSTOM_STATUSES.confused,

      name:
        STATUS_LABELS
          .confused[lang]
    },

    {
      ...CUSTOM_STATUSES.flinched,

      name:
        STATUS_LABELS
          .flinched[lang]
    }
  ];


  const sourceStatuses =
    CONFIG.DND5E
      ?.statusEffects;


  const canRegisterSource =
    Boolean(
      sourceStatuses &&
      typeof sourceStatuses ===
        "object" &&
      !Array.isArray(
        sourceStatuses
      )
    );


  if (!canRegisterSource) {

    console.warn(
      `[${MODULE_ID}] CONFIG.DND5E.statusEffects no está disponible para registrar estados Pokémon.`
    );
  }


  for (
    const definition
    of definitions
  ) {

    /*
     * D&D5e 5.3.3 reconstruye CONFIG.statusEffects
     * durante i18nInit a partir de CONFIG.DND5E.statusEffects.
     *
     * Registramos aquí la definición fuente para que
     * nuestros estados sobrevivan a esa reconstrucción.
     */

    if (canRegisterSource) {

      const {
        id,
        ...data
      } = definition;


      sourceStatuses[id] = {
        ...(
          sourceStatuses[id] ??
          {}
        ),

        ...data
      };
    }


    /*
     * Conservamos también sincronizado el registry
     * ya materializado.
     *
     * Esto mantiene el comportamiento actual y permite
     * que setPokemonStatusLanguage() actualice nombres
     * e imágenes si se llama posteriormente.
     */

    if (
      !Array.isArray(
        CONFIG.statusEffects
      )
    ) {

      continue;
    }


    const existing =
      CONFIG.statusEffects.find(
        effect =>
          effect.id ===
            definition.id
      );


    if (existing) {

      existing.name =
        definition.name;

      existing.img =
        definition.img;

      continue;
    }


    CONFIG.statusEffects.push(
      definition
    );
  }


  console.log(
    `[${MODULE_ID}] Estados Pokemon registrados.`
  );
}


/* ============================================================
 * ACTUALIZAR IDIOMA
 * ============================================================ */

export function setPokemonStatusLanguage(
  language = "es"
) {

  registerPokemonStatuses(
    language
  );
}