# Phase 6: Automatic Conflict Resolution & Advanced Merging - Research

**Researched:** 2026-09-17
**Domain:** Git partial staging, merge/rebase/cherry-pick state, three-way conflict resolution, Electron IPC, and resolver UX
**Confidence:** HIGH for the codebase assessment; MEDIUM for documentation-backed recommendations because the configured research provider fell back to web search

## User Constraints

### Stated priorities

> "analyze existing diff and conflict resolver feature. i wanna make it more robust because whan I now rebase there seem to be limited option for picking up chunks etc. also UI seems to be hard to use. make assessment and plan the changes first"

- Assess the existing implementation before changing source code. [VERIFIED: user request]
- Make rebase conflict handling and chunk selection materially more capable and robust. [VERIFIED: user request]
- Improve the ConflictResolver UI because its current interaction model is difficult to use. [VERIFIED: user request]
- Produce the assessment and change plan before implementation. [VERIFIED: user request]

### Research interpretation

- Treat this as brownfield hardening, not a greenfield replacement. The repository already implements merge, rebase, cherry-pick, conflict detection, hunk/line staging, a conflict resolver, unit tests, and Playwright coverage. [VERIFIED: `src/main/git.ts`, `src/renderer/src/components/details/DiffModal.tsx`, `src/renderer/src/components/sidebar/ConflictResolver.tsx`, `e2e/conflict-resolver.spec.ts`]
- Prioritize deterministic safety and transparent Git state over heuristic automation. CONFLICT-03 should not silently choose content; speculative heuristic auto-resolution should be deferred until the deterministic engine, preview, audit trail, and undo path are trustworthy. [RECOMMENDATION]
- Keep editing scoped to staging and conflict resolution rather than growing into a general-purpose IDE. [VERIFIED: `.planning/workstreams/mvp/REQUIREMENTS.md` Out of Scope]

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONFLICT-01 | Implement manual Merge, Rebase, and Cherry-pick operations | Existing commands are present, but operation continuation is duplicated across App/Toolbar/GraphView and does not reliably model successive rebase stops. Replace this with a single operation-session state machine and integration tests. [VERIFIED: `src/main/git.ts:1609-1676`, `src/main/git.ts:1981-2005`, `src/renderer/src/App.tsx:49-123`, `src/renderer/src/components/toolbar/Toolbar.tsx:451-577`, `src/renderer/src/components/graph/GraphView.tsx:1793-1960`] |
| CONFLICT-02 | Interactive conflict resolution UI with a visual 3-way split diff view | The current view shows Ours, Theirs, and Result while parsing Base but never rendering it; it has no manual result editor and defaults every hunk to Ours. Build an operation-aware conflict workbench backed by index stages 1/2/3, with Base/Current/Incoming context and an editable Result. [VERIFIED: `src/renderer/src/components/sidebar/ConflictResolver.tsx:45-73`, `src/renderer/src/components/sidebar/ConflictResolver.tsx:521-587`] |
| CONFLICT-03 | Intelligent auto-resolve heuristical algorithm for merge conflicts | Generate narrow deterministic candidates (one side equals base, identical normalized result, and byte-safe whitespace-only) plus UltraGIT-owned previously confirmed records. Every candidate is non-mutating, previewed, and explicitly accepted into editable Result before a separate Apply & Stage. [DECIDED] |

</phase_requirements>

## Summary

UltraGIT has a meaningful partial implementation rather than a placeholder. The main process can start/abort/continue merge, rebase, and cherry-pick operations; the renderer can stage whole files, computed hunks, and selected changed rows; and the existing merge-conflict Playwright suite passes. The production build also passes. [VERIFIED: local `bun run build` on 2026-09-17; local `bunx playwright test e2e/conflict-resolver.spec.ts` with 2/2 passing]

The robustness problems are architectural. Conflict data is derived by parsing markers from the working-tree file instead of reading Git's unmerged index stages. That fails to provide authoritative base/current/incoming blobs and is weak for delete/modify, add/add, rename, binary, symlink, submodule, and externally edited resolutions. The UI initializes every hunk as resolved to `ours`, despite telling the user every hunk must be chosen, and the parsed `base` content is not displayed. Rebase is especially confusing because Git's `ours`/`theirs` semantics are counterintuitive during rebase: stage 2 is the branch being rebased onto and stage 3 is the replayed work. [VERIFIED: `src/main/git.ts:1691-1734`, `src/renderer/src/components/sidebar/ConflictResolver.tsx:65-73`, `src/renderer/src/components/sidebar/ConflictResolver.tsx:170-172`; CITED: https://git-scm.com/docs/git-checkout]

Partial staging works for covered fixtures, including spaces, CRLF, deletion, and multiple hunks, but it is built from a renderer-side quadratic LCS and always invokes `git apply --unidiff-zero`, then silently retries with increasingly permissive whitespace/context matching. Official Git documentation discourages context-free patches because normal context matching is a safety measure. Multi-hunk selected-line actions are sequential rather than atomic, so a later failure can leave a partially mutated index. The patch integration tests pass alone but fail when run in the same Bun invocation after the mocked rebase-status suite, revealing test-module isolation debt. [VERIFIED: `src/renderer/src/utils/patchBuilder.ts:46-152`, `src/main/git.ts:994-1040`, local Bun test runs on 2026-09-17; CITED: https://git-scm.com/docs/git-apply]

**Primary recommendation:** First establish an authoritative Git-backed conflict/operation model and a safe patch transaction API; then rebuild the resolver as an explicit, operation-aware workbench; only after that add opt-in resolution reuse or narrowly deterministic auto-resolve candidates. [RECOMMENDATION]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read conflict stages and operation state | Electron main / Git service | Preload IPC | Git index and repository internals are privileged filesystem/process data and should be normalized before crossing IPC. [VERIFIED: current Electron process architecture in `.planning/codebase/ARCHITECTURE.md`] |
| Validate repository/path scope and mutation preconditions | Electron main / IPC boundary | Git service | Renderer input is untrusted at the privileged boundary; mutations need repo containment, current-state tokens, and dry-run checks. [CITED: https://www.electronjs.org/docs/latest/tutorial/security] |
| Build/apply partial-stage transactions | Electron main / Git service | Renderer selection model | Git should be the source of diff/hunk coordinates and applicability; the renderer should send intent, not arbitrary filesystem paths or unchecked mutation sequences. [RECOMMENDATION] |
| Conflict operation session | Renderer store/controller | Main operation snapshot | One session model should drive App, banner, toolbar, and workbench instead of four competing local flows. [VERIFIED: duplicated flows in `App.tsx`, `Toolbar.tsx`, and `GraphView.tsx`] |
| Three-way visualization and result editing | React renderer | Main-provided conflict document | Presentation, keyboard interaction, synchronized panes, and explicit choices belong in React; authoritative stage content belongs in main. [RECOMMENDATION] |
| Resolution reuse / candidate ranking | Electron main / Git service | Renderer confirmation UI | Resolution provenance and Git state belong near Git; applying a candidate remains an explicit user decision. [RECOMMENDATION] |

## Existing Implementation Assessment

### What is worth preserving

| Area | Existing strength | Assessment |
|------|-------------------|------------|
| Process boundary | Purpose-specific preload methods already expose Git operations rather than raw `ipcRenderer`. [VERIFIED: `src/preload/index.ts`] | Preserve the narrow bridge pattern, but add runtime validation and typed shared contracts. |
| Operation commands | Merge/rebase/cherry-pick start, abort, continue, and rebase skip already exist. [VERIFIED: `src/main/git.ts:1609-1676`, `src/main/git.ts:1981-2005`] | Refactor behind one operation command/result model rather than replacing Git command execution. |
| Operation metadata | `getMergeStatus` already detects merge, rebase-merge, rebase-apply, cherry-pick, progress, subject, and branch. [VERIFIED: `src/main/git.ts:1750-1836`] | Extend into a stable `OperationSnapshot`; do not let components infer operation type independently. |
| Partial staging UX | DiffModal supports file, hunk, and selected-row actions plus keyboard shortcuts and navigation. [VERIFIED: `src/renderer/src/components/details/DiffModal.tsx:648-914`, `src/renderer/src/components/details/DiffModal.tsx:978-1059`] | Keep the user-facing capability, replace unsafe patch construction/application details. |
| Test fixtures | Real temporary repositories exercise many patch edge cases; Playwright exercises a real Electron merge conflict. [VERIFIED: `src/main/__tests__/git.patch.test.ts`, `e2e/conflict-resolver.spec.ts`] | Expand these fixtures to rebase, repeated conflicts, file-level conflict types, and failure recovery. |

### Critical findings

| Severity | Finding | User impact | Required response |
|----------|---------|-------------|-------------------|
| Critical | Every loaded conflict hunk is initialized with `{ resolution: 'ours' }`, so `allHunksResolved` is immediately true and Apply & Stage can be used without an explicit choice. [VERIFIED: `ConflictResolver.tsx:65-73`, `ConflictResolver.tsx:170-172`] | Accidental data loss, especially when rebase labels are misunderstood. | Initialize hunks as unresolved; require explicit choice or manual edit; summarize unresolved count before staging. |
| Critical | `resolveConflict` joins renderer-provided `repoPath` and `filePath`, writes content, and stages it without verifying the path remains within the selected repository. IPC handlers also do not validate the sender. [VERIFIED: `src/main/git.ts:1736-1748`, `src/main/index.ts:714-729`; CITED: https://www.electronjs.org/docs/latest/tutorial/security] | A compromised renderer could attempt privileged writes/commands outside the intended repository. | Centralize sender validation, repository allowlisting, path containment, operation-state checks, and payload limits. |
| High | Resolver truth comes from conflict markers in the working tree, not index stages 1/2/3. Base is available only if markers happen to be diff3-style. [VERIFIED: `src/main/git.ts:1691-1734`] | Incorrect/missing three-way data; poor handling of non-text and structural conflicts. | Read `git ls-files --unmerged -z` and stage blobs; treat working-tree result as a separate editable document. |
| High | Rebase continuation closes local conflict state after one `--continue`; a subsequent conflict with the same conflicted-file count may not reopen because the detection effect depends on conflict-count length and repo id, not operation generation/state. [VERIFIED: `src/renderer/src/App.tsx:73-110`] | Multi-commit rebases appear to lose the resolver between stops. | Loop by refreshing a single operation snapshot after every continue/skip; remain in the workbench while operation is in progress. |
| High | `continueRebase` does not set a noninteractive editor while cherry-pick continuation explicitly uses `-c core.editor=true`. [VERIFIED: `src/main/git.ts:1663-1667`, `src/main/git.ts:2002-2005`] | Rebase continuation can fail or wait for editor behavior in a desktop app. | Use controlled noninteractive environment/config and return structured terminal/next-conflict outcomes. |
| High | Partial patch application always adds `--unidiff-zero` and retries with whitespace ignoring plus `-C1` then `-C0`. [VERIFIED: `src/main/git.ts:999-1035`] | A stale/ambiguous patch can match unintended repeated text or normalize whitespace unexpectedly. | Dry-run exact patch first; preserve context; return a stale-diff error; never silently weaken matching for staging/discard. |
| High | Selected-line actions apply one hunk at a time and refresh after each successful mutation. [VERIFIED: `DiffModal.tsx:843-914`] | Later failure leaves an incomplete selection applied; positions can become stale. | Build one multi-file/multi-hunk patch, `git apply --check`, then apply once; return one transaction result. |
| Medium | `getConflictedFiles` parses line-oriented porcelain v1 with `substring(3).trim()`. [VERIFIED: `src/main/git.ts:1678-1689`] | Quoted/unusual filenames and rename-style records are fragile. | Use a NUL-delimited machine format and stage-aware conflict records. |
| Medium | The advertised 3-pane view is Ours / Theirs / Result; parsed Base is hidden and Result is read-only. [VERIFIED: `ConflictResolver.tsx:521-587`] | Users cannot understand the common ancestor or manually compose a correct result. | Render Base and operation-aware sides with an editable Result and synchronized navigation. |
| Medium | Clickable file rows and hunk panes are `div` elements without keyboard semantics; the modal lacks dialog/focus management. [VERIFIED: `ConflictResolver.tsx:315-367`, `ConflictResolver.tsx:619-662`, `App.tsx:423-463`] | Keyboard and assistive-technology usage is difficult. | Use buttons/listbox semantics, focus trap/restoration, labels, shortcuts, and visible focus states. |
| Medium | Conflict orchestration and continue/skip/abort behavior are duplicated in App, Toolbar, and GraphView. [VERIFIED: cited files above] | Results, errors, and rebase transitions can diverge by entry point. | Move orchestration into one controller/store action set. |
| Medium | The renderer LCS allocates an `(m+1)*(n+1)` matrix for file and character diffs. [VERIFIED: `patchBuilder.ts:73-89`, `DiffModal.tsx:66-99`] | Large changed files can stall or exhaust renderer memory. | Consume Git hunks for actions and cap/fallback inline highlighting for large inputs. |

## Standard Stack

### Core

| Library/tool | Version | Purpose | Why standard here |
|--------------|---------|---------|-------------------|
| Git CLI | 2.55.0 locally | Authoritative index stages, diffs, apply checks, merge/rebase/cherry-pick state | Existing runtime dependency and the only authoritative source for repository/index semantics. [VERIFIED: local `git --version`; `src/main/git.ts`] |
| Electron | `^44.0.0` | Privileged Git/filesystem main process and renderer boundary | Existing project stack; no deviation is required. [VERIFIED: `package.json`] |
| React / React DOM | `^19.2.8` | Conflict workbench UI | Existing renderer stack. [VERIFIED: `package.json`] |
| Zustand | `^5.0.15` | Repository and operation-session state | Existing state layer; suitable for consolidating duplicated operation state. [VERIFIED: `package.json`, `src/renderer/src/store/useRepoStore.ts`] |
| simple-git | `^3.36.0` | Existing Git command wrapper | Preserve for ordinary commands; use raw/`execFile` paths where NUL/binary-safe output is required. [VERIFIED: `package.json`, `src/main/git.ts`] |

### Supporting

| Library/tool | Version | Purpose | When to use |
|--------------|---------|---------|-------------|
| Bun test | Bun 1.3.11 locally | Pure reducers, parsers, service integration tests | Per task and per wave. [VERIFIED: local `bun --version`, existing tests] |
| Playwright | 1.58.2 locally / `^1.58.2` manifest | Electron E2E for conflict workflows | Real repository flows, focus/keyboard behavior, repeated rebase stops. [VERIFIED: local `bunx playwright --version`, `package.json`] |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| Git index-stage APIs | Continue parsing marker text | Marker parsing is simpler but cannot faithfully represent all conflict types or authoritative base/side blobs. [VERIFIED: current implementation limits] |
| Existing stack only | Add a diff-editor/merge-editor package | A package might accelerate UI work but adds bundle, security, styling, accessibility, and license surface. No package should be introduced until the data contract and UX interaction are specified. [RECOMMENDATION] |
| Explicit resolution candidates | Silent heuristic auto-apply | Silent application is faster but violates the project's transparency/safety constraint and lacks a trustworthy undo/audit boundary. [VERIFIED: `AGENTS.md`] |

**Installation:** none. This phase can be implemented with the existing stack. [RECOMMENDATION]

## Package Legitimacy Audit

No external package is recommended, so the package legitimacy gate is not applicable. [RECOMMENDATION]

## Architecture Patterns

### System architecture diagram

```text
User selects merge / rebase / cherry-pick
                  |
                  v
Renderer operation controller ---------> narrow typed IPC
                  |                            |
                  |                            v
                  |                   Main Git operation service
                  |                    /        |         \
                  |             snapshot   conflicts   mutations
                  |                 |           |           |
                  |                 |     ls-files -u -z     |
                  |                 |     stage 1/2/3 blobs  |
                  |                 |           |       preflight/check
                  |                 +-----------+-----------+
                  |                             |
                  v                             v
Conflict workbench <---------------- structured OperationSnapshot
  file queue -> hunk queue -> Base / Current / Incoming -> editable Result
                  |
                  v
        resolve/stage one file atomically
                  |
                  v
         refresh authoritative snapshot
          / conflicts remain | clean step \
         v                   v              v
   stay in workbench    continue/skip   abort/complete
                              |
                              v
                    next rebase stop or terminal result
```

### Recommended project structure

```text
src/
├── main/
│   ├── git.ts                         # command delegation; progressively slim conflict code
│   ├── conflictService.ts             # operation snapshot, index stages, safe resolution/apply
│   └── __tests__/
│       ├── conflictService.test.ts     # real-repo conflict matrix
│       └── git.partialPatch.test.ts    # atomic patch/stale-state tests
├── preload/
│   ├── index.ts                       # narrow conflict session methods
│   └── index.d.ts                     # shared response contracts
└── renderer/src/
    ├── components/conflicts/
    │   ├── ConflictWorkbench.tsx       # accessible shell and operation actions
    │   ├── ConflictFileList.tsx
    │   ├── ConflictHunkView.tsx
    │   ├── ResolutionEditor.tsx
    │   └── conflict-workbench.css
    └── store/
        ├── conflictSession.ts          # pure reducer/types
        └── useRepoStore.ts             # owns one authoritative session
```

### Pattern 1: authoritative operation snapshot

Return one snapshot after every start, resolve, continue, skip, abort, refresh, and external filesystem change. [RECOMMENDATION]

```typescript
type OperationKind = 'merge' | 'rebase' | 'cherry-pick'
type OperationPhase = 'conflicted' | 'ready-to-continue' | 'completed' | 'aborted'

interface OperationSnapshot {
  repoId: string
  generation: string
  kind: OperationKind
  phase: OperationPhase
  currentStep?: number
  totalSteps?: number
  subject?: string
  conflicts: ConflictFileSummary[]
}
```

`generation` should be derived from stable repository operation metadata and index state, then required on mutations to reject stale UI actions. [RECOMMENDATION]

### Pattern 2: index-stage conflict document

Use NUL-delimited unmerged index records and load stage blobs separately: stage 1 is the common ancestor, stage 2 is `ours`, and stage 3 is `theirs`. During rebase, presentation labels must describe roles rather than merely displaying “ours/theirs.” [CITED: https://git-scm.com/docs/git-ls-files; CITED: https://git-scm.com/docs/git-checkout]

```typescript
interface ConflictDocument {
  path: string
  conflictType: 'both-modified' | 'both-added' | 'deleted-by-us' | 'deleted-by-them' | 'other'
  base?: BlobView
  stage2?: BlobView
  stage3?: BlobView
  workingResult?: BlobView
  isBinary: boolean
  eol: 'lf' | 'crlf' | 'mixed' | 'none'
}
```

### Pattern 3: preflighted atomic partial patch

Generate action hunks from Git output with normal context, combine the user's selection into one patch, run the exact equivalent of `git apply --check` against the intended target, then apply once. A failed preflight returns `STALE_DIFF` and reloads; it must not retry with weaker matching. [CITED: https://git-scm.com/docs/git-apply]

### Pattern 4: explicit unresolved state

Every hunk begins `unresolved`. Choices are `current`, `incoming`, `both-current-first`, `both-incoming-first`, or `manual`. File resolution is enabled only when all text hunks have explicit outcomes and the result has no conflict markers, or when a file-level structural choice has been made. [RECOMMENDATION]

### Pattern 5: operation-aware language

- Merge: Current branch / Incoming branch. [RECOMMENDATION]
- Cherry-pick: Current branch / Picked commit. [RECOMMENDATION]
- Rebase: Onto branch / Replayed commit. [RECOMMENDATION; CITED: https://git-scm.com/docs/git-checkout]
- Keep raw stage numbers available in a details tooltip for advanced users. [RECOMMENDATION]

### Anti-patterns to avoid

- Do not infer operation truth from a local `Set` of resolved filenames; query the index after each mutation. [RECOMMENDATION]
- Do not treat “no markers found” as proof that a conflict is safely resolved; deleted, binary, and externally edited conflicts need type-specific handling. [RECOMMENDATION]
- Do not close the session after `rebase --continue`; refresh and branch on the returned snapshot because another commit may stop immediately. [RECOMMENDATION]
- Do not silently weaken patch matching or whitespace rules after an application failure. [CITED: https://git-scm.com/docs/git-apply]
- Do not expose an arbitrary `resolvedContent` write primitive without repo/path/state validation. [CITED: https://www.electronjs.org/docs/latest/tutorial/security]

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Three-way source discovery | Marker-only parser | Git index stages via `git ls-files --unmerged -z` and stage blobs | Handles authoritative base/sides and structural conflicts. [CITED: https://git-scm.com/docs/git-ls-files] |
| Diff/hunk coordinates for mutation | Whole-file renderer LCS as mutation authority | Git-produced unified diffs with context | Git owns EOL, quoting, modes, renames, and index/worktree semantics. [CITED: https://git-scm.com/docs/git-diff] |
| Patch applicability | Retry ladder with ignored whitespace and zero context | `git apply --check` then exact apply | Preflight detects stale patches without mutation; context is a safety mechanism. [CITED: https://git-scm.com/docs/git-apply] |
| Repeated conflict memory | Enabling Git rerere during real operations | Repository-local UltraGIT resolution-record store | Candidate discovery and preview must leave the worktree/index unchanged; UltraGIT owns identity, provenance, expiry, and explicit application. [DECIDED] |
| Renderer access to Git/filesystem | Raw IPC or generic command channel | Narrow contextBridge methods plus sender/input validation | Limits privileged capability exposure. [CITED: https://www.electronjs.org/docs/latest/tutorial/security; CITED: https://www.electronjs.org/docs/latest/tutorial/ipc] |

**Key insight:** Git already maintains the hard state—index stages, operation metadata, patch applicability, and optional recorded resolutions. UltraGIT should be a safe porcelain over those primitives, not a second merge engine. [RECOMMENDATION]

## Common Pitfalls

### Pitfall 1: wrong side during rebase

**What goes wrong:** A user chooses “ours” expecting their feature commit, but during rebase Git uses “ours” for the branch being rebased onto. [CITED: https://git-scm.com/docs/git-checkout]

**How to avoid:** Show role labels and commit/branch identities; test both merge and rebase with opposite expected choices. [RECOMMENDATION]

### Pitfall 2: successful continue is not successful rebase

**What goes wrong:** One resolved commit advances into another conflict, but the UI reports completion or closes. [VERIFIED: current App clears state immediately in `App.tsx:73-90`]

**How to avoid:** Return `completed`, `next-conflict`, or `failed`; keep the workbench mounted across generations. [RECOMMENDATION]

### Pitfall 3: structural conflict treated as empty text

**What goes wrong:** A missing working-tree file returns `{ raw: '', hunks: [] }`, and the current UI offers Mark Resolved & Stage. [VERIFIED: `src/main/git.ts:1691-1697`, `ConflictResolver.tsx:385-411`]

**How to avoid:** Model delete/modify, add/add, rename, binary, symlink, and submodule conflicts explicitly with keep/delete/rename choices. [RECOMMENDATION]

### Pitfall 4: partial mutation on batch selection

**What goes wrong:** Earlier selected hunks apply and later hunks fail. [VERIFIED: sequential loops in `DiffModal.tsx:843-914`]

**How to avoid:** One preflighted patch transaction; on error, no index change. [RECOMMENDATION]

### Pitfall 5: test mocks leak across files

**What goes wrong:** Running rebase-status, patch, and patchBuilder tests together caused all 21 real patch tests to fail because `mock.module('simple-git')` from the rebase suite replaced `simple-git`; the patch suite passed 21/21 alone. [VERIFIED: local Bun test runs on 2026-09-17]

**How to avoid:** Extract pure parsers and inject a Git command adapter instead of globally mocking the module; ensure the phase gate runs combined tests. [RECOMMENDATION]

## Conflict Workbench UX Contract

The UI should be a persistent workbench rather than a modal that resets local choices on reload. [RECOMMENDATION]

1. A top operation strip shows operation kind, source/target roles, rebase step/total, current commit subject, and Abort/Skip/Continue. [RECOMMENDATION]
2. A left file queue groups unresolved, edited, and staged files, includes full paths/tooltips, conflict type, and progress, and remains keyboard navigable. [RECOMMENDATION]
3. The main area shows synchronized Base / Current / Incoming sources with line numbers and compact inline highlights; labels are operation-aware. [RECOMMENDATION]
4. A Result pane is editable for the active hunk/file and exposes explicit Current, Incoming, Both orders, Reset, and Apply actions. [RECOMMENDATION]
5. Hunks start unresolved. The UI never equates opening a file with choosing content. [RECOMMENDATION]
6. Apply & Stage shows a concise diff summary and writes atomically; Continue is enabled from the authoritative snapshot only after no unmerged entries remain. [RECOMMENDATION]
7. Keyboard support includes file/hunk next/previous, explicit side choices, focus-visible controls, Escape to minimize rather than abort, and focus restoration. [RECOMMENDATION]
8. Large/binary/structural conflicts switch to a specialized file-level choice view rather than forcing a text editor. [RECOMMENDATION]

## CONFLICT-03 Safety Boundary

### Include in this phase

- Repository-local, off-by-default UltraGIT resolution records from previously human-confirmed results; show provenance and a before/after preview without enabling Git rerere during real operations. [DECIDED]
- Narrow deterministic candidates: one side equals base, identical normalized result, and whitespace-only only when byte/content safety checks establish that normalization does not alter non-whitespace content, EOL policy, or no-final-newline state. [DECIDED]
- Deterministic recognition that a worktree result contains no markers is not sufficient on its own; the index must also become stage 0 after an explicit stage action. [CITED: https://git-scm.com/docs/git-ls-files]
- Telemetry local to the session (candidate offered, accepted, edited, rejected) can support later quality evaluation without uploading repository content. [RECOMMENDATION]

### Defer unless separately approved

- Any whitespace candidate that fails byte/content, EOL, or no-final-newline safety checks. [DECIDED]
- Language-aware/AST merging across arbitrary languages. [RECOMMENDATION]
- Similarity-based or AI-generated resolution that is automatically written or staged. [RECOMMENDATION]
- Any “confidence” score without a measured corpus and false-positive acceptance threshold. [RECOMMENDATION]

CONFLICT-03 is addressed by the three deterministic candidate generators plus confirmed-resolution records; all remain preview-only until explicit acceptance and a separate Apply & Stage. [DECIDED]

## Recommended Planning Sequence

### Wave 0 — characterization and test isolation

- Add real-repository characterization tests for two-stop rebase, cherry-pick conflict, merge conflict, delete/modify, add/add, binary, unusual filenames, manual external edit, and abort restoration. [RECOMMENDATION]
- Fix test isolation so combined unit execution is trustworthy. [RECOMMENDATION]

### Wave 1 — shared contracts and stable conflict regions

- Define `OperationSnapshot`, `ConflictDocument`, `ConflictRegion`, error, and undo contracts. [DECIDED]
- Derive stable regions in main from controlled Git base-to-side edit scripts, with explicit overlap/touch/insertion/order/EOL rules. [DECIDED]

### Wave 2 — authoritative operations and guarded mutation

- Implement operation snapshots, stage-aware documents, complete-file resolution, validation, serialization, rollback, Git postconditions, and Undo Resolution. [DECIDED]
- Make continue/skip/abort return the next snapshot with controlled noninteractive behavior. [RECOMMENDATION]

### Waves 3-5 — safe session, workbench, and integration

- Introduce one store/controller session used by App, Toolbar, GraphView, and workbench. [RECOMMENDATION]
- Implement explicit unresolved hunks, Base/Current/Incoming sources, editable Result, structural conflict views, responsive layout, and accessibility. [RECOMMENDATION]
- Prove merge, cherry-pick, repeated rebase, external-change, accessibility, and Undo Resolution through real Electron tests. [DECIDED]

### Waves 6-7 — ordinary partial staging hardening

- Separate display diff from mutation diff; use canonical stable selections, exact atomic batches, stale rejection, one refresh, and visible Undo/Redo. [DECIDED]

### Waves 8-9 — deterministic candidates and rollout

- Add non-mutating deterministic candidates plus repository-local UltraGIT confirmed-resolution records, mandatory preview, explicit acceptance into Result, and separate Apply & Stage. [DECIDED]
- Run the full unit/E2E suite, document the primary-logic changes in the required walkthrough, and manually verify macOS plus at least one Windows/Linux path/line-ending case in CI. [VERIFIED: `AGENTS.md` documentation/testing requirements; RECOMMENDATION]

## Validation Architecture

### Test framework

| Property | Value |
|----------|-------|
| Unit/integration framework | Bun test 1.3.11 locally. [VERIFIED: local command] |
| E2E framework | Playwright 1.58.2 locally. [VERIFIED: local command] |
| Config | `playwright.config.ts`. [VERIFIED: codebase] |
| Quick run | `bun test src/main/__tests__/conflictService.test.ts src/renderer/src/store/__tests__/conflictSession.test.ts` [RECOMMENDATION] |
| Focused E2E | `bunx playwright test e2e/conflict-resolver.spec.ts e2e/rebase-conflict-resolver.spec.ts` [RECOMMENDATION] |
| Full suite | `bun test src && bun run test:e2e` [VERIFIED: `.planning/codebase/TESTING.md`] |

### Phase requirements to test map

| Req ID | Behavior | Test type | Automated command | File exists? |
|--------|----------|-----------|-------------------|-------------|
| CONFLICT-01 | Merge, cherry-pick, and multi-stop rebase start/continue/skip/abort with correct next snapshot | Main integration + Electron E2E | `bun test src/main/__tests__/conflictService.test.ts && bunx playwright test e2e/rebase-conflict-resolver.spec.ts e2e/cherry-pick.spec.ts` | Partial; Wave 0 adds conflict service and rebase resolver specs. |
| CONFLICT-02 | Explicit per-hunk resolution, editable result, base visibility, structural conflicts, keyboard/focus behavior | Pure reducer + Electron E2E | `bun test src/renderer/src/store/__tests__/conflictSession.test.ts && bunx playwright test e2e/conflict-resolver.spec.ts` | Partial; existing E2E covers one text merge and abort only. |
| CONFLICT-03 | Deterministic/recorded candidate preview, explicit acceptance, rejection/forget, never silent stage | Main integration + Electron E2E | `bun test src/main/__tests__/conflictCandidates.test.ts && bunx playwright test e2e/conflict-resolution-reuse.spec.ts` | No; Waves 8-9. |
| Supporting hardening | Atomic partial stage/unstage/discard, stale diff rejection, exact whitespace/EOL behavior | Main integration + Electron E2E | `bun test src/main/__tests__/git.partialPatch.test.ts && bunx playwright test e2e/partial-staging.spec.ts` | Partial; existing patch tests cover single-hunk cases but no UI E2E was found. [VERIFIED: test inventory] |

### Sampling rate

- **Per task commit:** focused Bun tests for the touched service/reducer. [RECOMMENDATION]
- **Per wave merge:** focused conflict/rebase/partial-stage Playwright tests plus `bun run build`. [RECOMMENDATION]
- **Phase gate:** `bun test src && bun run test:e2e`, with combined-test isolation fixed first. [RECOMMENDATION]

### Wave 0 gaps

- [ ] `src/main/__tests__/conflictService.test.ts` — stage parsing and operation transition matrix. [RECOMMENDATION]
- [ ] `e2e/rebase-conflict-resolver.spec.ts` — at least two commits that stop consecutively. [RECOMMENDATION]
- [ ] Isolate `git.rebase-status.test.ts` mocks; current combined invocation contaminates `git.patch.test.ts`. [VERIFIED: local test run]

## Security Domain

### Applicable ASVS-style categories

| Category | Applies | Standard control |
|----------|---------|------------------|
| Authentication | No | Local desktop repository operations do not introduce identity authentication in this phase. [VERIFIED: phase scope] |
| Session management | No | The “operation session” is local application state, not an authenticated web session. [VERIFIED: phase scope] |
| Access control | Yes | Restrict IPC mutations to repositories explicitly opened by the trusted app window. [RECOMMENDATION; CITED: https://www.electronjs.org/docs/latest/tutorial/security] |
| Input validation | Yes | Validate sender, repo id/path, contained relative path, enum values, generation token, content size, and operation preconditions. [RECOMMENDATION; CITED: https://www.electronjs.org/docs/latest/tutorial/security] |
| Cryptography | No | No new cryptographic function is required. [VERIFIED: phase scope] |
| File/resource handling | Yes | Prevent traversal/symlink escapes and arbitrary writes; use argument arrays and `--` path separators for Git pathspecs. [RECOMMENDATION] |

### Known threat patterns

| Pattern | STRIDE | Standard mitigation |
|---------|--------|---------------------|
| Renderer requests write outside repository via `../` or absolute path | Tampering | Resolve real repository root and candidate target; require containment and an unmerged entry for that exact path. [RECOMMENDATION] |
| Untrusted frame invokes privileged Git IPC | Elevation of privilege | Validate `event.senderFrame` for every privileged handler; retain narrow preload methods. [CITED: https://www.electronjs.org/docs/latest/tutorial/security] |
| Stale UI overwrites a newly edited file | Tampering | Generation/content hash precondition and stale-conflict response. [RECOMMENDATION] |
| Oversized conflict content exhausts renderer/main memory | Denial of service | Payload caps, file-size thresholds, binary/large-file fallback, incremental rendering. [RECOMMENDATION] |
| Branch/path interpreted as command option | Tampering | Use argument arrays and explicit `--` before pathspecs; validate operation enums. [RECOMMENDATION] |

## Project Constraints (from GEMINI.md and AGENTS.md)

- `GEMINI.md` delegates to `AGENTS.md`. [VERIFIED: `GEMINI.md`]
- Preserve Bun, Electron, and React unless a stack deviation is explicitly reviewed. [VERIFIED: `AGENTS.md`]
- Keep Git operations transparent and safe, with visual diffs and undo/redo considerations. [VERIFIED: `AGENTS.md`]
- Cover new features with unit tests and Playwright E2E tests. [VERIFIED: `AGENTS.md`]
- Document changes to project structure and primary logic in the required Antigravity walkthrough location during implementation. [VERIFIED: `AGENTS.md`]
- GSD is initialized because `.agents/` is present. [VERIFIED: codebase]

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Git CLI | All conflict and patch operations | Yes | 2.55.0 | None required. [VERIFIED: local command] |
| Bun | Unit tests/build scripts | Yes | 1.3.11 | None required. [VERIFIED: local command] |
| Node.js | Electron/Vite tooling | Yes | 26.8.1 | Bun scripts still rely on installed Node-compatible tooling. [VERIFIED: local command] |
| Playwright | Electron E2E | Yes | 1.58.2 | None required. [VERIFIED: local command] |

**Missing dependencies with no fallback:** none. [VERIFIED: local probes]

The GSD research cache could not be written because the sandbox denied creation of `~/.gsd/research-cache`; this does not block the on-disk research artifact. [VERIFIED: local command error]

## State of the Art

| Existing approach | Recommended approach | Impact |
|-------------------|----------------------|--------|
| Parse working-tree conflict markers | Read unmerged index stages and treat worktree result separately | Accurate base/sides and structural conflict support. [CITED: https://git-scm.com/docs/git-ls-files] |
| Generic Ours/Theirs labels | Operation-role labels with raw stage detail | Prevents rebase side inversion errors. [CITED: https://git-scm.com/docs/git-checkout] |
| Renderer LCS as mutation authority | Git-produced hunks plus exact preflight/apply | Safer partial staging and better scalability. [CITED: https://git-scm.com/docs/git-apply] |
| Local modal state cleared after continue | Persistent operation snapshot state machine | Supports consecutive rebase stops and external changes. [RECOMMENDATION] |
| Silent default to Ours | Explicit unresolved choices and editable result | Prevents accidental content loss. [RECOMMENDATION] |
| Custom speculative auto-resolve | Narrow deterministic candidates plus UltraGIT-owned confirmed-resolution records | Adds automation with provenance, non-mutating preview, explicit acceptance, and reversibility. [DECIDED] |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| — | No claims rely solely on unverified training knowledge; recommendations are clearly marked and facts are code-verified or cited. | All | None. |

## Open Questions (RESOLVED)

1. **Should resolution reuse (`rerere`) be enabled per repository or globally?**
   - **Decision:** Neither. Keep reuse off by default in a repository-local UltraGIT record store and never enable Git rerere during merge/rebase/cherry-pick commands; discover and preview without mutating worktree or index. [DECIDED]
2. **Should the Result editor operate per hunk or whole file?**
   - What we know: The current UI is hunk-centric, while structural conflicts are file-centric. [VERIFIED: current resolver]
   - **Decision:** Hunk/conflict-region-focused navigation over a whole-file editable Result buffer, with file-level choices for structural/non-text conflicts. [DECIDED]
3. **How far should CONFLICT-03 go in the MVP?**
   - What we know: The requirement asks for heuristics, while project instructions prioritize safety and transparent diffs. [VERIFIED: requirements and `AGENTS.md`]
   - **Decision:** Ship one-side-equals-base, identical-normalized-result, and byte-safe whitespace-only deterministic candidates plus prior confirmed records. All require preview and explicit acceptance into Result; Apply & Stage remains separate. Defer AST, similarity, AI-generated, and unmeasured confidence heuristics. [DECIDED]

## Sources

### Primary codebase evidence (HIGH confidence)

- `src/main/git.ts` — patch application, merge/rebase/cherry-pick commands, conflict parsing, resolution writes, operation status. [VERIFIED: codebase]
- `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/env.d.ts` — IPC contracts and privileged boundary. [VERIFIED: codebase]
- `src/renderer/src/components/sidebar/ConflictResolver.tsx` — current resolver state and UI. [VERIFIED: codebase]
- `src/renderer/src/components/details/DiffModal.tsx`, `src/renderer/src/utils/patchBuilder.ts` — hunk/line staging implementation. [VERIFIED: codebase]
- `src/renderer/src/App.tsx`, `Toolbar.tsx`, `GraphView.tsx`, `useRepoStore.ts` — operation-state orchestration. [VERIFIED: codebase]
- Existing Bun and Playwright tests plus local verification runs dated 2026-09-17. [VERIFIED: local commands]

### Official documentation (MEDIUM confidence through web-search fallback)

- https://git-scm.com/docs/git-checkout — index stage sides and rebase ours/theirs inversion.
- https://git-scm.com/docs/git-ls-files — NUL-delimited unmerged index entries and stages 1/2/3.
- https://git-scm.com/docs/git-diff — stage-specific and combined conflict diffs.
- https://git-scm.com/docs/git-merge — conflict state and diff3/zdiff3 presentation.
- https://git-scm.com/docs/git-apply — preflight, cached application, context safety, recount, reverse.
- https://git-scm.com/docs/git-rerere — recorded resolution reuse and forget/clear behavior.
- https://www.electronjs.org/docs/latest/tutorial/security — IPC sender validation and capability exposure.
- https://www.electronjs.org/docs/latest/tutorial/ipc — narrow preload bridge guidance.

## Metadata

**Confidence breakdown:**

- Existing implementation assessment: HIGH — inspected source and tests directly and ran focused verification. [VERIFIED: codebase/local commands]
- Architecture: HIGH — preserves established project tiers and uses Git's documented primitives. [VERIFIED: codebase; cited official docs]
- Pitfalls: HIGH — each major issue is directly observable or reproduced. [VERIFIED: codebase/local commands]
- External recommendations: MEDIUM — official docs were retrieved through web-search fallback because the configured Jina provider was unavailable. [VERIFIED: research tooling]

**Research date:** 2026-09-17
**Valid until:** 2026-10-17; re-check Electron security guidance and local Git compatibility before implementation.
