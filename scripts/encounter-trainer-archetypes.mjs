const TRAINER_ARCHETYPES =
  Object.freeze([
    freezeArchetype({
      id:
        "generic",

      name: {
        es:
          "Entrenador",

        en:
          "Trainer"
      },

      description: {
        es:
          "Sin preferencia temática. Selección uniforme dentro del pool permitido.",

        en:
          "No thematic preference. Uniform selection within the allowed pool."
      },

      typeWeights: {},

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "rocket-grunt",

      name: {
        es:
          "Recluta Rocket",

        en:
          "Rocket Grunt"
      },

      description: {
        es:
          "Favorece Poison, Dark y Normal, sin excluir otros tipos válidos.",

        en:
          "Favors Poison, Dark, and Normal without excluding other valid types."
      },

      typeWeights: {
        poison:
          5,

        dark:
          4,

        normal:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "rocket-agent",

      name: {
        es:
          "Agente Rocket",

        en:
          "Rocket Agent"
      },

      description: {
        es:
          "Operativo Rocket más experimentado. Favorece Poison y Dark, con equipos algo más exigentes que un Recluta.",

        en:
          "More experienced Rocket operative. Favors Poison and Dark with slightly tougher teams than a Grunt."
      },

      typeWeights: {
        poison:
          5,

        dark:
          5,

        normal:
          2,

        steel:
          2
      },

      teamSize: {
        min:
          3,

        max:
          4
      },

      levelBias:
        "high",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "rocket-admin",

      name: {
        es:
          "Admin Rocket",

        en:
          "Rocket Admin"
      },

      description: {
        es:
          "Mando Rocket de alto nivel. Favorece Dark y Poison, incorpora tipos de apoyo y utiliza un Pokémon Ace.",

        en:
          "High-ranking Rocket commander. Favors Dark and Poison, includes supporting types, and uses an Ace Pokémon."
      },

      typeWeights: {
        dark:
          5,

        poison:
          4,

        psychic:
          3,

        steel:
          3
      },

      teamSize: {
        min:
          3,

        max:
          5
      },

      levelBias:
        "high",

      ace:
        true
    }),

    freezeArchetype({
      id:
        "rocket-executive",

      name: {
        es:
          "Ejecutivo Rocket",

        en:
          "Rocket Executive"
      },

      description: {
        es:
          "Rango Rocket superior. Genera equipos grandes, niveles altos y un Ace, con preferencia por Dark, Poison, Psychic, Steel y Fire.",

        en:
          "Senior Rocket rank. Generates large, high-level teams with an Ace, favoring Dark, Poison, Psychic, Steel, and Fire."
      },

      typeWeights: {
        dark:
          5,

        poison:
          4,

        psychic:
          3,

        steel:
          3,

        fire:
          3
      },

      teamSize: {
        min:
          4,

        max:
          6
      },

      levelBias:
        "high",

      ace:
        true
    }),

    freezeArchetype({
      id:
        "bug-catcher",

      name: {
        es:
          "Cazabichos",

        en:
          "Bug Catcher"
      },

      description: {
        es:
          "Favorece fuertemente Bug y, en menor medida, Grass y Poison.",

        en:
          "Strongly favors Bug and secondarily Grass and Poison."
      },

      typeWeights: {
        bug:
          8,

        grass:
          2,

        poison:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "low",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "hiker",

      name: {
        es:
          "Montañista",

        en:
          "Hiker"
      },

      description: {
        es:
          "Favorece Rock, Ground y Fighting.",

        en:
          "Favors Rock, Ground, and Fighting."
      },

      typeWeights: {
        rock:
          5,

        ground:
          4,

        fighting:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "fisherman",

      name: {
        es:
          "Pescador",

        en:
          "Fisherman"
      },

      description: {
        es:
          "Favorece fuertemente Pokémon de tipo Water.",

        en:
          "Strongly favors Water-type Pokémon."
      },

      typeWeights: {
        water:
          8
      },

      teamSize: {
        min:
          2,

        max:
          5
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "swimmer",

      name: {
        es:
          "Nadador",

        en:
          "Swimmer"
      },

      description: {
        es:
          "Favorece fuertemente Water y secundariamente Ice.",

        en:
          "Strongly favors Water and secondarily Ice."
      },

      typeWeights: {
        water:
          8,

        ice:
          2
      },

      teamSize: {
        min:
          2,

        max:
          5
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "bird-keeper",

      name: {
        es:
          "Criador de Aves",

        en:
          "Bird Keeper"
      },

      description: {
        es:
          "Favorece fuertemente Flying y, en menor medida, Normal.",

        en:
          "Strongly favors Flying and secondarily Normal."
      },

      typeWeights: {
        flying:
          8,

        normal:
          2
      },

      teamSize: {
        min:
          2,

        max:
          5
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "black-belt",

      name: {
        es:
          "Cinturón Negro",

        en:
          "Black Belt"
      },

      description: {
        es:
          "Favorece fuertemente Fighting y secundariamente Rock.",

        en:
          "Strongly favors Fighting and secondarily Rock."
      },

      typeWeights: {
        fighting:
          8,

        rock:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "scientist",

      name: {
        es:
          "Científico",

        en:
          "Scientist"
      },

      description: {
        es:
          "Favorece Electric, Poison y Steel, con una preferencia secundaria por Psychic.",

        en:
          "Favors Electric, Poison, and Steel with a secondary preference for Psychic."
      },

      typeWeights: {
        electric:
          4,

        poison:
          4,

        steel:
          4,

        psychic:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "poke-maniac",

      name: {
        es:
          "Poké Maniac",

        en:
          "Poké Maniac"
      },

      description: {
        es:
          "Favorece Pokémon poco comunes de perfil Dragon, Rock y Ground, sin convertir esos tipos en una restricción dura.",

        en:
          "Favors unusual Dragon, Rock, and Ground Pokémon without turning those types into a hard restriction."
      },

      typeWeights: {
        dragon:
          5,

        rock:
          3,

        ground:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "psychic",

      name: {
        es:
          "Psíquico",

        en:
          "Psychic"
      },

      description: {
        es:
          "Favorece Psychic y secundariamente Fairy y Ghost.",

        en:
          "Favors Psychic and secondarily Fairy and Ghost."
      },

      typeWeights: {
        psychic:
          8,

        fairy:
          2,

        ghost:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "breeder",

      name: {
        es:
          "Criador Pokémon",

        en:
          "Pokémon Breeder"
      },

      description: {
        es:
          "Favorece Normal y Fairy, con apoyo secundario de Grass, y tiende a equipos medianos o grandes.",

        en:
          "Favors Normal and Fairy with secondary Grass support and tends toward medium or large teams."
      },

      typeWeights: {
        normal:
          4,

        fairy:
          3,

        grass:
          2
      },

      teamSize: {
        min:
          3,

        max:
          5
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "sailor",

      name: {
        es:
          "Marinero",

        en:
          "Sailor"
      },

      description: {
        es:
          "Favorece fuertemente Water y, en menor medida, Fighting y Normal.",

        en:
          "Strongly favors Water and secondarily Fighting and Normal."
      },

      typeWeights: {
        water:
          8,

        fighting:
          3,

        normal:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "biker",

      name: {
        es:
          "Motociclista",

        en:
          "Biker"
      },

      description: {
        es:
          "Favorece Poison y secundariamente Fire y Dark.",

        en:
          "Favors Poison and secondarily Fire and Dark."
      },

      typeWeights: {
        poison:
          8,

        fire:
          3,

        dark:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "channeler",

      name: {
        es:
          "Médium",

        en:
          "Channeler"
      },

      description: {
        es:
          "Favorece casi exclusivamente Ghost, con apoyo secundario de Psychic.",

        en:
          "Strongly favors Ghost with secondary Psychic support."
      },

      typeWeights: {
        ghost:
          9,

        psychic:
          2
      },

      teamSize: {
        min:
          1,

        max:
          3
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "firebreather",

      name: {
        es:
          "Tragafuegos",

        en:
          "Firebreather"
      },

      description: {
        es:
          "Favorece Fire y secundariamente Poison, evocando equipos de fuego, humo y gases.",

        en:
          "Favors Fire and secondarily Poison, evoking fire, smoke, and gas-themed teams."
      },

      typeWeights: {
        fire:
          9,

        poison:
          3
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "engineer",

      name: {
        es:
          "Ingeniero",

        en:
          "Engineer"
      },

      description: {
        es:
          "Favorece Electric y secundariamente Steel.",

        en:
          "Favors Electric and secondarily Steel."
      },

      typeWeights: {
        electric:
          9,

        steel:
          3
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "super-nerd",

      name: {
        es:
          "Super Nerd",

        en:
          "Super Nerd"
      },

      description: {
        es:
          "Favorece Electric, Poison y Steel, con apoyo secundario de Psychic.",

        en:
          "Favors Electric, Poison, and Steel with secondary Psychic support."
      },

      typeWeights: {
        electric:
          5,

        poison:
          5,

        steel:
          4,

        psychic:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "aroma-lady",

      name: {
        es:
          "Aromadama",

        en:
          "Aroma Lady"
      },

      description: {
        es:
          "Favorece Grass y secundariamente Fairy y Poison.",

        en:
          "Favors Grass and secondarily Fairy and Poison."
      },

      typeWeights: {
        grass:
          9,

        fairy:
          3,

        poison:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "ruin-maniac",

      name: {
        es:
          "Maniático de Ruinas",

        en:
          "Ruin Maniac"
      },

      description: {
        es:
          "Favorece Rock y Ground, con apoyo secundario de Steel.",

        en:
          "Favors Rock and Ground with secondary Steel support."
      },

      typeWeights: {
        rock:
          7,

        ground:
          7,

        steel:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "dragon-tamer",

      name: {
        es:
          "Domadragones",

        en:
          "Dragon Tamer"
      },

      description: {
        es:
          "Favorece fuertemente Dragon y secundariamente Flying, con niveles sesgados hacia el máximo.",

        en:
          "Strongly favors Dragon and secondarily Flying, with levels biased toward the maximum."
      },

      typeWeights: {
        dragon:
          10,

        flying:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "high",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "hex-maniac",

      name: {
        es:
          "Hex Maniac",

        en:
          "Hex Maniac"
      },

      description: {
        es:
          "Favorece Ghost y Psychic, con una preferencia secundaria por Dark.",

        en:
          "Favors Ghost and Psychic with a secondary preference for Dark."
      },

      typeWeights: {
        ghost:
          8,

        psychic:
          5,

        dark:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "ninja-boy",

      name: {
        es:
          "Joven Ninja",

        en:
          "Ninja Boy"
      },

      description: {
        es:
          "Favorece Poison y Bug, con apoyo secundario de Grass.",

        en:
          "Favors Poison and Bug with secondary Grass support."
      },

      typeWeights: {
        poison:
          7,

        bug:
          5,

        grass:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "fairy-tale-girl",

      name: {
        es:
          "Niña de Cuento",

        en:
          "Fairy Tale Girl"
      },

      description: {
        es:
          "Favorece Fairy y secundariamente Psychic y Normal.",

        en:
          "Favors Fairy and secondarily Psychic and Normal."
      },

      typeWeights: {
        fairy:
          9,

        psychic:
          2,

        normal:
          2
      },

      teamSize: {
        min:
          2,

        max:
          4
      },

      levelBias:
        "balanced",

      ace:
        false
    }),

    freezeArchetype({
      id:
        "veteran",

      name: {
        es:
          "Veterano",

        en:
          "Veteran"
      },

      description: {
        es:
          "Equipo experimentado y variado, con niveles altos y un Pokémon Ace.",

        en:
          "Experienced and varied team with high levels and an Ace Pokémon."
      },

      typeWeights: {},

      teamSize: {
        min:
          4,

        max:
          6
      },

      levelBias:
        "high",

      ace:
        true
    }),        
    freezeArchetype({
      id: "tamer",

      name: {
        es: "Domador",
        en: "Tamer"
      },

      description: {
        es:
          "Favorece Pokémon de aspecto feroz o bestial, " +
          "especialmente Arbok, Tauros, Rhyhorn, Persian y Golduck.",

        en:
          "Favors fierce or beast-like Pokémon, " +
          "especially Arbok, Tauros, Rhyhorn, Persian, and Golduck."
      },

      typeWeights: {
        normal: 4,
        ground: 4,
        poison: 3,
        water: 2
      },

      speciesWeights: {
        arbok: 13,
        tauros: 13,
        rhyhorn: 12,
        persian: 11,
        golduck: 11,
        rhydon: 9,
        sandslash: 8
      },

      teamSize: {
        min: 2,
        max: 4
      },

      levelBias: "balanced",
      ace: false
    }),

    freezeArchetype({
      id: "police-officer",

      name: {
        es: "Policía",
        en: "Police Officer"
      },

      description: {
        es:
          "Favorece Pokémon caninos, especialmente " +
          "Growlithe y Arcanine, con apoyo Fighting y Steel.",

        en:
          "Favors canine Pokémon, especially " +
          "Growlithe and Arcanine, with Fighting and Steel support."
      },

      typeWeights: {
        fire: 5,
        fighting: 4,
        steel: 3,
        normal: 2
      },

      speciesWeights: {
        growlithe: 15,
        arcanine: 15,
        houndour: 12,
        houndoom: 12,
        poochyena: 12,
        mightyena: 12,
        rockruff: 12,
        herdier: 12,
        stoutland: 12,
        yamper: 12,
        boltund: 12,
        snubbull: 10,
        granbull: 10,
        machop: 8,
        machoke: 8
      },

      teamSize: {
        min: 2,
        max: 4
      },

      levelBias: "balanced",
      ace: false
    }),


    freezeArchetype({
      id:
        "ace-trainer",

      name: {
        es:
          "Entrenador Experto",

        en:
          "Ace Trainer"
      },

      description: {
        es:
          "Equipo más grande, niveles sesgados hacia el máximo y un Pokémon Ace al nivel máximo permitido.",

        en:
          "Larger team, levels biased toward the maximum, and one Ace at the maximum allowed level."
      },

      typeWeights: {},

      teamSize: {
        min:
          3,

        max:
          6
      },

      levelBias:
        "high",

      ace:
        true
    }),

    freezeArchetype({
      id:
        "youngster",

      name: {
        es:
          "Joven",

        en:
          "Youngster"
      },

      description: {
        es:
          "Equipo pequeño, niveles sesgados hacia el mínimo y preferencia por Normal, Flying y Bug.",

        en:
          "Small team, levels biased toward the minimum, preferring Normal, Flying, and Bug."
      },

      typeWeights: {
        normal:
          5,

        flying:
          3,

        bug:
          2
      },

      teamSize: {
        min:
          1,

        max:
          3
      },

      levelBias:
        "low",

      ace:
        false
    })
  ]);


const TRAINER_ARCHETYPE_INDEX =
  new Map(
    TRAINER_ARCHETYPES.map(
      archetype => [
        archetype.id,
        archetype
      ]
    )
  );

const TRAINER_ARCHETYPE_GROUPS =
  Object.freeze([
    freezeArchetypeGroup({
      id:
        "general",

      name: {
        es:
          "Generales",

        en:
          "General"
      },

      archetypeIds: [
        "generic",
        "youngster",
        "breeder",
        "ace-trainer",
        "veteran"
      ]
    }),

    freezeArchetypeGroup({
      id:
        "rocket",

      name: {
        es:
          "Team Rocket",

        en:
          "Team Rocket"
      },

      archetypeIds: [
        "rocket-grunt",
        "rocket-agent",
        "rocket-admin",
        "rocket-executive"
      ]
    }),

    freezeArchetypeGroup({
      id:
        "outdoor",

      name: {
        es:
          "Exploración y naturaleza",

        en:
          "Exploration & Nature"
      },

      archetypeIds: [
        "bug-catcher",
        "hiker",
        "fisherman",
        "swimmer",
        "bird-keeper",
        "sailor",
        "aroma-lady",
        "ruin-maniac"
      ]
    }),

    freezeArchetypeGroup({
      id:
        "specialists",

      name: {
        es:
          "Especialistas",

        en:
          "Specialists"
      },

      archetypeIds: [
        "black-belt",
        "psychic",
        "channeler",
        "firebreather",
        "dragon-tamer",
        "hex-maniac",
        "ninja-boy",
        "fairy-tale-girl"
      ]
    }),

    freezeArchetypeGroup({
      id:
        "thematic",

      name: {
        es:
          "Profesiones y temáticos",

        en:
          "Professions & Thematic"
      },
      archetypeIds: [
        "scientist",
        "engineer",
        "super-nerd",
        "poke-maniac",
        "biker",
        "tamer",
        "police-officer"
      ]
    })
  ]);

export function listTrainerArchetypes() {
  return [
    ...TRAINER_ARCHETYPES
  ];
}

export function listTrainerArchetypeGroups() {
  return TRAINER_ARCHETYPE_GROUPS
    .map(
      group => ({
        ...group,

        archetypes:
          group.archetypeIds
            .map(
              archetypeId =>
                TRAINER_ARCHETYPE_INDEX.get(
                  archetypeId
                )
            )
            .filter(Boolean)
      })
    );
}


export function getTrainerArchetypeGroupLabel(
  group,
  language = "es"
) {
  const value =
    group?.name;


  if (
    typeof value ===
      "string"
  ) {
    return value;
  }


  return String(
    value?.[language] ??
    value?.en ??
    value?.es ??
    group?.id ??
    "Group"
  );
}

export function getTrainerArchetype(
  archetypeId
) {
  return (
    TRAINER_ARCHETYPE_INDEX.get(
      String(
        archetypeId ??
        ""
      )
    ) ??
    TRAINER_ARCHETYPE_INDEX.get(
      "generic"
    )
  );
}


export function getTrainerArchetypeLabel(
  archetype,
  language = "es"
) {
  const value =
    archetype?.name;


  if (
    typeof value ===
      "string"
  ) {
    return value;
  }


  return String(
    value?.[language] ??
    value?.en ??
    value?.es ??
    archetype?.id ??
    "Trainer"
  );
}


export function getTrainerArchetypeDescription(
  archetype,
  language = "es"
) {
  const value =
    archetype?.description;


  if (
    typeof value ===
      "string"
  ) {
    return value;
  }


  return String(
    value?.[language] ??
    value?.en ??
    value?.es ??
    ""
  );
}



function freezeArchetype(
  definition
) {
  return Object.freeze({
    ...definition,

    name:
      Object.freeze({
        ...definition.name
      }),

    description:
      Object.freeze({
        ...definition.description
      }),

    typeWeights:
      Object.freeze({
        ...definition.typeWeights
      }),

    speciesWeights:
      Object.freeze({
        ...definition.speciesWeights
      }),

    teamSize:
      Object.freeze({
        ...definition.teamSize
      })
  });
}


function freezeArchetypeGroup(
  definition
) {
  return Object.freeze({
    ...definition,

    name:
      Object.freeze({
        ...definition.name
      }),

    archetypeIds:
      Object.freeze([
        ...definition.archetypeIds
      ])
  });
}