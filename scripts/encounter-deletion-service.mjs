import {
  EncounterFolderService
} from "./encounter-folder-service.mjs";


const MODULE_ID =
  "poke5e-local";


export class EncounterDeletionService {

  constructor() {
    this.folders =
      new EncounterFolderService();
  }


  async deleteEncounter(
    encounterKey
  ) {
    if (
      !game.user.isGM
    ) {
      throw new Error(
        "Solo el GM puede eliminar encuentros Pokémon."
      );
    }


    const key =
      normalizeEncounterKey(
        encounterKey
      );


    const actors =
      getEncounterActors(
        key
      );


    let deleted = 0;
    let retained = 0;


    for (
      const actor
      of actors
    ) {
      if (
        actorIsUsedInScene(
          actor
        )
      ) {
        const metadata =
          foundry.utils.deepClone(
            actor.getFlag(
              MODULE_ID,
              "encounter"
            ) ??
            {}
          );


        metadata.stale =
          true;


        metadata.deletionPending =
          true;


        await actor.setFlag(
          MODULE_ID,
          "encounter",
          metadata
        );


        retained +=
          1;

        continue;
      }


      await actor.delete();

      deleted +=
        1;
    }


    const folders =
      await this.folders
        .cleanupEncounterHierarchy(
          key
        );


    return {
      key,
      deleted,
      retained,
      folders
    };
  }


  async cleanupPending() {
    if (
      !game.user.isGM
    ) {
      return {
        deleted:
          0,

        retained:
          0,

        encounters:
          0
      };
    }


    const pendingActors =
      game.actors.filter(
        actor => {
          const metadata =
            actor.getFlag(
              MODULE_ID,
              "encounter"
            );


          return (
            metadata?.deletionPending ===
              true &&

            Boolean(
              String(
                metadata.key ??
                ""
              ).trim()
            )
          );
        }
      );


    const encounterKeys =
      new Set();


    let deleted = 0;
    let retained = 0;


    for (
      const actor
      of pendingActors
    ) {
      const metadata =
        actor.getFlag(
          MODULE_ID,
          "encounter"
        );


      encounterKeys.add(
        String(
          metadata.key
        )
      );


      if (
        actorIsUsedInScene(
          actor
        )
      ) {
        retained +=
          1;

        continue;
      }


      await actor.delete();

      deleted +=
        1;
    }


    for (
      const encounterKey
      of encounterKeys
    ) {
      await this.folders
        .cleanupEncounterHierarchy(
          encounterKey
        );
    }


    return {
      deleted,
      retained,

      encounters:
        encounterKeys.size
    };
  }
}


function getEncounterActors(
  encounterKey
) {
  return game.actors.filter(
    actor =>
      actor.getFlag(
        MODULE_ID,
        "encounter"
      )?.key ===
        encounterKey
  );
}


function normalizeEncounterKey(
  value
) {
  const key =
    String(
      value ??
      ""
    ).trim();


  if (!key) {
    throw new Error(
      "Se requiere una clave de encuentro válida."
    );
  }


  return key;
}


function actorIsUsedInScene(
  actor
) {
  return game.scenes.some(
    scene =>
      scene.tokens.some(
        token =>
          token.actorId ===
            actor.id
      )
  );
}