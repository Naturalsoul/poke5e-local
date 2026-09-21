const MODULE_ID =
  "poke5e-local";

const MODIFIERS_FLAG =
  "pendingMoveModifiers";

const modifierCache =
  new Map();


function cloneValue(
  value
) {

  return foundry.utils.deepClone(
    value
  );
}


function normalizeModifiers(
  value
) {

  if (
    !Array.isArray(
      value
    )
  ) {

    return [];
  }


  return value
    .filter(
      entry =>
        entry &&
        typeof entry ===
          "object"
    )
    .map(
      cloneValue
    );
}


function readModifiers(
  actor
) {

  if (!actor?.uuid) {

    return [];
  }


  if (
    modifierCache.has(
      actor.uuid
    )
  ) {

    return cloneValue(
      modifierCache.get(
        actor.uuid
      )
    );
  }


  const stored =
    normalizeModifiers(
      actor.getFlag?.(
        MODULE_ID,
        MODIFIERS_FLAG
      )
    );


  modifierCache.set(
    actor.uuid,
    stored
  );


  return cloneValue(
    stored
  );
}


function cacheModifiers(
  actor,
  modifiers
) {

  if (!actor?.uuid) {

    return;
  }


  modifierCache.set(
    actor.uuid,
    cloneValue(
      modifiers
    )
  );
}


async function persistModifiers(
  actor,
  modifiers
) {

  if (!actor?.uuid) {

    return;
  }


  const normalized =
    normalizeModifiers(
      modifiers
    );


  cacheModifiers(
    actor,
    normalized
  );


  if (
    normalized.length
  ) {

    await actor.setFlag(
      MODULE_ID,
      MODIFIERS_FLAG,
      normalized
    );


    return;
  }


  await actor.unsetFlag(
    MODULE_ID,
    MODIFIERS_FLAG
  );
}

export async function clearPokemonMoveModifiers(
  actor
) {

  if (!actor?.uuid) {

    return [];
  }


  const modifiers =
    readModifiers(
      actor
    );


  await persistModifiers(
    actor,
    []
  );


  return modifiers;
}

function normalizeMoveModifier(
  definition
) {

  const sourceAbility =
    String(
      definition?.sourceAbility ??
      ""
    )
      .trim()
      .toLowerCase();


  if (!sourceAbility) {

    throw new Error(
      "Move modifier requiere sourceAbility."
    );
  }


  return {

    kind:
      "move-modifier",

    sourceAbility,

    timing:
      definition.timing ??
      "following-turn",

    phase:
      definition.phase ??
      "armed",

    usesRemaining:
      Math.max(
        1,
        Number(
          definition.usesRemaining ??
          1
        )
      ),

    damageDiceMultiplier:
      Math.max(
        1,
        Number(
          definition.damageDiceMultiplier ??
          1
        )
      ),

    armedAt:
      Number(
        definition.armedAt ??
        Date.now()
      ),

    activatedAt:
      definition.activatedAt ??
      null
  };
}


export async function armFollowingTurnMoveModifier(
  actor,
  definition
) {

  if (!actor) {

    return;
  }


  const modifier =
    normalizeMoveModifier({
      ...definition,
      timing:
        "following-turn",
      phase:
        "armed"
    });


  const modifiers =
    readModifiers(
      actor
    )
      .filter(
        entry =>
          !(
            entry.sourceAbility ===
              modifier.sourceAbility &&

            entry.phase ===
              "armed"
          )
      );


  modifiers.push(
    modifier
  );


  await persistModifiers(
    actor,
    modifiers
  );
}


export async function activateFollowingTurnMoveModifiers(
  actor
) {

  const modifiers =
    readModifiers(
      actor
    );


  let changed =
    false;


  const activated =
    [];


  const next =
    modifiers.map(
      entry => {

        if (
          entry.timing !==
            "following-turn" ||

          entry.phase !==
            "armed"
        ) {

          return entry;
        }


        changed =
          true;


        const active = {

          ...entry,

          phase:
            "active",

          activatedAt:
            Date.now()
        };


        activated.push(
          cloneValue(
            active
          )
        );


        return active;
      }
    );


  if (
    changed
  ) {

    await persistModifiers(
      actor,
      next
    );
  }


  return activated;
}


export function activeDamageDiceModifier(
  actor
) {

  return (
    readModifiers(
      actor
    ).find(
      entry =>

        entry.phase ===
          "active" &&

        Number(
          entry.usesRemaining ??
          0
        ) > 0 &&

        Number(
          entry.damageDiceMultiplier ??
          1
        ) > 1
    ) ??
    null
  );
}


export function consumeActiveMoveModifier(
  actor,
  sourceAbility
) {

  if (!actor?.uuid) {

    return false;
  }


  const normalizedSource =
    String(
      sourceAbility ??
      ""
    )
      .trim()
      .toLowerCase();


  const modifiers =
    readModifiers(
      actor
    );


  const index =
    modifiers.findIndex(
      entry =>

        entry.phase ===
          "active" &&

        entry.sourceAbility ===
          normalizedSource
    );


  if (
    index < 0
  ) {

    return false;
  }


  const current =
    modifiers[
      index
    ];


  const remaining =
    Math.max(
      0,
      Number(
        current.usesRemaining ??
        1
      ) - 1
    );


  if (
    remaining > 0
  ) {

    modifiers[
      index
    ] = {

      ...current,

      usesRemaining:
        remaining
    };

  } else {

    modifiers.splice(
      index,
      1
    );
  }


  cacheModifiers(
    actor,
    modifiers
  );


  void persistModifiers(
    actor,
    modifiers
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error consumiendo move modifier:`,
        error
      );
    }
  );


  return true;
}


export async function expireActiveMoveModifiers(
  actor
) {

  const modifiers =
    readModifiers(
      actor
    );


  const next =
    modifiers.filter(
      entry =>
        entry.phase !==
        "active"
    );


  if (
    next.length ===
    modifiers.length
  ) {

    return [];
  }


  const expired =
    modifiers.filter(
      entry =>
        entry.phase ===
        "active"
    );


  await persistModifiers(
    actor,
    next
  );


  return expired;
}