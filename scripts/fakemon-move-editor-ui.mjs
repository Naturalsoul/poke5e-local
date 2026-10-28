import { escapeHtml } from "./html.mjs";
import {
  POKEMON_TYPES
} from "./types.mjs";

const MODULE_ID =
  "poke5e-local";

const DEFAULT_MOVE_ICON =
  "icons/svg/sword.svg";

const MOVE_ICON_ROOT =
  `modules/${MODULE_ID}/assets/attacks`;

const ABILITY_SCORE_IDS =
  new Set([
    "str",
    "dex",
    "con",
    "int",
    "wis",
    "cha"
  ]);

const {
  TextEditor
} =
  foundry.applications.ux;


/* ============================================================
 * RENDER
 * ============================================================ */

export function renderFakemonLevelMoveEditor({
  rows,
  catalog,
  language
}) {

  return renderMoveDropZone({
    zone:
      "level-move",

    entries:
      Array.isArray(
        rows
      )
        ? rows
        : [],

    catalog,
    language,

    kind:
      "level",

    emptyMessage:
      "Sin Moves de nivel configurados.",

    dropTitle:
      "Arrastra un Move al Learnset",

    dropDescription:
      "El Move se añade en Nv. 1 y puedes cambiar el nivel después."
  });
}


export function renderFakemonEggMoveEditor({
  moveIds,
  catalog,
  language
}) {

  const entries =
    (
      Array.isArray(
        moveIds
      )
        ? moveIds
        : []
    ).map(
      moveId => ({
        moveId
      })
    );


  return renderMoveDropZone({
    zone:
      "egg-move",

    entries,
    catalog,
    language,

    kind:
      "egg",

    emptyMessage:
      "Sin Egg Moves configurados.",

    dropTitle:
      "Arrastra un Move como Egg Move",

    dropDescription:
      "El Studio guarda únicamente el ID canónico del Move."
  });
}


export function renderFakemonTmEditor({
  rows,
  catalog,
  language
}) {

  return renderMoveDropZone({
    zone:
      "tm",

    entries:
      Array.isArray(
        rows
      )
        ? rows
        : [],

    catalog,
    language,

    kind:
      "tm",

    emptyMessage:
      "Sin TMs configuradas.",

    dropTitle:
      "Arrastra una TM aquí",

    dropDescription:
      "Solo se aceptan Moves con metadata TM en el catálogo Poke5e."
  });
}


function renderMoveDropZone({
  zone,
  entries,
  catalog,
  language,
  kind,
  emptyMessage,
  dropTitle,
  dropDescription
}) {

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
              renderMoveReference({
                kind,
                reference,
                index,
                byId,
                language
              })
          )
          .join(
            ""
          )

      : renderMoveEmpty(
          emptyMessage
        );


  return `
    <div
      class="fakemon-studio__move-drop-zone"
      data-fakemon-drop-zone="${escapeAttribute(
        zone
      )}"
    >

      <div class="fakemon-studio__move-list">
        ${cards}
      </div>


      <div class="fakemon-studio__catalog-drop-hint">

        <i class="fa-solid fa-hand-pointer"></i>

        <div>

          <strong>
            ${escapeHtml(
              dropTitle
            )}
          </strong>

          <span>
            ${escapeHtml(
              dropDescription
            )}
          </span>

        </div>

      </div>

    </div>
  `;
}


function renderMoveReference({
  kind,
  reference,
  index,
  byId,
  language
}) {

  const moveId =
    String(
      reference?.moveId ??
      ""
    ).trim();


  const move =
    byId.get(
      moveId
    );


  if (!move) {

    return renderUnresolvedMove({
      kind,
      reference,
      index
    });
  }


  const type =
    normalizeId(
      move.type
    ) ||
    "typeless";


  const name =
    localizedText(
      move.name,
      language,
      moveId
    );


  return `
    <article
      class="fakemon-studio__move-card"
      data-role="${escapeAttribute(
        moveRowRole(
          kind
        )
      )}"
      data-type="${escapeAttribute(
        type
      )}"
      style="--fakemon-move-type-color: ${escapeAttribute(
        moveTypeColor(
          type
        )
      )}"
    >

      <input
        type="hidden"
        data-field="moveId"
        value="${escapeAttribute(
          moveId
        )}"
      >


      <img
        src="${escapeAttribute(
          resolveMoveIcon(
            type
          )
        )}"
        alt=""
      >


      <div class="fakemon-studio__move-card-body">

        <div class="fakemon-studio__move-card-heading">

          <strong>
            ${escapeHtml(
              name
            )}
          </strong>

          <small>
            ${escapeHtml(
              moveId
            )}
          </small>

        </div>


        <div class="fakemon-studio__move-card-meta">

          <span class="fakemon-studio__move-type-badge">
            ${escapeHtml(
              pokemonTypeLabel(
                type,
                language
              )
            )}
          </span>


          <span class="fakemon-studio__move-pp">

            <span>
              PP
            </span>

            <strong>
              ${escapeHtml(
                movePpLabel(
                  move
                )
              )}
            </strong>

          </span>


          ${renderMovePowerAbilities(
            move
          )}

        </div>

      </div>


      ${renderMoveControls({
        kind,
        reference,
        index
      })}

    </article>
  `;
}


function renderUnresolvedMove({
  kind,
  reference,
  index
}) {

  return `
    <article
      class="
        fakemon-studio__move-card
        fakemon-studio__move-card--unresolved
      "
      data-role="${escapeAttribute(
        moveRowRole(
          kind
        )
      )}"
      data-type="typeless"
      style="--fakemon-move-type-color: #8c969b"
    >

      <span class="fakemon-studio__move-card-placeholder">
        <i class="fa-solid fa-circle-question"></i>
      </span>


      <div class="fakemon-studio__reference-cell">

        <input
          type="text"
          data-field="moveId"
          data-reference-kind="move"
          list="fakemon-studio-moves"
          placeholder="move-id"
          value="${escapeAttribute(
            reference?.moveId ??
            ""
          )}"
        >


        <small
          class="fakemon-studio__reference-feedback"
          data-reference-feedback
        >
          <i class="fa-regular fa-circle"></i>

          <span>
            Selecciona un Move o arrástralo desde el Compendium.
          </span>
        </small>

      </div>


      ${renderMoveControls({
        kind,
        reference,
        index
      })}

    </article>
  `;
}


function renderMoveControls({
  kind,
  reference,
  index
}) {

  if (
    kind ===
      "level"
  ) {

    return `
      <div class="fakemon-studio__move-card-controls">

        <label class="fakemon-studio__move-level-control">

          <span>
            Nv.
          </span>

          <input
            type="number"
            data-field="level"
            min="1"
            max="20"
            step="1"
            value="${escapeAttribute(
              reference?.level ??
              1
            )}"
          >

        </label>


        ${renderRemoveButton(
          "remove-level-move",
          index,
          "Eliminar Move"
        )}

      </div>
    `;
  }


  if (
    kind ===
      "tm"
  ) {

    return `
      <div
        class="
          fakemon-studio__move-card-controls
          fakemon-studio__move-card-controls--tm
        "
      >

        <label class="fakemon-studio__move-tm-control">

          <span>
            TM #
          </span>

          <input
            class="fakemon-studio__tm-number"
            type="number"
            data-field="id"
            min="0"
            step="1"
            value="${escapeAttribute(
              reference?.id ??
              0
            )}"
          >

        </label>


        <label class="fakemon-studio__move-tm-control">

          <span>
            Coste
          </span>

          <input
            class="fakemon-studio__tm-cost"
            type="number"
            data-field="cost"
            min="0"
            step="1"
            value="${escapeAttribute(
              reference?.cost ??
              0
            )}"
          >

        </label>


        ${renderRemoveButton(
          "remove-tm",
          index,
          "Eliminar TM"
        )}

      </div>
    `;
  }


  return `
    <div class="fakemon-studio__move-card-controls">

      ${renderRemoveButton(
        "remove-egg-move",
        index,
        "Eliminar Egg Move"
      )}

    </div>
  `;
}


function renderMovePowerAbilities(
  move
) {

  const abilities =
    Array.isArray(
      move?.powerAbilities
    )

      ? [
          ...new Set(
            move.powerAbilities
              .map(
                normalizeId
              )
              .filter(
                abilityId =>
                  ABILITY_SCORE_IDS.has(
                    abilityId
                  )
              )
          )
        ]

      : [];


  if (!abilities.length) {
    return "";
  }


  return `
    <span class="fakemon-studio__move-power">

      <span class="fakemon-studio__move-power-label">
        STAT
      </span>

      <span class="fakemon-studio__move-power-values">

        ${
          abilities
            .map(
              abilityId => `
                <strong
                  class="fakemon-studio__move-power-ability"
                  data-ability="${escapeAttribute(
                    abilityId
                  )}"
                >
                  ${escapeHtml(
                    abilityId.toUpperCase()
                  )}
                </strong>
              `
            )
            .join(
              ""
            )
        }

      </span>

    </span>
  `;
}


function renderMoveEmpty(
  message
) {

  return `
    <div class="fakemon-studio__move-empty">

      <i class="fa-solid fa-circle-info"></i>

      <span>
        ${escapeHtml(
          message
        )}
      </span>

    </div>
  `;
}


function renderRemoveButton(
  action,
  index,
  title
) {

  return `
    <button
      type="button"
      class="fakemon-studio__remove"
      data-action="${escapeAttribute(
        action
      )}"
      data-index="${index}"
      title="${escapeAttribute(
        title
      )}"
      aria-label="${escapeAttribute(
        title
      )}"
    >
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;
}


/* ============================================================
 * DRAG & DROP
 * ============================================================ */

export function bindFakemonMoveDrops(
  root,
  {
    onLevelMoveDrop,
    onEggMoveDrop,
    onTmDrop
  } = {}
) {

  const bindings = [
    [
      "level-move",
      onLevelMoveDrop
    ],

    [
      "egg-move",
      onEggMoveDrop
    ],

    [
      "tm",
      onTmDrop
    ]
  ];


  for (
    const [
      zoneId,
      callback
    ]
    of bindings
  ) {

    bindMoveDropZone(
      root,
      zoneId,
      callback
    );
  }
}


function bindMoveDropZone(
  root,
  zoneId,
  callback
) {

  const zone =
    root.querySelector(
      `[data-fakemon-drop-zone="${zoneId}"]`
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


      void handleMoveDrop(
        event,
        callback
      );
    }
  );
}


async function handleMoveDrop(
  event,
  callback
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
        "Solo puedes soltar Items del Compendium Poke5e Moves."
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
      `[${MODULE_ID}] No se pudo resolver el Move arrastrado.`,
      error
    );

    ui.notifications.error(
      "No se pudo leer el Move arrastrado."
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
      "move-template"
  ) {

    ui.notifications.warn(
      "Arrastra un Move desde el Compendium Poke5e Moves."
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
      "El Move arrastrado no contiene un sourceId canónico."
    );

    return;
  }


  await callback?.({
    sourceId,
    item
  });
}


/* ============================================================
 * DISPLAY
 * ============================================================ */

function moveRowRole(
  kind
) {

  if (
    kind ===
      "level"
  ) {
    return "level-move-row";
  }


  if (
    kind ===
      "tm"
  ) {
    return "tm-row";
  }


  return "egg-move-row";
}


function resolveMoveIcon(
  moveType
) {

  const type =
    normalizeId(
      moveType
    );


  if (
    !type ||
    type ===
      "typeless" ||
    !POKEMON_TYPES[
      type
    ]
  ) {

    return DEFAULT_MOVE_ICON;
  }


  return (
    `${MOVE_ICON_ROOT}/${type}.png`
  );
}


function moveTypeColor(
  type
) {

  return (
    POKEMON_TYPES[
      normalizeId(
        type
      )
    ]?.color ??
    "#8c969b"
  );
}


function movePpLabel(
  move
) {

  const pp =
    Number(
      move?.pp
    );


  return (
    Number.isFinite(
      pp
    ) &&
    pp > 0
  )
    ? String(
        Math.trunc(
          pp
        )
      )
    : "∞";
}


function pokemonTypeLabel(
  type,
  language
) {

  const normalized =
    normalizeId(
      type
    );


  if (
    normalized ===
      "typeless"
  ) {

    return (
      language ===
        "en"
        ? "Typeless"
        : "Sin tipo"
    );
  }


  return (
    POKEMON_TYPES[
      normalized
    ]?.[
      language
    ] ??
    POKEMON_TYPES[
      normalized
    ]?.en ??
    normalized
  );
}


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
      .filter(
        Boolean
      )
      .join(
        " "
      );
  }


  return String(
    resolved ??
    fallback
  ).trim();
}


function normalizeId(
  value
) {

  return String(
    value ??
    ""
  )
    .trim()
    .toLowerCase();
}



function escapeAttribute(
  value
) {

  return escapeHtml(
    value
  );
}