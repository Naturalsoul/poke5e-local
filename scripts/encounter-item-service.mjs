import {
  buildPoke5eCatalogItem
} from "./item-catalog-service.mjs";

import {
  clearPokemonHeldItem,
  getPokemonHeldItem,
  setPokemonHeldItem
} from "./pokemon-held-item-service.mjs";

import {
  getDefaultEncounterItemPolicy
} from "./encounter-item-policy.mjs";

import {
  selectEncounterItem
} from "./encounter-item-selector.mjs";


const MODULE_ID =
  "poke5e-local";


export class EncounterItemService {

  constructor(
    items,
    language = "es"
  ) {

    this.items =
      Array.isArray(
        items
      )

        ? items.filter(
            item =>
              item?.id
          )

        : [];


    this.itemsById =
      new Map(
        this.items.map(
          item => [
            normalizeItemId(
              item.id
            ),
            item
          ]
        )
      );


    this.language =
      language ===
        "en"
        ? "en"
        : "es";
  }


  async prepare({
    actor,
    encounterType,
    encounterKey,
    entryKey,
    requestedItemId = null,
    requestedItemResolved = false,
    reroll = false,
    policy = null,
    random = Math.random
  }) {

    /*
     * El Item que realmente lleva el Actor
     * es la fuente de verdad.
     */
    const current =
      getPokemonHeldItem(
        actor
      );


    const currentItemId =
      getCatalogItemSourceId(
        current
      );


    const stored =
      actor.getFlag(
        MODULE_ID,
        "encounter"
      );


    if (!reroll) {

      /*
       * Si alguien cambió manualmente el objeto,
       * adoptamos el estado real del Actor.
       */
      if (currentItemId) {

        return {
          itemId:
            currentItemId,

          itemResolved:
            true
        };
      }


      /*
       * Ya se sorteó previamente y actualmente
       * no lleva nada.
       *
       * No debemos volver a generar loot.
       */
      if (
        stored?.itemResolved ===
          true
      ) {

        return {
          itemId:
            null,

          itemResolved:
            true
        };
      }


      /*
       * Estado proveniente de la definición
       * del Planner antes de materializar.
       */
      if (
        requestedItemResolved ===
          true
      ) {

        const requestedId =
          normalizeItemId(
            requestedItemId
          );


        if (!requestedId) {

          return {
            itemId:
              null,

            itemResolved:
              true
          };
        }


        const requestedItem =
          this.itemsById.get(
            requestedId
          );


        if (!requestedItem) {

          throw new Error(
            `Item de encuentro no encontrado: ${requestedId}`
          );
        }


        await this.#replaceCarriedItem({
          actor,
          current,

          selectedItem:
            requestedItem,

          encounterKey,
          entryKey
        });


        return {
          itemId:
            requestedId,

          itemResolved:
            true
        };
      }
    }


    const resolvedPolicy =
      normalizePolicy(
        policy,
        encounterType
      );


    if (
      resolvedPolicy.enabled &&
      resolvedPolicy.chancePercent >
        0 &&
      !this.items.length
    ) {

      throw new Error(
        "No se cargó el catálogo normalizado de Items para el planificador de encuentros."
      );
    }


    const selectedItem =
      selectEncounterItem({

        items:
          this.items,

        enabled:
          resolvedPolicy.enabled,

        chancePercent:
          resolvedPolicy.chancePercent,

        categoryWeights:
          resolvedPolicy
            .categoryWeights,

        currentItemId,

        random
      });


    await this.#replaceCarriedItem({
      actor,
      current,
      selectedItem,
      encounterKey,
      entryKey
    });


    return {
      itemId:
        selectedItem

          ? normalizeItemId(
              selectedItem.id
            )

          : null,

      itemResolved:
        true
    };
  }


  async #replaceCarriedItem({
    actor,
    current,
    selectedItem,
    encounterKey,
    entryKey
  }) {

    const selectedItemId =
      normalizeItemId(
        selectedItem?.id
      );


    const currentItemId =
      getCatalogItemSourceId(
        current
      );


    if (
      current &&
      selectedItemId &&
      currentItemId ===
        selectedItemId
    ) {

      await setPokemonHeldItem(
        actor,
        current
      );


      return current;
    }


    if (current) {

      await clearPokemonHeldItem(
        actor,
        {
          deleteItem:
            true
        }
      );
    }


    if (!selectedItem) {

      return null;
    }


    const source =
      buildPoke5eCatalogItem(
        selectedItem,
        this.language
      );


    source.flags[
      MODULE_ID
    ] ??= {};


    /*
     * No pertenece al importer general ni al
     * sistema de Moves del encuentro.
     */
    source.flags[
      MODULE_ID
    ].importManaged =
      false;


    source.flags[
      MODULE_ID
    ].encounterItemManaged =
      true;


    source.flags[
      MODULE_ID
    ].encounterKey =
      encounterKey;


    source.flags[
      MODULE_ID
    ].encounterEntryKey =
      entryKey;


    const created =
      await actor
        .createEmbeddedDocuments(
          "Item",
          [
            source
          ]
        );


    const item =
      created[0] ??
      null;


    if (!item) {

      throw new Error(
        `No se pudo asignar ${selectedItem.id} a ${actor.name}.`
      );
    }


    await setPokemonHeldItem(
      actor,
      item
    );


    return item;
  }
}


function normalizePolicy(
  policy,
  encounterType
) {

  const defaults =
    getDefaultEncounterItemPolicy(
      encounterType
    );


  const source =
    policy &&
    typeof policy ===
      "object"

      ? policy

      : {};


  const categoryWeights =
    source.categoryWeights &&
    typeof source.categoryWeights ===
      "object"

      ? source.categoryWeights

      : {};


  return {

    enabled:
      source.enabled == null

        ? defaults.enabled

        : Boolean(
            source.enabled
          ),


    chancePercent:
      clampPercentage(
        source.chancePercent ??
        defaults.chancePercent
      ),


    categoryWeights: {

      berry:
        normalizeWeight(
          categoryWeights.berry ??
          defaults
            .categoryWeights
            .berry
        ),


      medicine:
        normalizeWeight(
          categoryWeights.medicine ??
          defaults
            .categoryWeights
            .medicine
        ),


      pokeball:
        normalizeWeight(
          categoryWeights.pokeball ??
          defaults
            .categoryWeights
            .pokeball
        ),


      "held-item":
        normalizeWeight(
          categoryWeights[
            "held-item"
          ] ??
          defaults
            .categoryWeights[
              "held-item"
            ]
        )
    }
  };
}


function getCatalogItemSourceId(
  item
) {

  if (!item) {

    return null;
  }


  return normalizeItemId(
    item.getFlag(
      MODULE_ID,
      "sourceId"
    )
  );
}


function normalizeItemId(
  value
) {

  const id =
    String(
      value ??
      ""
    )
      .trim()
      .toLowerCase();


  return (
    id ||
    null
  );
}


function clampPercentage(
  value
) {

  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    return 0;
  }


  return Math.min(
    100,

    Math.max(
      0,
      numeric
    )
  );
}


function normalizeWeight(
  value
) {

  const numeric =
    Number(
      value
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    return 0;
  }


  return Math.max(
    0,
    numeric
  );
}