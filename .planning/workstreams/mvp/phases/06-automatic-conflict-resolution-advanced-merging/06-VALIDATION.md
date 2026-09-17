---
phase: 6
slug: automatic-conflict-resolution-advanced-merging
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-17
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test 1.3.11; Playwright 1.58.2 |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `bun test src/main/__tests__/conflictService.test.ts src/renderer/src/store/__tests__/conflictSession.test.ts` |
| **Full suite command** | `bun test src && bun run test:e2e` |
| **Estimated runtime** | Quick: <30 seconds; full: several minutes |

---

## Sampling Rate

- **After every task commit:** Run focused Bun tests for the touched service, parser, or reducer.
- **After every plan wave:** Run focused conflict/rebase/partial-stage Playwright tests plus `bun run build`.
- **Before `/gsd-verify-work`:** `bun test src && bun run test:e2e` must be green.
- **Max feedback latency:** 30 seconds for the quick unit/integration loop.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | CONFLICT-01 | test isolation | Rebase mocks cannot contaminate real Git suites | unit/integration | `bun test src/main/__tests__/git.rebase-status.test.ts src/main/__tests__/git.patch.test.ts` | ✅ files; repair required | ⬜ pending |
| 06-01-02 | 01 | 0 | CONFLICT-01,02 | fixture safety | Real repositories characterize operations and conflict classes | integration | `bun test src/main/__tests__/conflictService.test.ts` | ❌ create | ⬜ pending |
| 06-01-03 | 01 | 0 | CONFLICT-01 | repeated stops | Two-stop rebase fixture is deterministic | E2E | `bunx playwright test e2e/rebase-conflict-resolver.spec.ts --grep "first stop|fixture"` | ❌ create | ⬜ pending |
| 06-02-01 | 02 | 1 | CONFLICT-02 | stale identity | Shared generation/OID/region/EOL/undo contracts compile | build | `bun run build` | ❌ create | ⬜ pending |
| 06-02-02 | 02 | 1 | CONFLICT-02 | region tampering | Git-derived regions compose deterministically and non-mutatingly | unit/integration | `bun test src/main/__tests__/conflictRegions.test.ts` | ❌ create | ⬜ pending |
| 06-03-01 | 03 | 2 | CONFLICT-01,02 | path/stale/rollback | Operations, resolution, rollback, postconditions, and undo are Git-derived | integration | `bun test src/main/__tests__/conflictService.test.ts src/main/__tests__/conflictRegions.test.ts` | ❌ create/extend | ⬜ pending |
| 06-03-02 | 03 | 2 | CONFLICT-01,02 | IPC privilege | Sender/repository/path/payload/undo handles are guarded | integration + build | `bun test src/main/__tests__/conflictService.test.ts && bun run build` | ❌ extend | ⬜ pending |
| 06-04-01 | 04 | 3 | CONFLICT-02 | stale drafts | Explicit reducer choices, external changes, and undo expiry are deterministic | unit | `bun test src/renderer/src/store/__tests__/conflictSession.test.ts` | ❌ create | ⬜ pending |
| 06-04-02 | 04 | 3 | CONFLICT-01,02 | controller authority | One controller consumes returned snapshots across generations | unit + build | `bun test src/renderer/src/store/__tests__/conflictSession.test.ts && bun run build` | ❌ extend | ⬜ pending |
| 06-05-01 | 05 | 4 | CONFLICT-02 | accessible shell | Responsive semantic workbench shell compiles | build | `bun run build` | ❌ create | ⬜ pending |
| 06-05-02 | 05 | 4 | CONFLICT-02 | explicit choice | Sources/Result/structural choices preserve unresolved gating | unit + build | `bun run build && bun test src/renderer/src/store/__tests__/conflictSession.test.ts` | ❌ create | ⬜ pending |
| 06-06-01 | 06 | 5 | CONFLICT-01,02 | bypass prevention | All entry points use centralized controller | build | `bun run build` | ✅ modify | ⬜ pending |
| 06-06-02 | 06 | 5 | CONFLICT-01,02 | Git postconditions | Real merge/cherry-pick/two-stop rebase/accessibility/undo flows pass | E2E | `bunx playwright test e2e/conflict-resolver.spec.ts e2e/rebase-conflict-resolver.spec.ts` | ✅ extend/create | ⬜ pending |
| 06-07-01 | 07 | 6 | CONFLICT-02 | stale/atomic/undo | Exact partial batches and Undo/Redo preserve before/after state | integration | `bun test src/main/__tests__/git.partialPatch.test.ts src/main/__tests__/git.patch.test.ts` | ❌ create | ⬜ pending |
| 06-07-02 | 07 | 6 | CONFLICT-02 | IPC privilege | Canonical selection and Undo/Redo APIs reject forged/stale handles | integration + build | `bun test src/main/__tests__/git.partialPatch.test.ts && bun run build` | ❌ extend | ⬜ pending |
| 06-08-01 | 08 | 7 | CONFLICT-02 | renderer authority | DiffModal submits one typed batch and exposes bounded Undo/Redo | unit + build | `bun run build && bun test src/renderer/src/store/__tests__/useUndoStore.test.ts` | ✅ extend | ⬜ pending |
| 06-08-02 | 08 | 7 | CONFLICT-02 | transaction rollback | Partial UI batches, stale reload, Undo/Redo, and expiry are Git-verified | E2E + integration | `bunx playwright test e2e/partial-staging.spec.ts && bun test src/main/__tests__/git.partialPatch.test.ts` | ❌ create | ⬜ pending |
| 06-09-01 | 09 | 8 | CONFLICT-03 | unsafe heuristic | Required deterministic candidates pass positive/negative byte-safety cases | unit/integration | `bun test src/main/__tests__/conflictCandidates.test.ts` | ❌ create | ⬜ pending |
| 06-09-02 | 09 | 8 | CONFLICT-03 | record tampering | Local records and preview/reject/restart leave Git unchanged | integration + build | `bun test src/main/__tests__/conflictCandidates.test.ts src/main/__tests__/conflictService.test.ts && bun run build` | ❌ extend | ⬜ pending |
| 06-10-01 | 10 | 9 | CONFLICT-03 | silent automation | Preview/accept/reject/forget UI never mutates before Apply | E2E + unit | `bunx playwright test e2e/conflict-resolution-reuse.spec.ts && bun test src/main/__tests__/conflictCandidates.test.ts src/renderer/src/store/__tests__/conflictSession.test.ts` | ❌ create | ⬜ pending |
| 06-10-02 | 10 | 9 | CONFLICT-01,02,03 | phase gate | Full suite/build and documentation evidence are complete | full | `bun test src && bun run test:e2e && bun run build` | ✅ commands | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/__tests__/conflictService.test.ts` — stage parsing and operation transition matrix.
- [ ] `e2e/rebase-conflict-resolver.spec.ts` — at least two commits that stop consecutively.
- [ ] Isolate `git.rebase-status.test.ts` mocks so the combined `bun test src` invocation does not contaminate `git.patch.test.ts`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Resizable conflict panes remain readable at minimum supported window size | CONFLICT-02 | Visual density and synchronized scrolling need human judgment | Open a multi-hunk conflict at minimum window size; resize panes; verify labels, result editor, focus, and horizontal scrolling remain usable. |
| Platform path/EOL handling on Windows | CONFLICT-01, CONFLICT-02 | macOS development cannot fully reproduce Windows filesystem and line-ending behavior | Run focused conflict and partial-staging E2E on Windows with spaces, Unicode, CRLF, and no-final-newline fixtures. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for quick checks
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
