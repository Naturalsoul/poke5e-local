export function applyFakemonWizardRecommendation({
  baseDraft,
  wizardResult
}) {

  const draft =
    clonePlainObject(
      baseDraft
    );


  const concept =
    wizardResult?.concept ??
    {};


  const result =
    wizardResult
      ?.recommendation
      ?.recommendation;


  const intent =
    wizardResult
      ?.recommendation
      ?.intent;


  if (
    !result ||
    !intent
  ) {

    throw new Error(
      "La recomendación del Fakemon Wizard está incompleta."
    );
  }


  if (
    concept.name
  ) {

    draft.name =
      String(
        concept.name
      ).trim();
  }


  draft.types = [
    ...intent.types
  ];


  draft.primaryType =
    intent.types[0];


  draft.sr =
    result.sr.value;


  draft.minimumLevel =
    result.minimumLevel.value;


  draft.combat ??=
    {};


  draft.combat.ac =
    result.combat.ac.value;


  draft.combat.hp =
    result.combat.hp.value;


  draft.combat.hitDie =
    result.combat.hitDie;


  draft.combat.attributes =
    Object.fromEntries(
      Object.entries(
        result.combat.attributes
      ).map(
        ([
          abilityId,
          recommendation
        ]) => [
          abilityId,
          recommendation.value
        ]
      )
    );


  draft.combat.speed =
    applyRecommendedWalkingSpeed(
      draft.combat.speed,
      result.combat.speed.value
    );

  applyCatalogSelections({
    draft,
    wizardResult
  });

  return draft;
}

function applyCatalogSelections({
  draft,
  wizardResult
}) {

  const recommendations =
    wizardResult
      ?.catalogRecommendations;


  const selections =
    wizardResult
      ?.selections;


  if (
    !recommendations ||
    !selections
  ) {

    throw new Error(
      "El Fakemon Wizard no contiene selecciones de Abilities y Moves."
    );
  }


  const abilityIds =
    selectedIdSet(
      selections.abilityIds
    );


  const abilities =
    recommendations.abilities
      .filter(
        entry =>
          abilityIds.has(
            entry.id
          )
      )
      /*
       * Primero Abilities normales;
       * las Hidden quedan después.
       */
      .sort(
        (
          left,
          right
        ) =>
          Number(
            left.hidden ===
              true
          ) -
          Number(
            right.hidden ===
              true
          )
      )
      .map(
        entry => ({
          id:
            entry.id,

          hidden:
            entry.hidden ===
              true
        })
      );


  if (!abilities.length) {

    throw new Error(
      "El Fakemon Wizard debe aplicar al menos una Ability."
    );
  }


  draft.abilities =
    abilities;


  const levelMoveIds =
    selectedIdSet(
      selections.levelMoveIds
    );


  const eggMoveIds =
    selectedIdSet(
      selections.eggMoveIds
    );


  const tmMoveIds =
    selectedIdSet(
      selections.tmMoveIds
    );


  draft.learnset ??=
    {};


  draft.learnset.level =
    groupWizardLevelMoves(
      recommendations.levelMoves
        .filter(
          entry =>
            levelMoveIds.has(
              entry.moveId
            )
        )
        .map(
          entry => ({
            level:
              entry.level,

            moveId:
              entry.moveId
          })
        )
    );


  draft.learnset.eggMoveIds =
    recommendations.eggMoves
      .filter(
        entry =>
          eggMoveIds.has(
            entry.moveId
          )
      )
      .map(
        entry =>
          entry.moveId
      );


  draft.learnset.tms =
    recommendations.tms
      .filter(
        entry =>
          tmMoveIds.has(
            entry.moveId
          )
      )
      .map(
        entry => ({
          id:
            entry.id,

          moveId:
            entry.moveId,

          cost:
            entry.cost,

          source:
            entry.source ??
            "moves.json"
        })
      );
}


function groupWizardLevelMoves(
  entries
) {

  const groups =
    new Map();


  for (
    const entry
    of entries
  ) {

    const level =
      Number(
        entry?.level
      );


    const moveId =
      String(
        entry?.moveId ??
        ""
      ).trim();


    if (
      !Number.isInteger(
        level
      ) ||
      level < 1 ||
      level > 20 ||
      !moveId
    ) {
      continue;
    }


    if (
      !groups.has(
        level
      )
    ) {

      groups.set(
        level,
        []
      );
    }


    const moveIds =
      groups.get(
        level
      );


    if (
      !moveIds.includes(
        moveId
      )
    ) {

      moveIds.push(
        moveId
      );
    }
  }


  return [
    ...groups.entries()
  ]
    .sort(
      (
        left,
        right
      ) =>
        left[0] -
        right[0]
    )
    .map(
      ([
        level,
        moveIds
      ]) => ({
        level,
        moveIds
      })
    );
}


function selectedIdSet(
  values
) {

  return new Set(
    (
      Array.isArray(
        values
      )
        ? values
        : []
    )
      .map(
        value =>
          String(
            value ??
            ""
          ).trim()
      )
      .filter(
        Boolean
      )
  );
}

function applyRecommendedWalkingSpeed(
  speeds,
  value
) {

  const entries =
    Array.isArray(
      speeds
    )
      ? speeds.map(
          entry => ({
            ...entry
          })
        )
      : [];


  const index =
    entries.findIndex(
      entry =>
        String(
          entry?.type ??
          ""
        )
          .trim()
          .toLowerCase() ===
        "walking"
    );


  const walking = {
    type:
      "walking",

    value,

    unit:
      "ft"
  };


  if (
    index >= 0
  ) {

    entries[
      index
    ] =
      walking;

    return entries;
  }


  return [
    walking,
    ...entries
  ];
}


function clonePlainObject(
  value
) {

  if (
    typeof structuredClone ===
      "function"
  ) {

    return structuredClone(
      value
    );
  }


  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}