# Codebase Structure

**Analysis Date:** 2026-06-21

## Directory Layout

```
ultra-git/
├── .agents/            # Project agents configuration, rules, and workflows
├── .github/            # CI/CD pipelines
│   └── workflows/      # GitHub Action yaml scripts (E2E, Release)
├── e2e/                # E2E integration tests (Playwright)
├── resources/          # Native packaging assets (app icons)
├── src/                # Core application source code
│   ├── main/           # Main process (Electron startup, IPC handlers, Git service)
│   ├── preload/        # Preload scripts (secure API bridge mapping)
│   └── renderer/       # Renderer process (React GUI app)
│       ├── index.html  # HTML template mount
│       └── src/        # Renderer logic (App, styles, store, components)
│           ├── assets/ # Main stylesheets (main.css)
│           ├── components/ # Modular React GUI views
│           │   ├── details/ # Selection file details panels
│           │   ├── graph/   # Git history visualization graphs
│           │   ├── layout/  # Title bars and tab components
│           │   ├── sidebar/ # Local/remote branch lists sidebar
│           │   └── toolbar/ # Fetch/Push/Undo/Redo actions bar
│           └── store/  # State store (Zustand repo status & logs)
└── package.json        # Main project manifest and scripts catalog
```

## Directory Purposes

**src/main/**
- Purpose: Electron main process. Directly interfaces with the operating system, handles window life-cycle, directory pickers, and Git CLI spawning.
- Contains: `*.ts` source files.
- Key files:
  - [index.ts](file:///C:/DEV/ultra-git/src/main/index.ts) - Registers Electron lifecycle triggers and IPC handlers.
  - [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts) - Initialises and manages simple-git process drivers.

**src/preload/**
- Purpose: Preload context bridge. Binds Node context to window safe contexts.
- Contains: Preload typescript logic and declaration typings.
- Key files:
  - [index.ts](file:///C:/DEV/ultra-git/src/preload/index.ts) - Binds `api.git` and `api.app` to window objects.
  - [index.d.ts](file:///C:/DEV/ultra-git/src/preload/index.d.ts) - Provides typing bindings for global window variables.

**src/renderer/src/components/**
- Purpose: Modular React layout UI parts.
- Contains: React component stylesheets and JSX/TSX elements.
- Subdirectories:
  - `details/` - Selection file change viewers.
  - `graph/` - Visual commit items lists.
  - `layout/` - Header title tabs layout.
  - `sidebar/` - Local/remote branch selectors.
  - `toolbar/` - Workspace sync buttons.

**src/renderer/src/store/**
- Purpose: Zustand centralized state store.
- Contains: React state stores and their unit tests.
- Key files:
  - [useRepoStore.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/useRepoStore.ts) - Tab repository states, loaders, and error catch actions.
  - [useRepoStore.test.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/__tests__/useRepoStore.test.ts) - Suite validating repository tabs behaviors.

**e2e/**
- Purpose: End-to-end tests validating full system behavior.
- Contains: Playwright test files.
- Key files:
  - [example.spec.ts](file:///C:/DEV/ultra-git/e2e/example.spec.ts) - Launch confirmation test.
  - [tabs.spec.ts](file:///C:/DEV/ultra-git/e2e/tabs.spec.ts) - Multi-tab repository UI tests.

## Key File Locations

**Entry Points:**
- [src/main/index.ts](file:///C:/DEV/ultra-git/src/main/index.ts) - Desktop app main.
- [src/preload/index.ts](file:///C:/DEV/ultra-git/src/preload/index.ts) - Safe runtime bridge.
- [src/renderer/src/main.tsx](file:///C:/DEV/ultra-git/src/renderer/src/main.tsx) - React render mount.

**Configuration:**
- [package.json](file:///C:/DEV/ultra-git/package.json) - Bundling commands and dependencies.
- [electron.vite.config.ts](file:///C:/DEV/ultra-git/electron.vite.config.ts) - electron-vite rules.
- [playwright.config.ts](file:///C:/DEV/ultra-git/playwright.config.ts) - E2E tests orchestration rules.
- [tsconfig.json](file:///C:/DEV/ultra-git/tsconfig.json) - Compiler configuration.

## Naming Conventions

**Files:**
- PascalCase for React components: `DetailsPanel.tsx`, `Sidebar.tsx`.
- camelCase for store and main files: `useRepoStore.ts`, `git.ts`.
- kebab-case for test configurations, CI, and tools: `electron.vite.config.ts`, `e2e.yml`.
- `*.test.ts` for unit test files collocated inside `__tests__` directories.
- `*.spec.ts` for end-to-end spec files inside `e2e/` folder.

**Directories:**
- kebab-case for all source asset directories: `app-container`, `store`.

## Where to Add New Code

**New Feature (Renderer UI):**
- Create component under: `src/renderer/src/components/<feature-name>/`
- Add state properties/actions under: [useRepoStore.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/useRepoStore.ts)
- Add E2E tests: `e2e/<feature-name>.spec.ts`

**New Native Command (Main Process):**
- Add operation method to gitService: [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts)
- Register IPC handler under: [src/main/index.ts](file:///C:/DEV/ultra-git/src/main/index.ts)
- Add IPC binding to preload: [src/preload/index.ts](file:///C:/DEV/ultra-git/src/preload/index.ts)
- Add TypeScript definitions: [src/preload/index.d.ts](file:///C:/DEV/ultra-git/src/preload/index.d.ts)

## Special Directories

**out/**
- Purpose: Transpiled artifacts compiled from TSX to JS by electron-vite.
- Committed: No (listed in `.gitignore`).

**dist/**
- Purpose: Packaging distribution builds (installers).
- Committed: No (listed in `.gitignore`).

---

*Structure analysis: 2026-06-21*
*Update when directory structure changes*
