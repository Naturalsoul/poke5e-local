# Tasks: Pokémon Abilities (branch feature/pokemon_abilities)

Coverage of every Ability: `scripts/ability-coverage.mjs` (checked by `tests/ability-coverage.test.mjs`).
Before batch 1: 21 of 311 current Abilities automated. After batch 5: 159 automated, 104 pending, 48 manual.
Order: the campaign's Pokémon first, then the modules with the most Abilities that are easy to read from tables.
Pending work outside this branch lives in [backlog.md](backlog.md).

- [x] 1. Tables: status immunities (Insomnia, Limber, Own Tempo...), damage defenses by type or Move (Levitate,
  Volt Absorb, Thick Fat, Soundproof...), next attack with advantage when hit (Sap Sipper, Rattled...), Multiscale,
  no extra critical damage (Shell Armor...), attack modifiers (Compound Eyes, No Guard, Super Luck...), damage
  bonuses (Rivalry, Competitive...), Rough Skin, Iron Barbs, Rock Head, Shed Skin, Early Bird.
- [x] 2. Once per rest (agreed with the user): switched on beforehand from the sheet or the battle hotbar
  (Intimidate, Cute Charm, Light Metal, Fur Coat, Friend Guard, Shield Dust, Huge Power, Pure Power); a prompt only
  when it changes a rolled result (Heavy Metal, Steadfast).
- [x] 3. Roll again once the damage is shown (keeps the higher total: Adaptability, Iron Fist, Strong Jaw,
  Technician...; the lower one: Prism Armor), and the targets' d4 (Sturdy, Filter) stored on the damage message.
- [x] 4. Berries: Ripen and Cheek Pouch in the berry's healing, Gluttony eats it at half HP, Harvest and Cud Chew
  at the end of turn, Unnerve blocks opponents' berries. As One stays with on-faint (it is also Chilling/Grim Neigh).
- [x] 5. Riders on the Move's damage (type changes, Merciless, Sniper, Sharpness, Tough Claws, Tinted Lens, Scrappy...),
  events (hit by a Move, fainting, stat changes, statuses, turns, switches, rests) and effects while a condition holds
  (Unburden, Marvel Scale, Quick Feet). Still pending from these modules: Skill Link, Sheer Force, Gorilla Tactics,
  Stakeout, Magic Guard, Protean, Libero, Color Change (types need the GM), Power of Alchemy, Receiver, Mirror Armor,
  Opportunist, Unaware, Curious Medicine, Toxic Debris, Healer.
- [ ] 6. Weather and terrain state, then its 37 Abilities. Auras and forms after that.
- Verify: `node --test tests/*.test.mjs` (only the 29 old failures), lint clean on new files.
