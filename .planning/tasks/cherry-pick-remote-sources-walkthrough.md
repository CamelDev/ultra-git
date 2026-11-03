# Load cherry-pick remote sources on demand

The cherry-pick source picker now starts with local branches and local worktrees. Remote refs are excluded from both the initial options and the default branch selection.

A “Load remote branches” button reads the repository's existing remote refs through the branch API and adds them to the picker. It preserves the current selection. Loading failures leave local sources available and offer Retry; an empty result reports that no remote branches were found. This action reads local Git metadata and does not fetch from a remote server.

Closing the modal unmounts its content, so reopening it or switching repositories starts with local sources again. A branch refresh preserves a valid source selection, including a remote that the user explicitly loaded and selected.

All six branch-selection unit tests and nine affected Electron tests pass. Coverage includes default hiding, on-demand remote selection and cherry-picking, local selection preservation, refresh behavior, resetting on reopen, failure/retry, and the existing local, worktree, and empty-cherry-pick flows. The production build passes; the five previously documented TypeScript errors remain unchanged.

The local macOS arm64 v1.1.8 DMG was rebuilt. Its packaged renderer matches the verified build and includes the on-demand loading controls.
