# Coding Conventions

**Analysis Date:** 2026-06-21

## Naming Patterns

**Files:**
- PascalCase for React components (`DetailsPanel.tsx`, `Sidebar.tsx`, `Toolbar.tsx`).
- camelCase for store files, services, and preload hooks (`useRepoStore.ts`, `git.ts`).
- `*.test.ts` for unit test files stored inside collocated `__tests__` folders.
- `*.spec.ts` for E2E integration test files stored in the root `e2e/` folder.
- kebab-case for config files (`playwright.config.ts`, `electron.vite.config.ts`).

**Functions:**
- camelCase for all standard functions and helper utilities.
- Handlers prefixed with `handle` (e.g. `handleFetch`, `handleCloseTab`, `handleAddRepo`).

**Variables:**
- camelCase for variable names and properties.
- UPPER_SNAKE_CASE for global configurations or static const definitions (if added).

**Types:**
- PascalCase for TypeScript types and interfaces (`Repository`, `RepoState`).
- No `I` prefix for interfaces (prefer `Repository` over `IRepository`).

## Code Style

**Formatting:**
- 2-space indentation.
- Single quotes for string literals and import statements.
- **Semicolons:** Mixed. Semicolons are omitted in the renderer process and preload scripts, but are present in the main process codebase ([git.ts](file:///C:/DEV/ultra-git/src/main/git.ts)). Follow the collocated file's convention when updating.

**Linting:**
- Standard compile-time lint warnings emitted during `electron-vite build`.

## Import Organization

**Order:**
1. Third-party standard/external libraries (`react`, `electron`, `zustand`, `lucide-react`).
2. Internal aliases or workspace modules (`@renderer/...`).
3. Local relative dependencies (`../store/useRepoStore`, `./components`).
4. CSS stylesheets (`./assets/main.css`).

**Path Aliases:**
- `@renderer` maps directly to `src/renderer/src` as configured in [electron.vite.config.ts](file:///C:/DEV/ultra-git/electron.vite.config.ts).

## Error Handling

**Main Process Boundary:**
- Native operations must be wrapped in try/catch blocks within the IPC registers.
- All IPC calls return a consistent JSON structure:
  ```typescript
  export type IpcResponse<T = any> = {
    success: boolean;
    data?: T;
    error?: string;
  };
  ```

**Zustand/UI Layer:**
- Store actions catch rejected promises from IPC handles and populate the repository's `error` parameter.
- Set `isLoading: false` in error blocks to prevent UI lockup.

## Logging
- Standard `console.log` and `console.error` are utilized to log debugging information across IPC steps.

## Function Design
- React components use Arrow Function syntax typed as `React.FC` (e.g. `const Sidebar: React.FC = () => { ... }`).
- Component exports: React components use `export default ComponentName`, while state modules/hooks use named exports (`export const useRepoStore = ...`).
- Return early using guard clauses.

---

*Convention analysis: 2026-06-21*
*Update when patterns change*
