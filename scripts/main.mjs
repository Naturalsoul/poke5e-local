import { registerPokemonBondService } from "./pokemon-bond-service.mjs";
import { registerBattleHotbar, useBattleHotbarMacro } from "./battle-hotbar.mjs";
import { registerPassiveAbilityEngine } from "./passive-ability-engine.mjs";
import { registerActiveAbilityService } from "./active-ability-service.mjs";
import { registerRerollAbilityEngine } from "./reroll-ability-engine.mjs";
import { registerBerryAbilityEngine } from "./berry-ability-engine.mjs";
import { registerRiderAbilityEngine } from "./rider-ability-engine.mjs";
import { registerEventAbilityEngine } from "./event-ability-engine.mjs";
import { registerSelfStatusMoves } from "./self-status-moves.mjs";
import { registerBattlefieldService } from "./battlefield-service.mjs";
import { registerBattlefieldEffects } from "./battlefield-effects.mjs";
import { registerAuraAbilityEngine } from "./aura-ability-engine.mjs";
import { registerFormAbilityEngine } from "./form-ability-engine.mjs";
import { registerPokemonAbilityIcons } from "./pokemon-ability-icons.mjs";
import { registerTrainerCombatReactions } from "./trainer-combat-reactions.mjs";
import { registerTrainerReactionService } from "./trainer-reaction-service.mjs";
import { registerPokemonCaptureService } from "./pokemon-capture-service.mjs";
import { registerTrainerPathActions } from "./trainer-path-actions.mjs";
import {
  Poke5eImporter,
  loadDatabase,
  migrateLegacyPokemonGender,
  migratePokemonHoverMovement
} from "./importer.mjs";

import {
  PokemonEncounterPlanner
} from "./encounter-planner.mjs";

import {
  registerPokemonDamageTypes
} from "./types.mjs";

import {
  registerPokemonStatuses
} from "./status-effects.mjs";

import {
  registerPokemonTurnEngine
} from "./turn-engine.mjs";

import {
  registerMoveRequirementEngine
} from "./move-requirement-engine.mjs";

import {
  registerDynamicDamageEngine
} from "./dynamic-damage-engine.mjs";

import {
  registerPokemonDamageEngine
} from "./damage-engine.mjs";

import { registerHeldItemEngine } from "./held-item-engine.mjs";

import {
  registerPokemonNatureEngine
} from "./nature-engine.mjs";

import {
  registerPokemonGenderEngine
} from "./gender-engine.mjs";

import {
  registerPokemonShinyEngine
} from "./shiny-engine.mjs";

import {
  registerPokemonHpThresholdAbilityEngine
} from "./hp-threshold-ability-engine.mjs";

import {
  registerPokemonSelfDamageEngine
} from "./self-damage-engine.mjs";

import {
  registerPokemonForcedRecoilEngine
} from "./forced-recoil-engine.mjs";

import {
  registerAttackOutcomeEngine
} from "./attack-outcome-engine.mjs";

import {
  registerPokemonAttackStatusEngine
} from "./attack-status-engine.mjs";

import {
  registerPokemonAttackAbilityEngine
} from "./attack-ability-engine.mjs";

import {
  registerPokemonFlinchEngine
} from "./flinch-engine.mjs";

import {
  registerPokemonReactiveHitAbilityEngine
} from "./reactive-hit-ability-engine.mjs";

import {
  registerPokemonOffensiveHitAbilityEngine
} from "./offensive-hit-ability-engine.mjs";

import {
  registerPokemonModifierEngine
} from "./modifier-engine.mjs";
import { registerMoveModifierAutomation } from "./modifier-automation.mjs";

import {
  registerPokemonTargetedModifierEngine
} from "./targeted-modifier-engine.mjs";

import {
  registerPokemonPeriodicEngine
} from "./periodic-engine.mjs";

import {
  registerMultiTargetEngine
} from "./multi-target-engine.mjs";

import {
  registerSaveOutcomeEngine
} from "./save-outcome-engine.mjs";

import {
  registerSaveResultEngine
} from "./save-result-engine.mjs";

import {
  registerPokemonConfusionEngine
} from "./confusion-engine.mjs";

import {
  registerFoundryRegressionRunner
} from "./foundry-regression-runner.mjs";

import {
  registerPokemonCrySettings
} from "./pokemon-cry-service.mjs";

import {
  registerTrainerFeatureEngine
} from "./trainer-feature-engine.mjs";

import {
  registerTrainerPathEffects
} from "./trainer-path-effects.mjs";

import {
  registerTrainerBattleFeedback
} from "./trainer-battle-feedback.mjs";

import {
  registerPokemonActorSheet
} from "./pokemon-actor-sheet.mjs";

import {
  registerPokemonSheetUi
} from "./pokemon-sheet-ui.mjs";

import {
  registerPokemonHeldItemTokenUi
} from "./pokemon-held-item-token-ui.mjs";

import {
  registerTrainerActorSheet
} from "./trainer-actor-sheet.mjs";

import {
  registerTrainerDirectoryUi
} from "./trainer-directory-ui.mjs";

import {
  registerTrainerSheetUi
} from "./trainer-sheet-ui.mjs";

import {
  registerPoke5eItemCatalogSettings,
  syncPoke5eItemCompendium
} from "./item-catalog-service.mjs";

import {
  registerPoke5eItemConsumptionService
} from "./item-consumption-service.mjs";

import {
  registerTrainerOwnershipService
} from "./trainer-ownership-service.mjs";

import {
  registerTrainerSwitchAuthorityService
} from "./trainer-switch-authority-service.mjs";

import {
  playBattleTransition,
  registerBattleTransitionService
} from "./battle-transition-service.mjs";

import {
  fakemonRepository,
  registerFakemonRepositorySettings
} from "./fakemon-repository.mjs";

import {
  openFakemonStudio
} from "./fakemon-studio.mjs";

import {
  ANIMATED_TOKEN_SETTING
} from "./pokemon-token-media-service.mjs";

import {
  synchronizeAllPokemonShinyArtwork
} from "./shiny-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const EXPECTED_SYSTEM =
  "dnd5e";

const EXPECTED_VERSION =
  "5.3.3";


/* ============================================================
 * DATABASE ACCESS
 * ============================================================ */

function getDatabase() {
  return loadDatabase();
}


/* ============================================================
 * INIT
 * ============================================================ */

Hooks.once(
  "init",
  () => {

    console.log(
      `[${MODULE_ID}] Inicializando Poke5e Local 0.18.8`
    );


    /*
     * Mantenemos la configuración
     * que ya tenías.
     */

    game.settings.register(
      MODULE_ID,
      "language",
      {

        name:
          "Poke5e - Idioma de importación",

        hint:
          "Idioma predeterminado para el importador Pokémon.",

        scope:
          "world",

        config:
          true,

        type:
          String,

        choices: {
          es: "Español",
          en: "English"
        },

        default:
          "es"
      }
    );

    game.settings.register(
      MODULE_ID,
      ANIMATED_TOKEN_SETTING,
      {

        name:
          "Poke5e - Sprites animados",

        hint:
          "Usa sprites animados WebM para los Tokens Pokémon cuando estén disponibles. Los Pokémon sin animación continúan usando automáticamente su sprite estático.",

        scope:
          "world",

        config:
          true,

        type:
          Boolean,

        default:
          true,

        onChange:
          () => {

            if (
              !game.ready ||
              !game.user.isGM
            ) {

              return;
            }


            void synchronizeAllPokemonShinyArtwork({
              notify:
                true
            }).catch(
              error => {

                console.error(
                  `[${MODULE_ID}] Error cambiando el modo de sprites Pokémon.`,
                  error
                );


                ui.notifications.error(
                  "No se pudieron sincronizar todos los sprites Pokémon."
                );
              }
            );
          }
      }
    );

    registerFakemonRepositorySettings();
    registerPoke5eItemCatalogSettings();
    registerPoke5eItemConsumptionService();
    registerBattleTransitionService();

    const module =
      game.modules.get(
        MODULE_ID
      );


    if (module) {

      module.api = {
        ...(module.api ?? {}),

        syncItemCatalog:
          syncPoke5eItemCompendium,

        loadDatabase,
        migratePokemonHoverMovement,
        fakemonRepository,
        openFakemonStudio,
        playBattleTransition,
        useBattleHotbarMacro
      };
    }

    const language =
      game.settings.get(
        MODULE_ID,
        "language"
      );


    registerPokemonStatuses(

      language === "en"

        ? "en"

        : "es"
    );

    const configuredLanguage =
      game.settings.get(
        MODULE_ID,
        "language"
      );


    registerPokemonDamageTypes(
      configuredLanguage === "en"

        ? "en"

        : "es"
    );

    registerPokemonTurnEngine();
    registerMoveRequirementEngine();
    registerPokemonConfusionEngine();
    registerDynamicDamageEngine();
    registerPokemonDamageEngine();
    registerPokemonNatureEngine();
    registerPokemonShinyEngine();
    registerPokemonGenderEngine();
    registerPokemonHpThresholdAbilityEngine();
    registerPokemonSelfDamageEngine();
    registerPokemonForcedRecoilEngine();
    registerAttackOutcomeEngine();
    registerPokemonAttackStatusEngine();
    registerPokemonAttackAbilityEngine();
    registerPokemonFlinchEngine();
    registerPokemonReactiveHitAbilityEngine();
    registerPokemonOffensiveHitAbilityEngine();
    registerHeldItemEngine();
    registerPokemonModifierEngine();
    registerMoveModifierAutomation();
    registerPokemonTargetedModifierEngine();
    registerPokemonPeriodicEngine();
    registerMultiTargetEngine();
    registerSaveOutcomeEngine();
    registerSaveResultEngine();
    registerFoundryRegressionRunner();
    registerPokemonCrySettings();
    registerTrainerFeatureEngine();
    registerTrainerPathEffects();
    registerTrainerPathActions();
    registerPokemonCaptureService();
    registerTrainerReactionService();
    registerTrainerCombatReactions();
    registerPokemonBondService();
    registerBattleHotbar();
    registerPassiveAbilityEngine();
    registerActiveAbilityService();
    registerRerollAbilityEngine();
    registerBerryAbilityEngine();
    registerRiderAbilityEngine();
        registerEventAbilityEngine();
    registerSelfStatusMoves();
    registerBattlefieldService();
    registerBattlefieldEffects();
    registerAuraAbilityEngine();
    registerFormAbilityEngine();
    registerPokemonAbilityIcons();
    registerTrainerOwnershipService();
    registerTrainerSwitchAuthorityService();
    registerPokemonActorSheet();
    registerPokemonSheetUi();
    registerPokemonHeldItemTokenUi();
    registerTrainerActorSheet();
    registerTrainerDirectoryUi();
    registerTrainerSheetUi();
    registerTrainerBattleFeedback();
  }
);


/* ============================================================
 * SCENE CONTROL BUTTON
 *
 * Botón visible únicamente para GM.
 * ============================================================ */

Hooks.on(
  "getSceneControlButtons",
  controls => {

    if (
      !controls.tokens
    ) {
      return;
    }


    controls.tokens.tools
      .poke5eImporter = {

        name:
          "poke5eImporter",

        title:
          "Importador Pokémon",

        icon:
          "poke5e-icon-pokeball",

        order:
          Object.keys(
            controls.tokens.tools
          ).length,

        button:
          true,

        visible:
          game.user.isGM,


        onChange:
          async () => {

            const existing =
              foundry.applications
                .instances
                .get(
                  "poke5e-importer"
                );


            /*
             * Si ya está abierto,
             * cerramos.
             */

            if (existing) {

              await existing.close();

              return;
            }


            try {

              const database =
                await getDatabase();


              const app =
                new Poke5eImporter(
                  database
                );


              await app.render({
                force: true
              });

            } catch (error) {

              console.error(
                `[${MODULE_ID}] Error cargando importador`,
                error
              );


              ui.notifications.error(
                "No se pudo abrir el Importador Pokémon."
              );
            }
          }
      };

      controls.tokens.tools
        .poke5eEncounterPlanner = {

          name:
            "poke5eEncounterPlanner",

          title:
            "Planificador de Encuentros Pokémon",

          icon:
            "poke5e-icon-ultraball",

          order:
            Object.keys(
              controls.tokens.tools
            ).length,

          button:
            true,

          visible:
            game.user.isGM,


          onChange:
            async () => {

              const existing =
                foundry.applications
                  .instances
                  .get(
                    "poke5e-encounter-planner"
                  );


              if (existing) {
                await existing.close();

                return;
              }


              try {
                const database =
                  await getDatabase();


                const app =
                  new PokemonEncounterPlanner(
                    database
                  );


                await app.render({
                  force:
                    true
                });

              } catch (
                error
              ) {
                console.error(
                  `[${MODULE_ID}] Error cargando Planificador de Encuentros`,
                  error
                );


                ui.notifications.error(
                  "No se pudo abrir el Planificador de Encuentros Pokémon."
                );
              }
            }
        };

      controls.tokens.tools
        .poke5eFakemonStudio = {

          name:
            "poke5eFakemonStudio",

          title:
            "Fakemon Studio",

          icon:
            "poke5e-icon-pokedex",

          order:
            Object.keys(
              controls.tokens.tools
            ).length,

          button:
            true,

          visible:
            game.user.isGM,

          onChange:
            () => {

              openFakemonStudio();
            }
        };
  }
);


/* ============================================================
 * READY
 * ============================================================ */

Hooks.once(
  "ready",
  async () => {

    if (
      !game.user.isGM
    ) {
      return;
    }


    if (
      game.system.id !==
      EXPECTED_SYSTEM
    ) {

      ui.notifications.error(
        "Poke5e Local requiere D&D5e."
      );

      return;
    }


    if (
      game.system.version !==
      EXPECTED_VERSION
    ) {

      ui.notifications.warn(
        `Poke5e Local fue validado con D&D5e ${EXPECTED_VERSION}. ` +
        `Versión actual: ${game.system.version}`
      );
    }

    try {
      await migratePokemonHoverMovement({ notify: true });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error migrando velocidades de levitación.`, error);
    }

    // Without the gender ratio flag, gender-engine never rolls a gender for that Pokémon.
    try {
      await migrateLegacyPokemonGender({ notify: true });
    } catch (error) {
      console.error(`[${MODULE_ID}] Error migrando género Pokémon legacy.`, error);
    }

    try {

      await synchronizeAllPokemonShinyArtwork();

    } catch (error) {

      console.error(
        `[${MODULE_ID}] Error sincronizando sprites Pokémon al iniciar.`,
        error
      );
    }

    try {

      await syncPoke5eItemCompendium({
        notify:
          true
      });

    } catch (error) {

      console.error(
        `[${MODULE_ID}] Error sincronizando catálogo de Items Poke5e.`,
        error
      );


      ui.notifications.error(
        "No se pudo sincronizar el Compendium de Items Poke5e."
      );
    }

    /*
    * Limpiar colores antiguos de carpetas SR
    * creadas por Poke5e Local.
    */

    const srFolders =
      game.folders.filter(
        folder =>

          folder.type === "Actor" &&

          folder.getFlag(
            MODULE_ID,
            "kind"
          ) === "pokemon-sr" &&

          folder.color !== null
      );


    if (srFolders.length) {

      await Folder.updateDocuments(

        srFolders.map(
          folder => ({
            _id:
              folder.id,

            color:
              null
          })
        )
      );


      console.log(
        `[${MODULE_ID}] Colores eliminados de ${srFolders.length} carpetas SR.`
      );
    }


    console.log(
      `[${MODULE_ID}] Listo. Usa el botón Importador Pokémon en los controles de Tokens.`
    );
  }
);
