import {
  getTrainerLevel,
  isTrainerActor
} from "./trainer-service.mjs";

import {
  movePokemonToPartyFolder,
  movePokemonToPcFolder
} from "./trainer-folder-service.mjs";

import {
  normalizeTrainerPartyState
} from "./trainer-party-state.mjs";

import {
  synchronizePokemonOwnershipFromTrainer
} from "./trainer-ownership-service.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * ACTOR IDENTIFICATION
 * ============================================================ */

export function isPokemonActor(
  actor
) {

  return (
    actor?.documentName ===
      "Actor"
    &&
    actor.getFlag(
      MODULE_ID,
      "kind"
    ) === "pokemon"
  );
}


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertTrainer(
  trainer
) {

  if (
    !isTrainerActor(
      trainer
    )
  ) {

    throw new Error(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


function assertPokemon(
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
}


/* ============================================================
 * PARTY STATE
 * ============================================================ */

export function getTrainerPartyState(
  trainer
) {

  assertTrainer(
    trainer
  );


  return normalizeTrainerPartyState(
    trainer.getFlag(
      MODULE_ID,
      "trainerParty"
    )
  );
}


async function writeTrainerPartyState(
  trainer,
  state
) {

  const normalized =
    normalizeTrainerPartyState(
      state
    );


  await trainer.setFlag(
    MODULE_ID,
    "trainerParty",
    normalized
  );


  return normalized;
}

/* ============================================================
 * ACTIVE POKÉMON
 * ============================================================ */

export function isPokemonActive(
  trainer,
  pokemon
) {

  if (
    !isTrainerActor(
      trainer
    ) ||
    !isPokemonActor(
      pokemon
    )
  ) {

    return false;
  }


  return getTrainerPartyState(
    trainer
  ).activePokemonUuids.includes(
    pokemon.uuid
  );
}


/**
 * Persistencia interna del conjunto activo.
 *
 * Consumido por trainer-switch-service.mjs.
 */
export async function setTrainerActivePokemonUuids(
  trainer,
  pokemonUuids
) {

  assertTrainer(
    trainer
  );


  if (
    !Array.isArray(
      pokemonUuids
    )
  ) {

    throw new Error(
      "activePokemonUuids debe ser un array."
    );
  }


  const state =
    getTrainerPartyState(
      trainer
    );


  const requested =
    [
      ...new Set(
        pokemonUuids
          .map(
            uuid =>
              String(
                uuid ??
                ""
              ).trim()
          )
          .filter(Boolean)
      )
    ];


  const invalidUuid =
    requested.find(
      uuid =>
        !state.pokemonUuids.includes(
          uuid
        )
    );


  if (
    invalidUuid
  ) {

    throw new Error(
      "Un Pokémon activo debe formar parte de la Party."
    );
  }


  return writeTrainerPartyState(
    trainer,
    {
      ...state,

      activePokemonUuids:
        requested
    }
  );
}


/* ============================================================
 * POKÉSLOTS
 * ============================================================ */

export function getTrainerPokeslotLimit(
  trainer
) {

  assertTrainer(
    trainer
  );


  const level =
    getTrainerLevel(
      trainer
    ) ??
    1;


  if (
    level >= 15
  ) {

    return 6;
  }


  if (
    level >= 10
  ) {

    return 5;
  }


  if (
    level >= 5
  ) {

    return 4;
  }


  return 3;
}


/* ============================================================
 * OWNERSHIP
 * ============================================================ */

export function getPokemonTrainerUuid(
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


function assertPokemonOwner(
  trainer,
  pokemon
) {

  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (
    trainerUuid !==
    trainer.uuid
  ) {

    throw new Error(
      `${pokemon.name} no pertenece a ${trainer.name}.`
    );
  }
}

export async function assignPokemonToTrainer(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );


  const currentTrainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (
    currentTrainerUuid &&
    currentTrainerUuid !==
      trainer.uuid
  ) {

    throw new Error(
      `${pokemon.name} ya pertenece a otro Trainer.`
    );
  }


  if (
    currentTrainerUuid !==
    trainer.uuid
  ) {

    await pokemon.setFlag(
      MODULE_ID,
      "trainerOwnerUuid",
      trainer.uuid
    );
  }


  await synchronizePokemonOwnershipFromTrainer(
    trainer,
    pokemon
  );


  if (
    !isPokemonInParty(
      trainer,
      pokemon
    )
  ) {

    await movePokemonToPcFolder(
      trainer,
      pokemon
    );
  }


  return pokemon;
}


/* ============================================================
 * PARTY MEMBERSHIP
 * ============================================================ */

export function isPokemonInParty(
  trainer,
  pokemon
) {

  if (
    !isTrainerActor(
      trainer
    ) ||
    !isPokemonActor(
      pokemon
    )
  ) {

    return false;
  }


  return getTrainerPartyState(
    trainer
  ).pokemonUuids.includes(
    pokemon.uuid
  );
}


export async function addPokemonToParty(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );

  assertPokemonOwner(
    trainer,
    pokemon
  );


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    state.pokemonUuids.includes(
      pokemon.uuid
    )
  ) {

    return state;
  }


  const limit =
    getTrainerPokeslotLimit(
      trainer
    );


  if (
    state.pokemonUuids.length >=
    limit
  ) {

    throw new Error(
      `${trainer.name} no tiene Pokéslots disponibles (${state.pokemonUuids.length}/${limit}).`
    );
  }


  const nextState =
    await writeTrainerPartyState(
      trainer,
      {
        ...state,

        pokemonUuids: [
          ...state.pokemonUuids,
          pokemon.uuid
        ]
      }
    );


  await movePokemonToPartyFolder(
    trainer,
    pokemon
  );


  return nextState;
}


export async function assignPokemonToParty(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    !state.pokemonUuids.includes(
      pokemon.uuid
    )
  ) {

    const limit =
      getTrainerPokeslotLimit(
        trainer
      );


    if (
      state.pokemonUuids.length >=
      limit
    ) {

      throw new Error(
        `${trainer.name} no tiene Pokéslots disponibles (${state.pokemonUuids.length}/${limit}).`
      );
    }
  }


  await assignPokemonToTrainer(
    trainer,
    pokemon
  );


  return addPokemonToParty(
    trainer,
    pokemon
  );
}


export async function removePokemonFromParty(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    !state.pokemonUuids.includes(
      pokemon.uuid
    )
  ) {

    return state;
  }


  const pokemonUuids =
    state.pokemonUuids.filter(
      uuid =>
        uuid !==
        pokemon.uuid
    );


  const activePokemonUuids =
    state.activePokemonUuids.filter(
      uuid =>
        uuid !==
        pokemon.uuid
    );


  const nextState =
    await writeTrainerPartyState(
      trainer,
      {
        ...state,

        pokemonUuids,

        activePokemonUuids
      }
    );


  await movePokemonToPcFolder(
    trainer,
    pokemon
  );


  return nextState;
}


/* ============================================================
 * RELEASE OWNERSHIP
 * ============================================================ */

export async function releasePokemonFromTrainer(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );

  assertPokemonOwner(
    trainer,
    pokemon
  );


  const state =
    await removePokemonFromParty(
      trainer,
      pokemon
    );


  await Actor.implementation
    .deleteDocuments([
      pokemon.id
    ]);


  return state;
}


/* ============================================================
 * QUERIES
 * ============================================================ */

export function getTrainerOwnedPokemon(
  trainer
) {

  assertTrainer(
    trainer
  );


  return game.actors.filter(
    actor =>
      isPokemonActor(
        actor
      )
      &&
      getPokemonTrainerUuid(
        actor
      ) === trainer.uuid
  );
}