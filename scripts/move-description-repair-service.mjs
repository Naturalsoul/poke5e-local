import { buildMoveDescription } from "./builder.mjs";

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
