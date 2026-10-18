import test from "node:test";
import assert from "node:assert/strict";
import {
  createAbilityItem,
  createFlagDocument,
  createHooks,
  installFoundryUtils
} from "./helpers/foundry-mocks.mjs";

installFoundryUtils();
const hooks = createHooks();
const documentListeners = new Map();

globalThis.document = {
  addEventListener(name, handler) {
    const handlers = documentListeners.get(name) ?? [];
    handlers.push(handler);
    documentListeners.set(name, handlers);
  }
};

globalThis.CONFIG = {
  Dice: {
    D20Roll: {
      ADV_MODE: {
        NORMAL: 0,
        ADVANTAGE: 1,
        DISADVANTAGE: -1
      }
    }
  }
};

globalThis.canvas = {
  tokens: {
    controlled: []
  }
};

globalThis.game = {
  settings: {
    get() {
      return "es";
    }
  },
  messages: new Map(),
  user: {
    character: null
  }
};

function moveItem({
  sourceId = "test-save",
  actor = null
} = {}) {
  return {
    uuid: `Item.${sourceId}`,
    name: sourceId,
    actor,
    documentName: "Item",
    getFlag(moduleId, key) {
      if (moduleId !== "poke5e-local") {
        return undefined;
      }
      if (key === "kind") {
        return "move";
      }
      if (key === "sourceId") {
        return sourceId;
      }
      return undefined;
    }
  };
}

function saveActivity(item, {
  id = "save-activity",
  ability = "dex",
  dc = 12,
  onSave = "half",
  activation = "action"
} = {}) {
  return {
    id,
    type: "save",
    item,
    activation: {
      type: activation
    },
    save: {
      ability: {
        first() {
          return ability;
        }
      },
      dc: {
        value: dc
      }
    },
    damage: {
      onSave
    }
  };
}

function usageMessage({
  id,
  item,
  activity,
  moduleFlags = {}
}) {
  const flags = structuredClone(moduleFlags);

  return {
    id,
    getAssociatedItem() {
      return item;
    },
    getAssociatedActivity() {
      return activity;
    },
    getFlag(moduleId, key) {
      return flags[moduleId]?.[key];
    }
  };
}

function saveButtonEvent(messageId, {
  ability = "dex",
  dc = 12
} = {}) {
  const messageElement = {
    dataset: {
      messageId
    }
  };

  const button = {
    dataset: {
      ability,
      dc: String(dc)
    },
    closest(selector) {
      if (selector === 'button[data-action="rollSave"]') {
        return this;
      }
      if (selector === "[data-message-id]") {
        return messageElement;
      }
      return null;
    }
  };

  return {
    target: button
  };
}

function beginSaveBatch(message, actors, options = {}) {
  game.messages.set(message.id, message);
  canvas.tokens.controlled = actors.map(actor => ({ actor }));
  const clickHandlers = documentListeners.get("click") ?? [];
  assert.ok(clickHandlers[0], "SaveOutcome click capture was not registered.");
  clickHandlers[0](saveButtonEvent(message.id, options));
}

function rollSavingThrow(actor, {
  ability = "dex",
  target = 12,
  total = 10,
  success = false
} = {}) {
  const roll = {
    total,
    isSuccess: success,
    options: {
      target
    }
  };

  hooks.handler("dnd5e.rollSavingThrow")(
    [roll],
    {
      subject: actor,
      ability
    }
  );

  return roll;
}

function damageMessage(item, origin, onSave) {
  return {
    getAssociatedItem() {
      return item;
    },
    getOriginatingMessage() {
      return origin;
    },
    getFlag(moduleId, key) {
      if (
        moduleId === "dnd5e" &&
        key === "roll.damageOnSave"
      ) {
        return onSave;
      }
      return undefined;
    }
  };
}

const saveOutcome = await import("../scripts/save-outcome-engine.mjs");
saveOutcome.registerSaveOutcomeEngine();

test("native saving throws carry the exact move and target context without requiring save advantage", () => {
  const item = moveItem({ sourceId: "growl" });
  const activity = saveActivity(item, { ability: "wis", dc: 13 });
  const message = usageMessage({ id: "Message.growl-context", item, activity });
  const target = createFlagDocument({ uuid: "Actor.growl-context" });
  beginSaveBatch(message, [target], { ability: "wis", dc: 13 });
  const rollConfig = { options: { ability: "wis", target: 13 } };
  hooks.handler("dnd5e.preRollSavingThrow")({ subject: target, ability: "wis", rolls: [rollConfig] });
  assert.deepEqual(rollConfig.options["poke5e-local"].modifierUsage, {
    usageMessageId: message.id, itemUuid: item.uuid, actorUuid: target.uuid, dc: 13
  });
  assert.equal(rollConfig.options.advantage, undefined);
  rollSavingThrow(target, { ability: "wis", target: 13 });
  const unrelated = { options: { ability: "wis", target: 13 } };
  hooks.handler("dnd5e.preRollSavingThrow")({ subject: target, ability: "wis", rolls: [unrelated] });
  assert.equal(unrelated.options["poke5e-local"], undefined);
});

test("SaveOutcome tracks a multi-target batch until every expected save resolves", () => {
  const item = moveItem();
  const activity = saveActivity(item);
  const message = usageMessage({
    id: "Message.save-batch",
    item,
    activity
  });
  const first = createFlagDocument({
    uuid: "Actor.save-first",
    name: "First"
  });
  const second = createFlagDocument({
    uuid: "Actor.save-second",
    name: "Second"
  });

  beginSaveBatch(message, [first, second]);

  assert.deepEqual(
    saveOutcome.getSaveProgress(message.id),
    {
      expected: 2,
      resolved: 0,
      pending: 2,
      complete: false
    }
  );

  rollSavingThrow(first, {
    total: 15,
    success: true
  });
  rollSavingThrow(second, {
    total: 8,
    success: false
  });

  assert.equal(saveOutcome.getSaveOutcome(message.id, first).success, true);
  assert.equal(saveOutcome.getSaveOutcome(message.id, second).failure, true);
  assert.deepEqual(
    saveOutcome.getSaveProgress(message.id),
    {
      expected: 2,
      resolved: 2,
      pending: 0,
      complete: true
    }
  );
});

test("successful save with half damage scales fresh damage values once", () => {
  const item = moveItem({ sourceId: "half-save" });
  const activity = saveActivity(item, { onSave: "half" });
  const message = usageMessage({
    id: "Message.half-save",
    item,
    activity
  });
  const target = createFlagDocument({
    uuid: "Actor.half-save",
    name: "Half Save"
  });

  beginSaveBatch(message, [target]);
  rollSavingThrow(target, {
    total: 18,
    success: true
  });

  const damages = [
    { value: 10, type: "fire" },
    { value: 4, type: "normal" }
  ];
  const options = {
    originatingMessage: damageMessage(item, message, "half")
  };

  hooks.handler("dnd5e.preCalculateDamage")(target, damages, options);

  assert.deepEqual(
    damages.map(entry => entry.value),
    [5, 2]
  );
  assert.equal(
    options["poke5e-local"].saveOutcome.multiplier,
    0.5
  );
});

test("successful save with none damage reduces the save damage to zero", () => {
  const item = moveItem({ sourceId: "none-save" });
  const activity = saveActivity(item, { onSave: "none" });
  const message = usageMessage({
    id: "Message.none-save",
    item,
    activity
  });
  const target = createFlagDocument({
    uuid: "Actor.none-save",
    name: "None Save"
  });

  beginSaveBatch(message, [target]);
  rollSavingThrow(target, {
    total: 20,
    success: true
  });

  const damages = [{ value: 13, type: "psychic" }];
  const options = {
    originatingMessage: damageMessage(item, message, "none")
  };

  hooks.handler("dnd5e.preCalculateDamage")(target, damages, options);

  assert.equal(damages[0].value, 0);
  assert.equal(options["poke5e-local"].saveOutcome.multiplier, 0);
});

test("failed save preserves full damage", () => {
  const item = moveItem({ sourceId: "failed-save" });
  const activity = saveActivity(item, { onSave: "half" });
  const message = usageMessage({
    id: "Message.failed-save",
    item,
    activity
  });
  const target = createFlagDocument({
    uuid: "Actor.failed-save",
    name: "Failed Save"
  });

  beginSaveBatch(message, [target]);
  rollSavingThrow(target, {
    total: 3,
    success: false
  });

  const damages = [{ value: 11, type: "water" }];
  const options = {
    originatingMessage: damageMessage(item, message, "half")
  };

  hooks.handler("dnd5e.preCalculateDamage")(target, damages, options);

  assert.equal(damages[0].value, 11);
  assert.equal(options["poke5e-local"].saveOutcome.multiplier, 1);
});

test("Berserk snapshots target save Advantage and preserves Advantage after HP later changes", () => {
  const source = createFlagDocument({
    uuid: "Actor.berserk-source",
    items: [createAbilityItem("berserk")],
    system: {
      attributes: {
        hp: {
          value: 2,
          max: 10
        }
      }
    }
  });
  const item = moveItem({
    sourceId: "berserk-save",
    actor: source
  });
  const activity = saveActivity(item);
  const messageConfig = { data: {} };

  hooks.handler("dnd5e.preCreateUsageMessage")(activity, messageConfig);

  const snapshot =
    messageConfig.data.flags["poke5e-local"].targetSaveAdvantage;
  assert.deepEqual(snapshot.sources, ["berserk"]);

  const message = usageMessage({
    id: "Message.berserk-save",
    item,
    activity,
    moduleFlags: messageConfig.data.flags
  });
  const target = createFlagDocument({
    uuid: "Actor.berserk-target",
    name: "Berserk Target"
  });

  source.system.attributes.hp.value = 10;
  beginSaveBatch(message, [target]);

  const rollConfig = {
    options: {
      ability: "dex",
      target: 12
    }
  };
  hooks.handler("dnd5e.preRollSavingThrow")({
    subject: target,
    ability: "dex",
    rolls: [rollConfig]
  });

  assert.equal(rollConfig.options.advantage, true);
  assert.deepEqual(
    rollConfig.options["poke5e-local"].targetSaveAdvantage.sources,
    ["berserk"]
  );

  let configured = false;
  const roll = {
    options: {
      ...rollConfig.options,
      advantageMode: CONFIG.Dice.D20Roll.ADV_MODE.NORMAL
    },
    configureModifiers() {
      configured = true;
    }
  };

  hooks.handler("dnd5e.postRollConfiguration")([roll]);

  assert.equal(
    roll.options.advantageMode,
    CONFIG.Dice.D20Roll.ADV_MODE.ADVANTAGE
  );
  assert.equal(configured, true);
});

test("target save Advantage cancels an explicit Disadvantage to Normal", () => {
  const source = createFlagDocument({
    uuid: "Actor.berserk-cancel",
    items: [createAbilityItem("berserk")],
    system: {
      attributes: {
        hp: {
          value: 1,
          max: 10
        }
      }
    }
  });
  const item = moveItem({
    sourceId: "berserk-cancel-save",
    actor: source
  });
  const activity = saveActivity(item);
  const messageConfig = { data: {} };
  hooks.handler("dnd5e.preCreateUsageMessage")(activity, messageConfig);

  const message = usageMessage({
    id: "Message.berserk-cancel",
    item,
    activity,
    moduleFlags: messageConfig.data.flags
  });
  const target = createFlagDocument({
    uuid: "Actor.berserk-cancel-target",
    name: "Cancel Target"
  });

  beginSaveBatch(message, [target]);

  const rollConfig = {
    options: {
      ability: "dex",
      target: 12,
      disadvantage: true
    }
  };
  hooks.handler("dnd5e.preRollSavingThrow")({
    subject: target,
    ability: "dex",
    rolls: [rollConfig]
  });

  const roll = {
    options: {
      ...rollConfig.options,
      advantageMode: CONFIG.Dice.D20Roll.ADV_MODE.DISADVANTAGE
    },
    configureModifiers() {}
  };

  hooks.handler("dnd5e.postRollConfiguration")([roll]);

  assert.equal(
    roll.options.advantageMode,
    CONFIG.Dice.D20Roll.ADV_MODE.NORMAL
  );
});
