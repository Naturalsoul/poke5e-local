import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import {
  buildConfusedStatusEffect
} from "./status-effects.mjs";
import {
  registerPokemonStruggleEngine,
  resolveConfusionStruggle
} from "./struggle-engine.mjs";

import {
  isPokemonRecoveryInProgress
} from "./pokemon-recovery-context.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";

const MODULE_ID =
  "poke5e-local";


const CONFUSED_STATUS_ID =
  "poke5e-confused";


const CONFUSION_FORMULA =
  "1d8";


const CONFUSION_MAX_CHECKS =
  3;


const CONFUSION_LOCK_KIND =
  "confusion-turn-lock";


const BLOCKED_ACTIVATIONS =
  new Set([
    "action",
    "bonus",
    "reaction"
  ]);


const MOVEMENT_KEYS = [
  "walk",
  "fly",
  "swim",
  "climb",
  "burrow",
  "bonus"
];


const OUTRAGE_SKIP_REASONS =
  new Set([
    "combat-end",
    "combat-changed"
  ]);


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    applied:
      "queda Confundido al terminar Enfado",

    roll:
      "Chequeo de Confusión",

    selfStruggle:
      "debe usar Struggle contra sí mismo y el ataque impacta automáticamente",

    targetStruggle:
      "debe usar Struggle contra el Pokémon objetivo válido más cercano; si no existe, debe usarlo contra sí mismo y el ataque impacta automáticamente",

    locked:
      "no puede moverse ni realizar acciones este turno",

    normal:
      "puede elegir su comportamiento normalmente",

    ended:
      "deja de estar Confundido",

    expired:
      "deja de estar Confundido tras completar sus tres rondas",

    reactionBlocked:
      "No puede realizar reacciones mientras está Confundido.",

    actionBlocked:
      "No puede realizar acciones este turno debido a Confusión."
  },


  en: {

    applied:
      "becomes Confused when Outrage ends",

    roll:
      "Confusion Check",

    selfStruggle:
      "must use Struggle against itself and the attack automatically hits",

    targetStruggle:
      "must use Struggle against the nearest valid Pokémon target; if none exists, it must use Struggle against itself and the attack automatically hits",

    locked:
      "cannot move or take actions this turn",

    normal:
      "can choose its behavior normally",

    ended:
      "is no longer Confused",

    expired:
      "is no longer Confused after completing its three rounds",

    reactionBlocked:
      "Cannot take reactions while Confused.",

    actionBlocked:
      "Cannot take actions this turn because of Confusion."
  }
};


/* ============================================================
 * AUTHORITY
 * ============================================================ */

function isAuthority() {

  const activeGM =
    game.users.activeGM;


  if (activeGM) {

    return (
      activeGM.id ===
      game.user.id
    );
  }


  return game.user.isGM;
}


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  return (
    game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"

      ? "en"

      : "es"
  );
}


function label(
  key
) {

  return (
    LABELS[
      language()
    ][key] ??
    key
  );
}


/* ============================================================
 * POKEMON
 * ============================================================ */

/* ============================================================
 * CONFUSED EFFECT
 * ============================================================ */

function hasStatusId(
  effect,
  statusId
) {

  const statuses =
    effect?.statuses ??
    new Set();


  if (
    typeof statuses.has ===
    "function"
  ) {

    return statuses.has(
      statusId
    );
  }


  return Array.from(
    statuses
  ).includes(
    statusId
  );
}


function isConfusedEffect(
  effect
) {

  if (
    !effect ||
    effect.disabled
  ) {

    return false;
  }


  const flagged =
    effect.getFlag?.(
      MODULE_ID,
      "status"
    );


  return (
    flagged ===
      "confused" ||

    hasStatusId(
      effect,
      CONFUSED_STATUS_ID
    )
  );
}


function findConfusedEffect(
  actor
) {

  return (
    actor?.effects.find(
      isConfusedEffect
    ) ??
    null
  );
}


/* ============================================================
 * TURN LOCK
 * ============================================================ */

function findConfusionTurnLock(
  actor
) {

  return (
    actor?.effects.find(
      effect =>

        !effect.disabled &&

        effect.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          CONFUSION_LOCK_KIND
    ) ??
    null
  );
}


async function removeConfusionTurnLock(
  actor
) {

  const effect =
    findConfusionTurnLock(
      actor
    );


  if (
    effect
  ) {

    await effect.delete();
  }
}


function zeroMovementChanges() {

  return MOVEMENT_KEYS.map(
    key => ({

      key:
        `system.attributes.movement.${key}`,

      mode:
        CONST.ACTIVE_EFFECT_MODES
          .OVERRIDE,

      value:
        "0",

      priority:
        100
    })
  );
}


async function createConfusionTurnLock(
  actor
) {

  await removeConfusionTurnLock(
    actor
  );


  await actor.createEmbeddedDocuments(
    "ActiveEffect",
    [
      {

        name:

          language() === "en"

            ? "Confusion — Turn Locked"

            : "Confusión — turno bloqueado",


        img:
          "icons/svg/mystery-man.svg",


        disabled:
          false,


        transfer:
          false,


        /*
         * Incapacitated bloquea la economía
         * de acciones de D&D5e.
         *
         * NO usamos Restrained:
         * Poke5e Confused no concede sus
         * penalizadores adicionales.
         */

        statuses: [
          "incapacitated"
        ],


        changes:
          zeroMovementChanges(),


        flags: {

          [MODULE_ID]: {

            kind:
              CONFUSION_LOCK_KIND
          }
        }
      }
    ]
  );
}


/* ============================================================
 * CHAT
 * ============================================================ */

async function chat(
  actor,
  content
) {

  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


/* ============================================================
 * CONFUSION ROLL
 * ============================================================ */

async function rollToChat(
  actor
) {

  const roll =
    new Roll(
      CONFUSION_FORMULA
    );


  await roll.evaluate();


  await publishRollBeforeDamage(roll, {

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    flavor:
      `${label("roll")} — ${actor.name}`
  });


  return roll;
}


/* ============================================================
 * CONFUSION STATE
 * ============================================================ */

function confusionState(
  effect
) {

  const raw =
    effect?.getFlag(
      MODULE_ID,
      "confusion"
    ) ??
    {};


  const rawChecks =
    Number(
      raw.checks ??
      0
    );


  const rawMax =
    Number(
      raw.maxChecks ??
      CONFUSION_MAX_CHECKS
    );


  const checks =

    Number.isInteger(
      rawChecks
    ) &&
    rawChecks >= 0

      ? rawChecks

      : 0;


  const maxChecks =

    Number.isInteger(
      rawMax
    ) &&
    rawMax > 0

      ? rawMax

      : CONFUSION_MAX_CHECKS;


  return {

    formula:
      CONFUSION_FORMULA,

    checks,

    maxChecks,

    expireAfterTurn:
      Boolean(
        raw.expireAfterTurn
      )
  };
}


async function updateConfusionState(
  effect,
  state
) {

  await effect.setFlag(
    MODULE_ID,
    "confusion",
    state
  );
}


/* ============================================================
 * CONFUSION TABLE RESULT
 * ============================================================ */

async function handleConfusionResult(
  actor,
  total
) {

  switch (
    total
  ) {

    case 1:

      await resolveConfusionStruggle(
        actor,
        "self"
      );

      return;


    case 2:

      await resolveConfusionStruggle(
        actor,
        "nearest"
      );

      return;


    case 3:

      await createConfusionTurnLock(
        actor
      );


      await chat(
        actor,
        `<strong>${actor.name}</strong> ${label("locked")}.`
      );

      return;


    default:

      await chat(
        actor,
        `<strong>${actor.name}</strong> ${label("normal")}.`
      );
  }
}


/* ============================================================
 * PUBLIC: START TURN
 * ============================================================ */

export async function processConfusionStartTurn(
  actor
) {

  if (
    !isAuthority() ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  /*
   * Un bloqueo de la ronda anterior
   * termina al comenzar el nuevo turno.
   */

  await removeConfusionTurnLock(
    actor
  );


  const effect =
    findConfusedEffect(
      actor
    );


  if (
    !effect
  ) {

    return;
  }


  const roll =
    await rollToChat(
      actor
    );


  const total =
    Number(
      roll.total
    );


  /*
   * 8:
   * Confused termina inmediatamente.
   */

  if (
    total === 8
  ) {

    await effect.delete();


    await chat(
      actor,
      `<strong>${actor.name}</strong> ${label("ended")}.`
    );


    return;
  }


  const state =
    confusionState(
      effect
    );


  const checks =
    Math.min(
      state.maxChecks,
      state.checks + 1
    );


  await updateConfusionState(
    effect,
    {

      ...state,

      checks,

      /*
       * En el tercer turno no eliminamos
       * Confused todavía.
       *
       * Debe seguir bloqueando reacciones
       * durante todo ese turno.
       */

      expireAfterTurn:
        checks >=
        state.maxChecks
    }
  );


  await handleConfusionResult(
    actor,
    total
  );
}


/* ============================================================
 * PUBLIC: END TURN
 * ============================================================ */

export async function processConfusionEndTurn(
  actor
) {

  if (
    !isAuthority() ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  const effect =
    findConfusedEffect(
      actor
    );


  if (
    !effect
  ) {

    return;
  }


  const state =
    confusionState(
      effect
    );


  if (
    !state.expireAfterTurn
  ) {

    return;
  }


  await effect.delete();


  await chat(
    actor,
    `<strong>${actor.name}</strong> ${label("expired")}.`
  );
}


/* ============================================================
 * OUTRAGE STATE
 * ============================================================ */

function outrageState(
  effect
) {

  const state =
    effect?.getFlag?.(
      MODULE_ID,
      "outrage"
    );


  if (
    state?.kind !==
      "outrage"
  ) {

    return null;
  }


  return state;
}


function shouldApplyConfusedAfterOutrage(
  state
) {

  if (
    !state
  ) {

    return false;
  }


  return !OUTRAGE_SKIP_REASONS.has(
    state.endReason ??
    ""
  );
}


function isActorInActiveCombat(
  actor
) {

  const combat =
    game.combat;


  if (
    !combat ||
    !actor?.uuid
  ) {

    return false;
  }


  for (
    const combatant
    of combat.combatants ??
    []
  ) {

    if (
      combatant.actor?.uuid ===
      actor.uuid
    ) {

      return true;
    }
  }


  return false;
}


/* ============================================================
 * OUTRAGE -> CONFUSED
 * ============================================================ */

async function applyConfusedAfterOutrage(
  actor,
  effect
) {

  const state =
    outrageState(
      effect
    );


  if (
    !shouldApplyConfusedAfterOutrage(
      state
    ) ||
    !isActorInActiveCombat(
      actor
    ) ||
    findConfusedEffect(
      actor
    )
  ) {

    return;
  }


  const effectData =
    buildConfusedStatusEffect(
      language(),
      {

        sourceMove:
          "outrage",

        sourceReason:
          state.endReason ??
          "concentration-broken"
      }
    );


  const created =
    await actor.createEmbeddedDocuments(
      "ActiveEffect",
      [
        effectData
      ]
    );


  if (
    !created.length
  ) {

    return;
  }


  await chat(
    actor,
    `<strong>${actor.name}</strong> ${label("applied")}.`
  );
}


/* ============================================================
 * ACTIVE EFFECT DELETED
 * ============================================================ */

async function onDeleteActiveEffect(
  effect
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  const actor =

    effect.parent
      ?.documentName ===
      "Actor"

      ? effect.parent

      : null;


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  if (
    isPokemonRecoveryInProgress(
      actor
    )
  ) {

    return;
  }


  await applyConfusedAfterOutrage(
    actor,
    effect
  );
}


/* ============================================================
 * ACTIVITY BLOCKING
 * ============================================================ */

function activityActor(
  activity
) {

  return (
    activity?.actor ??
    activity?.item?.actor ??
    null
  );
}


function activityActivationType(
  activity
) {

  return String(
    activity?.activation
      ?.type ??
    ""
  ).toLowerCase();
}


function onPreUseActivity(
  activity
) {

  const actor =
    activityActor(
      activity
    );


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return true;
  }


  const activation =
    activityActivationType(
      activity
    );


  const locked =
    findConfusionTurnLock(
      actor
    );


  /*
   * Resultado 3:
   * no Action / Bonus Action / Reaction.
   */

  if (
    locked &&
    BLOCKED_ACTIVATIONS.has(
      activation
    )
  ) {

    ui.notifications.warn(
      label(
        "actionBlocked"
      )
    );


    return false;
  }


  /*
   * Confused siempre impide reacciones.
   */

  if (
    activation ===
      "reaction" &&
    findConfusedEffect(
      actor
    )
  ) {

    ui.notifications.warn(
      label(
        "reactionBlocked"
      )
    );


    return false;
  }


  return true;
}


/* ============================================================
 * COMBAT CLEANUP
 * ============================================================ */

async function cleanConfusionState() {

  if (
    !isAuthority()
  ) {

    return;
  }


  for (
    const actor
    of game.actors
  ) {

    await removeConfusionTurnLock(
      actor
    );


    const effect =
      findConfusedEffect(
        actor
      );


    if (
      effect
    ) {

      await effect.delete();
    }
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonConfusionEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;

  registerPokemonStruggleEngine();

  /*
   * D&D5e permite cancelar un Activity Use
   * devolviendo false desde este hook.
   */

  Hooks.on(
    "dnd5e.preUseActivity",
    onPreUseActivity
  );


  /*
   * Detecta la desaparición de la
   * concentración de Outrage.
   */

  Hooks.on(
    "deleteActiveEffect",
    onDeleteActiveEffect
  );


  /*
   * Confused es volátil:
   * no debe quedar activo fuera de combate.
   */

  Hooks.on(
    "deleteCombat",
    cleanConfusionState
  );
}
