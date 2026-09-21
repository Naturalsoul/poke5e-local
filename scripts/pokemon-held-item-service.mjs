import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";

const MODULE_ID =
  "poke5e-local";

const HELD_ITEM_FLAG =
  "heldItemId";

const CATALOG_ITEM_KIND =
  "catalog-item";

let registered =
  false;


/* ============================================================
 * VALIDATION
 * ============================================================ */

function assertPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `${pokemon?.name ?? "Actor"} no es un Pokémon Poke5e.`
    );
  }
}


export function isPokemonCarryableItem(
  item
) {

  return (
    item?.documentName ===
      "Item" &&
    item.getFlag(
      MODULE_ID,
      "kind"
    ) ===
      CATALOG_ITEM_KIND
  );
}


function embeddedCarryableItems(
  pokemon
) {

  return pokemon.items.filter(
    isPokemonCarryableItem
  );
}


/* ============================================================
 * READ
 * ============================================================ */

export function getPokemonHeldItem(
  pokemon
) {

  assertPokemon(
    pokemon
  );


  const heldItemId =
    String(
      pokemon.getFlag(
        MODULE_ID,
        HELD_ITEM_FLAG
      ) ??
      ""
    );


  if (heldItemId) {

    const heldItem =
      pokemon.items.get(
        heldItemId
      );


    if (
      heldItem &&
      isPokemonCarryableItem(
        heldItem
      )
    ) {

      return heldItem;
    }
  }


  /*
   * Compatibilidad defensiva:
   *
   * si existiera un único catalog-item
   * embebido antes de introducir heldItemId,
   * lo reconocemos como el objeto llevado.
   */
  const candidates =
    embeddedCarryableItems(
      pokemon
    );


  return (
    candidates[0] ??
    null
  );
}


/* ============================================================
 * WRITE
 * ============================================================ */

export async function setPokemonHeldItem(
  pokemon,
  item
) {

  assertPokemon(
    pokemon
  );


  if (
    !isPokemonCarryableItem(
      item
    ) ||
    item.parent !==
      pokemon
  ) {

    throw new Error(
      "El Item no pertenece a este Pokémon o no proviene de Poke5e Items."
    );
  }


  const current =
    getPokemonHeldItem(
      pokemon
    );


  if (
    current &&
    current.id !==
      item.id
  ) {

    throw new Error(
      `${pokemon.name} ya está llevando ${current.name}.`
    );
  }


  await pokemon.setFlag(
    MODULE_ID,
    HELD_ITEM_FLAG,
    item.id
  );


  return item;
}


export async function clearPokemonHeldItem(
  pokemon,
  {
    deleteItem = true
  } = {}
) {

  assertPokemon(
    pokemon
  );


  const item =
    getPokemonHeldItem(
      pokemon
    );


  await pokemon.unsetFlag(
    MODULE_ID,
    HELD_ITEM_FLAG
  );


  if (
    deleteItem &&
    item
  ) {

    await item.delete();
  }


  return item;
}

/* ============================================================
 * TRAINER TRANSFER
 * ============================================================ */

function assertHeldItemTransferTarget(
  pokemon,
  trainer
) {

  assertPokemon(
    pokemon
  );


  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (
    !trainer ||
    trainerUuid !==
      trainer.uuid
  ) {

    throw new Error(
      `${pokemon.name} no pertenece al Trainer seleccionado.`
    );
  }


  if (
    !canCurrentUserOperateTrainerPokemon(
      trainer,
      pokemon
    )
  ) {

    throw new Error(
      "No tienes permisos para transferir este objeto al Trainer."
    );
  }
}


function transferableItemSource(
  item
) {

  const source =
    foundry.utils.deepClone(
      item.toObject()
    );


  delete source._id;
  delete source.folder;


  source.flags ??= {};

  source.flags[
    MODULE_ID
  ] ??= {};


  source.flags[
    MODULE_ID
  ].importManaged =
    false;


  return source;
}


export function canCurrentUserTransferPokemonHeldItem(
  pokemon,
  trainer
) {

  if (
    !isPokemonActor(
      pokemon
    ) ||
    !trainer ||
    getPokemonTrainerUuid(
      pokemon
    ) !==
      trainer.uuid ||
    !getPokemonHeldItem(
      pokemon
    )
  ) {

    return false;
  }


  return canCurrentUserOperateTrainerPokemon(
    trainer,
    pokemon
  );
}


export async function transferPokemonHeldItemToTrainer(
  pokemon,
  trainer
) {

  assertHeldItemTransferTarget(
    pokemon,
    trainer
  );


  const heldItem =
    getPokemonHeldItem(
      pokemon
    );


  if (!heldItem) {

    throw new Error(
      `${pokemon.name} no está llevando ningún objeto.`
    );
  }


  const created =
    await trainer.createEmbeddedDocuments(
      "Item",
      [
        transferableItemSource(
          heldItem
        )
      ]
    );


  const trainerItem =
    created[0] ??
    null;


  if (!trainerItem) {

    throw new Error(
      `No se pudo entregar ${heldItem.name} a ${trainer.name}.`
    );
  }


  try {

    await clearPokemonHeldItem(
      pokemon,
      {
        deleteItem:
          true
      }
    );

  } catch (error) {

    /*
     * Rollback:
     *
     * Si ya creamos el Item en el Trainer pero no
     * logramos quitarlo del Pokémon, eliminamos
     * la copia para evitar duplicación.
     */

    try {

      await trainerItem.delete();

    } catch (
      rollbackError
    ) {

      console.error(
        `[${MODULE_ID}] No se pudo revertir la transferencia de ${heldItem.name}.`,
        rollbackError
      );
    }


    /*
     * clearPokemonHeldItem() limpia heldItemId antes
     * de eliminar el Embedded Item.
     *
     * Si la eliminación falló y el Item original
     * todavía existe, restauramos el flag.
     */

    if (
      pokemon.items.get(
        heldItem.id
      ) &&
      pokemon.getFlag(
        MODULE_ID,
        HELD_ITEM_FLAG
      ) !==
        heldItem.id
    ) {

      try {

        await pokemon.setFlag(
          MODULE_ID,
          HELD_ITEM_FLAG,
          heldItem.id
        );

      } catch (
        restoreError
      ) {

        console.error(
          `[${MODULE_ID}] No se pudo restaurar heldItemId de ${pokemon.name}.`,
          restoreError
        );
      }
    }


    throw error;
  }


  return {
    pokemon,
    trainer,
    item:
      trainerItem
  };
}

/* ============================================================
 * DROP / DOCUMENT LIFECYCLE
 * ============================================================ */

function onPreCreateItem(
  item
) {

  const pokemon =
    item.parent;


  if (
    !isPokemonActor(
      pokemon
    ) ||
    !isPokemonCarryableItem(
      item
    )
  ) {

    return;
  }


  const current =
    getPokemonHeldItem(
      pokemon
    );


  if (current) {

    ui.notifications.warn(
      `${pokemon.name} ya está llevando ${current.name}. Retira ese objeto antes de asignar otro.`
    );

    return false;
  }


  /*
   * Este Item pertenece a la instancia concreta
   * del Pokémon y nunca debe ser administrado
   * por Importer/Builder.
   */
  item.updateSource({
    [`flags.${MODULE_ID}.importManaged`]:
      false
  });
}


async function onCreateItem(
  item
) {

  const pokemon =
    item.parent;


  if (
    !isPokemonActor(
      pokemon
    ) ||
    !isPokemonCarryableItem(
      item
    )
  ) {

    return;
  }


  try {

    await setPokemonHeldItem(
      pokemon,
      item
    );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] No se pudo asignar ${item.name} a ${pokemon.name}.`,
      error
    );


    ui.notifications.error(
      error?.message ??
      `No se pudo asignar ${item.name}.`
    );
  }
}


async function onDeleteItem(
  item
) {

  const pokemon =
    item.parent;


  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  const heldItemId =
    String(
      pokemon.getFlag(
        MODULE_ID,
        HELD_ITEM_FLAG
      ) ??
      ""
    );


  if (
    heldItemId !==
      item.id
  ) {

    return;
  }


  try {

    await pokemon.unsetFlag(
      MODULE_ID,
      HELD_ITEM_FLAG
    );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] No se pudo limpiar heldItemId de ${pokemon.name}.`,
      error
    );
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerPokemonHeldItemService() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "preCreateItem",
    onPreCreateItem
  );


  Hooks.on(
    "createItem",
    item => {

      void onCreateItem(
        item
      );
    }
  );


  Hooks.on(
    "deleteItem",
    item => {

      void onDeleteItem(
        item
      );
    }
  );
}