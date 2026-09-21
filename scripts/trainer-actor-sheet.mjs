import {
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const TRAINER_KIND =
  "trainer";

const TRAINER_SHEET_CLASS_ID =
  `${MODULE_ID}.TrainerActorSheet`;

const POKEMON_TAB_TEMPLATE =
  `modules/${MODULE_ID}/templates/actors/trainer-pokemon-tab.hbs`;

const CharacterActorSheet =
  globalThis.dnd5e
    .applications
    .actor
    .CharacterActorSheet;


/* ============================================================
 * SHEET PARTS
 * ============================================================ */

function buildTrainerSheetParts() {

  const {
    header,
    sidebar,
    ...remainingParts
  } =
    CharacterActorSheet
      .PARTS;


  return {
    header,
    sidebar,

    pokemon: {
      container: {
        classes: [
          "tab-body"
        ],

        id:
          "tabs"
      },

      template:
        POKEMON_TAB_TEMPLATE,

      scrollable: [
        ""
      ]
    },

    ...remainingParts
  };
}


/* ============================================================
 * TRAINER SHEET
 * ============================================================ */

export class TrainerActorSheet
  extends CharacterActorSheet {

  static DEFAULT_OPTIONS = {
    ...CharacterActorSheet
      .DEFAULT_OPTIONS,

    classes: [
      ...CharacterActorSheet
        .DEFAULT_OPTIONS
        .classes,

      "poke5e-trainer-sheet"
    ],

    position: {
      ...CharacterActorSheet
        .DEFAULT_OPTIONS
        .position,

      width:
        1000,

      height:
        900
    }
  };


  static PARTS =
    buildTrainerSheetParts();


  static TABS = [
    {
      tab:
        "pokemon",

      label:
        "Pokémon",

      icon:
        "poke5e-icon-pokeball"
    },

    ...CharacterActorSheet
      .TABS
  ];


  tabGroups = {
    primary:
      "pokemon"
  };
}


/* ============================================================
 * SHEET ASSIGNMENT
 * ============================================================ */

function isTrainerSource(
  source
) {

  return (
    source?.type ===
      "character" &&
    source?.flags
      ?.[MODULE_ID]
      ?.kind ===
        TRAINER_KIND
  );
}


function onPreCreateActor(
  actor,
  source
) {

  if (
    !isTrainerSource(
      source
    )
  ) {
    return;
  }


  actor.updateSource({
    flags: {
      core: {
        sheetClass:
          TRAINER_SHEET_CLASS_ID
      }
    }
  });
}


async function assignTrainerSheetToExistingActors() {

  if (
    !game.user.isGM
  ) {
    return;
  }


  const updates =
    game.actors
      .filter(
        isTrainerActor
      )
      .filter(
        trainer =>
          trainer.getFlag(
            "core",
            "sheetClass"
          ) !==
            TRAINER_SHEET_CLASS_ID
      )
      .map(
        trainer => ({
          _id:
            trainer.id,

          "flags.core.sheetClass":
            TRAINER_SHEET_CLASS_ID
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

export function registerTrainerActorSheet() {

  const DocumentSheetConfig =
    foundry.applications
      .apps
      .DocumentSheetConfig;


  DocumentSheetConfig
    .registerSheet(
      Actor,
      MODULE_ID,
      TrainerActorSheet,
      {
        types: [
          "character"
        ],

        makeDefault:
          false,

        canConfigure:
          false,

        canBeDefault:
          false,

        label:
          "Poke5e Trainer"
      }
    );


  Hooks.on(
    "preCreateActor",
    onPreCreateActor
  );


  Hooks.once(
    "ready",
    assignTrainerSheetToExistingActors
  );
}