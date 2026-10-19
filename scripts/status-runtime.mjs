const MODULE_ID = "poke5e-local";


/* ============================================================
 * STATUS IDS
 *
 * Fuente única para reconocer los estados Pokémon
 * ya materializados como ActiveEffects.
 * ============================================================ */

const STATUS_IDS = Object.freeze({

  poisoned:
    "poisoned",

  paralysis:
    "poke5e-paralysis",

  asleep:
    "poke5e-asleep",

  burned:
    "poke5e-burned",

  frozen:
    "poke5e-frozen",

  confused:
    "poke5e-confused",

  flinched:
    "poke5e-flinched",

  "badly-poisoned":
    "poke5e-badly-poisoned"
});


/* ============================================================
 * EFFECTIVE STATUS
 *
 * Abilities que hacen que un Pokémon cuente
 * como afectado por un estado sin tener
 * realmente ese ActiveEffect.
 *
 * Poke5e:
 * Comatose → cuenta como Asleep para Moves.
 * ============================================================ */

const EFFECTIVE_STATUS_ABILITIES = Object.freeze({

  asleep:
    new Set([
      "comatose"
    ])
});


/* ============================================================
 * STATUS IMMUNITY ABILITIES
 *
 * Solo incluimos contratos ya confirmados.
 *
 * Comatose:
 * - inmune a Asleep
 * - pero effective Asleep = true
 * ============================================================ */

// Good as Gold is immune to every status; Purifying Salt to the non-volatile ones.
const STATUS_IMMUNITY_ABILITIES = Object.freeze({
  asleep: new Set(["comatose", "insomnia", "vital-spirit", "good-as-gold", "purifying-salt"]),
  flinched: new Set(["inner-focus", "good-as-gold"]),
  paralysis: new Set(["limber", "good-as-gold", "purifying-salt"]),
  poisoned: new Set(["immunity", "pastel-veil", "good-as-gold", "purifying-salt"]),
  frozen: new Set(["magma-armor", "good-as-gold", "purifying-salt"]),
  burned: new Set(["water-veil", "heatproof", "water-bubble", "thermal-exchange", "good-as-gold", "purifying-salt"]),
  confused: new Set(["own-tempo", "good-as-gold"])
});


/* ============================================================
 * NORMALIZE
 * ============================================================ */

function normalizeId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}


/* ============================================================
 * EFFECT STATUSES
 * ============================================================ */

function effectStatuses(
  effect
) {

  const statuses =
    effect?.statuses ??
    new Set();


  return new Set(
    Array.from(
      statuses
    )
      .map(
        normalizeId
      )
      .filter(Boolean)
  );
}


/* ============================================================
 * POKEMON TYPES
 *
 * Contrato canónico actual del Actor:
 *
 * flags.poke5e-local.types
 * ============================================================ */

export function pokemonTypes(
  actor
) {

  const types =
    actor?.getFlag?.(
      MODULE_ID,
      "types"
    );


  if (
    !Array.isArray(
      types
    )
  ) {

    return [];
  }


  return [
    ...new Set(
      types
        .map(
          normalizeId
        )
        .filter(Boolean)
    )
  ];
}


/* ============================================================
 * STATUS DE ACTIVE EFFECT
 * ============================================================ */

export function pokemonStatus(
  effect
) {

  if (!effect) {

    return null;
  }


  /*
   * El flag Poke5e es la autoridad
   * cuando existe.
   */

  const flagged =
    effect.flags
      ?.[MODULE_ID]
      ?.status ??
    effect.getFlag?.(
      MODULE_ID,
      "status"
    );


  const normalizedFlag =
    normalizeId(
      flagged
    );


  if (normalizedFlag) {

    return normalizedFlag;
  }


  /*
   * Fallback para efectos nativos/custom
   * sin flag explícito.
   */

  const statuses =
    effectStatuses(
      effect
    );


  for (
    const [
      status,
      id
    ]
    of Object.entries(
      STATUS_IDS
    )
  ) {

    if (
      statuses.has(
        id
      )
    ) {

      return status;
    }
  }


  return null;
}


/* ============================================================
 * FIND STATUS EFFECT
 * ============================================================ */

export function findStatusEffect(
  actor,
  status
) {

  const normalized =
    normalizeId(
      status
    );


  if (
    !actor ||
    !normalized
  ) {

    return null;
  }


  return (
    actor.effects.find(
      effect =>

        !effect.disabled &&

        pokemonStatus(
          effect
        ) ===
          normalized
    ) ??
    null
  );
}


/* ============================================================
 * HAS ACTUAL STATUS
 * ============================================================ */

export function hasPokemonStatus(
  actor,
  status
) {

  return Boolean(
    findStatusEffect(
      actor,
      status
    )
  );
}


/* ============================================================
 * ABILITY ITEMS
 *
 * El Actor puede materializar varias opciones disponibles,
 * pero Poke5e permite una sola Ability activa.
 * ============================================================ */

function pokemonAbilityIds(
  actor
) {

  if (!actor) {

    return [];
  }


  return [
    ...new Set(
      actor.items
        .filter(
          item =>

            item.getFlag?.(
              MODULE_ID,
              "kind"
            ) ===
              "ability"
        )
        .map(
          item =>
            normalizeId(
              item.getFlag?.(
                MODULE_ID,
                "sourceId"
              )
            )
        )
        .filter(Boolean)
    )
  ];
}


/* ============================================================
 * ACTIVE ABILITY
 *
 * Fuente de verdad:
 *
 * flags.poke5e-local.activeAbilityId
 *
 * Compatibilidad legacy:
 *
 * - un Hidden concedido único se considera activo;
 * - un único Ability Item se considera activo;
 * - varias opciones sin flag explícito = estado ambiguo.
 * ============================================================ */

export function activePokemonAbilityId(
  actor
) {

  if (!actor) {

    return null;
  }


  const available =
    pokemonAbilityIds(
      actor
    );


  if (!available.length) {

    return null;
  }


  const configured =
    normalizeId(
      actor.getFlag?.(
        MODULE_ID,
        "activeAbilityId"
      )
    );


  if (
    configured &&
    available.includes(
      configured
    )
  ) {

    return configured;
  }


  const grantedHidden =
    actor.getFlag?.(
      MODULE_ID,
      "grantedHiddenAbilities"
    );


  if (
    Array.isArray(
      grantedHidden
    )
  ) {

    const legacyHidden =
      [
        ...new Set(
          grantedHidden
            .map(
              normalizeId
            )
            .filter(
              abilityId =>
                available.includes(
                  abilityId
                )
            )
        )
      ];


    if (
      legacyHidden.length ===
      1
    ) {

      return legacyHidden[0];
    }
  }


  return available.length === 1

    ? available[0]

    : null;
}


/* ============================================================
 * HAS ACTIVE ABILITY
 * ============================================================ */

export function hasPokemonAbility(
  actor,
  abilityId
) {

  const normalized =
    normalizeId(
      abilityId
    );


  if (!normalized) {

    return false;
  }


  /*
   * Guru L9, Body: la segunda Ability elegida
   * también está activa.
   */

  return (
    activePokemonAbilityId(
      actor
    ) ===
    normalized ||

    (
      normalizeId(
        actor?.getFlag?.(
          MODULE_ID,
          "bodyAbilityId"
        )
      ) ===
      normalized &&

      pokemonAbilityIds(
        actor
      ).includes(
        normalized
      )
    )
  );
}


/* ============================================================
 * MAPPED ABILITY
 * ============================================================ */

function hasMappedAbility(
  actor,
  status,
  mapping
) {

  const normalized =
    normalizeId(
      status
    );


  const abilities =
    mapping[
      normalized
    ];


  if (!abilities) {

    return false;
  }


  return Array.from(
    abilities
  ).some(
    abilityId =>

      hasPokemonAbility(
        actor,
        abilityId
      )
  );
}


/* ============================================================
 * EFFECTIVE STATUS
 *
 * Diferencia fundamental:
 *
 * hasPokemonStatus(actor, "asleep")
 * → existe realmente Asleep
 *
 * hasEffectiveStatus(actor, "asleep")
 * → se considera Asleep para reglas que lo requieren
 *
 * Comatose:
 *
 * actual Asleep    = false
 * effective Asleep = true
 * ============================================================ */

export function hasEffectiveStatus(
  actor,
  status
) {

  if (
    hasPokemonStatus(
      actor,
      status
    )
  ) {

    return true;
  }


  return hasMappedAbility(
    actor,
    status,
    EFFECTIVE_STATUS_ABILITIES
  );
}


/* ============================================================
 * ABILITY STATUS IMMUNITY
 * ============================================================ */

export function hasStatusImmunityAbility(
  actor,
  status
) {

  return hasMappedAbility(
    actor,
    status,
    STATUS_IMMUNITY_ABILITIES
  );
}