const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * END OF NEXT TURN — FLAGS
 *
 * Contrato temporal reutilizable por cualquier ActiveEffect:
 *
 * creado / refrescado
 * -> nextTurnStarted = false
 * -> al inicio del siguiente turno = true
 * -> al final de ese turno se elimina
 * ============================================================ */

export function endOfNextTurnFlags() {

  return {

    expireAtEndOfNextTurn:
      true,

    nextTurnStarted:
      false
  };
}


/* ============================================================
 * EFFECTS
 * ============================================================ */

function endOfNextTurnEffects(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>

      effect.getFlag?.(
        MODULE_ID,
        "expireAtEndOfNextTurn"
      ) ===
        true
  );
}


/* ============================================================
 * REFRESH
 * ============================================================ */

export async function refreshEndOfNextTurnDuration(
  effect
) {

  if (!effect) {

    return;
  }


  await effect.update({

    [`flags.${MODULE_ID}.nextTurnStarted`]:
      false
  });
}


/* ============================================================
 * START OF NEXT TURN
 * ============================================================ */

export async function markEndOfNextTurnEffectsStarted(
  actor
) {

  const updates =
    endOfNextTurnEffects(
      actor
    )
      .filter(
        effect =>
          effect.getFlag?.(
            MODULE_ID,
            "nextTurnStarted"
          ) !==
            true
      )
      .map(
        effect => ({

          _id:
            effect.id,

          [`flags.${MODULE_ID}.nextTurnStarted`]:
            true
        })
      );


  if (!updates.length) {

    return;
  }


  await actor.updateEmbeddedDocuments(
    "ActiveEffect",
    updates
  );
}


/* ============================================================
 * END OF NEXT TURN
 * ============================================================ */

export async function expireEndOfNextTurnEffects(
  actor
) {

  const ids =
    endOfNextTurnEffects(
      actor
    )
      .filter(
        effect =>
          effect.getFlag?.(
            MODULE_ID,
            "nextTurnStarted"
          ) ===
            true
      )
      .map(
        effect =>
          effect.id
      )
      .filter(Boolean);


  if (!ids.length) {

    return;
  }


  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    ids
  );
}


/* ============================================================
 * COMBAT CLEANUP
 * ============================================================ */

export async function clearEndOfNextTurnEffects(
  actor
) {

  const ids =
    endOfNextTurnEffects(
      actor
    )
      .map(
        effect =>
          effect.id
      )
      .filter(Boolean);


  if (!ids.length) {

    return;
  }


  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    ids
  );
}