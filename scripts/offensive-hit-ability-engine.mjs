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

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * DEFINITIONS
 *
 * Abilities que reaccionan a un ataque realizado
 * por el propio Pokémon después de impactar.
 * ============================================================ */

const OFFENSIVE_HIT_ABILITY_DEFINITIONS =
  new Map([
    [
      "poison-touch",
      Object.freeze({
        attackScope:
          "melee",

        rollFormula:
          "1d10",

        triggerTotal:
          10,

        effect:
          Object.freeze({
            kind:
              "status",

            status:
              "poisoned"
          })
      })
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


/* ============================================================
 * UUID -> ACTOR
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
 * ACTIVE OFFENSIVE ABILITY
 *
 * hasPokemonAbility() consulta exclusivamente
 * la Ability activa del Pokémon.
 * ============================================================ */

function activeOffensiveDefinition(
  actor
) {

  for (
    const [
      abilityId,
      definition
    ]
    of OFFENSIVE_HIT_ABILITY_DEFINITIONS
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

  const ability =
    actor?.items.find(
      item =>

        item.getFlag?.(
          MODULE_ID,
          "kind"
        ) ===
          "ability" &&

        item.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          abilityId
    );


  return (
    ability?.name ??
    abilityId
  );
}


/* ============================================================
 * TRIGGER ROLL
 * ============================================================ */

async function rollOffensiveTrigger(
  formula
) {

  const roll =
    Roll.create(
      formula
    );


  await roll.evaluate();


  return roll;
}


/* ============================================================
 * STATUS EFFECT
 *
 * La estructura del estado pertenece a status-effects.
 *
 * Turn Engine decidirá posteriormente si puede aplicarse:
 *
 * - inmunidad Poison/Steel;
 * - Grace Period;
 * - otro estado no-volátil.
 * ============================================================ */

async function applyOffensiveStatus({
  targetActor,
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
          "offensive-hit"
      }
    );


  if (!effect) {

    return null;
  }


  const created =
    await targetActor.createEmbeddedDocuments(
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
 * EFFECT HANDLERS
 *
 * Preparado para futuras familias:
 *
 * status
 * damage
 * modifier
 * movement
 * etc.
 * ============================================================ */

const OFFENSIVE_EFFECT_HANDLERS =
  new Map([
    [
      "status",
      applyOffensiveStatus
    ]
  ]);


/* ============================================================
 * CHAT
 * ============================================================ */

function statusResultText(
  result,
  targetActor
) {

  if (!result) {

    return "";
  }


  if (
    result.applied
  ) {

    return language() === "en"

      ? (
          `<strong>${targetActor.name}</strong> becomes ` +
          `<strong>${result.statusName}</strong>.`
        )

      : (
          `<strong>${targetActor.name}</strong> queda ` +
          `<strong>${result.statusName}</strong>.`
        );
  }


  /*
   * Turn Engine ya informa la causa concreta:
   *
   * - inmunidad;
   * - Grace Period;
   * - otro estado no-volátil.
   */

  return language() === "en"

    ? (
        `<strong>${result.statusName}</strong> could not be applied ` +
        `to <strong>${targetActor.name}</strong>.`
      )

    : (
        `No se pudo aplicar <strong>${result.statusName}</strong> ` +
        `a <strong>${targetActor.name}</strong>.`
      );
}


async function postOffensiveResult({
  sourceActor,
  targetActor,
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


  const rollFormula =
    String(
      roll.formula ??
      ""
    ).trim();


  const rollTotal =
    Number(
      roll.total
    );


  let content;


  if (
    triggered
  ) {

    const effectText =
      statusResultText(
        result,
        targetActor
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
  outcome
) {

  /*
   * Poison Touch:
   *
   * - el ataque debe impactar;
   * - la Ability pertenece al atacante;
   * - posteriormente verificamos el scope requerido.
   */

  if (
    !isAttackHit(
      outcome
    ) ||
    !outcome.actorUuid ||
    !outcome.targetActorUuid
  ) {

    return;
  }


  const sourceActor =
    actorFromUuid(
      outcome.actorUuid
    );


  const targetActor =
    actorFromUuid(
      outcome.targetActorUuid
    );


  if (
    !sourceActor ||
    !targetActor
  ) {

    return;
  }


  const offensive =
    activeOffensiveDefinition(
      sourceActor
    );


  if (!offensive) {

    return;
  }


  /*
   * La definición decide qué clase de ataque admite.
   *
   * Poison Touch actualmente exige melee.
   */

  if (
    offensive.definition
      .attackScope ===
        "melee" &&

    !isMeleeAttack(
      outcome
    )
  ) {

    return;
  }


  const roll =
    await rollOffensiveTrigger(
      offensive.definition
        .rollFormula
    );


  const triggered =
    Number(
      roll.total
    ) ===
      offensive.definition
        .triggerTotal;


  if (!triggered) {

    await postOffensiveResult({
      sourceActor,
      targetActor,

      abilityId:
        offensive.abilityId,

      roll,

      triggered:
        false,

      result:
        null
    });


    return;
  }


  const handler =
    OFFENSIVE_EFFECT_HANDLERS.get(
      offensive.definition
        .effect
        .kind
    );


  if (!handler) {

    throw new Error(
      "Offensive Hit effect no implementado: " +
      `${offensive.definition.effect.kind}.`
    );
  }


  const result =
    await handler({
      sourceActor,
      targetActor,

      abilityId:
        offensive.abilityId,

      definition:
        offensive.definition
    });


  await postOffensiveResult({
    sourceActor,
    targetActor,

    abilityId:
      offensive.abilityId,

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


export function registerPokemonOffensiveHitAbilityEngine() {

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
    `[${MODULE_ID}] Offensive Hit Ability Engine registrado.`
  );
}