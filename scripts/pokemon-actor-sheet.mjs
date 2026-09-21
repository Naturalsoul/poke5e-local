import {
  isPokemonActor
} from "./trainer-party-service.mjs";


const MODULE_ID =
  "poke5e-local";

const POKEMON_KIND =
  "pokemon";

const POKEMON_SHEET_CLASS_ID =
  `${MODULE_ID}.PokemonActorSheet`;

const POKEMON_SHEET_TEMPLATE =
  `modules/${MODULE_ID}/templates/actors/pokemon-summary-tab.hbs`;


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