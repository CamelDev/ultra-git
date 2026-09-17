# Phase 6: Automatic Conflict Resolution & Advanced Merging - Pattern Map

**Mapped:** 2026-09-17
**Files analyzed:** 26 proposed new/modified files
**Analogs found:** 26 / 26 (several are role matches only; there is no existing authoritative index-stage parser or atomic multi-hunk transaction)

## Scope Extracted from Research

The research proposes a brownfield refactor across four existing seams:

1. Move conflict truth and mutation safety into a dedicated main-process service.
2. Extend the existing narrow Electron bridge with structured operation/conflict contracts.
3. Replace component-local conflict state with a reducer-backed, repository-scoped session.
4. Decompose the current monolithic resolver into an accessible workbench while hardening partial staging.

The proposed files below combine the explicit project structure from `06-RESEARCH.md` with the files the research identifies as necessary integration points. Resolution-reuse tests are included because Wave 4 and CONFLICT-03 explicitly require them, even though the implementation may remain inside `conflictService.ts` rather than gaining a separate production module.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/main/conflictService.ts` (new) | service | file-I/O, request-response, transform | `src/main/git.ts` | role/data-flow match |
| `src/main/git.ts` | service/facade | request-response | existing `gitService` methods in the same file | exact |
| `src/main/index.ts` | controller / IPC boundary | request-response, event-driven | existing `git:*` handlers in the same file | exact |
| `src/preload/index.ts` | provider / IPC bridge | request-response | existing `api.git` bridge in the same file | exact |
| `src/preload/index.d.ts` | model / contract | request-response | `IpcResponse<T>` and existing Git API declarations | exact |
| `src/renderer/src/env.d.ts` | model / contract | request-response | existing Smart Pull and conflict method declarations | exact, but duplicated contract |
| `src/renderer/src/store/conflictSession.ts` (new) | store / pure reducer | event-driven, transform | `src/renderer/src/store/useUndoStore.ts` | role match |
| `src/renderer/src/store/__tests__/conflictSession.test.ts` (new) | test | event-driven, transform | `src/renderer/src/store/__tests__/useUndoStore.test.ts` | exact test style |
| `src/renderer/src/store/useRepoStore.ts` | store | request-response, event-driven | `refreshRepo` in the same file | exact integration seam |
| `src/renderer/src/components/conflicts/ConflictWorkbench.tsx` (new) | component/controller | event-driven, request-response | `components/sidebar/ConflictResolver.tsx` + `components/dialogs/AppDialog.tsx` | role match |
| `src/renderer/src/components/conflicts/ConflictFileList.tsx` (new) | component | event-driven | current file queue in `ConflictResolver.tsx` | exact extraction |
| `src/renderer/src/components/conflicts/ConflictHunkView.tsx` (new) | component | transform, event-driven | `ConflictResolver.tsx` `HunkPane` + `DiffModal.tsx` | exact extraction |
| `src/renderer/src/components/conflicts/ResolutionEditor.tsx` (new) | component | event-driven, transform | current result preview in `ConflictResolver.tsx` | partial; current result is read-only |
| `src/renderer/src/components/conflicts/conflict-workbench.css` (new) | config/style | presentation | diff-modal rules in `src/renderer/src/assets/main.css` | role match |
| `src/renderer/src/components/sidebar/ConflictResolver.tsx` | component | event-driven, request-response | existing implementation in the same file | exact migration source |
| `src/renderer/src/App.tsx` | controller/component | event-driven | current `conflictState` orchestration in the same file | exact seam |
| `src/renderer/src/components/toolbar/Toolbar.tsx` | component | event-driven, request-response | existing operation actions in the same file | exact seam |
| `src/renderer/src/components/graph/GraphView.tsx` | component | event-driven, request-response | existing conflict banner/actions in the same file | exact seam |
| `src/renderer/src/components/details/DiffModal.tsx` | component/controller | event-driven, request-response | existing hunk/line actions in the same file | exact |
| `src/renderer/src/utils/patchBuilder.ts` | utility | transform | existing patch builders in the same file | exact migration source |
| `src/main/__tests__/conflictService.test.ts` (new) | integration test | file-I/O, request-response | `git.patch.test.ts` + `git.rebase-status.test.ts` | exact test style |
| `src/main/__tests__/git.partialPatch.test.ts` (new) | integration test | file-I/O, batch | `src/main/__tests__/git.patch.test.ts` | exact |
| `e2e/rebase-conflict-resolver.spec.ts` (new) | E2E test | event-driven, file-I/O | `e2e/conflict-resolver.spec.ts` | exact |
| `e2e/partial-staging.spec.ts` (new) | E2E test | event-driven, file-I/O | `e2e/conflict-resolver.spec.ts` + DiffModal test IDs | role match |
| `src/main/__tests__/conflictResolutionReuse.test.ts` and `e2e/conflict-resolution-reuse.spec.ts` (new) | integration/E2E tests | file-I/O, request-response | real-repository setup in `git.patch.test.ts` and `GitSandbox` | role match |

## Pattern Assignments

### `src/main/conflictService.ts` (service; file-I/O, request-response, transform)

**Primary analog:** `src/main/git.ts`

Use the existing main-process conventions—typed exported models, `simple-git` for ordinary commands, `execFile` for stdin/binary-sensitive commands, argument arrays, and async filesystem APIs—but isolate conflict responsibilities from the already 2,000+ line `git.ts` facade.

**Imports and typed contract pattern** (`src/main/git.ts:1-16`, `31-40`):

```typescript
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import fs from 'fs';
import { join, resolve } from 'path';
import { execFile } from 'child_process';

export interface ConflictedFile {
  path: string;
  status: 'UU' | 'AA' | 'DD' | 'AU' | 'UA' | 'DU' | 'UD';
}

export interface MergeStatus {
  isMerge: boolean;
  isRebase: boolean;
  isCherryPick: boolean;
  inProgress: boolean;
  currentStep?: number;
  totalSteps?: number;
  currentCommitSubject?: string;
  branchName?: string;
}
```

**Operation metadata pattern to preserve and extend** (`src/main/git.ts:1758-1770`, `1777-1783`):

```typescript
const gitResolvedPath = resolve(repoPath, gitDir);
const mergeHeadPath = join(gitResolvedPath, 'MERGE_HEAD');
const rebaseApplyPath = join(gitResolvedPath, 'rebase-apply');
const rebaseMergePath = join(gitResolvedPath, 'rebase-merge');
const cherryPickHeadPath = join(gitResolvedPath, 'CHERRY_PICK_HEAD');

const readFileSafe = async (p: string): Promise<string | null> => {
  try {
    return await fs.promises.readFile(p, 'utf8');
  } catch {
    return null;
  }
};
```

Extend this into `OperationSnapshot`; do not replace the proven merge/rebase/cherry-pick detection logic. Add `generation`, normalized phase, conflicts, and operation-aware labels.

**Command invocation pattern** (`src/main/git.ts:1006-1016`):

```typescript
const child = execFile('git', args, { cwd: repoPath }, (error, stdout, stderr) => {
  if (error) reject(new Error(stderr || error.message));
  else resolve(stdout);
});
child.stdin?.write(patch);
child.stdin?.end();
```

Use this shape for NUL-safe `git ls-files --unmerged -z`, stage-blob reads, and exact patch preflight/application where `simple-git` string handling is insufficient. Preserve argument arrays and explicit `--` path separators.

**Error contract:** service methods should throw typed/code-bearing errors (`INVALID_REPOSITORY`, `PATH_OUTSIDE_REPOSITORY`, `STALE_GENERATION`, `STALE_DIFF`, `UNSUPPORTED_CONFLICT`) and let the IPC boundary serialize them. The current service throws ordinary `Error`; the new service is the right layer to improve this.

**Important non-pattern:** do not copy marker parsing or unchecked writes from `src/main/git.ts:1666-1746`. That code is the behavior being replaced. Specifically, avoid `status --porcelain=v1`, `join(repoPath, filePath)` without containment checks, and treating a missing working-tree file as an empty text conflict.

---

### `src/main/git.ts` (service facade; request-response)

Keep public method names as compatibility delegates while moving conflict implementation to `conflictService.ts`. Existing merge/rebase command construction is concise and should remain recognizable.

**Start-operation pattern** (`src/main/git.ts:1601-1624`):

```typescript
const args: string[] = ['merge'];
if (strategy === 'no-ff') args.push('--no-ff');
else if (strategy === 'squash') args.push('--squash');
args.push('--no-edit', sourceBranch);
try {
  await git.raw(args);
  return { hadConflicts: false, conflictedFiles: [] as ConflictedFile[] };
} catch (err: any) {
  if ((err.message || '').includes('CONFLICT')) {
    const conflictedFiles = await gitService.getConflictedFiles(repoPath);
    return { hadConflicts: true, conflictedFiles };
  }
  throw err;
}
```

Change the result to the shared snapshot rather than retaining parallel `{ hadConflicts }` branches. After every start/continue/skip/abort, obtain and return the authoritative next snapshot.

**Noninteractive continuation pattern** (`src/main/git.ts:2002-2005`):

```typescript
await git.raw(['-c', 'core.editor=true', 'cherry-pick', '--continue']);
return { success: true };
```

Apply the same controlled-editor pattern to rebase continuation. Do not copy current `rebase --continue` (`src/main/git.ts:1654-1657`) unchanged.

---

### `src/main/index.ts` (IPC controller; request-response)

**Analog:** existing Git IPC handler family.

**Response-envelope pattern** (`src/main/index.ts:705-738`):

```typescript
ipcMain.handle('git:getConflictedFiles', async (_, repoPath) => {
  try {
    const data = await gitService.getConflictedFiles(repoPath)
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
```

Keep `{ success, data?, error? }` for compatibility, but add a stable `code?` for actionable errors. New conflict handlers should be grouped with existing operation handlers (`src/main/index.ts:651-739`).

**Security pattern gap:** no existing Git handler validates `event.senderFrame`, opened-repository membership, payload size, generation, or path containment. Therefore this phase must introduce a shared guard before calling the service; copying the current `_` event parameter is explicitly insufficient. The guard should resolve the canonical repository/target paths and reject absolute, traversal, symlink-escape, oversized-content, and stale-generation inputs.

---

### `src/preload/index.ts`, `src/preload/index.d.ts`, and `src/renderer/src/env.d.ts` (bridge and contracts)

**Narrow bridge pattern** (`src/preload/index.ts:64-77`):

```typescript
rebase: (repoPath: string, ontoBranch: string) =>
  ipcRenderer.invoke('git:rebase', repoPath, ontoBranch),
continueRebase: (repoPath: string) => ipcRenderer.invoke('git:continueRebase', repoPath),
getConflictFileDiff: (repoPath: string, filePath: string) =>
  ipcRenderer.invoke('git:getConflictFileDiff', repoPath, filePath),
resolveConflict: (repoPath: string, filePath: string, resolvedContent: string) =>
  ipcRenderer.invoke('git:resolveConflict', repoPath, filePath, resolvedContent),
```

Add purpose-specific methods such as `getOperationSnapshot`, `getConflictDocument`, `applyConflictResolution`, `continueOperation`, `skipOperation`, `abortOperation`, and `applyPartialPatchTransaction`. Do not expose raw Git or generic filesystem execution.

**Response type pattern** (`src/preload/index.d.ts:3-8`):

```typescript
export type IpcResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};
```

Use generics rather than the current `any`-heavy renderer declarations. Add `code?: ConflictErrorCode` and define the operation/conflict document once in a shared module if the build layout permits. The current comment in `env.d.ts:5`—“mirrors src/main/git.ts — keep in sync”—documents an existing duplication hazard; do not add a third independently maintained version.

---

### `src/renderer/src/store/conflictSession.ts` (pure reducer/store model; event-driven transform)

**Primary analog:** `src/renderer/src/store/useUndoStore.ts`

**Discriminated state and repository isolation pattern** (`useUndoStore.ts:3-17`, `62-75`, `81-109`):

```typescript
export type UndoActionType = 'STAGE' | 'UNSTAGE' | 'COMMIT' | 'RESET' | 'DISCARD' | 'UNTRACK'

interface UndoState {
  undoStacks: Record<string, UndoAction[]>
  redoStacks: Record<string, UndoAction[]>
  pushAction: (action: NewUndoAction) => void
  clearForRepo: (repoPath: string) => void
}

const normalizePath = (p: string) =>
  (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStacks: {},
  redoStacks: {},
  // immutable updates through set(state => ...)
}))
```

Model the conflict session with discriminated events and explicit states. Hunk choices must begin as `unresolved`; choices should include `current`, `incoming`, both orders, and `manual`. Key sessions by repository identity/path, and reset per-file edits only when the authoritative `generation` changes—not whenever the component rerenders.

Prefer exporting a pure reducer and selectors (`canApplyFile`, `unresolvedCount`, `canContinue`) separately from any Zustand wrapper so tests do not need `window.api` mocks.

---

### `src/renderer/src/store/__tests__/conflictSession.test.ts` (unit test; event-driven transform)

**Analog:** `src/renderer/src/store/__tests__/useUndoStore.test.ts`.

**Reset-and-assert style** (`useUndoStore.test.ts:1-29`, `32-49`):

```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test'

beforeEach(() => {
  useUndoStore.setState({ undoStacks: {}, redoStacks: {}, restoredCommitMessage: null })
})

it('should initially have empty undo/redo stacks', () => {
  expect(useUndoStore.getState().canUndo('/path/to/repo')).toBe(false)
})
```

Cover: initial unresolved hunks, each resolution action, manual edits, both-order choices, generation replacement, stale event rejection, repository isolation, structural file choices, and the rule that opening/viewing never resolves content.

---

### `src/renderer/src/store/useRepoStore.ts` (store integration; request-response/event-driven)

**Analog:** existing authoritative refresh aggregation (`useRepoStore.ts:481-504`, `542-560`).

```typescript
const [statusRes, logRes, stashRes, branchesRes, tagsRes,
  unpushedTagsRes, worktreesRes, mergeStatusRes] = await Promise.all([
  window.api.git.status(repo.path),
  // ...
  window.api.git.getMergeStatus(repo.path)
])

return {
  ...r,
  status: statusRes.success ? statusRes.data : null,
  mergeStatus: mergeStatusRes.success && mergeStatusRes.data
    ? mergeStatusRes.data
    : { isMerge: false, isRebase: false, isCherryPick: false, inProgress: false },
  isLoading: false
}
```

Replace the separately fetched `status` + `mergeStatus` conflict inference with the single `OperationSnapshot` for operation UI. Keep repository-scoped immutable updates and `refreshRepo` as the consolidation point. Watcher refreshes should update the snapshot so external resolutions are visible.

---

### `ConflictWorkbench.tsx`, `ConflictFileList.tsx`, `ConflictHunkView.tsx`, and `ResolutionEditor.tsx` (components)

**Migration source:** `src/renderer/src/components/sidebar/ConflictResolver.tsx`.

Preserve the current useful layout vocabulary—operation header, file queue, hunk navigation, side choices, result, loading/error states—and its stable test IDs where semantics remain the same. Move state and mutations out of leaf components.

**Async load/error pattern** (`ConflictResolver.tsx:58-75`):

```typescript
setIsLoadingDiff(true)
setErrorMsg("")
try {
  const res = await window.api.git.getConflictFileDiff(activeRepo.path, filePath)
  if (res.success && res.data) {
    setHunks(res.data.hunks)
    setRawContent(res.data.raw)
    setActiveHunk(0)
  }
} catch (e: any) {
  setErrorMsg(e.message || "Failed to load conflict diff")
} finally {
  setIsLoadingDiff(false)
}
```

Use the same visible loading/error discipline, but dispatch the returned document into the session reducer. Do **not** copy line 67, which defaults all resolutions to Ours.

**File queue extraction source** (`ConflictResolver.tsx:329-368`): retain selected/resolved indicators, full-path tooltip, and stable `data-testid`, but render semantic buttons/listbox options rather than clickable `div`s.

**Choice controls source** (`ConflictResolver.tsx:481-505`): retain explicit buttons and visible selected state, but use operation-aware labels:

- merge: Current branch / Incoming branch
- rebase: Onto branch / Replayed commit
- cherry-pick: Current branch / Picked commit

Add separate `Both: current first`, `Both: incoming first`, `Manual`, and `Reset` actions.

**Result migration source** (`ConflictResolver.tsx:544-576`): replace the read-only `<pre data-testid="conflict-result-preview">` with a controlled editor/textarea backed by the whole-file result buffer. Keep a preview/test-id compatibility hook if existing E2E tests still need it.

**Base-pane gap:** the current model already carries `base` (`ConflictResolver.tsx:10-15`) but the rendered panes at lines 525-578 omit it. `ConflictHunkView` should render Base alongside operation-aware stage 2/stage 3 sources and Result.

**Dialog semantics analog** (`AppDialog.tsx:142-155`):

```tsx
<div className="app-dialog-overlay" onClick={handleOverlayClick}>
  <div
    className="app-dialog-content"
    onClick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label={title}
  >
```

Use `role="dialog"`, an accessible name, focus restoration, focus trapping, and focus-visible styles. Escape should minimize the workbench, not mutate/abort Git state. The existing AppDialog supplies Escape semantics (`AppDialog.tsx:97-108`) but does not implement a full focus trap, so that part is new work.

**Keyboard analog** (`DiffModal.tsx:978-1041`): use one registered `keydown` listener with cleanup and explicit modifier checks. Map next/previous file, next/previous hunk, side choices, apply, and minimize; do not trigger while the Result editor is accepting text unless a deliberate modifier is used.

---

### `conflict-workbench.css` (style config; presentation)

**Analog:** `src/renderer/src/assets/main.css:933-961`.

```css
.diff-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 17, 21, 0.85);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  -webkit-app-region: no-drag;
}

.diff-modal-content {
  width: 90vw;
  height: 85vh;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

Reuse theme variables and modal dimensions, but move the extensive inline styles out of `ConflictResolver.tsx`. Add responsive collapse/stacking, minimum pane sizes, high-contrast selected states, and `:focus-visible`. Avoid relying on color alone for Current/Incoming/resolved state.

---

### `App.tsx`, `Toolbar.tsx`, and `GraphView.tsx` (operation UI integration)

These files are not separate operation controllers after this phase. They should consume selectors/actions from the centralized session and render entry points only.

**Current duplicated orchestration to replace** (`App.tsx:73-90`):

```typescript
if (conflictState.isCherryPick) await window.api.git.continueCherryPick(activeRepo.path)
else if (conflictState.isRebase) await window.api.git.continueRebase(activeRepo.path)
else await window.api.git.commit(activeRepo.path, "Merge commit")
setConflictState({ active: false, isRebase: false, isCherryPick: false, conflictedFiles: [] })
await refreshRepo(activeRepo.id)
```

Do not clear the session after one continue/skip. Dispatch a single action, receive the next snapshot, and branch on `conflicted`, `ready-to-continue`, or `completed`. A consecutive rebase stop keeps the workbench mounted with a new generation.

**Current auto-detection gap** (`App.tsx:93-110`): the effect depends on `conflictedPaths?.length` and repository id. Replace it with the snapshot generation so the same number of conflicts on the next rebase commit still refreshes.

Preserve existing banner and toolbar test IDs where the action is equivalent (`open-conflict-resolver-btn`, `continue-operation-btn`, `skip-commit-btn`, `toolbar-resolve-conflicts-btn`) to minimize E2E churn.

---

### `DiffModal.tsx` and `patchBuilder.ts` (partial staging UI and transforms)

**Existing intent-to-action pattern** (`DiffModal.tsx:761-797`):

```typescript
const handleStageHunk = async (hunk: DiffHunk) => {
  const patch = buildHunkPatch(currentFilePath, hunk, 'stage')
  await handleApplyPatch(patch, { cached: true }, 'Chunk staged successfully')
}
```

Keep one user intent producing one response, one refresh, and one toast. Replace renderer-generated mutation authority with Git-provided hunk identifiers/generation and the main-process transaction method.

**Batch anti-pattern to remove** (`DiffModal.tsx:843-863`): selected lines currently loop over hunks and invoke/refresh per hunk. Build one transaction request and invoke once. The same applies to staged discard, which currently performs an unstage mutation and a worktree mutation separately (`DiffModal.tsx:809-827`).

**Patch representation worth preserving for display/tests** (`patchBuilder.ts:19-27`, `265-282`):

```typescript
export interface DiffHunk {
  hunkIndex: number
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}
```

`patchBuilder.ts` may continue to provide renderer display models and pure selection transforms, but it should no longer be the source of applicability truth. The quadratic matrix at `patchBuilder.ts:76-88` needs a large-file cap/fallback.

**Main-process patch anti-pattern to remove** (`src/main/git.ts:999-1039`): do not copy unconditional `--unidiff-zero` or the retry ladder using ignored whitespace and `-C0/-C1`. The replacement flow is exact patch → `git apply --check` → one apply, returning `STALE_DIFF` without mutation on failure.

---

### `src/main/__tests__/conflictService.test.ts` and `git.partialPatch.test.ts` (real-repository integration tests)

**Primary analog:** `src/main/__tests__/git.patch.test.ts`.

**Fixture pattern** (`git.patch.test.ts:23-42`):

```typescript
describe('Git Patch Discard Tests', () => {
  let tmpDir: string
  const baseTestDir = path.join(process.cwd(), '.tmp-test-git-patch')

  beforeEach(async () => {
    fs.mkdirSync(baseTestDir, { recursive: true })
    tmpDir = fs.mkdtempSync(path.join(baseTestDir, 'test-'))
    const git = simpleGit(tmpDir)
    await git.init()
    await git.addConfig('user.name', 'Test')
    await git.addConfig('user.email', 'test@example.com')
  })

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }))
})
```

Prefer real repositories over global module mocks. Cover index stages and blobs directly, two consecutive rebase conflicts, merge, cherry-pick, add/add, modify/delete, unusual/spaced paths, CRLF, binary, symlink/submodule where platform permits, external edits, stale generation, oversized payload, traversal/symlink escape, abort restoration, atomic multi-hunk failure, and unchanged index after preflight failure.

**Mocking anti-pattern:** `git.rebase-status.test.ts:6-16` globally replaces `simple-git`. Research reproduced leakage into patch tests. Extract pure metadata parsing or inject a command adapter; do not add more `mock.module('simple-git')` suites.

---

### E2E specs: conflict, rebase, partial staging, and reuse

**Primary analog:** `e2e/conflict-resolver.spec.ts` with `e2e/helpers/git-sandbox.ts`.

**Real sandbox lifecycle** (`conflict-resolver.spec.ts:7-34`):

```typescript
test.describe('Interactive Conflict Resolver', () => {
  let sandbox: GitSandbox
  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    // create divergent commits
  })
  test.afterEach(async () => {
    await sandbox.destroy()
  })
})
```

**UI-to-Git assertion pattern** (`conflict-resolver.spec.ts:119-166`): interact through stable `data-testid` controls, then verify both the UI and real Git state (`status.conflicted`, clean files, log/content).

Use `GitSandbox.createCommit/createBranch/checkoutBranch` (`e2e/helpers/git-sandbox.ts:49-69`) rather than mocking Git operations. Extend the helper only for repeated rebase setups and structural conflicts.

Required E2E emphasis:

- A two-commit rebase where both commits stop with the same conflict count; prove the workbench advances generation without disappearing.
- Explicit unresolved initial state and disabled Apply.
- Operation-aware rebase labels and opposite side expectations.
- Base visibility, manual Result edits, both orders, reset, keyboard navigation, focus containment/restoration, and Escape-to-minimize.
- Atomic partial stage/unstage/discard and stale-preflight rollback.
- Reuse candidate offered with provenance, previewed, accepted/rejected/forgotten, and never silently staged.

## Shared Patterns

### Response envelopes and errors

All renderer-facing main calls currently use `{ success, data?, error? }`. Preserve it and add a stable error `code`; components should display user-oriented messages while tests assert codes. Avoid components interpreting raw Git stderr.

### Repository-scoped state

`useRepoStore` and `useUndoStore` both scope data by repository. Conflict sessions must do the same so switching tabs cannot leak choices or operation actions between repositories.

### Authoritative refresh after mutation

The established renderer pattern is mutate → `refreshRepo` → toast/reload (`DiffModal.tsx:769-784`). Preserve the visible feedback, but make the mutation response itself carry the next authoritative snapshot so the UI never briefly assumes completion.

### Safe Git arguments

Existing safe examples use arrays and `--` before paths (`src/main/git.ts:960`, `988-992`). Apply this consistently to new stage/blob/patch commands. Never interpolate user-controlled branch/path data into a shell command.

### Error/loading UI

Use `try/catch/finally`, disable conflicting actions while pending, and surface persistent inline errors plus the existing toaster. Do not optimistically mark files resolved from a local `Set`; derive resolved/staged state from the returned index snapshot.

### Accessibility

Use semantic buttons/listbox options, `role="dialog"`, `aria-modal`, accessible names, visible focus, keyboard navigation, and focus restoration. Existing `AppDialog` provides the semantic starting point; existing ConflictResolver clickable `div`s and `HunkPane` are negative examples.

### Test IDs

Retain existing conflict resolver IDs when semantics are unchanged. Add new IDs for Base, Result editor, unresolved count, operation step/subject, both-order buttons, structural choices, and candidate preview. This keeps Playwright selectors behavior-oriented rather than coupled to CSS.

## Pattern Gaps Requiring New Design

No current file is a safe analog for these responsibilities; the planner should spell them out rather than saying “follow existing pattern”:

1. NUL-delimited unmerged-index parsing and stage 1/2/3 blob loading.
2. Canonical repository allowlisting, sender-frame validation, path/symlink containment, and payload caps.
3. Generation tokens and stale mutation rejection.
4. Exact `git apply --check` followed by one atomic application.
5. Structural/binary/submodule conflict documents.
6. A persistent multi-stop operation state machine.
7. A whole-file editable Result model synchronized with hunk choices.
8. Opt-in rerere candidate preview/provenance/forget behavior.

These should be implemented behind typed contracts and characterized with real repositories before the workbench depends on them.

## No Analog Found

Every proposed file has an existing role-level analog. However, the eight responsibilities listed above have no trustworthy implementation analog in the repository; use the architecture and safety patterns in `06-RESEARCH.md` rather than copying current marker parsing, unchecked IPC, or permissive patch retry behavior.

## Recommended Dependency Direction

```text
React leaf components
        |
        v
conflictSession reducer/selectors <- useRepoStore operation actions
        |                                  |
        +---------- typed preload API -----+
                           |
                           v
                validated IPC handlers
                           |
                           v
                 conflictService.ts
                    |             |
                    v             v
              Git CLI/index   repository FS
```

`App`, `Toolbar`, and `GraphView` consume the store; they must not call continue/skip/abort independently. `ConflictWorkbench` composes leaf components; leaf components emit intent and do not access `window.api`. `git.ts` delegates to `conflictService.ts` during migration rather than duplicating the new logic.

## Planner Notes

- Separate contract/parser characterization from UI work so the UI never has to target marker-derived data temporarily.
- Fix Bun module-mock isolation before using combined unit runs as a gate.
- Treat partial staging and conflict resolution as related safety work but keep their transaction APIs distinct.
- Preserve Bun, Electron, React, Zustand, Playwright, and the narrow contextBridge; no dependency is needed.
- The required implementation walkthrough should document the new service boundary, operation state machine, and mutation safety/undo behavior.

## Metadata

**Analog search scope:** `src/main/`, `src/preload/`, `src/renderer/src/`, and `e2e/`

**Files scanned:** 22 source, test, style, and helper files

**Pattern extraction date:** 2026-09-17
