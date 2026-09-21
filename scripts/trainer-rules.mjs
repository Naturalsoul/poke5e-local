export const MAX_SUPPORTED_TRAINER_LEVEL =
  20;


const LEVEL_RULES =
  Object.freeze({

    1: {
      proficiencyBonus: 2,
      pokeslots: 3,
      maxSr: 2
    },

    2: {
      proficiencyBonus: 2,
      pokeslots: 3,
      maxSr: 2
    },

    3: {
      proficiencyBonus: 2,
      pokeslots: 3,
      maxSr: 5
    },

    4: {
      proficiencyBonus: 2,
      pokeslots: 3,
      maxSr: 5
    },

    5: {
      proficiencyBonus: 3,
      pokeslots: 4,
      maxSr: 5
    },

    6: {
      proficiencyBonus: 3,
      pokeslots: 4,
      maxSr: 8
    },

    7: {
      proficiencyBonus: 3,
      pokeslots: 4,
      maxSr: 8
    },

    8: {
      proficiencyBonus: 3,
      pokeslots: 4,
      maxSr: 10
    },

    9: {
      proficiencyBonus: 4,
      pokeslots: 4,
      maxSr: 10
    },

    10: {
      proficiencyBonus: 4,
      pokeslots: 5,
      maxSr: 10
    },

    11: {
      proficiencyBonus: 4,
      pokeslots: 5,
      maxSr: 12
    },

    12: {
      proficiencyBonus: 4,
      pokeslots: 5,
      maxSr: 12
    },

    13: {
      proficiencyBonus: 5,
      pokeslots: 5,
      maxSr: 12
    },

    14: {
      proficiencyBonus: 5,
      pokeslots: 5,
      maxSr: 14
    },

    15: {
      proficiencyBonus: 5,
      pokeslots: 6,
      maxSr: 14
    },

    16: {
      proficiencyBonus: 5,
      pokeslots: 6,
      maxSr: 14
    },

    17: {
      proficiencyBonus: 6,
      pokeslots: 6,
      maxSr: 15
    },

    18: {
      proficiencyBonus: 6,
      pokeslots: 6,
      maxSr: 15
    },

    19: {
      proficiencyBonus: 6,
      pokeslots: 6,
      maxSr: 15
    },

    20: {
      proficiencyBonus: 6,
      pokeslots: 6,
      maxSr: 15
    }
  });


export const TRAINER_SKILLS =
  Object.freeze({

    acr: {
      es: "Acrobacias",
      en: "Acrobatics"
    },

    ani: {
      es: "Trato con Animales",
      en: "Animal Handling"
    },

    arc: {
      es: "Arcana",
      en: "Arcana"
    },

    ath: {
      es: "Atletismo",
      en: "Athletics"
    },

    dec: {
      es: "Engaño",
      en: "Deception"
    },

    his: {
      es: "Historia",
      en: "History"
    },

    ins: {
      es: "Perspicacia",
      en: "Insight"
    },

    itm: {
      es: "Intimidación",
      en: "Intimidation"
    },

    inv: {
      es: "Investigación",
      en: "Investigation"
    },

    med: {
      es: "Medicina",
      en: "Medicine"
    },

    nat: {
      es: "Naturaleza",
      en: "Nature"
    },

    prc: {
      es: "Percepción",
      en: "Perception"
    },

    prf: {
      es: "Interpretación",
      en: "Performance"
    },

    per: {
      es: "Persuasión",
      en: "Persuasion"
    },

    rel: {
      es: "Religión",
      en: "Religion"
    },

    slt: {
      es: "Juego de Manos",
      en: "Sleight of Hand"
    },

    ste: {
      es: "Sigilo",
      en: "Stealth"
    },

    sur: {
      es: "Supervivencia",
      en: "Survival"
    }
  });


export const TRAINER_CLASS_SKILL_IDS =
  Object.freeze([
    "acr",
    "ath",
    "ins",
    "itm",
    "inv",
    "med",
    "nat",
    "prc",
    "prf",
    "per",
    "slt",
    "ste",
    "sur"
  ]);


export const TRAINER_ORIGINS =
  Object.freeze({

    alolan: {
      id: "alolan",
      name: {
        es: "Alolano",
        en: "Alolan"
      },

      abilityBonuses: {
        int: 2,
        cha: 1
      },

      skillProficiencies: [
        "nat"
      ],

      regionalLanguage:
        "Alolan",

      feature:
        "speak-with-pokemon"
    },


    galarian: {
      id: "galarian",
      name: {
        es: "Galariano",
        en: "Galarian"
      },

      abilityChoice:
        "galarian-physique",

      skillProficiencies: [
        "itm"
      ],

      regionalLanguage:
        "Galarian",

      feature:
        "galarian-damage-reduction"
    },


    hoennian: {
      id: "hoennian",
      name: {
        es: "Hoenniano",
        en: "Hoennian"
      },

      abilityBonuses: {
        wis: 2,
        int: 1
      },

      skillProficiencies: [
        "sur"
      ],

      regionalLanguage:
        "Hoennian",

      environmentChoice:
        true
    },


    johtoan: {
      id: "johtoan",
      name: {
        es: "Johtiano",
        en: "Johtoan"
      },

      abilityBonuses: {
        int: 2,
        str: 1
      },

      skillProficiencies: [
        "his"
      ],

      regionalLanguage:
        "Johtonese",

      feature:
        "practiced-strikes"
    },


    kalosian: {
      id: "kalosian",
      name: {
        es: "Kalosiano",
        en: "Kalosian"
      },

      abilityBonuses: {
        cha: 2,
        int: 1
      },

      skillProficiencies: [
        "per"
      ],

      regionalLanguage:
        "Kalosian",

      feature:
        "bon-chance"
    },


    kantoan: {
      id: "kantoan",
      name: {
        es: "Kantoniano",
        en: "Kantoan"
      },

      abilityChoice:
        "two-plus-one",

      skillProficiencies: [
        "inv"
      ],

      regionalLanguage:
        "Kantonese",

      featChoice:
        true
    },


    sinnoan: {
      id: "sinnoan",
      name: {
        es: "Sinnohiano",
        en: "Sinnoan"
      },

      abilityBonuses: {
        con: 2,
        str: 1
      },

      skillProficiencies: [
        "ath"
      ],

      savingThrowProficiencies: [
        "con"
      ],

      regionalLanguage:
        "Sinnoan"
    },


    unovan: {
      id: "unovan",
      name: {
        es: "Unovano",
        en: "Unovan"
      },

      abilityBonuses: {
        dex: 2,
        wis: 1
      },

      skillProficiencies: [
        "ins"
      ],

      extraSkillChoices:
        2,

      regionalLanguage:
        "Unovan"
    }
  });


export const TRAINER_SPECIALIZATIONS =
  Object.freeze({

    "poke-fan": {
      id: "poke-fan",
      type: "normal",
      name: "Poké Fan",
      trainerAbility: "cha"
    },

    "black-belt": {
      id: "black-belt",
      type: "fighting",
      name: "Black Belt",
      trainerSkill: "ath"
    },

    "bird-keeper": {
      id: "bird-keeper",
      type: "flying",
      name: "Bird Keeper",
      trainerSkill: "prc"
    },

    punk: {
      id: "punk",
      type: "poison",
      name: "Punk",
      trainerSkill: "slt"
    },

    camper: {
      id: "camper",
      type: "ground",
      name: "Camper",
      trainerSkill: "sur"
    },

    hiker: {
      id: "hiker",
      type: "rock",
      name: "Hiker",
      trainerAbility: "con"
    },

    "bug-maniac": {
      id: "bug-maniac",
      type: "bug",
      name: "Bug Maniac",
      trainerSkill: "nat"
    },

    mystic: {
      id: "mystic",
      type: "ghost",
      name: "Mystic",
      trainerSkill: "rel"
    },

    worker: {
      id: "worker",
      type: "steel",
      name: "Worker",
      trainerAbility: "str"
    },

    kindler: {
      id: "kindler",
      type: "fire",
      name: "Kindler",
      trainerSkill: "itm"
    },

    swimmer: {
      id: "swimmer",
      type: "water",
      name: "Swimmer",
      trainerAbility: "dex"
    },

    gardener: {
      id: "gardener",
      type: "grass",
      name: "Gardener",
      trainerSkill: "med"
    },

    engineer: {
      id: "engineer",
      type: "electric",
      name: "Engineer",
      trainerAbility: "int"
    },

    psychic: {
      id: "psychic",
      type: "psychic",
      name: "Psychic",
      trainerSkill: "arc"
    },

    skier: {
      id: "skier",
      type: "ice",
      name: "Skier",
      trainerSkill: "acr"
    },

    "dragon-tamer": {
      id: "dragon-tamer",
      type: "dragon",
      name: "Dragon Tamer",
      trainerAbility: "wis"
    },

    delinquent: {
      id: "delinquent",
      type: "dark",
      name: "Delinquent",
      trainerSkill: "ste"
    },

    actor: {
      id: "actor",
      type: "fairy",
      name: "Actor",
      trainerSkill: "prf"
    }
  });


export const TRAINER_PATHS =
  Object.freeze({

    "ace-trainer": {
      id: "ace-trainer",
      name: "Ace Trainer",
      feature:
        "pokemon-attack-damage-bonus"
    },

    hobbyist: {
      id: "hobbyist",
      name: "Hobbyist",
      additionalSpecialization:
        true,
      extraSkillChoices:
        2
    },

    "poke-mentor": {
      id: "poke-mentor",
      name: "Poké Mentor",
      feature:
        "double-tm-use"
    },

    researcher: {
      id: "researcher",
      name: "Researcher",
      resource: {
        id: "researcherUses",
        maximum: "proficiencyBonus"
      },
      feature:
        "pokemon-skill-int-bonus"
    },

    "pokemon-collector": {
      id: "pokemon-collector",
      name: "Pokémon Collector",
      trainerSkillExpertise:
        "ani"
    },

    nurse: {
      id: "nurse",
      name: "Nurse",
      trainerSkill:
        "med",
      feature:
        "healing-wisdom-bonus"
    },

    "type-master": {
      id: "type-master",
      name: "Type Master",
      feature:
        "specialization-stab-bonus"
    },

    commander: {
      id: "commander",
      name: "Commander",
      requires:
        "bonds"
    },

    grunt: {
      id: "grunt",
      name: "Grunt",
      resource: {
        id: "shadowPoints",
        maximum: "trainerLevel"
      },
      feature:
        "sabotage"
    },

    tactician: {
      id: "tactician",
      name: "Tactician",
      resource: {
        id: "tacticalPoints",
        maximum: "trainerLevel"
      },
      feature:
        "tactical-healing"
    },

    ranger: {
      id: "ranger",
      name: "Ranger",
      trainerSkills: [
        "nat",
        "sur"
      ],
      feature:
        "ranger-movement"
    },

    guru: {
      id: "guru",
      name: "Guru",
      maxSrBonus:
        1
    },

    "pokemon-breeder": {
      id: "pokemon-breeder",
      name: "Pokémon Breeder",
      requires:
        "breeding"
    }
  });


export function getTrainerLevelRule(
  level
) {

  const normalized =
    Math.min(
      MAX_SUPPORTED_TRAINER_LEVEL,
      Math.max(
        1,
        Math.trunc(
          Number(level) ||
          1
        )
      )
    );


  return LEVEL_RULES[
    normalized
  ];
}

export function getTrainerProgressionLimits(
  {
    level,
    pathId = null
  } = {}
) {

  const levelRule =
    getTrainerLevelRule(
      level
    );


  const path =
    pathId
      ? getTrainerPath(
          pathId
        )
      : null;


  return {
    proficiencyBonus:
      levelRule
        .proficiencyBonus,

    pokeslots:
      levelRule
        .pokeslots,

    maxSr:
      levelRule
        .maxSr +
      Number(
        path?.maxSrBonus ??
        0
      )
  };
}

export function getTrainerOrigin(
  id
) {

  return (
    TRAINER_ORIGINS[
      String(
        id ??
        ""
      )
    ] ??
    null
  );
}


export function getTrainerSpecialization(
  id
) {

  return (
    TRAINER_SPECIALIZATIONS[
      String(
        id ??
        ""
      )
    ] ??
    null
  );
}


export function getTrainerPath(
  id
) {

  return (
    TRAINER_PATHS[
      String(
        id ??
        ""
      )
    ] ??
    null
  );
}