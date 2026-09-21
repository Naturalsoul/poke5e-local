import {
  openTrainerCreateDialog
} from "./trainer-create-dialog.mjs";

import {
  openTrainerPartyDialog
} from "./trainer-party-dialog.mjs";

const MODULE_ID =
  "poke5e-local";

const TOOLBAR_CLASS =
  "poke5e-trainer-directory-actions";


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {
  es: {
    create:
      "Crear Entrenador",

    createTitle:
      "Crear un nuevo Entrenador Pokémon",

    manage:
      "Gestionar Trainers",

    manageTitle:
      "Gestionar Party y PC de los Entrenadores",

    error:
      "No se pudo abrir la interfaz de Entrenadores."
  },

  en: {
    create:
      "Create Trainer",

    createTitle:
      "Create a new Pokémon Trainer",

    manage:
      "Manage Trainers",

    manageTitle:
      "Manage Trainer Party and PC",

    error:
      "The Trainer interface could not be opened."
  }
};


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function getLanguage() {
  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
}


/* ============================================================
 * BUTTON
 * ============================================================ */

function buildActionButton({
  className,
  icon,
  label,
  title,
  onClick
}) {
  const button =
    document.createElement(
      "button"
    );

  button.type =
    "button";

  button.className =
    className;

  button.title =
    title;

  button.innerHTML = `
    <i
      class="${icon}"
      aria-hidden="true"
    ></i>

    <span>
      ${label}
    </span>
  `;

  button.addEventListener(
    "click",
    async event => {
      event.preventDefault();

      try {
        await onClick();

      } catch (error) {
        console.error(
          `[${MODULE_ID}] Error abriendo UI de Trainer`,
          error
        );

        ui.notifications.error(
          LABELS[
            getLanguage()
          ].error
        );
      }
    }
  );

  return button;
}


/* ============================================================
 * DIRECTORY
 * ============================================================ */

function buildTrainerDirectoryActions() {
  const labels =
    LABELS[
      getLanguage()
    ];

  const toolbar =
    document.createElement(
      "div"
    );

  toolbar.className =
    TOOLBAR_CLASS;

  toolbar.append(
    buildActionButton({
      className:
        "poke5e-trainer-directory-actions__create",

      icon:
        "fa-solid fa-user-plus",

      label:
        labels.create,

      title:
        labels.createTitle,

      onClick:
        openTrainerCreateDialog
    }),

    buildActionButton({
      className:
        "poke5e-trainer-directory-actions__manage",

      icon:
        "fa-solid fa-users",

      label:
        labels.manage,

      title:
        labels.manageTitle,

      onClick:
        openTrainerPartyDialog
    })
  );

  return toolbar;
}


/* ============================================================
 * ACTOR DIRECTORY
 * ============================================================ */

function onRenderActorDirectory(
  ...args
) {
  const element =
    args[1];

  if (
    !game.user.isGM ||
    !(element instanceof HTMLElement) ||
    element.querySelector(
      `.${TOOLBAR_CLASS}`
    )
  ) {
    return;
  }

  element.prepend(
    buildTrainerDirectoryActions()
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerTrainerDirectoryUi() {
  Hooks.on(
    "renderActorDirectory",
    onRenderActorDirectory
  );
}