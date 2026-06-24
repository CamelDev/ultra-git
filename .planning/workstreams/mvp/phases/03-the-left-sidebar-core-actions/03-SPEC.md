# Phase 3: Left Sidebar & Core Actions — Playwright E2E Testing Scaffolding & Setup Specification

**Created:** 2026-06-22
**Ambiguity score:** 0.1625 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Introduce Playwright E2E testing for the Electron application to detect and prevent regressions. The test runner will automatically build the production assets, bootstrap the Electron app, initialize fully isolated temporary git repositories on the fly for authentic testing, and utilize strict user-facing elements and `data-testid` selectors instead of brittle CSS/DOM path selectors.

## Background

The application is a tabbed desktop Git client built with Bun, Electron, React, and simple-git. Currently, there is a broken skeleton test suite (`e2e/tabs.spec.ts`) that attempts to run like a normal web app (using standard browser page fixtures and `page.goto('/')`), which fails in an Electron shell where there is no local web server. The tests also rely on brittle CSS class selectors like `.tab` and `.lucide-plus`. We need to replace this with a robust Electron-native E2E testing infrastructure that executes against production-built code and verifies core user journeys using high-fidelity real Git repository sandboxes.

## Requirements

1. **REQ-E2E-01**: Playwright Pre-test Build Integration
   - Current: `package.json` contains `"test:e2e": "playwright test"` which runs on whatever files happen to be in `./out/`, risking testing stale code.
   - Target: `package.json` and Playwright config are structured so that executing `bun run test:e2e` automatically runs the production build step `electron-vite build` first to ensure we always test the newest compiled main and renderer assets.
   - Acceptance: Running `bun run test:e2e` compiles the codebase; if compilation fails, the test suite aborts immediately.

2. **REQ-E2E-02**: Automated Electron-Native Application Launch
   - Current: `e2e/tabs.spec.ts` relies on browser-style web fixtures and fails with navigation protocol errors.
   - Target: All tests utilize a standard, reusable Electron launcher that invokes Playwright's `_electron.launch` to bootstrap the compiled production build from `./out/main/index.js` with correct environment variables and window load states.
   - Acceptance: Tests launch the native Electron shell, wait for the DOM load state, and terminate clean-up hooks safely without leaving zombie Electron processes.

3. **REQ-E2E-03**: Temporary Isolated Git Sandbox
   - Current: Tests do not have a standard mechanism to interact with real Git repositories; the broken tabs test asserts on state isolation without an active sandbox.
   - Target: E2E tests can instantiate a clean, fully-functioning temporary Git repository on the fly inside the git-ignored `test-results/` directory, perform actual commits/branches, load it into the application, and prune the folder upon test teardown.
   - Acceptance: Every test that needs Git operates on a completely unique, temporary Git repository path, verifying 1:1 real-world simple-git behavior without polluting the workspace.

4. **REQ-E2E-04**: Resilient Selector Strategy using Data-Testids
   - Current: Tests select DOM elements using class names like `.tab` and `svg.lucide-plus`.
   - Target: All Playwright locator strategies target resilient user-facing labels (e.g. `getByRole`, `getByText`) or explicit `data-testid` attributes (e.g. `data-testid="add-tab-button"`), with zero reliance on brittle CSS classes or internal React styles.
   - Acceptance: No test uses raw CSS classes for matching or asserting key UI states. React components are updated with `data-testid` attributes where necessary.

5. **REQ-E2E-05**: Headless CI/CD Integration
   - Current: `.github/workflows/e2e.yml` runs on pushes and pull requests but lacks artifact capturing or parallel-safety boundaries for Electron.
   - Target: CI runs the newly configured E2E tests inside a headless virtual framebuffer (`xvfb-run`) on Linux, forces serial worker execution to avoid parallel window conflicts, and captures HTML reports on failure.
   - Acceptance: GitHub action completes successfully on a green run, and on failure, uploads a zipped Playwright HTML report and trace zip as workflow run artifacts.

## Boundaries

**In scope:**
- Production-built Electron E2E test execution scaffolding and reusable launch fixtures.
- Rewriting the broken `tabs.spec.ts` suite to use `_electron.launch`, mock folder dialog IPCs, and resilient selectors.
- Scaffolding a helper class/fixture to initialize and teardown temporary Git repositories.
- Standardizing and implementing `data-testid` attributes in React renderer components (`TitleBar`, `Sidebar`, `Toolbar`, `DetailsPanel`).
- Executing tests sequentially (workers: 1) on both local macOS/Windows environments and Ubuntu CI.

**Out of scope:**
- Setting up mocking servers for remote repository URLs (remotes are tested using local mock directory configurations or excluded).
- Unit testing or component testing in isolation (handled by xUnit/Vitest in respective projects).
- Testing non-Git filesystem interactions beyond repository operations.

## Constraints

- E2E tests must be run serially (Playwright `workers: 1`) because multiple spawned Electron processes opening native OS windows can interfere with focus, OS-level menus, and filesystem dialogs during testing.
- Playwright Chromium/Electron execution requires OS dependencies (e.g. GTK, Xvfb on headless Linux environments) which must be resolved before executing the test command.

## Acceptance Criteria

- [ ] `bun run test:e2e` automatically builds the application via `electron-vite build` prior to starting Playwright.
- [ ] No E2E test utilizes standard web-browser browser context navigation (e.g., `page.goto('/')` is banned; `_electron.launch` must be used).
- [ ] Every test requiring a Git repository initializes its own unique, isolated sandbox in `test-results/` and safely deletes it post-execution.
- [ ] All assertions and UI clicks target user-facing attributes or `data-testid` elements.
- [ ] GitHub Actions CI executes `xvfb-run bun run test:e2e` on pushes and PRs, run with worker count of 1.
- [ ] CI workflow captures and saves trace/HTML report artifacts on test failure.

## Edge Coverage

**Coverage:** 10/10 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | REQ-E2E-01 | ✅ covered | If production compilation fails, the pre-test hook aborts immediately so tests do not run against stale builds. |
| unclassified | REQ-E2E-02 | ✅ covered | If the Electron process fails to boot or times out (30s), the test runner fails with a descriptive timeout exception. |
| unclassified | REQ-E2E-03 | ✅ covered | Sandbox initialization failures (like directory locks) trigger an immediate abort, preventing false test execution, and clean up partial outputs. |
| empty | REQ-E2E-04 | ✅ covered | Assertions for empty states (e.g., "no stashes", "no active tab") must target specific empty-state text matches or `data-testid` elements rather than checking class absence. |
| adjacency | REQ-E2E-04 | ✅ covered | When matching multiple identical elements (like tabs), tests must scope using parent/child test ID structures rather than using fragile global indexing like `.first()`. |
| ordering | REQ-E2E-04 | ✅ covered | Test lists whose values are dynamic must sort/assert values explicitly rather than assuming DOM index orders. |
| empty | REQ-E2E-05 | ✅ covered | CI runner environments where Electron binaries fail to start are caught via `xvfb-run` startup check and exit code. |
| adjacency | REQ-E2E-05 | ✅ covered | Multiple concurrent CI pipeline runs are isolated on separate runner nodes, preventing workspace pollution. |
| ordering | REQ-E2E-05 | ✅ covered | Test file executions are ordered dynamically by Playwright, but run strictly in a serial execution queue (workers: 1). |
| concurrency | REQ-E2E-05 | ✅ covered | Set `workers: 1` in Playwright config to avoid concurrent native Electron window focus theft and local file locking issues during test runs. |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT write or leak temporary testing directories or repositories to the active project workspace. | REQ-E2E-03 | resolved | **verification: test**<br>check_kind: `node-test`<br>check_target: `e2e/helpers/git-sandbox.ts`<br>check_violation_fixture: `test-results/` is verified to contain all created paths, and is explicitly ignored in `.gitignore`. |
| MUST NOT fall back to raw CSS selectors (e.g., `.tab`) or deep DOM trees for test assertions or interactions. | REQ-E2E-04 | resolved | **verification: judgment**<br>Enforced through automated PR code reviews and checking for non-standard locators. |
| MUST NOT modify global or user-level Git configuration (`git config --global`) during test execution. | REQ-E2E-03 | resolved | **verification: test**<br>check_kind: `node-test`<br>check_target: `e2e/helpers/git-sandbox.ts`<br>All Git operations inside the sandbox are run strictly with local parameters or local `--git-dir` environment isolation. |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                              |
|--------------------|-------|------|--------|------------------------------------|
| Goal Clarity       | 0.85  | 0.75 | ✓      | Specific outcome: self-built, real Git repos, data-testids |
| Boundary Clarity   | 0.80  | 0.70 | ✓      | Clear in-scope/out-of-scope boundaries |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Sequential execution, production-build, Linux virtual frame |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 6 specific, binary checkable criteria |
| **Ambiguity**      | 0.1625| ≤0.20| ✓      | Gate passed! Ready to write SPEC. |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective    | Question summary                                                      | Decision locked                                                                                        |
|-------|----------------|-----------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| 1     | Researcher     | Run against production assets or active dev server?                   | Production build (`electron-vite build`) is executed as a pre-test step before running Playwright (Option A). |
| 2     | Simplifier     | Use high-fidelity real Git repository sandboxes or mocked IPC state? | Use real Git sandbox repositories initialized and torn down on the fly inside `test-results/`.           |
| 3     | Boundary Keeper| Use user-facing attributes or custom test IDs?                       | Strict use of user-facing attributes and explicit `data-testid` elements. No reliance on brittle classes. |

---

*Phase: 03-the-left-sidebar-core-actions*
*Spec created: 2026-06-22*
*Next step: /gsd-discuss-phase 3 — implementation decisions (how to build what's specified above)*
