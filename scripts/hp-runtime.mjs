/* ============================================================
 * HP RUNTIME
 *
 * Helpers puros de lectura/proyección de HP para engines que
 * dependen de umbrales, sin acoplarlos a una Ability concreta.
 * ============================================================ */

function finiteNumber(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;
  }


  const numeric =
    Number(
      value
    );


  return Number.isFinite(
    numeric
  )

    ? numeric

    : null;
}


export function currentPokemonHpState(
  actor
) {

  const hp =
    actor?.system
      ?.attributes
      ?.hp;


  if (!hp) {

    return null;
  }


  const value =
    finiteNumber(
      hp.value
    );


  const maximum =
    finiteNumber(
      hp.max
    );


  if (
    value === null ||
    maximum === null ||
    maximum <= 0
  ) {

    return null;
  }


  return {
    value,
    maximum,

    ratio:
      value /
      maximum
  };
}


export function projectedPokemonHpState(
  actor,
  updates
) {

  const current =
    currentPokemonHpState(
      actor
    );


  if (!current) {

    return null;
  }


  const projected =
    finiteNumber(
      updates?.[
        "system.attributes.hp.value"
      ] ??
      current.value
    );


  if (
    projected === null
  ) {

    return null;
  }


  return {
    before:
      current.value,

    after:
      projected,

    maximum:
      current.maximum
  };
}


export function isAtOrBelowHpRatio(
  actor,
  ratio
) {

  const state =
    currentPokemonHpState(
      actor
    );


  const threshold =
    finiteNumber(
      ratio
    );


  if (
    !state ||
    threshold === null ||
    threshold < 0
  ) {

    return false;
  }


  return (
    state.ratio <=
    threshold
  );
}

export function isBelowHpRatio(
  actor,
  ratio
) {

  const state =
    currentPokemonHpState(
      actor
    );


  const threshold =
    finiteNumber(
      ratio
    );


  if (
    !state ||
    threshold === null ||
    threshold < 0
  ) {

    return false;
  }


  return (
    state.ratio <
    threshold
  );
}


export function crossedHpThreshold(
  state,
  definition
) {

  if (
    !state ||
    !definition
  ) {

    return false;
  }


  const ratio =
    finiteNumber(
      definition.ratio
    );


  if (
    ratio === null ||
    ratio < 0
  ) {

    return false;
  }


  const threshold =
    state.maximum *
    ratio;


  if (
    definition.direction ===
    "below"
  ) {

    return (
      state.before >=
        threshold &&

      state.after <
        threshold
    );
  }


  if (
    definition.direction ===
    "at-or-below"
  ) {

    return (
      state.before >
        threshold &&

      state.after <=
        threshold
    );
  }


  return false;
}