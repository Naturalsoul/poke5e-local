const SELF_DAMAGE_DEFINITIONS =
  Object.freeze({

    "light-of-ruin": {

      classification:
        "recoil",

      basis:
        "damage-roll",

      fraction:
        0.5,

      round:
        "floor",

      damageType:
        "typeless",

      oncePerActivation:
        true
    },


    "mind-blown": {

      classification:
        "self-damage",

      basis:
        "damage-roll",

      fraction:
        1,

      round:
        "floor",

      damageType:
        "typeless",

      oncePerActivation:
        true
    },


    chloroblast: {

      classification:
        "self-damage",

      basis:
        "max-hp",

      fraction:
        0.5,

      round:
        "floor",

      damageType:
        "typeless",

      oncePerActivation:
        true
    }
  });


export function buildMoveSelfDamageData(
  move
) {

  const definition =
    SELF_DAMAGE_DEFINITIONS[
      move?.id
    ];


  if (!definition) {

    return null;
  }


  return {

    kind:
      "self-damage",

    classification:
      definition.classification,

    basis:
      definition.basis,

    fraction:
      Number(
        definition.fraction
      ),

    round:
      definition.round ??
      "floor",

    damageType:
      definition.damageType ??
      "typeless",

    oncePerActivation:
      definition.oncePerActivation !==
      false
  };
}