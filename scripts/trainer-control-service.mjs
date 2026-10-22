import {
  getTrainerLevel
} from "./trainer-service.mjs";

import {
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";

import {
  getTrainerProgressionLimits
} from "./trainer-rules.mjs";


const MODULE_ID =
  "poke5e-local";


/*
 * Table rule: a trainer controls Pokémon up to their own level
 * (Guru: one more). SR only counts for XP and capture.
 */
export function getTrainerControlLevel(
  trainer
) {

  const level =
    getTrainerLevel(
      trainer
    ) ??
    1;


  const progression =
    getTrainerProgressionState(
      trainer
    );


  return (
    level +
    getTrainerProgressionLimits({
      level,
      pathId:
        progression
          ?.path
          ?.id
    }).controlLevelBonus
  );
}


function getPokemonLevel(
  pokemon
) {

  const level =
    Number(
      pokemon?.getFlag?.(
        MODULE_ID,
        "level"
      )
    );


  return Number.isFinite(
    level
  )
    ? level
    : null;
}


export function canTrainerControlPokemon(
  trainer,
  pokemon
) {

  const level =
    getPokemonLevel(
      pokemon
    );


  if (level == null) {

    return true;
  }


  return (
    level <=
    getTrainerControlLevel(
      trainer
    )
  );
}


export function assertTrainerCanControlPokemon(
  trainer,
  pokemon
) {

  if (
    canTrainerControlPokemon(
      trainer,
      pokemon
    )
  ) {

    return;
  }


  throw new Error(
    `${pokemon.name} es de Nv. ${getPokemonLevel(pokemon)} y ${trainer.name} solo puede controlar Pokémon hasta Nv. ${getTrainerControlLevel(trainer)}.`
  );
}
