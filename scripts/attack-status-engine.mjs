import { CONDITION_KIND } from "./condition-riders.mjs";
import {
  isAttackHit,
  isNaturalAttackAtLeast,
  subscribeAttackOutcome
} from "./attack-outcome-engine.mjs";
import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { createStatusEffect } from "./status-effects.mjs";

const MODULE_ID =
  "poke5e-local";


const NATURAL_AT_LEAST_TRIGGER =
  /^natural-attack-(\d+)\+$/;


/* ============================================================
 * STATUS TEMPLATES DEL MOVE
 * ============================================================ */

function attackStatusTemplates(
  item
) {

  return Array.from(
    item?.effects ??
    []
  ).filter(
    effect =>

      !effect.disabled &&

      ["pokemon-status", CONDITION_KIND].includes(
        effect.getFlag?.(
          MODULE_ID,
          "kind"
        )
      ) &&

      Boolean(
        effect.getFlag?.(
          MODULE_ID,
          "trigger"
        )
      )
  );
}


/* ============================================================
 * ATTACK TRIGGER
 *
 * Primer contrato soportado:
 *
 * natural-attack-N+
 *
 * Ejemplo:
 *
 * Scald → natural-attack-16+
 *
 * No agregamos todavía "hit", "miss", "critical", etc.
 * Esos consumidores se habilitan cuando sean auditados.
 * ============================================================ */

function matchesAttackTrigger(
  trigger,
  outcome
) {

  const normalized =
    String(
      trigger ??
      ""
    )
      .trim()
      .toLowerCase();


  /* ==========================================================
   * HIT
   *
   * Will-O-Wisp:
   *
   * causa Burned únicamente si el
   * ataque impacta realmente.
   * ========================================================== */

  if (
    normalized ===
    "hit"
  ) {

    return isAttackHit(
      outcome
    );
  }


  /* ==========================================================
   * NATURAL ATTACK N+
   *
   * Scald:
   *
   * natural 16+
   * → Burned
   *
   * Independiente de hit/miss.
   * ========================================================== */

  const naturalAtLeast =
    normalized.match(
      NATURAL_AT_LEAST_TRIGGER
    );


  if (!naturalAtLeast) {

    return false;
  }


  return isNaturalAttackAtLeast(
    outcome,
    Number(
      naturalAtLeast[1]
    )
  );
}


/* ============================================================
 * UUID → ACTOR
 * ============================================================ */

function actorFromUuid(
  uuid
) {

  if (!uuid) {

    return null;
  }


  let document;


  try {

    document =
      fromUuidSync(
        uuid,
        {
          strict:
            false
        }
      );

  } catch {

    return null;
  }


  if (
    document?.documentName ===
    "Actor"
  ) {

    return document;
  }


  return (
    document?.actor ??
    null
  );
}


/* ============================================================
 * COPIAR TEMPLATE AL TARGET
 *
 * El Effect guardado dentro del Move es solo una plantilla.
 *
 * La instancia aplicada al Actor obtiene un ID nuevo.
 *
 * El Turn Engine seguirá validando:
 *
 * - inmunidades;
 * - Grace Period;
 * - exclusividad de estados no-volátiles.
 * ============================================================ */

// A d6 table rolls in chat (after Dice So Nice) and becomes that face's status.
async function rolledStatusSource(actor, template) {
  const table = template.getFlag(MODULE_ID, "randomStatuses");
  const roll = await new Roll("1d6").evaluate();
  await publishRollBeforeDamage(roll, { speaker: ChatMessage.getSpeaker({ actor }), flavor: `${template.parent?.name ?? ""} — d6` });
  const move = { id: template.getFlag(MODULE_ID, "sourceMove") };
  const source = createStatusEffect(table[roll.total - 1], move, game.settings.get(MODULE_ID, "language"));
  Object.assign(source.flags[MODULE_ID], { trigger: template.getFlag(MODULE_ID, "trigger"), sourceMove: move.id });
  return source;
}

// Psycho Shift: its user's status moves to the target (shortcut: always its user, never a chosen ally).
async function transferStatus(actor, template) {
  const user = template.parent?.actor;
  const status = Array.from(user?.effects ?? []).find(effect => effect.getFlag(MODULE_ID, "kind") === "pokemon-status");
  if (!status) {return;}
  const source = status.toObject();
  delete source._id;
  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [source]) ?? [];
  if (created) {await status.delete();}
}

export async function applyStatusTemplate(
  actor,
  template
) {
  if (template.getFlag(MODULE_ID, "transferStatus")) {
    await transferStatus(actor, template);
    return;
  }
  const source =
    template.getFlag(MODULE_ID, "randomStatuses")
      ? await rolledStatusSource(actor, template)
      : template.toObject();


  delete source._id;


  // Its Move, so the status knows who caused it (Frozen's DC, Synchronize, Sheer Force).
  source.origin ||=
    template.parent?.uuid ??
    null;


  await actor.createEmbeddedDocuments(
    "ActiveEffect",
    [
      source
    ]
  );
}


/* ============================================================
 * ATTACK OUTCOME CONSUMER
 * ============================================================ */

async function onAttackOutcome(
  outcome,
  context
) {

  const item =
    context?.activity?.item;


  if (!item) {

    return;
  }


  const templates =
    attackStatusTemplates(
      item
    ).filter(
      template =>

        matchesAttackTrigger(
          template.getFlag(
            MODULE_ID,
            "trigger"
          ),
          outcome
        )
    );


  if (
    !templates.length
  ) {

    return;
  }


  const targetActor =
    actorFromUuid(
      outcome.targetActorUuid
    );


  if (!targetActor) {

    console.warn(
      `[${MODULE_ID}] ${item.name}: ` +
      "el trigger de estado se cumplió, " +
      "pero no había un único Actor objetivo resoluble."
    );


    return;
  }


  for (
    const template
    of templates
  ) {

    await applyStatusTemplate(
      targetActor,
      template
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonAttackStatusEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  subscribeAttackOutcome(
    onAttackOutcome
  );
}