import { trainerFeatureIcon } from "./trainer-feature-icons.mjs";
import {
  TRAINER_SKILLS,
  getTrainerOrigin,
  getTrainerPath,
  getTrainerProgressionLimits,
  getTrainerSpecialization
} from "./trainer-rules.mjs";


const MODULE_ID =
  "poke5e-local";

const FEATURE_KIND =
  "trainer-feature";

const DEFAULT_FEATURE_ICON =
  "icons/svg/book.svg";


const ABILITY_LABELS =
  Object.freeze({
    str: "STR",
    dex: "DEX",
    con: "CON",
    int: "INT",
    wis: "WIS",
    cha: "CHA"
  });


const PATH_DESCRIPTIONS =
  Object.freeze({

    "ace-trainer": {
      es:
        "Todos tus Pokémon obtienen +1 a sus tiradas de ataque y daño.",
      en:
        "All of your Pokémon gain +1 to attack and damage rolls."
    },

    hobbyist: {
      es:
        "Obtienes una Specialization adicional diferente y dos nuevas proficiencias en Skills.",
      en:
        "Gain one additional different Specialization and two new Skill proficiencies."
    },

    "poke-mentor": {
      es:
        "Tus TMs pueden utilizarse dos veces antes de romperse.",
      en:
        "Your TMs may be used twice before breaking."
    },

    researcher: {
      es:
        "Puedes añadir tu modificador de INT, mínimo 1, a un Skill Check de uno de tus Pokémon. Usos iguales a tu PB por descanso largo.",
      en:
        "You may add your INT modifier, minimum 1, to one of your Pokémon's Skill Checks. Uses equal to PB per long rest."
    },

    "pokemon-collector": {
      es:
        "Obtienes Expertise en Animal Handling.",
      en:
        "You gain Expertise in Animal Handling."
    },

    nurse: {
      es:
        "Obtienes proficiency en Medicine. Cuando un Item o Ability sana a un Pokémon, recupera HP adicional igual a tu modificador de WIS, mínimo 1.",
      en:
        "Gain proficiency in Medicine. When an Item or Ability heals a Pokémon, it regains additional HP equal to your WIS modifier, minimum 1."
    },

    "type-master": {
      es:
        "El STAB de tus Pokémon que coincidan con uno de tus tipos especializados aumenta en +1. Un Pokémon dual especializado en ambos tipos recibe +2.",
      en:
        "STAB increases by +1 for Pokémon matching one of your specialized types. A dual-type Pokémon matching both gains +2."
    },

    commander: {
      es:
        "Path dependiente del suplemento Bonds.",
      en:
        "This Path requires the Bonds supplement."
    },

    grunt: {
      es:
        "Obtienes Shadow Points iguales a tu nivel. Sabotage permite gastarlos como reacción para reducir una tirada de ataque que impactaría a uno de tus Pokémon, si la reducción provoca que falle.",
      en:
        "Gain Shadow Points equal to your level. Sabotage lets you spend them as a reaction to reduce an attack roll hitting one of your Pokémon if doing so causes it to miss."
    },

    tactician: {
      es:
        "Obtienes Tactical Points iguales a tu nivel. Cuando un Pokémon recupera HP mediante un Item o Move, puedes gastar puntos para aumentar la curación en 1d4 por punto.",
      en:
        "Gain Tactical Points equal to your level. When a Pokémon regains HP from an Item or Move, you may spend points to increase healing by 1d4 per point."
    },

    ranger: {
      es:
        "Obtienes proficiency en Nature y Survival. Tu velocidad caminando aumenta en 10 ft y obtienes climb y swim iguales a la mitad de tu walk.",
      en:
        "Gain proficiency in Nature and Survival. Walking speed increases by 10 ft, and climb and swim speeds equal half your walk speed."
    },

    guru: {
      es:
        "Tu Max SR aumenta permanentemente en +1.",
      en:
        "Your Max SR permanently increases by +1."
    },

    "pokemon-breeder": {
      es:
        "Path dependiente del suplemento Breeding.",
      en:
        "This Path requires the Breeding supplement."
    }
  });

const PATH_LEVEL_5_FEATURES =
  Object.freeze({

    "ace-trainer": {
      id:
        "battle-master",

      name:
        "Battle Master",

      description: {
        es:
          "Obtienes una cantidad de Battle Dice (d6) igual a 1 + tu modificador de DEX, con un mínimo de 1. Puedes asignar uno de estos dados a uno de tus Pokémon para añadirlo a una tirada de ataque o daño después de conocer el resultado inicial. Recuperas todos los Battle Dice tras un descanso largo.",

        en:
          "Gain a number of Battle Dice (d6) equal to 1 + your DEX modifier, minimum 1. You may assign one to one of your Pokémon and add it to an attack or damage roll after seeing the initial result. You replenish all Battle Dice after a long rest."
      }
    },

    hobbyist: {
      id:
        "versatile",

      name:
        "Versatile",

      description: {
        es:
          "Obtienes una cantidad de Skill Dice (d6) igual a 1 + tu modificador de WIS, con un mínimo de 1. Puedes asignar uno de estos dados a uno de tus Pokémon para añadirlo a un Skill Check o Saving Throw después de conocer el resultado inicial. Recuperas todos los Skill Dice tras un descanso largo.",

        en:
          "Gain a number of Skill Dice (d6) equal to 1 + your WIS modifier, minimum 1. You may assign one to one of your Pokémon and add it to a Skill Check or Saving Throw after seeing the initial result. You replenish all Skill Dice after a long rest."
      }
    },

    "poke-mentor": {
      id:
        "retention",

      name:
        "Retention",

      description: {
        es:
          "El feat Extra Move cuesta 1 punto de ASI en vez de 2 en los niveles correspondientes de ASI. Si alguno de tus Pokémon ya posee este feat al obtener Retention, puede ganar 1 punto de ASI.",

        en:
          "The Extra Move feat costs 1 ASI point instead of 2 at applicable ASI levels. If one of your Pokémon already has this feat when you gain Retention, it may gain 1 ASI point."
      }
    },

    researcher: {
      id:
        "analyst",

      name:
        "Analyst",

      description: {
        es:
          "Como acción, puedes realizar un Investigation Check enfrentado al Deception Check de un Pokémon. Si tienes éxito, descubres su Ability y el nombre de uno de sus Moves elegido al azar.",

        en:
          "As an action, make an Investigation Check contested by a Pokémon's Deception Check. On a success, you learn that Pokémon's Ability and the name of one random Move it knows."
      }
    },

    "pokemon-collector": {
      id:
        "gotta-catch-em-all",

      name:
        "Gotta Catch 'Em All",

      description: {
        es:
          "Una vez por descanso largo, puedes realizar un Animal Handling Check con ventaja para capturar un Pokémon incluso si el objetivo no está sufriendo un estado negativo.",

        en:
          "Once per long rest, you may make an Animal Handling Check with advantage when capturing a Pokémon even if the target is not suffering from a negative status effect."
      }
    },

    nurse: {
      id:
        "pokechef",

      name:
        "Pokéchef",

      description: {
        es:
          "Preparas un Treat que recupera 2d4 + 2 HP. Puedes entregarlo a una criatura adyacente como Bonus Action; otras criaturas pueden administrarlo como Action. Puedes usar esta feature una cantidad de veces igual a tu PB por descanso largo.",

        en:
          "Prepare a Treat that restores 2d4 + 2 HP. You may give it to an adjacent creature as a Bonus Action; other creatures may administer it as an Action. You may use this feature a number of times equal to your PB per long rest."
      }
    },

    "type-master": {
      id:
        "drawing-power",

      name:
        "Drawing Power",

      description: {
        es:
          "Los Pokémon que coincidan con uno de tus tipos especializados obtienen +2 a sus tiradas de ataque.",

        en:
          "Pokémon matching one of your specialized types gain +2 to their attack rolls."
      }
    },

    grunt: {
      id:
        "dark-advantage",

      name:
        "Dark Advantage",

      description: {
        es:
          "Puedes gastar 3 Shadow Points para obtener ventaja en un Skill Check, Attack Roll o Saving Throw realizado por ti o por uno de tus Pokémon.",

        en:
          "You may spend 3 Shadow Points to gain advantage on a Skill Check, Attack Roll, or Saving Throw made by you or one of your Pokémon."
      }
    },

    tactician: {
      id:
        "directed-strike",

      name:
        "Directed Strike",

      description: {
        es:
          "Puedes gastar 2 Tactical Points para tirar dos veces el daño de un ataque y utilizar el resultado mayor.",

        en:
          "You may spend 2 Tactical Points to roll an attack's damage twice and use the higher result."
      }
    },

    ranger: {
      id:
        "capture-styler",

      name:
        "Capture Styler",

      description: {
        es:
          "Si recorres completamente el perímetro de un Pokémon formando una figura cerrada con tu movimiento, obtienes +10 a la tirada para capturarlo.",

        en:
          "If you move completely around a Pokémon and form a closed shape with the path you traveled, you gain +10 to the roll to capture that Pokémon."
      }
    },

    guru: {
      id:
        "mind",

      name:
        "Mind",

      description: {
        es:
          "Todos tus Pokémon obtienen proficiency en Wisdom Saving Throws. Además, cuando uno de tus Pokémon esté Confused y deba tirar en la tabla de confusión, tira dos veces y utiliza el resultado mayor.",

        en:
          "All of your Pokémon gain proficiency in Wisdom Saving Throws. Additionally, when one of your Pokémon is Confused and rolls on the confusion table, roll twice and use the higher result."
      }
    }
  });

  const PATH_LEVEL_9_FEATURES =
    Object.freeze({

      "ace-trainer": {
        id:
          "tactical-mastery",

        name:
          "Tactical Mastery",

        description: {
          es:
            "Todos tus Pokémon aumentan en +1 el mismo Ability Score elegido al obtener esta feature. Además, tus Battle Dice pasan de d6 a d8.",

          en:
            "All of your Pokémon increase the same chosen Ability Score by +1. Additionally, your Battle Dice increase from d6 to d8."
        }
      },

      hobbyist: {
        id:
          "generalist",

        name:
          "Generalist",

        description: {
          es:
            "Puedes añadir la mitad de tu PB, redondeado hacia abajo, a Ability Checks que utilicen Skills en las que no seas proficient y que no utilicen ya tu PB. Tus Pokémon obtienen el mismo beneficio. Además, tus Skill Dice pasan a d8.",

          en:
            "You may add half your PB, rounded down, to ability checks using skills in which you lack proficiency and which do not already use your PB. Your Pokémon gain the same benefit. Your Skill Dice also increase to d8."
        }
      },

      "poke-mentor": {
        id:
          "cheerleader",

        name:
          "Cheerleader",

        description: {
          es:
            "Una vez por descanso corto, como Bonus Action puedes inspirar a todos los Pokémon aliados. Hasta tu siguiente turno, añade tu modificador de CHA, mínimo 1, a sus Attack Rolls, Damage Rolls o AC; eliges uno de esos tres beneficios al activar la feature.",

          en:
            "Once per short rest, as a Bonus Action you may inspire all allied Pokémon. Until your next turn, add your CHA modifier, minimum 1, to their Attack Rolls, Damage Rolls, or AC; choose one when activating the feature."
        }
      },

      researcher: {
        id:
          "evolution-expert",

        name:
          "Evolution Expert",

        description: {
          es:
            "Cuando uno de tus Pokémon evoluciona, puedes utilizar dos de sus Evolution Points para adquirir un feat.",

          en:
            "When one of your Pokémon evolves, you may use two of its Evolution Points to acquire a feat."
        }
      },

      "pokemon-collector": {
        id:
          "disciplined-strikes",

        name:
          "Disciplined Strikes",

        description: {
          es:
            "Cuando uno de tus Pokémon inflige suficiente daño para debilitar a otro Pokémon, puedes elegir dejar al objetivo con 1 HP en vez de reducirlo a 0 HP.",

          en:
            "When one of your Pokémon deals enough damage to faint another Pokémon, you may choose to leave the target at 1 HP instead."
        }
      },

      nurse: {
        id:
          "field-medic",

        name:
          "Field Medic",

        description: {
          es:
            "Como Action, puedes realizar un Medicine Check DC 12 para eliminar de un Pokémon adyacente una condición de estado no volátil. Además, Pokéchef pasa a sanar 3d10 + 6 HP.",

          en:
            "As an Action, make a DC 12 Medicine Check to remove a non-volatile status condition from an adjacent Pokémon. Additionally, Pokéchef now restores 3d10 + 6 HP."
        }
      },

      "type-master": {
        id:
          "storing-power",

        name:
          "Storing Power",

        description: {
          es:
            "Todos tus Pokémon llevados cuyos tipos coincidan con tus Specializations obtienen resistencia permanente al tipo especializado elegido al adquirir esta feature. Si anteriormente eran vulnerables a ese tipo, pasan a recibir daño normal.",

          en:
            "All carried Pokémon matching one of your specialized types gain permanent resistance to the specialized type chosen when gaining this feature. Pokémon previously vulnerable to that type instead take normal damage."
        }
      },

      grunt: {
        id:
          "sinister-dodge",

        name:
          "Sinister Dodge",

        description: {
          es:
            "Como Reaction, puedes gastar 4 Shadow Points para aumentar en un nivel la resistencia de uno de tus Pokémon contra un Move que le inflija daño: Vulnerable → Neutral, Neutral → Resistant o Resistant → Immune.",

          en:
            "As a Reaction, spend 4 Shadow Points to increase one of your Pokémon's resistance by one step against a damaging Move: Vulnerable → Neutral, Neutral → Resistant, or Resistant → Immune."
        }
      },

      tactician: {
        id:
          "raise-your-defenses",

        name:
          "Raise Your Defenses",

        description: {
          es:
            "Como Reaction, puedes gastar hasta 5 Tactical Points para aumentar el AC o una Saving Throw de uno de tus Pokémon, siempre que el aumento provoque que el ataque falle o que la salvación tenga éxito.",

          en:
            "As a Reaction, spend up to 5 Tactical Points to increase one of your Pokémon's AC or Saving Throw, provided the increase causes the attack to miss or the save to succeed."
        }
      },

      ranger: {
        id:
          "partners",

        name:
          "Partners",

        description: {
          es:
            "Después de cada descanso largo, puedes elegir uno de tus Pokémon como Partner hasta el siguiente descanso largo. Ese Pokémon añade tu modificador de WIS a sus Skill Checks y a sus Attack Rolls contra Pokémon salvajes.",

          en:
            "After each long rest, choose one of your Pokémon as your Partner until your next long rest. That Pokémon adds your WIS modifier to its Skill Checks and Attack Rolls against wild Pokémon."
        }
      },

      guru: {
        id:
          "body",

        name:
          "Body",

        description: {
          es:
            "Todos tus Pokémon pueden tener acceso simultáneamente a dos de sus Abilities, si disponen de dos. Además, el feat Tireless cuesta 1 punto de ASI en vez de 2 en los niveles correspondientes.",

          en:
            "All of your Pokémon may simultaneously access two of their Abilities, when two are available. Additionally, the Tireless feat costs 1 ASI point instead of 2 at applicable ASI levels."
        }
      }
    });

  const PATH_LEVEL_15_FEATURES =
    Object.freeze({

      "ace-trainer": {
        id:
          "rapid-switching",

        name:
          "Rapid Switching",

        description: {
          es:
            "Al entrar mediante un Switch, tus Pokémon pueden realizar una Action o moverse, pero no ambas cosas. No pueden usar Bonus Action ni Reaction ese turno. Tus Battle Dice pasan a d10.",

          en:
            "After switching in, your Pokémon may take one Action or move, but not both. They cannot use a Bonus Action or Reaction that turn. Your Battle Dice become d10s."
        }
      },

      hobbyist: {
        id:
          "multitalented",

        name:
          "Multitalented",

        description: {
          es:
            "Cada uno de tus Pokémon puede obtener proficiency en una Skill adicional de tu elección. Puedes elegir una Skill diferente para cada Pokémon. Tus Skill Dice pasan a d10.",

          en:
            "Each of your Pokémon may gain proficiency in one additional Skill of your choice. You may choose a different Skill for each Pokémon. Your Skill Dice become d10s."
        }
      },

      "poke-mentor": {
        id:
          "master-teacher",

        name:
          "Master Teacher",

        description: {
          es:
            "Tus Pokémon pueden aprender y olvidar Moves durante cada descanso largo en vez de hacerlo solamente al subir de nivel.",

          en:
            "Your Pokémon may learn and forget Moves during each long rest instead of only when leveling up."
        }
      },

      researcher: {
        id:
          "professor",

        name:
          "Professor",

        description: {
          es:
            "Analyst puede utilizarse como Bonus Action y revela una Ability o Move adicional del Pokémon analizado.",

          en:
            "Analyst may be used as a Bonus Action and reveals one additional Ability or Move from the analyzed Pokémon."
        }
      },

      "pokemon-collector": {
        id:
          "expert-tracker",

        name:
          "Expert Tracker",

        description: {
          es:
            "Pokémon Tracker puede utilizarse dos veces por descanso largo. Al usarlo, un Investigation o Nature Check DC 11 exitoso permite encontrar un Pokémon específico de la lista local.",

          en:
            "Pokémon Tracker may be used twice per long rest. A successful DC 11 Investigation or Nature Check lets you encounter a specific Pokémon from the local list."
        }
      },

      nurse: {
        id:
          "tip-top-shape",

        name:
          "Tip-top Shape",

        description: {
          es:
            "Tus Pokémon tienen ventaja en Saving Throws contra adquirir condiciones negativas. Además, Pokéchef pasa a sanar 4d12 + 10 HP.",

          en:
            "Your Pokémon have advantage on Saving Throws against gaining negative conditions. Pokéchef now restores 4d12 + 10 HP."
        }
      },

      "type-master": {
        id:
          "releasing-power",

        name:
          "Releasing Power",

        description: {
          es:
            "Los Pokémon que coincidan con tus tipos especializados pueden aplicar su STAB a cualquier Move dañino que elijan, incluso si el Move es de otro tipo.",

          en:
            "Pokémon matching your specialized types may apply their STAB to any damaging Move they choose, even when that Move has another type."
        }
      },

      grunt: {
        id:
          "nefarious-stagger",

        name:
          "Nefarious Stagger",

        description: {
          es:
            "Cuando uno de tus Pokémon provoca Flinched, puedes gastar 2 Shadow Points para provocar Stunned en su lugar.",

          en:
            "When one of your Pokémon inflicts Flinched, you may spend 2 Shadow Points to inflict Stunned instead."
        }
      },

      tactician: {
        id:
          "not-this-time",

        name:
          "Not This Time",

        description: {
          es:
            "Después de una Saving Throw enemiga contra un Move de tu Pokémon, puedes gastar hasta 5 Tactical Points para aumentar la DC si eso convierte el resultado en fallo.",

          en:
            "After an opponent makes a Saving Throw against your Pokémon's Move, spend up to 5 Tactical Points to increase the DC if that turns the result into a failure."
        }
      },

      ranger: {
        id:
          "poke-assist",

        name:
          "Poké Assist",

        description: {
          es:
            "Moves que coincidan con un tipo de tu Partner Pokémon realizan su Attack Roll con ventaja. También tienes ventaja al capturar Pokémon que compartan tipo con tu Partner.",

          en:
            "Moves matching one of your Partner Pokémon's types make their Attack Roll with advantage. You also have advantage when capturing Pokémon sharing a type with your Partner."
        }
      },

      guru: {
        id:
          "spirit",

        name:
          "Spirit",

        description: {
          es:
            "Al inicio de tu turno puedes añadir tu modificador de WIS a todos los Attack Rolls o Damage Rolls de tus Pokémon hasta tu siguiente turno. Usos: 1 + WIS, mínimo 1, por descanso largo.",

          en:
            "At the start of your turn, add your WIS modifier to all Pokémon Attack Rolls or Damage Rolls until your next turn. Uses equal 1 + WIS, minimum 1, per long rest."
        }
      }
    });

function getLanguage() {

  return game.settings.get(
    MODULE_ID,
    "language"
  ) === "en"
    ? "en"
    : "es";
}


function escapeHtml(
  value
) {

  const text =
    String(
      value ??
      ""
    );


  if (
    globalThis
      .foundry
      ?.utils
      ?.escapeHTML
  ) {

    return foundry.utils
      .escapeHTML(
        text
      );
  }


  return text
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


function paragraphs(
  lines
) {

  return lines
    .filter(Boolean)
    .map(
      line =>
        `<p>${escapeHtml(line)}</p>`
    )
    .join("");
}


function skillName(
  id,
  language
) {

  return (
    TRAINER_SKILLS[id]
      ?.[language] ??
    id
  );
}


function abilityName(
  id
) {

  return (
    ABILITY_LABELS[id] ??
    String(
      id
    ).toUpperCase()
  );
}


function formatAbilityBonuses(
  bonuses
) {

  return Object.entries(
    bonuses ??
    {}
  )
    .map(
      ([id, value]) =>
        `${abilityName(id)} +${value}`
    )
    .join(", ");
}


function originSpecificLines(
  origin,
  choices,
  language
) {

  const es =
    language === "es";


  if (
    origin.id ===
    "alolan"
  ) {

    return [
      es
        ? "Una vez por descanso largo puedes utilizar Speak with Pokémon."
        : "Once per long rest you may use Speak with Pokémon."
    ];
  }


  if (
    origin.id ===
    "galarian"
  ) {

    const abilities =
      choices
        .galarianPattern ===
        "dex2-str1"
        ? "DEX +2, STR +1"
        : "STR +2, DEX +1";


    return [
      abilities,

      es
        ? "Como reacción al recibir daño, tira 1d12 + modificador de CON y reduce el daño por ese total. Se recupera tras descanso corto o largo."
        : "As a reaction when taking damage, roll 1d12 + CON modifier and reduce the damage by that total. Recharges on a short or long rest."
    ];
  }


  if (
    origin.id ===
    "hoennian"
  ) {

    const environment =
      String(
        choices
          .hoennEnvironment ??
        ""
      );


    const environments = {

      coast:
        es
          ? "Coast: swim speed igual a tu walk speed."
          : "Coast: swim speed equals your walk speed.",

      desert:
        es
          ? "Desert: no necesitas CON saves por efectos de clima cálido."
          : "Desert: you do not make CON saves against warm weather effects.",

      forest:
        es
          ? "Forest: puedes intentar ocultarte estando ligeramente obscurecido por follaje u otros fenómenos naturales."
          : "Forest: you may attempt to hide while lightly obscured by foliage or similar natural phenomena.",

      mountain:
        es
          ? "Mountain: obtienes climb speed de 10 ft."
          : "Mountain: gain a 10 ft climb speed."
    };


    return [
      environments[
        environment
      ] ??
      null
    ];
  }


  if (
    origin.id ===
    "johtoan"
  ) {

    return [
      es
        ? "Cuando consigues un crítico con un weapon attack, tira una vez adicional uno de los dados de daño del arma."
        : "When you score a critical hit with a weapon attack, roll one of the weapon's damage dice one additional time."
    ];
  }


  if (
    origin.id ===
    "kalosian"
  ) {

    return [
      es
        ? "Cuando el Trainer obtiene un 1 natural en attack roll, ability check o saving throw, vuelve a tirar el d20 y usa el nuevo resultado."
        : "When the Trainer rolls a natural 1 on an attack roll, ability check, or saving throw, reroll the d20 and use the new result."
    ];
  }


  if (
    origin.id ===
    "kantoan"
  ) {

    const selected =
      (
        choices
          .kantoAbilityIds ??
        []
      )
        .map(
          abilityName
        )
        .join(", ");


    const feat =
      String(
        choices
          .kantoFeatName ??
        ""
      ).trim();


    return [
      selected
        ? (
            es
              ? `Ability Scores elegidos: ${selected}.`
              : `Chosen Ability Scores: ${selected}.`
          )
        : null,

      feat
        ? (
            es
              ? `Feat elegido: ${feat}.`
              : `Chosen Feat: ${feat}.`
          )
        : null
    ];
  }


  if (
    origin.id ===
    "sinnoan"
  ) {

    return [
      es
        ? "Obtienes proficiency en Constitution Saving Throws."
        : "You gain proficiency in Constitution Saving Throws."
    ];
  }


  if (
    origin.id ===
    "unovan"
  ) {

    const selected =
      (
        choices
          .unovanExtraSkillIds ??
        []
      )
        .map(
          id =>
            skillName(
              id,
              language
            )
        )
        .join(", ");


    return [
      selected
        ? (
            es
              ? `Skills adicionales: ${selected}.`
              : `Additional Skills: ${selected}.`
          )
        : null
    ];
  }


  return [];
}


function originFeatureSource(
  progression,
  language
) {

  const origin =
    getTrainerOrigin(
      progression
        .origin
        ?.id
    );


  if (!origin) {

    return null;
  }


  const es =
    language === "es";


  const lines = [];


  const bonuses =
    formatAbilityBonuses(
      origin.abilityBonuses
    );


  if (bonuses) {

    lines.push(
      es
        ? `Ability Scores: ${bonuses}.`
        : `Ability Scores: ${bonuses}.`
    );
  }


  const skills =
    (
      origin
        .skillProficiencies ??
      []
    )
      .map(
        id =>
          skillName(
            id,
            language
          )
      )
      .join(", ");


  if (skills) {

    lines.push(
      es
        ? `Proficiency: ${skills}.`
        : `Proficiency: ${skills}.`
    );
  }


  lines.push(
    ...originSpecificLines(
      origin,
      progression
        .origin
        ?.choices ??
        {},
      language
    )
  );


  lines.push(
    es
      ? `Idiomas: Common y ${origin.regionalLanguage}.`
      : `Languages: Common and ${origin.regionalLanguage}.`
  );


  return buildFeatureSource({

    key:
      "origin",

    sourceId:
      origin.id,

    sourceKind:
      "origin",

    level:
      1,

    name:
      es
        ? `Origen — ${origin.name.es}`
        : `Origin — ${origin.name.en}`,

    description:
      paragraphs(
        lines
      )
  });
}

function specializationAcquisitionLevel(
  progression,
  index
) {

  if (
    index === 0
  ) {

    return 1;
  }


  if (
    progression
      .path
      ?.id ===
    "hobbyist"
  ) {

    if (
      index === 1
    ) {

      return 2;
    }


    if (
      index === 2
    ) {

      return 7;
    }


    return 18;
  }


  if (
    index === 1
  ) {

    return 7;
  }


  return 18;
}

function specializationFeatureSource(
  specializationId,
  index,
  acquisitionLevel,
  language
) {

  const specialization =
    getTrainerSpecialization(
      specializationId
    );


  if (!specialization) {

    return null;
  }


  const es =
    language === "es";

  const lines = [];


  if (
    specialization
      .trainerAbility
  ) {

    lines.push(
      es
        ? `El Trainer aumenta ${abilityName(
            specialization
              .trainerAbility
          )} en +1, hasta un máximo de 20.`
        : `The Trainer increases ${abilityName(
            specialization
              .trainerAbility
          )} by +1, to a maximum of 20.`
    );
  }


  if (
    specialization
      .trainerSkill
  ) {

    const skill =
      skillName(
        specialization
          .trainerSkill,
        language
      );


    lines.push(
      es
        ? `Obtienes proficiency en ${skill}; si ya eras proficient, obtienes Expertise.`
        : `Gain proficiency in ${skill}; if already proficient, gain Expertise.`
    );
  }


  lines.push(
    es
      ? `Tus Pokémon de tipo ${specialization.type} obtienen +1 a todos sus Skill Checks.`
      : `Your ${specialization.type}-type Pokémon gain +1 to all Skill Checks.`
  );


  return buildFeatureSource({

    key:
      `specialization:${index}`,

    sourceId:
      specialization.id,

    sourceKind:
      "specialization",

    level:
      acquisitionLevel,

    name:
      es
        ? `Especialización — ${specialization.name}`
        : `Specialization — ${specialization.name}`,

    description:
      paragraphs(
        lines
      )
  });
}


function pathFeatureSource(
  progression,
  language
) {

  const pathId =
    progression
      .path
      ?.id;


  if (!pathId) {

    return null;
  }


  const path =
    getTrainerPath(
      pathId
    );


  if (!path) {

    return null;
  }


  const description =
    PATH_DESCRIPTIONS[
      path.id
    ]?.[language] ??
    path.name;


  return buildFeatureSource({

    key:
      "path",

    sourceId:
      path.id,

    sourceKind:
      "path",

    level:
      2,

    name:
      language === "es"
        ? `Senda de Entrenador — ${path.name}`
        : `Trainer Path — ${path.name}`,

    description:
      paragraphs([
        description
      ])
  });
}

function pathLevel5FeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 5
  ) {

    return null;
  }


  const pathId =
    progression
      .path
      ?.id;


  if (!pathId) {

    return null;
  }


  const feature =
    PATH_LEVEL_5_FEATURES[
      pathId
    ];


  if (!feature) {

    return null;
  }


  return buildFeatureSource({

    key:
      "path-feature:5",

    sourceId:
      feature.id,

    sourceKind:
      "path-feature",

    level:
      5,

    name:
      feature.name,

    description:
      paragraphs([
        feature
          .description[
            language
          ] ??
        feature
          .description
          .en
      ])
  });
}

function pathLevel9FeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 9
  ) {

    return null;
  }


  const pathId =
    progression
      .path
      ?.id;


  if (!pathId) {

    return null;
  }


  const feature =
    PATH_LEVEL_9_FEATURES[
      pathId
    ];


  if (!feature) {

    return null;
  }


  const lines = [
    feature
      .description[
        language
      ] ??
    feature
      .description
      .en
  ];


  if (
    pathId ===
    "ace-trainer"
  ) {

    const abilityId =
      progression
        .path
        ?.choices
        ?.tacticalMasteryAbilityId;


    if (abilityId) {

      lines.push(
        language === "es"
          ? `Ability Score elegido: ${abilityName(abilityId)}.`
          : `Chosen Ability Score: ${abilityName(abilityId)}.`
      );
    }
  }


  if (
    pathId ===
    "type-master"
  ) {

    const resistanceType =
      progression
        .path
        ?.choices
        ?.storingPowerResistanceType;


    if (resistanceType) {

      const displayType =
        String(
          resistanceType
        )
          .charAt(0)
          .toUpperCase() +
        String(
          resistanceType
        ).slice(1);


      lines.push(
        language === "es"
          ? `Tipo de resistencia elegido: ${displayType}.`
          : `Chosen resistance type: ${displayType}.`
      );
    }
  }


  return buildFeatureSource({

    key:
      "path-feature:9",

    sourceId:
      feature.id,

    sourceKind:
      "path-feature",

    level:
      9,

    name:
      feature.name,

    description:
      paragraphs(
        lines
      )
  });
}

function pathLevel15FeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 15
  ) {

    return null;
  }


  const pathId =
    progression
      .path
      ?.id;


  if (!pathId) {

    return null;
  }


  const feature =
    PATH_LEVEL_15_FEATURES[
      pathId
    ];


  if (!feature) {

    return null;
  }


  return buildFeatureSource({

    key:
      "path-feature:15",

    sourceId:
      feature.id,

    sourceKind:
      "path-feature",

    level:
      15,

    name:
      feature.name,

    description:
      paragraphs([
        feature
          .description[
            language
          ] ??
        feature
          .description
          .en
      ])
  });
}

function controlUpgradeFeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 3
  ) {

    return null;
  }


  const limits =
    getTrainerProgressionLimits({

      level,

      pathId:
        progression
          .path
          ?.id ??
        null
    });


  return buildFeatureSource({

    key:
      "control-upgrade",

    sourceId:
      "control-upgrade",

    sourceKind:
      "class-feature",

    level:
      3,

    name:
      language === "es"
        ? "Mejora de Control"
        : "Control Upgrade",

    description:
      paragraphs([
        language === "es"
          ? `Puedes controlar Pokémon de hasta SR ${limits.maxSr}.`
          : `You can control Pokémon up to SR ${limits.maxSr}.`
      ])
  });
}

function trainersResolveFeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 10
  ) {

    return null;
  }


  const saveId =
    progression
      ?.trainerResolveSaveId ??
    null;


  const lines = [
    language === "es"
      ? "Eres inmune a la condición Frightened."
      : "You are immune to the Frightened condition."
  ];


  if (saveId) {

    lines.push(
      language === "es"
        ? `Obtienes proficiency adicional en ${abilityName(saveId)} Saving Throws.`
        : `You gain additional proficiency in ${abilityName(saveId)} Saving Throws.`
    );
  }


  return buildFeatureSource({

    key:
      "trainers-resolve",

    sourceId:
      "trainers-resolve",

    sourceKind:
      "class-feature",

    level:
      10,

    name:
      "Trainer's Resolve",

    description:
      paragraphs(
        lines
      )
  });
}

function pokemonTrackerFeatureSource(
  level,
  language
) {

  if (
    level < 13
  ) {

    return null;
  }


  return buildFeatureSource({

    key:
      "pokemon-tracker",

    sourceId:
      "pokemon-tracker",

    sourceKind:
      "class-feature",

    level:
      13,

    name:
      "Pokémon Tracker",

    description:
      paragraphs([
        language === "es"
          ? "Una vez por descanso largo puedes buscar Pokémon en el área cercana y conocer la lista de Pokémon salvajes disponibles."
          : "Once per long rest, you may search the nearby area and learn the list of wild Pokémon that can be encountered.",

        language === "es"
          ? "Además, obtienes Expertise en Animal Handling."
          : "Additionally, you gain Expertise in Animal Handling."
      ])
  });
}

function epicBoonFeatureSource(
  progression,
  level,
  language
) {

  if (
    level < 19
  ) {

    return null;
  }


  const featName =
    String(
      progression
        ?.epicBoonFeatName ??
      ""
    ).trim();


  const lines = [

    language === "es"
      ? "Obtienes un Epic Boon feat u otro feat para el que cumplas los requisitos."
      : "You gain an Epic Boon feat or another feat for which you qualify."
  ];


  if (
    featName
  ) {

    lines.push(
      language === "es"
        ? `Feat elegido: ${featName}.`
        : `Chosen feat: ${featName}.`
    );
  }


  return buildFeatureSource({

    key:
      "epic-boon",

    sourceId:
      "epic-boon",

    sourceKind:
      "class-feature",

    level:
      19,

    name:
      "Epic Boon",

    description:
      paragraphs(
        lines
      )
  });
}

function masterTrainerFeatureSource(
  level,
  language
) {

  if (
    level < 20
  ) {

    return null;
  }


  return buildFeatureSource({

    key:
      "master-trainer",

    sourceId:
      "master-trainer",

    sourceKind:
      "class-feature",

    level:
      20,

    name:
      "Master Trainer",

    description:
      paragraphs([
        language === "es"
          ? "Cuando tú o uno de tus Pokémon falle una Saving Throw, puedes elegir que tenga éxito en su lugar."
          : "When you or one of your Pokémon fails a Saving Throw, you may choose to succeed instead.",

        language === "es"
          ? "Puedes utilizar esta feature 2 veces por descanso largo."
          : "You may use this feature twice per long rest."
      ])
  });
}

function buildFeatureSource({
  key,
  sourceId,
  sourceKind,
  level,
  name,
  description
}) {

  const identifier =
    `poke5e-trainer-${key}`
      .replace(
        /[^a-z0-9-]/gi,
        "-"
      )
      .toLowerCase();


  return {

    name,

    type:
      "feat",
    img:
      trainerFeatureIcon(
        sourceId,
        key
      ) ??
      DEFAULT_FEATURE_ICON,

    system: {

      description: {
        value:
          description,

        chat:
          ""
      },

      identifier,

      source: {
        custom:
          "Poke5e"
      },

      type: {
        value:
          "class",

        subtype:
          ""
      },

      requirements:
        null,

      properties:
        [],

      activities:
        {},

      uses: {
        spent:
          0,

        max:
          "",

        recovery:
          []
      }
    },

    flags: {

      [MODULE_ID]: {

        managed:
          true,

        kind:
          FEATURE_KIND,

        featureKey:
          key,

        sourceId,

        sourceKind,

        level
      }
    }
  };
}


function desiredFeatureSources(
  progression,
  level
) {

  const language =
    getLanguage();

  const desired = [];


  const origin =
    originFeatureSource(
      progression,
      language
    );


  if (origin) {

    desired.push(
      origin
    );
  }


  progression
    .specializationIds
    ?.forEach(
      (
        specializationId,
        index
      ) => {

        const feature =
          specializationFeatureSource(
            specializationId,
            index,
            specializationAcquisitionLevel(
              progression,
              index
            ),
            language
          );


        if (feature) {

          desired.push(
            feature
          );
        }
      }
    );


  const path =
    pathFeatureSource(
      progression,
      language
    );


  if (path) {

    desired.push(
      path
    );
  }


  const pathLevel5 =
    pathLevel5FeatureSource(
      progression,
      level,
      language
    );


  if (pathLevel5) {

    desired.push(
      pathLevel5
    );
  }

  const pathLevel9 =
    pathLevel9FeatureSource(
      progression,
      level,
      language
    );


  if (pathLevel9) {

    desired.push(
      pathLevel9
    );
  }


  const pathLevel15 =
    pathLevel15FeatureSource(
      progression,
      level,
      language
    );


  if (pathLevel15) {

    desired.push(
      pathLevel15
    );
  }

  const control =
    controlUpgradeFeatureSource(
      progression,
      level,
      language
    );


  if (control) {

    desired.push(
      control
    );
  }

  const trainersResolve =
    trainersResolveFeatureSource(
      progression,
      level,
      language
    );


  if (trainersResolve) {

    desired.push(
      trainersResolve
    );
  }


  const pokemonTracker =
    pokemonTrackerFeatureSource(
      level,
      language
    );


  if (pokemonTracker) {

    desired.push(
      pokemonTracker
    );
  }

  const epicBoon =
    epicBoonFeatureSource(
      progression,
      level,
      language
    );


  if (epicBoon) {

    desired.push(
      epicBoon
    );
  }


  const masterTrainer =
    masterTrainerFeatureSource(
      level,
      language
    );


  if (masterTrainer) {

    desired.push(
      masterTrainer
    );
  }

  return desired;
}


function managedTrainerFeatures(
  trainer
) {

  return trainer.items.filter(
    item =>
      item.getFlag(
        MODULE_ID,
        "kind"
      ) ===
        FEATURE_KIND
      &&
      item.getFlag(
        MODULE_ID,
        "managed"
      ) ===
        true
  );
}


export async function synchronizeTrainerFeatures(
  trainer,
  {
    progression,
    level
  }
) {

  const desired =
    desiredFeatureSources(
      progression,
      level
    );


  const existing =
    managedTrainerFeatures(
      trainer
    );


  const existingByKey =
    new Map(
      existing.map(
        item => [
          item.getFlag(
            MODULE_ID,
            "featureKey"
          ),
          item
        ]
      )
    );


  const desiredKeys =
    new Set();

  const createData = [];
  const updates = [];


  for (
    const source
    of desired
  ) {

    const key =
      source.flags[
        MODULE_ID
      ].featureKey;


    desiredKeys.add(
      key
    );


    const item =
      existingByKey.get(
        key
      );


    if (!item) {

      createData.push(
        source
      );

      continue;
    }


    updates.push({

      _id:
        item.id,
      name:
        source.name,
      // A custom icon chosen by the user is kept.
      img:
        item.img &&
        item.img !==
          DEFAULT_FEATURE_ICON
          ? item.img
          : source.img,

      system:
        source.system,

      flags:
        source.flags
    });
  }


  const deleteIds =
    existing
      .filter(
        item =>
          !desiredKeys.has(
            item.getFlag(
              MODULE_ID,
              "featureKey"
            )
          )
      )
      .map(
        item =>
          item.id
      );


  if (
    deleteIds.length
  ) {

    await trainer
      .deleteEmbeddedDocuments(
        "Item",
        deleteIds
      );
  }


  if (
    updates.length
  ) {

    await trainer
      .updateEmbeddedDocuments(
        "Item",
        updates
      );
  }


  if (
    createData.length
  ) {

    await trainer
      .createEmbeddedDocuments(
        "Item",
        createData
      );
  }


  return desired;
}


// Trainers created before feature icons existed swap the default book for their icon.
export async function refreshTrainerFeatureIcons(trainer) {
  const updates = trainer.items
    .filter(item => item.getFlag(MODULE_ID, "kind") === FEATURE_KIND && item.img === DEFAULT_FEATURE_ICON)
    .map(item => ({ _id: item.id, img: trainerFeatureIcon(item.getFlag(MODULE_ID, "sourceId"), item.getFlag(MODULE_ID, "featureKey")) }))
    .filter(update => update.img);
  if (updates.length) {await trainer.updateEmbeddedDocuments("Item", updates);}
}
