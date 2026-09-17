---
phase: 06-automatic-conflict-resolution-advanced-merging
plan: 09
subsystem: conflict-resolution
tags: [conflicts, candidates, rerere-alternative, electron-ipc]
requires:
  - phase: 06-automatic-conflict-resolution-advanced-merging
    provides: stage-based conflict documents and guarded apply service
provides:
  - deterministic preview-only conflict candidates
  - repository-local opt-in confirmed-resolution records
  - guarded candidate settings, generation, preview, and forget IPC APIs
affects: [conflict-workbench, conflict-resolution]
tech-stack:
  added: []
  patterns: [pure candidate generation, schema-versioned atomic local store]
key-files:
  created: [src/main/conflictCandidates.ts, src/main/__tests__/conflictCandidates.test.ts]
  modified: [src/shared/conflicts.ts, src/main/conflictService.ts, src/main/index.ts, src/preload/index.ts, src/preload/index.d.ts]
key-decisions:
  - "Candidate discovery is disabled until explicitly enabled per repository."
  - "Generation and preview never apply, stage, or write Git files; confirmed records are written only through the explicit record API after apply confirmation."
  - "The record store is UltraGIT-owned under the repository Git directory and uses schema, size, count, and atomic-write guards."
patterns-established:
  - "Candidate IDs bind rule, generation, stage identities, region, proposed hash, and record identity."
  - "Ambiguous binary, mixed-EOL, final-newline, and content cases produce no whitespace candidate."
requirements-completed: [CONFLICT-03]
duration: 25min
completed: 2026-09-17
status: complete
---

# Phase 6 Plan 9 Summary

**Opt-in deterministic conflict candidates with non-mutating previews and repository-local confirmed-resolution reuse**

## Accomplishments

- Added conservative one-side-equals-base, identical-normalized-result, whitespace-only, and confirmed-record candidate rules.
- Added provenance-rich candidate metadata, stable IDs, duplicate-result deduplication, and stale-safe preview lookup.
- Added an atomic, schema-versioned, capped UltraGIT record store and guarded main/preload IPC surface.
- Added real Bun coverage for deterministic ordering, unsafe whitespace rejection, opt-in persistence, restart reuse, and non-mutation.

## Verification

- `bun test src/main/__tests__/conflictCandidates.test.ts` — 4 passed
- `bun test src/main/__tests__/conflictService.test.ts` — 6 passed
- `bun run build` — passed

## Deviations from Plan

None — no Git rerere invocation or package installation was added.

## Issues Encountered

The region derivation normalizes line endings, so identical-normalized detection also checks authoritative stage bytes to retain safe EOL-only candidates without weakening mixed-EOL rejection.

## Next Phase Readiness

The renderer can consume candidate APIs and keep candidate acceptance separate from Apply & Stage. The store is intentionally opt-in and does not alter Git configuration.

---
*Phase: 06-automatic-conflict-resolution-advanced-merging*
*Plan: 09*
