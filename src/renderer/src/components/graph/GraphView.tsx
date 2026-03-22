import React from 'react'
import { useRepoStore } from '../../store/useRepoStore'

const GraphView: React.FC = () => {
  const { getActiveRepo } = useRepoStore()
  const activeRepo = getActiveRepo()
  const commits = activeRepo?.commits || []

  return (
    <div className="graph-container">
      <div className="commit-list">
        {commits.map((c) => (
          <div key={c.hash} className="commit-item">
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
            <div className="commit-date">{new Date(c.date).toLocaleDateString()}</div>
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
