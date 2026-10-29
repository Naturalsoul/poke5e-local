import {
  isPokemonActor
} from "./trainer-party-service.mjs";
import { isTrainerInventoryBerry, isTrainerInventoryHeldItem, transferTrainerBerryToPokemon, transferTrainerHeldItemToPokemon } from "./pokemon-held-item-service.mjs";

import {
  buildMoveItemForActor
} from "./builder.mjs";

import {
  getPokemonKnownMoveIds,
  getPokemonMoveLimit,
  setPokemonKnownMoveIds
} from "./pokemon-move-service.mjs";
import { normalizeId } from "./ids.mjs";

const MODULE_ID =
  "poke5e-local";

const POKEMON_KIND =
  "pokemon";

const POKEMON_SHEET_CLASS_ID =
  `${MODULE_ID}.PokemonActorSheet`;

const POKEMON_SHEET_TEMPLATE =
  `modules/${MODULE_ID}/templates/actors/pokemon-summary-tab.hbs`;


function getModuleLanguage() {
  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
}


function getItemSourceId(
  item
) {
  return normalizeId(
    item?.getFlag(
      MODULE_ID,
      "sourceId"
    )
  );
}


function findOwnedMove(
  pokemon,
  sourceId
) {
  return (
    pokemon.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) === "move" &&
        getItemSourceId(
          item
        ) === sourceId
    ) ??
    null
  );
}


function findOwnedMoveTemplate(
  pokemon,
  sourceId
) {
  return (
    pokemon.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          "move-template" &&
        getItemSourceId(
          item
        ) === sourceId
    ) ??
    null
  );
}


function warnMoveLimit(
  pokemon,
  limit
) {
  ui.notifications.warn(
    `${pokemon.name} ya tiene ${limit}/${limit} Moves conocidos. ` +
    "Elimina o reemplaza un Move antes de aprender otro."
  );
}

/* ============================================================
 * BASE SHEET
 *
 * No heredamos de D&D5e NPCActorSheet.
 *
 * NPCActorSheet tiene un lifecycle propio que presupone
 * la existencia de inventory, sidebar, header y otros PARTS
 * específicos de la interfaz D&D5e.
 *
 * Nuestra hoja Pokémon utiliza la base de Actor Sheet de
 * Foundry + Handlebars, manteniendo el contrato del Actor
 * sin arrastrar la UI/lifecycle de NPCActorSheet.
 * ============================================================ */

const ActorSheetV2 =
  foundry.applications
    .sheets
    .ActorSheetV2;


const HandlebarsApplicationMixin =
  foundry.applications
    .api
    .HandlebarsApplicationMixin;


const PokemonActorSheetBase =
  HandlebarsApplicationMixin(
    ActorSheetV2
  );


/* ============================================================
 * POKÉMON SHEET
 * ============================================================ */

export class PokemonActorSheet
  extends PokemonActorSheetBase {

  static DEFAULT_OPTIONS = {
    classes: [
      "poke5e-pokemon-sheet"
    ],

    position: {
      width:
        900,

      height:
        780
    }
  };


  static PARTS = {
    pokemon: {
      template:
        POKEMON_SHEET_TEMPLATE
    }
  };


  async _onDropItem(
    event,
    item
  ) {
    const pokemon =
      this.actor;

    if (isPokemonActor(pokemon) && isTrainerInventoryBerry(item)) {
      try {
        return await transferTrainerBerryToPokemon(pokemon, item.parent, item.id);
      } catch (error) {
        console.error(`[${MODULE_ID}] Error entregando baya desde el Trainer`, error);
        ui.notifications.error(error.message);
        return null;
      }
    }

    if (isPokemonActor(pokemon) && isTrainerInventoryHeldItem(item)) {
      try {
        return await transferTrainerHeldItemToPokemon(pokemon, item.parent, item.id);
      } catch (error) {
        console.error(`[${MODULE_ID}] Error prestando objeto desde el Trainer`, error);
        ui.notifications.error(error.message);
        return null;
      }
    }

    if (
      !isPokemonActor(
        pokemon
      ) ||
      item.getFlag(
        MODULE_ID,
        "kind"
      ) !==
        "move-template"
    ) {
      return super._onDropItem(
        event,
        item
      );
    }

    const moveDefinition =
      item.getFlag(
        MODULE_ID,
        "moveDefinition"
      );

    const sourceId =
      normalizeId(
        moveDefinition?.id ??
        getItemSourceId(
          item
        )
      );

    if (
      !moveDefinition?.id ||
      !sourceId
    ) {
      ui.notifications.error(
        "El Move arrastrado no contiene una definición Poke5e válida."
      );

      return null;
    }

    const knownMoveIds =
      getPokemonKnownMoveIds(
        pokemon
      );

    const existingMove =
      findOwnedMove(
        pokemon,
        sourceId
      );

    if (
      existingMove &&
      knownMoveIds.includes(
        sourceId
      )
    ) {
      ui.notifications.warn(
        `${pokemon.name} ya conoce ${existingMove.name}.`
      );

      return existingMove;
    }

    const moveLimit =
      getPokemonMoveLimit(
        pokemon
      );

    if (
      knownMoveIds.length >=
      moveLimit
    ) {
      warnMoveLimit(
        pokemon,
        moveLimit
      );

      return null;
    }

    if (existingMove) {
      await setPokemonKnownMoveIds(
        pokemon,
        [
          ...knownMoveIds,
          sourceId
        ]
      );

      return existingMove;
    }

    const source =
      buildMoveItemForActor(
        moveDefinition,
        pokemon,
        getModuleLanguage()
      );

    const createdDocuments =
      await pokemon
        .createEmbeddedDocuments(
          "Item",
          [
            source
          ]
        );

    const createdMove =
      createdDocuments[0] ??
      null;

    if (!createdMove) {
      return null;
    }

    try {
      await setPokemonKnownMoveIds(
        pokemon,
        [
          ...knownMoveIds,
          sourceId
        ]
      );
    } catch (error) {
      await createdMove.delete();
      throw error;
    }

    const staleTemplate =
      findOwnedMoveTemplate(
        pokemon,
        sourceId
      );

    if (
      staleTemplate &&
      staleTemplate.id !==
        createdMove.id
    ) {
      await staleTemplate.delete();
    }

    return createdMove;
  }
}


/* ============================================================
 * SHEET ASSIGNMENT
 * ============================================================ */

function isPokemonSource(
  source
) {

  return (
    source?.type ===
      "npc" &&
    source?.flags
      ?.[MODULE_ID]
      ?.kind ===
        POKEMON_KIND
  );
}


function onPreCreateActor(
  actor,
  source
) {

  if (
    !isPokemonSource(
      source
    )
  ) {

    return;
  }


  actor.updateSource({
    flags: {
      core: {
        sheetClass:
          POKEMON_SHEET_CLASS_ID
      }
    }
  });
}


async function assignPokemonSheetToExistingActors() {

  if (
    !game.user.isGM
  ) {

    return;
  }


  const updates =
    game.actors
      .filter(
        isPokemonActor
      )
      .filter(
        pokemon =>
          pokemon.getFlag(
            "core",
            "sheetClass"
          ) !==
            POKEMON_SHEET_CLASS_ID
      )
      .map(
        pokemon => ({
          _id:
            pokemon.id,

          "flags.core.sheetClass":
            POKEMON_SHEET_CLASS_ID
        })
      );


  if (
    !updates.length
  ) {

    return;
  }


  await Actor.updateDocuments(
    updates
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerPokemonActorSheet() {

  const DocumentSheetConfig =
    foundry.applications
      .apps
      .DocumentSheetConfig;


  DocumentSheetConfig
    .registerSheet(
      Actor,
      MODULE_ID,
      PokemonActorSheet,
      {
        types: [
          "npc"
        ],

        makeDefault:
          false,

        canConfigure:
          false,

        canBeDefault:
          false,

        label:
          "Poke5e Pokémon"
      }
    );


  Hooks.on(
    "preCreateActor",
    onPreCreateActor
  );


  Hooks.once(
    "ready",
    assignPokemonSheetToExistingActors
  );
}
