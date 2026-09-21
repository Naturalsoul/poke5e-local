const MODULE_ID =
  "poke5e-local";

const DEFAULT_ABILITY_ICON =
  "icons/svg/aura.svg";

const {
  TextEditor
} =
  foundry.applications.ux;


/* ============================================================
 * ABILITIES
 * ============================================================ */

export function renderFakemonAbilityEditor({
  abilityRefs,
  catalog,
  language
}) {

  const entries =
    Array.isArray(
      abilityRefs
    )
      ? abilityRefs
      : [];


  const byId =
    catalogById(
      catalog
    );


  const cards =
    entries.length
      ? entries
          .map(
            (
              reference,
              index
            ) =>
              renderAbilityReference({
                reference,
                index,
                byId,
                language
              })
          )
          .join("")
      : renderAbilityEmpty();


  return `
    <div
      class="fakemon-studio__ability-drop-zone"
      data-fakemon-drop-zone="ability"
    >

      <div class="fakemon-studio__ability-list">
        ${cards}
      </div>


      <div class="fakemon-studio__catalog-drop-hint">

        <i class="fa-solid fa-hand-pointer"></i>

        <div>

          <strong>
            Arrastra una Ability aquí
          </strong>

          <span>
            Usa el Compendium Poke5e Abilities.
            El Studio guarda solo su ID canónico.
          </span>

        </div>

      </div>

    </div>
  `;
}


/* ============================================================
 * DRAG & DROP
 * ============================================================ */

export function bindFakemonAbilityDrop(
  root,
  {
    onAbilityDrop
  } = {}
) {

  const zone =
    root.querySelector(
      '[data-fakemon-drop-zone="ability"]'
    );


  if (!zone) {
    return;
  }


  zone.addEventListener(
    "dragenter",
    event => {

      event.preventDefault();


      zone.classList.add(
        "is-drag-over"
      );
    }
  );


  zone.addEventListener(
    "dragover",
    event => {

      event.preventDefault();


      if (
        event.dataTransfer
      ) {

        event.dataTransfer.dropEffect =
          "copy";
      }
    }
  );


  zone.addEventListener(
    "dragleave",
    event => {

      const nextTarget =
        event.relatedTarget;


      if (
        nextTarget instanceof
          HTMLElement &&
        zone.contains(
          nextTarget
        )
      ) {
        return;
      }


      zone.classList.remove(
        "is-drag-over"
      );
    }
  );


  zone.addEventListener(
    "drop",
    event => {

      event.preventDefault();


      zone.classList.remove(
        "is-drag-over"
      );


      void handleAbilityDrop(
        event,
        onAbilityDrop
      );
    }
  );
}


async function handleAbilityDrop(
  event,
  onAbilityDrop
) {

  let item;


  try {

    const data =
      TextEditor.getDragEventData(
        event
      );


    if (
      data?.type !==
        "Item"
    ) {

      ui.notifications.warn(
        "Solo puedes soltar Items del Compendium Poke5e Abilities."
      );

      return;
    }


    item =
      await Item.implementation
        .fromDropData(
          data
        );

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] No se pudo resolver la Ability arrastrada.`,
      error
    );


    ui.notifications.error(
      "No se pudo leer la Ability arrastrada."
    );

    return;
  }


  if (
    item?.documentName !==
      "Item" ||
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "ability-template"
  ) {

    ui.notifications.warn(
      "Arrastra una Ability desde el Compendium Poke5e Abilities."
    );

    return;
  }


  const sourceId =
    String(
      item.getFlag(
        MODULE_ID,
        "sourceId"
      ) ??
      ""
    ).trim();


  if (!sourceId) {

    ui.notifications.error(
      "La Ability arrastrada no contiene un sourceId canónico."
    );

    return;
  }


  await onAbilityDrop?.({
    sourceId,
    item
  });
}


/* ============================================================
 * ABILITY CARD
 * ============================================================ */

function renderAbilityReference({
  reference,
  index,
  byId,
  language
}) {

  const abilityId =
    String(
      reference?.id ??
      ""
    );


  const ability =
    byId.get(
      abilityId
    );


  if (!ability) {

    return renderUnresolvedAbility({
      reference,
      index
    });
  }


  const name =
    localizedText(
      ability.name,
      language,
      abilityId
    );


  const description =
    localizedText(
      ability.description,
      language,
      ""
    );


  return `
    <article
      class="fakemon-studio__ability-card"
      data-role="ability-row"
    >

      <input
        type="hidden"
        data-field="id"
        value="${escapeAttribute(
          abilityId
        )}"
      >


      <img
        src="${escapeAttribute(
          DEFAULT_ABILITY_ICON
        )}"
        alt=""
      >


      <div class="fakemon-studio__ability-card-body">

        <div class="fakemon-studio__ability-card-heading">

          <div>

            <strong>
              ${escapeHtml(
                name
              )}
            </strong>

            <small>
              ${escapeHtml(
                abilityId
              )}
            </small>

          </div>


          <div class="fakemon-studio__ability-card-actions">

            <label class="fakemon-studio__hidden-ability-toggle">

              <input
                type="checkbox"
                data-field="hidden"
                ${reference?.hidden ? "checked" : ""}
              >

              <span>
                <i class="fa-solid fa-eye-slash"></i>
                Hidden Ability
              </span>

            </label>


            <button
              type="button"
              class="fakemon-studio__remove"
              data-action="remove-ability"
              data-index="${index}"
              title="Eliminar Ability"
              aria-label="Eliminar Ability"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>

          </div>

        </div>


        ${
          description
            ? `
                <p>
                  ${escapeHtml(
                    description
                  )}
                </p>
              `
            : `
                <p class="hint">
                  Sin descripción Poke5e disponible.
                </p>
              `
        }

      </div>

    </article>
  `;
}


/* ============================================================
 * MANUAL / INVALID REFERENCE
 * ============================================================ */

function renderUnresolvedAbility({
  reference,
  index
}) {

  return `
    <div
      class="
        fakemon-studio__ability-card
        fakemon-studio__ability-card--unresolved
      "
      data-role="ability-row"
    >

      <span class="fakemon-studio__ability-card-placeholder">
        <i class="fa-solid fa-circle-question"></i>
      </span>


      <div class="fakemon-studio__reference-cell">

        <input
          type="text"
          data-field="id"
          data-reference-kind="ability"
          list="fakemon-studio-abilities"
          placeholder="ability-id"
          value="${escapeAttribute(
            reference?.id ??
            ""
          )}"
        >

        <small
          class="fakemon-studio__reference-feedback"
          data-reference-feedback
        >
          <i class="fa-regular fa-circle"></i>

          <span>
            Selecciona una Ability o arrástrala desde el Compendium.
          </span>
        </small>

      </div>


      <div class="fakemon-studio__ability-card-actions">

        <label class="fakemon-studio__hidden-ability-toggle">

          <input
            type="checkbox"
            data-field="hidden"
            ${reference?.hidden ? "checked" : ""}
          >

          <span>
            <i class="fa-solid fa-eye-slash"></i>
            Hidden
          </span>

        </label>


        <button
          type="button"
          class="fakemon-studio__remove"
          data-action="remove-ability"
          data-index="${index}"
          title="Eliminar Ability"
          aria-label="Eliminar Ability"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>

      </div>

    </div>
  `;
}


function renderAbilityEmpty() {

  return `
    <div class="fakemon-studio__ability-empty">

      <i class="fa-solid fa-star"></i>

      <span>
        Sin Abilities configuradas.
      </span>

    </div>
  `;
}


/* ============================================================
 * CATALOG
 * ============================================================ */

function catalogById(
  catalog
) {

  return new Map(
    (
      Array.isArray(
        catalog
      )
        ? catalog
        : []
    )
      .filter(
        entry =>
          entry?.id
      )
      .map(
        entry => [
          String(
            entry.id
          ),

          entry
        ]
      )
  );
}


function localizedText(
  value,
  language,
  fallback = ""
) {

  let resolved =
    value;


  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {

    resolved =
      value[
        language
      ] ??
      value.en ??
      value.es ??
      fallback;
  }


  if (
    Array.isArray(
      resolved
    )
  ) {

    return resolved
      .map(
        entry =>
          String(
            entry ??
            ""
          ).trim()
      )
      .filter(Boolean)
      .join(" ");
  }


  return String(
    resolved ??
    fallback
  ).trim();
}


/* ============================================================
 * ESCAPE
 * ============================================================ */

function escapeHtml(
  value
) {

  return String(
    value ??
    ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );
}