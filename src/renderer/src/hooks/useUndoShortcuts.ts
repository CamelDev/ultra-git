import { useEffect, useCallback } from 'react'
import { useUndoStore } from '../store/useUndoStore'
import { useRepoStore } from '../store/useRepoStore'
import { useToaster } from '../components/toaster/ToasterContext'

export const useUndoShortcuts = () => {
  const { undo, redo, canUndo, canRedo } = useUndoStore()
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const { addToast } = useToaster()

  const handleUndo = useCallback(async () => {
    const activeRepo = getActiveRepo()
    if (!activeRepo) return

    if (!canUndo(activeRepo.path)) {
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const redoShortcut = isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'

    const res = await undo(activeRepo.path, async () => {
      await refreshRepo(activeRepo.id)
    })

    if (res.success && res.description) {
      addToast({
        variant: 'info',
        title: 'Undo Successful',
        message: `Undid: ${res.description} (${redoShortcut} to redo)`
      })
    } else if (!res.success && res.error && res.error !== 'Nothing to undo') {
      addToast({
        variant: 'error',
        title: 'Undo Failed',
        message: res.error
      })
    }
  }, [getActiveRepo, canUndo, undo, refreshRepo, addToast])

  const handleRedo = useCallback(async () => {
    const activeRepo = getActiveRepo()
    if (!activeRepo) return

    if (!canRedo(activeRepo.path)) {
      return
    }

    const res = await redo(activeRepo.path, async () => {
      await refreshRepo(activeRepo.id)
    })

    if (res.success && res.description) {
      addToast({
        variant: 'info',
        title: 'Redo Successful',
        message: `Redid: ${res.description}`
      })
    } else if (!res.success && res.error && res.error !== 'Nothing to redo') {
      addToast({
        variant: 'error',
        title: 'Redo Failed',
        message: res.error
      })
    }
  }, [getActiveRepo, canRedo, redo, refreshRepo, addToast])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if user is typing in a text field
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.monaco-editor'))
      ) {
        return
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey

      if (!isCmdOrCtrl) return

      const key = e.key.toLowerCase()

      // Undo: Cmd+Z (Mac) or Ctrl+Z (Win/Linux) without Shift
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      }
      // Redo: Cmd+Shift+Z / Cmd+Y (Mac) or Ctrl+Shift+Z / Ctrl+Y (Win/Linux)
      else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  return { handleUndo, handleRedo }
}
