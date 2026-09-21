import {
  ENCOUNTER_ITEM_CATEGORIES,
  getEncounterItemCategory,
  getEncounterItemWeight,
  isEncounterItemEligible
} from "./encounter-item-policy.mjs";


export function selectEncounterItem({
  items,
  enabled = true,
  chancePercent = 20,
  categoryWeights = {},
  currentItemId = null,
  random = Math.random
}) {

  if (!enabled) {

    return null;
  }


  const chance =
    normalizePercentage(
      chancePercent
    );


  if (
    chance <= 0 ||
    randomUnit(
      random
    ) *
      100 >=
      chance
  ) {

    return null;
  }


  const eligible =
    (
      Array.isArray(
        items
      )

        ? items

        : []
    ).filter(
      isEncounterItemEligible
    );


  if (!eligible.length) {

    return null;
  }


  const currentId =
    normalizeItemId(
      currentItemId
    );


  /*
   * Durante un reroll intentamos no devolver
   * inmediatamente el mismo objeto si existen
   * otras opciones válidas.
   */
  const candidates =
    currentId &&
    eligible.length > 1

      ? eligible.filter(
          item =>
            normalizeItemId(
              item?.id
            ) !==
              currentId
        )

      : eligible;


  const categoryEntries =
    ENCOUNTER_ITEM_CATEGORIES
      .map(
        category => ({

          category,

          weight:
            normalizeWeight(
              categoryWeights[
                category
              ]
            ),

          items:
            candidates.filter(
              item =>
                getEncounterItemCategory(
                  item
                ) ===
                  category
            )
        })
      )
      .filter(
        entry =>
          entry.weight > 0 &&
          entry.items.length > 0
      );


  const selectedCategory =
    weightedChoice(
      categoryEntries,

      entry =>
        entry.weight,

      random
    );


  if (!selectedCategory) {

    return null;
  }


  return weightedChoice(
    selectedCategory.items,
    getEncounterItemWeight,
    random
  );
}


function weightedChoice(
  values,
  weightFor,
  random
) {

  const weighted =
    values
      .map(
        value => ({

          value,

          weight:
            normalizeWeight(
              weightFor(
                value
              )
            )
        })
      )
      .filter(
        entry =>
          entry.weight > 0
      );


  const total =
    weighted.reduce(
      (
        sum,
        entry
      ) =>
        sum +
        entry.weight,
      0
    );


  if (
    !weighted.length ||
    total <= 0
  ) {

    return null;
  }


  let threshold =
    randomUnit(
      random
    ) *
    total;


  for (
    const entry
    of weighted
  ) {

    threshold -=
      entry.weight;


    if (
      threshold < 0
    ) {

      return entry.value;
    }
  }


  return weighted[
    weighted.length -
    1
  ].value;
}


function randomUnit(
  random
) {

  const value =
    Number(
      random()
    );


  if (
    !Number.isFinite(
      value
    )
  ) {

    return 0;
  }


  return Math.min(
    0.999999999999,

    Math.max(
      0,
      value
    )
  );
}


function normalizePercentage(
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