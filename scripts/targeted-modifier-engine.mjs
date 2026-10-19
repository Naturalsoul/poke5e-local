const MODULE_ID =
  "poke5e-local";


/* ============================================================
 * TOKEN DE UN ACTOR
 * ============================================================ */

function tokenForActor(
  actor
) {

  if (!actor) {

    return null;
  }


  /*
   * Preferimos Token controlado.
   */

  const controlled =
    canvas.tokens
      ?.controlled
      ?.find(
        token =>
          token.actor?.id ===
          actor.id
      );


  if (controlled) {

    return controlled;
  }


  /*
   * Si no está controlado,
   * usamos un Token presente en la escena.
   */

  return (
    canvas.tokens
      ?.placeables
      ?.find(
        token =>
          token.actor?.id ===
          actor.id
      )
    ??
    null
  );
}


/* ============================================================
 * TARGET ÚNICO
 *
 * Para los modificadores dirigidos necesitamos saber
 * exactamente a quién se está atacando.
 * ============================================================ */

function currentTarget() {

  if (
    game.user.targets.size !==
    1
  ) {

    return null;
  }


  return (
    [...game.user.targets][0] ??
    null
  );
}


/* ============================================================
 * EFECTOS TARGETED PRESENTES EN EL OBJETIVO
 * ============================================================ */

function targetedEffects(
  actor
) {

  if (!actor) {

    return [];
  }


  return actor.effects.filter(
    effect =>

      !effect.disabled &&

      effect.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        "pokemon-modifier" &&

      Boolean(
        effect.getFlag(
          MODULE_ID,
          "targetedAttack"
        )
      )
  );
}


/* ============================================================
 * ¿EL ATACANTE PUEDE BENEFICIARSE?
 * ============================================================ */

function attackerEligible(
  attacker,
  effect
) {

  const rule =
    effect.getFlag(
      MODULE_ID,
      "targetedAttack"
    );


  if (!rule) {

    return false;
  }


  const sourceActorUuid =
    effect.getFlag(
      MODULE_ID,
      "sourceActorUuid"
    );


  /* ==========================================================
   * EL USUARIO ORIGINAL NO CUENTA COMO SU PROPIO ALIADO
   * ========================================================== */

  if (
    rule.excludeSource &&
    attacker.uuid ===
      sourceActorUuid
  ) {

    return false;
  }


  if (
    !rule.alliesOnly
  ) {

    return true;
  }


  /* ==========================================================
   * COMPROBAR BANDO
   * ========================================================== */

  const attackerToken =
    tokenForActor(
      attacker
    );


  if (!attackerToken) {

    return false;
  }


  const attackerDisposition =
    Number(
      attackerToken.document
        ?.disposition ??
      0
    );


  const sourceDisposition =
    Number(
      effect.getFlag(
        MODULE_ID,
        "sourceDisposition"
      ) ??
      0
    );


  /*
   * Neutral no lo interpretamos automáticamente
   * como aliado.
   */

  if (
    attackerDisposition === 0 ||
    sourceDisposition === 0
  ) {

    return false;
  }


  return (
    attackerDisposition ===
    sourceDisposition
  );
}


/* ============================================================
 * CALCULAR BONUS TOTAL
 *
 * Ej:
 *
 * Tail Whip 2/5
 * → +2
 *
 * Si posteriormente existieran varios modificadores:
 *
 * Tail Whip +2
 * Screech   +1
 * ─────────────
 * Total     +3
 * ============================================================ */

function calculateTargetedBonus(
  attacker,
  target
) {

  let total =
    0;


  const details =
    [];


  for (
    const effect
    of targetedEffects(
      target
    )
  ) {

    if (
      !attackerEligible(
        attacker,
        effect
      )
    ) {

      continue;
    }


    const rule =
      effect.getFlag(
        MODULE_ID,
        "targetedAttack"
      );


    const stacks =
      Math.max(
        1,
        Number(
          effect.getFlag(
            MODULE_ID,
            "stackCount"
          ) ??
          1
        )
      );


    const perStack =
      Number(
        rule.bonusPerStack ??
        0
      );


    const bonus =
      stacks *
      perStack;


    if (
      !Number.isFinite(
        bonus
      ) ||
      bonus === 0
    ) {

      continue;
    }


    total +=
      bonus;


    details.push({

      name:
        effect.name,

      stacks,

      bonus
    });
  }


  return {

    total,

    details
  };
}


/* ============================================================
 * PRE ROLL ATTACK
 *
 * ESTA ES LA CORRECCIÓN IMPORTANTE.
 *
 * Ya no modificamos un D20Roll construido.
 *
 * Modificamos la CONFIGURACIÓN antes de que D&D5e
 * genere:
 *
 * 1d20 + modifiers
 *
 * Así terms[0] sigue siendo siempre el D20Die.
 * ============================================================ */

function onPreRollAttack(
  config,
  dialog,
  message
) {

  const activity =
    config?.subject;


  const attacker =
    activity?.actor;


  if (!attacker) {

    return;
  }


  /* ==========================================================
   * EXACTAMENTE UN TARGET
   * ========================================================== */

  const targetToken =
    currentTarget();


  if (
    !targetToken?.actor
  ) {

    return;
  }


  const target =
    targetToken.actor;


  /* ==========================================================
   * CALCULAR MODIFICADORES DEL OBJETIVO
   * ========================================================== */

  const result =
    calculateTargetedBonus(
      attacker,
      target
    );


  if (
    !result.total
  ) {

    return;
  }


  /* ==========================================================
   * CONFIG.ROLLS
   *
   * AttackActivity ya ha preparado rollConfig.rolls
   * antes de que se ejecute preRollAttack.
   * ========================================================== */

  if (
    !Array.isArray(
      config.rolls
    ) ||
    !config.rolls.length
  ) {

    console.warn(
      `[${MODULE_ID}] Attack roll sin config.rolls.`
    );

    return;
  }


  /* ==========================================================
   * AÑADIR BONUS COMO UNA PARTE MÁS
   *
   * NO:
   *
   * (1d20 + 4) + 1
   *
   * SINO:
   *
   * D&D5e construirá:
   *
   * 1d20 + 4 + 1
   * ========================================================== */

  for (
    const rollConfig
    of config.rolls
  ) {

    rollConfig.parts ??=
      [];


    /*
     * Protección por si algún proceso dispara
     * este hook más de una vez.
     */

    rollConfig.options ??=
      {};


    rollConfig.options[
      MODULE_ID
    ] ??=
      {};


    if (
      rollConfig.options[
        MODULE_ID
      ].targetedAttackApplied
    ) {

      continue;
    }


    /* ========================================================
     * USAMOS ROLL DATA
     *
     * En vez de meter simplemente "2",
     * usamos una variable clara.
     *
     * Fórmula final:
     *
     * 1d20 + ... + @poke5eTargeted
     * ======================================================== */

    rollConfig.data ??=
      {};


    rollConfig.data
      .poke5eTargeted =
      result.total;


    rollConfig.parts.push(
      "@poke5eTargeted"
    );


    rollConfig.options[
      MODULE_ID
    ] = {

      ...(
        rollConfig.options[
          MODULE_ID
        ] ??
        {}
      ),

      targetedAttackApplied:
        true,

      targetedAttackBonus:
        result.total,

      targetActorUuid:
        target.uuid,

      targetedAttackEffects:
        result.details
    };
  }


  /* ==========================================================
   * INFORMACIÓN EN EL MENSAJE
   *
   * Nos permitirá inspeccionarlo después.
   * ========================================================== */

  message.data ??=
    {};


  foundry.utils.setProperty(

    message.data,

    `flags.${MODULE_ID}.targetedAttack`,

    {

      bonus:
        result.total,

      attacker:
        attacker.uuid,

      target:
        target.uuid,

      effects:
        result.details
    }
  );


  console.debug(

    `[${MODULE_ID}] Targeted Attack:`,

    `${attacker.name} +${result.total} contra ${target.name}`,

    result.details
  );
}


/* ============================================================
 * ROLL MODES (batch 5f)
 *
 * rollModes on an effect: own → the bearer's attacks, against → attacks on the bearer,
 * vsSource → only toward / from whoever applied it, nextAttack → attacks it lasts.
 * ============================================================ */

function rollModeEffects(actor) {
  return actor?.effects?.filter(effect => !effect.disabled && effect.getFlag(MODULE_ID, "rollModes")) ?? [];
}

function collectRollModes(attacker, target) {
  const modes = [];
  const consumed = [];
  for (const effect of rollModeEffects(attacker)) {
    const rule = effect.getFlag(MODULE_ID, "rollModes");
    if (!("own" in rule)) {continue;}
    // "Its next attack": spent even when it isn't aimed at the source.
    if (!rule.vsSource || target?.uuid === effect.getFlag(MODULE_ID, "sourceActorUuid")) {modes.push(rule.own);}
    if (rule.nextAttack) {consumed.push(effect.uuid);}
  }
  for (const effect of rollModeEffects(target)) {
    const rule = effect.getFlag(MODULE_ID, "rollModes");
    if (!("against" in rule) || (rule.vsSource && attacker.uuid !== effect.getFlag(MODULE_ID, "sourceActorUuid"))) {continue;}
    modes.push(rule.against);
    if (rule.nextAttack) {consumed.push(effect.uuid);}
  }
  return { modes, consumed };
}

function onPreRollAttackModes(config) {
  const attacker = config?.subject?.actor;
  if (!attacker || !Array.isArray(config.rolls) || !config.rolls.length) {return;}
  const { modes, consumed } = collectRollModes(attacker, currentTarget()?.actor ?? null);
  if (!modes.length && !consumed.length) {return;}
  for (const rollConfig of config.rolls) {
    rollConfig.options ??= {};
    // Both set cancel out in dnd5e, like 5e rules.
    if (modes.includes(1)) {rollConfig.options.advantage = true;}
    if (modes.includes(-1)) {rollConfig.options.disadvantage = true;}
    rollConfig.options[MODULE_ID] = { ...rollConfig.options[MODULE_ID], consumedRollModes: consumed };
  }
}

// The GM spends "next attack" effects once the attack message exists, so a cancelled roll keeps them.
export async function consumeAttackRollModes(message) {
  if (!game.user.isGM || (game.users?.activeGM && game.users.activeGM.id !== game.user.id)) {return;}
  const uuids = new Set(Array.from(message.rolls ?? []).flatMap(roll => roll.options?.[MODULE_ID]?.consumedRollModes ?? []));
  for (const uuid of uuids) {
    const effect = fromUuidSync(uuid, { strict: false });
    if (!effect) {continue;}
    const left = Number(effect.getFlag(MODULE_ID, "rollModes")?.nextAttack ?? 1) - 1;
    await (left > 0 ? effect.setFlag(MODULE_ID, "rollModes.nextAttack", left) : effect.delete());
  }
}


/* ============================================================
 * REGISTER
 * ============================================================ */

let registered =
  false;


export function registerPokemonTargetedModifierEngine() {

  if (
    registered
  ) {

    return;
  }


  registered =
    true;


  /*
   * IMPORTANTE:
   *
   * Ya NO usamos:
   *
   * dnd5e.postRollConfiguration
   *
   * para ataques dirigidos.
   *
   * Intervenimos antes de construir el D20Roll.
   */

  Hooks.on(
    "dnd5e.preRollAttack",
    onPreRollAttack
  );

  Hooks.on("dnd5e.preRollAttack", onPreRollAttackModes);
  Hooks.on("createChatMessage", message => {
    void consumeAttackRollModes(message).catch(error => console.error(`[${MODULE_ID}] Error consumiendo roll modes`, error));
  });


  console.log(
    `[${MODULE_ID}] Targeted Modifier Engine registrado.`
  );
}