import { describe, it, expect, vi } from 'vitest'
import { GitOperationHistory, GitOperation } from '../gitOperationHistory'

describe('GitOperationHistory', () => {
  it('should initialize with empty stacks', () => {
    const history = new GitOperationHistory()
    expect(history.canUndo('/repo')).toBe(false)
    expect(history.canRedo('/repo')).toBe(false)
    expect(history.undoLabel('/repo')).toBeNull()
    expect(history.redoLabel('/repo')).toBeNull()
  })

  it('should push operations to the undo stack and clear redo stack', () => {
    const history = new GitOperationHistory()
    const undoMock = vi.fn()
    const redoMock = vi.fn()
    const op: GitOperation = {
      label: 'Stage file.txt',
      repoPath: '/repo',
      undo: undoMock,
      redo: redoMock,
    }

    history.push(op)
    expect(history.canUndo('/repo')).toBe(true)
    expect(history.canRedo('/repo')).toBe(false)
    expect(history.undoLabel('/repo')).toBe('Stage file.txt')
  })

  it('should perform undo and move operation to redo stack', async () => {
    const history = new GitOperationHistory()
    const undoMock = vi.fn().mockResolvedValue(undefined)
    const redoMock = vi.fn().mockResolvedValue(undefined)
    const op: GitOperation = {
      label: 'Stage file.txt',
      repoPath: '/repo',
      undo: undoMock,
      redo: redoMock,
    }

    history.push(op)
    const label = await history.undo('/repo')

    expect(label).toBe('Stage file.txt')
    expect(undoMock).toHaveBeenCalledOnce()
    expect(history.canUndo('/repo')).toBe(false)
    expect(history.canRedo('/repo')).toBe(true)
    expect(history.redoLabel('/repo')).toBe('Stage file.txt')
  })

  it('should perform redo and move operation back to undo stack', async () => {
    const history = new GitOperationHistory()
    const undoMock = vi.fn().mockResolvedValue(undefined)
    const redoMock = vi.fn().mockResolvedValue(undefined)
    const op: GitOperation = {
      label: 'Stage file.txt',
      repoPath: '/repo',
      undo: undoMock,
      redo: redoMock,
    }

    history.push(op)
    await history.undo('/repo')
    const label = await history.redo('/repo')

    expect(label).toBe('Stage file.txt')
    expect(redoMock).toHaveBeenCalledOnce()
    expect(history.canUndo('/repo')).toBe(true)
    expect(history.canRedo('/repo')).toBe(false)
  })

  it('should limit stack depth to maxDepth', () => {
    const history = new GitOperationHistory(3)
    const dummyOp = (label: string): GitOperation => ({
      label,
      repoPath: '/repo',
      undo: vi.fn(),
      redo: vi.fn(),
    })

    history.push(dummyOp('Op 1'))
    history.push(dummyOp('Op 2'))
    history.push(dummyOp('Op 3'))
    history.push(dummyOp('Op 4'))

    // Op 1 should have been shifted out
    expect(history.canUndo('/repo')).toBe(true)
    expect(history.undoLabel('/repo')).toBe('Op 4')

    // Pop 3 times
    // 1st pop: Op 4
    // 2nd pop: Op 3
    // 3rd pop: Op 2
    // 4th pop: should be null (Op 1 is gone)
  })

  it('should keep histories independent per repository path', async () => {
    const history = new GitOperationHistory()
    const op1: GitOperation = {
      label: 'Op Repo 1',
      repoPath: '/repo1',
      undo: vi.fn(),
      redo: vi.fn(),
    }
    const op2: GitOperation = {
      label: 'Op Repo 2',
      repoPath: '/repo2',
      undo: vi.fn(),
      redo: vi.fn(),
    }

    history.push(op1)
    history.push(op2)

    expect(history.canUndo('/repo1')).toBe(true)
    expect(history.undoLabel('/repo1')).toBe('Op Repo 1')
    expect(history.canUndo('/repo2')).toBe(true)
    expect(history.undoLabel('/repo2')).toBe('Op Repo 2')

    await history.undo('/repo1')
    expect(history.canUndo('/repo1')).toBe(false)
    expect(history.canUndo('/repo2')).toBe(true)
  })

  it('should clear history for a repository', () => {
    const history = new GitOperationHistory()
    const op: GitOperation = {
      label: 'Op',
      repoPath: '/repo',
      undo: vi.fn(),
      redo: vi.fn(),
    }

    history.push(op)
    expect(history.canUndo('/repo')).toBe(true)

    history.clear('/repo')
    expect(history.canUndo('/repo')).toBe(false)
  })
})
