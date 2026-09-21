/* ============================================================
 * MOVIMIENTOS DE DRENAJE INSTANTÁNEO
 *
 * fraction:
 *
 * 0.5 → cura la mitad
 * 1.0 → cura todo el daño infligido
 *
 * round:
 *
 * floor → redondear hacia abajo
 * ============================================================ */

const INSTANT_DRAIN_MOVES = {

  "absorb": {
    fraction: 0.5,
    round: "floor"
  },

  "mega-drain": {
    fraction: 0.5,
    round: "floor"
  },

  "giga-drain": {
    fraction: 0.5,
    round: "floor"
  },

  "drain-punch": {
    fraction: 0.5,
    round: "floor"
  },

  "draining-kiss": {
    fraction: 0.5,
    round: "floor"
  },

  "dream-eater": {
    fraction: 0.5,
    round: "floor"
  },

  "leech-life": {
    fraction: 0.5,
    round: "floor"
  },

  "bitter-blade": {
    fraction: 0.5,
    round: "floor"
  },

  "horn-leech": {
    fraction: 0.5,
    round: "floor"
  },


  /* ==========================================================
   * OBLIVION WING
   *
   * Recupera HP igual al daño realizado.
   * ========================================================== */

  "oblivion-wing": {
    fraction: 1,
    round: "floor"
  }
};


/* ============================================================
 * PUBLIC
 * ============================================================ */

export function buildMoveDrainData(
  move
) {

  const definition =
    INSTANT_DRAIN_MOVES[
      move?.id
    ];


  if (!definition) {

    return null;
  }


  return {

    kind:
      "instant-drain",

    fraction:
      Number(
        definition.fraction
      ),

    round:
      definition.round ??
      "floor",

    basedOn:
      "actual-damage",

    recipient:
      "source"
  };
}