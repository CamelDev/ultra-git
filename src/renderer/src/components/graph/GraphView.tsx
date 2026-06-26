import React, { useEffect, useRef } from 'react'
import { useRepoStore } from '../../store/useRepoStore'

const GraphView: React.FC = () => {
  const { getActiveRepo, selectedCommitHash, setSelectedCommitHash } = useRepoStore()
  const activeRepo = getActiveRepo()
  const commits = activeRepo?.commits || []
  const containerRef = useRef<HTMLDivElement>(null)

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

  return (
    <div 
      ref={containerRef} 
      className="graph-container" 
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      <div className="commit-list">
        {commits.map((c) => (
          <div 
            key={c.hash} 
            className={`commit-item ${selectedCommitHash === c.hash ? 'active' : ''}`}
            onClick={() => setSelectedCommitHash(c.hash)}
            style={{ cursor: 'pointer' }}
          >
            <div className="commit-graph-area">
              <div style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                backgroundColor: 'var(--accent)',
                margin: '12px auto'
              }} />
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
  )
}

export default GraphView
