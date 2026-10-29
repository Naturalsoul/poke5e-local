import { AUTOMATED_MODIFIER_MOVES } from "./modifier-effects.mjs";
import { refreshEndOfNextTurnDuration } from "./turn-duration-runtime.mjs";
import { actorFromUuid } from "./foundry-runtime.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * TEMPLATE DE MODIFICADOR
 * ============================================================ */

function modifierTemplate(
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
      "pokemon-modifier"
  ) ?? null;
}


/* ============================================================
 * ¿ACUMULABLE?
 * ============================================================ */

function isStackable(
  effect
) {

  return (
    Number(
      effect?.getFlag(
        MODULE_ID,
        "maxStacks"
      ) ??
      1
    ) > 1
  );
}


/* ============================================================
 * BUSCAR MODIFICADOR YA ACTIVO
 * ============================================================ */

function existingModifier(
  actor,
  stackKey
) {

  return actor.effects.find(
    effect =>

      !effect.disabled &&

      effect.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        "pokemon-modifier" &&

      effect.getFlag(
        MODULE_ID,
        "stackKey"
      ) ===
        stackKey
  ) ?? null;
}

/* ============================================================
 * TOKEN DEL ACTOR EN LA ESCENA ACTUAL
 * ============================================================ */

function tokenForActor(
  actor
) {

  if (!actor) {

    return null;
  }


  /*
   * Primero preferimos el Token controlado.
   */

  const controlled =
    canvas.tokens
      ?.controlled
      ?.find(
        token =>
          token.actor?.id ===
          actor.id
      );


  if (controlled) {

    return controlled;
  }


  /*
   * Si no está controlado,
   * usamos el primer Token de ese Actor.
   */

  return (
    canvas.tokens
      ?.placeables
      ?.find(
        token =>
          token.actor?.id ===
          actor.id
      )
    ??
    null
  );
}


/* ============================================================
 * CONTEXTO DEL ORIGEN
 * ============================================================ */

// side: the source's disposition for targeted attacks, null otherwise.
function sourceStackKey(template, baseStackKey, side, actor) {
  const perActor = `${baseStackKey}|actor:${actor?.uuid ?? "unknown"}`;
  // Roll modes tied to their user (Crush Claw, Sweet Scent) stay separate per user.
  if (template.getFlag(MODULE_ID, "rollModes")?.vsSource) {return perActor;}
  if (side === null) {return baseStackKey;}
  return side !== 0 ? `${baseStackKey}|side:${side}` : perActor;
}

function sourceContext(
  item,
  template
) {

  const actor =
    item.actor;


  const token =
    tokenForActor(
      actor
    );


  const disposition =
    Number(
      token?.document
        ?.disposition ??
      0
    );


  const targetedAttack =
    template.getFlag(
      MODULE_ID,
      "targetedAttack"
    );


  const baseStackKey =
    template.getFlag(
      MODULE_ID,
      "stackKey"
    );


  /*
   * Growl / Acid Spray:
   *
   * stackKey normal.
   *
   * Tail Whip / Leer / Screech:
   *
   * separamos por bando.
   *
   * Esto evita que Tail Whip lanzado por
   * ambos bandos termine mezclado en un
   * único efecto.
   */

  const stackKey =
    sourceStackKey(
      template,
      baseStackKey,
      targetedAttack ? disposition : null,
      actor
    );


  return {

    stackKey,

    sourceActorUuid:
      actor?.uuid ??
      null,

    sourceTokenUuid:
      token?.document
        ?.uuid ??
      null,

    sourceDisposition:
      disposition
  };
}


/* ============================================================
 * ESCALAR CHANGES
 *
 * Growl:
 *
 * stack 1 = -1
 * stack 2 = -2
 * ...
 *
 * Acid Spray:
 *
 * stack 1 = AC -1
 * stack 2 = AC -2
 * stack 3 = AC -3
 * ============================================================ */

function scaledChanges(
  template,
  count
) {

  const base =
    template.getFlag(
      MODULE_ID,
      "baseChanges"
    ) ??
    Array.from(
      template.changes ??
      []
    );


  return Array.from(
    base
  ).map(
    change => {

      const clone =
        foundry.utils.deepClone(
          change
        );


      const numeric =
        Number(
          clone.value
        );


      if (
        Number.isFinite(
          numeric
        )
      ) {

        clone.value =
          String(
            numeric * count
          );
      }


      return clone;
    }
  );
}


/* ============================================================
 * NOMBRE DINÁMICO
 * ============================================================ */

function effectDisplayName(
  template,
  count,
  max
) {

  /*
   * Quitamos primero cualquier marcador
   * anterior de stacks.
   */

  let base =
    String(
      template.name
    )
      .replace(
        /\s+\(\d+\/\d+\)$/,
        ""
      );


  /*
   * Growl — Ataques -1
   *
   * se transforma visualmente en:
   *
   * Growl — Ataques -3 (3/5)
   *
   * Esto es puramente presentación.
   */

  const numericMatch =
    base.match(
      /^(.*?)([+-])1$/
    );


  if (
    numericMatch &&
    max > 1
  ) {

    base =
      `${numericMatch[1]}${numericMatch[2]}${count}`;
  }


  return max > 1

    ? `${base} (${count}/${max})`

    : base;
}


/* ============================================================
 * CREAR PRIMER STACK
 * ============================================================ */

async function createFirstStack(
  actor,
  template,
  context,
  dependentOn
) {

  const source =
    template.toObject();


  /*
   * La plantilla del Move mantiene su ID.
   *
   * La instancia del Actor obtiene uno nuevo.
   */

  delete source._id;


  const maxStacks =
    Math.max(
      1,
      Number(
        template.getFlag(
          MODULE_ID,
          "maxStacks"
        ) ??
        1
      )
    );


  source.name =
    effectDisplayName(
      template,
      1,
      maxStacks
    );


  source.changes =
    scaledChanges(
      template,
      1
    );


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

    stackCount:
      1,

    maxStacks,

    stackKey:
        context.stackKey,

    sourceActorUuid:
        context.sourceActorUuid,

    sourceTokenUuid:
        context.sourceTokenUuid,

    sourceDisposition:
        context.sourceDisposition,
  };


  /*
   * D&D5e elimina el efecto cuando termina
   * la concentración de la que depende.
   */
  if (dependentOn) {
    source.flags.dnd5e = {
      ...(
        source.flags.dnd5e ??
        {}
      ),
      dependentOn
    };
  }


  const created =
    await actor.createEmbeddedDocuments(
      "ActiveEffect",
      [
        source
      ]
    );


  return created[0];
}


/* ============================================================
 * AUMENTAR INTENSIDAD
 * ============================================================ */

async function increaseStack(
  actor,
  existing,
  template
) {

  const current =
    Math.max(
      1,
      Number(
        existing.getFlag(
          MODULE_ID,
          "stackCount"
        ) ??
        1
      )
    );


  const max =
    Math.max(
      1,
      Number(
        template.getFlag(
          MODULE_ID,
          "maxStacks"
        ) ??
        1
      )
    );


  /* ==========================================================
   * MÁXIMO
   * ========================================================== */

  if (
    current >= max
  ) {

    ui.notifications.info(
      `${existing.name}: máximo alcanzado.`
    );


    return {

      status:
        "max",

      count:
        current,

      max
    };
  }


  /* ==========================================================
   * SIGUIENTE NIVEL
   * ========================================================== */

  const next =
    current + 1;


  await existing.update({

    name:
      effectDisplayName(
        template,
        next,
        max
      ),

    changes:
      scaledChanges(
        template,
        next
      ),

    [`flags.${MODULE_ID}.stackCount`]:
      next,

    [`flags.${MODULE_ID}.maxStacks`]:
      max
  });


  return {

    status:
      "increased",

    count:
      next,

    max
  };
}


/* ============================================================
 * APLICAR / ACUMULAR
 * ============================================================ */

export async function applyPokemonMoveModifier(
  actor,
  item,
  {
    dependentOn = null
  } = {}
) {

  const template =
    modifierTemplate(
      item
    );


  if (
    !template
  ) {

    throw new Error(
      `${item?.name ?? "Move"} no tiene modificador.`
    );
  }


  const context =
    sourceContext(
        item,
        template
    );


    const stackKey =
        context.stackKey;


  if (!stackKey) {

    throw new Error(
      `${item.name}: falta stackKey.`
    );
  }


  const existing =
    existingModifier(
      actor,
      stackKey
    );


  /* ==========================================================
   * PRIMERA APLICACIÓN
   * ========================================================== */

  if (!existing) {

    const created =
      await createFirstStack(
        actor,
        template,
        context,
        dependentOn
      );


    ui.notifications.info(
      `${actor.name}: ${created.name}`
    );


    return {

      status:
        "created",

      count:
        1
    };
  }


  /* ==========================================================
   * ACUMULAR
   * ========================================================== */

  // Un nuevo impacto reinicia "hasta el final de su próximo turno".
  if (
    existing.getFlag(
      MODULE_ID,
      "expireAtEndOfNextTurn"
    )
  ) {
    await refreshEndOfNextTurnDuration(
      existing
    );
  }

  // Reusar el Move inicia una concentración nueva.
  if (
    dependentOn &&
    existing.getFlag(
      "dnd5e",
      "dependentOn"
    ) !==
      dependentOn
  ) {
    await existing.setFlag(
      "dnd5e",
      "dependentOn",
      dependentOn
    );
  }

  const result =
    await increaseStack(
      actor,
      existing,
      template
    );


  if (
    result.status ===
    "increased"
  ) {

    ui.notifications.info(
      `${actor.name}: ${result.count}/${result.max}`
    );
  }


  return result;
}


/* ============================================================
 * OBJETIVOS GUARDADOS EN EL BOTÓN
 * ============================================================ */

function buttonTargets(
  button,
  item
) {

  const targetMode =
    button.dataset
      .targetMode;


  /* ==========================================================
   * SELF
   * ========================================================== */

  if (
    targetMode ===
    "self"
  ) {

    const actor =

      actorFromUuid(
        button.dataset
          .sourceActorUuid
      )

      ??

      item.actor;


    return actor
      ? [actor]
      : [];
  }


  /* ==========================================================
   * TARGETS CAPTURADOS AL USAR EL MOVE
   * ========================================================== */

  let uuids =
    [];


  try {

    uuids =
      JSON.parse(
        button.dataset
          .targetUuids ??
        "[]"
      );

  } catch {

    uuids =
      [];
  }


  const actors =
    uuids

      .map(
        actorFromUuid
      )

      .filter(
        Boolean
      );


  /*
   * Fallback:
   *
   * si por algún motivo el Usage Message no
   * conservó targets, utilizamos los objetivos
   * seleccionados actualmente.
   */

  if (
    !actors.length
  ) {

    return [

      ...game.user.targets

    ]
      .map(
        token =>
          token.actor
      )
      .filter(
        Boolean
      );
  }


  return [

    ...new Map(

      actors.map(
        actor => [
          actor.uuid,
          actor
        ]
      )

    ).values()
  ];
}


/* ============================================================
 * INSERTAR BOTÓN ANTES DE CREAR EL USAGE MESSAGE
 *
 * Este es el punto importante.
 *
 * D&D5e ya generó:
 *
 * <div class="chat-card activation-card">
 * ...
 * <div class="card-buttons">
 *
 * y nosotros modificamos ese HTML ANTES
 * de guardar el ChatMessage.
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

  if (AUTOMATED_MODIFIER_MOVES.has(item.getFlag(MODULE_ID, "sourceId"))) {return;}


  /* ==========================================================
   * SOLO MOVES POKE5E
   * ========================================================== */

  if (
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !==
    "move"
  ) {

    return;
  }


  const template =
    modifierTemplate(
      item
    );


  if (
    !template ||
    !isStackable(
      template
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

    console.warn(
      `[${MODULE_ID}] No se encontró HTML del Usage Message para ${item.name}.`
    );

    return;
  }


  /* ==========================================================
   * PARSEAR HTML
   * ========================================================== */

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

    console.warn(
      `[${MODULE_ID}] No se encontró .chat-card para ${item.name}.`
    );

    return;
  }


  /* ==========================================================
   * BUSCAR / CREAR CARD BUTTONS
   * ========================================================== */

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


  /* ==========================================================
   * TARGETS CAPTURADOS POR D&D5e
   * ========================================================== */

  const targetDescriptors =

    foundry.utils.getProperty(

      messageConfig,

      "data.flags.dnd5e.targets"

    )

    ??

    [];


  const targetUuids =
    targetDescriptors

      .map(
        target =>
          target.uuid
      )

      .filter(
        Boolean
      );


  /* ==========================================================
   * CREAR BOTÓN
   * ========================================================== */

  const button =
    document.createElement(
      "button"
    );


  button.type =
    "button";


  button.className =
    "poke5e-stack-modifier";


  /*
   * No usamos data-action.
   *
   * D&D5e utiliza data-action para sus
   * propios handlers.
   *
   * Usamos un dataset exclusivamente nuestro.
   */

  button.dataset
    .poke5eAction =
    "stack-modifier";


  button.dataset
    .itemUuid =
    item.uuid;


  button.dataset
    .sourceActorUuid =
    item.actor
      ?.uuid ??
    "";


  button.dataset
    .targetMode =
    template.getFlag(
      MODULE_ID,
      "target"
    ) ??
    "target";


  button.dataset
    .targetUuids =
    JSON.stringify(
      targetUuids
    );


  button.innerHTML = `

    <i class="fa-solid fa-layer-group"></i>

    <span>
      Aplicar / acumular efecto
    </span>
  `;


  buttons.appendChild(
    button
  );


  /* ==========================================================
   * GUARDAR NUEVO HTML
   * ========================================================== */

  messageConfig.data.content =
    wrapper.innerHTML;


  /*
   * Flag diagnóstico.
   */

  foundry.utils.setProperty(

    messageConfig.data,

    `flags.${MODULE_ID}.stackModifier`,

    {

      itemUuid:
        item.uuid,

      stackKey:
        template.getFlag(
          MODULE_ID,
          "stackKey"
        ),

      maxStacks:
        template.getFlag(
          MODULE_ID,
          "maxStacks"
        )
    }
  );


  console.debug(
    `[${MODULE_ID}] Botón acumulable insertado en ${item.name}.`
  );
}


/* ============================================================
 * CLICK GLOBAL
 *
 * El botón ya forma parte permanente del HTML
 * del ChatMessage.
 *
 * No dependemos de renderChatMessageHTML ni
 * dnd5e.renderChatMessage.
 * ============================================================ */

async function onDocumentClick(
  event
) {

  const button =
    event.target
      ?.closest?.(
        '[data-poke5e-action="stack-modifier"]'
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
      "Solo el GM puede aplicar modificadores Pokémon por ahora."
    );

    return;
  }


  const itemUuid =
    button.dataset
      .itemUuid;


  if (!itemUuid) {

    ui.notifications.error(
      "No se pudo identificar el movimiento."
    );

    return;
  }


  let item;


  try {

    item =
      fromUuidSync(
        itemUuid,
        {
          strict:
            false
        }
      );

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] UUID inválido:`,
      itemUuid,
      error
    );


    return;
  }


  if (!item) {

    ui.notifications.error(
      "El movimiento original ya no existe."
    );

    return;
  }

  if (AUTOMATED_MODIFIER_MOVES.has(item.getFlag(MODULE_ID, "sourceId"))) {
    ui.notifications.info("Este modificador se aplica automáticamente al mostrar el resultado de la tirada.");
    return;
  }


  const targets =
    buttonTargets(
      button,
      item
    );


  if (
    !targets.length
  ) {

    ui.notifications.warn(
      "No se encontró ningún objetivo para este movimiento."
    );

    return;
  }


  button.disabled =
    true;


  try {

    for (
      const actor
      of targets
    ) {

      await applyPokemonMoveModifier(
        actor,
        item
      );
    }

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] Error aplicando modifier:`,
      error
    );


    ui.notifications.error(
      "No se pudo aplicar/acumular el efecto."
    );

  } finally {

    button.disabled =
      false;
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonModifierEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  /*
   * Modificamos el HTML ANTES
   * de crear el Usage Message.
   */

  Hooks.on(
    "dnd5e.preCreateUsageMessage",
    onPreCreateUsageMessage
  );


  /*
   * Listener delegado.
   *
   * Funciona incluso si Foundry vuelve a
   * renderizar el mensaje.
   */

  document.addEventListener(
    "click",
    onDocumentClick
  );


  console.log(
    `[${MODULE_ID}] Motor de modificadores acumulables registrado.`
  );
}
