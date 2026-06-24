# UltraGIT

## What This Is

UltraGIT is a modern, high-performance desktop Git client built with Electron, React, TypeScript, and Bun. It is designed to provide a seamless, visual Git experience with advanced features built-in to handle complex workflows effortlessly. Inspired by industry-leading desktop clients, UltraGIT combines raw Git power with an intuitive, premium interface.

## Core Value

Provide a high-performance, premium desktop Git visual experience with seamless tabbed multi-repository support and automatic conflict resolution.

## Requirements

### Validated

- ✓ **BOILERPLATE-01**: Initialize Electron + TypeScript + React boilerplate using Bun — Phase 1
- ✓ **IPC-01**: Configure secure and fast IPC communication between Electron main and renderer — Phase 1
- ✓ **UI-SHELL-01**: Build the main UI shell (Header, Sidebar, Graph View container, Right Details panel) — Phase 1
- ✓ **GIT-API-01**: Expose core Git operations (status, fetch, log) from main process via simple-git — Phase 1
- ✓ **TABS-01**: Implement multi-repository tab management system with individual state isolation — Phase 2
- ✓ **OPEN-FLOW-01**: Create repo opening flow with native folder selection — Phase 2

### Active

- [ ] **SIDEBAR-01**: Retrieve and list local and remote branches in the sidebar — Phase 3
- [ ] **SIDEBAR-02**: Fetch and display stash list and tags in collapsible sections — Phase 3
- [ ] **SIDEBAR-03**: Support branch filtering (local vs remote branches, tags, stashes) — Phase 3
- [ ] **TOOLBAR-01**: Implement common Git operations: Pull, Push, Fetch, Checkout, Stash, Pop — Phase 3
- [ ] **GRAPH-01**: Retrieve full history (commits, parents, branches, tags, metadata) — Phase 4
- [ ] **GRAPH-02**: Render commit graph using Canvas/SVG showing branches/merges clearly — Phase 4
- [ ] **GRAPH-03**: Handle commit selection to update current context — Phase 4
- [ ] **RIGHT-PANEL-01**: Display details of selected commit (author info, date, changed files) — Phase 5
- [ ] **RIGHT-PANEL-02**: Toggle changed file list between flat Path and folder Tree views — Phase 5
- [ ] **RIGHT-PANEL-03**: Visual inline code diff viewer for selected file changes — Phase 5
- [ ] **RIGHT-PANEL-04**: WIP view showing modified uncommitted files with stage/unstage checkboxes — Phase 5
- [ ] **CONFLICT-01**: Implement manual Merge, Rebase, and Cherry-pick operations — Phase 6
- [ ] **CONFLICT-02**: Interactive conflict resolution UI with a visual 3-way split diff view — Phase 6
- [ ] **CONFLICT-03**: Intelligent auto-resolve heuristical algorithm for merge conflicts — Phase 6
- [ ] **POLISH-01**: Premium dark mode theme with glassmorphism, gradients, and micro-animations — Phase 7
- [ ] **POLISH-02**: Git lazy-loading and virtualization for huge repositories (100k+ commits) — Phase 7
- [ ] **POLISH-03**: Keyboard shortcuts and global command palette — Phase 7

### Out of Scope

- **Cloud Hosting of Repositories**: UltraGIT is a local-first Git client; we do not host git repos — Defer to standard platforms like GitHub/GitLab
- **Full IDE features**: Code editing is limited to staging/resolution; not a replacement for VS Code — Out of scope
- **Custom Git server**: No hosting capabilities — Beyond client scope

## Context

UltraGIT is developed using Bun as package manager and runtime.
- Electron builder is set up for packaging cross-platform binaries.
- The UI shell and tab system are fully operational, including isolation of state per tab.
- Tests are executed using Playwright for E2E testing, ensuring UI and IPC stability.

## Constraints

- **Tech Stack**: Bun, Electron, React, Tailwind CSS, simple-git — Must adhere to these core technologies for uniformity.
- **IPC Safety**: Direct exposure of native node modules in the renderer is forbidden; use preload scripts and contextBridge.
- **E2E Testing**: All primary UI interaction pathways must be verified with Playwright tests.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bun package manager | Blazing fast installations, built-in test runner, and native bundler | ✓ Good |
| Electron + React + Tailwind CSS | Native desktop feel combined with standard web ecosystem | ✓ Good |
| State Isolation per Tab | Prevents bleed of Git status/branch state when switching repositories | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-22 after initialization*
