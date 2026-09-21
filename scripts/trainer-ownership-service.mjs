import {
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const POKEMON_KIND =
  "pokemon";

const TRAINER_OWNERSHIP_SYNCHRONIZATIONS =
  new Set();

/* ============================================================
 * ACTOR IDENTIFICATION
 * ============================================================ */

function isPokemonActor(
  actor
) {

  return (
    actor?.documentName ===
      "Actor"
    &&
    actor.getFlag(
      MODULE_ID,
      "kind"
    ) === POKEMON_KIND
  );
}


function pokemonTrainerUuid(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return null;
  }


  const value =
    pokemon.getFlag(
      MODULE_ID,
      "trainerOwnerUuid"
    );


  return value
    ? String(
        value
      )
    : null;
}


function pokemonBelongsToTrainer(
  trainer,
  pokemon
) {

  return (
    isTrainerActor(
      trainer
    )
    &&
    isPokemonActor(
      pokemon
    )
    &&
    pokemonTrainerUuid(
      pokemon
    ) === trainer.uuid
  );
}


/* ============================================================
 * CURRENT USER PERMISSIONS
 * ============================================================ */

function hasOwnerPermission(
  document,
  user = game.user
) {

  if (
    user?.isGM
  ) {

    return true;
  }


  return Boolean(
    document
      ?.testUserPermission?.(
        user,
        "OWNER"
      )
  );
}


export function canCurrentUserOperateTrainer(
  trainer
) {

  return (
    isTrainerActor(
      trainer
    )
    &&
    hasOwnerPermission(
      trainer
    )
  );
}


export function canCurrentUserOperateTrainerPokemon(
  trainer,
  pokemon
) {

  if (
    !pokemonBelongsToTrainer(
      trainer,
      pokemon
    )
  ) {

    return false;
  }


  return (
    hasOwnerPermission(
      trainer
    )
    &&
    hasOwnerPermission(
      pokemon
    )
  );
}


/* ============================================================
 * OWNERSHIP SYNCHRONIZATION
 * ============================================================ */

function ownershipSnapshot(
  document
) {

  return foundry.utils.deepClone(
    document?.ownership ??
    {}
  );
}

function trainerSharedOwnership(
  trainer
) {

  const requested =
    ownershipSnapshot(
      trainer
    );


  const observerLevel =
    Number(
      CONST
        .DOCUMENT_OWNERSHIP_LEVELS
        .OBSERVER
    );


  /*
   * Todos los Players actuales y futuros
   * heredan como mínimo OBSERVER.
   */
  requested.default =
    Math.max(
      Number(
        requested.default ??
        0
      ),
      observerLevel
    );


  /*
   * Un permiso específico de usuario tiene
   * prioridad sobre "default" en Foundry.
   *
   * Si existiera un Player explícitamente en
   * NONE/LIMITED, lo elevamos también a OBSERVER.
   *
   * OWNER se conserva intacto.
   */
  for (
    const user
    of game.users
  ) {

    if (
      !user ||
      user.isGM ||
      !Object.prototype
        .hasOwnProperty.call(
          requested,
          user.id
        )
    ) {

      continue;
    }


    requested[
      user.id
    ] =
      Math.max(
        Number(
          requested[
            user.id
          ] ??
          0
        ),
        observerLevel
      );
  }


  return requested;
}

function sameOwnership(
  left,
  right
) {

  const keys =
    new Set([
      ...Object.keys(
        left ??
        {}
      ),

      ...Object.keys(
        right ??
        {}
      )
    ]);


  return Array.from(
    keys
  ).every(
    key =>
      Number(
        left?.[key] ??
        0
      ) ===
      Number(
        right?.[key] ??
        0
      )
  );
}


function ownershipUpdateSource(
  current,
  requested
) {

  const source = {
    ...requested
  };


  for (
    const key
    of Object.keys(
      current
    )
  ) {

    if (
      Object.prototype
        .hasOwnProperty.call(
          requested,
          key
        )
    ) {

      continue;
    }


    source[
      `-=${key}`
    ] =
      null;
  }


  return source;
}

async function ensureTrainerObserverOwnership(
  trainer
) {

  if (
    !game.user.isGM ||
    !isTrainerActor(
      trainer
    )
  ) {

    return false;
  }


  const current =
    ownershipSnapshot(
      trainer
    );


  const requested =
    trainerSharedOwnership(
      trainer
    );


  if (
    sameOwnership(
      current,
      requested
    )
  ) {

    return false;
  }


  await trainer.update({
    ownership:
      ownershipUpdateSource(
        current,
        requested
      )
  });


  return true;
}

async function synchronizePokemonPrototypeToken(
  pokemon
) {

  const prototypeToken =
    pokemon.prototypeToken;


  const actorLinkIsCorrect =
    prototypeToken
      ?.actorLink ===
    true;


  const dispositionIsCorrect =
    prototypeToken
      ?.disposition ===
    CONST.TOKEN_DISPOSITIONS
      .FRIENDLY;


  if (
    actorLinkIsCorrect &&
    dispositionIsCorrect
  ) {

    return false;
  }


  const updates = {};


  if (
    !actorLinkIsCorrect
  ) {

    updates[
      "prototypeToken.actorLink"
    ] =
      true;
  }


  if (
    !dispositionIsCorrect
  ) {

    updates[
      "prototypeToken.disposition"
    ] =
      CONST.TOKEN_DISPOSITIONS
        .FRIENDLY;
  }


  await pokemon.update(
    updates
  );


  return true;
}

export async function synchronizePokemonOwnershipFromTrainer(
  trainer,
  pokemon
) {

  if (
    !game.user.isGM ||
    !pokemonBelongsToTrainer(
      trainer,
      pokemon
    )
  ) {

    return false;
  }


  const current =
    ownershipSnapshot(
      pokemon
    );


  const requested =
    trainerSharedOwnership(
      trainer
    );


  let updated =
    false;


  if (
    !sameOwnership(
      current,
      requested
    )
  ) {

    await pokemon.update({

      ownership:
        ownershipUpdateSource(
          current,
          requested
        )
    });


    updated =
      true;
  }


  const prototypeUpdated =
    await synchronizePokemonPrototypeToken(
      pokemon
    );


  return (
    updated ||
    prototypeUpdated
  );
}


export async function synchronizeTrainerPokemonOwnership(
  trainer
) {

  if (
    !game.user.isGM ||
    !isTrainerActor(
      trainer
    )
  ) {

    return 0;
  }


  const pokemon =
    game.actors.filter(
      actor =>
        pokemonBelongsToTrainer(
          trainer,
          actor
        )
    );


  let updated =
    0;


  for (
    const actor
    of pokemon
  ) {

    if (
      await synchronizePokemonOwnershipFromTrainer(
        trainer,
        actor
      )
    ) {

      updated += 1;
    }
  }


  return updated;
}

async function synchronizeTrainerSharedOwnership(
  trainer
) {

  if (
    !game.user.isGM ||
    !isTrainerActor(
      trainer
    )
  ) {

    return {
      trainerUpdated:
        false,

      pokemonUpdated:
        0
    };
  }


  const key =
    trainer.uuid;


  if (
    TRAINER_OWNERSHIP_SYNCHRONIZATIONS.has(
      key
    )
  ) {

    return {
      trainerUpdated:
        false,

      pokemonUpdated:
        0
    };
  }


  TRAINER_OWNERSHIP_SYNCHRONIZATIONS.add(
    key
  );


  try {

    const trainerUpdated =
      await ensureTrainerObserverOwnership(
        trainer
      );


    const pokemonUpdated =
      await synchronizeTrainerPokemonOwnership(
        trainer
      );


    return {
      trainerUpdated,
      pokemonUpdated
    };

  } finally {

    TRAINER_OWNERSHIP_SYNCHRONIZATIONS.delete(
      key
    );
  }
}

/* ============================================================
 * OWNERSHIP CHANGE DETECTION
 * ============================================================ */

function ownershipChanged(
  changes
) {

  if (
    !changes ||
    typeof changes !==
      "object"
  ) {

    return false;
  }


  return Object.keys(
    changes
  ).some(
    key =>
      key === "ownership" ||
      key.startsWith(
        "ownership."
      )
  );
}


function onUpdateActor(
  actor,
  changes
) {

  if (
    !game.user.isGM ||
    !isTrainerActor(
      actor
    ) ||
    !ownershipChanged(
      changes
    )
  ) {

    return;
  }


  void synchronizeTrainerSharedOwnership(
    actor
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error sincronizando ownership de ${actor.name}.`,
        error
      );
    }
  );
}

function onCreateActor(
  actor
) {

  if (
    !game.user.isGM ||
    !isTrainerActor(
      actor
    )
  ) {

    return;
  }


  void synchronizeTrainerSharedOwnership(
    actor
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error inicializando ownership de ${actor.name}.`,
        error
      );
    }
  );
}

async function synchronizeExistingOwnership() {

  if (
    !game.user.isGM
  ) {

    return;
  }


  const trainers =
    game.actors.filter(
      isTrainerActor
    );


  for (
    const trainer
    of trainers
  ) {

    await synchronizeTrainerSharedOwnership(
      trainer
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerTrainerOwnershipService() {

  Hooks.on(
    "createActor",
    onCreateActor
  );


  Hooks.on(
    "updateActor",
    onUpdateActor
  );


  Hooks.once(
    "ready",
    () => {

      void synchronizeExistingOwnership()
        .catch(
          error => {

            console.error(
              `[${MODULE_ID}] Error sincronizando ownership inicial de Trainers.`,
              error
            );
          }
        );
    }
  );
}