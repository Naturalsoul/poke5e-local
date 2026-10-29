import { getPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { pokemonTypes } from "./status-runtime.mjs";
import { buildPokemonStatusEffect } from "./status-effects.mjs";
import { heldItemCriticalRange, heldItemDamageBonus, PUNCHING_MOVE_IDS } from "./held-item-rules.mjs";
import { heldItemConfiguration, isHeldItemHealing } from "./held-item-config.mjs";
import { registerBerryHealingChat } from "./berry-healing.mjs";
import { applyBindingDamageBonus, captureBindingDamage, recordBindingDamage, synchronizeBindingMoves } from "./periodic-engine.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { isAuthority } from "./foundry-runtime.mjs";

const MODULE_ID = "poke5e-local";
const pendingActors = new Map();
let registered = false;
const EXPERT_BELT_APPLIED = Symbol("expert-belt-applied");
const DEFENSE_APPLIED = Symbol("held-item-defense-applied");
const reservedSashes = new WeakSet();

function heldItem(actor) {
  if (!isPokemonActor(actor)) {
    return null;
  }
  const item = getPokemonHeldItem(actor);
  if (!item || Number(item.system?.quantity ?? 1) <= 0) {
    return null;
  }
  return item;
}

function sourceId(item) {
  return item?.getFlag(MODULE_ID, "sourceId");
}

// Lo que el objeto hace por su cuenta (PG, cambio de portador) solo se ve en el token: se dice en el chat.
function announce(actor, item, es, en) {
  const text = game.settings.get(MODULE_ID, "language") === "en" ? en : es;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (${item.name}): ${text}.</div>` });
}

function proficiency(actor) {
  return Math.max(0, Number(actor.system?.attributes?.prof ?? actor.getFlag(MODULE_ID, "proficiencyBonus")) || 0);
}

function moveSourceId(move) {
  return move?.getFlag(MODULE_ID, "sourceId") ?? move?.getFlag(MODULE_ID, "moveDefinition")?.id;
}

// Poke5e clasifica el contacto mediante el alcance cuerpo a cuerpo del movimiento.
function contactMove(move) {
  return move?.getFlag(MODULE_ID, "moveDefinition")?.attack?.scope === "melee";
}

async function claimTrigger(actor, item, key) {
  if (!key) {return false;}
  const trigger = `${item.id}:${key}`;
  const history = actor.getFlag(MODULE_ID, "heldItemTriggers") ?? [];
  if (history.includes(trigger)) {return false;}
  await actor.setFlag(MODULE_ID, "heldItemTriggers", [...history.slice(-31), trigger]);
  return true;
}

export function heldItemPreventsContactReactions(actor, moveId) {
  const id = sourceId(heldItem(actor));
  return id === "protective-pads" || (id === "punching-glove" && PUNCHING_MOVE_IDS.includes(moveId));
}

function replaceRoll(roll, bonus, marker) {
  const options = foundry.utils.deepClone(roll.options ?? {});
  options[MODULE_ID] = { ...options[MODULE_ID], heldItemBonus: marker };
  return new roll.constructor(`(${roll.formula}) + ${bonus}`, roll.data, options);
}

export function applyHeldItemRollBonuses(rolls, config, _dialog, message) {
  const activity = config?.subject;
  const move = activity?.item;
  if (move?.getFlag(MODULE_ID, "kind") !== "move") {
    return;
  }
  const actor = activity.actor ?? move.actor;
  const held = heldItem(actor);
  if (!held) {
    return;
  }
  const id = sourceId(held);
  const hooks = new Set(config.hookNames ?? []);
  if (hooks.has("damage")) {
    if (move.getFlag(MODULE_ID, "struggle")?.noAmplification) {
      return;
    }
    const useId = foundry.utils.getProperty(message?.data, "flags.dnd5e.originatingMessage") ??
      message?.data?.["flags.dnd5e.originatingMessage"] ??
      config.event?.target?.closest?.("[data-message-id]")?.dataset?.messageId;
    applyDamageBonus(rolls, activity, held, { actor, useId });
  } else if (hooks.has("attack")) {
    applyAttackBonus(rolls, id, actor);
  }
}

function applyDamageBonus(rolls, activity, held, { actor, useId }) {
  const id = sourceId(held);
  // Un solo bono por conjunto de tiradas, incluso si contiene varios tipos/partes.
  if (rolls.some(roll => roll.options?.[MODULE_ID]?.heldItemBonus)) {
    return;
  }
  if (id !== "life-orb" && useId && Array.from(game.messages ?? []).some(message =>
    Array.from(message.rolls ?? []).some(roll => {
      const marker = roll.options?.[MODULE_ID]?.heldItemBonus;
      return marker?.itemId === held.id && marker?.useId === useId;
    })
  )) {
    return;
  }
  const scope = activity.type === "attack"
    ? activity.item.getFlag(MODULE_ID, "moveDefinition")?.attack?.scope
    : null;
  const moveId = activity.item.getFlag(MODULE_ID, "sourceId") ??
    activity.item.getFlag(MODULE_ID, "moveDefinition")?.id;
  const deferred = id === "expert-belt";
  const index = rolls.findIndex(roll => {
    const type = roll.options?.type;
    return !["healing", "temphp", "maximum"].includes(type) &&
      (deferred || heldItemDamageBonus(id, { type, scope, proficiency: proficiency(actor), moveId }) > 0);
  });
  if (index < 0) {
    return;
  }
  const bonus = deferred ? proficiency(actor) : heldItemDamageBonus(id, {
    type: rolls[index].options?.type, scope, proficiency: proficiency(actor), moveId
  });
  const marker = { sourceId: id, itemId: held.id, bonus, useId };
  if (deferred) {
    // El objetivo aún no se conoce. Guardar el bono, sin sumarlo a la tirada compartida.
    rolls[index].options[MODULE_ID] = { ...rolls[index].options[MODULE_ID], heldItemBonus: { ...marker, deferred: true } };
  } else {
    rolls[index] = replaceRoll(rolls[index], bonus, marker);
  }
}

export function applyExpertBeltDamage(_target, damages, options) {
  if (!damages || damages[EXPERT_BELT_APPLIED] || !(damages.amount > 0)) {
    return;
  }
  const { message, move } = originatingMove(options);
  if (move?.getFlag(MODULE_ID, "kind") !== "move" || move.getFlag(MODULE_ID, "struggle")?.noAmplification) {
    return;
  }
  const held = heldItem(move.actor);
  if (sourceId(held) !== "expert-belt") {
    return;
  }
  const marker = Array.from(message.rolls ?? []).map(roll => roll.options?.[MODULE_ID]?.heldItemBonus)
    .find(entry => entry?.sourceId === "expert-belt" && entry.itemId === held.id && entry.deferred);
  if (!marker) {
    return;
  }
  const part = Array.from(damages).find(damage => damage.value > 0 &&
    !["healing", "temphp", "maximum"].includes(damage.type) &&
    (damage.active?.type?.vulnerability || damage.active?.all?.vulnerability) &&
    !(damage.active?.type?.resistance || damage.active?.all?.resistance));
  if (!part) {
    return;
  }
  // El multiplicador de la aplicación (p. ej., mitad por salvación) afecta al bono;
  // la vulnerabilidad nativa ya está resuelta y no lo vuelve a duplicar.
  const bonus = Math.max(0, Math.trunc(marker.bonus * Number(options.multiplier ?? 1)));
  part.value += bonus;
  damages.amount += bonus;
  damages[EXPERT_BELT_APPLIED] = true;
}

function applyAttackBonus(rolls, id, actor) {
  const range = heldItemCriticalRange(id, actor.getFlag(MODULE_ID, "sourceId"));
  if (!range && id !== "wide-lens") {
    return;
  }
  for (let index = 0; index < rolls.length; index++) {
    let roll = rolls[index];
    if (roll.options?.[MODULE_ID]?.heldItemAttack) {
      continue;
    }
    if (id === "wide-lens") {
      roll = replaceRoll(roll, 1, { sourceId: id, bonus: 1 });
      rolls[index] = roll;
    }
    if (range) {
      roll.options.criticalSuccess = Math.max(2, Number(roll.options.criticalSuccess ?? 20) - range);
    }
    roll.options[MODULE_ID] = { ...roll.options[MODULE_ID], heldItemAttack: id };
  }
}

function serializeActor(actor, task) {
  const key = actor.uuid;
  const next = (pendingActors.get(key) ?? Promise.resolve()).then(task);
  const settled = next.catch(error => {
    console.error(`[${MODULE_ID}] Error automatizando objeto equipado:`, error);
  });
  pendingActors.set(key, settled);
  void settled.then(() => {
    if (pendingActors.get(key) === settled) {
      pendingActors.delete(key);
    }
  });
  return next;
}

function originatingMove(options) {
  const message = options?.originatingMessage;
  const move = message?.getAssociatedItem?.();
  return { message, move };
}

export function captureHeldItemAppliedDamage(actor, amount, updates, options) {
  if (!(amount > 0) || !options) {
    return;
  }
  const hp = actor.system?.attributes?.hp;
  if (!hp) {
    return;
  }
  const held = heldItem(actor);
  if (sourceId(held) === "focus-sash" && hp.value > 0 &&
    Number(updates["system.attributes.hp.value"] ?? hp.value) < 1 &&
    Number(held.system?.uses?.spent ?? 0) < 1 && !reservedSashes.has(held)) {
    updates["system.attributes.hp.value"] = 1;
    reservedSashes.add(held);
    options[MODULE_ID] ??= {};
    options[MODULE_ID].focusSash = held;
  }
  const lostHp = Math.max(0, hp.value - Number(updates["system.attributes.hp.value"] ?? hp.value));
  const lostTemp = Math.max(0, (hp.temp ?? 0) - Number(updates["system.attributes.hp.temp"] ?? hp.temp ?? 0));
  options[MODULE_ID] ??= {};
  options[MODULE_ID].heldItemDamageApplied = lostHp + lostTemp;
  captureBindingDamage(actor, options);
}

export async function processHeldItemAppliedDamage(_target, amount, options) {
  await recordBindingDamage(_target, amount, options);
  const sash = options?.[MODULE_ID]?.focusSash;
  if (sash) {
    try {
      await sash.update({ "system.uses.spent": 1 });
    } finally {
      reservedSashes.delete(sash);
      delete options[MODULE_ID].focusSash;
    }
    await announce(_target, sash, "aguanta con 1 PG", "hangs on with 1 HP");
  }
  if (!(amount > 0) || options?.[MODULE_ID]?.heldItemDamageApplied === 0) {
    return;
  }
  const defensiveItem = heldItem(_target);
  if (sourceId(defensiveItem) === "air-balloon" && !defensiveItem.getFlag(MODULE_ID, "popped")) {
    await defensiveItem.setFlag(MODULE_ID, "popped", true);
    await announce(_target, defensiveItem, "el globo explota", "the balloon pops");
  }
  const { message, move } = originatingMove(options);
  const actor = move?.actor;
  if (!isPokemonActor(actor) || move?.getFlag(MODULE_ID, "kind") !== "move") {
    return;
  }
  await processDefensiveHeldItem(_target, actor, move, message);
  await serializeActor(actor, async () => {
    const held = heldItem(actor);
    const id = sourceId(held);
    if (!["shell-bell", "life-orb"].includes(id)) {
      return;
    }
    if (move.getFlag(MODULE_ID, "struggle")?.noAmplification && id === "life-orb") {
      return;
    }
    // El mensaje de uso identifica el movimiento completo, incluidos todos sus objetivos.
    const use = message.getOriginatingMessage?.() ?? message;
    const useId = use.uuid ?? use.id;
    if (!useId) {
      return;
    }
    // Life Orb solo cobra retroceso si su bonificador estuvo presente en esta tirada.
    const boosted = Array.from(message.rolls ?? []).map(roll => roll.options?.[MODULE_ID]?.heldItemBonus)
      .find(marker => marker?.sourceId === "life-orb" && marker.itemId === held.id);
    if (id === "life-orb" && !boosted) {
      return;
    }
    // Life Orb cobra por tirada de daño; Shell Bell cura una vez por movimiento.
    const triggerId = id === "life-orb" ? message.uuid ?? message.id : useId;
    if (!triggerId) {
      return;
    }
    const key = `${held.id}:${triggerId}`;
    const history = actor.getFlag(MODULE_ID, "heldItemTriggers") ?? [];
    if (history.includes(key)) {
      return;
    }
    await actor.setFlag(MODULE_ID, "heldItemTriggers", [...history.slice(-31), key]);
    const bonus = id === "life-orb" ? boosted.bonus : proficiency(actor);
    if (id === "life-orb") {
      await actor.applyDamage(bonus); // Daño sin tipo, sin volver a activar el objeto.
      await announce(actor, held, `pierde ${bonus} PG`, `loses ${bonus} HP`);
    } else {
      const hp = actor.system.attributes.hp;
      // Un objeto curativo no revive automáticamente a un Pokémon debilitado.
      if (hp.value > 0 && hp.value < hp.max) {
        const healed = Math.min(bonus, hp.max - hp.value);
        await actor.applyDamage(-healed);
        await announce(actor, held, `recupera ${healed} PG`, `recovers ${healed} HP`);
      }
    }
  });
}

async function processDefensiveHeldItem(target, attacker, move, message) {
  if (!isPokemonActor(target)) {return;}
  await serializeActor(target, async () => {
    const item = heldItem(target);
    const id = sourceId(item);
    if (!contactMove(move) || heldItemPreventsContactReactions(attacker, moveSourceId(move))) {return;}
    const use = message.getOriginatingMessage?.() ?? message;
    const key = use.uuid ?? use.id;
    if (id === "rocky-helmet" && await claimTrigger(target, item, key)) {
      const damage = proficiency(target);
      await attacker.applyDamage(damage);
      await announce(target, item, `${attacker.name} recibe ${damage} de daño`, `${attacker.name} takes ${damage} damage`);
    } else if (id === "sticky-barb" && !heldItem(attacker) &&
      await claimTrigger(target, item, key)) {
      // Crear primero: si el atacante no admite el objeto, el original se conserva.
      const source = item.toObject();
      delete source._id;
      const [created] = await attacker.createEmbeddedDocuments("Item", [source]);
      if (!created) {return;}
      try {
        await attacker.setFlag(MODULE_ID, "heldItemId", created.id);
        await item.delete();
        await target.unsetFlag(MODULE_ID, "heldItemId");
      } catch (error) {
        await created.delete();
        await attacker.unsetFlag(MODULE_ID, "heldItemId");
        throw error;
      }
      await announce(target, item, `se pega a ${attacker.name}`, `sticks to ${attacker.name}`);
    }
  });
}

export async function processHeldItemEndTurn(actor) {
  const held = heldItem(actor);
  if (!held || !(actor.system?.attributes?.hp?.value > 0)) {
    return;
  }
  const id = sourceId(held);
  if (id === "sticky-barb") {
    const damage = proficiency(actor);
    await actor.applyDamage(damage);
    await announce(actor, held, `recibe ${damage} de daño`, `takes ${damage} damage`);
    return;
  }
  if (id === "black-sludge" && !pokemonTypes(actor).includes("poison")) {
    const roll = await new Roll("1d6").evaluate();
    await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor: `${held.name} — ${actor.name}` });
    await actor.applyDamage([{ type: "poison", value: roll.total }]);
    return;
  }
  const status = id === "flame-orb" ? "burned" : null;
  if (status) {
    const language = game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es";
    const effect = buildPokemonStatusEffect(status, language, { sourceId: id });
    if (effect) {
      // La creación normal respeta inmunidades, exclusividad y periodos de gracia del motor.
      await actor.createEmbeddedDocuments("ActiveEffect", [{ ...effect, origin: held.uuid }]);
    }
  }
}

export function synchronizeHeldItemPassives(actor) {
  if (!isPokemonActor(actor) || !isAuthority()) {
    return Promise.resolve();
  }
  return serializeActor(actor, async () => {
    await synchronizeBindingMoves(actor);
    const held = heldItem(actor);
    await configureHeldItem(held);
    const effects = Array.from(actor.effects ?? []).filter(effect => effect.getFlag(MODULE_ID, "heldItemPassive"));
    const id = sourceId(held);
    const changes = passiveChanges(actor, id);
    if (changes.length && effects.length === 1 && !effects[0].disabled &&
      effects[0].origin === held.uuid && JSON.stringify(effects[0].changes.map(change => ({
        key: change.key, mode: change.mode, value: change.value
      }))) === JSON.stringify(changes)) {
      return;
    }
    if (effects.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(effect => effect.id));
    }
    if (changes.length) {
      await actor.createEmbeddedDocuments("ActiveEffect", [{
        name: held.name, img: held.img, origin: held.uuid, transfer: false, changes,
        flags: { [MODULE_ID]: { heldItemPassive: true } }
      }]);
    }
  });
}

async function configureHeldItem(item) {
  const configuration = heldItemConfiguration(sourceId(item), game.settings.get(MODULE_ID, "language"), item?.getFlag(MODULE_ID, "itemType"));
  if (!configuration || item.getFlag(MODULE_ID, "heldItemConfiguration") === 1) {return;}
  const updates = {
    "system.uses.max": configuration.uses.max,
    "system.uses.spent": Number(item.system?.uses?.spent ?? 0),
    "system.uses.recovery": configuration.uses.recovery,
    [`flags.${MODULE_ID}.heldItemConfiguration`]: 1
  };
  if (configuration.uses.autoDestroy !== undefined) {
    updates["system.uses.autoDestroy"] = configuration.uses.autoDestroy;
  }
  for (const [id, activity] of Object.entries(configuration.activities ?? {})) {
    updates[`system.activities.${id}`] = activity;
  }
  await item.update(updates);
}

export function applyHeldItemDefenses(target, damages, options = {}) {
  const held = heldItem(target);
  if (sourceId(held) !== "air-balloon" || held.getFlag(MODULE_ID, "popped") || damages[DEFENSE_APPLIED]) {return;}
  for (const part of damages) {
    if (part.type !== "ground" || !(part.value > 0)) {continue;}
    damages.amount -= part.value;
    part.value = 0;
    part.active ??= {};
    part.active.multiplier = 0;
    part.active.heldItemImmunity = true;
  }
  const threshold = Number(target.system?.attributes?.hp?.dt ?? 0);
  if (damages.amount > 0 && damages.amount < threshold && options.ignore !== true && !options.ignore?.threshold) {
    damages.amount = 0;
    for (const part of damages) {
      if (part.value > 0) {
        part.value = 0;
        part.active ??= {};
        part.active.threshold = true;
      }
    }
  }
  damages[DEFENSE_APPLIED] = true;
}

export function validateHeldItemHealing(activity) {
  if (!isHeldItemHealing(activity)) {return true;}
  const actor = activity.actor ?? activity.item?.actor;
  const item = heldItem(actor);
  const hp = actor?.system?.attributes?.hp;
  // Activity.use() trabaja con un clon keepId del Item, no con la instancia del inventario.
  const sameItem = Boolean(item?.uuid && item.uuid === activity.item?.uuid);
  const valid = sameItem && ["leftovers", "black-sludge"].includes(sourceId(item)) &&
    (sourceId(item) !== "black-sludge" || pokemonTypes(actor).includes("poison")) &&
    hp?.value > 0 && hp.value < hp.max;
  if (valid) {return true;}
  ui.notifications.warn(game.settings.get(MODULE_ID, "language") === "en"
    ? "This holder cannot recover HP with this item now."
    : "Este portador no puede recuperar PG con este objeto ahora.");
  return false;
}

export async function processHeldItemHealing(activity) {
  if (!isHeldItemHealing(activity) || validateHeldItemHealing(activity) === false) {return;}
  const actor = activity.actor ?? activity.item.actor;
  await serializeActor(actor, async () => {
    const hp = actor.system.attributes.hp;
    if (hp.value > 0) {await actor.applyDamage(-Math.min(proficiency(actor), hp.max - hp.value));}
  });
}

export async function repairHeldAirBalloon(actor) {
  const item = heldItem(actor);
  if (sourceId(item) === "air-balloon" && item.getFlag(MODULE_ID, "popped")) {
    await item.unsetFlag(MODULE_ID, "popped");
  }
}

function passiveChanges(actor, id) {
  const add = (key, value) => ({ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(value) });
  if (id === "quick-claw") {return [add("system.attributes.init.bonus", 3)];}
  if (id === "assault-vest") {
    const field = actor.system?.attributes?.ac?.calc === "flat" ? "flat" : "bonus";
    return [add(`system.attributes.ac.${field}`, 1)];
  }
  if (id === "metal-powder" && actor.getFlag(MODULE_ID, "sourceId") === "ditto") {
    return [add("system.abilities.con.value", 3)];
  }
  return [];
}

export function validateHeldItemMove(activity) {
  const move = activity?.item;
  if (move?.getFlag(MODULE_ID, "kind") !== "move" ||
    sourceId(heldItem(activity.actor ?? move.actor)) !== "assault-vest") {return true;}
  const definition = move.getFlag(MODULE_ID, "moveDefinition");
  if (definition?.damage?.dice && Object.keys(definition.damage.dice).length) {return true;}
  ui.notifications.warn(game.settings.get(MODULE_ID, "language") === "en"
    ? "Assault Vest only permits damaging moves."
    : "Chaleco Asalto solo permite movimientos que infligen daño.");
  return false;
}

async function synchronizeAllPassives() {
  const actors = new Set(game.actors ?? []);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {
        actors.add(token.actor);
      }
    }
  }
  for (const actor of actors) {
    await synchronizeHeldItemPassives(actor);
  }
}

function run(task) {
  void task.catch(error => console.error(`[${MODULE_ID}] Error en held item:`, error));
}

export function registerHeldItemEngine() {
  if (registered) {
    return;
  }
  registered = true;
  registerBerryHealingChat();
  Hooks.on("dnd5e.postRollConfiguration", applyHeldItemRollBonuses);
  Hooks.on("dnd5e.preUseActivity", validateHeldItemMove);
  Hooks.on("dnd5e.preUseActivity", validateHeldItemHealing);
  Hooks.on("dnd5e.postUseActivity", activity => { run(processHeldItemHealing(activity)); });
  Hooks.on("dnd5e.calculateDamage", applyExpertBeltDamage);
  Hooks.on("dnd5e.calculateDamage", applyHeldItemDefenses);
  Hooks.on("dnd5e.calculateDamage", applyBindingDamageBonus);
  Hooks.on("dnd5e.preApplyDamage", captureHeldItemAppliedDamage);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => {
    run(processHeldItemAppliedDamage(actor, amount, options));
  });
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, item => { run(synchronizeHeldItemPassives(item.parent)); });
  }
  Hooks.on("updateActor", (actor, changes) => {
    if (foundry.utils.getProperty(changes, `flags.${MODULE_ID}`)) {
      run(synchronizeHeldItemPassives(actor));
    }
  });
  Hooks.on("createToken", token => { run(synchronizeHeldItemPassives(token.actor)); });
  Hooks.on("dnd5e.restCompleted", actor => { run(repairHeldAirBalloon(actor)); });
  Hooks.once("ready", () => { run(synchronizeAllPassives()); });
}
