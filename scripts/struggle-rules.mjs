export const STRUGGLE_MOVE_ID =
  "struggle";


export const STRUGGLE_ACTIVITY_IDS =
  Object.freeze({
    melee:
      "P5eStruggleMelee",

    ranged:
      "P5eStruggleRange"
  });


export const STRUGGLE_RULE =
  Object.freeze({
    baseDamage: 2,
    damageType: "typeless",
    meleeRange: 5,
    rangedRange: 60,
    noAmplification: true
  });


export function isStruggleMove(
  move
) {

  return (
    String(
      move?.id ??
      ""
    )
      .trim()
      .toLowerCase() ===
    STRUGGLE_MOVE_ID
  );
}


export function buildStruggleDamageFormula(
  moveModifier
) {

  const modifier =
    Number(
      moveModifier
    );


  if (
    !Number.isFinite(
      modifier
    )
  ) {

    throw new TypeError(
      "Struggle requiere un modificador MOVE numérico."
    );
  }


  if (
    modifier > 0
  ) {

    return (
      `${STRUGGLE_RULE.baseDamage} + ${modifier}`
    );
  }


  if (
    modifier < 0
  ) {

    return (
      `${STRUGGLE_RULE.baseDamage} - ${Math.abs(modifier)}`
    );
  }


  return String(
    STRUGGLE_RULE.baseDamage
  );
}


export function getStruggleActivityVariants(
  language = "es"
) {

  const english =
    language === "en";


  return [
    {
      activityId:
        STRUGGLE_ACTIVITY_IDS.melee,

      scope:
        "melee",

      nameSuffix:
        english
          ? "Melee"
          : "Cuerpo a cuerpo",

      range: {
        raw:
          "melee",

        type:
          "melee"
      }
    },

    {
      activityId:
        STRUGGLE_ACTIVITY_IDS.ranged,

      scope:
        "ranged",

      nameSuffix:
        english
          ? "Ranged"
          : "A distancia",

      range: {
        raw:
          `${STRUGGLE_RULE.rangedRange}ft`,

        value:
          STRUGGLE_RULE.rangedRange,

        unit:
          "ft"
      }
    }
  ];
}