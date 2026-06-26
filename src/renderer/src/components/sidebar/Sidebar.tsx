import React, { useState } from 'react'
import { GitBranch, Layers, Package, AlertTriangle, User } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { IdentitiesModal } from '../details/IdentitiesModal'

const Sidebar: React.FC = () => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()

  const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null)
  const [conflictWarning, setConflictWarning] = useState(false)
  const [poppingIndex, setPoppingIndex] = useState<number | null>(null)
  const [identitiesModalOpen, setIdentitiesModalOpen] = useState(false)

  const branch = activeRepo?.branch || 'main'
  const status = activeRepo?.status
  const stashes = activeRepo?.stashes ?? []

  const handlePopStash = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (!activeRepo) return
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

  return (
    <div className="sidebar" data-testid="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Local</span>
          <span>{status?.ahead + status?.behind || 0}</span>
        </div>
        <div className="sidebar-item active" style={{ display: 'flex', alignItems: 'center' }}>
          <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
          <span data-testid="sidebar-active-branch" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{branch}</span>
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
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Remote</span>
          <span>1</span>
        </div>
        <div className="sidebar-item">
          <Layers className="sidebar-item-icon" size={14} />
          <span>origin/{branch}</span>
        </div>
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
                  <button
                    className="stash-pop-btn"
                    onClick={(e) => handlePopStash(e, stash.index)}
                    disabled={isPopping}
                    title="Pop this stash back to working directory"
                    data-testid={`stash-pop-btn-${stash.index}`}
                  >
                    {isPopping ? '…' : 'Pop'}
                  </button>
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

      <div className="sidebar-section" style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '12px', paddingBottom: '12px' }}>
        <button
          className="btn-secondary"
          onClick={() => setIdentitiesModalOpen(true)}
          style={{ 
            width: 'calc(100% - 32px)', 
            margin: '0 16px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '8px' 
          }}
          data-testid="manage-identities-btn"
        >
          <User size={14} />
          <span>Manage Identities</span>
        </button>
      </div>

      <IdentitiesModal 
        isOpen={identitiesModalOpen}
        onClose={() => setIdentitiesModalOpen(false)}
      />
    </div>
  )
}

export default Sidebar
