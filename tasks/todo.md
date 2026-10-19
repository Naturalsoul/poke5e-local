# Tasks: trainer support features (Guru, Nurse)

Feat costs (Body's Tireless, Retention, Evolution Expert) stay manual: the module has no feat system.

- [x] 1. Guru L5 Mind — Pokémon proficient in WIS saves; confusion table rolls 2d8, keeps the higher.
  - Files: `trainer-path-effects.mjs` (changes + guruMind flag), `confusion-engine.mjs`.
- [x] 2. Guru L9 Body — a second ability per Pokémon, chosen from the command center; every engine sees it
  through `hasPokemonAbility`.
  - Files: `trainer-path-effects.mjs` (bodyAbilityId flag), `status-runtime.mjs`, `trainer-path-actions.mjs`.
- [x] 3. Guru L15 Spirit — button, 1 + WIS uses per long rest: +WIS to attack or damage rolls of the active
  Pokémon until the next turn of the trainer's Pokémon (Cheerleader's machinery).
- [x] 4. Nurse L5 Pokéchef — button, PB uses per long rest: heals the targeted creature 2d4+2 (3d10+6 at 9,
  4d12+10 at 15) after Dice So Nice.
- [x] 5. Nurse L9 Field Medic — button: DC 12 Medicine check, success removes a non-volatile status from the
  targeted Pokémon.
- [x] 6. Nurse L15 Tip-Top Shape — the trainer's Pokémon roll with advantage saves against Moves that inflict
  a status.
- Verify: `node --test tests/*.test.mjs` (only the 29 old failures), lint unchanged on touched files.
