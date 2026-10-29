import { escapeHtml } from "./html.mjs";
import { prepareCapture } from "./pokemon-capture-service.mjs";
import { refundItemHealingBonuses, resolveItemHealingBonuses } from "./trainer-feature-engine.mjs";
const MODULE_ID =
  "poke5e-local";

const CATALOG_ITEM_KIND =
  "catalog-item";

const CONSUMABLE_ITEM_TYPE =
  "consumable";

const ITEM_ROLLS_FLAG =
  "rolls";

const CHAT_ITEM_ROLLS_FLAG =
  "itemRolls";

const CHAT_ITEM_NAME_FLAG =
  "itemRollName";

const ITEM_ROLL_ACTIONS_CLASS =
  "poke5e-item-roll-actions";

const ITEM_ROLL_BUTTON_CLASS =
  "poke5e-item-roll-button";

const pendingConsumableUses =
  new Set();

const bypassConsumableCards =
  new Set();

let registered =
  false;


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function currentLanguage() {

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


function labels() {

  if (
    currentLanguage() ===
      "en"
  ) {

    return {
      title:
        "Use consumable",

      question:
        name =>
          `Use ${name}?`,

      quantity:
        "Available quantity",

      use:
        "Use",

      cancel:
        "Cancel",

      empty:
        name =>
          `You have no ${name} remaining.`,

      permission:
        "You do not have permission to use this item.",

      unavailable:
        "The item is no longer available.",

      failed:
        name =>
          `${name} could not be used.`
    };
  }


  return {
    title:
      "Usar consumible",

    question:
      name =>
        `¿Usar ${name}?`,

    quantity:
      "Cantidad disponible",

    use:
      "Usar",

    cancel:
      "Cancelar",

    empty:
      name =>
        `No quedan unidades de ${name}.`,

    permission:
      "No tienes permisos para usar este objeto.",

    unavailable:
      "El objeto ya no está disponible.",

    failed:
      name =>
        `No se pudo usar ${name}.`
  };
}


/* ============================================================
 * ITEM STATE
 * ============================================================ */

function itemKey(
  item
) {

  return String(
    item?.uuid ??
    item?.id ??
    ""
  );
}


function isPoke5eCatalogItem(
  item
) {

  return Boolean(
    item?.documentName ===
      "Item" &&

    item.getFlag(
      MODULE_ID,
      "kind"
    ) ===
      CATALOG_ITEM_KIND
  );
}


function isPoke5eConsumable(
  item
) {

  return Boolean(
    isPoke5eCatalogItem(
      item
    ) &&

    item.parent
      ?.documentName ===
      "Actor" &&

    item.type ===
      CONSUMABLE_ITEM_TYPE
  );
}


function itemQuantity(
  item
) {

  const quantity =
    Number(
      item?.system
        ?.quantity ??
      0
    );


  if (
    !Number.isFinite(
      quantity
    )
  ) {

    return 0;
  }


  return Math.max(
    0,
    Math.trunc(
      quantity
    )
  );
}


function canCurrentUserUseItem(
  item
) {

  const actor =
    item?.parent;


  if (
    actor?.documentName !==
      "Actor"
  ) {

    return false;
  }


  if (
    game.user.isGM
  ) {

    return true;
  }


  return Boolean(
    actor.testUserPermission?.(
      game.user,
      "OWNER"
    )
  );
}


function currentEmbeddedItem(
  item
) {

  const actor =
    item?.parent;


  if (
    actor?.documentName !==
      "Actor"
  ) {

    return null;
  }


  return (
    actor.items.get(
      item.id
    ) ??
    null
  );
}

function itemRollDefinitions(
  item
) {

  const stored =
    item?.getFlag?.(
      MODULE_ID,
      ITEM_ROLLS_FLAG
    );


  if (
    !Array.isArray(
      stored
    )
  ) {

    return [];
  }


  return stored
    .map(
      roll => {

        const id =
          String(
            roll?.id ??
            ""
          ).trim();


        const formula =
          String(
            roll?.formula ??
            ""
          ).trim();


        if (
          !id ||
          !formula
        ) {

          return null;
        }


        return {
          id,

          kind:
            String(
              roll?.kind ??
              "utility"
            ),

          formula,

          label:
            foundry.utils.deepClone(
              roll?.label ??
              {
                en:
                  id,

                es:
                  id
              }
            )
        };
      }
    )
    .filter(Boolean);
}


function localizedRollLabel(
  roll
) {

  const value =
    roll?.label;


  if (
    typeof value ===
      "string"
  ) {

    return value;
  }


  if (
    value &&
    typeof value ===
      "object"
  ) {

    const language =
      currentLanguage();


    return String(
      value[
        language
      ] ??
      value.en ??
      value.es ??
      roll.id
    );
  }


  return String(
    roll?.id ??
    ""
  );
}

/* ============================================================
 * CONFIRMATION
 * ============================================================ */


function confirmationContent(
  item,
  quantity
) {

  const text =
    labels();


  const image =
    escapeHtml(
      item.img ||
      "icons/svg/item-bag.svg"
    );


  return `
    <div class="poke5e-consumable-confirmation">

      <div
        style="
          display: flex;
          align-items: center;
          gap: 12px;
        "
      >

        <img
          src="${image}"
          alt="${escapeHtml(item.name)}"
          width="48"
          height="48"
          style="
            object-fit: contain;
            border: 0;
          "
        >

        <div>

          <p
            style="
              margin: 0 0 6px;
              font-weight: 600;
            "
          >
            ${escapeHtml(
              text.question(
                item.name
              )
            )}
          </p>

          <small>
            ${escapeHtml(text.quantity)}:
            <strong>
              ${escapeHtml(quantity)}
            </strong>
          </small>

        </div>

      </div>

    </div>
  `;
}


// With `extraFields` (form inputs), resolves to their values instead of true.
async function confirmConsumableUse(
  item,
  quantity,
  extraFields = ""
) {
  const text =
    labels();
  const confirmed =
    await foundry.applications.api
      .DialogV2.confirm({
        window: {
          title:
            text.title
        },
        content:
          confirmationContent(
            item,
            quantity
          ) +
          extraFields,
        modal:
          true,
        rejectClose:
          false,
        yes: {
          label:
            text.use,
          callback:
            (event, button) =>
              extraFields
                ? formValues(
                    button.form
                  )
                : true
        },
        no: {
          label:
            text.cancel
        }
      });
  if (
    confirmed &&
    typeof confirmed ===
      "object"
  ) {
    return confirmed;
  }
  return confirmed ===
    true;
}


function formValues(
  form
) {
  return Object.fromEntries(
    [...form.elements]
      .filter(element => element.name)
      .map(element => [
        element.name,
        element.type === "checkbox"
          ? element.checked
          : element.value
      ])
  );
}


/* ============================================================
 * CHAT
 * ============================================================ */

async function displayConsumableCard(
  item
) {

  const key =
    itemKey(
      item
    );


  if (!key) {

    throw new Error(
      "El consumible no posee UUID."
    );
  }


  bypassConsumableCards.add(
    key
  );


  try {

    const card =
      await item.displayCard();


    if (!card) {

      throw new Error(
        `No se pudo publicar ${item.name} en el chat.`
      );
    }


    return card;

  } finally {

    bypassConsumableCards.delete(
      key
    );
  }
}


/* ============================================================
 * CONSUMPTION
 * ============================================================ */

async function consumeAndDisplay(
  item
) {

  const text =
    labels();


  /*
   * Volvemos a resolver el Item después del diálogo.
   *
   * Durante el tiempo que el usuario estuvo decidiendo
   * su inventario podría haber cambiado.
   */

  const currentItem =
    currentEmbeddedItem(
      item
    );


  if (
    !currentItem ||
    !isPoke5eConsumable(
      currentItem
    )
  ) {

    throw new Error(
      text.unavailable
    );
  }


  if (
    !canCurrentUserUseItem(
      currentItem
    )
  ) {

    throw new Error(
      text.permission
    );
  }


  const quantity =
    itemQuantity(
      currentItem
    );


  if (
    quantity <= 0
  ) {

    ui.notifications.warn(
      text.empty(
        currentItem.name
      )
    );


    return null;
  }


  const nextQuantity =
    quantity - 1;


  /*
   * Primero consumimos.
   *
   * Si la creación de la tarjeta falla,
   * restauramos la cantidad.
   */

  await currentItem.update({
    "system.quantity":
      nextQuantity
  });


  try {

    return await displayConsumableCard(
      currentItem
    );

  } catch (error) {

    /*
     * Rollback.
     *
     * Solo restauramos si el Item sigue existiendo
     * y continúa exactamente en la cantidad que
     * acabamos de escribir.
     *
     * Esto reduce el riesgo de pisar otro cambio
     * realizado mientras se publicaba la tarjeta.
     */

    const rollbackItem =
      currentEmbeddedItem(
        currentItem
      );


    if (
      rollbackItem &&
      itemQuantity(
        rollbackItem
      ) ===
        nextQuantity
    ) {

      await rollbackItem.update({
        "system.quantity":
          quantity
      });
    }


    throw error;
  }
}


async function usePokeball(
  ball,
  quantity
) {
  const capture =
    await prepareCapture(
      ball
    );
  if (!capture) {
    return;
  }
  const answers =
    await confirmConsumableUse(
      ball,
      quantity,
      capture.questions
    );
  if (answers) {
    await capture.throwBall(
      answers === true
        ? {}
        : answers
    );
  }
}


async function requestConsumableUse(
  item
) {

  const key =
    itemKey(
      item
    );


  if (
    !key ||
    pendingConsumableUses.has(
      key
    )
  ) {

    return;
  }


  pendingConsumableUses.add(
    key
  );


  try {

    const currentItem =
      currentEmbeddedItem(
        item
      );


    if (
      !currentItem ||
      !isPoke5eConsumable(
        currentItem
      )
    ) {

      return;
    }


    const text =
      labels();


    if (
      !canCurrentUserUseItem(
        currentItem
      )
    ) {

      ui.notifications.error(
        text.permission
      );


      return;
    }


    const quantity =
      itemQuantity(
        currentItem
      );


    if (
      quantity <= 0
    ) {

      ui.notifications.warn(
        text.empty(
          currentItem.name
        )
      );


      return;
    }


    // Pokéballs keep the use window, then are thrown at the target instead of showing a card.
    if (
      currentItem.getFlag(
        MODULE_ID,
        "itemType"
      ) ===
      "pokeball"
    ) {
      await usePokeball(
        currentItem,
        quantity
      );
      return;
    }

    const confirmed =
      await confirmConsumableUse(
        currentItem,
        quantity
      );


    if (!confirmed) {

      return;
    }


    await consumeAndDisplay(
      currentItem
    );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] Error usando consumible`,
      error
    );


    ui.notifications.error(
      error?.message ??
      labels().failed(
        item?.name ??
        "Item"
      )
    );

  } finally {

    pendingConsumableUses.delete(
      key
    );
  }
}

function attachItemRollsToMessage(
  item,
  message
) {

  if (
    !isPoke5eCatalogItem(
      item
    )
  ) {

    return;
  }


  const rolls =
    itemRollDefinitions(
      item
    );


  if (
    !rolls.length ||
    !message?.data
  ) {

    return;
  }


  message.data.flags ??=
    {};


  message.data.flags[
    MODULE_ID
  ] ??=
    {};


  message.data.flags[
    MODULE_ID
  ][
    CHAT_ITEM_ROLLS_FLAG
  ] =
    foundry.utils.deepClone(
      rolls
    );


  message.data.content =
    withRollButtons(
      message.data.content,
      rolls
    );


  message.data.flags[
    MODULE_ID
  ][
    CHAT_ITEM_NAME_FLAG
  ] =
    String(
      item.name ??
      ""
    );
}

/* ============================================================
 * D&D5E ADAPTER
 * ============================================================ */

function onPreDisplayCard(
  item,
  message
) {

  /*
   * Metadata para cualquier Item Poke5e
   * que posea tiradas declaradas.
   */

  attachItemRollsToMessage(
    item,
    message
  );


  /*
   * El resto del flujo solo aplica
   * a consumibles.
   */

  if (
    !isPoke5eConsumable(
      item
    )
  ) {

    return true;
  }


  const key =
    itemKey(
      item
    );


  /*
   * Esta tarjeta está siendo publicada por
   * nuestro propio flujo después de confirmar.
   */

  if (
    key &&
    bypassConsumableCards.has(
      key
    )
  ) {

    return true;
  }


  /*
   * Bloqueamos la publicación original.
   *
   * La tarjeta se crea únicamente si el usuario
   * confirma el consumo.
   */

  void requestConsumableUse(
    item
  );


  return false;
}

function chatMessageRolls(
  message
) {

  const stored =
    message.getFlag(
      MODULE_ID,
      CHAT_ITEM_ROLLS_FLAG
    );


  if (
    !Array.isArray(
      stored
    )
  ) {

    return [];
  }


  return stored
    .map(
      roll => {

        const id =
          String(
            roll?.id ??
            ""
          ).trim();


        const formula =
          String(
            roll?.formula ??
            ""
          ).trim();


        if (
          !id ||
          !formula
        ) {

          return null;
        }


        return {
          id,

          kind:
            String(
              roll?.kind ??
              "utility"
            ),

          formula,

          label:
            roll?.label ??
            id
        };
      }
    )
    .filter(Boolean);
}


function canCurrentUserRollMessage(
  message
) {

  if (
    game.user.isGM ||
    message?.isAuthor
  ) {

    return true;
  }


  const actorId =
    String(
      message?.speaker
        ?.actor ??
      ""
    ).trim();


  if (!actorId) {

    return false;
  }


  const actor =
    game.actors.get(
      actorId
    );


  return Boolean(
    actor?.testUserPermission?.(
      game.user,
      "OWNER"
    )
  );
}


async function rollItemFormula(
  message,
  rollDefinition
) {

  const formula =
    String(
      rollDefinition
        .formula
    );


  const label =
    localizedRollLabel(
      rollDefinition
    );


  const itemName =
    String(
      message.getFlag(
        MODULE_ID,
        CHAT_ITEM_NAME_FLAG
      ) ??
      ""
    );


  let bonuses =
    { parts: [] };

  try {

    // Nurse and Tactician only add to healing rolls.
    if (
      rollDefinition.kind ===
      "healing"
    ) {

      bonuses =
        await resolveItemHealingBonuses(
          ChatMessage.implementation.getSpeakerActor(
            message.speaker
          )
        );
    }


    const roll =
      await new Roll(
        [formula, ...bonuses.parts].join(" + ")
      ).evaluate();


    await roll.toMessage({
      speaker:
        message.speaker,

      flavor:
        `<strong>${escapeHtml(itemName)}</strong>` +
        ` — ${escapeHtml(label)}`
    });

  } catch (error) {

    await refundItemHealingBonuses(
      bonuses
    );

    console.error(
      `[${MODULE_ID}] Error realizando tirada de Item`,
      error
    );


    ui.notifications.error(
      currentLanguage() ===
        "en"
        ? `Could not roll ${formula}.`
        : `No se pudo tirar ${formula}.`
    );
  }
}


/*
 * Roll buttons live inside the card's content, written once when the card
 * is created, like dnd5e's own card buttons: whatever re-renders or copies
 * the message keeps them. The click is caught on the document's capture
 * phase, so nothing else on the page can swallow it.
 */
function rollButtonsMarkup(
  rolls
) {

  const buttons =
    rolls
      .map(
        roll => `
      <button type="button" class="${ITEM_ROLL_BUTTON_CLASS}" data-visibility="all" data-poke5e-item-roll="${escapeHtml(roll.id)}">
        <i class="fa-solid fa-dice" aria-hidden="true"></i>
        <span>${escapeHtml(localizedRollLabel(roll))} · ${escapeHtml(roll.formula)}</span>
      </button>`
      )
      .join("");


  return `<div class="card-buttons ${ITEM_ROLL_ACTIONS_CLASS}">${buttons}</div>`;
}


// Inside the chat card (before its closing tag), or at the end of the content.
function withRollButtons(
  content,
  rolls
) {

  const markup =
    rollButtonsMarkup(
      rolls
    );


  const text =
    String(
      content ??
      ""
    );


  const end =
    text.lastIndexOf(
      "</div>"
    );


  return end < 0
    ? text + markup
    : text.slice(0, end) + markup + text.slice(end);
}


function onItemRollClick(
  event
) {

  const button =
    event.target?.closest?.(
      "[data-poke5e-item-roll]"
    );


  if (!button) {

    return;
  }


  event.preventDefault();
  event.stopPropagation();


  const messageId =
    button.closest(
      "[data-message-id]"
    )?.dataset.messageId;


  const message =
    game.messages.get(
      messageId
    );


  const rollDefinition =
    message &&
    chatMessageRolls(
      message
    ).find(
      roll =>
        roll.id ===
        button.dataset.poke5eItemRoll
    );


  if (!rollDefinition) {

    ui.notifications.warn(
      currentLanguage() ===
        "en"
        ? "This card's roll could not be found."
        : "No se encontró la tirada de esta tarjeta."
    );


    return;
  }


  if (
    !canCurrentUserRollMessage(
      message
    )
  ) {

    ui.notifications.warn(
      currentLanguage() ===
        "en"
        ? "You do not have permission to make this roll."
        : "No tienes permisos para realizar esta tirada."
    );


    return;
  }


  void rollItemFormula(
    message,
    rollDefinition
  );
}


// Cards published before the buttons were part of their content.
function onRenderChatMessage(
  message,
  html
) {

  if (
    !html?.querySelector ||
    html.querySelector(
      "[data-poke5e-item-roll]"
    )
  ) {

    return;
  }


  const rolls =
    chatMessageRolls(
      message
    );


  if (!rolls.length) {

    return;
  }


  const holder =
    html.querySelector(
      ".chat-card"
    ) ??
    html.querySelector(
      ".message-content"
    ) ??
    html;


  holder.insertAdjacentHTML(
    "beforeend",
    rollButtonsMarkup(
      rolls
    )
  );
}

/* ============================================================
 * REGISTRATION
 * ============================================================ */

export function registerPoke5eItemConsumptionService() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preDisplayCardV2",
    onPreDisplayCard
  );


  Hooks.on(
    "dnd5e.renderChatMessage",
    onRenderChatMessage
  );


  document.addEventListener(
    "click",
    onItemRollClick,
    true
  );
}