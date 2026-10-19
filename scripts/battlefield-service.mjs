import { hasPokemonAbility, pokemonTypes } from "./status-runtime.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { getPokemonTypes, setPokemonTypes } from "./pokemon-type-service.mjs";

/* ============================================================
 * BATTLEFIELD: WEATHER, TERRAIN AND ENVIRONMENT
 *
 * One weather and one terrain for the whole combat (agreed with the user), kept on the Combat:
 * flags.poke5e-local.battlefield = { weather: { id, endsRound, damage, source }, terrain: { id, endsRound },
 * environment }. Weather and terrain Moves and the weather Abilities set it on their own; the GM changes
 * it from the combat tracker. Only the active GM writes it: other clients ask through the socket.
 * Desolate Land and Primordial Sea impose their weather while they are in the combat.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const FLAG = "battlefield";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOCKET_TYPE = "battlefield-set";
const ORIGINAL_TYPES = "originalTypes";

export const WEATHERS = ["sun", "rain", "sandstorm", "hail", "snow"];
export const TERRAINS = ["electric", "grassy", "misty", "psychic"];
export const ENVIRONMENTS = ["outdoor", "indoor", "desert", "arctic", "water"];

const WEATHER_MOVES = { "sunny-day": ["weather", "sun", 5], "rain-dance": ["weather", "rain", 5], sandstorm: ["weather", "sandstorm", 5],
  hail: ["weather", "hail", 5], snowscape: ["weather", "snow", 10], "electric-terrain": ["terrain", "electric", 3],
  "grassy-terrain": ["terrain", "grassy", 3], "misty-terrain": ["terrain", "misty", 3], "psychic-terrain": ["terrain", "psychic", 3] };
const WEATHER_ABILITIES = { drizzle: "rain", drought: "sun", "sand-stream": "sandstorm", "snow-warning": "hail" };
const WEATHER_DAMAGE = {
  sandstorm: { type: "rock", immuneTypes: ["rock", "steel", "ground"], immuneAbilities: ["sand-force", "sand-rush", "sand-veil", "overcoat"] },
  hail: { type: "ice", immuneTypes: ["ice"], immuneAbilities: ["slush-rush", "snow-cloak", "ice-body", "overcoat"] }
};
// Sandstorm and Hail hurt for half the level of whoever called them, rounded up.
const weatherDamage = (id, actor) => (WEATHER_DAMAGE[id] ? Math.ceil(Number(actor?.system?.details?.level ?? 0) / 2) : 0);

const LABELS = {
  es: { weather: "Clima", terrain: "Terreno", environment: "Entorno", none: "—", rounds: "rondas",
    sun: "Sol abrasador", rain: "Lluvia", sandstorm: "Tormenta de arena", hail: "Granizo", snow: "Nieve",
    "extreme-sun": "Sol extremo", "heavy-rain": "Diluvio",
    electric: "Eléctrico", grassy: "Hierba", misty: "Niebla", psychic: "Psíquico",
    outdoor: "Exterior", indoor: "Interior", desert: "Desierto", arctic: "Ártico", water: "Agua",
    changed: "El campo de batalla cambia", ended: "termina", locked: "El clima no puede cambiar ahora",
    weatherHit: "sufre daño por el clima", heals: "recupera", grassyHeal: "se cura con el Terreno de Hierba" },
  en: { weather: "Weather", terrain: "Terrain", environment: "Environment", none: "—", rounds: "rounds",
    sun: "Harsh sunlight", rain: "Rain", sandstorm: "Sandstorm", hail: "Hail", snow: "Snow",
    "extreme-sun": "Extremely harsh sunlight", "heavy-rain": "Heavy rain",
    electric: "Electric", grassy: "Grassy", misty: "Misty", psychic: "Psychic",
    outdoor: "Outdoors", indoor: "Indoors", desert: "Desert", arctic: "Arctic", water: "Water",
    changed: "The battlefield changes", ended: "ends", locked: "The weather cannot change now",
    weatherHit: "is hurt by the weather", heals: "recovers", grassyHeal: "heals on the Grassy Terrain" }
};

const label = key => LABELS[game.settings.get(MODULE_ID, "language") === "en" ? "en" : "es"][key] ?? key;
const gmAuthority = () => game.user.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id);
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] battlefield`, error)); };
const alive = actor => Number(actor?.system?.attributes?.hp?.value) > 0;
const combatActors = combat => [...new Set([...combat?.combatants ?? []].map(combatant => combatant.actor).filter(Boolean))];
const present = (combat, abilityId) => combatActors(combat).some(actor => alive(actor) && hasPokemonAbility(actor, abilityId));

async function chat(content, actor = null) {
  await ChatMessage.implementation.create({ speaker: actor ? ChatMessage.implementation.getSpeaker({ actor }) : {},
    content: `<div class="poke5e-turn-message">${content}</div>` });
}

/* ============================================================
 * READ
 * ============================================================ */

export function battlefield(combat = game.combat) {
  return combat?.getFlag?.(MODULE_ID, FLAG) ?? {};
}

// The weathers in force. The primal ones replace any other, and can be both at once.
export function activeWeathers(combat = game.combat) {
  const primal = [present(combat, "desolate-land") && "extreme-sun", present(combat, "primordial-sea") && "heavy-rain"].filter(Boolean);
  if (primal.length) {return primal;}
  const id = battlefield(combat).weather?.id;
  return id ? [id] : [];
}

const EXTREME = { sun: "extreme-sun", rain: "heavy-rain" };

export function hasWeather(id, combat = game.combat) {
  const weathers = activeWeathers(combat);
  return weathers.includes(id) || weathers.includes(EXTREME[id]);
}

// Cloud Nine and Air Lock: weather Abilities do nothing while either is in the combat.
export function abilityWeather(id, combat = game.combat) {
  return !present(combat, "cloud-nine") && !present(combat, "air-lock") && hasWeather(id, combat);
}

export const activeTerrain = (combat = game.combat) => battlefield(combat).terrain?.id ?? null;
export const environment = (combat = game.combat) => battlefield(combat).environment ?? "outdoor";

export function isGrounded(actor) {
  return !(Number(actor?.system?.attributes?.movement?.fly) > 0) && !hasPokemonAbility(actor, "levitate");
}

export function distanceBetween(a, b) {
  const [from, to] = [a?.getActiveTokens?.()[0], b?.getActiveTokens?.()[0]];
  if (!from || !to) {return Infinity;}
  return globalThis.canvas?.grid?.measurePath?.([from.center, to.center])?.distance ?? Infinity;
}

/* ============================================================
 * WRITE
 * ============================================================ */

const primalLock = combat => present(combat, "desolate-land") || present(combat, "primordial-sea");
const stored = (change, combat) => (change ? { id: change.id, damage: change.damage ?? 0, source: change.source ?? null,
  endsRound: change.rounds ? Number(combat.round || 1) + change.rounds : null } : null);
const describe = change => (change ? `<strong>${label(change.id)}</strong>${change.rounds ? ` (${change.rounds} ${label("rounds")})` : ""}` : label("none"));

// changes: { weather?, terrain?, environment? }; weather/terrain: { id, rounds, damage, source } or null.
export async function setBattlefield(changes, combat = game.combat) {
  if (!combat) {return;}
  if (!gmAuthority()) {
    game.socket.emit(SOCKET_CHANNEL, { type: SOCKET_TYPE, combatId: combat.id, changes });
    return;
  }
  const next = { ...battlefield(combat) };
  const said = [];
  for (const key of ["weather", "terrain"].filter(entry => entry in changes)) {
    if (key === "weather" && changes.weather && primalLock(combat)) {
      said.push(label("locked"));
      continue;
    }
    next[key] = stored(changes[key], combat);
    said.push(`${label(key)}: ${describe(changes[key])}`);
  }
  if (changes.environment) {
    next.environment = changes.environment;
    said.push(`${label("environment")}: <strong>${label(changes.environment)}</strong>`);
  }
  await combat.setFlag(MODULE_ID, FLAG, next);
  if (said.length) {await chat(`${label("changed")}: ${said.join(" · ")}.`);}
}

async function expire(combat) {
  const state = battlefield(combat);
  const ended = ["weather", "terrain"].filter(key => state[key]?.endsRound && combat.round >= state[key].endsRound);
  if (!ended.length) {return;}
  await combat.setFlag(MODULE_ID, FLAG, { ...state, ...Object.fromEntries(ended.map(key => [key, null])) });
  await chat(ended.map(key => `${label(state[key].id)} ${label("ended")}`).join(" · "));
}

/* ============================================================
 * MOVES AND ABILITIES THAT SET IT
 * ============================================================ */

function onPostUseActivity(activity) {
  const item = activity?.item;
  const rule = item?.getFlag?.(MODULE_ID, "kind") === "move" ? WEATHER_MOVES[item.getFlag(MODULE_ID, "sourceId")] : null;
  if (!rule || !game.combat) {return;}
  const [key, id, rounds] = rule;
  const damage = weatherDamage(id, activity.actor);
  logged(setBattlefield({ [key]: { id, rounds, damage, source: { actorUuid: activity.actor?.uuid } } }));
}

// Drizzle, Drought, Sand Stream, Snow Warning: outdoors, on entering; a tie goes to the highest DEX.
export function weatherOnEntry(pokemon, combat = game.combat) {
  const abilityId = Object.keys(WEATHER_ABILITIES).find(id => hasPokemonAbility(pokemon, id));
  if (!abilityId || !combat || environment(combat) === "indoor") {return null;}
  const dex = Number(pokemon.system?.abilities?.dex?.value ?? 0);
  if (outranked(pokemon, dex, combat)) {return null;}
  const id = WEATHER_ABILITIES[abilityId];
  return { id, rounds: 5, damage: weatherDamage(id, pokemon), source: { actorUuid: pokemon.uuid, ability: abilityId, dex } };
}

// Its own weather already, or another weather Ability with as much DEX still fighting.
function outranked(pokemon, dex, combat) {
  const current = battlefield(combat).weather?.source;
  if (current?.actorUuid === pokemon.uuid) {return true;}
  const rival = current?.ability ? fromUuidSync(current.actorUuid, { strict: false }) : null;
  return Boolean(rival) && alive(rival) && combatActors(combat).includes(rival) && Number(current.dex) >= dex;
}

// Joining the combat: the GM decides. A switch: the client that made it.
function onEntry(pokemon, decides) {
  const weather = isPokemonActor(pokemon) && decides ? weatherOnEntry(pokemon) : null;
  if (weather) {logged(setBattlefield({ weather }));}
}

/* ============================================================
 * FORECAST AND MIMICRY (run by the GM, who can change types)
 * ============================================================ */

const FORECAST = { sun: "fire", rain: "water", hail: "ice", snow: "ice" };
const MIMICRY = { electric: "electric", grassy: "grass", misty: "fairy", psychic: "psychic" };

export function shapedTypes(actor, combat = game.combat) {
  if (hasPokemonAbility(actor, "forecast")) {
    const weather = Object.keys(FORECAST).find(id => abilityWeather(id, combat));
    return [weather ? FORECAST[weather] : "normal"];
  }
  const terrain = activeTerrain(combat);
  return hasPokemonAbility(actor, "mimicry") && terrain ? [MIMICRY[terrain]] : null;
}

async function reshape(combat) {
  for (const actor of combatActors(combat).filter(isPokemonActor)) {
    if (!["forecast", "mimicry"].some(abilityId => hasPokemonAbility(actor, abilityId))) {continue;}
    const original = actor.getFlag(MODULE_ID, ORIGINAL_TYPES);
    const wanted = shapedTypes(actor, combat) ?? original ?? getPokemonTypes(actor);
    if (wanted.join() === pokemonTypes(actor).join()) {continue;}
    if (!original) {await actor.setFlag(MODULE_ID, ORIGINAL_TYPES, getPokemonTypes(actor));}
    await setPokemonTypes(actor, wanted);
  }
}

// After the combat, Forecast and Mimicry go back to their own types.
async function restoreShapes(combat) {
  for (const actor of combatActors(combat).filter(entry => entry.getFlag?.(MODULE_ID, ORIGINAL_TYPES))) {
    await setPokemonTypes(actor, actor.getFlag(MODULE_ID, ORIGINAL_TYPES));
    await actor.unsetFlag(MODULE_ID, ORIGINAL_TYPES);
  }
}

/* ============================================================
 * TURNS: WEATHER DAMAGE AND HEALING
 * ============================================================ */

export function weatherDamageFor(actor, combat = game.combat) {
  const weather = Object.keys(WEATHER_DAMAGE).find(id => activeWeathers(combat).includes(id));
  const rule = WEATHER_DAMAGE[weather];
  const damage = Number(battlefield(combat).weather?.damage ?? 0);
  if (!rule || damage <= 0 || !alive(actor)) {return null;}
  const immune = pokemonTypes(actor).some(type => rule.immuneTypes.includes(type)) ||
    rule.immuneAbilities.some(abilityId => hasPokemonAbility(actor, abilityId));
  return immune ? null : { value: damage, type: rule.type };
}

// Sandstorm and Hail hurt whoever starts its turn in them.
export async function processBattlefieldStartTurn(actor) {
  const damage = weatherDamageFor(actor);
  if (!damage) {return;}
  await actor.applyDamage([damage]);
  await chat(`<strong>${actor.name}</strong> ${label("weatherHit")}: ${damage.value}.`, actor);
}

// End of turn: + heals, - damage. Grassy Terrain, Dry Skin, Rain Dish, Ice Body.
// Ability → [weather, proficiency multiplier].
const WEATHER_HEALING = [["dry-skin", "sun", -1], ["dry-skin", "rain", 1], ["rain-dish", "rain", 1], ["ice-body", "hail", 1], ["ice-body", "snow", 1]];

export function endTurnHealing(actor, combat = game.combat) {
  const prof = Number(actor.system?.attributes?.prof ?? 0);
  const parts = activeTerrain(combat) === "grassy" && isGrounded(actor) ? [["grassy", prof]] : [];
  for (const [abilityId, weather, sign] of WEATHER_HEALING) {
    if (hasPokemonAbility(actor, abilityId) && abilityWeather(weather, combat) && !parts.some(([source]) => source === abilityId)) {parts.push([abilityId, sign * prof]);}
  }
  return parts;
}

export async function processBattlefieldEndTurn(actor) {
  if (!alive(actor)) {return;}
  for (const [source, value] of endTurnHealing(actor)) {
    if (!value) {continue;}
    await actor.applyDamage(value > 0 ? [{ value, type: "healing" }] : -value);
    const what = source === "grassy" ? label("grassyHeal") : `(${source}) ${value > 0 ? label("heals") : label("weatherHit")}`;
    await chat(`<strong>${actor.name}</strong> ${what}: ${Math.abs(value)}.`, actor);
  }
}

/* ============================================================
 * COMBAT TRACKER CONTROL
 * ============================================================ */

function select(name, values, current, disabled) {
  const options = ["", ...values].map(value => `<option value="${value}" ${value === (current ?? "") ? "selected" : ""}>${value ? label(value) : label("none")}</option>`);
  return `<label class="poke5e-battlefield__field"><span>${label(name)}</span>
    <select data-poke5e-battlefield="${name}" ${disabled ? "disabled" : ""}>${options.join("")}</select></label>`;
}

function onRenderCombatTracker(_app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const combat = game.combat;
  root?.querySelector(".poke5e-battlefield")?.remove();
  if (!root || !combat) {return;}
  const state = battlefield(combat);
  const gm = game.user.isGM;
  const panel = document.createElement("div");
  panel.className = "poke5e-battlefield";
  panel.innerHTML = select("weather", WEATHERS, activeWeathers(combat)[0] ?? state.weather?.id, !gm) +
    select("terrain", TERRAINS, state.terrain?.id, !gm) + select("environment", ENVIRONMENTS.slice(1), state.environment === "outdoor" ? "" : state.environment, !gm);
  panel.addEventListener("change", event => {
    const field = event.target.dataset.poke5eBattlefield;
    const value = event.target.value || null;
    if (field === "environment") {logged(setBattlefield({ environment: value ?? "outdoor" }));return;}
    const rounds = field === "terrain" ? 3 : 5;
    // shortcut: weather the GM sets hurts for half the highest Pokémon level in the combat, rounded up; ask for it if that is off.
    const level = Math.max(0, ...combatActors(combat).map(actor => Number(actor.system?.details?.level ?? 0)));
    logged(setBattlefield({ [field]: value ? { id: value, rounds, damage: WEATHER_DAMAGE[value] ? Math.ceil(level / 2) : 0 } : null }));
  });
  (root.querySelector(".combat-tracker-header") ?? root.querySelector("header") ?? root).append(panel);
}

/* ============================================================
 * REGISTER
 * ============================================================ */

function onUpdateCombat(combat, changed) {
  if ("round" in changed && gmAuthority()) {logged(expire(combat));}
  if (gmAuthority()) {logged(reshape(combat));}
}

export function registerBattlefieldService() {
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("updateCombat", onUpdateCombat);
  Hooks.on("deleteCombat", combat => { if (gmAuthority()) {logged(restoreShapes(combat));} });
  Hooks.on("createCombatant", combatant => onEntry(combatant.actor, gmAuthority()));
  Hooks.on("poke5ePokemonSwitched", ({ incoming }) => onEntry(incoming, true));
  Hooks.on("renderCombatTracker", onRenderCombatTracker);
  Hooks.once("ready", () => game.socket.on(SOCKET_CHANNEL, message => {
    if (message?.type !== SOCKET_TYPE || !gmAuthority()) {return;}
    logged(setBattlefield(message.changes, game.combats.get(message.combatId)));
  }));
}
