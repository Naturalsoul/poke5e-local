import { buildMoveDescription, resolveOnSaveMode } from "./builder.mjs";

const MODULE_ID = "poke5e-local";
const MANAGED_KINDS = new Set(["move", "move-template"]);

function descriptionUpdates(items, definitions, language) {
  const updates = [];
  for (const item of items ?? []) {
    if (!MANAGED_KINDS.has(item.getFlag(MODULE_ID, "kind"))) {
      continue;
    }

    const current = item.system?.description?.value;
    if (typeof current !== "string" || !current.includes("[object Object]")) {
      continue;
    }

    const stored = item.getFlag(MODULE_ID, "moveDefinition");
    const canonical = definitions.get(item.getFlag(MODULE_ID, "sourceId"));
    // Conservar las definiciones propias; el catálogo permite reparar copias antiguas sin metadata.
    const definition = stored?.description ? stored : canonical;
    if (!definition) {
      continue;
    }

    const description = buildMoveDescription(definition, language);
    if (description && !description.includes("[object Object]")) {
      updates.push({ _id: item.id, "system.description.value": description });
    }
  }
  return updates;
}

// Each Move's save activities with the damage-on-save its definition calls for (a ruling may change it later).
export function saveDamageUpdates(items, definitions) {
  const updates = [];
  for (const item of items ?? []) {
    if (!MANAGED_KINDS.has(item.getFlag(MODULE_ID, "kind"))) {
      continue;
    }

    const definition = definitions.get(item.getFlag(MODULE_ID, "sourceId"));
    if (!definition) {
      continue;
    }

    const expected = resolveOnSaveMode(definition);
    for (const activity of item.system?.activities ?? []) {
      if (activity.type === "save" && activity.damage?.onSave && activity.damage.onSave !== expected) {
        updates.push({ _id: item.id, [`system.activities.${activity.id ?? activity._id}.damage.onSave`]: expected });
      }
    }
  }
  return updates;
}

export async function repairMoveSaveDamage(moves) {
  if (!game.user.isGM) {
    return 0;
  }

  const definitions = new Map(moves.map(move => [move.id, move]));
  const actors = new Set(game.actors ?? []);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {
        actors.add(token.actor);
      }
    }
  }

  let repaired = 0;
  for (const actor of actors) {
    const updates = saveDamageUpdates(actor.items, definitions);
    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      repaired += updates.length;
    }
  }

  const updates = saveDamageUpdates(game.items, definitions);
  if (updates.length) {
    await Item.implementation.updateDocuments(updates);
    repaired += updates.length;
  }
  return repaired;
}

export async function repairPoke5eMoveDescriptions(moves, language = "es") {
  if (!game.user.isGM) {
    return 0;
  }

  const definitions = new Map(moves.map(move => [move.id, move]));
  const actors = new Set(game.actors ?? []);
  // Los tokens no vinculados guardan su propia copia de los movimientos.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {
        actors.add(token.actor);
      }
    }
  }

  let repaired = 0;
  for (const actor of actors) {
    const updates = descriptionUpdates(actor.items, definitions, language);
    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      repaired += updates.length;
    }
  }

  const updates = descriptionUpdates(game.items, definitions, language);
  if (updates.length) {
    await Item.implementation.updateDocuments(updates);
    repaired += updates.length;
  }
  return repaired;
}
