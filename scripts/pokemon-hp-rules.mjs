export function pokemonHpGainForRoll(
  dieResult,
  conModifier
) {

  return Math.max(
    1,
    Math.trunc(
      Number(
        dieResult
      )
    ) +
    Number(
      conModifier
    )
  );
}


export function historicalPokemonConHpAdjustment({
  progression,
  currentLevel,
  previousConModifier,
  nextConModifier
}) {

  if (
    previousConModifier ===
    nextConModifier
  ) {

    return 0;
  }


  const rawBaseLevel =
    Number(
      progression
        ?.baseLevel
    );


  const baseLevel =
    Number.isFinite(
      rawBaseLevel
    )

      ? Math.min(
          currentLevel,

          Math.max(
            1,
            Math.trunc(
              rawBaseLevel
            )
          )
        )

      : currentLevel;


  let adjustment =
    (
      nextConModifier -
      previousConModifier
    ) *
    baseLevel;


  const hpGains =
    progression
      ?.hpGains ??
    {};


  for (
    const [
      levelKey,
      entry
    ]
    of Object.entries(
      hpGains
    )
  ) {

    const level =
      Number(
        levelKey
      );


    if (
      !Number.isFinite(
        level
      ) ||
      level <=
        baseLevel ||
      level >
        currentLevel
    ) {

      continue;
    }


    const dieResult =
      Number(
        entry?.dieResult
      );


    if (
      !Number.isFinite(
        dieResult
      )
    ) {

      continue;
    }


    adjustment +=
      pokemonHpGainForRoll(
        dieResult,
        nextConModifier
      ) -
      pokemonHpGainForRoll(
        dieResult,
        previousConModifier
      );
  }


  return adjustment;
}