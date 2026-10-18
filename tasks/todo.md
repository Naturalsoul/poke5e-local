# Tasks: move-coverage

- [x] 1. Seed the registry and write the coverage test
  - Acceptance: `scripts/move-coverage.mjs` has all 830 ids; builder-derived moves are `automated`, after confirming each builder's output is actually applied; `plain-damage`/`manual` suggestions carry `reviewed: false`; the test checks completeness, valid values and the builder cross-check, and prints the counts.
  - Verify: `node --test tests/move-coverage.test.mjs` passes (the reviewed check is skipped until task 7); deleting one entry makes it fail.
  - Files: `scripts/move-coverage.mjs`, `tests/move-coverage.test.mjs`

- [x] 2. Mark engine-internal automation by hand
  - Acceptance: outrage, magnitude, rollout, dream-eater, struggle and confusion are checked against their engines and marked; false positives (fly, psychic, round, punch list) are left out.
  - Verify: test green; `engines` names match the real files.
  - Files: `scripts/move-coverage.mjs`

- [x] 3. Review `plain-damage` suggestions a–f
- [x] 4. Review `plain-damage` suggestions g–o
- [x] 5. Review `plain-damage` suggestions p–s
- [x] 6. Review `plain-damage` suggestions t–z
  - Acceptance (each): every entry in the range is read against its English description; riders move to `pending` with a module; `reviewed: false` removed.
  - Verify: test green.
  - Files: `scripts/move-coverage.mjs`

- [x] 7. Review `manual` and `other` suggestions, then make the reviewed check strict
  - Acceptance: each is `manual` with a reason or `pending` with a module; the test now fails on any `reviewed: false`.
  - Verify: test green with the strict check on.
  - Files: `scripts/move-coverage.mjs`, `tests/move-coverage.test.mjs`

- [ ] 8. Final check and commit
  - Verify: `npm test` and `npm run lint` pass; the counts summary is pasted into the commit message.
  - Files: none new; the commit includes the spec, map, plan and todo
