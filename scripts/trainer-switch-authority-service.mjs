import {
  switchTrainerPokemon
} from "./trainer-deployment-service.mjs";

import {
  getPokemonTrainerUuid,
  getTrainerPartyState,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const SOCKET_CHANNEL =
  `module.${MODULE_ID}`;

const MESSAGE_TYPES =
  Object.freeze({
    request:
      "trainer-switch-request",

    response:
      "trainer-switch-response"
  });

const REQUEST_TIMEOUT_MS =
  15000;

const pendingRequests =
  new Map();

let registered =
  false;


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertDocumentOwner(
  document,
  user,
  label
) {

  if (
    !document?.testUserPermission?.(
      user,
      "OWNER"
    )
  ) {

    throw new Error(
      `${user?.name ?? "El usuario"} no tiene ownership sobre ${label}.`
    );
  }
}


function assertSwitchRequestPermission({
  trainer,
  outgoing,
  incoming,
  requester
}) {

  if (
    !requester ||
    !requester.active
  ) {

    throw new Error(
      "El usuario que solicitó el Switch ya no está conectado."
    );
  }


  if (
    !isTrainerActor(
      trainer
    )
  ) {

    throw new Error(
      "El Trainer solicitado no es válido."
    );
  }


  if (
    !isPokemonActor(
      outgoing
    ) ||
    !isPokemonActor(
      incoming
    )
  ) {

    throw new Error(
      "El Switch solicitado contiene un Pokémon inválido."
    );
  }


  if (
    getPokemonTrainerUuid(
      outgoing
    ) !==
      trainer.uuid ||
    getPokemonTrainerUuid(
      incoming
    ) !==
      trainer.uuid
  ) {

    throw new Error(
      "Los Pokémon del Switch no pertenecen al Trainer solicitado."
    );
  }


  assertDocumentOwner(
    trainer,
    requester,
    trainer.name
  );


  assertDocumentOwner(
    outgoing,
    requester,
    outgoing.name
  );


  assertDocumentOwner(
    incoming,
    requester,
    incoming.name
  );


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    !state.pokemonUuids.includes(
      outgoing.uuid
    ) ||
    !state.pokemonUuids.includes(
      incoming.uuid
    )
  ) {

    throw new Error(
      "Ambos Pokémon deben formar parte de la Party del Trainer."
    );
  }


  if (
    !state.activePokemonUuids.includes(
      outgoing.uuid
    )
  ) {

    throw new Error(
      `${outgoing.name} ya no está activo.`
    );
  }


  if (
    state.activePokemonUuids.includes(
      incoming.uuid
    )
  ) {

    throw new Error(
      `${incoming.name} ya está activo.`
    );
  }
}


/* ============================================================
 * REQUEST RESOLUTION
 * ============================================================ */

function resolveWorldActor(
  actorId
) {

  return game.actors.get(
    String(
      actorId ??
      ""
    )
  ) ??
    null;
}


function resolveWorldScene(
  sceneId
) {

  return game.scenes.get(
    String(
      sceneId ??
      ""
    )
  ) ??
    null;
}


function activeGm() {

  return game.users.activeGM ??
    null;
}


function createRequestId() {

  return [
    game.user.id,
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2, 10)
  ].join("-");
}


/* ============================================================
 * RESPONSE
 * ============================================================ */

function emitResponse({
  requestId,
  targetUserId,
  ok,
  error = null
}) {

  game.socket.emit(
    SOCKET_CHANNEL,
    {
      type:
        MESSAGE_TYPES.response,

      requestId,
      targetUserId,
      ok,
      error
    }
  );
}


function handleResponse(
  message
) {

  if (
    message.targetUserId !==
      game.user.id
  ) {

    return;
  }


  const pending =
    pendingRequests.get(
      message.requestId
    );


  if (!pending) {

    return;
  }


  pendingRequests.delete(
    message.requestId
  );


  window.clearTimeout(
    pending.timeoutId
  );


  if (
    message.ok
  ) {

    pending.resolve(
      true
    );

    return;
  }


  pending.reject(
    new Error(
      message.error ??
      "El GM no pudo completar el Switch."
    )
  );
}


/* ============================================================
 * GM AUTHORITY
 * ============================================================ */

async function executeAuthorizedSwitch(
  message
) {

  const authority =
    activeGm();


  if (
    !game.user.isGM ||
    authority?.id !==
      game.user.id
  ) {

    return;
  }


  const requester =
    game.users.get(
      String(
        message.requesterId ??
        ""
      )
    ) ??
    null;


  const trainer =
    resolveWorldActor(
      message.trainerId
    );


  const outgoing =
    resolveWorldActor(
      message.outgoingId
    );


  const incoming =
    resolveWorldActor(
      message.incomingId
    );


  const scene =
    resolveWorldScene(
      message.sceneId
    );


  try {

    if (!scene) {

      throw new Error(
        "La Scene solicitada para el Switch no existe."
      );
    }


    assertSwitchRequestPermission({
      trainer,
      outgoing,
      incoming,
      requester
    });


    await switchTrainerPokemon(
      trainer,
      outgoing,
      incoming,
      {
        position:
          message.position ??
          null,

        scene
      }
    );


    emitResponse({
      requestId:
        message.requestId,

      targetUserId:
        message.requesterId,

      ok:
        true
    });

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error ejecutando Switch autorizado`,
      error
    );


    emitResponse({
      requestId:
        message.requestId,

      targetUserId:
        message.requesterId,

      ok:
        false,

      error:
        error?.message ??
        "El GM no pudo completar el Switch."
    });
  }
}


/* ============================================================
 * SOCKET
 * ============================================================ */

function onSocketMessage(
  message
) {

  if (
    !message ||
    typeof message !==
      "object"
  ) {

    return;
  }


  if (
    message.type ===
      MESSAGE_TYPES.response
  ) {

    handleResponse(
      message
    );

    return;
  }


  if (
    message.type !==
      MESSAGE_TYPES.request
  ) {

    return;
  }


  void executeAuthorizedSwitch(
    message
  );
}


function attachSocketListener() {

  game.socket.on(
    SOCKET_CHANNEL,
    onSocketMessage
  );
}


/* ============================================================
 * PUBLIC API
 * ============================================================ */

export function registerTrainerSwitchAuthorityService() {

  if (registered) {

    return;
  }


  registered =
    true;


  if (
    game.ready
  ) {

    attachSocketListener();

    return;
  }


  Hooks.once(
    "ready",
    attachSocketListener
  );
}


export async function requestTrainerPokemonSwitch(
  trainer,
  outgoing,
  incoming,
  {
    position,
    scene = canvas.scene
  } = {}
) {

  /*
   * El GM mantiene el camino directo.
   */

  if (
    game.user.isGM
  ) {

    return switchTrainerPokemon(
      trainer,
      outgoing,
      incoming,
      {
        position,
        scene
      }
    );
  }


  const authority =
    activeGm();


  if (!authority) {

    throw new Error(
      "No hay un GM activo disponible para completar el Switch."
    );
  }


  if (!scene?.id) {

    throw new Error(
      "No hay una Scene válida para completar el Switch."
    );
  }


  const requestId =
    createRequestId();


  return new Promise(
    (
      resolve,
      reject
    ) => {

      const timeoutId =
        window.setTimeout(
          () => {

            pendingRequests.delete(
              requestId
            );


            reject(
              new Error(
                "El GM no respondió a la solicitud de Switch."
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
          timeoutId
        }
      );


      game.socket.emit(
        SOCKET_CHANNEL,
        {
          type:
            MESSAGE_TYPES.request,

          requestId,

          requesterId:
            game.user.id,

          trainerId:
            trainer.id,

          outgoingId:
            outgoing.id,

          incomingId:
            incoming.id,

          sceneId:
            scene.id,

          position:
            position ??
            null
        }
      );
    }
  );
}