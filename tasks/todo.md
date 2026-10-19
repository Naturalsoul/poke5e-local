# Tasks: trainer combat features

Decisions (user, 2026-10-19): reactions that change a rolled result use a waiting prompt shown only when the
feature would change the outcome; the prompt goes to the player who owns the trainer (socket, timeout → not
used), or to the GM if no owner is connected. Automation waits for the answer. Prompts appear after Dice So Nice.

- [x] 1. Reaction broker (`scripts/trainer-reaction-service.mjs`)
  - Acceptance: `askTrainerReaction(trainer, prompt)` resolves with the form values or null; asks locally when the
    current user is the deciding owner, otherwise over the socket; timeout resolves null; GM fallback when no
    owner player is active; a response from another user than the one asked is ignored.
  - Verify: `node --test tests/trainer-reactions.test.mjs`

- [x] 2. Attack reactions before the attack outcome is dispatched
  - Acceptance: `attack-outcome-engine` waits for registered reactions (after Dice So Nice) and dispatches the
    final hit/miss; Sabotage moves into this pipeline (status-on-hit no longer fires for a sabotaged miss);
    Raise Your Defenses (Tactician 9) offered only when ≤5 points and ≤ available make a hit miss;
    Battle Die (Ace Trainer 5, d6 → d8 at 9 → d10 at 15) offered only when the attacker's miss could become a hit.
  - Verify: attack outcome + trainer feature tests.

- [x] 3. Save reactions before the save outcome is recorded
  - Acceptance: Raise Your Defenses on a failed save of the trainer's Pokémon (≤5 to succeed);
    Not This Time (Tactician 15) on an opponent's successful save against the trainer's Pokémon's Move (≤5 to fail).
  - Verify: save outcome + trainer feature tests.

- [ ] 4. Damage features
  - Acceptance: Battle Dice button adds a die to the latest damage roll of the trainer's Pokémon (applied from the
    card as usual); Directed Strike (Tactician 5) armed by a button, rolls the next damage twice and keeps the higher;
    Sinister Dodge (Grunt 9) offered on a Move's damage roll against the trainer's Pokémon, stepping its resistance
    one level when the damage is applied.
  - Verify: trainer feature tests.

- [ ] 5. Dark Advantage (Grunt 5)
  - Acceptance: button spends 3 Shadow Points and arms advantage on the next skill check, attack or save of the
    trainer or one of its Pokémon; consumed on that roll.

- [ ] 6. Nefarious Stagger (Grunt 15)
  - Acceptance: when one of the trainer's Pokémon inflicts Flinched, the owner may spend 2 Shadow Points to inflict
    Stunned instead.
