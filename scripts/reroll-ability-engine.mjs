import { hasPokemonAbility, pokemonTypes } from "./status-runtime.mjs";
import { messageRollShown } from "./chat-roll-display.mjs";

/* ============================================================
 * ABILITIES THAT ROLL AGAIN
 *
 * Once a Move's damage roll is shown in chat:
 * - the user's Ability may roll it again and keep the higher total (Adaptability, Iron Fist...);
 * - a target's Prism Armor rolls it again and keeps the lower one (when every target has it);
 * - each targeted Sturdy or Filter Pokémon rolls its d4; a success is stored on the message
 *   and applied whenever that damage is (dnd5e.calculateDamage), the preview included.
 * The rolls wait for Dice So Nice, and the damage message is rewritten before anyone applies it.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const D4_FLAG = "abilityD4";

const PUNCH_MOVES = new Set(["mega-punch", "comet-punch", "fire-punch", "ice-punch", "thunder-punch", "dizzy-punch",
  "dynamic-punch", "focus-punch", "mach-punch", "bullet-punch", "drain-punch", "shadow-punch", "sky-uppercut", "hammer-arm",
  "meteor-mash", "power-up-punch", "ice-hammer", "plasma-fists", "double-iron-bash", "wicked-blow", "surging-strikes",
  "rage-fist", "jet-punch", "headlong-rush"]);
const BITE_MOVES = new Set(["bite", "crunch", "fire-fang", "ice-fang", "thunder-fang", "poison-fang", "hyper-fang",
  "psychic-fangs", "super-fang", "jaw-lock", "fishious-rend"]);

const moveType = move => move?.getFlag?.(MODULE_ID, "moveType");
const moveId = move => move?.getFlag?.(MODULE_ID, "sourceId");
const vulnerable = (actor, type) => actor?.system?.traits?.dv?.value?.has?.(type) ?? false;

// Ability → does it let `actor` roll the damage of `move` against `targets` twice?
const KEEP_HIGHER = {
  adaptability: (actor, move) => move?.getFlag?.(MODULE_ID, "stab")?.eligible === true || pokemonTypes(actor).includes(moveType(move)),
  "dragons-maw": (_actor, move) => moveType(move) === "dragon",
  "rocky-payload": (_actor, move) => moveType(move) === "rock",
  transistor: (_actor, move) => moveType(move) === "electric",
  "iron-fist": (_actor, move) => PUNCH_MOVES.has(moveId(move)),
  "strong-jaw": (_actor, move) => BITE_MOVES.has(moveId(move)),
  technician: (_actor, move) => Number(move?.system?.uses?.max ?? 0) >= 15,
  neuroforce: (_actor, move, targets) => targets.length > 0 && targets.every(target => vulnerable(target, moveType(move)))
};

const TEXT = {
  higher: { en: "rolls the damage again and keeps the higher total", es: "tira el daño otra vez y se queda con el total mayor" },
  lower: { en: "makes the damage be rolled again and keeps the lower total", es: "hace tirar el daño otra vez y se queda con el total menor" },
  sturdy: { en: "halves the damage", es: "reduce el daño a la mitad" },
  filter: { en: "takes no extra damage from its weakness", es: "no recibe el daño extra de su debilidad" },
  failed: { en: "no luck", es: "sin suerte" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];

function abilityName(actor, abilityId) {
  return actor.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "ability" && item.getFlag?.(MODULE_ID, "sourceId") === abilityId)?.name ?? abilityId;
}

async function announce(actor, abilityId, html) {
  await ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }),
    content: `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (${abilityName(actor, abilityId)}) ${html}.</div>` });
}

const damageRolls = rolls => rolls.filter(roll => !["healing", "temphp"].includes(roll.options?.type));
const totalOf = rolls => damageRolls(rolls).reduce((sum, roll) => sum + Number(roll.total), 0);

/* ============================================================
 * ROLL AGAIN
 * ============================================================ */

// "higher", "lower" or null, and the Ability that decides it. A user's and a target's Ability cancel out.
export function rerollMode(actor, move, targets) {
  const higher = Object.keys(KEEP_HIGHER).find(abilityId => hasPokemonAbility(actor, abilityId) && KEEP_HIGHER[abilityId](actor, move, targets));
  const lower = targets.length > 0 && targets.every(target => hasPokemonAbility(target, "prism-armor") && vulnerable(target, moveType(move)));
  if (Boolean(higher) === lower) {return null;}
  return higher ? { mode: "higher", abilityId: higher, actor } : { mode: "lower", abilityId: "prism-armor", actor: targets[0] };
}

async function rollAgain(rolls, message, { mode, abilityId, actor }) {
  const again = await Promise.all(rolls.map(roll => roll.reroll()));
  await Promise.all(damageRolls(again).map(roll => game.dice3d?.showForRoll(roll, game.user, true)));
  const [first, second] = [totalOf(rolls), totalOf(again)];
  const keep = mode === "higher" ? second > first : second < first;
  await announce(actor, abilityId, `${text(mode)}: ${first} / ${second} → <strong>${keep ? second : first}</strong>`);
  if (!keep) {return rolls;}
  await message.update({ rolls: again.map(roll => roll.toJSON()) });
  again.forEach(roll => { roll.parent = message; });
  return again;
}

/* ============================================================
 * STURDY AND FILTER
 * ============================================================ */

function expectedDamage(target, rolls, message) {
  if (typeof target.calculateDamage !== "function") {return null;}
  const damages = damageRolls(rolls).map(roll => ({ value: Number(roll.total), type: roll.options?.type, properties: new Set(roll.options?.properties ?? []) }));
  const result = target.calculateDamage(damages, { originatingMessage: message });
  return result === false ? null : result;
}

// Sturdy: damage of half its current HP or more. Filter: damage of a type it is weak to.
export function d4Candidates(targets, rolls, message) {
  return targets.flatMap(target => {
    if (hasPokemonAbility(target, "sturdy")) {
      const hp = Number(target.system?.attributes?.hp?.value ?? 0);
      const damage = expectedDamage(target, rolls, message);
      return hp > 0 && damage && damage.amount >= hp / 2 ? [{ target, abilityId: "sturdy", success: 3 }] : [];
    }
    const weak = damageRolls(rolls).some(roll => vulnerable(target, roll.options?.type));
    return hasPokemonAbility(target, "filter") && weak ? [{ target, abilityId: "filter", success: 4 }] : [];
  });
}

async function rollD4s(candidates, message) {
  const passed = {};
  for (const { target, abilityId, success } of candidates) {
    const roll = await new Roll("1d4").evaluate();
    await game.dice3d?.showForRoll(roll, game.user, true);
    const ok = roll.total >= success;
    if (ok) {passed[target.uuid] = abilityId;}
    await announce(target, abilityId, `d4 = ${roll.total}: ${ok ? text(abilityId) : text("failed")}`);
  }
  if (Object.keys(passed).length) {await message.setFlag(MODULE_ID, D4_FLAG, passed);}
}

// Sturdy halves every part of the damage; Filter only the parts doubled by a weakness.
function reducedByD4(abilityId, damage) {
  if (damage.type in (CONFIG.DND5E?.healingTypes ?? {}) || !(damage.value > 0)) {return false;}
  return abilityId === "sturdy" || Boolean({ ...damage.active?.all, ...damage.active?.type }.vulnerability);
}

// dnd5e.calculateDamage, after resistances: apply the stored Sturdy or Filter success.
export function applyD4Abilities(actor, damages, options) {
  const abilityId = options?.originatingMessage?.getFlag?.(MODULE_ID, D4_FLAG)?.[actor?.uuid];
  for (const damage of abilityId ? damages : []) {
    if (!reducedByD4(abilityId, damage)) {continue;}
    const reduced = Math.trunc(damage.value / 2);
    damages.amount -= damage.value - reduced;
    damage.value = reduced;
  }
}

/* ============================================================
 * REGISTER
 * ============================================================ */

async function onRollDamage(rolls, data) {
  const activity = data?.subject;
  const move = activity?.item?.getFlag?.(MODULE_ID, "kind") === "move" ? activity.item : null;
  const message = rolls?.[0]?.parent;
  if (!move || message?.documentName !== "ChatMessage") {return;}
  const targets = [...game.user.targets].map(token => token.actor).filter(Boolean);
  const reroll = rerollMode(activity.actor, move, targets);
  const candidates = d4Candidates(targets, rolls, message);
  if (!reroll && !candidates.length) {return;}
  await messageRollShown(message);
  const final = reroll ? await rollAgain(rolls, message, reroll) : rolls;
  await rollD4s(d4Candidates(targets, final, message), message);
}

export function registerRerollAbilityEngine() {
  Hooks.on("dnd5e.rollDamage", (rolls, data) => {
    void onRollDamage(rolls, data).catch(error => console.error(`[${MODULE_ID}] reroll abilities`, error));
  });
  Hooks.on("dnd5e.calculateDamage", applyD4Abilities);
}
