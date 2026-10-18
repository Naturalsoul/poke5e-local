import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";


const MODULE_ID =
  "poke5e-local";

const NICKNAME_FLAG =
  "nickname";


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertPokemonActor(
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


function normalizeNickname(
  value
) {

  const nickname =
    String(
      value ??
      ""
    ).trim();


  if (!nickname) {

    throw new Error(
      "El nombre del Pokémon no puede quedar vacío."
    );
  }


  return nickname;
}


/* ============================================================
 * READ
 * ============================================================ */

export function getPokemonNickname(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return null;
  }


  const nickname =
    String(
      pokemon.getFlag(
        MODULE_ID,
        NICKNAME_FLAG
      ) ??
      ""
    ).trim();


  return nickname ||
    null;
}


function trainerForPokemon(
  pokemon
) {

  const trainerUuid =
    String(
      pokemon.getFlag(
        MODULE_ID,
        "trainerOwnerUuid"
      ) ??
      ""
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


export function canCurrentUserRenamePokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return false;
  }


  /*
   * El GM puede renombrar cualquier Pokémon,
   * incluyendo salvajes/Synthetic Actors.
   */

  if (
    game.user.isGM
  ) {

    return true;
  }


  /*
   * Un Player solo puede renombrar Pokémon
   * pertenecientes a un Trainer que pueda operar.
   */

  const trainer =
    trainerForPokemon(
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


/* ============================================================
 * TOKEN SYNC
 * ============================================================ */

async function synchronizeSyntheticTokenName(
  pokemon,
  nickname
) {

  const tokenDocument =
    pokemon.token;


  if (
    tokenDocument?.documentName !==
      "Token" ||
    tokenDocument.name ===
      nickname
  ) {

    return false;
  }


  await tokenDocument.update({
    name:
      nickname
  });


  return true;
}


async function synchronizeActiveLinkedTokenNames(
  pokemon,
  nickname
) {

  if (
    !canvas.ready ||
    !canvas.scene
  ) {

    return 0;
  }


  const tokens = [
    ...canvas.scene.getEmbeddedCollection(
      "Token"
    )
  ].filter(
    token =>
      token.actorLink ===
        true &&
      token.actorId ===
        pokemon.id &&
      token.name !==
        nickname
  );


  let updated =
    0;


  for (
    const token
    of tokens
  ) {

    await token.update({
      name:
        nickname
    });


    updated +=
      1;
  }


  return updated;
}


/* ============================================================
 * WRITE
 * ============================================================ */

export async function renamePokemon(
  pokemon,
  value
) {

  assertPokemonActor(
    pokemon
  );


  if (
    !canCurrentUserRenamePokemon(
      pokemon
    )
  ) {

    throw new Error(
      "No tienes permisos para cambiar el nombre de este Pokémon."
    );
  }


  const nickname =
    normalizeNickname(
      value
    );


  const currentNickname =
    getPokemonNickname(
      pokemon
    );


  /*
   * Synthetic Actor:
   *
   * solo modificamos el individuo representado
   * por ese Token salvaje.
   */

  if (
    pokemon.isToken
  ) {

    const updates = {};


    if (
      pokemon.name !==
      nickname
    ) {

      updates.name =
        nickname;
    }


    if (
      currentNickname !==
      nickname
    ) {

      updates[
        `flags.${MODULE_ID}.${NICKNAME_FLAG}`
      ] =
        nickname;
    }


    if (
      Object.keys(
        updates
      ).length
    ) {

      await pokemon.update(
        updates
      );
    }


    await synchronizeSyntheticTokenName(
      pokemon,
      nickname
    );


    return {
      nickname,
      name:
        nickname
    };
  }


  /*
   * World Actor:
   *
   * Actor.name = hoja/listados.
   * prototypeToken.name = futuros Deploy.
   */

  const updates = {};


  if (
    pokemon.name !==
      nickname
  ) {

    updates.name =
      nickname;
  }


  if (
    pokemon.prototypeToken
      ?.name !==
    nickname
  ) {

    updates[
      "prototypeToken.name"
    ] =
      nickname;
  }


  if (
    currentNickname !==
      nickname
  ) {

    updates[
      `flags.${MODULE_ID}.${NICKNAME_FLAG}`
    ] =
      nickname;
  }


  if (
    Object.keys(
      updates
    ).length
  ) {

    await pokemon.update(
      updates
    );
  }


  /*
   * También sincronizamos cualquier Token linked
   * que ya esté actualmente desplegado.
   */

  await synchronizeActiveLinkedTokenNames(
    pokemon,
    nickname
  );


  return {
    nickname,
    name:
      nickname
  };
}