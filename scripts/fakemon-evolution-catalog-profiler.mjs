import { normalizeId } from "./ids.mjs";

const CHANNELS =
  Object.freeze([
    "abilities",
    "levelMoves",
    "eggMoves",
    "tms"
  ]);


export function buildEvolutionCatalogContinuityProfile({
  comparables,
  weights
}) {

  const pairs =
    Array.isArray(
      comparables
    )
      ? comparables
      : [];


  const normalizedWeights =
    normalizeWeights(
      pairs,
      weights
    );


  return {
    source:
      "poke5e-observed-evolution-catalog-retention",

    sampleSize:
      pairs.length,

    channels:
      Object.fromEntries(
        CHANNELS.map(
          channel => [
            channel,

            buildChannelProfile({
              pairs,

              weights:
                normalizedWeights,

              channel
            })
          ]
        )
      )
  };
}


function buildChannelProfile({
  pairs,
  weights,
  channel
}) {

  const observations =
    pairs
      .map(
        (
          pair,
          index
        ) =>
          buildRetentionObservation({
            pair,
            channel,

            weight:
              weights[
                index
              ] ??
              0
          })
      )
      .filter(
        Boolean
      );


  if (!observations.length) {

    return {
      retention:
        null,

      sampleSize:
        0,

      averageSourceCount:
        0,

      averageTargetCount:
        0
    };
  }


  const totalWeight =
    observations.reduce(
      (
        sum,
        observation
      ) =>
        sum +
        observation.weight,
      0
    );


  const fallbackWeight =
    1 /
    observations.length;


  const effectiveWeight =
    observation =>
      totalWeight >
        0
        ? observation.weight /
          totalWeight
        : fallbackWeight;


  return {
    retention:
      roundScore(
        observations.reduce(
          (
            sum,
            observation
          ) =>
            sum +
            observation.retention *
              effectiveWeight(
                observation
              ),
          0
        )
      ),

    sampleSize:
      observations.length,

    averageSourceCount:
      roundToStep(
        observations.reduce(
          (
            sum,
            observation
          ) =>
            sum +
            observation.sourceCount *
              effectiveWeight(
                observation
              ),
          0
        ),
        0.1
      ),

    averageTargetCount:
      roundToStep(
        observations.reduce(
          (
            sum,
            observation
          ) =>
            sum +
            observation.targetCount *
              effectiveWeight(
                observation
              ),
          0
        ),
        0.1
      )
  };
}


function buildRetentionObservation({
  pair,
  channel,
  weight
}) {

  const sourceIds =
    catalogIds(
      pair?.fromSpecies,
      channel
    );


  if (!sourceIds.size) {
    return null;
  }


  const targetIds =
    catalogIds(
      pair?.toSpecies,
      channel
    );


  const retainedCount =
    [
      ...sourceIds
    ].filter(
      id =>
        targetIds.has(
          id
        )
    ).length;


  return {
    retention:
      retainedCount /
      sourceIds.size,

    sourceCount:
      sourceIds.size,

    targetCount:
      targetIds.size,

    weight:
      Math.max(
        0,
        Number(
          weight
        ) ||
        0
      )
  };
}


function catalogIds(
  species,
  channel
) {

  if (
    channel ===
      "abilities"
  ) {

    return idSet(
      (
        species?.abilities ??
        []
      ).map(
        entry =>
          entry?.id
      )
    );
  }


  if (
    channel ===
      "levelMoves"
  ) {

    return idSet(
      (
        species
          ?.learnset
          ?.level ??
        []
      ).flatMap(
        group =>
          group?.moveIds ??
          []
      )
    );
  }


  if (
    channel ===
      "eggMoves"
  ) {

    return idSet(
      species
        ?.learnset
        ?.eggMoveIds ??
      []
    );
  }


  if (
    channel ===
      "tms"
  ) {

    return idSet(
      (
        species
          ?.learnset
          ?.tms ??
        []
      ).map(
        entry =>
          entry?.moveId
      )
    );
  }


  return new Set();
}


function idSet(
  values
) {

  return new Set(
    (
      Array.isArray(
        values
      )
        ? values
        : []
    )
      .map(
        normalizeId
      )
      .filter(
        Boolean
      )
  );
}


function normalizeWeights(
  pairs,
  weights
) {

  if (
    Array.isArray(
      weights
    ) &&
    weights.length ===
      pairs.length
  ) {

    return weights.map(
      value =>
        Math.max(
          0,
          Number(
            value
          ) ||
          0
        )
    );
  }


  if (!pairs.length) {
    return [];
  }


  return pairs.map(
    () =>
      1 /
      pairs.length
  );
}


function roundScore(
  value
) {

  return (
    Math.round(
      Number(
        value
      ) *
      100
    ) /
    100
  );
}


function roundToStep(
  value,
  step
) {

  if (
    !Number.isFinite(
      Number(
        value
      )
    )
  ) {
    return 0;
  }


  return Number(
    (
      Math.round(
        Number(
          value
        ) /
        step
      ) *
      step
    ).toFixed(
      4
    )
  );
}