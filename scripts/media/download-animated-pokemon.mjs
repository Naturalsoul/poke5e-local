import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  spawnSync
} from "node:child_process";
import {
  fileURLToPath
} from "node:url";

import {
  SHOWDOWN_SPRITE_URLS,
  downloadShowdownSprite,
  fetchShowdownCatalog,
  resolveShowdownSprite
} from "./showdown-sprite-provider.mjs";


const DEFAULT_OPTIONS =
  Object.freeze({
    catalog:
      "data/normalized/pokemon.json",

    report:
      "data/normalized/validation/animated-sprites-report.json",

    manifest:
      null,

    assets:
      null,

    ffmpeg:
      null,

    size:
      256,

    shiny:
      true,

    force:
      false,

    dryRun:
      false,

    onlyId:
      null
  });


/* ============================================================
 * OUTPUT
 * ============================================================ */

function outputLine(
  message = ""
) {

  process.stdout.write(
    `${message}\n`
  );
}


/* ============================================================
 * ARGUMENTOS
 * ============================================================ */

function parsePositiveInteger(
  value,
  optionName
) {

  const parsed =
    Number(
      value
    );


  if (
    !Number.isInteger(
      parsed
    ) ||
    parsed <= 0
  ) {

    throw new Error(
      `${optionName} debe ser un entero positivo.`
    );
  }


  return parsed;
}


function parseArgs(
  argv
) {

  const options = {
    ...DEFAULT_OPTIONS
  };


  for (
    const argument
    of argv
  ) {

    if (
      argument ===
      "--force"
    ) {

      options.force =
        true;

      continue;
    }


    if (
      argument ===
      "--dry-run"
    ) {

      options.dryRun =
        true;

      continue;
    }


    if (
      argument ===
      "--no-shiny"
    ) {

      options.shiny =
        false;

      continue;
    }


    if (
      argument.startsWith(
        "--catalog="
      )
    ) {

      options.catalog =
        argument.slice(
          "--catalog=".length
        );

      continue;
    }


    if (
      argument.startsWith(
        "--report="
      )
    ) {

      options.report =
        argument.slice(
          "--report=".length
        );

      continue;
    }

    if (
      argument.startsWith(
        "--manifest="
      )
    ) {

      options.manifest =
        argument.slice(
          "--manifest=".length
        );

      continue;
    }

    if (
      argument.startsWith(
        "--assets="
      )
    ) {

      options.assets =
        argument.slice(
          "--assets=".length
        );

      continue;
    }


    if (
      argument.startsWith(
        "--ffmpeg="
      )
    ) {

      options.ffmpeg =
        argument.slice(
          "--ffmpeg=".length
        );

      continue;
    }


    if (
      argument.startsWith(
        "--size="
      )
    ) {

      options.size =
        parsePositiveInteger(
          argument.slice(
            "--size=".length
          ),
          "--size"
        );

      continue;
    }


    if (
      argument.startsWith(
        "--id="
      )
    ) {

      options.onlyId =
        argument
          .slice(
            "--id=".length
          )
          .trim() ||
        null;

      continue;
    }


    throw new Error(
      `Opción desconocida: ${argument}`
    );
  }


  return options;
}


/* ============================================================
 * CATÁLOGO CANÓNICO
 * ============================================================ */

function readPokemonCatalog(
  file
) {

  if (
    !fs.existsSync(
      file
    )
  ) {

    throw new Error(
      `No existe el catálogo normalizado: ${file}`
    );
  }


  const parsed =
    JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );


  const items =
    parsed?.items;


  if (
    !Array.isArray(
      items
    )
  ) {

    throw new Error(
      `El catálogo ${file} no contiene un array items válido.`
    );
  }


  return items;
}


/* ============================================================
 * ASSETS
 * ============================================================ */

function findAssetsDir(
  explicitPath
) {

  if (
    explicitPath
  ) {

    const resolved =
      path.resolve(
        explicitPath
      );


    if (
      !fs.existsSync(
        resolved
      )
    ) {

      throw new Error(
        `No existe la carpeta de assets indicada: ${resolved}`
      );
    }


    return resolved;
  }


  const candidates = [

    path.resolve(
      "static",
      "assets"
    ),

    path.resolve(
      "assets"
    ),

    path.resolve(
      "source",
      "static",
      "assets"
    ),

    path.resolve(
      "source",
      "assets"
    )
  ];


  const found =
    candidates.find(
      candidate =>
        fs.existsSync(
          candidate
        )
    );


  if (
    !found
  ) {

    throw new Error(
      "No pude encontrar la carpeta assets. Usa --assets=<ruta> para indicarla."
    );
  }


  return found;
}


function isLocalTokenPath(
  value
) {

  return (
    typeof value ===
      "string"
    &&
    /^assets[\\/]/.test(
      value
    )
  );
}


function isEligiblePokemon(
  pokemon
) {

  const dexNumber =
    Number(
      pokemon?.dexNumber
    );


  return (
    Number.isFinite(
      dexNumber
    )
    &&
    dexNumber > 0
    &&
    isLocalTokenPath(
      pokemon?.media?.token
    )
  );
}


function tokenAssetDirectory(
  pokemon,
  assetsDir
) {

  const relativeToken =
    pokemon.media
      .token
      .replace(
        /^assets[\\/]/,
        ""
      );


  const absoluteToken =
    path.resolve(
      assetsDir,
      relativeToken
    );


  const assetsRoot =
    path.resolve(
      assetsDir
    );


  const relativeCheck =
    path.relative(
      assetsRoot,
      absoluteToken
    );


  if (
    relativeCheck.startsWith(
      ".."
    )
    ||
    path.isAbsolute(
      relativeCheck
    )
  ) {

    throw new Error(
      `Ruta de token fuera de assets para ${pokemon.id}.`
    );
  }


  return path.dirname(
    absoluteToken
  );
}


function outputFileFor(
  pokemon,
  assetsDir,
  variant
) {

  const directory =
    tokenAssetDirectory(
      pokemon,
      assetsDir
    );


  const filename =
    variant ===
      "shiny"

      ? "sprite-animated-shiny.webm"

      : "sprite-animated.webm";


  return path.join(
    directory,
    filename
  );
}

function resolveManifestFile(
  options,
  assetsDir
) {

  if (
    options.manifest
  ) {

    return path.resolve(
      options.manifest
    );
  }


  return path.join(
    assetsDir,
    "pokemon",
    "animated-media-manifest.json"
  );
}


function normalizeAssetPath(
  value
) {

  return String(
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
    );
}


function assetPathForFile(
  file,
  assetsDir
) {

  const relative =
    path.relative(
      path.resolve(
        assetsDir
      ),
      path.resolve(
        file
      )
    );


  if (
    relative.startsWith(
      ".."
    ) ||
    path.isAbsolute(
      relative
    )
  ) {

    throw new Error(
      `El archivo ${file} está fuera de assets.`
    );
  }


  return normalizeAssetPath(
    path.join(
      "assets",
      relative
    )
  );
}


function staticTokenForVariant(
  pokemon,
  variant
) {

  if (
    variant ===
      "shiny"
  ) {

    return (
      pokemon?.media
        ?.tokenShiny
      ??
      pokemon?.media
        ?.portraitShiny
      ??
      pokemon?.media
        ?.token
      ??
      null
    );
  }


  return (
    pokemon?.media
      ?.token
    ??
    null
  );
}


function buildManifestVariant(
  pokemon,
  assetsDir,
  variant
) {

  const animatedFile =
    outputFileFor(
      pokemon,
      assetsDir,
      variant
    );


  if (
    !fs.existsSync(
      animatedFile
    )
  ) {

    return null;
  }


  const staticToken =
    staticTokenForVariant(
      pokemon,
      variant
    );


  if (
    !isLocalTokenPath(
      staticToken
    )
  ) {

    return null;
  }


  return {

    static:
      normalizeAssetPath(
        staticToken
      ),

    animated:
      assetPathForFile(
        animatedFile,
        assetsDir
      )
  };
}


function buildAnimatedMediaManifest(
  pokemonCatalog,
  assetsDir
) {

  const entries =
    {};


  let variants =
    0;


  for (
    const pokemon
    of pokemonCatalog
  ) {

    if (
      !isEligiblePokemon(
        pokemon
      )
    ) {

      continue;
    }


    const normal =
      buildManifestVariant(
        pokemon,
        assetsDir,
        "normal"
      );


    const shiny =
      buildManifestVariant(
        pokemon,
        assetsDir,
        "shiny"
      );


    if (
      !normal &&
      !shiny
    ) {

      continue;
    }


    const entry =
      {};


    if (normal) {

      entry.normal =
        normal;

      variants +=
        1;
    }


    if (shiny) {

      entry.shiny =
        shiny;

      variants +=
        1;
    }


    entries[
      pokemon.id
    ] =
      entry;
  }


  return {

    schemaVersion:
      "1.0.0",

    generatedAt:
      new Date()
        .toISOString(),

    summary: {

      pokemon:
        Object.keys(
          entries
        ).length,

      variants
    },

    entries
  };
}

/* ============================================================
 * FFMPEG
 * ============================================================ */

function ffmpegExecutable(
  options
) {

  return (
    options.ffmpeg
    ||
    process.env
      .FFMPEG_PATH
    ||
    "ffmpeg"
  );
}


function assertFfmpegAvailable(
  executable
) {

  const result =
    spawnSync(
      executable,
      [
        "-version"
      ],
      {
        encoding:
          "utf8",

        windowsHide:
          true
      }
    );


  if (
    result.error
    ||
    result.status !==
      0
  ) {

    throw new Error(
      `FFmpeg no está disponible (${executable}). Instálalo o usa --ffmpeg=<ruta>.`
    );
  }
}


function convertGifToWebm(
  inputFile,
  outputFile,
  size,
  executable
) {

  fs.mkdirSync(
    path.dirname(
      outputFile
    ),
    {
      recursive: true
    }
  );


  const temporaryOutput =
    `${outputFile}.tmp.webm`;


  const videoFilter = [

    `scale=${size}:${size}:force_original_aspect_ratio=decrease:flags=neighbor`,

    `pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,

    "format=yuva420p"

  ].join(
    ","
  );


  const result =
    spawnSync(
      executable,
      [
        "-y",

        "-hide_banner",

        "-loglevel",
        "error",

        "-i",
        inputFile,

        "-vf",
        videoFilter,

        "-an",

        "-c:v",
        "libvpx-vp9",

        "-pix_fmt",
        "yuva420p",

        "-auto-alt-ref",
        "0",

        "-crf",
        "24",

        "-b:v",
        "0",

        "-metadata:s:v:0",
        "alpha_mode=1",

        temporaryOutput
      ],
      {
        encoding:
          "utf8",

        windowsHide:
          true
      }
    );


  if (
    result.error
    ||
    result.status !==
      0
  ) {

    fs.rmSync(
      temporaryOutput,
      {
        force:
          true
      }
    );


    const detail =
      String(
        result.stderr ??
        result.error?.message ??
        ""
      ).trim();


    throw new Error(
      `FFmpeg no pudo convertir ${inputFile}: ${detail}`
    );
  }


  fs.renameSync(
    temporaryOutput,
    outputFile
  );
}


/* ============================================================
 * JOBS
 * ============================================================ */

function buildJobs(
  pokemon,
  catalogs,
  assetsDir,
  includeShiny
) {

  const variants = [
    "normal"
  ];


  if (
    includeShiny
  ) {

    variants.push(
      "shiny"
    );
  }


  return variants.map(
    variant => {

      const resolution =
        resolveShowdownSprite(
          pokemon,
          catalogs[
            variant
          ]
        );


      return {

        pokemonId:
          pokemon.id,

        pokemonName:
          pokemon.name,

        variant,

        resolution,

        baseUrl:
          SHOWDOWN_SPRITE_URLS[
            variant
          ],

        outputFile:
          outputFileFor(
            pokemon,
            assetsDir,
            variant
          )
      };
    }
  );
}


async function runJob(
  job,
  options,
  tempDir,
  executable
) {

  if (
    job.resolution
      .status !==
    "resolved"
  ) {

    return {
      ...job,
      status:
        job.resolution
          .status
    };
  }


  if (
    !options.force
    &&
    fs.existsSync(
      job.outputFile
    )
  ) {

    return {
      ...job,
      status:
        "skipped-existing"
    };
  }


  if (
    options.dryRun
  ) {

    return {
      ...job,
      status:
        "planned"
    };
  }


  const gifFile =
    path.join(
      tempDir,
      `${job.pokemonId}-${job.variant}.gif`
    );


  try {

    const sourceUrl =
      await downloadShowdownSprite(
        job.baseUrl,
        job.resolution
          .filename,
        gifFile
      );


    convertGifToWebm(
      gifFile,
      job.outputFile,
      options.size,
      executable
    );


    return {
      ...job,
      sourceUrl,
      status:
        "converted"
    };

  } catch (
    error
  ) {

    return {
      ...job,

      status:
        "failed",

      error:
        error instanceof Error
          ? error.message
          : String(
              error
            )
    };

  } finally {

    await fsPromises.rm(
      gifFile,
      {
        force:
          true
      }
    );
  }
}


/* ============================================================
 * REPORT
 * ============================================================ */

function reportRecord(
  result,
  projectRoot
) {

  const record = {

    pokemonId:
      result.pokemonId,

    pokemonName:
      result.pokemonName,

    variant:
      result.variant,

    status:
      result.status,

    output:
      path
        .relative(
          projectRoot,
          result.outputFile
        )
        .replaceAll(
          "\\",
          "/"
        )
  };


  if (
    result.resolution
      ?.status ===
    "resolved"
  ) {

    record.sourceFile =
      result.resolution
        .filename;


    record.matchedBy =
      result.resolution
        .matchedBy;


    record.candidate =
      result.resolution
        .candidate;

  } else {

    record.candidates =
      result.resolution
        ?.candidates ??
      [];


    record.ambiguous =
      result.resolution
        ?.ambiguous ??
      [];
  }


  if (
    result.sourceUrl
  ) {

    record.sourceUrl =
      result.sourceUrl;
  }


  if (
    result.error
  ) {

    record.error =
      result.error;
  }


  return record;
}


function summarize(
  records,
  skippedCustom
) {

  const counts = {};


  for (
    const record
    of records
  ) {

    counts[
      record.status
    ] =
      (
        counts[
          record.status
        ] ??
        0
      ) +
      1;
  }


  return {

    pokemonSkippedCustomOrWithoutToken:
      skippedCustom,

    jobs:
      records.length,

    converted:
      counts.converted ??
      0,

    planned:
      counts.planned ??
      0,

    skippedExisting:
      counts[
        "skipped-existing"
      ] ??
      0,

    unresolved:
      counts.unresolved ??
      0,

    ambiguous:
      counts.ambiguous ??
      0,

    failed:
      counts.failed ??
      0
  };
}


async function writeJsonFile(
  file,
  value
) {

  await fsPromises.mkdir(
    path.dirname(
      file
    ),
    {
      recursive:
        true
    }
  );


  await fsPromises.writeFile(
    file,
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    "utf8"
  );
}


/* ============================================================
 * MAIN
 * ============================================================ */

async function main() {

  const options =
    parseArgs(
      process.argv.slice(
        2
      )
    );


  const projectRoot =
    process.cwd();


  const catalogFile =
    path.resolve(
      options.catalog
    );


  const reportFile =
    path.resolve(
      options.report
    );


  const assetsDir =
    findAssetsDir(
      options.assets
    );

  const manifestFile =
    resolveManifestFile(
      options,
      assetsDir
    );

  const pokemonCatalog =
    readPokemonCatalog(
      catalogFile
    );


  const selected =
    options.onlyId

      ? pokemonCatalog.filter(
          pokemon =>
            pokemon.id ===
            options.onlyId
        )

      : pokemonCatalog;


  if (
    options.onlyId
    &&
    selected.length ===
      0
  ) {

    throw new Error(
      `No existe ${options.onlyId} en ${catalogFile}.`
    );
  }


  const eligible =
    selected.filter(
      isEligiblePokemon
    );


  const skippedCustom =
    selected.length -
    eligible.length;


  outputLine(
    "=== Animated Pokémon Media Downloader ==="
  );

  outputLine(
    `Catálogo: ${catalogFile}`
  );

  outputLine(
    `Assets:   ${assetsDir}`
  );

  outputLine(
    `Pokémon:  ${eligible.length}`
  );

  outputLine(
    `Tamaño:   ${options.size}x${options.size}`
  );

  outputLine(
    `Shiny:    ${options.shiny ? "sí" : "no"}`
  );

  outputLine(
    `Modo:     ${options.dryRun ? "dry-run" : "descarga + conversión"}`
  );

  outputLine();


  const [
    normalCatalog,
    shinyCatalog
  ] =
    await Promise.all([

      fetchShowdownCatalog(
        SHOWDOWN_SPRITE_URLS
          .normal
      ),

      options.shiny

        ? fetchShowdownCatalog(
            SHOWDOWN_SPRITE_URLS
              .shiny
          )

        : Promise.resolve(
            null
          )
    ]);


  const catalogs = {

    normal:
      normalCatalog,

    shiny:
      shinyCatalog
  };


  const executable =
    ffmpegExecutable(
      options
    );


  if (
    !options.dryRun
  ) {

    assertFfmpegAvailable(
      executable
    );
  }


  const tempDir =
    await fsPromises.mkdtemp(
      path.join(
        os.tmpdir(),
        "pokemon-foundry-animated-"
      )
    );


  const records = [];


  try {

    for (
      const pokemon
      of eligible
    ) {

      const jobs =
        buildJobs(
          pokemon,
          catalogs,
          assetsDir,
          options.shiny
        );


      for (
        const job
        of jobs
      ) {

        const result =
          await runJob(
            job,
            options,
            tempDir,
            executable
          );


        const record =
          reportRecord(
            result,
            projectRoot
          );


        records.push(
          record
        );


        outputLine(
          `[${record.status}] ${record.pokemonId} (${record.variant})${record.sourceFile ? ` <- ${record.sourceFile}` : ""}`
        );
      }
    }

  } finally {

    await fsPromises.rm(
      tempDir,
      {
        recursive:
          true,

        force:
          true
      }
    );
  }


  const report = {

    schemaVersion:
      "1.0.0",

    generatedAt:
      new Date()
        .toISOString(),

    source: {

      provider:
        "Pokemon Showdown / Smogon community sprites",

      normal:
        SHOWDOWN_SPRITE_URLS
          .normal,

      shiny:
        options.shiny

          ? SHOWDOWN_SPRITE_URLS
              .shiny

          : null
    },

    options: {

      size:
        options.size,

      shiny:
        options.shiny,

      force:
        options.force,

      dryRun:
        options.dryRun,

      onlyId:
        options.onlyId
    },

    summary:
      summarize(
        records,
        skippedCustom
      ),

    records
  };


  await writeJsonFile(
    reportFile,
    report
  );


  let manifest =
    null;


  if (
    !options.dryRun
  ) {

    manifest =
      buildAnimatedMediaManifest(
        pokemonCatalog,
        assetsDir
      );


    await writeJsonFile(
      manifestFile,
      manifest
    );
  }


  outputLine();

  outputLine(
    `Reporte: ${reportFile}`
  );

  if (
    manifest
  ) {

    outputLine(
      `Manifest: ${manifestFile}`
    );

    outputLine(
      `Animaciones disponibles: ${manifest.summary.variants}`
    );
  }

  outputLine(
    `Convertidos: ${report.summary.converted}`
  );

  outputLine(
    `Pendientes sin match: ${
      report.summary.unresolved +
      report.summary.ambiguous
    }`
  );

  outputLine(
    `Fallidos: ${report.summary.failed}`
  );


  if (
    report.summary.failed >
    0
  ) {

    process.exitCode =
      1;
  }
}


/* ============================================================
 * EJECUCIÓN
 * ============================================================ */

const currentFile =
  fileURLToPath(
    import.meta.url
  );


const entryFile =
  process.argv[1]

    ? path.resolve(
        process.argv[1]
      )

    : null;


if (
  entryFile
  &&
  path.resolve(
    currentFile
  ) ===
    entryFile
) {

  main().catch(
    error => {

      process.stderr.write(
        `${
          error instanceof Error
            ? error.message
            : String(
                error
              )
        }\n`
      );


      process.exitCode =
        1;
    }
  );
}