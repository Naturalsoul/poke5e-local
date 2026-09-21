import {
  processPokemonPeriodicEndTurn
} from "./periodic-engine.mjs";
import {
  processConfusionEndTurn,
  processConfusionStartTurn
} from "./confusion-engine.mjs";
import {
  findStatusEffect,
  hasStatusImmunityAbility,
  pokemonStatus,
  pokemonTypes
} from "./status-runtime.mjs";
import {
  activateFollowingTurnMoveModifiers,
  expireActiveMoveModifiers
} from "./move-modifier-runtime.mjs";
import {
  clearEndOfNextTurnEffects,
  expireEndOfNextTurnEffects,
  markEndOfNextTurnEffectsStarted
} from "./turn-duration-runtime.mjs";

import {
  isPokemonRecoveryInProgress
} from "./pokemon-recovery-context.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * INMUNIDADES DE ESTADO POR TIPO
 *
 * Poke5e 2024
 * ============================================================ */

const STATUS_IMMUNITIES = {

  paralysis: [
    "electric"
  ],

  poisoned: [
    "poison",
    "steel"
  ],

  burned: [
    "fire"
  ],

  frozen: [
    "ice"
  ]
};

/* ============================================================
 * ESTADOS NO-VOLÁTILES
 *
 * Poke5e:
 * un Pokémon solo puede tener uno simultáneamente.
 * ============================================================ */

const NON_VOLATILE_STATUSES =
  new Set([
    "asleep",
    "burned",
    "frozen",
    "paralysis",
    "poisoned",
    "badly-poisoned"
  ]);


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    poisoned:
      "Envenenado",

    paralysis:
      "Parálisis",

    asleep:
      "Dormido",

    poisonDamage:
      "daño por Envenenado",

    paralysisRoll:
      "Chequeo de Parálisis",

    asleepRoll:
      "Chequeo de Dormido",

    wakesUp:
      "se despierta",

    remainsAsleep:
      "continúa dormido",

    fullyParalyzed:
      "queda completamente paralizado este turno",

    overcomesParalysis:
      "puede actuar normalmente",

    immune:
      "es inmune a",

    burned:
        "Quemado",

    frozen:
        "Congelado",

    badlyPoisoned:
        "Gravemente envenenado",

    burnedDamage:
        "daño por Quemado",

    frozenSave:
        "Salvación contra Congelado",

    breaksFree:
        "se libera del Congelamiento",

    remainsFrozen:
        "continúa Congelado",

    burnedReminder:
        "tirará automáticamente cada daño dos veces y conservará el resultado menor mientras esté Quemado"
  },


  en: {

    poisoned:
      "Poisoned",

    paralysis:
      "Paralysis",

    asleep:
      "Asleep",

    poisonDamage:
      "Poisoned damage",

    paralysisRoll:
      "Paralysis Check",

    asleepRoll:
      "Asleep Check",

    wakesUp:
      "wakes up",

    remainsAsleep:
      "remains asleep",

    fullyParalyzed:
      "is fully paralyzed this turn",

    overcomesParalysis:
      "can act normally",

    immune:
      "is immune to",

    burned:
        "Burned",

    frozen:
        "Frozen",

    badlyPoisoned:
        "Badly Poisoned",

    burnedDamage:
        "Burned damage",

    frozenSave:
        "Frozen Saving Throw",

    breaksFree:
        "breaks free from Frozen",

    remainsFrozen:
        "remains Frozen",

    burnedReminder:
        "will automatically roll each damage roll twice and keep the lower result while Burned"
  }
};


/* ============================================================
 * AUTORIDAD
 *
 * combatTurnChange ocurre en todos los clientes.
 *
 * Solo un GM debe modificar Actors.
 * ============================================================ */

function isAuthority() {

  const activeGM =
    game.users.activeGM;


  if (activeGM) {

    return (
      activeGM.id ===
      game.user.id
    );
  }


  return game.user.isGM;
}


/* ============================================================
 * IDIOMA
 * ============================================================ */

function language() {

  const configured =
    game.settings.get(
      MODULE_ID,
      "language"
    );


  return configured === "en"
    ? "en"
    : "es";
}


function label(
  key
) {

  return (
    LABELS[
      language()
    ][key] ??
    key
  );
}


/* ============================================================
 * POKEMON ACTOR
 * ============================================================ */

function isPokemonActor(
  actor
) {

  return Boolean(
    actor?.getFlag(
      MODULE_ID,
      "sourceId"
    )
  );
}


/* ============================================================
 * PB
 *
 * Misma progresión que ya utiliza nuestro builder.
 * ============================================================ */

function pokemonProficiency(
  actor
) {

  const level =
    Number(
      actor.getFlag(
        MODULE_ID,
        "level"
      ) ??
      1
    );


  const normalized =
    Math.max(
      1,
      Math.min(
        20,
        level
      )
    );


  return (
    2 +
    Math.floor(
      (normalized - 1) / 4
    )
  );
}

/* ============================================================
 * INMUNIDAD
 * ============================================================ */

function isImmuneToStatus(
  actor,
  status
) {

  /*
   * Inmunidades provenientes de Abilities.
   *
   * Caso inicial confirmado:
   *
   * Comatose → inmune a Asleep.
   */

  if (
    hasStatusImmunityAbility(
      actor,
      status
    )
  ) {

    return true;
  }


  /*
   * Inmunidades provenientes del tipo Pokémon.
   */

  const immuneTypes =
    STATUS_IMMUNITIES[
      status
    ];


  if (
    !immuneTypes
      ?.length
  ) {

    return false;
  }


  const types =
    pokemonTypes(
      actor
    );


  return immuneTypes.some(
    type =>
      types.includes(
        type
      )
  );
}

/* ============================================================
 * GRACE PERIOD
 *
 * flags.poke5e-local.statusGrace
 *
 * Ejemplo:
 *
 * {
 *   poisoned: {
 *     turnStarted: false,
 *     createdAt: 123456789
 *   }
 * }
 *
 * turnStarted pasa a true cuando comienza
 * el SIGUIENTE turno del Pokémon.
 *
 * Al terminar ese turno se elimina.
 * ============================================================ */

function graceState(
  actor
) {

  const current =
    actor.getFlag(
      MODULE_ID,
      "statusGrace"
    );


  return current

    ? foundry.utils.deepClone(
        current
      )

    : {};
}


/* ============================================================
 * ¿ESTÁ EN GRACE PERIOD?
 * ============================================================ */

function hasGracePeriod(
  actor,
  status
) {

  const grace =
    graceState(
      actor
    );


  return Boolean(
    grace[status]
  );
}


/* ============================================================
 * CREAR GRACE PERIOD
 * ============================================================ */

async function addGracePeriod(
  actor,
  status
) {

  if (
    !NON_VOLATILE_STATUSES.has(
      status
    )
  ) {

    return;
  }


  const grace =
    graceState(
      actor
    );


  grace[status] = {

    /*
     * Todavía NO ha comenzado
     * el siguiente turno.
     */

    turnStarted:
      false,


    createdAt:
      Date.now()
  };


  await actor.setFlag(
    MODULE_ID,
    "statusGrace",
    grace
  );


  console.log(
    `[${MODULE_ID}] Grace Period:`,
    actor.name,
    status
  );
}


/* ============================================================
 * COMIENZA EL SIGUIENTE TURNO
 *
 * Las Grace Period existentes pasan
 * a estar listas para expirar al final.
 * ============================================================ */

async function markGraceTurnStarted(
  actor
) {

  const grace =
    graceState(
      actor
    );


  let changed =
    false;


  for (
    const entry
    of Object.values(
      grace
    )
  ) {

    if (
      !entry.turnStarted
    ) {

      entry.turnStarted =
        true;

      changed =
        true;
    }
  }


  if (!changed) {

    return;
  }


  await actor.setFlag(
    MODULE_ID,
    "statusGrace",
    grace
  );
}


/* ============================================================
 * FIN DEL SIGUIENTE TURNO
 *
 * Eliminamos Grace Period cuyo turno
 * de protección ya terminó.
 * ============================================================ */

async function clearCompletedGrace(
  actor
) {

  const grace =
    graceState(
      actor
    );


  let changed =
    false;


  for (
    const [
      status,
      entry
    ]
    of Object.entries(
      grace
    )
  ) {

    if (
      entry.turnStarted
    ) {

      delete grace[
        status
      ];

      changed =
        true;
    }
  }


  if (!changed) {

    return;
  }


  if (
    Object.keys(
      grace
    ).length
  ) {

    await actor.setFlag(
      MODULE_ID,
      "statusGrace",
      grace
    );

  } else {

    await actor.unsetFlag(
      MODULE_ID,
      "statusGrace"
    );
  }
}

/* ============================================================
 * ESTADO NO-VOLÁTIL ACTUAL
 * ============================================================ */

function activeNonVolatileEffect(
  actor
) {

  return actor.effects.find(
    effect => {

      if (
        effect.disabled
      ) {

        return false;
      }


      const status =
        pokemonStatus(
          effect
        );


      return (
        status &&
        NON_VOLATILE_STATUSES.has(
          status
        )
      );
    }
  );
}


/* ============================================================
 * CHAT
 * ============================================================ */

async function chat(
  actor,
  content
) {

  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${content}</div>`
  });
}


/* ============================================================
 * ROLL
 * ============================================================ */

async function rollToChat(
  actor,
  formula,
  flavor
) {

  const roll =
    new Roll(
      formula
    );


  await roll.evaluate();


  await roll.toMessage({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    flavor
  });


  return roll;
}


/* ============================================================
 * EFECTO TEMPORAL DE PARÁLISIS
 *
 * Solo dura desde el inicio de este turno
 * hasta el inicio del siguiente turno del actor.
 * ============================================================ */

function findParalysisLock(
  actor
) {

  return actor.effects.find(
    effect =>

      effect.getFlag(
        MODULE_ID,
        "kind"
      ) ===
      "paralysis-turn-lock"
  );
}


async function removeParalysisLock(
  actor
) {

  const effect =
    findParalysisLock(
      actor
    );


  if (effect) {

    await effect.delete();
  }
}


async function createParalysisLock(
  actor
) {

  /*
   * Evitar duplicados.
   */

  await removeParalysisLock(
    actor
  );


  await actor.createEmbeddedDocuments(
    "ActiveEffect",
    [
      {

        name:

          language() === "es"

            ? "Parálisis — turno bloqueado"

            : "Paralysis — Turn Locked",


        img:
          "icons/svg/lightning.svg",


        disabled:
          false,


        transfer:
          false,


        statuses: [
          "incapacitated",
          "restrained"
        ],


        flags: {

          [MODULE_ID]: {

            kind:
              "paralysis-turn-lock"
          }
        }
      }
    ]
  );
}


/* ============================================================
 * POISONED
 *
 * Daño = PB
 *
 * Lo aplicamos como número puro.
 *
 * Así NO vuelve a pasar por resistencias de tipo.
 * ============================================================ */

async function processPoisoned(
  actor
) {

  const effect =
    findStatusEffect(
      actor,
      "poisoned"
    );


  if (!effect) {

    return;
  }

  if (
    isUnconscious(
        actor
    )
    ) {

        return;
    }


  const pb =
    pokemonProficiency(
      actor
    );


  if (
    pb <= 0
  ) {

    return;
  }


  /*
   * Actor5e.applyDamage(number)
   *
   * D&D5e interpreta la cantidad numérica
   * como daño directo.
   */

  await actor.applyDamage(
    pb
  );


  await chat(
    actor,

    `
      <strong>${actor.name}</strong>:
      ${label("poisonDamage")}
      <strong>${pb}</strong>.
    `
  );
}

/* ============================================================
 * BURNED
 *
 * Fin del turno:
 *
 * daño = PB propio
 * ============================================================ */

async function processBurned(
  actor
) {

  const effect =
    findStatusEffect(
      actor,
      "burned"
    );


  if (!effect) {

    return;
  }


  if (
    isUnconscious(
      actor
    )
  ) {

    return;
  }


  const pb =
    pokemonProficiency(
      actor
    );


  if (
    pb <= 0
  ) {

    return;
  }


  await actor.applyDamage(
    pb
  );


  await chat(
    actor,

    `
      <strong>${actor.name}</strong>:
      ${label("burnedDamage")}
      <strong>${pb}</strong>.
    `
  );
}

/* ============================================================
 * FROZEN
 *
 * Fin del turno:
 *
 * STR Save
 * DC = 10 + PB del causante
 * ============================================================ */

async function processFrozen(
  actor
) {

  const effect =
    findStatusEffect(
      actor,
      "frozen"
    );


  if (!effect) {

    return;
  }


  const recovery =
    effect.getFlag(
      MODULE_ID,
      "recovery"
    ) ??
    {};


  const dc =
    Math.max(
      1,
      Number(
        recovery.dc ??
        12
      )
    );


  /*
   * Usamos la tirada nativa D&D5e.
   *
   * Esto respeta:
   *
   * - STR modifier
   * - save proficiency
   * - bonuses
   * - advantage/disadvantage
   */

  const rolls =
    await actor.rollSavingThrow(

      {

        ability:
          "str",

        target:
          dc
      },


      {

        /*
         * Sin ventana intermedia.
         */

        configure:
          false
      },


      {

        data: {

          flavor:

            `${label("frozenSave")} — ` +
            `${actor.name} (DC ${dc})`
        }
      }
    );


  const roll =
    rolls?.[0];


  if (!roll) {

    return;
  }


  if (
    roll.total >=
    dc
  ) {

    /*
     * deleteActiveEffect activará
     * automáticamente nuestro Grace Period.
     */

    await effect.delete();


    await chat(
      actor,

      `
        <strong>${actor.name}</strong>
        ${label("breaksFree")}.
      `
    );


    return;
  }


  await chat(
    actor,

    `
      <strong>${actor.name}</strong>
      ${label("remainsFrozen")}.
    `
  );
}


/* ============================================================
 * ASLEEP
 *
 * Fin del turno:
 *
 * d20 >= 11
 * → termina Dormido
 * ============================================================ */

async function processAsleep(
  actor
) {

  const effect =
    findStatusEffect(
      actor,
      "asleep"
    );


  if (!effect) {

    return;
  }


  const roll =
    await rollToChat(

      actor,

      "1d20",

      `${label("asleepRoll")} — ${actor.name}`
    );


  if (
    roll.total >= 11
  ) {

    await effect.delete();


    await chat(
      actor,

      `
        <strong>${actor.name}</strong>
        ${label("wakesUp")}.
      `
    );


    return;
  }


  await chat(
    actor,

    `
      <strong>${actor.name}</strong>
      ${label("remainsAsleep")}.
    `
  );
}

/* ============================================================
 * EFECTOS CON CURACIÓN AL FINAL DEL TURNO
 *
 * Actualmente:
 *
 * Aqua Ring → @prof
 *
 * La infraestructura queda preparada para
 * más movimientos en el futuro.
 * ============================================================ */

function endTurnHealingEffects(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>

      !effect.disabled &&

      Boolean(
        effect.getFlag(
          MODULE_ID,
          "endTurnHealing"
        )
      )
  );
}


/* ============================================================
 * RESOLVER CANTIDAD DE CURACIÓN
 * ============================================================ */

function resolveHealingAmount(
  actor,
  formula
) {

  /*
   * Caso principal actual.
   */

  if (
    formula ===
    "@prof"
  ) {

    return pokemonProficiency(
      actor
    );
  }


  /*
   * También permitimos números directos
   * para movimientos futuros.
   */

  const numeric =
    Number(
      formula
    );


  if (
    Number.isFinite(
      numeric
    )
  ) {

    return Math.max(
      0,
      numeric
    );
  }


  console.warn(
    `[${MODULE_ID}] Fórmula de curación no soportada:`,
    formula
  );


  return 0;
}


/* ============================================================
 * PROCESAR CURACIÓN PERIÓDICA
 * ============================================================ */

async function processEndTurnHealing(
  actor
) {

  const effects =
    endTurnHealingEffects(
      actor
    );


  if (
    !effects.length
  ) {

    return;
  }


  /*
   * Un Pokémon inconsciente no debería
   * mantener normalmente un efecto que exige
   * concentración.
   *
   * Además evita que Aqua Ring reviva
   * accidentalmente a un Pokémon a 0 HP.
   */

  if (
    isUnconscious(
      actor
    )
  ) {

    return;
  }


  for (
    const effect
    of effects
  ) {

    const healing =
      effect.getFlag(
        MODULE_ID,
        "endTurnHealing"
      );


    if (!healing) {

      continue;
    }


    const requested =
      resolveHealingAmount(
        actor,
        healing.formula
      );


    if (
      requested <= 0
    ) {

      continue;
    }


    /* ========================================================
     * HP ACTUAL
     * ======================================================== */

    const hp =
      actor.system
        ?.attributes
        ?.hp;


    if (!hp) {

      continue;
    }


    const current =
      Number(
        hp.value ??
        0
      );


    const maximum =
      Number(
        hp.max ??
        current
      );


    /*
     * Ya está a HP máximo.
     */

    if (
      current >= maximum
    ) {

      continue;
    }


    /*
     * No mostramos "curó 4" si solo le
     * faltaba 1 HP.
     */

    const actual =
      Math.min(
        requested,
        maximum - current
      );


    if (
      actual <= 0
    ) {

      continue;
    }


    /* ========================================================
     * HEAL
     *
     * D&D5e interpreta daño negativo como
     * curación y además limita automáticamente
     * la recuperación al máximo de HP.
     * ======================================================== */

    await actor.applyDamage(
      -actual
    );


    /* ========================================================
     * CHAT
     * ======================================================== */

    await chat(
      actor,
      `
        <strong>${actor.name}</strong>
        recupera
        <strong>${actual} HP</strong>
        gracias a
        <strong>${effect.name}</strong>.
      `
    );


    console.debug(
      `[${MODULE_ID}] ${actor.name}: ` +
      `${effect.name} cura ${actual} HP.`
    );
  }
}

/* ============================================================
 * END TURN
 * ============================================================ */

async function processEndTurn(
  actor
) {

  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  /* ==========================================================
   * DAÑO PERIÓDICO
   * ========================================================== */

  await processPoisoned(
    actor
  );


  await processBurned(
    actor
  );


  /* ==========================================================
   * RECUPERACIONES
   * ========================================================== */

  await processAsleep(
    actor
  );


  await processFrozen(
    actor
  );

  /* ============================================================
  * DAÑOS / EFECTOS PERIÓDICOS DE MOVES
  *
  * Leech Seed
  * ============================================================ */

  await processPokemonPeriodicEndTurn(
    actor
  );

  /* ============================================================
  * BUFFS / EFECTOS PERIÓDICOS
  * ============================================================ */

  await processEndTurnHealing(
    actor
  );

  await processConfusionEndTurn(
    actor
  );


  /* ==========================================================
   * GRACE PERIOD
   * ========================================================== */

  await clearCompletedGrace(
    actor
  );

  /* ==========================================================
  * MODIFICADORES LIMITADOS A ESTE TURNO
  *
  * Si Anger Point no fue utilizado,
  * expira aquí.
  * ========================================================== */

  await expireActiveMoveModifiers(
    actor
  );

  /* ==========================================================
   * MODIFICADORES HASTA FIN DEL SIGUIENTE TURNO
   *
   * Debe ser la última fase del turno para que el efecto
   * permanezca activo durante todo ese turno.
   * ========================================================== */

  await expireEndOfNextTurnEffects(
    actor
  );
}


/* ============================================================
 * PARALYSIS
 *
 * Inicio de turno:
 *
 * 1d4
 *
 * 1 = incapacitated + restrained
 * ============================================================ */

async function processParalysis(
  actor
) {

  /*
   * El bloqueo del turno anterior termina
   * al comenzar este nuevo turno.
   */

  await removeParalysisLock(
    actor
  );


  const effect =
    findStatusEffect(
      actor,
      "paralysis"
    );


  if (!effect) {

    return;
  }


  const roll =
    await rollToChat(

      actor,

      "1d4",

      `${label("paralysisRoll")} — ${actor.name}`
    );


  if (
    roll.total === 1
  ) {

    await createParalysisLock(
      actor
    );


    await chat(
      actor,

      `
        <strong>${actor.name}</strong>
        ${label("fullyParalyzed")}.
      `
    );


    return;
  }


  await chat(
    actor,

    `
      <strong>${actor.name}</strong>
      ${label("overcomesParalysis")}.
    `
  );
}

/* ============================================================
 * ACTIVE EFFECT CREADO
 *
 * Mensajes especiales de estados válidos.
 * ============================================================ */

async function onCreateActiveEffect(
  effect
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  const actor =

    effect.parent
      ?.documentName ===
      "Actor"

      ? effect.parent

      : null;


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  const status =
    pokemonStatus(
      effect
    );


  if (
    status ===
    "burned"
  ) {

    await chat(
      actor,

      `
        <strong>${actor.name}</strong>:
        ${label("burnedReminder")}.
      `
    );
  }
}


/* ============================================================
 * MODIFICADORES QUE EXPIRAN
 * AL COMIENZO DEL PRÓXIMO TURNO
 *
 * Ejemplo:
 *
 * Defense Curl
 * ============================================================ */

async function expireStartTurnModifiers(
  actor
) {

  const effects =
    actor.effects.filter(
      effect =>

        !effect.disabled &&

        effect.getFlag(
          MODULE_ID,
          "kind"
        ) ===
          "pokemon-modifier" &&

        effect.getFlag(
          MODULE_ID,
          "expireAtStartTurn"
        ) ===
          true
    );


  if (
    !effects.length
  ) {

    return;
  }


  await actor.deleteEmbeddedDocuments(

    "ActiveEffect",

    effects.map(
      effect =>
        effect.id
    )
  );


  console.debug(
    `[${MODULE_ID}] ${actor.name}: ` +
    `${effects.length} modificador(es) expirados al inicio del turno.`
  );
}

/* ============================================================
 * START TURN
 * ============================================================ */

async function processStartTurn(
  actor
) {

  if (
    !actor ||
    !isPokemonActor(actor)
  ) {

    return;
  }

  /* ==========================================================
   * MODIFICADORES HASTA FIN DEL SIGUIENTE TURNO
   *
   * Gooey:
   * comienza ahora el turno cuya finalización
   * hará expirar el movement lock.
   * ========================================================== */

  await markEndOfNextTurnEffectsStarted(
    actor
  );

  /* ==========================================================
  * MODIFICADORES ARMADOS PARA EL SIGUIENTE TURNO
  *
  * Anger Point:
  * armed → active
  * ========================================================== */

  await activateFollowingTurnMoveModifiers(
    actor
  );

  /* ==========================================================
   * EFECTOS "HASTA TU PRÓXIMO TURNO"
   * ========================================================== */

  await expireStartTurnModifiers(
    actor
  );


  /* ==========================================================
   * GRACE PERIOD
   * ========================================================== */

  await markGraceTurnStarted(
    actor
  );


  /* ==========================================================
   * ESTADOS
   * ========================================================== */

  await processParalysis(
    actor
  );


  /*
  * Poke5e:
  * Paralysis se resuelve antes
  * que Confused.
  */

  await processConfusionStartTurn(
    actor
  );
}


/* ============================================================
 * DIRECCIÓN DEL COMBATE
 *
 * No queremos activar efectos si el GM
 * retrocede manualmente el Combat Tracker.
 * ============================================================ */

function isForwardTransition(
  prior,
  current
) {

  /*
   * Inicio del primer turno.
   */

  if (
    prior?.combatantId == null &&
    current?.combatantId
  ) {

    return true;
  }


  const previousRound =
    Number(
      prior?.round ??
      0
    );


  const currentRound =
    Number(
      current?.round ??
      0
    );


  if (
    currentRound >
    previousRound
  ) {

    return true;
  }


  if (
    currentRound <
    previousRound
  ) {

    return false;
  }


  const previousTurn =
    Number(
      prior?.turn ??
      -1
    );


  const currentTurn =
    Number(
      current?.turn ??
      -1
    );


  return (
    currentTurn >
    previousTurn
  );
}


/* ============================================================
 * COMBAT TURN CHANGE
 * ============================================================ */

async function onCombatTurnChange(
  combat,
  prior,
  current
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  if (
    !isForwardTransition(
      prior,
      current
    )
  ) {

    return;
  }


  /* ==========================================================
   * FIN DEL TURNO ANTERIOR
   * ========================================================== */

  if (
    prior?.combatantId
  ) {

    const previousCombatant =
      combat.combatants.get(
        prior.combatantId
      );


    if (
      previousCombatant?.actor
    ) {

      await processEndTurn(
        previousCombatant.actor
      );
    }
  }


  /* ==========================================================
   * INICIO DEL TURNO NUEVO
   * ========================================================== */

  if (
    current?.combatantId
  ) {

    const currentCombatant =
      combat.combatants.get(
        current.combatantId
      );


    if (
      currentCombatant?.actor
    ) {

      await processStartTurn(
        currentCombatant.actor
      );
    }
  }
}

/* ============================================================
 * MENSAJE DE BLOQUEO
 * ============================================================ */

function blockedMessage(
  actor,
  status,
  reason,
  existingStatus = null
) {

  const lang =
    language();


  const names = {

    es: {

      poisoned:
        "Envenenado",

      paralysis:
        "Parálisis",

      asleep:
        "Dormido",

      burned:
        "Quemado",

      frozen:
        "Congelado",

      "badly-poisoned":
        "Gravemente envenenado",

      flinched:
        "Retroceso",
    },


    en: {

      poisoned:
        "Poisoned",

      paralysis:
        "Paralysis",

      asleep:
        "Asleep",

      burned:
        "Burned",

      frozen:
        "Frozen",

      "badly-poisoned":
        "Badly Poisoned",

      flinched:
        "Flinched",
    }
  };


  const statusName =
    names[lang][status] ??
    status;


  let text = "";


  if (
    reason ===
    "immune"
  ) {

    text =
      lang === "es"

        ? `${actor.name} es inmune a ${statusName}.`

        : `${actor.name} is immune to ${statusName}.`;
  }


  else if (
    reason ===
    "grace"
  ) {

    text =
      lang === "es"

        ? `${actor.name} está en período de gracia contra ${statusName}.`

        : `${actor.name} is in its Grace Period against ${statusName}.`;
  }


  else if (
    reason ===
    "non-volatile"
  ) {

    const currentName =

      names[lang][
        existingStatus
      ] ??

      existingStatus;


    text =
      lang === "es"

        ? (
            `${actor.name} ya está afectado por ${currentName} ` +
            `y no puede recibir otro estado no-volátil.`
          )

        : (
            `${actor.name} is already affected by ${currentName} ` +
            `and cannot receive another non-volatile condition.`
          );
  }


  ui.notifications.info(
    text
  );


  /*
   * No usamos await.
   *
   * preCreateActiveEffect DEBE seguir
   * siendo síncrono para poder retornar false.
   */

  void ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content:
      `<div class="poke5e-turn-message">${text}</div>`
  });
}


/* ============================================================
 * PRE-CREATE ACTIVE EFFECT
 *
 * IMPORTANTE:
 *
 * Esta función NO debe ser async.
 *
 * return false cancela la creación.
 * ============================================================ */

function hasGmManualStatusOverride(
  effect,
  status
) {

  return (
    game.user.isGM &&

    status ===
      "poisoned" &&

    effect.getFlag(
      MODULE_ID,
      "gmManualStatusOverride"
    ) ===
      true
  );
}

function onPreCreateActiveEffect(
  effect
) {

  /*
   * Solo efectos realmente aplicados
   * a Actors.
   *
   * No tocamos las plantillas de efectos
   * guardadas dentro de Moves.
   */

  const actor =

    effect.parent
      ?.documentName ===
      "Actor"

      ? effect.parent

      : null;


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  const status =
    pokemonStatus(
      effect
    );

  const gmManualOverride =
  hasGmManualStatusOverride(
    effect,
    status
  );

  if (!status) {

    return;
  }


  /* ==========================================================
  * 1. INMUNIDAD
  *
  * Aplica tanto a estados no-volátiles como volátiles.
  *
  * Inner Focus -> inmune a Flinched.
  * ========================================================== */

  if (
    !gmManualOverride &&
    isImmuneToStatus(
      actor,
      status
    )
  ) {

    blockedMessage(
      actor,
      status,
      "immune"
    );


    return false;
  }


  /*
  * Grace Period y exclusividad pertenecen solamente
  * a los estados no-volátiles.
  */

  if (
    !NON_VOLATILE_STATUSES.has(
      status
    )
  ) {

    return;
  }


  /* ==========================================================
   * 2. GRACE PERIOD
   * ========================================================== */

  if (
    !gmManualOverride &&
    hasGracePeriod(
      actor,
      status
    )
  ) {

    blockedMessage(
      actor,
      status,
      "grace"
    );


    return false;
  }


  /* ==========================================================
   * 3. OTRO ESTADO NO-VOLÁTIL
   * ========================================================== */

  const existing =
    activeNonVolatileEffect(
      actor
    );


  if (
    existing
  ) {

    blockedMessage(

      actor,

      status,

      "non-volatile",

      pokemonStatus(
        existing
      )
    );


    return false;
  }
}

/* ============================================================
 * UNCONSCIOUS
 * ============================================================ */

function isUnconscious(
  actor
) {

  const hp =
    Number(
      actor.system
        ?.attributes
        ?.hp
        ?.value ??
      0
    );


  return (
    hp <= 0 ||

    actor.statuses
      ?.has(
        "unconscious"
      )
  );
}


/* ============================================================
 * LIMPIEZA DE BLOQUEOS TEMPORALES
 * ============================================================ */

async function cleanTurnLocks() {

  if (
    !isAuthority()
  ) {

    return;
  }


  for (
    const actor
    of game.actors
  ) {

    const lock =
      findParalysisLock(
        actor
      );

    if (lock) {

      await lock.delete();
    }

    await clearEndOfNextTurnEffects(
      actor
    );
  }
}

/* ============================================================
 * ACTIVE EFFECT ELIMINADO
 *
 * Cuando desaparece un estado no-volátil,
 * comienza su Grace Period.
 * ============================================================ */

async function onDeleteActiveEffect(
  effect
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  const actor =

    effect.parent
      ?.documentName ===
      "Actor"

      ? effect.parent

      : null;


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  if (
    isPokemonRecoveryInProgress(
      actor
    )
  ) {

    return;
  }


  /*
   * Si estaba desactivado,
   * no lo consideramos una recuperación.
   */

  if (
    effect.disabled
  ) {

    return;
  }


  const status =
    pokemonStatus(
      effect
    );


  if (
    !status ||
    !NON_VOLATILE_STATUSES.has(
      status
    )
  ) {

    return;
  }


  await addGracePeriod(
    actor,
    status
  );
}


/* ============================================================
 * REGISTRAR MOTOR
 * ============================================================ */

let registered =
  false;


export function registerPokemonTurnEngine() {

  if (registered) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "combatTurnChange",
    onCombatTurnChange
  );


    Hooks.on(
        "preCreateActiveEffect",
        onPreCreateActiveEffect
    );


    Hooks.on(
        "deleteActiveEffect",
        onDeleteActiveEffect
    );

    Hooks.on(
        "createActiveEffect",
        onCreateActiveEffect
    );


  /*
   * Si un combate es eliminado,
   * evitamos dejar un bloqueo temporal.
   */

  Hooks.on(
    "deleteCombat",
    async () => {

      await cleanTurnLocks();
    }
  );


  console.log(
    `[${MODULE_ID}] Motor automático de turnos registrado.`
  );
}