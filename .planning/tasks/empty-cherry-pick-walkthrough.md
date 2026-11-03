# Empty cherry-pick recovery

## Problem

An active cherry-pick with no unresolved files was always classified as ready to continue. When the index already matched HEAD, Continue repeatedly ran a command Git could not complete. The workbench showed an empty file picker and provided no Skip action for cherry-picks.

This occurs both when a commit's changes already exist in the destination branch (for example through a squash merge) and when resolving every conflict with the current version produces no staged differences. A commit can exist on a source branch while its content is already present under a different commit on the destination branch.

## Implementation

- Added an explicit `empty` operation phase. The service compares the index with HEAD and separately checks tracked unstaged changes; it does not classify an operation from Git's human-readable error text.
- Empty cherry-picks show a “Finish cherry-pick / No changes to apply” summary with the picked commit identity, Skip commit, Abort, Undo when available, and Refresh status. The empty file picker and Continue action are removed in this state.
- Unstaged edits produce “Changes still need staging” and block Skip. Once those edits are staged and the snapshot is refreshed, Continue becomes available again.
- Skip invokes `git cherry-pick --skip` only after checking the current operation and staged/unstaged state. Skipping is an explicit user action and creates no replacement commit.
- A stale Continue request returns the current empty/completed snapshot without rerunning an invalid command. Git pausing at the next empty/conflicted commit in a sequence returns the next operation snapshot.
- Snapshot generation includes the current cherry-pick commit identity, phase, and unstaged-change flag, so successive commits with the same subject and decisions that change staging state do not share an identity.
- Starting an empty cherry-pick opens the workbench through an explicit `needsResolution` response. Actual command failures remain in the cherry-pick modal. Repository reload also detects an active cherry-pick with zero conflicted files.
- Operation completion refreshes repository state before closing the workbench. Toolbar/banner operations keep the workbench open for errors or further decisions instead of closing it merely because Continue was clicked.

## Validation

- Production build passes.
- 53 focused Bun tests pass across the conflict service, region derivation, candidates, session state, and presentation helpers.
- Four new Electron tests exercise an already-applied commit, a resolution that becomes empty (including Undo), reopening an empty cherry-pick, and staging an unstaged edit before continuing.
- All 24 affected Electron tests pass, including normal cherry-picks, merges, rebases, binary files, modify/delete, both-added, draft persistence, and the redesigned workbench.
- TypeScript reports the same five existing renderer API declaration/call-site errors documented before this change; no new diagnostic remains.
- No dependency or application version changes are required for this fix.
- Rebuilt the local macOS arm64 v1.1.8 DMG in `dist/UltraGIT-1.1.8-arm64.dmg`. Verified the packaged archive contains both the service guard and the new empty-state UI.
