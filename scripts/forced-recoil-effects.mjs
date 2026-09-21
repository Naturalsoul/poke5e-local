const FORCED_RECOIL_DEFINITIONS =
  Object.freeze({

    "steel-beam": {

      distance:
        10,

      direction:
        "opposite-template",

      prone:
        true,

      groundedDamage: {

        formula:
          "2d6",

        damageType:
          "typeless"
      },

      airborne: {

        fall:
          true,

        rule:
          "dnd5e"
      }
    }
  });


export function buildMoveForcedRecoilData(
  move
) {

  const definition =
    FORCED_RECOIL_DEFINITIONS[
      move?.id
    ];


  if (!definition) {

    return null;
  }


  return {

    kind:
      "forced-recoil",

    distance:
      Number(
        definition.distance
      ),

    direction:
      definition.direction,

    prone:
      definition.prone ===
      true,

    groundedDamage:
      definition.groundedDamage
        ? {
            formula:
              definition
                .groundedDamage
                .formula,

            damageType:
              definition
                .groundedDamage
                .damageType ??
              "typeless"
          }
        : null,

    airborne:
      definition.airborne
        ? {
            fall:
              definition
                .airborne
                .fall ===
              true,

            rule:
              definition
                .airborne
                .rule ??
              null
          }
        : null
  };
}