import {
  buildPokemonStatusEffect,
  listPokemonStatusDefinitions
} from "./status-effects.mjs";

import {
  findStatusEffect,
  pokemonStatus
} from "./status-runtime.mjs";

import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";


const MODULE_ID =
  "poke5e-local";

const DEFAULT_IMAGE =
  "icons/svg/mystery-man.svg";


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function normalizeLanguage(
  value
) {

  return value === "en"
    ? "en"
    : "es";
}


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}

function isGmManualPoisonOverride(
  statusId
) {

  return (
        game.user.isGM &&
    [
      "poisoned",
      "badly-poisoned"
    ].includes(
      statusId
    )
  );
}

function normalizeStatusId(
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
 * PERMISSIONS
 * ============================================================ */

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


export function canCurrentUserModifyPokemonStatuses(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return false;
  }


  if (
    game.user.isGM
  ) {

    return true;
  }


  const trainer =
    pokemonTrainer(
      pokemon
    );


  if (!trainer) {

    return false;
  }


  return canCurrentUserOperateTrainerPokemon(
    trainer,
    pokemon
  );
}


function assertModificationPermission(
  pokemon
) {

  if (
    !canCurrentUserModifyPokemonStatuses(
      pokemon
    )
  ) {

    throw new Error(
      "No tienes permisos para modificar los estados de este Pokémon."
    );
  }
}


/* ============================================================
 * DEFINITIONS
 * ============================================================ */

export function getPokemonStatusOptions(
  language = "es"
) {

  return listPokemonStatusDefinitions(
    normalizeLanguage(
      language
    )
  );
}


/* ============================================================
 * CURRENT STATUS
 * ============================================================ */

export function getPokemonAppliedStatuses(
  pokemon,
  language = "es"
) {

  assertPokemon(
    pokemon
  );


  const definitions =
    new Map(
      getPokemonStatusOptions(
        language
      ).map(
        definition => [
          definition.id,
          definition
        ]
      )
    );


  return pokemon.effects
    .filter(
      effect =>
        !effect.disabled
    )
    .map(
      effect => {

        const statusId =
          pokemonStatus(
            effect
          );


        if (!statusId) {

          return null;
        }


                // Badly Poisoned is a Poisoned effect; show its own name.
        const definition =
          definitions.get(
            effect.getFlag(
              MODULE_ID,
              "badlyPoisoned"
            )
              ? "badly-poisoned"
              : statusId
          );


        return {
          id:
            statusId,

          effectId:
            effect.id,

          name:
            definition
              ?.name ??
            effect.name ??
            statusId,

          img:
            effect.img ??
            definition?.img ??
            DEFAULT_IMAGE,

          volatile:
            effect.getFlag(
              MODULE_ID,
              "volatile"
            ) === true,

          nonVolatile:
            effect.getFlag(
              MODULE_ID,
              "nonVolatile"
            ) === true
        };
      }
    )
    .filter(Boolean);
}


/* ============================================================
 * APPLY
 * ============================================================ */

export async function applyPokemonStatus(
  pokemon,
  statusId,
  {
    language = "es"
  } = {}
) {

  assertPokemon(
    pokemon
  );


  assertModificationPermission(
    pokemon
  );


  const normalizedStatusId =
    normalizeStatusId(
      statusId
    );


  const definition =
    getPokemonStatusOptions(
      language
    ).find(
      entry =>
        entry.id ===
          normalizedStatusId
    );


  if (!definition) {

    throw new Error(
      `Estado Pokémon no soportado: ${String(statusId)}.`
    );
  }


  const existing =
    findStatusEffect(
      pokemon,
      normalizedStatusId
    );


  if (existing) {

    return {
      status:
        "existing",

      effect:
        existing
    };
  }


  const source =
    buildPokemonStatusEffect(
      normalizedStatusId,
      normalizeLanguage(
        language
      ),
      {
        sourceReason:
          "sheet-manual"
      }
    );


  if (!source) {

    throw new Error(
      `No existe un ActiveEffect para ${normalizedStatusId}.`
    );
  }

    /*
   * Override explícito del GM.
   *
   * Solo Poisoned manual.
   *
   * Las aplicaciones provenientes de Moves,
   * Abilities u otros engines NO reciben
   * este flag y continúan respetando Poke5e.
   */

  if (
    isGmManualPoisonOverride(
      normalizedStatusId
    )
  ) {

    source.flags ??=
      {};


    source.flags[
      MODULE_ID
    ] ??=
      {};


    source.flags[
      MODULE_ID
    ].gmManualStatusOverride =
      true;
  }

  const created =
    await pokemon.createEmbeddedDocuments(
      "ActiveEffect",
      [
        source
      ]
    );


  return {
    status:
      created.length
        ? "created"
        : "blocked",

    effect:
      created[0] ??
      null
  };
}


/* ============================================================
 * REMOVE
 * ============================================================ */

export async function removePokemonStatus(
  pokemon,
  effectId
) {

  assertPokemon(
    pokemon
  );


  assertModificationPermission(
    pokemon
  );


  const effect =
    pokemon.effects.get(
      String(
        effectId ??
        ""
      )
    );


  if (
    !effect ||
    !pokemonStatus(
      effect
    )
  ) {

    throw new Error(
      "El estado seleccionado ya no existe en este Pokémon."
    );
  }


  await effect.delete();


  return true;
}