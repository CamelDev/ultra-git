import React, { useEffect, useRef, useState } from 'react'
import { Globe, ArrowDown, ArrowUp, AlertTriangle, ChevronDown } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'

const GraphView: React.FC = () => {
  const { getActiveRepo, selectedCommitHash, setSelectedCommitHash, refreshRepo, identities, setRepoIdentity } = useRepoStore()
  const activeRepo = getActiveRepo()
  const commits = activeRepo?.commits || []
  const containerRef = useRef<HTMLDivElement>(null)

  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [showPushDropdown, setShowPushDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPushDropdown(false)
      }
    }
    if (showPushDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPushDropdown])

  // Global keydown event listener for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is focusing an input, textarea or contenteditable element
      const activeEl = document.activeElement
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
        return
      }

      if (commits.length === 0) return

      // Find current selected index
      const currentIndex = commits.findIndex((c) => c.hash === selectedCommitHash)
      let nextIndex = currentIndex

      if (e.key === 'ArrowUp') {
        if (currentIndex === -1) {
          nextIndex = 0
        } else {
          nextIndex = Math.max(0, currentIndex - 1)
        }
      } else if (e.key === 'ArrowDown') {
        if (currentIndex === -1) {
          nextIndex = 0
        } else {
          nextIndex = Math.min(commits.length - 1, currentIndex + 1)
        }
      }

      if (nextIndex !== -1 && nextIndex !== currentIndex) {
        e.preventDefault()
        setSelectedCommitHash(commits[nextIndex].hash)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [commits, selectedCommitHash, setSelectedCommitHash])

  // Scroll active commit into view
  useEffect(() => {
    if (selectedCommitHash && containerRef.current) {
      const activeEl = containerRef.current.querySelector('.commit-item.active') as HTMLElement
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedCommitHash, commits])

  const handlePull = async () => {
    if (!activeRepo || isPulling || isPushing) return
    setIsPulling(true)
    try {
      const res = await window.api.git.pull(activeRepo.path)
      await refreshRepo(activeRepo.id)
      if (res.success) {
        if (res.data?.hadConflicts) {
          await window.api.app.showMessageBox({
            type: 'warning',
            title: 'Merge Conflicts Detected',
            message: 'Pull succeeded but resulted in merge conflicts. Conflicting files are listed under active changes with conflict markers. Please resolve them and commit.'
          })
        }
      } else {
        await window.api.app.showMessageBox({
          type: 'error',
          title: 'Pull Failed',
          message: res.error || 'Failed to pull from remote repository.'
        })
      }
    } catch (err: any) {
      await window.api.app.showMessageBox({
        type: 'error',
        title: 'Error',
        message: err.message || 'An unexpected error occurred during pull.'
      })
    } finally {
      setIsPulling(false)
    }
  }

  const handlePush = async (force?: boolean) => {
    if (!activeRepo || isPulling || isPushing) return

    // 1. Beforehand check
    if (!force && activeRepo.status?.behind > 0) {
      const dialogRes = await window.api.app.showMessageBox({
        type: 'warning',
        title: 'Remote Changes Detected',
        message: `Your local branch is behind its remote counterpart by ${activeRepo.status.behind} commit(s). A standard push will be rejected.\n\nWould you like to Pull first or Force Push (overwriting remote changes)?`,
        buttons: ['Cancel', 'Pull', 'Force Push']
      })
      if (dialogRes.success) {
        if (dialogRes.response === 1) {
          // Pull selected
          await handlePull()
          return
        } else if (dialogRes.response === 2) {
          // Force Push selected
          await handlePush(true)
          return
        }
      }
      return // Cancel or unknown response
    }

    setIsPushing(true)
    try {
      const res = await window.api.git.push(activeRepo.path, force)
      await refreshRepo(activeRepo.id)
      if (res.success) {
        // Success
      } else {
        const errorMsg = res.error || ''
        const isRejected = errorMsg.includes('[rejected]') || errorMsg.includes('non-fast-forward') || errorMsg.includes('behind its remote counterpart')
        
        if (isRejected && !force) {
          const dialogRes = await window.api.app.showMessageBox({
            type: 'warning',
            title: 'Push Rejected',
            message: 'The push was rejected because the remote branch contains changes that you do not have locally.\n\nWould you like to Force Push (overwriting remote changes)?',
            buttons: ['Cancel', 'Force Push']
          })
          if (dialogRes.success && dialogRes.response === 1) {
            setIsPushing(false)
            await handlePush(true)
            return
          }
        }

        await window.api.app.showMessageBox({
          type: 'error',
          title: force ? 'Force Push Failed' : 'Push Failed',
          message: res.error || 'Failed to push to remote repository.'
        })
      }
    } catch (err: any) {
      await window.api.app.showMessageBox({
        type: 'error',
        title: 'Error',
        message: err.message || 'An unexpected error occurred during push.'
      })
    } finally {
      setIsPushing(false)
    }
  }

  return (
    <div className="git-log-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {activeRepo && (
        <div 
          className="sync-actions-panel" 
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            gap: '12px',
            flexShrink: 0
          }}
          data-testid="sync-actions-panel"
        >
          <button
            className="btn-secondary"
            onClick={handlePull}
            disabled={isPulling || isPushing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: (isPulling || isPushing) ? 0.6 : 1,
              cursor: (isPulling || isPushing) ? 'not-allowed' : 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600
            }}
            data-testid="pull-btn"
          >
            <ArrowDown size={14} className={isPulling ? 'spin-animation' : ''} />
            <span>{isPulling ? 'Pulling...' : 'Pull'}</span>
            {activeRepo.status?.behind > 0 && (
              <span 
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.2)',
                  color: '#fbbf24',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 700
                }}
                data-testid="pull-behind-count"
              >
                {activeRepo.status.behind}
              </span>
            )}
          </button>

          <div ref={dropdownRef} style={{ display: 'inline-flex', position: 'relative', alignItems: 'stretch' }}>
            <button
              className="btn-secondary"
              onClick={() => handlePush(false)}
              disabled={isPulling || isPushing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: (isPulling || isPushing) ? 0.6 : 1,
                cursor: (isPulling || isPushing) ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: 'none'
              }}
              data-testid="push-btn"
            >
              <ArrowUp size={14} className={isPushing ? 'spin-animation' : ''} />
              <span>{isPushing ? 'Pushing...' : 'Push'}</span>
              {activeRepo.status?.ahead > 0 && (
                <span 
                  style={{
                    backgroundColor: 'rgba(52, 211, 153, 0.2)',
                    color: '#34d399',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 700
                  }}
                  data-testid="push-ahead-count"
                >
                  {activeRepo.status.ahead}
                </span>
              )}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowPushDropdown(!showPushDropdown)}
              disabled={isPulling || isPushing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 6px',
                opacity: (isPulling || isPushing) ? 0.6 : 1,
                cursor: (isPulling || isPushing) ? 'not-allowed' : 'pointer',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: '1px solid var(--border)'
              }}
              data-testid="push-dropdown-btn"
            >
              <ChevronDown size={14} />
            </button>
            {showPushDropdown && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  zIndex: 100,
                  minWidth: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
                data-testid="push-dropdown-menu"
              >
                <button
                  onClick={() => {
                    setShowPushDropdown(false)
                    handlePush(false)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%'
                  }}
                  className="dropdown-item-hover"
                  data-testid="push-option"
                >
                  Push
                </button>
                <button
                  onClick={() => {
                    setShowPushDropdown(false)
                    handlePush(true)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%'
                  }}
                  className="dropdown-item-hover"
                  data-testid="force-push-option"
                >
                  Force Push
                </button>
              </div>
            )}
          </div>

          {/* Identity Selector */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Identity:</span>
            <select
              value={activeRepo.identityId || ''}
              onChange={(e) => setRepoIdentity(activeRepo.id, e.target.value || undefined)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: !activeRepo.identityId && identities.length > 1 ? '1px solid #f59e0b' : '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              data-testid="repo-identity-select"
            >
              <option value="">None (system default)</option>
              {identities.map(id => (
                <option key={id.id} value={id.id}>{id.label} ({id.name})</option>
              ))}
            </select>
            {!activeRepo.identityId && identities.length > 1 && (
              <span 
                style={{ 
                  color: '#f59e0b', 
                  fontSize: '10px', 
                  fontWeight: 700 
                }}
                data-testid="identity-warning-badge"
              >
                Required *
              </span>
            )}
          </div>
        </div>
      )}

      {activeRepo?.status?.conflicted?.length > 0 && (
        <div 
          className="pull-conflict-banner" 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            fontSize: '12px',
            color: '#f87171',
            fontWeight: 500,
            flexShrink: 0
          }}
          data-testid="pull-conflict-banner"
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>Merge conflicts detected in {activeRepo.status.conflicted.length} file(s). Please resolve conflict markers manually, stage, and commit.</span>
        </div>
      )}

      <div 
        ref={containerRef} 
        className="graph-container" 
        tabIndex={0}
        style={{ outline: 'none', flex: 1, overflowY: 'auto' }}
      >
        <div className="commit-list">
          {commits.map((c) => (
            <div 
              key={c.hash} 
              className={`commit-item ${selectedCommitHash === c.hash ? 'active' : ''}`}
              onClick={() => setSelectedCommitHash(c.hash)}
              style={{ cursor: 'pointer' }}
            >
              <div className="commit-graph-area" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                {c.syncStatus === 'remote-only' ? (
                  <Globe 
                    className="commit-globe-icon" 
                    size={14} 
                    style={{ color: 'var(--text-secondary)' }}
                    data-testid="commit-globe-icon"
                  />
                ) : c.syncStatus === 'local-only' ? (
                  <div 
                    data-testid="commit-local-only-circle"
                    style={{ 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      border: '2px solid var(--text-secondary)', 
                      backgroundColor: 'transparent',
                      boxSizing: 'border-box'
                    }} 
                  />
                ) : (
                  <div 
                    data-testid="commit-pushed-circle"
                    style={{ 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      backgroundColor: 'var(--accent)'
                    }} 
                  />
                )}
              </div>
              <div className="commit-message" title={c.message}>{c.message}</div>
              <div className="commit-author">{c.author_name}</div>
              <div className="commit-date">
                {new Date(c.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
          ))}
          {commits.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No commits found or loading...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GraphView

