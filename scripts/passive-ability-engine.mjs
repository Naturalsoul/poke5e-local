import { hasPokemonAbility, hasPokemonStatus, pokemonTypes } from "./status-runtime.mjs";
import { originatingMoveItem } from "./damage-engine.mjs";
import { grantNextAttackAdvantage } from "./attack-ability-engine.mjs";

/* ============================================================
 * PASSIVE ABILITIES
 *
 * Abilities that only change numbers, read from tables:
 * - defenses against damage of a type or from some Moves (preCalculateDamage);
 * - critical hits on the holder deal no extra damage (damage roll configuration);
 * - attack roll bonuses, advantage and disadvantage (preRollAttack);
 * - flat damage bonuses (damage roll configuration).
 * ============================================================ */

const MODULE_ID = "poke5e-local";

const SOUND_MOVES = new Set(["growl", "roar", "sing", "supersonic", "screech", "snore", "perish-song", "heal-bell", "uproar",
  "hyper-voice", "metal-sound", "grass-whistle", "bug-buzz", "chatter", "round", "echoed-voice", "relic-song", "snarl",
  "noble-roar", "disarming-voice", "parting-shot", "boomburst", "confide", "sparkling-aria", "clanging-scales",
  "clangorous-soul", "overdrive", "eerie-spell", "torch-song", "alluring-voice", "psychic-noise"]);
const WIND_MOVES = new Set(["aeroblast", "air-cutter", "bleakwind-storm", "blizzard", "fairy-wind", "gust", "heat-wave",
  "hurricane", "icy-wind", "petal-blizzard", "sandsear-storm", "sandstorm", "springtide-storm", "tailwind", "twister",
  "whirlwind", "wildbolt-storm"]);
const EXPLOSION_MOVES = new Set(["self-destruct", "explosion"]);
const BULLET_MOVE = /bullet|ball|bomb/;

// effect: immune (no damage), absorb (no damage, heals half), half, resist (half unless already resisted),
// next-attack (takes the damage, its next attack has advantage). types: damage types; moves: Move ids.
const DEFENSES = {
  levitate: { types: ["ground"], effect: "immune" },
  "volt-absorb": { types: ["electric"], effect: "absorb" },
  "water-absorb": { types: ["water"], effect: "absorb" },
  "earth-eater": { types: ["ground"], effect: "absorb" },
  "sap-sipper": { types: ["grass"], effect: "immune", advantage: true },
  "flash-fire": { types: ["fire"], effect: "immune" },
  "well-baked-body": { types: ["fire"], effect: "immune" },
  heatproof: { types: ["fire"], effect: "half" },
  "thick-fat": { types: ["fire", "ice"], effect: "half" },
  "water-bubble": { types: ["fire"], effect: "resist" },
  "purifying-salt": { types: ["ghost"], effect: "resist" },
  "punk-rock": { moves: id => SOUND_MOVES.has(id), effect: "resist" },
  soundproof: { moves: id => SOUND_MOVES.has(id), effect: "immune" },
  bulletproof: { moves: id => BULLET_MOVE.test(id), effect: "immune" },
  damp: { moves: id => EXPLOSION_MOVES.has(id), effect: "immune" },
  "wind-rider": { moves: id => WIND_MOVES.has(id), effect: "immune" },
  justified: { types: ["dark"], effect: "next-attack" },
  rattled: { types: ["dark", "bug", "ghost"], effect: "next-attack" },
  "toxic-boost": { types: ["poison"], effect: "next-attack" },
  "thermal-exchange": { types: ["fire"], effect: "next-attack" }
};

const CRITICAL_IMMUNE = ["battle-armor", "shell-armor", "solid-rock"];
const FULL_HP_HALF = ["multiscale", "shadow-shield"];
const COMPETITIVE_STATUSES = ["poisoned", "burned", "confused", "paralysis"];

const TEXT = {
  immune: { en: "takes no damage", es: "no recibe daño" },
  absorb: { en: "absorbs the hit and heals", es: "absorbe el golpe y recupera" },
  half: { en: "takes half the damage", es: "recibe la mitad del daño" },
  resist: { en: "resists the damage", es: "resiste el daño" },
  "next-attack": { en: "will make its next attack with advantage", es: "hará su próximo ataque con ventaja" },
  advantage: { en: "and will make its next attack with advantage", es: "y hará su próximo ataque con ventaja" }
};

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const text = key => TEXT[key][en() ? "en" : "es"];

function activeAbility(actor, abilityIds) {
  return abilityIds.find(abilityId => hasPokemonAbility(actor, abilityId)) ?? null;
}

function abilityName(actor, abilityId) {
  return actor.items?.find(item => item.getFlag?.(MODULE_ID, "kind") === "ability" && item.getFlag?.(MODULE_ID, "sourceId") === abilityId)?.name ?? abilityId;
}

/* ============================================================
 * DEFENSES
 * ============================================================ */

const defenseMatches = (rule, damage, moveId) => rule.types?.includes(damage.type) || Boolean(moveId && rule.moves?.(moveId));
const resisted = (actor, type) => actor.system?.traits?.dr?.value?.has?.(type) ?? false;

function defend(actor, damage, effect) {
  const before = damage.value;
  if (["immune", "absorb"].includes(effect)) {damage.value = 0;}
  else if (effect === "half" || (effect === "resist" && !resisted(actor, damage.type))) {damage.value = Math.trunc(before / 2);}
  return effect === "absorb" ? Math.floor(before / 2) : 0;
}

const isMeleeDamage = options =>
  options.originatingMessage?.getOriginatingMessage?.()?.getAssociatedActivity?.()?.attack?.type?.value === "melee";

// Fluffy: half damage from melee attacks that are not Fire, double from Fire.
function fluffy(damage, melee) {
  if (damage.type === "fire") {damage.value *= 2;}
  else if (melee) {damage.value = Math.trunc(damage.value / 2);}
}

function typeDefenses(actor, damages, moveId) {
  const triggered = [];
  let healed = 0;
  for (const [abilityId, rule] of Object.entries(DEFENSES)) {
    if (!hasPokemonAbility(actor, abilityId)) {continue;}
    for (const damage of damages.filter(entry => entry.value > 0 && defenseMatches(rule, entry, moveId))) {
      healed += defend(actor, damage, rule.effect);
      triggered.push({ abilityId, effect: rule.effect, advantage: rule.advantage || rule.effect === "next-attack" });
    }
  }
  return { triggered, healed };
}

// Multiscale, Shadow Shield: at full HP the damage is halved.
function fullHpDefense(actor, damages) {
  const abilityId = activeAbility(actor, FULL_HP_HALF);
  const hp = actor.system?.attributes?.hp;
  if (!abilityId || !hp || hp.value < hp.max) {return null;}
  damages.forEach(damage => { damage.value = Math.trunc(damage.value / 2); });
  return { abilityId, effect: "half" };
}

export function applyDefensiveAbilities(actor, damages, options = {}) {
  const moveId = originatingMoveItem(options)?.getFlag?.(MODULE_ID, "sourceId") ?? null;
  const { triggered, healed } = typeDefenses(actor, damages, moveId);
  if (hasPokemonAbility(actor, "fluffy")) {
    const melee = isMeleeDamage(options);
    damages.forEach(damage => fluffy(damage, melee));
  }
  const fullHp = fullHpDefense(actor, damages);
  if (fullHp) {triggered.push(fullHp);}
  if (healed > 0) {damages.push({ value: healed, type: "healing", properties: new Set() });}
  if (triggered.length) {options[MODULE_ID] = { ...options[MODULE_ID], abilityDefense: { triggered, healed } };}
}

async function announceDefense(actor, _amount, options) {
  const defense = options?.[MODULE_ID]?.abilityDefense;
  if (!defense) {return;}
  const [first] = defense.triggered;
  const advantage = defense.triggered.find(entry => entry.advantage);
  if (advantage) {await grantNextAttackAdvantage(actor, advantage.abilityId);}
  const healed = first.effect === "absorb" ? ` ${defense.healed} HP` : "";
  const extra = advantage && first.effect !== "next-attack" ? ` ${text("advantage")}` : "";
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content:
    `<div class="poke5e-turn-message"><strong>${actor.name}</strong> (${abilityName(actor, first.abilityId)}) ${text(first.effect)}${healed}${extra}.</div>` });
}

/* ============================================================
 * ROLL CONFIGURATION
 * ============================================================ */

const targetActors = () => [...game.user?.targets ?? []].map(token => token.actor).filter(Boolean);
const moveOf = activity => (activity?.item?.getFlag?.(MODULE_ID, "kind") === "move" ? activity.item : null);
const isMelee = activity => activity?.attack?.type?.value === "melee";

// Flat damage bonus from the attacker's Ability, 0 when none applies.
export function damageAbilityBonus(actor, move, targets) {
  const prof = Number(actor.system?.attributes?.prof ?? 0);
  const moveType = move?.getFlag?.(MODULE_ID, "moveType");
  const ownTypes = pokemonTypes(actor);
  const applies =
    (hasPokemonAbility(actor, "rivalry") && targets.some(target => pokemonTypes(target).some(type => ownTypes.includes(type)))) ||
    (hasPokemonAbility(actor, "competitive") && COMPETITIVE_STATUSES.some(status => hasPokemonStatus(actor, status))) ||
    (hasPokemonAbility(actor, "flare-boost") && hasPokemonStatus(actor, "burned")) ||
    (hasPokemonAbility(actor, "steelworker") && moveType === "steel");
  return applies ? prof : 0;
}

function addDamageBonus(rolls, actor, activity) {
  const bonus = damageAbilityBonus(actor, moveOf(activity), targetActors());
  const index = rolls.findIndex(roll => roll && !["healing", "temphp"].includes(roll.options?.type));
  if (!bonus || index < 0) {return;}
  const roll = rolls[index];
  rolls.splice(index, 1, new roll.constructor(`${roll.formula} + ${bonus}`, roll.data, foundry.utils.deepClone(roll.options)));
}

// Battle Armor, Shell Armor, Solid Rock: a critical hit deals no extra damage when every target has one.
function removeCriticalDamage(rolls) {
  const targets = targetActors();
  if (!targets.length || !targets.every(target => activeAbility(target, CRITICAL_IMMUNE))) {return;}
  for (const roll of rolls.filter(entry => entry?.isCritical)) {
    roll.options.isCritical = false;
    roll.configureDamage();
  }
}

function onPostRollConfiguration(rolls, config) {
  if (!Array.isArray(rolls) || !Array.from(config?.hookNames ?? []).includes("damage")) {return;}
  const activity = config.subject;
  const actor = activity?.actor ?? activity?.item?.actor;
  if (!actor) {return;}
  addDamageBonus(rolls, actor, activity);
  removeCriticalDamage(rolls);
}

// { bonus, advantage, disadvantage, critical } for an attack by `actor` with `move` against `targets`.
export function attackAbilityModifiers(actor, move, targets, { melee = false } = {}) {
  const has = abilityId => hasPokemonAbility(actor, abilityId);
  const anyTarget = predicate => targets.some(predicate);
  return {
    bonus: (has("compound-eyes") ? 1 : 0) + (has("gale-wings") && move?.getFlag?.(MODULE_ID, "moveType") === "flying" ? 1 : 0),
    advantage: (has("intrepid-sword") && melee) || has("no-guard") || anyTarget(target => hasPokemonAbility(target, "no-guard")),
    disadvantage: (melee && anyTarget(target => hasPokemonAbility(target, "dauntless-shield"))) ||
      anyTarget(target => hasPokemonAbility(target, "tangled-feet") && hasPokemonStatus(target, "confused")),
    critical: has("super-luck") ? 19 : null
  };
}

function onPreRollAttack(config) {
  const activity = config?.subject;
  const actor = activity?.actor;
  const rollConfig = config?.rolls?.[0];
  if (!actor || !rollConfig) {return;}
  const modifiers = attackAbilityModifiers(actor, moveOf(activity), targetActors(), { melee: isMelee(activity) });
  rollConfig.options ??= {};
  rollConfig.parts ??= [];
  if (modifiers.bonus) {rollConfig.parts.push(String(modifiers.bonus));}
  if (modifiers.advantage) {rollConfig.options.advantage = true;}
  if (modifiers.disadvantage) {rollConfig.options.disadvantage = true;}
  if (modifiers.critical) {rollConfig.options.criticalSuccess = Math.min(rollConfig.options.criticalSuccess ?? 20, modifiers.critical);}
}

export function registerPassiveAbilityEngine() {
  Hooks.on("dnd5e.preCalculateDamage", applyDefensiveAbilities);
  Hooks.on("dnd5e.applyDamage", (actor, amount, options) => {
    void announceDefense(actor, amount, options).catch(error => console.error(`[${MODULE_ID}] passive abilities`, error));
  });
  Hooks.on("dnd5e.postRollConfiguration", onPostRollConfiguration);
  Hooks.on("dnd5e.preRollAttack", onPreRollAttack);
}
