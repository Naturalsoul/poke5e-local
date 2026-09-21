const MODULE_ID =
  "poke5e-local";


export const ANIMATED_TOKEN_SETTING =
  "useAnimatedPokemonTokens";


const ANIMATED_MEDIA_MANIFEST =
  `modules/${MODULE_ID}/assets/pokemon/animated-media-manifest.json`;


let manifestPromise =
  null;


/* ============================================================
 * PATHS
 * ============================================================ */

function normalizeAssetPath(
  value
) {

  let normalized =
    String(
      value ??
      ""
    )
      .trim()
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      )
      .replace(
        /[?#].*$/,
        ""
      );


  const modulePrefix =
    `modules/${MODULE_ID}/`;


  if (
    normalized.startsWith(
      modulePrefix
    )
  ) {

    normalized =
      normalized.slice(
        modulePrefix.length
      );
  }


  return normalized;
}


function moduleAssetPath(
  value
) {

  const normalized =
    normalizeAssetPath(
      value
    );


  if (!normalized) {

    return null;
  }


  if (
    !normalized.startsWith(
      "assets/"
    )
  ) {

    return null;
  }


  return (
    `modules/${MODULE_ID}/${normalized}`
  );
}


/* ============================================================
 * SETTING
 * ============================================================ */

export function animatedPokemonTokensEnabled() {

  try {

    return Boolean(
      game.settings.get(
        MODULE_ID,
        ANIMATED_TOKEN_SETTING
      )
    );

  } catch {

    return false;
  }
}


/* ============================================================
 * MANIFEST
 * ============================================================ */

async function loadAnimatedMediaManifest() {

  if (
    manifestPromise
  ) {

    return manifestPromise;
  }


  manifestPromise =
    (async () => {

      const version =
        game.modules.get(
          MODULE_ID
        )?.version ??
        Date.now();


      try {

        const response =
          await fetch(
            `${ANIMATED_MEDIA_MANIFEST}?v=${encodeURIComponent(version)}`,
            {
              cache:
                "no-store"
            }
          );


        if (
          !response.ok
        ) {

          console.warn(
            `[${MODULE_ID}] No se pudo cargar el manifest de sprites animados: HTTP ${response.status}.`
          );


          return {
            entries: {}
          };
        }


        const manifest =
          await response.json();


        if (
          !manifest?.entries ||
          typeof manifest.entries !==
            "object" ||
          Array.isArray(
            manifest.entries
          )
        ) {

          console.warn(
            `[${MODULE_ID}] El manifest de sprites animados no posee entries válidos.`
          );


          return {
            entries: {}
          };
        }


        return manifest;

      } catch (error) {

        console.warn(
          `[${MODULE_ID}] No se pudo cargar el manifest de sprites animados.`,
          error
        );


        return {
          entries: {}
        };
      }
    })();


  return manifestPromise;
}


/* ============================================================
 * RESOLUTION
 * ============================================================ */

function pokemonSourceId(
  actor
) {

  return String(
    actor?.getFlag?.(
      MODULE_ID,
      "sourceId"
    ) ??
    ""
  ).trim();
}


export async function resolvePokemonTokenSource(
  actor,
  staticToken,
  {
    variant = "normal"
  } = {}
) {

  if (
    !staticToken ||
    !animatedPokemonTokensEnabled()
  ) {

    return staticToken;
  }


  const sourceId =
    pokemonSourceId(
      actor
    );


  if (!sourceId) {

    return staticToken;
  }


  const manifest =
    await loadAnimatedMediaManifest();


  const normalizedVariant =
    variant ===
      "shiny"
      ? "shiny"
      : "normal";


  const media =
    manifest.entries
      ?.[sourceId]
      ?.[normalizedVariant];


  if (
    !media?.static ||
    !media?.animated
  ) {

    return staticToken;
  }


  /*
   * Protección de artwork personalizado.
   *
   * Solo reemplazamos por WebM cuando la imagen
   * estática actual corresponde al artwork canónico
   * que produjo ese WebM.
   */

  if (
    normalizeAssetPath(
      staticToken
    ) !==
    normalizeAssetPath(
      media.static
    )
  ) {

    return staticToken;
  }


  return (
    moduleAssetPath(
      media.animated
    ) ??
    staticToken
  );
}