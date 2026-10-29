import {
  getPokemonNature,
  rollPokemonNature
} from "./nature-runtime.mjs";

import {
  localizedNatureName
} from "./nature-rules.mjs";
import { getLanguage as currentLanguage } from "./i18n.mjs";
import { isAuthority } from "./foundry-runtime.mjs";


const MODULE_ID =
  "poke5e-local";


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


async function initializeWildPokemonNature(
  tokenDocument
) {

  const actor =
    tokenDocument?.actor ??
    null;


  if (
    !isWildPokemonActor(
      actor
    ) ||
    getPokemonNature(
      actor
    )
  ) {

    return;
  }


  const result =
    await rollPokemonNature(
      actor
    );


  const natureName =
    localizedNatureName(
      result.nature
        ?.definition,
      currentLanguage()
    );


  ui.notifications.info(
    currentLanguage() === "en"

      ? `${actor.name}: Nature ${natureName} (d100: ${result.roll}).`

      : `${actor.name}: Naturaleza ${natureName} (d100: ${result.roll}).`
  );
}


let registered =
  false;


export function registerPokemonNatureEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "createToken",
    tokenDocument => {

      if (
        !isAuthority()
      ) {

        return;
      }


      void initializeWildPokemonNature(
        tokenDocument
      ).catch(
        error => {

          console.error(
            `[${MODULE_ID}] Error asignando Nature al Pokémon salvaje:`,
            error
          );


          ui.notifications.error(
            "No se pudo asignar la Naturaleza del Pokémon."
          );
        }
      );
    }
  );


  console.log(
    `[${MODULE_ID}] Nature Engine registrado.`
  );
}