import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  canCurrentUserOperateTrainerPokemon
} from "./trainer-ownership-service.mjs";
import { heldItemConfiguration } from "./held-item-config.mjs";
import { HELD_ITEM_LOAN, LOAN_SYNC_OPTION, loanBorrowerCopies, loanChargeUpdates, registerHeldItemLoanSync, synchronizeHeldItemLoanCharges } from "./held-item-loan-sync.mjs";

const MODULE_ID =
  "poke5e-local";

const HELD_ITEM_FLAG =
  "heldItemId";

const CATALOG_ITEM_KIND =
  "catalog-item";

let registered =
  false;

const pendingTrainerTransfers = new Map();

export function isTrainerInventoryBerry(item) {
  return isPokemonCarryableItem(item) && item.getFlag(MODULE_ID, "itemType") === "berry" &&
    item.parent?.documentName === "Actor" && item.parent.getFlag(MODULE_ID, "kind") === "trainer";
}

export function isTrainerInventoryHeldItem(item) {
  return isPokemonCarryableItem(item) && item.getFlag(MODULE_ID, "itemType") === "held-item" &&
    item.parent?.documentName === "Actor" && item.parent.getFlag(MODULE_ID, "kind") === "trainer";
}

function prepareLoanSource(item) {
  const source = transferableItemSource(item);
  const configuration = heldItemConfiguration(item.getFlag(MODULE_ID, "sourceId"), game.settings.get(MODULE_ID, "language"));
  source.system.quantity = 1;
  delete source.system.container;
  source.system.uses = { ...source.system.uses, ...configuration?.uses,
    spent: Number(source.system.uses?.spent ?? 0), autoDestroy: false };
  if (configuration?.activities) {
    source.system.activities = { ...source.system.activities, ...configuration.activities };
  }
  return source;
}

async function assignHeldItemLoan(pokemon, trainer, original, existing = null) {
  const quantity = Number(original.system.quantity);
  const split = quantity > 1;
  const previousHeld = existing ? { ...loanChargeUpdates(existing), "system.quantity": existing.system.quantity } : null;
  let record = original;
  let held = existing;
  let assigned = false;
  try {
    if (split) {
      const source = prepareLoanSource(existing ?? original);
      source.system.quantity = 0;
      [record] = await trainer.createEmbeddedDocuments("Item", [source]);
      if (!record) {throw new Error("No se pudo crear el registro del objeto prestado.");}
    }
    if (!held) {[held] = await pokemon.createEmbeddedDocuments("Item", [prepareLoanSource(original)], { [LOAN_SYNC_OPTION]: true });}
    if (!held) {throw new Error("No se pudo entregar el objeto al Pokémon.");}
    await setPokemonHeldItem(pokemon, held);
    if (!trainer.items.get(original.id) || Number(original.system.quantity) !== quantity) {
      throw new Error("El inventario cambió durante la entrega. Vuelve a intentarlo.");
    }
    const loan = { trainerUuid: trainer.uuid, trainerItemId: record.id, pokemonUuid: pokemon.uuid, pokemonItemId: held.id };
    const charges = existing ? loanChargeUpdates(existing) : loanChargeUpdates({ system: prepareLoanSource(original).system });
    if (!await held.update({ ...charges, "system.quantity": 1, [`flags.${MODULE_ID}.${HELD_ITEM_LOAN}`]: loan }, { [LOAN_SYNC_OPTION]: true })) {
      throw new Error("No se pudo vincular el objeto del Pokémon.");
    }
    if (!await record.update({ ...charges, ...(split ? {} : { "system.quantity": Math.max(0, quantity - 1) }),
      [`flags.${MODULE_ID}.${HELD_ITEM_LOAN}`]: loan }, { [LOAN_SYNC_OPTION]: true })) {
      throw new Error("No se pudo registrar el objeto en el inventario del Trainer.");
    }
    assigned = true;
    if (split && !await original.update({ "system.quantity": quantity - 1 })) {
      throw new Error("No se pudo descontar la unidad prestada del inventario.");
    }
    return held;
  } catch (error) {
    if (assigned && !split) {
      await original.update({ "system.quantity": quantity, [`flags.${MODULE_ID}.-=${HELD_ITEM_LOAN}`]: null }, { [LOAN_SYNC_OPTION]: true });
    }
    if (held && !existing) {await rollbackBerryTransfer(pokemon, held);}
    else if (held) {
      await held.update({ ...previousHeld, [`flags.${MODULE_ID}.-=${HELD_ITEM_LOAN}`]: null }, { [LOAN_SYNC_OPTION]: true });
    }
    if (split && record !== original) {await record.delete();}
    throw error;
  }
}

export function transferTrainerHeldItemToPokemon(pokemon, trainer, itemId) {
  return serializeTrainerTransfer(trainer, async () => {
    assertHeldItemTransferTarget(pokemon, trainer);
    if (getPokemonHeldItem(pokemon)) {throw new Error(`${pokemon.name} ya está llevando un objeto.`);}
    const original = trainer.items.get(itemId);
    const quantity = Number(original?.system?.quantity);
    if (!isTrainerInventoryHeldItem(original) || !Number.isInteger(quantity) || quantity < 1 || original.getFlag(MODULE_ID, HELD_ITEM_LOAN)) {
      throw new Error("No hay una unidad disponible de este objeto en el inventario del Trainer.");
    }
    return assignHeldItemLoan(pokemon, trainer, original);
  });
}

async function restoreLoanCopies(backups) {
  for (const { actor, source } of backups) {
    if (!actor.items.get(source._id)) {
      const [restored] = await actor.createEmbeddedDocuments("Item", [source], { keepId: true, [LOAN_SYNC_OPTION]: true });
      if (!restored) {throw new Error("No se pudo restaurar el objeto prestado.");}
      await setPokemonHeldItem(actor, restored);
    }
  }
}

async function returnHeldItemLoan(pokemon, trainer, held) {
  return serializeTrainerTransfer(trainer, async () => {
    const loan = held.getFlag(MODULE_ID, HELD_ITEM_LOAN);
    const record = trainer.items.get(loan.trainerItemId);
    const recordedLoan = record?.getFlag(MODULE_ID, HELD_ITEM_LOAN);
    if (loan.trainerUuid !== trainer.uuid || recordedLoan?.pokemonItemId !== held.id || recordedLoan?.pokemonUuid !== loan.pokemonUuid) {
      throw new Error("No se encuentra el registro original del objeto prestado.");
    }
    await synchronizeHeldItemLoanCharges(held);
    const backups = (await loanBorrowerCopies(held)).map(item => ({ actor: item.parent, source: item.toObject() }));
    try {
      for (const { actor, source } of backups) {
        await actor.items.get(source._id).delete();
        if (actor.items.get(source._id)) {throw new Error("No se pudo retirar el objeto prestado del Pokémon.");}
        if (actor.getFlag(MODULE_ID, HELD_ITEM_FLAG) === source._id) {await actor.unsetFlag(MODULE_ID, HELD_ITEM_FLAG);}
      }
      const updated = await record.update({ ...loanChargeUpdates(held), "system.quantity": Number(record.system.quantity) + 1,
        [`flags.${MODULE_ID}.-=${HELD_ITEM_LOAN}`]: null }, { [LOAN_SYNC_OPTION]: true });
      if (!updated) {throw new Error("No se pudo devolver el objeto al inventario del Trainer.");}
    } catch (error) {
      await restoreLoanCopies(backups);
      throw error;
    }
    return { pokemon, trainer, item: record };
  });
}

export async function reconcilePokemonHeldItemLoan(pokemon) {
  if (!isPokemonActor(pokemon)) {return;}
  const trainerUuid = getPokemonTrainerUuid(pokemon);
  if (!trainerUuid) {return;}
  const trainer = await fromUuid(trainerUuid);
  if (!trainer) {return;}
  await serializeTrainerTransfer(trainer, async () => {
    const held = getPokemonHeldItem(pokemon);
    if (!held || held.getFlag(MODULE_ID, "itemType") !== "held-item" || held.getFlag(MODULE_ID, HELD_ITEM_LOAN) ||
      !(Number(held.system.quantity) > 0)) {return;}
    assertHeldItemTransferTarget(pokemon, trainer);
    const baseItem = pokemon.token?.baseActor?.items.get(held.id);
    const baseLoan = baseItem?.getFlag(MODULE_ID, HELD_ITEM_LOAN);
    if (baseLoan && baseItem.getFlag(MODULE_ID, "sourceId") === held.getFlag(MODULE_ID, "sourceId")) {
      await held.update({ [`flags.${MODULE_ID}.${HELD_ITEM_LOAN}`]: baseLoan }, { [LOAN_SYNC_OPTION]: true });
      await synchronizeHeldItemLoanCharges(held);
      return;
    }
    const candidates = trainer.items.filter(item => isTrainerInventoryHeldItem(item) &&
      item.getFlag(MODULE_ID, "sourceId") === held.getFlag(MODULE_ID, "sourceId") &&
      !item.getFlag(MODULE_ID, HELD_ITEM_LOAN) && Number(item.system.quantity) >= 0);
    if (candidates.length > 1) {
      console.warn(`[${MODULE_ID}] ${pokemon.name}: hay varios registros posibles del objeto; devuélvelo y asígnalo desde el inventario para vincularlo.`);
      return;
    }
    let record = candidates[0];
    if (!record) {
      const source = prepareLoanSource(held);
      source.system.quantity = 0;
      [record] = await trainer.createEmbeddedDocuments("Item", [source]);
      if (!record) {throw new Error("No se pudo crear el recordatorio del objeto en el Trainer.");}
    }
    try {
      await assignHeldItemLoan(pokemon, trainer, record, held);
    } catch (error) {
      if (!candidates.length) {await record.delete();}
      throw error;
    }
  });
}

async function reconcileAllHeldItemLoans() {
  const activeGM = game.users?.activeGM;
  if (activeGM ? activeGM.id !== game.user.id : !game.user.isGM) {return;}
  const actors = new Map(Array.from(game.actors ?? []).map(actor => [actor.uuid, actor]));
  const scenes = Array.from(game.scenes ?? []).sort((left, right) => Number(Boolean(left.active)) - Number(Boolean(right.active)));
  for (const scene of scenes) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {actors.set(token.actor.uuid, token.actor);}
    }
  }
  for (const pokemon of actors.values()) {await reconcilePokemonHeldItemLoan(pokemon);}
}

function serializeTrainerTransfer(trainer, task) {
  const key = trainer.uuid;
  const result = (pendingTrainerTransfers.get(key) ?? Promise.resolve()).then(task);
  const settled = result.then(() => undefined, () => undefined);
  pendingTrainerTransfers.set(key, settled);
  void settled.then(() => {
    if (pendingTrainerTransfers.get(key) === settled) {
      pendingTrainerTransfers.delete(key);
    }
  });
  return result;
}

function trainerBerry(trainer, itemId) {
  const item = trainer.items.get(itemId);
  const quantity = Number(item?.system?.quantity ?? 0);
  if (!isTrainerInventoryBerry(item) || !Number.isInteger(quantity) || quantity < 1) {
    throw new Error("La baya ya no está disponible en el inventario del Trainer.");
  }
  return item;
}

async function rollbackBerryTransfer(pokemon, item) {
  await item.delete();
  if (pokemon.items.get(item.id)) {
    throw new Error("No se pudo revertir la entrega de la baya al Pokémon.");
  }
  if (pokemon.getFlag(MODULE_ID, HELD_ITEM_FLAG) === item.id) {
    await pokemon.unsetFlag(MODULE_ID, HELD_ITEM_FLAG);
  }
}

export function transferTrainerBerryToPokemon(pokemon, trainer, itemId) {
  return serializeTrainerTransfer(trainer, async () => {
    assertHeldItemTransferTarget(pokemon, trainer);
    if (getPokemonHeldItem(pokemon)) {
      throw new Error(`${pokemon.name} ya está llevando un objeto. Retíralo antes de entregar una baya.`);
    }
    const original = trainerBerry(trainer, itemId);
    const source = transferableItemSource(original);
    source.system.quantity = 1;
    // El contenedor del inventario del Trainer no existe en el Pokémon.
    delete source.system.container;
    const [created] = await pokemon.createEmbeddedDocuments("Item", [source]);
    if (!created) {
      throw new Error(`No se pudo entregar ${original.name} a ${pokemon.name}.`);
    }
    try {
      await setPokemonHeldItem(pokemon, created);
      // Resolver nuevamente la pila: su cantidad puede cambiar mientras se crea el Item.
      const current = trainerBerry(trainer, itemId);
      const quantity = Number(current.system.quantity);
      if (quantity === 1) {
        await current.delete();
        if (trainer.items.get(itemId)) {
          throw new Error("No se pudo descontar la última baya del inventario del Trainer.");
        }
      } else {
        const updated = await current.update({ "system.quantity": quantity - 1 });
        if (!updated) {
          throw new Error("No se pudo descontar la baya del inventario del Trainer.");
        }
      }
    } catch (error) {
      try {
        await rollbackBerryTransfer(pokemon, created);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "La entrega de la baya falló y no pudo revertirse completamente.");
      }
      throw error;
    }
    return created;
  });
}


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
      "No tienes permisos para transferir objetos entre este Trainer y su Pokémon."
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

  delete source.flags[MODULE_ID][HELD_ITEM_LOAN];


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

  if (heldItem.getFlag(MODULE_ID, HELD_ITEM_LOAN)) {
    return returnHeldItemLoan(pokemon, trainer, heldItem);
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

    return true;
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
  return true;
}


async function onCreateItem(
  item,
  options = {},
  userId
) {

  const pokemon =
    item.parent;


  // Only the client that made the change writes: the others lack permission.
  if (
    userId !== game.user.id ||
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

    if (!options[LOAN_SYNC_OPTION]) {
      await reconcilePokemonHeldItemLoan(pokemon);
    }

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
  item,
  userId
) {

  const pokemon =
    item.parent;


  if (
    userId !== game.user.id ||
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

  registerHeldItemLoanSync();


  Hooks.on(
    "preCreateItem",
    onPreCreateItem
  );


  Hooks.on(
    "createItem",
    (item, options, userId) => {

      void onCreateItem(
        item, options, userId
      );
    }
  );


  Hooks.on(
    "deleteItem",
    (item, _options, userId) => {

      void onDeleteItem(
        item, userId
      );
    }
  );

  Hooks.once("ready", () => {
    void reconcileAllHeldItemLoans().catch(error => {
      console.error(`[${MODULE_ID}] Error vinculando objetos con su Trainer`, error);
      ui.notifications.error(error.message);
    });
  });
}
