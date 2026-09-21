import {
  hasPokemonAbility
} from "./status-runtime.mjs";

import {
  isBelowHpRatio
} from "./hp-runtime.mjs";

export const BERSERK_ABILITY_ID =
  "berserk";

export const BERSERK_HP_RATIO =
  0.25;


/* ============================================================
 * ACTIVE BERSERK
 *
 * Poke5e:
 * HP estrictamente por debajo de 25 %.
 *
 * hasPokemonAbility() ya representa
 * exclusivamente la Ability activa.
 * ============================================================ */

export function hasActiveBerserk(
  actor
) {

  return (
    hasPokemonAbility(
      actor,
      BERSERK_ABILITY_ID
    ) &&

    isBelowHpRatio(
      actor,
      BERSERK_HP_RATIO
    )
  );
}