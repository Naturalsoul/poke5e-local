import {
  buildAbilityItem
} from "./builder.mjs";

import {
  selectEncounterAbility
} from "./encounter-ability-selector.mjs";


const MODULE_ID =
  "poke5e-local";


export class EncounterAbilityService {

  constructor(
    abilities,
    language = "es"
  ) {
    this.language =
      language ===
        "en"
        ? "en"
        : "es";


    this.abilitiesById =
      new Map(
        (
          abilities ??
          []
        )
          .filter(
            ability =>
              ability?.id
          )
          .map(
            ability => [
              normalizeCanonicalId(
                ability.id
              ),
              ability
            ]
          )
      );
  }


  async prepare({
    actor,
    pokemon,
    encounterKey,
    entryKey,
    requestedAbilityId = null,
    reroll = false,
    allowHiddenAbilities = false,
    hiddenAbilityChancePercent = 5
  }) {
    const abilityReferences =
      getPokemonAbilityReferences(
        pokemon
      );


    const availableById =
      new Map(
        [
          ...abilityReferences.keys()
        ]
          .map(
            abilityId => [
              abilityId,
              this.abilitiesById.get(
                abilityId
              )
            ]
          )
          .filter(
            (
              [
                ,
                ability
              ]
            ) =>
              Boolean(
                ability
              )
          )
      );

    const stored =
      actor.getFlag(
        MODULE_ID,
        "encounter"
      );


    const requestedId =
      normalizeCanonicalId(
        requestedAbilityId
      );


    const storedId =
      normalizeCanonicalId(
        stored?.abilityId
      );


    const activeId =
      normalizeCanonicalId(
        actor.getFlag(
          MODULE_ID,
          "activeAbilityId"
        )
      );


    const actorAbilityIds =
      getActorAbilityIds(
        actor
      );


    const requestedValidId =
      availableById.has(
        requestedId
      )
        ? requestedId
        : null;


    const storedValidId =
      availableById.has(
        storedId
      )
        ? storedId
        : null;


    const activeValidId =
      availableById.has(
        activeId
      ) &&
      actorAbilityIds.has(
        activeId
      )
        ? activeId
        : null;


    const singleExistingId =
      getSingleValidActorAbilityId(
        actorAbilityIds,
        availableById
      );


    /*
     * El Actor actual es la autoridad si
     * ya posee una Ability activa válida.
     *
     * Esto evita reemplazar accidentalmente
     * una Ability existente al reparar
     * encuentros antiguos.
     */
    const preservedId =
      activeValidId ??
      requestedValidId ??
      storedValidId ??
      singleExistingId;

    const selectedAbility =
      reroll ||
      !preservedId
        ? selectEncounterAbility({
            pokemon,

            abilities:
              this.abilitiesById,

            currentAbilityId:
              preservedId,

            allowHiddenAbilities,
            hiddenAbilityChancePercent
          })
        : availableById.get(
            preservedId
          );


    const abilityId =
      normalizeCanonicalId(
        selectedAbility.id
      );


    const syncResult =
      await synchronizeEncounterAbility({
        actor,
        ability:
          selectedAbility,
        abilityId,

        hiddenAbility:
          abilityReferences.get(
            abilityId
          )?.hidden ===
            true,

        language:
          this.language,

        encounterKey,
        entryKey
      });


    return {
      abilityId,

      createdItem:
        syncResult.createdItem
    };
  }


  async repairMissingAbilities({
    actors,
    pokemonById,
    allowHiddenAbilities = false,
    hiddenAbilityChancePercent = 5
  }) {
    if (
      !game.user.isGM
    ) {
      return emptyRepairResult();
    }


    const candidates =
      (
        actors ??
        []
      ).filter(
        isActiveEncounterActor
      );


    let affected =
      0;

    let repaired =
      0;

    let adopted =
      0;

    let failed =
      0;


    for (
      const actor
      of candidates
    ) {
      const encounter =
        actor.getFlag(
          MODULE_ID,
          "encounter"
        );


      const pokemon =
        pokemonById.get(
          String(
            encounter.pokemonId
          )
        );


      if (!pokemon) {
        failed +=
          1;


        console.warn(
          `[${MODULE_ID}] ${actor.name}: ` +
          `no se encontró Pokémon normalizado ` +
          `${String(encounter.pokemonId)} ` +
          "para reparar Ability de encuentro."
        );


        continue;
      }


      const beforeAbilityId =
        normalizeCanonicalId(
          encounter.abilityId
        );


      const beforeActiveAbilityId =
        normalizeCanonicalId(
          actor.getFlag(
            MODULE_ID,
            "activeAbilityId"
          )
        );


      try {
        const result =
          await this.prepare({
            actor,
            pokemon,

            encounterKey:
              String(
                encounter.key
              ),

            entryKey:
              String(
                encounter.entryKey
              ),

            requestedAbilityId:
              encounter.abilityId,

            reroll:
              false,

            allowHiddenAbilities,
            hiddenAbilityChancePercent
          });


        const metadataChanged =
          beforeAbilityId !==
          result.abilityId;


        if (
          metadataChanged
        ) {
          const updatedMetadata =
            foundry.utils.deepClone(
              encounter
            );


          updatedMetadata.abilityId =
            result.abilityId;


          await actor.setFlag(
            MODULE_ID,
            "encounter",
            updatedMetadata
          );
        }


        const afterActiveAbilityId =
          normalizeCanonicalId(
            actor.getFlag(
              MODULE_ID,
              "activeAbilityId"
            )
          );


        const changed =
          metadataChanged ||
          beforeActiveAbilityId !==
            afterActiveAbilityId ||
          result.createdItem;


        if (!changed) {
          continue;
        }


        affected +=
          1;


        if (
          result.createdItem
        ) {
          repaired +=
            1;

        } else {
          adopted +=
            1;
        }

      } catch (
        error
      ) {
        failed +=
          1;


        console.error(
          `[${MODULE_ID}] Error reparando Ability de encuentro para ${actor.name}`,
          error
        );
      }
    }


    return {
      affected,
      repaired,
      adopted,
      failed
    };
  }
}


function isActiveEncounterActor(
  actor
) {
  const encounter =
    actor?.getFlag(
      MODULE_ID,
      "encounter"
    );


  return Boolean(
    encounter &&
    typeof encounter ===
      "object" &&

    encounter.stale !==
      true &&

    String(
      encounter.key ??
      ""
    ).trim() &&

    String(
      encounter.entryKey ??
      ""
    ).trim() &&

    String(
      encounter.pokemonId ??
      ""
    ).trim()
  );
}


function emptyRepairResult() {
  return {
    affected:
      0,

    repaired:
      0,

    adopted:
      0,

    failed:
      0
  };
}


function getPokemonAbilityReferences(
  pokemon
) {
  const result =
    new Map();


  for (
    const entry
    of Array.isArray(
      pokemon?.abilities
    )
      ? pokemon.abilities
      : []
  ) {
    const id =
      normalizeCanonicalId(
        typeof entry ===
          "string"
          ? entry
          : entry?.id
      );


    if (!id) {
      continue;
    }


    result.set(
      id,
      {
        hidden:
          typeof entry ===
            "object" &&
          entry !==
            null
            ? entry.hidden ===
              true
            : false
      }
    );
  }


  return result;
}


function getActorAbilityIds(
  actor
) {
  return new Set(
    actor.items
      .filter(
        item =>
          item.getFlag(
            MODULE_ID,
            "kind"
          ) ===
            "ability"
      )
      .map(
        item =>
          normalizeCanonicalId(
            item.getFlag(
              MODULE_ID,
              "sourceId"
            )
          )
      )
      .filter(Boolean)
  );
}


function getSingleValidActorAbilityId(
  actorAbilityIds,
  validById
) {
  const validIds =
    [
      ...actorAbilityIds
    ].filter(
      abilityId =>
        validById.has(
          abilityId
        )
    );


  return validIds.length ===
    1
    ? validIds[0]
    : null;
}


async function synchronizeEncounterAbility({
  actor,
  ability,
  abilityId,
  hiddenAbility,
  language,
  encounterKey,
  entryKey
}) {
  const managedItems =
    actor.items.filter(
      item =>
        item.getFlag(
          MODULE_ID,
          "encounterAbilityManaged"
        ) ===
          true &&

        item.getFlag(
          MODULE_ID,
          "encounterEntryKey"
        ) ===
          entryKey
    );


  const selectedManagedItem =
    managedItems.find(
      item =>
        normalizeCanonicalId(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          )
        ) ===
          abilityId
    );


  const selectedExistingItem =
    actor.items.find(
      item =>
        item.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          "ability" &&

        normalizeCanonicalId(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          )
        ) ===
          abilityId
    );


  const obsoleteIds =
    managedItems
      .filter(
        item =>
          item.id !==
          selectedManagedItem?.id
      )
      .map(
        item =>
          item.id
      )
      .filter(Boolean);


  if (
    obsoleteIds.length
  ) {
    await actor
      .deleteEmbeddedDocuments(
        "Item",
        obsoleteIds
      );
  }


  let createdItem =
    false;


  if (
    !selectedExistingItem
  ) {
    const source =
      buildAbilityItem(
        ability,
        language,
        {
          hiddenAbility
        }
      );


    source.flags[
      MODULE_ID
    ] ??= {};


    /*
     * Distinto de encounterManaged.
     *
     * encounterManaged pertenece a Moves y
     * replaceEncounterMoves() elimina todos
     * esos Items durante un reroll.
     */
    source.flags[
      MODULE_ID
    ].encounterAbilityManaged =
      true;


    source.flags[
      MODULE_ID
    ].encounterKey =
      encounterKey;


    source.flags[
      MODULE_ID
    ].encounterEntryKey =
      entryKey;


    await actor
      .createEmbeddedDocuments(
        "Item",
        [
          source
        ]
      );


    createdItem =
      true;
  }


  const activeAbilityId =
    normalizeCanonicalId(
      actor.getFlag(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (
    activeAbilityId !==
      abilityId
  ) {
    await actor.setFlag(
      MODULE_ID,
      "activeAbilityId",
      abilityId
    );
  }


  return {
    createdItem
  };
}


function normalizeCanonicalId(
  value
) {
  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}