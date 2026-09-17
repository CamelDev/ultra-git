---
phase: 06-automatic-conflict-resolution-advanced-merging
plan: 02
subsystem: conflict-resolution
tags: [git, conflicts, regions, composition, contracts]
requires: [06-01]
provides:
  - "Shared operation, document, region, selection, error, and undo contracts"
  - "Deterministic non-mutating conflict-region derivation and whole-file composition"
affects: [06-03, 06-04, 06-05, 06-09]
tech-stack:
  added: []
  patterns: [stable region identity, explicit unresolved choice, byte-aware composition]
key-files:
  created:
    - src/shared/conflicts.ts
    - src/main/conflictRegions.ts
    - src/main/__tests__/conflictRegions.test.ts
key-decisions:
  - "Region identity binds generation, stage OIDs, ranges, modes, and content hashes."
  - "Composition is whole-document and rejects unresolved or stale region selections."
  - "Side ranges expand across grouped overlaps so choosing a side preserves unchanged bytes within the group."
patterns-established:
  - "All region choices start unresolved; viewing never silently chooses a side."
requirements-completed: [CONFLICT-02]
status: complete
---

# Phase 6 Plan 2 Summary

Defined the shared conflict contracts and implemented a deterministic, non-mutating region engine. The engine derives base-to-side edit regions, groups overlapping/touching edits, handles zero-width insertions with stable ordering, preserves EOL/final-newline metadata, and validates stale identities before composition.

## Verification

- `bun test src/main/__tests__/conflictRegions.test.ts` — 7 passed, 0 failed.
- `bun run build` — passed.

## Next Phase Readiness

Plan 06-03 can consume the shared contracts and use `deriveConflictRegions`/`composeConflictResult` as the authoritative document-level model.
