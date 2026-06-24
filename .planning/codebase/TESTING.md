# Testing Patterns

**Analysis Date:** 2026-06-21

## Test Framework

**Runner:**
- **Unit Tests:** Bun Test runner (built-in). Executes TypeScript tests natively with high compatibility with Vitest/Jest APIs.
- **E2E Integration Tests:** Playwright 1.58.2.

**Assertion Library:**
- Bun/Vitest standard `expect` assertions (e.g., `toBe`, `toEqual`, `toBeNull`, `toBeTruthy`, `toBeGreaterThanOrEqual`).

**Run Commands:**
```bash
bun test src                          # Runs only unit tests
bun run test:e2e                      # Runs Playwright E2E test suite
```

## Test File Organization

**Location:**
- Unit tests are placed inside `__tests__/` subdirectories collocated next to the target code.
- E2E integration tests are stored under the root `e2e/` folder.

**Naming:**
- Unit tests: `*.test.ts`.
- E2E tests: `*.spec.ts`.

**Structure:**
```
src/
  renderer/
    src/
      store/
        useRepoStore.ts
        __tests__/
          useRepoStore.test.ts        # Unit test file
e2e/
  example.spec.ts                     # E2E test file
  tabs.spec.ts                        # E2E test file
```

## Test Structure

**Suite Organization:**
Unit tests follow the BDD describe-it pattern:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRepoStore } from '../useRepoStore'

describe('useRepoStore', () => {
  beforeEach(() => {
    // Reset store state between tests to avoid bleed-through
    useRepoStore.setState({ repositories: [], activeId: null });
    vi.clearAllMocks();
  });

  it('should initial state be empty', () => {
    const state = useRepoStore.getState();
    expect(state.repositories).toEqual([]);
  });
});
```

## Mocking

**Preload API Mocking:**
Since renderer tests run in a headless CLI context without Electron window boundaries, `window.api` must be mocked:
```typescript
const mockApi = {
  git: {
    status: vi.fn().mockResolvedValue({ success: true, data: { current: 'main' } }),
    log: vi.fn().mockResolvedValue({ success: true, data: { all: [] } }),
  },
  app: {
    openDirectory: vi.fn(),
  }
}

// Bind mock to global object
global.window = { api: mockApi }
```

## Coverage
- No test coverage reports are configured in the project.

## Test Types

**Unit Tests:**
- Focus: Testing the store state transitions, UI mutations, and state management logics in isolation.
- File: [useRepoStore.test.ts](file:///C:/DEV/ultra-git/src/renderer/src/store/__tests__/useRepoStore.test.ts).

**E2E Integration Tests:**
- Focus: Launching the Electron application package shell, confirming DOM lifecycle, checking title strings, and testing layout responsiveness.
- Files: [example.spec.ts](file:///C:/DEV/ultra-git/e2e/example.spec.ts), [tabs.spec.ts](file:///C:/DEV/ultra-git/e2e/tabs.spec.ts).

---

*Testing analysis: 2026-06-21*
*Update when test patterns change*
