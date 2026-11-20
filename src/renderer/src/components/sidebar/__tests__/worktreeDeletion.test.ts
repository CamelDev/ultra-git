import { describe, it, expect } from 'bun:test'
import { shouldSuggestForceWorktreeRemoval } from '../DeleteWorktreesModal'

describe('Worktree Deletion Handling Logic', () => {
  it('prunes deleted worktrees from the selected set', () => {
    const checkedPaths = new Set(['C:/wt/clean-1', 'C:/wt/locked-2', 'C:/wt/clean-3'])
    const deleted = ['C:/wt/clean-1', 'C:/wt/clean-3']

    const nextChecked = new Set(checkedPaths)
    deleted.forEach((p) => nextChecked.delete(p))

    expect(nextChecked.size).toBe(1)
    expect(nextChecked.has('C:/wt/locked-2')).toBe(true)
  })

  it('detects locked and dirty worktree errors and suggests force removal', () => {
    expect(
      shouldSuggestForceWorktreeRemoval([
        "Worktree '6900-abc': fatal: cannot remove a locked working tree; use 'remove -f -f' to override"
      ])
    ).toBe(true)

    expect(
      shouldSuggestForceWorktreeRemoval([
        "Worktree 'wt-dirty': fatal: 'C:/wt/dirty' contains modified or untracked files, use --force to delete it"
      ])
    ).toBe(true)

    expect(
      shouldSuggestForceWorktreeRemoval([
        "Worktree 'wt-other': fatal: permission denied"
      ])
    ).toBe(false)
  })

  it('simulates multi-worktree removal with partial failure and retry with force', async () => {
    let refreshCalled = false
    const deletedWorktrees: string[] = []
    const failedWorktrees: string[] = []
    const errors: string[] = []

    const targets = ['C:/wt/clean', 'C:/wt/locked']
    const mockRemoveWorktree = async (_repoPath: string, wtPath: string, force: boolean) => {
      if (wtPath === 'C:/wt/locked' && !force) {
        return {
          success: false,
          error: "fatal: cannot remove a locked working tree; use 'remove -f -f' to override"
        }
      }
      return { success: true }
    }

    try {
      for (const wtPath of targets) {
        const res = await mockRemoveWorktree('C:/repo', wtPath, false)
        if (res.success) {
          deletedWorktrees.push(wtPath)
        } else {
          errors.push(`Worktree '${wtPath}': ${res.error}`)
          failedWorktrees.push(wtPath)
        }
      }
    } finally {
      refreshCalled = true
    }

    expect(refreshCalled).toBe(true)
    expect(deletedWorktrees).toEqual(['C:/wt/clean'])
    expect(failedWorktrees).toEqual(['C:/wt/locked'])
    expect(shouldSuggestForceWorktreeRemoval(errors)).toBe(true)

    const retryDeleted: string[] = []
    for (const wtPath of failedWorktrees) {
      const res = await mockRemoveWorktree('C:/repo', wtPath, true)
      if (res.success) {
        retryDeleted.push(wtPath)
      }
    }

    expect(retryDeleted).toEqual(['C:/wt/locked'])
  })
})
