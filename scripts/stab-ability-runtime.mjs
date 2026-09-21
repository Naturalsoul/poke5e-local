import {
  hasPokemonAbility
} from "./status-runtime.mjs";

import {
  isAtOrBelowHpRatio
} from "./hp-runtime.mjs";

const STAB_THRESHOLD_RATIO =
  0.25;

const STAB_THRESHOLD_ABILITY_IDS =
  Object.freeze([
    "blaze",
    "torrent",
    "overgrow",
    "swarm"
  ]);


/* ============================================================
 * ACTIVE STAB THRESHOLD ABILITY
 *
 * Las cuatro Abilities comparten exactamente
 * el mismo contrato Poke5e.
 *
 * No se acumulan entre sí.
 * ============================================================ */

function activeStabThresholdAbility(
  actor
) {

  if (
    !isAtOrBelowHpRatio(
      actor,
      STAB_THRESHOLD_RATIO
    )
  ) {

    return null;
  }


  return (
    STAB_THRESHOLD_ABILITY_IDS.find(
      abilityId =>
        hasPokemonAbility(
          actor,
          abilityId
        )
    ) ??
    null
  );
}


/* ============================================================
 * RESOLVE STAB BOOST
 *
 * PB/STAB base 2:
 *
 * normal → +2
 * ability → +4
 *
 * extraBonus es únicamente lo que debemos añadir,
 * porque el STAB base ya existe en el Move.
 * ============================================================ */

export function resolveStabAbilityBoost(
  actor,
  baseBonus
) {

  const normalizedBase =
    Number(
      baseBonus
    );


  if (
    !Number.isFinite(
      normalizedBase
    ) ||
    normalizedBase <= 0
  ) {

    return null;
  }


  const sourceAbility =
    activeStabThresholdAbility(
      actor
    );


  if (!sourceAbility) {

    return null;
  }


  const multiplier =
    2;


  return Object.freeze({
    kind:
      "stab-ability-boost",

    sourceAbility,

    thresholdRatio:
      STAB_THRESHOLD_RATIO,

    multiplier,

    baseBonus:
      normalizedBase,

    extraBonus:
      normalizedBase *
      (multiplier - 1),

    totalBonus:
      normalizedBase *
      multiplier
  });
}