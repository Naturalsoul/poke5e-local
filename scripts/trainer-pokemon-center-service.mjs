import {
  getTrainerOwnedPokemon
} from "./trainer-party-service.mjs";

import {
  canCurrentUserOperateTrainer
} from "./trainer-ownership-service.mjs";

import {
  recoverPokemonAtCenter
} from "./pokemon-recovery-service.mjs";

import {
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const SOCKET_CHANNEL =
  `module.${MODULE_ID}`;

const REQUEST_TYPE =
  "trainer-pokemon-center-request";

const RESPONSE_TYPE =
  "trainer-pokemon-center-response";

const REQUEST_TIMEOUT_MS =
  30000;


const pendingRequests =
  new Map();

let registered =
  false;


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertTrainer(
  trainer
) {

  if (
    !isTrainerActor(
      trainer
    )
  ) {

    throw new TypeError(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


/* ============================================================
 * AUTHORITY
 * ============================================================ */

function activeGm() {

  return (
    game.users.activeGM ??
    null
  );
}


function canRecoverLocally() {

  if (
    !game.user.isGM
  ) {

    return false;
  }


  const gm =
    activeGm();


  return (
    !gm ||
    gm.id ===
      game.user.id
  );
}


function userCanOperateTrainer(
  user,
  trainer
) {

  if (
    user?.isGM
  ) {

    return true;
  }


  return Boolean(
    trainer.testUserPermission?.(
      user,
      "OWNER"
    )
  );
}


/* ============================================================
 * RECOVERY
 * ============================================================ */

async function recoverTrainerPokemonAsAuthority(
  trainer
) {

  assertTrainer(
    trainer
  );


  if (
    !canRecoverLocally()
  ) {

    throw new Error(
      "La recuperación debe ejecutarla el GM activo."
    );
  }


  const pokemonActors =
    getTrainerOwnedPokemon(
      trainer
    );

  const results =
    [];

  const failures =
    [];


  for (
    const pokemon
    of pokemonActors
  ) {

    try {

      results.push(
        await recoverPokemonAtCenter(
          pokemon
        )
      );

    } catch (error) {

      console.error(
        `[${MODULE_ID}] Error recuperando ${pokemon.name} en Centro Pokémon`,
        error
      );


      failures.push({
        pokemonUuid:
          pokemon.uuid,

        pokemonName:
          pokemon.name,

        error:
          error?.message ??
          "Error desconocido."
      });
    }
  }


  return {
    recovered:
      results.length,

    failed:
      failures.length,

    results,
    failures
  };
}


/* ============================================================
 * SOCKET
 * ============================================================ */

function createRequestId() {

  return [
    game.user.id,
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2)
  ].join(":");
}


function emitResponse({
  requestId,
  recipientId,
  ok,
  result = null,
  error = null
}) {

  game.socket.emit(
    SOCKET_CHANNEL,
    {
      type:
        RESPONSE_TYPE,

      requestId,
      recipientId,
      ok,
      result,
      error
    }
  );
}


function handleResponse(
  payload
) {

  if (
    payload?.type !==
      RESPONSE_TYPE ||
    payload.recipientId !==
      game.user.id
  ) {

    return;
  }


  const request =
    pendingRequests.get(
      payload.requestId
    );


  if (!request) {

    return;
  }


  window.clearTimeout(
    request.timeout
  );


  pendingRequests.delete(
    payload.requestId
  );


  if (
    payload.ok
  ) {

    request.resolve(
      payload.result
    );

    return;
  }


  request.reject(
    new Error(
      payload.error ??
      "El GM no pudo completar la recuperación Pokémon."
    )
  );
}


async function handleRequest(
  payload
) {

  if (
    payload?.type !==
      REQUEST_TYPE ||
    !canRecoverLocally() ||
    payload.targetGmId !==
      game.user.id
  ) {

    return;
  }


  const sender =
    game.users.get(
      String(
        payload.senderId ??
        ""
      )
    );

  const trainer =
    game.actors.get(
      String(
        payload.trainerId ??
        ""
      )
    );


  if (
    !sender ||
    !isTrainerActor(
      trainer
    ) ||
    !userCanOperateTrainer(
      sender,
      trainer
    )
  ) {

    emitResponse({
      requestId:
        payload.requestId,

      recipientId:
        payload.senderId,

      ok:
        false,

      error:
        "No tienes permisos para usar el Centro Pokémon con este Trainer."
    });


    return;
  }


  try {

    const result =
      await recoverTrainerPokemonAsAuthority(
        trainer
      );


    emitResponse({
      requestId:
        payload.requestId,

      recipientId:
        payload.senderId,

      ok:
        true,

      result
    });

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error procesando solicitud de Centro Pokémon`,
      error
    );


    emitResponse({
      requestId:
        payload.requestId,

      recipientId:
        payload.senderId,

      ok:
        false,

      error:
        error?.message ??
        "No se pudo completar la recuperación Pokémon."
    });
  }
}


function requestRecoveryFromGm(
  trainer,
  gm
) {

  const requestId =
    createRequestId();


  return new Promise(
    (
      resolve,
      reject
    ) => {

      const timeout =
        window.setTimeout(
          () => {

            pendingRequests.delete(
              requestId
            );


            reject(
              new Error(
                "El GM activo no respondió a la solicitud del Centro Pokémon."
              )
            );
          },
          REQUEST_TIMEOUT_MS
        );


      pendingRequests.set(
        requestId,
        {
          resolve,
          reject,
          timeout
        }
      );


      game.socket.emit(
        SOCKET_CHANNEL,
        {
          type:
            REQUEST_TYPE,

          requestId,

          senderId:
            game.user.id,

          targetGmId:
            gm.id,

          trainerId:
            trainer.id
        }
      );
    }
  );
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export function registerTrainerPokemonCenterService() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  Hooks.once(
    "ready",
    () => {

      game.socket.on(
        SOCKET_CHANNEL,
        payload => {

          handleResponse(
            payload
          );


          void handleRequest(
            payload
          );
        }
      );
    }
  );
}


export async function useTrainerPokemonCenter(
  trainer
) {

  assertTrainer(
    trainer
  );


  if (
    !canCurrentUserOperateTrainer(
      trainer
    )
  ) {

    throw new Error(
      "No tienes permisos para usar el Centro Pokémon con este Trainer."
    );
  }


  if (
    canRecoverLocally()
  ) {

    return recoverTrainerPokemonAsAuthority(
      trainer
    );
  }


  const gm =
    activeGm();


  if (!gm) {

    throw new Error(
      "Se necesita un GM activo para completar la recuperación Pokémon."
    );
  }


  return requestRecoveryFromGm(
    trainer,
    gm
  );
}