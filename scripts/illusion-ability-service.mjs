import { hasPokemonAbility } from "./status-runtime.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { abilityName } from "./active-ability-service.mjs";
import { showPrompt } from "./trainer-reaction-service.mjs";

/* ============================================================
 * ILLUSION
 *
 * Offered at will to whoever deploys the Pokémon, before its token exists, so nobody sees its real form.
 * Only the token changes: the sheet, Moves and HP stay its own. While it lasts, chat messages, the
 * deploy banner and the cry show the copied Pokémon. It ends when a damaging Move hits it, after an
 * hour of world time, or when the token is removed.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const FLAG = "illusion";
const SECONDS = 3600;

const TEXT = {
  offer: { en: "Before coming out, <strong>{name}</strong> can take the form of a Pokémon on the scene.",
    es: "Antes de salir, <strong>{name}</strong> puede tomar la forma de un Pokémon de la escena." },
  form: { en: "Form", es: "Forma" },
  use: { en: "Use", es: "Usar" },
  takes: { en: "takes the form of {target}", es: "toma la forma de {target}" },
  verb: { en: "uses", es: "usa" },
  ends: { en: "loses its illusion", es: "pierde su ilusión" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];
const escape = value => String(value ?? "").replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
const logged = promise => void promise.catch(error => console.error(`[${MODULE_ID}] illusion`, error));

const illusionTokens = actor => (actor?.getActiveTokens?.() ?? []).map(token => token.document).filter(token => token.getFlag(MODULE_ID, FLAG));
const canIllude = pokemon => hasPokemonAbility(pokemon, "illusion");
const validModel = (pokemon, token) => Boolean(token) && !token.hidden && isPokemonActor(token.actor) && token.actor !== pokemon;

function tokenLook({ name, width, height, texture, ring }) {
  return { name, width, height, texture, ring };
}

// The name and Pokémon others should perceive: the battle feedback uses these.
export const illusionName = actor => illusionTokens(actor)[0]?.name ?? actor?.name;
export function illusionModel(actor) {
  const uuid = illusionTokens(actor)[0]?.getFlag(MODULE_ID, FLAG).modelUuid;
  return uuid ? fromUuidSync(uuid, { strict: false }) : null;
}

/* ============================================================
 * ON DEPLOY
 * ============================================================ */

// Asks on the client of whoever deploys. Resolves to the chosen token's id, or null.
export async function offerIllusion(pokemon, scene) {
  if (!canIllude(pokemon) || pokemon.getActiveTokens?.().length) {return null;}
  const models = [...scene?.tokens ?? []].filter(token => validModel(pokemon, token));
  if (!models.length) {return null;}
  const name = abilityName(pokemon, "illusion");
  const offer = text("offer").replace("{name}", escape(pokemon.name));
  const options = models.map(token => `<option value="${escape(token.id)}">${escape(token.name)}</option>`).join("");
  const answer = await showPrompt({ title: name, use: `${text("use")} ${name}`,
    content: `<p>${offer}</p><label>${text("form")} <select name="model">${options}</select></label>` });
  return answer?.model ?? null;
}

// The id may come from a player's socket request, so it is checked again here.
export async function disguiseTokenSource(pokemon, tokenSource, modelId, scene) {
  const model = modelId ? scene?.tokens?.get(modelId) : null;
  if (!canIllude(pokemon) || !validModel(pokemon, model)) {return;}
  // Sent before the token exists, so the chat disguise leaves it alone; only the owners and the GM read it.
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: pokemon }),
    whisper: game.users.filter(user => pokemon.testUserPermission(user, "OWNER")).map(user => user.id),
    content: `<div class="poke5e-turn-message"><strong>${escape(pokemon.name)}</strong> ${text("verb")} <strong>${escape(abilityName(pokemon, "illusion"))}</strong>: ${text("takes").replace("{target}", escape(model.name))}.</div>` });
  foundry.utils.setProperty(tokenSource, `flags.${MODULE_ID}.${FLAG}`, { original: tokenLook(tokenSource), until: game.time.worldTime + SECONDS,
    modelUuid: model.actor.uuid, img: model.actor.img });
  Object.assign(tokenSource, tokenLook(model.toObject()));
}

/* ============================================================
 * ENDING
 * ============================================================ */

async function endIllusion(actor, token) {
  await token.update(token.getFlag(MODULE_ID, FLAG).original);
  await token.unsetFlag(MODULE_ID, FLAG);
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${escape(actor.name)}</strong> ${text("ends")}.</div>` });
}

// Damage from a roll message counts as a hit; poison, weather and the like arrive without one.
function breakOnHit(actor, amount, options) {
  if (amount <= 0 || !options?.originatingMessage) {return;}
  logged(Promise.all(illusionTokens(actor).map(token => endIllusion(actor, token))));
}

function expire(worldTime) {
  if (!game.user.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {return;}
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      const until = token.getFlag(MODULE_ID, FLAG)?.until;
      if (token.actor && until <= worldTime) {logged(endIllusion(token.actor, token));}
    }
  }
}

// Foundry only derives a combatant's name and image when it is prepared, not when its token changes.
function refreshCombatant(token, changes) {
  if (!token.combatant || !("name" in changes || "texture" in changes)) {return;}
  token.combatant.reset();
  ui.combat?.render();
}

/* ============================================================
 * CHAT
 * ============================================================ */

// shortcut: only looks at the scene the message's author is viewing; check every scene if a GM rolls from another one.
export function disguiseChatMessage(message) {
  const tokens = [...canvas?.scene?.tokens ?? []].filter(token => token.getFlag(MODULE_ID, FLAG));
  if (!tokens.length) {return;}
  const swap = value => tokens.reduce((result, token) => [token.actor?.name, token.getFlag(MODULE_ID, FLAG).original.name].filter(Boolean)
    .reduce((replaced, real) => replaced.split(real).join(token.name), result), value);
  const { speaker } = message;
  const own = tokens.find(token => speaker?.token === token.id || (speaker?.actor && speaker.actor === token.actorId));
  const changes = { content: swap(message.content ?? "") };
  if (message.flavor) {changes.flavor = swap(message.flavor);}
  if (speaker?.alias || own) {changes["speaker.alias"] = swap(speaker.alias ?? own.name);}
  if (own) {changes[`flags.${MODULE_ID}.illusionImg`] = own.getFlag(MODULE_ID, FLAG).img;}
  if (message.flags?.dnd5e?.targets?.length) {changes["flags.dnd5e.targets"] = disguisedTargets(message.flags.dnd5e.targets, tokens);}
  message.updateSource(changes);
}

// dnd5e stores the portrait of each target on the attack card.
function disguisedTargets(targets, tokens) {
  return targets.map(target => {
    const token = tokens.find(entry => entry.actor?.uuid === target.uuid);
    return token ? { ...target, img: token.getFlag(MODULE_ID, FLAG).img } : target;
  });
}

// dnd5e draws the card's portrait from the actor. The flag keeps old messages disguised after the illusion ends.
export function disguiseChatPortrait(message, html) {
  const img = message.getFlag?.(MODULE_ID, "illusionImg");
  const avatar = html?.querySelector?.(".avatar");
  if (!img || !avatar || message.isContentVisible === false) {return;}
  const portrait = document.createElement("img");
  Object.assign(portrait, { src: img, alt: message.alias ?? "" });
  avatar.classList.remove("token");
  avatar.replaceChildren(portrait);
}

export function registerIllusionAbilityService() {
  Hooks.on("dnd5e.applyDamage", breakOnHit);
  Hooks.on("updateWorldTime", expire);
  Hooks.on("updateToken", refreshCombatant);
  Hooks.on("preCreateChatMessage", disguiseChatMessage);
  Hooks.on("dnd5e.renderChatMessage", disguiseChatPortrait);
}
