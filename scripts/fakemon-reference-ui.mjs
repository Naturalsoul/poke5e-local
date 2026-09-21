export function bindFakemonReferenceUi(
  root,
  {
    moveLabels,
    abilityLabels
  }
) {

  const catalogs = {
    move:
      normalizeLabelMap(
        moveLabels
      ),

    ability:
      normalizeLabelMap(
        abilityLabels
      )
  };


  root
    .querySelectorAll(
      "[data-reference-kind]"
    )
    .forEach(
      input => {

        const kind =
          String(
            input.dataset
              .referenceKind ??
            ""
          );

        const labels =
          catalogs[
            kind
          ];


        if (!labels) {
          return;
        }


        const cell =
          input.closest(
            ".fakemon-studio__reference-cell"
          );


        if (!cell) {
          return;
        }


        const update =
          () => {

            updateReferenceCell({
              cell,
              input,
              labels,
              kind
            });
          };


        input.addEventListener(
          "input",
          update
        );

        input.addEventListener(
          "change",
          update
        );


        update();
      }
    );


  bindEggMoveFeedback(
    root,
    catalogs.move
  );
}


function updateReferenceCell({
  cell,
  input,
  labels,
  kind
}) {

  const feedback =
    cell.querySelector(
      "[data-reference-feedback]"
    );

  const icon =
    feedback?.querySelector(
      "i"
    );

  const text =
    feedback?.querySelector(
      "span"
    );


  if (
    !feedback ||
    !icon ||
    !text
  ) {
    return;
  }


  const reference =
    String(
      input.value ??
      ""
    ).trim();


  const state =
    resolveReferenceState({
      reference,
      labels,
      kind
    });


  cell.dataset.referenceState =
    state.kind;

  icon.className =
    state.icon;

  text.textContent =
    state.message;
}


function bindEggMoveFeedback(
  root,
  moveLabels
) {

  const field =
    root.querySelector(
      ".fakemon-studio__egg-moves-field"
    );

  const textarea =
    root.querySelector(
      '[data-role="egg-moves"]'
    );

  const feedback =
    root.querySelector(
      "[data-egg-reference-feedback]"
    );

  const icon =
    feedback?.querySelector(
      "i"
    );

  const text =
    feedback?.querySelector(
      "span"
    );

  const count =
    root.querySelector(
      '[data-role="egg-move-count"]'
    );


  if (
    !field ||
    !textarea ||
    !feedback ||
    !icon ||
    !text ||
    !count
  ) {
    return;
  }


  const update =
    () => {

      const moveIds =
        parseCsv(
          textarea.value
        );

      const missingIds =
        [
          ...new Set(
            moveIds.filter(
              moveId =>
                !moveLabels.has(
                  moveId
                )
            )
          )
        ];


      count.textContent =
        String(
          moveIds.length
        );


      if (!moveIds.length) {

        field.dataset.referenceState =
          "neutral";

        icon.className =
          "fa-regular fa-circle";

        text.textContent =
          "Moves separados por coma.";

        return;
      }


      if (!missingIds.length) {

        field.dataset.referenceState =
          "valid";

        icon.className =
          "fa-solid fa-circle-check";

        text.textContent =
          `${moveIds.length} ${
            moveIds.length === 1
              ? "referencia válida"
              : "referencias válidas"
          }.`;

        return;
      }


      field.dataset.referenceState =
        "invalid";

      icon.className =
        "fa-solid fa-triangle-exclamation";

      text.textContent =
        eggMoveErrorMessage(
          missingIds
        );
    };


  textarea.addEventListener(
    "input",
    update
  );

  textarea.addEventListener(
    "change",
    update
  );


  update();
}


function resolveReferenceState({
  reference,
  labels,
  kind
}) {

  const label =
    kind === "ability"
      ? "Ability"
      : "Move";


  if (!reference) {

    return {
      kind:
        "neutral",

      icon:
        "fa-regular fa-circle",

      message:
        `Selecciona un ${label}.`
    };
  }


  const displayName =
    labels.get(
      reference
    );


  if (displayName) {

    return {
      kind:
        "valid",

      icon:
        "fa-solid fa-circle-check",

      message:
        displayName
    };
  }


  return {
    kind:
      "invalid",

    icon:
      "fa-solid fa-triangle-exclamation",

    message:
      `${label} inexistente.`
  };
}


function eggMoveErrorMessage(
  missingIds
) {

  const preview =
    missingIds
      .slice(
        0,
        3
      )
      .join(
        ", "
      );

  const extraCount =
    Math.max(
      0,
      missingIds.length -
        3
    );

  const suffix =
    extraCount
      ? ` (+${extraCount})`
      : "";


  return (
    `${missingIds.length} ${
      missingIds.length === 1
        ? "referencia inexistente"
        : "referencias inexistentes"
    }: ${preview}${suffix}`
  );
}


function parseCsv(
  value
) {

  return String(
    value ??
    ""
  )
    .split(
      ","
    )
    .map(
      entry =>
        entry.trim()
    )
    .filter(
      Boolean
    );
}


function normalizeLabelMap(
  labels
) {

  return labels instanceof Map
    ? labels
    : new Map();
}