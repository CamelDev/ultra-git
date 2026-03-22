import React from 'react'
import { GitBranch, Layers, Clock, Tag, ChevronDown } from 'lucide-react'
import { useGitStore } from '../../store/useGitStore'

const Sidebar: React.FC = () => {
  const { branch, status } = useGitStore()

  return (
    <div className="sidebar">
      <div style={{ padding: '15px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>UltraGIT</span>
          <ChevronDown size={14} style={{ marginLeft: '5px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <GitBranch size={12} style={{ marginRight: '5px' }} />
          <span>{branch}</span>
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Local</span>
          <span>{status?.ahead + status?.behind || 0}</span>
        </div>
        <div className="sidebar-item active">
          <GitBranch className="sidebar-item-icon" size={14} />
          <span>{branch}</span>
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
