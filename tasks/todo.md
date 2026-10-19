# Tasks: Pokémon Abilities (branch feature/pokemon_abilities)

Coverage of every Ability: `scripts/ability-coverage.mjs` (checked by `tests/ability-coverage.test.mjs`).
Before batch 1: 21 of 311 current Abilities automated. After batch 2: 80 automated, 184 pending, 47 manual.
Order: the campaign's Pokémon first, then the modules with the most Abilities that are easy to read from tables.
Pending work outside this branch lives in [backlog.md](backlog.md).

- [x] 1. Tables: status immunities (Insomnia, Limber, Own Tempo...), damage defenses by type or Move (Levitate,
  Volt Absorb, Thick Fat, Soundproof...), next attack with advantage when hit (Sap Sipper, Rattled...), Multiscale,
  no extra critical damage (Shell Armor...), attack modifiers (Compound Eyes, No Guard, Super Luck...), damage
  bonuses (Rivalry, Competitive...), Rough Skin, Iron Barbs, Rock Head, Shed Skin, Early Bird.
- [x] 2. Once per rest (agreed with the user): switched on beforehand from the sheet or the battle hotbar
  (Intimidate, Cute Charm, Light Metal, Fur Coat, Friend Guard, Shield Dust, Huge Power, Pure Power); a prompt only
  when it changes a rolled result (Heavy Metal, Steadfast).
- [ ] 3. roll-twice: Adaptability, Iron Fist, Strong Jaw, Technician... and Sturdy.
- [ ] 4. berries: Gluttony, Harvest, Ripen, Cheek Pouch, Cud Chew, Unnerve.
- [ ] 5. status-riders, battle-flow, damage-riders, on-faint, type-change, stat-protection.
- [ ] 6. Weather and terrain state, then its 37 Abilities. Auras and forms after that.
- Verify: `node --test tests/*.test.mjs` (only the 29 old failures), lint clean on new files.
