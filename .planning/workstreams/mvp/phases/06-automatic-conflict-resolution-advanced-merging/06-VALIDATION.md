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
| 06-01-01 | 01 | 0 | CONFLICT-01 | — | Test mocks do not leak across suites | unit/integration | `bun test src` | ✅ existing suites; repair required | ⬜ pending |
| 06-01-02 | 01 | 0 | CONFLICT-01 | — | Sequential rebase stops remain observable | integration + E2E | `bun test src/main/__tests__/conflictService.test.ts && bunx playwright test e2e/rebase-conflict-resolver.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 06-02-01 | 02 | 1 | CONFLICT-01 | IPC/path | Repository, path, generation, and payload are validated | integration | `bun test src/main/__tests__/conflictService.test.ts` | ❌ Wave 0 | ⬜ pending |
| 06-02-02 | 02 | 1 | CONFLICT-02 | stale state | Conflict stages and structural types are Git-derived | integration | `bun test src/main/__tests__/conflictService.test.ts` | ❌ Wave 0 | ⬜ pending |
| 06-03-01 | 03 | 2 | CONFLICT-02 | stale patch | Partial actions preflight and apply atomically | integration + E2E | `bun test src/main/__tests__/git.partialPatch.test.ts && bunx playwright test e2e/partial-staging.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 06-04-01 | 04 | 3 | CONFLICT-02 | — | No conflict is preselected; drafts survive navigation by generation | reducer + E2E | `bun test src/renderer/src/store/__tests__/conflictSession.test.ts && bunx playwright test e2e/conflict-resolver.spec.ts e2e/rebase-conflict-resolver.spec.ts` | ❌ reducer/rebase specs | ⬜ pending |
| 06-05-01 | 05 | 4 | CONFLICT-03 | unsafe automation | Candidates are preview-only and never silently staged | integration + E2E | `bun test src/main/__tests__/conflictResolutionReuse.test.ts && bunx playwright test e2e/conflict-resolution-reuse.spec.ts` | ❌ Wave 4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/main/__tests__/conflictService.test.ts` — stage parsing and operation transition matrix.
- [ ] `src/main/__tests__/git.partialPatch.test.ts` — atomic multi-hunk and stale patch behavior.
- [ ] `src/renderer/src/store/__tests__/conflictSession.test.ts` — explicit unresolved reducer and generation changes.
- [ ] `e2e/rebase-conflict-resolver.spec.ts` — at least two commits that stop consecutively.
- [ ] `e2e/partial-staging.spec.ts` — file/hunk/line selection and failed-preflight rollback.
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
