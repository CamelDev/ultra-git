import React, { useState } from 'react'
import { GitBranch, X, Tag, Copy, Network } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { CherryPickModal } from './CherryPickModal'
import BranchGraphModal from '../graph/BranchGraphModal'

const normalizePath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

interface ToolbarProps {
  onMergeConflicts?: (conflictedFiles: Array<{ path: string; status: string }>, isRebase: boolean, isCherryPick?: boolean) => void
}

const Toolbar: React.FC<ToolbarProps> = ({ onMergeConflicts }) => {
  const { getActiveRepo, refreshRepo, identities } = useRepoStore()
  const activeRepo = getActiveRepo()
  const [commitMessage, setCommitMessage] = useState('')
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [tagErrorMessage, setTagErrorMessage] = useState('')
  const [isCherryPickModalOpen, setIsCherryPickModalOpen] = useState(false)
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false)

  const files = activeRepo?.status?.files as any[] || []
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  const isIdentityRequiredAndMissing = !!(activeRepo && identities.length > 1 && !activeRepo.identityId)
  const mainWtPath = activeRepo?.worktrees?.[0]?.path;
  const isCurrentRepoWorktree = mainWtPath ? normalizePath(activeRepo.path) !== normalizePath(mainWtPath) : false;

  const handleStageAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.addAll(activeRepo.path)
      if (res.success) {
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
      await window.api.app.showMessageBox({
        type: 'warning',
        title: 'No changes staged',
        message: 'There are no changes staged to be committed. Please stage some changes first.'
      })
      return
    }
    try {
      const res = await window.api.git.commit(activeRepo.path, commitMessage)
      if (res.success) {
        setCommitMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to commit:', res.error)
      }
    } catch (err) {
      console.error('Error committing changes:', err)
    }
  }

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
      const res = await window.api.git.createTag(activeRepo.path, name)
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
            className="btn-stash"
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
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              opacity: isCurrentRepoWorktree ? 0.5 : 1,
              cursor: isCurrentRepoWorktree ? 'not-allowed' : 'pointer'
            }}
          >
            <GitBranch size={14} />
            Branch
          </button>

          <button
            className="btn-stash"
            onClick={() => {
              setIsCherryPickModalOpen(true)
            }}
            data-tooltip="Cherry pick from another branch"
            data-testid="cherry-pick-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Copy size={14} />
            Cherry pick from ...
          </button>

          <button
            className="btn-stash"
            onClick={() => {
              setNewTagName('')
              setTagErrorMessage('')
              setIsTagModalOpen(true)
            }}
            data-tooltip="Create a new tag from latest local commit (HEAD)"
            data-testid="create-tag-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Tag size={14} />
            Tag
          </button>

          <button
            className="btn-stash"
            onClick={() => setIsGraphModalOpen(true)}
            data-tooltip="View visual branch graph"
            data-testid="branch-graph-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Network size={14} />
            Graph
          </button>
        </div>
      )}

      {activeRepo && (
        <div className="toolbar-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {files.length > 0 && (
            <>
              <button
                className="btn-primary"
                onClick={handleStageAll}
                disabled={unstagedFiles.length === 0}
                style={{ opacity: unstagedFiles.length === 0 ? 0.5 : 1, cursor: unstagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                data-tooltip="Stage all unstaged changes"
              >
                Stage all
              </button>
              <button
                className="btn-secondary"
                onClick={handleUnstageAll}
                disabled={stagedFiles.length === 0}
                style={{ opacity: stagedFiles.length === 0 ? 0.5 : 1, cursor: stagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
                data-tooltip="Unstage all staged changes"
              >
                Unstage all
              </button>
              <button
                className="btn-stash"
                onClick={handleStashAll}
                disabled={files.length === 0}
                style={{ opacity: files.length === 0 ? 0.5 : 1, cursor: files.length === 0 ? 'not-allowed' : 'pointer' }}
                data-tooltip="Stash all uncommitted changes (staged and unstaged)"
                data-testid="stash-all-btn"
              >
                Stash all
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
                  onChange={(e) => setCommitMessage(e.target.value)}
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
    </div>
  )
}

export default Toolbar
