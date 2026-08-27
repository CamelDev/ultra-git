import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { useUndoStore } from '../useUndoStore'

describe('useUndoStore', () => {
  beforeEach(() => {
    useUndoStore.setState({
      undoStacks: {},
      redoStacks: {},
      restoredCommitMessage: null
    })
    // Mock window.api
    // @ts-ignore
    globalThis.window = {
      api: {
        git: {
          add: mock(async () => ({ success: true })),
          reset: mock(async () => ({ success: true })),
          addAll: mock(async () => ({ success: true })),
          resetAll: mock(async () => ({ success: true })),
          commit: mock(async () => ({ success: true })),
          undoCommit: mock(async () => ({ success: true })),
          resetToCommit: mock(async () => ({ success: true })),
          createSafetySnapshot: mock(async () => ({ success: true, snapshotId: 'snap_test_123' })),
          restoreSafetySnapshot: mock(async () => ({ success: true })),
          deleteSafetySnapshot: mock(async () => ({ success: true }))
        }
      }
    } as any
  })

  it('should initially have empty undo/redo stacks', () => {
    expect(useUndoStore.getState().canUndo('/path/to/repo')).toBe(false)
    expect(useUndoStore.getState().canRedo('/path/to/repo')).toBe(false)
    expect(useUndoStore.getState().getUndoDescription('/path/to/repo')).toBeNull()
  })

  it('should push a STAGE action and allow undo and redo', async () => {
    const repoPath = '/path/to/repo'
    useUndoStore.getState().pushAction({
      type: 'STAGE',
      repoPath,
      files: ['src/fileA.ts'],
      description: 'Stage "src/fileA.ts"'
    })

    expect(useUndoStore.getState().canUndo(repoPath)).toBe(true)
    expect(useUndoStore.getState().canRedo(repoPath)).toBe(false)
    expect(useUndoStore.getState().getUndoDescription(repoPath)).toBe('Stage "src/fileA.ts"')

    let refreshed = false
    const undoRes = await useUndoStore.getState().undo(repoPath, async () => {
      refreshed = true
    })

    expect(undoRes.success).toBe(true)
    expect(undoRes.description).toBe('Stage "src/fileA.ts"')
    expect(refreshed).toBe(true)
    expect(window.api.git.reset).toHaveBeenCalledWith(repoPath, ['src/fileA.ts'])

    expect(useUndoStore.getState().canUndo(repoPath)).toBe(false)
    expect(useUndoStore.getState().canRedo(repoPath)).toBe(true)
    expect(useUndoStore.getState().getRedoDescription(repoPath)).toBe('Stage "src/fileA.ts"')

    refreshed = false
    const redoRes = await useUndoStore.getState().redo(repoPath, async () => {
      refreshed = true
    })

    expect(redoRes.success).toBe(true)
    expect(refreshed).toBe(true)
    expect(window.api.git.add).toHaveBeenCalledWith(repoPath, ['src/fileA.ts'])
    expect(useUndoStore.getState().canUndo(repoPath)).toBe(true)
    expect(useUndoStore.getState().canRedo(repoPath)).toBe(false)
  })

  it('should handle COMMIT undo and restore commit message', async () => {
    const repoPath = '/path/to/repo'
    useUndoStore.getState().pushAction({
      type: 'COMMIT',
      repoPath,
      commitMessage: 'feat: add awesome feature',
      description: 'Commit "feat: add awesome feature"'
    })

    const undoRes = await useUndoStore.getState().undo(repoPath, async () => {})

    expect(undoRes.success).toBe(true)
    expect(window.api.git.undoCommit).toHaveBeenCalledWith(repoPath)
    expect(useUndoStore.getState().restoredCommitMessage).toBe('feat: add awesome feature')

    useUndoStore.getState().clearRestoredCommitMessage()
    expect(useUndoStore.getState().restoredCommitMessage).toBeNull()

    const redoRes = await useUndoStore.getState().redo(repoPath, async () => {})
    expect(redoRes.success).toBe(true)
    expect(window.api.git.commit).toHaveBeenCalledWith(repoPath, 'feat: add awesome feature')
  })

  it('should handle RESET undo for soft and hard modes with snapshots', async () => {
    const repoPath = '/path/to/repo'
    useUndoStore.getState().pushAction({
      type: 'RESET',
      repoPath,
      mode: 'hard',
      oldCommitHash: 'sha_old_111',
      targetCommitHash: 'sha_target_222',
      snapshotId: 'snap_123',
      description: 'Reset to sha_tar (hard)'
    })

    const undoRes = await useUndoStore.getState().undo(repoPath, async () => {})
    expect(undoRes.success).toBe(true)
    expect(window.api.git.resetToCommit).toHaveBeenCalledWith(repoPath, 'sha_old_111', 'hard')
    expect(window.api.git.restoreSafetySnapshot).toHaveBeenCalledWith(repoPath, 'snap_123')

    const redoRes = await useUndoStore.getState().redo(repoPath, async () => {})
    expect(redoRes.success).toBe(true)
    expect(window.api.git.resetToCommit).toHaveBeenCalledWith(repoPath, 'sha_target_222', 'hard')
  })

  it('should handle DISCARD undo restoring safety snapshot', async () => {
    const repoPath = '/path/to/repo'
    useUndoStore.getState().pushAction({
      type: 'DISCARD',
      repoPath,
      files: ['src/App.tsx'],
      isStaged: false,
      snapshotId: 'snap_discard_999',
      description: 'Discard "src/App.tsx"'
    })

    const undoRes = await useUndoStore.getState().undo(repoPath, async () => {})
    expect(undoRes.success).toBe(true)
    expect(window.api.git.restoreSafetySnapshot).toHaveBeenCalledWith(repoPath, 'snap_discard_999')
  })

  it('should isolate undo/redo stacks per repository', () => {
    const repoA = '/path/to/repoA'
    const repoB = '/path/to/repoB'

    useUndoStore.getState().pushAction({
      type: 'STAGE',
      repoPath: repoA,
      files: ['a.txt'],
      description: 'Stage "a.txt"'
    })

    expect(useUndoStore.getState().canUndo(repoA)).toBe(true)
    expect(useUndoStore.getState().canUndo(repoB)).toBe(false)
  })
})
