import { escapeHtml } from "./html.mjs";
import {
  ensureTrainerState,
  isTrainerActor
} from "./trainer-service.mjs";

import {
  assignPokemonToParty,
  assignPokemonToTrainer,
  getPokemonTrainerUuid,
  getTrainerOwnedPokemon,
  getTrainerPartyState,
  getTrainerPokeslotLimit,
  isPokemonActor,
  releasePokemonFromTrainer,
  removePokemonFromParty
} from "./trainer-party-service.mjs";

import {
  deployPokemon,
  recallPokemon,
  switchPokemon
} from "./trainer-switch-service.mjs";

import {
  acquireWildPokemonToken
} from "./trainer-wild-pokemon-service.mjs";
import { getLanguage } from "./i18n.mjs";

const MODULE_ID = "poke5e-local";
const MANAGER_CLASS = "poke5e-trainer-manager";
const DEFAULT_POKEMON_ICON = "icons/svg/mystery-man.svg";
const DEFAULT_MAX_ACTIVE =
  1;

let trainerManagerDialog = null;
let trainerManagerState = null;
let trainerManagerLabels = null;


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    title:
      "Gestionar Entrenador",

    trainer:
      "Entrenador",

    battleFormat:
      "Formato de combate",

    battle:
      "Combate",

    managerEyebrow:
      "RKT // CONTROL DE ENTRENADOR",

    singleBattle:
      "Single Battle",

    doubleBattle:
      "Double Battle",

    formatHint:
      "Formato temporal para probar el máximo de Pokémon activos.",

    formatReduceWarning:
      "Retira Pokémon activos antes de cambiar a Single Battle.",

    active:
      "Pokémon activos",

    noActive:
      "Sin Pokémon activos",

    activeHint:
      "Despliega un Pokémon de la Party para comenzar.",

    deploy:
      "Desplegar",

    recall:
      "Retirar",

    switch:
      "Cambiar",

    switchTitle:
      "Cambiar Pokémon",

    outgoing:
      "Pokémon saliente",

    incoming:
      "Pokémon entrante",

    noSwitchOutgoing:
      "No hay Pokémon activos para retirar.",

    noSwitchIncoming:
      "No hay Pokémon de Party disponibles para entrar.",

    chooseOutgoing:
      "Selecciona el Pokémon saliente",

    chooseIncoming:
      "Selecciona el Pokémon entrante",

    chooseSwitchWarning:
      "Selecciona un Pokémon saliente y uno entrante.",

    party:
      "Party",

    pc:
      "PC",

    available:
      "Añadir Pokémon",

    availableHint:
      "Pokémon importados que todavía no pertenecen a ningún Entrenador.",

    wildPokemon:
      "Pokémon salvaje de la escena",

    wildPokemonHint:
      "Selecciona exactamente un token Pokémon salvaje en la escena. Se creará una instancia individual conservando su Naturaleza.",

    wildPokemonWarning:
      "Selecciona exactamente un token Pokémon salvaje unlinked en la escena.",

    choosePokemon:
      "Selecciona un Pokémon",

    choosePokemonWarning:
      "Selecciona primero un Pokémon.",

    toParty:
      "A Party",

    toPc:
      "Al PC",

    release:
      "Liberar",

    emptyPc:
      "No hay Pokémon guardados en el PC.",

    emptyAvailable:
      "No hay Pokémon sin Entrenador disponibles.",

    emptySlot:
      "Pokéslot disponible",

    missingPokemon:
      "Pokémon no disponible",

    pcSearch:
      "Buscar en PC...",

    close:
      "Cerrar",

    noTrainer:
      "No hay Trainers disponibles.",

    invalidPokemon:
      "No se pudo encontrar el Pokémon seleccionado.",

    error:
      "No se pudo modificar el Trainer.",

    releaseTitle:
      "Liberar Pokémon",

    releaseConfirm:
      name =>
        `¿Liberar a ${name}? Esta acción eliminará permanentemente al Pokémon y no se puede deshacer.`,

    released:
      name =>
        `${name} fue liberado y eliminado permanentemente.`,

    movedToParty:
      name =>
        `${name} fue añadido a la Party.`,

    movedToPc:
      name =>
        `${name} fue enviado al PC.`,

    deployed:
      name =>
        `${name} fue desplegado.`,

    recalled:
      name =>
        `${name} fue retirado.`,

    switched:
      (
        outgoing,
        incoming
      ) =>
        `${outgoing} fue cambiado por ${incoming}.`
  },


  en: {

    title:
      "Manage Trainer",

    trainer:
      "Trainer",

    battleFormat:
      "Battle format",

    battle:
      "Battle",

    managerEyebrow:
      "RKT // TRAINER CONTROL",

    singleBattle:
      "Single Battle",

    doubleBattle:
      "Double Battle",

    formatHint:
      "Temporary format used to test the active Pokémon limit.",

    formatReduceWarning:
      "Recall active Pokémon before changing to Single Battle.",

    active:
      "Active Pokémon",

    noActive:
      "No active Pokémon",

    activeHint:
      "Deploy a Pokémon from the Party to begin.",

    deploy:
      "Deploy",

    recall:
      "Recall",

    switch:
      "Switch",

    switchTitle:
      "Switch Pokémon",

    outgoing:
      "Outgoing Pokémon",

    incoming:
      "Incoming Pokémon",

    noSwitchOutgoing:
      "There are no active Pokémon to recall.",

    noSwitchIncoming:
      "There are no Party Pokémon available to switch in.",

    chooseOutgoing:
      "Select the outgoing Pokémon",

    chooseIncoming:
      "Select the incoming Pokémon",

    chooseSwitchWarning:
      "Select an outgoing and an incoming Pokémon.",

    party:
      "Party",

    pc:
      "PC",

    available:
      "Add Pokémon",

    availableHint:
      "Imported Pokémon that do not belong to any Trainer yet.",

    wildPokemon:
      "Wild Pokémon from the Scene",

    wildPokemonHint:
      "Select exactly one wild Pokémon token on the Scene. An individual instance will be created while preserving its Nature.",

    wildPokemonWarning:
      "Select exactly one unlinked wild Pokémon token on the Scene.",

    choosePokemon:
      "Select a Pokémon",

    choosePokemonWarning:
      "Select a Pokémon first.",

    toParty:
      "To Party",

    toPc:
      "To PC",

    release:
      "Release",

    emptyPc:
      "There are no Pokémon stored in the PC.",

    emptyAvailable:
      "There are no unassigned Pokémon available.",

    emptySlot:
      "Available Pokéslot",

    missingPokemon:
      "Pokémon unavailable",

    pcSearch:
      "Search PC...",

    close:
      "Close",

    noTrainer:
      "No Trainers are available.",

    invalidPokemon:
      "The selected Pokémon could not be found.",

    error:
      "The Trainer could not be modified.",

    releaseTitle:
      "Release Pokémon",

    releaseConfirm:
      name =>
        `Release ${name}? This will permanently delete the Pokémon and cannot be undone.`,

    released:
      name =>
        `${name} was released and permanently deleted.`,

    movedToParty:
      name =>
        `${name} was added to the Party.`,

    movedToPc:
      name =>
        `${name} was sent to the PC.`,

    deployed:
      name =>
        `${name} was deployed.`,

    recalled:
      name =>
        `${name} was recalled.`,

    switched:
      (
        outgoing,
        incoming
      ) =>
        `${outgoing} was switched for ${incoming}.`
  }
};


/* ============================================================
 * CONSTANTS
 * ============================================================ */


const ACTION_HANDLERS = {
  "party-to-pc":
    removePokemonFromParty,

  "pc-to-party":
    assignPokemonToParty,

  "available-to-party":
    assignPokemonToParty,

  "available-to-pc":
    assignPokemonToTrainer,

  release:
    releasePokemonFromTrainer
};


/* ============================================================
 * HTML
 * ============================================================ */


function pokemonImage(pokemon) {
  return escapeHtml(
    pokemon?.img ||
    DEFAULT_POKEMON_ICON
  );
}


/* ============================================================
 * COLLECTIONS
 * ============================================================ */

function getTrainers() {
  return game.actors
    .filter(
      isTrainerActor
    )
    .sort(
      (
        left,
        right
      ) =>
        left.name.localeCompare(
          right.name
        )
    );
}

function resolveTrainer(
  trainers,
  trainerId
) {

  const requestedId =
    String(
      trainerId ??
      ""
    ).trim();


  if (requestedId) {

    const requestedTrainer =
      trainers.find(
        trainer =>
          trainer.id ===
          requestedId
      );


    if (requestedTrainer) {

      return requestedTrainer;
    }
  }


  return (
    trainers[0] ??
    null
  );
}


function getPokemonActors() {
  return game.actors
    .filter(
      isPokemonActor
    )
    .sort(
      (
        left,
        right
      ) =>
        left.name.localeCompare(
          right.name
        )
    );
}


function pokemonFromUuid(uuid) {
  return (
    game.actors.find(
      actor =>
        actor.uuid ===
        uuid
    ) ??
    null
  );
}


/* ============================================================
 * VIEW MODEL
 * ============================================================ */

function getTrainerView(
  trainer
) {

  const partyState =
    getTrainerPartyState(
      trainer
    );


  const pokeslotLimit =
    getTrainerPokeslotLimit(
      trainer
    );


  const partyUuids =
    new Set(
      partyState.pokemonUuids
    );


  const pcPokemon =
    getTrainerOwnedPokemon(
      trainer
    )
      .filter(
        pokemon =>
          !partyUuids.has(
            pokemon.uuid
          )
      )
      .sort(
        (
          left,
          right
        ) =>
          left.name.localeCompare(
            right.name
          )
      );


  const availablePokemon =
    getPokemonActors()
      .filter(
        pokemon =>
          !getPokemonTrainerUuid(
            pokemon
          )
      );


  const activePokemon =
    partyState.activePokemonUuids
      .map(
        pokemonFromUuid
      )
      .filter(Boolean);


  const inactivePartyPokemon =
    partyState.pokemonUuids
      .filter(
        uuid =>
          !partyState.activePokemonUuids
            .includes(
              uuid
            )
      )
      .map(
        pokemonFromUuid
      )
      .filter(Boolean);


  return {

    activePokemon,
    availablePokemon,
    inactivePartyPokemon,
    partyState,
    pcPokemon,
    pokeslotLimit
  };
}


/* ============================================================
 * OPTIONS
 * ============================================================ */

function trainerOptions(
  trainers,
  selectedId
) {
  return trainers
    .map(
      trainer => {
        const selected =
          trainer.id === selectedId
            ? " selected"
            : "";

        return `
          <option
            value="${escapeHtml(trainer.id)}"
            ${selected}
          >
            ${escapeHtml(trainer.name)}
          </option>
        `;
      }
    )
    .join("");
}


function availablePokemonOptions(
  pokemonActors,
  labels
) {
  if (!pokemonActors.length) {
    return `
      <option value="">
        ${labels.emptyAvailable}
      </option>
    `;
  }

  return [
    `
      <option value="">
        ${labels.choosePokemon}
      </option>
    `,

    ...pokemonActors.map(
      pokemon => `
        <option value="${escapeHtml(pokemon.id)}">
          ${escapeHtml(pokemon.name)}
        </option>
      `
    )
  ].join("");
}

function battleFormatOptions(
  maxActive,
  labels
) {

  return `
    <option
      value="1"
      ${maxActive === 1 ? "selected" : ""}
    >
      ${labels.singleBattle}
    </option>

    <option
      value="2"
      ${maxActive === 2 ? "selected" : ""}
    >
      ${labels.doubleBattle}
    </option>
  `;
}


function pokemonSelectOptions(
  pokemonActors,
  placeholder
) {

  return [

    `
      <option value="">
        ${placeholder}
      </option>
    `,

    ...pokemonActors.map(
      pokemon => `
        <option value="${escapeHtml(pokemon.id)}">
          ${escapeHtml(pokemon.name)}
        </option>
      `
    )

  ].join("");
}

/* ============================================================
 * CARD
 * ============================================================ */

function cardAction({
  action,
  icon,
  label,
  pokemonId,
  danger = false
}) {
  const dangerClass =
    danger
      ? " poke5e-trainer-pokemon-card__action--danger"
      : "";

  return `
    <button
      type="button"
      class="poke5e-trainer-pokemon-card__action${dangerClass}"
      data-trainer-action="${escapeHtml(action)}"
      data-pokemon-id="${escapeHtml(pokemonId)}"
      title="${escapeHtml(label)}"
    >
      <i
        class="${escapeHtml(icon)}"
        aria-hidden="true"
      ></i>

      <span>
        ${escapeHtml(label)}
      </span>
    </button>
  `;
}


function pokemonCard(
  pokemon,
  {
    active = false,
    actions = []
  } = {}
) {
  const activeClass =
    active
      ? " poke5e-trainer-pokemon-card--active"
      : "";

  return `
    <article
      class="poke5e-trainer-pokemon-card${activeClass}"
      data-pokemon-name="${escapeHtml(
        pokemon.name.toLocaleLowerCase()
      )}"
    >
      <img
        class="poke5e-trainer-pokemon-card__image"
        src="${pokemonImage(pokemon)}"
        alt="${escapeHtml(pokemon.name)}"
      >

      <div class="poke5e-trainer-pokemon-card__body">
        <strong>
          ${escapeHtml(pokemon.name)}
        </strong>
      </div>

      ${
        actions.length
          ? `
            <div class="poke5e-trainer-pokemon-card__actions">
              ${actions.join("")}
            </div>
          `
          : ""
      }
    </article>
  `;
}


function missingPartyCard(
  uuid,
  labels
) {
  return `
    <article
      class="
        poke5e-trainer-pokemon-card
        poke5e-trainer-pokemon-card--missing
      "
    >
      <div class="poke5e-trainer-pokemon-card__missing-icon">
        <i
          class="fa-solid fa-triangle-exclamation"
          aria-hidden="true"
        ></i>
      </div>

      <div class="poke5e-trainer-pokemon-card__body">
        <strong>
          ${labels.missingPokemon}
        </strong>

        <small>
          ${escapeHtml(uuid)}
        </small>
      </div>
    </article>
  `;
}


function emptyPartySlot(labels) {
  return `
    <div class="poke5e-trainer-party-slot">
      <i
        class="fa-regular fa-circle"
        aria-hidden="true"
      ></i>

      <span>
        ${labels.emptySlot}
      </span>
    </div>
  `;
}


/* ============================================================
 * PARTY
 * ============================================================ */

function partyMarkup(
  view,
  labels
) {

  const activeUuids =
    new Set(
      view.partyState
        .activePokemonUuids
    );


  const cards =
    view.partyState
      .pokemonUuids
      .map(
        uuid => {

          const pokemon =
            pokemonFromUuid(
              uuid
            );


          if (!pokemon) {

            return missingPartyCard(
              uuid,
              labels
            );
          }


          const active =
            activeUuids.has(
              pokemon.uuid
            );


          const actions =
            active

              ? [
                  cardAction({

                    action:
                      "recall",

                    icon:
                      "fa-solid fa-arrow-down",

                    label:
                      labels.recall,

                    pokemonId:
                      pokemon.id
                  })
                ]

              : [
                  cardAction({

                    action:
                      "deploy",

                    icon:
                      "fa-solid fa-bolt",

                    label:
                      labels.deploy,

                    pokemonId:
                      pokemon.id
                  }),

                  cardAction({

                    action:
                      "party-to-pc",

                    icon:
                      "fa-solid fa-box-archive",

                    label:
                      labels.toPc,

                    pokemonId:
                      pokemon.id
                  })
                ];


          return pokemonCard(
            pokemon,
            {
              active,
              actions
            }
          );
        }
      );


  const emptySlots =
    Math.max(
      view.pokeslotLimit -
        view.partyState
          .pokemonUuids.length,
      0
    );


  for (
    let index = 0;
    index < emptySlots;
    index += 1
  ) {

    cards.push(
      emptyPartySlot(
        labels
      )
    );
  }


  return cards.join("");
}


/* ============================================================
 * PC
 * ============================================================ */

function pcMarkup(
  view,
  labels
) {
  if (!view.pcPokemon.length) {
    return `
      <div class="poke5e-trainer-empty-state">
        <i
          class="fa-solid fa-box-open"
          aria-hidden="true"
        ></i>

        <span>
          ${labels.emptyPc}
        </span>
      </div>
    `;
  }

  return view.pcPokemon
    .map(
      pokemon =>
        pokemonCard(
          pokemon,
          {
            actions: [
              cardAction({
                action:
                  "pc-to-party",

                icon:
                  "fa-solid fa-arrow-up",

                label:
                  labels.toParty,

                pokemonId:
                  pokemon.id
              }),

              cardAction({
                action:
                  "release",

                danger:
                  true,

                icon:
                  "fa-solid fa-trash",

                label:
                  labels.release,

                pokemonId:
                  pokemon.id
              })
            ]
          }
        )
    )
    .join("");
}


/* ============================================================
 * ACTIVE
 * ============================================================ */

function activeMarkup(
  view,
  labels
) {

  if (
    !view.activePokemon.length
  ) {

    return `
      <div class="poke5e-trainer-active__empty">

        <i
          class="fa-regular fa-circle-dot"
          aria-hidden="true"
        ></i>

        <div>

          <strong>
            ${labels.noActive}
          </strong>

          <small>
            ${labels.activeHint}
          </small>

        </div>
      </div>
    `;
  }


  return `
    <div class="poke5e-trainer-active-grid">

      ${
        view.activePokemon
          .map(
            pokemon =>
              pokemonCard(
                pokemon,
                {
                  active:
                    true,

                  actions: [
                    cardAction({

                      action:
                        "recall",

                      icon:
                        "fa-solid fa-arrow-down",

                      label:
                        labels.recall,

                      pokemonId:
                        pokemon.id
                    })
                  ]
                }
              )
          )
          .join("")
      }

    </div>
  `;
}

function switchMarkup(
  view,
  labels
) {

  const hasOutgoing =
    view.activePokemon.length >
    0;


  const hasIncoming =
    view.inactivePartyPokemon
      .length >
    0;


  const disabled =
    (
      hasOutgoing &&
      hasIncoming
    )
      ? ""
      : " disabled";


  return `
    <section
      class="
        poke5e-trainer-manager__section
        poke5e-trainer-switch
      "
    >

      <header
        class="poke5e-trainer-manager__section-header"
      >

        <div>

          <h3>
            <i
              class="fa-solid fa-right-left"
              aria-hidden="true"
            ></i>

            ${labels.switchTitle}
          </h3>

          <p>
            ${
              !hasOutgoing
                ? labels.noSwitchOutgoing
                : !hasIncoming
                  ? labels.noSwitchIncoming
                  : labels.switch
            }
          </p>

        </div>
      </header>


      <div
        class="poke5e-trainer-switch__controls"
      >

        <label>

          <span>
            ${labels.outgoing}
          </span>

          <select
            data-role="switch-outgoing"
            ${disabled}
          >
            ${pokemonSelectOptions(
              view.activePokemon,
              labels.chooseOutgoing
            )}
          </select>

        </label>


        <i
          class="fa-solid fa-arrow-right"
          aria-hidden="true"
        ></i>


        <label>

          <span>
            ${labels.incoming}
          </span>

          <select
            data-role="switch-incoming"
            ${disabled}
          >
            ${pokemonSelectOptions(
              view.inactivePartyPokemon,
              labels.chooseIncoming
            )}
          </select>

        </label>


        <button
          type="button"
          data-trainer-action="switch"
          ${disabled}
        >
          <i
            class="fa-solid fa-right-left"
            aria-hidden="true"
          ></i>

          ${labels.switch}
        </button>

      </div>
    </section>
  `;
}

/* ============================================================
 * MANAGER
 * ============================================================ */

function managerToolbarMarkup(
  trainer,
  trainers,
  labels,
  state,
  view
) {

  const trainerControl =
    state.lockTrainer
      ? ""
      : `
        <label
          class="poke5e-trainer-manager__field"
        >

          <span>
            ${labels.trainer}
          </span>

          <select
            data-role="trainer-select"
          >
            ${trainerOptions(
              trainers,
              trainer.id
            )}
          </select>

        </label>
      `;


  return `
    <header
      class="poke5e-trainer-manager__toolbar"
    >

      <div
        class="poke5e-trainer-manager__identity"
      >

        <span>
          ${labels.managerEyebrow}
        </span>

        <strong>
          ${escapeHtml(trainer.name)}
        </strong>

      </div>


      <div
        class="poke5e-trainer-manager__toolbar-controls"
      >

        ${trainerControl}


        <label
          class="poke5e-trainer-manager__field"
        >

          <span>
            ${labels.battleFormat}
          </span>

          <select
            data-role="battle-format"
          >
            ${battleFormatOptions(
              state.maxActive,
              labels
            )}
          </select>

        </label>

      </div>


      <div
        class="poke5e-trainer-manager__summary"
      >

        <span>
          <i
            class="fa-solid fa-star"
            aria-hidden="true"
          ></i>

          ${labels.active}

          <strong>
            ${view.partyState.activePokemonUuids.length}/${state.maxActive}
          </strong>
        </span>


        <span>
          <i
            class="fa-solid fa-users"
            aria-hidden="true"
          ></i>

          ${labels.party}

          <strong>
            ${view.partyState.pokemonUuids.length}/${view.pokeslotLimit}
          </strong>
        </span>


        <span>
          <i
            class="fa-solid fa-box-archive"
            aria-hidden="true"
          ></i>

          ${labels.pc}

          <strong>
            ${view.pcPokemon.length}
          </strong>
        </span>

      </div>


      <small
        class="poke5e-trainer-manager__format-hint"
      >
        <i
          class="fa-solid fa-circle-info"
          aria-hidden="true"
        ></i>

        ${labels.formatHint}
      </small>

    </header>
  `;
}


function managerNavigationMarkup(
  view,
  labels,
  state
) {

  const navigationItems = [
    {
      id:
        "battle",

      icon:
        "fa-solid fa-bolt",

      label:
        labels.battle,

      count:
        `${view.partyState.activePokemonUuids.length}/${state.maxActive}`
    },

    {
      id:
        "party",

      icon:
        "fa-solid fa-users",

      label:
        labels.party,

      count:
        `${view.partyState.pokemonUuids.length}/${view.pokeslotLimit}`
    },

    {
      id:
        "pc",

      icon:
        "fa-solid fa-box-archive",

      label:
        labels.pc,

      count:
        String(
          view.pcPokemon.length
        )
    }
  ];


  return `
    <nav
      class="poke5e-trainer-manager__navigation"
      role="tablist"
      aria-label="${escapeHtml(labels.title)}"
    >

      ${
        navigationItems
          .map(
            item => {

              const active =
                state.managerView ===
                item.id;


              return `
                <button
                  type="button"
                  class="poke5e-trainer-manager__nav-button${
                    active
                      ? " is-active"
                      : ""
                  }"
                  data-manager-view="${escapeHtml(item.id)}"
                  role="tab"
                  aria-selected="${String(active)}"
                  aria-controls="poke5e-trainer-manager-view-${escapeHtml(item.id)}"
                >

                  <i
                    class="${escapeHtml(item.icon)}"
                    aria-hidden="true"
                  ></i>

                  <span>
                    ${escapeHtml(item.label)}
                  </span>

                  <strong>
                    ${escapeHtml(item.count)}
                  </strong>

                </button>
              `;
            }
          )
          .join("")
      }

    </nav>
  `;
}


function managerMarkup(
  trainer,
  trainers,
  labels,
  state
) {

  const view =
    getTrainerView(
      trainer
    );


  const availableDisabled =
    view.availablePokemon.length
      ? ""
      : " disabled";


  const battleHidden =
    state.managerView ===
      "battle"
      ? ""
      : " hidden";


  const partyHidden =
    state.managerView ===
      "party"
      ? ""
      : " hidden";


  const pcHidden =
    state.managerView ===
      "pc"
      ? ""
      : " hidden";


  return `
    ${managerToolbarMarkup(
      trainer,
      trainers,
      labels,
      state,
      view
    )}


    ${managerNavigationMarkup(
      view,
      labels,
      state
    )}


    <div
      class="poke5e-trainer-manager__body"
      data-role="manager-body"
    >

      <div
        id="poke5e-trainer-manager-view-battle"
        class="poke5e-trainer-manager__view"
        data-manager-panel="battle"
        role="tabpanel"
        ${battleHidden}
      >

        <section
          class="
            poke5e-trainer-manager__section
            poke5e-trainer-active
          "
        >

          <header
            class="poke5e-trainer-manager__section-header"
          >

            <h3>
              <i
                class="fa-solid fa-star"
                aria-hidden="true"
              ></i>

              ${labels.active}
            </h3>

            <span
              class="poke5e-trainer-manager__count"
            >
              ${view.partyState.activePokemonUuids.length}/${state.maxActive}
            </span>

          </header>

          ${activeMarkup(
            view,
            labels
          )}

        </section>


        ${switchMarkup(
          view,
          labels
        )}

      </div>


      <div
        id="poke5e-trainer-manager-view-party"
        class="poke5e-trainer-manager__view"
        data-manager-panel="party"
        role="tabpanel"
        ${partyHidden}
      >

        <section
          class="poke5e-trainer-manager__section"
        >

          <header
            class="poke5e-trainer-manager__section-header"
          >

            <h3>
              <i
                class="fa-solid fa-users"
                aria-hidden="true"
              ></i>

              ${labels.party}
            </h3>

            <span
              class="poke5e-trainer-manager__count"
            >
              ${view.partyState.pokemonUuids.length}/${view.pokeslotLimit}
            </span>

          </header>


          <div
            class="poke5e-trainer-party-grid"
          >
            ${partyMarkup(
              view,
              labels
            )}
          </div>

        </section>

      </div>


      <div
        id="poke5e-trainer-manager-view-pc"
        class="poke5e-trainer-manager__view"
        data-manager-panel="pc"
        role="tabpanel"
        ${pcHidden}
      >

        <section
          class="poke5e-trainer-manager__section"
        >

          <header
            class="poke5e-trainer-manager__section-header"
          >

            <h3>
              <i
                class="fa-solid fa-box-archive"
                aria-hidden="true"
              ></i>

              ${labels.pc}
            </h3>

            <span
              class="poke5e-trainer-manager__count"
            >
              ${view.pcPokemon.length}
            </span>

          </header>


          <div
            class="poke5e-trainer-pc-search"
          >

            <i
              class="fa-solid fa-magnifying-glass"
              aria-hidden="true"
            ></i>

            <input
              type="search"
              data-role="pc-search"
              placeholder="${escapeHtml(labels.pcSearch)}"
              value="${escapeHtml(state.pcSearch)}"
              autocomplete="off"
            >

          </div>


          <div
            class="poke5e-trainer-pokemon-grid"
            data-role="pc-grid"
          >
            ${pcMarkup(
              view,
              labels
            )}
          </div>

        </section>


        <section
          class="
            poke5e-trainer-manager__section
            poke5e-trainer-add-pokemon
          "
        >

          <header
            class="poke5e-trainer-manager__section-header"
          >
            <div>

              <h3>
                <i
                  class="fa-solid fa-crosshairs"
                  aria-hidden="true"
                ></i>

                ${labels.wildPokemon}
              </h3>

              <p>
                ${labels.wildPokemonHint}
              </p>

            </div>
          </header>


          <div
            class="poke5e-trainer-add-pokemon__controls"
          >

            <button
              type="button"
              data-trainer-action="wild-to-party"
            >
              <i
                class="fa-solid fa-users"
                aria-hidden="true"
              ></i>

              ${labels.toParty}
            </button>

            <button
              type="button"
              data-trainer-action="wild-to-pc"
            >
              <i
                class="fa-solid fa-box-archive"
                aria-hidden="true"
              ></i>

              ${labels.toPc}
            </button>

          </div>

        </section>


        <section
          class="
            poke5e-trainer-manager__section
            poke5e-trainer-add-pokemon
          "
        >

          <header
            class="poke5e-trainer-manager__section-header"
          >
            <div>

              <h3>
                <i
                  class="fa-solid fa-plus"
                  aria-hidden="true"
                ></i>

                ${labels.available}
              </h3>

              <p>
                ${labels.availableHint}
              </p>

            </div>

            <span
              class="poke5e-trainer-manager__count"
            >
              ${view.availablePokemon.length}
            </span>
          </header>


          <div
            class="poke5e-trainer-add-pokemon__controls"
          >

            <select
              data-role="available-pokemon"
              ${availableDisabled}
            >
              ${availablePokemonOptions(
                view.availablePokemon,
                labels
              )}
            </select>

            <button
              type="button"
              data-trainer-action="available-to-party"
              ${availableDisabled}
            >
              <i
                class="fa-solid fa-users"
                aria-hidden="true"
              ></i>

              ${labels.toParty}
            </button>

            <button
              type="button"
              data-trainer-action="available-to-pc"
              ${availableDisabled}
            >
              <i
                class="fa-solid fa-box-archive"
                aria-hidden="true"
              ></i>

              ${labels.toPc}
            </button>

          </div>

        </section>

      </div>

    </div>
  `;
}


/* ============================================================
 * NOTIFICATIONS
 * ============================================================ */

function actionNotification(
  action,
  pokemon,
  labels
) {

  if (
    action === "party-to-pc" ||
    action === "available-to-pc"
  ) {

    return labels.movedToPc(
      pokemon.name
    );
  }


  if (
    action === "pc-to-party" ||
    action === "available-to-party"
  ) {

    return labels.movedToParty(
      pokemon.name
    );
  }


  if (
    action === "deploy"
  ) {

    return labels.deployed(
      pokemon.name
    );
  }


  if (
    action === "recall"
  ) {

    return labels.recalled(
      pokemon.name
    );
  }


  return labels.released(
    pokemon.name
  );
}


/* ============================================================
 * ACTION POKÉMON
 * ============================================================ */

function selectedActionPokemon(
  root,
  button,
  labels
) {
  const directId =
    String(
      button.dataset.pokemonId ??
      ""
    ).trim();

  if (directId) {
    return (
      game.actors.get(
        directId
      ) ??
      null
    );
  }

  const select =
    root.querySelector(
      '[data-role="available-pokemon"]'
    );

  const selectedId =
    String(
      select?.value ??
      ""
    ).trim();

  if (!selectedId) {
    ui.notifications.warn(
      labels.choosePokemonWarning
    );

    return null;
  }

  return (
    game.actors.get(
      selectedId
    ) ??
    null
  );
}

function selectedWildPokemonToken(
  labels
) {

  const controlled =
    canvas.tokens
      ?.controlled ??
    [];


  if (
    controlled.length !== 1
  ) {

    ui.notifications.warn(
      labels.wildPokemonWarning
    );

    return null;
  }


  return (
    controlled[0]
      ?.document ??
    null
  );
}

/* ============================================================
 * RELEASE CONFIRMATION
 * ============================================================ */

async function confirmRelease(
  pokemon,
  labels
) {
  return foundry.applications.api
    .DialogV2.confirm({
      window: {
        title:
          labels.releaseTitle
      },

      content: `
        <p>
          ${escapeHtml(
            labels.releaseConfirm(
              pokemon.name
            )
          )}
        </p>
      `,

      rejectClose:
        false,

      modal:
        true
    });
}


/* ============================================================
 * UI STATE
 * ============================================================ */

function setBusy(
  root,
  busy
) {
  root.classList.toggle(
    "is-busy",
    busy
  );

  for (
    const control
    of root.querySelectorAll(
      "button, input, select"
    )
  ) {
    control.disabled =
      busy;
  }
}


function managerBody(
  root
) {

  return root.querySelector(
    '[data-role="manager-body"]'
  );
}


function rememberManagerScroll(
  root,
  state
) {

  const body =
    managerBody(
      root
    );


  if (!body) {

    return;
  }


  state.viewScroll[
    state.managerView
  ] =
    body.scrollTop;
}


function restoreManagerScroll(
  root,
  state
) {

  const body =
    managerBody(
      root
    );


  if (!body) {

    return;
  }


  const scrollTop =
    Number(
      state.viewScroll[
        state.managerView
      ] ??
      0
    );


  const restore =
    () => {

      if (!body.isConnected) {

        return;
      }


      body.scrollTop =
        scrollTop;
    };


  restore();


  window.requestAnimationFrame(
    restore
  );
}


function applyManagerView(
  root,
  state
) {

  for (
    const button
    of root.querySelectorAll(
      "[data-manager-view]"
    )
  ) {

    const active =
      button.dataset
        .managerView ===
      state.managerView;


    button.classList.toggle(
      "is-active",
      active
    );


    button.setAttribute(
      "aria-selected",
      String(active)
    );
  }


  for (
    const panel
    of root.querySelectorAll(
      "[data-manager-panel]"
    )
  ) {

    panel.hidden =
      panel.dataset
        .managerPanel !==
      state.managerView;
  }
}


function changeManagerView(
  root,
  state,
  nextView
) {

  const normalizedView =
    String(
      nextView ??
      ""
    ).trim();


  if (
    ![
      "battle",
      "party",
      "pc"
    ].includes(
      normalizedView
    ) ||
    normalizedView ===
      state.managerView
  ) {

    return;
  }


  rememberManagerScroll(
    root,
    state
  );


  state.managerView =
    normalizedView;


  applyManagerView(
    root,
    state
  );


  restoreManagerScroll(
    root,
    state
  );
}


function refreshManager(
  root,
  state,
  labels
) {

  const trainer =
    game.actors.get(
      state.trainerId
    );


  if (
    !trainer ||
    !isTrainerActor(
      trainer
    )
  ) {

    return false;
  }


  rememberManagerScroll(
    root,
    state
  );


  root.innerHTML =
    managerMarkup(
      trainer,
      getTrainers(),
      labels,
      state
    );


  applyManagerView(
    root,
    state
  );


  filterPc(
    root,
    state.pcSearch
  );


  restoreManagerScroll(
    root,
    state
  );


  return true;
}


function filterPc(
  root,
  value
) {
  const query =
    String(
      value ??
      ""
    )
      .trim()
      .toLocaleLowerCase();

  for (
    const card
    of root.querySelectorAll(
      '[data-role="pc-grid"] [data-pokemon-name]'
    )
  ) {
    const pokemonName =
      String(
        card.dataset.pokemonName ??
        ""
      );

    card.hidden =
      Boolean(query) &&
      !pokemonName.includes(
        query
      );
  }
}


/* ============================================================
 * INTERACTION
 * ============================================================ */

function resolvePokemonBySelect(
  root,
  role
) {

  const select =
    root.querySelector(
      `[data-role="${role}"]`
    );


  const pokemonId =
    String(
      select?.value ??
      ""
    ).trim();


  if (!pokemonId) {

    return null;
  }


  return (
    game.actors.get(
      pokemonId
    ) ??
    null
  );
}


async function executeSwitchAction(
  root,
  trainer,
  labels
) {

  const outgoing =
    resolvePokemonBySelect(
      root,
      "switch-outgoing"
    );


  const incoming =
    resolvePokemonBySelect(
      root,
      "switch-incoming"
    );


  if (
    !outgoing ||
    !incoming
  ) {

    ui.notifications.warn(
      labels.chooseSwitchWarning
    );

    return null;
  }


  await switchPokemon(
    trainer,
    outgoing,
    incoming
  );


  ui.notifications.info(
    labels.switched(
      outgoing.name,
      incoming.name
    )
  );


  return incoming;
}

function activateManager(
  dialog,
  state,
  labels
) {

  const root =
    dialog.element.querySelector(
      `.${MANAGER_CLASS}`
    );


  if (!root) {

    return;
  }


  refreshManager(
    root,
    state,
    labels
  );


  root.addEventListener(
    "input",
    event => {

      const input =
        event.target.closest(
          '[data-role="pc-search"]'
        );


      if (input) {

        state.pcSearch =
          input.value;


        filterPc(
          root,
          state.pcSearch
        );
      }
    }
  );


  root.addEventListener(
    "change",
    async event => {

      const battleFormat =
        event.target.closest(
          '[data-role="battle-format"]'
        );


      if (battleFormat) {

        const nextMaxActive =
          Number(
            battleFormat.value
          );


        const trainer =
          game.actors.get(
            state.trainerId
          );


        if (
          !trainer ||
          !isTrainerActor(
            trainer
          )
        ) {

          return;
        }


        const activeCount =
          getTrainerPartyState(
            trainer
          ).activePokemonUuids.length;


        if (
          nextMaxActive <
          activeCount
        ) {

          ui.notifications.warn(
            labels.formatReduceWarning
          );


          battleFormat.value =
            String(
              state.maxActive
            );


          return;
        }


        state.maxActive =
          nextMaxActive;


        refreshManager(
          root,
          state,
          labels
        );


        return;
      }


      const select =
        event.target.closest(
          '[data-role="trainer-select"]'
        );


      if (
        !select ||
        state.lockTrainer
      ) {

        return;
      }


      const trainer =
        game.actors.get(
          select.value
        );


      if (
        !trainer ||
        !isTrainerActor(
          trainer
        )
      ) {

        return;
      }


      setBusy(
        root,
        true
      );


      try {

        await ensureTrainerState(
          trainer
        );


        state.trainerId =
          trainer.id;

        state.pcSearch =
          "";


        state.viewScroll = {
          battle:
            0,

          party:
            0,

          pc:
            0
        };

        const activeCount =
          getTrainerPartyState(
            trainer
          ).activePokemonUuids.length;


        if (
          activeCount >
          state.maxActive
        ) {

          state.maxActive =
            2;
        }


        refreshManager(
          root,
          state,
          labels
        );

      } catch (error) {

        console.error(
          `[${MODULE_ID}] Error cambiando Trainer`,
          error
        );


        ui.notifications.error(
          error?.message ??
          labels.error
        );

      } finally {

        setBusy(
          root,
          false
        );
      }
    }
  );


  root.addEventListener(
    "click",
    async event => {

      const viewButton =
        event.target.closest(
          "button[data-manager-view]"
        );


      if (viewButton) {

        changeManagerView(
          root,
          state,
          viewButton.dataset
            .managerView
        );

        return;
      }

      const button =
        event.target.closest(
          "button[data-trainer-action]"
        );


      if (!button) {

        return;
      }


      const action =
        button.dataset
          .trainerAction;


      const trainer =
        game.actors.get(
          state.trainerId
        );


      if (
        !trainer ||
        !isTrainerActor(
          trainer
        )
      ) {

        ui.notifications.warn(
          labels.error
        );

        return;
      }


      if (
        action === "switch"
      ) {

        setBusy(
          root,
          true
        );


        try {

          await executeSwitchAction(
            root,
            trainer,
            labels
          );


          refreshManager(
            root,
            state,
            labels
          );

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error cambiando Pokémon`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      const wildAction =
        action === "wild-to-party" ||
        action === "wild-to-pc";


      if (wildAction) {

        const tokenDocument =
          selectedWildPokemonToken(
            labels
          );


        if (!tokenDocument) {

          return;
        }


        setBusy(
          root,
          true
        );


        try {

          const result =
            await acquireWildPokemonToken(
              trainer,
              tokenDocument,
              {
                destination:
                  action === "wild-to-party"
                    ? "party"
                    : "pc"
              }
            );


          ui.notifications.info(
            action === "wild-to-party"
              ? labels.movedToParty(
                  result.pokemon.name
                )
              : labels.movedToPc(
                  result.pokemon.name
                )
          );


          refreshManager(
            root,
            state,
            labels
          );

        } catch (error) {

          console.error(
            `[${MODULE_ID}] Error adquiriendo Pokémon salvaje`,
            error
          );


          ui.notifications.error(
            error?.message ??
            labels.error
          );

        } finally {

          setBusy(
            root,
            false
          );
        }


        return;
      }

      const handler =
        ACTION_HANDLERS[
          action
        ];


      const switchServiceAction =
        action === "deploy" ||
        action === "recall";


      if (
        !handler &&
        !switchServiceAction
      ) {

        return;
      }


      const pokemon =
        selectedActionPokemon(
          root,
          button,
          labels
        );


      if (!pokemon) {

        return;
      }


      if (
        !isPokemonActor(
          pokemon
        )
      ) {

        ui.notifications.warn(
          labels.invalidPokemon
        );

        return;
      }


      if (
        action === "release" &&
        !(await confirmRelease(
          pokemon,
          labels
        ))
      ) {

        return;
      }


      setBusy(
        root,
        true
      );


      try {

        if (
          action === "deploy"
        ) {

          await deployPokemon(
            trainer,
            pokemon,
            {
              maxActive:
                state.maxActive
            }
          );

        } else if (
          action === "recall"
        ) {

          await recallPokemon(
            trainer,
            pokemon
          );

        } else {

          await handler(
            trainer,
            pokemon
          );
        }


        ui.notifications.info(
          actionNotification(
            action,
            pokemon,
            labels
          )
        );


        refreshManager(
          root,
          state,
          labels
        );

      } catch (error) {

        console.error(
          `[${MODULE_ID}] Error gestionando Trainer`,
          error
        );


        ui.notifications.error(
          error?.message ??
          labels.error
        );

      } finally {

        setBusy(
          root,
          false
        );
      }
    }
  );
}


/* ============================================================
 * PUBLIC
 * ============================================================ */

export async function openTrainerPartyDialog(
  {
    trainerId = null,
    lockTrainer = false
  } = {}
) {

  if (!game.user.isGM) {

    return null;
  }


  const labels =
    LABELS[
      getLanguage()
    ];


  const trainers =
    getTrainers();


  if (!trainers.length) {

    ui.notifications.warn(
      labels.noTrainer
    );

    return null;
  }


  const requestedTrainerId =
    trainerId ??
    trainerManagerState
      ?.trainerId ??
    null;


  const trainer =
    resolveTrainer(
      trainers,
      requestedTrainerId
    );


  if (!trainer) {

    ui.notifications.warn(
      labels.noTrainer
    );

    return null;
  }


  await ensureTrainerState(
    trainer
  );


  /*
   * Si el Manager ya está abierto,
   * reutilizamos la misma ventana.
   *
   * El contexto puede cambiar entre:
   *
   * - Global: selector de Trainers.
   * - Scoped: Trainer fijo.
   */

  if (
    trainerManagerDialog
      ?.rendered
  ) {

    if (
      trainerManagerState
    ) {

      trainerManagerState.trainerId =
        trainer.id;

      trainerManagerState.lockTrainer =
        Boolean(
          lockTrainer
        );

      const activeCount =
        getTrainerPartyState(
          trainer
        ).activePokemonUuids.length;


      if (
        activeCount >
        trainerManagerState.maxActive
      ) {

        trainerManagerState.maxActive =
          2;
      }


      const root =
        trainerManagerDialog
          .element
          .querySelector(
            `.${MANAGER_CLASS}`
          );


      if (root) {

        refreshManager(
          root,
          trainerManagerState,
          trainerManagerLabels ??
            labels
        );
      }
    }


    trainerManagerDialog
      .bringToFront();


    return trainerManagerDialog;
  }


  const activeCount =
    getTrainerPartyState(
      trainer
    ).activePokemonUuids.length;


  const state = {

    trainerId:
      trainer.id,

    lockTrainer:
      Boolean(
        lockTrainer
      ),

    maxActive:
      activeCount > 1
        ? 2
        : DEFAULT_MAX_ACTIVE,

    managerView:
      "battle",

    pcSearch:
      "",

    viewScroll: {
      battle:
        0,

      party:
        0,

      pc:
        0
    }
  };


  const dialog =
    new foundry.applications.api
      .DialogV2({

        id:
          "poke5e-trainer-manager",

        classes: [
          "poke5e-trainer-party-dialog"
        ],

        window: {

          title:
            labels.title,

          minimizable:
            true
        },

        content: `
          <section
            class="${MANAGER_CLASS}"
          ></section>
        `,

        buttons: [
          {

            action:
              "close",

            label:
              labels.close,

            default:
              true
          }
        ]
      });


  trainerManagerDialog =
    dialog;

  trainerManagerState =
    state;

  trainerManagerLabels =
    labels;


  dialog.addEventListener(
    "render",
    () =>
      activateManager(
        dialog,
        state,
        labels
      ),
    {
      once:
        true
    }
  );


  dialog.addEventListener(
    "close",
    () => {

      if (
        trainerManagerDialog ===
        dialog
      ) {

        trainerManagerDialog =
          null;

        trainerManagerState =
          null;

        trainerManagerLabels =
          null;
      }
    },
    {
      once:
        true
    }
  );


  await dialog.render({
    force:
      true
  });


  return dialog;
}