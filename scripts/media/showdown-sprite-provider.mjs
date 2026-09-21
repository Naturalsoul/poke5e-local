import fs from "node:fs/promises";
import path from "node:path";

export const SHOWDOWN_SPRITE_URLS = Object.freeze({
  normal:
    "https://play.pokemonshowdown.com/sprites/ani/",

  shiny:
    "https://play.pokemonshowdown.com/sprites/ani-shiny/"
});


const REGION_WORDS = Object.freeze({
  alolan:
    "alola",

  galarian:
    "galar",

  hisuian:
    "hisui",

  paldean:
    "paldea"
});

const REGION_SUFFIXES =
  new Set(
    Object.values(
      REGION_WORDS
    )
  );


const SHOWDOWN_FILENAME_OVERRIDES =
  Object.freeze({
    "nidoran-f":
      "nidoranf",

    "nidoran-m":
      "nidoranm",

    "mr-mime":
      "mrmime"
  });


const SHOWDOWN_FORM_ALIASES =
  Object.freeze({
    "wormadam-plant-cloak": [
      "wormadam"
    ],

    "wormadam-sand-cloak": [
      "wormadam-sandy"
    ],

    "giratina-altered-forme": [
      "giratina"
    ],

    "shaymin-land": [
      "shaymin"
    ],

    "meloetta-aria": [
      "meloetta"
    ],

    "meowstic-m": [
      "meowstic"
    ],

    "zygarde-50-forme": [
      "zygarde"
    ],

    "hoopa-confined": [
      "hoopa"
    ],

    "oricorio-baile-style": [
      "oricorio"
    ],

    "wishiwashi-solo-form": [
      "wishiwashi"
    ],

    "minior-core-form": [
      "minior"
    ],

    "indeedee-m": [
      "indeedee"
    ],

    "basculegion-m": [
      "basculegion"
    ],

    "oinkologne-male": [
      "oinkologne"
    ],

    "black-kyurem": [
      "kyurem-black"
    ],

    "white-kyurem": [
      "kyurem-white"
    ],

    "dawn-wings-necrozma": [
      "necrozma-dawnwings"
    ],

    "dusk-mane-necrozma": [
      "necrozma-duskmane"
    ],

    "ultra-necrozma": [
      "necrozma-ultra"
    ]
  });


const CASTFORM_WEATHERS =
  new Set([
    "rainy",
    "snowy",
    "sunny"
  ]);

const GENERIC_FORM_WORDS =
  new Set([
    "breed",
    "cloak",
    "form",
    "forme",
    "mask",
    "mode",
    "style",
    "sword",
    "shield"
  ]);


const DEFAULT_FORM_WORDS =
  new Set([
    "amped",
    "male",
    "midday",
    "normal",
    "ordinary"
  ]);


/* ============================================================
 * NORMALIZACIÓN DE NOMBRES
 * ============================================================ */

function stripDiacritics(
  value
) {

  return String(
    value ??
    ""
  )
    .normalize(
      "NFKD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    );
}


export function normalizeSpriteName(
  value
) {

  return stripDiacritics(
    value
  )
    .replace(
      /♀/g,
      " female "
    )
    .replace(
      /♂/g,
      " male "
    )
    .toLowerCase()
    .replace(
      /[’']/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    )
    .replace(
      /-+/g,
      "-"
    );
}


export function compactSpriteName(
  value
) {

  return normalizeSpriteName(
    value
  )
    .replace(
      /-/g,
      ""
    );
}


/* ============================================================
 * CANDIDATOS
 * ============================================================ */

function replaceWords(
  words
) {

  return words.map(
    word => {

      if (
        word ===
        "female"
      ) {

        return "f";
      }


      if (
        word ===
        "male"
      ) {

        return "m";
      }


      return (
        REGION_WORDS[
          word
        ] ??
        word
      );
    }
  );
}


function withoutWords(
  words,
  removable
) {

  return words.filter(
    word =>
      !removable.has(
        word
      )
  );
}


function addCandidate(
  target,
  words
) {

  const candidate =
    words
      .filter(
        Boolean
      )
      .join(
        "-"
      );


  if (
    candidate
  ) {

    target.add(
      candidate
    );
  }
}

function addStringCandidate(
  target,
  value
) {

  const candidate =
    normalizeSpriteName(
      value
    );


  if (
    candidate
  ) {

    target.add(
      candidate
    );
  }
}


function addRegionalSuffixVariant(
  target,
  words
) {

  if (
    words.length <
    2
  ) {

    return;
  }


  const region =
    REGION_WORDS[
      words[0]
    ] ??
    words[0];


  if (
    !REGION_SUFFIXES.has(
      region
    )
  ) {

    return;
  }


  addCandidate(
    target,
    [
      ...words.slice(
        1
      ),
      region
    ]
  );
}


function addCastformVariant(
  target,
  words
) {

  if (
    words.length !==
      2
    ||
    words[1] !==
      "castform"
    ||
    !CASTFORM_WEATHERS.has(
      words[0]
    )
  ) {

    return;
  }


  addCandidate(
    target,
    [
      "castform",
      words[0]
    ]
  );
}


function addMappedCandidates(
  target,
  pokemon
) {

  const normalizedId =
    normalizeSpriteName(
      pokemon?.id
    );


  const override =
    SHOWDOWN_FILENAME_OVERRIDES[
      normalizedId
    ];


  if (
    override
  ) {

    addStringCandidate(
      target,
      override
    );
  }


  const aliases =
    SHOWDOWN_FORM_ALIASES[
      normalizedId
    ] ??
    [];


  for (
    const alias
    of aliases
  ) {

    addStringCandidate(
      target,
      alias
    );
  }
}

function addVariants(
  target,
  source
) {

  const normalized =
    normalizeSpriteName(
      source
    );


  if (
    !normalized
  ) {

    return;
  }


  const words =
    normalized.split(
      "-"
    );


  const replaced =
    replaceWords(
      words
    );


  /*
   * Poke5e utiliza nombres como:
   *
   * alolan-rattata
   * galarian-rapidash
   *
   * mientras Showdown utiliza:
   *
   * rattata-alola
   * rapidash-galar
   */

  addRegionalSuffixVariant(
    target,
    words
  );


  addRegionalSuffixVariant(
    target,
    replaced
  );


  /*
   * Poke5e:
   * rainy-castform
   *
   * Showdown:
   * castform-rainy
   */

  addCastformVariant(
    target,
    replaced
  );


  const genericStripped =
    withoutWords(
      replaced,
      GENERIC_FORM_WORDS
    );


  const defaultStripped =
    withoutWords(
      genericStripped,
      DEFAULT_FORM_WORDS
    );


  addCandidate(
    target,
    words
  );


  addCandidate(
    target,
    replaced
  );


  addCandidate(
    target,
    genericStripped
  );


  addCandidate(
    target,
    defaultStripped
  );


  /*
   * Urshifu Rapid Strike.
   */

  const rapidStrike =
    normalized
      .replace(
        /-rapid-strike-style$/,
        "-rapidstrike"
      )
      .replace(
        /-rapid-strike$/,
        "-rapidstrike"
      );


  if (
    rapidStrike !==
    normalized
  ) {

    target.add(
      rapidStrike
    );
  }


  /*
   * Urshifu Single Strike es la
   * forma base en Showdown.
   */

  const singleStrike =
    normalized
      .replace(
        /-single-strike-style$/,
        ""
      )
      .replace(
        /-single-strike$/,
        ""
      );


  if (
    singleStrike !==
    normalized
  ) {

    target.add(
      singleStrike
    );
  }
}


export function buildSpriteCandidateNames(
  pokemon
) {

  const candidates =
    new Set();


  /*
   * Los mappings explícitos tienen precedencia.
   *
   * Esto permite resolver filenames históricos
   * ambiguos antes del matching compacto.
   */

  addMappedCandidates(
    candidates,
    pokemon
  );


  addVariants(
    candidates,
    pokemon?.id
  );


  addVariants(
    candidates,
    pokemon?.name
  );


  return [
    ...candidates
  ];
}


/* ============================================================
 * CATÁLOGO SHOWDOWN
 * ============================================================ */

export function buildSpriteCatalogFromNames(
  names
) {

  const byName =
    new Set();


  const byCompact =
    new Map();


  for (
    const rawName
    of names
  ) {

    const filename =
      path.basename(
        String(
          rawName
        )
      );


    if (
      !filename
        .toLowerCase()
        .endsWith(
          ".gif"
        )
    ) {

      continue;
    }


    const spriteName =
      filename
        .slice(
          0,
          -4
        )
        .toLowerCase();


    const compact =
      compactSpriteName(
        spriteName
      );


    byName.add(
      spriteName
    );


    const matches =
      byCompact.get(
        compact
      ) ??
      [];


    matches.push(
      filename
    );


    byCompact.set(
      compact,
      matches
    );
  }


  return {
    byName,
    byCompact
  };
}


export function parseSpriteCatalogHtml(
  html
) {

  const names = [];


  const pattern =
    /href=["']([^"']+\.gif)["']/gi;


  let match =
    pattern.exec(
      String(
        html
      )
    );


  while (
    match
  ) {

    names.push(
      decodeURIComponent(
        match[1]
      )
    );


    match =
      pattern.exec(
        String(
          html
        )
      );
  }


  return buildSpriteCatalogFromNames(
    names
  );
}


/* ============================================================
 * RESOLUCIÓN
 * ============================================================ */

export function resolveShowdownSprite(
  pokemon,
  catalog
) {

  const candidates =
    buildSpriteCandidateNames(
      pokemon
    );


  const ambiguous = [];


  for (
    const candidate
    of candidates
  ) {

    /*
     * Match exacto.
     */

    if (
      catalog.byName.has(
        candidate
      )
    ) {

      return {

        status:
          "resolved",

        filename:
          `${candidate}.gif`,

        matchedBy:
          "name",

        candidate
      };
    }


    /*
     * Match ignorando guiones.
     *
     * Ejemplo:
     * meloetta---pirouette
     * →
     * meloetta-pirouette
     */

    const compact =
      compactSpriteName(
        candidate
      );


    const matches =
      catalog.byCompact.get(
        compact
      ) ??
      [];


    if (
      matches.length ===
      1
    ) {

      return {

        status:
          "resolved",

        filename:
          matches[0],

        matchedBy:
          "compact",

        candidate
      };
    }


    if (
      matches.length >
      1
    ) {

      ambiguous.push({

        candidate,

        matches: [
          ...matches
        ]
      });
    }
  }


  return {

    status:
      ambiguous.length > 0
        ? "ambiguous"
        : "unresolved",

    candidates,

    ambiguous
  };
}


/* ============================================================
 * HTTP
 * ============================================================ */

export async function fetchShowdownCatalog(
  baseUrl
) {

  const response =
    await fetch(
      baseUrl,
      {
        headers: {
          "User-Agent":
            "Pokemon-FoundryVTT-media-downloader/1.0"
        }
      }
    );


  if (
    !response.ok
  ) {

    throw new Error(
      `No se pudo leer el índice de Showdown (${response.status} ${response.statusText}).`
    );
  }


  return parseSpriteCatalogHtml(
    await response.text()
  );
}


export async function downloadShowdownSprite(
  baseUrl,
  filename,
  outputFile
) {

  const sourceUrl =
    new URL(
      filename,
      baseUrl
    ).href;


  const response =
    await fetch(
      sourceUrl,
      {
        headers: {
          "User-Agent":
            "Pokemon-FoundryVTT-media-downloader/1.0"
        }
      }
    );


  if (
    !response.ok
  ) {

    throw new Error(
      `No se pudo descargar ${sourceUrl} (${response.status} ${response.statusText}).`
    );
  }


  const contentType =
    response.headers.get(
      "content-type"
    ) ??
    "";


  if (
    !contentType
      .toLowerCase()
      .includes(
        "image/gif"
      )
  ) {

    throw new Error(
      `Showdown devolvió un contenido inesperado para ${sourceUrl}: ${contentType || "sin content-type"}.`
    );
  }


  await fs.mkdir(
    path.dirname(
      outputFile
    ),
    {
      recursive: true
    }
  );


  const bytes =
    new Uint8Array(
      await response.arrayBuffer()
    );


  await fs.writeFile(
    outputFile,
    bytes
  );


  return sourceUrl;
}