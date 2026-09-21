import {
  playPokemonCry
} from "./pokemon-cry-service.mjs";

import {
  playTrainerBattleSfx
} from "./trainer-battle-sfx-service.mjs";

import {
  getPokemonTrainerUuid,
  getTrainerPartyState,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const ROOT_CLASS =
  "poke5e-trainer-command-center";

const FEEDBACK_DURATION_MS =
  1000;

const LONG_FEEDBACK_DURATION_MS =
  2200;

const FEEDBACK_DELAY_MS =
  60;

const pokemonHpById =
  new Map();

const DEPLOY_CRY_DELAY_MS =
  350;

const SWITCH_RECALL_DELAY_MS =
  650;


const LABELS = {

  es: {
    deploy:
      pokemon =>
        `¡${pokemon.name}, adelante!`,

    recall:
      pokemon =>
        `¡${pokemon.name}, regresa!`,

    switch:
      (
        outgoing,
        incoming
      ) =>
        `${outgoing.name} → ${incoming.name}`,

    fainted:
      pokemon =>
        `¡${pokemon.name} está debilitado!`
  },


  en: {
    deploy:
      pokemon =>
        `Go, ${pokemon.name}!`,

    recall:
      pokemon =>
        `${pokemon.name}, come back!`,

    switch:
      (
        outgoing,
        incoming
      ) =>
        `${outgoing.name} → ${incoming.name}`,

    fainted:
      pokemon =>
        `${pokemon.name} fainted!`
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
 * POKÉMON STATE
 * ============================================================ */

function pokemonHpValue(
  pokemon
) {

  const value =
    Number(
      pokemon.system
        ?.attributes
        ?.hp
        ?.value
    );


  return Number.isFinite(
    value
  )
    ? value
    : null;
}


function trainerFromUuid(
  uuid
) {

  if (!uuid) {
    return null;
  }


  const trainer =
    game.actors.find(
      actor =>
        actor.uuid ===
        uuid
    );


  return isTrainerActor(
    trainer
  )
    ? trainer
    : null;
}


function ownerTrainerForPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {
    return null;
  }


  return trainerFromUuid(
    getPokemonTrainerUuid(
      pokemon
    )
  );
}


function isActivePokemon(
  trainer,
  pokemon
) {

  return getTrainerPartyState(
    trainer
  )
    .activePokemonUuids
    .includes(
      pokemon.uuid
    );
}


/* ============================================================
 * DOM
 * ============================================================ */

function trainerRoots(
  trainer
) {

  return [
    ...document.querySelectorAll(
      `.${ROOT_CLASS}`
    )
  ].filter(
    root =>
      root.dataset.trainerId ===
        trainer.id
  );
}


function pokemonCard(
  root,
  selector,
  pokemon
) {

  if (!pokemon) {
    return null;
  }


  return [
    ...root.querySelectorAll(
      selector
    )
  ].find(
    element =>
      element.dataset.pokemonId ===
        pokemon.id
  ) ??
    null;
}


function animateCard(
  element,
  className
) {

  if (!element) {
    return;
  }


  element.classList.remove(
    className
  );


  element.getBoundingClientRect();


  element.classList.add(
    className
  );


  window.setTimeout(
    () => {

      element.classList.remove(
        className
      );
    },

    FEEDBACK_DURATION_MS
  );
}


function eventIconClass(
  reason
) {

  if (
    reason ===
      "fainted"
  ) {
    return "fa-solid fa-circle-xmark";
  }


  if (
    reason ===
      "recall"
  ) {
    return "fa-solid fa-arrow-down";
  }


  if (
    reason ===
      "switch"
  ) {
    return "fa-solid fa-right-left";
  }


  return "fa-solid fa-bolt";
}


function eventMessage({
  reason,
  outgoing,
  incoming,
  pokemon
}) {

  const labels =
    LABELS[
      getLanguage()
    ];


  if (
    reason ===
      "fainted" &&
    pokemon
  ) {

    return labels.fainted(
      pokemon
    );
  }


  if (
    reason ===
      "deploy" &&
    incoming
  ) {

    return labels.deploy(
      incoming
    );
  }


  if (
    reason ===
      "recall" &&
    outgoing
  ) {

    return labels.recall(
      outgoing
    );
  }


  if (
    reason ===
      "switch" &&
    outgoing &&
    incoming
  ) {

    return labels.switch(
      outgoing,
      incoming
    );
  }


  return "";
}

function eventDurationMs(
  reason
) {

  return (
    reason === "fainted" ||
    reason === "recall"
  )
    ? LONG_FEEDBACK_DURATION_MS
    : FEEDBACK_DURATION_MS;
}

function showEventBanner(
  root,
  payload
) {

  const message =
    eventMessage(
      payload
    );


  if (!message) {
    return;
  }


  root.querySelector(
    ".poke5e-trainer-battle-event"
  )?.remove();


  const banner =
    document.createElement(
      "div"
    );


  banner.className =
    "poke5e-trainer-battle-event";


  banner.dataset.reason =
    payload.reason;


  const icon =
    document.createElement(
      "i"
    );


  icon.className =
    eventIconClass(
      payload.reason
    );


  icon.setAttribute(
    "aria-hidden",
    "true"
  );


  const text =
    document.createElement(
      "span"
    );


  text.textContent =
    message;


  banner.append(
    icon,
    text
  );


  root.append(
    banner
  );


  window.setTimeout(
    () => {

      banner.remove();
    },

    eventDurationMs(
      payload.reason
    )
  );
}


function renderBattleFeedback(
  payload
) {

  for (
    const root
    of trainerRoots(
      payload.trainer
    )
  ) {

    showEventBanner(
      root,
      payload
    );


    if (
      payload.reason ===
        "deploy"
    ) {

      animateCard(
        pokemonCard(
          root,
          ".poke5e-trainer-command-card--active",
          payload.incoming
        ),

        "is-battle-incoming"
      );

      continue;
    }


    if (
      payload.reason ===
        "recall"
    ) {

      animateCard(
        pokemonCard(
          root,
          ".poke5e-trainer-party-card",
          payload.outgoing
        ),

        "is-battle-recalled"
      );

      continue;
    }


    if (
      payload.reason ===
        "switch"
    ) {

      animateCard(
        pokemonCard(
          root,
          ".poke5e-trainer-party-card",
          payload.outgoing
        ),

        "is-battle-outgoing"
      );


      animateCard(
        pokemonCard(
          root,
          ".poke5e-trainer-command-card--active",
          payload.incoming
        ),

        "is-battle-incoming"
      );
    }
  }
}


function renderFaintedFeedback(
  trainer,
  pokemon
) {

  const payload = {
    reason:
      "fainted",

    pokemon
  };


  for (
    const root
    of trainerRoots(
      trainer
    )
  ) {

    showEventBanner(
      root,
      payload
    );


    animateCard(
      pokemonCard(
        root,
        ".poke5e-trainer-command-card--active",
        pokemon
      ),

      "is-battle-fainted"
    );
  }
}


/* ============================================================
 * HP TRANSITION
 * ============================================================ */

function seedPokemonHpState() {

  pokemonHpById.clear();


  for (
    const actor
    of game.actors
  ) {

    if (
      !isPokemonActor(
        actor
      )
    ) {
      continue;
    }


    const hp =
      pokemonHpValue(
        actor
      );


    if (
      hp != null
    ) {

      pokemonHpById.set(
        actor.id,
        hp
      );
    }
  }
}


function onCreatePokemonActor(
  actor
) {

  if (
    !isPokemonActor(
      actor
    )
  ) {
    return;
  }


  const hp =
    pokemonHpValue(
      actor
    );


  if (
    hp != null
  ) {

    pokemonHpById.set(
      actor.id,
      hp
    );
  }
}


function onDeletePokemonActor(
  actor
) {

  pokemonHpById.delete(
    actor.id
  );
}


function onUpdatePokemonActor(
  actor
) {

  if (
    !isPokemonActor(
      actor
    )
  ) {
    return;
  }


  const currentHp =
    pokemonHpValue(
      actor
    );


  if (
    currentHp == null
  ) {
    return;
  }


  const previousHp =
    pokemonHpById.get(
      actor.id
    );


  pokemonHpById.set(
    actor.id,
    currentHp
  );


  if (
    previousHp == null ||
    previousHp <= 0 ||
    currentHp > 0
  ) {
    return;
  }


  const trainer =
    ownerTrainerForPokemon(
      actor
    );


  if (
    !trainer ||
    !isActivePokemon(
      trainer,
      actor
    )
  ) {
    return;
  }


  window.setTimeout(
    () => {

      renderFaintedFeedback(
        trainer,
        actor
      );
    },

    FEEDBACK_DELAY_MS
  );
}

/* ============================================================
 * AUDIO SEQUENCE
 * ============================================================ */

function wait(
  milliseconds
) {

  return new Promise(
    resolve => {

      window.setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}


async function playBattleAudio(
  payload
) {

  if (
    payload.reason ===
      "recall"
  ) {

    await playTrainerBattleSfx(
      "recall"
    );

    return;
  }


  if (
    payload.reason ===
      "deploy" &&
    payload.incoming
  ) {

    const deployPlayed =
      await playTrainerBattleSfx(
        "deploy"
      );


    if (
      deployPlayed
    ) {

      await wait(
        DEPLOY_CRY_DELAY_MS
      );
    }


    await playPokemonCry(
      payload.incoming
    );

    return;
  }


  if (
    payload.reason ===
      "switch" &&
    payload.incoming
  ) {

    const recallPlayed =
      await playTrainerBattleSfx(
        "recall"
      );


    if (
      recallPlayed
    ) {

      await wait(
        SWITCH_RECALL_DELAY_MS
      );
    }


    const deployPlayed =
      await playTrainerBattleSfx(
        "deploy"
      );


    if (
      deployPlayed
    ) {

      await wait(
        DEPLOY_CRY_DELAY_MS
      );
    }


    await playPokemonCry(
      payload.incoming
    );
  }
}

/* ============================================================
 * SWITCH EVENT
 * ============================================================ */

function isSupportedReason(
  reason
) {

  return [
    "deploy",
    "recall",
    "switch"
  ].includes(
    reason
  );
}


function onPokemonSwitched(
  payload
) {

  if (
    !payload?.trainer ||
    !isSupportedReason(
      payload.reason
    )
  ) {
    return;
  }


  window.setTimeout(
    () => {

      renderBattleFeedback(
        payload
      );
    },

    FEEDBACK_DELAY_MS
  );


  void playBattleAudio(
    payload
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerTrainerBattleFeedback() {

  Hooks.on(
    "poke5ePokemonSwitched",
    onPokemonSwitched
  );


  Hooks.on(
    "createActor",
    onCreatePokemonActor
  );

  Hooks.on(
    "updateActor",
    onUpdatePokemonActor
  );

  Hooks.on(
    "deleteActor",
    onDeletePokemonActor
  );


  Hooks.once(
    "ready",
    seedPokemonHpState
  );
}