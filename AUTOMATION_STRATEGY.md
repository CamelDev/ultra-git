# QA Automation Strategy

This document outlines the testing architecture, automation standards, execution protocols, and complete E2E test suite inventory for **UltraGIT**.

---

## 1. Testing Philosophy & Standards

To compete with premium desktop Git clients, UltraGIT enforces high-reliability standards. All major user interaction flows, layout behaviors, and integration actions are covered by automated end-to-end (E2E) tests.

### Key Objectives
* **Isolate Tests**: Every test suite runs in a completely clean, temporary environment to avoid interference.
* **Real Git Execution**: Tests perform actual Git operations (creating files, commits, branches, stashes, and rebases) rather than mocking the git binary, ensuring high fidelity.
* **Layout and Resizing Persistence**: Ensure that layout panel drags (sidebar and commit details panels) are persisted accurately to `localStorage`.
* **State Syncing**: Verify that external filesystem events (e.g. modifying the git workspace via external processes) trigger active watcher updates and refresh the UI state automatically.

---

## 2. Test Architecture & Tooling

UltraGIT's E2E test framework uses the following tools:
1. **Playwright (`@playwright/test`)**: Drives the Electron application process natively, allowing visual interaction testing, window controls, and standard web checks.
2. **Git Sandbox Helper (`e2e/helpers/git-sandbox.ts`)**: Creates temporary, isolated Git repositories on-disk. It initializes repositories, mocks origin remotes, generates sample file edits, stages changes, and makes commits dynamically to simulate complex repository structures.
3. **Electron Launcher (`e2e/helpers/launcher.ts`)**: Spawns the Electron executable with specific testing flags (like `ULTRA_GIT_TESTING=true`) to isolate testing databases and config paths.

---

## 3. Running E2E Tests

E2E tests require building the latest production bundle beforehand. Use the custom npm script:

```bash
bun run test:e2e
```

This command runs `electron-vite build` and subsequently triggers `playwright test`.

---

## 4. E2E Test Suite Inventory

Below is the directory of all end-to-end tests located under the `e2e/` folder.

### Application Lifecycle & Sanity
#### `e2e/example.spec.ts`
* **Application launches successfully**: Spawns the Electron application, asserts the main window is visible, and verifies key shell layout components (e.g. Titlebar, Sidebar, Graph View, and Details Panel).

#### `e2e/sandbox-verify.spec.ts`
* **GitSandbox initializes and performs operations correctly**: Verifies that the Git testing sandbox successfully executes git operations (`git init`, adding files, committing) on the local filesystem.

---

### Workspace & Workspace UI
#### `e2e/tabs.spec.ts`
* **should support the full multi-repo tab life-cycle (add, switch, render, close)**: Validates opening multiple local repository paths, switching repository focus by clicking tabs, and closing tabs.
* **should persist tabs on app reload/restart**: Verifies that open tabs and the active repository path are stored in `localStorage` and correctly restored upon application restart.

#### `e2e/sidebar.spec.ts`
* **should resize the sidebar and persist the width**: Tests dragging the sidebar resize border to adjust its panel width and asserts that the new width is saved to `localStorage` and loaded on launch.
* **should reset sidebar and details panel widths on choosing Reset Layout**: Verifies that dragging sidebar/details resizers, choosing "Reset Layout" from settings, restores both panel widths to default sizes (sidebar: `280px`, details: `380px`).

#### `e2e/details.spec.ts`
* **should resize the details panel and persist the width**: Tests dragging the commit details panel resize border, verifying that its width is persisted to `localStorage`.

#### `e2e/auto-refresh.spec.ts`
* **should automatically detect filesystem changes and refresh git status**: Simulates external operations (e.g., adding unstaged files directly to the directory on disk) and verifies that the main process file watcher detects the changes and updates the UI status list automatically.

---

### Branch & Tag Management
#### `e2e/branch-creation.spec.ts`
* **should create a new branch, switch to it, show actual remote, list multiple branches, and checkout on click**: Checks toolbar branch creation, switching active branches, listing them in the sidebar, and clicking a branch to check it out.
* **should display local and remote branches sorted alphabetically**: Asserts that local and remote branches lists are rendered sorted alphabetically to prevent disorganized views.
* **should support force deleting an unmerged branch**: Verifies that trying to delete a branch containing commits not merged into `main` triggers a warning, and confirming the action force deletes the branch from the sidebar and from disk (`git branch -D`).

#### `e2e/commit-branch-creation.spec.ts`
* **should create branch from a specific commit in history**: Verifies clicking the branch creation button next to a historical commit hash inside the log and confirms a new branch starts from that exact commit.

#### `e2e/tag-creation.spec.ts`
* **should create a new tag, cancel tag creation, handle errors, and render it in the sidebar list**: Exercises creating local tags, handling duplicate tag errors, pushing tags to remote tracking repositories, and deleting tags locally (with remote deletion options).

---

### Commit Operations (Reset, Squash, & Conflict Resolution)
#### `e2e/commit-reset.spec.ts`
* **should perform a soft reset to a specific commit**: Checks selecting a commit, choosing the Soft Reset option, and verifying that HEAD moves back but the changes remain in the staging area.
* **should perform a hard reset to a specific commit**: Checks hard resetting to a selected commit, verifying that HEAD updates and the working tree is completely wiped clean.

#### `e2e/commit-squash.spec.ts`
* **should successfully squash commits into one when worktree is clean**: Tests selecting a commit node, editing the squash message, squashing all newer commits above it into a single commit, and verifying the updated git log.
* **should display warning and disable confirm button when worktree is dirty**: Verifies that commit squashing is disabled when the workspace has uncommitted changes to prevent data loss.

#### `e2e/conflict-resolver.spec.ts`
* **should support resolving conflicts hunk-by-hunk and committing the resolution**: Asserts that merge conflicts auto-open the conflict resolver modal showing the 3-pane layout, allows selecting Ours/Theirs/Both hunks, previews the output, applies resolutions to disk, and commits the merge successfully.
* **should support aborting a merge conflict**: Verifies aborting merge conflicts closes the resolver and returns the repository to a clean state.

---

### Code Diff & Selection Details
#### `e2e/commit-diff.spec.ts`
* **should display changed files and support standard diff functions**: Asserts that selecting a commit populates the selection details panel, showing modified files and status badges, and clicks a file to open a split code diff.
* **should support Esc key closing, auto-scrolling to deep changes, and overview ruler**: Checks that the `DiffModal` closes on ESC keypress, automatically scrolls to the first line of code changes, and jumps viewport lines when clicking the vertical **Diff Overview Ruler**.
* **should support keyboard arrow navigation and auto-scrolling of selected commits**: Tests using `ArrowUp` / `ArrowDown` to navigate commits in the log, verifying that the selected commit changes and is scrolled into view.
* **should support binary file detection in diff modal**: Verifies that committing a binary file containing null bytes and viewing its diff shows the text-not-available placeholder instead of rendering lines.

#### `e2e/active-changes.spec.ts`
* **should display active changes, support staging/unstaging, and open diff modal**: Checks that unstaged changes show in the active changes panel, supports "Stage" / "Unstage" actions, and opens the split diff viewer for working directory files.
* **should show warning dialog and not commit if nothing is staged**: Verifies that attempting to commit changes without staging first triggers a warning message dialog and blocks the commit.
* **should support stashing all changes via the toolbar**: Verifies that clicking "Stash all" in the toolbar stashes staged/unstaged changes, hides the active changes WIP panel, and adds a new stash to the sidebar.

---

### Git Worktrees
#### `e2e/worktree.spec.ts`
* **should satisfy all worktree requirements: load in-place, hide worktree branch, and restrict branch actions**: Tests that worktrees load within the unified tab view, checked-out worktree branches are hidden from the normal "Local Branches" sidebar list to avoid clutter, and branch creation/deleting/renaming is disabled inside active worktrees.
* **should support picking a base branch during worktree creation**: Tests choosing an existing local or remote branch as the starting base for a new worktree.
* **should support merging and rebasing from another branch in a worktree**: Verifies merging and rebasing operations executing successfully inside a worktree.
* **should support rebasing the active worktree branch onto another branch**: Verifies that performing a rebase from within an active worktree replays commits from the target branch onto the worktree branch.
* **should support deleting a worktree via the sidebar and disk**: Verifies clicking the sidebar trash icon next to an inactive extra worktree confirms removal, deletes the directory from disk, and prunes the worktree from the git repository.

---

### Developer Identities & SSH Configuration
#### `e2e/identities.spec.ts`
* **should support creating profiles, auto-assigning single profile, and dropdown selection**: Checks adding, editing, and deleting developer profiles, mapping them to local repositories, and auto-assigning when only one profile is defined.
* **should support Git provider token connection, editing profiles, and setting credentials.helper**: Tests GitHub/GitLab authentication (validating tokens against mocks/APIs, pulling details), and configures local git configurations (`user.name`, `user.email`, and a custom token `credential.helper`) dynamically.
* **should support Bitbucket token connection requiring email and configuring credential.helper with dynamic username**: Checks specific Bitbucket token authentication requirements.

---

### Remotes & Upstreams Synchronization
#### `e2e/set-remote.spec.ts`
* **should prompt to set remote on push failure and complete push successfully**: Asserts that pushing a branch with no remote configured prompts the user with a setup dialog.
* **should allow setting remote manually via push dropdown option**: Tests configuring remotes via the toolbar set-remote option.
* **should show manual remote creation links if push fails with repository not found and no PAT identity is configured**: Displays platform links (GitHub/GitLab) when a push fails due to a missing remote repository and no authentication profile is set.
* **should automatically create repository and push if push fails with repository not found and PAT identity is configured**: Tests the **Automatic Repository Creation** flow where UltraGIT creates the remote repository on GitHub/GitLab using the identity's personal access token and pushes the code.

#### `e2e/set-upstream.spec.ts`
* **should prefill local branch name as fallback when tracking branch is not set**: Checks default upstream branch inputs.
* **should prefill existing tracking branch and update upstream successfully on submission**: Verifies resetting or updating tracking upstream branches.

---

### Stash Operations
#### `e2e/stashes.spec.ts`
* **should display stash action buttons and support details view, pop confirmation, and delete confirmation**: Verifies popping a stash, dropping stashes, listing stash entries, and viewing stash files diffs.
* **should support pop stash with conflicts and display the conflict banner**: Verifies popping a stash with merge conflicts correctly sets conflict warning state and shows the warning banner in the sidebar.
