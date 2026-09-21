import {
  getPokemonNature,
  rollPokemonNature
} from "./nature-runtime.mjs";

import {
  localizedNatureName
} from "./nature-rules.mjs";


const MODULE_ID =
  "poke5e-local";


function isAuthority() {

  const activeGM =
    game.users.activeGM;


  if (activeGM) {

    return activeGM.id ===
      game.user.id;
  }


  return game.user.isGM;
}


function currentLanguage() {

  try {

    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"

      ? "en"

      : "es";

  } catch {

    return "es";
  }
}


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