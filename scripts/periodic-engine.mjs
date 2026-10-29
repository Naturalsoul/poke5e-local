import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { buildMoveItemForActor } from "./builder.mjs";
import { bindingDefinition } from "./binding-rules.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { isAuthority, actorFromUuid } from "./foundry-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

export async function synchronizeBindingMoves(actor) {
  for (const item of actor.items ?? []) {
    const move = item.getFlag(MODULE_ID, "moveDefinition");
    if (item.getFlag(MODULE_ID, "kind") !== "move" || !move ||
      !bindingDefinition(move) || item.getFlag(MODULE_ID, "bindingVersion") === 1) {continue;}
    const source = buildMoveItemForActor(move, actor, game.settings.get(MODULE_ID, "language"));
    const templates = source.effects.filter(effect => effect.flags?.[MODULE_ID]?.periodic?.kind === "binding");
    if (!periodicTemplate(item)) {await item.createEmbeddedDocuments("ActiveEffect", templates);}
    const updates = { [`flags.${MODULE_ID}.bindingVersion`]: 1 };
    for (const [id, activity] of Object.entries(source.system.activities)) {
      if (activity.flags?.[MODULE_ID]?.bindingContinuation && !item.system.activities?.get(id)) {
        updates[`system.activities.${id}`] = activity;
      }
    }
    await item.update(updates);
  }
}

export function validateBindingContinuation(activity) {
  if (!activity?.flags?.[MODULE_ID]?.bindingContinuation) {return true;}
  const targets = Array.from(game.user.targets ?? []).map(token => token.actor).filter(Boolean);
  if (targets.length === 1 && periodicEffects(targets[0]).some(effect =>
    effect.getFlag(MODULE_ID, "sourceItemUuid") === activity.item.uuid && !bindingExpired(effect))) {return true;}
  ui.notifications.warn(game.settings.get(MODULE_ID, "language") === "en"
    ? "Select the creature still affected by this binding. Remove its binding effect when it escapes."
    : "Selecciona la criatura que sigue atrapada por este movimiento. Elimina su efecto cuando escape.");
  return false;
}


/* ============================================================
 * POKEMON TYPES
 * ============================================================ */

function pokemonTypes(
  actor
) {

  const types =
    actor?.getFlag(
      MODULE_ID,
      "types"
    );


  return Array.isArray(
    types
  )
    ? types
    : [];
}


/* ============================================================
 * PERIODIC TEMPLATE
 * ============================================================ */

function periodicTemplate(
  item
) {

  if (!item) {

    return null;
  }


  return item.effects.find(
    effect =>

      effect.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        "pokemon-periodic"
  ) ?? null;
}


/* ============================================================
 * TODOS LOS ACTORS RELEVANTES
 *
 * Incluye:
 * - world actors
 * - synthetic token actors
 * ============================================================ */

function allActors() {

  const actors =
    new Map();


  for (
    const actor
    of game.actors
  ) {

    actors.set(
      actor.uuid,
      actor
    );
  }


  for (
    const token
    of canvas.tokens
      ?.placeables ??
      []
  ) {

    if (
      token.actor
  ) {

      actors.set(
        token.actor.uuid,
        token.actor
      );
    }
  }


  return [
    ...actors.values()
  ];
}

/* ============================================================
 * TOKEN / ACTOR IDENTITY
 *
 * Foundry puede representar un mismo Pokémon como:
 *
 * - Actor world estable;
 * - Actor sintético de un Token no enlazado.
 *
 * Para relaciones persistentes usamos el Actor world.
 * Para modificar HP durante combate preferimos el Actor
 * runtime del Token que está actualmente en escena.
 * ============================================================ */

function tokenDocumentForActor(
  actor
) {

  if (!actor) {

    return null;
  }


  for (
    const token
    of canvas.tokens
      ?.placeables ??
      []
  ) {

    const document =
      token.document;


    if (!document) {

      continue;
    }


    if (
      token.actor?.uuid ===
        actor.uuid ||

      document.baseActor?.uuid ===
        actor.uuid
    ) {

      return document;
    }
  }


  return null;
}


function canonicalActor(
  actor
) {

  if (!actor) {

    return null;
  }


  const tokenDocument =
    tokenDocumentForActor(
      actor
    );


  return (
    tokenDocument?.baseActor ??
    actor
  );
}


function canonicalActorUuid(
  actor
) {

  return (
    canonicalActor(
      actor
    )?.uuid ??
    actor?.uuid ??
    null
  );
}


function effectSourceCanonicalUuid(
  effect
) {

  const storedUuid =
    String(
      effect?.getFlag(
        MODULE_ID,
        "sourceActorUuid"
      ) ??
      ""
    ).trim();


  if (!storedUuid) {

    return null;
  }


  /*
   * Compatibilidad con efectos creados antes de este cambio:
   * sourceActorUuid podía contener un Actor sintético.
   */

  const storedActor =
    actorFromUuid(
      storedUuid
    );


  return (
    canonicalActorUuid(
      storedActor
    ) ??
    storedUuid
  );
}


function runtimeActorForCanonicalUuid(
  canonicalUuid,
  preferredTokenUuid = null
) {

  if (!canonicalUuid) {

    return null;
  }


  /*
   * Primero intentamos recuperar exactamente
   * el Token desde el cual se utilizó el Move.
   */

  if (preferredTokenUuid) {

    try {

      const tokenDocument =
        fromUuidSync(
          preferredTokenUuid,
          {
            strict:
              false
          }
        );


      if (
        tokenDocument?.actor &&

        tokenDocument.baseActor?.uuid ===
          canonicalUuid
      ) {

        return tokenDocument.actor;
      }

    } catch {

      /*
       * El Token pudo haber sido eliminado.
       * Continuamos con los fallbacks.
       */
    }
  }


  /*
   * Segundo:
   * cualquier Token actual que represente al Actor world.
   */

  for (
    const token
    of canvas.tokens
      ?.placeables ??
      []
  ) {

    if (
      token.document
        ?.baseActor
        ?.uuid !==
          canonicalUuid
    ) {

      continue;
    }


    if (token.actor) {

      return token.actor;
    }
  }


  /*
   * Finalmente usamos el Actor world.
   */

  return actorFromUuid(
    canonicalUuid
  );
}


function sourceActorForEffect(
  effect
) {

  const canonicalUuid =
    effectSourceCanonicalUuid(
      effect
    );


  if (!canonicalUuid) {

    return null;
  }


  return runtimeActorForCanonicalUuid(
    canonicalUuid,
    effect.getFlag(
      MODULE_ID,
      "sourceTokenUuid"
    )
  );
}


/* ============================================================
 * ENCONTRAR LEECH SEED DEL MISMO USUARIO
 * ============================================================ */

function sourceSeedEffects(
  sourceActorUuid
) {

  const results =
    [];


  for (
    const actor
    of allActors()
  ) {

    for (
      const effect
      of actor.effects
    ) {

      if (
        effect.disabled
      ) {

        continue;
      }


      if (
        effect.getFlag(
          MODULE_ID,
          "kind"
        ) !==
        "pokemon-periodic"
      ) {

        continue;
      }


      const periodic =
        effect.getFlag(
          MODULE_ID,
          "periodic"
        );


      if (
        periodic?.kind !==
        "leech-seed"
      ) {

        continue;
      }


      if (
        effectSourceCanonicalUuid(
          effect
        ) !==
          sourceActorUuid
      ) {

        continue;
      }


      results.push(
        effect
      );
    }
  }


  return results;
}


/* ============================================================
 * CREAR EFECTO
 * ============================================================ */

export async function applyPeriodicEffect(
  target,
  item
) {

  const template =
    periodicTemplate(
      item
    );


  if (!template) {

    throw new Error(
      `${item.name} no posee un efecto periódico.`
    );
  }


  const sourceActor =
    item.actor;

  const sourceActorUuid =
    canonicalActorUuid(
      sourceActor
    );


  if (!sourceActorUuid) {

    throw new Error(
      `${item.name} no pudo resolver su Actor origen canónico.`
    );
  }

  if (!sourceActor) {

    throw new Error(
      `${item.name} no tiene Actor origen.`
    );
  }


  const periodic =
    template.getFlag(
      MODULE_ID,
      "periodic"
    );

  if (periodic?.kind === "binding") {
    const existing = periodicEffects(target).find(effect =>
      effect.getFlag(MODULE_ID, "sourceItemUuid") === item.uuid);
    if (existing) {return existing;}
  }


  /* ==========================================================
   * SOURCE UNIQUE
   *
   * Leech Seed:
   * solo una criatura sembrada por atacante.
   * ========================================================== */

  if (
    periodic?.sourceUnique
  ) {

    const oldEffects =
      sourceSeedEffects(
        sourceActorUuid
      );


    for (
      const old
      of oldEffects
    ) {

      /*
       * Si ya está exactamente sobre este
       * objetivo, no creamos otra copia.
       */

      if (
        canonicalActorUuid(
          old.parent
        ) ===
        canonicalActorUuid(
          target
        )
      ) {

        ui.notifications.info(
          `${target.name} ya está afectado por ${template.name}.`
        );


        return old;
      }


      await old.delete();
    }
  }


  /* ==========================================================
   * COPIAR PLANTILLA
   * ========================================================== */

  const source =
    template.toObject();


  delete source._id;


  source.flags ??=
    {};


  source.flags[
    MODULE_ID
  ] = {

    ...(
      source.flags[
        MODULE_ID
      ] ??
      {}
    ),


    /*
    * Identidad persistente.
    *
    * Siempre intentamos guardar el Actor world,
    * no el Actor sintético del Token.
    */

    sourceActorUuid:
      canonicalActorUuid(
        sourceActor
      ) ??
      sourceActor.uuid,


    /*
    * Contexto runtime.
    *
    * Permite recuperar el Actor sintético exacto para
    * modificar su HP mientras el Token siga en escena.
    */

    sourceTokenUuid:
      tokenDocumentForActor(
        sourceActor
      )?.uuid ??
      null,


    sourceActorName:
      canonicalActor(
        sourceActor
      )?.name ??
      sourceActor.name,


    sourceItemUuid:
      item.uuid
  };


  if (periodic?.kind === "binding") {
    const held = isPokemonActor(sourceActor) ? getPokemonHeldItem(sourceActor) : null;
    const active = Number(held?.system?.quantity ?? 1) > 0;
    const heldId = active ? held?.getFlag(MODULE_ID, "sourceId") : null;
    const binding = foundry.utils.deepClone(periodic);
    if (binding.maxDurationSeconds) {binding.expiresAt = Number(game.time?.worldTime ?? 0) + binding.maxDurationSeconds;}
    binding.bindingBonus = heldId === "binding-band"
      ? Math.max(0, Number(sourceActor.system?.attributes?.prof ?? sourceActor.getFlag(MODULE_ID, "proficiencyBonus")) || 0) : 0;
    source.flags[MODULE_ID].periodic = binding;
    if (binding.concentration) {
      const concentration = Array.from(sourceActor.concentration?.effects ?? []).find(effect =>
        !effect.disabled && effect.origin === item.uuid);
      if (!concentration) {throw new Error(`${item.name}: debes mantener la concentración antes de aplicar el atrapamiento.`);}
      source.flags.dnd5e = { ...source.flags.dnd5e, dependentOn: concentration.uuid };
    }
  }

  const created =
    await target.createEmbeddedDocuments(
      "ActiveEffect",
      [
        source
      ]
    );


  const effect =
    created[0];


  ui.notifications.info(
    `${target.name}: ${effect.name}`
  );


  return effect;
}


/* ============================================================
 * INSERTAR BOTÓN EN USAGE MESSAGE
 * ============================================================ */

function onPreCreateUsageMessage(
  activity,
  messageConfig
) {

  if (activity?.flags?.[MODULE_ID]?.bindingContinuation) {return;}

  const item =
    activity?.item;


  if (!item) {

    return;
  }


  const template =
    periodicTemplate(
      item
    );


  if (!template) {

    return;
  }


  if (
    !template.getFlag(
      MODULE_ID,
      "customApplication"
    )
  ) {

    return;
  }


  const content =
    messageConfig
      ?.data
      ?.content;


  if (
    typeof content !==
    "string"
  ) {

    return;
  }


  const wrapper =
    document.createElement(
      "div"
    );


  wrapper.innerHTML =
    content;


  const card =
    wrapper.querySelector(
      ".chat-card.activation-card"
    )
    ??
    wrapper.querySelector(
      ".chat-card"
    );


  if (!card) {

    return;
  }


  let buttons =
    card.querySelector(
      ".card-buttons"
    );


  if (!buttons) {

    buttons =
      document.createElement(
        "div"
      );


    buttons.className =
      "card-buttons";


    const footer =
      card.querySelector(
        ".card-footer"
      );


    if (footer) {

      card.insertBefore(
        buttons,
        footer
      );

    } else {

      card.appendChild(
        buttons
      );
    }
  }


  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.dataset
    .poke5eAction =
    "apply-periodic";


  button.dataset
    .itemUuid =
    item.uuid;


  button.innerHTML = `
    <i class="fa-solid fa-seedling"></i>
    <span>Aplicar efecto al objetivo</span>
  `;


  buttons.appendChild(
    button
  );


  messageConfig.data.content =
    wrapper.innerHTML;
}


/* ============================================================
 * CLICK
 * ============================================================ */

async function onDocumentClick(
  event
) {

  const button =
    event.target
      ?.closest?.(
        '[data-poke5e-action="apply-periodic"]'
      );


  if (!button) {

    return;
  }


  event.preventDefault();
  event.stopPropagation();


  if (
    !game.user.isGM
  ) {

    ui.notifications.warn(
      "Solo el GM puede aplicar efectos Pokémon por ahora."
    );


    return;
  }


  /* ==========================================================
   * EXACTAMENTE UN TARGET
   * ========================================================== */

  if (
    game.user.targets.size !==
    1
  ) {

    ui.notifications.warn(
      "Selecciona exactamente un objetivo."
    );


    return;
  }


  const token =
    [...game.user.targets][0];


  const target =
    token?.actor;


  if (!target) {

    return;
  }


  const item =
    fromUuidSync(
      button.dataset
        .itemUuid,
      {
        strict:
          false
      }
    );


  if (!item) {

    ui.notifications.error(
      "No se encontró el movimiento original."
    );


    return;
  }


  button.disabled =
    true;


  try {

    await applyPeriodicEffect(
      target,
      item
    );

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] Error aplicando periodic effect:`,
      error
    );


    ui.notifications.error(
      "No se pudo aplicar el efecto periódico."
    );

  } finally {

    button.disabled =
      false;
  }
}


/* ============================================================
 * EFECTOS PERIÓDICOS DE UN ACTOR
 * ============================================================ */

function periodicEffects(
  actor
) {

  return actor.effects.filter(
    effect =>

      !effect.disabled &&

      effect.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        "pokemon-periodic"
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
 * LEECH SEED
 * ============================================================ */

async function processLeechSeed(
  target,
  effect,
  periodic
) {

  /* ==========================================================
   * SI YA ESTÁ FUERA DE COMBATE / FAINTED
   * ========================================================== */

  const currentHp =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  if (
    periodic.removeWhenFainted &&
    currentHp <= 0
  ) {

    await effect.delete();

    return;
  }


  /* ==========================================================
   * INMUNIDAD GRASS ESPECÍFICA DE LEECH SEED
   * ========================================================== */

  const immunities =
    periodic.damageImmunityTypes ??
    [];


  const types =
    pokemonTypes(
      target
    );


  const immune =
    immunities.some(
      type =>
        types.includes(
          type
        )
    );


  if (immune) {

    await chat(
      target,
      `
        <strong>${target.name}</strong>
        es inmune al daño de
        <strong>${effect.name}</strong>.
      `
    );


    return;
  }


  /* ==========================================================
   * TIRADA
   * ========================================================== */

  const formula =
    periodic.damage
      ?.formula;


  if (!formula) {

    return;
  }


  const roll =
    await new Roll(
      formula
    ).evaluate();


  await publishRollBeforeDamage(roll, {

    speaker:
      ChatMessage.getSpeaker({
        actor:
          target
      }),

    flavor:
      `${effect.name} — daño periódico`
  });


  /* ==========================================================
   * MEDIR DAÑO REAL APLICADO
   *
   * Incluimos HP temporal porque también
   * constituye daño realmente absorbido.
   * ========================================================== */

  const hpBefore =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  const tempBefore =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.temp ??
      0
    );


  /* ==========================================================
   * DAÑO TIPADO GRASS
   *
   * D&D5e calculará resistencias,
   * vulnerabilidades e inmunidades.
   * ========================================================== */

  await target.applyDamage(
    [
      {

        value:
          roll.total,

        type:
          periodic.damage.type ??
          "grass"
      }
    ]
  );


  const hpAfter =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  const tempAfter =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.temp ??
      0
    );


  const actualDamage =
    Math.max(

      0,

      (
        hpBefore +
        tempBefore
      )

      -

      (
        hpAfter +
        tempAfter
      )
    );


  /* ==========================================================
   * DRENAJE
   * ========================================================== */

  if (
    actualDamage > 0 &&
    periodic.drain
  ) {

    const sourceActor =
      sourceActorForEffect(
        effect
      );


    if (sourceActor) {

      const sourceHp =
        sourceActor.system
          ?.attributes
          ?.hp;


      /*
       * Por ahora curamos automáticamente
       * al usuario original.
       *
       * La transferencia a otro Pokémon
       * del mismo entrenador llegará cuando
       * tengamos el modelo Trainer/Switching.
       */

      if (
        Number(
          sourceHp?.value ??
          0
        ) > 0
      ) {

        const requested =
          Math.floor(

            actualDamage *

            Number(
              periodic.drain
                .fraction ??
              0
            )
          );


        const missing =
          Math.max(

            0,

            Number(
              sourceHp?.max ??
              0
            )

            -

            Number(
              sourceHp?.value ??
              0
            )
          );


        const healing =
          Math.min(
            requested,
            missing
          );


        if (
          healing > 0
        ) {

          await sourceActor.applyDamage(
            -healing
          );


          await chat(
            sourceActor,
            `
              <strong>${sourceActor.name}</strong>
              recupera
              <strong>${healing} HP</strong>
              gracias a
              <strong>${effect.name}</strong>.
            `
          );
        }
      }
    }
  }


  /* ==========================================================
   * SI LEECH SEED LO HIZO FAINT
   * ========================================================== */

  const finalHp =
    Number(
      target.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  if (
    periodic.removeWhenFainted &&
    finalHp <= 0
  ) {

    await effect.delete();
  }
}


const BINDING_DAMAGE_APPLIED = Symbol("binding-damage-applied");
const bindingClaims = new Map();

function bindingExpired(effect) {
  const expiresAt = effect.getFlag(MODULE_ID, "periodic")?.expiresAt;
  return expiresAt != null && Number(game.time?.worldTime ?? 0) >= expiresAt;
}

function bindingRoundKey(effect) {
  if (!game.combat?.id || !game.combat.round) {return null;}
  return `${effect.getFlag(MODULE_ID, "sourceActorUuid")}:${game.combat.id}:${game.combat.round}`;
}

function availableBindingBonus(actor, effect) {
  const key = bindingRoundKey(effect);
  if (!key || bindingClaims.get(actor.uuid)?.includes(key) ||
    (actor.getFlag(MODULE_ID, "bindingDamageRounds") ?? []).includes(key)) {return 0;}
  return Number(effect.getFlag(MODULE_ID, "periodic")?.bindingBonus ?? 0);
}

async function recordBindingRound(actor, key) {
  if (!key) {return;}
  const history = actor.getFlag(MODULE_ID, "bindingDamageRounds") ?? [];
  if (!history.includes(key)) {await actor.setFlag(MODULE_ID, "bindingDamageRounds", [...history.slice(-31), key]);}
}

export function applyBindingDamageBonus(actor, damages, options) {
  if (damages[BINDING_DAMAGE_APPLIED]) {return;}
  if (options?.[MODULE_ID]) {delete options[MODULE_ID].bindingRound;}
  const message = options?.originatingMessage;
  const activity = message?.getAssociatedActivity?.();
  if (!activity?.flags?.[MODULE_ID]?.bindingContinuation || !(damages.amount > 0)) {return;}
  const item = message.getAssociatedItem?.();
  const effect = periodicEffects(actor).find(entry =>
    entry.getFlag(MODULE_ID, "sourceItemUuid") === item?.uuid &&
    entry.getFlag(MODULE_ID, "periodic")?.kind === "binding" && !bindingExpired(entry));
  if (!effect) {return;}
  const bonus = Math.max(0, Math.trunc(availableBindingBonus(actor, effect) * Number(options.multiplier ?? 1)));
  const part = damages.find(entry => entry.value > 0 && !["healing", "temphp", "maximum"].includes(entry.type));
  if (!bonus || !part) {return;}
  part.value += bonus;
  damages.amount += bonus;
  damages[BINDING_DAMAGE_APPLIED] = true;
  options[MODULE_ID] ??= {};
  options[MODULE_ID].bindingRound = bindingRoundKey(effect);
}

export function captureBindingDamage(actor, options) {
  const key = options?.[MODULE_ID]?.bindingRound;
  if (key && options[MODULE_ID].heldItemDamageApplied > 0) {
    const prior = bindingClaims.get(actor.uuid) ?? [];
    bindingClaims.set(actor.uuid, [...prior.slice(-31), key]);
  }
}

export async function recordBindingDamage(actor, amount, options) {
  if (amount > 0 && options?.[MODULE_ID]?.heldItemDamageApplied !== 0) {
    await recordBindingRound(actor, options?.[MODULE_ID]?.bindingRound);
  }
}

async function processBindingEndTurn(actor, effect, periodic) {
  if (!(actor.system?.attributes?.hp?.value > 0) || !(periodic.remainingTurns > 0)) {
    await effect.delete();
    return;
  }
  const source = sourceActorForEffect(effect);
  const concentration = effect.getFlag("dnd5e", "dependentOn");
  if (!source || !(source.system?.attributes?.hp?.value > 0) ||
    (periodic.concentration && !actorFromConcentrationUuid(concentration))) {
    await effect.delete();
    return;
  }
  const turn = `${game.combat?.id}:${game.combat?.round}:${game.combat?.turn}`;
  if (periodic.lastTurn === turn) {return;}
  const bonus = availableBindingBonus(actor, effect);
  const roll = await new Roll(`(${periodic.damage.formula}) + ${bonus}`).evaluate();
  await effect.setFlag(MODULE_ID, "periodic", {
    ...periodic, lastTurn: turn, remainingTurns: periodic.remainingTurns - 1
  });
  if (bonus) {await recordBindingRound(actor, bindingRoundKey(effect));}
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor: effect.name });
  await actor.applyDamage([{ value: roll.total, type: periodic.damage.type }]);
  if (periodic.remainingTurns <= 1 || actor.system.attributes.hp.value <= 0) {await effect.delete();}
}

function actorFromConcentrationUuid(uuid) {
  if (!uuid) {return null;}
  try {
    const effect = fromUuidSync(uuid, { strict: false });
    return effect && !effect.disabled ? effect : null;
  } catch { return null; }
}

/* ============================================================
 * PUBLIC: END TURN
 * ============================================================ */

export async function processPokemonPeriodicEndTurn(
  actor
) {

  const effects =
    periodicEffects(
      actor
    );


  for (
    const effect
    of effects
  ) {

    const periodic =
      effect.getFlag(
        MODULE_ID,
        "periodic"
      );


    if (periodic?.kind === "binding" && (bindingExpired(effect) ||
      !(actor.system?.attributes?.hp?.value > 0) ||
      !(sourceActorForEffect(effect)?.system?.attributes?.hp?.value > 0))) {
      await effect.delete();
      continue;
    }

    if (
      !periodic ||
      periodic.timing !==
        "end-turn"
    ) {

      continue;
    }


    switch (
      periodic.kind
    ) {

      case "binding":
        await processBindingEndTurn(actor, effect, periodic);
        break;

      case "leech-seed":

        await processLeechSeed(
          actor,
          effect,
          periodic
        );

        break;
    }
  }
}

/* ============================================================
 * PUBLIC: SWITCH CLEANUP
 *
 * Un efecto removeOnSwitch puede estar relacionado con el
 * Pokémon que abandona el campo de dos formas:
 *
 * 1. El efecto está aplicado SOBRE ese Pokémon.
 * 2. El Pokémon es la FUENTE de un efecto aplicado a otro Actor.
 *
 * Leech Seed necesita ambos casos.
 * ============================================================ */

function switchRemovablePeriodicEffects(
  actor
) {

  const outgoingCanonicalUuid =
    canonicalActorUuid(
      actor
    );


  if (!outgoingCanonicalUuid) {

    return [];
  }


  const effects =
    new Set();


  /*
   * Recorremos world Actors + synthetic Token Actors.
   *
   * Un efecto se elimina si:
   *
   * A) está aplicado al Pokémon que abandona el campo;
   * B) ese Pokémon es la fuente que mantiene el efecto.
   */

  for (
    const candidate
    of allActors()
  ) {

    const targetCanonicalUuid =
      canonicalActorUuid(
        candidate
      );


    for (
      const effect
      of candidate.effects
    ) {

      if (
        effect.getFlag(
          MODULE_ID,
          "kind"
        ) !==
          "pokemon-periodic"
      ) {

        continue;
      }


      if (
        !effect.getFlag(
          MODULE_ID,
          "periodic"
        )
          ?.removeOnSwitch
      ) {

        continue;
      }


      const appliedToOutgoing =
        targetCanonicalUuid ===
          outgoingCanonicalUuid;


      const sourcedByOutgoing =
        effectSourceCanonicalUuid(
          effect
        ) ===
          outgoingCanonicalUuid;


      if (
        !appliedToOutgoing &&
        !sourcedByOutgoing
      ) {

        continue;
      }


      effects.add(
        effect
      );
    }
  }


  return [
    ...effects
  ];
}


export async function removePokemonPeriodicEffectsOnSwitch(
  actor
) {

  const effects =
    switchRemovablePeriodicEffects(
      actor
    );


  for (
    const effect
    of effects
  ) {

    await effect.delete();
  }


  return effects.length;
}

function recoveryPeriodicEffects(
  actor
) {

  const recoveredCanonicalUuid =
    canonicalActorUuid(
      actor
    );


  if (
    !recoveredCanonicalUuid
  ) {

    return [];
  }


  const effects =
    new Set();


  for (
    const candidate
    of allActors()
  ) {

    const targetCanonicalUuid =
      canonicalActorUuid(
        candidate
      );


    for (
      const effect
      of candidate.effects
    ) {

      if (
        effect.getFlag(
          MODULE_ID,
          "kind"
        ) !==
          "pokemon-periodic"
      ) {

        continue;
      }


      const appliedToRecovered =
        targetCanonicalUuid ===
          recoveredCanonicalUuid;


      const sourcedByRecovered =
        effectSourceCanonicalUuid(
          effect
        ) ===
          recoveredCanonicalUuid;


      if (
        appliedToRecovered ||
        sourcedByRecovered
      ) {

        effects.add(
          effect
        );
      }
    }
  }


  return [
    ...effects
  ];
}


export async function removePokemonPeriodicEffectsForRecovery(
  actor
) {

  const effects =
    recoveryPeriodicEffects(
      actor
    );


  for (
    const effect
    of effects
  ) {

    await effect.delete();
  }


  return effects.length;
}

/* ============================================================
 * COMBAT END
 * ============================================================ */

async function onDeleteCombat() {

  if (
    !isAuthority()
  ) {

    return;
  }


  for (
    const actor
    of allActors()
  ) {

    const effects =
      actor.effects.filter(
        effect => {

          if (
            effect.getFlag(
              MODULE_ID,
              "kind"
            ) !==
              "pokemon-periodic"
          ) {

            return false;
          }


          return Boolean(
            effect.getFlag(
              MODULE_ID,
              "periodic"
            )
              ?.removeOnCombatEnd
          );
        }
      );


    if (
      effects.length
    ) {

      await actor.deleteEmbeddedDocuments(

        "ActiveEffect",

        effects.map(
          effect =>
            effect.id
        )
      );
    }
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonPeriodicEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;

  Hooks.on("dnd5e.preUseActivity", validateBindingContinuation);


  Hooks.on(
    "dnd5e.preCreateUsageMessage",
    onPreCreateUsageMessage
  );


  Hooks.on(
    "deleteCombat",
    onDeleteCombat
  );

  Hooks.on(
    "poke5ePokemonSwitchingOut",
    async actor => {

      if (
        !isAuthority()
      ) {

        return;
      }


      await removePokemonPeriodicEffectsOnSwitch(
        actor
      );
    }
  );


  document.addEventListener(
    "click",
    onDocumentClick
  );


  console.log(
    `[${MODULE_ID}] Periodic Effect Engine registrado.`
  );
}
