import { publishRollBeforeDamage } from "./chat-roll-display.mjs";
import { getLanguage as language } from "./i18n.mjs";

const MODULE_ID =
  "poke5e-local";


const MAX_FALL_DICE =
  20;


const FEET_PER_FALL_DIE =
  10;


const MOVEMENT_OPTIONS =
  Object.freeze({

    method:
      "api",

    showRuler:
      false,

    autoRotate:
      false
  });


const LABELS = {

  es: {

    grounded:
      "daño sin tipo por retroceso",

    falling:
      "daño por caída",

    missingToken:
      "no se encontró un Token activo para resolver el retroceso",

    missingTemplate:
      "no se encontró la plantilla del movimiento; se omite únicamente el desplazamiento de 10 pies",

    blockedMovement:
      "el desplazamiento de retroceso no pudo completarse"
  },


  en: {

    grounded:
      "typeless recoil damage",

    falling:
      "fall damage",

    missingToken:
      "no active Token was found to resolve the recoil",

    missingTemplate:
      "the move template was not found; only the 10-foot displacement is skipped",

    blockedMovement:
      "the recoil movement could not be completed"
  }
};


function label(
  key
) {

  return (
    LABELS[
      language()
    ]?.[key] ??
    key
  );
}


/* ============================================================
 * DEFINITION
 * ============================================================ */

function forcedRecoilDefinition(
  item
) {

  const definition =
    item?.getFlag?.(
      MODULE_ID,
      "forcedRecoil"
    );


  if (
    definition?.kind !==
    "forced-recoil"
  ) {

    return null;
  }


  return definition;
}


/* ============================================================
 * TEMPLATE
 * ============================================================ */

function recoilTemplate(
  results
) {

  return Array.from(
    results?.templates ??
    []
  ).find(
    template =>
      Number.isFinite(
        Number(
          template?.direction
        )
      )
  ) ?? null;
}


/* ============================================================
 * TOKEN
 * ============================================================ */

function usageToken(
  activity
) {

  return (
    activity
      ?.getUsageToken
      ?.() ??
    null
  );
}


/* ============================================================
 * AIRBORNE
 *
 * Contrato runtime actual:
 *
 * elevation > 0
 * → el Token está actualmente en el aire.
 *
 * Tener velocidad de vuelo NO implica estar volando.
 * ============================================================ */

function isAirborne(
  token
) {

  return (
    Number(
      token?.elevation ??
      0
    ) > 0
  );
}


/* ============================================================
 * OPPOSITE DIRECTION
 * ============================================================ */

function oppositeDirection(
  template
) {

  const direction =
    Number(
      template?.direction
    );


  if (
    !Number.isFinite(
      direction
    )
  ) {

    return null;
  }


  return (
    (
      direction +
      180
    ) %
    360 +
    360
  ) % 360;
}


/* ============================================================
 * RECOIL DESTINATION
 * ============================================================ */

function recoilDestination(
  token,
  template,
  distance
) {

  const direction =
    oppositeDirection(
      template
    );


  const grid =
    canvas.grid;


  if (
    direction == null ||
    !grid?.getTranslatedPoint
  ) {

    return null;
  }


  const center =
    token.getCenterPoint();


  const translated =
    grid.getTranslatedPoint(
      center,
      direction,
      distance
    );


  if (
    !Number.isFinite(
      Number(
        translated?.x
      )
    ) ||
    !Number.isFinite(
      Number(
        translated?.y
      )
    )
  ) {

    return null;
  }


  return {

    x:
      Math.round(
        Number(
          token.x
        ) +
        Number(
          translated.x
        ) -
        Number(
          center.x
        )
      ),

    y:
      Math.round(
        Number(
          token.y
        ) +
        Number(
          translated.y
        ) -
        Number(
          center.y
        )
      ),

    elevation:
      Number(
        token.elevation ??
        0
      )
  };
}


/* ============================================================
 * HORIZONTAL RECOIL
 * ============================================================ */

async function moveByRecoil(
  token,
  template,
  distance
) {

  const destination =
    recoilDestination(
      token,
      template,
      distance
    );


  if (!destination) {

    return false;
  }


  return token.move(
    destination,
    MOVEMENT_OPTIONS
  );
}


/* ============================================================
 * DIRECT DAMAGE ROLL
 *
 * Este daño no entra al chart de tipos Pokémon.
 * ============================================================ */

async function rollDirectDamage(
  actor,
  formula,
  flavor
) {

  const roll =
    new Roll(
      formula
    );


  await roll.evaluate();


  await publishRollBeforeDamage(roll, {

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    flavor
  });


  const total =
    Math.max(
      0,
      Number(
        roll.total ??
        0
      )
    );


  if (
    total > 0
  ) {

    await actor.applyDamage(
      total
    );
  }


  return total;
}


/* ============================================================
 * GROUNDED DAMAGE
 * ============================================================ */

async function applyGroundedDamage(
  actor,
  item,
  definition
) {

  const formula =
    String(
      definition
        ?.groundedDamage
        ?.formula ??
      ""
    ).trim();


  if (!formula) {

    return;
  }


  await rollDirectDamage(
    actor,
    formula,
    `${item.name}: ${label("grounded")}`
  );
}


/* ============================================================
 * FALL DAMAGE
 *
 * D&D5e:
 * 1d6 por cada 10 ft caídos,
 * máximo 20d6.
 * ============================================================ */

function fallDamageDice(
  elevation
) {

  return Math.min(

    MAX_FALL_DICE,

    Math.max(
      0,
      Math.floor(
        Number(
          elevation ??
          0
        ) /
        FEET_PER_FALL_DIE
      )
    )
  );
}


async function resolveFall(
  actor,
  token,
  item,
  startingElevation
) {

  await token.move(
    {
      x:
        token.x,

      y:
        token.y,

      elevation:
        0
    },
    MOVEMENT_OPTIONS
  );


  const dice =
    fallDamageDice(
      startingElevation
    );


  if (
    dice <= 0
  ) {

    return;
  }


  await rollDirectDamage(
    actor,
    `${dice}d6`,
    `${item.name}: ${label("falling")}`
  );
}


/* ============================================================
 * PRONE
 * ============================================================ */

async function applyProne(
  actor
) {

  await actor.toggleStatusEffect(
    "prone",
    {
      active:
        true
    }
  );
}


/* ============================================================
 * RESOLVE
 * ============================================================ */

async function resolveForcedRecoil(
  activity,
  results,
  definition
) {

  const actor =
    activity.actor;


  const item =
    activity.item;


  if (
    !actor ||
    !item
  ) {

    return;
  }


  const token =
    usageToken(
      activity
    );


  if (!token) {

    console.warn(
      `[${MODULE_ID}] ${item.name}: ${label("missingToken")}.`
    );


    if (
      definition.prone
    ) {

      await applyProne(
        actor
      );
    }


    return;
  }


  const startingElevation =
    Number(
      token.elevation ??
      0
    );


  const airborne =
    isAirborne(
      token
    );


  const template =
    recoilTemplate(
      results
    );


  if (
    definition.direction ===
      "opposite-template"
  ) {

    if (!template) {

      console.warn(
        `[${MODULE_ID}] ${item.name}: ${label("missingTemplate")}.`
      );

    } else {

      const moved =
        await moveByRecoil(
          token,
          template,
          Number(
            definition.distance ??
            0
          )
        );


      if (!moved) {

        console.warn(
          `[${MODULE_ID}] ${item.name}: ${label("blockedMovement")}.`
        );
      }
    }
  }


  if (
    airborne &&
    definition.airborne?.fall
  ) {

    await resolveFall(
      actor,
      token,
      item,
      startingElevation
    );

  } else {

    await applyGroundedDamage(
      actor,
      item,
      definition
    );
  }


  if (
    definition.prone
  ) {

    await applyProne(
      actor
    );
  }
}


/* ============================================================
 * POST USE ACTIVITY
 *
 * results.templates ya contiene la plantilla colocada.
 * ============================================================ */

function onPostUseActivity(
  activity,
  ...hookArgs
) {

  const definition =
    forcedRecoilDefinition(
      activity?.item
    );


  if (!definition) {

    return;
  }


  const results =
    hookArgs[
      1
    ] ??
    null;


  void resolveForcedRecoil(
    activity,
    results,
    definition
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error resolviendo forced recoil de ${activity.item?.name ?? "Move"}:`,
        error
      );
    }
  );
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonForcedRecoilEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.postUseActivity",
    onPostUseActivity
  );
}
