const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    growl:
      "Gruñido — Ataques -1",

    acidSpray:
      "Ácido corrosivo — AC -1",

    acidArmor:
      "Armadura Ácida — AC +2",

    agility:
      "Agilidad — Velocidad +20 ft",

    amnesia:
      "Amnesia — Salvaciones +2",

    defendOrder:
      "Orden de Defensa",

    tailWhip:
        "Tail Whip — ataques aliados +1",

    leer:
        "Leer — ataques aliados +1",

    screech:
        "Screech — ataques aliados +1",

    growth:
        "Growth — Ataques y salvaciones",

    defenseCurl:
        "Defense Curl — Defensa",

    aquaRing:
        "Aqua Ring — Regeneración",
  },


  en: {

    growl:
      "Growl — Attacks -1",

    acidSpray:
      "Acid Spray — AC -1",

    acidArmor:
      "Acid Armor — AC +2",

    agility:
      "Agility — Speed +20 ft",

    amnesia:
      "Amnesia — Saves +2",

    defendOrder:
      "Defend Order",

    tailWhip:
        "Tail Whip — ally attacks +1",

    leer:
        "Leer — ally attacks +1",

    screech:
        "Screech — ally attacks +1",

    growth:
        "Growth — Attacks & Saves",

    defenseCurl:
        "Defense Curl — Defense",

    aquaRing:
        "Aqua Ring — Regeneration",
  }
};


/* ============================================================
 * EFFECT ID
 * ============================================================ */

function effectId(
  moveId
) {

  return (
    "P5m" +
    String(moveId)
      .replace(
        /[^A-Za-z0-9]/g,
        ""
      )
  )
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
 * ACTIVE EFFECT CHANGE
 * ============================================================ */

function add(
  key,
  value,
  priority = 20
) {

  return {

    key,

    mode:
      CONST.ACTIVE_EFFECT_MODES.ADD,

    value:
      String(value),

    priority
  };
}


/* ============================================================
 * TODOS LOS ATTACK TYPES D&D5e
 * ============================================================ */

function attackChanges(
  value
) {

  return [

    add(
      "system.bonuses.mwak.attack",
      value
    ),

    add(
      "system.bonuses.rwak.attack",
      value
    ),

    add(
      "system.bonuses.msak.attack",
      value
    ),

    add(
      "system.bonuses.rsak.attack",
      value
    )
  ];
}


/* ============================================================
 * DEFEND ORDER SCALING
 *
 * Poke5e:
 *
 * Lv 1  → +1
 * Lv 5  → +2
 * Lv 10 → +3
 * Lv 17 → +4
 * ============================================================ */

function defendOrderBonus(
  level
) {

  const value =
    Number(level) || 1;


  if (
    value >= 17
  ) {

    return 4;
  }


  if (
    value >= 10
  ) {

    return 3;
  }


  if (
    value >= 5
  ) {

    return 2;
  }


  return 1;
}


/* ============================================================
 * DEFINICIONES
 *
 * target:
 *
 * self   → usuario
 * target → objetivo del move
 *
 * trigger es metadata.
 * ============================================================ */

function definitionFor(
  move,
  language,
  context
) {

  switch (
    move.id
  ) {


    /* ========================================================
     * GROWL
     *
     * Failed WIS save
     * -1 attacks
     * 1 minute
     * stack max -5
     * ======================================================== */

    case "growl":

      return {

        name:
          LABELS[
            language
          ].growl,

        target:
          "target",

        trigger:
          "failed-save",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "growl",

          max:
            5
        },

        changes:
          attackChanges(
            -1
          )
      };


    /* ========================================================
     * ACID SPRAY
     *
     * Hit + failed CON save
     * AC -1
     * 1 minute
     * stack max -3
     * ======================================================== */

    case "acid-spray":

      return {

        name:
          LABELS[
            language
          ].acidSpray,

        target:
          "target",

        trigger:
          "hit-and-failed-save",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "acid-spray",

          max:
            3
        },

        changes: [

          add(
            "system.attributes.ac.bonus",
            -1
          )
        ]
      };


    /* ========================================================
     * ACID ARMOR
     *
     * AC +2
     * 1 minute concentration
     *
     * El daño reactivo se automatizará después.
     * ======================================================== */

    case "acid-armor":

      return {

        name:
          LABELS[
            language
          ].acidArmor,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "acid-armor",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.ac.bonus",
            2
          )
        ],

        pending: {

          meleeRetaliation:
            true
        }
      };


    /* ========================================================
     * AGILITY
     *
     * +20 ft a cualquier movement type existente.
     * ======================================================== */

    case "agility":

      return {

        name:
          LABELS[
            language
          ].agility,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "agility",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.movement.bonus",
            20
          )
        ]
      };


    /* ========================================================
     * AMNESIA
     *
     * +2 ALL SAVES
     *
     * El usuario además olvida un move,
     * que todavía queda manual.
     * ======================================================== */

    case "amnesia":

      return {

        name:
          LABELS[
            language
          ].amnesia,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "amnesia",

          max:
            1
        },

        changes: [

          add(
            "system.bonuses.abilities.save",
            2
          )
        ],

        pending: {

          disableSelectedMove:
            true
        }
      };

    /* ============================================================
        * TAIL WHIP
        *
        * Failed WIS save:
        * allies gain +1 attacks against this target.
        *
        * Stack max +5.
        * ============================================================ */

        case "tail-whip":

        return {

            name:
                LABELS[
                    language
                ].tailWhip,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "tail-whip",
                max: 5
            },

            /*
            * No modifica directamente el Actor.
            *
            * El Targeted Modifier Engine lo leerá
            * cuando alguien ataque a este Actor.
            */

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };


        /* ============================================================
        * LEER
        * ============================================================ */

        case "leer":

        return {

            name:
                LABELS[
                    language
                ].leer,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "leer",
                max: 5
            },

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };


        /* ============================================================
        * SCREECH
        *
        * Area move.
        *
        * Failed WIS save:
        * allies gain +1 attacks against affected target.
        *
        * Stack max +3.
        * ============================================================ */

        case "screech":

        return {

            name:
                LABELS[
                    language
                ].screech,

            target:
                "target",

            trigger:
                "failed-save",

            duration: {
                seconds: 60
            },

            stack: {
                key: "screech",
                max: 3
            },

            changes: [],

            targetedAttack: {

            bonusPerStack:
                1,

            alliesOnly:
                true,

            excludeSource:
                true
            }
        };

        /* ============================================================
        * GROWTH
        *
        * +1d4 attacks & saves
        * Lv10+ -> +1d6
        *
        * 1 minute, concentration
        * ============================================================ */

        case "growth": {

            const level =
                Number(
                    context.level ??
                    1
                );


            const die =
                level >= 10
                ? "1d6"
                : "1d4";


            return {

                name:
                `${LABELS[
                    language
                ].growth} +${die}`,

                /*
                * Poke5e permite escoger una criatura
                * en rango o al propio usuario.
                *
                * Para usarlo sobre uno mismo:
                * targetea tu propio token.
                */

                target:
                    "target",

                trigger:
                    "manual",

                duration: {
                    seconds: 60
                },

                stack: {
                    key: "growth",
                    max: 1
                },

                concentration:
                    true,

                changes: [

                    /*
                    * Todos los ataques.
                    */

                    ...attackChanges(
                        die
                    ),


                    /*
                    * Todas las salvaciones.
                    */

                    add(
                        "system.bonuses.abilities.save",
                        die
                    )
                ]
            };
        }

        /* ============================================================
        * DEFENSE CURL
        *
        * Hasta el próximo turno:
        *
        * AC +4
        * Resistance to Normal
        * ============================================================ */

        case "defense-curl":

        return {

            name:
            LABELS[
                language
            ].defenseCurl,

            target: "self",
            trigger: "self",

            /*
            * La eliminación exacta la manejará
            * nuestro Turn Engine.
            */

            duration: {},

            stack: {
                key: "defense-curl",
                max: 1
            },

            changes: [

                /*
                * +4 AC
                */

                add(
                    "system.attributes.ac.bonus",
                    4
                ),


                /*
                * Resistencia al tipo Pokémon Normal.
                *
                * "normal" ya está registrado por
                * types.mjs como damage type.
                */

                add(
                    "system.traits.dr.value",
                    "normal"
                )
            ],


            /*
            * NUEVO:
            *
            * indicar al Turn Engine que debe
            * desaparecer cuando vuelva a empezar
            * el turno de este Actor.
            */

            expireAtStartTurn: true
        };

        /* ============================================================
        * AQUA RING
        *
        * End of each turn:
        * heal PB HP.
        *
        * 1 minute, concentration.
        * ============================================================ */

        case "aqua-ring":

          return {

            name:
              LABELS[
                language
              ].aquaRing,

            target:
              "self",

            trigger:
              "self",

            duration: {
              seconds: 60
            },

            stack: {
              key:
                "aqua-ring",

              max:
                1
            },

            concentration:
              true,

            /*
            * No cambia directamente ningún
            * atributo del Actor.
            */

            changes: [],


            /* ========================================================
            * NUEVO TIPO DE EFECTO PERIÓDICO
            * ======================================================== */

            endTurnHealing: {

              formula:
                "@prof",

              source:
                "aqua-ring"
            }
          };


    /* ========================================================
     * DEFEND ORDER
     * ======================================================== */

    case "defend-order": {

      const bonus =
        defendOrderBonus(
          context.level
        );


      return {

        name:

          `${LABELS[
            language
          ].defendOrder} — AC +${bonus}`,

        target:
          "self",

        trigger:
          "self",

        duration: {
          seconds: 60
        },

        stack: {

          key:
            "defend-order",

          max:
            1
        },

        concentration:
          true,

        changes: [

          add(
            "system.attributes.ac.bonus",
            bonus
          )
        ]
      };
    }


    default:

      return null;
  }
}


/* ============================================================
 * BUILD EFFECT
 * ============================================================ */

function buildEffect(
  move,
  definition
) {

  return {

    _id:
      effectId(
        move.id
      ),


    name:
      definition.name,


    img:
      "icons/svg/aura.svg",


    disabled:
      false,


    transfer:
      false,


    duration:
      definition.duration,


    changes:
      definition.changes,


    flags: {

        [MODULE_ID]: {

            kind:
            "pokemon-modifier",

            sourceMove:
            move.id,

            trigger:
            definition.trigger,

            target:
            definition.target,

            concentration:
            Boolean(
                definition.concentration
            ),

            stackKey:
            definition.stack
                ?.key ??
            move.id,

            maxStacks:
            definition.stack
                ?.max ??
            1,


            /*
            * NUEVO
            *
            * El Actor tendrá UN solo Active Effect.
            */

            stackCount:
            1,


            /*
            * Efectos con maxStacks > 1 utilizarán
            * nuestro motor propio en vez del
            * aplicador nativo de D&D5e.
            */

            stackMode:

            (
                definition.stack
                ?.max ??
                1
            ) > 1

                ? "intensity"

                : "single",


            /*
            * Conservamos los cambios base.
            *
            * Growl:
            * -1
            *
            * Acid Spray:
            * -1 AC
            */

            baseChanges:
            foundry.utils.deepClone(
                definition.changes
            ),
            targetedAttack:
            definition.targetedAttack ??
            null,

            expireAtStartTurn:
                Boolean(
                    definition.expireAtStartTurn
                ),

            endTurnHealing:
              definition.endTurnHealing ??
              null,

            pending:
                definition.pending ??
                {}

        }
    }
  };
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export function buildMoveModifierEffects(
  move,
  language = "es",
  context = {}
) {

  const definition =
    definitionFor(
      move,
      language,
      context
    );


  if (!definition) {

    return {

      effects:
        [],

      activityEffects:
        []
    };
  }


  const effect =
    buildEffect(
      move,
      definition
    );


  const maxStacks =
  Number(
    effect.flags
      ?.[MODULE_ID]
      ?.maxStacks ??
    1
  );


const nativeApplication =
  maxStacks <= 1;


    return {

        /*
        * La plantilla SIEMPRE queda dentro
        * del Move.
        */

        effects: [
            effect
        ],


        /*
        * Solo efectos NO acumulables usan
        * el aplicador nativo D&D5e.
        *
        * Growl / Acid Spray:
        * activityEffects = []
        *
        * Agility / Acid Armor:
        * siguen usando Foundry normalmente.
        */

        activityEffects:

            nativeApplication

            ? [
                {
                    _id:
                    effect._id
                }
                ]

            : []
    };
}