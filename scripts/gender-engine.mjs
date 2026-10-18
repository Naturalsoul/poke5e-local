import {
  getPokemonGender,
  getPokemonGenderRatio,
  rollPokemonGender
} from "./gender-runtime.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";


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


function isWildPokemonActor(
  actor
) {

  return Boolean(
    isPokemonActor(
      actor
    ) &&
    !actor.getFlag?.(
      MODULE_ID,
      "trainerOwnerUuid"
    )
  );
}


async function initializeWildPokemonGender(
  tokenDocument
) {

  const actor =
    tokenDocument?.actor ??
    null;


  if (
    tokenDocument?.documentName !==
      "Token" ||
    tokenDocument.actorLink ===
      true ||
    !isWildPokemonActor(
      actor
    ) ||
    getPokemonGender(
      actor
    )
  ) {

    return null;
  }


  if (
    !getPokemonGenderRatio(
      actor
    )
  ) {

    return null;
  }


  return rollPokemonGender(
    actor
  );
}


async function initializeTrainerPokemonGender(
  actor
) {

  if (
    !isPokemonActor(
      actor
    ) ||
    !actor.getFlag?.(
      MODULE_ID,
      "trainerOwnerUuid"
    ) ||
    getPokemonGender(
      actor
    ) ||
    !getPokemonGenderRatio(
      actor
    )
  ) {

    return null;
  }


  return rollPokemonGender(
    actor
  );
}


async function initializeCanvasWildPokemonGenders() {

  const tokenDocuments =
    canvas.scene
      ?.tokens ??
    [];


  for (
    const tokenDocument
    of tokenDocuments
  ) {

    await initializeWildPokemonGender(
      tokenDocument
    );
  }
}


let registered =
  false;


export function registerPokemonGenderEngine() {

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


      void initializeWildPokemonGender(
        tokenDocument
      ).catch(
        error => {

          console.error(
            `[${MODULE_ID}] Error asignando género al Pokémon salvaje:`,
            error
          );


          ui.notifications.error(
            "No se pudo asignar el género del Pokémon."
          );
        }
      );
    }
  );


  /*
   * Compatibilidad con Tokens salvajes creados
   * antes de incorporar Gender.
   */

  Hooks.on(
    "canvasReady",
    () => {

      if (
        !isAuthority()
      ) {

        return;
      }


      void initializeCanvasWildPokemonGenders()
        .catch(
          error => {

            console.error(
              `[${MODULE_ID}] Error inicializando géneros de Pokémon salvajes de la Scene:`,
              error
            );
          }
        );
    }
  );


  /*
   * Defensa adicional:
   *
   * si un Actor pasa a pertenecer a un Trainer
   * sin tener Gender, se resuelve inmediatamente.
   */

  Hooks.on(
    "updateActor",
    actor => {

      if (
        !isAuthority()
      ) {

        return;
      }


      void initializeTrainerPokemonGender(
        actor
      ).catch(
        error => {

          console.error(
            `[${MODULE_ID}] Error asegurando género del Pokémon de Trainer:`,
            error
          );
        }
      );
    }
  );


  console.log(
    `[${MODULE_ID}] Gender Engine registrado.`
  );
}