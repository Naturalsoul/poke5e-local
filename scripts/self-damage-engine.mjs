const MODULE_ID =
  "poke5e-local";


const PENDING_FLAG =
  "pendingSelfDamage";


const MAX_PROCESSED_ACTIVATIONS =
  200;


const pendingByActor =
  new Map();


const processedActivations =
  new Set();


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    recoil:
      "recibe daño de retroceso",

    "self-damage":
      "recibe daño propio",

    basis:
      "Base",

    source:
      "por"
  },


  en: {

    recoil:
      "takes recoil damage",

    "self-damage":
      "takes self-damage",

    basis:
      "Basis",

    source:
      "from"
  }
};


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"

    ? "en"

    : "es";
}


function label(
  key
) {

  return (
    LABELS[
      language()
    ]?.[key] ??
    key
  );
}


/* ============================================================
 * DEFINITION
 * ============================================================ */

function selfDamageDefinition(
  item
) {

  const definition =
    item?.getFlag?.(
      MODULE_ID,
      "selfDamage"
    );


  if (
    definition?.kind !==
    "self-damage"
  ) {

    return null;
  }


  return definition;
}


/* ============================================================
 * ACTIVATION ID
 *
 * El mensaje de uso es la identidad más estable de
 * una activación concreta.
 * ============================================================ */

function activationId(
  activity,
  results
) {

  const messageId =
    results?.message?.id;


  if (messageId) {

    return messageId;
  }


  /*
   * Fallback para usos sin ChatMessage.
   */

  return [

    activity?.actor?.uuid ??
      "actor",

    activity?.item?.id ??
      "item",

    activity?.id ??
      "activity",

    Date.now()

  ].join(
    ":"
  );
}


/* ============================================================
 * PENDING MARKER
 *
 * Necesario para basis = damage-roll.
 *
 * postUseActivity identifica la activación.
 * rollDamage entrega posteriormente el DamageRoll evaluado.
 * ============================================================ */

function buildPendingMarker(
  activity,
  definition,
  results
) {

  return {

    activationId:
      activationId(
        activity,
        results
      ),

    actorUuid:
      activity.actor?.uuid ??
      null,

    itemId:
      activity.item?.id ??
      null,

    itemSourceId:
      activity.item?.getFlag?.(
        MODULE_ID,
        "sourceId"
      ) ??
      null,

    activityId:
      activity.id,

    definition:
      foundry.utils.deepClone(
        definition
      ),

    createdAt:
      Date.now()
  };
}


/* ============================================================
 * PROCESSED ACTIVATIONS
 *
 * Impide aplicar el self-damage otra vez al pulsar
 * repetidamente el botón Damage de la misma activación.
 * ============================================================ */

function rememberProcessedActivation(
  activationIdValue
) {

  if (!activationIdValue) {

    return;
  }


  processedActivations.add(
    activationIdValue
  );


  /*
   * Memoria acotada.
   */

  while (
    processedActivations.size >
    MAX_PROCESSED_ACTIVATIONS
  ) {

    const oldest =
      processedActivations
        .values()
        .next()
        .value;


    processedActivations.delete(
      oldest
    );
  }
}


function isProcessedActivation(
  activationIdValue
) {

  return Boolean(

    activationIdValue &&

    processedActivations.has(
      activationIdValue
    )
  );
}


/* ============================================================
 * MATCH PENDING
 * ============================================================ */

function matchingPendingMarker(
  actor,
  activity
) {

  const inMemory =
    pendingByActor.get(
      actor.uuid
    );


  /*
   * El flag permite sobrevivir a recargas de UI.
   */

  const persisted =
    actor.getFlag(
      MODULE_ID,
      PENDING_FLAG
    );


  const marker =
    inMemory ??
    persisted;


  if (!marker) {

    return null;
  }


  if (
    marker.itemId !==
      activity.item?.id ||

    marker.activityId !==
      activity.id
  ) {

    return null;
  }


  return marker;
}


/* ============================================================
 * PERSIST PENDING
 * ============================================================ */

async function persistPendingMarker(
  actor,
  marker
) {

  pendingByActor.set(
    actor.uuid,
    marker
  );


  await actor.setFlag(
    MODULE_ID,
    PENDING_FLAG,
    marker
  );
}


/* ============================================================
 * CLEAR PENDING
 * ============================================================ */

async function clearPendingMarker(
  actor,
  activationIdValue
) {

  const current =
    pendingByActor.get(
      actor.uuid
    );


  if (
    !current ||

    current.activationId ===
      activationIdValue
  ) {

    pendingByActor.delete(
      actor.uuid
    );
  }


  const persisted =
    actor.getFlag(
      MODULE_ID,
      PENDING_FLAG
    );


  if (
    persisted?.activationId ===
    activationIdValue
  ) {

    await actor.unsetFlag(
      MODULE_ID,
      PENDING_FLAG
    );
  }
}


/* ============================================================
 * FRACTIONAL AMOUNT
 * ============================================================ */

function fractionalAmount(
  basisValue,
  fraction,
  mode
) {

  const raw =

    Math.max(
      0,
      Number(
        basisValue
      )
    )

    *

    Math.max(
      0,
      Number(
        fraction
      )
    );


  switch (
    mode
  ) {

    case "ceil":

      return Math.ceil(
        raw
      );


    case "round":

      return Math.round(
        raw
      );


    case "floor":
    default:

      return Math.floor(
        raw
      );
  }
}


/* ============================================================
 * DAMAGE ROLL TOTAL
 *
 * Se usa el DamageRoll ya evaluado por D&D5e.
 *
 * Importante:
 * NO usamos daño aplicado al target.
 *
 * Por tanto no intervienen:
 *
 * - éxito/fallo de la save del objetivo;
 * - resistencia;
 * - vulnerabilidad;
 * - inmunidad;
 * - HP restante del objetivo.
 * ============================================================ */

function damageRollTotal(
  rolls
) {

  return Array.from(
    rolls ??
    []
  ).reduce(

    (
      total,
      roll
    ) =>

      total +

      Math.max(
        0,
        Number(
          roll?.total ??
          0
        )
      ),

    0
  );
}


/* ============================================================
 * MAX HP
 * ============================================================ */

function maxHp(
  actor
) {

  return Math.max(
    0,
    Number(
      actor?.system
        ?.attributes
        ?.hp
        ?.max ??
      0
    )
  );
}


/* ============================================================
 * CHAT
 * ============================================================ */

async function postSelfDamageMessage(
  actor,
  itemName,
  definition,
  amount,
  basisValue
) {

  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${actor.name}</strong>

        ${label(
          definition.classification
        )}

        <strong>${amount}</strong>

        ${label("source")}

        <strong>${itemName}</strong>.

        <small>
          ${label("basis")}: ${basisValue}
        </small>

      </div>
    `
  });
}


/* ============================================================
 * APPLY SELF DAMAGE
 *
 * Los tres contratos actuales son typeless.
 *
 * Daño numérico directo evita correctamente el pipeline
 * de resistencias/vulnerabilidades Pokémon.
 * ============================================================ */

async function applySelfDamage(
  actor,
  itemName,
  definition,
  basisValue
) {

  const amount =
    fractionalAmount(
      basisValue,
      definition.fraction,
      definition.round
    );


  if (
    amount <= 0
  ) {

    return;
  }


  await actor.applyDamage(
    amount
  );


  await postSelfDamageMessage(
    actor,
    itemName,
    definition,
    amount,
    basisValue
  );
}


/* ============================================================
 * MAX HP BASIS
 *
 * Chloroblast.
 * ============================================================ */

async function processMaxHpSelfDamage(
  activity,
  definition,
  activationIdValue
) {

  const actor =
    activity.actor;


  if (
    !actor ||

    isProcessedActivation(
      activationIdValue
    )
  ) {

    return;
  }


  rememberProcessedActivation(
    activationIdValue
  );


  await applySelfDamage(

    actor,

    activity.item.name,

    definition,

    maxHp(
      actor
    )
  );
}


/* ============================================================
 * QUEUE DAMAGE-ROLL BASIS
 *
 * Light of Ruin / Mind Blown.
 * ============================================================ */

async function queueDamageRollSelfDamage(
  activity,
  definition,
  results
) {

  const actor =
    activity.actor;


  if (!actor) {

    return;
  }


  const marker =
    buildPendingMarker(
      activity,
      definition,
      results
    );


  await persistPendingMarker(
    actor,
    marker
  );
}


/* ============================================================
 * RESOLVE DAMAGE-ROLL BASIS
 * ============================================================ */

async function processDamageRollSelfDamage(
  rolls,
  activity,
  marker
) {

  const actor =
    activity.actor;


  if (
    !actor ||

    isProcessedActivation(
      marker.activationId
    )
  ) {

    return;
  }


  /*
   * Primero marcamos como procesado.
   *
   * Así una segunda pulsación inmediata
   * no puede duplicar el self-damage.
   */

  rememberProcessedActivation(
    marker.activationId
  );


  await clearPendingMarker(
    actor,
    marker.activationId
  );


  await applySelfDamage(

    actor,

    activity.item.name,

    marker.definition,

    damageRollTotal(
      rolls
    )
  );
}


/* ============================================================
 * POST USE ACTIVITY
 *
 * D&D5e ya:
 *
 * - validó el uso;
 * - consumió recursos;
 * - creó el Usage Message.
 *
 * Para max-hp podemos resolver inmediatamente.
 *
 * Para damage-roll dejamos un marker pendiente hasta
 * conocer el DamageRoll evaluado.
 * ============================================================ */

function onPostUseActivity(
  activity,
  _usageConfig,
  results
) {

  const definition =
    selfDamageDefinition(
      activity?.item
    );


  if (
    !definition ||

    !activity?.actor
  ) {

    return;
  }


  const currentActivationId =
    activationId(
      activity,
      results
    );


  /* ==========================================================
   * MAX HP
   * ========================================================== */

  if (
    definition.basis ===
    "max-hp"
  ) {

    void processMaxHpSelfDamage(

      activity,

      definition,

      currentActivationId

    ).catch(
      error => {

        console.error(
          `[${MODULE_ID}] Error aplicando self-damage de ${activity.item.name}:`,
          error
        );
      }
    );


    return;
  }


  /* ==========================================================
   * DAMAGE ROLL
   * ========================================================== */

  if (
    definition.basis !==
    "damage-roll"
  ) {

    console.warn(
      `[${MODULE_ID}] Basis de self-damage no soportada: ${definition.basis}.`
    );


    return;
  }


  void queueDamageRollSelfDamage(

    activity,

    definition,

    results

  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error preparando self-damage de ${activity.item.name}:`,
        error
      );
    }
  );
}


/* ============================================================
 * ROLL DAMAGE
 *
 * Este hook recibe DamageRoll[] ya evaluados.
 * ============================================================ */

function onRollDamage(
  rolls,
  data
) {

  const activity =
    data?.subject;


  const actor =
    activity?.actor;


  if (
    !actor ||

    !activity?.item
  ) {

    return;
  }


  const definition =
    selfDamageDefinition(
      activity.item
    );


  if (
    definition?.basis !==
    "damage-roll"
  ) {

    return;
  }


  const marker =
    matchingPendingMarker(
      actor,
      activity
    );


  if (!marker) {

    return;
  }


  void processDamageRollSelfDamage(

    rolls,

    activity,

    marker

  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error resolviendo self-damage de ${activity.item.name}:`,
        error
      );
    }
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonSelfDamageEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.postUseActivity",
    onPostUseActivity
  );


  Hooks.on(
    "dnd5e.rollDamage",
    onRollDamage
  );
}