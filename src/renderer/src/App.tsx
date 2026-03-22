import { useState } from 'react'
import { 
  GitBranch, 
  GitCommit, 
  Layers, 
  Tag, 
  Download, 
  Upload, 
  Plus, 
  RotateCcw, 
  RotateCw, 
  Terminal as TerminalIcon,
  X,
  ChevronDown,
  Folder,
  FileText,
  Clock
} from 'lucide-react'

function App() {
  const [activeTab, setActiveTab] = useState(0)
  
  const tabs = [
    { id: 0, name: 'ultra-rpc', branch: 'main' },
    { id: 1, name: 'ClientEdgeHub', branch: 'feat/auth' },
    { id: 2, name: 'RouterRideNET', branch: 'main' }
  ]

  return (
    <>
      {/* Custom Title Bar / Tabs */}
      <div className="title-bar">
        <div className="tabs-container">
          {tabs.map((tab, index) => (
            <div 
              key={tab.id} 
              className={`tab ${activeTab === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              <span>{tab.name}</span>
              <X className="tab-close" size={12} />
            </div>
          ))}
          <div className="tab">
            <Plus size={14} />
          </div>
        </div>
      </div>

      <div className="app-container">
        {/* Left Sidebar */}
        <div className="sidebar">
          <div style={{ padding: '15px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>{tabs[activeTab].name}</span>
              <ChevronDown size={14} style={{ marginLeft: '5px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
              <GitBranch size={12} style={{ marginRight: '5px' }} />
              <span>{tabs[activeTab].branch}</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>Local</span>
              <span>3</span>
            </div>
            <div className="sidebar-item active">
              <GitBranch className="sidebar-item-icon" size={14} />
              <span>main</span>
            </div>
            <div className="sidebar-item">
              <GitBranch className="sidebar-item-icon" size={14} />
              <span>develop</span>
            </div>
            <div className="sidebar-item">
              <GitBranch className="sidebar-item-icon" size={14} />
              <span>feat/ui-v2</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>Remote</span>
              <span>1</span>
            </div>
            <div className="sidebar-item">
              <Layers className="sidebar-item-icon" size={14} />
              <span>origin/main</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>Stashes</span>
              <span>1</span>
            </div>
            <div className="sidebar-item">
              <Clock className="sidebar-item-icon" size={14} />
              <span>WIP on main: 3a2c4e</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>Tags</span>
              <span>2</span>
            </div>
            <div className="sidebar-item">
              <Tag className="sidebar-item-icon" size={14} />
              <span>v1.0.0</span>
            </div>
          </div>
        </div>

        {/* Main Area */}
        <div className="main-content">
          {/* Toolbar */}
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
            <div className="toolbar-button">
              <Download className="toolbar-icon" />
              <span>Pull</span>
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

          {/* Graph View (Mock) */}
          <div className="graph-container">
            <div className="commit-list">
              {[
                { id: '1', msg: 'Merge branch \'feat/auth\' into main', author: 'Kamil', date: '2 hours ago' },
                { id: '2', msg: 'Fix: handle multiple repo tabs properly', author: 'Kamil', date: '5 hours ago' },
                { id: '3', msg: 'Initial UI shell for UltraGIT', author: 'Kamil', date: '7 hours ago' },
                { id: '4', msg: 'Docs update', author: 'Kamil', date: 'yesterday' },
                { id: '5', msg: 'Add support for Bun package manager', author: 'Kamil', date: '2 days ago' },
              ].map((c) => (
                <div key={c.id} className="commit-item">
                  <div className="commit-graph-area">
                    {/* Simulated Graph Node */}
                    <div style={{ 
                      width: '10px', 
                      height: '10px', 
                      borderRadius: '50%', 
                      backgroundColor: 'var(--accent)',
                      margin: '12px auto'
                    }} />
                  </div>
                  <div className="commit-message">{c.msg}</div>
                  <div className="commit-author">{c.author}</div>
                  <div className="commit-date">{c.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="details-panel">
          <div className="details-header">
            <div className="details-title">Commit: 3190cd</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              authored by Kamil Dabrowski
            </div>
          </div>
          <div style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>2 modified</span>
            <div style={{ display: 'flex', gap: '5px' }}>
              <div style={{ fontSize: '11px', padding: '2px 6px', backgroundColor: 'var(--hover)', borderRadius: '3px' }}>Path</div>
              <div style={{ fontSize: '11px', padding: '2px 6px', opacity: 0.5 }}>Tree</div>
            </div>
          </div>
          <div className="file-list">
            <div className="file-item">
              <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <span>AUTOMATION_STRATEGY.md</span>
              <span className="file-status status-m">M</span>
            </div>
            <div className="file-item">
              <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)' }} />
              <span>README.md</span>
              <span className="file-status status-m">M</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
