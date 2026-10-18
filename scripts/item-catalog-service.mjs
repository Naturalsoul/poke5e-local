import {
  buildAbilityCatalogItem,
  buildAbilityItem,
  buildMoveCatalogItem,
  buildMoveItem
} from "./builder.mjs";

import {
  registerPokemonHeldItemService
} from "./pokemon-held-item-service.mjs";

import {
  repairPoke5eMoveDescriptions
} from "./move-description-repair-service.mjs";

import { adaptedItemSource, itemDescriptionFingerprint, stripAdaptedItemNotice } from "./item-description-format.mjs";
import { registerAdaptedItemSourceUi } from "./item-source-ui.mjs";
import { heldItemConfiguration } from "./held-item-config.mjs";

const MODULE_ID = "poke5e-local";
const POKE5E_DATA_PATH =
  `modules/${MODULE_ID}/data/normalized/items.json`;

const CAMPAIGN_DATA_PATH =
  `modules/${MODULE_ID}/data/campaign/items.json`;

const MOVES_DATA_PATH =
  `modules/${MODULE_ID}/data/normalized/moves.json`;

const ABILITIES_DATA_PATH =
  `modules/${MODULE_ID}/data/normalized/abilities.json`;

const ABILITY_PACK_NAME =
  "poke5e-abilities";

const ABILITY_PACK_ID =
  `world.${ABILITY_PACK_NAME}`;

const ABILITY_PACK_LABEL =
  "Poke5e Abilities";

const ABILITY_CATALOG_SETTING =
  "abilityCatalogSignature";

const ABILITY_CATALOG_VERSION =
  "0.1.0";

const MOVE_PACK_NAME =
  "poke5e-moves";

const MOVE_PACK_ID =
  `world.${MOVE_PACK_NAME}`;

const MOVE_PACK_LABEL =
  "Poke5e Moves";

const MOVE_CATALOG_SETTING =
  "moveCatalogSignature";

const MOVE_CATALOG_VERSION =
  "0.2.0";

const MOVE_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
  "typeless"
];

const MOVE_TYPE_LABELS = {
  es: {
    normal: "Normal",
    fire: "Fuego",
    water: "Agua",
    electric: "Eléctrico",
    grass: "Planta",
    ice: "Hielo",
    fighting: "Lucha",
    poison: "Veneno",
    ground: "Tierra",
    flying: "Volador",
    psychic: "Psíquico",
    bug: "Bicho",
    rock: "Roca",
    ghost: "Fantasma",
    dragon: "Dragón",
    dark: "Siniestro",
    steel: "Acero",
    fairy: "Hada",
    typeless: "Sin tipo"
  },

  en: {
    normal: "Normal",
    fire: "Fire",
    water: "Water",
    electric: "Electric",
    grass: "Grass",
    ice: "Ice",
    fighting: "Fighting",
    poison: "Poison",
    ground: "Ground",
    flying: "Flying",
    psychic: "Psychic",
    bug: "Bug",
    rock: "Rock",
    ghost: "Ghost",
    dragon: "Dragon",
    dark: "Dark",
    steel: "Steel",
    fairy: "Fairy",
    typeless: "Typeless"
  }
};

const MOVE_CONTEXT_ABILITY_IDS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
];

let moveTemplateDropAdapterRegistered =
  false;

let abilityTemplateDropAdapterRegistered =
  false;

const PACK_NAME = "poke5e-items";
const PACK_ID = `world.${PACK_NAME}`;
const PACK_LABEL = "Poke5e Items";
const CATALOG_SETTING = "itemCatalogSignature";
const ITEM_CATALOG_VERSION = "0.4.1";

const FOUNDRY_ITEM_TYPES = {
  pokeball: "consumable",
  medicine: "consumable",
  berry: "consumable",
  evolution: "loot",
  "held-item": "equipment",
  "trainer-gear": "loot"
};

const CATALOG_FOLDER_DEFINITIONS = [
  {
    itemType: "pokeball",
    names: {
      es: "Poké Balls",
      en: "Poké Balls"
    }
  },
  {
    itemType: "medicine",
    names: {
      es: "Medicina",
      en: "Medicine"
    }
  },
  {
    itemType: "berry",
    names: {
      es: "Bayas",
      en: "Berries"
    }
  },
  {
    itemType: "evolution",
    names: {
      es: "Evolución",
      en: "Evolution"
    }
  },
  {
    itemType: "held-item",
    names: {
      es: "Objetos equipados",
      en: "Held Items"
    }
  },
  {
    itemType: "trainer-gear",
    names: {
      es: "Equipo de Entrenador",
      en: "Trainer Gear"
    }
  },
  {
    itemType: "campaign",
    names: {
      es: "Campaign",
      en: "Campaign"
    }
  }
];

export function registerPoke5eItemCatalogSettings() {
  game.settings.register(
    MODULE_ID,
    CATALOG_SETTING,
    {
      scope: "world",
      config: false,
      type: String,
      default: ""
    }
  );

  game.settings.register(
    MODULE_ID,
    MOVE_CATALOG_SETTING,
    {
      scope: "world",
      config: false,
      type: String,
      default: ""
    }
  );

  game.settings.register(
    MODULE_ID,
    ABILITY_CATALOG_SETTING,
    {
      scope: "world",
      config: false,
      type: String,
      default: ""
    }
  );

  registerMoveTemplateDropAdapter();
  registerAbilityTemplateDropAdapter();
  registerPokemonHeldItemService();
  registerAdaptedItemSourceUi();
}

async function loadCatalogFile(
  dataPath
) {
  const version =
    game.modules.get(MODULE_ID)?.version ??
    Date.now();

  const response =
    await fetch(
      `${dataPath}?v=${encodeURIComponent(version)}`,
      {
        cache: "no-store"
      }
    );

  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${dataPath}: HTTP ${response.status}.`
    );
  }

  return response.json();
}


async function loadItemCatalog() {
  const [
    poke5eData,
    campaignData
  ] = await Promise.all([
    loadCatalogFile(
      POKE5E_DATA_PATH
    ),

    loadCatalogFile(
      CAMPAIGN_DATA_PATH
    )
  ]);

  const poke5eItems =
    Array.isArray(
      poke5eData?.items
    )
      ? poke5eData.items
      : [];

  const campaignItems =
    Array.isArray(
      campaignData?.items
    )
      ? campaignData.items
      : [];

  const items = [
    ...poke5eItems,
    ...campaignItems
  ];

  const sourceIds =
    items.map(
      item =>
        String(
          item?.id ??
          ""
        ).trim()
    );

  const duplicateSourceIds =
    sourceIds.filter(
      (sourceId, index) =>
        sourceId &&
        sourceIds.indexOf(
          sourceId
        ) !== index
    );

  if (duplicateSourceIds.length) {
    throw new Error(
      `IDs duplicados en el catálogo de Items: ${[
        ...new Set(
          duplicateSourceIds
        )
      ].join(", ")}.`
    );
  }

  return {
    items,

    signature: [
      String(
        poke5eData?.schemaVersion ??
        "unknown"
      ),

      String(
        poke5eData?.generatedAt ??
        "unknown"
      ),

      String(
        campaignData?.schemaVersion ??
        "unknown"
      ),

      String(
        campaignData?.version ??
        "unknown"
      )
    ].join(":")
  };
}

async function loadMoveCatalog() {
  const data =
    await loadCatalogFile(
      MOVES_DATA_PATH
    );

  return {
    moves:
      Array.isArray(
        data?.moves
      )
        ? data.moves
        : [],

    signature: [
      String(
        data?.schemaVersion ??
        "unknown"
      ),

      String(
        data?.generatedAt ??
        "unknown"
      )
    ].join(":")
  };
}


async function ensureMoveCompendium() {
  const existing =
    game.packs.get(
      MOVE_PACK_ID
    );

  if (existing) {
    return existing;
  }

  return foundry.documents.collections
    .CompendiumCollection
    .createCompendium({
      name:
        MOVE_PACK_NAME,

      label:
        MOVE_PACK_LABEL,

      type:
        "Item",

      package:
        "world",

      system:
        "dnd5e"
    });
}

async function loadAbilityCatalog() {
  const data =
    await loadCatalogFile(
      ABILITIES_DATA_PATH
    );

  return {
    abilities:
      Array.isArray(
        data?.items
      )
        ? data.items
        : [],

    signature: [
      String(
        data?.schemaVersion ??
        "unknown"
      ),

      String(
        data?.generatedAt ??
        "unknown"
      )
    ].join(":")
  };
}


async function ensureAbilityCompendium() {
  const existing =
    game.packs.get(
      ABILITY_PACK_ID
    );

  if (existing) {
    return existing;
  }

  return foundry.documents.collections
    .CompendiumCollection
    .createCompendium({
      name:
        ABILITY_PACK_NAME,

      label:
        ABILITY_PACK_LABEL,

      type:
        "Item",

      package:
        "world",

      system:
        "dnd5e"
    });
}

async function ensureItemCompendium() {
  const existing =
    game.packs.get(
      PACK_ID
    );

  if (existing) {
    return existing;
  }

  return foundry.documents.collections
    .CompendiumCollection
    .createCompendium({
      name: PACK_NAME,
      label: PACK_LABEL,
      type: "Item",
      package: "world",
      system: "dnd5e"
    });
}

async function ensureCatalogFolders(
  pack,
  language
) {
  const existingFolders =
    [
      ...pack.folders.values()
    ];

  const byType =
    new Map();

  let changed =
    false;

  for (
    const [
      index,
      definition
    ]
    of CATALOG_FOLDER_DEFINITIONS.entries()
  ) {
    const name =
      definition.names[
        language
      ] ??
      definition.names.en;

    const sort =
      (
        index +
        1
      ) *
      100000;

    const existing =
      existingFolders.find(
        folder =>
          folder.getFlag(
            MODULE_ID,
            "kind"
          ) ===
            "catalog-folder" &&
          folder.getFlag(
            MODULE_ID,
            "itemType"
          ) ===
            definition.itemType
      );

    if (existing) {
      const updateData =
        {};

      if (
        existing.name !==
        name
      ) {
        updateData.name =
          name;
      }

      if (
        existing.sorting !==
        "a"
      ) {
        updateData.sorting =
          "a";
      }

      if (
        existing.sort !==
        sort
      ) {
        updateData.sort =
          sort;
      }

      if (
        Object.keys(
          updateData
        ).length
      ) {
        await existing.update(
          updateData
        );

        changed =
          true;
      }

      byType.set(
        definition.itemType,
        existing.id
      );

      continue;
    }

    const [
      created
    ] =
      await Folder.implementation
        .createDocuments(
          [
            {
              name,
              type: "Item",
              folder: null,
              sorting: "a",
              sort,

              flags: {
                [MODULE_ID]: {
                  kind:
                    "catalog-folder",

                  itemType:
                    definition.itemType
                }
              }
            }
          ],
          {
            pack:
              pack.collection
          }
        );

    if (!created) {
      throw new Error(
        `No se pudo crear la carpeta ${name} en ${PACK_LABEL}.`
      );
    }

    byType.set(
      definition.itemType,
      created.id
    );

    changed =
      true;
  }

  return {
    byType,
    changed
  };
}

async function ensureMoveFolders(
  pack,
  language
) {
  const existingFolders =
    [
      ...pack.folders.values()
    ];

  const byType =
    new Map();

  let changed =
    false;

  for (
    const [
      index,
      moveType
    ]
    of MOVE_TYPES.entries()
  ) {
    const name =
      MOVE_TYPE_LABELS[
        language
      ]?.[moveType] ??
      MOVE_TYPE_LABELS.en[
        moveType
      ] ??
      moveType;

    const sort =
      (
        index +
        1
      ) *
      100000;

    const existing =
      existingFolders.find(
        folder =>
          folder.getFlag(
            MODULE_ID,
            "kind"
          ) ===
            "move-type-folder" &&
          folder.getFlag(
            MODULE_ID,
            "moveType"
          ) ===
            moveType
      );

    if (existing) {
      const updateData =
        {};

      if (
        existing.name !==
        name
      ) {
        updateData.name =
          name;
      }

      if (
        existing.sorting !==
        "a"
      ) {
        updateData.sorting =
          "a";
      }

      if (
        existing.sort !==
        sort
      ) {
        updateData.sort =
          sort;
      }

      if (
        Object.keys(
          updateData
        ).length
      ) {
        await existing.update(
          updateData
        );

        changed =
          true;
      }

      byType.set(
        moveType,
        existing.id
      );

      continue;
    }

    const [
      created
    ] =
      await Folder.implementation
        .createDocuments(
          [
            {
              name,
              type:
                "Item",

              folder:
                null,

              sorting:
                "a",

              sort,

              flags: {
                [MODULE_ID]: {
                  kind:
                    "move-type-folder",

                  moveType
                }
              }
            }
          ],
          {
            pack:
              pack.collection
          }
        );

    if (!created) {
      throw new Error(
        `No se pudo crear la carpeta ${name} en ${MOVE_PACK_LABEL}.`
      );
    }

    byType.set(
      moveType,
      created.id
    );

    changed =
      true;
  }

  return {
    byType,
    changed
  };
}

function currentLanguage() {
  try {
    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
      ? "en"
      : "es";
  } catch {
    return "es";
  }
}

function localized(
  value,
  language,
  fallback = ""
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return String(
      value[language] ??
      value.en ??
      value.es ??
      fallback
    );
  }

  return String(
    fallback ??
    ""
  );
}

function escapeHtml(
  value
) {
  const text =
    String(
      value ??
      ""
    );

  if (
    globalThis.foundry
      ?.utils
      ?.escapeHTML
  ) {
    return foundry.utils
      .escapeHTML(
        text
      );
  }

  return text
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function paragraphsToHtml(
  value
) {
  const text =
    String(
      value ??
      ""
    ).trim();

  if (!text) {
    return "";
  }

  return text
    .split(
      /\n{2,}/
    )
    .map(
      paragraph =>
        `<p>${
          escapeHtml(
            paragraph
          ).replace(
            /\n/g,
            "<br>"
          )
        }</p>`
    )
    .join("");
}

function buildItemDescription(
  item,
  language
) {
  const description =
    localized(
      item.description,
      language,
      ""
    ).trim();

  return description
    ? paragraphsToHtml(
        description
      )
    : (
        language === "en"
          ? "<p><em>No Poke5e description available.</em></p>"
          : "<p><em>Sin descripción Poke5e disponible.</em></p>"
      );
}

function resolveItemImage(
  item
) {
  const sprite =
    item.media?.sprite;

  if (!sprite) {
    return null;
  }

  const relativePath =
    String(
      sprite
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      );

  return (
    `modules/${MODULE_ID}/${relativePath}`
  );
}

function resolveFoundryItemType(
  item
) {
  const explicitType =
    String(
      item.foundryType ??
      ""
    ).trim();

  if (explicitType) {
    return explicitType;
  }

  return (
    FOUNDRY_ITEM_TYPES[
      item.type
    ] ??
    "loot"
  );
}

function buildContainerSystem(
  item
) {
  const container =
    item.container;

  if (!container) {
    return {};
  }

  const capacityWeight =
    Number(
      container.capacityWeight
    );

  const weight =
    Number(
      container.weight
    );

  const units =
    String(
      container.units ??
      "lb"
    );

  return {
    capacity: {
      weight: {
        value:
          Number.isFinite(
            capacityWeight
          )
            ? Math.max(
                0,
                capacityWeight
              )
            : 0,

        units
      }
    },

    weight: {
      value:
        Number.isFinite(
          weight
        )
          ? Math.max(
              0,
              weight
            )
          : 0,

      units
    }
  };
}

function catalogItemRolls(
  item
) {

  if (
    !Array.isArray(
      item?.rolls
    )
  ) {

    return [];
  }


  return item.rolls
    .map(
      roll => {

        const id =
          String(
            roll?.id ??
            ""
          ).trim();


        const formula =
          String(
            roll?.formula ??
            ""
          ).trim();


        if (
          !id ||
          !formula
        ) {

          return null;
        }


        return {
          id,

          kind:
            String(
              roll?.kind ??
              "utility"
            ),

          formula,

          label:
            foundry.utils.deepClone(
              roll?.label ??
              {
                en:
                  id,

                es:
                  id
              }
            )
        };
      }
    )
    .filter(Boolean);
}

function buildItemSource(
  item,
  language,
  folderId
) {
  const sourceId =
    String(
      item.id ??
      ""
    ).trim();

  if (!sourceId) {
    throw new Error(
      "Item Poke5e sin ID canónico."
    );
  }

  const source = {
    name:
      localized(
        item.name,
        language,
        sourceId
      ),

    type:
      resolveFoundryItemType(
        item
      ),

    folder:
      folderId ??
      null,

    system: {
      ...(heldItemConfiguration(sourceId, language, item.type) ?? {}),
      ...(item.rulesOrigin?.kind === "homebrew-adaptation" ? {
        source: { custom: adaptedItemSource(language) }
      } : {}),

      description: {
        value:
          buildItemDescription(
            item,
            language
          ),

        chat: ""
      },

      ...(
        item.cost == null
          ? {}
          : {
              price: {
                value:
                  Number(
                    item.cost
                  ),

                denomination:
                  "gp"
              }
            }
      ),

      ...(
        resolveFoundryItemType(
          item
        ) === "container"
          ? buildContainerSystem(
              item
            )
          : {}
      )
    },

    flags: {
      [MODULE_ID]: {
        kind:
          "catalog-item",

        sourceId,

        rawSourceId:
          String(
            item.sourceId ??
            sourceId
          ),

        itemType:
          item.type ??
          null,

        sourceType:
          item.sourceType ??
          null,

        cost:
          item.cost ??
          null,

        beta:
          Boolean(
            item.beta
          ),

        referenceEffect:
          item.referenceEffect ??
          null,

        ...(item.rulesOrigin ? {
          rulesOrigin: foundry.utils.deepClone(item.rulesOrigin)
        } : {}),

        rolls:
          catalogItemRolls(
            item
          ),

        catalog:
          item.catalog ??
          "poke5e"
      }
    }
  };

  const image =
    resolveItemImage(
      item
    );

  if (image) {
    source.img =
      image;
  }

  return source;
}

export function buildPoke5eCatalogItem(
  item,
  language = "es"
) {

  const source =
    buildItemSource(
      item,

      language ===
        "en"
        ? "en"
        : "es",

      null
    );


  /*
   * El Encounter Planner crea un Item
   * embebido en un Actor, no un documento
   * dentro del Compendium.
   */
  Reflect.deleteProperty(
    source,
    "folder"
  );


  return source;
}

function missingCatalogDescriptionUpdates(items, definitions, language) {
  const updates = [];
  for (const item of items ?? []) {
    if (item.getFlag(MODULE_ID, "kind") !== "catalog-item") {
      continue;
    }
    const definition = definitions.get(item.getFlag(MODULE_ID, "sourceId"));
    if (!definition) {
      continue;
    }
    const current = item.system?.description?.value ?? "";
    if (typeof current !== "string") {
      continue;
    }
    const body = stripAdaptedItemNotice(current);
    const text = body.replace(/<[^>]*>/g, "").trim();
    const empty = !text || ["Sin descripción Poke5e disponible.", "No Poke5e description available."].includes(text);
    const previous = definition.rulesOrigin.previousDescriptionHashes?.includes(itemDescriptionFingerprint(body));
    const generated = ["en", "es"].some(locale => body === buildItemDescription(definition, locale));
    const nextDescription = empty || previous || generated ? buildItemDescription(definition, language) : body;
    const update = { _id: item.id };
    if (nextDescription !== current) {
      update["system.description.value"] = nextDescription;
    }
    const currentSource = item.system?.source?.custom ?? "";
    const nextSource = adaptedItemSource(language);
    if (currentSource !== nextSource && ["", adaptedItemSource("en"), adaptedItemSource("es")].includes(currentSource)) {
      update["system.source.custom"] = nextSource;
    }
    const storedOrigin = item.getFlag(MODULE_ID, "rulesOrigin");
    if (storedOrigin && storedOrigin.automation !== definition.rulesOrigin.automation) {
      update[`flags.${MODULE_ID}.rulesOrigin`] = foundry.utils.deepClone(definition.rulesOrigin);
    }
    if (Object.keys(update).length > 1) {
      update[`flags.${MODULE_ID}.rulesOrigin`] = foundry.utils.deepClone(definition.rulesOrigin);
      update[`flags.${MODULE_ID}.referenceEffect`] = definition.referenceEffect;
      updates.push(update);
    }
  }
  return updates;
}

export async function synchronizeMissingCatalogDescriptions(catalogItems, language = "es") {
  if (!game.user.isGM) {
    return 0;
  }
  const definitions = new Map(catalogItems
    .filter(item => item.rulesOrigin?.kind === "homebrew-adaptation")
    .map(item => [item.id, item]));
  const actors = new Set(game.actors ?? []);
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (!token.actorLink && token.actor) {
        actors.add(token.actor);
      }
    }
  }
  let updated = 0;
  for (const actor of actors) {
    const updates = missingCatalogDescriptionUpdates(actor.items, definitions, language);
    if (updates.length) {
      await actor.updateEmbeddedDocuments("Item", updates);
      updated += updates.length;
    }
  }
  const updates = missingCatalogDescriptionUpdates(game.items, definitions, language);
  if (updates.length) {
    await Item.implementation.updateDocuments(updates);
    updated += updates.length;
  }
  return updated;
}

function sameCatalogRolls(
  left,
  right
) {

  return JSON.stringify(
    left ??
    []
  ) ===
    JSON.stringify(
      right ??
      []
    );
}


async function synchronizeEmbeddedCatalogItemRolls(
  catalogItems
) {

  const rollsBySourceId =
    new Map(
      (
        Array.isArray(
          catalogItems
        )
          ? catalogItems
          : []
      )
        .filter(
          item =>
            item?.id
        )
        .map(
          item => [
            String(
              item.id
            ),

            catalogItemRolls(
              item
            )
          ]
        )
    );


  let updated =
    0;


  for (
    const actor
    of game.actors
  ) {

    const updates =
      [];


    for (
      const item
      of actor.items
    ) {

      if (
        item.getFlag(
          MODULE_ID,
          "kind"
        ) !==
          "catalog-item"
      ) {

        continue;
      }


      const sourceId =
        String(
          item.getFlag(
            MODULE_ID,
            "sourceId"
          ) ??
          ""
        );


      if (
        !rollsBySourceId.has(
          sourceId
        )
      ) {

        continue;
      }


      const nextRolls =
        rollsBySourceId.get(
          sourceId
        );


      const currentRolls =
        item.getFlag(
          MODULE_ID,
          "rolls"
        );


      /*
       * No escribimos [] sobre todos los Items
       * antiguos si nunca tuvieron metadata de rolls.
       */

      if (
        !nextRolls.length &&
        !Array.isArray(
          currentRolls
        )
      ) {

        continue;
      }


      if (
        sameCatalogRolls(
          currentRolls,
          nextRolls
        )
      ) {

        continue;
      }


      updates.push({
        _id:
          item.id,

        [`flags.${MODULE_ID}.rolls`]:
          foundry.utils.deepClone(
            nextRolls
          )
      });
    }


    if (
      !updates.length
    ) {

      continue;
    }


    const documents =
      await actor.updateEmbeddedDocuments(
        "Item",
        updates
      );


    updated +=
      documents.length;
  }


  return updated;
}

function getModuleScope(
  document
) {
  return (
    document?._source
      ?.flags
      ?.[MODULE_ID] ??
    document?.flags
      ?.[MODULE_ID] ??
    {}
  );
}


function isPokemonActor(
  actor
) {
  return (
    actor?.documentName ===
      "Actor" &&
    actor.getFlag(
      MODULE_ID,
      "kind"
    ) === "pokemon"
  );
}


function pokemonMoveBuildContext(
  actor
) {
  const types =
    actor.getFlag(
      MODULE_ID,
      "types"
    );

  const normalizedTypes =
    Array.isArray(
      types
    )
      ? types
          .map(
            type =>
              String(
                type ?? ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];

  const attributes =
    Object.fromEntries(
      MOVE_CONTEXT_ABILITY_IDS.map(
        abilityId => [
          abilityId,

          Number(
            actor.system
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
        actor.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
        actor.id
      ),

    types:
      normalizedTypes,

    primaryType:
      String(
        actor.getFlag(
          MODULE_ID,
          "primaryType"
        ) ??
        normalizedTypes[0] ??
        "normal"
      )
        .trim()
        .toLowerCase(),

    combat: {
      attributes
    }
  };
}


function pokemonMoveBuildLevel(
  actor
) {
  const level =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      )
    );

  if (
    !Number.isFinite(
      level
    )
  ) {
    return 1;
  }

  return Math.min(
    20,
    Math.max(
      1,
      Math.trunc(
        level
      )
    )
  );
}


function actorHasMove(
  actor,
  sourceId
) {
  const targetId =
    String(
      sourceId ??
      ""
    );

  if (!targetId) {
    return false;
  }

  return actor.items.some(
    existing =>
      existing.getFlag(
        MODULE_ID,
        "kind"
      ) === "move" &&
      String(
        existing.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
        ""
      ) === targetId
  );
}

function buildCanonicalMoveSource(
  item,
  source
) {
  const existingActivities =
    item?._source
      ?.system
      ?.activities ??
    {};

  const canonicalActivities =
    source?.system
      ?.activities ??
    {};

  const canonicalActivityIds =
    new Set(
      Object.keys(
        canonicalActivities
      )
    );

  const activities = {
    ...canonicalActivities
  };

  /*
   * Un Move arrastrado desde el Compendium
   * puede llegar a preCreateItem con una
   * Activity creada por D&D5e para el
   * weapon-template.
   *
   * El Builder Poke5e es la fuente de verdad
   * del conjunto final de Activities.
   *
   * Eliminamos cualquier Activity previa que
   * no forme parte del source canónico.
   */
  for (
    const activityId
    of Object.keys(
      existingActivities
    )
  ) {
    if (
      canonicalActivityIds.has(
        activityId
      )
    ) {
      continue;
    }

    activities[
      `-=${activityId}`
    ] = null;
  }

  return {
    ...source,

    system: {
      ...source.system,

      activities
    }
  };
}

function adaptMoveTemplateToPokemon(
  item
) {
  const scope =
    getModuleScope(
      item
    );

  if (
    scope.kind !==
    "move-template"
  ) {
    return;
  }

  const actor =
    item.parent;

  /*
   * Al crear el propio Compendium también
   * existe un preCreateItem.
   */
  if (!actor) {
    return;
  }

  if (
    !isPokemonActor(
      actor
    )
  ) {
    ui.notifications.warn(
      "Los Moves Poke5e solo pueden añadirse a un Pokémon."
    );

    return false;
  }

  const move =
    scope.moveDefinition;

  if (!move?.id) {
    console.error(
      `[${MODULE_ID}] Move Template sin definición canónica.`,
      {
        item:
          item.name,

        sourceId:
          scope.sourceId ??
          null
      }
    );

    ui.notifications.error(
      "El Move seleccionado no contiene una definición Poke5e válida."
    );

    return false;
  }

  if (
    actorHasMove(
      actor,
      move.id
    )
  ) {
    ui.notifications.warn(
      `${actor.name} ya conoce ${item.name}.`
    );

    return false;
  }

  try {
    const source =
      buildMoveItem(
        move,
        pokemonMoveBuildContext(
          actor
        ),
        pokemonMoveBuildLevel(
          actor
        ),
        currentLanguage()
      );

    const canonicalSource =
      buildCanonicalMoveSource(
        item,
        source
      );

    item.updateSource(
      canonicalSource
    );
  } catch (error) {
    console.error(
      `[${MODULE_ID}] No se pudo adaptar ${move.id} a ${actor.name}.`,
      error
    );

    ui.notifications.error(
      `No se pudo añadir ${item.name} a ${actor.name}.`
    );

    return false;
  }
}


function registerMoveTemplateDropAdapter() {
  if (
    moveTemplateDropAdapterRegistered
  ) {
    return;
  }

  moveTemplateDropAdapterRegistered =
    true;

  Hooks.on(
    "preCreateItem",
    adaptMoveTemplateToPokemon
  );
}

function actorHasAbility(
  actor,
  sourceId
) {
  const targetId =
    String(
      sourceId ??
      ""
    );

  if (!targetId) {
    return false;
  }

  return actor.items.some(
    existing =>
      existing.getFlag(
        MODULE_ID,
        "kind"
      ) === "ability" &&
      String(
        existing.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
        ""
      ) === targetId
  );
}


function isHiddenAbilityForActor(
  actor,
  sourceId
) {
  const targetId =
    String(
      sourceId ??
      ""
    );

  const hiddenAbilities =
    actor.getFlag(
      MODULE_ID,
      "hiddenAbilities"
    );

  if (
    !targetId ||
    !Array.isArray(
      hiddenAbilities
    )
  ) {
    return false;
  }

  return hiddenAbilities.some(
    entry =>
      String(
        typeof entry ===
          "string"
          ? entry
          : entry?.id ??
            ""
      ) === targetId
  );
}


function adaptAbilityTemplateToPokemon(
  item
) {
  const scope =
    getModuleScope(
      item
    );

  if (
    scope.kind !==
    "ability-template"
  ) {
    return;
  }

  const actor =
    item.parent;

  if (!actor) {
    return;
  }

  if (
    !isPokemonActor(
      actor
    )
  ) {
    ui.notifications.warn(
      "Las Abilities Poke5e solo pueden añadirse a un Pokémon."
    );

    return false;
  }

  const ability =
    scope.abilityDefinition;

  if (!ability?.id) {
    console.error(
      `[${MODULE_ID}] Ability Template sin definición canónica.`,
      {
        item:
          item.name,

        sourceId:
          scope.sourceId ??
          null
      }
    );

    ui.notifications.error(
      "La Ability seleccionada no contiene una definición Poke5e válida."
    );

    return false;
  }

  if (
    actorHasAbility(
      actor,
      ability.id
    )
  ) {
    ui.notifications.warn(
      `${actor.name} ya tiene ${item.name}.`
    );

    return false;
  }

  try {
    const source =
      buildAbilityItem(
        ability,
        currentLanguage(),
        {
          hiddenAbility:
            isHiddenAbilityForActor(
              actor,
              ability.id
            )
        }
      );

    item.updateSource(
      source
    );
  } catch (error) {
    console.error(
      `[${MODULE_ID}] No se pudo adaptar ${ability.id} a ${actor.name}.`,
      error
    );

    ui.notifications.error(
      `No se pudo añadir ${item.name} a ${actor.name}.`
    );

    return false;
  }
}


async function activateCreatedAbility(
  item
) {
  if (
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !== "ability" ||
    item.getFlag(
      MODULE_ID,
      "catalog"
    ) !== "abilities"
  ) {
    return;
  }

  const actor =
    item.parent;

  if (
    !isPokemonActor(
      actor
    )
  ) {
    return;
  }

  const sourceId =
    String(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    );

  if (!sourceId) {
    return;
  }

  const updateData = {
    [`flags.${MODULE_ID}.activeAbilityId`]:
      sourceId
  };

  if (
    item.getFlag(
      MODULE_ID,
      "hiddenAbility"
    ) === true
  ) {
    const granted =
      actor.getFlag(
        MODULE_ID,
        "grantedHiddenAbilities"
      );

    updateData[
      `flags.${MODULE_ID}.grantedHiddenAbilities`
    ] = [
      ...new Set([
        ...(
          Array.isArray(
            granted
          )
            ? granted.map(String)
            : []
        ),
        sourceId
      ])
    ];
  }

  try {
    await actor.update(
      updateData
    );
  } catch (error) {
    console.error(
      `[${MODULE_ID}] No se pudo activar ${sourceId} en ${actor.name}.`,
      error
    );
  }
}


async function clearDeletedAbilityState(
  item
) {

  if (
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !== "ability"
  ) {

    return;
  }


  const actor =
    item.parent;


  if (
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  const sourceId =
    String(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    );


  if (!sourceId) {

    return;
  }


  const updateData =
    {};


  const activeAbilityId =
    String(
      actor.getFlag(
        MODULE_ID,
        "activeAbilityId"
      ) ??
      ""
    );


  if (
    activeAbilityId ===
    sourceId
  ) {

    updateData[
      `flags.${MODULE_ID}.activeAbilityId`
    ] = null;
  }


  const grantedHiddenAbilities =
    actor.getFlag(
      MODULE_ID,
      "grantedHiddenAbilities"
    );


  if (
    Array.isArray(
      grantedHiddenAbilities
    )
  ) {

    const nextGrantedHiddenAbilities =
      grantedHiddenAbilities
        .map(String)
        .filter(
          abilityId =>
            abilityId !==
            sourceId
        );


    if (
      nextGrantedHiddenAbilities.length !==
      grantedHiddenAbilities.length
    ) {

      updateData[
        `flags.${MODULE_ID}.grantedHiddenAbilities`
      ] =
        nextGrantedHiddenAbilities;
    }
  }


  if (
    !Object.keys(
      updateData
    ).length
  ) {

    return;
  }


  try {

    await actor.update(
      updateData
    );

  } catch (error) {

    console.error(
      `[${MODULE_ID}] No se pudo limpiar el estado de ${sourceId} en ${actor.name}.`,
      error
    );
  }
}


function registerAbilityTemplateDropAdapter() {
  if (abilityTemplateDropAdapterRegistered) {
    return;
  }

  abilityTemplateDropAdapterRegistered = true;

  Hooks.on(
    "preCreateItem",
    adaptAbilityTemplateToPokemon
  );

  Hooks.on(
    "createItem",
    (...hookArguments) => {
      const [item, , userId] = hookArguments;

      if (
        userId !== game.user.id ||
        !item?.parent?.isOwner
      ) {
        return;
      }

      void activateCreatedAbility(item);
    }
  );

  Hooks.on(
    "deleteItem",
    (...hookArguments) => {
      const [item, , userId] = hookArguments;

      if (
        userId !== game.user.id ||
        !item?.parent?.isOwner
      ) {
        return;
      }

      void clearDeletedAbilityState(item);
    }
  );
}

function managedIndexEntries(
  index
) {
  return [
    ...index.values()
  ].filter(
    entry =>
      entry?.flags
        ?.[MODULE_ID]
        ?.kind ===
      "catalog-item"
  );
}

function managedMoveIndexEntries(
  index
) {
  return [
    ...index.values()
  ].filter(
    entry =>
      entry?.flags
        ?.[MODULE_ID]
        ?.kind ===
      "move-template"
  );
}

function managedAbilityIndexEntries(
  index
) {
  return [
    ...index.values()
  ].filter(
    entry =>
      entry?.flags
        ?.[MODULE_ID]
        ?.kind ===
      "ability-template"
  );
}

function getIndexSourceId(
  entry
) {
  const value =
    entry?.flags
      ?.[MODULE_ID]
      ?.sourceId;

  return value
    ? String(
        value
      )
    : null;
}

export async function syncPoke5eAbilityCompendium({
  force = false,
  notify = false
} = {}) {
  if (!game.user.isGM) {
    return {
      status: "ignored",
      created: 0,
      updated: 0
    };
  }

  const catalog =
    await loadAbilityCatalog();

  const language =
    currentLanguage();

  const effectiveSignature =
    `${ABILITY_CATALOG_VERSION}:${catalog.signature}:${language}`;

  const pack =
    await ensureAbilityCompendium();

  if (pack.locked) {
    await pack.configure({
      locked: false
    });
  }

  const index =
    await pack.getIndex({
      fields: [
        `flags.${MODULE_ID}.kind`,
        `flags.${MODULE_ID}.sourceId`
      ]
    });

  const managedEntries =
    managedAbilityIndexEntries(
      index
    );

  const storedSignature =
    game.settings.get(
      MODULE_ID,
      ABILITY_CATALOG_SETTING
    );

  if (
    !force &&
    storedSignature ===
      effectiveSignature &&
    managedEntries.length ===
      catalog.abilities.length
  ) {
    return {
      status:
        "current",

      created:
        0,

      updated:
        0,

      pack
    };
  }

  const existingBySourceId =
    new Map(
      managedEntries
        .map(
          entry => [
            getIndexSourceId(
              entry
            ),
            entry
          ]
        )
        .filter(
          ([sourceId]) =>
            Boolean(
              sourceId
            )
        )
    );

  const creates = [];
  const updates = [];

  for (
    const ability
    of catalog.abilities
  ) {
    const source =
      buildAbilityCatalogItem(
        ability,
        language
      );

    const sourceId =
      source.flags[
        MODULE_ID
      ].sourceId;

    const existing =
      existingBySourceId.get(
        sourceId
      );

    if (existing) {
      updates.push({
        _id:
          existing._id,

        ...source
      });

      continue;
    }

    creates.push(
      source
    );
  }

  if (updates.length) {
    await Item.implementation
      .updateDocuments(
        updates,
        {
          pack:
            pack.collection
        }
      );
  }

  if (creates.length) {
    await Item.implementation
      .createDocuments(
        creates,
        {
          pack:
            pack.collection
        }
      );
  }

  await game.settings.set(
    MODULE_ID,
    ABILITY_CATALOG_SETTING,
    effectiveSignature
  );

  if (
    notify &&
    (
      creates.length ||
      updates.length
    )
  ) {
    ui.notifications.info(
      `Poke5e Abilities: ${creates.length} creado(s) · ${updates.length} actualizado(s).`
    );
  }

  return {
    status: "synced",
    created:
      creates.length,

    updated:
      updates.length,

    pack
  };
}

export async function syncPoke5eMoveCompendium({
  force = false,
  notify = false
} = {}) {
  if (!game.user.isGM) {
    return {
      status: "ignored",
      created: 0,
      updated: 0
    };
  }

  const catalog =
    await loadMoveCatalog();

  const language =
    currentLanguage();

  // Las copias del mundo necesitan reparación incluso si el catálogo está al día.
  await repairPoke5eMoveDescriptions(catalog.moves, language);

  const effectiveSignature =
    `${MOVE_CATALOG_VERSION}:${catalog.signature}:${language}`;

  const pack =
    await ensureMoveCompendium();

  if (pack.locked) {
    await pack.configure({
      locked: false
    });
  }

  const folderState =
    await ensureMoveFolders(
      pack,
      language
    );

  const index =
    await pack.getIndex({
      fields: [
        "type",
        `flags.${MODULE_ID}.kind`,
        `flags.${MODULE_ID}.sourceId`
      ]
    });

  const managedEntries =
    managedMoveIndexEntries(
      index
    );

  const storedSignature =
    game.settings.get(
      MODULE_ID,
      MOVE_CATALOG_SETTING
    );

  if (
    !force &&
    !folderState.changed &&
    storedSignature ===
      effectiveSignature &&
    managedEntries.length ===
      catalog.moves.length
  ) {
    return {
      status: "current",
      created: 0,
      updated: 0,
      pack
    };
  }

  const existingBySourceId =
    new Map(
      managedEntries
        .map(
          entry => [
            getIndexSourceId(
              entry
            ),
            entry
          ]
        )
        .filter(
          ([sourceId]) =>
            Boolean(
              sourceId
            )
        )
    );

  const creates = [];
  const updates = [];

  for (
    const move
    of catalog.moves
  ) {
    const moveType =
      String(
        move.type ??
        "typeless"
      )
        .trim()
        .toLowerCase();

    const source =
      buildMoveCatalogItem(
        move,
        language
      );

    source.folder =
      folderState.byType.get(
        moveType
      ) ??
      null;

    const sourceId =
      source.flags[
        MODULE_ID
      ].sourceId;

    const existing =
      existingBySourceId.get(
        sourceId
      );

    if (existing) {
      updates.push({
        _id:
          existing._id,

        ...source
      });

      continue;
    }

    creates.push(
      source
    );
  }

  if (updates.length) {
    await Item.implementation
      .updateDocuments(
        updates,
        {
          pack:
            pack.collection
        }
      );
  }

  if (creates.length) {
    await Item.implementation
      .createDocuments(
        creates,
        {
          pack:
            pack.collection
        }
      );
  }

  await game.settings.set(
    MODULE_ID,
    MOVE_CATALOG_SETTING,
    effectiveSignature
  );

  if (
    notify &&
    (
      creates.length ||
      updates.length
    )
  ) {
    ui.notifications.info(
      `Poke5e Moves: ${creates.length} creado(s) · ${updates.length} actualizado(s).`
    );
  }

  return {
    status: "synced",
    created:
      creates.length,

    updated:
      updates.length,

    pack
  };
}

export async function syncPoke5eItemCompendium({
  force = false,
  notify = false
} = {}) {
  if (!game.user.isGM) {
    return {
      status: "ignored",
      created: 0,
      updated: 0
    };
  }

  await syncPoke5eMoveCompendium({
    force,
    notify
  });

  await syncPoke5eAbilityCompendium({
    force,
    notify
  });

  const catalog =
    await loadItemCatalog();

  const embeddedRollsUpdated =
    await synchronizeEmbeddedCatalogItemRolls(
      catalog.items
    );

  const language =
    currentLanguage();

  const descriptionsUpdated = await synchronizeMissingCatalogDescriptions(catalog.items, language);

  const effectiveSignature =
    `${ITEM_CATALOG_VERSION}:${catalog.signature}:${language}`;

  const pack =
    await ensureItemCompendium();

  if (pack.locked) {
    await pack.configure({
      locked: false
    });
  }

  const folderState =
    await ensureCatalogFolders(
      pack,
      language
    );

  const index =
    await pack.getIndex({
      fields: [
        `flags.${MODULE_ID}.kind`,
        `flags.${MODULE_ID}.sourceId`
      ]
    });

  const managedEntries =
    managedIndexEntries(
      index
    );

  const storedSignature =
    game.settings.get(
      MODULE_ID,
      CATALOG_SETTING
    );

  if (
    !force &&
    !folderState.changed &&
    storedSignature ===
      effectiveSignature &&
    managedEntries.length ===
      catalog.items.length
  ) {
    return {
      status: "current",
      created: 0,
      updated: 0,
      embeddedRollsUpdated,
      descriptionsUpdated,
      pack
    };
  }

  const existingBySourceId =
    new Map(
      managedEntries
        .map(
          entry => [
            getIndexSourceId(
              entry
            ),

            entry
          ]
        )
        .filter(
          ([sourceId]) =>
            Boolean(
              sourceId
            )
        )
    );

  const creates = [];
  const updates = [];

  for (
    const item
    of catalog.items
  ) {
    const folderId =
      folderState.byType.get(
        item.type
      ) ??
      null;

    const source =
      buildItemSource(
        item,
        language,
        folderId
      );

    const sourceId =
      source.flags[
        MODULE_ID
      ].sourceId;

    const existing =
      existingBySourceId.get(
        sourceId
      );

    if (existing) {

      const existingType =
        String(
          existing.type ??
          ""
        );


      const sourceType =
        String(
          source.type ??
          ""
        );


      if (
        existingType &&
        sourceType &&
        existingType !==
          sourceType
      ) {

        const {
          system,
          ...sourceWithoutSystem
        } =
          source;


        updates.push({
          _id:
            existing._id,

          ...sourceWithoutSystem,

          /*
          * Foundry v13:
          *
          * cambiar Document.type requiere reemplazar
          * explícitamente el TypeDataModel de system.
          */
          "==system":
            system
        });


        continue;
      }


      updates.push({
        _id:
          existing._id,

        ...source
      });


      continue;
    }

    creates.push(
      source
    );
  }

  if (updates.length) {
    await Item.implementation
      .updateDocuments(
        updates,
        {
          pack:
            pack.collection
        }
      );
  }

  if (creates.length) {
    await Item.implementation
      .createDocuments(
        creates,
        {
          pack:
            pack.collection
        }
      );
  }

  await game.settings.set(
    MODULE_ID,
    CATALOG_SETTING,
    effectiveSignature
  );

  if (
    notify &&
    (
      creates.length ||
      updates.length
    )
  ) {
    ui.notifications.info(
      `Poke5e Items: ${creates.length} creado(s) · ${updates.length} actualizado(s).`
    );
  }

  return {
    status: "synced",
    created: creates.length,
    updated: updates.length,
    embeddedRollsUpdated,
    descriptionsUpdated,
    pack
  };
}
