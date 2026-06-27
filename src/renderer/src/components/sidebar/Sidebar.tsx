import React, { useState } from 'react'
import { GitBranch, Layers, Package, AlertTriangle, Trash2, List, X } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { DiffModal } from '../details/DiffModal'

const Sidebar: React.FC = () => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()

  const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null)
  const [conflictWarning, setConflictWarning] = useState(false)
  const [poppingIndex, setPoppingIndex] = useState<number | null>(null)
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null)
  
  const [isStashDetailsOpen, setIsStashDetailsOpen] = useState(false)
  const [detailsStashIndex, setDetailsStashIndex] = useState<number | null>(null)
  const [detailsStashMessage, setDetailsStashMessage] = useState<string | null>(null)

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const branch = activeRepo?.branch || 'main'
  const status = activeRepo?.status
  const stashes = activeRepo?.stashes ?? []

  const handlePopStash = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'question',
      title: 'Pop Stash',
      message: 'Are you sure you want to pop this stash back into your working directory?',
      buttons: ['Cancel', 'Pop'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    setPoppingIndex(index)
    setConflictWarning(false)
    try {
      const res = await window.api.git.stashPop(activeRepo.path, index)
      if (res.success) {
        if (res.data?.hadConflicts) {
          setConflictWarning(true)
        }
        setSelectedStashIndex(null)
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to pop stash:', res.error)
      }
    } catch (err) {
      console.error('Error popping stash:', err)
    } finally {
      setPoppingIndex(null)
    }
  }

  const handleDeleteStash = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'warning',
      title: 'Delete Stash',
      message: 'Are you sure you want to delete this stash? This action cannot be undone.',
      buttons: ['Cancel', 'Delete'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    setDeletingIndex(index)
    try {
      const res = await window.api.git.stashDrop(activeRepo.path, index)
      if (res.success) {
        setSelectedStashIndex(null)
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to delete stash:', res.error)
      }
    } catch (err) {
      console.error('Error deleting stash:', err)
    } finally {
      setDeletingIndex(null)
    }
  }

  const handleShowStashDetails = (e: React.MouseEvent, index: number, message: string) => {
    e.stopPropagation()
    setDetailsStashIndex(index)
    setDetailsStashMessage(message)
    setIsStashDetailsOpen(true)
  }

  const formatStashDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
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

  const handleCheckoutBranch = async (branchName: string) => {
    if (!activeRepo || branchName === branch) return
    try {
      const res = await window.api.git.checkout(activeRepo.path, branchName)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to checkout branch:', res.error)
      }
    } catch (err) {
      console.error('Error checking out branch:', err)
    }
  }

  const localBranches = activeRepo?.branches?.local ?? [branch]
  const remoteBranches = activeRepo?.branches?.remote ?? []

  return (
    <div className="sidebar" data-testid="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Local</span>
          <span>{localBranches.length}</span>
        </div>
        {localBranches.map((b) => {
          const isActive = b === branch;
          if (isActive) {
            return (
              <div className="sidebar-item active" style={{ display: 'flex', alignItems: 'center' }} key={b}>
                <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
                <span data-testid="sidebar-active-branch" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
                {(status?.ahead > 0 || status?.behind > 0) && (
                  <span 
                    className="branch-sync-badge" 
                    style={{ 
                      marginLeft: 'auto', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      userSelect: 'none'
                    }}
                    data-testid="branch-sync-badge"
                  >
                    {status.ahead > 0 && (
                      <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-ahead">
                        ↑<span>{status.ahead}</span>
                      </span>
                    )}
                    {status.behind > 0 && (
                      <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-behind">
                        ↓<span>{status.behind}</span>
                      </span>
                    )}
                  </span>
                )}
                <button
                  className="stash-action-btn"
                  style={{ 
                    marginLeft: (status?.ahead > 0 || status?.behind > 0) ? '8px' : 'auto',
                    flexShrink: 0,
                    padding: 0,
                    height: '24px',
                    width: '24px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setNewBranchName('')
                    setErrorMessage('')
                    setIsBranchModalOpen(true)
                  }}
                  title="Create a new branch from latest local commit (HEAD)"
                  data-testid="sidebar-create-branch-btn"
                >
                  <GitBranch size={14} />
                </button>
              </div>
            );
          } else {
            return (
              <div 
                className="sidebar-item" 
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} 
                key={b}
                onClick={() => handleCheckoutBranch(b)}
                data-testid={`sidebar-branch-${b}`}
              >
                <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b}</span>
              </div>
            );
          }
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Remote</span>
          <span>{remoteBranches.length}</span>
        </div>
        {remoteBranches.length === 0 ? (
          <div style={{ padding: '8px 20px', fontSize: '12px', color: 'var(--text-secondary)' }}>No remote branches</div>
        ) : (
          remoteBranches.map((rb) => (
            <div key={rb} className="sidebar-item" style={{ display: 'flex', alignItems: 'center' }}>
              <Layers className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rb}</span>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Stashes</span>
          <span>{stashes.length}</span>
        </div>

        {conflictWarning && (
          <div className="stash-conflict-banner">
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Conflicts detected — resolve the conflict markers (&lt;&lt;&lt;&lt;&lt;&lt;&lt;) in your files manually, then mark as resolved.</span>
          </div>
        )}

        {stashes.length === 0 ? (
          <div className="stash-empty">No stashes</div>
        ) : (
          stashes.map((stash) => {
            const isSelected = selectedStashIndex === stash.index
            const isPopping = poppingIndex === stash.index
            return (
              <div
                key={stash.ref}
                className={`sidebar-item stash-item${isSelected ? ' stash-selected' : ''}`}
                onClick={() => setSelectedStashIndex(isSelected ? null : stash.index)}
                data-testid={`stash-item-${stash.index}`}
              >
                <Package
                  className="sidebar-item-icon"
                  size={14}
                  style={{ color: isSelected ? 'var(--accent-light)' : 'var(--text-secondary)', flexShrink: 0 }}
                />
                <div className="stash-item-info">
                  <div className="stash-item-message" title={stash.message}>
                    {stash.message}
                  </div>
                  <div className="stash-item-date">{formatStashDate(stash.date)}</div>
                </div>
                {isSelected && (
                  <div className="stash-actions">
                    <button
                      className="stash-action-btn pop"
                      onClick={(e) => handlePopStash(e, stash.index)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="Pop this stash back to working directory"
                      data-testid={`stash-pop-btn-${stash.index}`}
                    >
                      {isPopping ? '…' : 'Pop'}
                    </button>
                    <button
                      className="stash-action-btn details"
                      onClick={(e) => handleShowStashDetails(e, stash.index, stash.message)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="View stash files and diff details"
                      data-testid={`stash-details-btn-${stash.index}`}
                    >
                      <List size={13} />
                    </button>
                    <button
                      className="stash-action-btn delete"
                      onClick={(e) => handleDeleteStash(e, stash.index)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="Delete this stash"
                      data-testid={`stash-delete-btn-${stash.index}`}
                    >
                      {deletingIndex === stash.index ? '…' : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Tags</span>
          <span>0</span>
        </div>
      </div>


      {isStashDetailsOpen && activeRepo && detailsStashIndex !== null && (
        <DiffModal
          isOpen={isStashDetailsOpen}
          onClose={() => {
            setIsStashDetailsOpen(false)
            setDetailsStashIndex(null)
            setDetailsStashMessage(null)
          }}
          filePath=""
          status=""
          repoPath={activeRepo.path}
          isStash={true}
          stashIndex={detailsStashIndex}
          stashMessage={detailsStashMessage}
        />
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
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Create a new local branch starting from the latest commit of <strong>{branch}</strong>.
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
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateBranchSubmit}
                disabled={!newBranchName.trim()}
                style={{ opacity: !newBranchName.trim() ? 0.5 : 1, cursor: !newBranchName.trim() ? 'not-allowed' : 'pointer' }}
                data-testid="create-branch-submit-btn"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
