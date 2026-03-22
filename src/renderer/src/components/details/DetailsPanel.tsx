import React from 'react'
import { FileText } from 'lucide-react'

const DetailsPanel: React.FC = () => {
  return (
    <div className="details-panel">
      <div className="details-header">
        <div className="details-title">Selection Details</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          Select a commit to view changes
        </div>
      </div>
      <div style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>0 files modified</span>
      </div>
      <div className="file-list">
        {/* Mocked for Phase 1 */}
        <div className="file-item">
          <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
          <span>No selection</span>
        </div>
      </div>
    </div>
  )
}

export default DetailsPanel
