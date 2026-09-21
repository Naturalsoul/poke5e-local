import {
  getShinyRule,
  isShinyRollSuccess
} from "./shiny-rules.mjs";

import {
  resolvePokemonTokenSource
} from "./pokemon-token-media-service.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * VALIDATION
 * ============================================================ */

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


/* ============================================================
 * STATE
 * ============================================================ */

function normalizeRoll(
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


  return Number.isFinite(
    numeric
  )
    ? numeric
    : null;
}


function normalizeState(
  value
) {

  if (
    !value ||
    typeof value !==
      "object" ||
    typeof value.isShiny !==
      "boolean"
  ) {

    return null;
  }


  const rule =
    getShinyRule(
      value.ruleId
    );


  if (!rule) {

    return null;
  }


  return Object.freeze({
    isShiny:
      value.isShiny,

    ruleId:
      rule.id,

    roll:
      normalizeRoll(
        value.roll
      ),

    rule
  });
}


export function getPokemonShinyState(
  actor
) {

  if (
    actor?.documentName !==
      "Actor"
  ) {

    return null;
  }


  return normalizeState(
    actor.getFlag?.(
      MODULE_ID,
      "shiny"
    )
  );
}


/* ============================================================
 * MEDIA
 * ============================================================ */

function pokemonMedia(
  actor
) {

  const media =
    actor?.getFlag?.(
      MODULE_ID,
      "media"
    );


  return (
    media &&
    typeof media ===
      "object"
  )
    ? media
    : {};
}


async function desiredArtwork(
  actor,
  state
) {

  const media =
    pokemonMedia(
      actor
    );


  const normalPortrait =
    media.portrait ??
    actor.img ??
    null;


  const normalToken =
    media.token ??
    actor.prototypeToken
      ?.texture
      ?.src ??
    normalPortrait;


  if (
    !state?.isShiny
  ) {

    return {
      portrait:
        normalPortrait,

      token:
        await resolvePokemonTokenSource(
          actor,
          normalToken,
          {
            variant:
              "normal"
          }
        )
    };
  }


  const shinyPortrait =
    media.portraitShiny ??
    normalPortrait;


  const shinyToken =
    media.tokenShiny ??
    media.portraitShiny ??
    normalToken;


  return {
    portrait:
      shinyPortrait,

    token:
      await resolvePokemonTokenSource(
        actor,
        shinyToken,
        {
          variant:
            "shiny"
        }
      )
  };
}


function tokenDocumentsForActor(
  actor,
  tokenDocument
) {

  const documents =
    new Map();


  const addTokenDocument =
    document => {

      if (
        document?.documentName !==
          "Token"
      ) {

        return;
      }


      const key =
        document.uuid ??
        document.id;


      if (key) {

        documents.set(
          key,
          document
        );
      }
    };


  /*
   * Token proporcionado explícitamente.
   *
   * Es el caso normal para Pokémon salvajes
   * con Actor sintético.
   */

  addTokenDocument(
    tokenDocument
  );


  /*
   * Actor sintético:
   * actor.token identifica exactamente
   * su Token propietario.
   */

  if (
    actor?.isToken
  ) {

    addTokenDocument(
      actor.token
    );


    return [
      ...documents.values()
    ];
  }


  /*
   * Actor world:
   *
   * buscamos sus Tokens desplegados en la
   * escena activa. Esto permite que cambiar
   * Shiny desde la hoja de un Pokémon Trainer
   * actualice inmediatamente su Token.
   */

  for (
    const token
    of canvas.tokens
      ?.placeables ??
      []
  ) {

    if (
      token.actor?.uuid !==
        actor?.uuid
    ) {

      continue;
    }


    addTokenDocument(
      token.document
    );
  }


  return [
    ...documents.values()
  ];
}


/* ============================================================
 * ARTWORK SYNC
 * ============================================================ */

export async function synchronizePokemonShinyArtwork(
  actor,
  {
    tokenDocument = null
  } = {}
) {

  assertPokemonActor(
    actor
  );


  const state =
  getPokemonShinyState(
    actor
  );


const artwork =
  await desiredArtwork(
    actor,
    state
  );


  const tokenDocuments =
    tokenDocumentsForActor(
      actor,
      tokenDocument
    );


  const actorUpdate =
    {};


  if (
    artwork.portrait &&
    actor.img !==
      artwork.portrait
  ) {

    actorUpdate.img =
      artwork.portrait;
  }


  /*
   * Pokémon perteneciente a Trainer:
   *
   * actualizamos su Prototype Token para que
   * futuros Deploys utilicen el artwork correcto.
   */

  if (
    !actor.isToken &&
    artwork.token &&
    actor.prototypeToken
      ?.texture
      ?.src !==
        artwork.token
  ) {

    actorUpdate[
      "prototypeToken.texture.src"
    ] =
      artwork.token;
  }


  if (
    Object.keys(
      actorUpdate
    ).length
  ) {

    await actor.update(
      actorUpdate
    );
  }


  /*
   * También actualizamos cualquier Token
   * actualmente desplegado.
   */

  let tokensUpdated =
    0;


  if (
    artwork.token
  ) {

    for (
      const document
      of tokenDocuments
    ) {

      if (
        document.texture
          ?.src ===
            artwork.token
      ) {

        continue;
      }


      await document.update({
        "texture.src":
          artwork.token
      });


      tokensUpdated +=
        1;
    }
  }

  const actorUpdated =
    Object.keys(
      actorUpdate
    ).length >
      0;


  return {
    updated:
      Boolean(
        actorUpdated ||
        tokensUpdated
      ),

    actorUpdated,
    tokensUpdated,
    state
  };
}

export async function synchronizeAllPokemonShinyArtwork({
  notify = false
} = {}) {

  if (
    !game.user.isGM
  ) {

    return {
      actorsUpdated: 0,
      tokensUpdated: 0,
      failed: 0
    };
  }


  let actorsUpdated =
    0;

  let tokensUpdated =
    0;

  let failed =
    0;


  /*
   * Primero actualizamos todos los Actors world.
   *
   * Esto garantiza que sus Prototype Tokens queden
   * preparados correctamente para futuros Deploys.
   */

  const pokemonActors =
    game.actors.filter(
      actor =>
        actor?.getFlag?.(
          MODULE_ID,
          "kind"
        ) ===
          "pokemon"
    );


  for (
    const actor
    of pokemonActors
  ) {

    try {

      const result =
        await synchronizePokemonShinyArtwork(
          actor
        );


      if (
        result.actorUpdated
      ) {

        actorsUpdated +=
          1;
      }


      tokensUpdated +=
        result.tokensUpdated ??
        0;

    } catch (error) {

      failed +=
        1;


      console.error(
        `[${MODULE_ID}] No se pudo sincronizar media de ${actor.name}.`,
        error
      );
    }
  }


  /*
   * Después recorremos todas las Scenes.
   *
   * Esto cubre también:
   * - Tokens de Scenes inactivas;
   * - Pokémon salvajes con Synthetic Actor;
   * - encuentros ya preparados.
   */

  for (
    const scene
    of game.scenes
  ) {

    for (
      const tokenDocument
      of scene.tokens
    ) {

      const actor =
        tokenDocument.actor ??
        null;


      if (
        actor?.getFlag?.(
          MODULE_ID,
          "kind"
        ) !==
          "pokemon"
      ) {

        continue;
      }


      try {

        const result =
          await synchronizePokemonShinyArtwork(
            actor,
            {
              tokenDocument
            }
          );


        tokensUpdated +=
          result.tokensUpdated ??
          0;

      } catch (error) {

        failed +=
          1;


        console.error(
          `[${MODULE_ID}] No se pudo sincronizar Token ${tokenDocument.name}.`,
          error
        );
      }
    }
  }


  if (
    notify
  ) {

    const message =
      `Poke5e sprites: ` +
      `${actorsUpdated} Actor(es) · ` +
      `${tokensUpdated} Token(s)` +
      (
        failed
          ? ` · ${failed} error(es)`
          : ""
      );


    if (
      failed
    ) {

      ui.notifications.warn(
        message
      );

    } else {

      ui.notifications.info(
        message
      );
    }
  }


  return {
    actorsUpdated,
    tokensUpdated,
    failed
  };
}

/* ============================================================
 * ASSIGN
 * ============================================================ */

export async function assignPokemonShinyState(
  actor,
  isShiny,
  {
    ruleId,
    roll = null,
    tokenDocument = null
  } = {}
) {

  assertPokemonActor(
    actor
  );


  const rule =
    getShinyRule(
      ruleId
    );


  if (!rule) {

    throw new RangeError(
      `Regla Shiny desconocida: ${String(ruleId)}.`
    );
  }


  /*
   * Guardamos explícitamente true O false.
   *
   * false significa:
   * "ya se resolvió y no es Shiny".
   *
   * La ausencia del flag significa:
   * "todavía no se ha determinado".
   */

  await actor.setFlag(
    MODULE_ID,
    "shiny",
    {
      isShiny:
        Boolean(
          isShiny
        ),

      ruleId:
        rule.id,

      roll:
        normalizeRoll(
          roll
        )
    }
  );


  await synchronizePokemonShinyArtwork(
    actor,
    {
      tokenDocument
    }
  );


  return getPokemonShinyState(
    actor
  );
}


/* ============================================================
 * ROLL
 * ============================================================ */

export async function rollPokemonShiny(
  actor,
  {
    ruleId,
    tokenDocument = null
  } = {}
) {

  assertPokemonActor(
    actor
  );


  const rule =
    getShinyRule(
      ruleId
    );


  if (!rule) {

    throw new RangeError(
      `Regla Shiny desconocida: ${String(ruleId)}.`
    );
  }


  const roll =
    Roll.create(
      rule.formula
    );


  await roll.evaluate();


  const total =
    Number(
      roll.total
    );


  if (
    !Number.isFinite(
      total
    )
  ) {

    throw new Error(
      "No se pudo resolver la tirada Shiny."
    );
  }


  const isShiny =
    isShinyRollSuccess(
      rule,
      total
    );


  const state =
    await assignPokemonShinyState(
      actor,
      isShiny,
      {
        ruleId:
          rule.id,

        roll:
          total,

        tokenDocument
      }
    );


  return {
    state,

    roll,
    total,
    isShiny
  };
}