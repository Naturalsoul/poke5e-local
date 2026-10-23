import { assertCanLeaveField } from "./condition-riders.mjs";
import {
  isTrainerActor
} from "./trainer-service.mjs";

import {
  getPokemonTrainerUuid,
  getTrainerPartyState,
  isPokemonActor,
  isPokemonActive,
  isPokemonInParty,
  setTrainerActivePokemonUuids
} from "./trainer-party-service.mjs";

import {
  removePokemonPeriodicEffectsOnSwitch
} from "./periodic-engine.mjs";

import {
  assertTrainerCanControlPokemon
} from "./trainer-control-service.mjs";

const DEFAULT_MAX_ACTIVE_POKEMON =
  2;


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


function assertTrainerPokemon(
  trainer,
  pokemon
) {

  assertTrainer(
    trainer
  );

  assertPokemon(
    pokemon
  );


  if (
    getPokemonTrainerUuid(
      pokemon
    ) !==
      trainer.uuid
  ) {

    throw new Error(
      `${pokemon.name} no pertenece a ${trainer.name}.`
    );
  }


  if (
    !isPokemonInParty(
      trainer,
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon.name} no forma parte de la Party de ${trainer.name}.`
    );
  }
}


function normalizeMaxActive(
  value
) {

  const numeric =
    Number(
      value
    );


  if (
    !Number.isInteger(
      numeric
    ) ||
    numeric < 1 ||
    numeric >
      DEFAULT_MAX_ACTIVE_POKEMON
  ) {

    throw new Error(
      "maxActive debe ser 1 o 2."
    );
  }


  return numeric;
}


/* ============================================================
 * EVENT
 * ============================================================ */

function emitSwitchEvent({
  trainer,
  outgoing,
  incoming,
  reason
}) {

  Hooks.callAll(
    "poke5ePokemonSwitched",
    {
      trainer,
      outgoing,
      incoming,
      reason
    }
  );
}


/* ============================================================
 * DEPLOY
 * ============================================================ */

export async function deployPokemon(
  trainer,
  pokemon,
  {
    maxActive =
      DEFAULT_MAX_ACTIVE_POKEMON
  } = {}
) {

  assertTrainerPokemon(
    trainer,
    pokemon
  );

  assertTrainerCanControlPokemon(
    trainer,
    pokemon
  );

  if (
    isPokemonActive(
      trainer,
      pokemon
    )
  ) {

    return getTrainerPartyState(
      trainer
    );
  }


  const limit =
    normalizeMaxActive(
      maxActive
    );


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    state.activePokemonUuids.length >=
    limit
  ) {

    throw new Error(
      `${trainer.name} ya tiene el máximo de Pokémon activos (${limit}).`
    );
  }


  const nextState =
    await setTrainerActivePokemonUuids(
      trainer,
      [
        ...state.activePokemonUuids,
        pokemon.uuid
      ]
    );


  emitSwitchEvent({
    trainer,

    outgoing:
      null,

    incoming:
      pokemon,

    reason:
      "deploy"
  });


  return nextState;
}


/* ============================================================
 * RECALL
 * ============================================================ */

export async function recallPokemon(
  trainer,
  pokemon
) {

  assertTrainerPokemon(
    trainer,
    pokemon
  );

  assertCanLeaveField(pokemon);


  const state =
    getTrainerPartyState(
      trainer
    );


  if (
    !state.activePokemonUuids.includes(
      pokemon.uuid
    )
  ) {

    return state;
  }


  await removePokemonPeriodicEffectsOnSwitch(
    pokemon
  );


  const nextState =
    await setTrainerActivePokemonUuids(
      trainer,
      state.activePokemonUuids.filter(
        uuid =>
          uuid !==
          pokemon.uuid
      )
    );


  emitSwitchEvent({
    trainer,

    outgoing:
      pokemon,

    incoming:
      null,

    reason:
      "recall"
  });


  return nextState;
}


/* ============================================================
 * SWITCH
 * ============================================================ */

export async function switchPokemon(
  trainer,
  outgoing,
  incoming
) {

  assertTrainerPokemon(
    trainer,
    outgoing
  );

  assertCanLeaveField(outgoing);

  assertTrainerPokemon(
    trainer,
    incoming
  );


  if (
    outgoing.uuid ===
    incoming.uuid
  ) {

    return getTrainerPartyState(
      trainer
    );
  }

  assertTrainerCanControlPokemon(
    trainer,
    incoming
  );

  const state =
    getTrainerPartyState(
      trainer
    );


  const outgoingIndex =
    state.activePokemonUuids.indexOf(
      outgoing.uuid
    );


  if (
    outgoingIndex ===
    -1
  ) {

    throw new Error(
      `${outgoing.name} no está activo.`
    );
  }


  if (
    state.activePokemonUuids.includes(
      incoming.uuid
    )
  ) {

    throw new Error(
      `${incoming.name} ya está activo.`
    );
  }


  await removePokemonPeriodicEffectsOnSwitch(
    outgoing
  );


  const activePokemonUuids =
    [
      ...state.activePokemonUuids
    ];


  activePokemonUuids[
    outgoingIndex
  ] =
    incoming.uuid;


  const nextState =
    await setTrainerActivePokemonUuids(
      trainer,
      activePokemonUuids
    );


  emitSwitchEvent({
    trainer,
    outgoing,
    incoming,

    reason:
      "switch"
  });


  return nextState;
}