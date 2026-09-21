import {
  deployPokemon,
  recallPokemon,
  switchPokemon
} from "./trainer-switch-service.mjs";

import {
  deletePokemonTokens,
  deployPokemonToken,
  recallPokemonTokens,
  transferPokemonTokenCombatants
} from "./trainer-token-service.mjs";


/* ============================================================
 * DEPLOY
 * ============================================================ */

export async function deployTrainerPokemon(
  trainer,
  pokemon,
  {
    maxActive,
    position,
    scene = canvas.scene
  } = {}
) {

  const tokenResult =
    await deployPokemonToken(
      pokemon,
      {
        position,
        scene
      }
    );


  try {

    const state =
      await deployPokemon(
        trainer,
        pokemon,
        {
          maxActive
        }
      );


    return {
      state,

      token:
        tokenResult.token
    };

  } catch (error) {

    /*
     * Rollback únicamente si ESTE flujo
     * creó el Token.
     *
     * Nunca eliminamos un Token que ya
     * existía antes.
     */

    if (
      tokenResult.created
    ) {

      await recallPokemonTokens(
        pokemon,
        {
          scene
        }
      );
    }


    throw error;
  }
}


/* ============================================================
 * RECALL
 * ============================================================ */

export async function recallTrainerPokemon(
  trainer,
  pokemon,
  {
    scene = canvas.scene
  } = {}
) {

  /*
   * Primero ejecutamos el contrato Trainer:
   *
   * - removeOnSwitch
   * - activePokemonUuids
   * - evento de Recall
   */

  const state =
    await recallPokemon(
      trainer,
      pokemon
    );


  /*
   * Después eliminamos su representación
   * física.
   */

  await recallPokemonTokens(
    pokemon,
    {
      scene
    }
  );


  return state;
}


/* ============================================================
 * SWITCH
 * ============================================================ */

export async function switchTrainerPokemon(
  trainer,
  outgoing,
  incoming,
  {
    position,
    scene = canvas.scene
  } = {}
) {

  /*
   * Primero desplegamos físicamente
   * al Pokémon entrante.
   */

  const incomingToken =
    await deployPokemonToken(
      incoming,
      {
        position,
        scene
      }
    );


  let state;


  try {

    /*
     * Ejecutamos las reglas Trainer:
     *
     * - removeOnSwitch
     * - activePokemonUuids
     * - hook poke5ePokemonSwitched
     */

    state =
      await switchPokemon(
        trainer,
        outgoing,
        incoming
      );

  } catch (error) {

    /*
     * Si el Switch lógico no ocurrió,
     * retiramos únicamente el Token que
     * este flujo haya creado.
     */

    if (
      incomingToken.created
    ) {

      await recallPokemonTokens(
        incoming,
        {
          scene
        }
      );
    }


    throw error;
  }


  /*
   * El Switch lógico fue exitoso.
   *
   * Si el Pokémon saliente participaba
   * en un Combat, trasladamos ese mismo
   * Combatant al entrante.
   *
   * No se vuelve a tirar iniciativa.
   */

  await transferPokemonTokenCombatants(
    outgoing,
    incoming,
    incomingToken.token,
    {
      scene
    }
  );


  /*
   * El Combatant ya representa al
   * Pokémon entrante.
   *
   * Ahora podemos eliminar físicamente
   * el Token saliente SIN borrar el
   * Combatant.
   */

  await deletePokemonTokens(
    outgoing,
    {
      scene,

      removeCombatants:
        false
    }
  );


  return {
    state,

    token:
      incomingToken.token
  };
}