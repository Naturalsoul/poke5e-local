import {
  buildMoveItem
} from "./builder.mjs";

import {
  importPokemon
} from "./importer.mjs";

import {
  buildEncounterEntryKey,
  buildTrainerEncounterEntryKey,
  normalizeEncounterDefinition
} from "./encounter-model.mjs";

import {
  EncounterFolderService
} from "./encounter-folder-service.mjs";

import {
  learnableMoveIds,
  selectBestMoves,
  selectEncounterMoves

} from "./encounter-move-selector.mjs";

import {
  EncounterAbilityService
} from "./encounter-ability-service.mjs";

import {
  EncounterItemService
} from "./encounter-item-service.mjs";

import {
  calculatePokemonEncounterXp
} from "./encounter-xp-service.mjs";

import {
  getPokemonPermanentAbilityScores,
  setPokemonAbilityScore
} from "./pokemon-ability-score-service.mjs";


const MODULE_ID =
  "poke5e-local";


export class EncounterGenerationService {

  constructor(
    database,
    language = "es"
  ) {
    this.database =
      database ??
      {};

    this.language =
      language === "en"
        ? "en"
        : "es";


    this.pokemonById =
      new Map(
        (
          this.database.pokemon ??
          []
        )
          .filter(
            pokemon =>
              pokemon?.id
          )
          .map(
            pokemon => [
              String(
                pokemon.id
              ),
              pokemon
            ]
          )
      );


    this.movesById =
      new Map(
        (
          this.database.moves ??
          []
        )
          .filter(
            move =>
              move?.id
          )
          .map(
            move => [
              String(
                move.id
              ),
              move
            ]
          )
      );

    this.abilities =
      new EncounterAbilityService(
        this.database.abilities,
        this.language
      );

    this.items =
      new EncounterItemService(
        this.database.items,
        this.language
      );

    this.folders =
      new EncounterFolderService();
  }


  async generate(
    definition,
    {
      rerollMoves = false,
      rerollAbilities = false,
      allowHiddenAbilities = false,
      hiddenAbilityChancePercent = 5,
      rerollItems = false,
      itemPolicy = null,
      // Trainer battles only: { statBonus: 0–2, coverageTypes: [type], guaranteedItems, bestMoves, tmMoves: boolean }.
      boosts = {}
    } = {}
  ) {
    if (
      !game.user.isGM
    ) {
      throw new Error(
        "Solo el GM puede generar encuentros Pokémon."
      );
    }


    const encounter =
      normalizeEncounterDefinition(
        definition
      );


    const folders =
      await this.folders
        .folderFor(
          encounter
        );


    const requests =
      await this.#buildGenerationRequests(
        encounter,
        folders.encounter
      );


    const results = {
      created: 0,
      updated: 0,
      deleted: 0,
      retained: 0,
      entries: []
    };


    const desiredEntryKeys =
      new Set();


    for (
      const request
      of requests
    ) {
      await this.#generateEntry({
        encounter,
        request,
        rerollMoves,
        rerollAbilities,
        allowHiddenAbilities,
        hiddenAbilityChancePercent,
        rerollItems,
        itemPolicy,
        boosts:
          encounter.type ===
            "trainer"
            ? boosts
            : {},
        desiredEntryKeys,
        results
      });
    }


    const cleanup =
      await cleanupStaleEncounterActors(
        encounter.key,
        desiredEntryKeys
      );


    results.deleted +=
      cleanup.deleted;

    results.retained +=
      cleanup.retained;


    await this.folders
      .cleanupTrainerFolders(
        folders.encounter,
        encounter.key,

        encounter.type ===
          "trainer"
          ? encounter.trainers.map(
              trainer =>
                trainer.id
            )
          : []
      );


    return {
      encounter,
      folders,
      ...results
    };
  }

  async #buildGenerationRequests(
    encounter,
    encounterFolder
  ) {
    if (
      encounter.type !==
      "trainer"
    ) {
      return encounter.pokemon.map(
        (
          pokemon,
          index
        ) => ({
          pokemon,
          trainer:
            null,

          trainerOrder:
            null,

          folderId:
            encounterFolder.id,

          sort:
            (
              index + 1
            ) *
            100000
        })
      );
    }


    const requests =
      [];


    for (
      let trainerIndex = 0;
      trainerIndex <
        encounter.trainers.length;
      trainerIndex += 1
    ) {
      const trainer =
        encounter.trainers[
          trainerIndex
        ];


      const trainerFolder =
        await this.folders
          .trainerFolderFor(
            encounterFolder,
            encounter,
            trainer
          );


      trainer.pokemon.forEach(
        (
          pokemon,
          pokemonIndex
        ) => {
          requests.push({
            pokemon,
            trainer,

            trainerOrder:
              trainerIndex,

            folderId:
              trainerFolder.id,

            sort:
              (
                pokemonIndex + 1
              ) *
              100000
          });
        }
      );
    }


    return requests;
  }


  async #generateEntry({
    encounter,
    request,
    rerollMoves,
    rerollAbilities,
    allowHiddenAbilities,
    hiddenAbilityChancePercent,
    rerollItems,
    itemPolicy,
    boosts,
    desiredEntryKeys,
    results
  }) {
    const pokemon =
      this.pokemonById.get(
        request.pokemon.pokemonId
      );


    if (!pokemon) {
      throw new Error(
        `Pokémon no encontrado: ${request.pokemon.pokemonId}`
      );
    }


    const level =
      clampPokemonLevel(
        pokemon,
        request.pokemon.level
      );


    const entryKey =
      request.trainer
        ? buildTrainerEncounterEntryKey(
            encounter.key,
            request.trainer.id,
            pokemon.id,
            level
          )
        : buildEncounterEntryKey(
            encounter.key,
            pokemon.id,
            level
          );


    desiredEntryKeys.add(
      entryKey
    );


    const existing =
      findEncounterActor(
        entryKey
      );


    const importResult =
      await importPokemon(
        pokemon,

        existing
          ? {
              language:
                this.language,

              level,

              targetActor:
                existing,

              updateExisting:
                true
            }

          : {
              language:
                this.language,

              level,

              createNewInstance:
                true
            }
      );


    const actor =
      importResult.actor;

    await applyStatBonus(
      actor,
      boosts.statBonus
    );


    const moveResult =
      await this.#prepareMoves({
        actor,
        pokemon,
        level,
        encounter,
        entryKey,
        rerollMoves,
        coverageTypes:
          boosts.coverageTypes,
        requestedMoveIds:
          request.pokemon.moveIds,
        bestMoves:
          boosts.bestMoves,
        tmMoves:
          boosts.tmMoves
      });

    const abilityResult =
      await this.abilities.prepare({
        actor,
        pokemon,

        encounterKey:
          encounter.key,

        entryKey,

        requestedAbilityId:
          request.pokemon.abilityId,

        reroll:
          rerollAbilities,

        allowHiddenAbilities,
        hiddenAbilityChancePercent
      });

    const itemResult =
      await this.items.prepare({
        actor,

        encounterType:
          encounter.type,

        encounterKey:
          encounter.key,

        entryKey,

        requestedItemId:
          request.pokemon.itemId,

        requestedItemResolved:
          request.pokemon.itemResolved,

        reroll:
          rerollItems,
        policy:
          itemPolicy,
        guaranteed:
          boosts.guaranteedItems ===
            true
      });

    const xp =
      calculatePokemonEncounterXp({
        level,
        sr:
          pokemon.sr
      });


    const metadata =
      buildEncounterMetadata({
        encounter,
        request,
        pokemon,
        level,
        entryKey,

        moveIds:
          moveResult.moveIds,

        abilityId:
          abilityResult.abilityId,

        itemId:
          itemResult.itemId,

        itemResolved:
          itemResult.itemResolved,

        xp
      });


    await actor.update({
      folder:
        request.folderId,

      sort:
        request.sort,

      [`flags.${MODULE_ID}.encounter`]:
        metadata
    });


    results[
      existing
        ? "updated"
        : "created"
    ] += 1;


    results.entries.push({
      actor,
      pokemon,
      level,

      trainer:
        request.trainer
          ? {
              id:
                request.trainer.id,

              name:
                request.trainer.name,

              archetypeId:
                request.trainer.archetypeId
            }
          : null,

      quantity:
        request.pokemon.quantity,

      defeated:
        request.pokemon.defeated,

      captured:
        request.pokemon.captured,

      moveIds:
        moveResult.moveIds,

      abilityId:
        abilityResult.abilityId,

      itemId:
        itemResult.itemId,

      itemResolved:
        itemResult.itemResolved,

      xp
    });
  }

  async repairMissingAbilities({
    allowHiddenAbilities = false,
    hiddenAbilityChancePercent = 5
  } = {}) {
    return this.abilities
      .repairMissingAbilities({
        actors:
          game.actors,

        pokemonById:
          this.pokemonById,

        allowHiddenAbilities,
        hiddenAbilityChancePercent
      });
  }

  async #prepareMoves({
    actor,
    pokemon,
    level,
    encounter,
    entryKey,
    rerollMoves,
    coverageTypes = [],
    requestedMoveIds = [],
    bestMoves = false,
    tmMoves = false
  }) {
    const stored =
      actor.getFlag(
        MODULE_ID,
        "encounter"
      );


    const storedMoveIds =
      Array.isArray(
        stored?.moveIds
      )
        ? stored.moveIds
            .map(
              moveId =>
                String(
                  moveId
                )
            )
            .filter(
              moveId =>
                this.movesById.has(
                  moveId
                )
            )

        : null;


    const planned =
      rerollMoves
        ? null
        : plannedMoves(
            pokemon,
            level,
            requestedMoveIds,
            this.movesById
          );

    const shouldSelect =
      !planned &&
      (
        rerollMoves ||
        storedMoveIds ===
          null
      );


    const selectedMoves =
      planned ??
      (
        shouldSelect
        ? (bestMoves ? selectBestMoves : selectEncounterMoves)({
            pokemon,
            moves:
              this.movesById,
            level,
            coverageTypes,
            sources: {
              tm:
                tmMoves
            }
          })
        : storedMoveIds
            .map(
              moveId =>
                this.movesById.get(
                  moveId
                )
            )
            .filter(Boolean)
      );


    const moveIds =
      selectedMoves.map(
        move =>
          String(
            move.id
          )
      );


    if (
      shouldSelect ||
      !actorHasEncounterMoves(
        actor,
        entryKey,
        moveIds
      )
    ) {
      await replaceEncounterMoves({
        actor,
        pokemon,
        level,
        language:
          this.language,
        encounter,
        entryKey,
        moves:
          selectedMoves
      });
    }


    return {
      moveIds
    };
  }
}

/*
 * The encounter's +1/+2 to every ability score, through the Pokémon's own score service (so HP and Moves follow).
 * Re-imports keep the scores, so the flag remembers what was added and only the difference is applied: turning it
 * off takes it back.
 */
async function applyStatBonus(
  actor,
  statBonus = 0
) {
  const wanted =
    Math.max(
      0,
      Math.min(
        2,
        Math.trunc(
          Number(
            statBonus
          )
        ) || 0
      )
    );

  const applied =
    Number(
      actor.getFlag(
        MODULE_ID,
        "encounterStatBonus"
      )
    ) || 0;

  const delta =
    wanted -
    applied;

  if (!delta) {
    return;
  }

  const scores =
    getPokemonPermanentAbilityScores(
      actor
    );

  for (
    const [
      abilityId,
      score
    ]
    of Object.entries(
      scores
    )
  ) {
    await setPokemonAbilityScore(
      actor,
      abilityId,
      Math.max(
        1,
        Math.min(
          30,
          score + delta
        )
      )
    );
  }

  await actor.setFlag(
    MODULE_ID,
    "encounterStatBonus",
    wanted
  );
}

// Moves chosen in the planner win over the sheet's, when this species can learn them all at this level.
function plannedMoves(
  pokemon,
  level,
  moveIds,
  movesById
) {
  const learnable =
    new Set(
      learnableMoveIds(
        pokemon,
        level
      )
    );

  return moveIds?.length &&
    moveIds.every(
      moveId =>
        learnable.has(moveId) &&
        movesById.has(moveId)
    )
    ? moveIds.map(
        moveId =>
          movesById.get(
            moveId
          )
      )
    : null;
}

function buildEncounterMetadata({
  encounter,
  request,
  pokemon,
  level,
  entryKey,
  moveIds,
  abilityId,
  itemId,
  itemResolved,
  xp
}) {

  const quantity =
    request.pokemon.quantity;


  const defeated =
    request.pokemon.defeated;


  const captured =
    request.pokemon.captured;


  return {

    key:
      encounter.key,

    entryKey,

    name:
      encounter.name,

    location:
      encounter.location,
    type:
      encounter.type,
    optional:
      encounter.optional ===
        true,
    trainer:
      request.trainer

        ? {
            id:
              request.trainer.id,

            name:
              request.trainer.name,

            archetypeId:
              request.trainer.archetypeId,

            order:
              request.trainerOrder
          }

        : null,

    pokemonId:
      String(
        pokemon.id
      ),

    level,
    quantity,
    defeated,
    captured,
    moveIds,
    abilityId,
    itemId,
    itemResolved,

    xp: {

      defeated:
        xp.defeated,

      captured:
        xp.captured,

      defeatedTotal:
        xp.defeated *
        quantity,

      capturedTotal:
        xp.captured *
        quantity,

      earned:
        (
          xp.defeated *
          defeated
        ) +
        (
          xp.captured *
          captured
        )
    },

    stale:
      false
  };
}

async function replaceEncounterMoves({
  actor,
  pokemon,
  level,
  language,
  encounter,
  entryKey,
  moves
}) {
  const oldIds =
    actor.items
      .filter(
        item =>
          item.getFlag(
            MODULE_ID,
            "encounterManaged"
          ) === true
      )
      .map(
        item =>
          item.id
      )
      .filter(Boolean);


  if (oldIds.length) {
    await actor
      .deleteEmbeddedDocuments(
        "Item",
        oldIds
      );
  }


  const sources =
    moves.map(
      move => {
        const source =
          buildMoveItem(
            move,
            pokemon,
            level,
            language
          );


        source.flags[
          MODULE_ID
        ] ??= {};


        source.flags[
          MODULE_ID
        ].encounterManaged =
          true;


        source.flags[
          MODULE_ID
        ].encounterKey =
          encounter.key;


        source.flags[
          MODULE_ID
        ].encounterEntryKey =
          entryKey;


        return source;
      }
    );


  if (sources.length) {
    await actor
      .createEmbeddedDocuments(
        "Item",
        sources
      );
  }
}


function actorHasEncounterMoves(
  actor,
  entryKey,
  expectedMoveIds
) {
  const actualMoveIds =
    actor.items
      .filter(
        item =>
          item.getFlag(
            MODULE_ID,
            "encounterManaged"
          ) === true &&

          item.getFlag(
            MODULE_ID,
            "encounterEntryKey"
          ) ===
            entryKey
      )
      .map(
        item =>
          String(
            item.getFlag(
              MODULE_ID,
              "sourceId"
            ) ??
            ""
          )
      )
      .filter(Boolean)
      .sort();


  const expected = [
    ...expectedMoveIds
  ].sort();


  return (
    actualMoveIds.length ===
      expected.length &&

    actualMoveIds.every(
      (
        moveId,
        index
      ) =>
        moveId ===
        expected[index]
    )
  );
}


function findEncounterActor(
  entryKey
) {
  return (
    game.actors.find(
      actor =>
        actor.getFlag(
          MODULE_ID,
          "encounter"
        )?.entryKey ===
          entryKey
    ) ??
    null
  );
}


async function cleanupStaleEncounterActors(
  encounterKey,
  desiredEntryKeys
) {
  const staleActors =
    game.actors.filter(
      actor => {
        const encounter =
          actor.getFlag(
            MODULE_ID,
            "encounter"
          );


        return (
          encounter?.key ===
            encounterKey &&

          !desiredEntryKeys.has(
            encounter.entryKey
          )
        );
      }
    );


  let deleted = 0;
  let retained = 0;


  for (
    const actor
    of staleActors
  ) {
    if (
      actorIsUsedInScene(
        actor
      )
    ) {
      const encounter =
        foundry.utils.deepClone(
          actor.getFlag(
            MODULE_ID,
            "encounter"
          ) ??
          {}
        );


      encounter.stale =
        true;


      await actor.setFlag(
        MODULE_ID,
        "encounter",
        encounter
      );


      retained +=
        1;

      continue;
    }


    await actor.delete();

    deleted +=
      1;
  }


  return {
    deleted,
    retained
  };
}


function actorIsUsedInScene(
  actor
) {
  return game.scenes.some(
    scene =>
      scene.tokens.some(
        token =>
          token.actorId ===
            actor.id
      )
  );
}


function clampPokemonLevel(
  pokemon,
  value
) {
  const minimum =
    Math.min(
      20,

      Math.max(
        1,

        Math.trunc(
          Number(
            pokemon
              ?.minimumLevel ??
            1
          )
        ) ||
        1
      )
    );


  const numeric =
    Number(value);


  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return minimum;
  }


  return Math.min(
    20,

    Math.max(
      minimum,
      Math.trunc(
        numeric
      )
    )
  );
}