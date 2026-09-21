const SAVE_RESULT_EFFECTS = {
  "matcha-gotcha": {
    kind:
      "heal-per-failed-save",

    formulaPerFailure:
      "1d6",

    recipient:
      "source"
  }
};

export function buildMoveSaveResultData(
  move
) {
  const definition =
    SAVE_RESULT_EFFECTS[
      move?.id
    ];

  if (!definition) {
    return null;
  }

  return foundry.utils.deepClone(
    definition
  );
}