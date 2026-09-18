---
status: diagnosed
trigger: "Pull reported a conflict; opening rebase showed an empty diff; aborting rebase made the next pull succeed."
created: 2026-09-17
updated: 2026-09-17
---

## Symptoms

- Expected behavior: a pull accurately reports whether Git has a real conflict and rebase displays only actual conflicting changes.
- Actual behavior: the app reported a conflict, then displayed an empty rebase diff; after aborting, a subsequent pull completed normally.
- Error messages: a conflict was reported, but its exact text was not captured.
- Timeline: observed on 2026-09-17; subsequent pull was a fast-forward.
- Reproduction: pull, enter rebase from the reported conflict, observe an empty diff, abort, then pull again.

## Current Focus

- hypothesis: Confirmed: Smart Pull classifies every in-progress Git operation as a pull conflict, including a rebase that has no unmerged paths and is only waiting for continue/skip/abort.
- test: Correlated the reflog with the Smart Pull classifier, pull preflight, and resolver snapshot behavior.
- expecting: A zero-file rebase is routed to the rebase-action UI, not the conflict resolver.
- next_action: implement the remediation in a separate change (diagnosis-only session).

## Evidence

- timestamp: 2026-09-17 22:36:41 +0200; `git reflog` records `pull --no-edit --no-rebase --prune: Fast-forward` to `008707c`.
- timestamp: 2026-09-17 22:36:37 +0200; `refs/remotes/origin/main` reflog records `fetch --prune: fast-forward`; at 22:36:41, both `HEAD` and `refs/heads/main` fast-forwarded to `008707c`. The repository is now clean and `HEAD...@{upstream}` is `0 0`, so this pull did not leave a merge or rebase conflict.
- source: `src/main/git.ts:599-607`; after a pull, Smart Pull marks the result as conflicted whenever `getMergeStatus(repoPath).inProgress` is true. It does not require `getConflictedFiles()` or `git status().conflicted` to contain a path.
- source: `src/main/git.ts:614-623`; that boolean produces the `merge-conflicts` result even when `conflictedFiles` is an empty list and even when the operation is actually a rebase.
- source: `src/renderer/src/components/graph/GraphView.tsx:517-539`; every `merge-conflicts` result is labelled `Merge Conflicts Detected` and offers `Resolve Conflicts`, irrespective of operation kind or conflict-file count.
- source: `src/main/conflictService.ts:49-58`; a resolver snapshot deliberately reports `phase: 'ready-to-continue'` when an operation is in progress but has no unmerged index entries. Consequently, opening the resolver from the above false classification yields an empty diff/workbench.
- source: `src/main/git.ts:395-401` and `src/renderer/src/components/graph/GraphView.tsx:676-744`; preflight already has a distinct `REBASE_IN_PROGRESS` path and UI for a no-conflict rebase (continue, skip, or abort). The post-pull path loses that distinction.
- coverage: `src/main/__tests__/git.smartpull.test.ts:264-305` tests positive merge-conflict cases only; it has no regression test for `mergeStatus.inProgress === true` with zero conflicted files, nor for preserving rebase operation kind in the result.

## Eliminated

- hypothesis: The 22:36:41 app pull produced a real merge conflict. Evidence: its reflog entry is explicitly `Fast-forward`; a fast-forward does not perform a merge or create merge-conflict stages.
- hypothesis: The empty resolver proves that Git failed to create a rebase. Evidence: an in-progress rebase may legitimately have no unmerged index entries; the conflict service represents precisely that state as `ready-to-continue`.

## Resolution

- root_cause: Smart Pull collapses two different states—(1) unmerged conflict paths and (2) an operation merely in progress—into `merge-conflicts`. A zero-conflict rebase is therefore advertised as a merge conflict and sent to a resolver whose correct Git-backed diff is empty. The subsequent 22:36:41 fast-forward is consistent with aborting/clearing that pending rebase state before retrying; it is not evidence of a content conflict in that successful pull.
- fix: Make conflict classification require authoritative unmerged paths (`getConflictedFiles().length > 0` or `git status().conflicted.length > 0`). Add a typed `operation-in-progress` result carrying `kind` and metadata for merge/rebase/cherry-pick states with zero conflicts, and route it to the existing continue/skip/abort UI. Preserve the operation kind rather than hard-coding the `merge-conflicts` label.
- verification: Add focused Smart Pull tests for (a) `getMergeStatus().isRebase/inProgress` with no unmerged paths, asserting no `merge-conflicts` result, and (b) a true rebase conflict, asserting its kind and files survive to the renderer. Add an E2E case that a zero-conflict rebase never opens a conflict resolver/diff. Manually reproduce by leaving a rebase paused after staging all resolutions, then pressing Pull.
- files_changed: `.planning/debug/spurious-pull-conflict.md` (diagnosis record only; no app source or test changes).
