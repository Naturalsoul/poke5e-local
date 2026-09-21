import {
  FAKEMON_SCHEMA_VERSION,
  normalizeFakemonStore
} from "./fakemon-model.mjs";

import {
  validateFakemonStoreAgainstCompositeDatabase
} from "./fakemon-catalog-service.mjs";


export function createFakemonBackup(
  store
) {

  return normalizeFakemonStore(
    store
  );
}

export async function saveFakemonBackup(
  store,
  {
    now = new Date()
  } = {}
) {

  const prepared =
    prepareBackupExport(
      store,
      now
    );


  if (
    typeof window.showSaveFilePicker !==
      "function"
  ) {

    triggerBackupDownload(
      prepared.json,
      prepared.filename
    );


    return {
      cancelled:
        false,

      filename:
        prepared.filename,

      mode:
        "download",

      summary:
        prepared.summary
    };
  }


  try {

    const handle =
      await window.showSaveFilePicker({
        id:
          "poke5e-fakemon-backup",

        suggestedName:
          prepared.filename,

        types: [
          {
            description:
              "Fakemon Studio backup",

            accept: {
              "application/json": [
                ".json"
              ]
            }
          }
        ]
      });


    const writable =
      await handle.createWritable();


    await writable.write(
      prepared.json
    );


    await writable.close();


    return {
      cancelled:
        false,

      filename:
        String(
          handle.name ??
          prepared.filename
        ),

      mode:
        "picker",

      summary:
        prepared.summary
    };

  } catch (
    error
  ) {

    if (
      error?.name ===
        "AbortError"
    ) {

      return {
        cancelled:
          true,

        filename:
          null,

        mode:
          "picker",

        summary:
          prepared.summary
      };
    }


    throw error;
  }
}

export function downloadFakemonBackup(
  store,
  {
    now = new Date()
  } = {}
) {

  const prepared =
    prepareBackupExport(
      store,
      now
    );


  triggerBackupDownload(
    prepared.json,
    prepared.filename
  );


  return {
    filename:
      prepared.filename,

    summary:
      prepared.summary
  };
}


export async function readFakemonBackupFile(
  file
) {

  if (
    !file ||
    typeof file.text !==
      "function"
  ) {

    throw new Error(
      "Selecciona un archivo JSON de backup válido."
    );
  }


  const text =
    await file.text();


  let parsed;


  try {

    parsed =
      JSON.parse(
        text
      );

  } catch {

    throw new Error(
      "El archivo seleccionado no contiene JSON válido."
    );
  }


  assertBackupEnvelope(
    parsed
  );


  const sourceSchemaVersion =
    Number(
      parsed.schemaVersion
    );


  if (
    !Number.isInteger(
      sourceSchemaVersion
    ) ||
    sourceSchemaVersion < 1
  ) {

    throw new Error(
      "El backup no contiene un schemaVersion válido."
    );
  }


  if (
    sourceSchemaVersion >
      FAKEMON_SCHEMA_VERSION
  ) {

    throw new Error(
      `El backup usa schemaVersion ${sourceSchemaVersion}, ` +
      `pero esta instalación soporta hasta ${FAKEMON_SCHEMA_VERSION}.`
    );
  }


  return {
    sourceSchemaVersion,

    store:
      normalizeFakemonStore(
        parsed
      )
  };
}


export function preflightFakemonBackup({
  candidateStore,
  currentStore,
  database
}) {

  const store =
    validateFakemonStoreAgainstCompositeDatabase({
      database,
      currentStore,
      candidateStore
    });


  return {
    store,

    summary:
      summarizeFakemonStore(
        store
      )
  };
}


export function summarizeFakemonStore(
  store
) {

  const normalized =
    normalizeFakemonStore(
      store
    );

  const enabledSpeciesCount =
    normalized.species.filter(
      species =>
        normalized
          .optionsBySpeciesId[
            species.id
          ]?.enabled !==
        false
    ).length;


  return {
    schemaVersion:
      normalized.schemaVersion,

    speciesCount:
      normalized.species.length,

    enabledSpeciesCount,

    evolutionCount:
      normalized.evolutions.length
  };
}


function assertBackupEnvelope(
  value
) {

  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {

    throw new Error(
      "El backup de Fakemon Studio debe ser un objeto JSON."
    );
  }


  if (
    !Array.isArray(
      value.species
    )
  ) {

    throw new Error(
      "El backup no contiene un array species válido."
    );
  }


  if (
    !Array.isArray(
      value.evolutions
    )
  ) {

    throw new Error(
      "El backup no contiene un array evolutions válido."
    );
  }


  if (
    !value.optionsBySpeciesId ||
    typeof value.optionsBySpeciesId !==
      "object" ||
    Array.isArray(
      value.optionsBySpeciesId
    )
  ) {

    throw new Error(
      "El backup no contiene optionsBySpeciesId válido."
    );
  }
}

function prepareBackupExport(
  store,
  now
) {

  const backup =
    createFakemonBackup(
      store
    );

  const filename =
    buildBackupFilename(
      now
    );


  return {
    filename,

    json:
      JSON.stringify(
        backup,
        null,
        2
      ),

    summary:
      summarizeFakemonStore(
        backup
      )
  };
}


function triggerBackupDownload(
  json,
  filename
) {

  const blob =
    new Blob(
      [
        json
      ],
      {
        type:
          "application/json"
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href =
    url;

  anchor.download =
    filename;

  anchor.hidden =
    true;

  document.body.append(
    anchor
  );


  try {

    anchor.click();

  } finally {

    anchor.remove();

    URL.revokeObjectURL(
      url
    );
  }
}

function buildBackupFilename(
  now
) {

  const year =
    now.getFullYear();

  const month =
    pad2(
      now.getMonth() +
        1
    );

  const day =
    pad2(
      now.getDate()
    );

  const hours =
    pad2(
      now.getHours()
    );

  const minutes =
    pad2(
      now.getMinutes()
    );


  return (
    `fakemon-studio-backup-` +
    `${year}-${month}-${day}-` +
    `${hours}${minutes}.json`
  );
}


function pad2(
  value
) {

  return String(
    value
  ).padStart(
    2,
    "0"
  );
}