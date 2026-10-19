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

// Weather → [FXMaster preset, preset options].
const WEATHER_PRESETS = {
  sun: ["heat-wave", {}],
  "extreme-sun": ["heat-wave", { density: "very-high" }],
  rain: ["rain", {}],
  "heavy-rain": ["thunderstorm", {}],
  sandstorm: ["sandstorm", {}],
  hail: ["hail", {}],
  snow: ["snow", {}]
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
  if (!combat || !on) {return { preset: null, presetOptions: {}, terrain: null };}
  const weather = activeWeathers(combat).find(id => WEATHER_PRESETS[id]) ?? null;
  const [preset, presetOptions] = weather ? WEATHER_PRESETS[weather] : [null, {}];
  return { preset, presetOptions, weather, terrain: activeTerrain(combat) };
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

async function syncWeather(scene, current, wanted) {
  const { presets } = globalThis.FXMASTER.api;
  if (current.preset === wanted.preset && current.presetOptions === JSON.stringify(wanted.presetOptions)) {return;}
  if (current.preset) {await presets.stop(current.preset, { scene });}
  if (wanted.preset) {await presets.play(wanted.preset, { ...wanted.presetOptions, scene });}
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
  await syncWeather(scene, current, wanted);
  const filters = await syncTerrain(scene, current, wanted, combat);
  // Options as text: setFlag merges objects, and an old option would stay behind.
  const next = { preset: wanted.preset, presetOptions: JSON.stringify(wanted.presetOptions), terrain: wanted.terrain, filters };
  if (JSON.stringify(next) !== JSON.stringify(current)) {await scene.setFlag(MODULE_ID, SCENE_FLAG, next);}
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
