# UltraGIT

UltraGIT is a modern, high-performance desktop Git client built with Electron. It is designed to provide a seamless, visual Git experience with advanced features built-in to handle complex workflows effortlessly. Inspired by industry-leading desktop clients, UltraGIT combines raw Git power with an intuitive, premium interface.

## Key Features & Requirements

### 1. Multi-Repository Management (Tabs)
- The application must support opening and working with multiple Git repositories simultaneously.
- Repositories should be accessible via a tabbed interface at the top of the application window, allowing quick context switching without opening multiple windows.

### 2. Comprehensive Left Sidebar
- **Navigating Repositories**: Display the current repository name and a branch dropdown at the top.
- **Viewing Filter**: A toggle to filter Local and Remote branches, Stashes, and WIP.
- **Sections**: Include collapsibles for Local Branches, Remote Branches, Stashes, Tags, and future integrations (Pull Requests, Issues, Teams, Cloud Patches).

### 3. Visual Commit Graph
- A central component of the UI must be a rich, interactive visual commit graph (Main Content Area).
- The graph should display branches, tags, and linear/non-linear commit history clearly using connected nodes.
- Display relevant commit metadata: author avatar, author name, commit message, branch labels, and relative time (e.g., "2 hours ago").

### 4. Tree View for File Changes
- Whenever a commit is selected or when viewing the "Working Directory" / current changes, the app must display modified files in the right-hand panel.
- Support a toggle between the "Path" (flat list) and "Tree" (folder hierarchy) views so users can navigate changes efficiently based on their preference.
- Show file status indicators (Added, Modified, Deleted, Conflicted).

### 5. Automatic Conflict Resolution
- Provide a feature that attempts to automatically resolve merge conflicts using predefined intelligent heuristics.
- When a merge conflict occurs during an operation (e.g., Pull, Merge, Rebase), the app should offer a "Resolve Automatically" flow.
- Ensure the user can review the produced resolution in a visual split-diff view before accepting it.

### 6. Standard Toolbar Git Operations
- Provide an easily accessible toolbar at the top of the interface for common actions: Undo, Redo, Pull, Push, Branch, Stash, Pop, and opening an external Terminal.

## Architecture Tech Stack

- **Framework**: Electron (Node.js backend + Chromium frontend) allowing cross-platform builds (Windows, macOS, Linux).
- **Package Manager & Tooling**: Bun. Used for its blazing-fast dependency installation, built-in test runner, and native bundler capabilities, perfectly complementing a modern high-performance application.
- **Frontend Core**: React (or solid modern equivalent like Svelte/Vue) with TypeScript.
- **Styling**: Tailwind CSS combined with custom CSS/CSS-in-JS for a premium dark-mode UI aesthetic, including exact layouts, smooth panel transitions, hover effects, and responsive resizing.
- **Git Integration**: Direct interaction with the system Git binary via spawned child processes (e.g., `simple-git`) for performance, or `nodegit` for native Node bindings.
- **State Management**: Zustand or Redux to handle complex state like UI layouts, active tabs, selected commits, and configuration.

## Development Tasks / Roadmap

### Phase 1: Foundation & Project Setup
- [ ] Initialize the Electron + TypeScript + React boilerplate using Bun (`bun create ext ...` or custom setup).
- [ ] Define and configure IPC (Inter-Process Communication) between the main Electron process and the React renderer.
- [ ] Set up the UI shell: Top bar (Tabs), Left Sidebar, Main Graph View, Right Panel.
- [ ] Create the application icon and global styles (colors, typography).
- [ ] Integrate a Git library (e.g., \`simple-git\`) in the main process and expose a Git API (fetch, status, log) to the frontend via IPC.

### Phase 2: Multi-Repo & Tab System
- [ ] Implement the Tab System in the UI header to handle opening and closing distinct repository paths.
- [ ] Build the repository opening flow (native file picker to select a local repository directory).
- [ ] Manage isolated state per tab to switch active repositories quickly without losing UI state.

### Phase 3: The Left Sidebar & Core Actions
- [ ] Fetch and display the list of Local and Remote branches in the sidebar.
- [ ] Implement Stash and Tag fetching to populate the respective collapsible sections.
- [ ] Implement core toolbar actions: Undo/Redo, Pull, Push, Fetch, Checkout Branch.

### Phase 4: The Visual Commit Graph
- [ ] Fetch commit history: retrieve commits, merge parents, author info, and timestamps efficiently.
- [ ] Build the Visual Commit Graph rendering engine (using Canvas or SVG for performance).
- [ ] Support commit selection to update the Right Panel with "Commit Details".

### Phase 5: File Changes & Tree View
- [ ] Create the Right Panel view to display commit details (Author, Date, Parent, File List).
- [ ] Implement the file list component with the Path / Tree view toggle.
- [ ] Implement inline code diff viewing when a modified file is clicked.
- [ ] Create the "WIP on branch" view showing uncommitted changes with Stage/Unstage interactions.

### Phase 6: Automatic Conflict Resolution & Advanced Merging
- [ ] Implement Merge, Rebase, and Cherry-pick functionalities.
- [ ] Build the conflict detection logic and the Conflict Resolution UI (3-way diff view).
- [ ] Implement the "Auto-Resolve" algorithm to suggest and apply conflict resolutions automatically where possible.

### Phase 7: Polish, Aesthetics & Performance
- [ ] Refine the dark mode theme to ensure premium application feel (smooth gradients, proper contrast, micro-animations on interactive elements).
- [ ] Optimize Git operations for huge repositories (e.g., lazy loading commits as the user scrolls the graph).
- [ ] Implement comprehensive keyboard shortcuts (Ctrl+Z, Ctrl+Shift+P, etc.) and a command palette.
- [ ] Setup packaging and build workflows for Windows, macOS, and Linux.
