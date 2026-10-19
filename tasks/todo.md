# Tasks: battle hotbar (branch feature/ui)

Page 1 of the hotbar follows the Pokémon in battle (user, 2026-10-19). Pending work lives in [backlog.md](backlog.md).

- [x] 1. Moves of the deployed Pokémon from slot 1, the trainer's path actions ending at slot 10.
- [x] 2. Follows the last deployed Pokémon, and the selected token when it is another active Pokémon of the trainer.
  The GM gets it too, for the trainer Pokémon whose token it selects.
- [x] 3. Each slot shows the PP or uses left, greyed out at 0, refreshed when they change.
- [x] 4. Macros are the user's own, reused between Pokémon; only page 1 slots are rewritten.
- Verify: `node --test tests/*.test.mjs` (only the 29 old failures), lint clean on new files.
