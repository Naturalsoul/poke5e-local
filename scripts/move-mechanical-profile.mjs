import { normalizeId } from "./ids.mjs";

const MOVE_MECHANICAL_OVERRIDES =
  Object.freeze({

    "absorb":
      mechanical(["sustain"], ["instant-drain"]),

    "mega-drain":
      mechanical(["sustain"], ["instant-drain"]),

    "giga-drain":
      mechanical(["sustain"], ["instant-drain"]),

    "drain-punch":
      mechanical(["sustain"], ["instant-drain"]),

    "draining-kiss":
      mechanical(["sustain"], ["instant-drain"]),

    "dream-eater":
      mechanical(["sustain"], ["instant-drain"]),

    "leech-life":
      mechanical(["sustain"], ["instant-drain"]),

    "bitter-blade":
      mechanical(["sustain"], ["instant-drain"]),

    "horn-leech":
      mechanical(["sustain"], ["instant-drain"]),

    "oblivion-wing":
      mechanical(["sustain"], ["instant-drain"]),


    "brave-bird":
      mechanical(["risk"], ["recoil"]),

    "double-edge":
      mechanical(["risk"], ["recoil"]),

    "flare-blitz":
      mechanical(["risk"], ["recoil"]),

    "head-charge":
      mechanical(["risk"], ["recoil"]),

    "head-smash":
      mechanical(["risk"], ["recoil"]),

    "submission":
      mechanical(["risk"], ["recoil"]),

    "take-down":
      mechanical(["risk"], ["recoil"]),

    "volt-tackle":
      mechanical(["risk"], ["recoil"]),

    "wave-crash":
      mechanical(["risk"], ["recoil"]),

    "wild-charge":
      mechanical(["risk"], ["recoil"]),

    "wood-hammer":
      mechanical(["risk"], ["recoil"]),


    "steel-beam":
      mechanical(
        ["risk"],
        [
          "forced-recoil",
          "forced-movement"
        ]
      ),


    "light-of-ruin":
      mechanical(["risk"], ["recoil"]),

    "mind-blown":
      mechanical(["risk"], ["self-damage"]),

    "chloroblast":
      mechanical(["risk"], ["self-damage"]),


    "parabolic-charge":
      mechanical(
        ["sustain"],
        [
          "multi-target",
          "instant-drain"
        ]
      ),

    "matcha-gotcha":
      mechanical(
        ["sustain"],
        ["heal-per-failed-save"]
      ),


    "leech-seed":
      mechanical(
        [
          "sustain",
          "control"
        ],
        [
          "periodic",
          "damage-over-time",
          "drain"
        ]
      ),


    "poison-powder":
      statusMechanical("poisoned"),

    "stun-spore":
      statusMechanical("paralysis"),

    "thunder-wave":
      statusMechanical("paralysis"),

    "sleep-powder":
      statusMechanical("asleep"),

    "will-o-wisp":
      statusMechanical("burned"),

    "lava-plume":
      statusMechanical("burned"),

    "scald":
      statusMechanical("burned"),

    "freezing-glare":
      statusMechanical("frozen"),


    "growl":
      mechanical(
        [
          "debuff",
          "control"
        ],
        ["target-modifier"]
      ),

    "acid-spray":
      mechanical(
        [
          "debuff",
          "control"
        ],
        ["target-modifier"]
      ),

    "acid-armor":
      mechanical(
        [
          "setup",
          "defense"
        ],
        ["self-modifier"]
      ),

    "agility":
      mechanical(
        [
          "setup",
          "mobility"
        ],
        ["self-modifier"]
      ),

    "amnesia":
      mechanical(
        [
          "setup",
          "defense"
        ],
        ["self-modifier"]
      ),

    "tail-whip":
      mechanical(
        [
          "debuff",
          "support"
        ],
        [
          "target-modifier",
          "ally-benefit"
        ]
      ),

    "leer":
      mechanical(
        [
          "debuff",
          "support"
        ],
        [
          "target-modifier",
          "ally-benefit"
        ]
      ),

    "screech":
      mechanical(
        [
          "debuff",
          "support"
        ],
        [
          "target-modifier",
          "ally-benefit"
        ]
      ),

    "growth":
      mechanical(
        [
          "setup",
          "support"
        ],
        ["target-modifier"]
      ),

    "defense-curl":
      mechanical(
        [
          "setup",
          "defense"
        ],
        ["self-modifier"]
      ),

    "aqua-ring":
      mechanical(
        [
          "sustain",
          "defense"
        ],
        [
          "self-modifier",
          "periodic-healing"
        ]
      ),

    "defend-order":
      mechanical(
        [
          "setup",
          "defense"
        ],
        ["self-modifier"]
      )
  });


export function buildMoveMechanicalProfile(
  move
) {

  const moveId =
    normalizeId(
      move?.id
    );


  const override =
    MOVE_MECHANICAL_OVERRIDES[
      moveId
    ];


  const roles =
    new Set(
      override?.roles ??
      []
    );


  const tags =
    new Set(
      override?.tags ??
      []
    );


  const dealsDamage =
    Boolean(
      move?.damage
    );


  const attackRoll =
    Boolean(
      move?.attack
    );


  const requiresSave =
    Boolean(
      move?.save
    );


  const area =
    Boolean(
      move?.area
    );


  const duration =
    Boolean(
      move?.duration
    );


  if (dealsDamage) {

    roles.add(
      "damage"
    );
  } else if (
    roles.size ===
    0
  ) {

    roles.add(
      "utility"
    );
  }


  if (attackRoll) {

    tags.add(
      "attack-roll"
    );
  }


  if (requiresSave) {

    tags.add(
      "save"
    );
  }


  if (area) {

    tags.add(
      "area"
    );
  }


  if (duration) {

    tags.add(
      "duration"
    );
  }


  return {
    moveId,

    dealsDamage,
    attackRoll,
    requiresSave,
    area,
    duration,

    roles: [
      ...roles
    ],

    tags: [
      ...tags
    ]
  };
}


function statusMechanical(
  status
) {

  return mechanical(
    [
      "status",
      "control"
    ],
    [
      "status",
      `status:${status}`
    ]
  );
}


function mechanical(
  roles,
  tags
) {

  return Object.freeze({
    roles:
      Object.freeze([
        ...roles
      ]),

    tags:
      Object.freeze([
        ...tags
      ])
  });
}