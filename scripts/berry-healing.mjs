import { isPokemonActor } from "./trainer-party-service.mjs";
import { afterPaint, waitForVisibleResult } from "./chat-roll-display.mjs";
import { hasPokemonAbility } from "./status-runtime.mjs";

const MODULE_ID = "poke5e-local";
const pendingActors = new Map();
const scheduledMessages = new Map();
let registered = false;

export async function prepareBerryHealing(item, pokemon) {
  const definitions = item.getFlag(MODULE_ID, "rolls") ?? [];
  const formulas = definitions.filter(entry => entry.kind === "healing" && entry.formula)
    .map(entry => `(${entry.formula})`);
  // Sitrus tiene curación fija en el catálogo, sin dados ni metadata de tirada.
  if (!formulas.length && item.getFlag(MODULE_ID, "sourceId") === "sitrus-berry") {
    formulas.push("30");
  }
  const formula = berryHealingFormula(formulas, pokemon);
  return formula ? new Roll(formula, pokemon.getRollData?.() ?? {}).evaluate() : null;
}

// Ripen doubles the berry's healing; Cheek Pouch adds 10% of the maximum HP, rounded up, to any berry.
export function berryHealingFormula(formulas, pokemon) {
  const berry = formulas.join(" + ");
  const doubled = berry && hasPokemonAbility(pokemon, "ripen") ? `2 * (${berry})` : berry;
  const pouch = hasPokemonAbility(pokemon, "cheek-pouch") ? Math.ceil(Number(pokemon.system?.attributes?.hp?.max ?? 0) / 10) : 0;
  return [doubled, pouch > 0 ? String(pouch) : ""].filter(Boolean).join(" + ") || null;
}

export async function publishBerryHealing(roll, { pokemon, itemName, usageMessage, language = "es" }) {
  const usageUuid = usageMessage?.uuid ?? usageMessage?.id;
  if (!roll || !usageUuid) {
    return null;
  }
  const label = language === "en" ? "Berry healing" : "Curación de baya";
  const name = String(itemName).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: pokemon }), flavor: `${label} — ${name}`,
    flags: { [MODULE_ID]: { berryHealing: { actorUuid: pokemon.uuid, usageUuid, userId: game.user.id } } }
  });
}

async function applyRenderedHealing(message) {
  const data = message.getFlag(MODULE_ID, "berryHealing");
  if (data?.userId !== game.user.id || !data.usageUuid) {
    return;
  }
  const pokemon = await fromUuid(data.actorUuid);
  if (!isPokemonActor(pokemon) || !(game.user.isGM || pokemon.isOwner)) {
    return;
  }
  const history = pokemon.getFlag(MODULE_ID, "berryHealingUses") ?? [];
  if (history.includes(data.usageUuid)) {
    return;
  }
  const total = Array.from(message.rolls ?? []).reduce((sum, roll) => sum + Number(roll.total), 0);
  if (!Number.isFinite(total) || total < 0 || !message.rolls?.length) {
    return;
  }
  const hp = pokemon.system.attributes.hp;
  const max = Number(hp.effectiveMax ?? hp.max);
  const healing = hp.value > 0 ? Math.max(0, Math.min(total, max - hp.value)) : 0;
  // Guardar la curación y su recibo juntos impide repetirla al volver a renderizar el chat.
  const updates = { [`flags.${MODULE_ID}.berryHealingUses`]: [...history, data.usageUuid] };
  if (healing > 0) {
    updates["system.attributes.hp.value"] = hp.value + healing;
  }
  await pokemon.update(updates);
}

async function finishRenderedHealing(record, message, actorUuid, failed) {
  await afterPaint();
  if (!await waitForVisibleResult(record)) {
    return;
  }
  // La máscara puede retirarse entre frames: mostrar el resultado antes de cambiar PG.
  await afterPaint();
  const previous = pendingActors.get(actorUuid) ?? Promise.resolve();
  const task = previous.then(() => applyRenderedHealing(message)).catch(failed);
  pendingActors.set(actorUuid, task);
  try {
    await task;
  } finally {
    if (pendingActors.get(actorUuid) === task) {
      pendingActors.delete(actorUuid);
    }
  }
}

function onRenderedBerryHealing(message, html) {
  const data = message.getFlag(MODULE_ID, "berryHealing");
  const key = data && `${data.actorUuid}:${data.usageUuid}`;
  if (!key || data.userId !== game.user.id) {
    return;
  }
  const existing = scheduledMessages.get(key);
  if (existing) {
    existing.html = html;
    void afterPaint().then(() => existing.refresh?.());
    return;
  }
  const record = { html };
  scheduledMessages.set(key, record);
  const failed = error => {
    scheduledMessages.delete(key);
    console.error(`[${MODULE_ID}] Error aplicando curación de baya`, error);
    ui.notifications.error(game.settings.get(MODULE_ID, "language") === "en"
      ? "Could not apply berry healing. Render the roll again to retry."
      : "No se pudo aplicar la curación de la baya. Vuelve a mostrar la tirada para reintentarlo.");
  };
  const afterAnimation = () => {
    void finishRenderedHealing(record, message, data.actorUuid, failed)
      .catch(failed).finally(() => scheduledMessages.delete(key));
  };
  // API del módulo: el render del HTML ocurre antes de que DSN quite su máscara del chat.
  const animation = game.dice3d?.waitFor3DAnimationByMessageID?.(message.id);
  if (animation) {
    void Promise.resolve(animation).then(afterAnimation).catch(failed);
  } else {
    afterAnimation();
  }
}

export function registerBerryHealingChat() {
  if (registered) {
    return;
  }
  registered = true;
  Hooks.on("dnd5e.renderChatMessage", onRenderedBerryHealing);
}
