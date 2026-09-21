import {
  deterministicPokemonGender,
  normalizePokemonGenderId,
  parsePokemonGenderRatio,
  pokemonGenderFromRoll,
  pokemonGenderRollFormula
} from "./gender-rules.mjs";


const MODULE_ID =
  "poke5e-local";


function assertPokemonActor(
  actor
) {

  if (
    actor?.documentName !==
      "Actor" ||
    actor.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "pokemon"
  ) {

    throw new TypeError(
      `${actor?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}


export function getPokemonGenderRatio(
  actor
) {

  if (
    actor?.documentName !==
      "Actor"
  ) {

    return null;
  }


  return parsePokemonGenderRatio(
    actor.getFlag?.(
      MODULE_ID,
      "genderRatio"
    )
  );
}


function normalizeGenderRoll(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isInteger(
    numeric
  ) &&
    numeric >= 1
    ? numeric
    : null;
}


export function getPokemonGender(
  actor
) {

  if (
    actor?.documentName !==
      "Actor"
  ) {

    return null;
  }


  const stored =
    actor.getFlag?.(
      MODULE_ID,
      "gender"
    );


  const id =
    normalizePokemonGenderId(
      stored?.id
    );


  if (!id) {

    return null;
  }


  return Object.freeze({
    id,

    roll:
      normalizeGenderRoll(
        stored?.roll
      ),

    ratio:
      getPokemonGenderRatio(
        actor
      )
  });
}


export function canCurrentUserModifyPokemonGender(
  actor
) {

  if (
    !game.user.isGM ||
    actor?.documentName !==
      "Actor" ||
    actor.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "pokemon"
  ) {

    return false;
  }


  /*
   * Actor world sin Trainer:
   * plantilla de especie.
   *
   * No permitimos fijar su género porque todos sus
   * futuros Tokens salvajes lo heredarían.
   */

  return Boolean(
    actor.isToken ||
    actor.getFlag?.(
      MODULE_ID,
      "trainerOwnerUuid"
    )
  );
}


export async function assignPokemonGender(
  actor,
  genderId,
  {
    roll = null
  } = {}
) {

  assertPokemonActor(
    actor
  );


  const id =
    normalizePokemonGenderId(
      genderId
    );


  if (!id) {

    throw new RangeError(
      `Género Pokémon desconocido: ${String(genderId)}.`
    );
  }


  await actor.setFlag(
    MODULE_ID,
    "gender",
    {
      id,

      roll:
        normalizeGenderRoll(
          roll
        )
    }
  );


  return getPokemonGender(
    actor
  );
}


export async function replacePokemonGender(
  actor,
  genderId
) {

  if (
    !canCurrentUserModifyPokemonGender(
      actor
    )
  ) {

    throw new Error(
      "Solo el GM puede modificar el género de un Pokémon individual."
    );
  }


  return assignPokemonGender(
    actor,
    genderId,
    {
      roll:
        null
    }
  );
}


export async function rollPokemonGender(
  actor
) {

  assertPokemonActor(
    actor
  );


  const ratio =
    getPokemonGenderRatio(
      actor
    );


  if (!ratio) {

    throw new Error(
      `${actor.name} no posee un genderRatio válido.`
    );
  }


  const deterministic =
    deterministicPokemonGender(
      ratio.id
    );


  /*
   * Solo macho, solo hembra o sin género:
   * no necesitamos realizar una tirada.
   */

  if (deterministic) {

    const state =
      await assignPokemonGender(
        actor,
        deterministic,
        {
          roll:
            null
        }
      );


    return {
      state,
      ratio,
      roll:
        null,
      total:
        null,
      genderId:
        deterministic
    };
  }


  const formula =
    pokemonGenderRollFormula(
      ratio.id
    );


  if (!formula) {

    throw new Error(
      `${actor.name} no posee una fórmula de género resoluble.`
    );
  }


  const roll =
    Roll.create(
      formula
    );


  await roll.evaluate();


  const total =
    Number(
      roll.total
    );


  const genderId =
    pokemonGenderFromRoll(
      ratio.id,
      total
    );


  const state =
    await assignPokemonGender(
      actor,
      genderId,
      {
        roll:
          total
      }
    );


  return {
    state,
    ratio,
    roll,
    total,
    genderId
  };
}