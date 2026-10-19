import {
  isAttackHit,
  isMeleeAttack,
  subscribeAttackOutcome
} from "./attack-outcome-engine.mjs";

import {
  hasPokemonAbility
} from "./status-runtime.mjs";

import {
  buildPokemonStatusEffect
} from "./status-effects.mjs";

import {
  applyMovementLockUntilEndOfNextTurn
} from "./temporary-modifier-runtime.mjs";

import {
  applyFlinched
} from "./flinch-engine.mjs";

import {
  applyMoveLockUntilEndOfNextTurn
} from "./move-lock-runtime.mjs";

import { heldItemPreventsContactReactions } from "./held-item-engine.mjs";

const CONTACT_REACTIVE_ABILITIES = new Set(["static", "poison-point", "effect-spore", "flame-body", "gooey", "rough-skin", "iron-barbs"]);

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * DEFINITIONS
 *
 * Primera familia:
 *
 * melee hit
 * -> trigger roll
 * -> daño igual al PB del poseedor de la Ability.
 *
 * Un Pokémon tiene una única Ability activa, por lo que
 * nunca acumulamos varias definiciones simultáneamente.
 * ============================================================ */

const REACTIVE_HIT_ABILITY_DEFINITIONS =
  new Map([
    [
      "static",
      Object.freeze({
        rollFormula:
          "1d4",

        triggerTotal:
          4,

        effect:
          Object.freeze({
            kind:
              "damage",

            amount:
              "source-proficiency",

            damageType:
              "electric"
          })
      })
    ],

    [
      "poison-point",
      Object.freeze({
        rollFormula:
          "1d4",

        triggerTotal:
          4,

        effect:
          Object.freeze({
            kind:
              "damage",

            amount:
              "source-proficiency",

            damageType:
              "poison"
          })
      })
    ],

    [
      "effect-spore",
      Object.freeze({
        rollFormula:
          "1d4",

        triggerTotal:
          4,

        effect:
          Object.freeze({
            kind:
              "damage",

            amount:
              "source-proficiency",

            damageType:
              "grass"
          })
      })
    ],

    [
      "flame-body",
      Object.freeze({
        rollFormula:
          "1d10",

        triggerTotal:
          10,

        effect:
          Object.freeze({
            kind:
              "status",

            status:
              "burned"
          })
      })
    ],

    [
      "gooey",
      Object.freeze({
        rollFormula:
          "1d4",

        triggerRange:
          Object.freeze({
            min:
              3,

            max:
              4
          }),

        effect:
          Object.freeze({
            kind:
              "movement-lock",

            speed:
              0,

            duration:
              "end-of-next-turn"
          })
      })
    ],

    [
      "stench",
      Object.freeze({
        rollFormula:
          "1d10",

        triggerTotal:
          10,

        effect:
          Object.freeze({
            kind:
              "flinch"
          })
      })
    ],

    ["rough-skin", Object.freeze({ optional: true, rollFormula: "1d4", triggerTotal: 4,
      effect: Object.freeze({ kind: "damage", amount: "source-proficiency", damageType: "typeless" }) })],
    ["iron-barbs", Object.freeze({ optional: true, rollFormula: "1d4", triggerTotal: 4,
      effect: Object.freeze({ kind: "damage", amount: "source-proficiency", damageType: "steel" }) })],
    [
      "cursed-body",
      Object.freeze({
        optional:
          true,

        rollFormula:
          "1d4",

        triggerTotal:
          4,

        effect:
          Object.freeze({
            kind:
              "move-lock",

            duration:
              "next-turn"
          })
      })
    ]
  ]);


/* ============================================================
 * EFFECT HANDLERS
 *
 * Posteriormente podremos agregar:
 *
 * damage
 * status
 * modifier
 * movement
 *
 * sin convertir onAttackOutcome() en un switch gigante.
 * ============================================================ */

const REACTIVE_EFFECT_HANDLERS =
  new Map([
    [
      "damage",
      applyReactiveDamage
    ],

    [
      "status",
      applyReactiveStatus
    ],

    [
      "movement-lock",
      applyReactiveMovementLock
    ],

    [
      "flinch",
      applyReactiveFlinch
    ],

    [
      "move-lock",
      applyReactiveMoveLock
    ]
  ]);


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  try {

    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"

      ? "en"

      : "es";

  } catch {

    return "es";
  }
}


function damageTypeLabel(
  damageType
) {

  const labels = {

    es: {
      electric:
        "Eléctrico",

      poison:
        "Veneno",

      grass:
        "Planta",
      steel:
        "Acero",
      typeless:
        "sin tipo"
    },

    en: {
      electric:
        "Electric",

      poison:
        "Poison",

      grass:
        "Grass",
      steel:
        "Steel",
      typeless:
        "typeless"
    }
  };


  return (
    labels[
      language()
    ]?.[
      damageType
    ] ??
    damageType
  );
}


/* ============================================================
 * ACTOR FROM UUID
 * ============================================================ */

function actorFromUuid(
  uuid
) {

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
 * ACTIVE REACTIVE ABILITY
 * ============================================================ */

function activeReactiveDefinition(
  actor
) {

  for (
    const [
      abilityId,
      definition
    ]
    of REACTIVE_HIT_ABILITY_DEFINITIONS
  ) {

    if (
      hasPokemonAbility(
        actor,
        abilityId
      )
    ) {

      return {
        abilityId,
        definition
      };
    }
  }


  return null;
}


function abilityDisplayName(
  actor,
  abilityId
) {

  const item =
    actor?.items.find(
      candidate =>

        candidate.getFlag?.(
          MODULE_ID,
          "kind"
        ) ===
          "ability" &&

        candidate.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          abilityId
    );


  return (
    item?.name ??
    abilityId
  );
}

/* ============================================================
 * OPTIONAL TRIGGER DECISION
 *
 * Poke5e distingue entre:
 *
 * - roll ...
 * - may roll ...
 *
 * Las Abilities opcionales deben consultar al propietario
 * del Pokémon antes de tirar.
 * ============================================================ */

function escapeHtml(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function reactiveDecisionUser(
  actor
) {

  const users =
    Array.from(
      game.users ??
      []
    );


  const playerOwners =
    users.filter(
      user =>

        user.active ===
          true &&

        user.isGM !==
          true &&

        actor.testUserPermission?.(
          user,
          CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        ) ===
          true
    );


  const currentOwner =
    playerOwners.find(
      user =>
        user.id ===
          game.user.id
    );


  if (currentOwner) {

    return currentOwner;
  }


  if (
    playerOwners.length
  ) {

    return playerOwners[0];
  }


  return (
    game.users.activeGM ??
    users.find(
      user =>
        user.active ===
          true &&
        user.isGM ===
          true
    ) ??
    game.user
  );
}


async function confirmOptionalReactiveTrigger({
  sourceActor,
  attacker,
  abilityId,
  definition,
  outcome,
  context
}) {

  const decisionUser =
    reactiveDecisionUser(
      sourceActor
    );


  if (!decisionUser) {

    return false;
  }


  const abilityName =
    abilityDisplayName(
      sourceActor,
      abilityId
    );


  const moveName =
    context?.activity
      ?.item
      ?.name ??
    outcome.moveId ??
    "Move";


  const lang =
    language();


  const rollFormula =
    String(
      definition?.rollFormula ??
      ""
    ).trim() ||
    "1d4";


  const content =
    lang === "en"

      ? (
          `<p><strong>${escapeHtml(sourceActor.name)}</strong> was hit by ` +
          `<strong>${escapeHtml(attacker.name)}</strong> using ` +
          `<strong>${escapeHtml(moveName)}</strong>.</p>` +
          `<p>Use <strong>${escapeHtml(abilityName)}</strong> and roll ${escapeHtml(rollFormula)}?</p>`
        )

      : (
          `<p><strong>${escapeHtml(sourceActor.name)}</strong> fue golpeado por ` +
          `<strong>${escapeHtml(attacker.name)}</strong> usando ` +
          `<strong>${escapeHtml(moveName)}</strong>.</p>` +
          `<p>¿Usar <strong>${escapeHtml(abilityName)}</strong> y tirar ${escapeHtml(rollFormula)}?</p>`
        );


  const config = {

    window: {
      title:
        abilityName
    },

    content,

    yes: {
      label:
        lang === "en"
          ? `Roll ${rollFormula}`
          : `Tirar ${rollFormula}`
    },

    no: {
      label:
        lang === "en"
          ? "Do not use"
          : "No usar"
    },

    rejectClose:
      false,

    modal:
      true
  };


  try {

    const DialogV2 =
      foundry.applications
        .api
        .DialogV2;


    const response =
      decisionUser.id ===
        game.user.id

        ? await DialogV2.confirm(
            config
          )

        : await DialogV2.query(
            decisionUser,
            "confirm",
            config
          );


    return response ===
      true;

  } catch (
    error
  ) {

    console.warn(
      `[${MODULE_ID}] No se pudo solicitar la decisión de ${abilityName}.`,
      error
    );


    return false;
  }
}

/* ============================================================
 * SOURCE PROFICIENCY
 *
 * El PB pertenece al Pokémon que posee la Ability,
 * no al atacante.
 * ============================================================ */

function sourceProficiencyBonus(
  actor
) {

  const candidates = [

    actor?.getFlag?.(
      MODULE_ID,
      "proficiencyBonus"
    ),

    actor?.getFlag?.(
      MODULE_ID,
      "proficiency"
    ),

    actor?.system
      ?.attributes
      ?.prof
  ];


  for (
    const candidate
    of candidates
  ) {

    const value =
      Number(
        candidate
      );


    if (
      Number.isFinite(
        value
      ) &&
      value >= 0
    ) {

      return value;
    }
  }


  return 0;
}


/* ============================================================
 * TRIGGER ROLL
 * ============================================================ */

async function rollReactiveTrigger(
  formula
) {

  const roll =
    Roll.create(
      formula
    );


  await roll.evaluate();


  return roll;
}

function matchesReactiveTrigger(
  definition,
  roll
) {

  const total =
    Number(
      roll?.total
    );


  if (
    !Number.isFinite(
      total
    )
  ) {

    return false;
  }


  const exact =
    Number(
      definition
        ?.triggerTotal
    );


  if (
    Number.isFinite(
      exact
    )
  ) {

    return total ===
      exact;
  }


  const minimum =
    Number(
      definition
        ?.triggerRange
        ?.min
    );


  const maximum =
    Number(
      definition
        ?.triggerRange
        ?.max
    );


  const hasMinimum =
    Number.isFinite(
      minimum
    );


  const hasMaximum =
    Number.isFinite(
      maximum
    );


  if (
    !hasMinimum &&
    !hasMaximum
  ) {

    return false;
  }


  if (
    hasMinimum &&
    total < minimum
  ) {

    return false;
  }


  if (
    hasMaximum &&
    total > maximum
  ) {

    return false;
  }


  return true;
}


/* ============================================================
 * DAMAGE EFFECT
 *
 * IMPORTANTE:
 *
 * No usamos:
 *
 * attacker.applyDamage(amount)
 *
 * porque D&D5e interpreta la variante numérica como daño
 * directo e ignora las modificaciones por tipo.
 *
 * Usamos DamageDescription[] para conservar:
 *
 * - Electric
 * - Poison
 * - Grass
 * - resistencias
 * - vulnerabilidades
 * - inmunidades
 * ============================================================ */

async function applyReactiveDamage({
  sourceActor,
  attacker,
  definition
}) {

  if (
    definition.effect.amount !==
      "source-proficiency"
  ) {

    return null;
  }


  const amount =
    sourceProficiencyBonus(
      sourceActor
    );


  const damageType =
    definition.effect
      .damageType;


  if (
    amount <= 0
  ) {

    return {
      kind:
        "damage",

      amount:
        0,

      damageType
    };
  }


  await attacker.applyDamage([
    {
      value:
        amount,

      type:
        damageType
    }
  ]);


  return {
    kind:
      "damage",

    amount,
    damageType
  };
}

/* ============================================================
 * STATUS EFFECT
 *
 * El factory de status es la única autoridad de la estructura
 * del ActiveEffect. Turn Engine conserva las validaciones de:
 *
 * - inmunidad;
 * - Grace Period;
 * - exclusividad no-volátil.
 * ============================================================ */

async function applyReactiveStatus({
  sourceActor,
  attacker,
  abilityId,
  definition
}) {

  const status =
    definition.effect
      .status;


  if (!status) {

    return null;
  }


  const effect =
    buildPokemonStatusEffect(
      status,
      language(),
      {
        sourceAbility:
          abilityId,

        sourceReason:
          "reactive-hit",

        sourceProficiency:
          sourceProficiencyBonus(
            sourceActor
          )
      }
    );


  if (!effect) {

    return null;
  }


  const created =
    await attacker.createEmbeddedDocuments(
      "ActiveEffect",
      [
        effect
      ]
    );


  return {
    kind:
      "status",

    status,

    statusName:
      effect.name,

    applied:
      Array.isArray(
        created
      ) &&
      created.length > 0
  };
}

/* ============================================================
 * MOVEMENT LOCK
 *
 * Gooey:
 *
 * speed = 0
 * hasta el final del siguiente turno del atacante.
 * ============================================================ */

async function applyReactiveMovementLock({
  sourceActor,
  attacker,
  abilityId,
  definition
}) {

  if (
    definition.effect
      ?.speed !== 0 ||

    definition.effect
      ?.duration !==
        "end-of-next-turn"
  ) {

    return null;
  }


  const abilityName =
    abilityDisplayName(
      sourceActor,
      abilityId
    );


  const effectName =
    language() === "en"

      ? `${abilityName} — Speed 0`

      : `${abilityName} — Velocidad 0`;


  const application =
    await applyMovementLockUntilEndOfNextTurn(
      attacker,
      {
        name:
          effectName,

        sourceAbility:
          abilityId,

        sourceReason:
          "reactive-hit"
      }
    );


  return {
    kind:
      "movement-lock",

    speed:
      0,

    duration:
      "end-of-next-turn",

    applied:
      Boolean(
        application.effect
      ),

    refreshed:
      application.status ===
        "refreshed"
  };
}

/* ============================================================
 * FLINCH
 * ============================================================ */

async function applyReactiveFlinch({
  attacker,
  abilityId
}) {

  const application =
    await applyFlinched(
      attacker,
      {
        sourceAbility:
          abilityId,

        sourceReason:
          "reactive-hit"
      }
    );


  return {
    kind:
      "flinch",

    applied:
      Boolean(
        application.effect
      ),

    refreshed:
      application.status ===
        "refreshed"
  };
}

/* ============================================================
 * MOVE LOCK
 *
 * Cursed Body:
 *
 * el Move que produjo el impacto queda bloqueado
 * únicamente durante el siguiente turno del atacante.
 * ============================================================ */

async function applyReactiveMoveLock({
  sourceActor,
  attacker,
  abilityId,
  definition,
  outcome,
  context
}) {

  if (
    definition.effect
      ?.duration !==
        "next-turn"
  ) {

    return null;
  }


  const item =
    context?.activity
      ?.item ??
    null;


  const itemUuid =
    outcome?.itemUuid ??
    item?.uuid ??
    null;


  const moveId =
    outcome?.moveId ??
    item?.getFlag?.(
      MODULE_ID,
      "sourceId"
    ) ??
    null;


  if (
    !itemUuid &&
    !moveId
  ) {

    return null;
  }


  const moveName =
    item?.name ??
    moveId ??
    "Move";


  const abilityName =
    abilityDisplayName(
      sourceActor,
      abilityId
    );


  const effectName =
    language() === "en"

      ? `${abilityName} — ${moveName} locked`

      : `${abilityName} — ${moveName} bloqueado`;


  const application =
    await applyMoveLockUntilEndOfNextTurn(
      attacker,
      {
        name:
          effectName,

        img:
          item?.img ??
          "icons/svg/aura.svg",

        itemUuid,
        moveId,

        itemName:
          moveName,

        sourceAbility:
          abilityId,

        sourceActorUuid:
          sourceActor.uuid
      }
    );


  return {
    kind:
      "move-lock",

    moveName,

    duration:
      "next-turn",

    applied:
      Boolean(
        application.effect
      ),

    refreshed:
      application.status ===
        "refreshed"
  };
}

/* ============================================================
 * CHAT
 * ============================================================ */

function reactiveResultText(
  result,
  attacker
) {

  if (!result) {

    return "";
  }


  if (
    result.kind ===
      "damage"
  ) {

    return language() === "en"

      ? (
          `<strong>${result.amount} ${damageTypeLabel(result.damageType)} damage</strong> ` +
          `is applied to <strong>${attacker.name}</strong> ` +
          "before its resistances or vulnerabilities."
        )

      : (
          `Se aplican <strong>${result.amount} de daño ${damageTypeLabel(result.damageType)}</strong> ` +
          `a <strong>${attacker.name}</strong> ` +
          "antes de sus resistencias o vulnerabilidades."
        );
  }


  if (
    result.kind ===
      "status"
  ) {

    if (
      result.applied
    ) {

      return language() === "en"

        ? (
            `<strong>${attacker.name}</strong> becomes ` +
            `<strong>${result.statusName}</strong>.`
          )

        : (
            `<strong>${attacker.name}</strong> queda ` +
            `<strong>${result.statusName}</strong>.`
          );
    }


    /*
     * Turn Engine ya mostrará el motivo exacto:
     *
     * - inmunidad;
     * - Grace Period;
     * - otro estado no-volátil.
     */

    return language() === "en"

      ? (
          `<strong>${result.statusName}</strong> could not be applied ` +
          `to <strong>${attacker.name}</strong>.`
        )

      : (
          `No se pudo aplicar <strong>${result.statusName}</strong> ` +
          `a <strong>${attacker.name}</strong>.`
        );
  }

  if (
    result.kind ===
      "movement-lock"
  ) {

    if (!result.applied) {

      return language() === "en"

        ? (
            `The movement restriction could not be applied ` +
            `to <strong>${attacker.name}</strong>.`
          )

        : (
            `No se pudo aplicar la restricción de movimiento ` +
            `a <strong>${attacker.name}</strong>.`
          );
    }


    return language() === "en"

      ? (
          `<strong>${attacker.name}</strong>'s speed is reduced ` +
          `to <strong>0</strong> until the end of its next turn.`
        )

      : (
          `La velocidad de <strong>${attacker.name}</strong> ` +
          `se reduce a <strong>0</strong> hasta el final de su siguiente turno.`
        );
  }


  if (
    result.kind ===
      "flinch"
  ) {

    if (!result.applied) {

      return language() === "en"

        ? (
            `Flinched could not be applied to ` +
            `<strong>${attacker.name}</strong>.`
          )

        : (
            `No se pudo aplicar Retroceso a ` +
            `<strong>${attacker.name}</strong>.`
          );
    }


    return language() === "en"

      ? (
          `<strong>${attacker.name}</strong> is ` +
          `<strong>Flinched</strong> until the end of its next turn.`
        )

      : (
          `<strong>${attacker.name}</strong> sufre ` +
          `<strong>Retroceso</strong> hasta el final de su siguiente turno.`
        );
  }

  if (
    result.kind ===
      "move-lock"
  ) {

    if (!result.applied) {

      return language() === "en"

        ? (
            `<strong>${result.moveName}</strong> could not be locked ` +
            `for <strong>${attacker.name}</strong>.`
          )

        : (
            `No se pudo bloquear <strong>${result.moveName}</strong> ` +
            `para <strong>${attacker.name}</strong>.`
          );
    }


    return language() === "en"

      ? (
          `<strong>${attacker.name}</strong> cannot use ` +
          `<strong>${result.moveName}</strong> during its next turn.`
        )

      : (
          `<strong>${attacker.name}</strong> no podrá usar ` +
          `<strong>${result.moveName}</strong> durante su siguiente turno.`
        );
  }

  return "";
}

async function postReactiveResult({
  sourceActor,
  attacker,
  abilityId,
  roll,
  triggered,
  result
}) {

  const abilityName =
    abilityDisplayName(
      sourceActor,
      abilityId
    );


  const rollTotal =
    Number(
      roll.total
    );


  const rollFormula =
    String(
      roll.formula ??
      ""
    ).trim();


  let content;


  if (triggered) {

    const effectText =
      reactiveResultText(
        result,
        attacker
      );


    content =
      language() === "en"

        ? `
          <strong>${sourceActor.name}</strong>
          triggers <strong>${abilityName}</strong>:
          ${rollFormula} = <strong>${rollTotal}</strong>.
          ${effectText}
        `

        : `
          <strong>${sourceActor.name}</strong>
          activa <strong>${abilityName}</strong>:
          ${rollFormula} = <strong>${rollTotal}</strong>.
          ${effectText}
        `;

  } else {

    content =
      language() === "en"

        ? `
          <strong>${sourceActor.name}</strong>
          rolls <strong>${abilityName}</strong>:
          ${rollFormula} = <strong>${rollTotal}</strong>.
          The effect does not trigger.
        `

        : `
          <strong>${sourceActor.name}</strong>
          tira por <strong>${abilityName}</strong>:
          ${rollFormula} = <strong>${rollTotal}</strong>.
          El efecto no se activa.
        `;
  }


  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor:
          sourceActor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


/* ============================================================
 * ATTACK OUTCOME
 * ============================================================ */

async function onAttackOutcome(
  outcome,
  context
) {

  if (
    !isAttackHit(
      outcome
    ) ||
    !isMeleeAttack(
      outcome
    ) ||
    !outcome.actorUuid ||
    !outcome.targetActorUuid
  ) {

    return;
  }


  const attacker =
    actorFromUuid(
      outcome.actorUuid
    );


  const sourceActor =
    actorFromUuid(
      outcome.targetActorUuid
    );


  if (
    !attacker ||
    !sourceActor
  ) {

    return;
  }


  const reactive =
    activeReactiveDefinition(
      sourceActor
    );


  if (!reactive) {

    return;
  }

  if (CONTACT_REACTIVE_ABILITIES.has(reactive.abilityId) &&
    heldItemPreventsContactReactions(attacker, outcome.moveId)) {
    return;
  }


  /*
   * Abilities con "may".
   *
   * No se lanza ningún dado hasta que
   * el propietario acepta utilizarla.
   */

  if (
    reactive.definition
      .optional ===
        true
  ) {

    const accepted =
      await confirmOptionalReactiveTrigger({
        sourceActor,
        attacker,

        abilityId:
          reactive.abilityId,

        definition:
          reactive.definition,

        outcome,
        context
      });


    if (!accepted) {

      return;
    }
  }


  const roll =
    await rollReactiveTrigger(
      reactive.definition
        .rollFormula
    );


  const triggered =
    matchesReactiveTrigger(
      reactive.definition,
      roll
    );


  if (!triggered) {

    await postReactiveResult({
      sourceActor,
      attacker,

      abilityId:
        reactive.abilityId,

      roll,

      triggered:
        false,

      result:
        null
    });


    return;
  }


  const handler =
    REACTIVE_EFFECT_HANDLERS.get(
      reactive.definition
        .effect
        .kind
    );


  if (!handler) {

    throw new Error(
      `Reactive Hit effect no implementado: ` +
      `${reactive.definition.effect.kind}.`
    );
  }


  const result =
    await handler({
      sourceActor,
      attacker,

      abilityId:
        reactive.abilityId,

      definition:
        reactive.definition,

      outcome,
      context
    });


  await postReactiveResult({
    sourceActor,
    attacker,

    abilityId:
      reactive.abilityId,

    roll,

    triggered:
      true,

    result
  });
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonReactiveHitAbilityEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  subscribeAttackOutcome(
    onAttackOutcome
  );


  console.log(
    `[${MODULE_ID}] Reactive Hit Ability Engine registrado.`
  );
}
