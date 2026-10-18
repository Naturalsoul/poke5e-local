# Spec: stat-modifiers

Module of [CAPABILITY-MAP-moves.md](CAPABILITY-MAP-moves.md). Depends on move-coverage (done).

## Objective

Moves that change AC, attack rolls, saving throws, speed or damage bonuses should apply and remove those
changes on their own, the way Growl, Leer, Screech, Tail Whip and Mud-Slap already do. Today 210 moves are
`pending: stat-modifiers` in `scripts/move-coverage.mjs`; 8 of them already have definitions in
`modifier-effects.mjs` but only get a GM chat button, because the triggers they need don't exist.

User: the GM (no button clicks for routine buffs/debuffs) and players (their sheet shows the real numbers).

Acceptance criteria:

1. **Triggers.** `modifier-automation.mjs` applies a definition automatically for each trigger:
   - `failed-save` — exists (Growl).
   - `hit` — exists (Mud-Slap).
   - `self` — new: applied to the user when the move's usage message is created.
   - `hit-and-failed-save` — new: applied when the same usage both hits and the target fails the save (Acid Spray).
   - `natural-attack-N+` — new: applied when the natural d20 is N or more, hit or miss, same contract as Scald (Bubble Beam, Mud Shot).
2. **Concentration.** A modifier from a concentration move ends when that concentration ends
   (Acid Armor, Agility, Aqua Ring, Defend Order, Growth).
3. **The 8 existing definitions** (acid-spray, acid-armor, agility, amnesia, growth, defense-curl, aqua-ring,
   defend-order) are automated, or each one left on the button has a written reason in the registry.
4. **The remaining ~200 moves** are each either given a definition and automated, or moved out of
   `stat-modifiers` (another module, `manual` with reason, or `plain-damage`). Most entries in this module came
   from keyword guesses and have never been read; reading them is part of the work.
5. Automated moves are moved to `automated` in the registry, and the coverage test enforces it through
   `AUTOMATED_MODIFIER_MOVES`.
6. Nothing applies twice: an automated move no longer shows the chat button (current behaviour, kept), and
   chat history re-rendering never reapplies effects (current behaviour, kept).

## Tech Stack

Foundry VTT 13.351+, dnd5e 5.3.3+, plain ES modules, Node 20 `node:test`. No new dependencies.

## Commands

```
Test (Windows: run from bash, npm's glob doesn't expand): node --test tests/*.test.mjs
Single: node --test tests/modifier-automation.test.mjs tests/move-coverage.test.mjs
Lint: npx eslint scripts/modifier-automation.mjs scripts/modifier-effects.mjs scripts/move-coverage.mjs
```

## Project Structure

```
scripts/modifier-effects.mjs     → definitions (definitionFor) + AUTOMATED_MODIFIER_MOVES — extended
scripts/modifier-automation.mjs  → trigger handling — new triggers
scripts/modifier-engine.mjs      → applyPokemonMoveModifier, stacking, chat button — reused, minimal changes
scripts/move-coverage.mjs        → registry — entries move to automated / other modules
tests/modifier-automation.test.mjs → one test per trigger + per newly enabled move
```

## Code Style

New definitions use the compact one-statement form of `mud-slap`, not the long vertical form:

```js
case "sharpen":
  return {
    name: language === "en" ? "Sharpen — Attacks +1d4" : "Afilar — Ataques +1d4",
    target: "self", trigger: "self", duration: { seconds: 60 },
    stack: { key: "sharpen", max: 1 }, changes: attackChanges("1d4")
  };
```

- Reuse `attackChanges`, `add` and the existing flags (`expireAtStartTurn`, `endTurnHealing`, `concentration`).
- Labels inline for new moves (`language === "en" ? … : …`), as in mud-slap.
- Spanish comments only where the why isn't obvious, matching the files.

## Design decisions

- **Concentration:** set `flags.dnd5e.dependentOn` on the applied effect to the uuid of the user's concentration
  effect. Verified in `systems/dnd5e/dnd5e.mjs` 5.3.3: `getDependents()` includes the `dependentOn` registry and
  `_onDelete` deletes dependents on the active GM's client (`addDependent` is deprecated since 5.2).
- **`self` trigger:** applied once per usage message, only by the active GM (`authority()`), only for live
  messages (the existing `live` set), so reloading chat never reapplies.
- **Partial definitions:** Acid Armor (`meleeRetaliation`) and Amnesia (`disableSelectedMove`) have
  unimplemented `pending` parts. The stat change is automated; the pending part goes in the registry `note`.

## Testing Strategy

`tests/modifier-automation.test.mjs`, same mocks and style as the Growl and Mud-Slap tests:

- per trigger: applies when it should, doesn't on a miss / successful save / low natural, doesn't reapply on
  re-render;
- concentration: ending concentration removes the modifier;
- per enabled move: the right changes and stack cap (table-driven where possible, like the Leer/Screech/Tail Whip test);
- `tests/move-coverage.test.mjs` keeps the registry honest with no changes.

## Boundaries

- Always: one batch of moves per commit; run the coverage and modifier tests before each commit.
- Ask first: removing the chat button for moves that aren't automated; changing stacking rules of existing
  moves; anything that touches `turn-engine.mjs` beyond reading `expireAtStartTurn` / `endTurnHealing`.
- Never: change Growl/Leer/Screech/Tail Whip/Mud-Slap behaviour; skip or weaken existing tests.

## Success Criteria

- The 3 new triggers and concentration linking each have passing tests.
- The 8 existing definitions are automated, or listed with a reason.
- `scripts/move-coverage.mjs` has zero unread `stat-modifiers` entries: each is `automated`, moved out with a
  reason, or carries a `note` saying what is left.
- `node --test tests/*.test.mjs` fails only the 29 tests that already failed before this module.

## Decisions (2026-10-18)

1. **Growth** keeps the GM chat button: the GM picks the target. Registry: `manual`-style reason on its entry.
2. **Batches** are grouped by change type (AC, attacks, saves, speed, other), so each batch reuses one pattern.
3. **Damaging moves:** automate only the modifier rider; the damage path is not touched.
