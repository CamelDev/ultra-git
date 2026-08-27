import { create } from 'zustand'

export type UndoActionType = 'STAGE' | 'UNSTAGE' | 'COMMIT' | 'RESET' | 'DISCARD'

export interface BaseUndoAction {
  id: string
  repoPath: string
  timestamp: number
  description: string
}

export interface StageUndoAction extends BaseUndoAction {
  type: 'STAGE'
  files: string[]
  isAll?: boolean
}

export interface UnstageUndoAction extends BaseUndoAction {
  type: 'UNSTAGE'
  files: string[]
  isAll?: boolean
}

export interface CommitUndoAction extends BaseUndoAction {
  type: 'COMMIT'
  commitHash?: string
  commitMessage: string
}

export interface ResetUndoAction extends BaseUndoAction {
  type: 'RESET'
  mode: 'soft' | 'hard'
  oldCommitHash: string
  targetCommitHash: string
  targetCommitSubject?: string
  snapshotId?: string
}

export interface DiscardUndoAction extends BaseUndoAction {
  type: 'DISCARD'
  files: string[]
  isStaged: boolean
  snapshotId: string
}

export type UndoAction =
  | StageUndoAction
  | UnstageUndoAction
  | CommitUndoAction
  | ResetUndoAction
  | DiscardUndoAction

interface UndoState {
  undoStacks: Record<string, UndoAction[]>
  redoStacks: Record<string, UndoAction[]>
  restoredCommitMessage: string | null
  
  // Actions
  pushAction: (action: Omit<UndoAction, 'id' | 'timestamp'>) => void
  undo: (repoPath: string, onRefresh: () => Promise<void>) => Promise<{ success: boolean; description?: string; error?: string }>
  redo: (repoPath: string, onRefresh: () => Promise<void>) => Promise<{ success: boolean; description?: string; error?: string }>
  canUndo: (repoPath: string) => boolean
  canRedo: (repoPath: string) => boolean
  getUndoDescription: (repoPath: string) => string | null
  getRedoDescription: (repoPath: string) => string | null
  clearForRepo: (repoPath: string) => void
  clearRestoredCommitMessage: () => void
}

const MAX_STACK_SIZE = 40

const normalizePath = (p: string) => (p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStacks: {},
  redoStacks: {},
  restoredCommitMessage: null,

  pushAction: (actionData) => {
    const key = normalizePath(actionData.repoPath)
    const action: UndoAction = {
      ...actionData,
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now()
    } as UndoAction

    set((state) => {
      const currentUndo = state.undoStacks[key] || []
      const nextUndo = [action, ...currentUndo].slice(0, MAX_STACK_SIZE)
      return {
        undoStacks: {
          ...state.undoStacks,
          [key]: nextUndo
        },
        redoStacks: {
          ...state.redoStacks,
          [key]: [] // Clear redo stack on new action
        }
      }
    })
  },

  canUndo: (repoPath: string) => {
    const key = normalizePath(repoPath)
    const stack = get().undoStacks[key]
    return !!(stack && stack.length > 0)
  },

  canRedo: (repoPath: string) => {
    const key = normalizePath(repoPath)
    const stack = get().redoStacks[key]
    return !!(stack && stack.length > 0)
  },

  getUndoDescription: (repoPath: string) => {
    const key = normalizePath(repoPath)
    const stack = get().undoStacks[key]
    return stack && stack.length > 0 ? stack[0].description : null
  },

  getRedoDescription: (repoPath: string) => {
    const key = normalizePath(repoPath)
    const stack = get().redoStacks[key]
    return stack && stack.length > 0 ? stack[0].description : null
  },

  clearForRepo: (repoPath: string) => {
    const key = normalizePath(repoPath)
    set((state) => {
      const newUndo = { ...state.undoStacks }
      const newRedo = { ...state.redoStacks }
      delete newUndo[key]
      delete newRedo[key]
      return { undoStacks: newUndo, redoStacks: newRedo }
    })
  },

  clearRestoredCommitMessage: () => {
    set({ restoredCommitMessage: null })
  },

  undo: async (repoPath: string, onRefresh: () => Promise<void>) => {
    const key = normalizePath(repoPath)
    const stack = get().undoStacks[key]
    if (!stack || stack.length === 0) {
      return { success: false, error: 'Nothing to undo' }
    }

    const action = stack[0]
    let success = false
    let errorMsg: string | undefined

    try {
      switch (action.type) {
        case 'STAGE': {
          if (action.isAll) {
            const res = await window.api.git.resetAll(repoPath)
            success = res.success
            errorMsg = res.error
          } else {
            const res = await window.api.git.reset(repoPath, action.files)
            success = res.success
            errorMsg = res.error
          }
          break
        }
        case 'UNSTAGE': {
          if (action.isAll) {
            const res = await window.api.git.addAll(repoPath)
            success = res.success
            errorMsg = res.error
          } else {
            const res = await window.api.git.add(repoPath, action.files)
            success = res.success
            errorMsg = res.error
          }
          break
        }
        case 'COMMIT': {
          const res = await window.api.git.undoCommit(repoPath)
          if (res.success) {
            success = true
            set({ restoredCommitMessage: action.commitMessage })
          } else {
            success = false
            errorMsg = res.error
          }
          break
        }
        case 'RESET': {
          const res = await window.api.git.resetToCommit(repoPath, action.oldCommitHash, action.mode)
          if (res.success) {
            if (action.mode === 'hard' && action.snapshotId) {
              await window.api.git.restoreSafetySnapshot(repoPath, action.snapshotId)
            }
            success = true
          } else {
            success = false
            errorMsg = res.error
          }
          break
        }
        case 'DISCARD': {
          const res = await window.api.git.restoreSafetySnapshot(repoPath, action.snapshotId)
          success = res.success
          errorMsg = res.error
          break
        }
      }

      if (success) {
        set((state) => {
          const currentUndo = state.undoStacks[key] || []
          const currentRedo = state.redoStacks[key] || []
          return {
            undoStacks: {
              ...state.undoStacks,
              [key]: currentUndo.slice(1)
            },
            redoStacks: {
              ...state.redoStacks,
              [key]: [action, ...currentRedo].slice(0, MAX_STACK_SIZE)
            }
          }
        })
        await onRefresh()
        return { success: true, description: action.description }
      } else {
        return { success: false, error: errorMsg || `Failed to undo ${action.description}` }
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing undo' }
    }
  },

  redo: async (repoPath: string, onRefresh: () => Promise<void>) => {
    const key = normalizePath(repoPath)
    const stack = get().redoStacks[key]
    if (!stack || stack.length === 0) {
      return { success: false, error: 'Nothing to redo' }
    }

    const action = stack[0]
    let success = false
    let errorMsg: string | undefined

    try {
      switch (action.type) {
        case 'STAGE': {
          if (action.isAll) {
            const res = await window.api.git.addAll(repoPath)
            success = res.success
            errorMsg = res.error
          } else {
            const res = await window.api.git.add(repoPath, action.files)
            success = res.success
            errorMsg = res.error
          }
          break
        }
        case 'UNSTAGE': {
          if (action.isAll) {
            const res = await window.api.git.resetAll(repoPath)
            success = res.success
            errorMsg = res.error
          } else {
            const res = await window.api.git.reset(repoPath, action.files)
            success = res.success
            errorMsg = res.error
          }
          break
        }
        case 'COMMIT': {
          const res = await window.api.git.commit(repoPath, action.commitMessage)
          success = res.success
          errorMsg = res.error
          break
        }
        case 'RESET': {
          const res = await window.api.git.resetToCommit(repoPath, action.targetCommitHash, action.mode)
          success = res.success
          errorMsg = res.error
          break
        }
        case 'DISCARD': {
          const res = await window.api.git.discardChanges(repoPath, action.files, action.isStaged)
          success = res.success
          errorMsg = res.error
          break
        }
      }

      if (success) {
        set((state) => {
          const currentUndo = state.undoStacks[key] || []
          const currentRedo = state.redoStacks[key] || []
          return {
            undoStacks: {
              ...state.undoStacks,
              [key]: [action, ...currentUndo].slice(0, MAX_STACK_SIZE)
            },
            redoStacks: {
              ...state.redoStacks,
              [key]: currentRedo.slice(1)
            }
          }
        })
        await onRefresh()
        return { success: true, description: action.description }
      } else {
        return { success: false, error: errorMsg || `Failed to redo ${action.description}` }
      }
    } catch (err: any) {
      return { success: false, error: err.message || 'Error executing redo' }
    }
  }
}))
