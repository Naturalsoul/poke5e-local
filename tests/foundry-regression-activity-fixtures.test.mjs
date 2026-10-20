import assert from "node:assert/strict";
import test from "node:test";

import {
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

const MODULE_ID =
  "poke5e-local";


function setPath(
  object,
  path,
  value
) {

  const keys =
    String(
      path
    ).split(".");


  let current =
    object;


  for (
    const key
    of keys.slice(
      0,
      -1
    )
  ) {

    current[key] ??=
      {};

    current =
      current[key];
  }


  current[
    keys.at(-1)
  ] =
    value;
}


function flagReader(
  flags
) {

  return function getFlag(
    moduleId,
    key
  ) {

    return flags[
      moduleId
    ]?.[key];
  };
}


function sourceMove() {

  const flags = {
    [MODULE_ID]: {
      kind:
        "move",

      sourceId:
        "ground-test"
    }
  };


  const activity = {
    id:
      "attack1",

    type:
      "attack",

    damage: {
      parts: [
        {
          custom: {
            enabled:
              true,

            formula:
              "1d6 + 2"
          }
        }
      ]
    },

    async rollAttack() {
      return [];
    },

    async rollDamage() {
      return [];
    }
  };


  return {
    id:
      "move1",

    uuid:
      "Actor.source.Item.move1",

    name:
      "Ground Test",

    effects:
      [],

    system: {
      activities: [
        activity
      ]
    },

    getFlag:
      flagReader(
        flags
      ),

    _flags:
      flags,

    _activity:
      activity
  };
}


function createSourceActor({
  withMove = true
} = {}) {

  const flags = {
    [MODULE_ID]: {
      kind:
        "pokemon",

      sourceId:
        "pikachu",

      level:
        5,

      types: [
        "electric"
      ]
    }
  };


  const move =
    sourceMove();


  return {
    uuid:
      "Actor.source",

    id:
      "source",

    name:
      "Pikachu (Lv. 5)",

    documentName:
      "Actor",

    system: {
      attributes: {
        hp: {
          value:
            20,

          max:
            20,

          temp:
            0
        },

        ac: {
          value:
            12
        }
      }
    },

    items:
      withMove
        ? [
            move
          ]
        : [],

    getFlag:
      flagReader(
        flags
      ),

    toObject() {

      return {
        _id:
          this.id,

        name:
          this.name,

        type:
          "npc",

        folder:
          "folder1",

        system:
          structuredClone(
            this.system
          ),

        items:
          withMove
            ? [
                {
                  _id:
                    move.id,

                  name:
                    move.name,

                  flags:
                    structuredClone(
                      move._flags
                    ),

                  effects:
                    [],

                  system: {
                    activities: [
                      {
                        _id:
                          move._activity.id,

                        type:
                          "attack"
                      }
                    ]
                  }
                }
              ]
            : [],

        effects:
          [],

        flags:
          structuredClone(
            flags
          )
      };
    }
  };
}


function installGlobals({
  targetSelected = false,
  withMove = true,
  groundMultiplier = 2
} = {}) {

  installFoundryUtils();


  const source =
    createSourceActor({
      withMove
    });


  const actors = [
    source
  ];


  const messages = [];
  let messageSequence = 0;


  globalThis.ui = {
    notifications: {
      info() {},
      error() {}
    }
  };


  globalThis.game = {
    user: {
      isGM:
        true,

      targets:
        targetSelected
          ? new Set([
              {
                id:
                  "real-target"
              }
            ])
          : new Set()
    },

    actors,
    scenes: [],
    messages
  };


  globalThis.fromUuidSync =
    uuid =>
      actors.find(
        actor =>
          actor.uuid ===
            uuid
      ) ??
      null;


  function createMessage() {

    messageSequence +=
      1;


    const message = {
      id:
        `message-${messageSequence}`,

      async delete() {
        const index =
          messages.indexOf(
            this
          );

        if (
          index >= 0
        ) {
          messages.splice(
            index,
            1
          );
        }
      }
    };


    messages.push(
      message
    );
  }


  function createFixtureItem(
    sourceData,
    actor
  ) {

    const flags =
      structuredClone(
        sourceData.flags ??
        {}
      );


    const activity = {
      id:
        "attack1",

      type:
        "attack",

      damage: {
        parts: [
          {
            custom: {
              enabled:
                true,

              formula:
                "1d6 + 2"
            }
          }
        ]
      },

      async rollAttack() {
        createMessage();

        return [
          {
            formula:
              "1d20 + 4",

            total:
              15
          }
        ];
      },

      async rollDamage() {
        createMessage();

        return [
          {
            formula:
              "1d6 + 2",

            total:
              5,

            options: {
              type:
                "ground"
            }
          }
        ];
      }
    };


    return {
      id:
        sourceData._id,

      uuid:
        `${actor.uuid}.Item.${sourceData._id}`,

      name:
        sourceData.name,

      effects:
        [],

      system: {
        activities: [
          activity
        ]
      },

      getFlag:
        flagReader(
          flags
        )
    };
  }


  globalThis.Actor = {
    implementation: {
      async create(
        data
      ) {

        const flags =
          structuredClone(
            data.flags ??
            {}
          );


        const actor = {
          uuid:
            `Actor.fixture-${actors.length}`,

          id:
            `fixture-${actors.length}`,

          name:
            data.name,

          documentName:
            "Actor",

          system:
            structuredClone(
              data.system
            ),

          items:
            [],

          getFlag:
            flagReader(
              flags
            ),

          async update(
            changes
          ) {

            for (
              const [
                path,
                value
              ]
              of Object.entries(
                changes
              )
            ) {

              setPath(
                this,
                path,
                value
              );
            }


            return this;
          },

          async applyDamage(
            damage
          ) {

            const hp =
              this.system.attributes.hp;


            const entry =
              Array.isArray(
                damage
              )

                ? damage[0]

                : null;


            const base =
              entry
                ? Number(
                    entry.value
                  )
                : Number(
                    damage
                  );


            const multiplier =
              entry?.type ===
                "ground"

                ? groundMultiplier

                : 1;


            let remaining =
              base *
              multiplier;


            const tempDamage =
              Math.min(
                hp.temp,
                remaining
              );


            hp.temp -=
              tempDamage;

            remaining -=
              tempDamage;

            hp.value =
              Math.max(
                0,
                hp.value -
                remaining
              );
          },

          async delete() {
            const index =
              actors.indexOf(
                this
              );

            if (
              index >= 0
            ) {
              actors.splice(
                index,
                1
              );
            }
          }
        };


        actor.items =
          Array.from(
            data.items ??
            []
          ).map(
            item =>
              createFixtureItem(
                item,
                actor
              )
          );


        actors.push(
          actor
        );


        return actor;
      }
    }
  };


  return {
    source,
    actors,
    messages
  };
}


async function importActivityFixtures() {

  return import(
    `../scripts/foundry-regression-activity-fixtures.mjs?test=${Date.now()}-${Math.random()}`
  );
}


test(
  "Activity fixtures: ejecuta Attack -> Damage -> applyDamage sobre clones temporales",
  async () => {

    const globals =
      installGlobals();


    const module =
      await importActivityFixtures();


    const result =
      await module.runFoundryActivityFixtures({
        notify:
          false
      });


    assert.equal(
      result.summary.fail,
      0
    );


    const applied =
      result.checks.find(
        check =>
          check.id ===
            "activity.apply-damage"
      );


    assert.equal(
      applied.status,
      "pass"
    );


    assert.deepEqual(
      applied.details,
      {
        rolledDamage:
          5,

        damageType:
          "ground",

        multiplier:
          2,

        expected:
          10,

        observed:
          10
      }
    );


    assert.equal(
      globals.source.system.attributes.hp.value,
      20
    );


    assert.equal(
      globals.actors.length,
      1
    );


    assert.equal(
      globals.messages.length,
      0
    );
  }
);


test(
  "Activity fixtures: no modifica targets reales y devuelve SKIP de seguridad",
  async () => {

    const globals =
      installGlobals({
        targetSelected:
          true
      });


    const module =
      await importActivityFixtures();


    const result =
      await module.runFoundryActivityFixtures({
        notify:
          false
      });


    assert.deepEqual(
      result.summary,
      {
        total:
          1,

        pass:
          0,

        fail:
          0,

        skip:
          1
      }
    );


    assert.equal(
      game.user.targets.size,
      1
    );


    assert.equal(
      globals.actors.length,
      1
    );
  }
);


test(
  "Activity fixtures: sin Move apto devuelve SKIP y no crea documentos",
  async () => {

    const globals =
      installGlobals({
        withMove:
          false
      });


    const module =
      await importActivityFixtures();


    const result =
      await module.runFoundryActivityFixtures({
        notify:
          false
      });


    assert.equal(
      result.summary.fail,
      0
    );


    assert.equal(
      result.summary.skip,
      1
    );


    assert.equal(
      globals.actors.length,
      1
    );
  }
);


test(
  "Activity fixtures: detecta una aplicación tipada incorrecta",
  async () => {

    installGlobals({
      groundMultiplier:
        1
    });


    const module =
      await importActivityFixtures();


    const result =
      await module.runFoundryActivityFixtures({
        notify:
          false
      });


    const applied =
      result.checks.find(
        check =>
          check.id ===
            "activity.apply-damage"
      );


    assert.equal(
      applied.status,
      "fail"
    );


    assert.equal(
      applied.details.expected,
      10
    );


    assert.equal(
      applied.details.observed,
      5
    );
  }
);
