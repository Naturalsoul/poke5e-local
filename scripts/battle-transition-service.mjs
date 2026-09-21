const MODULE_ID =
  "poke5e-local";

const SOCKET_CHANNEL =
  `module.${MODULE_ID}`;

const SOCKET_MESSAGE_TYPE =
  "battle-transition";

const OVERLAY_CLASS =
  "poke5e-battle-transition";

const VIDEO_CLASS =
  "poke5e-battle-transition__video";


const TRANSITIONS =
  Object.freeze({

    "consul-selphy-vs-peloton-6": {

      src:
        "modules/poke5e-local/" +
        "assets/transitions/battles/" +
        "consul-selphy-vs-peloton-6.webm",

      fallbackDuration:
        6000
    },

    "peloton-7-vs-peloton-6": {

      src:
        "modules/poke5e-local/" +
        "assets/transitions/battles/" +
        "peloton-7-vs-peloton-6.webm",

      cacheVersion:
        "20260901-1",

      fallbackDuration:
        6000
    }
  });


let registered =
  false;

let activeCleanup =
  null;


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerBattleTransitionService() {

  if (registered) {
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

          if (
            payload?.type !==
            SOCKET_MESSAGE_TYPE
          ) {
            return;
          }


          /*
           * El cliente que originó la transición
           * ya la reproduce localmente.
           *
           * Si el servidor devuelve el socket también
           * al emisor, evitamos reiniciar su vídeo.
           */

          if (
            payload.senderId ===
            game.user.id
          ) {
            return;
          }


          void receiveTransition(
            payload
          );
        }
      );
    }
  );
}


/* ============================================================
 * PUBLIC API
 * ============================================================ */

export async function playBattleTransition(
  transitionId
) {

  if (
    !game.user.isGM
  ) {

    ui.notifications.warn(
      "Solo el GM puede iniciar una transición de combate."
    );

    return false;
  }


  const sceneId =
    canvas.scene?.id;

  if (!sceneId) {

    ui.notifications.warn(
      "No hay una escena activa para reproducir la transición."
    );

    return false;
  }


  const transition =
    TRANSITIONS[
      transitionId
    ];

  if (!transition) {

    ui.notifications.error(
      `Transición desconocida: ${transitionId}`
    );

    return false;
  }


  const payload = {

    type:
      SOCKET_MESSAGE_TYPE,

    transitionId,

    sceneId,

    senderId:
      game.user.id
  };


  /*
   * Reproducción inmediata para el GM.
   */

  const localPlayback =
    receiveTransition(
      payload
    );


  /*
   * Reproducción para los demás clientes.
   */

  game.socket.emit(
    SOCKET_CHANNEL,
    payload
  );


  await localPlayback;

  return true;
}


/* ============================================================
 * RECEIVE
 * ============================================================ */

async function receiveTransition(
  payload
) {

  const {
    transitionId,
    sceneId
  } =
    payload;


  if (
    canvas.scene?.id !==
    sceneId
  ) {
    return false;
  }


  const transition =
    TRANSITIONS[
      transitionId
    ];

  if (!transition) {

    console.warn(
      `[${MODULE_ID}] Transición desconocida: ${transitionId}`
    );

    return false;
  }


  return playVideo(
    transition
  );
}


/* ============================================================
 * VIDEO OVERLAY
 * ============================================================ */

function playVideo(
  transition
) {

  activeCleanup?.();


  const overlay =
    document.createElement(
      "div"
    );

  overlay.classList.add(
    OVERLAY_CLASS
  );


  const video =
    document.createElement(
      "video"
    );

  video.classList.add(
    VIDEO_CLASS
  );


  /*
   * Muted debe configurarse también como defaultMuted.
   * Esto evita restricciones de autoplay en algunos
   * clientes Chromium.
   */

  video.muted =
    true;

  video.defaultMuted =
    true;

  video.playsInline =
    true;

  video.preload =
    "auto";

  video.controls =
    false;

  video.loop =
    false;


  const routedSource =
    foundry.utils.getRoute(
      transition.src
    );


  const source =
    transition.cacheVersion

      ? `${routedSource}?v=${encodeURIComponent(
          transition.cacheVersion
        )}`

      : routedSource;


  overlay.append(
    video
  );

  document.body.append(
    overlay
  );


  return new Promise(
    resolve => {

      let finished =
        false;

      let started =
        false;

      let fallbackTimer =
        null;


      const finish = result => {

        if (finished) {
          return;
        }

        finished =
          true;


        if (
          fallbackTimer !== null
        ) {

          window.clearTimeout(
            fallbackTimer
          );
        }


        game.video.stop(
          video
        );

        video.removeAttribute(
          "src"
        );

        video.load();

        overlay.remove();


        if (
          activeCleanup ===
          cleanup
        ) {

          activeCleanup =
            null;
        }


        resolve(
          result
        );
      };


      const cleanup =
        () =>
          finish(
            false
          );


      const startPlayback =
        async () => {

          if (
            started ||
            finished
          ) {
            return;
          }

          started =
            true;


          try {

            await game.video.play(
              video,
              {
                playing:
                  true,

                loop:
                  false,

                offset:
                  0,

                volume:
                  0
              }
            );

          } catch (error) {

            console.error(
              `[${MODULE_ID}] Error iniciando transición de combate.`,
              {
                error,

                src:
                  source,

                readyState:
                  video.readyState,

                networkState:
                  video.networkState,

                mediaError:
                  video.error
              }
            );


            finish(
              false
            );
          }
        };


      activeCleanup =
        cleanup;


      video.addEventListener(
        "ended",
        () =>
          finish(
            true
          ),
        {
          once: true
        }
      );


      video.addEventListener(
        "error",
        () => {

          console.error(
            `[${MODULE_ID}] No se pudo cargar o decodificar la transición.`,
            {
              src:
                source,

              readyState:
                video.readyState,

              networkState:
                video.networkState,

              mediaError:
                video.error,

              webmSupport:
                video.canPlayType(
                  "video/webm"
                )
            }
          );


          finish(
            false
          );
        },
        {
          once: true
        }
      );


      video.addEventListener(
        "canplay",
        () => {

          void startPlayback();
        },
        {
          once: true
        }
      );


      fallbackTimer =
        window.setTimeout(
          cleanup,
          transition.fallbackDuration
        );


      /*
       * Asignamos el src al final para que todos
       * los listeners estén registrados antes
       * de comenzar la carga.
       */

      video.src =
        source;

      video.load();


      /*
       * El recurso puede provenir inmediatamente
       * desde caché —como indica tu 304— y ya
       * encontrarse listo antes de canplay.
       */

      if (
        video.readyState >=
        HTMLMediaElement.HAVE_FUTURE_DATA
      ) {

        void startPlayback();
      }
    }
  );
}