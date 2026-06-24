# Roadmap: UltraGIT

## Overview

UltraGIT is built in 7 incremental phases, starting with the application core scaffolding and multi-repo state isolation, moving through visual and interactive sidebar/graph features, and finishing with automated conflict resolution heuristics and rich dark-mode performance optimizations.

## Milestones

- 🚧 **v1.0 MVP** - Phases 1-7 (in progress)

## Phases

### Phase 1: Foundation & Project Setup
**Goal**: Boilerplate initialization, IPC configurations, UI shell layout, and Git API exposure.
**Depends on**: Nothing
**Requirements**: [BOILERPLATE-01, IPC-01, UI-SHELL-01, GIT-API-01]
**Success Criteria**:
  1. Electron + React + TS runs with Bun dev server
  2. IPC safely communicates between main and renderer
  3. Git operations fetch local directory statuses correctly
**Plans**: 3 plans

Plans:
- [x] 01-01: Initialize boilerplate structure and configure Bun
- [x] 01-02: Configure contextBridge IPC channels and build base UI shell
- [x] 01-03: Integrate simple-git in main process and expose log/status APIs

### Phase 2: Multi-Repo & Tab System
**Goal**: Support opening and context-switching multiple git repositories via tabs.
**Depends on**: Phase 1
**Requirements**: [TABS-01, OPEN-FLOW-01]
**Success Criteria**:
  1. User can open multiple repositories via top bar tabs
  2. Selecting a tab isolates and loads that tab's repository state
**Plans**: 2 plans

Plans:
- [x] 02-01: Implement repository open dialog and top bar Tab UI
- [x] 02-02: Implement useRepoStore with isolated state per repository tab

### Phase 3: The Left Sidebar & Core Actions
**Goal**: Display branches, stashes, and tags with filtering, and execute core Git actions in toolbar.
**Depends on**: Phase 2
**Requirements**: [SIDEBAR-01, SIDEBAR-02, SIDEBAR-03, TOOLBAR-01]
**Success Criteria**:
  1. Left sidebar lists local/remote branches, stashes, and tags with collapsible sections
  2. Interactive list allows branch filtering and checking out branches
  3. Toolbar buttons (Pull, Push, Fetch, Stash, Pop) trigger and show results of operations
**Plans**: 2 plans

Plans:
- [ ] 03-01: Implement branch, stash, tag fetching and rendering with sidebar filter
- [ ] 03-02: Implement toolbar actions and branch checkout Git integrations via IPC

### Phase 4: The Visual Commit Graph
**Goal**: Parse and draw interactive connected visual commit history graph.
**Depends on**: Phase 3
**Requirements**: [GRAPH-01, GRAPH-02, GRAPH-03]
**Success Criteria**:
  1. Visual commit graph renders correctly using Canvas/SVG with branch lines
  2. Click on node updates selected commit details context
**Plans**: TBD

### Phase 5: File Changes & Tree View
**Goal**: Renders changed file structures in flat/tree view and show interactive diffs and staging.
**Depends on**: Phase 4
**Requirements**: [RIGHT-PANEL-01, RIGHT-PANEL-02, RIGHT-PANEL-03, RIGHT-PANEL-04]
**Success Criteria**:
  1. Changed files are browseable via a flat path list or nested directory tree
  2. Clicking file displays diff with syntax highlighting or line comparisons
  3. WIP view allows staging files, typing commit messages, and committing
**Plans**: TBD

### Phase 6: Automatic Conflict Resolution & Advanced Merging
**Goal**: Integrate merging, rebasing, cherry-picking, and custom automatic conflict resolution.
**Depends on**: Phase 5
**Requirements**: [CONFLICT-01, CONFLICT-02, CONFLICT-03]
**Success Criteria**:
  1. Conflict state triggers 3-way split diff UI
  2. "Auto-Resolve" heuristics successfully auto-merges trivial formatting/non-overlapping conflicts
**Plans**: TBD

### Phase 7: Polish, Aesthetics & Performance
**Goal**: Enhance dark mode styles with smooth micro-animations, optimize for huge repositories, and enable shortcuts.
**Depends on**: Phase 6
**Requirements**: [POLISH-01, POLISH-02, POLISH-03]
**Success Criteria**:
  1. Render 100k+ commits seamlessly using virtualization
  2. Beautiful transitions, command palette, and full keyboard control support
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Setup | v1.0 | 3/3 | Complete | 2026-03-22 |
| 2. Multi-Repo & Tabs | v1.0 | 2/2 | Complete | 2026-03-22 |
| 3. Sidebar & Actions | v1.0 | 0/2 | Not started | - |
| 4. Commit Graph | v1.0 | 0/0 | Not started | - |
| 5. File Changes & Tree | v1.0 | 0/0 | Not started | - |
| 6. Conflict Resolution | v1.0 | 0/0 | Not started | - |
| 7. Polish & Aesthetics | v1.0 | 0/0 | Not started | - |
