import {
  getSaveProgress,
  getSaveUsage
} from "./save-outcome-engine.mjs";

const MODULE_ID =
  "poke5e-local";

const RESOLUTION_FLAG =
  "saveResultResolution";

/* ============================================================
 * REGISTRATION
 * ============================================================ */

export function registerSaveResultEngine() {
  Hooks.on(
    "dnd5e.renderChatMessage",
    onRenderChatMessage
  );

  document.addEventListener(
    "click",
    onDocumentClick
  );

  console.log(
    `[${MODULE_ID}] Save Result Engine registrado.`
  );
}

/* ============================================================
 * CHAT
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
      "saveResult"
    );

  if (
    definition?.kind !==
    "heal-per-failed-save"
  ) {
    return;
  }

  /*
   * Queremos agregar el botón solamente a
   * la Usage Card original.
   *
   * Un Damage Roll derivado devuelve la tarjeta
   * original mediante getOriginatingMessage().
   */
  const originatingMessage =
    message.getOriginatingMessage?.() ??
    message;

  if (
    originatingMessage.id !==
    message.id
  ) {
    return;
  }

  const activity =
    message.getAssociatedActivity?.();

  if (
    activity?.type !==
    "save"
  ) {
    return;
  }

  if (
    html.querySelector(
      '[data-poke5e-action="resolve-save-result"]'
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
    "resolve-save-result";

  button.dataset.messageId =
    message.id;

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

  updateButton(
    button,
    message
  );
}

/* ============================================================
 * CLICK
 * ============================================================ */

function onDocumentClick(
  event
) {
  const button =
    event.target.closest(
      '[data-poke5e-action="resolve-save-result"]'
    );

  if (!button) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const messageId =
    button.dataset
      .messageId;

  if (!messageId) {
    return;
  }

  void resolveSaveResult(
    messageId,
    button
  ).catch(error => {
    console.error(
      `[${MODULE_ID}] Error resolviendo efecto por Save:`,
      error
    );

    ui.notifications.error(
      "No se pudo resolver la curación del movimiento."
    );
  });
}

/* ============================================================
 * RESOLUTION
 * ============================================================ */

async function resolveSaveResult(
  messageId,
  button
) {
  const message =
    game.messages.get(
      messageId
    );

  if (!message) {
    return;
  }

  const previousResolution =
    message.getFlag(
      MODULE_ID,
      RESOLUTION_FLAG
    );

  if (
    previousResolution?.resolved
  ) {
    ui.notifications.warn(
      "Este efecto ya fue resuelto."
    );

    updateButton(
      button,
      message
    );

    return;
  }

  const item =
    message.getAssociatedItem?.();

  if (!item) {
    throw new Error(
      "No se encontró el Move asociado."
    );
  }

  const definition =
    item.getFlag(
      MODULE_ID,
      "saveResult"
    );

  if (
    definition?.kind !==
    "heal-per-failed-save"
  ) {
    return;
  }

  const usage =
    getSaveUsage(
      message.id
    );

  if (!usage) {
    ui.notifications.warn(
      "Primero debes resolver las salvaciones de los objetivos."
    );

    return;
  }

  const progress =
    getSaveProgress(
      message.id
    );

  if (!progress.complete) {
    ui.notifications.warn(
      `Todavía faltan ${progress.pending} salvación(es) por resolver.`
    );

    return;
  }

  const outcomes = [
    ...usage.targets.values()
  ];

  const failures =
    outcomes.filter(
      outcome =>
        outcome.failure
    ).length;

  const successes =
    outcomes.filter(
      outcome =>
        outcome.success
    ).length;

  /*
   * Si nadie falla, Matcha Gotcha no cura.
   */
  if (
    failures <= 0
  ) {
    await saveResolution(
      message,
      {
        resolved: true,
        kind:
          definition.kind,

        failures: 0,
        successes,

        formula: null,
        rolledHealing: 0,
        actualHealing: 0,

        resolvedAt:
          Date.now()
      }
    );

    ui.notifications.info(
      `${item.name}: ninguna criatura falló la salvación.`
    );

    return;
  }

  const source =
    item.actor ??
    message.getAssociatedActor?.();

  if (!source) {
    throw new Error(
      "No se encontró el Pokémon que utilizó el movimiento."
    );
  }

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
   * No revivimos automáticamente.
   */
  if (
    current <= 0
  ) {
    await saveResolution(
      message,
      {
        resolved: true,
        kind:
          definition.kind,

        failures,
        successes,

        formula: null,
        rolledHealing: 0,
        actualHealing: 0,

        reason:
          "source-fainted",

        resolvedAt:
          Date.now()
      }
    );

    return;
  }

  /*
   * Si ya está a HP máximo, tampoco necesitamos
   * generar una tirada inútil.
   */
  if (
    current >= maximum
  ) {
    await saveResolution(
      message,
      {
        resolved: true,
        kind:
          definition.kind,

        failures,
        successes,

        formula: null,
        rolledHealing: 0,
        actualHealing: 0,

        reason:
          "full-hp",

        resolvedAt:
          Date.now()
      }
    );

    return;
  }

  const formula =
    buildRepeatedFormula(
      definition
        .formulaPerFailure,
      failures
    );

  const roll =
    Roll.create(
      formula
    );

  await roll.evaluate();

  const rolledHealing =
    Math.max(
      0,
      Math.floor(
        Number(
          roll.total ??
          0
        )
      )
    );

  const missingHp =
    Math.max(
      0,
      maximum - current
    );

  const actualHealing =
    Math.min(
      rolledHealing,
      missingHp
    );

  /*
   * Marcamos el resultado antes de mostrar
   * la resolución final.
   */
  await saveResolution(
    message,
    {
      resolved: true,

      kind:
        definition.kind,

      failures,

      successes,

      formula,

      rolledHealing,

      actualHealing,

      resolvedAt:
        Date.now()
    }
  );

  if (
    actualHealing > 0
  ) {
    await source.applyDamage(
      -actualHealing
    );
  }

  /*
   * Mostramos la tirada real en chat.
   */
  await roll.toMessage({
    speaker:
      ChatMessage.getSpeaker({
        actor:
          source
      }),

    flavor: `
      <div class="poke5e-turn-message">
        <strong>${item.name}</strong>
        <br>
        ${failures}
        criatura(s) fallaron la salvación.
        <br>
        <strong>${source.name}</strong>
        recupera
        <strong>${actualHealing} HP</strong>.
      </div>
    `
  });

  console.debug(
    `[${MODULE_ID}] ${item.name} resuelto.`,
    {
      failures,
      successes,
      formula,
      rolledHealing,
      actualHealing
    }
  );

  updateButton(
    button,
    message
  );
}

/* ============================================================
 * FORMULA
 * ============================================================ */

function buildRepeatedFormula(
  formulaPerFailure,
  failures
) {
  const base =
    String(
      formulaPerFailure ??
      ""
    ).trim();

  if (
    !base ||
    failures <= 0
  ) {
    return "0";
  }

  /*
   * Lo construimos de forma genérica:
   *
   * 1 fallo:
   * (1d6)
   *
   * 3 fallos:
   * (1d6) + (1d6) + (1d6)
   *
   * Así no asumimos que futuras reglas
   * siempre serán exactamente 1d6.
   */
  return Array
    .from(
      {
        length:
          failures
      },
      () =>
        `(${base})`
    )
    .join(
      " + "
    );
}

/* ============================================================
 * MESSAGE STATE
 * ============================================================ */

async function saveResolution(
  message,
  data
) {
  await message.setFlag(
    MODULE_ID,
    RESOLUTION_FLAG,
    data
  );
}

/* ============================================================
 * BUTTON
 * ============================================================ */

function updateButton(
  button,
  message
) {
  if (
    !button ||
    !message
  ) {
    return;
  }

  const resolution =
    message.getFlag(
      MODULE_ID,
      RESOLUTION_FLAG
    );

  if (
    resolution?.resolved
  ) {
    button.disabled =
      true;

    button.innerHTML = `
      <i class="fa-solid fa-check"></i>
      Curación resuelta
    `;

    return;
  }

  const usage =
    getSaveUsage(
      message.id
    );

  if (!usage) {
    button.disabled =
      false;

    button.innerHTML = `
      <i class="fa-solid fa-heart-pulse"></i>
      Resolver curación
    `;

    return;
  }

  const progress =
    getSaveProgress(
      message.id
    );

  if (
    !progress.complete
  ) {
    button.disabled =
      false;

    button.innerHTML = `
      <i class="fa-solid fa-heart-pulse"></i>
      Resolver curación
      (${progress.resolved}/${progress.expected} saves)
    `;

    return;
  }

  const failures =
    [
      ...usage.targets.values()
    ].filter(
      outcome =>
        outcome.failure
    ).length;

  button.disabled =
    false;

  button.innerHTML = `
    <i class="fa-solid fa-heart-pulse"></i>
    Resolver curación
    (${failures} fallo${failures === 1 ? "" : "s"})
  `;
}