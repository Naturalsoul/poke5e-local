# Tasks: stat-modifiers

- [x] 1. `self` trigger and concentration link (defense-curl, agility)
  - Acceptance: using either move applies its modifier to the user once; re-rendering chat doesn't reapply it;
    the agility effect carries `flags.dnd5e.dependentOn` and disappears when its concentration is deleted;
    no duplicate from dnd5e's "apply effect" button; both moves are `automated` in the registry.
  - Verify: `node --test tests/modifier-automation.test.mjs tests/move-coverage.test.mjs`
  - Files: `scripts/modifier-automation.mjs`, `scripts/modifier-effects.mjs`, `scripts/move-coverage.mjs`,
    `tests/modifier-automation.test.mjs` (+ `scripts/builder.mjs` only if `activityEffects` must be dropped)

- [x] 2. Remaining defined self buffs (amnesia, acid-armor, aqua-ring, defend-order) + Growth reason
  - Acceptance: all 4 automated, with a `note` for the partial pieces (meleeRetaliation, disableSelectedMove);
    aqua-ring still heals at end of turn; growth keeps its button, with the reason in the registry.
  - Verify: modifier and coverage tests; existing turn-engine and modifier tests still pass.
  - Files: `scripts/modifier-effects.mjs`, `scripts/move-coverage.mjs`, `tests/modifier-automation.test.mjs`

- [x] 3. `natural-attack-N+` trigger (bubble-beam, mud-shot)
  - Acceptance: applies at or above N (hit or miss, like Scald), not below N, not from saves; speed halved / speed 0
    until end of the target's next turn.
  - Verify: modifier and coverage tests.
  - Files: `scripts/modifier-automation.mjs`, `scripts/modifier-effects.mjs`, `scripts/move-coverage.mjs`, tests

- [x] 4. `hit-and-failed-save` trigger (acid-spray)
  - Acceptance: applies only when the same usage hits and the target fails the save, in either message order; stacks to 3.
  - Verify: modifier and coverage tests.
  - Files: `scripts/modifier-automation.mjs`, `scripts/modifier-effects.mjs`, `scripts/move-coverage.mjs`, tests

- [x] 5a. Batch: AC modifiers
- [x] 5b. Batch: attack-roll modifiers
- [ ] 5c. Batch: saving-throw modifiers
- [ ] 5d. Batch: speed modifiers
- [ ] 5e. Batch: leftovers
- [ ] 5f. Batch: roll modes (advantage/disadvantage on the next attack, +5 against the target); needs a new "next attack" mechanism, notes say "5f roll modes"
  - Acceptance (each): every move in the batch is read; it's either defined and automated (with a test for each
    new shape of change) or reclassified with a module or reason; partial automation gets a `note`.
  - Verify: modifier and coverage tests; the `pending:stat-modifiers` count goes down.
  - Files: `scripts/modifier-effects.mjs`, `scripts/move-coverage.mjs`, `tests/modifier-automation.test.mjs`

- [ ] 6. Final check and commit
  - Verify: zero `pending:stat-modifiers` without a note; `node --test tests/*.test.mjs` shows only the 29 old failures; lint on the touched files.
