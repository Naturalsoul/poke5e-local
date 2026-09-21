/* ============================================================
 * SCENE
 * ============================================================ */

function resolveScene(
  scene
) {

  const resolved =
    scene ??
    canvas.scene;


  if (
    !canvas.ready ||
    !resolved
  ) {

    throw new Error(
      "No hay una Scene activa disponible."
    );
  }


  return resolved;
}


function assertActor(
  actor
) {

  if (
    actor?.documentName !==
    "Actor"
  ) {

    throw new Error(
      "Se requiere un Actor válido para gestionar Tokens."
    );
  }
}


function assertToken(
  token
) {

  if (
    token?.documentName !==
    "Token"
  ) {

    throw new Error(
      "Se requiere un Token válido."
    );
  }
}


/* ============================================================
 * TOKEN QUERY
 * ============================================================ */

export function findPokemonTokenDocuments(
  pokemon,
  scene = canvas.scene
) {

  assertActor(
    pokemon
  );


  if (!scene) {

    return [];
  }


  const tokens =
    scene.getEmbeddedCollection(
      "Token"
    );


  return [
    ...tokens
  ].filter(
    token =>
      token.actorId ===
        pokemon.id
      &&
      token.actorLink ===
        true
  );
}


/* ============================================================
 * POSITION
 * ============================================================ */

function normalizePosition(
  position
) {

  const x =
    Number(
      position?.x
    );

  const y =
    Number(
      position?.y
    );


  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {

    throw new Error(
      "La posición de despliegue no es válida."
    );
  }


  return {
    x,
    y
  };
}


/* ============================================================
 * DEPLOY TOKEN
 * ============================================================ */

export async function deployPokemonToken(
  pokemon,
  {
    position,
    scene = canvas.scene
  } = {}
) {

  assertActor(
    pokemon
  );


  const targetScene =
    resolveScene(
      scene
    );


  /*
   * Si el Pokémon ya tiene Token en esta
   * Scene lo reutilizamos.
   */

  const existing =
    findPokemonTokenDocuments(
      pokemon,
      targetScene
    );


  if (
    existing.length
  ) {

    return {
      token:
        existing[0],

      created:
        false
    };
  }


  const {
    x,
    y
  } =
    normalizePosition(
      position
    );


  const tokenDocument =
    await pokemon.getTokenDocument(
      {
        x,
        y
      },
      {
        parent:
          targetScene
      }
    );


  const tokenSource =
    tokenDocument.toObject();


  /*
  * Los Tokens desplegados por un Trainer
  * representan Pokémon aliados.
  *
  * No dependemos únicamente del Prototype Token:
  * este servicio garantiza explícitamente el
  * contrato de un Pokémon desplegado por Trainer.
  */

  tokenSource.actorLink =
    true;

  tokenSource.disposition =
    CONST.TOKEN_DISPOSITIONS
      .FRIENDLY;


  /*
  * Dejamos que Foundry genere el nuevo ID.
  */

  delete tokenSource._id;


  const created =
    await targetScene
      .createEmbeddedDocuments(
        "Token",
        [
          tokenSource
        ]
      );


  const token =
    created[0] ??
    null;


  if (!token) {

    throw new Error(
      `No se pudo desplegar el Token de ${pokemon.name}.`
    );
  }


  return {
    token,
    created:
      true
  };
}


/* ============================================================
 * COMBATANT QUERY
 * ============================================================ */

function combatantsByTokens(
  tokens
) {

  const result =
    new Map();


  for (
    const combat
    of game.combats
  ) {

    const byId =
      new Map();


    for (
      const token
      of tokens
    ) {

      const combatants =
        combat.getCombatantsByToken(
          token
        );


      for (
        const combatant
        of combatants
      ) {

        if (
          combatant?.id
        ) {

          byId.set(
            combatant.id,
            combatant
          );
        }
      }
    }


    if (
      byId.size
    ) {

      result.set(
        combat,
        [
          ...byId.values()
        ]
      );
    }
  }


  return result;
}


/* ============================================================
 * REMOVE COMBATANTS
 * ============================================================ */

async function removeTokenCombatants(
  tokens
) {

  const grouped =
    combatantsByTokens(
      tokens
    );


  for (
    const [
      combat,
      combatants
    ]
    of grouped
  ) {

    const combatantIds =
      combatants
        .map(
          combatant =>
            combatant.id
        )
        .filter(Boolean);


    if (
      !combatantIds.length
    ) {

      continue;
    }


    await combat.deleteEmbeddedDocuments(
      "Combatant",
      combatantIds
    );
  }
}


/* ============================================================
 * TRANSFER COMBATANTS
 *
 * Mantiene:
 * - Combatant ID
 * - initiative
 * - posición dentro del encuentro
 *
 * Cambia:
 * - Actor representado
 * - Token representado
 * ============================================================ */

export async function transferPokemonTokenCombatants(
  outgoingPokemon,
  incomingPokemon,
  incomingToken,
  {
    scene = canvas.scene
  } = {}
) {

  assertActor(
    outgoingPokemon
  );

  assertActor(
    incomingPokemon
  );

  assertToken(
    incomingToken
  );


  const targetScene =
    resolveScene(
      scene
    );


  const outgoingTokens =
    findPokemonTokenDocuments(
      outgoingPokemon,
      targetScene
    );


  if (
    !outgoingTokens.length
  ) {

    return 0;
  }


  const grouped =
    combatantsByTokens(
      outgoingTokens
    );


  let transferred = 0;


  for (
    const [
      combat,
      combatants
    ]
    of grouped
  ) {

    const updates =
      combatants.map(
        combatant => ({

          _id:
            combatant.id,

          actorId:
            incomingPokemon.id,

          tokenId:
            incomingToken.id,

          sceneId:
            targetScene.id,

          name:
            incomingToken.name ??
            incomingPokemon.name,

          img:
            incomingToken.texture
              ?.src ??
            incomingPokemon.img,

          /*
           * Importante para futuros
           * reemplazos por Faint.
           *
           * El Pokémon entrante no debe
           * heredar el estado defeated.
           */

          defeated:
            false
        })
      );


    await combat.updateEmbeddedDocuments(
      "Combatant",
      updates
    );


    transferred +=
      updates.length;
  }


  return transferred;
}

/* ============================================================
 * DELETE SINGLE TOKEN
 * ============================================================ */

export async function deletePokemonTokenDocument(
  token,
  {
    scene = null,
    removeCombatants = true
  } = {}
) {

  assertToken(
    token
  );


  const targetScene =
    resolveScene(
      scene ??
      token.parent ??
      canvas.scene
    );


  if (
    token.parent?.id &&
    token.parent.id !==
      targetScene.id
  ) {

    throw new Error(
      "El Token no pertenece a la Scene indicada."
    );
  }


  if (
    removeCombatants
  ) {

    await removeTokenCombatants([
      token
    ]);
  }


  return targetScene
    .deleteEmbeddedDocuments(
      "Token",
      [
        token.id
      ]
    );
}

/* ============================================================
 * DELETE TOKENS
 * ============================================================ */

export async function deletePokemonTokens(
  pokemon,
  {
    scene = canvas.scene,
    removeCombatants = true
  } = {}
) {

  assertActor(
    pokemon
  );


  const targetScene =
    resolveScene(
      scene
    );


  const tokens =
    findPokemonTokenDocuments(
      pokemon,
      targetScene
    );


  if (
    !tokens.length
  ) {

    return [];
  }


  if (
    removeCombatants
  ) {

    await removeTokenCombatants(
      tokens
    );
  }


  const tokenIds =
    tokens
      .map(
        token =>
          token.id
      )
      .filter(Boolean);


  return targetScene
    .deleteEmbeddedDocuments(
      "Token",
      tokenIds
    );
}


/* ============================================================
 * RECALL TOKEN
 * ============================================================ */

export async function recallPokemonTokens(
  pokemon,
  {
    scene = canvas.scene
  } = {}
) {

  return deletePokemonTokens(
    pokemon,
    {
      scene,

      removeCombatants:
        true
    }
  );
}