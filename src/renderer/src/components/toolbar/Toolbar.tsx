import React, { useState, useEffect } from 'react'
import { GitBranch, X, Tag, Cherry, Network, Plus, Minus, Package, Undo2, Redo2, GitMerge, AlertTriangle, SkipForward, XCircle } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { useUndoStore } from '../../store/useUndoStore'
import { useToaster } from '../toaster/ToasterContext'
import { CherryPickModal } from './CherryPickModal'
import BranchGraphModal from '../graph/BranchGraphModal'
import { AppDialog } from '../dialogs/AppDialog'

const normalizePath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

interface ToolbarProps {
  onMergeConflicts?: (conflictedFiles: Array<{ path: string; status: string }>, isRebase: boolean, isCherryPick?: boolean) => void
  onOpenConflictResolver?: () => void
}

const Toolbar: React.FC<ToolbarProps> = ({ onMergeConflicts, onOpenConflictResolver }) => {
  const { getActiveRepo, refreshRepo, identities, setRepoCommitMessage } = useRepoStore()
  const {
    restoredCommitMessage,
    clearRestoredCommitMessage,
    canUndo,
    canRedo,
    getUndoDescription,
    getRedoDescription,
    undo,
    redo
  } = useUndoStore()
  const { addToast } = useToaster()
  const activeRepo = getActiveRepo()
  const commitMessage = activeRepo?.commitMessage || ''
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [tagErrorMessage, setTagErrorMessage] = useState('')
  const [isCherryPickModalOpen, setIsCherryPickModalOpen] = useState(false)
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false)
  const [isNoChangesStagedOpen, setIsNoChangesStagedOpen] = useState(false)

  const files = activeRepo?.status?.files as any[] || []
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  const mergeStatus = activeRepo?.mergeStatus
  const isOpInProgress = !!mergeStatus?.inProgress
  const conflictedFiles = (activeRepo?.status?.conflicted || []) as any[]
  const hasConflicts = conflictedFiles.length > 0

  const isIdentityRequiredAndMissing = !!(activeRepo && identities.length > 1 && !activeRepo.identityId)
  const mainWtPath = activeRepo?.worktrees?.[0]?.path;
  const isCurrentRepoWorktree = mainWtPath ? normalizePath(activeRepo.path) !== normalizePath(mainWtPath) : false;

  useEffect(() => {
    if (restoredCommitMessage !== null && activeRepo) {
      setRepoCommitMessage(activeRepo.id, restoredCommitMessage)
      clearRestoredCommitMessage()
    }
  }, [restoredCommitMessage, clearRestoredCommitMessage, activeRepo?.id, setRepoCommitMessage])

  const handleStageAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.addAll(activeRepo.path)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'STAGE',
          repoPath: activeRepo.path,
          files: [],
          isAll: true,
          description: 'Stage All'
        })
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to stage all files:', res.error)
      }
    } catch (err) {
      console.error('Error staging all files:', err)
    }
  }

  const handleUnstageAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.resetAll(activeRepo.path)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'UNSTAGE',
          repoPath: activeRepo.path,
          files: [],
          isAll: true,
          description: 'Unstage All'
        })
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to unstage all files:', res.error)
      }
    } catch (err) {
      console.error('Error unstaging all files:', err)
    }
  }

  const handleStashAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.stashAll(activeRepo.path)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to stash files:', res.error)
      }
    } catch (err) {
      console.error('Error stashing files:', err)
    }
  }

  const handleCommit = async () => {
    if (!activeRepo) return
    if (commitMessage.trim().length <= 2) return
    if (stagedFiles.length === 0) {
      setIsNoChangesStagedOpen(true)
      return
    }
    const msg = commitMessage
    try {
      const res = await window.api.git.commit(activeRepo.path, msg)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'COMMIT',
          repoPath: activeRepo.path,
          commitMessage: msg,
          description: `Commit "${msg.slice(0, 30)}${msg.length > 30 ? '...' : ''}"`
        })
        setRepoCommitMessage(activeRepo.id, '')
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to commit:', res.error)
      }
    } catch (err) {
      console.error('Error committing changes:', err)
    }
  }

  const handleContinueRebase = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.continueRebase(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'success', title: 'Rebase Advanced', message: 'Rebase continued successfully.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Continue Failed', message: res.error || 'Failed to continue rebase.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Continue Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleSkipRebase = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.skipRebase(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'info', title: 'Commit Skipped', message: 'Skipped commit and advanced rebase.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Skip Failed', message: res.error || 'Failed to skip commit.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Skip Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleAbortRebase = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.abortRebase(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'info', title: 'Rebase Aborted', message: 'Rebase aborted and repository restored.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Abort Failed', message: res.error || 'Failed to abort rebase.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Abort Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleAbortMerge = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.abortMerge(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'info', title: 'Merge Aborted', message: 'Merge aborted and repository restored.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Abort Failed', message: res.error || 'Failed to abort merge.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Abort Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleContinueCherryPick = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.continueCherryPick(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'success', title: 'Cherry-pick Continued', message: 'Cherry-pick completed successfully.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Continue Failed', message: res.error || 'Failed to continue cherry-pick.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Continue Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleAbortCherryPick = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.abortCherryPick(activeRepo.path)
      if (res.success) {
        addToast({ variant: 'info', title: 'Cherry-pick Aborted', message: 'Cherry-pick aborted.' })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Abort Failed', message: res.error || 'Failed to abort cherry-pick.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Abort Failed', message: err.message || 'An error occurred.' })
    }
  }

  const handleUndoClick = async () => {
    if (!activeRepo) return
    const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
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
  }

  const handleRedoClick = async () => {
    if (!activeRepo) return
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
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const undoDesc = activeRepo ? getUndoDescription(activeRepo.path) : null
  const redoDesc = activeRepo ? getRedoDescription(activeRepo.path) : null
  const undoTooltip = undoDesc ? `Undo: ${undoDesc} (${isMac ? 'Cmd+Z' : 'Ctrl+Z'})` : `Undo (${isMac ? 'Cmd+Z' : 'Ctrl+Z'})`
  const redoTooltip = redoDesc ? `Redo: ${redoDesc} (${isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'})` : `Redo (${isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'})`
  const hasUndo = activeRepo ? canUndo(activeRepo.path) : false
  const hasRedo = activeRepo ? canRedo(activeRepo.path) : false

  const handleCreateBranchSubmit = async () => {
    const name = newBranchName.trim()
    if (!name || !activeRepo) return
    try {
      const res = await window.api.git.createBranch(activeRepo.path, name)
      if (res.success) {
        setIsBranchModalOpen(false)
        setNewBranchName('')
        setErrorMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        setErrorMessage(res.error || 'Failed to create branch.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.')
    }
  }

  const handleCreateTagSubmit = async () => {
    const name = newTagName.trim()
    if (!name || !activeRepo) return
    try {
      const targetCommit = activeRepo.commits?.[0]
      const res = await window.api.git.createTag(activeRepo.path, name, targetCommit?.hash)
      if (res.success) {
        setIsTagModalOpen(false)
        setNewTagName('')
        setTagErrorMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        setTagErrorMessage(res.error || 'Failed to create tag.')
      }
    } catch (err: any) {
      setTagErrorMessage(err.message || 'An error occurred.')
    }
  }

  // Close tag modal on Escape key press
  useEffect(() => {
    if (!isTagModalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTagModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isTagModalOpen])

  // Close branch modal on Escape key press
  useEffect(() => {
    if (!isBranchModalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBranchModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBranchModalOpen])

  return (
    <div className="toolbar">
      <div
        className="toolbar-title"
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)'
        }}
      >
        Branch changes
      </div>

      {activeRepo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-stash btn-icon"
            onClick={() => {
              if (isCurrentRepoWorktree) return;
              setNewBranchName('')
              setErrorMessage('')
              setIsBranchModalOpen(true)
            }}
            disabled={isCurrentRepoWorktree}
            data-tooltip={isCurrentRepoWorktree ? "Cannot create branch from a worktree" : "Create a new branch from latest local commit (HEAD)"}
            data-testid="create-branch-btn"
            style={{ 
              opacity: isCurrentRepoWorktree ? 0.5 : 1,
              cursor: isCurrentRepoWorktree ? 'not-allowed' : 'pointer'
            }}
          >
            <GitBranch size={16} />
            <span className="sr-only">Branch</span>
          </button>

          <button
            className="btn-stash btn-icon"
            onClick={() => {
              setIsCherryPickModalOpen(true)
            }}
            data-tooltip="Cherry pick from another branch"
            data-testid="cherry-pick-btn"
          >
            <Cherry size={16} />
            <span className="sr-only">Cherry pick from ...</span>
          </button>

          <button
            className="btn-stash btn-icon"
            onClick={() => {
              setNewTagName('')
              setTagErrorMessage('')
              setIsTagModalOpen(true)
            }}
            data-tooltip="Create a new tag from latest local commit (HEAD)"
            data-testid="create-tag-btn"
          >
            <Tag size={16} />
            <span className="sr-only">Tag</span>
          </button>

          <button
            className="btn-stash btn-icon"
            onClick={() => setIsGraphModalOpen(true)}
            data-tooltip="View visual branch graph"
            data-testid="branch-graph-btn"
          >
            <Network size={16} />
            <span className="sr-only">Graph</span>
          </button>

          <button
            className="btn-stash btn-icon"
            onClick={handleUndoClick}
            disabled={!hasUndo}
            style={{ opacity: hasUndo ? 1 : 0.4, cursor: hasUndo ? 'pointer' : 'not-allowed' }}
            data-tooltip={undoTooltip}
            data-testid="toolbar-undo-btn"
          >
            <Undo2 size={16} />
            <span className="sr-only">Undo</span>
          </button>

          <button
            className="btn-stash btn-icon"
            onClick={handleRedoClick}
            disabled={!hasRedo}
            style={{ opacity: hasRedo ? 1 : 0.4, cursor: hasRedo ? 'pointer' : 'not-allowed' }}
            data-tooltip={redoTooltip}
            data-testid="toolbar-redo-btn"
          >
            <Redo2 size={16} />
            <span className="sr-only">Redo</span>
          </button>
        </div>
      )}

      {activeRepo && (
        <div className="toolbar-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isOpInProgress ? (
            <div className="operation-in-progress-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {files.length > 0 && (
                <>
                  <button
                    className="btn-primary btn-icon"
                    onClick={handleStageAll}
                    disabled={unstagedFiles.length === 0}
                    style={{ opacity: unstagedFiles.length === 0 ? 0.5 : 1, cursor: unstagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                    data-tooltip="Stage all unstaged changes"
                  >
                    <Plus size={16} />
                    <span className="sr-only">Stage all</span>
                  </button>
                  <button
                    className="btn-secondary btn-icon"
                    onClick={handleUnstageAll}
                    disabled={stagedFiles.length === 0}
                    style={{ opacity: stagedFiles.length === 0 ? 0.5 : 1, cursor: stagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                    data-tooltip="Unstage all staged changes"
                  >
                    <Minus size={16} />
                    <span className="sr-only">Unstage all</span>
                  </button>
                </>
              )}

              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  backgroundColor: hasConflicts ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  color: hasConflicts ? '#f87171' : '#fbbf24',
                  fontSize: '11.5px',
                  fontWeight: 600
                }}
              >
                <AlertTriangle size={13} />
                <span>
                  {mergeStatus?.isRebase
                    ? `Rebasing${mergeStatus.currentStep && mergeStatus.totalSteps ? ` (${mergeStatus.currentStep}/${mergeStatus.totalSteps})` : ''}`
                    : mergeStatus?.isCherryPick
                    ? 'Cherry-picking'
                    : 'Merging'}
                </span>
              </div>

              {hasConflicts ? (
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (onOpenConflictResolver) {
                      onOpenConflictResolver()
                    } else if (onMergeConflicts) {
                      window.api.git.getConflictedFiles(activeRepo.path).then(res => {
                        onMergeConflicts(res.data || [], !!mergeStatus?.isRebase, !!mergeStatus?.isCherryPick)
                      })
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    backgroundColor: '#ef4444',
                    borderColor: '#dc2626'
                  }}
                  data-testid="toolbar-resolve-conflicts-btn"
                >
                  <AlertTriangle size={13} />
                  Resolve Conflicts ({conflictedFiles.length})
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={mergeStatus?.isRebase ? handleContinueRebase : mergeStatus?.isCherryPick ? handleContinueCherryPick : handleCommit}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    backgroundColor: '#10b981',
                    borderColor: '#059669'
                  }}
                  data-testid="toolbar-continue-btn"
                >
                  <GitMerge size={13} />
                  {mergeStatus?.isRebase ? 'Continue Rebase' : mergeStatus?.isCherryPick ? 'Continue Cherry-pick' : 'Commit Merge'}
                </button>
              )}

              {mergeStatus?.isRebase && (
                <button
                  className="btn-secondary"
                  onClick={handleSkipRebase}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px' }}
                  data-tooltip="Skip current commit (git rebase --skip)"
                  data-testid="toolbar-skip-btn"
                >
                  <SkipForward size={13} />
                  Skip Commit
                </button>
              )}

              <button
                className="btn-secondary"
                onClick={mergeStatus?.isRebase ? handleAbortRebase : mergeStatus?.isCherryPick ? handleAbortCherryPick : handleAbortMerge}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontSize: '11.5px',
                  color: '#f87171',
                  borderColor: 'rgba(239, 68, 68, 0.4)'
                }}
                data-tooltip={`Abort ${mergeStatus?.isRebase ? 'rebase' : mergeStatus?.isCherryPick ? 'cherry-pick' : 'merge'} and restore previous state`}
                data-testid="toolbar-abort-btn"
              >
                <XCircle size={13} />
                Abort
              </button>
            </div>
          ) : (
            files.length > 0 && (
              <>
                <button
                  className="btn-primary btn-icon"
                  onClick={handleStageAll}
                  disabled={unstagedFiles.length === 0}
                  style={{ opacity: unstagedFiles.length === 0 ? 0.5 : 1, cursor: unstagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                  data-tooltip="Stage all unstaged changes"
                >
                  <Plus size={16} />
                  <span className="sr-only">Stage all</span>
                </button>
                <button
                  className="btn-secondary btn-icon"
                  onClick={handleUnstageAll}
                  disabled={stagedFiles.length === 0}
                  style={{ opacity: stagedFiles.length === 0 ? 0.5 : 1, cursor: stagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                  data-tooltip="Unstage all staged changes"
                >
                  <Minus size={16} />
                  <span className="sr-only">Unstage all</span>
                </button>
                <button
                  className="btn-stash btn-icon"
                  onClick={handleStashAll}
                  disabled={files.length === 0}
                  style={{ opacity: files.length === 0 ? 0.5 : 1, cursor: files.length === 0 ? 'not-allowed' : 'pointer' }}
                  data-tooltip="Stash all uncommitted changes (staged and unstaged)"
                  data-testid="stash-all-btn"
                >
                  <Package size={16} />
                  <span className="sr-only">Stash all</span>
                </button>

                <div className="commit-section" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {isIdentityRequiredAndMissing && (
                    <span 
                      style={{ color: '#f59e0b', fontSize: '11px', fontWeight: 600, marginRight: '8px' }}
                      data-testid="identity-missing-warning"
                    >
                      Select identity in log sync panel
                    </span>
                  )}
                  <input
                    type="text"
                    className="commit-input"
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => activeRepo && setRepoCommitMessage(activeRepo.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCommit()
                      }
                    }}
                    disabled={isIdentityRequiredAndMissing}
                    style={{
                      opacity: isIdentityRequiredAndMissing ? 0.6 : 1,
                      cursor: isIdentityRequiredAndMissing ? 'not-allowed' : 'text'
                    }}
                    data-testid="commit-message-input"
                  />
                  <button
                    className="btn-primary"
                    onClick={handleCommit}
                    disabled={commitMessage.trim().length <= 2 || isIdentityRequiredAndMissing}
                    style={{ 
                      opacity: (commitMessage.trim().length <= 2 || isIdentityRequiredAndMissing) ? 0.5 : 1, 
                      cursor: (commitMessage.trim().length <= 2 || isIdentityRequiredAndMissing) ? 'not-allowed' : 'pointer' 
                    }}
                    data-testid="commit-btn"
                    data-tooltip={isIdentityRequiredAndMissing ? "Please select a Git identity to enable committing" : undefined}
                  >
                    Commit
                  </button>
                </div>
              </>
            )
          )}
        </div>
      )}

      {isBranchModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsBranchModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} />
                Create New Branch
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsBranchModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-branch-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Create a new local branch starting from the latest commit of <strong>{activeRepo?.branch}</strong>.
              </div>
              <input
                type="text"
                placeholder="Branch name..."
                value={newBranchName}
                onChange={(e) => {
                  setNewBranchName(e.target.value)
                  setErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBranchSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="new-branch-name-input"
              />
              {errorMessage && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="branch-error-message">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsBranchModalOpen(false)}
                data-testid="cancel-branch-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateBranchSubmit}
                disabled={!newBranchName.trim()}
                style={{ opacity: !newBranchName.trim() ? 0.5 : 1, cursor: !newBranchName.trim() ? 'not-allowed' : 'pointer' }}
                data-testid="create-branch-submit-btn"
                data-tooltip="Create branch"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}

      {isTagModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsTagModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={16} />
                Create New Tag
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsTagModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-tag-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Create a new local tag at the latest commit of <strong>{activeRepo?.branch}</strong> (HEAD).
              </div>
              {activeRepo?.commits?.[0] && (
                <div 
                  style={{ 
                    backgroundColor: 'var(--bg-secondary)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '6px', 
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  data-testid="tag-target-commit-info"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>TAGGING COMMIT</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {activeRepo.commits[0].hash.substring(0, 8)}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeRepo.commits[0].message}
                  </div>
                  {activeRepo.commits[0].author_name && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      By {activeRepo.commits[0].author_name} &bull; {new Date(activeRepo.commits[0].date).toLocaleString()}
                    </div>
                  )}
                </div>
              )}
              <input
                type="text"
                placeholder="Tag name (e.g. v1.0.0)..."
                value={newTagName}
                onChange={(e) => {
                  setNewTagName(e.target.value)
                  setTagErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTagSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="new-tag-name-input"
              />
              {tagErrorMessage && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="tag-error-message">
                  {tagErrorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsTagModalOpen(false)}
                data-testid="cancel-tag-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateTagSubmit}
                disabled={!newTagName.trim()}
                style={{ opacity: !newTagName.trim() ? 0.5 : 1, cursor: !newTagName.trim() ? 'not-allowed' : 'pointer' }}
                data-testid="create-tag-submit-btn"
                data-tooltip="Create tag"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {activeRepo && (
        <BranchGraphModal
          isOpen={isGraphModalOpen}
          onClose={() => setIsGraphModalOpen(false)}
          commits={activeRepo.commits || []}
          branches={activeRepo.branches}
          tags={activeRepo.tags}
          currentBranch={activeRepo.branch}
          repoName={activeRepo.name}
        />
      )}

      {activeRepo && (
        <CherryPickModal
          isOpen={isCherryPickModalOpen}
          onClose={() => setIsCherryPickModalOpen(false)}
          repoPath={activeRepo.path}
          branches={activeRepo.branches || null}
          worktrees={activeRepo.worktrees || []}
          currentBranch={activeRepo.branch}
          onCherryPickInitiated={(conflictedFiles) => {
            if (onMergeConflicts) {
              onMergeConflicts(conflictedFiles, false, true)
            }
          }}
          onSuccess={() => {
            refreshRepo(activeRepo.id)
          }}
        />
      )}

      <AppDialog
        isOpen={isNoChangesStagedOpen}
        title="No changes staged"
        message="There are no changes staged to be committed. Please stage some changes first."
        variant="warning"
        onCancel={() => setIsNoChangesStagedOpen(false)}
        testId="no-changes-staged-dialog"
      />
    </div>
  )
}

export default Toolbar
