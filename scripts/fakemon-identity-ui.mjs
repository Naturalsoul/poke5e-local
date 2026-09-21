import {
  buildPokemonMedia
} from "./builder.mjs";

import {
  POKEMON_TYPES,
  POKEMON_TYPE_IDS
} from "./types.mjs";


export function renderFakemonEditorIdentity({
  draft,
  originalId,
  language
}) {

  const portrait =
    speciesPortraitSource(
      draft
    );

  const typeIds =
    speciesTypeIds(
      draft
    );


  return `
    <div class="fakemon-studio__editor-identity">

      <div
        class="fakemon-studio__identity-art"
        data-studio-identity-art
      >

        <img
          data-studio-identity-portrait
          ${
            portrait
              ? `src="${escapeAttribute(
                  portrait
                )}"`
              : ""
          }
          alt=""
          ${portrait ? "" : "hidden"}
        >


        <span
          class="fakemon-studio__identity-art-fallback"
          data-studio-identity-fallback
          ${portrait ? "hidden" : ""}
        >
          <i class="fa-solid fa-dna"></i>
        </span>

      </div>


      <div class="fakemon-studio__identity-copy">

        <small>
          ${
            originalId
              ? "Editando especie"
              : "Nueva especie"
          }
        </small>


        <div class="fakemon-studio__identity-title">

          <h2 data-studio-identity-name>
            ${escapeHtml(
              draft.name ||
              "Nuevo Fakemon"
            )}
          </h2>


          <span
            class="fakemon-studio__identity-id"
            data-studio-identity-id
          >
            ${escapeHtml(
              draft.id ||
              "sin-id"
            )}
          </span>

        </div>


        <div class="fakemon-studio__identity-meta">

          <div
            class="fakemon-studio__identity-types"
            data-studio-identity-types
          >
            ${renderIdentityTypeBadges(
              typeIds,
              language
            )}
          </div>


          <span class="fakemon-studio__identity-metric">
            <span>SR</span>

            <strong data-studio-identity-sr>
              ${escapeHtml(
                String(
                  draft.sr ??
                  0
                )
              )}
            </strong>
          </span>


          <span class="fakemon-studio__identity-metric">
            <span>Nv.</span>

            <strong data-studio-identity-level>
              ${escapeHtml(
                String(
                  draft.minimumLevel ??
                  1
                )
              )}
            </strong>
          </span>

        </div>

      </div>

    </div>
  `;
}


export function renderFakemonSpeciesThumbnail(
  species
) {

  const thumbnail =
    speciesThumbnailSource(
      species
    );


  return `
    <span class="fakemon-studio__species-icon">

      ${
        thumbnail
          ? `
            <img
              data-species-thumbnail
              src="${escapeAttribute(
                thumbnail
              )}"
              alt=""
            >
          `
          : ""
      }

      <i class="fa-solid fa-dna"></i>

    </span>
  `;
}


export function bindFakemonIdentityUi(
  root,
  {
    language
  }
) {

  bindEditorIdentity(
    root,
    language
  );

  bindSpeciesThumbnailFallbacks(
    root
  );
}


function bindEditorIdentity(
  root,
  language
) {

  const roles = [
    "species-name",
    "species-id",
    "primary-type",
    "secondary-type",
    "sr",
    "minimum-level",
    "portrait"
  ];


  const update =
    () => {

      updateEditorIdentity(
        root,
        language
      );
    };


  for (
    const role
    of roles
  ) {

    const control =
      root.querySelector(
        `[data-role="${role}"]`
      );


    if (!control) {
      continue;
    }


    control.addEventListener(
      "input",
      update
    );


    if (
      control instanceof
        HTMLSelectElement
    ) {

      control.addEventListener(
        "change",
        update
      );
    }
  }


  const image =
    root.querySelector(
      "[data-studio-identity-portrait]"
    );


  image?.addEventListener(
    "load",
    () => {

      setIdentityArtworkState(
        root,
        true
      );
    }
  );


  image?.addEventListener(
    "error",
    () => {

      setIdentityArtworkState(
        root,
        false
      );
    }
  );


  update();


  if (
    image?.complete &&
    image.getAttribute(
      "src"
    )
  ) {

    setIdentityArtworkState(
      root,
      image.naturalWidth >
        0
    );
  }
}


function updateEditorIdentity(
  root,
  language
) {

  const value =
    role =>
      String(
        root
          .querySelector(
            `[data-role="${role}"]`
          )
          ?.value ??
        ""
      ).trim();


  const name =
    root.querySelector(
      "[data-studio-identity-name]"
    );

  const id =
    root.querySelector(
      "[data-studio-identity-id]"
    );

  const typeContainer =
    root.querySelector(
      "[data-studio-identity-types]"
    );

  const sr =
    root.querySelector(
      "[data-studio-identity-sr]"
    );

  const level =
    root.querySelector(
      "[data-studio-identity-level]"
    );


  if (name) {

    name.textContent =
      value(
        "species-name"
      ) ||
      "Nuevo Fakemon";
  }


  if (id) {

    id.textContent =
      value(
        "species-id"
      ) ||
      "sin-id";
  }


  if (typeContainer) {

    typeContainer.innerHTML =
      renderIdentityTypeBadges(
        uniqueTypeIds([
          value(
            "primary-type"
          ),

          value(
            "secondary-type"
          )
        ]),
        language
      );
  }


  if (sr) {

    sr.textContent =
      value(
        "sr"
      ) ||
      "0";
  }


  if (level) {

    level.textContent =
      value(
        "minimum-level"
      ) ||
      "1";
  }


  updateIdentityPortrait(
    root,
    value(
      "portrait"
    )
  );
}


function updateIdentityPortrait(
  root,
  rawPortrait
) {

  const image =
    root.querySelector(
      "[data-studio-identity-portrait]"
    );


  if (!image) {
    return;
  }


  if (!rawPortrait) {

    image.hidden =
      true;

    image.removeAttribute(
      "src"
    );

    setIdentityArtworkState(
      root,
      false
    );

    return;
  }


  const portrait =
    buildPokemonMedia({
      media: {
        portrait:
          rawPortrait
      }
    }).portrait;


  if (!portrait) {

    setIdentityArtworkState(
      root,
      false
    );

    return;
  }


  image.hidden =
    false;


  if (
    image.getAttribute(
      "src"
    ) !==
      portrait
  ) {

    image.setAttribute(
      "src",
      portrait
    );

    return;
  }


  if (image.complete) {

    setIdentityArtworkState(
      root,
      image.naturalWidth >
        0
    );
  }
}


function setIdentityArtworkState(
  root,
  loaded
) {

  const art =
    root.querySelector(
      "[data-studio-identity-art]"
    );

  const image =
    root.querySelector(
      "[data-studio-identity-portrait]"
    );

  const fallback =
    root.querySelector(
      "[data-studio-identity-fallback]"
    );


  if (
    !art ||
    !image ||
    !fallback
  ) {
    return;
  }


  art.classList.toggle(
    "has-image",
    loaded
  );

  image.hidden =
    !loaded;

  fallback.hidden =
    loaded;
}


function bindSpeciesThumbnailFallbacks(
  root
) {

  root
    .querySelectorAll(
      "[data-species-thumbnail]"
    )
    .forEach(
      image => {

        const icon =
          image.closest(
            ".fakemon-studio__species-icon"
          );


        if (!icon) {
          return;
        }


        const setLoaded =
          loaded => {

            icon.classList.toggle(
              "has-image",
              loaded
            );

            image.hidden =
              !loaded;
          };


        image.addEventListener(
          "load",
          () => {

            setLoaded(
              true
            );
          }
        );


        image.addEventListener(
          "error",
          () => {

            setLoaded(
              false
            );
          }
        );


        if (image.complete) {

          setLoaded(
            image.naturalWidth >
              0
          );
        }
      }
    );
}


function speciesPortraitSource(
  species
) {

  const portrait =
    String(
      species?.media?.portrait ??
      ""
    ).trim();


  if (!portrait) {
    return "";
  }


  return (
    buildPokemonMedia(
      species
    ).portrait ??
    ""
  );
}


function speciesThumbnailSource(
  species
) {

  const token =
    String(
      species?.media?.token ??
      ""
    ).trim();

  const portrait =
    String(
      species?.media?.portrait ??
      ""
    ).trim();


  if (
    !token &&
    !portrait
  ) {
    return "";
  }


  return (
    buildPokemonMedia(
      species
    ).token ??
    ""
  );
}


function speciesTypeIds(
  species
) {

  return uniqueTypeIds([
    species?.primaryType,

    ...(
      species?.types ??
      []
    )
  ]);
}


function uniqueTypeIds(
  types
) {

  return types
    .map(
      type =>
        String(
          type ??
          ""
        ).trim()
    )
    .filter(
      (
        type,
        index,
        values
      ) =>
        POKEMON_TYPE_IDS.includes(
          type
        ) &&
        values.indexOf(
          type
        ) ===
          index
    );
}


function renderIdentityTypeBadges(
  typeIds,
  language
) {

  if (!typeIds.length) {

    return `
      <span class="fakemon-studio__type-badge">
        Sin tipo
      </span>
    `;
  }


  return typeIds
    .map(
      type => `
        <span
          class="fakemon-studio__type-badge"
          data-type="${escapeAttribute(
            type
          )}"
        >
          ${escapeHtml(
            pokemonTypeLabel(
              type,
              language
            )
          )}
        </span>
      `
    )
    .join(
      ""
    );
}


function pokemonTypeLabel(
  type,
  language
) {

  return (
    POKEMON_TYPES[
      type
    ]?.[language] ??
    POKEMON_TYPES[
      type
    ]?.en ??
    type
  );
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