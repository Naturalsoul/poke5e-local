# Tasks: Researcher and Collector features

Evolution Expert (Researcher 9) stays manual: the module has no feat system.

- [x] 1. Analyst (Researcher 5) — button: the trainer's Investigation against the targeted Pokémon's Deception
  (ties go to the Pokémon); on success the trainer's owners and the GM learn its Ability and one random Move.
  Professor (Researcher 15) reveals one more Ability or Move.
- [x] 2. Disciplined Strikes (Collector 9) — after a Move's damage roll that would faint a targeted Pokémon
  (dnd5e's own calculation), the owner may choose to leave it at 1 HP; applied in dnd5e.preApplyDamage.
- [x] 3. Expert Tracker (Collector 15) — Tracker already has 2 uses; after spending one, a DC 11 Investigation
  or Nature check says whether a specific Pokémon from the local list can be encountered.
- Verify: `node --test tests/*.test.mjs` (only the 29 old failures), lint unchanged on touched files.
