---
phase: 06-automatic-conflict-resolution-advanced-merging
plan: 07
status: complete
---

# Plan 06-07 Summary

## Delivered

- Added renderer-safe canonical ordinary-diff contracts with generation-bound hunk IDs and explicit stage/unstage/discard/staged-discard targets.
- Added `PartialPatchService`, separate from conflict resolution, with repository path checks, unmerged-path routing, exact one-shot Git patch application, stale selection rejection, rollback snapshots, and per-repository serialization.
- Added exact transaction Undo/Redo using index entries and worktree byte/mode snapshots; external state changes expire the transaction instead of overwriting user work.
- Added guarded purpose-specific IPC and preload/type declarations for canonical diff, apply transaction, Undo, and Redo.
- Added real Git tests covering selected hunk staging, stale selection safety, Undo, and Redo.

## Verification

- `bun test src/main/__tests__/git.partialPatch.test.ts src/main/__tests__/git.patch.test.ts` passed (25 tests).
- `bun run build` passed.

## Scope note

The legacy `git:applyPatch` bridge remains for compatibility; the new ordinary partial-diff boundary does not expose raw patch text and never retries with weaker matching. Conflict paths remain owned by `ConflictService`.
