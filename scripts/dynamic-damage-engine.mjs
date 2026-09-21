import {
  resolveStabAbilityBoost
} from "./stab-ability-runtime.mjs";

const MODULE_ID = "poke5e-local";
const ROLLOUT_MAX_STAGE = 5;
const OUTRAGE_MAX_STAGE = 3;


/* ============================================================
 * MAGNITUDE
 * ============================================================ */

const MAGNITUDE_TABLE = [
  {
    min: 1,
    max: 5,
    dice: "1d4"
  },
  {
    min: 6,
    max: 15,
    dice: "1d8"
  },
  {
    min: 16,
    max: 35,
    dice: "1d10"
  },
  {
    min: 36,
    max: 65,
    dice: "1d12"
  },
  {
    min: 66,
    max: 85,
    dice: "2d6"
  },
  {
    min: 86,
    max: 95,
    dice: "2d8"
  },
  {
    min: 96,
    max: 100,
    dice: "2d12"
  }
];


/* ============================================================
 * HANDLER REGISTRY
 * ============================================================ */

const DYNAMIC_DAMAGE_HANDLERS =
  new Map([
    [
      "magnitude",
      resolveMagnitudeDamage
    ],
    [
      "rollout",
      resolveRolloutDamage
    ],
    [
      "outrage",
      resolveOutrageDamage
    ]
  ]);


/* ============================================================
 * AUTHORITY
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
 * DAMAGE PROCESS
 * ============================================================ */

function isDamageProcess(
  config
) {

  return Array.from(
    config?.hookNames ??
    []
  ).includes(
    "damage"
  );
}


/* ============================================================
 * MOVE
 * ============================================================ */

function poke5eMoveFromConfig(
  config
) {

  const item =
    config?.subject?.item ??
    null;


  if (
    item?.documentName !==
      "Item" ||
    item.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return null;
  }


  return item;
}


function originatingMoveItem(
  options
) {

  const message =
    options?.originatingMessage;


  if (!message) {

    return null;
  }


  const associated =
    message.getAssociatedItem?.();


  if (
    associated?.documentName ===
    "Item"
  ) {

    return associated;
  }


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
          strict: false
        }
      );


    return (
      item?.documentName ===
        "Item"
        ? item
        : null
    );

  } catch {

    return null;
  }
}

/* ============================================================
 * ABILITY DISPLAY NAME
 * ============================================================ */

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
 * DYNAMIC DEFINITION
 * ============================================================ */

function dynamicDamageDefinition(
  item
) {

  const definition =
    item?.getFlag(
      MODULE_ID,
      "dynamicDamage"
    );


  if (
    !definition?.implemented ||
    !DYNAMIC_DAMAGE_HANDLERS.has(
      definition.kind
    )
  ) {

    return null;
  }


  return definition;
}


/* ============================================================
 * PLACEHOLDER
 * ============================================================ */

function placeholderRollIndex(
  rolls
) {

  return rolls.findIndex(
    roll =>
      String(
        roll?.formula ??
        ""
      ).trim() ===
        "0"
  );
}


/* ============================================================
 * FÓRMULA ORIGINAL RECHAZADA
 * ============================================================ */

function rejectedFormula(
  definition
) {

  const formulas =
    Array.isArray(
      definition?.rejectedFormulas
    )
      ? definition.rejectedFormulas
          .map(
            formula =>
              String(
                formula ??
                ""
              ).trim()
          )
          .filter(Boolean)
      : [];


  if (
    formulas.length !==
    1
  ) {

    throw new Error(
      `Se esperaba exactamente una fórmula dinámica y se encontraron ${formulas.length}.`
    );
  }


  return formulas[0];
}


/* ============================================================
 * VALIDAR FORMULA
 * ============================================================ */

function isExecutableFormula(
  formula
) {

  const text =
    String(
      formula ??
      ""
    ).trim();


  if (
    !text ||
    !Roll.validate(
      text
    )
  ) {

    return false;
  }


  try {

    const roll =
      Roll.create(
        text
      );


    roll.evaluateSync({
      strict: true,
      allowStrings: false,
      maximize: true
    });


    return Number.isFinite(
      roll.total
    );

  } catch {

    return false;
  }
}


/* ============================================================
 * MAGNITUDE TABLE
 * ============================================================ */

function rollMagnitudeTable() {

  const random =
    CONFIG.Dice.randomUniform();


  if (
    !Number.isFinite(
      random
    ) ||
    random < 0 ||
    random >= 1
  ) {

    throw new Error(
      `CONFIG.Dice.randomUniform devolvió un valor inválido: ${random}.`
    );
  }


  const total =
    Math.floor(
      random * 100
    ) + 1;


  const row =
    MAGNITUDE_TABLE.find(
      entry =>
        total >=
          entry.min &&
        total <=
          entry.max
    );


  if (!row) {

    throw new Error(
      `Resultado d100 inválido para Magnitude: ${total}.`
    );
  }


  return {
    total,
    dice:
      row.dice
  };
}


/* ============================================================
 * MULTIPLICADOR DE DADOS - MAGNITUDE
 * ============================================================ */

function dynamicDiceMultiplier(
  formula
) {

  const match =
    String(
      formula
    ).match(
      /(?:(\d+)\s*[x×*]\s*)?\bdice\b/i
    );


  if (!match) {

    throw new Error(
      `No se encontró el marcador "dice" en: ${formula}`
    );
  }


  const multiplier =
    Number(
      match[1] ??
      1
    );


  if (
    !Number.isInteger(
      multiplier
    ) ||
    multiplier < 1
  ) {

    throw new Error(
      `Multiplicador de dados inválido: ${match[1]}.`
    );
  }


  return multiplier;
}


/* ============================================================
 * ESCALAR DADOS
 * ============================================================ */

function scaleDiceFormula(
  baseDice,
  multiplier
) {

  const match =
    String(
      baseDice
    ).match(
      /^(\d+)d(\d+)$/i
    );


  if (!match) {

    throw new Error(
      `Fórmula base de dados inválida: ${baseDice}.`
    );
  }


  const count =
    Number(
      match[1]
    );


  const sides =
    Number(
      match[2]
    );


  return (
    `${count * multiplier}d${sides}`
  );
}


/* ============================================================
 * REEMPLAZAR "dice" - MAGNITUDE
 * ============================================================ */

function replaceDynamicDice(
  formula,
  scaledDice
) {

  const resolved =
    String(
      formula
    ).replace(
      /(?:(\d+)\s*[x×*]\s*)?\bdice\b/i,
      scaledDice
    );


  if (
    !isExecutableFormula(
      resolved
    )
  ) {

    throw new Error(
      `La fórmula dinámica resuelta no es ejecutable: ${resolved}`
    );
  }


  return resolved;
}


/* ============================================================
 * MAGNITUDE RESOLVER
 * ============================================================ */

function resolveMagnitudeDamage(
  definition
) {

  const template =
    rejectedFormula(
      definition
    );


  const table =
    rollMagnitudeTable();


  const diceMultiplier =
    dynamicDiceMultiplier(
      template
    );


  const scaledDice =
    scaleDiceFormula(
      table.dice,
      diceMultiplier
    );


  const formula =
    replaceDynamicDice(
      template,
      scaledDice
    );


  return {
    kind:
      "magnitude",

    tableRoll:
      table.total,

    baseDice:
      table.dice,

    diceMultiplier,

    scaledDice,

    formula
  };
}


/* ============================================================
 * ROLLOUT STATE
 * ============================================================ */

function dynamicDamageState(
  actor
) {

  const state =
    actor?.getFlag(
      MODULE_ID,
      "dynamicDamageState"
    );


  if (
    !state ||
    typeof state !==
      "object"
  ) {

    return {};
  }


  return foundry.utils.deepClone(
    state
  );
}


function rolloutState(
  actor
) {

  return (
    dynamicDamageState(
      actor
    ).rollout ??
    null
  );
}


async function setRolloutState(
  actor,
  rollout
) {

  const state =
    dynamicDamageState(
      actor
    );


  state.rollout =
    rollout;


  await actor.setFlag(
    MODULE_ID,
    "dynamicDamageState",
    state
  );
}


async function clearRolloutState(
  actor
) {

  if (!actor) {

    return;
  }


  const state =
    dynamicDamageState(
      actor
    );


  if (!state.rollout) {

    return;
  }


  delete state.rollout;


  if (
    Object.keys(
      state
    ).length
  ) {

    await actor.setFlag(
      MODULE_ID,
      "dynamicDamageState",
      state
    );

    return;
  }


  await actor.unsetFlag(
    MODULE_ID,
    "dynamicDamageState"
  );
}


/* ============================================================
 * ROLLOUT COMBAT CONTEXT
 * ============================================================ */

function rolloutCombatContext(
  actor
) {

  const combat =
    game.combat;


  const round =
    Number(
      combat?.round
    );


  const currentActor =
    combat?.combatant
      ?.actor ??
    null;


  return {
    combatId:
      combat?.id ??
      null,

    round:
      Number.isInteger(
        round
      ) &&
      round > 0
        ? round
        : null,

    onOwnTurn:
      Boolean(
        actor?.uuid &&
        currentActor?.uuid ===
          actor.uuid
      )
  };
}


/* ============================================================
 * ROLLOUT RESET CONDITIONS
 * ============================================================ */

function rolloutResetReason(
  actor
) {

  if (
    actor?.statuses
      ?.has(
        "incapacitated"
      )
  ) {

    return "incapacitated";
  }


  const movement =
    actor?.system
      ?.attributes
      ?.movement;


  const walk =
    Number(
      movement?.walk
    );


  const bonus =
    Number(
      movement?.bonus ??
      0
    );


  const effectiveWalk =
    walk +
    (
      Number.isFinite(
        bonus
      )
        ? bonus
        : 0
    );


  if (
    Number.isFinite(
      walk
    ) &&
    effectiveWalk <= 0
  ) {

    return "speed-zero";
  }


  return null;
}


/* ============================================================
 * ROLLOUT STAGE
 * ============================================================ */

function rolloutStage(
  actor
) {

  const combat =
    rolloutCombatContext(
      actor
    );


  const resetReason =
    rolloutResetReason(
      actor
    );


  const progressionEligible =
    Boolean(
      combat.combatId &&
      combat.round &&
      combat.onOwnTurn &&
      !resetReason
    );


  if (
    !progressionEligible
  ) {

    return {
      stage: 1,
      ...combat,

      progressionEligible:
        false,

      resetReason:
        resetReason ??
        (
          combat.onOwnTurn
            ? "no-combat"
            : "not-own-turn"
        )
    };
  }


  const state =
    rolloutState(
      actor
    );


  const consecutive =
    Boolean(
      state?.combatId ===
        combat.combatId &&
      Number(
        state?.lastSuccessRound
      ) ===
        combat.round - 1
    );


  const nextStage =
    Math.max(
      1,
      Math.min(
        ROLLOUT_MAX_STAGE,
        Number(
          state?.nextStage ??
          1
        )
      )
    );


  return {
    stage:
      consecutive
        ? nextStage
        : 1,

    ...combat,

    progressionEligible:
      true,

    resetReason:
      null
  };
}


/* ============================================================
 * ROLLOUT FORMULA
 * ============================================================ */

function rolloutDiceSides(
  formula
) {

  const match =
    String(
      formula
    ).match(
      /\bRd(\d+)\b/i
    );


  if (!match) {

    throw new Error(
      `No se encontró el marcador Rollout "RdX" en: ${formula}`
    );
  }


  const sides =
    Number(
      match[1]
    );


  if (
    !Number.isInteger(
      sides
    ) ||
    sides < 2
  ) {

    throw new Error(
      `Dado base inválido para Rollout: d${match[1]}.`
    );
  }


  return sides;
}


function replaceRolloutDice(
  formula,
  scaledDice
) {

  const resolved =
    String(
      formula
    ).replace(
      /\bRd\d+\b/i,
      scaledDice
    );


  if (
    !isExecutableFormula(
      resolved
    )
  ) {

    throw new Error(
      `La fórmula de Rollout resuelta no es ejecutable: ${resolved}`
    );
  }


  return resolved;
}


/* ============================================================
 * ROLLOUT RESOLVER
 * ============================================================ */

function resolveRolloutDamage(
  definition,
  context
) {

  const actor =
    context?.item?.actor;


  if (!actor) {

    throw new Error(
      "Rollout requiere un Actor origen."
    );
  }


  const template =
    rejectedFormula(
      definition
    );


  const stage =
    rolloutStage(
      actor
    );


  const sides =
    rolloutDiceSides(
      template
    );


  const diceMultiplier =
    2 **
    (
      stage.stage - 1
    );


  const baseDice =
    `1d${sides}`;


  const scaledDice =
    `${diceMultiplier}d${sides}`;


  const formula =
    replaceRolloutDice(
      template,
      scaledDice
    );


  return {
    kind:
      "rollout",

    stage:
      stage.stage,

    maxStage:
      ROLLOUT_MAX_STAGE,

    baseDice,

    diceMultiplier,

    scaledDice,

    formula,

    combatId:
      stage.combatId,

    round:
      stage.round,

    progressionEligible:
      stage.progressionEligible,

    resetReason:
      stage.resetReason
  };
}

/* ============================================================
 * OUTRAGE CONCENTRATION STATE
 * ============================================================ */

function outrageEffectState(
  effect
) {

  const state =
    effect?.getFlag?.(
      MODULE_ID,
      "outrage"
    );


  if (
    !state ||
    typeof state !==
      "object" ||
    state.kind !==
      "outrage"
  ) {

    return null;
  }


  return foundry.utils.deepClone(
    state
  );
}


function outrageConcentrationEffect(
  actor
) {

  return (
    actor?.effects.find(
      effect =>
        !effect.disabled &&
        effect.getFlag?.(
          MODULE_ID,
          "outrage"
        )?.kind ===
          "outrage"
    ) ??
    null
  );
}


/* ============================================================
 * OUTRAGE CONCENTRATION START
 * ============================================================ */

function onPreBeginConcentrating(
  actor,
  item,
  effectData
) {

  if (
    item?.getFlag?.(
      MODULE_ID,
      "kind"
    ) !==
      "move" ||
    item.getFlag(
      MODULE_ID,
      "sourceId"
    ) !==
      "outrage"
  ) {

    return;
  }


  const combat =
    game.combat;


  const round =
    Number(
      combat?.round
    );


  const state = {
    kind:
      "outrage",

    sourceActorUuid:
      actor?.uuid ??
      null,

    itemUuid:
      item.uuid,

    itemName:
      item.name,

    combatId:
      combat?.id ??
      null,

    startRound:
      Number.isInteger(
        round
      ) &&
      round > 0
        ? round
        : null,

    lastDamageRound:
      null,

    lastStage:
      0,

    stabTargets:
      [],

    endReason:
      null,

    createdAt:
      Date.now()
  };


  foundry.utils.setProperty(
    effectData,
    `flags.${MODULE_ID}.outrage`,
    state
  );
}


/* ============================================================
 * OUTRAGE STAB TEMPLATE
 *
 * Outrage es UNA sola activación.
 *
 * Poke5e:
 * STAB solo puede aplicarse una vez
 * por Move y por objetivo.
 *
 * El builder lo deja al final de la fórmula,
 * así que lo retiramos del Roll y será agregado
 * durante preCalculateDamage cuando corresponda.
 * ============================================================ */

function outrageTemplateWithoutStab(
  formula,
  item
) {

  const stab =
    item?.getFlag?.(
      MODULE_ID,
      "stab"
    );


  const stabBonus =
    stab?.eligible
      ? Number(
          stab.bonus ??
          0
        )
      : 0;


  const text =
    String(
      formula ??
      ""
    ).trim();


  if (
    !Number.isFinite(
      stabBonus
    ) ||
    stabBonus <= 0
  ) {

    return {
      formula:
        text,

      stabBonus:
        0
    };
  }


  const match =
    text.match(
      /^(.*)\s*\+\s*(\d+(?:\.\d+)?)\s*$/
    );


  if (
    !match ||
    Number(
      match[2]
    ) !==
      stabBonus
  ) {

    throw new Error(
      `No se pudo separar el STAB +${stabBonus} de Outrage: ${text}`
    );
  }


  const stripped =
    String(
      match[1] ??
      ""
    ).trim();


  if (!stripped) {

    throw new Error(
      `La fórmula de Outrage quedó vacía al retirar STAB: ${text}`
    );
  }


  return {
    formula:
      stripped,

    stabBonus
  };
}


/* ============================================================
 * OUTRAGE STAGE
 * ============================================================ */

function outrageStage(
  actor,
  effect
) {

  const state =
    outrageEffectState(
      effect
    );


  if (!state) {

    throw new Error(
      "Outrage no tiene un estado de concentración válido."
    );
  }


  if (
    actor?.statuses?.has(
      "incapacitated"
    )
  ) {

    throw new Error(
      "Outrage se detuvo porque el usuario está incapacitado."
    );
  }


  const combat =
    game.combat;


  const round =
    Number(
      combat?.round
    );


  const startRound =
    Number(
      state.startRound
    );


  const currentActor =
    combat?.combatant
      ?.actor ??
    null;


  if (
    !combat?.id ||
    combat.id !==
      state.combatId ||
    !Number.isInteger(
      round
    ) ||
    round <= 0 ||
    !Number.isInteger(
      startRound
    ) ||
    startRound <= 0 ||
    currentActor?.uuid !==
      actor?.uuid
  ) {

    throw new Error(
      "Outrage solo puede continuar durante el turno del usuario en el combate donde comenzó."
    );
  }


  const stage =
    round -
    startRound +
    1;


  if (
    stage < 1 ||
    stage >
      OUTRAGE_MAX_STAGE
  ) {

    throw new Error(
      `Ronda de Outrage fuera de rango: ${stage}.`
    );
  }


  if (
    Number(
      state.lastDamageRound
    ) ===
      round
  ) {

    throw new Error(
      `Outrage ya resolvió su daño en la ronda ${round}.`
    );
  }


  return {
    stage,

    combatId:
      combat.id,

    round
  };
}


/* ============================================================
 * OUTRAGE FORMULA
 * ============================================================ */

function outrageDiceSides(
  formula
) {

  const match =
    String(
      formula
    ).match(
      /\bRd(\d+)\b/i
    );


  if (!match) {

    throw new Error(
      `No se encontró el marcador Outrage "RdX" en: ${formula}`
    );
  }


  const sides =
    Number(
      match[1]
    );


  if (
    !Number.isInteger(
      sides
    ) ||
    sides < 2
  ) {

    throw new Error(
      `Dado base inválido para Outrage: d${match[1]}.`
    );
  }


  return sides;
}


function replaceOutrageDice(
  formula,
  scaledDice
) {

  const resolved =
    String(
      formula
    ).replace(
      /\bRd\d+\b/i,
      scaledDice
    );


  if (
    !isExecutableFormula(
      resolved
    )
  ) {

    throw new Error(
      `La fórmula de Outrage resuelta no es ejecutable: ${resolved}`
    );
  }


  return resolved;
}


/* ============================================================
 * OUTRAGE RESOLVER
 * ============================================================ */

function resolveOutrageDamage(
  definition,
  context
) {

  const item =
    context?.item;


  const actor =
    item?.actor;


  if (!actor) {

    throw new Error(
      "Outrage requiere un Actor origen."
    );
  }


  const effect =
    outrageConcentrationEffect(
      actor
    );


  if (!effect) {

    throw new Error(
      "Outrage requiere que su concentración siga activa."
    );
  }


  const rawTemplate =
    rejectedFormula(
      definition
    );


  const template =
    outrageTemplateWithoutStab(
      rawTemplate,
      item
    );

  const stabBoost =
    resolveStabAbilityBoost(
      actor,
      template.stabBonus
    );


  const resolvedStabBonus =
    stabBoost?.totalBonus ??
    template.stabBonus;


  const stage =
    outrageStage(
      actor,
      effect
    );


  const sides =
    outrageDiceSides(
      template.formula
    );


  const diceMultiplier =
    2 **
    (
      stage.stage - 1
    );


  const baseDice =
    `1d${sides}`;


  const scaledDice =
    `${diceMultiplier}d${sides}`;


  const formula =
    replaceOutrageDice(
      template.formula,
      scaledDice
    );


  return {
    kind:
      "outrage",

    stage:
      stage.stage,

    maxStage:
      OUTRAGE_MAX_STAGE,

    baseDice,

    diceMultiplier,

    scaledDice,

    formula,

    baseStabBonus:
      template.stabBonus,

    stabBonus:
      resolvedStabBonus,

    stabAbilityBoost:
      stabBoost
        ? {
            ...stabBoost,

            sourceAbilityName:
              abilityDisplayName(
                actor,
                stabBoost.sourceAbility
              )
          }
        : null,

    combatId:
      stage.combatId,

    round:
      stage.round,

    sourceActorUuid:
      actor.uuid,

    itemUuid:
      item.uuid,

    concentrationEffectUuid:
      effect.uuid
  };
}  


/* ============================================================
 * REEMPLAZAR DAMAGEROLL
 * ============================================================ */

function replacementRoll(
  roll,
  resolution
) {

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

    dynamicDamage: {
      ...resolution,

      resolved:
        true
    }
  };


  const RollClass =
    roll.constructor;


  return new RollClass(
    resolution.formula,
    roll.data,
    options
  );
}


/* ============================================================
 * LANGUAGE
 * ============================================================ */

function language() {

  try {

    return game.settings.get(
      MODULE_ID,
      "language"
    ) === "en"
      ? "en"
      : "es";

  } catch {

    return "es";
  }
}


/* ============================================================
 * CHAT FLAVOR
 * ============================================================ */

function magnitudeFlavor(
  resolution
) {

  const multiplier =
    resolution.diceMultiplier;


  if (
    language() ===
    "en"
  ) {

    return (
      `Magnitude: d100 ${resolution.tableRoll} → ` +
      `${resolution.baseDice}; dice ×${multiplier} → ` +
      `${resolution.scaledDice}.`
    );
  }


  return (
    `Magnitud: d100 ${resolution.tableRoll} → ` +
    `${resolution.baseDice}; dados ×${multiplier} → ` +
    `${resolution.scaledDice}.`
  );
}


function rolloutFlavor(
  resolution
) {

  if (
    language() ===
    "en"
  ) {

    return (
      `Rollout: attack ${resolution.stage}/${resolution.maxStage} → ` +
      `${resolution.scaledDice}.`
    );
  }


  return (
    `Rodar: ataque ${resolution.stage}/${resolution.maxStage} → ` +
    `${resolution.scaledDice}.`
  );
}

function outrageFlavor(
  resolution
) {

  const boost =
    resolution.stabAbilityBoost;


  const boostText =
    boost

      ? (
          ` (${boost.sourceAbilityName}: ` +
          `STAB ×${boost.multiplier})`
        )

      : "";


  const stabText =
    Number(
      resolution.stabBonus
    ) > 0

      ? (
          language() === "en"

            ? (
                ` STAB +${resolution.stabBonus}${boostText} ` +
                "applies only once per target."
              )

            : (
                ` STAB +${resolution.stabBonus}${boostText} ` +
                "se aplica solo una vez por objetivo."
              )
        )

      : "";


  if (
    language() ===
    "en"
  ) {

    return (
      `Outrage: round ${resolution.stage}/${resolution.maxStage} → ` +
      `${resolution.scaledDice}.${stabText}`
    );
  }


  return (
    `Enfado: ronda ${resolution.stage}/${resolution.maxStage} → ` +
    `${resolution.scaledDice}.${stabText}`
  );
}


function resolutionFlavor(
  resolution
) {

  switch (
    resolution?.kind
  ) {

    case "magnitude":

      return magnitudeFlavor(
        resolution
      );

    case "rollout":

      return rolloutFlavor(
        resolution
      );

    case "outrage":

      return outrageFlavor(
        resolution
      );


    default:

      return "";
  }
}


/* ============================================================
 * MESSAGE METADATA
 * ============================================================ */

function annotateMessage(
  message,
  resolution
) {

  const data =
    message?.data;


  if (!data) {

    return;
  }


  foundry.utils.setProperty(
    data,
    `flags.${MODULE_ID}.dynamicDamage`,
    resolution
  );


  const flavor =
    resolutionFlavor(
      resolution
    );


  if (!flavor) {

    return;
  }


  data.flavor =
    data.flavor
      ? `${data.flavor}<br>${flavor}`
      : flavor;
}


/* ============================================================
 * ACTOR UUID
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
          strict: false
        }
      );


    if (
      document?.documentName ===
      "Actor"
    ) {

      return document;
    }


    return (
      document?.actor ??
      null
    );

  } catch {

    return null;
  }
}


/* ============================================================
 * DAMAGE REAL
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
      ] ??
      beforeValue
    );


  const afterTemp =
    Number(
      updates[
        "system.attributes.hp.temp"
      ] ??
      beforeTemp
    );


  return Math.max(
    0,
    (
      beforeValue +
      beforeTemp
    ) -
    (
      afterValue +
      afterTemp
    )
  );
}


/* ============================================================
 * RESOLUTION DESDE DAMAGE MESSAGE
 * ============================================================ */

function damageResolution(
  options
) {

  const message =
    options?.originatingMessage;


  if (!message) {

    return null;
  }


  const direct =
    message.getFlag?.(
      MODULE_ID,
      "dynamicDamage"
    );


  if (direct) {

    return direct;
  }


  const originating =
    message.getOriginatingMessage?.();


  return (
    originating?.getFlag?.(
      MODULE_ID,
      "dynamicDamage"
    ) ??
    null
  );
}

/* ============================================================
 * OUTRAGE CURRENT TIMING
 * ============================================================ */

function currentOutrageTiming(
  sourceActor,
  effect,
  state,
  resolution
) {

  const combat =
    game.combat;


  const round =
    Number(
      combat?.round
    );


  const startRound =
    Number(
      state?.startRound
    );


  const currentActor =
    combat?.combatant
      ?.actor ??
    null;


  if (
    !combat?.id ||
    !Number.isInteger(
      round
    ) ||
    !Number.isInteger(
      startRound
    ) ||
    state?.combatId !==
      combat.id ||
    resolution?.combatId !==
      combat.id ||
    Number(
      resolution?.round
    ) !==
      round ||
    Number(
      resolution?.stage
    ) !==
      round -
      startRound +
      1 ||
    currentActor?.uuid !==
      sourceActor?.uuid ||
    effect?.uuid !==
      resolution?.concentrationEffectUuid
  ) {

    return false;
  }


  return (
    !sourceActor.statuses
      ?.has(
        "incapacitated"
      )
  );
}


/* ============================================================
 * OUTRAGE STAB
 * ============================================================ */

function onPreCalculateOutrageDamage(
  actor,
  damages,
  options
) {

  const resolution =
    damageResolution(
      options
    );


  if (
    resolution?.kind !==
      "outrage"
  ) {

    return;
  }


  const item =
    originatingMoveItem(
      options
    );


  if (
    item?.getFlag?.(
      MODULE_ID,
      "sourceId"
    ) !==
      "outrage"
  ) {

    return false;
  }


  const sourceActor =
    item.actor;


  const effect =
    outrageConcentrationEffect(
      sourceActor
    );


  const state =
    outrageEffectState(
      effect
    );


  if (
    !sourceActor ||
    !effect ||
    !state ||
    !currentOutrageTiming(
      sourceActor,
      effect,
      state,
      resolution
    ) ||
    Number(
      state.lastDamageRound
    ) ===
      Number(
        resolution.round
      )
  ) {

    /*
     * Impide aplicar:
     *
     * - daño de una concentración antigua;
     * - daño fuera del turno correcto;
     * - daño duplicado en la misma ronda.
     */

    return false;
  }


  const stabBonus =
    Math.max(
      0,
      Number(
        resolution.stabBonus ??
        0
      ) ||
      0
    );


  const stabTargets =
    new Set(
      Array.isArray(
        state.stabTargets
      )
        ? state.stabTargets
        : []
    );


  if (
    stabBonus <= 0 ||
    stabTargets.has(
      actor?.uuid
    )
  ) {

    return;
  }


  /*
   * Outrage genera una única parte de daño.
   * Sumamos STAB antes del cálculo nativo
   * de resistencias/vulnerabilidades.
   */

  const damage =
    damages.find(
      entry =>
        Number.isFinite(
          Number(
            entry?.value
          )
        )
    );


  if (!damage) {

    return;
  }


  damage.value =
    Number(
      damage.value
    ) +
    stabBonus;
}


/* ============================================================
 * OUTRAGE END
 * ============================================================ */

async function endOutrage(
  effect,
  reason
) {

  const state =
    outrageEffectState(
      effect
    );


  if (!state) {

    return;
  }


  await effect.setFlag(
    MODULE_ID,
    "outrage",
    {
      ...state,

      endReason:
        reason,

      endedAt:
        Date.now()
    }
  );


  await effect.delete();
}


/* ============================================================
 * OUTRAGE DAMAGE FINALIZATION
 * ============================================================ */

async function finalizeOutrageDamage(
  targetActor,
  options
) {

  const resolution =
    damageResolution(
      options
    );


  if (
    resolution?.kind !==
      "outrage"
  ) {

    return;
  }


  const item =
    originatingMoveItem(
      options
    );


  if (
    item?.getFlag?.(
      MODULE_ID,
      "sourceId"
    ) !==
      "outrage"
  ) {

    return;
  }


  const sourceActor =
    item.actor;


  const effect =
    outrageConcentrationEffect(
      sourceActor
    );


  const state =
    outrageEffectState(
      effect
    );


  if (
    !sourceActor ||
    !effect ||
    !state ||
    !currentOutrageTiming(
      sourceActor,
      effect,
      state,
      resolution
    ) ||
    Number(
      state.lastDamageRound
    ) ===
      Number(
        resolution.round
      )
  ) {

    return;
  }


  const stabTargets =
    new Set(
      Array.isArray(
        state.stabTargets
      )
        ? state.stabTargets
        : []
    );


  /*
   * STAB se consume para este objetivo
   * aunque el daño efectivo resulte 0.
   *
   * Sigue siendo la misma aplicación
   * del Move contra ese objetivo.
   */

  if (
    Number(
      resolution.stabBonus
    ) > 0 &&
    targetActor?.uuid
  ) {

    stabTargets.add(
      targetActor.uuid
    );
  }


  const nextState = {
    ...state,

    lastDamageRound:
      Number(
        resolution.round
      ),

    lastStage:
      Number(
        resolution.stage
      ),

    stabTargets:
      [
        ...stabTargets
      ],

    updatedAt:
      Date.now()
  };


  await effect.setFlag(
    MODULE_ID,
    "outrage",
    nextState
  );


  /*
   * Tras resolver el tercer ataque,
   * la concentración termina.
   */

  if (
    Number(
      resolution.stage
    ) >=
      OUTRAGE_MAX_STAGE
  ) {

    await endOutrage(
      effect,
      "completed"
    );
  }
}


function onApplyOutrageDamage(
  actor,
  amount,
  options
) {

  const resolution =
    damageResolution(
      options
    );


  if (
    resolution?.kind !==
      "outrage" ||
    Number(
      amount
    ) < 0
  ) {

    return;
  }


  void finalizeOutrageDamage(
    actor,
    options
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error actualizando progreso de Outrage:`,
        error
      );
    }
  );
}


/* ============================================================
 * ROLLOUT DAMAGE APPLICATION
 * ============================================================ */

function onPreApplyDamage(
  actor,
  amount,
  updates,
  options
) {

  const resolution =
    damageResolution(
      options
    );


  if (
    resolution?.kind !==
    "rollout"
  ) {

    return;
  }


  const item =
    originatingMoveItem(
      options
    );


  if (
    item?.getFlag(
      MODULE_ID,
      "sourceId"
    ) !==
    "rollout"
  ) {

    return;
  }


  const sourceActor =
    item.actor;


  if (!sourceActor) {

    return;
  }


  options[
    MODULE_ID
  ] ??=
    {};


  options[
    MODULE_ID
  ].rolloutProgress = {
    sourceActorUuid:
      sourceActor.uuid,

    itemUuid:
      item.uuid,

    itemName:
      item.name,

    combatId:
      resolution.combatId ??
      null,

    round:
      Number(
        resolution.round
      ) ||
      null,

    stage:
      Math.max(
        1,
        Math.min(
          ROLLOUT_MAX_STAGE,
          Number(
            resolution.stage
          ) ||
          1
        )
      ),

    progressionEligible:
      Boolean(
        resolution.progressionEligible
      ),

    calculatedAmount:
      Number(
        amount
      ) ||
      0,

    actualDamage:
      actualDamageFromUpdates(
        actor,
        updates
      ),

    targetActorUuid:
      actor.uuid,

    targetActorName:
      actor.name
  };
}


/* ============================================================
 * ROLLOUT FINALIZATION
 * ============================================================ */

async function finalizeRolloutProgress(
  marker
) {

  const source =
    actorFromUuid(
      marker?.sourceActorUuid
    );


  if (!source) {

    return;
  }


  const current =
    rolloutCombatContext(
      source
    );


  const validTiming =
    Boolean(
      marker.progressionEligible &&
      marker.combatId &&
      marker.round &&
      current.combatId ===
        marker.combatId &&
      current.round ===
        marker.round &&
      current.onOwnTurn
    );


  const resetReason =
    rolloutResetReason(
      source
    );


  if (
    !validTiming ||
    resetReason ||
    Number(
      marker.actualDamage
    ) <= 0
  ) {

    await clearRolloutState(
      source
    );


    console.debug(
      `[${MODULE_ID}] ${marker.itemName}: secuencia Rollout reiniciada.`,
      {
        source:
          source.name,

        stage:
          marker.stage,

        actualDamage:
          marker.actualDamage,

        resetReason:
          resetReason ??
          (
            validTiming
              ? "no-damage"
              : "invalid-timing"
          )
      }
    );


    return;
  }


  const nextStage =
    marker.stage >=
      ROLLOUT_MAX_STAGE
      ? 1
      : marker.stage + 1;


  await setRolloutState(
    source,
    {
      combatId:
        marker.combatId,

      lastSuccessRound:
        marker.round,

      nextStage,

      lastStage:
        marker.stage,

      lastDamage:
        marker.actualDamage,

      updatedAt:
        Date.now()
    }
  );


  console.debug(
    `[${MODULE_ID}] ${marker.itemName}: progreso Rollout guardado.`,
    {
      source:
        source.name,

      completedStage:
        marker.stage,

      nextStage,

      actualDamage:
        marker.actualDamage
    }
  );
}


function onApplyDamage(
  actor,
  amount,
  options
) {

  const marker =
    options?.[MODULE_ID]
      ?.rolloutProgress;


  if (
    !marker ||
    marker.targetActorUuid !==
      actor?.uuid ||
    Number(amount) < 0
  ) {

    return;
  }


  void finalizeRolloutProgress(
    marker
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error actualizando progreso de Rollout:`,
        error
      );
    }
  );
}


/* ============================================================
 * FORWARD COMBAT TRANSITION
 * ============================================================ */

function isForwardTransition(
  prior,
  current
) {

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


  return (
    Number(
      current?.turn ??
      -1
    ) >
    Number(
      prior?.turn ??
      -1
    )
  );
}


/* ============================================================
 * ROLLOUT STATE MAINTENANCE
 * ============================================================ */

async function maintainRolloutStates(
  combat,
  current
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  const round =
    Number(
      current?.round ??
      combat?.round
    );


  if (
    !Number.isInteger(
      round
    ) ||
    round <= 0
  ) {

    return;
  }


  const actors =
    new Map();


  for (
    const combatant
    of combat?.combatants ??
    []
  ) {

    if (
      combatant.actor?.uuid
    ) {

      actors.set(
        combatant.actor.uuid,
        combatant.actor
      );
    }
  }


  for (
    const actor
    of actors.values()
  ) {

    const state =
      rolloutState(
        actor
      );


    if (
      !state ||
      state.combatId !==
        combat.id
    ) {

      continue;
    }


    const stale =
      Number.isFinite(
        Number(
          state.lastSuccessRound
        )
      ) &&
      round >
        Number(
          state.lastSuccessRound
        ) + 1;


    if (
      stale ||
      rolloutResetReason(
        actor
      )
    ) {

      await clearRolloutState(
        actor
      );
    }
  }
}

/* ============================================================
 * OUTRAGE STATE MAINTENANCE
 * ============================================================ */

async function maintainOutrageStates(
  combat,
  current
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  const round =
    Number(
      current?.round ??
      combat?.round
    );


  if (
    !Number.isInteger(
      round
    ) ||
    round <= 0
  ) {

    return;
  }


  const actors =
    new Map();


  for (
    const combatant
    of combat?.combatants ??
    []
  ) {

    if (
      combatant.actor?.uuid
    ) {

      actors.set(
        combatant.actor.uuid,
        combatant.actor
      );
    }
  }


  for (
    const actor
    of actors.values()
  ) {

    const effect =
      outrageConcentrationEffect(
        actor
      );


    const state =
      outrageEffectState(
        effect
      );


    if (
      !effect ||
      !state
    ) {

      continue;
    }


    const startRound =
      Number(
        state.startRound
      );


    const staleCombat =
      state.combatId !==
        combat.id;


    const expired =
      Number.isInteger(
        startRound
      ) &&
      round >
        startRound +
        OUTRAGE_MAX_STAGE -
        1;


    const incapacitated =
      actor.statuses
        ?.has(
          "incapacitated"
        );


    if (
      !staleCombat &&
      !expired &&
      !incapacitated
    ) {

      continue;
    }


    let reason =
      "completed";


    if (staleCombat) {

      reason =
        "combat-changed";

    } else if (
      incapacitated
    ) {

      reason =
        "incapacitated";
    }


    await endOutrage(
      effect,
      reason
    );
  }
}


async function onCombatTurnChange(
  combat,
  prior,
  current
) {

  if (
    !isForwardTransition(
      prior,
      current
    )
  ) {

    return;
  }


  await maintainRolloutStates(
    combat,
    current
  );


  await maintainOutrageStates(
    combat,
    current
  );
}


async function onDeleteCombat(
  combat
) {

  if (
    !isAuthority()
  ) {

    return;
  }


  for (
    const combatant
    of combat?.combatants ??
    []
  ) {

    const actor =
      combatant.actor;


    const rollout =
      rolloutState(
        actor
      );


    if (
      rollout?.combatId ===
        combat.id
    ) {

      await clearRolloutState(
        actor
      );
    }


    const outrageEffect =
      outrageConcentrationEffect(
        actor
      );


    const outrage =
      outrageEffectState(
        outrageEffect
      );


    if (
      outrageEffect &&
      outrage?.combatId ===
        combat.id
    ) {

      await endOutrage(
        outrageEffect,
        "combat-end"
      );
    }
  }
}


/* ============================================================
 * POST ROLL CONFIGURATION
 * ============================================================ */

function onPostRollConfiguration(
  rolls,
  config,
  ...hookArgs
) {

  if (
    !Array.isArray(
      rolls
    ) ||
    !rolls.length ||
    !isDamageProcess(
      config
    )
  ) {

    return;
  }


  const item =
    poke5eMoveFromConfig(
      config
    );


  if (!item) {

    return;
  }


  const definition =
    dynamicDamageDefinition(
      item
    );


  if (!definition) {

    return;
  }


  const index =
    placeholderRollIndex(
      rolls
    );


  if (
    index < 0
  ) {

    console.error(
      `[${MODULE_ID}] ${item.name}: ` +
      "no se encontró el DamageRoll placeholder del daño dinámico."
    );


    ui.notifications.error(
      `${item.name}: no se pudo preparar el daño dinámico.`
    );


    return false;
  }


  const handler =
    DYNAMIC_DAMAGE_HANDLERS.get(
      definition.kind
    );


  try {

    const resolution =
      handler(
        definition,
        {
          item,
          config
        }
      );


    rolls.splice(
      index,
      1,
      replacementRoll(
        rolls[
          index
        ],
        resolution
      )
    );


    const message =
      hookArgs[
        1
      ] ??
      null;


    annotateMessage(
      message,
      resolution
    );


    console.debug(
      `[${MODULE_ID}] ${item.name}: daño dinámico resuelto.`,
      resolution
    );

  } catch (
    error
  ) {

    console.error(
      `[${MODULE_ID}] ${item.name}: ` +
      "error resolviendo daño dinámico.",
      error
    );


    ui.notifications.error(
      `${item.name}: no se pudo resolver el daño dinámico.`
    );


    return false;
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerDynamicDamageEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  Hooks.on(
    "dnd5e.preBeginConcentrating",
    onPreBeginConcentrating
  );


  Hooks.on(
    "dnd5e.postRollConfiguration",
    onPostRollConfiguration
  );


  Hooks.on(
    "dnd5e.preCalculateDamage",
    onPreCalculateOutrageDamage
  );


  Hooks.on(
    "dnd5e.preApplyDamage",
    onPreApplyDamage
  );


  Hooks.on(
    "dnd5e.applyDamage",
    onApplyDamage
  );


  Hooks.on(
    "dnd5e.applyDamage",
    onApplyOutrageDamage
  );


  Hooks.on(
    "combatTurnChange",
    onCombatTurnChange
  );


  Hooks.on(
    "deleteCombat",
    onDeleteCombat
  );


  console.log(
    `[${MODULE_ID}] Dynamic Damage Engine registrado.`
  );
}