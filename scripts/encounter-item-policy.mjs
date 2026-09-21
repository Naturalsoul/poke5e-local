export const ENCOUNTER_ITEM_CATEGORIES =
  Object.freeze([
    "berry",
    "medicine",
    "pokeball",
    "held-item"
  ]);


const DEFAULT_POLICIES =
  Object.freeze({

    wild: Object.freeze({

      enabled:
        true,

      chancePercent:
        20,

      categoryWeights:
        Object.freeze({

          berry:
            5,

          medicine:
            3,

          pokeball:
            3,

          "held-item":
            1
        })
    }),


    trainer: Object.freeze({

      enabled:
        true,

      chancePercent:
        35,

      categoryWeights:
        Object.freeze({

          berry:
            2,

          medicine:
            1,

          pokeball:
            0,

          "held-item":
            5
        })
    })
  });


const ITEM_WEIGHTS =
  Object.freeze({

    pokeball:
      Object.freeze({

        "poke-ball":
          10,

        "great-ball":
          5,

        "ultra-ball":
          1
      }),


    medicine:
      Object.freeze({

        potion:
          10,

        "super-potion":
          5,

        "hyper-potion":
          1,

        antidote:
          4,

        "burn-heal":
          4,

        "ice-heal":
          4,

        awakening:
          4,

        "paralyze-heal":
          4
      }),


    "held-item":
      Object.freeze({

        "black-belt":
          1,

        "black-glasses":
          1,

        charcoal:
          1,

        "dragon-fang":
          1,

        "fairy-feather":
          1,

        "hard-stone":
          1,

        magnet:
          1,

        "miracle-seed":
          1,

        "mystic-water":
          1,

        "never-melt-ice":
          1,

        "poison-barb":
          1,

        "sharp-beak":
          1,

        "silk-scarf":
          1,

        "silver-powder":
          1,

        "soft-sand":
          1,

        "spell-tag":
          1,

        "twisted-spoon":
          1
      })
  });


export function getDefaultEncounterItemPolicy(
  encounterType = "wild"
) {

  const source =
    encounterType ===
      "trainer"

      ? DEFAULT_POLICIES
          .trainer

      : DEFAULT_POLICIES
          .wild;


  return {

    enabled:
      source.enabled,

    chancePercent:
      source.chancePercent,

    categoryWeights: {
      ...source.categoryWeights
    }
  };
}


export function getEncounterItemCategory(
  item
) {

  const category =
    String(
      item?.type ??
      ""
    )
      .trim()
      .toLowerCase();


  return ENCOUNTER_ITEM_CATEGORIES.includes(
    category
  )

    ? category

    : null;
}


export function isEncounterItemEligible(
  item
) {

  const category =
    getEncounterItemCategory(
      item
    );


  if (
    !category ||
    item?.beta === true
  ) {

    return false;
  }


  /*
   * Todas las Bayas normalizadas no-beta
   * son válidas para el pool V1.
   */
  if (
    category ===
      "berry"
  ) {

    return Boolean(
      normalizeItemId(
        item?.id
      )
    );
  }


  /*
   * Medicine, Poké Ball y Held Item
   * usan whitelist explícita.
   */
  return getEncounterItemWeight(
    item
  ) > 0;
}


export function getEncounterItemWeight(
  item
) {

  const category =
    getEncounterItemCategory(
      item
    );


  if (!category) {

    return 0;
  }


  if (
    category ===
      "berry"
  ) {

    return normalizeItemId(
      item?.id
    )

      ? 1

      : 0;
  }


  const itemId =
    normalizeItemId(
      item?.id
    );


  return Math.max(
    0,

    Number(
      ITEM_WEIGHTS[
        category
      ]?.[
        itemId
      ] ??
      0
    ) ||
    0
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