# Plan: stat-modifiers

Spec: [SPEC-stat-modifiers.md](../SPEC-stat-modifiers.md) · Map: [CAPABILITY-MAP-moves.md](../CAPABILITY-MAP-moves.md)
Previous module: [move-coverage/plan.md](move-coverage/plan.md)

## Components

1. **Triggers** in `modifier-automation.mjs`: `self` (new), `natural-attack-N+` (new), `hit-and-failed-save` (new).
   The existing `failed-save` and `hit` stay as they are.
2. **Concentration link:** when a definition has `concentration: true`, the applied effect gets
   `flags.dnd5e.dependentOn` = the uuid of the user's concentration effect for that item. dnd5e then removes it.
3. **Definitions** in `modifier-effects.mjs`: the 8 existing ones get switched on, then new ones are added batch by batch.
4. **Registry** in `move-coverage.mjs`: each batch moves its entries to `automated` or out of the module.

## Order

1. **`self` trigger plus concentration** (vertical slice). Proven with **defense-curl** (no concentration,
   expires at the start of the next turn) and **agility** (concentration). This is the riskiest piece, so it goes first.
2. **Remaining self buffs that are already defined:** amnesia, acid-armor, aqua-ring, defend-order. Each partial
   part gets a `note`. Growth gets its reason (keeps the button).
3. **`natural-attack-N+` trigger.** Reuse the `^natural-attack-(\d+)\+$` parsing from `attack-status-engine.mjs`.
   Proven with **bubble-beam** (19+, speed halved) and **mud-shot** (16+, speed 0). Both definitions are new.
4. **`hit-and-failed-save` trigger.** Proven with **acid-spray**. It needs both pieces of the same usage
   (the attack message and the save message), so it keeps per-usage state keyed by `usageMessageId`.
5. **Classification batches by change type.** Each batch reads its moves, adds definitions with the existing
   triggers, and reclassifies whatever doesn't fit:
   - 5a AC (~55)
   - 5b attack rolls (~77)
   - 5c saving throws (~30)
   - 5d speed (~29)
   - 5e leftovers (damage bonuses, unusual ones)

   Batches overlap (a move can touch AC and attacks), so each move is handled in the first batch it fits.
6. **Final check:** no unread `stat-modifiers` entries remain, the full suite shows only the 29 old failures, then lint.

Steps 1 → 2 are sequential. Steps 3 and 4 only need step 1. Step 5 needs 1, 3 and 4 (all triggers available).

## Risks

| Risk | Mitigation |
|---|---|
| At the moment the usage message is created, the concentration effect doesn't exist yet | In task 1, check the order in dnd5e 5.3.3 (`Activity#use` → `beginConcentrating` → message). If it comes later, apply the effect from the `dnd5e.beginConcentrating` hook instead |
| A self buff gets applied twice: by the new trigger and by dnd5e's "apply effect" button from `activityEffects` | The builder stops emitting `activityEffects` for automated moves, or the trigger skips the move if the effect already exists (the stack key already prevents duplicates). Decided in task 1 with a test |
| The two messages for `hit-and-failed-save` arrive in either order | Per-usage state that applies the effect when the second condition arrives. Test both orders |
| Batch 5 is long (~200 descriptions) | One commit per batch, each batch in its own session |
| A batch finds many moves that aren't really modifiers | Reclassify them: that's also progress, and the coverage test keeps it honest |

## Checkpoints

- After step 1: defense-curl and agility apply on use, and agility's effect disappears when concentration ends (tested).
- After step 4: all 5 triggers have tests, and the 8 original definitions are resolved.
- After each batch in step 5: the coverage test is green, and the `pending:stat-modifiers` count goes down.
