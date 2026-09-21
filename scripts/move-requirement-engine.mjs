import {
  hasEffectiveStatus
} from "./status-runtime.mjs";

import {
  isMoveLocked
} from "./move-lock-runtime.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * MOVE REQUIREMENTS
 *
 * Requisitos de activación que Poke5e expresa actualmente
 * en la descripción del Move, pero que todavía no existen
 * estructurados en el modelo normalizado.
 *
 * No analizamos texto en runtime.
 * ============================================================ */

const MOVE_REQUIREMENTS =
  new Map([
    [
      "dream-eater",
      {
        targetCount:
          1,

        targetEffectiveStatus:
          "asleep"
      }
    ]
  ]);


/* ============================================================
 * MENSAJES
 * ============================================================ */

const FAILURE_MESSAGES = {

  es: {

    "target-count":
      "requiere exactamente un objetivo",

    "target-missing":
      "no se pudo resolver el objetivo seleccionado",

    "effective-status":
      "el objetivo debe estar Dormido o contar como Dormido",

    "move-locked":
      "no puede usar este movimiento durante este turno por Cuerpo Maldito"
  },


  en: {

    "target-count":
      "requires exactly one target",

    "target-missing":
      "the selected target could not be resolved",

    "effective-status":
      "the target must be Asleep or count as Asleep",

    "move-locked":
      "cannot use this move during this turn because of Cursed Body"
  }
};


/* ============================================================
 * IDIOMA
 * ============================================================ */

function language() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"

    ? "en"

    : "es";
}


/* ============================================================
 * REQUIREMENT DEL MOVE
 * ============================================================ */

function moveRequirement(
  activity
) {

  const item =
    activity?.item;


  if (
    item?.documentName !==
      "Item" ||

    item.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return null;
  }


  const sourceId =
    String(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    MOVE_REQUIREMENTS.get(
      sourceId
    ) ??
    null
  );
}


/* ============================================================
 * TARGETS
 *
 * D&D5e ya incorpora los targets seleccionados dentro de:
 *
 * messageConfig.data.flags.dnd5e.targets
 * ============================================================ */

function targetDescriptors(
  messageConfig
) {

  const targets =
    foundry.utils.getProperty(
      messageConfig,
      "data.flags.dnd5e.targets"
    );


  return Array.isArray(
    targets
  )

    ? targets

    : [];
}


/* ============================================================
 * ACTOR DEL TARGET
 * ============================================================ */

function actorFromTarget(
  descriptor
) {

  const uuid =
    descriptor?.uuid;


  if (!uuid) {

    return null;
  }


  try {

    const document =
      fromUuidSync(
        uuid,
        {
          strict:
            false
        }
      );


    if (
      document?.documentName ===
        "Actor"
    ) {

      return document;
    }


    return (
      document?.actor ??
      null
    );

  } catch {

    return null;
  }
}


/* ============================================================
 * VALIDAR REQUIREMENT
 *
 * Retorna:
 *
 * null
 * → válido
 *
 * string
 * → motivo del bloqueo
 * ============================================================ */

function validationFailure(
  requirement,
  messageConfig
) {

  const targets =
    targetDescriptors(
      messageConfig
    );


  if (
    targets.length !==
    Number(
      requirement.targetCount ??
      1
    )
  ) {

    return "target-count";
  }


  const target =
    actorFromTarget(
      targets[0]
    );


  if (!target) {

    return "target-missing";
  }


  const status =
    String(
      requirement
        .targetEffectiveStatus ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    status &&

    !hasEffectiveStatus(
      target,
      status
    )
  ) {

    return "effective-status";
  }


  return null;
}


/* ============================================================
 * NOTIFICACIÓN
 * ============================================================ */

function notifyFailure(
  item,
  reason
) {

  const detail =

    FAILURE_MESSAGES[
      language()
    ]?.[reason] ??

    reason;


  ui.notifications.warn(
    `${item.name}: ${detail}.`
  );
}

/* ============================================================
 * MOVE LOCK
 *
 * Cursed Body bloquea el Move solo durante el siguiente turno.
 *
 * No se aplica a preRollDamage porque un botón Damage puede
 * pertenecer a una activación iniciada anteriormente.
 * ============================================================ */

function validateMoveLock(
  activity
) {

  const item =
    activity?.item;


  if (
    item?.documentName !==
      "Item" ||

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return true;
  }


  const actor =
    item.actor;


  if (
    !actor ||
    !isMoveLocked(
      actor,
      item
    )
  ) {

    return true;
  }


  notifyFailure(
    item,
    "move-locked"
  );


  return false;
}


/* ============================================================
 * VALIDAR ACTIVIDAD
 * ============================================================ */

function validateActivityRequirement(
  activity,
  messageConfig
) {

  const requirement =
    moveRequirement(
      activity
    );


  /*
   * Move sin requirement especial.
   */

  if (!requirement) {

    return true;
  }


  const failure =
    validationFailure(
      requirement,
      messageConfig
    );


  if (!failure) {

    return true;
  }


  notifyFailure(
    activity.item,
    failure
  );


  return false;
}


/* ============================================================
 * PRE USE ACTIVITY
 *
 * hookArgs:
 *
 * 0 = usageConfig
 * 1 = dialogConfig
 * 2 = messageConfig
 *
 * Este punto ocurre ANTES de consumir PP.
 * ============================================================ */

function onPreUseActivity(
  activity,
  ...hookArgs
) {

  if (
    !validateMoveLock(
      activity
    )
  ) {

    return false;
  }


  const messageConfig =
    hookArgs[2] ??
    null;


  return validateActivityRequirement(
    activity,
    messageConfig
  );
}


/* ============================================================
 * PRE ROLL DAMAGE
 *
 * Segunda barrera.
 *
 * Impide reutilizar posteriormente el botón Damage de
 * Dream Eater contra un target que ya no sea válido.
 *
 * hookArgs:
 *
 * 0 = dialogConfig
 * 1 = messageConfig
 * ============================================================ */

function onPreRollDamage(
  config,
  ...hookArgs
) {

  const activity =
    config?.subject ??
    null;


  const messageConfig =
    hookArgs[1] ??
    null;


  return validateActivityRequirement(
    activity,
    messageConfig
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerMoveRequirementEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preUseActivity",
    onPreUseActivity
  );


  Hooks.on(
    "dnd5e.preRollDamage",
    onPreRollDamage
  );
}