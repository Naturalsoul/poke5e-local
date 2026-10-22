import { subscribeAttackOutcome } from "./attack-outcome-engine.mjs";
import { resolvePokemonCryPath } from "./pokemon-cry-service.mjs";

/* ============================================================
 * MOVE ANIMATIONS (Sequencer + JB2A)
 *
 * Every Move plays a JB2A animation chosen by its type and its shape:
 * - attack Moves, once the roll is shown (after Dice So Nice): a projectile to the target, or when melee a strike
 *   (bite, claw, punch, kick, blade… from the words of its name or description) and then its element; a miss goes past;
 * - other Moves, when used: a burst around the user, a cone or line toward the target, an effect on each
 *   target, or a buff on the user. A Move that places a template plays over it, filling it, with or without
 *   targets.
 * It reads the Move item's own data, so Moves imported before it (even with an old moveDefinition) animate too.
 * Each also plays its own sound, ripped from the games or else from the Gen 9 Move Animation Project
 * (data/move-sounds.json, built by tools/build-move-sounds.py), through Foundry's interface channel like the cries;
 * voice Moves play the user's cry. It goes to every client through the module's socket, and each plays it unless
 * its own "Move sounds" setting is off.
 * Only the user who rolls or uses it starts the animation; Sequencer shows it to everyone.
 * Without Sequencer and JB2A, or with the setting off, nothing is played.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "moveAnimations";
const SOUND_SETTING = "moveSounds";
const SOCKET_CHANNEL = `module.${MODULE_ID}`;
const SOUND_MESSAGE = "move-sound";

// projectile: ranged attacks · melee: how it hits when the Move doesn't say · burst: around the user or the template ·
// spray: cones and lines · color: tints the strike (and files whose color doesn't match the type) ·
// element: played on the target after the strike (Fire Punch: a fist, then fire).
const SWING = "from-user";
const ON = "target";
export const TYPE_ANIMATIONS = Object.freeze({
  normal: { projectile: "jb2a.ranged.02.projectile.01.yellow", melee: { file: "jb2a.impact.004.blue", at: ON }, color: "#f2efe6",
    burst: "jb2a.impact.ground_crack.01", spray: "jb2a.gust_of_wind" },
  fire: { projectile: "jb2a.fire_bolt.orange", melee: { file: "jb2a.impact.fire.01.orange", at: ON }, color: "#ff8a3d",
    element: "jb2a.impact.fire.01.orange", burst: "jb2a.fireball.explosion.orange", spray: "jb2a.breath_weapons.fire.cone.orange.01" },
  water: { projectile: "jb2a.ranged.03.projectile.01.bluegreen", melee: { file: "jb2a.liquid.splash.blue", at: ON }, color: "#3b8fe0",
    element: "jb2a.liquid.splash.blue", burst: "jb2a.liquid.splash.blue", spray: "jb2a.breath_weapons.acid.line", sprayTint: "#3b8fe0" },
  electric: { projectile: "jb2a.chain_lightning.primary.blue", melee: { file: "jb2a.static_electricity.01.blue", at: ON },
    color: "#ffe14d", element: "jb2a.static_electricity.01.blue", burst: "jb2a.lightning_strike.blue",
    spray: "jb2a.breath_weapons.lightning.line" },
  grass: { projectile: "jb2a.swirling_leaves.ranged.greenorange", melee: { file: "jb2a.vine.complete.nature.single.01.green", at: ON },
    color: "#6cc24a", element: "jb2a.vine.complete.nature.single.01.green", burst: "jb2a.plant_growth.03.ring.4x4.complete.greenyellow",
    spray: "jb2a.wind_lines.01.leaves.01.green" },
  ice: { projectile: "jb2a.ray_of_frost.blue", melee: { file: "jb2a.impact.frost.white.01", at: ON }, color: "#a8e4ff",
    element: "jb2a.impact.frost.white.01", burst: "jb2a.ice_spikes.radial.burst.white", spray: "jb2a.breath_weapons.cold.cone" },
  fighting: { projectile: "jb2a.ranged.01.projectile.01.dark_orange",
    melee: { file: "jb2a.melee_generic.creature_attack.fist.001.red", at: SWING }, color: "#c0582b",
    burst: "jb2a.impact.ground_crack.orange.01", spray: "jb2a.gust_of_wind" },
  poison: { projectile: "jb2a.ranged.04.projectile.01.green", melee: { file: "jb2a.liquid.splash02.red", at: ON }, color: "#9b4fd1",
    element: "jb2a.liquid.splash02.red", burst: "jb2a.fumes.04.complete.grey", spray: "jb2a.breath_weapons.poison.cone" },
  ground: { projectile: "jb2a.boulder.toss.02.01.stone.brown", melee: { file: "jb2a.impact.ground_crack.01", at: ON }, color: "#b08a4a",
    burst: "jb2a.ground_cracks.01", spray: "jb2a.wind_lines.01.01.white", sprayTint: "#b08a4a" },
  flying: { projectile: "jb2a.wind_stream.white", melee: { file: "jb2a.melee_generic.slash.02.001.blue", at: SWING }, color: "#cfe3ff",
    burst: "jb2a.whirlwind.bluegrey", spray: "jb2a.gust_of_wind" },
  psychic: { projectile: "jb2a.eldritch_blast.purple", melee: { file: "jb2a.unarmed_strike.magical.01.blue", at: SWING }, color: "#ff6fb5",
    burst: "jb2a.particle_burst.01.circle.bluepurple", spray: "jb2a.energy_beam.normal.bluepink.02" },
  bug: { projectile: "jb2a.ranged.04.projectile.01.green", melee: { file: "jb2a.melee_generic.creature_attack.pincer.001.red", at: SWING },
    color: "#9bc23a", burst: "jb2a.swirling_leaves.outburst.01.pink", spray: "jb2a.wind_lines.01.leaves.02.green" },
  rock: { projectile: "jb2a.boulder.toss.02.01.stone.brown", melee: { file: "jb2a.impact.ground_crack.02", at: ON }, color: "#9a8466",
    burst: "jb2a.falling_rocks.top.1x1.grey", spray: "jb2a.wind_lines.01.01.white", sprayTint: "#9a8466" },
  ghost: { projectile: "jb2a.eldritch_blast.purple", melee: { file: "jb2a.unarmed_strike.magical.02.blue", at: SWING }, color: "#7b5cc4",
    burst: "jb2a.toll_the_dead.green.shockwave", spray: "jb2a.energy_strands.range.standard.purple.01" },
  dragon: { projectile: "jb2a.fireball.beam.orange", melee: { file: "jb2a.impact.010.orange", at: ON }, color: "#6f4fe0",
    burst: "jb2a.explosion.01", spray: "jb2a.breath_weapons.fire.cone.orange.01" },
  dark: { projectile: "jb2a.ranged.01.projectile.01.dark_orange", melee: { file: "jb2a.unarmed_strike.magical.02.blue", at: SWING },
    color: "#5a3d5c", burst: "jb2a.darkness.black", spray: "jb2a.energy_strands.range.standard.purple.01" },
  steel: { projectile: "jb2a.bolt.physical.orange", melee: { file: "jb2a.hammer.melee.01.white", at: SWING }, color: "#b8c4d0",
    burst: "jb2a.shatter.blue", spray: "jb2a.lasershot.blue" },
  fairy: { projectile: "jb2a.magic_missile.purple", melee: { file: "jb2a.twinkling_stars.points07.white", at: ON }, color: "#ffa8d8",
    element: "jb2a.twinkling_stars.points07.white", burst: "jb2a.particle_burst.01.star.bluepurple",
    spray: "jb2a.energy_beam.normal.bluepink.03" }
});

// How a melee Move hits, from the words in its name, or else in its description (Feint Attack: "a sucker punch").
// The first group that matches wins; a word also matches its plural. Words that also show up in rules text
// ("attack roll", "30 feet", "STAB", "lashes out") are left out.
export const STRIKES = Object.freeze([
  { words: ["bite", "fang", "teeth", "tooth", "jaw", "chomp", "crunch", "gnaw"], file: "jb2a.bite.200px.red", at: ON },
  { words: ["claw", "talon", "scratch", "swipe", "rend"], file: "jb2a.claws.200px.red", at: ON },
  { words: ["pincer", "clamp", "crab", "vice", "grip", "scissor"], file: "jb2a.melee_generic.creature_attack.pincer.001.red", at: SWING },
  { words: ["punch", "fist", "knuckle", "palm", "chop", "jab", "uppercut", "lariat"],
    file: "jb2a.melee_generic.creature_attack.fist.001.red", at: SWING },
  { words: ["kick", "stomp", "foot", "hoof", "hooves", "trample", "knee"], file: "jb2a.unarmed_strike.physical.02.blue", at: SWING },
  { words: ["slash", "blade", "psyblade", "sword", "cut", "cutter", "cleave", "axe", "edge", "scythe", "razor"],
    file: "jb2a.melee_generic.slash.01.orange", at: SWING },
  { words: ["horn", "drill", "peck", "beak", "sting", "stinger", "needle", "pierce", "spike", "spear"],
    file: "jb2a.spear.melee.01.white", at: SWING },
  { words: ["hammer", "club", "bone", "cudgel", "mallet"], file: "jb2a.hammer.melee.01.white", at: SWING },
  { words: ["whip", "vine", "tail", "slap", "tentacle"], file: "jb2a.melee_generic.slash.02.001.blue", at: SWING },
  { words: ["spin", "spinning", "whirl", "twirl", "rollout"], file: "jb2a.melee_generic.whirlwind.01.orange", at: SWING }
]);

const words = text => String(text ?? "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
const mentions = (list, strike) => list.some(word => strike.words.some(base => [base, `${base}s`, `${base}es`].includes(word)));

export function meleeStrike(item, definition) {
  const name = words(`${item.getFlag(MODULE_ID, "sourceId") ?? ""} ${definition?.name?.en ?? ""}`);
  const description = words([definition?.description?.en ?? []].flat().filter(entry => typeof entry === "string").join(" "));
  return STRIKES.find(strike => mentions(name, strike)) ?? STRIKES.find(strike => mentions(description, strike)) ?? null;
}

// Moves without damage: on the user when they help it (or heal), on the targets otherwise.
const HEAL = "jb2a.healing_generic.burst.greenorange";
const BUFF = "jb2a.on_token_buff.001.001.orangeyellow";
const DEBUFF = "jb2a.condition.curse.01.001.red";

// Status Moves that help an ally (the rest of the status Moves aimed at others hinder an enemy): no curse on them.
export const SUPPORT_MOVES = new Set(["after-you", "ally-switch", "aromatherapy", "aromatic-mist", "barrier", "bestow",
  "coaching", "crafty-shield", "decorate", "dragon-cheer", "floral-healing", "flower-shield", "gear-up", "growth",
  "heal-bell", "helping-hand", "hold-hands", "instruct", "lucky-chant", "magic-coat", "mat-block", "milk-drink", "mist",
  "mud-sport", "purify", "quick-guard", "revival-blessing", "safeguard", "tailwind", "water-sport", "wide-guard"]);
const HEALING_SUPPORT = new Set(["aromatherapy", "floral-healing", "heal-bell", "milk-drink", "purify", "revival-blessing"]);

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const logged = task => { void Promise.resolve(task).catch(error => console.error(`[${MODULE_ID}] move animations`, error)); };
const active = id => Boolean(game.modules?.get(id)?.active);
const canAnimate = () => game.settings.get(MODULE_ID, SETTING) && active("sequencer") && active("JB2A_DnD5e") &&
  typeof globalThis.Sequence === "function";
const moveOf = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item : null);
const tokenOf = actor => actor?.getActiveTokens?.()[0] ?? null;

// Its shape: melee, ranged, burst (around itself), spray (cone or line), self, or point (an area placed somewhere).
export function moveShape(definition) {
  const range = String(definition?.range?.raw ?? "").toLowerCase();
  if (range.startsWith("melee")) {return "melee";}
  if (/cone|line/.test(range)) {return "spray";}
  if (range.startsWith("self") && /radius/.test(range)) {return "burst";}
  if (range === "self") {return "self";}
  return definition?.area?.origin === "point" ? "point" : "ranged";
}

// The area's size: its area data, or the "(20ft radius)" in its range on Moves imported before areas existed.
const areaSize = definition => definition?.area?.size ?? (Number(String(definition?.range?.raw ?? "").match(/(\d+)\s*-?\s*f(?:ee)?t\s+radius/i)?.[1]) || null);

const kindOf = definition => {
  if (definition?.damage?.type === "healing") {return "heal";}
  return definition?.damage ? "damage" : "status";
};

// A damaging Move, by its shape.
function damageAnimation(item, fx, shape, definition) {
  if (shape === "melee") {
    const strike = meleeStrike(item, definition);
    const overlay = strike && fx.element ? { file: fx.element } : null;
    const hit = strike ? { file: strike.file, at: strike.at, tint: fx.color, overlay } : { ...fx.melee, tint: fx.element ? null : fx.color };
    return { ...hit, melee: true };
  }
  if (shape === "spray") {return { file: fx.spray, at: "from-user", tint: fx.sprayTint ?? null };}
  if (shape === "burst" || shape === "point") {
    return { file: fx.burst, at: "user", tint: fx.color ?? null, size: areaSize(definition) };
  }
  if (shape === "self") {return { file: BUFF, at: "user", tint: fx.color ?? null };}
  return { file: fx.projectile, at: "from-user", tint: null };
}

const typeAnimations = item => TYPE_ANIMATIONS[item.getFlag(MODULE_ID, "moveType") ??
  item.getFlag(MODULE_ID, "moveDefinition")?.type] ?? TYPE_ANIMATIONS.normal;
const isCone = file => /\.cone(\.|$)/.test(file);

// The JB2A file to play and how: { file, at: "target" | "user" | "from-user", tint, size }.
export function moveAnimation(item) {
  const definition = item.getFlag(MODULE_ID, "moveDefinition") ?? {};
  const fx = typeAnimations(item);
  const shape = moveShape(definition);
  const kind = kindOf(definition);
  if (kind === "heal") {return { file: HEAL, at: "user" };}
  const id = item.getFlag(MODULE_ID, "sourceId");
  if (kind === "status" && SUPPORT_MOVES.has(id)) {
    const at = shape === "self" || shape === "burst" ? "user" : "target";
    return HEALING_SUPPORT.has(id) ? { file: HEAL, at } : { file: BUFF, at, tint: fx.color };
  }
  if (kind === "status") {return shape === "self" ? { file: BUFF, at: "user", tint: fx.color } : { file: DEBUFF, at: "target", tint: fx.color };}
  return damageAnimation(item, fx, shape, definition);
}

function effect(sequence, { file, tint }) {
  const step = sequence.effect().file(file);
  if (tint) {step.tint(tint);}
  return step;
}

const squares = feet => (feet * 2) / (canvas.scene?.grid?.distance ?? 5);
const cells = token => Math.max(token?.document?.width ?? 1, token?.document?.height ?? 1);

// Around the user's token, sized to the area when it has one. The radius counts from the token's edge, so a big
// Pokémon's burst reaches as far past it as a small one's.
function playAround(sequence, animation, token) {
  const step = effect(sequence, animation).atLocation(token);
  if (animation.size) {step.size(squares(animation.size) + cells(token), { gridUnits: true });}
  else {step.scaleToObject(2);}
}

// Where a strike from the user lands: the target's near edge, not deep inside a big token.
function nearEdge(source, target) {
  const from = source?.center;
  const to = target?.center;
  const reach = ((cells(target) - 1) / 2) * (canvas.grid?.size ?? 100);
  if (!from || !to || reach <= 0) {return target;}
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!distance) {return target;}
  const pull = Math.min(reach, distance) / distance;
  return { x: to.x - (to.x - from.x) * pull, y: to.y - (to.y - from.y) * pull };
}

function playOnTargets(sequence, animation, source, { targets, missed }) {
  for (const target of targets) {
    if (animation.at === "from-user" && !source) {continue;}
    const step = effect(sequence, animation);
    if (animation.at === "target") {step.atLocation(target).scaleToObject(1.5);}
    else {step.atLocation(source).stretchTo(animation.melee ? nearEdge(source, target) : target);}
    if (missed) {step.missed();}
    // The element lands on the target as the strike does.
    else if (animation.overlay) {effect(sequence, animation.overlay).atLocation(target).scaleToObject(1.5).delay(300);}
  }
}

// A placed template, whatever the Move's shape: its type's cone or line along cones and rays, its burst over
// circles and squares (and over cones without a cone file). Each is drawn past the template's edge and masked to
// it, so it fills the whole area without spilling out of it.
const COVER = 1.3;
export function templateAnimation(item, template) {
  const fx = typeAnimations(item);
  const feet = Number(template.distance) || 5;
  const across = { circle: feet * 2, cone: feet * 2, rect: feet }[template.t] ?? feet * 2;
  const burst = { file: fx.burst, tint: fx.color ?? null, stretch: false, size: (across * COVER) / (canvas.scene?.grid?.distance ?? 5) };
  if (template.t === "cone") {return isCone(fx.spray) ? { file: fx.spray, tint: fx.sprayTint ?? null, stretch: true } : burst;}
  if (template.t === "ray") {return { file: isCone(fx.spray) ? fx.projectile : fx.spray, tint: fx.sprayTint ?? null, stretch: true };}
  return burst;
}

// Its points from its own data: when it is just created its placeable isn't drawn yet, and Sequencer's own
// measuring of a cone, ray or square (from the drawn shape) fails, so nothing played.
export function templatePoints(template) {
  const origin = { x: Number(template.x) || 0, y: Number(template.y) || 0 };
  const pixels = (Number(template.distance) || 0) * ((canvas.dimensions?.size ?? 100) / (canvas.dimensions?.distance ?? 5));
  const angle = ((Number(template.direction) || 0) * Math.PI) / 180;
  const end = { x: origin.x + Math.cos(angle) * pixels, y: origin.y + Math.sin(angle) * pixels };
  const center = template.t === "rect" ? { x: (origin.x + end.x) / 2, y: (origin.y + end.y) / 2 } : origin;
  return { origin, end, center };
}

// The template's placeable is drawn a few frames after it is created, and the mask needs its shape. A Region
// (Foundry 14) masks from its document's shapes, so it doesn't wait.
async function drawn(template) {
  for (let frame = 0; frame < 120; frame++) {
    if (template.object?.shape || template.shapes) {return true;}
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  return false;
}

// Each Move's sound file; the few without one sound like a Move of their type, and voice Moves are the cry.
const SOUND_ROOT = `modules/${MODULE_ID}/assets/audio/moves`;
const SOUND_VOLUME = 0.6;
export const TYPE_SOUND_MOVES = Object.freeze({
  normal: "tackle", fire: "ember", water: "water-gun", electric: "thunder-shock", grass: "vine-whip", ice: "ice-beam",
  fighting: "karate-chop", poison: "poison-sting", ground: "mud-slap", flying: "gust", psychic: "confusion",
  bug: "bug-bite", rock: "rock-throw", ghost: "lick", dragon: "dragon-breath", dark: "bite", steel: "metal-claw",
  fairy: "fairy-wind"
});
const VOICE_MOVES = new Set(["growl", "roar", "howl", "hyper-voice", "disarming-voice", "halo-song"]);
let moveSounds = {};

export async function loadMoveSounds() {
  try {
    const response = await fetch(`modules/${MODULE_ID}/data/move-sounds.json`);
    if (response.ok) {moveSounds = await response.json();}
  } catch (error) {
    console.warn(`[${MODULE_ID}] move sounds`, error);
  }
}

export function moveSound(item) {
  const id = item.getFlag(MODULE_ID, "sourceId");
  const type = item.getFlag(MODULE_ID, "moveType") ?? item.getFlag(MODULE_ID, "moveDefinition")?.type;
  const file = moveSounds[id] ?? moveSounds[TYPE_SOUND_MOVES[type] ?? TYPE_SOUND_MOVES.normal];
  return file ? `${SOUND_ROOT}/${file}` : null;
}

// Plays here unless this player muted Move sounds.
function hearSound(src) {
  if (!game.settings.get(MODULE_ID, SOUND_SETTING)) {return;}
  logged(foundry.audio.AudioHelper.play({ src, channel: "interface", volume: SOUND_VOLUME, autoplay: true, loop: false }, false));
}

async function soundFor(item) {
  return VOICE_MOVES.has(item.getFlag(MODULE_ID, "sourceId")) ? resolvePokemonCryPath(item.actor) : moveSound(item);
}

// Sent to every client, each one deciding whether to hear it.
function playSound(item) {
  logged(soundFor(item).then(src => {
    if (!src) {return;}
    game.socket?.emit(SOCKET_CHANNEL, { type: SOUND_MESSAGE, src });
    hearSound(src);
  }));
}

export async function playTemplateAnimation(item, template, area = template) {
  if (!canAnimate()) {return;}
  const masked = await drawn(area);
  const animation = templateAnimation(item, template);
  const { origin, end, center } = templatePoints(template);
  const sequence = new globalThis.Sequence();
  playSound(item);
  const step = effect(sequence, animation).atLocation(animation.stretch ? origin : center);
  if (animation.stretch) {step.stretchTo(end);}
  else {step.size(animation.size, { gridUnits: true });}
  if (masked) {step.mask(area);}
  logged(sequence.play());
}

// Plays it from the user's token toward each target (or on them, or around the user).
export function playMoveAnimation(item, targets, { missed = false } = {}) {
  if (!canAnimate()) {return;}
  const animation = moveAnimation(item);
  const source = tokenOf(item.actor);
  const sequence = new globalThis.Sequence();
  playSound(item);
  if (animation.at === "user") {
    if (!source) {return;}
    playAround(sequence, animation, source);
  } else {
    playOnTargets(sequence, animation, source, { targets, missed });
  }
  logged(sequence.play());
}

const targetTokens = () => Array.from(game.user?.targets ?? []);
const isAttack = activity => activity?.type === "attack";
const placesTemplate = activity => Boolean(activity?.target?.template?.type);
// Attack Moves: after the roll is shown, against the target it was rolled on. One with an area plays on its
// template instead, so it doesn't need a target.
function onAttackOutcome(outcome, context) {
  const item = moveOf(context?.activity?.item);
  if (!item || placesTemplate(context.activity)) {return;}
  const document = fromUuidSync(outcome.targetActorUuid ?? "", { strict: false });
  const target = tokenOf(document?.actor ?? document);
  playMoveAnimation(item, target ? [target] : [], { missed: outcome.hit === false });
}

// Other Moves: when used. Moves with an area wait for their template.
function onPostUseActivity(activity) {
  const item = moveOf(activity?.item);
  if (!item || isAttack(activity) || placesTemplate(activity)) {return;}
  playMoveAnimation(item, targetTokens());
}

// Its Move, by the item on the template or else by the activity that placed it.
function templateMove(template) {
  const flag = key => template.getFlag?.("dnd5e", key);
  const found = uuid => (uuid ? fromUuidSync(uuid, { strict: false }) : null);
  return moveOf(found(flag("item"))) ?? moveOf(found(flag("origin"))?.item);
}

function onCreateTemplate(template, _options, userId) {
  const item = userId === game.user.id ? templateMove(template) : null;
  if (item) {logged(playTemplateAnimation(item, template));}
}

// Foundry 14 stores a placed template as a Region with one shape (in pixels): back to template data, in feet.
export function regionTemplate(region) {
  const shape = region.shapes?.[0];
  const feet = pixels => pixels / ((canvas.dimensions?.size ?? 100) / (canvas.dimensions?.distance ?? 5));
  if (!shape) {return null;}
  if (shape.type === "rectangle") {
    const direction = (Number(shape.rotation) || 0) + (Math.atan2(shape.height, shape.width) * 180) / Math.PI;
    return { t: "rect", x: shape.x, y: shape.y, distance: feet(Math.hypot(shape.width, shape.height)), direction };
  }
  const t = { circle: "circle", cone: "cone", line: "ray" }[shape.type];
  const length = shape.type === "line" ? shape.length : shape.radius;
  return t ? { t, x: shape.x, y: shape.y, distance: feet(length), direction: Number(shape.rotation) || 0 } : null;
}

function onCreateRegion(region, _options, userId) {
  const template = region.getFlag?.("core", "MeasuredTemplate") ? regionTemplate(region) : null;
  const item = template && userId === game.user.id ? templateMove(region) : null;
  if (item) {logged(playTemplateAnimation(item, template, region));}
}

let registered = false;

export function registerMoveAnimations() {
  if (registered) {return;}
  registered = true;
  game.settings.register(MODULE_ID, SETTING, {
    name: en() ? "Poke5e - Move animations" : "Poke5e - Animaciones de Moves",
    hint: en() ? "Plays a JB2A animation (with Sequencer) for each Move, by its type and shape."
      : "Reproduce una animación de JB2A (con Sequencer) para cada Move, según su tipo y su forma.",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, SOUND_SETTING, {
    name: en() ? "Poke5e - Move sounds" : "Poke5e - Sonidos de Moves",
    hint: en() ? "Plays each Move's sound with its animation. Off: you don't hear them; other players still do."
      : "Reproduce el sonido de cada Move con su animación. Apagado: tú no los oyes; los demás jugadores sí.",
    scope: "client", config: true, type: Boolean, default: true
  });
  void loadMoveSounds();
  Hooks.once("ready", () => game.socket?.on(SOCKET_CHANNEL, message => {
    // Only the module's own Move sounds and cries, whoever sends it.
    const ours = typeof message?.src === "string" && message.src.startsWith(`modules/${MODULE_ID}/assets/audio/`);
    if (message?.type === SOUND_MESSAGE && ours) {hearSound(message.src);}
  }));
  subscribeAttackOutcome(onAttackOutcome);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("createMeasuredTemplate", onCreateTemplate);
  // Foundry 14: placing a template creates a Region, and createMeasuredTemplate no longer fires.
  Hooks.on("createRegion", onCreateRegion);
}
