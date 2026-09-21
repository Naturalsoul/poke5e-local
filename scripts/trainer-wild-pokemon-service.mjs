import {
  importPokemon
} from "./importer.mjs";

import {
  assignPokemonNature,
  getPokemonNature
} from "./nature-runtime.mjs";

import {
  getPokemonExtraMoveSlots,
  getPokemonKnownMoveIds,
  setPokemonExtraMoveSlots,
  setPokemonKnownMoveIds
} from "./pokemon-move-service.mjs";

import {
  assignPokemonShinyState,
  getPokemonShinyState
} from "./shiny-runtime.mjs";

import {
  clearPokemonHeldItem,
  getPokemonHeldItem,
  setPokemonHeldItem
} from "./pokemon-held-item-service.mjs";

import {
  addPokemonToParty,
  assignPokemonToTrainer,
  getTrainerPartyState,
  getTrainerPokeslotLimit,
  isPokemonActor,
  removePokemonFromParty
} from "./trainer-party-service.mjs";

import {
  deletePokemonTokenDocument
} from "./trainer-token-service.mjs";

import {
  isTrainerActor
} from "./trainer-service.mjs";

import {
  getPokemonNickname,
  renamePokemon
} from "./pokemon-name-service.mjs";

import {
  assignPokemonGender,
  getPokemonGender
} from "./gender-runtime.mjs";

const MODULE_ID =
  "poke5e-local";

const TRANSFERABLE_ITEM_KINDS =
  new Set([
    "move",
    "ability"
  ]);

const ENCOUNTER_ITEM_FLAG_KEYS =
  Object.freeze([
    "encounterManaged",
    "encounterAbilityManaged",
    "encounterKey",
    "encounterEntryKey"
  ]);


function assertGm() {

  if (!game.user.isGM) {

    throw new Error(
      "Solo el GM puede adquirir Pokémon salvajes."
    );
  }
}


function assertTrainer(
  trainer
) {

  if (
    !isTrainerActor(
      trainer
    )
  ) {

    throw new Error(
      `${trainer?.name ?? "Actor"} no es un Trainer Poke5e.`
    );
  }
}


function assertWildToken(
  tokenDocument
) {

  const actor =
    tokenDocument
      ?.actor ??
    null;


  if (
    tokenDocument
      ?.documentName !==
        "Token" ||
    tokenDocument
      ?.actorLink ===
        true ||
    !isPokemonActor(
      actor
    ) ||
    actor.getFlag(
      MODULE_ID,
      "trainerOwnerUuid"
    )
  ) {

    throw new Error(
      "Debes seleccionar un Token unlinked de un Pokémon salvaje."
    );
  }


  return actor;
}


function resolveWildIdentity(
  actor
) {

  const sourceId =
    String(
      actor.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    ).trim();


  const level =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      )
    );


  if (
    !sourceId ||
    !Number.isFinite(
      level
    )
  ) {

    throw new Error(
      `${actor.name} no posee sourceId/level válidos para crear su instancia de Trainer.`
    );
  }


  return {
    sourceId,

    level:
      Math.min(
        20,
        Math.max(
          1,
          Math.trunc(
            level
          )
        )
      )
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


function itemKind(
  item
) {

  return String(
    item?.getFlag?.(
      MODULE_ID,
      "kind"
    ) ??
    ""
  );
}


function itemSourceId(
  item
) {

  return normalizeCanonicalId(
    item?.getFlag?.(
      MODULE_ID,
      "sourceId"
    )
  );
}


function isTransferableIndividualItem(
  item
) {

  return (
    TRANSFERABLE_ITEM_KINDS.has(
      itemKind(
        item
      )
    ) &&
    item.getFlag(
      MODULE_ID,
      "importManaged"
    ) !== true
  );
}


function cloneIndividualItemSource(
  item
) {

  const source =
    foundry.utils.deepClone(
      item.toObject()
    );


  delete source._id;


  source.flags ??= {};

  source.flags[
    MODULE_ID
  ] ??= {};


  const moduleFlags =
    source.flags[
      MODULE_ID
    ];


  for (
    const key
    of ENCOUNTER_ITEM_FLAG_KEYS
  ) {

    delete moduleFlags[
      key
    ];
  }


  /*
   * Desde este momento el Item pertenece
   * al individuo y ya no al Encounter.
   */

  moduleFlags.importManaged =
    false;


  return source;
}


function resolveWildAbilityState(
  actor
) {

  const abilityItems =
    actor.items.filter(
      item =>
        itemKind(
          item
        ) === "ability" &&
        isTransferableIndividualItem(
          item
        )
    );


  const activeAbilityId =
    normalizeCanonicalId(
      actor.getFlag(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (activeAbilityId) {

    const activeItem =
      abilityItems.find(
        item =>
          itemSourceId(
            item
          ) ===
          activeAbilityId
      );


    if (!activeItem) {

      throw new Error(
        `${actor.name} declara la Ability activa ${activeAbilityId}, pero no posee su Item.`
      );
    }


    return {
      activeAbilityId,

      itemSource:
        cloneIndividualItemSource(
          activeItem
        )
    };
  }


  /*
   * Cada Pokémon solo puede tener una
   * Ability activa.
   *
   * Si no existe activeAbilityId pero existe
   * exactamente un Item, podemos adoptarlo.
   */

  if (
    abilityItems.length > 1
  ) {

    throw new Error(
      `${actor.name} posee múltiples Ability Items sin una Ability activa inequívoca.`
    );
  }


  const singleItem =
    abilityItems[0] ??
    null;


  return {
    activeAbilityId:
      singleItem
        ? itemSourceId(
            singleItem
          )
        : null,

    itemSource:
      singleItem
        ? cloneIndividualItemSource(
            singleItem
          )
        : null
  };
}


function cloneOptionalFlag(
  actor,
  key
) {

  const value =
    actor.getFlag(
      MODULE_ID,
      key
    );


  return value ===
    undefined
      ? undefined
      : foundry.utils.deepClone(
          value
        );
}

function heldItemSourceSnapshot(
  actor
) {

  const heldItem =
    getPokemonHeldItem(
      actor
    );


  if (!heldItem) {

    return null;
  }


  const source =
    foundry.utils.deepClone(
      heldItem.toObject()
    );


  /*
   * El nuevo Actor necesita su propio
   * Embedded Item y, por tanto, un nuevo ID.
   */

  delete source._id;


  source.flags ??= {};

  source.flags[
    MODULE_ID
  ] ??= {};


  /*
   * El Held Item pertenece a este individuo.
   * Nunca debe quedar administrado por Importer.
   */

  source.flags[
    MODULE_ID
  ].importManaged =
    false;


  return source;
}

function pokemonHpSnapshot(
  actor
) {

  const hp =
    actor.system
      ?.attributes
      ?.hp ??
    {};


  const value =
    Number(
      hp.value ??
      0
    );


  const maximum =
    Number(
      hp.max ??
      0
    );


  const temp =
    Number(
      hp.temp ??
      0
    );


  return {
    value:
      Number.isFinite(
        value
      )
        ? Math.max(
            0,
            value
          )
        : 0,

    max:
      Number.isFinite(
        maximum
      )
        ? Math.max(
            0,
            maximum
          )
        : 0,

    temp:
      Number.isFinite(
        temp
      )
        ? Math.max(
            0,
            temp
          )
        : 0
  };
}


function createWildPokemonSnapshot(
  actor
) {

  const nature =
    getPokemonNature(
      actor
    );


  if (!nature) {

    throw new Error(
      `${actor.name} todavía no posee una Nature asignada.`
    );
  }

  const gender =
    getPokemonGender(
      actor
    );


  if (!gender) {

    throw new Error(
      `${actor.name} todavía no posee un género asignado.`
    );
  }

  const ability =
    resolveWildAbilityState(
      actor
    );


  const moveItemSources =
    actor.items
      .filter(
        item =>
          itemKind(
            item
          ) === "move" &&
          isTransferableIndividualItem(
            item
          )
      )
      .map(
        cloneIndividualItemSource
      );


  return {
    nature,
    gender,

    nickname:
      getPokemonNickname(
        actor
      ),

    shiny:
      getPokemonShinyState(
        actor
      ),

    hp:
      pokemonHpSnapshot(
        actor
      ),

    moveItemSources,

    knownMoveIds:
      getPokemonKnownMoveIds(
        actor
      ),

    extraMoveSlots:
      getPokemonExtraMoveSlots(
        actor
      ),

    ability,

    heldItemSource:
      heldItemSourceSnapshot(
        actor
      ),

    pokemonProgression:
      cloneOptionalFlag(
        actor,
        "pokemonProgression"
      ),

    grantedHiddenAbilities:
      cloneOptionalFlag(
        actor,
        "grantedHiddenAbilities"
      )
  };
}


function abilityScoreGainsFromSnapshot(
  snapshot
) {

  const gains =
    snapshot
      .pokemonProgression
      ?.abilityScoreGains;


  return (
    gains &&
    typeof gains === "object"
  )
    ? foundry.utils.deepClone(
        gains
      )
    : null;
}


function individualItemIds(
  actor
) {

  return actor.items
    .filter(
      isTransferableIndividualItem
    )
    .map(
      item =>
        item.id
    )
    .filter(Boolean);
}


async function replaceIndividualBattleItems(
  pokemon,
  snapshot
) {

  const removeIds =
    individualItemIds(
      pokemon
    );


  if (
    removeIds.length
  ) {

    await pokemon.deleteEmbeddedDocuments(
      "Item",
      removeIds
    );
  }


  const itemSources = [
    ...snapshot.moveItemSources,

    ...(
      snapshot
        .ability
        .itemSource
        ? [
            snapshot
              .ability
              .itemSource
          ]
        : []
    )
  ];


  if (
    !itemSources.length
  ) {

    return;
  }


  await pokemon.createEmbeddedDocuments(
    "Item",
    foundry.utils.deepClone(
      itemSources
    )
  );
}


async function restoreOptionalFlag(
  pokemon,
  key,
  value
) {

  if (
    value ===
    undefined
  ) {

    return;
  }


  await pokemon.setFlag(
    MODULE_ID,
    key,
    foundry.utils.deepClone(
      value
    )
  );
}

async function restorePokemonNickname(
  pokemon,
  snapshot
) {

  if (
    !snapshot.nickname
  ) {

    return;
  }


  await renamePokemon(
    pokemon,
    snapshot.nickname
  );
}

async function restorePokemonNature(
  pokemon,
  snapshot
) {

  await assignPokemonNature(
    pokemon,
    snapshot.nature.id,
    {
      roll:
        snapshot.nature.roll
    }
  );
}


async function restorePokemonShinyState(
  pokemon,
  snapshot
) {

  if (!snapshot.shiny) {

    return;
  }


  await assignPokemonShinyState(
    pokemon,
    snapshot.shiny.isShiny,
    {
      ruleId:
        snapshot.shiny.ruleId,

      roll:
        snapshot.shiny.roll
    }
  );
}

async function restorePokemonGender(
  pokemon,
  snapshot
) {

  await assignPokemonGender(
    pokemon,
    snapshot.gender.id,
    {
      roll:
        snapshot.gender.roll
    }
  );
}


async function restoreMoveState(
  pokemon,
  snapshot
) {

  /*
   * Primero el límite, después los Moves
   * conocidos, porque knownMoveIds valida
   * contra dicho límite.
   */

  await setPokemonExtraMoveSlots(
    pokemon,
    snapshot.extraMoveSlots
  );


  await setPokemonKnownMoveIds(
    pokemon,
    snapshot.knownMoveIds
  );
}


async function restoreAbilityState(
  pokemon,
  snapshot
) {

  const activeAbilityId =
    snapshot
      .ability
      .activeAbilityId;


  if (!activeAbilityId) {

    await pokemon.setFlag(
      MODULE_ID,
      "activeAbilityId",
      null
    );

    return;
  }


  const abilityExists =
    pokemon.items.some(
      item =>
        itemKind(
          item
        ) === "ability" &&
        itemSourceId(
          item
        ) ===
        activeAbilityId
    );


  if (!abilityExists) {

    throw new Error(
      `${pokemon.name}: no se pudo restaurar la Ability ${activeAbilityId}.`
    );
  }


  await pokemon.setFlag(
    MODULE_ID,
    "activeAbilityId",
    activeAbilityId
  );
}

async function restoreHeldItemState(
  pokemon,
  snapshot
) {

  if (
    !snapshot.heldItemSource
  ) {

    return;
  }


  const current =
    getPokemonHeldItem(
      pokemon
    );


  /*
   * Normalmente el Actor recién importado
   * no debería llevar un objeto.
   *
   * Lo manejamos defensivamente para evitar
   * duplicar el slot si eso cambia en el futuro.
   */

  if (current) {

    await clearPokemonHeldItem(
      pokemon,
      {
        deleteItem:
          true
      }
    );
  }


  const created =
    await pokemon.createEmbeddedDocuments(
      "Item",
      [
        foundry.utils.deepClone(
          snapshot.heldItemSource
        )
      ]
    );


  const heldItem =
    created[0] ??
    null;


  if (!heldItem) {

    throw new Error(
      `${pokemon.name}: no se pudo restaurar el Held Item.`
    );
  }


  /*
   * Importante:
   *
   * No copiamos heldItemId del Pokémon salvaje.
   * El nuevo Embedded Item tiene un ID distinto.
   */

  await setPokemonHeldItem(
    pokemon,
    heldItem
  );
}

async function restorePokemonHp(
  pokemon,
  snapshot
) {

  const maximum =
    Number(
      pokemon.system
        ?.attributes
        ?.hp
        ?.max ??
      0
    );


  if (
    !Number.isFinite(
      maximum
    ) ||
    maximum < 1
  ) {

    throw new Error(
      `${pokemon.name} no posee un máximo de HP válido después de restaurar su estado individual.`
    );
  }


  /*
   * El máximo sigue siendo responsabilidad
   * de Builder + Progression + Nature.
   *
   * Conservamos el estado actual del individuo.
   */

  await pokemon.update({
    "system.attributes.hp.value":
      Math.min(
        maximum,
        snapshot.hp.value
      ),

    "system.attributes.hp.temp":
      snapshot.hp.temp
  });
}


async function restoreWildPokemonSnapshot(
  pokemon,
  snapshot
) {

  /*
   * Progression debe existir antes de aplicar
   * Nature, porque Nature puede recalcular HP
   * histórico cuando modifica CON.
   */

  await restoreOptionalFlag(
    pokemon,
    "pokemonProgression",
    snapshot.pokemonProgression
  );


  await restoreOptionalFlag(
    pokemon,
    "grantedHiddenAbilities",
    snapshot.grantedHiddenAbilities
  );


  await restorePokemonNature(
    pokemon,
    snapshot
  );


  await restorePokemonShinyState(
    pokemon,
    snapshot
  );

  await restorePokemonGender(
    pokemon,
    snapshot
  );

  await restorePokemonNickname(
    pokemon,
    snapshot
  );

  /*
   * Clonamos los Items DESPUÉS de Nature.
   *
   * Así conservamos exactamente el Item que tenía
   * el individuo salvaje, incluidos sus PP gastados.
   */

  await replaceIndividualBattleItems(
    pokemon,
    snapshot
  );


  await restoreMoveState(
    pokemon,
    snapshot
  );


  await restoreAbilityState(
    pokemon,
    snapshot
  );


  await restoreHeldItemState(
    pokemon,
    snapshot
  );


  /*
  * HP se restaura al final para que cualquier
  * recalculo anterior no lo vuelva a llenar.
  */

  await restorePokemonHp(
    pokemon,
    snapshot
  );
}

function assertDestination(
  destination
) {

  if (
    destination !== "party" &&
    destination !== "pc"
  ) {

    throw new Error(
      `Destino de Pokémon inválido: ${String(destination)}.`
    );
  }
}


function assertPartyCapacity(
  trainer
) {

  const state =
    getTrainerPartyState(
      trainer
    );


  const limit =
    getTrainerPokeslotLimit(
      trainer
    );


  if (
    state.pokemonUuids.length >=
      limit
  ) {

    throw new Error(
      `${trainer.name} no tiene Pokéslots disponibles (${state.pokemonUuids.length}/${limit}).`
    );
  }
}


async function deleteCreatedPokemon(
  pokemon
) {

  if (!pokemon?.id) {

    return;
  }


  try {

    await Actor.implementation
      .deleteDocuments([
        pokemon.id
      ]);

  } catch {

    /*
     * Conservamos el error original de adquisición.
     * Si la limpieza falla, el Actor queda disponible
     * para reparación manual por el GM.
     */
  }
}

async function cleanupCreatedPokemon(
  trainer,
  pokemon
) {

  if (!pokemon?.id) {

    return;
  }


  try {

    const state =
      getTrainerPartyState(
        trainer
      );


    if (
      state.pokemonUuids.includes(
        pokemon.uuid
      )
    ) {

      await removePokemonFromParty(
        trainer,
        pokemon
      );
    }

  } catch {

    /*
     * La limpieza del Party State es best-effort.
     * El error original de adquisición conserva
     * prioridad para el GM.
     */
  }


  await deleteCreatedPokemon(
    pokemon
  );
}

export async function acquireWildPokemonToken(
  trainer,
  tokenDocument,
  {
    destination = "pc"
  } = {}
) {

  assertGm();

  assertTrainer(
    trainer
  );

  assertDestination(
    destination
  );


  if (
    destination === "party"
  ) {

    assertPartyCapacity(
      trainer
    );
  }

  const wildActor =
    assertWildToken(
      tokenDocument
    );


  /*
   * Snapshot ANTES de crear la nueva instancia.
   *
   * El Synthetic Actor del Token es la autoridad
   * sobre este individuo concreto.
   */

  const snapshot =
    createWildPokemonSnapshot(
      wildActor
    );


  const {
    sourceId,
    level
  } =
    resolveWildIdentity(
      wildActor
    );


  const result =
    await importPokemon(
      sourceId,
      {
        createNewInstance:
          true,

        level,

        /*
         * Las mejoras permanentes deben formar parte
         * del build inicial para no alterar posteriormente
         * las estadísticas base calculadas.
         */

        abilityScoreGains:
          abilityScoreGainsFromSnapshot(
            snapshot
          )
      }
    );


  const pokemon =
    result?.actor ??
    null;


  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    throw new Error(
      `No se pudo crear una instancia individual de ${wildActor.name}.`
    );
  }


  let assigned =
    false;


  try {

    await restoreWildPokemonSnapshot(
      pokemon,
      snapshot
    );


    await assignPokemonToTrainer(
      trainer,
      pokemon
    );


    assigned =
      true;


    if (
      destination === "party"
    ) {

      await addPokemonToParty(
        trainer,
        pokemon
      );
      
      await deletePokemonTokenDocument(
        tokenDocument,
        {
          removeCombatants:
            true
        }
      );
    }

  } catch (error) {

    if (!assigned) {

      await deleteCreatedPokemon(
        pokemon
      );
    }


    throw error;
  }


  return {
    pokemon,

    nature:
      snapshot.nature,

    gender:
      snapshot.gender,

    shiny:
      snapshot.shiny,

    sourceToken:
      tokenDocument
  };
}