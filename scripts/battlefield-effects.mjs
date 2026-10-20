import { activeTerrain, activeWeathers, battlefield } from "./battlefield-service.mjs";

/* ============================================================
 * BATTLEFIELD EFFECTS
 *
 * Shows the combat's weather and terrain on its scene:
 * - the weather as an FXMaster preset (rain, sandstorm, hail...);
 * - the terrain as a soft FXMaster color tint under the tokens, plus a JB2A animation (Sequencer)
 *   on the Pokémon that made it.
 * The active GM keeps the scene in step with the battlefield; what it started is remembered on the scene
 * (flags.poke5e-local.battlefieldFx), so the GM's own FXMaster effects are never touched.
 * Without FXMaster (or Sequencer and JB2A for the animation) the weather still works, just without effects.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "battlefieldEffects";
const SCENE_FLAG = "battlefieldFx";
const JB2A = "modules/JB2A_DnD5e/Library/Generic";

// Weather → an FXMaster preset (with options), or our own effects when the free preset is empty.
const SAND = "#d9b77e";
const WEATHER_EFFECTS = {
  sun: { preset: "heat-wave" },
  "extreme-sun": { preset: "heat-wave", options: { density: "very-high" } },
  rain: { preset: "rain" },
  "heavy-rain": { preset: "thunderstorm" },
  // FXMaster's sandstorm preset needs FXMaster+: sand-colored blowing particles and a brown haze instead.
  sandstorm: { effects: [
    { kind: "particle", type: "snowstorm", options: { tint: { apply: true, value: SAND }, scale: 0.5, direction: 0, speed: 1.8,
      lifetime: 0.4, density: 1.4, alpha: 1 } },
    { kind: "filter", type: "fog", options: { color: { apply: true, value: "#b38b5a" }, dimensions: 0.6, speed: 1.2, density: 0.45 } },
    { kind: "filter", type: "color", options: { belowTokens: true, color: { apply: true, value: "#f0d9a8" } } }
  ] },
  hail: { preset: "hail" },
  snow: { preset: "snow" }
};

// Terrain → tint, animation and its radius in feet.
const TERRAIN_EFFECTS = {
  electric: { tint: "#fff1a8", file: `${JB2A}/Lightning/StaticElectricity_01_Regular_Blue_400x400.webm`, radius: 40 },
  grassy: { tint: "#d6f5c6", file: `${JB2A}/Nature/PlantGrowthRingPulse03_01_Regular_GreenYellow_500x500.webm`, radius: 40 },
  misty: { tint: "#fadcef", file: `${JB2A}/Fog/AmbientFog001_001_Complete_White_1200x1200.webm`, radius: 60, animationTint: "#f7b6d8" },
  psychic: { tint: "#e6d2fb", file: `${JB2A}/Particles/ParticleBurstCircle01_01_Regular_BluePurple_600x600.webm`, radius: 40 }
};

const gmAuthority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] battlefield effects`, error)); };
const active = moduleId => game.modules?.get(moduleId)?.active === true;
const fxReady = () => active("fxmaster") && Boolean(globalThis.FXMASTER?.api?.presets && globalThis.FXMASTER.api.effects);
const enabled = () => game.settings.get(MODULE_ID, SETTING) !== false && fxReady();

// What the scene should show for this combat. No combat, or effects off: nothing.
export function wantedEffects(combat, on = true) {
  if (!combat || !on) {return { weather: null, terrain: null };}
  return { weather: activeWeathers(combat).find(id => WEATHER_EFFECTS[id]) ?? null, terrain: activeTerrain(combat) };
}

/* ============================================================
 * ANIMATION
 * ============================================================ */

const canAnimate = () => active("sequencer") && active("JB2A_DnD5e") && typeof globalThis.Sequence === "function";

// The token of whoever made the terrain; none when the GM set it from the tracker.
function terrainSourceToken(combat) {
  const source = battlefield(combat).terrain?.source?.actorUuid;
  return source ? fromUuidSync(source, { strict: false })?.getActiveTokens?.()[0] ?? null : null;
}

function playTerrainAnimation(combat, terrain) {
  const effect = TERRAIN_EFFECTS[terrain];
  const token = terrainSourceToken(combat);
  if (!effect || !token || !canAnimate()) {return;}
  const squares = (effect.radius * 2) / Number(combat.scene?.grid?.distance ?? canvas.scene?.grid?.distance ?? 5);
  const sequence = new globalThis.Sequence().effect().file(effect.file).atLocation(token).size(squares, { gridUnits: true })
    .belowTokens().fadeIn(300).fadeOut(800);
  if (effect.animationTint) {sequence.tint(effect.animationTint);}
  logged(sequence.play());
}

/* ============================================================
 * SYNC
 * ============================================================ */

// Stops the weather this module started and plays the new one. Returns what to remember for stopping it.
async function syncWeather(scene, current, wanted) {
  if (current.weather === wanted.weather) {return { preset: current.preset ?? null, ids: current.weatherIds ?? null };}
  const { presets, effects } = globalThis.FXMASTER.api;
  if (current.preset) {await presets.stop(current.preset, { scene });}
  if (current.weatherIds) {await effects.stop({ ...current.weatherIds, scene });}
  const rule = WEATHER_EFFECTS[wanted.weather];
  if (rule?.preset) {await presets.play(rule.preset, { ...rule.options, scene });}
  const ids = rule?.effects ? await effects.play({ effects: rule.effects, scene }) : null;
  return { preset: rule?.preset ?? null, ids: ids ? { particles: ids.particles ?? [], filters: ids.filters ?? [] } : null };
}

async function syncTerrain(scene, current, wanted, combat) {
  if (current.terrain === wanted.terrain) {return current.filters ?? [];}
  const { effects } = globalThis.FXMASTER.api;
  if (current.filters?.length) {await effects.filters.stop(current.filters, { scene });}
  if (!wanted.terrain) {return [];}
  const ids = await effects.play({ filters: [{ type: "color",
    options: { belowTokens: true, color: { value: TERRAIN_EFFECTS[wanted.terrain].tint, apply: true } } }], scene });
  playTerrainAnimation(combat, wanted.terrain);
  return ids?.filters ?? [];
}

export async function syncScene(scene, combat) {
  if (!scene || !gmAuthority() || !fxReady()) {return;}
  const current = scene.getFlag(MODULE_ID, SCENE_FLAG) ?? {};
  const wanted = wantedEffects(combat, enabled());
  const weather = await syncWeather(scene, current, wanted);
  const filters = await syncTerrain(scene, current, wanted, combat);
  const next = { weather: wanted.weather, preset: weather.preset, weatherIds: weather.ids, terrain: wanted.terrain, filters };
  if (JSON.stringify(next) === JSON.stringify(current)) {return;}
  // Replaced whole: setFlag would merge with what an older weather left behind.
  await scene.update({ [`flags.${MODULE_ID}.-=${SCENE_FLAG}`]: null });
  await scene.setFlag(MODULE_ID, SCENE_FLAG, next);
}

// One sync at a time, so quick changes do not start the same effect twice.
let queue = Promise.resolve();

function queueSync(combat, { ended = false } = {}) {
  const scene = combat?.scene ?? globalThis.canvas?.scene ?? null;
  queue = queue.then(() => syncScene(scene, ended ? null : combat)).catch(error => console.error(`[${MODULE_ID}] battlefield effects`, error));
}

export function registerBattlefieldEffects() {
  game.settings.register(MODULE_ID, SETTING, {
    name: "Poke5e - Efectos de clima y terreno",
    hint: "Muestra el clima y el terreno del combate con FXMaster (y una animación de JB2A al crear un terreno). Sin FXMaster, el clima funciona igual pero sin efectos.",
    scope: "world", config: true, type: Boolean, default: true,
    onChange: () => queueSync(game.combat)
  });
  Hooks.on("updateCombat", combat => queueSync(combat));
  Hooks.on("createCombatant", combatant => queueSync(combatant.parent));
  Hooks.on("deleteCombatant", combatant => queueSync(combatant.parent));
  Hooks.on("deleteCombat", combat => queueSync(combat, { ended: true }));
  Hooks.once("ready", () => queueSync(game.combat, { ended: !game.combat }));
}
