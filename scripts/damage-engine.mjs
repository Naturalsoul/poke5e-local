import { hasPokemonAbility } from "./status-runtime.mjs";
import {
  activeDamageDiceModifier,
  consumeActiveMoveModifier
} from "./move-modifier-runtime.mjs";
import {
  resolveStabAbilityBoost
} from "./stab-ability-runtime.mjs";
import {
  BERSERK_ABILITY_ID,
  hasActiveBerserk
} from "./berserk-runtime.mjs";

import {
  isPokemonActor
} from "./trainer-party-service.mjs";

const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * LABELS
 * ============================================================ */

const LABELS = {

  es: {

    thawFire:
      "se descongela al recibir daño de tipo Fuego",

    thawBurnMove:
      "se descongela al recibir daño de un movimiento capaz de Quemar",

    damageDiceBoost:
      "potencia los dados de daño",

    stabBoost:
      "duplica su bonificador STAB",

    withAbility:
      "con",

    forMove:
      "para"
  },


  en: {

    thawFire:
      "thaws after taking Fire-type damage",

    thawBurnMove:
      "thaws after taking damage from a move capable of inflicting Burned",

    damageDiceBoost:
      "empowers the damage dice",

    stabBoost:
      "doubles its STAB bonus",

    withAbility:
      "with",

    forMove:
      "for"
  }
};


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
    ]?.[key] ??
    key
  );
}


/* ============================================================
 * POKEMON ACTOR
 * ============================================================ */

/* ============================================================
 * IDENTIFICAR STATUS
 * ============================================================ */

function pokemonStatus(
  effect
) {

  if (!effect) {

    return null;
  }


  const flagged =

    effect.getFlag?.(
      MODULE_ID,
      "status"
    ) ??

    effect.flags
      ?.[MODULE_ID]
      ?.status;


  if (flagged) {

    return String(
      flagged
    );
  }


  const statuses =
    effect.statuses ??
    new Set();


  const has =
    status =>

      typeof statuses.has ===
      "function"

        ? statuses.has(
            status
          )

        : Array.from(
            statuses
          ).includes(
            status
          );


  if (
    has(
      "poke5e-burned"
    )
  ) {

    return "burned";
  }


  if (
    has(
      "poke5e-frozen"
    )
  ) {

    return "frozen";
  }


  return null;
}


/* ============================================================
 * BUSCAR STATUS
 * ============================================================ */

function findStatusEffect(
  actor,
  status
) {

  return actor?.effects.find(
    effect =>

      !effect.disabled &&

      pokemonStatus(
        effect
      ) === status
  );
}


/* ============================================================
 * ¿ES HEALING?
 *
 * Quemado solo altera DAMAGE rolls.
 * ============================================================ */

function isHealingRoll(
  roll
) {

  const type =
    roll?.options
      ?.type;


  if (!type) {

    return false;
  }


  return Boolean(
    CONFIG.DND5E
      ?.healingTypes
      ?.[type]
  );
}

function abilityDisplayName(
  actor,
  abilityId
) {

  const ability =
    actor?.items.find(
      item =>

        item.getFlag?.(
          MODULE_ID,
          "kind"
        ) ===
          "ability" &&

        item.getFlag?.(
          MODULE_ID,
          "sourceId"
        ) ===
          abilityId
    );


  return (
    ability?.name ??
    abilityId
  );
}

/* ============================================================
 * STAB BOOST POR ABILITY
 *
 * Blaze / Torrent / Overgrow / Swarm:
 *
 * HP <= 25 %
 * -> STAB x2
 *
 * El builder coloca el STAB base al final de la fórmula.
 * Añadimos solo el bonus adicional; no duplicamos MOVE ni dados.
 * ============================================================ */

function formulaHasTrailingStabBonus(
  formula,
  stabBonus
) {

  const match =
    String(
      formula ??
      ""
    ).trim().match(
      /\+\s*(\d+(?:\.\d+)?)\s*$/
    );


  return Boolean(
    match &&
    Number(
      match[1]
    ) ===
      stabBonus
  );
}


function usesDeferredOutrageStab(
  roll
) {

  return (
    roll?.options?.[
      MODULE_ID
    ]?.dynamicDamage
      ?.kind ===
    "outrage"
  );
}


function applyThresholdStabBoost(
  rolls,
  activity,
  actor
) {

  const item =
    activity?.item;


  if (
    !item ||
    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return;
  }


  const stab =
    item.getFlag?.(
      MODULE_ID,
      "stab"
    );


  const baseBonus =
    stab?.eligible
      ? Number(
          stab.bonus ??
          0
        )
      : 0;


  const boost =
    resolveStabAbilityBoost(
      actor,
      baseBonus
    );


  if (!boost) {

    return;
  }


  /*
   * El builder actual coloca STAB una sola vez
   * en la parte de daño.
   *
   * Localizamos esa parte por el término final.
   *
   * Outrage se excluye porque maneja su STAB
   * por objetivo en Dynamic Damage Engine.
   */

  const index =
    rolls.findIndex(
      roll =>
        roll &&
        !isHealingRoll(
          roll
        ) &&
        !usesDeferredOutrageStab(
          roll
        ) &&
        !roll.options?.[
          MODULE_ID
        ]?.stabAbilityBoost &&
        formulaHasTrailingStabBonus(
          roll.formula,
          boost.baseBonus
        )
    );


  if (
    index < 0
  ) {

    return;
  }


  const roll =
    rolls[
      index
    ];


  const originalFormula =
    String(
      roll.formula ??
      ""
    ).trim();


  if (!originalFormula) {

    return;
  }


  const options =
    foundry.utils.deepClone(
      roll.options ??
      {}
    );


  options[
    MODULE_ID
  ] = {
    ...(
      options[
        MODULE_ID
      ] ??
      {}
    ),

    stabAbilityBoost: {
      ...boost
    }
  };


  /*
   * Ejemplo:
   *
   * 2d6 + MOVE + 2
   *
   * Blaze:
   *
   * 2d6 + MOVE + 2 + 2
   *
   * NO:
   *
   * 2 × (2d6 + MOVE + 2)
   */

  const boostedFormula =
    `${originalFormula} + ${boost.extraBonus}`;


  const ReplacementRoll =
    roll.constructor;


  rolls.splice(
    index,
    1,
    new ReplacementRoll(
      boostedFormula,
      roll.data,
      options
    )
  );


  const abilityName =
    abilityDisplayName(
      actor,
      boost.sourceAbility
    );


  void ChatMessage.create({
    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${actor.name}</strong>

        ${label("stabBoost")} ${label("withAbility")}

        <strong>${abilityName}</strong>

        ${label("forMove")}

        <strong>${item.name}</strong>:

        <strong>+${boost.baseBonus} -> +${boost.totalBonus}</strong>.

      </div>
    `
  }).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error mostrando STAB boost:`,
        error
      );
    }
  );
}

function applyActiveDamageDiceModifier(
  rolls,
  activity,
  actor
) {

  const item =
    activity?.item;


  if (
    !item ||

    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return;
  }


  const modifier =
    activeDamageDiceModifier(
      actor
    );


  if (!modifier) {

    return;
  }


  const multiplier =
    Math.max(
      1,
      Number(
        modifier.damageDiceMultiplier ??
        1
      )
    );


  if (
    multiplier <= 1
  ) {

    return;
  }


  let changed =
    false;


  for (
    let index = 0;
    index < rolls.length;
    index++
  ) {

    const roll =
      rolls[
        index
      ];


    if (
      !roll ||

      isHealingRoll(
        roll
      ) ||

      roll.isDeterministic
    ) {

      continue;
    }


    const altered =
      roll.alter(
        multiplier,
        0,
        false
      );


    altered.options ??=
      {};


    altered.options[
      MODULE_ID
    ] = {

      ...(
        altered.options[
          MODULE_ID
        ] ??
        {}
      ),

      moveModifier: {

        sourceAbility:
          modifier.sourceAbility,

        damageDiceMultiplier:
          multiplier
      }
    };


    rolls[
      index
    ] =
      altered;


    changed =
      true;
  }


  if (!changed) {

    return;
  }


  consumeActiveMoveModifier(
    actor,
    modifier.sourceAbility
  );


  const abilityName =
    abilityDisplayName(
      actor,
      modifier.sourceAbility
    );


  void ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${actor.name}</strong>

        ${label("damageDiceBoost")}

        <strong>${item.name}</strong>

        ${language() === "es" ? "con" : "with"}

        <strong>${abilityName}</strong>:

        <strong>×${multiplier}</strong>.

      </div>
    `
  }).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error mostrando move modifier:`,
        error
      );
    }
  );
}


/* ============================================================
 * BURNED DAMAGE
 *
 * Poke5e:
 *
 * Roll all damage rolls twice
 * and take the lower result.
 *
 * Este hook ocurre después de construir/configurar
 * el Roll pero antes de evaluarlo.
 * ============================================================ */

function onPostRollConfiguration(
  rolls,
  config
) {

  if (
    !Array.isArray(
      rolls
    )
  ) {

    return;
  }


  const hookNames =
    Array.from(
      config?.hookNames ??
      []
    );


  /*
   * Solo procesos de Damage.
   */

  if (
    !hookNames.includes(
      "damage"
    )
  ) {

    return;
  }


  const activity =
    config?.subject;


  const actor =

    activity?.actor ??

    activity?.item
      ?.actor ??

    null;


  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }

  /* ==========================================================
  * HP THRESHOLD STAB
  *
  * Blaze / Torrent / Overgrow / Swarm
  * ========================================================== */

  applyThresholdStabBoost(
    rolls,
    activity,
    actor
  );


    /* ==========================================================
   * MODIFICADORES DE DADOS
   *
   * Anger Point
   * ========================================================== */

  applyActiveDamageDiceModifier(
    rolls,
    activity,
    actor
  );


  // Guts: a burn does not reduce its damage.
  if (
    hasPokemonAbility(
      actor,
      "guts"
    )
  ) {
    return;
  }


  /*
   * Solo si está Quemado.
   */

  if (
    !findStatusEffect(
      actor,
      "burned"
    )
  ) {

    return;
  }


  /*
   * Solo si está Quemado.
   */

  if (
    !findStatusEffect(
      actor,
      "burned"
    )
  ) {

    return;
  }


  let changed =
    false;


  for (
    let index = 0;
    index < rolls.length;
    index++
  ) {

    const roll =
      rolls[
        index
      ];


    if (!roll) {

      continue;
    }


    /*
     * Curación no recibe la penalización.
     */

    if (
      isHealingRoll(
        roll
      )
    ) {

      continue;
    }


    /*
     * Protección contra aplicar esta
     * transformación dos veces.
     */

    if (
      roll.options
        ?.[MODULE_ID]
        ?.burnedKeepLower
    ) {

      continue;
    }


    const originalFormula =
      String(
        roll.formula ??
        ""
      ).trim();


    if (!originalFormula) {

      continue;
    }


    /*
     * DAMAGE DETERMINISTA
     *
     * Burned indica:
     *
     * - tirar el daño dos veces;
     * - conservar el resultado menor.
     *
     * Si el Roll no contiene aleatoriedad,
     * ambas tiradas son necesariamente iguales.
     *
     * Ejemplo Struggle:
     *
     * 2 + 2 = 4
     * 2 + 2 = 4
     *
     * Keep lower = 4.
     *
     * No construimos un Dice Pool porque no
     * existe nada aleatorio que volver a tirar.
     */

    if (
      roll.isDeterministic
    ) {

      continue;
    }


    /*
     * Conservamos las opciones originales
     * del DamageRoll:
     *
     * - damage type
     * - critical
     * - properties
     * - metadata Poke5e
     * - etc.
     */

    const options =
      foundry.utils.deepClone(
        roll.options ??
        {}
      );


    options[
      MODULE_ID
    ] = {

      ...(
        options[
          MODULE_ID
        ] ??
        {}
      ),


      burnedKeepLower:
        true,


      originalFormula
    };


    /*
     * Solo los DamageRoll que contienen
     * aleatoriedad necesitan realizar
     * realmente dos tiradas.
     *
     * Foundry Dice Pool:
     *
     * {formula, formula}kl
     *
     * kl = Keep Lowest.
     */

    const burnedFormula =
      `{${originalFormula}, ${originalFormula}}kl`;


    /*
     * Conservamos la clase original.
     *
     * DamageRoll sigue siendo DamageRoll.
     */

    const ReplacementRoll =
      roll.constructor;


    const replacement =
      new ReplacementRoll(

        burnedFormula,

        roll.data,

        options
      );


    rolls.splice(
      index,
      1,
      replacement
    );


    changed =
      true;
  }


  if (
    changed
  ) {

    console.debug(
      `[${MODULE_ID}] Burned damage aplicado a ${actor.name}.`
    );
  }
}


/* ============================================================
 * MOVE QUE ORIGINÓ EL DAMAGE
 *
 * DamageApplicationOptions conserva el
 * originatingMessage.
 *
 * ChatMessage5e sabe resolver el Item original.
 * ============================================================ */

export function originatingMoveItem(
  options
) {

  const message =
    options
      ?.originatingMessage;


  if (!message) {

    return null;
  }


  /* ==========================================================
   * MÉTODO NATIVO D&D5e 5.3.x
   * ========================================================== */

  const associated =
    message
      .getAssociatedItem
      ?.();


  if (
    associated
      ?.documentName ===
    "Item"
  ) {

    return associated;
  }


  /* ==========================================================
   * FALLBACK
   * ========================================================== */

  const uuid =
    foundry.utils.getProperty(

      message,

      "flags.dnd5e.item.uuid"
    );


  if (!uuid) {

    return null;
  }


  try {

    const item =
      fromUuidSync(
        uuid,
        {
          strict:
            false
        }
      );


    return (
      item?.documentName ===
      "Item"

        ? item

        : null
    );

  } catch (
    error
  ) {

    console.debug(
      `[${MODULE_ID}] No se pudo resolver Item origen:`,
      uuid,
      error
    );


    return null;
  }
}

/* ============================================================
 * ACTIVITY QUE ORIGINÓ EL DAMAGE
 *
 * Los Damage Messages pueden apuntar a su Usage Message.
 * Allí recuperamos la Activity original para distinguir:
 *
 * - Attack damage
 * - Save damage
 * ============================================================ */

function originatingMoveActivity(
  options
) {

  const damageMessage =
    options?.originatingMessage;


  if (!damageMessage) {

    return null;
  }


  const usageMessage =
    damageMessage
      .getOriginatingMessage
      ?.() ??
    damageMessage;


  return (
    usageMessage
      ?.getAssociatedActivity
      ?.() ??
    damageMessage
      .getAssociatedActivity
      ?.() ??
    null
  );
}

/* ============================================================
 * BERSERK DAMAGE
 *
 * Poke5e:
 *
 * HP < 25 %
 * -> Attack Rolls con Disadvantage
 * -> esos ataques infligen el doble de daño.
 *
 * Se aplica en preCalculateDamage:
 *
 * - después del daño dinámico específico del Move;
 * - antes de resistencias/vulnerabilidades nativas.
 *
 * Struggle conserva su contrato noAmplification.
 * ============================================================ */

function onPreCalculateBerserkDamage(
  actor,
  damages,
  options
) {

  const item =
    originatingMoveItem(
      options
    );


  const sourceActor =
    item?.actor;


  if (
    !item ||
    item.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move" ||
    !sourceActor ||
    !hasActiveBerserk(
      sourceActor
    )
  ) {

    return;
  }


  const activity =
    originatingMoveActivity(
      options
    );


  if (
    activity?.type !==
      "attack"
  ) {

    return;
  }


  const struggle =
    item.getFlag?.(
      MODULE_ID,
      "struggle"
    );


  if (
    struggle?.noAmplification ===
    true
  ) {

    return;
  }


  let changed =
    false;


  for (
    const damage
    of damages ??
      []
  ) {

    const value =
      Number(
        damage?.value
      );


    if (
      !Number.isFinite(
        value
      ) ||
      value <= 0
    ) {

      continue;
    }


    damage.value =
      value * 2;


    changed =
      true;
  }


  if (!changed) {

    return;
  }


  options[
    MODULE_ID
  ] ??=
    {};


  options[
    MODULE_ID
  ].berserkDamage = {

    sourceAbility:
      BERSERK_ABILITY_ID,

    sourceActorUuid:
      sourceActor.uuid,

    itemUuid:
      item.uuid,

    multiplier:
      2
  };
}

/* ============================================================
 * ACTOR DESDE UUID
 * ============================================================ */

function actorFromUuid(
  uuid
) {

  if (!uuid) {

    return null;
  }


  try {

    const document =
      fromUuidSync(
        uuid,
        {
          strict:
            false
        }
      );


    if (
      document?.documentName ===
      "Actor"
    ) {

      return document;
    }


    /*
     * TokenDocument / documento con Actor.
     */

    return (
      document?.actor ??
      null
    );

  } catch {

    return null;
  }
}


/* ============================================================
 * ¿EL MOVE PUEDE QUEMAR?
 *
 * No necesitamos conocer el trigger concreto.
 *
 * Solo necesitamos saber si el Move tiene
 * un ActiveEffect Poke5e de Burned.
 * ============================================================ */

function moveCanBurn(
  options
) {

  const item =
    originatingMoveItem(
      options
    );


  if (!item) {

    return {

      canBurn:
        false,

      item:
        null
    };
  }


  /*
   * Solo movimientos generados por nuestro módulo.
   */

  if (
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !==
    "move"
  ) {

    return {

      canBurn:
        false,

      item
    };
  }


  const effects =

    item.effects
      ?.contents ??

    Array.from(
      item.effects ??
      []
    );


  const canBurn =
    effects.some(
      effect =>

        pokemonStatus(
          effect
        ) ===
        "burned"
    );


  return {

    canBurn,

    item
  };
}

/* ============================================================
 * PRE APPLY DAMAGE
 *
 * Aquí capturamos:
 *
 * - qué Move produjo el daño
 * - quién lo utilizó
 * - cuánto daño entrará REALMENTE
 *
 * Todavía NO curamos.
 * ============================================================ */

function onPreApplyDamage(
  actor,
  amount,
  updates,
  options
) {

  if (
    Number(
      amount
    ) <= 0
  ) {

    return;
  }


  const item =
    originatingMoveItem(
      options
    );


  if (!item) {

    return;
  }


  /* ==========================================================
   * MECÁNICAS DEL MOVE
   * ========================================================== */

  const drain =
    item.getFlag(
      MODULE_ID,
      "instantDrain"
    );


  const recoil =
    item.getFlag(
      MODULE_ID,
      "instantRecoil"
    );


  /*
   * No tiene ninguna consecuencia posterior.
   */

  if (
    !drain &&
    !recoil
  ) {

    return;
  }


  const sourceActor =
    item.actor;


  if (!sourceActor) {

    return;
  }


  /* ==========================================================
   * DAÑO REAL
   *
   * Ya existe esta función desde v0.16.
   * ========================================================== */

  const actualDamage =
    actualDamageFromUpdates(
      actor,
      updates
    );


  if (
    actualDamage <= 0
  ) {

    return;
  }


  options[
    MODULE_ID
  ] ??=
    {};


  /* ==========================================================
   * DRAIN
   * ========================================================== */

  if (
    drain?.kind ===
    "instant-drain"
  ) {

    options[
      MODULE_ID
    ].instantDrain = {

      sourceActorUuid:
        sourceActor.uuid,

      sourceActorName:
        sourceActor.name,

      itemUuid:
        item.uuid,

      itemName:
        item.name,

      itemSourceId:
        item.getFlag(
          MODULE_ID,
          "sourceId"
        ),

      fraction:
        Number(
          drain.fraction ??
          0
        ),

      round:
        drain.round ??
        "floor",

      actualDamage
    };
  }


  /* ==========================================================
   * RECOIL
   * ========================================================== */

  if (
    recoil?.kind ===
    "instant-recoil"
  ) {

    options[
      MODULE_ID
    ].instantRecoil = {

      sourceActorUuid:
        sourceActor.uuid,

      sourceActorName:
        sourceActor.name,

      itemUuid:
        item.uuid,

      itemName:
        item.name,

      itemSourceId:
        item.getFlag(
          MODULE_ID,
          "sourceId"
        ),

      fraction:
        Number(
          recoil.fraction ??
          0
        ),

      round:
        recoil.round ??
        "floor",

      damageType:
        recoil.damageType ??
        "typeless",

      actualDamage
    };


    console.debug(

      `[${MODULE_ID}] Recoil preparado:`,

      item.name,

      {
        source:
          sourceActor.name,

        target:
          actor.name,

        actualDamage,

        fraction:
          recoil.fraction
      }
    );
  }
}

/* ============================================================
 * DAÑO REAL QUE VA A PERDER EL ACTOR
 *
 * Incluye HP temporal.
 *
 * Ejemplo:
 *
 * Target:
 * HP 2
 *
 * Damage calculado:
 * 10
 *
 * Daño REAL:
 * 2
 *
 * No queremos curar como si hubieran
 * entrado realmente los 10.
 * ============================================================ */

function actualDamageFromUpdates(
  actor,
  updates
) {

  const hp =
    actor.system
      ?.attributes
      ?.hp;


  if (!hp) {

    return 0;
  }


  const beforeValue =
    Number(
      hp.value ??
      0
    );


  const beforeTemp =
    Number(
      hp.temp ??
      0
    );


  const afterValue =
    Number(

      updates[
        "system.attributes.hp.value"
      ]

      ??

      beforeValue
    );


  const afterTemp =
    Number(

      updates[
        "system.attributes.hp.temp"
      ]

      ??

      beforeTemp
    );


  return Math.max(

    0,

    (
      beforeValue +
      beforeTemp
    )

    -

    (
      afterValue +
      afterTemp
    )
  );
}

/* ============================================================
 * REDONDEO
 * ============================================================ */

function fractionalAmount(
  damage,
  fraction,
  mode
) {

  const raw =
    Math.max(
      0,
      Number(damage)
    )

    *

    Math.max(
      0,
      Number(fraction)
    );


  switch (
    mode
  ) {

    case "ceil":

      return Math.ceil(
        raw
      );


    case "round":

      return Math.round(
        raw
      );


    case "floor":

    default:

      return Math.floor(
        raw
      );
  }
}


/* ============================================================
 * INSTANT DRAIN
 * ============================================================ */

async function processInstantDrain(
  marker
) {

  if (!marker) {

    return;
  }


  const actualDamage =
    Math.max(
      0,
      Number(
        marker.actualDamage ??
        0
      )
    );


  if (
    actualDamage <= 0
  ) {

    return;
  }


  const source =
    actorFromUuid(
      marker.sourceActorUuid
    );


  if (!source) {

    console.warn(
      `[${MODULE_ID}] No se encontró Actor origen para ${marker.itemName}.`
    );


    return;
  }


  /* ==========================================================
   * NO REVIVIR AUTOMÁTICAMENTE
   * ========================================================== */

  const hp =
    source.system
      ?.attributes
      ?.hp;


  if (!hp) {

    return;
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


  if (
    current <= 0
  ) {

    return;
  }


  /*
   * Ya está a HP máximo.
   *
   * Igual que Aqua Ring:
   * no mostramos "recupera 0".
   */

  if (
    current >= maximum
  ) {

    return;
  }


  /* ==========================================================
   * CURACIÓN SOLICITADA
   * ========================================================== */

  const requested =
    fractionalAmount(
      actualDamage,
      marker.fraction,
      marker.round
    );


  if (
    requested <= 0
  ) {

    return;
  }


  /* ==========================================================
   * NO SUPERAR HP MAX
   * ========================================================== */

  const healing =
    Math.min(

      requested,

      maximum -
      current
    );


  if (
    healing <= 0
  ) {

    return;
  }


  /* ==========================================================
   * HEAL
   *
   * Daño numérico negativo = curación directa.
   * ========================================================== */

  await source.applyDamage(
    -healing
  );


  /* ==========================================================
   * CHAT
   * ========================================================== */

  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor:
          source
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${source.name}</strong>
        recupera
        <strong>${healing} HP</strong>
        gracias a
        <strong>${marker.itemName}</strong>.

        <small>
          Daño real: ${actualDamage}
        </small>

      </div>
    `
  });


  console.debug(

    `[${MODULE_ID}] ` +
    `${marker.itemName}: ` +
    `${source.name} recupera ${healing} HP ` +
    `de ${actualDamage} de daño real.`
  );
}

/* ============================================================
 * INSTANT RECOIL
 *
 * El recoil de estos Moves es typeless.
 *
 * Utilizamos daño numérico directo para que
 * NO pase por resistencias Pokémon.
 * ============================================================ */

async function processInstantRecoil(
  marker
) {

  if (!marker) {

    return;
  }


  const actualDamage =
    Math.max(
      0,
      Number(
        marker.actualDamage ??
        0
      )
    );


  if (
    actualDamage <= 0
  ) {

    return;
  }


  const source =
    actorFromUuid(
      marker.sourceActorUuid
    );


  if (!source) {

    console.warn(
      `[${MODULE_ID}] No se encontró el usuario de ${marker.itemName}.`
    );

    return;
  }

  // Rock Head: no recoil damage.
  if (hasPokemonAbility(source, "rock-head")) {
    return;
  }


  /* ==========================================================
   * CALCULAR RECOIL
   * ========================================================== */

  const recoil =
    fractionalAmount(

      actualDamage,

      marker.fraction,

      marker.round
    );


  /*
   * Poke5e indica rounded down.
   *
   * Si 1/4 da 0, entonces recibe 0.
   */

  if (
    recoil <= 0
  ) {

    return;
  }


  /* ==========================================================
   * TYPELESS DAMAGE
   *
   * applyDamage(number)
   *
   * D&D5e pone options.ignore = true,
   * por lo que no entra en resistencias,
   * vulnerabilidades o inmunidades.
   * ========================================================== */

  await source.applyDamage(
    recoil
  );


  /* ==========================================================
   * CHAT
   * ========================================================== */

  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor:
          source
      }),

    content: `
      <div class="poke5e-turn-message">

        <strong>${source.name}</strong>
        recibe
        <strong>${recoil} de daño</strong>
        de retroceso por
        <strong>${marker.itemName}</strong>.

        <small>
          Daño efectivo al objetivo:
          ${actualDamage}
        </small>

      </div>
    `
  });


  console.debug(

    `[${MODULE_ID}] ` +
    `${marker.itemName}: ` +
    `${source.name} recibe ${recoil} recoil.`
  );
}


/* ============================================================
 * CALCULATE DAMAGE
 *
 * Este hook ocurre DESPUÉS de:
 *
 * - resistencias
 * - vulnerabilidades
 * - inmunidades
 * - multiplicadores
 * - damage threshold
 *
 * Por lo tanto podemos saber si realmente
 * entró daño Fire.
 * ============================================================ */

function onCalculateDamage(
  actor,
  damages,
  options
) {

  if (
    !actor ||
    !isPokemonActor(
      actor
    )
  ) {

    return;
  }


  /*
   * Si no está Frozen no hay nada que hacer.
   */

  if (
    !findStatusEffect(
      actor,
      "frozen"
    )
  ) {

    return;
  }


  /* ==========================================================
   * FIRE DAMAGE REAL
   * ========================================================== */

  const fireDamage =
    Array.from(
      damages ??
      []
    )
      .some(
        damage =>

          String(
            damage.type ??
            ""
          )
            .toLowerCase() ===
          "fire"

          &&

          Number(
            damage.value ??
            0
          ) >
          0
      );


  /* ==========================================================
   * MOVE QUE PUEDE QUEMAR
   * ========================================================== */

  const burnSource =
    moveCanBurn(
      options
    );


  const totalDamage =
    Number(
      damages
        ?.amount ??
      0
    );


  /*
   * La regla dice DAMAGE from a move capable
   * of Burned.
   *
   * Si hizo 0 de daño, no descongela.
   */

  const burnMoveDamage =

    burnSource.canBurn &&

    totalDamage >
    0;


  if (
    !fireDamage &&
    !burnMoveDamage
  ) {

    return;
  }


  /* ==========================================================
   * MARCAR PARA DESCONGELAR DESPUÉS DE APLICAR DAMAGE
   *
   * No eliminamos Frozen todavía:
   *
   * calculateDamage ocurre antes de que HP
   * sea realmente actualizado.
   * ========================================================== */

  options[
    MODULE_ID
  ] ??=
    {};


  options[
    MODULE_ID
  ].frozenThaw = {

    reason:

      fireDamage

        ? "fire"

        : "burn-move",


    itemName:
      burnSource.item
        ?.name ??
      null,


    itemSourceId:
      burnSource.item
        ?.getFlag(
          MODULE_ID,
          "sourceId"
        ) ??
      null
  };
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
 * DESCONGELAR
 * ============================================================ */

async function thawFrozen(
  actor,
  marker
) {

  const effect =
    findStatusEffect(
      actor,
      "frozen"
    );


  /*
   * Puede haber sido eliminado por otra regla.
   */

  if (!effect) {

    return;
  }


  /*
   * Esto también dispara el deleteActiveEffect
   * de turn-engine.mjs, por lo que se creará
   * automáticamente el Grace Period de Frozen.
   */

  await effect.delete();


  if (
    marker.reason ===
    "fire"
  ) {

    await chat(

      actor,

      `
        <strong>${actor.name}</strong>
        ${label("thawFire")}.
      `
    );


    return;
  }


  const moveText =
    marker.itemName

      ? ` (${marker.itemName})`

      : "";


  await chat(

    actor,

    `
      <strong>${actor.name}</strong>
      ${label("thawBurnMove")}${moveText}.
    `
  );
}


/* ============================================================
 * POST DAMAGE PIPELINE
 * ============================================================ */

async function processAppliedPokemonDamage(
  actor,
  amount,
  options
) {

  if (
    Number(
      amount
    ) <= 0
  ) {

    return;
  }


  const moduleData =
    options
      ?.[MODULE_ID] ??
    {};


  /* ==========================================================
   * FROZEN THAW
   * ========================================================== */

  if (
    moduleData.frozenThaw
  ) {

    await thawFrozen(

      actor,

      moduleData.frozenThaw
    );
  }


  /* ==========================================================
   * RECOIL
   * ========================================================== */

  if (
    moduleData.instantRecoil
  ) {

    await processInstantRecoil(
      moduleData.instantRecoil
    );
  }


  /* ==========================================================
   * DRAIN
   * ========================================================== */

  if (
    moduleData.instantDrain
  ) {

    await processInstantDrain(
      moduleData.instantDrain
    );
  }
}


/* ============================================================
 * APPLY DAMAGE
 * ============================================================ */

function onApplyDamage(
  actor,
  amount,
  options
) {

  const moduleData =
    options
      ?.[MODULE_ID];


  if (!moduleData) {

    return;
  }


  /*
   * Frozen / Drain comparten ahora
   * un solo pipeline asíncrono.
   */

  void processAppliedPokemonDamage(

    actor,

    amount,

    options

  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error procesando daño Pokémon:`,
        error
      );
    }
  );
}


/* ============================================================
 * REGISTRO
 * ============================================================ */

let registered =
  false;


export function registerPokemonDamageEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  /* ==========================================================
   * BURNED
   * ========================================================== */

  Hooks.on(
    "dnd5e.postRollConfiguration",
    onPostRollConfiguration
  );


  /* ==========================================================
  * BERSERK
  * ========================================================== */

  Hooks.on(
    "dnd5e.preCalculateDamage",
    onPreCalculateBerserkDamage
  );

  /* ==========================================================
   * FROZEN
   * ========================================================== */

  Hooks.on(
    "dnd5e.calculateDamage",
    onCalculateDamage
  );

  Hooks.on(
    "dnd5e.preApplyDamage",
    onPreApplyDamage
  );

  Hooks.on(
    "dnd5e.applyDamage",
    onApplyDamage
  );


  console.log(
    `[${MODULE_ID}] Motor Pokemon de daño registrado.`
  );
}