# Spec: move-coverage

Module of [CAPABILITY-MAP-moves.md](CAPABILITY-MAP-moves.md). Foundation for every other module.

## Objective

Today nobody can answer "which moves are automated?" without grepping ~30 tables. This module adds one
registry that classifies all 830 moves, and a test that fails when a move is unclassified or when the
registry disagrees with the engines. Every later module works by moving ids from `pending` to `automated`,
so the registry doubles as the backlog and the progress meter.

User: the module developer (and the GM indirectly, by knowing what to run by hand).

Acceptance criteria:

1. Every non-deprecated move id in `data/normalized/moves.json` appears in the registry exactly once.
2. Each entry has one of these statuses:
   - `automated` — an engine handles its effect today (lists which engine(s)).
   - `pending` — has an effect not yet automated; names the target module id from the capability map.
   - `manual` — deliberately left to the GM; one-line reason.
   - `plain-damage` — damage/save/attack only, nothing beyond what dnd5e activities already do.
3. Any move for which an exported builder returns data is marked `automated`
   (`buildMoveStatusEffects`, `buildMoveModifierEffects`, `buildMoveDrainData`, `buildMoveRecoilData`,
   `buildMoveForcedRecoilData`, `buildMoveSelfDamageData`, `buildMoveMultiTargetData`,
   `buildMoveSaveResultData`, `buildMovePeriodicEffects`, `bindingDefinition`, `isStruggleMove`).
4. Engine-internal automation without a builder (dynamic-damage, confusion, flinch, move-requirement,
   move-lock, berserk, etc.) is marked `automated` by hand after reading that engine's id list.
5. A test prints a per-status / per-module count, so progress is visible in `npm test` output.
6. No runtime behaviour changes. Nothing new is registered in `main.mjs`.

## Tech Stack

Foundry VTT module, dnd5e system, plain ES modules (`.mjs`), Node 20 `node:test`. No new dependencies.

## Commands

```
Test: npm test
Single: node --test tests/move-coverage.test.mjs
Lint: npm run lint
```

## Project Structure

```
scripts/move-coverage.mjs      → the registry (frozen object keyed by move id) — new
tests/move-coverage.test.mjs   → completeness + cross-check test — new
CAPABILITY-MAP-moves.md        → module map
SPEC-move-coverage.md          → this file
```

The registry is a `.mjs` (not JSON) to match `binding-rules.mjs` / `recoil-effects.mjs`, and so other
modules can import it without a fetch.

## Code Style

Follow the existing table modules:

```js
export const MOVE_COVERAGE = Object.freeze({
  absorb: { status: "automated", engines: ["drain"] },
  "thunder-wave": { status: "automated", engines: ["status"] },
  agility: { status: "pending", module: "stat-modifiers" },
  "rain-dance": { status: "pending", module: "field-effects" },
  bide: { status: "manual", reason: "Tracks damage over turns; GM resolves." },
  "air-cutter": { status: "plain-damage" }
});
```

- Kebab-case move ids, same as `moves.json`.
- Module ids exactly as in the capability map.
- One entry per line where it fits; no comments except a `reason` field.

## Initial classification

1. A one-off script (in the scratchpad, not committed) seeds the registry: builder cross-check gives
   `automated`; the keyword buckets from the coverage scan give a suggested `pending` module; the rest
   get `plain-damage` as a suggestion.
2. Every `plain-damage` and `manual` suggestion is then checked against its English description by hand
   (riders such as "scores a critical on 19-20" or "if you are holding an item" move it to `pending`).
3. When a move has several effects, `pending.module` is the module that will do most of the work;
   the others are listed in an optional `also: [...]`.

## Testing Strategy

`tests/move-coverage.test.mjs` with `node:test`, reusing `tests/helpers/foundry-mocks.mjs` where builders
need Foundry globals:

- every live move in `moves.json` has an entry; no entry for a move id that doesn't exist;
- every status/module value is valid (module ids checked against a list copied from the map);
- every move for which a builder returns data is `automated`;
- prints the counts summary.

## Boundaries

- Always: run `npm test` and `npm run lint` before committing; keep `moves.json` untouched.
- Ask first: marking a move `manual` when it looks automatable; changing module ids; adding UI to show coverage.
- Never: change engine behaviour in this module; delete or skip existing tests.

## Success Criteria

- `node --test tests/move-coverage.test.mjs` passes and prints counts summing to 830.
- Temporarily removing any entry, or adding a builder definition for a `pending` move, makes the test fail.
- `npm test` and `npm run lint` pass.

## Decisions

- Hand review depth: every `plain-damage` and `manual` suggestion is checked against its description
  one by one (approved 2026-10-18).
