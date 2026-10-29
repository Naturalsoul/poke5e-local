import {
  getDefaultShinyRuleId,
  getShinyRule
} from "./shiny-rules.mjs";

import {
  getPokemonShinyState,
  rollPokemonShiny
} from "./shiny-runtime.mjs";
import { isAuthority } from "./foundry-runtime.mjs";


const MODULE_ID =
  "poke5e-local";

const SETTING_KEY =
  "shinyOdds";


/* ============================================================
 * SETTINGS
 * ============================================================ */

function registerShinySetting() {

  game.settings.register(
    MODULE_ID,
    SETTING_KEY,
    {
      name:
        "Poke5e - Probabilidad Shiny",

      hint:
        "Probabilidad usada al crear Pokémon salvajes. Poke5e recomienda 1 en 100 para la mayoría de campañas.",

      scope:
        "world",

      config:
        true,

      type:
        String,

      choices: {
        "1-in-20":
          "5% — 1 en 20",

        "1-in-100":
          "1 en 100 — Poke5e recomendado",

        "1-in-1000":
          "1 en 1000",

        "1-in-4096":
          "1 en 4096 — Pokémon oficial"
      },

      default:
        getDefaultShinyRuleId()
    }
  );
}


function configuredRuleId() {

  const configured =
    game.settings.get(
      MODULE_ID,
      SETTING_KEY
    );


  return (
    getShinyRule(
      configured
    )?.id ??
    getDefaultShinyRuleId()
  );
}


/* ============================================================
 * WILD POKEMON
 * ============================================================ */

function isWildPokemonActor(
  actor
) {

  return Boolean(
    actor?.documentName ===
      "Actor" &&

    actor.getFlag?.(
      MODULE_ID,
      "kind"
    ) ===
      "pokemon" &&

    !actor.getFlag?.(
      MODULE_ID,
      "trainerOwnerUuid"
    )
  );
}


async function initializeWildPokemonShiny(
  tokenDocument
) {

  const actor =
    tokenDocument?.actor ??
    null;


  if (
    !isWildPokemonActor(
      actor
    ) ||
    tokenDocument.actorLink ===
      true ||
    getPokemonShinyState(
      actor
    )
  ) {

    return null;
  }


  const result =
    await rollPokemonShiny(
      actor,
      {
        ruleId:
          configuredRuleId(),

        tokenDocument
      }
    );


  /*
   * Un resultado normal no genera spam.
   *
   * Solo avisamos al GM cuando realmente
   * aparece un Shiny.
   */

  if (
    result.isShiny
  ) {

    ui.notifications.info(
      `${actor.name}: ¡Pokémon Shiny!`
    );
  }


  return result;
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonShinyEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  registerShinySetting();


  Hooks.on(
    "createToken",
    tokenDocument => {

      if (
        !isAuthority()
      ) {

        return;
      }


      void initializeWildPokemonShiny(
        tokenDocument
      ).catch(
        error => {

          console.error(
            `[${MODULE_ID}] Error resolviendo Shiny de Pokémon salvaje:`,
            error
          );


          ui.notifications.error(
            "No se pudo resolver el estado Shiny del Pokémon."
          );
        }
      );
    }
  );


  console.log(
    `[${MODULE_ID}] Shiny Engine registrado.`
  );
}