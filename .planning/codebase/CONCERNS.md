# Codebase Concerns

**Analysis Date:** 2026-06-21

## Tech Debt

**Mocked selection UI details:**
- Issue: File selection details are mocked. The panel displays "0 files modified" and "No selection" hardcoded.
- Files: [DetailsPanel.tsx](file:///C:/DEV/ultra-git/src/renderer/src/components/details/DetailsPanel.tsx)
- Why: Implemented as visual placeholder for Phase 1.
- Impact: Users cannot inspect commit changes or view changed file diffs.
- Fix approach: Implement file selection state in Zustand store and fetch/diff file changes via Main process Git service.

**Mocked Sidebar metadata:**
- Issue: Stashes, tags, and remote branches counts/lists are hardcoded to 0/empty.
- Files: [Sidebar.tsx](file:///C:/DEV/ultra-git/src/renderer/src/components/sidebar/Sidebar.tsx)
- Why: Visual placeholders.
- Impact: Users cannot switch remote branches or manage stashes/tags.
- Fix approach: Query Git repository stashes, tags, and remote branches during `refreshRepo` and store them in the Zustand repository object.

**Mocked Undo/Redo & toolbar buttons:**
- Issue: Toolbar action buttons (Undo, Redo, Push, Branch, Stash, Terminal) are visually present but lack click handlers and implementation.
- Files: [Toolbar.tsx](file:///C:/DEV/ultra-git/src/renderer/src/components/toolbar/Toolbar.tsx)
- Why: Toolbar items are placeholder buttons.
- Impact: Core functionality like Undo/Redo is missing.
- Fix approach: Hook up click handlers to Zustand store actions. Implement Git commands (e.g. reflog tracking for Undo/Redo) in the Main process service.

**Memory leak in Git instances caching:**
- Issue: `gitInstances` Map caches `SimpleGit` instances per path but has no mechanism to prune closed repositories.
- Files: [git.ts](file:///C:/DEV/ultra-git/src/main/git.ts)
- Why: Simple caching strategy to prevent re-initialization.
- Impact: If a user adds and closes many repositories, old SimpleGit objects remain in main process memory.
- Fix approach: Delete the cached instance from `gitInstances` Map when `removeRepo` is called in the renderer.

## Known Bugs

**Broken Playwright test configuration & assertion:**
- Symptoms: E2E test suite fails on `tabs.spec.ts` under normal execution.
- Trigger: Running `bun run test:e2e`.
- Files: [tabs.spec.ts](file:///C:/DEV/ultra-git/e2e/tabs.spec.ts)
- Workaround: None.
- Root cause:
  1. **Incorrect Test Fixture:** The test suite uses Playwright's web browser page fixture `({ page })` and attempts to navigate to `page.goto('/')`. Because it is an Electron app, there is no web server serving the root page, resulting in navigate protocol errors. The tests must launch the app via `_electron.launch` as done in `example.spec.ts`.
  2. **Invalid Assertion:** The switching test case asserts that at least 2 repository tabs are present (`expect(await tabs.count()).toBeGreaterThanOrEqual(2)`), but only 1 tab (the local project directory `.`) is loaded on startup, and no additional repository is added within the test.
- Fix approach: Refactor `tabs.spec.ts` to launch the application using `_electron.launch` and mock the dialog directory picker to simulate adding a second repository.

**Playwright browser dependencies missing:**
- Symptoms: Running E2E tests throws `browserType.launch: Executable doesn't exist` errors.
- Trigger: Running `bun run test:e2e` for the first time.
- Files: Project level.
- Workaround: Execute `npx playwright install chromium` to fetch required browser binaries.
- Root cause: Playwright Chromium browser binary is not pre-packaged or installed automatically on dependency installation.
- Fix approach: Document the installation command in the developer setup guidelines.

## Security Considerations

**Disabling Preload Sandbox:**
- Risk: The Main process window disables sandbox (`sandbox: false`) to allow the preload script to access native Node contexts/packages. Disabling the sandbox increases the vulnerability profile if untrusted HTML or remote URL loads are performed in the renderer window.
- Files: [index.ts](file:///C:/DEV/ultra-git/src/main/index.ts#L19)
- Current mitigation: The application blocks remote URLs from opening inside the app frame (`setWindowOpenHandler` redirects to `shell.openExternal`).
- Recommendations: Refactor Main and Preload scripts to allow `sandbox: true` if possible by removing direct Node dependencies in Preload, relying strictly on standard IPC events.

## Performance Bottlenecks

**Serial execution of Git Status and Git Log:**
- Problem: Both Git Status and Log queries run serially in `Promise.all` but log size can grow extremely large on big repositories.
- Files: [useRepoStore.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/useRepoStore.ts#L98-L101)
- Cause: Log fetches up to 50 commits (configured in gitService). In large repositories, formatting and transferring 50 commits' objects over IPC can introduce latency.
- Improvement path: Paginate log results or fetch them lazily as the user scrolls in the graph panel.

## Scaling Limits
- **Large Repository Log Limit:** Currently hardcoded to fetch a maximum of 50 logs. If a repository has a history of thousands of commits, the UI will scale fine, but the user will not be able to scroll past 50 commits until pagination is implemented.

## Test Coverage Gaps

**Untested Main Process Logic:**
- What's not tested: The IPC listener handlers and Git CLI execution wrappers in `git.ts` and `index.ts`.
- Risk: Changes in git version or CLI output patterns could break simple-git parsing unnoticed.
- Priority: High
- Difficulty to test: Requires setting up dummy Git mock workspaces during tests to assert real Git CLI executions.

**Untested Preload Script:**
- What's not tested: The safe bridge context bridge exposures.
- Risk: Typings or exposed key mismatches between Preload and Renderer will go undetected by unit tests.
- Priority: Medium

---

*Concerns audit: 2026-06-21*
*Update as issues are fixed or new ones discovered*
