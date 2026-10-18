import {
  isPokemonActor
} from "./trainer-party-service.mjs";

const MODULE_ID =
  "poke5e-local";

const TRAINER_KIND =
  "trainer";

const TRAINER_FOLDER_KIND =
  "trainer-container";

const PARTY_FOLDER_KIND =
  "trainer-party";

const PC_FOLDER_KIND =
  "trainer-pc";


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertTrainer(
  trainer
) {

  if (
    trainer?.documentName !==
      "Actor"
    ||
    trainer.getFlag(
      MODULE_ID,
      "kind"
    ) !== TRAINER_KIND
  ) {

    throw new Error(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


/* ============================================================
 * FOLDER HELPERS
 * ============================================================ */

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


function findTrainerFolder({
  kind,
  parentId,
  trainerUuid
}) {

  return (
    game.folders.find(
      folder =>
        folder.type === "Actor"
        &&
        folder.getFlag(
          MODULE_ID,
          "kind"
        ) === kind
        &&
        folder.getFlag(
          MODULE_ID,
          "trainerUuid"
        ) === trainerUuid
        &&
        folderParentId(
          folder
        ) === parentId
    ) ??
    null
  );
}


async function createFolder({
  name,
  kind,
  parentId,
  trainerUuid
}) {

  const folder =
    await Folder.implementation.create({

      name,

      type:
        "Actor",

      folder:
        parentId,

      sorting:
        "m",

      flags: {

        [MODULE_ID]: {

          kind,

          trainerUuid
        }
      }
    });


  if (!folder) {

    throw new Error(
      `No se pudo crear la carpeta ${name}.`
    );
  }


  return folder;
}


async function ensureFolder({
  name,
  kind,
  parentId,
  trainerUuid
}) {

  const existing =
    findTrainerFolder({
      kind,
      parentId,
      trainerUuid
    });


  if (existing) {

    const changes = {};


    if (
      existing.name !==
      name
    ) {

      changes.name =
        name;
    }


    if (
      existing.sorting !==
      "m"
    ) {

      changes.sorting =
        "m";
    }


    if (
      Object.keys(
        changes
      ).length
    ) {

      await existing.update(
        changes
      );
    }


    return existing;
  }


  return createFolder({
    name,
    kind,
    parentId,
    trainerUuid
  });
}


/* ============================================================
 * TRAINER STRUCTURE
 * ============================================================ */

export async function ensureTrainerFolderStructure(
  trainer,
  rootFolder
) {

  assertTrainer(
    trainer
  );


  if (
    !rootFolder ||
    rootFolder.type !==
      "Actor"
  ) {

    throw new Error(
      "La carpeta raíz de Trainers no es válida."
    );
  }


  const trainerFolder =
    await ensureFolder({

      name:
        trainer.name,

      kind:
        TRAINER_FOLDER_KIND,

      parentId:
        rootFolder.id,

      trainerUuid:
        trainer.uuid
    });


  const partyFolder =
    await ensureFolder({

      name:
        "Party",

      kind:
        PARTY_FOLDER_KIND,

      parentId:
        trainerFolder.id,

      trainerUuid:
        trainer.uuid
    });


  const pcFolder =
    await ensureFolder({

      name:
        "PC",

      kind:
        PC_FOLDER_KIND,

      parentId:
        trainerFolder.id,

      trainerUuid:
        trainer.uuid
    });


  if (
    trainer.folder?.id !==
    trainerFolder.id
  ) {

    await trainer.update({

      folder:
        trainerFolder.id
    });
  }


  return {
    trainerFolder,
    partyFolder,
    pcFolder
  };
}


/* ============================================================
 * RESOLUTION
 * ============================================================ */

function trainerFolderByKind(
  trainer,
  kind
) {

  assertTrainer(
    trainer
  );


  return (
    game.folders.find(
      folder =>
        folder.type === "Actor"
        &&
        folder.getFlag(
          MODULE_ID,
          "kind"
        ) === kind
        &&
        folder.getFlag(
          MODULE_ID,
          "trainerUuid"
        ) === trainer.uuid
    ) ??
    null
  );
}


export function getTrainerPartyFolder(
  trainer
) {

  return trainerFolderByKind(
    trainer,
    PARTY_FOLDER_KIND
  );
}


export function getTrainerPcFolder(
  trainer
) {

  return trainerFolderByKind(
    trainer,
    PC_FOLDER_KIND
  );
}


/* ============================================================
 * ACTOR MOVEMENT
 * ============================================================ */

async function movePokemonToFolder(
  pokemon,
  folder
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }


  if (!folder) {

    throw new Error(
      `No existe una carpeta destino para ${pokemon.name}.`
    );
  }


  if (
    pokemon.folder?.id ===
    folder.id
  ) {

    return pokemon;
  }


  await pokemon.update({

    folder:
      folder.id
  });


  return pokemon;
}


export async function movePokemonToPartyFolder(
  trainer,
  pokemon
) {

  return movePokemonToFolder(
    pokemon,
    getTrainerPartyFolder(
      trainer
    )
  );
}


export async function movePokemonToPcFolder(
  trainer,
  pokemon
) {

  return movePokemonToFolder(
    pokemon,
    getTrainerPcFolder(
      trainer
    )
  );
}


export async function movePokemonOutOfTrainerFolders(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }


  await pokemon.update({

    folder:
      null
  });


  return pokemon;
}


/* ============================================================
 * FULL SYNCHRONIZATION
 * ============================================================ */

export async function synchronizeTrainerPokemonFolders(
  trainer
) {

  assertTrainer(
    trainer
  );


  const partyFolder =
    getTrainerPartyFolder(
      trainer
    );

  const pcFolder =
    getTrainerPcFolder(
      trainer
    );


  if (
    !partyFolder ||
    !pcFolder
  ) {

    throw new Error(
      `La estructura de carpetas de ${trainer.name} no está inicializada.`
    );
  }


  const partyState =
    trainer.getFlag(
      MODULE_ID,
      "trainerParty"
    ) ?? {};


  const partyUuids =
    new Set(
      Array.isArray(
        partyState.pokemonUuids
      )
        ? partyState.pokemonUuids
        : []
    );


  const ownedPokemon =
    game.actors.filter(
      actor =>
        isPokemonActor(
          actor
        )
        &&
        actor.getFlag(
          MODULE_ID,
          "trainerOwnerUuid"
        ) === trainer.uuid
    );


  for (
    const pokemon
    of ownedPokemon
  ) {

    const destination =
      partyUuids.has(
        pokemon.uuid
      )
        ? partyFolder
        : pcFolder;


    if (
      pokemon.folder?.id ===
      destination.id
    ) {

      continue;
    }


    await pokemon.update({

      folder:
        destination.id
    });
  }


  return {
    partyFolder,
    pcFolder
  };
}