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


function createSourceActor() {

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


  const item = {
    _id:
      "move1",

    name:
      "Tackle"
  };


  return {
    uuid:
      "Actor.pikachu",

    id:
      "pikachu",

    name:
      "Pikachu (Lv. 5)",

    documentName:
      "Actor",

    system: {
      attributes: {
        hp: {
          value:
            10,

          max:
            10,

          temp:
            0
        }
      }
    },

    items:
      new Map([
        [
          "move1",
          item
        ]
      ]),

    getFlag(
      moduleId,
      key
    ) {

      return flags[
        moduleId
      ]?.[key];
    },

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

        items: [
          structuredClone(
            item
          )
        ],

        effects: [
          {
            _id:
              "old-effect"
          }
        ],

        flags:
          structuredClone(
            flags
          )
      };
    }
  };
}


function createFixtureDocument(
  data,
  actors,
  {
    vulnerabilityMultiplier = 2
  } = {}
) {

  const storedFlags =
    structuredClone(
      data.flags ??
      {}
    );


  const fixture = {
    uuid:
      "Actor.fixture",

    id:
      "fixture",

    name:
      data.name,

    documentName:
      "Actor",

    isToken:
      false,

    system:
      structuredClone(
        data.system
      ),

    items:
      new Map(
        Array.from(
          data.items ??
          []
        ).map(
          (
            item,
            index
          ) => [
            item._id ??
              `item-${index}`,
            item
          ]
        )
      ),

    getFlag(
      moduleId,
      key
    ) {

      return storedFlags[
        moduleId
      ]?.[key];
    },

    validate() {

      return true;
    },

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


      let amount;


      if (
        Array.isArray(
          damage
        )
      ) {

        const entry =
          damage[0];


        const multipliers = {
          electric:
            0.5,

          ground:
            vulnerabilityMultiplier,

          normal:
            1
        };


        amount =
          Number(
            entry.value
          ) *
          (
            multipliers[
              entry.type
            ] ??
            1
          );

      } else {

        amount =
          Number(
            damage
          );
      }


      hp.value =
        Math.max(
          0,
          hp.value -
          amount
        );
    },

    async getTokenDocument() {

      return {
        toObject() {

          return {
            _id:
              "ephemeral-token",

            actorId:
              fixture.id,

            actorLink:
              false,

            x:
              100,

            y:
              100
          };
        }
      };
    },

    async delete() {

      this.deleted =
        true;


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


  return fixture;
}


function installGlobals({
  vulnerabilityMultiplier = 2,
  source = createSourceActor()
} = {}) {

  installFoundryUtils();


  const actors =
    source
      ? [
          source
        ]
      : [];


  const scenes =
    [];


  const notifications =
    [];


  globalThis.ui = {
    notifications: {
      info(message) {
        notifications.push({
          type:
            "info",
          message
        });
      },

      error(message) {
        notifications.push({
          type:
            "error",
          message
        });
      }
    }
  };


  globalThis.game = {
    user: {
      isGM:
        true
    },

    actors,
    scenes
  };


  globalThis.fromUuidSync =
    uuid =>
      actors.find(
        actor =>
          actor.uuid ===
          uuid
      ) ??
      null;


  globalThis.Actor = {
    implementation: {
      async create(
        data
      ) {

        const fixture =
          createFixtureDocument(
            data,
            actors,
            {
              vulnerabilityMultiplier
            }
          );


        actors.push(
          fixture
        );


        return fixture;
      }
    }
  };


  globalThis.Scene = {
    implementation: {
      async create(
        data
      ) {

        const storedFlags =
          structuredClone(
            data.flags ??
            {}
          );


        const scene = {
          uuid:
            "Scene.fixture",

          id:
            "fixture-scene",

          name:
            data.name,

          getFlag(
            moduleId,
            key
          ) {

            return storedFlags[
              moduleId
            ]?.[key];
          },

          async createEmbeddedDocuments() {

            return [
              {
                actor: {
                  uuid:
                    "Scene.fixture.Token.token.Actor.fixture",

                  name:
                    "Synthetic Pikachu",

                  isToken:
                    true,

                  getFlag(
                    moduleId,
                    key
                  ) {

                    if (
                      moduleId !==
                        MODULE_ID
                    ) {

                      return undefined;
                    }


                    if (
                      key ===
                        "sourceId"
                    ) {

                      return "pikachu";
                    }


                    return undefined;
                  }
                }
              }
            ];
          },

          async delete() {

            this.deleted =
              true;


            const index =
              scenes.indexOf(
                this
              );


            if (
              index >= 0
            ) {

              scenes.splice(
                index,
                1
              );
            }
          }
        };


        scenes.push(
          scene
        );


        return scene;
      }
    }
  };


  return {
    actors,
    scenes,
    notifications
  };
}


async function importFixtures() {

  return import(
    `../scripts/foundry-regression-fixtures.mjs?test=${Date.now()}-${Math.random()}`
  );
}


test(
  "Foundry fixtures: usa un clon temporal y no modifica el Actor fuente",
  async () => {

    const source =
      createSourceActor();


    const globals =
      installGlobals({
        source
      });


    const module =
      await importFixtures();


    const result =
      await module.runFoundryRegressionFixtures({
        notify:
          false
      });


    assert.equal(
      result.summary.fail,
      0
    );


    assert.equal(
      result.summary.pass,
      10
    );


    assert.equal(
      result.summary.skip,
      1
    );


    assert.equal(
      source.system.attributes.hp.value,
      10
    );


    assert.equal(
      globals.actors.length,
      1
    );


    assert.equal(
      globals.scenes.length,
      0
    );
  }
);


test(
  "Foundry fixtures: detecta una vulnerabilidad mal resuelta por D&D5e",
  async () => {

    installGlobals({
      vulnerabilityMultiplier:
        1
    });


    const module =
      await importFixtures();


    const result =
      await module.runFoundryRegressionFixtures({
        notify:
          false
      });


    const vulnerability =
      result.checks.find(
        check =>
          check.id ===
            "fixture.damage.vulnerability"
      );


    assert.equal(
      vulnerability.status,
      "fail"
    );


    assert.deepEqual(
      vulnerability.details,
      {
        baseDamage:
          2,

        expected:
          4,

        observed:
          2
      }
    );
  }
);


test(
  "Foundry fixtures: crea un Actor sintético no enlazado en una escena temporal",
  async () => {

    installGlobals();


    const module =
      await importFixtures();


    const result =
      await module.runFoundryRegressionFixtures({
        notify:
          false
      });


    const synthetic =
      result.checks.find(
        check =>
          check.id ===
            "fixture.synthetic-token"
      );


    assert.equal(
      synthetic.status,
      "pass"
    );


    assert.equal(
      synthetic.details.sourceId,
      "pikachu"
    );
  }
);


test(
  "Foundry fixtures: cleanup elimina fixtures abandonados",
  async () => {

    const globals =
      installGlobals();


    const metadata = {
      kind:
        "foundry-fixture"
    };


    const abandonedActor = {
      uuid:
        "Actor.abandoned",

      getFlag() {
        return metadata;
      },

      async delete() {
        this.deleted =
          true;
      }
    };


    const abandonedScene = {
      uuid:
        "Scene.abandoned",

      getFlag() {
        return metadata;
      },

      async delete() {
        this.deleted =
          true;
      }
    };


    globals.actors.push(
      abandonedActor
    );

    globals.scenes.push(
      abandonedScene
    );


    const module =
      await importFixtures();


    const cleanup =
      await module.cleanupFoundryRegressionFixtures({
        notify:
          false
      });


    assert.equal(
      cleanup.actors,
      1
    );


    assert.equal(
      cleanup.scenes,
      1
    );


    assert.deepEqual(
      cleanup.failures,
      []
    );


    assert.equal(
      abandonedActor.deleted,
      true
    );


    assert.equal(
      abandonedScene.deleted,
      true
    );
  }
);


test(
  "Foundry fixtures: sin Pokémon importados devuelve SKIP y no crea documentos",
  async () => {

    const globals =
      installGlobals({
        source:
          null
      });


    const module =
      await importFixtures();


    const result =
      await module.runFoundryRegressionFixtures({
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
      0
    );


    assert.equal(
      globals.scenes.length,
      0
    );
  }
);
