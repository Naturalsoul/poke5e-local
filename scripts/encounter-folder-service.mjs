const MODULE_ID =
  "poke5e-local";

const ROOT_FOLDER_NAME =
  "Combates";


export class EncounterFolderService {

  async folderFor(
    encounter
  ) {
    const root =
      await this
        .#ensureRootFolder();


    const location =
      await this
        .#ensureLocationFolder(
          root,
          encounter
        );


    const folder =
      await this
        .#ensureEncounterFolder(
          location,
          encounter
        );


    return {
      root,
      location,
      encounter:
        folder
    };
  }

  async trainerFolderFor(
    encounterFolder,
    encounter,
    trainer
  ) {
    if (
      !encounterFolder?.id ||
      !encounter?.key ||
      !trainer?.id
    ) {
      throw new Error(
        "trainerFolderFor requiere encuentro, carpeta y Entrenador válidos."
      );
    }


    return this.#ensureTrainerFolder(
      encounterFolder,
      encounter,
      trainer
    );
  }


  async cleanupTrainerFolders(
    encounterFolder,
    encounterKey,
    activeTrainerIds = []
  ) {
    const activeIds =
      new Set(
        activeTrainerIds.map(
          id =>
            String(
              id
            )
        )
      );


    const obsolete =
      game.folders.filter(
        folder =>
          folder.type ===
            "Actor" &&

          folderParentId(
            folder
          ) ===
            encounterFolder.id &&

          folder.getFlag(
            MODULE_ID,
            "kind"
          ) ===
            "encounter-trainer" &&

          folder.getFlag(
            MODULE_ID,
            "encounterKey"
          ) ===
            encounterKey &&

          !activeIds.has(
            String(
              folder.getFlag(
                MODULE_ID,
                "trainerId"
              ) ??
              ""
            )
          )
      );


    for (
      const folder
      of obsolete
    ) {
      const hasActors =
        game.actors.some(
          actor =>
            actorFolderId(
              actor
            ) ===
              folder.id
        );


      if (hasActors) {
        continue;
      }


      await folder.delete();
    }
  }
  
  async cleanupEncounterHierarchy(
    encounterKey
  ) {
    const key =
      String(
        encounterKey ??
        ""
      ).trim();


    if (!key) {
      throw new Error(
        "cleanupEncounterHierarchy requiere una clave de encuentro válida."
      );
    }


    const encounterFolder =
      findActorFolderByEncounterKey(
        key
      );


    if (!encounterFolder) {
      return {
        trainerFoldersDeleted:
          0,

        encounterFolderDeleted:
          false,

        locationFolderDeleted:
          false
      };
    }


    const locationFolderId =
      folderParentId(
        encounterFolder
      );


    const trainerFolders =
      game.folders.filter(
        folder =>
          folder.type ===
            "Actor" &&

          folderParentId(
            folder
          ) ===
            encounterFolder.id &&

          folder.getFlag(
            MODULE_ID,
            "kind"
          ) ===
            "encounter-trainer"
      );


    let trainerFoldersDeleted =
      0;


    for (
      const trainerFolder
      of trainerFolders
    ) {
      if (
        folderHasActors(
          trainerFolder
        ) ||
        folderHasChildren(
          trainerFolder
        )
      ) {
        continue;
      }


      await trainerFolder.delete();

      trainerFoldersDeleted +=
        1;
    }


    if (
      folderHasActors(
        encounterFolder
      ) ||
      folderHasChildren(
        encounterFolder
      )
    ) {
      return {
        trainerFoldersDeleted,

        encounterFolderDeleted:
          false,

        locationFolderDeleted:
          false
      };
    }


    await encounterFolder.delete();


    const locationFolder =
      findFolderById(
        locationFolderId
      );


    if (
      !locationFolder ||
      locationFolder.getFlag(
        MODULE_ID,
        "kind"
      ) !==
        "encounter-location" ||
      folderHasActors(
        locationFolder
      ) ||
      folderHasChildren(
        locationFolder
      )
    ) {
      return {
        trainerFoldersDeleted,

        encounterFolderDeleted:
          true,

        locationFolderDeleted:
          false
      };
    }


    await locationFolder.delete();


    return {
      trainerFoldersDeleted,

      encounterFolderDeleted:
        true,

      locationFolderDeleted:
        true
    };
  }

  async #ensureRootFolder() {
    const existing =
      findActorFolder({
        parentId:
          null,

        kind:
          "encounter-root"
      });


    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name:
            ROOT_FOLDER_NAME,

          sorting:
            "m"
        }
      );


      return existing;
    }


    return Folder.create({
      name:
        ROOT_FOLDER_NAME,

      type:
        "Actor",

      folder:
        null,

      color:
        null,

      sorting:
        "m",

      flags: {
        [MODULE_ID]: {
          kind:
            "encounter-root"
        }
      }
    });
  }


  async #ensureLocationFolder(
    root,
    encounter
  ) {
    const locationKey =
      normalizeKeyText(
        encounter.location
      );


    const existing =
      findActorFolder({
        parentId:
          root.id,

        kind:
          "encounter-location",

        predicate:
          folder =>
            folder.getFlag(
              MODULE_ID,
              "locationKey"
            ) ===
            locationKey
      });


    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name:
            encounter.location,

          sorting:
            "m"
        }
      );


      return existing;
    }


    return Folder.create({
      name:
        encounter.location,

      type:
        "Actor",

      folder:
        root.id,

      color:
        null,

      sorting:
        "m",

      flags: {
        [MODULE_ID]: {
          kind:
            "encounter-location",

          locationKey
        }
      }
    });
  }

  async #ensureTrainerFolder(
    encounterFolder,
    encounter,
    trainer
  ) {
    const trainerId =
      String(
        trainer.id
      );


    const existing =
      findActorFolder({
        parentId:
          encounterFolder.id,

        kind:
          "encounter-trainer",

        predicate:
          folder =>
            folder.getFlag(
              MODULE_ID,
              "encounterKey"
            ) ===
              encounter.key &&

            String(
              folder.getFlag(
                MODULE_ID,
                "trainerId"
              ) ??
              ""
            ) ===
              trainerId
      });


    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name:
            trainer.name,

          sorting:
            "m"
        }
      );


      return existing;
    }


    return Folder.create({
      name:
        trainer.name,

      type:
        "Actor",

      folder:
        encounterFolder.id,

      color:
        null,

      sorting:
        "m",

      flags: {
        [MODULE_ID]: {
          kind:
            "encounter-trainer",

          encounterKey:
            encounter.key,

          trainerId
        }
      }
    });
  }

  async #ensureEncounterFolder(
    locationFolder,
    encounter
  ) {
    const existing =
      findActorFolderByEncounterKey(
        encounter.key
      );


    if (existing) {
      await updateFolderIfNeeded(
        existing,
        {
          name:
            encounter.name,

          folderId:
            locationFolder.id,

          sorting:
            "m"
        }
      );


      const storedType =
        existing.getFlag(
          MODULE_ID,
          "encounterType"
        );


      if (
        storedType !==
        encounter.type
      ) {
        await existing.setFlag(
          MODULE_ID,
          "encounterType",
          encounter.type
        );
      }


      return existing;
    }


    return Folder.create({
      name:
        encounter.name,

      type:
        "Actor",

      folder:
        locationFolder.id,

      color:
        null,

      sorting:
        "m",

      flags: {
        [MODULE_ID]: {
          kind:
            "encounter-folder",

          encounterKey:
            encounter.key,

          encounterType:
            encounter.type
        }
      }
    });
  }
}


function findActorFolder({
  parentId,
  kind,
  predicate = () => true
}) {
  return (
    game.folders.find(
      folder =>
        folder.type ===
          "Actor" &&

        folderParentId(
          folder
        ) ===
          parentId &&

        folder.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          kind &&

        predicate(
          folder
        )
    ) ??
    null
  );
}


function findActorFolderByEncounterKey(
  encounterKey
) {
  return (
    game.folders.find(
      folder =>
        folder.type ===
          "Actor" &&

        folder.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          "encounter-folder" &&

        folder.getFlag(
          MODULE_ID,
          "encounterKey"
        ) ===
          encounterKey
    ) ??
    null
  );
}


function folderParentId(
  folder
) {
  const parent =
    folder?.folder;


  if (!parent) {
    return null;
  }


  return typeof parent ===
    "string"
    ? parent
    : parent.id ??
      null;
}


async function updateFolderIfNeeded(
  folder,
  changes
) {
  const update = {};


  if (
    changes.name != null &&
    folder.name !==
      changes.name
  ) {
    update.name =
      changes.name;
  }


  if (
    changes.folderId !==
      undefined &&

    folderParentId(
      folder
    ) !==
      changes.folderId
  ) {
    update.folder =
      changes.folderId;
  }


  if (
    changes.sorting != null &&
    folder.sorting !==
      changes.sorting
  ) {
    update.sorting =
      changes.sorting;
  }


  if (
    Object.keys(
      update
    ).length
  ) {
    await folder.update(
      update
    );
  }
}

function actorFolderId(
  actor
) {
  const folder =
    actor?.folder;


  if (!folder) {
    return null;
  }


  return typeof folder ===
    "string"
    ? folder
    : folder.id ??
      null;
}

function findFolderById(
  folderId
) {
  if (!folderId) {
    return null;
  }


  return (
    game.folders.find(
      folder =>
        folder.id ===
          folderId
    ) ??
    null
  );
}


function folderHasActors(
  folder
) {
  return game.actors.some(
    actor =>
      actorFolderId(
        actor
      ) ===
        folder.id
  );
}


function folderHasChildren(
  folder
) {
  return game.folders.some(
    child =>
      folderParentId(
        child
      ) ===
        folder.id
  );
}

function normalizeKeyText(
  value
) {
  return String(
    value ??
    ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      " "
    );
}