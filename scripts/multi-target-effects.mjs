const MULTI_TARGET_EFFECTS = {
  "parabolic-charge": {
    kind: "multi-target-drain",
    fraction: 0.5,
    round: "floor",
    basedOn: "actual-damage",
    recipient: "source",
    cap: {
      kind: "level-multiplier",
      multiplier: 5
    }
  }
};

export function buildMoveMultiTargetData(move) {
  const definition =
    MULTI_TARGET_EFFECTS[move?.id];

  if (!definition) {
    return null;
  }

  return foundry.utils.deepClone(
    definition
  );
}