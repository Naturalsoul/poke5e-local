import {
  endOfNextTurnFlags,
  refreshEndOfNextTurnDuration
} from "./turn-duration-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const MOVE_LOCK_KIND =
  "pokemon-move-lock";


/* ============================================================
 * NORMALIZE IDENTITY
 * ============================================================ */

function normalizedId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


function moveIdentityFromItem(
  item
) {

  if (
    item?.documentName !==
      "Item" ||

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return null;
  }


  return {
    moveId:
      normalizedId(
        item.getFlag?.(
          MODULE_ID,
          "sourceId"
        )
      ) ||
      null,

    itemUuid:
      String(
        item.uuid ??
        ""
      ).trim() ||
      null
  };
}


function normalizedMoveIdentity({
  moveId = null,
  itemUuid = null
} = {}) {

  return {
    moveId:
      normalizedId(
        moveId
      ) ||
      null,

    itemUuid:
      String(
        itemUuid ??
        ""
      ).trim() ||
      null
  };
}


/* ============================================================
 * MOVE LOCK EFFECTS
 * ============================================================ */

function moveLockEffects(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>

      !effect.disabled &&

      effect.getFlag?.(
        MODULE_ID,
        "kind"
      ) ===
        MOVE_LOCK_KIND
  );
}


/* ============================================================
 * MATCH LOCK
 *
 * moveId es la identidad canónica preferida.
 * itemUuid queda como fallback técnico.
 * ============================================================ */

function matchesMoveLock(
  effect,
  identity
) {

  const lock =
    effect.getFlag?.(
      MODULE_ID,
      "moveLock"
    ) ??
    {};


  const lockedMoveId =
    normalizedId(
      lock.moveId
    ) ||
    null;


  if (
    identity.moveId &&
    lockedMoveId
  ) {

    return identity.moveId ===
      lockedMoveId;
  }


  const lockedItemUuid =
    String(
      lock.itemUuid ??
      ""
    ).trim() ||
    null;


  return Boolean(
    identity.itemUuid &&
    lockedItemUuid &&
    identity.itemUuid ===
      lockedItemUuid
  );
}


function findMoveLockByIdentity(
  actor,
  identity
) {

  if (
    !actor ||
    !identity ||
    (
      !identity.moveId &&
      !identity.itemUuid
    )
  ) {

    return null;
  }


  return (
    moveLockEffects(
      actor
    ).find(
      effect =>
        matchesMoveLock(
          effect,
          identity
        )
    ) ??
    null
  );
}


/* ============================================================
 * FIND LOCK
 * ============================================================ */

export function findMoveLock(
  actor,
  item
) {

  return findMoveLockByIdentity(
    actor,
    moveIdentityFromItem(
      item
    )
  );
}


/* ============================================================
 * ACTIVE LOCK
 *
 * Cursed Body NO bloquea inmediatamente.
 * Solamente durante el SIGUIENTE turno.
 * ============================================================ */

export function isMoveLocked(
  actor,
  item
) {

  const effect =
    findMoveLock(
      actor,
      item
    );


  return Boolean(
    effect &&

    effect.getFlag?.(
      MODULE_ID,
      "nextTurnStarted"
    ) ===
      true
  );
}


/* ============================================================
 * EFFECT SOURCE
 * ============================================================ */

function moveLockEffectSource({
  name,
  img,
  itemUuid,
  moveId,
  itemName,
  sourceAbility = null,
  sourceActorUuid = null
}) {

  return {
    name,

    img:
      img ??
      "icons/svg/aura.svg",

    disabled:
      false,

    transfer:
      false,

    duration:
      {},

    changes:
      [],

    flags: {

      [MODULE_ID]: {

        kind:
          MOVE_LOCK_KIND,

        sourceAbility,

        sourceActorUuid,

        ...endOfNextTurnFlags(),

        moveLock: {

          itemUuid,
          moveId,

          itemName:
            itemName ??
            null
        }
      }
    }
  };
}


/* ============================================================
 * APPLY / REFRESH LOCK
 * ============================================================ */

export async function applyMoveLockUntilEndOfNextTurn(
  actor,
  {
    name,
    img = null,
    itemUuid = null,
    moveId = null,
    itemName = null,
    sourceAbility = null,
    sourceActorUuid = null
  } = {}
) {

  if (!actor) {

    throw new TypeError(
      "applyMoveLockUntilEndOfNextTurn requiere un Actor."
    );
  }


  const identity =
    normalizedMoveIdentity({
      moveId,
      itemUuid
    });


  if (
    !identity.moveId &&
    !identity.itemUuid
  ) {

    throw new TypeError(
      "applyMoveLockUntilEndOfNextTurn requiere moveId o itemUuid."
    );
  }


  const existing =
    findMoveLockByIdentity(
      actor,
      identity
    );


  const source =
    moveLockEffectSource({
      name:
        String(
          name ??
          itemName ??
          identity.moveId ??
          "Move Lock"
        ),

      img,

      itemUuid:
        identity.itemUuid,

      moveId:
        identity.moveId,

      itemName,
      sourceAbility,
      sourceActorUuid
    });


  if (existing) {

    await existing.update({

      name:
        source.name,

      img:
        source.img,

      [`flags.${MODULE_ID}.sourceAbility`]:
        sourceAbility,

      [`flags.${MODULE_ID}.sourceActorUuid`]:
        sourceActorUuid,

      [`flags.${MODULE_ID}.moveLock`]:
        foundry.utils.deepClone(
          source.flags[
            MODULE_ID
          ].moveLock
        )
    });


    await refreshEndOfNextTurnDuration(
      existing
    );


    return {
      status:
        "refreshed",

      effect:
        existing
    };
  }


  const created =
    await actor.createEmbeddedDocuments(
      "ActiveEffect",
      [
        source
      ]
    );


  return {
    status:
      "created",

    effect:
      created[0] ??
      null
  };
}