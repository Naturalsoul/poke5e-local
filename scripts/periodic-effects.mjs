import { bindingDefinition } from "./binding-rules.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    leechSeed:
      "Leech Seed — Semilla drenante"
  },


  en: {

    leechSeed:
      "Leech Seed — Draining Seed"
  }
};


/* ============================================================
 * EFFECT ID
 * ============================================================ */

function effectId(
  moveId
) {

  return (
    "P5p" +
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
 * ESCALADO LEECH SEED
 *
 * Lv 1  → 1d4
 * Lv 5  → 2d4
 * Lv 10 → 2d6
 * Lv 17 → 2d8
 * ============================================================ */

function leechSeedDamage(
  level
) {

  const value =
    Number(level) || 1;


  if (
    value >= 17
  ) {

    return "2d8";
  }


  if (
    value >= 10
  ) {

    return "2d6";
  }


  if (
    value >= 5
  ) {

    return "2d4";
  }


  return "1d4";
}


/* ============================================================
 * DEFINICIÓN
 * ============================================================ */

function definitionFor(
  move,
  language,
  context
) {

  const binding = bindingDefinition(move, context.level);
  if (binding) {
    const statuses = [];
    if (binding.timing === "continuation") {
      statuses.push(["bind", "wrap", "clamp", "constrict", "vice-grip", "jaw-lock"].includes(move.id) ? "grappled" : "restrained");
    }
    return {
      name: move.name?.[language] ?? move.name?.en ?? move.id,
      target: "target", trigger: "hit", duration: {}, customApplication: true,
      periodic: binding, statuses
    };
  }

  switch (
    move.id
  ) {

    /* ========================================================
     * LEECH SEED
     * ======================================================== */

    case "leech-seed":

      return {

        name:
          LABELS[
            language
          ].leechSeed,


        /*
         * Se aplica al Pokémon impactado.
         */

        target:
          "target",


        /*
         * Solo pulsaremos aplicar
         * cuando el ataque haya impactado.
         */

        trigger:
          "hit",


        /*
         * No tiene una duración fija.
         */

        duration:
          {},


        customApplication:
          true,


        periodic: {

          kind:
            "leech-seed",


          timing:
            "end-turn",


          damage: {

            formula:
              leechSeedDamage(
                context.level
              ),

            type:
              "grass",

            modifier:
              0
          },


          drain: {

            fraction:
              0.5,

            recipient:
              "source"
          },


          /*
           * La fuente dice específicamente que
           * los Grass son inmunes al daño.
           */

          damageImmunityTypes: [
            "grass"
          ],


          /*
           * Un atacante solo puede mantener
           * una criatura sembrada.
           */

          sourceUnique:
            true,


          removeWhenFainted:
            true,

          removeOnCombatEnd:
            true,

          /*
           * Lo dejaremos preparado hasta que
           * implementemos Switching.
           */

          removeOnSwitch:
            true
        }
      };


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
      "icons/magic/nature/root-vine-entangled-humanoid.webp",


    disabled:
      false,


    transfer:
      false,


    duration:
      definition.duration,


    changes:
      [],

    statuses: definition.statuses ?? [],


    flags: {

      [MODULE_ID]: {

        kind:
          "pokemon-periodic",

        sourceMove:
          move.id,

        target:
          definition.target,

        trigger:
          definition.trigger,

        customApplication:
          Boolean(
            definition.customApplication
          ),

        periodic:
          definition.periodic
      }
    }
  };
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export function buildMovePeriodicEffects(
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
        [],

      delayedDamage:
        false
    };
  }


  const effect =
    buildEffect(
      move,
      definition
    );


  return {

    /*
     * La plantilla queda en el Item.
     */

    effects: [
      effect
    ],


    /*
     * NO usamos el aplicador nativo.
     *
     * Necesitamos almacenar quién lanzó
     * Leech Seed.
     */

    activityEffects:
      [],


    /*
     * El builder utilizará esto para NO
     * crear daño inmediato.
     */

    delayedDamage:
      definition.periodic.kind === "leech-seed" && Boolean(
        definition.periodic
          ?.damage
      )
  };
}
