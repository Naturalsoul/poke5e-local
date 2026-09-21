import {
  buildPokemonMedia
} from "./builder.mjs";

const MODULE_ID =
  "poke5e-local";

const MODULE_ASSET_ROOT =
  `modules/${MODULE_ID}/assets/`;

const MEDIA_FIELDS = [
  {
    key:
      "portrait",

    variant:
      "normal",

    role:
      "portrait",

    title:
      "Portrait",

    icon:
      "fa-solid fa-user",

    placeholder:
      "unofficial/species/main.png",

    hint:
      "Imagen principal del Actor."
  },

  {
    key:
      "token",

    variant:
      "normal",

    role:
      "token",

    title:
      "Token",

    icon:
      "fa-solid fa-circle-dot",

    placeholder:
      "unofficial/species/token.png",

    hint:
      "Vacío = utiliza el Portrait normal."
  },

  {
    key:
      "portraitShiny",

    variant:
      "shiny",

    role:
      "portrait-shiny",

    title:
      "Shiny Portrait",

    icon:
      "fa-solid fa-star",

    placeholder:
      "unofficial/species/main-shiny.png",

    hint:
      "Portrait utilizado cuando el Pokémon es Shiny."
  },

  {
    key:
      "tokenShiny",

    variant:
      "shiny",

    role:
      "token-shiny",

    title:
      "Shiny Token",

    icon:
      "fa-solid fa-wand-magic-sparkles",

    placeholder:
      "unofficial/species/token-shiny.png",

    hint:
      "Vacío = utiliza el Shiny Portrait si existe."
  }
];


export function renderFakemonMediaEditor({
  media,
  visible
}) {

  const previews =
    buildPreviewEntries(
      normalizeMediaDraft(
        media
      )
    );


  return `
    <section
      class="fakemon-studio__panel fakemon-studio__panel--media"
      data-studio-tab="media"
      ${visible ? "" : "hidden"}
    >

      <header>
        <i class="fa-solid fa-image"></i>

        <h3>
          Media & Artwork
        </h3>

        <small>
          Preview final de Foundry
        </small>
      </header>


      <div class="fakemon-studio__media-columns">

        ${renderVariant({
          title:
            "Normal",

          icon:
            "fa-solid fa-circle",

          kind:
            "normal",

          previews:
            previews.filter(
              entry =>
                entry.variant ===
                  "normal"
            )
        })}


        ${renderVariant({
          title:
            "Shiny",

          icon:
            "fa-solid fa-star",

          kind:
            "shiny",

          previews:
            previews.filter(
              entry =>
                entry.variant ===
                  "shiny"
            )
        })}

      </div>


      <p class="fakemon-studio__media-hint">
        Las rutas se resuelven con el mismo Builder que utiliza la importación.
        Usa rutas relativas a <strong>assets/</strong>, por ejemplo
        <code>unofficial/drakeon/main.png</code>.
      </p>

    </section>
  `;
}


export function bindFakemonMediaEditor(
  root
) {

  for (
    const field
    of MEDIA_FIELDS
  ) {

    const input =
      root.querySelector(
        `[data-role="${field.role}"]`
      );


    input?.addEventListener(
      "input",
      () => {

        updateMediaPreviews(
          root
        );
      }
    );


    input?.addEventListener(
      "change",
      () => {

        updateMediaPreviews(
          root
        );
      }
    );
  }


  bindMediaFilePickers(
    root
  );


  root
    .querySelectorAll(
      "[data-media-preview-image]"
    )
    .forEach(
      image => {

        image.addEventListener(
          "error",
          () => {

            setPreviewLoadState(
              root,
              image.dataset
                .mediaPreviewImage,
              false
            );
          }
        );


        image.addEventListener(
          "load",
          () => {

            setPreviewLoadState(
              root,
              image.dataset
                .mediaPreviewImage,
              true
            );
          }
        );
      }
    );


  updateMediaPreviews(
    root
  );
}


function renderVariant({
  title,
  icon,
  kind,
  previews
}) {

  return `
    <section
      class="fakemon-studio__media-variant"
      data-kind="${escapeAttribute(
        kind
      )}"
    >

      <div class="fakemon-studio__media-variant-header">

        <i class="${icon}"></i>

        <strong>
          ${escapeHtml(
            title
          )}
        </strong>

      </div>


      <div class="fakemon-studio__media-preview-grid">

        ${
          previews
            .map(
              renderPreviewCard
            )
            .join(
              ""
            )
        }

      </div>

    </section>
  `;
}


function renderPreviewCard(
  preview
) {

  const hasSource =
    Boolean(
      preview.src
    );


  return `
    <article
      class="fakemon-studio__media-card"
      data-media-preview-card="${escapeAttribute(
        preview.key
      )}"
      data-state="${escapeAttribute(
        preview.state
      )}"
    >

      <div class="fakemon-studio__media-card-header">

        <div>

          <i class="${preview.icon}"></i>

          <strong>
            ${escapeHtml(
              preview.title
            )}
          </strong>

        </div>


        <span
          class="fakemon-studio__media-status"
          data-media-preview-status="${escapeAttribute(
            preview.key
          )}"
        >
          ${escapeHtml(
            preview.status
          )}
        </span>

      </div>


      <div class="fakemon-studio__media-preview">

        <img
          data-media-preview-image="${escapeAttribute(
            preview.key
          )}"
          ${
            hasSource
              ? `src="${escapeAttribute(
                  preview.src
                )}"`
              : ""
          }
          alt="Preview ${escapeAttribute(
            preview.title
          )}"
          ${hasSource ? "" : "hidden"}
        >


        <div
          class="fakemon-studio__media-placeholder"
          data-media-preview-placeholder="${escapeAttribute(
            preview.key
          )}"
          ${hasSource ? "hidden" : ""}
        >

          <i class="fa-regular fa-image"></i>

          <span>
            Sin imagen
          </span>

        </div>

      </div>


      <div class="fakemon-studio__media-path">

        <span>
            Ruta
        </span>


        <div class="fakemon-studio__media-path-control">

            <input
            type="text"
            name="fakemon-media-${escapeAttribute(
                preview.role
            )}"
            data-role="${escapeAttribute(
                preview.role
            )}"
            value="${escapeAttribute(
                preview.rawValue
            )}"
            placeholder="${escapeAttribute(
                preview.placeholder
            )}"
            aria-label="Ruta ${escapeAttribute(
                preview.title
            )}"
            >


            <button
              type="button"
              class="fakemon-studio__media-browse"
              data-action="browse-media"
              data-media-role="${escapeAttribute(
                preview.role
              )}"
              title="Seleccionar imagen"
              aria-label="Seleccionar ${escapeAttribute(
                preview.title
              )}"
            >
              <i class="fa-solid fa-folder-open"></i>
            </button>

        </div>


        <small>
            ${escapeHtml(
            preview.hint
            )}
        </small>

      </div>
    </article>
  `;
}

function bindMediaFilePickers(
  root
) {

  root
    .querySelectorAll(
      '[data-action="browse-media"]'
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const role =
              String(
                button.dataset
                  .mediaRole ??
                ""
              );


            const definition =
              MEDIA_FIELDS.find(
                field =>
                  field.role ===
                    role
              );


            const input =
              root.querySelector(
                `[data-role="${role}"]`
              );


            if (
              !definition ||
              !(
                input instanceof
                  HTMLInputElement
              )
            ) {
              return;
            }


            void openMediaFilePicker({
              root,
              input,
              definition
            });
          }
        );
      }
    );
}

async function openMediaFilePicker({
  root,
  input,
  definition
}) {

  const FilePicker =
    foundry
      .applications
      .apps
      .FilePicker
      .implementation;


  const previewCard =
    root.querySelector(
      `[data-media-preview-card="${definition.key}"]`
    );


  /*
   * Si la ruta escrita actualmente corresponde
   * a una imagen que cargó correctamente,
   * abrimos el FilePicker en esa ubicación.
   *
   * Si está vacía o es inválida, comenzamos
   * desde la carpeta assets del módulo.
   */

  const hasValidCurrent =
    Boolean(
      String(
        input.value ??
        ""
      ).trim()
    ) &&
    !previewCard?.classList.contains(
      "is-error"
    );


  const current =
    hasValidCurrent
      ? mediaPathForPicker(
          input.value
        )
      : MODULE_ASSET_ROOT;


  const picker =
    new FilePicker({
      type:
        "image",

      activeSource:
        "data",

      current,

      callback:
        selectedPath => {

          const canonicalPath =
            canonicalMediaPathFromPicker(
              selectedPath
            );


          if (!canonicalPath) {

            ui.notifications.warn(
              "Selecciona una imagen dentro de " +
              `${MODULE_ASSET_ROOT}.`
            );

            return;
          }


          input.value =
            canonicalPath;


          input.dispatchEvent(
            new Event(
              "input",
              {
                bubbles:
                  true
              }
            )
          );
        }
    });


  try {

    await picker.browse();

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] Error abriendo FilePicker de Fakemon Studio`,
      error
    );


    ui.notifications.error(
      "No se pudo abrir el selector de imágenes."
    );
  }
}

function mediaPathForPicker(
  value
) {

  let path =
    String(
      value ??
      ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      )
      .trim();


  if (!path) {
    return MODULE_ASSET_ROOT;
  }


  if (
    path
      .toLowerCase()
      .startsWith(
        MODULE_ASSET_ROOT
      )
  ) {

    return path;
  }


  path =
    path.replace(
      /^assets\//i,
      ""
    );


  return (
    `${MODULE_ASSET_ROOT}${path}`
  );
}

function canonicalMediaPathFromPicker(
  value
) {

  const path =
    String(
      value ??
      ""
    )
      .replace(
        /\\/g,
        "/"
      )
      .replace(
        /^\/+/,
        ""
      )
      .trim();


  if (!path) {
    return "";
  }


  if (
    !path
      .toLowerCase()
      .startsWith(
        MODULE_ASSET_ROOT
      )
  ) {

    return "";
  }


  return path.slice(
    MODULE_ASSET_ROOT.length
  );
}

function buildPreviewEntries(
  rawMedia
) {

  const resolvedMedia =
    buildPokemonMedia({
      media:
        rawMedia
    });


  return MEDIA_FIELDS.map(
    field => ({
      ...field,

      rawValue:
        rawMedia[
          field.key
        ],

      src:
        resolvedMedia[
          field.key
        ],

      ...mediaPreviewStatus(
        field.key,
        rawMedia
      )
    })
  );
}


function mediaPreviewStatus(
  key,
  media
) {

  if (
    media[
      key
    ]
  ) {

    return {
      state:
        "custom",

      status:
        "Configurado"
    };
  }


  if (
    key ===
      "portrait"
  ) {

    return {
      state:
        "fallback",

      status:
        "Icono por defecto"
    };
  }


  if (
    key ===
      "token"
  ) {

    return {
      state:
        "fallback",

      status:
        "Usa Portrait"
    };
  }


  if (
    key ===
      "tokenShiny" &&
    media.portraitShiny
  ) {

    return {
      state:
        "fallback",

      status:
        "Usa Shiny Portrait"
    };
  }


  return {
    state:
      "empty",

    status:
      "Sin artwork"
  };
}


function updateMediaPreviews(
  root
) {

  const previews =
    buildPreviewEntries(
      readMediaDraft(
        root
      )
    );


  for (
    const preview
    of previews
  ) {

    const card =
      root.querySelector(
        `[data-media-preview-card="${preview.key}"]`
      );

    const image =
      root.querySelector(
        `[data-media-preview-image="${preview.key}"]`
      );

    const placeholder =
      root.querySelector(
        `[data-media-preview-placeholder="${preview.key}"]`
      );

    const status =
      root.querySelector(
        `[data-media-preview-status="${preview.key}"]`
      );


    if (
      !card ||
      !image ||
      !placeholder ||
      !status
    ) {
      continue;
    }


    card.classList.remove(
      "is-error"
    );

    card.dataset.state =
      preview.state;

    status.textContent =
      preview.status;


    if (
      !preview.src
    ) {

      image.hidden =
        true;

      image.removeAttribute(
        "src"
      );

      placeholder.hidden =
        false;

      continue;
    }


    placeholder.hidden =
      true;

    image.hidden =
      false;


    if (
      image.getAttribute(
        "src"
      ) !==
        preview.src
    ) {

      image.setAttribute(
        "src",
        preview.src
      );
    }
  }
}


function setPreviewLoadState(
  root,
  previewKey,
  loaded
) {

  if (!previewKey) {
    return;
  }


  const card =
    root.querySelector(
      `[data-media-preview-card="${previewKey}"]`
    );

  const image =
    root.querySelector(
      `[data-media-preview-image="${previewKey}"]`
    );

  const placeholder =
    root.querySelector(
      `[data-media-preview-placeholder="${previewKey}"]`
    );

  const status =
    root.querySelector(
      `[data-media-preview-status="${previewKey}"]`
    );


  if (
    !card ||
    !image ||
    !placeholder ||
    !status
  ) {
    return;
  }


  card.classList.toggle(
    "is-error",
    !loaded
  );


  if (loaded) {

    image.hidden =
      false;

    placeholder.hidden =
      true;

    return;
  }


  image.hidden =
    true;

  placeholder.hidden =
    false;

  status.textContent =
    "No se pudo cargar";
}


function readMediaDraft(
  root
) {

  const value =
    role =>
      root
        .querySelector(
          `[data-role="${role}"]`
        )
        ?.value ??
      "";


  return normalizeMediaDraft({
    portrait:
      value(
        "portrait"
      ),

    token:
      value(
        "token"
      ),

    portraitShiny:
      value(
        "portrait-shiny"
      ),

    tokenShiny:
      value(
        "token-shiny"
      )
  });
}


function normalizeMediaDraft(
  media
) {

  return {
    portrait:
      String(
        media?.portrait ??
        ""
      ).trim(),

    token:
      String(
        media?.token ??
        ""
      ).trim(),

    portraitShiny:
      String(
        media?.portraitShiny ??
        ""
      ).trim(),

    tokenShiny:
      String(
        media?.tokenShiny ??
        ""
      ).trim()
  };
}


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