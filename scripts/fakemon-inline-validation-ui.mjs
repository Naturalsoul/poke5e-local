import {
  POKEMON_TYPE_IDS
} from "./types.mjs";

const ATTRIBUTE_ROLES = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha"
].map(
  abilityId =>
    `attribute-${abilityId}`
);

const CANONICAL_ID_PATTERN =
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const VALID_TYPE_IDS =
  new Set(
    POKEMON_TYPE_IDS
  );


export function bindFakemonInlineValidationUi(
  root
) {

  bindTextValidation(
    root,
    "species-name",
    validateRequiredName
  );

  bindTextValidation(
    root,
    "species-id",
    validateCanonicalIdInput
  );

  bindNumberValidation(
    root,
    "sr",
    {
      min:
        0,

      integer:
        false,

      emptyAsZero:
        true,

      label:
        "SR"
    }
  );

  bindNumberValidation(
    root,
    "minimum-level",
    {
      min:
        1,

      max:
        20,

      integer:
        true,

      label:
        "Nivel mínimo"
    }
  );

  bindNumberValidation(
    root,
    "ac",
    {
      min:
        1,

      integer:
        true,

      label:
        "AC"
    }
  );

  bindNumberValidation(
    root,
    "hp",
    {
      min:
        1,

      integer:
        true,

      label:
        "HP"
    }
  );

  for (
    const role
    of ATTRIBUTE_ROLES
  ) {

    bindNumberValidation(
      root,
      role,
      {
        min:
          1,

        integer:
          true,

        label:
          role
            .replace(
              "attribute-",
              ""
            )
            .toUpperCase()
      }
    );
  }

  bindTypeValidation(
    root
  );

  bindAbilityRequirement(
    root
  );
}


function bindTextValidation(
  root,
  role,
  validator
) {

  const control =
    root.querySelector(
      `[data-role="${role}"]`
    );


  if (!control) {
    return;
  }


  const update =
    () => {

      setControlValidation(
        control,
        validator(
          control.value
        )
      );
    };


  control.addEventListener(
    "input",
    update
  );

  control.addEventListener(
    "change",
    update
  );


  update();
}


function bindNumberValidation(
  root,
  role,
  rule
) {

  const control =
    root.querySelector(
      `[data-role="${role}"]`
    );


  if (!control) {
    return;
  }


  const update =
    () => {

      setControlValidation(
        control,
        validateNumber(
          control.value,
          rule
        )
      );
    };


  control.addEventListener(
    "input",
    update
  );

  control.addEventListener(
    "change",
    update
  );


  update();
}


function bindTypeValidation(
  root
) {

  const primary =
    root.querySelector(
      '[data-role="primary-type"]'
    );

  const secondary =
    root.querySelector(
      '[data-role="secondary-type"]'
    );


  if (
    !primary ||
    !secondary
  ) {
    return;
  }


  const update =
    () => {

      const primaryType =
        String(
          primary.value ??
          ""
        ).trim();

      const secondaryType =
        String(
          secondary.value ??
          ""
        ).trim();


      setControlValidation(
        primary,
        validatePrimaryType(
          primaryType,
          secondaryType
        )
      );

      setControlValidation(
        secondary,
        validateSecondaryType(
          primaryType,
          secondaryType
        )
      );
    };


  primary.addEventListener(
    "change",
    update
  );

  secondary.addEventListener(
    "change",
    update
  );


  update();
}


function bindAbilityRequirement(
  root
) {

  const addButton =
    root.querySelector(
      '[data-action="add-ability"]'
    );

  const card =
    addButton?.closest(
      ".fakemon-studio__moves-card"
    );


  if (!card) {
    return;
  }


  const inputs = [
    ...card.querySelectorAll(
      '[data-role="ability-row"] [data-field="id"]'
    )
  ];

  const update =
    () => {

      const count =
        inputs.filter(
          input =>
            String(
              input.value ??
              ""
            ).trim()
        ).length;

      const validation =
        count > 0
          ? {
              kind:
                "valid",

              message:
                `${count} ${
                  count === 1
                    ? "Ability configurada"
                    : "Abilities configuradas"
                }.`
            }
          : {
              kind:
                "invalid",

              message:
                "La especie requiere al menos una Ability con ID."
            };


      setGroupValidation(
        card,
        validation
      );
    };


  for (
    const input
    of inputs
  ) {

    input.addEventListener(
      "input",
      update
    );

    input.addEventListener(
      "change",
      update
    );
  }


  update();
}


function validateRequiredName(
  value
) {

  const text =
    String(
      value ??
      ""
    ).trim();


  if (!text) {

    return {
      kind:
        "invalid",

      message:
        "Nombre obligatorio."
    };
  }


  return {
    kind:
      "valid",

    message:
      "Nombre válido."
  };
}


function validateCanonicalIdInput(
  value
) {

  const text =
    String(
      value ??
      ""
    ).trim();


  if (!text) {

    return {
      kind:
        "invalid",

      message:
        "ID canónico obligatorio."
    };
  }


  if (
    !containsCanonicalIdContent(
      text
    )
  ) {

    return {
      kind:
        "invalid",

      message:
        "El valor no genera un ID canónico válido."
    };
  }


  if (
    CANONICAL_ID_PATTERN.test(
      text
    )
  ) {

    return {
      kind:
        "valid",

      message:
        "ID ya está en formato canónico."
    };
  }


  return {
    kind:
      "warning",

    message:
      "El modelo normalizará este ID al guardar."
  };
}


function containsCanonicalIdContent(
  value
) {

  return /[a-z0-9]/i.test(
    String(
      value ??
      ""
    )
      .normalize(
        "NFD"
      )
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
  );
}


function validateNumber(
  value,
  {
    min = null,
    max = null,
    integer = false,
    emptyAsZero = false,
    label
  }
) {

  const text =
    String(
      value ??
      ""
    ).trim();


  if (
    !text &&
    !emptyAsZero
  ) {

    return {
      kind:
        "invalid",

      message:
        `${label} es obligatorio.`
    };
  }


  const numeric =
    Number(
      text
    );


  if (
    !Number.isFinite(
      numeric
    )
  ) {

    return {
      kind:
        "invalid",

      message:
        `${label} debe ser un número válido.`
    };
  }


  if (
    integer &&
    !Number.isInteger(
      numeric
    )
  ) {

    return {
      kind:
        "invalid",

      message:
        `${label} debe ser un entero.`
    };
  }


  if (
    min != null &&
    numeric < min
  ) {

    return {
      kind:
        "invalid",

      message:
        `${label} no puede ser menor que ${min}.`
    };
  }


  if (
    max != null &&
    numeric > max
  ) {

    return {
      kind:
        "invalid",

      message:
        `${label} no puede ser mayor que ${max}.`
    };
  }


  if (
    !text &&
    emptyAsZero
  ) {

    return {
      kind:
        "warning",

      message:
        `${label} vacío se normalizará como 0.`
    };
  }


  return {
    kind:
      "valid",

    message:
      `${label} válido.`
  };
}


function validatePrimaryType(
  primaryType,
  secondaryType
) {

  if (
    !VALID_TYPE_IDS.has(
      primaryType
    )
  ) {

    return {
      kind:
        "invalid",

      message:
        "Tipo primario no válido."
    };
  }


  if (
    secondaryType &&
    primaryType ===
      secondaryType
  ) {

    return {
      kind:
        "warning",

      message:
        "Coincide con el tipo secundario; se conservará una sola vez."
    };
  }


  return {
    kind:
      "valid",

    message:
      "Tipo primario válido."
  };
}


function validateSecondaryType(
  primaryType,
  secondaryType
) {

  if (!secondaryType) {

    return {
      kind:
        "neutral",

      message:
        "Tipo secundario opcional."
    };
  }


  if (
    !VALID_TYPE_IDS.has(
      secondaryType
    )
  ) {

    return {
      kind:
        "invalid",

      message:
        "Tipo secundario no válido."
    };
  }


  if (
    primaryType ===
      secondaryType
  ) {

    return {
      kind:
        "warning",

      message:
        "Duplicado del tipo primario; se conservará una sola vez."
    };
  }


  return {
    kind:
      "valid",

    message:
      "Tipo secundario válido."
  };
}


function setControlValidation(
  control,
  validation
) {

  const container =
    control.closest(
      [
        ".fakemon-studio__field",
        ".fakemon-studio__metric-card",
        ".fakemon-studio__stat-card"
      ].join(
        ","
      )
    );


  if (!container) {
    return;
  }


  container.dataset.inlineState =
    validation.kind;

  control.setAttribute(
    "aria-invalid",
    String(
      validation.kind ===
        "invalid"
    )
  );


  const feedback =
    ensureFeedbackElement(
      container
    );


  feedback.dataset.kind =
    validation.kind;

  feedback.innerHTML =
    `${statusIcon(
      validation.kind
    )}<span></span>`;


  const text =
    feedback.querySelector(
      "span"
    );


  if (text) {
    text.textContent =
      validation.message;
  }
}


function setGroupValidation(
  container,
  validation
) {

  container.dataset.inlineState =
    validation.kind;


  let feedback =
    container.querySelector(
      ":scope > [data-inline-group-validation]"
    );


  if (!feedback) {

    feedback =
      document.createElement(
        "div"
      );

    feedback.className =
      "fakemon-studio__inline-group-validation";

    feedback.dataset.inlineGroupValidation =
      "";

    container.append(
      feedback
    );
  }


  feedback.dataset.kind =
    validation.kind;

  feedback.innerHTML =
    `${statusIcon(
      validation.kind
    )}<span></span>`;


  const text =
    feedback.querySelector(
      "span"
    );


  if (text) {
    text.textContent =
      validation.message;
  }
}


function ensureFeedbackElement(
  container
) {

  let feedback =
    container.querySelector(
      ":scope > [data-inline-validation]"
    );


  if (feedback) {
    return feedback;
  }


  feedback =
    document.createElement(
      "small"
    );

  feedback.className =
    "fakemon-studio__inline-validation";

  feedback.dataset.inlineValidation =
    "";

  container.append(
    feedback
  );


  return feedback;
}


function statusIcon(
  kind
) {

  if (
    kind ===
      "valid"
  ) {

    return (
      '<i class="fa-solid fa-circle-check"></i>'
    );
  }


  if (
    kind ===
      "warning"
  ) {

    return (
      '<i class="fa-solid fa-triangle-exclamation"></i>'
    );
  }


  if (
    kind ===
      "invalid"
  ) {

    return (
      '<i class="fa-solid fa-circle-xmark"></i>'
    );
  }


  return (
    '<i class="fa-regular fa-circle"></i>'
  );
}