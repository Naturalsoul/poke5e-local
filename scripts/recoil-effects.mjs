const RECOIL_MOVES = {

  "brave-bird": {
    fraction: 0.25,
    round: "floor"
  },

  "double-edge": {
    fraction: 0.25,
    round: "floor"
  },

  "flare-blitz": {
    fraction: 0.25,
    round: "floor"
  },

  "head-charge": {
    fraction: 0.25,
    round: "floor"
  },

  "head-smash": {
    fraction: 0.5,
    round: "floor"
  },

  "submission": {
    fraction: 0.25,
    round: "floor"
  },

  "take-down": {
    fraction: 0.25,
    round: "floor"
  },

  "volt-tackle": {
    fraction: 0.25,
    round: "floor"
  },

  "wave-crash": {
    fraction: 0.5,
    round: "floor"
  },

  "wild-charge": {
    fraction: 0.25,
    round: "floor"
  },

  "wood-hammer": {
    fraction: 0.25,
    round: "floor"
  }
};


export function buildMoveRecoilData(
  move
) {

  const definition =
    RECOIL_MOVES[
      move?.id
    ];


  if (!definition) {

    return null;
  }


  return {

    kind:
      "instant-recoil",

    fraction:
      Number(
        definition.fraction
      ),

    round:
      definition.round ??
      "floor",

    basedOn:
      "actual-damage",

    damageType:
      "typeless"
  };
}