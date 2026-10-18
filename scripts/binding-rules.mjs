// Solo movimientos que tienen daño continuado según el catálogo Poke5e.
// Snap Trap no lo tiene; Magma Storm es un área y no un atrapamiento.
export const BINDING_CONTINUATIONS = Object.freeze({
  bind: { activation: "bonus", modifier: null },
  wrap: { activation: "bonus", modifier: null },
  clamp: { activation: "bonus", modifier: null },
  "sand-tomb": { activation: "action", modifier: "MOVE" },
  whirlpool: { activation: "action", modifier: "MOVE" },
  "thunder-cage": { activation: "action", modifier: "MOVE" }
});

export function bindingDefinition(move, level = 1) {
  const automatic = ["fire-spin", "infestation"].includes(move.id);
  if (!automatic && !BINDING_CONTINUATIONS[move.id]) {return null;}
  const dice = Object.entries(move.damage?.dice ?? {}).filter(([minimum]) => Number(minimum) <= level)
    .sort(([left], [right]) => Number(right) - Number(left))[0]?.[1];
  if (!dice) {return null;}
  return {
    kind: "binding", timing: automatic ? "end-turn" : "continuation",
    damage: { formula: dice, type: move.type }, remainingTurns: automatic ? 3 : null,
    maxDurationSeconds: move.id === "clamp" ? 60 : null,
    concentration: automatic, removeWhenFainted: true, removeOnCombatEnd: true, removeOnSwitch: true
  };
}
