---
phase: 06-automatic-conflict-resolution-advanced-merging
plan: 03
subsystem: conflict-resolution
tags: [git, conflicts, ipc, undo, safety]
requires: [06-02]
provides:
  - "Authoritative stage-based conflict documents and operation snapshots"
  - "Whole-file guarded resolution with generation and region validation"
  - "Generation-bound Undo Resolution and typed conflict IPC channels"
affects: [06-04, 06-05, 06-06]
tech-stack:
  added: []
  patterns: [stage blobs, serialized repository mutations, safety snapshot rollback]
key-files:
  created:
    - src/main/conflictService.ts
  modified:
    - src/main/__tests__/conflictService.test.ts
    - src/main/index.ts
    - src/preload/index.ts
    - src/renderer/src/env.d.ts
key-decisions:
  - "Conflict truth comes from index stages and Git metadata, never marker parsing."
  - "Resolution writes and stages one complete file and returns a fresh snapshot."
  - "Undo is an opaque, generation-bound handle backed by an on-disk safety snapshot."
requirements-completed: [CONFLICT-01, CONFLICT-02]
status: complete
---

# Phase 6 Plan 3 Summary

Implemented the authoritative conflict-operation service. It reads stage 1/2/3 blobs, derives stable documents from the shared region engine, validates generation/region/path/size preconditions, serializes repository mutations, stages complete files, verifies postconditions, and rolls back from an exact worktree/index safety snapshot on failure. Successful resolutions expose an opaque Undo Resolution handle that expires when the operation advances.

Added purpose-specific preload and main-process channels for snapshots, documents, apply, undo, continue, skip, and abort. Characterization coverage now includes a real merge resolution and undo round trip in addition to merge, rebase, cherry-pick, structural, binary, and path cases.

## Verification

- `bun test src/main/__tests__/conflictService.test.ts` — 6 passed, 0 failed.
- `bun test src/main/__tests__/conflictService.test.ts src/main/__tests__/conflictRegions.test.ts` — 12 passed, 0 failed.
- `bun run build` — passed.

## Notes

IPC sender/registered-repository enforcement remains a follow-up hardening seam for the app-level registration flow; the new operation channels already use narrow purpose-specific methods and stable typed error codes.
