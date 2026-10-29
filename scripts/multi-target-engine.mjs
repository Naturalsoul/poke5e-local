import { fractionalAmount } from "./numbers.mjs";

import { actorFromUuid } from "./foundry-runtime.mjs";

const MODULE_ID = "poke5e-local";

/*
 * Cada Damage Roll representa una ejecución concreta.
 *
 * message.id
 *   ↓
 * {
 *   sourceActorUuid,
 *   itemUuid,
 *   itemName,
 *   level,
 *   definition,
 *   targets: Map<actorUuid, result>
 * }
 */
const usages =
  new Map();

/* ============================================================
 * PUBLIC API
 * ============================================================ */

export function registerMultiTargetEngine() {
  Hooks.on(
    "dnd5e.preApplyDamage",
    onPreApplyDamage
  );

  Hooks.on(
    "deleteChatMessage",
    onDeleteChatMessage
  );

  Hooks.on(
    "dnd5e.renderChatMessage",
    onRenderChatMessage
  );

  document.addEventListener(
    "click",
    onDocumentClick
  );

  console.log(
    `[${MODULE_ID}] Multi-target engine registrado.`
  );
}

/* ============================================================
 * DAMAGE COLLECTION
 * ============================================================ */

function onPreApplyDamage(
  actor,
  amount,
  updates,
  options
) {
  if (Number(amount) <= 0) {
    return;
  }

  const message =
    options?.originatingMessage;

  if (!message?.id) {
    return;
  }

  const item =
    originatingMoveItem(
      message
    );

  if (!item) {
    return;
  }

  const definition =
    item.getFlag(
      MODULE_ID,
      "multiTarget"
    );

  if (
    definition?.kind !==
    "multi-target-drain"
  ) {
    return;
  }

  const sourceActor =
    item.actor;

  if (!sourceActor) {
    return;
  }

  const actualDamage =
    actualDamageFromUpdates(
      actor,
      updates
    );

  /*
   * Guardamos también 0 si fuera necesario
   * para diagnóstico, pero no suma curación.
   */
  const usage =
    getOrCreateUsage(
      message,
      item,
      sourceActor,
      definition
    );

  /*
   * Una criatura aparece una sola vez dentro
   * de una utilización concreta.
   *
   * Si Foundry vuelve a procesarla por algún motivo,
   * reemplazamos el resultado en vez de sumarlo.
   */
  usage.targets.set(
    actor.uuid,
    {
      actorUuid:
        actor.uuid,

      actorName:
        actor.name,

      actualDamage:
        Math.max(
          0,
          actualDamage
        )
    }
  );

  console.debug(
    `[${MODULE_ID}] ${item.name}: daño multiobjetivo registrado.`,
    {
      messageId:
        message.id,

      target:
        actor.name,

      actualDamage,

      totalDamage:
        totalUsageDamage(
          usage
        )
    }
  );
}

/* ============================================================
 * USAGE STATE
 * ============================================================ */

function getOrCreateUsage(
  message,
  item,
  sourceActor,
  definition
) {
  let usage =
    usages.get(
      message.id
    );

  if (usage) {
    return usage;
  }

  usage = {
    messageId:
      message.id,

    sourceActorUuid:
      sourceActor.uuid,

    sourceActorName:
      sourceActor.name,

    itemUuid:
      item.uuid,

    itemName:
      item.name,

    itemSourceId:
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ),

    level:
      pokemonLevel(
        sourceActor,
        item
      ),

    definition:
      foundry.utils.deepClone(
        definition
      ),

    targets:
      new Map(),

    resolved:
      false
  };

  usages.set(
    message.id,
    usage
  );

  return usage;
}

function totalUsageDamage(
  usage
) {
  return [
    ...usage.targets.values()
  ].reduce(
    (total, target) =>
      total +
      Math.max(
        0,
        Number(
          target.actualDamage ??
          0
        )
      ),
    0
  );
}

/* ============================================================
 * CHAT BUTTON
 * ============================================================ */

function onRenderChatMessage(
  message,
  html
) {
  const item =
    message.getAssociatedItem?.();

  if (!item) {
    return;
  }

  const definition =
    item.getFlag(
      MODULE_ID,
      "multiTarget"
    );

  if (
    definition?.kind !==
    "multi-target-drain"
  ) {
    return;
  }

  /*
   * Solo añadimos el botón a la tarjeta
   * del DAMAGE ROLL, no a cualquier mensaje
   * relacionado con el Move.
   */
  if (
    message.getFlag(
      "dnd5e",
      "roll.type"
    ) !== "damage"
  ) {
    return;
  }

  if (
    html.querySelector(
      '[data-poke5e-action="resolve-multi-target"]'
    )
  ) {
    return;
  }

  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.dataset.poke5eAction =
    "resolve-multi-target";

  button.dataset.messageId =
    message.id;

  button.innerHTML = `
    <i class="fa-solid fa-heart-pulse"></i>
    Resolver absorción
  `;

  /*
   * Preferimos ponerlo junto a las acciones
   * existentes de la tarjeta.
   */
  const container =
    html.querySelector(
      ".card-buttons"
    ) ??
    html.querySelector(
      ".message-content"
    );

  if (!container) {
    return;
  }

  container.append(
    button
  );

  updateResolverButton(
    button,
    message.id
  );
}

/* ============================================================
 * CLICK HANDLER
 * ============================================================ */

function onDocumentClick(
  event
) {
  const button =
    event.target.closest(
      '[data-poke5e-action="resolve-multi-target"]'
    );

  if (!button) {
    return;
  }

  const messageId =
    button.dataset.messageId;

  if (!messageId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  void resolveUsage(
    messageId,
    button
  ).catch(error => {
    console.error(
      `[${MODULE_ID}] Error resolviendo efecto multiobjetivo:`,
      error
    );

    ui.notifications.error(
      "No se pudo resolver el efecto multiobjetivo."
    );
  });
}

/* ============================================================
 * RESOLUTION
 * ============================================================ */

async function resolveUsage(
  messageId,
  button
) {
  const usage =
    usages.get(
      messageId
    );

  if (!usage) {
    ui.notifications.warn(
      "Todavía no se ha aplicado daño de este movimiento a ningún objetivo."
    );

    return;
  }

  if (usage.resolved) {
    ui.notifications.warn(
      "Esta absorción ya fue resuelta."
    );

    return;
  }

  const source =
    actorFromUuid(
      usage.sourceActorUuid
    );

  if (!source) {
    throw new Error(
      `No se encontró ${usage.sourceActorName}.`
    );
  }

  const totalDamage =
    totalUsageDamage(
      usage
    );

  if (totalDamage <= 0) {
    ui.notifications.info(
      `${usage.itemName} no infligió daño efectivo.`
    );

    usage.resolved = true;

    updateResolverButton(
      button,
      messageId
    );

    return;
  }

  const requested =
    fractionalAmount(
      totalDamage,
      usage.definition
        .fraction,
      usage.definition
        .round
    );

  const capped =
    applyHealingCap(
      requested,
      usage
    );

  const hp =
    source.system
      ?.attributes
      ?.hp;

  if (!hp) {
    return;
  }

  const current =
    Number(
      hp.value ??
      0
    );

  const maximum =
    Number(
      hp.max ??
      current
    );

  /*
   * Igual que Drain y Aqua Ring:
   * no revive automáticamente.
   */
  if (current <= 0) {
    usage.resolved = true;

    updateResolverButton(
      button,
      messageId
    );

    return;
  }

  const missing =
    Math.max(
      0,
      maximum - current
    );

  const healing =
    Math.min(
      capped,
      missing
    );

  usage.resolved = true;

  if (healing > 0) {
    await source.applyDamage(
      -healing
    );

    await ChatMessage.create({
      speaker:
        ChatMessage.getSpeaker({
          actor: source
        }),

      content: `
        <div class="poke5e-turn-message">
          <strong>${source.name}</strong>
          recupera
          <strong>${healing} HP</strong>
          gracias a
          <strong>${usage.itemName}</strong>.
          <br>
          <small>
            Daño efectivo total:
            ${totalDamage}
            ·
            Curación calculada:
            ${requested}
            ·
            Límite:
            ${healingCapLabel(usage)}
          </small>
        </div>
      `
    });
  }

  updateResolverButton(
    button,
    messageId
  );

  console.debug(
    `[${MODULE_ID}] ${usage.itemName} resuelto.`,
    {
      totalDamage,
      requestedHealing:
        requested,

      cappedHealing:
        capped,

      actualHealing:
        healing
    }
  );
}

/* ============================================================
 * CAPS
 * ============================================================ */

function applyHealingCap(
  healing,
  usage
) {
  const cap =
    usage.definition
      ?.cap;

  if (!cap) {
    return healing;
  }

  if (
    cap.kind ===
    "level-multiplier"
  ) {
    const maximum =
      usage.level *
      Number(
        cap.multiplier ??
        0
      );

    return Math.min(
      healing,
      maximum
    );
  }

  return healing;
}

function healingCapLabel(
  usage
) {
  const cap =
    usage.definition
      ?.cap;

  if (
    cap?.kind !==
    "level-multiplier"
  ) {
    return "sin límite especial";
  }

  return String(
    usage.level *
    Number(
      cap.multiplier ??
      0
    )
  );
}

/* ============================================================
 * BUTTON STATE
 * ============================================================ */

function updateResolverButton(
  button,
  messageId
) {
  if (!button) {
    return;
  }

  const usage =
    usages.get(
      messageId
    );

  if (!usage) {
    button.disabled = false;

    button.innerHTML = `
      <i class="fa-solid fa-heart-pulse"></i>
      Resolver absorción
    `;

    return;
  }

  if (usage.resolved) {
    button.disabled = true;

    button.innerHTML = `
      <i class="fa-solid fa-check"></i>
      Absorción resuelta
    `;

    return;
  }

  const total =
    totalUsageDamage(
      usage
    );

  button.innerHTML = `
    <i class="fa-solid fa-heart-pulse"></i>
    Resolver absorción (${total} daño)
  `;
}

/* ============================================================
 * CLEANUP
 * ============================================================ */

function onDeleteChatMessage(
  message
) {
  usages.delete(
    message.id
  );
}

/* ============================================================
 * DOCUMENT HELPERS
 * ============================================================ */

function originatingMoveItem(
  message
) {
  if (!message) {
    return null;
  }

  const associated =
    message.getAssociatedItem?.();

  if (
    associated
      ?.documentName ===
    "Item"
  ) {
    return associated;
  }

  const uuid =
    foundry.utils.getProperty(
      message,
      "flags.dnd5e.item.uuid"
    );

  if (!uuid) {
    return null;
  }

  try {
    const item =
      fromUuidSync(
        uuid,
        {
          strict: false
        }
      );

    return item?.documentName ===
      "Item"
      ? item
      : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * DAMAGE HELPERS
 * ============================================================ */

function actualDamageFromUpdates(
  actor,
  updates
) {
  const hp =
    actor.system
      ?.attributes
      ?.hp;

  if (!hp) {
    return 0;
  }

  const beforeValue =
    Number(
      hp.value ??
      0
    );

  const beforeTemp =
    Number(
      hp.temp ??
      0
    );

  const afterValue =
    Number(
      updates[
        "system.attributes.hp.value"
      ] ??
      beforeValue
    );

  const afterTemp =
    Number(
      updates[
        "system.attributes.hp.temp"
      ] ??
      beforeTemp
    );

  return Math.max(
    0,
    (
      beforeValue +
      beforeTemp
    ) -
    (
      afterValue +
      afterTemp
    )
  );
}

function pokemonLevel(
  actor,
  item
) {
  const itemLevel =
    Number(
      item.getFlag(
        MODULE_ID,
        "level"
      )
    );

  if (
    Number.isFinite(
      itemLevel
    )
  ) {
    return Math.max(
      1,
      itemLevel
    );
  }

  const actorLevel =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      ) ??
      actor.system
        ?.details
        ?.level
    );

  return Number.isFinite(
    actorLevel
  )
    ? Math.max(
        1,
        actorLevel
      )
    : 1;
}