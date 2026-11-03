# Close the workbench when an operation has finished

## Problem

The workbench could keep rendering the normal editor after an authoritative snapshot reported `completed`. With no active operation, the backend's fallback operation kind is `merge`, which produced a misleading Merge header, Abort Merge action, and an empty file picker.

The close callback ran only inside the workbench's own operation handlers. Completion discovered on opening, or after an external Git command, did not close the window. Git-only changes were also excluded by the working-tree file watcher.

## Changes

- Completed and aborted snapshots now clear active paths, region selection, drafts, undo, pending state, and stale errors through every reducer entry point: initial snapshot, background snapshot, and operation response.
- The workbench observes the terminal phase directly, dismisses itself, and refreshes repository status regardless of how completion was discovered. Before dismissal, its fallback view offers no Git mutation controls.
- While open, the workbench checks the authoritative snapshot every 1.5 seconds and on window focus. These lightweight reads preserve unchanged sessions and skip pending actions.
- Background responses are rejected if a user operation started, the generation advanced, or a newer snapshot request superseded them. Transient read errors leave the current editor intact and retry on the next check.
- Workbench instances are keyed by repository to keep their lifecycle separate when switching tabs.
- An expired Abort request returns the completed snapshot without invoking `git merge --abort` against an inactive repository.

## Verification

- Production build passes.
- 77 focused Bun tests pass, including terminal-session cleanup through all snapshot channels, background completion, unchanged-session preservation, late-response rejection, and stale Abort safety.
- Three new Electron tests pass: external cherry-pick completion with only Git metadata changing, external abort while a draft exists, and a stale UI request against an already completed operation.
- The four empty-cherry-pick Electron tests still pass.
- The 20 existing merge, rebase, and cherry-pick regression tests also pass against the same build: 27 affected Electron tests passed in total.
- TypeScript retains the same five existing API declaration/call-site errors; no new diagnostic was introduced.
- Rebuilt the local macOS arm64 v1.1.8 DMG. Its packaged main, preload, and renderer bundles match the verified build byte for byte, and the completion guard is present in the packaged renderer.

The inspected user repository was read only. Reproductions and Git mutations use isolated test repositories.
