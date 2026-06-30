# UltraGIT

UltraGIT is a modern, high-performance desktop Git client built with Electron, React, and TypeScript. It is designed to provide a seamless, visual Git experience with advanced features built-in to handle complex workflows effortlessly. Inspired by industry-leading desktop clients, UltraGIT combines raw Git power with an intuitive, premium dark-mode interface.

## Key Features & Capabilities

### 1. Multi-Repository Workspace (Tabs)
* **Tabbed Interface**: Manage and work on multiple Git repositories simultaneously in a clean tabbed layout.
* **Native Repository Loader**: Open local repositories using a native directory selection dialog.
* **Workspace Persistence**: Active and open repositories are saved to `localStorage` and automatically restored when the application starts.
* **Landing Welcome Page**: Displays a clean landing page with quick action shortcuts (e.g., open local repository) when no repository tabs are open.
* **About Dialog**: A styled dialog accessible from the titlebar showing version details and development specifications.

### 2. Folder-Grouped Sidebar Navigation
* **Sidebar Filter**: A sticky search input at the top of the sidebar allows real-time filtering of local branches, remote branches, and worktrees.
* **Folder-Grouped Tree View**: Local and remote branches are grouped by folder structures (delimited by `/`).
  * Collapsible/expandable folder nodes with custom icons (`Folder` and chevrons).
  * The folder containing the active branch is auto-expanded by default.
  * The top-level remote name (e.g., `origin/`) is automatically stripped under the Remote section to avoid redundant nesting.
* **Local Branches**: Sorted alphabetically, showing the active branch with dynamic Ahead/Behind counts (`↑` / `↓`) compared to the remote-tracking branch.
  * **Branch Management**: Create local branches from HEAD, rename branches, and delete branches (includes safe checking and force-delete prompts for unmerged changes).
  * **Advanced Merging & Rebasing**: Merge branches using strategy presets (Fast-forward if possible, Always create merge commit `--no-ff`, and Squash commits `--squash`), or perform rebases onto selected branches.
  * **Checkout Integration**: Switch branch context. If the branch is checked out in an active worktree, the app automatically switches repository paths to load that worktree's context.
* **Git Worktrees Section**:
  * **Add Worktree Modal**: Create new worktrees from local/remote branches or custom start points, with built-in path validation (prevents creating worktrees inside the repository path). Includes folder browsing.
  * **Worktree Isolation**: Automatically hides branches checked out in extra worktrees from the local branches list to avoid workspace clutter.
  * **Safety Constraints**: Branch deletion, renaming, or creation is automatically restricted inside active worktrees to prevent workspace corruption.
  * **Worktree Actions**: Merge/rebase worktree branches, copy paths, or remove worktrees via `git worktree remove`.
* **Remote Branches**: Alphabetic listing of all remote branches (organized as a tree view without top-level remote name nodes).
* **Stashes**: Lists all stash entries with relative timestamps and descriptions.
  * **Stash Details**: View stash files and diffs.
  * **Stash Operations**: Pop stashes back into the workspace (with merge conflict warning banners) or drop stashes.
* **Tags**: Alphabetic listing of tags.
  * **Collapsible Tags Section**: Toggle the visibility of the Tags list to keep the sidebar organized.
  * **Tag Management**: Create tags from HEAD, delete local tags (with an option to sync delete remote tags), and push all tags to the remote.

### 3. Visual Commit Log & Synchronization
* **Commit History Graph**: Interactive timeline showing commit messages, authors, dates, and sync status.
* **Commit Search & Filter**: Search and filter repository commits by message directly from the toolbar input.
* **Pagination (Progressive Loading)**: A "Load More" button at the bottom of the commits list enables fetching and rendering commits beyond the initial limit (100 commits at a time).
* **Visual Branch Graph Modal**: Open a dedicated node-based interactive graph diagram to visualize the repository's branch and tag structure.
* **Sync Status Indicators**:
  * `Globe icon`: Commit exists on remote only (behind remote).
  * `Empty circle`: Commit exists locally only (ahead of remote).
  * `Filled circle`: Commit is pushed and in-sync.
* **Keyboard Navigation**: Use `ArrowUp` / `ArrowDown` to navigate commits, which automatically scrolls the active item into view and loads its details.
* **Cherry-Picking**: Select a commit from the commit history graph/log and cherry-pick it directly into your currently checked out branch (handles clean merges and conflict-trigger flows).
* **Sync Panel Operations**:
  * **Pull**: Pull changes from the tracking remote. Automatically displays a banner and opens the Conflict Resolver if conflicts arise.
  * **Push**: Push commits. Warns if behind remote, providing options to pull first or force push.
  * **Set Upstream**: Quickly configure the remote tracking branch.
  * **Set Remote & API Repo Creation**: Set remote URL and name. If the remote repository does not exist on GitHub or GitLab, UltraGIT uses your configured developer profile token to **automatically create the remote repository** (as public or private) and push your branch.

### 4. Developer Identity Profiles & Credentials
* **Multi-Identity Manager**: Create and select different identity profiles to use across repositories.
* **SSH Private Keys**: Select private keys with a file browse dialog to configure repository-specific SSH commands (`core.sshCommand`).
* **API Token Integration**: Paste tokens for **GitHub, GitLab, and Bitbucket**. Connects and validates against provider APIs, downloads user avatars, and auto-fills Git Name, Email, and usernames.
* **Automatic Git Config Integration**: Modifies local repo configuration (`user.name`, `user.email`, `core.sshCommand`, and custom token-based `credential.helper`) on select, and cleans them up from disk when a profile is removed.

### 5. WIP Active Changes (Working Directory)
* **Staged & Unstaged Columns**: Shows lists of files with status badges (`M`, `A`, `D`, `?`) and rename indicators.
* **Quick Actions**: Stage or unstage individual files or all changes with one click.
* **File Discards / Single-File Reset**: Discard/reset changes for individual files in both staged and unstaged lists, with a confirmation modal to prevent accidental data loss.
* **Identity Alerts**: Displays warning banners when multiple identities are configured but none is selected for the repository.
* **Height Resizable**: Drag handle allows expanding/collapsing the panel. Layout state is persisted.

### 6. Code Diff Viewer (DiffModal)
* **Split Diff View**: Shows line-by-line comparison of additions (green) and deletions (red) with matching line numbers.
* **Word-Level/Inline Highlights**: Pairs of deleted and added lines are parsed to highlight character-level and word-level edits inline.
* **Jump-to-First-Change**: Automatically scrolls to the first line containing code changes.
* **Interactive Overview Ruler**: Shows color-coded vertical stripes of all changes next to the scrollbar; clicking a marker scrolls to that exact line.
* **Binary File Safety**: Automatically detects binary files and shows a user-friendly message.
* **Contextual Diffing**: Supports diffing commits, stashes, and staged/unstaged working directory files.

### 7. Assistive Conflict Resolver
* **Auto-Triggered Flow**: Opens a dedicated resolution modal when merge/rebase conflicts occur.
* **3-Pane Comparison Layout**: Compare Ours (current branch) and Theirs (incoming changes) side-by-side, with a live result preview pane.
* **Hunk Navigation**: Step through conflict hunks individually with tab selectors.
* **Accept Strategies**: Pick Ours, Theirs, or Both (joins both sections).
* **Apply & Stage**: Writes resolved code blocks back to the file and stages it, marking it resolved.
* **Tooltip Overlay**: Custom context-aware tooltips overlaying action buttons throughout the user interface.

---

## Architecture Tech Stack

* **Framework**: Electron (main process & preload script interface to renderer process).
* **Frontend**: React 19 + TypeScript.
* **State Management**: Zustand (saves open repositories and identity profiles).
* **Styling**: Vanilla CSS. High-performance, modern layout design utilizing CSS variables for dark-mode coloring, glassmorphism, flexbox panels, and resizable layout dragging.
* **Git Operations**: `simple-git` package executing commands asynchronously through child process spawning.
* **Package Manager**: Bun (provides ultra-fast dependency resolution and locking).
* **Testing**: Playwright for electron-based end-to-end (E2E) testing.

---

## Setup & Development

Before starting, ensure you have initialized GSD (Git-based Software Development) on your system.

1. **GSD Initialization** (if `.agents/` is missing):
   ```bash
   npx @opengsd/gsd-core@latest
   ```

2. **Install Dependencies**:
   ```bash
   bun install
   ```

3. **Run Development Server**:
   ```bash
   bun run dev
   ```

4. **Run End-to-End Tests**:
   ```bash
   bun run test:e2e
   ```

5. **Build and Package Application**:
   ```bash
   bun run build:all
   ```

---

## Development Tasks / Roadmap

### Phase 1: Foundation & Project Setup
- [x] Initialize the Electron + TypeScript + React boilerplate using Bun.
- [x] Define and configure IPC between the main Electron process and the React renderer.
- [x] Set up UI shell structure (Titlebar, Sidebar, Graph View, Details Panel).
- [x] Create the application icon and global styles (colors, typography, CSS layout).
- [x] Integrate `simple-git` in the main process and expose a Git API (fetch, status, log) via IPC.

### Phase 2: Multi-Repo & Tab System
- [x] Implement the Tab System in the UI header to handle multiple open repositories.
- [x] Build the repository opening flow with native directory picker dialogs.
- [x] Manage isolated state per tab to switch active repositories quickly without losing UI state.

### Phase 3: The Left Sidebar & Core Actions
- [x] Fetch and display list of Local and Remote branches in the sidebar.
- [x] Implement Stash and Tag fetching to populate collapsible sections.
- [x] Implement core toolbar actions (Stage, Unstage, Stash, Commit, Create Branch/Tag, Pull, Push).
- [ ] Implement Undo/Redo Git operations in the toolbar.

### Phase 4: Visual Commit Graph & Navigation
- [x] Fetch commit history with commit metadata, parents, author info, and timestamps.
- [x] Build Visual Commit Graph list showing sync status (globe/circles) and branch labels.
- [x] Implement Arrow Up/Down keyboard navigation to select commits and scroll them into view.

### Phase 5: File Changes & Tree View
- [x] Create Selection Details panel to display commit details (Author, Date, SHA, File List).
- [x] Implement flat list component with status codes (Modified, Added, Deleted, Renamed).
- [ ] Implement folder hierarchy (Tree) view toggle.
- [x] Implement split-view code diff modal with scroll rulers and first-change auto-scrolling.
- [x] Create the WIP view showing uncommitted changes with Stage/Unstage interactions.

### Phase 6: Conflict Resolution & Merging
- [x] Implement Merge, Rebase, and worktree actions.
- [x] Build conflict detection logic and Conflict Resolution UI.
- [x] Implement hunk-by-hunk resolution selector (Ours, Theirs, Both) and Result preview.
- [x] Implement Git Cherry-pick options.

### Phase 7: Polish & Extra Integrations
- [x] Refine dark mode theme, resizable panels, and layout state saving.
- [x] Implement Git Worktrees support (Unified tabs, isolate checked-out branches, safety limits).
- [x] Implement Developer Identity Profiles (SSH key command configuration, API connection validation for GitHub/GitLab/Bitbucket, auto remote repo creation).
- [ ] Add command palette and global keyboard shortcuts configuration.
- [x] Setup packaging and build workflows for desktop distributions.
