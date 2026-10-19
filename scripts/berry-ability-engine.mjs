import { hasPokemonAbility } from "./status-runtime.mjs";
import { getPokemonTrainerUuid, isPokemonActor } from "./trainer-party-service.mjs";
import { getPokemonHeldItem, setPokemonHeldItem } from "./pokemon-held-item-service.mjs";
import { BERRY_ACTIVITY_ID } from "./held-item-config.mjs";
import { prepareBerryHealing, publishBerryHealing } from "./berry-healing.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { usePokemonHeldItem } from "./pokemon-held-item-actions.mjs";

/* ============================================================
 * BERRY ABILITIES
 *
 * Ripen and Cheek Pouch change the berry's healing (berry-healing.mjs). Here:
 * - Unnerve / As One: opponents in the same combat cannot eat berries;
 * - Gluttony: the held berry is eaten as soon as the Pokémon falls to half its HP or less;
 * - Harvest: at the end of its turn, after eating a berry, a d4 of 3-4 gives the berry back;
 * - Cud Chew: at the end of its next turn, the berry's healing happens again.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const EATEN_FLAG = "eatenBerry";
const UNNERVE = ["unnerve", "as-one"];

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const tokenSide = actor => actor?.getActiveTokens?.()[0]?.document?.disposition ?? null;

// The opponent in the current combat whose Unnerve stops `pokemon` from eating berries.
export function unnervedBy(pokemon) {
  const side = tokenSide(pokemon);
  return [...game.combat?.combatants ?? []].map(combatant => combatant.actor)
    .find(actor => actor && actor !== pokemon && UNNERVE.some(abilityId => hasPokemonAbility(actor, abilityId))
      && tokenSide(actor) !== side) ?? null;
}

// Harvest and Cud Chew need the berry that was eaten and when.
export async function rememberEatenBerry(pokemon, source) {
  if (!source || !["harvest", "cud-chew"].some(abilityId => hasPokemonAbility(pokemon, abilityId))) {return;}
  await pokemon.setFlag(MODULE_ID, EATEN_FLAG, { source, round: game.combat?.round ?? null });
}

/* ============================================================
 * GLUTTONY
 * ============================================================ */

export function fellBelowHalf(before, after, max) {
  return after > 0 && after <= max / 2 && before > max / 2;
}

function onPreUpdateActor(actor, changes, options) {
  if (hasPokemonAbility(actor, "gluttony")) {options[MODULE_ID] = { ...options[MODULE_ID], hpBefore: actor.system.attributes.hp.value };}
}

async function eatForGluttony(pokemon) {
  const berry = getPokemonHeldItem(pokemon);
  if (!berry?.system?.activities?.get?.(BERRY_ACTIVITY_ID)) {return;}
  const trainer = fromUuidSync(getPokemonTrainerUuid(pokemon) ?? "", { strict: false });
  await usePokemonHeldItem({ pokemon, trainer, itemId: berry.id, activityId: BERRY_ACTIVITY_ID,
    language: en() ? "en" : "es", confirm: false });
}

// Only the client that changed the HP reacts, so the berry is eaten once.
function onUpdateActor(actor, changes, options, userId) {
  const before = options?.[MODULE_ID]?.hpBefore;
  const after = foundry.utils.getProperty(changes, "system.attributes.hp.value");
  if (userId !== game.user.id || before === undefined || after === undefined) {return;}
  if (!fellBelowHalf(before, after, Number(actor.system.attributes.hp.max))) {return;}
  void eatForGluttony(actor).catch(error => ui.notifications.warn(`Gluttony: ${error.message}`));
}

/* ============================================================
 * END OF TURN: HARVEST AND CUD CHEW
 * ============================================================ */

async function chat(pokemon, html) {
  return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }),
    content: `<div class="poke5e-turn-message"><strong>${pokemon.name}</strong> ${html}</div>` });
}

async function harvest(pokemon, source) {
  if (getPokemonHeldItem(pokemon)) {return;}
  const roll = await new Roll("1d4").evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }), flavor: `Harvest — ${pokemon.name}` });
  if (roll.total < 3) {return;}
  const data = foundry.utils.deepClone(source);
  delete data._id;
  foundry.utils.setProperty(data, "system.uses.spent", 0);
  foundry.utils.setProperty(data, "system.quantity", 1);
  const [berry] = await pokemon.createEmbeddedDocuments("Item", [data]);
  await setPokemonHeldItem(pokemon, berry);
  await chat(pokemon, en() ? `harvests another <strong>${berry.name}</strong>.` : `cosecha otra <strong>${berry.name}</strong>.`);
}

async function cudChew(pokemon, source) {
  const berry = { getFlag: (scope, key) => source.flags?.[scope]?.[key] };
  const roll = await prepareBerryHealing(berry, pokemon);
  const message = await chat(pokemon, en() ? `chews <strong>${source.name}</strong> again (Cud Chew).` : `vuelve a masticar <strong>${source.name}</strong> (Cud Chew).`);
  if (roll) {await publishBerryHealing(roll, { pokemon, itemName: source.name, usageMessage: message, language: en() ? "en" : "es" });}
}

// Harvest: the turn it ate the berry. Cud Chew: its following turn.
export async function processBerryAbilitiesEndTurn(pokemon) {
  const eaten = isPokemonActor(pokemon) ? pokemon.getFlag(MODULE_ID, EATEN_FLAG) : null;
  if (!eaten?.source) {return;}
  if (hasPokemonAbility(pokemon, "cud-chew")) {
    if (eaten.round !== null && (game.combat?.round ?? 0) <= eaten.round) {return;}
    await pokemon.unsetFlag(MODULE_ID, EATEN_FLAG);
    await cudChew(pokemon, eaten.source);
    return;
  }
  await pokemon.unsetFlag(MODULE_ID, EATEN_FLAG);
  if (hasPokemonAbility(pokemon, "harvest")) {await harvest(pokemon, eaten.source);}
}

export function registerBerryAbilityEngine() {
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", onUpdateActor);
}
