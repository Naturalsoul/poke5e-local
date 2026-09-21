import {
  endOfNextTurnFlags,
  refreshEndOfNextTurnDuration
} from "./turn-duration-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const TEMPORARY_MODIFIER_KIND =
  "pokemon-temporary-modifier";

const SPEED_ZERO_STACK_KEY =
  "temporary-movement-lock:speed-zero";

const MOVEMENT_TYPES =
  Object.freeze([
    "walk",
    "burrow",
    "climb",
    "fly",
    "swim"
  ]);


/* ============================================================
 * ACTIVE EFFECT CHANGE
 * ============================================================ */

function override(
  key,
  value,
  priority = 100
) {

  return {
    key,

    mode:
      CONST.ACTIVE_EFFECT_MODES
        .OVERRIDE,

    value:
      String(
        value
      ),

    priority
  };
}


/* ============================================================
 * SPEED = 0
 *
 * Poke5e Gooey dice "speed", no únicamente walking speed.
 *
 * También anulamos movement.bonus para que efectos como
 * Agility no vuelvan a elevar una velocidad bloqueada.
 * ============================================================ */

function zeroSpeedChanges() {

  return [
    ...MOVEMENT_TYPES.map(
      movement =>
        override(
          `system.attributes.movement.${movement}`,
          0
        )
    ),

    override(
      "system.attributes.movement.bonus",
      0
    )
  ];
}


/* ============================================================
 * TEMPORARY MODIFIERS
 * ============================================================ */

function temporaryTurnModifiers(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>

      effect.getFlag?.(
        MODULE_ID,
        "kind"
      ) ===
        TEMPORARY_MODIFIER_KIND
  );
}


function existingTemporaryModifier(
  actor,
  stackKey
) {

  return (
    temporaryTurnModifiers(
      actor
    ).find(
      effect =>

        effect.getFlag?.(
          MODULE_ID,
          "stackKey"
        ) ===
          stackKey
    ) ??
    null
  );
}


/* ============================================================
 * MOVEMENT LOCK
 *
 * Representa una regla runtime:
 *
 * speed = 0
 * hasta el final del siguiente turno.
 *
 * No conoce Gooey específicamente.
 * ============================================================ */

function movementLockEffectSource({
  name,
  sourceAbility = null,
  sourceReason = null
}) {

  return {
    name,

    img:
      "icons/svg/aura.svg",

    disabled:
      false,

    transfer:
      false,

    duration:
      {},

    changes:
      zeroSpeedChanges(),

    flags: {

      [MODULE_ID]: {

        kind:
          TEMPORARY_MODIFIER_KIND,

        stackKey:
          SPEED_ZERO_STACK_KEY,

        sourceAbility,

        sourceReason,

        ...endOfNextTurnFlags(),

        movementLock: {

          speed:
            0
        }
      }
    }
  };
}


/* ============================================================
 * APPLY / REFRESH MOVEMENT LOCK
 *
 * Una reaplicación NO acumula locks.
 *
 * Reinicia la duración:
 * "hasta el final de su siguiente turno".
 * ============================================================ */

export async function applyMovementLockUntilEndOfNextTurn(
  actor,
  {
    name,
    sourceAbility = null,
    sourceReason = null
  } = {}
) {

  if (!actor) {

    throw new TypeError(
      "applyMovementLockUntilEndOfNextTurn requiere un Actor."
    );
  }


  const source =
    movementLockEffectSource({
      name:
        String(
          name ??
          "Speed 0"
        ),

      sourceAbility,

      sourceReason
    });


  const existing =
    existingTemporaryModifier(
      actor,
      SPEED_ZERO_STACK_KEY
    );


  /*
   * Ya estaba bloqueado.
   *
   * Reaplicar la regla refresca "next turn".
   */

  if (existing) {

    await existing.update({

        name:
        source.name,

        img:
        source.img,

        changes:
        foundry.utils.deepClone(
            source.changes
        ),

        [`flags.${MODULE_ID}.sourceAbility`]:
        sourceAbility,

        [`flags.${MODULE_ID}.sourceReason`]:
        sourceReason
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