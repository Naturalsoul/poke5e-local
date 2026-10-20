const MODULE_ID =
  "poke5e-local";

const CRIES_ENABLED_SETTING =
  "pokemonCriesEnabled";

const CRY_ASSET_ROOT =
  `modules/${MODULE_ID}/assets/audio/cries`;

const CRY_VOLUME =
  0.45;

const cryPathCache =
  new Map();


/* ============================================================
 * SETTINGS
 * ============================================================ */

export function registerPokemonCrySettings() {

  game.settings.register(
    MODULE_ID,
    CRIES_ENABLED_SETTING,
    {
      name:
        "Poke5e - Cries de Pokémon",

      hint:
        "Reproduce el cry del Pokémon cuando entra al combate mediante Deploy o Switch.",

      scope:
        "world",

      config:
        true,

      type:
        Boolean,

      default:
        true
    }
  );
}


/* ============================================================
 * CRY ID
 * ============================================================ */

function normalizeCryId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase()
    .normalize(
      "NFKD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[.'’:]/g,
      ""
    )
    .replace(
      /\s+/g,
      "-"
    );
}


function getPokemonSourceId(
  pokemon
) {

  return normalizeCryId(
    pokemon?.getFlag?.(
      MODULE_ID,
      "sourceId"
    )
  );
}


function regionalFormCandidate(
  sourceId
) {

  const match =
    sourceId.match(
      /^(alolan|galarian|hisuian|paldean)-(.+)$/
    );


  if (!match) {
    return null;
  }


  const suffixes = {
    alolan:
      "alola",

    galarian:
      "galar",

    hisuian:
      "hisui",

    paldean:
      "paldea"
  };


  return (
    `${match[2]}-` +
    `${suffixes[match[1]]}`
  );
}


function buildCryIdCandidates(
  sourceId
) {

  return [
    ...new Set(
      [
        sourceId,

        /*
         * charizard-mega-x
         * ->
         * charizard-megax
         */
        sourceId.replace(
          /-mega-([xy])$/,
          "-mega$1"
        ),

        /*
         * alolan-rattata
         * ->
         * rattata-alola
         */
        regionalFormCandidate(
          sourceId
        ),

        /*
         * mr-mime -> mrmime
         * mime-jr -> mimejr
         * type-null -> typenull
         * ho-oh -> hooh
         */
        sourceId.replace(
          /-/g,
          ""
        )
      ].filter(Boolean)
    )
  ];
}


/* ============================================================
 * LOCAL ASSET RESOLUTION
 * ============================================================ */

async function preloadCryPath(
  path
) {

  try {

    await foundry.audio
      .AudioHelper
      .preloadSound(
        path
      );


    return true;

  } catch {

    return false;
  }
}


export async function resolvePokemonCryPath(
  pokemon
) {

  const sourceId =
    getPokemonSourceId(
      pokemon
    );


  if (!sourceId) {
    return null;
  }


  const cached =
    cryPathCache.get(
      sourceId
    );


  if (cached) {
    return cached;
  }


  for (
    const candidate
    of buildCryIdCandidates(
      sourceId
    )
  ) {

    const path =
      `${CRY_ASSET_ROOT}/${candidate}.mp3`;


    if (
      !await preloadCryPath(
        path
      )
    ) {
      continue;
    }


    /*
     * Solo cacheamos rutas cuya carga
     * de audio fue confirmada por Foundry.
     */

    cryPathCache.set(
      sourceId,
      path
    );


    return path;
  }


  /*
   * No cacheamos fallos.
   *
   * Si posteriormente se agrega el asset
   * durante desarrollo, puede encontrarse
   * sin reiniciar el mundo.
   */

  return null;
}


/* ============================================================
 * PLAYBACK
 * ============================================================ */

export async function playPokemonCry(
  pokemon
) {

  if (
    !game.settings.get(
      MODULE_ID,
      CRIES_ENABLED_SETTING
    )
  ) {

    return false;
  }


  const path =
    await resolvePokemonCryPath(
      pokemon
    );


  if (!path) {
    return false;
  }


  foundry.audio
    .AudioHelper
    .play(
      {
        src:
          path,

        autoplay:
          true,

        loop:
          false,

        channel:
          "interface",

        volume:
          CRY_VOLUME
      },

      /*
       * Reproduce también para los
       * demás clientes conectados.
       */
      true
    );


  return true;
}