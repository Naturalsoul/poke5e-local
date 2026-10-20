import { subscribeAttackOutcome } from "./attack-outcome-engine.mjs";

/* ============================================================
 * MOVE ANIMATIONS (Sequencer + JB2A)
 *
 * Every Move plays a JB2A animation chosen by its type and its shape:
 * - attack Moves, once the roll is shown (after Dice So Nice): a projectile to the target, or when melee a strike
 *   (bite, claw, punch, kick, blade… from the words of its name or description) and then its element; a miss goes past;
 * - other Moves, when used: a burst around the user, a cone or line toward the target, an effect on each
 *   target, or a buff on the user. A Move that places its template on a point plays where it goes.
 * It reads the Move item's own data, so Moves imported before it (even with an old moveDefinition) animate too.
 * Only the user who rolls or uses it starts the animation; Sequencer shows it to everyone.
 * Without Sequencer and JB2A, or with the setting off, nothing is played.
 * ============================================================ */

const MODULE_ID = "poke5e-local";
const SETTING = "moveAnimations";

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

// The JB2A file to play and how: { file, at: "target" | "user" | "from-user" | "template", tint, size }.
// With a placed template: the type's burst, the template's size.
export function moveAnimation(item, template = null) {
  const definition = item.getFlag(MODULE_ID, "moveDefinition") ?? {};
  const fx = TYPE_ANIMATIONS[item.getFlag(MODULE_ID, "moveType") ?? definition.type] ?? TYPE_ANIMATIONS.normal;
  if (template) {return { file: fx.burst, at: "template", tint: fx.color ?? null, size: Number(template.distance) || areaSize(definition) };}
  const shape = moveShape(definition);
  const kind = kindOf(definition);
  if (kind === "heal") {return { file: HEAL, at: "user" };}
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

// Around the user's token or on the placed template, sized to the area when it has one. Around a token the
// radius counts from its edge, so a big Pokémon's burst reaches as far past it as a small one's.
function playAround(sequence, animation, place, onToken) {
  const step = effect(sequence, animation).atLocation(place);
  if (animation.size) {step.size(squares(animation.size) + (onToken ? cells(place) : 0), { gridUnits: true });}
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

// Plays it from the user's token toward each target (or on them, or around the user).
export function playMoveAnimation(item, targets, { missed = false, template = null } = {}) {
  if (!canAnimate()) {return;}
  const animation = moveAnimation(item, template);
  const source = tokenOf(item.actor);
  const sequence = new globalThis.Sequence();
  if (animation.at === "user" || animation.at === "template") {
    const place = template ?? source;
    if (!place) {return;}
    playAround(sequence, animation, place, !template);
  } else {
    playOnTargets(sequence, animation, source, { targets, missed });
  }
  logged(sequence.play());
}

const targetTokens = () => Array.from(game.user?.targets ?? []);
const isAttack = activity => activity?.type === "attack";
const placesTemplate = activity => Boolean(activity?.target?.template?.type);
// Shapes that play where the template is placed, not around the user.
const onTemplate = item => ["point", "ranged"].includes(moveShape(item.getFlag(MODULE_ID, "moveDefinition")));

// Attack Moves: after the roll is shown, against the target it was rolled on.
function onAttackOutcome(outcome, context) {
  const item = moveOf(context?.activity?.item);
  if (!item) {return;}
  const document = fromUuidSync(outcome.targetActorUuid ?? "", { strict: false });
  const target = tokenOf(document?.actor ?? document);
  playMoveAnimation(item, target ? [target] : [], { missed: outcome.hit === false });
}

// Other Moves: when used. Areas on a point wait for their template.
function onPostUseActivity(activity) {
  const item = moveOf(activity?.item);
  if (!item || isAttack(activity) || (placesTemplate(activity) && onTemplate(item))) {return;}
  playMoveAnimation(item, targetTokens());
}

function onCreateTemplate(template, _options, userId) {
  const uuid = template.getFlag?.("dnd5e", "item");
  const item = userId === game.user.id && uuid ? moveOf(fromUuidSync(uuid, { strict: false })) : null;
  if (item && onTemplate(item)) {playMoveAnimation(item, [], { template });}
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
  subscribeAttackOutcome(onAttackOutcome);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("createMeasuredTemplate", onCreateTemplate);
}
