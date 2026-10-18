const HEAL_ACTIVITY = "P5heldItemHeal00";
export const BERRY_ACTIVITY_ID = "P5consumeBerry00";

export function heldItemConfiguration(id, language = "es", itemType = null) {
  if (itemType === "berry") {
    return {
      uses: { max: "1", spent: 0, recovery: [], autoDestroy: true },
      activities: {
        [BERRY_ACTIVITY_ID]: {
          _id: BERRY_ACTIVITY_ID, type: "utility",
          name: language === "en" ? "Consume berry" : "Consumir baya",
          activation: { type: "reaction", value: 1 },
          consumption: { spellSlot: false, scaling: { allowed: false },
            targets: [{ type: "itemUses", target: "", value: "1" }] },
          target: { affects: { type: "self" } },
          flags: { "poke5e-local": { consumeBerry: true } }
        }
      }
    };
  }
  if (!["leftovers", "black-sludge", "focus-sash"].includes(id)) {return null;}
  const healing = id !== "focus-sash";
  return {
    uses: { max: healing ? "10" : "1", spent: 0, recovery: [{ period: "dawn", type: "recoverAll" }] },
    ...(healing ? { activities: {
      [HEAL_ACTIVITY]: {
        _id: HEAL_ACTIVITY, type: "utility",
        name: language === "en" ? "Recover HP" : "Recuperar PG",
        activation: { type: "bonus", value: 1 },
        consumption: { spellSlot: false, targets: [{ type: "itemUses", target: "", value: "1" }] },
        target: { affects: { type: "self" } },
        flags: { "poke5e-local": { heldItemHealing: true } }
      }
    } } : {})
  };
}

export function isHeldItemHealing(activity) {
  return activity?.id === HEAL_ACTIVITY;
}
