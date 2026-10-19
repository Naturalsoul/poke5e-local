import { messageRollShown } from "./chat-roll-display.mjs";

const MODULE_ID =
  "poke5e-local";


const subscribers =
  new Set();

const attackReactions =
  new Set();

const TARGET_ACTOR_OPTION =
  "poke5eTargetActorUuid";


/* ============================================================
 * POKE5E ATTACK ACTIVITY
 * ============================================================ */

function isPoke5eAttackActivity(
  activity
) {

  const item =
    activity?.item;


  return Boolean(

    item &&

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) ===
      "move"
  );
}


/* ============================================================
 * TARGET SNAPSHOT
 *
 * D&D5e obtiene también sus TargetDescriptors desde
 * game.user.targets al iniciar AttackActivity.rollAttack().
 *
 * Guardamos el único Actor objetivo antes del diálogo para
 * que AttackOutcome no dependa posteriormente del estado
 * mutable de game.user.targets.
 * ============================================================ */

function selectedTargetActorUuid() {

  const actorUuids =
    new Set();


  for (
    const token
    of game.user.targets ??
      []
  ) {

    const uuid =
      token?.actor?.uuid;


    if (uuid) {

      actorUuids.add(
        uuid
      );
    }
  }


  if (
    actorUuids.size !==
    1
  ) {

    return null;
  }


  return actorUuids
    .values()
    .next()
    .value;
}


function onPreRollAttack(
  config
) {

  if (
    !isPoke5eAttackActivity(
      config?.subject
    )
  ) {

    return;
  }


  config[MODULE_ID] = {

    ...(
      config[MODULE_ID] ??
      {}
    ),

    targetActorUuid:
      selectedTargetActorUuid()
  };
}


/* ============================================================
 * TRANSPORTAR TARGET AL ROLL
 *
 * Después de que D&D5e terminó de configurar los Rolls,
 * copiamos el snapshot al propio roll.options.
 * ============================================================ */

function onPostAttackRollConfiguration(
  rolls,
  config
) {

  if (
    !isPoke5eAttackActivity(
      config?.subject
    )
  ) {

    return;
  }


  const targetActorUuid =
    config?.[MODULE_ID]
      ?.targetActorUuid ??
    null;


  for (
    const roll
    of Array.from(
      rolls ??
      []
    )
  ) {

    if (!roll) {

      continue;
    }


    roll.options ??=
      {};


    roll.options[
      TARGET_ACTOR_OPTION
    ] =
      targetActorUuid;
  }
}


/* ============================================================
 * NORMALIZE NUMBER
 * ============================================================ */

function finiteNumber(
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


/* ============================================================
 * NATURAL D20
 *
 * Leemos el resultado activo del d20, no roll.total.
 *
 * De esta forma:
 *
 * natural = cara real seleccionada del d20
 * total   = natural + modificadores
 * ============================================================ */

function naturalD20(
  roll
) {

  const results =
    Array.from(
      roll?.d20?.results ??
      []
    );


  const active =
    results.find(
      result =>

        result?.active === true &&

        result?.discarded !== true
    );


  return finiteNumber(
    active?.result
  );
}


/* ============================================================
 * HIT RESULT
 *
 * D&D5e solo configura automáticamente una AC objetivo
 * cuando existe exactamente un target.
 *
 * Sin target numérico:
 *
 * hit  = null
 * miss = null
 *
 * Eso significa "no resuelto", no "fallo".
 * ============================================================ */

function resolveHit(
  roll,
  targetAc
) {

  if (
    targetAc === null
  ) {

    return null;
  }


  /*
   * Natural failure tiene prioridad.
   */

  if (
    roll?.isFumble ===
    true
  ) {

    return false;
  }


  /*
   * Critical success impacta.
   */

  if (
    roll?.isCritical ===
    true
  ) {

    return true;
  }


  const total =
    finiteNumber(
      roll?.total
    );


  if (
    total === null
  ) {

    return null;
  }


  return total >=
    targetAc;
}


/* ============================================================
 * BUILD OUTCOME
 *
 * Este objeto plano es el contrato canónico.
 *
 * No exponemos Roll internals dentro del outcome.
 * ============================================================ */

export function buildAttackOutcome(
  roll,
  activity
) {

  const targetAc =
    finiteNumber(
      roll?.options?.target
    );


  const hit =
    resolveHit(
      roll,
      targetAc
    );


  const targetActorUuid =
    String(
      roll?.options?.[
        TARGET_ACTOR_OPTION
      ] ??
      ""
    ).trim() ||
    null;


  return Object.freeze({

    kind:
      "attack-outcome",

    actorUuid:
      activity?.actor?.uuid ??
      null,

    itemUuid:
      activity?.item?.uuid ??
      null,

    moveId:
      String(
        activity?.item?.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ??
        ""
      ) ||
      null,

      activityId:
        activity?.id ??
        null,

      attackScope:
        attackScope(
          activity
        ),

      targetActorUuid,

    natural:
      naturalD20(
        roll
      ),

    total:
      finiteNumber(
        roll?.total
      ),

    targetAc,

    hit,

    miss:
      hit === null
        ? null
        : !hit,

    critical:
      roll?.isCritical ===
      true,

    fumble:
      roll?.isFumble ===
      true,

    advantage:
      roll?.hasAdvantage ===
      true,

    disadvantage:
      roll?.hasDisadvantage ===
      true
  });
}

/* ============================================================
 * ATTACK SCOPE
 *
 * Normalizamos la clasificación que D&D5e ya dejó
 * materializada en AttackActivity.
 *
 * Los consumidores reciben un valor canónico simple y
 * no necesitan conocer el DataModel de Foundry.
 * ============================================================ */

function attackScope(
  activity
) {

  const raw =
    typeof activity?.attack?.type ===
      "string"

      ? activity.attack.type

      : activity?.attack?.type
        ?.value;


  const normalized =
    String(
      raw ??
      ""
    )
      .trim()
      .toLowerCase();


  if (
    normalized === "melee" ||
    normalized === "ranged"
  ) {

    return normalized;
  }


  return null;
}

/* ============================================================
 * PREDICATES
 * ============================================================ */

export function isAttackHit(
  outcome
) {

  return outcome?.hit ===
    true;
}


export function isAttackMiss(
  outcome
) {

  return outcome?.miss ===
    true;
}


export function isAttackCritical(
  outcome
) {

  return outcome?.critical ===
    true;
}


export function isAttackFumble(
  outcome
) {

  return outcome?.fumble ===
    true;
}

export function isMeleeAttack(
  outcome
) {

  return outcome?.attackScope ===
    "melee";
}

export function isNaturalAttackAtLeast(
  outcome,
  threshold
) {

  const natural =
    finiteNumber(
      outcome?.natural
    );


  const minimum =
    finiteNumber(
      threshold
    );


  return (
    natural !== null &&

    minimum !== null &&

    natural >=
      minimum
  );
}


export function isNaturalAttackAtMost(
  outcome,
  threshold
) {

  const natural =
    finiteNumber(
      outcome?.natural
    );


  const maximum =
    finiteNumber(
      threshold
    );


  return (
    natural !== null &&

    maximum !== null &&

    natural <=
      maximum
  );
}


/* ============================================================
 * SUBSCRIPTION CONTRACT
 *
 * Los futuros consumidores:
 *
 * - Scald
 * - Analytic
 * - Anger Point
 * - etc.
 *
 * se suscriben aquí.
 *
 * No necesitan escuchar directamente dnd5e.rollAttack.
 * ============================================================ */

/* ============================================================
 * REACTIONS
 *
 * Trainer features that change an attack after it is rolled (Battle Die, Sabotage,
 * Raise Your Defenses). offer(roll, activity) answers synchronously: null when it
 * cannot change this roll, otherwise an async step resolving to the replacement
 * roll (null keeps it). Consumers then receive the final hit or miss.
 * ============================================================ */

export function registerAttackReaction(
  offer
) {

  attackReactions.add(
    offer
  );

  return () => attackReactions.delete(
    offer
  );
}


export async function resolveAttackReactions(
  roll,
  activity
) {

  await messageRollShown(
    roll.parent
  );

  let current =
    roll;

  for (
    const offer
    of attackReactions
  ) {

    const step =
      offer(
        current,
        activity
      );

    if (!step) {

      continue;
    }

    try {

      current =
        await step() ??
        current;
    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error en reacción de entrenador al ataque:`,
        error
      );
    }
  }

  return current;
}


export function subscribeAttackOutcome(
  handler
) {

  if (
    typeof handler !==
    "function"
  ) {

    throw new TypeError(
      "subscribeAttackOutcome requiere una función."
    );
  }


  subscribers.add(
    handler
  );


  /*
   * Permitimos desuscribirse sin exponer
   * el Set interno.
   */

  return () => {

    subscribers.delete(
      handler
    );
  };
}


/* ============================================================
 * DISPATCH
 * ============================================================ */

function dispatchAttackOutcome(
  outcome,
  context
) {

  for (
    const handler
    of subscribers
  ) {

    try {

      const result =
        handler(
          outcome,
          context
        );


      /*
       * Hooks.callAll() no espera Promises.
       *
       * Si un consumidor es async,
       * controlamos su rechazo aquí.
       */

      if (
        result &&

        typeof result.then ===
          "function"
      ) {

        void result.catch(
          error => {

            console.error(
              `[${MODULE_ID}] Error en consumidor de AttackOutcome:`,
              error
            );
          }
        );
      }

    } catch (
      error
    ) {

      console.error(
        `[${MODULE_ID}] Error en consumidor de AttackOutcome:`,
        error
      );
    }
  }
}


/* ============================================================
 * D&D5E ROLL ATTACK
 * ============================================================ */

function onRollAttack(
  rolls,
  data
) {

  const activity =
    data?.subject;


  const item =
    activity?.item;


  /*
   * Solo Moves Poke5e.
   *
   * No observamos ataques D&D5e ajenos
   * al sistema Pokémon.
   */

  if (
    !item ||

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return;
  }


  for (
    const roll
    of Array.from(
      rolls ??
      []
    )
  ) {

    if (!roll) {

      continue;
    }


    const dispatch =
      final =>
        dispatchAttackOutcome(
          buildAttackOutcome(
            final,
            activity
          ),
          {
            activity,
            roll:
              final
          }
        );


    /*
     * Sin reacciones posibles, el resultado
     * se publica en el acto, como siempre.
     */

    if (
      ![...attackReactions].some(
        offer =>
          offer(
            roll,
            activity
          )
      )
    ) {

      dispatch(
        roll
      );

      continue;
    }


    void resolveAttackReactions(
      roll,
      activity
    ).then(
      dispatch
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerAttackOutcomeEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preRollAttack",
    onPreRollAttack
  );


  Hooks.on(
    "dnd5e.postAttackRollConfiguration",
    onPostAttackRollConfiguration
  );


  Hooks.on(
    "dnd5e.rollAttack",
    onRollAttack
  );
}