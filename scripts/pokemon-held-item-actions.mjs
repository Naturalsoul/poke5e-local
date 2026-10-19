import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { canCurrentUserOperateTrainerPokemon } from "./trainer-ownership-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { prepareBerryHealing, publishBerryHealing } from "./berry-healing.mjs";
import { rememberEatenBerry, unnervedBy } from "./berry-ability-engine.mjs";

const pendingUses = new WeakSet();
const LABELS = {
  es: {
    use: "Usar", charges: "cargas", units: "unidades", exhausted: "Sin cargas", unavailable: "Esta acción no está disponible.",
    permission: "No tienes permiso para usar los objetos de este Pokémon.",
    invalid: "Este Pokémon ya no lleva ese objeto.", busy: "El objeto ya se está usando.",
    confirmTitle: "Consumir baya", confirm: name => `¿Consumir ${name}?`, consumeNotice: "Se consumirá una unidad del objeto equipado.",
    unnerved: name => `${name} (Unnerve) no deja comer bayas en este combate.`,
    actions: { action: "Acción", bonus: "Acción adicional", reaction: "Reacción", free: "Acción gratuita",
      minute: "Minuto", hour: "Hora", special: "Especial", legendary: "Acción legendaria", lair: "Acción de guarida" }
  },
  en: {
    use: "Use", charges: "charges", units: "units", exhausted: "No charges", unavailable: "This action is unavailable.",
    permission: "You do not have permission to use this Pokémon's items.",
    invalid: "This Pokémon is no longer holding that item.", busy: "This item is already being used.",
    confirmTitle: "Consume berry", confirm: name => `Consume ${name}?`, consumeNotice: "One unit of the held item will be consumed.",
    unnerved: name => `${name} (Unnerve) does not let it eat berries in this combat.`,
    actions: { action: "Action", bonus: "Bonus action", reaction: "Reaction", free: "Free action",
      minute: "Minute", hour: "Hour", special: "Special", legendary: "Legendary action", lair: "Lair action" }
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function charges(uses) {
  const max = Number(uses?.max);
  if (!(max > 0) || !Number.isFinite(max)) {
    return null;
  }
  return { max, remaining: Math.max(0, max - (Number(uses.spent) || 0)) };
}

function activityCharges(item, activity) {
  const targets = Array.from(activity.consumption?.targets ?? []);
  const consumesItem = targets.some(target => target.type === "itemUses" &&
    (!target.target || target.target === item.id) && target.value !== "0");
  const consumesActivity = targets.some(target => target.type === "activityUses" &&
    (!target.target || target.target === activity.id) && target.value !== "0");
  const pools = [];
  if (consumesItem && charges(item.system?.uses)) {
    pools.push(charges(item.system.uses));
  }
  if (consumesActivity && charges(activity.uses)) {
    pools.push(charges(activity.uses));
  }
  return pools;
}

export function canUsePokemonHeldItem(pokemon, trainer) {
  return isPokemonActor(pokemon) && Boolean(game.user.isGM ||
    (trainer && canCurrentUserOperateTrainerPokemon(trainer, pokemon)));
}

export function getHeldItemActions(item, language = "es") {
  const labels = LABELS[language] ?? LABELS.es;
  if (!(Number(item?.system?.quantity ?? 1) > 0)) {
    return [];
  }
  return Array.from(item?.system?.activities?.values?.() ?? []).filter(activity =>
    typeof activity?.use === "function" && activity.canUse !== false &&
    !globalThis.CONFIG?.DND5E?.activityActivationTypes?.[activity.activation?.type]?.passive
  ).map(activity => {
    const type = activity.activation?.type;
    const nativeLabel = globalThis.CONFIG?.DND5E?.activityActivationTypes?.[type]?.label;
    const action = labels.actions[type] ?? nativeLabel ?? labels.actions.special;
    const count = Number(activity.activation?.value ?? 1);
    const pools = activityCharges(item, activity);
    const exhausted = pools.some(pool => pool.remaining === 0);
    const berry = activity.flags?.["poke5e-local"]?.consumeBerry;
    const quantity = Math.max(0, Number(item.system?.quantity ?? 1));
    return {
      id: activity.id, name: activity.name || item.name, action: count > 1 ? `${count} × ${action}` : action,
      charges: berry ? `${quantity} ${labels.units}` : pools.map(pool => `${pool.remaining}/${pool.max} ${labels.charges}`).join(" · "),
      chargeCount: berry ? String(quantity) : pools.map(pool => `${pool.remaining}/${pool.max}`).join(" · "),
      disabled: exhausted, reason: exhausted ? labels.exhausted : ""
    };
  });
}

export function heldItemActionButtons(item, { language = "es", canUse = false } = {}) {
  const labels = LABELS[language] ?? LABELS.es;
  return getHeldItemActions(item, language).map(action => {
    const description = [`${labels.use}: ${action.name}`, action.action, action.charges].filter(Boolean).join(" · ");
    const reason = !canUse ? labels.permission : action.reason;
    const tooltip = reason ? `${description} — ${reason}` : description;
    return `
    <span class="poke5e-pokemon-held-item__use-control">
    <button type="button" class="poke5e-pokemon-held-item__use"
      data-pokemon-sheet-action="held-item-use" data-item-id="${escapeHtml(item.id)}"
      data-activity-id="${escapeHtml(action.id)}" ${!canUse || action.disabled ? "disabled" : ""}
      title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(tooltip)}">
      <i class="fa-solid fa-play" aria-hidden="true"></i>
    </button>
    ${action.chargeCount ? `<span class="poke5e-pokemon-held-item__charges" aria-hidden="true">${escapeHtml(action.chargeCount)}</span>` : ""}
    </span>
  `;
  }).join("");
}

function resolveHeldAction({ pokemon, trainer, itemId, activityId, language, labels }) {
  if (!canUsePokemonHeldItem(pokemon, trainer)) {
    throw new Error(labels.permission);
  }
  const item = getPokemonHeldItem(pokemon);
  if (!item || item.id !== itemId) {
    throw new Error(labels.invalid);
  }
  const action = getHeldItemActions(item, language).find(entry => entry.id === activityId);
  const activity = item.system.activities?.get(activityId);
  if (!action || action.disabled || !activity) {
    throw new Error(action?.reason || labels.unavailable);
  }
  return { item, activity };
}

async function useBerry(context) {
  const { pokemon, labels, language } = context;
  // Unnerve: an opponent in the combat stops it from eating berries.
  const unnerved = unnervedBy(pokemon);
  if (unnerved) {
    throw new Error(labels.unnerved(unnerved.name));
  }
  // Gluttony eats it without asking.
  const confirmed = context.confirm === false || await foundry.applications.api.DialogV2.confirm({
    window: { title: labels.confirmTitle },
    content: `<p>${escapeHtml(labels.confirm(context.item.name))}</p><p>${escapeHtml(labels.consumeNotice)}</p>`,
    rejectClose: false, modal: true
  });
  if (confirmed !== true) {
    return undefined;
  }
  // Mientras se decide en el diálogo pueden cambiar el objeto, las existencias o los permisos.
  let current = resolveHeldAction(context);
  const roll = await prepareBerryHealing(current.item, pokemon);
  current = resolveHeldAction(context);
  const itemName = current.item.name;
  const source = current.item.toObject?.();
  const results = await current.activity.use({ consume: { resources: true }, scaling: false }, { configure: false });
  if (results?.message && roll) {
    await publishBerryHealing(roll, { pokemon, itemName, usageMessage: results.message, language });
  }
  if (results) {
    await rememberEatenBerry(pokemon, source);
  }
  return results;
}

export async function usePokemonHeldItem({ pokemon, trainer, itemId, activityId, language = "es", confirm = true }) {
  const labels = LABELS[language] ?? LABELS.es;
  const context = { pokemon, trainer, itemId, activityId, language, labels, confirm };
  const { item, activity } = resolveHeldAction(context);
  if (pendingUses.has(pokemon)) {
    throw new Error(labels.busy);
  }
  pendingUses.add(pokemon);
  try {
    if (activity.flags?.["poke5e-local"]?.consumeBerry) {
      return await useBerry({ ...context, item });
    }
    return await activity.use();
  } finally {
    pendingUses.delete(pokemon);
  }
}
