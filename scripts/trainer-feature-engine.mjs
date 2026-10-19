import {
  getPokemonTrainerUuid,
  isPokemonActor
} from "./trainer-party-service.mjs";

import {
  getTrainerProgressionResource,
  getTrainerProgressionState,
  resetTrainerLongRestResources,
  restoreTrainerProgressionResource,
  spendTrainerProgressionResource
} from "./trainer-progression-service.mjs";

import {
  getTrainerLevelRule,
  getTrainerSpecialization
} from "./trainer-rules.mjs";

import {
  getTrainerLevel,
  isTrainerActor
} from "./trainer-service.mjs";


const MODULE_ID =
  "poke5e-local";

const RESEARCHER_RESOURCE_ID =
  "researcherUses";

const RESEARCHER_RESOLVED_KEY =
  "poke5eResearcherResolved";

const SHADOW_RESOURCE_ID =
  "shadowPoints";

const TACTICAL_RESOURCE_ID =
  "tacticalPoints";

const TACTICIAN_RESOLVED_KEY =
  "poke5eTacticianResolved";

/* ============================================================
 * TRAINER RESOLUTION
 * ============================================================ */

function trainerFromPokemon(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return null;
  }


  const trainerUuid =
    getPokemonTrainerUuid(
      pokemon
    );


  if (!trainerUuid) {

    return null;
  }


  const trainer =
    game.actors.find(
      actor =>
        actor.uuid ===
        trainerUuid
    ) ??
    null;


  return isTrainerActor(
    trainer
  )
    ? trainer
    : null;
}

function trainerPathIdForPokemon(
  pokemon
) {

  const trainer =
    trainerFromPokemon(
      pokemon
    );


  if (!trainer) {

    return null;
  }


  const progression =
    getTrainerProgressionState(
      trainer
    );


  return (
    progression
      ?.path
      ?.id ??
    null
  );
}


function moveItemFromActivityConfig(
  config
) {

  const item =
    config
      ?.subject
      ?.item;


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


function pokemonFromActivityConfig(
  config
) {

  const item =
    moveItemFromActivityConfig(
      config
    );


  const pokemon =
    item?.actor;


  return isPokemonActor(
    pokemon
  )
    ? pokemon
    : null;
}

/* ============================================================
 * POKÉMON TYPES
 * ============================================================ */

function pokemonTypes(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return [];
  }


  const storedTypes =
    pokemon.getFlag(
      MODULE_ID,
      "types"
    );


  const primaryType =
    String(
      pokemon.getFlag(
        MODULE_ID,
        "primaryType"
      ) ??
      ""
    )
      .trim()
      .toLowerCase();


  const types =
    Array.isArray(
      storedTypes
    )
      ? storedTypes
          .map(
            type =>
              String(
                type ??
                ""
              )
                .trim()
                .toLowerCase()
          )
          .filter(Boolean)
      : [];


  if (
    !types.length &&
    primaryType
  ) {

    types.push(
      primaryType
    );
  }


  return [
    ...new Set(
      types
    )
  ];
}


/* ============================================================
 * SPECIALIZATION
 * ============================================================ */

/**
 * Calcula el bonus que las Specializations
 * del Trainer otorgan a los Skill Checks
 * de este Pokémon.
 *
 * Cada Specialization coincidente aporta +1.
 *
 * El array specializationIds se conserva
 * intencionalmente como array en vez de Set:
 * Poke5e permite stackear Specializations.
 */
export function getPokemonSpecializationSkillBonus(
  pokemon
) {

  const trainer =
    trainerFromPokemon(
      pokemon
    );


  if (!trainer) {

    return 0;
  }


  const progression =
    getTrainerProgressionState(
      trainer
    );


  const specializationIds =
    Array.isArray(
      progression
        ?.specializationIds
    )
      ? progression
          .specializationIds
      : [];


  if (
    !specializationIds.length
  ) {

    return 0;
  }


  const types =
    new Set(
      pokemonTypes(
        pokemon
      )
    );


  if (
    !types.size
  ) {

    return 0;
  }


  return specializationIds.reduce(
    (
      bonus,
      specializationId
    ) => {

      const specialization =
        getTrainerSpecialization(
          specializationId
        );


      if (
        !specialization?.type ||
        !types.has(
          specialization.type
        )
      ) {

        return bonus;
      }


      return bonus + 1;
    },
    0
  );
}

/* ============================================================
 * ACE TRAINER
 * ============================================================ */

export function getPokemonAceTrainerBonus(
  pokemon
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return 0;
  }


  return (
    trainerPathIdForPokemon(
      pokemon
    ) ===
      "ace-trainer"
  )
    ? 1
    : 0;
}

/* ============================================================
 * TYPE MASTER
 * ============================================================ */

function getTrainerSpecializationTypes(
  trainer
) {

  const progression =
    getTrainerProgressionState(
      trainer
    );


  const specializationIds =
    Array.isArray(
      progression
        ?.specializationIds
    )
      ? progression
          .specializationIds
      : [];


  return new Set(
    specializationIds
      .map(
        specializationId =>
          getTrainerSpecialization(
            specializationId
          )?.type
      )
      .filter(Boolean)
  );
}


export function getPokemonTypeMasterStabBonus(
  pokemon,
  moveItem
) {

  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return 0;
  }


  if (
    trainerPathIdForPokemon(
      pokemon
    ) !==
      "type-master"
  ) {

    return 0;
  }


  if (
    moveItem?.documentName !==
      "Item" ||
    moveItem.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "move"
  ) {

    return 0;
  }


  const stab =
    moveItem.getFlag(
      MODULE_ID,
      "stab"
    );


  /*
   * Type Master aumenta STAB.
   * Si el Move no recibe STAB originalmente,
   * Type Master no crea uno.
   */

  if (
    stab?.eligible !==
      true
  ) {

    return 0;
  }


  const trainer =
    trainerFromPokemon(
      pokemon
    );


  if (!trainer) {

    return 0;
  }


  const specializedTypes =
    getTrainerSpecializationTypes(
      trainer
    );


  const types =
    pokemonTypes(
      pokemon
    );


  return types.reduce(
    (
      bonus,
      type
    ) =>
      specializedTypes.has(
        type
      )
        ? bonus + 1
        : bonus,
    0
  );
}

/* ============================================================
 * RESEARCHER
 * ============================================================ */

/* ============================================================
 * PATH FEATURES DE NIVEL 5+ (pasivos)
 * ============================================================ */

function trainerPathAtLevel(trainer, pathId, level) {
  return getTrainerProgressionState(trainer)?.path?.id === pathId && (getTrainerLevel(trainer) ?? 0) >= level;
}

// Type Master L5, Drawing Power: +2 to attack rolls of Pokémon of a specialized type.
export function getPokemonDrawingPowerBonus(pokemon) {
  const trainer = trainerFromPokemon(pokemon);
  if (!trainer || !trainerPathAtLevel(trainer, "type-master", 5)) {return 0;}
  const specialized = getTrainerSpecializationTypes(trainer);
  return pokemonTypes(pokemon).some(type => specialized.has(type)) ? 2 : 0;
}

// Hobbyist L9, Generalist: half the trainer's PB (round down) on checks with a skill the roller lacks.
export function getGeneralistSkillBonus(actor, skillId) {
  const trainer = isTrainerActor(actor) ? actor : trainerFromPokemon(actor);
  const skill = actor?.system?.skills?.[skillId];
  if (!trainer || !skill || Number(skill.value ?? 0) > 0 || !trainerPathAtLevel(trainer, "hobbyist", 9)) {return 0;}
  return Math.floor(Number(getTrainerLevelRule(getTrainerLevel(trainer))?.proficiencyBonus ?? 0) / 2);
}

function trainerIntelligenceModifier(
  trainer
) {

  const score =
    Number(
      trainer.system
        ?.abilities
        ?.int
        ?.value ??
      10
    );


  const modifier =
    Math.floor(
      (
        score -
        10
      ) /
      2
    );


  /*
   * Poke5e Researcher:
   * INT modifier, minimum one.
   */

  return Math.max(
    1,
    modifier
  );
}


function getPokemonResearcherContext(
  pokemon
) {

  const trainer =
    trainerFromPokemon(
      pokemon
    );


  if (
    !trainer ||
    trainerPathIdForPokemon(
      pokemon
    ) !==
      "researcher"
  ) {

    return null;
  }


  const resource =
    getTrainerProgressionResource(
      trainer,
      RESEARCHER_RESOURCE_ID
    );


  if (
    !resource ||
    resource.value <=
      0
  ) {

    return null;
  }


  return {
    trainer,

    bonus:
      trainerIntelligenceModifier(
        trainer
      ),

    resource
  };
}


function getLanguage() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
}


function researcherDialogContent({
  trainer,
  pokemon,
  bonus,
  resource
}) {

  const language =
    getLanguage();


  const trainerName =
    foundry.utils.escapeHTML(
      trainer.name
    );


  const pokemonName =
    foundry.utils.escapeHTML(
      pokemon.name
    );


  if (
    language ===
    "en"
  ) {

    return `
      <p>
        Use <strong>Researcher</strong> for
        <strong>${pokemonName}</strong>?
      </p>

      <p>
        ${trainerName} will add
        <strong>+${bonus}</strong>
        to this Skill Check.
      </p>

      <p class="hint">
        Uses remaining:
        ${resource.value}/${resource.max}
      </p>
    `;
  }


  return `
    <p>
      ¿Usar <strong>Researcher</strong> para
      <strong>${pokemonName}</strong>?
    </p>

    <p>
      ${trainerName} añadirá
      <strong>+${bonus}</strong>
      a este Skill Check.
    </p>

    <p class="hint">
      Usos restantes:
      ${resource.value}/${resource.max}
    </p>
  `;
}


function buildSkillReplayConfig(
  config,
  researcherResolution
) {

  const replayConfig = {
    ...config,

    [RESEARCHER_RESOLVED_KEY]:
      researcherResolution
  };


  /*
   * Estos campos pertenecen al proceso
   * interno ya construido por D&D5e.
   *
   * rollSkill() debe reconstruirlos.
   */

  delete replayConfig
    .hookNames;

  delete replayConfig
    .rolls;

  delete replayConfig
    .subject;


  return replayConfig;
}


async function rerollSkillAfterResearcherPrompt({
  pokemon,
  config,
  dialog,
  message,
  context
}) {

  const language =
    getLanguage();


  const useResearcher =
    await foundry.applications.api
      .DialogV2.confirm({

        window: {

          title:
            language === "en"
              ? "Researcher"
              : "Researcher"
        },

        content:
          researcherDialogContent({
            trainer:
              context.trainer,

            pokemon,

            bonus:
              context.bonus,

            resource:
              context.resource
          }),

        modal:
          true,

        rejectClose:
          false
      });


  let spent =
    false;


  if (
    useResearcher ===
    true
  ) {

    spent =
      await spendTrainerProgressionResource(
        context.trainer,
        RESEARCHER_RESOURCE_ID,
        1
      );


    if (!spent) {

      ui.notifications.warn(
        language === "en"
          ? "Researcher has no uses remaining."
          : "Researcher no tiene usos restantes."
      );
    }
  }


  const researcherResolution = {

    useBonus:
      spent,

    bonus:
      spent
        ? context.bonus
        : 0
  };


  const replayConfig =
    buildSkillReplayConfig(
      config,
      researcherResolution
    );


  try {

    const rolls =
      await pokemon.rollSkill(
        replayConfig,
        dialog,
        message
      );


    /*
     * Si el usuario cancela el diálogo
     * normal de D&D5e después de haber
     * elegido Researcher, no gastamos
     * el recurso.
     */

    if (
      spent &&
      (
        !Array.isArray(
          rolls
        ) ||
        !rolls.length
      )
    ) {

      await restoreTrainerProgressionResource(
        context.trainer,
        RESEARCHER_RESOURCE_ID,
        1
      );
    }

  } catch (error) {

    if (
      spent
    ) {

      await restoreTrainerProgressionResource(
        context.trainer,
        RESEARCHER_RESOURCE_ID,
        1
      );
    }


    throw error;
  }
}


function requestResearcherSkillDecision({
  pokemon,
  config,
  dialog,
  message,
  context
}) {

  void rerollSkillAfterResearcherPrompt({
    pokemon,
    config,
    dialog,
    message,
    context
  }).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error aplicando Researcher`,
        error
      );


      ui.notifications.error(
        getLanguage() ===
          "en"
          ? "Researcher could not be applied."
          : "No se pudo aplicar Researcher."
      );
    }
  );
}

/* ============================================================
 * GRUNT / SABOTAGE
 * ============================================================ */

function getPokemonGruntContext(
  pokemon
) {

  const trainer =
    trainerFromPokemon(
      pokemon
    );


  if (
    !trainer ||
    trainerPathIdForPokemon(
      pokemon
    ) !==
      "grunt"
  ) {

    return null;
  }


  const resource =
    getTrainerProgressionResource(
      trainer,
      SHADOW_RESOURCE_ID
    );


  if (
    !resource ||
    resource.value <=
      0
  ) {

    return null;
  }


  return {
    trainer,
    resource
  };
}


function activeD20Result(
  roll
) {

  const results =
    roll?.d20
      ?.results ??
    [];


  const active =
    results.find(
      result =>
        result.active ===
        true
    );


  const value =
    Number(
      active?.result ??
      roll?.d20?.total
    );


  return Number.isFinite(
    value
  )
    ? value
    : null;
}


function sabotageTargetPokemon(
  roll
) {

  /*
   * D&D5e solo asigna options.target
   * cuando existe exactamente un target.
   */

  const targetAc =
    Number(
      roll?.options
        ?.target
    );


  if (
    !Number.isFinite(
      targetAc
    )
  ) {

    return null;
  }


  const targets =
    [
      ...game.user.targets
    ];


  if (
    targets.length !==
      1
  ) {

    return null;
  }


  const pokemon =
    targets[0]
      ?.actor;


  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return null;
  }


  return {
    pokemon,
    targetAc
  };
}


function getSabotageOpportunity(
  roll
) {

  if (
    !roll ||
    roll.isSuccess !==
      true
  ) {

    return null;
  }


  /*
   * Poke5e:
   * natural 20 cannot be decreased.
   */

  if (
    activeD20Result(
      roll
    ) === 20
  ) {

    return null;
  }


  const target =
    sabotageTargetPokemon(
      roll
    );


  if (!target) {

    return null;
  }


  const grunt =
    getPokemonGruntContext(
      target.pokemon
    );


  if (!grunt) {

    return null;
  }


  const attackTotal =
    Number(
      roll.total
    );


  if (
    !Number.isFinite(
      attackTotal
    )
  ) {

    return null;
  }


  /*
   * Hit:
   *
   * total >= AC
   *
   * Para convertirlo en miss:
   *
   * effectiveTotal < AC
   *
   * mínimo gasto =
   * total - AC + 1
   */

  const minimumSpend =
    attackTotal -
    target.targetAc +
    1;


  if (
    minimumSpend < 1 ||
    minimumSpend >
      grunt.resource.value
  ) {

    return null;
  }


  return {
    pokemon:
      target.pokemon,

    trainer:
      grunt.trainer,

    resource:
      grunt.resource,

    attackTotal,

    targetAc:
      target.targetAc,

    minimumSpend
  };
}

function sabotageDialogContent(
  opportunity
) {

  const language =
    getLanguage();


  const trainerName =
    foundry.utils.escapeHTML(
      opportunity
        .trainer
        .name
    );


  const pokemonName =
    foundry.utils.escapeHTML(
      opportunity
        .pokemon
        .name
    );


  if (
    language ===
      "en"
  ) {

    return `
      <p>
        <strong>${pokemonName}</strong>
        was hit with an attack roll of
        <strong>${opportunity.attackTotal}</strong>
        against AC
        <strong>${opportunity.targetAc}</strong>.
      </p>

      <p>
        ${trainerName} may use
        <strong>Sabotage</strong>
        as a Reaction.
      </p>

      <div class="form-group">
        <label>
          Shadow Points
        </label>

        <input
          type="number"
          name="shadowPoints"
          min="${opportunity.minimumSpend}"
          max="${opportunity.resource.value}"
          value="${opportunity.minimumSpend}"
        >
      </div>

      <p class="hint">
        Minimum required:
        ${opportunity.minimumSpend}.
        Available:
        ${opportunity.resource.value}/${opportunity.resource.max}.
      </p>
    `;
  }


  return `
    <p>
      <strong>${pokemonName}</strong>
      recibió un ataque con resultado
      <strong>${opportunity.attackTotal}</strong>
      contra CA
      <strong>${opportunity.targetAc}</strong>.
    </p>

    <p>
      ${trainerName} puede usar
      <strong>Sabotage</strong>
      como Reacción.
    </p>

    <div class="form-group">
      <label>
        Shadow Points
      </label>

      <input
        type="number"
        name="shadowPoints"
        min="${opportunity.minimumSpend}"
        max="${opportunity.resource.value}"
        value="${opportunity.minimumSpend}"
      >
    </div>

    <p class="hint">
      Mínimo necesario:
      ${opportunity.minimumSpend}.
      Disponibles:
      ${opportunity.resource.value}/${opportunity.resource.max}.
    </p>
  `;
}


async function promptSabotage(
  opportunity
) {

  const result =
    await foundry.applications.api
      .DialogV2.prompt({

        window: {
          title:
            "Sabotage"
        },

        content:
          sabotageDialogContent(
            opportunity
          ),

        rejectClose:
          false,

        ok: {

          label:
            getLanguage() ===
              "en"
              ? "Use Sabotage"
              : "Usar Sabotage",

          callback:
            (
              event,
              button
            ) => {

              const value =
                Number(
                  button.form
                    .elements
                    .shadowPoints
                    .value
                );


              return Number.isInteger(
                value
              )
                ? value
                : null;
            }
        }
      });


  if (
    !Number.isInteger(
      result
    )
  ) {

    return null;
  }


  if (
    result <
      opportunity
        .minimumSpend ||
    result >
      opportunity
        .resource
        .value
  ) {

    return null;
  }


  return result;
}

async function applySabotageToAttackRoll(
  roll,
  opportunity,
  spent
) {

  const message =
    roll.parent;


  if (
    message?.documentName !==
      "ChatMessage"
  ) {

    throw new Error(
      "No se encontró el ChatMessage del Attack Roll."
    );
  }


  const effectiveTotal =
    opportunity
      .attackTotal -
    spent;


  const rollData =
    roll.toJSON();


  rollData.options ??=
    {};


  rollData.options[
    MODULE_ID
  ] = {

    ...(
      rollData.options[
        MODULE_ID
      ] ??
      {}
    ),

    sabotage: {

      trainerUuid:
        opportunity
          .trainer
          .uuid,

      pokemonUuid:
        opportunity
          .pokemon
          .uuid,

      spent,

      originalTotal:
        opportunity
          .attackTotal,

      effectiveTotal,

      originalTarget:
        opportunity
          .targetAc
    }
  };


  /*
   * D&D5e determina isSuccess comparando
   * roll.total contra options.target.
   *
   * No tocamos:
   *
   * - d20 natural
   * - roll.total original
   *
   * Solo hacemos que el resultado mecánico
   * del Roll pase a ser failure.
   */

  rollData.options.target =
    opportunity
      .targetAc +
    spent;


  const ReplacementRoll =
    roll.constructor
      .fromData(
        rollData
      );


  const messageRolls =
    message.rolls.map(
      existing =>
        existing ===
          roll
          ? ReplacementRoll
          : existing
    );


  /*
   * En algunos casos Foundry reconstruye
   * las instancias del ChatMessage.
   * Si la referencia no coincide, usamos
   * el único Attack Roll del mensaje.
   */

  const replaced =
    messageRolls.some(
      existing =>
        existing ===
          ReplacementRoll
    );


  if (
    !replaced &&
    messageRolls.length ===
      1
  ) {

    messageRolls[0] =
      ReplacementRoll;
  }


  await message.update({

    rolls:
      messageRolls.map(
        existing =>
          existing.toJSON()
      ),

    [`flags.${MODULE_ID}.sabotage`]: {

      trainerUuid:
        opportunity
          .trainer
          .uuid,

      pokemonUuid:
        opportunity
          .pokemon
          .uuid,

      spent,

      originalTotal:
        opportunity
          .attackTotal,

      effectiveTotal,

      targetAc:
        opportunity
          .targetAc
    }
  });


  return effectiveTotal;
}

async function createSabotageMessage(
  opportunity,
  spent,
  effectiveTotal
) {

  const language =
    getLanguage();


  const content =
    language ===
      "en"
      ? `
        <div class="poke5e-turn-message">
          <strong>${opportunity.trainer.name}</strong>
          uses <strong>Sabotage</strong> as a Reaction.

          <br>

          Attack:
          <strong>${opportunity.attackTotal}</strong>
          → <strong>${effectiveTotal}</strong>

          against AC
          <strong>${opportunity.targetAc}</strong>.

          <br>

          <strong>${spent} Shadow Point${spent === 1 ? "" : "s"}</strong>
          spent.

          <br>

          <strong>Miss.</strong>
        </div>
      `
      : `
        <div class="poke5e-turn-message">
          <strong>${opportunity.trainer.name}</strong>
          usa <strong>Sabotage</strong> como Reacción.

          <br>

          Ataque:
          <strong>${opportunity.attackTotal}</strong>
          → <strong>${effectiveTotal}</strong>

          contra CA
          <strong>${opportunity.targetAc}</strong>.

          <br>

          Gasta
          <strong>${spent} Shadow Point${spent === 1 ? "" : "s"}</strong>.

          <br>

          <strong>Falla.</strong>
        </div>
      `;


  await ChatMessage.create({

    speaker:
      ChatMessage.getSpeaker({
        actor:
          opportunity.trainer
      }),

    content
  });
}

/* ============================================================
 * TACTICIAN
 * ============================================================ */

function trainerHasPath(
  trainer,
  pathId
) {

  if (
    !isTrainerActor(
      trainer
    )
  ) {

    return false;
  }


  return (
    getTrainerProgressionState(
      trainer
    )
      ?.path
      ?.id ===
    pathId
  );
}


function tacticianCandidates() {

  return game.actors
    .filter(
      trainer =>
        isTrainerActor(
          trainer
        ) &&
        trainer.isOwner &&
        trainerHasPath(
          trainer,
          "tactician"
        )
    )
    .map(
      trainer => ({
        trainer,

        resource:
          getTrainerProgressionResource(
            trainer,
            TACTICAL_RESOURCE_ID
          )
      })
    )
    .filter(
      context =>
        context.resource
          ?.value >
        0
    );
}


function damageConfigTypes(
  rollConfig
) {

  const explicit =
    String(
      rollConfig
        ?.options
        ?.type ??
      ""
    )
      .trim()
      .toLowerCase();


  const stored =
    rollConfig
      ?.options
      ?.types;


  const types =
    stored instanceof Set
      ? [
          ...stored
        ]
      : Array.isArray(
          stored
        )
        ? stored
        : [];


  if (explicit) {

    types.push(
      explicit
    );
  }


  return new Set(
    types
      .map(
        type =>
          String(
            type ??
            ""
          )
            .trim()
            .toLowerCase()
      )
      .filter(Boolean)
  );
}


function isHitPointHealingConfig(
  rollConfig
) {

  /*
   * Tactician habla de recuperar HP.
   *
   * No incluimos tipos como temporary HP.
   */

  return damageConfigTypes(
    rollConfig
  ).has(
    "healing"
  );
}


function isHitPointHealingRoll(
  roll
) {

  return isHitPointHealingConfig({
    options:
      roll?.options
  });
}

function originatingUsageMessage(
  config
) {

  const messageId =
    config?.event
      ?.target
      ?.closest?.(
        "[data-message-id]"
      )
      ?.dataset
      ?.messageId;


  if (!messageId) {

    return null;
  }


  return (
    game.messages.get(
      messageId
    ) ??
    null
  );
}


function pokemonTargetsFromUsageMessage(
  config
) {

  const message =
    originatingUsageMessage(
      config
    );


  const descriptors =
    message?.flags
      ?.dnd5e
      ?.targets;


  if (
    !Array.isArray(
      descriptors
    )
  ) {

    return [];
  }


  return descriptors
    .map(
      descriptor => {

        const uuid =
          descriptor?.uuid;


        if (!uuid) {

          return null;
        }


        try {

          return fromUuidSync(
            uuid,
            {
              strict:
                false
            }
          );

        } catch {

          return null;
        }
      }
    )
    .map(
      document =>
        document?.documentName ===
          "Actor"
          ? document
          : document?.actor ??
            null
    )
    .filter(
      actor =>
        isPokemonActor(
          actor
        )
    );
}

function healingTargetPokemon(
  activity,
  config
) {

  const sourceActor =
    activity?.actor ??
    activity?.item
      ?.actor ??
    null;


  /*
   * Curación explícitamente Self.
   */

  if (
    activity?.target
      ?.affects
      ?.type ===
      "self" &&
    isPokemonActor(
      sourceActor
    )
  ) {

    return sourceActor;
  }


  /*
   * Fuente primaria:
   *
   * targets guardados por D&D5e en el
   * Usage Message original.
   */

  const storedTargets =
    pokemonTargetsFromUsageMessage(
      config
    );


  if (
    storedTargets.length ===
      1
  ) {

    return storedTargets[0];
  }


  /*
   * Fallback:
   *
   * targeting actual del usuario.
   */

  const currentTargets =
    [
      ...game.user.targets
    ]
      .map(
        token =>
          token.actor
      )
      .filter(
        actor =>
          isPokemonActor(
            actor
          )
      );


  return currentTargets.length ===
    1
    ? currentTargets[0]
    : null;
}


function getTacticianOpportunity(
  config
) {

  if (
    !Array.isArray(
      config?.rolls
    ) ||
    !config.rolls.some(
      isHitPointHealingConfig
    )
  ) {

    return null;
  }


  const activity =
    config?.subject;


  const item =
    activity?.item;


  /*
   * Poke5e exige que la curación provenga
   * de un Item o Move.
   *
   * Ambos son Item documents en Foundry.
   */

  if (
    item?.documentName !==
      "Item"
  ) {

    return null;
  }


  const pokemon =
    healingTargetPokemon(
      activity,
      config
    );


  if (!pokemon) {

    return null;
  }


  const candidates =
    tacticianCandidates();


  if (
    !candidates.length
  ) {

    return null;
  }


  return {
    activity,
    item,
    pokemon,
    candidates
  };
}


function tacticianDialogContent(
  opportunity
) {

  const language =
    getLanguage();


  const pokemonName =
    foundry.utils.escapeHTML(
      opportunity.pokemon.name
    );


  const candidatesMarkup =
    opportunity.candidates
      .map(
        ({
          trainer,
          resource
        }) => {

          const name =
            foundry.utils.escapeHTML(
              trainer.name
            );


          return `
            <option value="${foundry.utils.escapeHTML(trainer.uuid)}">
              ${name} — ${resource.value}/${resource.max}
            </option>
          `;
        }
      )
      .join("");


  const maximum =
    Math.max(
      ...opportunity.candidates
        .map(
          context =>
            context.resource.value
        )
    );


  const trainerField =
    opportunity.candidates.length >
      1
      ? `
        <div class="form-group">
          <label>
            ${language === "en"
              ? "Trainer"
              : "Entrenador"}
          </label>

          <select name="trainerUuid">
            ${candidatesMarkup}
          </select>
        </div>
      `
      : "";


  if (
    language ===
      "en"
  ) {

    return `
      <p>
        <strong>${pokemonName}</strong>
        is about to regain hit points.
      </p>

      <p>
        Spend Tactical Points to add
        <strong>1d4 healing per point</strong>?
      </p>

      ${trainerField}

      <div class="form-group">
        <label>
          Tactical Points
        </label>

        <input
          type="number"
          name="tacticalPoints"
          min="1"
          max="${maximum}"
          value="1"
        >
      </div>
    `;
  }


  return `
    <p>
      <strong>${pokemonName}</strong>
      está a punto de recuperar HP.
    </p>

    <p>
      ¿Gastar Tactical Points para añadir
      <strong>1d4 de curación por punto</strong>?
    </p>

    ${trainerField}

    <div class="form-group">
      <label>
        Tactical Points
      </label>

      <input
        type="number"
        name="tacticalPoints"
        min="1"
        max="${maximum}"
        value="1"
      >
    </div>
  `;
}


async function promptTactician(
  opportunity
) {

  const result =
    await foundry.applications.api
      .DialogV2.prompt({

        window: {
          title:
            "Tactician"
        },

        content:
          tacticianDialogContent(
            opportunity
          ),

        rejectClose:
          false,

        ok: {

          label:
            getLanguage() ===
              "en"
              ? "Spend Tactical Points"
              : "Gastar Tactical Points",

          callback:
            (
              event,
              button
            ) => {

              const trainerUuid =
                opportunity
                  .candidates
                  .length ===
                  1
                  ? opportunity
                      .candidates[0]
                      .trainer
                      .uuid
                  : String(
                      button.form
                        .elements
                        .trainerUuid
                        .value
                    );


              const context =
                opportunity
                  .candidates
                  .find(
                    candidate =>
                      candidate
                        .trainer
                        .uuid ===
                      trainerUuid
                  );


              if (!context) {

                return null;
              }


              const spent =
                Number(
                  button.form
                    .elements
                    .tacticalPoints
                    .value
                );


              if (
                !Number.isInteger(
                  spent
                ) ||
                spent < 1 ||
                spent >
                  context.resource.value
              ) {

                return null;
              }


              return {
                trainerUuid,
                spent
              };
            }
        }
      });


  return (
    result &&
    typeof result ===
      "object"
  )
    ? result
    : null;
}


function buildDamageReplayConfig(
  config,
  resolution
) {

  const replayConfig = {
    ...config,

    [TACTICIAN_RESOLVED_KEY]:
      resolution
  };


  /*
   * rollDamage() debe volver a construir
   * estas propiedades.
   *
   * getDamageConfig() concatena config.rolls
   * a las Damage Parts originales, por lo que
   * conservar rolls duplicaría la curación.
   */

  delete replayConfig
    .hookNames;

  delete replayConfig
    .rolls;

  delete replayConfig
    .subject;


  return replayConfig;
}


function applyTacticianHealingBonus(
  rolls,
  resolution
) {

  const spent =
    Number(
      resolution?.spent ??
      0
    );


  if (
    !resolution?.useBonus ||
    spent <= 0
  ) {

    return;
  }


  const index =
    rolls.findIndex(
      roll =>
        isHitPointHealingRoll(
          roll
        ) &&
        !roll.options?.[
          MODULE_ID
        ]?.tactician
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


  const formula =
    String(
      roll.formula ??
      ""
    ).trim();


  if (!formula) {

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

    tactician: {

      trainerUuid:
        resolution
          .trainerUuid,

      pokemonUuid:
        resolution
          .pokemonUuid,

      spent,

      bonusFormula:
        `${spent}d4`
    }
  };


  const RollClass =
    roll.constructor;


  rolls.splice(
    index,
    1,
    new RollClass(
      `${formula} + ${spent}d4`,
      roll.data,
      options
    )
  );
}


async function rerollHealingAfterTacticianPrompt({
  config,
  dialog,
  message,
  opportunity
}) {

  const decision =
    await promptTactician(
      opportunity
    );


  let trainer =
    null;

  let spent =
    0;


  if (decision) {

    trainer =
      game.actors.find(
        actor =>
          actor.uuid ===
          decision.trainerUuid
      ) ??
      null;


    if (
      isTrainerActor(
        trainer
      )
    ) {

      const consumed =
        await spendTrainerProgressionResource(
          trainer,
          TACTICAL_RESOURCE_ID,
          decision.spent
        );


      if (consumed) {

        spent =
          decision.spent;

      } else {

        ui.notifications.warn(
          getLanguage() ===
            "en"
            ? "There are not enough Tactical Points."
            : "No quedan suficientes Tactical Points."
        );
      }
    }
  }


  const resolution = {

    useBonus:
      spent > 0,

    trainerUuid:
      spent > 0
        ? trainer.uuid
        : null,

    pokemonUuid:
      opportunity
        .pokemon
        .uuid,

    spent
  };


  const replayConfig =
    buildDamageReplayConfig(
      config,
      resolution
    );


  try {

    const rolls =
      await opportunity
        .activity
        .rollDamage(
          replayConfig,
          dialog,
          message
        );


    /*
     * Si se gastaron puntos pero luego
     * se cancela el diálogo normal del
     * Healing Roll, los devolvemos.
     */

    if (
      spent > 0 &&
      (
        !Array.isArray(
          rolls
        ) ||
        !rolls.length
      )
    ) {

      await restoreTrainerProgressionResource(
        trainer,
        TACTICAL_RESOURCE_ID,
        spent
      );
    }

  } catch (error) {

    if (
      spent > 0 &&
      trainer
    ) {

      await restoreTrainerProgressionResource(
        trainer,
        TACTICAL_RESOURCE_ID,
        spent
      );
    }


    throw error;
  }
}


function requestTacticianHealingDecision({
  config,
  dialog,
  message,
  opportunity
}) {

  void rerollHealingAfterTacticianPrompt({
    config,
    dialog,
    message,
    opportunity
  }).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error aplicando Tactician`,
        error
      );


      ui.notifications.error(
        getLanguage() ===
          "en"
          ? "Tactician could not be applied."
          : "No se pudo aplicar Tactician."
      );
    }
  );
}

/* ============================================================
 * ROLL BONUS
 * ============================================================ */

function appendRollBonus(
  config,
  bonus
) {

  const current =
    String(
      config.bonus ??
      ""
    ).trim();


  config.bonus =
    current
      ? `(${current}) + ${bonus}`
      : String(
          bonus
        );
}


/* ============================================================
 * SKILL CHECK
 * ============================================================ */

function onPreRollSkill(
  config,
  dialog,
  message
) {

  if (
    isTrainerActor(
      config?.subject
    )
  ) {
    appendGeneralistBonus(config);
    return;
  }

  const pokemon =
    config?.subject;


  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  const researcherResolution =
    config?.[
      RESEARCHER_RESOLVED_KEY
    ];


  /*
   * Primera entrada:
   *
   * si el Pokémon pertenece a un
   * Researcher con usos disponibles,
   * detenemos ESTA tirada antes de
   * evaluarla y pedimos la decisión.
   *
   * D&D5e permite cancelar preRoll
   * retornando false.
   */

  if (
    !researcherResolution
  ) {

    const researcherContext =
      getPokemonResearcherContext(
        pokemon
      );


    if (
      researcherContext
    ) {

      requestResearcherSkillDecision({
        pokemon,
        config,
        dialog,
        message,

        context:
          researcherContext
      });


      return false;
    }
  }


  /*
   * Researcher es opcional.
   */

  if (
    researcherResolution
      ?.useBonus &&
    researcherResolution
      .bonus >
      0
  ) {

    appendRollBonus(
      config,
      researcherResolution
        .bonus
    );
  }


  /*
   * Specialization sigue siendo
   * automático e independiente.
   */

  const specializationBonus =
    getPokemonSpecializationSkillBonus(
      pokemon
    );


  if (
    specializationBonus >
    0
  ) {

    appendRollBonus(
      config,
      specializationBonus
    );
  }

  appendGeneralistBonus(config);
}

function appendGeneralistBonus(config) {
  const bonus = getGeneralistSkillBonus(config?.subject, config?.skill);
  if (bonus > 0) {appendRollBonus(config, bonus);}
}

/* ============================================================
 * ACE TRAINER — ATTACK
 * ============================================================ */

function appendAttackRollBonus(
  config,
  bonus,
  key = "aceTrainerAttack"
) {

  if (
    !Array.isArray(
      config?.rolls
    )
  ) {

    return;
  }


  for (
    const rollConfig
    of config.rolls
  ) {

    rollConfig.parts ??=
      [];


    rollConfig.options ??=
      {};


    const moduleOptions =
      rollConfig.options[
        MODULE_ID
      ] ??=
        {};


    /*
     * Evita aplicar dos veces el mismo
     * modificador si el proceso llegara
     * a reconstruirse.
     */
    if (
      moduleOptions[
        key
      ]
    ) {

      continue;
    }


    rollConfig.parts.push(
      String(
        bonus
      )
    );


    moduleOptions[
      key
    ] = {
      bonus
    };
  }
}


function onPreRollAttack(
  config
) {

  const pokemon =
    pokemonFromActivityConfig(
      config
    );


  if (!pokemon) {

    return;
  }


  const drawingPower = getPokemonDrawingPowerBonus(pokemon);
  if (drawingPower > 0) {appendAttackRollBonus(config, drawingPower, "drawingPowerAttack");}

  const bonus =
    getPokemonAceTrainerBonus(
      pokemon
    );


  if (
    bonus <= 0
  ) {

    return;
  }


  appendAttackRollBonus(
    config,
    bonus
  );
}

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


function applyTrainerDamageBonus(
  rolls,
  {
    bonus,
    key
  }
) {

  if (
    bonus <= 0
  ) {

    return;
  }


  const index =
    rolls.findIndex(
      roll => {

        const formula =
          String(
            roll?.formula ??
            ""
          ).trim();


        return (
          formula &&
          formula !== "0" &&
          !roll.options?.[
            MODULE_ID
          ]?.[key]
        );
      }
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

    [key]: {
      bonus
    }
  };


  const RollClass =
    roll.constructor;


  rolls.splice(
    index,
    1,
    new RollClass(
      `${roll.formula} + ${bonus}`,
      roll.data,
      options
    )
  );
}

function onPreRollDamage(
  config,
  dialog,
  message
) {

  /*
   * Segunda entrada después de nuestra
   * propia repetición controlada.
   */

  if (
    config?.[
      TACTICIAN_RESOLVED_KEY
    ]
  ) {

    return;
  }


  const opportunity =
    getTacticianOpportunity(
      config
    );


  if (!opportunity) {

    return;
  }


  requestTacticianHealingDecision({
    config,
    dialog,
    message,
    opportunity
  });


  /*
   * Cancelamos solamente la primera ejecución.
   * Después del diálogo reconstruimos el mismo
   * Damage/Healing Roll mediante Activity.rollDamage().
   */

  return false;
}

function onPostRollConfiguration(
  rolls,
  config
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


  /* ==========================================================
   * TACTICIAN
   *
   * Puede modificar healing de Items o Moves,
   * por eso se procesa ANTES de exigir kind=move.
   * ========================================================== */

  applyTacticianHealingBonus(
    rolls,
    config?.[
      TACTICIAN_RESOLVED_KEY
    ]
  );


  /* ==========================================================
   * FEATURES EXCLUSIVAS DE MOVES
   * ========================================================== */

  const moveItem =
    moveItemFromActivityConfig(
      config
    );


  if (!moveItem) {

    return;
  }


  const pokemon =
    moveItem.actor;


  if (
    !isPokemonActor(
      pokemon
    )
  ) {

    return;
  }


  const aceTrainerBonus =
    getPokemonAceTrainerBonus(
      pokemon
    );


  applyTrainerDamageBonus(
    rolls,
    {
      bonus:
        aceTrainerBonus,

      key:
        "aceTrainer"
    }
  );


  const typeMasterBonus =
    getPokemonTypeMasterStabBonus(
      pokemon,
      moveItem
    );


  applyTrainerDamageBonus(
    rolls,
    {
      bonus:
        typeMasterBonus,

      key:
        "typeMasterStab"
    }
  );
}

/* ============================================================
 * GRUNT — ATTACK RESULT
 * ============================================================ */

async function resolveSabotage(
  rolls
) {

  if (
    !Array.isArray(
      rolls
    ) ||
    rolls.length !==
      1
  ) {

    return;
  }


  const roll =
    rolls[0];


  const opportunity =
    getSabotageOpportunity(
      roll
    );


  if (!opportunity) {

    return;
  }


  const spent =
    await promptSabotage(
      opportunity
    );


  if (!spent) {

    return;
  }


  const consumed =
    await spendTrainerProgressionResource(
      opportunity.trainer,
      SHADOW_RESOURCE_ID,
      spent
    );


  if (!consumed) {

    ui.notifications.warn(
      getLanguage() ===
        "en"
        ? "There are not enough Shadow Points."
        : "No quedan suficientes Shadow Points."
    );

    return;
  }


  try {

    const effectiveTotal =
      await applySabotageToAttackRoll(
        roll,
        opportunity,
        spent
      );


    await createSabotageMessage(
      opportunity,
      spent,
      effectiveTotal
    );

  } catch (error) {

    /*
     * Si no logramos aplicar el efecto,
     * devolvemos los Shadow Points.
     */

    await restoreTrainerProgressionResource(
      opportunity.trainer,
      SHADOW_RESOURCE_ID,
      spent
    );


    throw error;
  }
}


function onRollAttack(
  rolls
) {

  void resolveSabotage(
    rolls
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error aplicando Sabotage`,
        error
      );


      ui.notifications.error(
        getLanguage() ===
          "en"
          ? "Sabotage could not be applied."
          : "No se pudo aplicar Sabotage."
      );
    }
  );
}

/* ============================================================
 * TRAINER REST
 * ============================================================ */

function onTrainerRestCompleted(
  actor,
  result,
  config
) {

  if (
    !isTrainerActor(
      actor
    )
  ) {

    return;
  }


  const longRest =
    result?.longRest ===
      true ||
    config?.type ===
      "long";


  if (
    !longRest
  ) {

    return;
  }


  void resetTrainerLongRestResources(
    actor
  ).catch(
    error => {

      console.error(
        `[${MODULE_ID}] Error restaurando recursos de Trainer`,
        error
      );
    }
  );
}

/* ============================================================
 * REGISTER
 * ============================================================ */

export function registerTrainerFeatureEngine() {

  Hooks.on(
    "dnd5e.preRollSkill",
    onPreRollSkill
  );


  Hooks.on(
    "dnd5e.preRollAttack",
    onPreRollAttack
  );


  Hooks.on(
    "dnd5e.rollAttack",
    onRollAttack
  );


  Hooks.on(
    "dnd5e.preRollDamage",
    onPreRollDamage
  );


  Hooks.on(
    "dnd5e.postRollConfiguration",
    onPostRollConfiguration
  );


  Hooks.on(
    "dnd5e.restCompleted",
    onTrainerRestCompleted
  );
}