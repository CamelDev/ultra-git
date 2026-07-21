import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Settings } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import logoIcon from '../../assets/icon.png'
import { IdentitiesModal } from '../details/IdentitiesModal'
import { AboutModal } from './AboutModal'
import { useTheme } from '../../hooks/useTheme'

const TitleBar: React.FC = () => {
  const { repositories, activeId, setActiveId, removeRepo, addRepo, reorderRepos } = useRepoStore()
  const { theme, setTheme } = useTheme()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [identitiesModalOpen, setIdentitiesModalOpen] = useState(false)
  const [aboutModalOpen, setAboutModalOpen] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const cogRef = useRef<SVGSVGElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    reorderRepos(draggedIndex, index)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const handleAddRepo = async () => {
    console.log('Renderer: Requesting openDirectory dialog');
    const result = await window.api.app.openDirectory()
    if (!result.canceled && result.path) {
      await addRepo(result.path)
    }
  }

  const handleCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    removeRepo(id)
  }

  const handleResetLayout = () => {
    window.dispatchEvent(new Event('reset-layout'))
    setIsSettingsOpen(false)
  }

  const handleToggleSettings = () => {
    if (!isSettingsOpen && cogRef.current) {
      const rect = cogRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 6, left: rect.left })
    }
    setIsSettingsOpen(prev => !prev)
  }

  // Handle outside clicks to close settings dropdown
  useEffect(() => {
    if (!isSettingsOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedCog = cogRef.current?.contains(target)
      const clickedDropdown = dropdownRef.current?.contains(target)
      if (!clickedCog && !clickedDropdown) {
        setIsSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSettingsOpen])

  const isMac = navigator.userAgent.includes('Mac')
  const isWindows = navigator.userAgent.includes('Win')

  return (
    <div 
      className={`title-bar ${isMac ? 'is-mac' : ''}`}
      style={{
        paddingLeft: isMac ? '80px' : '16px',
        paddingRight: isWindows ? '140px' : '16px'
      }}
    >
      <div className="title-bar-brand">
        <img 
          src={logoIcon} 
          alt="UltraGIT" 
          className="brand-logo" 
          onClick={() => setAboutModalOpen(true)}
          style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' }}
          data-testid="brand-logo"
        />
        <span 
          className="brand-name" 
          onClick={() => setAboutModalOpen(true)}
          style={{ cursor: 'pointer', WebkitAppRegion: 'no-drag' }}
          data-testid="brand-name"
        >
          UltraGIT
        </span>
        <div className="settings-container">
          <Settings 
            ref={cogRef}
            className={`settings-icon ${isSettingsOpen ? 'active' : ''}`}
            size={15}
            onClick={handleToggleSettings}
            data-testid="settings-cog-btn"
            data-tooltip="Global Settings"
          />
        </div>
      </div>
      <div className="tabs-container">
        {repositories.map((tab, index) => (
          <div 
            key={tab.id} 
            className={`tab ${activeId === tab.id ? 'active' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
            onClick={() => setActiveId(tab.id)}
            data-testid="repo-tab"
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => e.preventDefault()}
          >
            <span>{tab.name}</span>
            <X 
              className="tab-close" 
              size={12} 
              onClick={(e) => handleCloseTab(e, tab.id)}
              data-testid="close-tab-btn"
              data-tooltip="Close Tab"
              onDragStart={(e) => e.stopPropagation()}
            />
          </div>
        ))}
        <div className="add-tab-btn" onClick={handleAddRepo} data-tooltip="Open Repository" data-testid="add-repo-btn">
          <Plus size={16} />
        </div>
      </div>
      
      {isSettingsOpen && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          className="settings-dropdown"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
        >
          <div className="settings-dropdown-header">Global Settings</div>
          <div className="settings-dropdown-row">
            <span className="settings-dropdown-label">Identities</span>
            <button 
              className="settings-dropdown-btn"
              onClick={() => {
                setIdentitiesModalOpen(true)
                setIsSettingsOpen(false)
              }}
              data-testid="manage-identities-btn"
              data-tooltip="Manage Git identities and profiles"
            >
              Manage Identities
            </button>
          </div>
          <div className="settings-dropdown-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span className="settings-dropdown-label">Interface</span>
              <span 
                className="settings-dropdown-action"
                onClick={handleResetLayout}
                data-testid="reset-layout-btn"
                data-tooltip="Reset application layout to default"
              >
                Reset Layout
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', marginTop: '6px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Color scheme</span>
              <div className="theme-selector-container" style={{ marginTop: 0 }}>
                <button 
                  className={`theme-selector-btn ${theme === 'night' ? 'active' : ''}`}
                  onClick={() => setTheme('night')}
                  data-testid="theme-btn-night"
                  data-tooltip="Force dark mode"
                >
                  Night
                </button>
                <button 
                  className={`theme-selector-btn ${theme === 'day' ? 'active' : ''}`}
                  onClick={() => setTheme('day')}
                  data-testid="theme-btn-day"
                  data-tooltip="Force light mode"
                >
                  Day
                </button>
                <button 
                  className={`theme-selector-btn ${theme === 'auto' ? 'active' : ''}`}
                  onClick={() => setTheme('auto')}
                  data-testid="theme-btn-auto"
                  data-tooltip="Match system color scheme"
                >
                  Auto
                </button>
              </div>
            </div>
          </div>
          <div className="settings-dropdown-row">
            <span className="settings-dropdown-label">About</span>
            <button 
              className="settings-dropdown-btn"
              onClick={() => {
                setAboutModalOpen(true)
                setIsSettingsOpen(false)
              }}
              data-testid="about-btn"
              data-tooltip="View application details"
            >
              About UltraGIT
            </button>
          </div>
        </div>,
        document.body
      )}

      <IdentitiesModal 
        isOpen={identitiesModalOpen}
        onClose={() => setIdentitiesModalOpen(false)}
      />
      <AboutModal 
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
      />
    </div>
  )
}

export default TitleBar

