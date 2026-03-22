import React from 'react'
import { 
  RotateCcw, 
  RotateCw, 
  Download, 
  Upload, 
  GitBranch, 
  Plus, 
  Terminal as TerminalIcon 
} from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'

const Toolbar: React.FC = () => {
  const { activeId, refreshRepo } = useRepoStore()

  const handleFetch = () => {
    if (activeId) {
      refreshRepo(activeId)
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-button">
        <RotateCcw className="toolbar-icon" />
        <span>Undo</span>
      </div>
      <div className="toolbar-button">
        <RotateCw className="toolbar-icon" />
        <span>Redo</span>
      </div>
      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }} />
      <div className="toolbar-button" onClick={handleFetch}>
        <Download className="toolbar-icon" />
        <span>Fetch</span>
      </div>
      <div className="toolbar-button">
        <Upload className="toolbar-icon" />
        <span>Push</span>
      </div>
      <div className="toolbar-button">
        <GitBranch className="toolbar-icon" />
        <span>Branch</span>
      </div>
      <div className="toolbar-button">
        <Plus className="toolbar-icon" />
        <span>Stash</span>
      </div>
      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }} />
      <div className="toolbar-button">
        <TerminalIcon className="toolbar-icon" />
        <span>Terminal</span>
      </div>
    </div>
  )
}

export default Toolbar
