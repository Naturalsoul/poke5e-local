import {
  refreshPokemonMoves
} from "./pokemon-move-refresh-service.mjs";

import {
  POKEMON_TYPE_IDS,
  calculatePokemonDefenses
} from "./types.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";


const MODULE_ID =
  "poke5e-local";

const VALID_TYPES =
  new Set(
    POKEMON_TYPE_IDS
  );


/* ============================================================
 * VALIDATION
 * ============================================================ */

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


function assertGm() {

  if (
    !game.user.isGM
  ) {

    throw new Error(
      "Solo el GM puede modificar los tipos de un Pokémon."
    );
  }
}


function normalizeRequestedTypes(
  values
) {

  if (
    !Array.isArray(
      values
    )
  ) {

    throw new Error(
      "Los tipos del Pokémon deben entregarse como un array."
    );
  }


  const normalized =
    values
      .map(
        value =>
          String(
            value ??
            ""
          )
            .trim()
            .toLowerCase()
      )
      .filter(Boolean);


  if (
    normalized.length < 1 ||
    normalized.length > 2
  ) {

    throw new Error(
      "Un Pokémon debe tener uno o dos tipos."
    );
  }


  const invalid =
    normalized.find(
      type =>
        !VALID_TYPES.has(
          type
        )
    );


  if (invalid) {

    throw new Error(
      `Tipo Pokémon no válido: ${invalid}.`
    );
  }


  if (
    new Set(
      normalized
    ).size !==
    normalized.length
  ) {

    throw new Error(
      "El tipo primario y secundario deben ser diferentes."
    );
  }


  return normalized;
}


/* ============================================================
 * STATE
 * ============================================================ */

function traitValues(
  trait
) {

  const value =
    trait?.value;


  if (
    value instanceof Set
  ) {

    return [
      ...value
    ];
  }


  return Array.isArray(
    value
  )
    ? [
        ...value
      ]
    : [];
}


function sameTypes(
  left,
  right
) {

  return (
    left.length ===
      right.length &&
    left.every(
      (
        type,
        index
      ) =>
        type ===
        right[
          index
        ]
    )
  );
}


export function getPokemonTypes(
  pokemon
) {

  assertPokemon(
    pokemon
  );


  const stored =
    pokemon.getFlag(
      MODULE_ID,
      "types"
    );


  const primary =
    String(
      pokemon.getFlag(
        MODULE_ID,
        "primaryType"
      ) ??
      ""
    )
      .trim()
      .toLowerCase();


  const candidates =
    Array.isArray(
      stored
    )
      ? stored
      : primary
        ? [
            primary
          ]
        : [];


  return [
    ...new Set(
      candidates
        .map(
          value =>
            String(
              value ??
              ""
            )
              .trim()
              .toLowerCase()
        )
        .filter(
          type =>
            VALID_TYPES.has(
              type
            )
        )
    )
  ].slice(
    0,
    2
  );
}


export function canCurrentUserModifyPokemonTypes(
  pokemon
) {

  return (
    game.user.isGM &&
    isPokemonActor(
      pokemon
    )
  );
}


/* ============================================================
 * SNAPSHOT
 * ============================================================ */

function snapshotPokemonTypeState(
  pokemon
) {

  const types =
    getPokemonTypes(
      pokemon
    );


  const defenses =
    calculatePokemonDefenses(
      types
    );


  return {
    types,

    primaryType:
      types[0],

    defenses:
      foundry.utils.deepClone(
        pokemon.getFlag(
          MODULE_ID,
          "defenses"
        ) ??
        defenses.multipliers
      ),

    immunities:
      traitValues(
        pokemon.system
          ?.traits
          ?.di
      ),

    resistances:
      traitValues(
        pokemon.system
          ?.traits
          ?.dr
      ),

    vulnerabilities:
      traitValues(
        pokemon.system
          ?.traits
          ?.dv
      )
  };
}


/* ============================================================
 * UPDATE DATA
 * ============================================================ */

function pokemonTypeUpdateData(
  state
) {

  return {
    [`flags.${MODULE_ID}.types`]:
      [
        ...state.types
      ],

    [`flags.${MODULE_ID}.primaryType`]:
      state.primaryType,

    [`flags.${MODULE_ID}.defenses`]:
      foundry.utils.deepClone(
        state.defenses
      ),

    "system.traits.di.value":
      [
        ...state.immunities
      ],

    "system.traits.dr.value":
      [
        ...state.resistances
      ],

    "system.traits.dv.value":
      [
        ...state.vulnerabilities
      ]
  };
}


function buildNextTypeState(
  types
) {

  const defenses =
    calculatePokemonDefenses(
      types
    );


  return {
    types:
      [
        ...types
      ],

    primaryType:
      types[0],

    defenses:
      foundry.utils.deepClone(
        defenses.multipliers
      ),

    immunities:
      [
        ...defenses.immunities
      ],

    resistances:
      [
        ...defenses.resistances
      ],

    vulnerabilities:
      [
        ...defenses.vulnerabilities
      ]
  };
}


/* ============================================================
 * WRITE
 * ============================================================ */

export async function setPokemonTypes(
  pokemon,
  values
) {

  assertPokemon(
    pokemon
  );

  assertGm();


  const previousState =
    snapshotPokemonTypeState(
      pokemon
    );


  const types =
    normalizeRequestedTypes(
      values
    );


  if (
    sameTypes(
      previousState.types,
      types
    )
  ) {

    return {
      types:
        previousState.types,

      primaryType:
        previousState.primaryType,

      defenses:
        previousState.defenses,

      movesRefreshed:
        0
    };
  }


  const nextState =
    buildNextTypeState(
      types
    );


  await pokemon.update(
    pokemonTypeUpdateData(
      nextState
    )
  );


  try {

    /*
     * Recalcula STAB y fórmulas de los Moves
     * usando los nuevos flags.types.
     *
     * El servicio conserva PP, ID y orden.
     */

    const moveRefresh =
      await refreshPokemonMoves(
        pokemon
      );


    return {
      types:
        nextState.types,

      primaryType:
        nextState.primaryType,

      defenses:
        nextState.defenses,

      movesRefreshed:
        moveRefresh.refreshed
    };

  } catch (error) {

    /*
     * Si el refresh de Moves falla,
     * restauramos el estado defensivo anterior.
     */

    await pokemon.update(
      pokemonTypeUpdateData(
        previousState
      )
    );


    throw error;
  }
}