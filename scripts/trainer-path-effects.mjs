import { getPokemonTrainerUuid, getTrainerOwnedPokemon, isPokemonActor, isPokemonInParty } from "./trainer-party-service.mjs";
import { getTrainerProgressionState } from "./trainer-progression-service.mjs";
import { getTrainerSpecialization } from "./trainer-rules.mjs";
import { getTrainerLevel, isTrainerActor } from "./trainer-service.mjs";

const MODULE_ID = "poke5e-local";
const EFFECT_KIND = "trainer-path-effect";
const EFFECT_ID = "P5eTrainerPath00";
export const MULTITALENTED_FLAG = "multitalentedSkills";
const TRAINER_FLAGS = ["trainerProgression", "trainerLevel", "trainerParty", MULTITALENTED_FLAG];
let registered = false;

function authority() {
  return game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
}

const add = (key, value) => ({ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(value), priority: 20 });

/**
 * Passive level 9 path features that change the trainer's Pokémon themselves.
 * Ace Trainer, Tactical Mastery: +1 to the chosen ability score of every Pokémon.
 * Type Master, Storing Power: carried Pokémon of a specialized type resist the chosen type,
 * or lose their vulnerability to it.
 * Hobbyist L15, Multitalented: each Pokémon is proficient in the skill chosen for it.
 */
export function trainerPathEffectChanges({ pathId, choices = {}, level = 0, ...pokemon }) {
  if (level < 9) {return [];}
  if (pathId === "hobbyist") {
    return level >= 15 && pokemon.multitalentedSkill
      ? [{ key: `system.skills.${pokemon.multitalentedSkill}.value`, mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE, value: "1", priority: 20 }]
      : [];
  }
  if (pathId === "ace-trainer") {return tacticalMasteryChanges(choices.tacticalMasteryAbilityId);}
  return pathId === "type-master" ? storingPowerChanges(choices.storingPowerResistanceType, pokemon) : [];
}

function tacticalMasteryChanges(abilityId) {
  return abilityId ? [add(`system.abilities.${abilityId}.value`, 1)] : [];
}

function storingPowerChanges(type, { specializedTypes = [], pokemonTypes = [], inParty = false, traits = {} }) {
  if (!type || !inParty || !pokemonTypes.some(entry => specializedTypes.includes(entry))) {return [];}
  if (traits.dv?.includes(type)) {return [add("system.traits.dv.value", `-${type}`)];}
  return traits.dr?.includes(type) || traits.di?.includes(type) ? [] : [add("system.traits.dr.value", type)];
}

// Storing Power lives in the trainer path effect; marked with "*" so it reads as the trainer's, not the species'.
export function applyStoringPowerMatchups(pokemon, result) {
  const effect = pokemon.effects?.get?.(EFFECT_ID);
  if (!effect || effect.disabled) {return;}
  for (const change of effect.changes ?? []) {
    const value = String(change.value ?? "");
    const type = value.replace(/^-/, "");
    if (change.key === "system.traits.dr.value" && !result.resistances.some(entry => entry.type === type)) {
      result.resistances.push({ type, multiplier: "½*", storingPower: true });
    } else if (change.key === "system.traits.dv.value" && value.startsWith("-")) {
      result.weaknesses = result.weaknesses.filter(entry => entry.type !== type);
      result.weaknesses.push({ type, multiplier: "1*", storingPower: true });
    }
  }
}

function sourceTraits(pokemon) {
  const traits = pokemon._source?.system?.traits ?? {};
  return Object.fromEntries(["dr", "dv", "di"].map(key => [key, Array.from(traits[key]?.value ?? [])]));
}

function desiredChanges(pokemon) {
  const uuid = getPokemonTrainerUuid(pokemon);
  const trainer = uuid ? fromUuidSync(uuid, { strict: false }) : null;
  if (!isTrainerActor(trainer)) {return [];}
  const path = getTrainerProgressionState(trainer)?.path;
  return trainerPathEffectChanges({
    pathId: path?.id,
    choices: path?.choices ?? {},
    level: getTrainerLevel(trainer) ?? 0,
    specializedTypes: (getTrainerProgressionState(trainer)?.specializationIds ?? [])
      .map(id => getTrainerSpecialization(id)?.type).filter(Boolean),
    pokemonTypes: Array.from(pokemon.getFlag(MODULE_ID, "types") ?? []).map(type => String(type).toLowerCase()),
    inParty: isPokemonInParty(trainer, pokemon),
    multitalentedSkill: trainer.getFlag(MODULE_ID, MULTITALENTED_FLAG)?.[pokemon.id],
    traits: sourceTraits(pokemon)
  });
}

export async function synchronizeTrainerPathEffects(pokemon) {
  if (!isPokemonActor(pokemon)) {return;}
  const changes = desiredChanges(pokemon);
  const existing = pokemon.effects.get(EFFECT_ID);
  if (!changes.length) {
    if (existing) {await existing.delete();}
    return;
  }
  const name = game.settings.get(MODULE_ID, "language") === "en" ? "Trainer path features" : "Rasgos del camino del entrenador";
  if (!existing) {
    await pokemon.createEmbeddedDocuments("ActiveEffect", [{ _id: EFFECT_ID, name, img: "icons/svg/upgrade.svg", disabled: false,
      transfer: false, changes, flags: { [MODULE_ID]: { kind: EFFECT_KIND } } }], { keepId: true });
  } else if (JSON.stringify(existing.changes) !== JSON.stringify(changes) || existing.name !== name) {
    await existing.update({ name, changes });
  }
}

function changedTrainerFlags(changes) {
  const flags = changes?.flags?.[MODULE_ID] ?? {};
  return TRAINER_FLAGS.some(key => key in flags || `-=${key}` in flags);
}

async function onUpdateActor(actor, changes) {
  if (!authority()) {return;}
  if (isTrainerActor(actor) && changedTrainerFlags(changes)) {
    for (const pokemon of getTrainerOwnedPokemon(actor)) {await synchronizeTrainerPathEffects(pokemon);}
    return;
  }
  const flags = changes?.flags?.[MODULE_ID] ?? {};
  // Released Pokémon lose the effect; traits change on evolution or rebuild.
  if (isPokemonActor(actor) && ("trainerOwnerUuid" in flags || "-=trainerOwnerUuid" in flags || "types" in flags || changes?.system?.traits)) {
    await synchronizeTrainerPathEffects(actor);
  }
}

export function registerTrainerPathEffects() {
  if (registered) {return;}
  registered = true;
  const run = task => { void task.catch(error => console.error(`[${MODULE_ID}] Error sincronizando rasgos de camino`, error)); };
  Hooks.on("updateActor", (actor, changes) => run(onUpdateActor(actor, changes)));
  Hooks.once("ready", () => {
    if (!authority()) {return;}
    run((async () => {
      for (const pokemon of game.actors.filter(isPokemonActor)) {
        if (getPokemonTrainerUuid(pokemon) || pokemon.effects.get(EFFECT_ID)) {await synchronizeTrainerPathEffects(pokemon);}
      }
    })());
  });
}
