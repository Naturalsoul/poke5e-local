import {
  getTrainerLevel
} from "./trainer-service.mjs";

import {
  getTrainerProgressionState
} from "./trainer-progression-service.mjs";

import {
  getTrainerLevelRule
} from "./trainer-rules.mjs";


const MODULE_ID =
  "poke5e-local";


function parseSpeciesRating(
  value
) {

  if (
    typeof value ===
    "number"
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }


  const text =
    String(
      value ??
      ""
    ).trim();


  const fraction =
    text.match(
      /^(\d+)\s*\/\s*(\d+)$/
    );


  if (fraction) {

    const denominator =
      Number(
        fraction[2]
      );


    if (
      denominator === 0
    ) {

      return null;
    }


    return (
      Number(
        fraction[1]
      ) /
      denominator
    );
  }


  const numeric =
    Number(
      text
    );


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}


export function getTrainerMaxSr(
  trainer
) {

  const level =
    getTrainerLevel(
      trainer
    ) ??
    1;


  const base =
    getTrainerLevelRule(
      level
    ).maxSr;


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const pathId =
    progression
      ?.path
      ?.id;


  return (
    base +
    (
      pathId ===
      "guru"
        ? 1
        : 0
    )
  );
}


export function getPokemonSpeciesRating(
  pokemon
) {

  return parseSpeciesRating(
    pokemon?.getFlag?.(
      MODULE_ID,
      "sr"
    )
  );
}


export function canTrainerControlPokemon(
  trainer,
  pokemon
) {

  const sr =
    getPokemonSpeciesRating(
      pokemon
    );


  if (sr == null) {

    return true;
  }


  return (
    sr <=
    getTrainerMaxSr(
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


  const maxSr =
    getTrainerMaxSr(
      trainer
    );

  const sr =
    getPokemonSpeciesRating(
      pokemon
    );


  throw new Error(
    `${pokemon.name} tiene SR ${sr} y ${trainer.name} solo puede controlar Pokémon de SR ${maxSr} o menor.`
  );
}