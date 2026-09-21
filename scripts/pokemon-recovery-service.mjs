import {
  clearPokemonMoveModifiers
} from "./move-modifier-runtime.mjs";

import {
  removePokemonPeriodicEffectsForRecovery
} from "./periodic-engine.mjs";

import {
  withPokemonRecoveryContext
} from "./pokemon-recovery-context.mjs";

import {
  pokemonStatus
} from "./status-runtime.mjs";

import {
  clearEndOfNextTurnEffects
} from "./turn-duration-runtime.mjs";


const MODULE_ID =
  "poke5e-local";


const RECOVERABLE_EFFECT_KINDS =
  new Set([
    "pokemon-status",
    "pokemon-modifier",
    "pokemon-periodic",
    "paralysis-turn-lock",
    "confusion-turn-lock"
  ]);


const RECOVERABLE_NATIVE_STATUS_IDS =
  new Set([
    "unconscious"
  ]);


/* ============================================================
 * VALIDATION
 * ============================================================ */

function isPokemonActor(
  actor
) {

  return (
    actor?.documentName ===
      "Actor" &&
    actor.getFlag?.(
      MODULE_ID,
      "kind"
    ) === "pokemon"
  );
}


function assertPokemonActor(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new TypeError(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}


/* ============================================================
 * HP
 * ============================================================ */

async function restorePokemonHp(
  pokemon
) {

  const hp =
    pokemon.system
      ?.attributes
      ?.hp;


  const maximum =
    Number(
      hp?.max ??
      0
    );


  if (
    !Number.isFinite(
      maximum
    ) ||
    maximum <= 0
  ) {

    return false;
  }


  const current =
    Number(
      hp?.value ??
      0
    );

  const temporary =
    Number(
      hp?.temp ??
      0
    );


  if (
    current === maximum &&
    temporary === 0
  ) {

    return false;
  }


  await pokemon.update({
    "system.attributes.hp.value":
      maximum,

    "system.attributes.hp.temp":
      0
  });


  return true;
}


/* ============================================================
 * PP
 * ============================================================ */

function movePpUpdate(
  item
) {

  if (
    item?.documentName !==
      "Item" ||
    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !== "move"
  ) {

    return null;
  }


  const maximum =
    Number(
      item.system
        ?.uses
        ?.max ??
      item.getFlag?.(
        MODULE_ID,
        "pp"
      ) ??
      0
    );

  const spent =
    Number(
      item.system
        ?.uses
        ?.spent ??
      0
    );


  if (
    !Number.isFinite(
      maximum
    ) ||
    maximum <= 0 ||
    !Number.isFinite(
      spent
    ) ||
    spent <= 0
  ) {

    return null;
  }


  return {
    _id:
      item.id,

    "system.uses.spent":
      0
  };
}


async function restorePokemonPp(
  pokemon
) {

  const updates =
    pokemon.items
      .map(
        movePpUpdate
      )
      .filter(Boolean);


  if (!updates.length) {

    return 0;
  }


  await pokemon.updateEmbeddedDocuments(
    "Item",
    updates
  );


  return updates.length;
}


/* ============================================================
 * EFFECTS
 * ============================================================ */

function hasRecoverableNativeStatus(
  effect
) {

  const statuses =
    effect?.statuses ??
    new Set();


  return Array.from(
    statuses
  ).some(
    statusId =>
      RECOVERABLE_NATIVE_STATUS_IDS.has(
        String(
          statusId
        )
      )
  );
}


function isRecoverableActiveEffect(
  effect
) {

  if (!effect) {

    return false;
  }


  if (
    pokemonStatus(
      effect
    )
  ) {

    return true;
  }


  if (
    hasRecoverableNativeStatus(
      effect
    )
  ) {

    return true;
  }


  const kind =
    effect.getFlag?.(
      MODULE_ID,
      "kind"
    );


  if (
    RECOVERABLE_EFFECT_KINDS.has(
      kind
    )
  ) {

    return true;
  }


  if (
    effect.getFlag?.(
      MODULE_ID,
      "expireAtEndOfNextTurn"
    ) === true
  ) {

    return true;
  }


  return (
    effect.getFlag?.(
      MODULE_ID,
      "outrage"
    )?.kind ===
      "outrage"
  );
}


async function clearRecoverableActiveEffects(
  pokemon
) {

  const ids =
    pokemon.effects
      .filter(
        isRecoverableActiveEffect
      )
      .map(
        effect =>
          effect.id
      )
      .filter(Boolean);


  if (!ids.length) {

    return 0;
  }


  await pokemon.deleteEmbeddedDocuments(
    "ActiveEffect",
    ids
  );


  return ids.length;
}


/* ============================================================
 * FLAGS
 * ============================================================ */

async function clearStatusGrace(
  pokemon
) {

  const grace =
    pokemon.getFlag?.(
      MODULE_ID,
      "statusGrace"
    );


  if (!grace) {

    return false;
  }


  await pokemon.unsetFlag(
    MODULE_ID,
    "statusGrace"
  );


  return true;
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export async function recoverPokemonAtCenter(
  pokemon
) {

  assertPokemonActor(
    pokemon
  );


  return withPokemonRecoveryContext(
    pokemon,
    async () => {

      const periodicEffects =
        await removePokemonPeriodicEffectsForRecovery(
          pokemon
        );


      const pendingMoveModifiers =
        await clearPokemonMoveModifiers(
          pokemon
        );


      await clearEndOfNextTurnEffects(
        pokemon
      );


      const activeEffects =
        await clearRecoverableActiveEffects(
          pokemon
        );


      const graceCleared =
        await clearStatusGrace(
          pokemon
        );


      const hpRestored =
        await restorePokemonHp(
          pokemon
        );


      const ppRestored =
        await restorePokemonPp(
          pokemon
        );


      return {
        pokemonUuid:
          pokemon.uuid,

        hpRestored,
        ppRestored,
        activeEffects,
        periodicEffects,

        pendingMoveModifiers:
          pendingMoveModifiers.length,

        graceCleared
      };
    }
  );
}