import {
  normalizeEncounterAbilityId,
  normalizeEncounterItemId,
  normalizeTrainerArchetypeId
} from "./encounter-model.mjs";

const MODULE_ID = "poke5e-local";

export class EncounterQueryService {
  list() {
    const encounters = new Map();

    for (const actor of game.actors) {
      const metadata = getEncounterMetadata(actor);

      if (!isActiveEncounterMetadata(metadata)) {
        continue;
      }

      const key = String(metadata.key);
      const current = encounters.get(key);

      if (current) {
        current.actorCount += 1;
        current.quantity += positiveInteger(
          metadata.quantity,
          1
        );

        continue;
      }

      encounters.set(
        key,
        {
          key,

          name:
            String(
              metadata.name ??
              key
            ),

          location:
            String(
              metadata.location ??
              ""
            ),

          type:
            metadata.type === "trainer"
              ? "trainer"
              : "wild",
          optional:
            metadata.optional ===
              true,
          actorCount: 1,

          quantity:
            positiveInteger(
              metadata.quantity,
              1
            )
        }
      );
    }

    return [
      ...encounters.values()
    ].sort(
      compareEncounters
    );
  }

  get(
    encounterKey
  ) {
    const key =
      String(
        encounterKey ??
        ""
      ).trim();


    if (!key) {
      return null;
    }


    const actors =
      game.actors
        .filter(
          actor => {
            const metadata =
              getEncounterMetadata(
                actor
              );


            return (
              isActiveEncounterMetadata(
                metadata
              ) &&

              String(
                metadata.key
              ) ===
                key
            );
          }
        )
        .sort(
          compareEncounterActors
        );


    if (!actors.length) {
      return null;
    }


    const firstMetadata =
      getEncounterMetadata(
        actors[0]
      );


    const type =
      firstMetadata.type ===
        "trainer"
        ? "trainer"
        : "wild";


    if (
      type ===
      "trainer"
    ) {
      return buildTrainerEncounter(
        key,
        actors,
        firstMetadata
      );
    }


    return buildWildEncounter(
      key,
      actors,
      firstMetadata
    );
  }
}

function buildWildEncounter(
  key,
  actors,
  firstMetadata
) {
  const pokemon =
    actors
      .map(
        buildEncounterEntry
      )
      .filter(Boolean);


  if (!pokemon.length) {
    return null;
  }


  return {
    key,

    name:
      String(
        firstMetadata.name ??
        key
      ),

    location:
      String(
        firstMetadata.location ??
        ""
      ),

    type:
      "wild",
    optional:
      firstMetadata.optional ===
        true,
    pokemon,
    trainers:
      []
  };
}


function buildTrainerEncounter(
  key,
  actors,
  firstMetadata
) {
  const trainersById =
    new Map();


  for (
    const actor
    of actors
  ) {
    const metadata =
      getEncounterMetadata(
        actor
      );


    const entry =
      buildEncounterEntry(
        actor
      );


    if (!entry) {
      continue;
    }


    const trainer =
      normalizeTrainerMetadata(
        metadata?.trainer
      );


    const existing =
      trainersById.get(
        trainer.id
      );


    if (existing) {
      existing.pokemon.push(
        entry
      );

      continue;
    }


    trainersById.set(
      trainer.id,
      {
        id:
          trainer.id,

        name:
          trainer.name,

        archetypeId:
          trainer.archetypeId,

        order:
          trainer.order,

        pokemon: [
          entry
        ]
      }
    );
  }


  const trainers =
    [
      ...trainersById.values()
    ]
      .sort(
        (
          left,
          right
        ) =>
          left.order -
          right.order
      )
      .map(
        trainer => ({
          id:
            trainer.id,

          name:
            trainer.name,

          archetypeId:
            trainer.archetypeId,

          pokemon:
            trainer.pokemon
        })
      );


  if (!trainers.length) {
    return null;
  }


  return {
    key,

    name:
      String(
        firstMetadata.name ??
        key
      ),

    location:
      String(
        firstMetadata.location ??
        ""
      ),

    type:
      "trainer",
    optional:
      firstMetadata.optional ===
        true,
    pokemon:
      [],
    trainers
  };
}


function normalizeTrainerMetadata(
  value
) {
  const source =
    value &&
    typeof value ===
      "object"
      ? value
      : {};


  const id =
    String(
      source.id ??
      "trainer-1"
    ).trim() ||
    "trainer-1";


  const name =
    String(
      source.name ??
      "Entrenador"
    ).trim() ||
    "Entrenador";

  const archetypeId =
    normalizeTrainerArchetypeId(
      source.archetypeId
    );

  const orderValue =
    Number(
      source.order
    );


  return {
    id,
    name,
    archetypeId,

    order:
      Number.isFinite(
        orderValue
      )
        ? orderValue
        : 0
  };
}

function buildEncounterEntry(
  actor
) {

  const metadata =
    getEncounterMetadata(
      actor
    );


  const pokemonId =
    String(
      metadata?.pokemonId ??
      ""
    ).trim();


  const level =
    positiveInteger(
      metadata?.level,
      0
    );


  if (
    !pokemonId ||
    level <= 0
  ) {

    return null;
  }


  const quantity =
    positiveInteger(
      metadata.quantity,
      1
    );


  const defeated =
    clampInteger(
      metadata.defeated,
      0,
      quantity,
      0
    );


  const captured =
    clampInteger(
      metadata.captured,
      0,

      Math.max(
        0,
        quantity -
        defeated
      ),

      0
    );


  /*
   * El Item realmente embebido en el Actor
   * tiene prioridad sobre metadata antigua.
   */
  const carriedItemId =
    getActorCarriedItemSourceId(
      actor
    );


  const storedItemId =
    normalizeEncounterItemId(
      metadata.itemId
    );


  const itemResolved =
    Boolean(
      carriedItemId
    ) ||
    metadata.itemResolved ===
      true ||
    Boolean(
      storedItemId
    );


  /*
   * Si el encuentro ya fue resuelto y el objeto
   * ya no existe —por ejemplo porque fue retirado—
   * no restauramos automáticamente el ID antiguo.
   */
  const itemId =
    carriedItemId ??
    (
      metadata.itemResolved ===
        true

        ? null

        : storedItemId
    );


  return {
    pokemonId,
    level,
    quantity,
    defeated,
    captured,

    moveIds:
      normalizeStringArray(
        metadata.moveIds
      ),

    abilityId:
      normalizeEncounterAbilityId(
        metadata.abilityId
      ),

    itemId,
    itemResolved
  };
}

function getActorCarriedItemSourceId(
  actor
) {

  const heldItemId =
    String(
      actor?.getFlag(
        MODULE_ID,
        "heldItemId"
      ) ??
      ""
    );


  const heldItem =
    heldItemId

      ? actor.items.get(
          heldItemId
        )

      : actor.items.find(
          item =>
            item.getFlag(
              MODULE_ID,
              "kind"
            ) ===
              "catalog-item"
        ) ??
        null;


  if (
    !heldItem ||
    heldItem.getFlag(
      MODULE_ID,
      "kind"
    ) !==
      "catalog-item"
  ) {

    return null;
  }


  return normalizeEncounterItemId(
    heldItem.getFlag(
      MODULE_ID,
      "sourceId"
    )
  );
}


function getEncounterMetadata(
  actor
) {
  return (
    actor?.getFlag(
      MODULE_ID,
      "encounter"
    ) ??
    null
  );
}


function isActiveEncounterMetadata(
  metadata
) {
  return Boolean(
    metadata &&
    typeof metadata ===
      "object" &&

    String(
      metadata.key ??
      ""
    ).trim() &&

    metadata.stale !==
      true
  );
}


function normalizeStringArray(
  value
) {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          entry =>
            String(
              entry ??
              ""
            ).trim()
        )
        .filter(Boolean)
    )
  ];
}

function compareEncounterActors(
  left,
  right
) {
  const leftMetadata =
    getEncounterMetadata(
      left
    );

  const rightMetadata =
    getEncounterMetadata(
      right
    );


  const leftTrainer =
    normalizeTrainerMetadata(
      leftMetadata?.trainer
    );

  const rightTrainer =
    normalizeTrainerMetadata(
      rightMetadata?.trainer
    );


  if (
    leftTrainer.order !==
    rightTrainer.order
  ) {
    return (
      leftTrainer.order -
      rightTrainer.order
    );
  }


  return (
    Number(
      left.sort ??
      0
    ) -
    Number(
      right.sort ??
      0
    )
  );
}

function compareEncounters(
  left,
  right
) {
  const locationComparison =
    String(
      left.location
    ).localeCompare(
      String(
        right.location
      ),
      "es",
      {
        sensitivity:
          "base"
      }
    );

  if (
    locationComparison !==
    0
  ) {
    return locationComparison;
  }

  return String(
    left.name
  ).localeCompare(
    String(
      right.name
    ),
    "es",
    {
      sensitivity:
        "base"
    }
  );
}


function positiveInteger(
  value,
  fallback
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.trunc(
      numeric
    )
  );
}


function clampInteger(
  value,
  min,
  max,
  fallback
) {
  const numeric =
    Number(value);

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.trunc(
        numeric
      )
    )
  );
}