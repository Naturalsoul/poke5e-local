import {
  buildMoveItem
} from "./builder.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";
import { getLanguage as currentLanguage } from "./i18n.mjs";


const MODULE_ID =
  "poke5e-local";

const ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];


function pokemonLevel(
  pokemon
) {
  const value =
    Number(
      pokemon.getFlag(
        MODULE_ID,
        "level"
      )
    );


  return Number.isFinite(
    value
  )
    ? Math.min(
        20,
        Math.max(
          1,
          Math.trunc(
            value
          )
        )
      )
    : 1;
}


function pokemonBuildContext(
  pokemon
) {
  const storedTypes =
    pokemon.getFlag(
      MODULE_ID,
      "types"
    );


  const types =
    Array.isArray(
      storedTypes
    )
      ? storedTypes
          .map(
            type =>
              String(
                type ??
                ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];


  const attributes =
    Object.fromEntries(
      ABILITY_IDS.map(
        abilityId => [
          abilityId,

          Number(
            pokemon.system
              ?.abilities
              ?.[abilityId]
              ?.value ??
            10
          )
        ]
      )
    );


  return {
    id:
      String(
        pokemon.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
        pokemon.id
      ),

    types,

    primaryType:
      String(
        pokemon.getFlag(
          MODULE_ID,
          "primaryType"
        ) ??
        types[0] ??
        "normal"
      )
        .trim()
        .toLowerCase(),

    combat: {
      attributes
    }
  };
}


/* ============================================================
 * MOVE STATE
 * ============================================================ */

function refreshableMoves(
  pokemon
) {

  return pokemon.items.filter(
    item => {

      if (
        item.getFlag(
          MODULE_ID,
          "kind"
        ) !==
          "move"
      ) {

        return false;
      }


      return Boolean(
        item.getFlag(
          MODULE_ID,
          "moveDefinition"
        )?.id
      );
    }
  );
}


function buildRefreshedMoveSource(
  pokemon,
  move
) {
  const definition =
    move.getFlag(
      MODULE_ID,
      "moveDefinition"
    );


  if (
    !definition?.id
  ) {
    throw new Error(
      `${move.name} no conserva moveDefinition y no puede refrescarse.`
    );
  }


  const source =
    buildMoveItem(
      definition,
      pokemonBuildContext(
        pokemon
      ),
      pokemonLevel(
        pokemon
      ),
      currentLanguage()
    );

    /*
    * buildMoveItem() construye por defecto un Move manual.
    *
    * Al refrescar debemos conservar la autoridad original.
    * Esto es especialmente importante para Struggle.
    */

    const originalImportManaged =
      move.getFlag(
        MODULE_ID,
        "importManaged"
      );


    const importManaged =
      originalImportManaged !==
        false;


    const originalCatalog =
      move.getFlag(
        MODULE_ID,
        "catalog"
      );


    source.flags[
      MODULE_ID
    ].importManaged =
      importManaged;


    source.flags[
      MODULE_ID
    ].catalog =
      originalCatalog ??
      (
        importManaged
          ? "system"
          : "moves"
      );

  const spent =
    Number(
      move.system
        ?.uses
        ?.spent ??
      0
    );


  const maximum =
    Number(
      source.system
        ?.uses
        ?.max
    );


  if (
    source.system
      ?.uses
  ) {
    source.system.uses.spent =
      Number.isFinite(
        maximum
      )
        ? Math.min(
            Math.max(
              0,
              Number.isFinite(
                spent
              )
                ? spent
                : 0
            ),
            maximum
          )
        : Math.max(
            0,
            Number.isFinite(
              spent
            )
              ? spent
              : 0
          );
  }


  source._id =
    move.id;

  source.sort =
    move.sort;


  return source;
}


/* ============================================================
 * REFRESH
 * ============================================================ */

export async function refreshPokemonMoves(
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


  const moves =
    refreshableMoves(
      pokemon
    );


  if (
    !moves.length
  ) {
    return {
      refreshed: 0
    };
  }


  /*
   * Construimos y validamos todo ANTES
   * de eliminar los documentos existentes.
   */
  const refreshedSources =
    moves.map(
      move =>
        buildRefreshedMoveSource(
          pokemon,
          move
        )
    );


  const rollbackSources =
    moves.map(
      move =>
        move.toObject()
    );


  const moveIds =
    moves.map(
      move =>
        move.id
    );


  await pokemon.deleteEmbeddedDocuments(
    "Item",
    moveIds
  );


  try {
    const created =
      await pokemon.createEmbeddedDocuments(
        "Item",
        refreshedSources,
        {
          keepId:
            true,

          keepEmbeddedIds:
            true
        }
      );


    return {
      refreshed:
        created.length
    };

  } catch (error) {

    const existingIds =
      new Set(
        pokemon.items.map(
          item =>
            item.id
        )
      );


    const missingRollbackSources =
      rollbackSources.filter(
        source =>
          !existingIds.has(
            source._id
          )
      );


    if (
      missingRollbackSources.length
    ) {
      await pokemon.createEmbeddedDocuments(
        "Item",
        missingRollbackSources,
        {
          keepId:
            true,

          keepEmbeddedIds:
            true
        }
      );
    }


    throw error;
  }
}