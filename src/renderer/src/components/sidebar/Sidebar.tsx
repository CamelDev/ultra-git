import React from 'react'
import { GitBranch, Layers } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'

const Sidebar: React.FC = () => {
  const { getActiveRepo } = useRepoStore()
  const activeRepo = getActiveRepo()
  
  const branch = activeRepo?.branch || 'main'
  const status = activeRepo?.status

  return (
    <div className="sidebar" data-testid="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Local</span>
          <span>{status?.ahead + status?.behind || 0}</span>
        </div>
        <div className="sidebar-item active">
          <GitBranch className="sidebar-item-icon" size={14} />
          <span data-testid="sidebar-active-branch">{branch}</span>
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
          <span>0</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Tags</span>
          <span>0</span>
        </div>
      </div>
    </div>
  )
}

export default Sidebar
