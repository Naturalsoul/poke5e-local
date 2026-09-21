const MODULE_ID =
  "poke5e-local";


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
 * RESOLVER ACTOR UUID
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

async function applyPeriodicEffect(
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


  await roll.toMessage({

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