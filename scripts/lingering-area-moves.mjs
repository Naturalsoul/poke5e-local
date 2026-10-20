import { applyPokemonStatus } from "./pokemon-status-service.mjs";
import { isPokemonActor } from "./trainer-party-service.mjs";
import { moveModifier } from "./rider-ability-engine.mjs";
import { subscribeAttackOutcome } from "./attack-outcome-engine.mjs";
import { publishRollBeforeDamage, trackRollDisplay } from "./chat-roll-display.mjs";

/* ============================================================
 * AREAS THAT LINGER (the area is the Move's placed template)
 *
 * At the start of the turn of a Pokémon inside it:
 * - Poison Gas: its damage, then a CON save or poisoned; it dissipates at the start of its user's next turn;
 * - Smog: a CON save, its damage on a fail or half on a success, poisoned on a fail by 5; it lasts while
 *   its user concentrates (dnd5e removes the template with the concentration);
 * - Sludge Bomb: on a hit, a 5 ft area around its target; a CON save or poisoned; it ends at the start
 *   of its user's next turn.
 * Entering the area during a turn is left to the GM.
 * ============================================================ */

const MODULE_ID = "poke5e-local";

export const LINGERING_AREAS = Object.freeze({
  "poison-gas": { damage: "always", status: "poisoned", endsOnUserTurn: true },
  smog: { damage: "half-on-save", statusBy5: "poisoned" },
  "sludge-bomb": { status: "poisoned", endsOnUserTurn: true }
});

const en = () => game.settings.get(MODULE_ID, "language") === "en";
const moveId = item => (item?.getFlag?.(MODULE_ID, "kind") === "move" ? item.getFlag(MODULE_ID, "sourceId") : null);
const templateItem = template => {
  const uuid = template?.getFlag?.("dnd5e", "item");
  return uuid ? fromUuidSync(uuid, { strict: false }) : null;
};

// The scene's lingering areas, with their Move and its user.
export function lingeringAreas(scene) {
  return Array.from(scene?.templates ?? []).map(template => {
    const item = templateItem(template);
    const rule = LINGERING_AREAS[moveId(item)];
    return rule ? { template, item, rule, user: item.actor } : null;
  }).filter(Boolean);
}

export function tokenInArea(template, token) {
  const shape = template.object?.shape;
  if (!shape || !token?.center) {return false;}
  return shape.contains(token.center.x - template.x, token.center.y - template.y);
}

// The Move DC from its save activity, or 8 + proficiency + MOVE.
function moveDc(item) {
  const activity = Array.from(item.system?.activities ?? []).find(entry => Number.isFinite(entry.save?.dc?.value));
  return activity?.save.dc.value ?? 8 + Number(item.actor?.system?.attributes?.prof ?? 2) + moveModifier(item.actor, item);
}

async function areaSave(actor, item, dc) {
  const display = trackRollDisplay();
  const rolls = await actor.rollSavingThrow({ ability: "con", target: dc }, { configure: false },
    { data: { flavor: `${item.name} — ${actor.name} (DC ${dc})`, flags: { [MODULE_ID]: display.flags } } });
  const roll = rolls?.[0];
  if (!roll) {
    display.stop();
    return null;
  }
  await display.displayed();
  return Number(roll.total);
}

// The Move's damage formula at its user's level (data dice by level), plus MOVE.
function damageFormula(item) {
  const { damage } = item.getFlag(MODULE_ID, "moveDefinition") ?? {};
  const level = Number(item.actor?.getFlag?.(MODULE_ID, "level") ?? 1);
  const tier = Object.keys(damage?.dice ?? {}).map(Number).filter(step => step <= level).sort((a, b) => b - a)[0];
  const dice = damage?.dice?.[tier];
  return dice ? `${dice} + ${moveModifier(item.actor, item)}` : null;
}

// shortcut: plain damage of the Move's type through dnd5e (resistances apply, Pokémon type effectiveness does not); route it through the damage engine if it matters.
export async function areaDamage(actor, item, half) {
  const formula = damageFormula(item);
  if (!formula) {return;}
  const roll = await new Roll(formula).evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor: `${item.name} — ${actor.name}` });
  const value = half ? Math.floor(roll.total / 2) : roll.total;
  const type = [item.getFlag(MODULE_ID, "moveDefinition")?.damage?.type ?? []].flat()[0] ?? "poison";
  if (value > 0) {await actor.applyDamage([{ value, type }]);}
}

export async function sufferArea(actor, { item, rule }) {
  const dc = moveDc(item);
  if (rule.damage === "always") {await areaDamage(actor, item, false);}
  const total = await areaSave(actor, item, dc);
  if (total === null) {return;}
  const failed = total < dc;
  if (rule.damage === "half-on-save") {await areaDamage(actor, item, !failed);}
  const status = (failed && rule.status) || (dc - total >= 5 && rule.statusBy5);
  if (status) {await applyPokemonStatus(actor, status, { language: en() ? "en" : "es" });}
}

// Called by the Turn Engine at the start of the Pokémon's turn.
export async function processLingeringAreasStartTurn(actor) {
  if (!isPokemonActor(actor)) {return;}
  const token = actor.getActiveTokens?.()[0];
  for (const area of lingeringAreas(token?.scene ?? canvas?.scene)) {
    if (area.rule.endsOnUserTurn && area.user === actor) {
      await area.template.delete();
    } else if (tokenInArea(area.template, token)) {
      await sufferArea(actor, area);
    }
  }
}

// Sludge Bomb: a 5 ft radius around the target it hits, beyond the target's own space.
async function onSludgeBombOutcome(outcome, context) {
  const item = context?.activity?.item;
  if (moveId(item) !== "sludge-bomb" || outcome.hit !== true) {return;}
  const target = fromUuidSync(outcome.targetActorUuid, { strict: false });
  const token = (target?.actor ?? target)?.getActiveTokens?.()[0];
  if (!token?.scene) {return;}
  const reach = canvas.dimensions.distance * Number(token.document.width ?? 1) / 2;
  await token.scene.createEmbeddedDocuments("MeasuredTemplate", [{
    t: "circle", x: token.center.x, y: token.center.y, distance: 5 + reach,
    fillColor: "#7b3fa0", flags: { dnd5e: { item: item.uuid } }
  }]);
}

let registered = false;

export function registerLingeringAreaMoves() {
  if (registered) {return;}
  registered = true;
  subscribeAttackOutcome(onSludgeBombOutcome);
}
