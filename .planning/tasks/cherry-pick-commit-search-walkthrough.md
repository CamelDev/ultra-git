# Filter available cherry-pick commits

Added a search input above the commit selector. It filters the commits already loaded for the selected source branch using a case-insensitive literal substring match against the full hash, message, author name, and author email. Blank input restores the complete loaded list; regex syntax and query operators have no special meaning.

The visible commit drives both the changed-file preview and the cherry-pick action. An explicit selection is retained while it matches. If it is excluded, the first visible match is previewed. No results clears the preview and disables Cherry Pick, so a previously selected hidden commit cannot be applied. Source loading and errors also disable the action. Closing the dialog resets the query with the other picker state.

Validation: 11 toolbar unit tests pass, including five commit-search tests. Seven affected Electron tests pass, covering hash/message/author filtering, clearing, no matches, reset on reopen, picking the correct filtered commit, remote loading, local sources, worktrees, and conflict abort. The production build passes. The five previously documented TypeScript diagnostics are unchanged.

Rebuilt the local macOS arm64 v1.1.8 DMG and verified that its packaged renderer matches the tested build and contains the search input and empty-result handling.
