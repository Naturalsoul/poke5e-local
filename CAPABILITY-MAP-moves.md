# Capability Map: Remaining Move Automation

Goal: every move in `data/normalized/moves.json` is either automated or explicitly marked manual / plain damage.
Approved 2026-10-18. Module ids are stable; do not rename.

| Module id | Responsibility | Depends on |
|---|---|---|
| move-coverage | Registry classifying every move (automated / pending module / manual / plain damage) + test that none is unclassified | — |
| status-riders | Status conditions applied on failed save or hit, extending `MOVE_STATUS_EFFECTS` | move-coverage |
| stat-modifiers | Enable already-defined modifiers in `modifier-effects.mjs`, then add the rest | move-coverage |
| attack-riders | Crit range, auto-hit, item-dependent damage | move-coverage |
| healing | Self/ally healing and status curing | move-coverage |
| forced-movement | Push, pull, prone (extends `forced-recoil`) | move-coverage |
| field-effects | New weather/terrain system | move-coverage, stat-modifiers |
| special-mechanics | Unusual moves (bide, conversion, assist...), likely GM-assisted | all of the above |

Build order: move-coverage → status-riders, stat-modifiers → attack-riders, healing, forced-movement → field-effects → special-mechanics

Specs: `SPEC-<module-id>.md` next to this file.
