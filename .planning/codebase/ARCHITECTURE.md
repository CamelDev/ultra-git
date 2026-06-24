# Architecture

**Analysis Date:** 2026-06-21

## Pattern Overview

**Overall:** Electron Multi-process desktop application.

**Key Characteristics:**
- **Process Separation:** Node.js/Bun-enabled Main process handles system operations (filesystem, Git CLI execution), while Chromium-based Renderer process handles user interface presentation.
- **Secure Bridge:** Inter-Process Communication (IPC) is strictly managed using Electron's `contextBridge` to prevent direct Node.js exposure within React.
- **Single-Page Application (SPA):** Single React shell window managing tabs dynamically using in-memory state.

## Layers

**Main Process (`src/main/`):**
- Purpose: Entry point for the application. Owns the system shell window and spawns native OS operations.
- Contains: IPC handlers, window creation, simple-git integrations.
- Key Files: [index.ts](file:///C:/DEV/ultra-git/src/main/index.ts) (IPC registry & startup), [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts) (Git CLI driver).
- Depends on: `simple-git`, Electron API.
- Used by: System startup.

**Preload Script (`src/preload/`):**
- Purpose: Safely bridges Main process capabilities into the Renderer context.
- Contains: Secure IPC bridges mapping `ipcRenderer.invoke` calls to window-level functions.
- Key Files: [index.ts](file:///C:/DEV/ultra-git/src/preload/index.ts), [index.d.ts](file:///C:/DEV/ultra-git/src/preload/index.d.ts).
- Depends on: Electron APIs.
- Used by: Renderer process.

**Renderer Process (`src/renderer/`):**
- Purpose: GUI render layer presenting Git repositories visually.
- Contains: React components, styling, store state managers.
- Key Files: [App.tsx](file:///C:/DEV/ultra-git/src/renderer/src/App.tsx), [useRepoStore.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/useRepoStore.ts).
- Depends on: React, Zustand, Preload bridge (`window.api`).
- Used by: Main process Chromium window.

## Data Flow

**1. IPC Git Command Invocation (e.g. Fetching status):**
1. React component triggers tab update via Zustand action: `refreshRepo(id)` in [useRepoStore.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/useRepoStore.ts).
2. Store action invokes preload bridge API: `window.api.git.status(path)`.
3. Preload script routes request through Electron IPC channel: `ipcRenderer.invoke('git:status', path)`.
4. Main process IPC handler catches request in [index.ts](file:///C:/DEV/ultra-git/src/main/index.ts) and calls `gitService.status(path)`.
5. `gitService` gets or creates a `simpleGit` instance for that path in [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts).
6. `simpleGit` spawns a native OS git process (`git status`) and resolves its stdout.
7. Main process serializes and returns the response back to the renderer.
8. Store processes response: updates status, branch, and logs loader states, prompting React re-renders.

**2. Repository Directory Selection:**
1. User clicks the "+" (Add Tab) button in the [TitleBar.tsx](file:///C:/DEV/ultra-git/src/renderer/src/components/layout/TitleBar.tsx).
2. Tab handler invokes preload bridge API: `window.api.app.openDirectory()`.
3. Main process handles the request by launching a native dialog: `dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })`.
4. User selects directory; Main process returns the selected absolute path to the renderer.
5. Store action `addRepo(path)` adds the new repository to the tab list and updates the active repository ID.

**State Management:**
- Zustand Store: Manages active repositories, current active tab, loading indicator states, and errors globally in the React UI layer.

## Key Abstractions

**Repository Store (`useRepoStore`):**
- Purpose: Global state machine containing tab metadata and active workspace pointers.
- Pattern: Zustand store hook.

**Git Service (`gitService`):**
- Purpose: Singleton wrapper that configures and manages `simple-git` instances. Caches instances per repository path.
- Pattern: Service manager pattern.

## Entry Points

**Main Entry:**
- Location: [src/main/index.ts](file:///C:/DEV/ultra-git/src/main/index.ts)
- Responsibility: Main process startup, Window instantiation, IPC handler registration.

**Preload Entry:**
- Location: [src/preload/index.ts](file:///C:/DEV/ultra-git/src/preload/index.ts)
- Responsibility: Safe API bridging.

**Renderer Entry:**
- Location: [src/renderer/src/main.tsx](file:///C:/DEV/ultra-git/src/renderer/src/main.tsx)
- Responsibility: Mounting React into `index.html`.

## Error Handling

**Strategy:** Main process wraps native/Git operations in try-catch and returns a standard structure: `{ success: boolean; data?: T; error?: string; }`. Renderer inspects `success` flag and stores failures in the Zustand store's `error` properties, displaying user-friendly error banners.

## Cross-Cutting Concerns

**Security:**
- contextIsolation is enabled.
- Sandbox is disabled for preload to allow node modules access (electron-toolkit utilities).

**Performance:**
- Spawning limit is optimized in [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts) using `maxConcurrentProcesses: 6`.
- Main process parses complex stdout from git and passes only required structures to minimize serialization overhead across the IPC boundary.

---

*Architecture analysis: 2026-06-21*
*Update when major patterns change*
