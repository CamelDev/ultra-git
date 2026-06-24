# Requirements: UltraGIT

**Defined:** 2026-06-22
**Core Value:** Provide a high-performance, premium desktop Git visual experience with seamless tabbed multi-repository support and automatic conflict resolution.

## v1 Requirements

Requirements for initial release, mapping to roadmap phases.

### Phase 1: Foundation & Project Setup

- [x] **BOILERPLATE-01**: Initialize Electron + TypeScript + React boilerplate using Bun
- [x] **IPC-01**: Configure secure and fast IPC communication between Electron main and renderer
- [x] **UI-SHELL-01**: Build the main UI shell layout with Header, Sidebar, Graph View, and Details panel
- [x] **GIT-API-01**: Expose core Git operations from main process using simple-git

### Phase 2: Multi-Repo & Tab System

- [x] **TABS-01**: Implement multi-repository tab management system with individual state isolation
- [x] **OPEN-FLOW-01**: Create repo opening flow with native folder selection

### Phase 3: The Left Sidebar & Core Actions

- [ ] **SIDEBAR-01**: Retrieve and list local and remote branches in the sidebar
- [ ] **SIDEBAR-02**: Fetch and display stash list and tags in collapsible sections
- [ ] **SIDEBAR-03**: Support branch filtering (local vs remote branches, tags, stashes)
- [ ] **TOOLBAR-01**: Implement common Git operations in toolbar: Pull, Push, Fetch, Checkout, Stash, Pop

### Phase 4: The Visual Commit Graph

- [ ] **GRAPH-01**: Retrieve full history (commits, parents, branches, tags, metadata)
- [ ] **GRAPH-02**: Render commit graph using Canvas/SVG showing branches/merges clearly
- [ ] **GRAPH-03**: Handle commit selection to update current details panel context

### Phase 5: File Changes & Tree View

- [ ] **RIGHT-PANEL-01**: Display details of selected commit (author info, date, changed files)
- [ ] **RIGHT-PANEL-02**: Toggle changed file list between flat Path and folder Tree views
- [ ] **RIGHT-PANEL-03**: Visual inline code diff viewer for selected file changes
- [ ] **RIGHT-PANEL-04**: WIP view showing modified uncommitted files with stage/unstage checkboxes

### Phase 6: Automatic Conflict Resolution & Advanced Merging

- [ ] **CONFLICT-01**: Implement manual Merge, Rebase, and Cherry-pick operations
- [ ] **CONFLICT-02**: Interactive conflict resolution UI with a visual 3-way split diff view
- [ ] **CONFLICT-03**: Intelligent auto-resolve heuristical algorithm for merge conflicts

### Phase 7: Polish, Aesthetics & Performance

- [ ] **POLISH-01**: Premium dark mode theme with glassmorphism, gradients, and micro-animations
- [ ] **POLISH-02**: Git lazy-loading and virtualization for huge repositories (100k+ commits)
- [ ] **POLISH-03**: Keyboard shortcuts and global command palette

## v2 Requirements

Deferred to future release.

- **PR-INTEGRATION-01**: Integration with GitHub/GitLab Pull Requests and issues
- **CLOUD-PATCHES-01**: Sharing unstashed work in-progress via cloud patches

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cloud Hosting | UltraGIT is local-first; hosting is deferred to standard platforms. |
| Full IDE capabilities | Editing files is restricted to staging and conflict resolution. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BOILERPLATE-01 | Phase 1 | Complete |
| IPC-01 | Phase 1 | Complete |
| UI-SHELL-01 | Phase 1 | Complete |
| GIT-API-01 | Phase 1 | Complete |
| TABS-01 | Phase 2 | Complete |
| OPEN-FLOW-01 | Phase 2 | Complete |
| SIDEBAR-01 | Phase 3 | Pending |
| SIDEBAR-02 | Phase 3 | Pending |
| SIDEBAR-03 | Phase 3 | Pending |
| TOOLBAR-01 | Phase 3 | Pending |
| GRAPH-01 | Phase 4 | Pending |
| GRAPH-02 | Phase 4 | Pending |
| GRAPH-03 | Phase 4 | Pending |
| RIGHT-PANEL-01 | Phase 5 | Pending |
| RIGHT-PANEL-02 | Phase 5 | Pending |
| RIGHT-PANEL-03 | Phase 5 | Pending |
| RIGHT-PANEL-04 | Phase 5 | Pending |
| CONFLICT-01 | Phase 6 | Pending |
| CONFLICT-02 | Phase 6 | Pending |
| CONFLICT-03 | Phase 6 | Pending |
| POLISH-01 | Phase 7 | Pending |
| POLISH-02 | Phase 7 | Pending |
| POLISH-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 23 total
- Mapped to phases: 23
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-22*
*Last updated: 2026-06-22 after initial definition*
