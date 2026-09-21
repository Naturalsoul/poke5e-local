import {
  ensureTrainerFolderStructure,
  synchronizeTrainerPokemonFolders
} from "./trainer-folder-service.mjs";

import {
  buildInitialTrainerPartyState,
  normalizeTrainerPartyState,
  trainerPartyStateNeedsMigration
} from "./trainer-party-state.mjs";

import {
  configureTrainerProgression
} from "./trainer-progression-service.mjs";

const MODULE_ID =
  "poke5e-local";

const TRAINER_KIND =
  "trainer";

const TRAINER_FOLDER_KIND =
  "trainer-root";

const TRAINER_SCHEMA_VERSION =
  2;

const DEFAULT_TRAINER_LEVEL =
  1;

const MAX_TRAINER_LEVEL =
  20;


/* ============================================================
 * VALIDATION
 * ============================================================ */

function normalizeTrainerName(
  name
) {

  const normalized =
    String(
      name ??
      ""
    ).trim();


  if (!normalized) {

    throw new Error(
      "El Trainer requiere un nombre."
    );
  }


  return normalized;
}


/* ============================================================
 * TRAINER FOLDER
 * ============================================================ */

function isTrainerFolder(
  folder
) {

  return (
    folder?.type === "Actor"
    &&
    folder.getFlag(
      MODULE_ID,
      "kind"
    ) === TRAINER_FOLDER_KIND
  );
}


export async function getOrCreateTrainerFolder(
  {
    name = "Entrenadores"
  } = {}
) {

  const existing =
    game.folders.find(
      isTrainerFolder
    );


  if (existing) {

    return existing;
  }


  const folder =
    await Folder.implementation.create({
      name,

      type:
        "Actor",

      flags: {

        [MODULE_ID]: {

          kind:
            TRAINER_FOLDER_KIND
        }
      }
    });


  if (!folder) {

    throw new Error(
      "No se pudo crear la carpeta de Trainers."
    );
  }


  return folder;
}


/* ============================================================
 * TRAINER IDENTIFICATION
 * ============================================================ */

export function isTrainerActor(
  actor
) {

  if (
    actor?.documentName !==
    "Actor"
  ) {

    return false;
  }


  return (
    actor.getFlag(
      MODULE_ID,
      "kind"
    ) === TRAINER_KIND
  );
}

/* ============================================================
 * TRAINER LEVEL
 * ============================================================ */

function normalizeTrainerLevel(
  value
) {

  if (
    value == null ||
    value === ""
  ) {

    return DEFAULT_TRAINER_LEVEL;
  }


  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    return DEFAULT_TRAINER_LEVEL;
  }


  return Math.min(
    MAX_TRAINER_LEVEL,
    Math.max(
      DEFAULT_TRAINER_LEVEL,
      Math.trunc(
        numeric
      )
    )
  );
}


export function getTrainerLevel(
  actor
) {

  if (
    !isTrainerActor(
      actor
    )
  ) {

    return null;
  }


  return normalizeTrainerLevel(
    actor.getFlag(
      MODULE_ID,
      "trainerLevel"
    )
  );
}


/* ============================================================
 * ENSURE TRAINER STATE
 * ============================================================ */

export async function ensureTrainerState(
  actor
) {

  if (
    !isTrainerActor(
      actor
    )
  ) {

    throw new Error(
      `${actor?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }


  if (
    actor.getFlag(
      MODULE_ID,
      "trainerLevel"
    ) == null
  ) {

    await actor.setFlag(
      MODULE_ID,
      "trainerLevel",
      DEFAULT_TRAINER_LEVEL
    );
  }


  const storedParty =
    actor.getFlag(
      MODULE_ID,
      "trainerParty"
    );


  if (
    trainerPartyStateNeedsMigration(
      storedParty
    )
  ) {

    await actor.setFlag(
      MODULE_ID,
      "trainerParty",
      normalizeTrainerPartyState(
        storedParty
      )
    );
  }


  if (
    actor.getFlag(
      MODULE_ID,
      "trainerSchemaVersion"
    ) !==
      TRAINER_SCHEMA_VERSION
  ) {

    await actor.setFlag(
      MODULE_ID,
      "trainerSchemaVersion",
      TRAINER_SCHEMA_VERSION
    );
  }


  const rootFolder =
    await getOrCreateTrainerFolder();


  await ensureTrainerFolderStructure(
    actor,
    rootFolder
  );


  await synchronizeTrainerPokemonFolders(
    actor
  );


  return actor;
}


/* ============================================================
 * CREATE TRAINER
 * ============================================================ */

export async function createTrainer(
  {
    name,
    folderName = "Entrenadores",
    progression = null
  }
) {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Solo un GM puede crear Trainers."
    );
  }


  const trainerName =
    normalizeTrainerName(
      name
    );


  const folder =
    await getOrCreateTrainerFolder({
      name:
        folderName
    });


  const trainer =
    await Actor.implementation.create({

      name:
        trainerName,

      type:
        "character",

      folder:
        folder.id,

      flags: {

        [MODULE_ID]: {

          kind:
            TRAINER_KIND,

          trainerSchemaVersion:
            TRAINER_SCHEMA_VERSION,

          trainerLevel:
            DEFAULT_TRAINER_LEVEL,

          trainerParty:
            buildInitialTrainerPartyState()
        }
      }
    });


  if (!trainer) {

    throw new Error(
      `No se pudo crear el Trainer ${trainerName}.`
    );
  }

  if (progression) {

    try {

      await configureTrainerProgression(
        trainer,
        progression
      );

    } catch (error) {

      await trainer.delete();

      throw error;
    }
  }

  await ensureTrainerFolderStructure(
    trainer,
    folder
  );


  return trainer;
}