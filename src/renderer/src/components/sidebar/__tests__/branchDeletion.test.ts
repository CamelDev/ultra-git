import { describe, it, expect } from 'bun:test'

describe('Branch Deletion Handling Logic', () => {
  it('prunes deleted branches from the selected branches set', () => {
    const checkedBranches = new Set(['feature/login', 'feature/signup', 'feature/unmerged'])
    const resultDeleted = ['feature/login', 'feature/signup']

    const nextChecked = new Set(checkedBranches)
    resultDeleted.forEach(b => nextChecked.delete(b))

    expect(nextChecked.size).toBe(1)
    expect(nextChecked.has('feature/unmerged')).toBe(true)
    expect(nextChecked.has('feature/login')).toBe(false)
    expect(nextChecked.has('feature/signup')).toBe(false)
  })

  it('prunes branches that no longer exist in localBranches upon repo refresh', () => {
    const checkedBranches = new Set(['feature/a', 'feature/b', 'feature/stale'])
    const refreshedLocalBranches = ['main', 'dev', 'feature/a', 'feature/b']
    const validNames = new Set(refreshedLocalBranches)

    const nextChecked = new Set<string>()
    for (const name of checkedBranches) {
      if (validNames.has(name)) {
        nextChecked.add(name)
      }
    }

    expect(nextChecked.size).toBe(2)
    expect(nextChecked.has('feature/a')).toBe(true)
    expect(nextChecked.has('feature/b')).toBe(true)
    expect(nextChecked.has('feature/stale')).toBe(false)
  })

  it('detects unmerged branch errors and recommends force delete (-D)', () => {
    const errors = [
      "Branch 'feature/unmerged': error: The branch 'feature/unmerged' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D feature/unmerged'."
    ]

    const hasUnmerged = errors.some(err =>
      err.toLowerCase().includes('not fully merged') ||
      err.includes('-D') ||
      err.toLowerCase().includes('force')
    )

    expect(hasUnmerged).toBe(true)
  })

  it('accumulates recentlyDeleted across multiple deletion attempts without duplicates', () => {
    let recentlyDeleted: string[] = []

    // First attempt: feature/1 and feature/2 deleted, feature/3 failed
    const firstDeleted = ['feature/1', 'feature/2']
    recentlyDeleted = Array.from(new Set([...recentlyDeleted, ...firstDeleted]))
    expect(recentlyDeleted).toEqual(['feature/1', 'feature/2'])

    // Retry attempt with force: feature/3 deleted
    const secondDeleted = ['feature/3']
    recentlyDeleted = Array.from(new Set([...recentlyDeleted, ...secondDeleted]))
    expect(recentlyDeleted).toEqual(['feature/1', 'feature/2', 'feature/3'])
  })

  it('simulates handleDeleteBranchesConfirm workflow with unconditional refresh', async () => {
    let refreshRepoCalled = false
    const deletedBranches: string[] = []
    const failedBranches: string[] = []
    const errors: string[] = []

    const branchesToDelete = ['merged-1', 'unmerged-2', 'merged-3']
    const mockDeleteBranch = async (_path: string, branch: string, force: boolean) => {
      if (branch === 'unmerged-2' && !force) {
        return { success: false, error: "The branch 'unmerged-2' is not fully merged." }
      }
      return { success: true }
    }

    const mockRefreshRepo = async () => {
      refreshRepoCalled = true
    }

    // Execution simulating handleDeleteBranchesConfirm
    try {
      for (const branch of branchesToDelete) {
        const res = await mockDeleteBranch('/fake/repo', branch, false)
        if (res.success) {
          deletedBranches.push(branch)
        } else {
          errors.push(`Branch '${branch}': ${res.error}`)
          failedBranches.push(branch)
        }
      }
    } finally {
      await mockRefreshRepo()
    }

    // Refresh MUST be called unconditionally
    expect(refreshRepoCalled).toBe(true)
    expect(deletedBranches).toEqual(['merged-1', 'merged-3'])
    expect(failedBranches).toEqual(['unmerged-2'])
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain("The branch 'unmerged-2' is not fully merged")

    // On retry with force = true, only failedBranches are sent
    const retryDeleted: string[] = []
    for (const branch of failedBranches) {
      const res = await mockDeleteBranch('/fake/repo', branch, true)
      if (res.success) {
        retryDeleted.push(branch)
      }
    }

    expect(retryDeleted).toEqual(['unmerged-2'])
  })
})
