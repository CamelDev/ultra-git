import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Settings, Palette, Pencil, RotateCcw, FolderOpen, Trash2, RefreshCw } from 'lucide-react'
import { useRepoStore, Repository } from '../../store/useRepoStore'
import logoIcon from '../../assets/icon.png'
import { IdentitiesModal } from '../details/IdentitiesModal'
import { AboutModal } from './AboutModal'
import { UpdateBanner } from './UpdateBanner'
import { AppDialog } from '../dialogs/AppDialog'
import { useTheme } from '../../hooks/useTheme'
import { useToaster } from '../toaster/ToasterContext'
import pkg from '../../../../../package.json'

const PRESET_COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
]

const TitleBar: React.FC = () => {
  const {
    repositories,
    activeId,
    setActiveId,
    removeRepo,
    addRepo,
    reorderRepos,
    setRepoCustomName,
    setRepoTabColor,
    setRepoAutoFetch,
    recentRepos,
    removeRecentRepo
  } = useRepoStore()
  const { theme, setTheme } = useTheme()
  const { addToast } = useToaster()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [identitiesModalOpen, setIdentitiesModalOpen] = useState(false)
  const [aboutModalOpen, setAboutModalOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updatesEnabled, setUpdatesEnabled] = useState(true)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  
  // Recent repos dropdown state
  const [isAddRepoDropdownOpen, setIsAddRepoDropdownOpen] = useState(false)
  const [addRepoDropdownPos, setAddRepoDropdownPos] = useState<{ top: number; left: number } | null>(null)

  // Customization states
  const [tabSettingsTabId, setTabSettingsTabId] = useState<string | null>(null)
  const [tabSettingsPos, setTabSettingsPos] = useState<{ top: number; left: number } | null>(null)
  const [editingName, setEditingName] = useState<string>('')
  const [missingRepoPath, setMissingRepoPath] = useState<string | null>(null)
  
  const cogRef = useRef<SVGSVGElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const tabSettingsRef = useRef<HTMLDivElement>(null)
  const addRepoBtnRef = useRef<HTMLDivElement>(null)
  const addRepoDropdownRef = useRef<HTMLDivElement>(null)

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

  // ===== Update notifications =====
  useEffect(() => {
    if (!window.api?.updates?.onUpdateAvailable) return
    return window.api.updates.onUpdateAvailable((info) => setUpdateInfo(info))
  }, [])

  useEffect(() => {
    window.api?.updates?.getSettings().then(res => {
      if (res.success && res.data) setUpdatesEnabled(res.data.enabled)
    }).catch(() => { /* preload not ready */ })
  }, [])

  const handleUpdateDownload = (url: string) => {
    window.open(url, '_blank')
    setUpdateInfo(null)
  }

  const handleUpdateSkip = async (version: string) => {
    await window.api.updates.skipVersion(version).catch(() => null)
    setUpdateInfo(null)
  }

  const handleUpdateDismiss = () => {
    setUpdateInfo(null)
  }

  const handleToggleUpdatesEnabled = async () => {
    const newValue = !updatesEnabled
    setUpdatesEnabled(newValue)
    await window.api.updates.setEnabled(newValue).catch(() => null)
  }

  const handleManualUpdateCheck = async () => {
    if (!window.api?.updates) return
    const res = await window.api.updates.check()
    if (res.success && res.update) {
      // Show the banner only — no redundant toast alongside it.
      setUpdateInfo(res.update)
    } else if (res.success) {
      addToast({ variant: 'success', title: `You're up to date (${res.current})` })
    } else {
      addToast({ variant: 'error', title: res.error || 'Update check failed' })
    }
  }

  const handleToggleSettings = () => {
    if (!isSettingsOpen && cogRef.current) {
      const rect = cogRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 6, left: rect.left })
    }
    setIsSettingsOpen(prev => !prev)
  }

  const handleToggleTabSettings = (e: React.MouseEvent, tab: Repository) => {
    e.stopPropagation()
    if (tabSettingsTabId === tab.id) {
      setTabSettingsTabId(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setTabSettingsPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 220) })
    setEditingName(tab.customName || tab.name)
    setTabSettingsTabId(tab.id)
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

  const handleToggleAddRepoDropdown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isAddRepoDropdownOpen && addRepoBtnRef.current) {
      const rect = addRepoBtnRef.current.getBoundingClientRect()
      setAddRepoDropdownPos({ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 300) })
    }
    setIsAddRepoDropdownOpen(prev => !prev)
  }

  const handleOpenFolderDialog = async () => {
    try {
      console.log('TitleBar: Calling window.api.app.openDirectory()')
      const res = await window.api.app.openDirectory()
      console.log('TitleBar: OpenDirectory response:', res)
      if (!res.canceled && res.path) {
        setIsAddRepoDropdownOpen(false)
        await addRepo(res.path)
      }
    } catch (e) {
      console.error('TitleBar: Failed to open repository directory:', e)
    }
  }

  const handleOpenRepoFromDropdown = async () => {
    setIsAddRepoDropdownOpen(false)
    await handleOpenFolderDialog()
  }

  const handleSelectRecentRepo = async (repoPath: string) => {
    try {
      const check = await window.api.app.exists(repoPath)
      if (check.exists) {
        setIsAddRepoDropdownOpen(false)
        await addRepo(repoPath)
      } else {
        setMissingRepoPath(repoPath)
        removeRecentRepo(repoPath)
      }
    } catch (e) {
      console.error('Error opening recent repository:', e)
    }
  }

  const handleRemoveRecentRepo = (e: React.MouseEvent, repoPath: string) => {
    e.stopPropagation()
    removeRecentRepo(repoPath)
  }

  // Handle outside clicks to close add repo dropdown
  useEffect(() => {
    if (!isAddRepoDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      const clickedBtn = addRepoBtnRef.current?.contains(target)
      const clickedDropdown = addRepoDropdownRef.current?.contains(target)
      if (!clickedBtn && !clickedDropdown) {
        setIsAddRepoDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isAddRepoDropdownOpen])

  // Handle outside clicks to close tab settings popover
  useEffect(() => {
    if (!tabSettingsTabId) return
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (tabSettingsRef.current && !tabSettingsRef.current.contains(target)) {
        setTabSettingsTabId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [tabSettingsTabId])

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
        {repositories.map((tab, index) => {
          const displayName = tab.customName || tab.name
          const isRepoBusy = !!(tab.isPushing || tab.isPulling || tab.isFetching)
          const busyTooltip = tab.isPushing
            ? 'Pushing...'
            : tab.isPulling
              ? 'Pulling...'
              : tab.isFetching
                ? 'Fetching...'
                : undefined

          return (
            <div 
              key={tab.id} 
              className={`tab ${activeId === tab.id ? 'active' : ''} ${draggedIndex === index ? 'dragging' : ''}`}
              style={tab.customColor ? ({ '--tab-custom-color': tab.customColor } as React.CSSProperties) : undefined}
              onClick={() => setActiveId(tab.id)}
              data-testid="repo-tab"
              draggable={true}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => e.preventDefault()}
            >
              {isRepoBusy ? (
                <RefreshCw 
                  size={12} 
                  className="spin-animation tab-busy-spinner" 
                  style={{ color: 'var(--accent)', flexShrink: 0 }}
                  data-testid="tab-busy-spinner"
                  data-tooltip={busyTooltip}
                />
              ) : tab.customColor ? (
                <span 
                  className="tab-color-dot" 
                  style={{ backgroundColor: tab.customColor }}
                  data-testid="tab-color-dot"
                />
              ) : null}
              <span className="tab-title" onDoubleClick={(e) => handleToggleTabSettings(e, tab)}>
                {displayName}
              </span>
              <div className="tab-actions">
                <Settings 
                  className="tab-action-btn" 
                  size={12} 
                  onClick={(e) => handleToggleTabSettings(e, tab)}
                  data-testid="set-tab-settings-btn"
                  data-tooltip="Tab Settings"
                  onDragStart={(e) => e.stopPropagation()}
                />
                <X 
                  className="tab-close" 
                  size={12} 
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  data-testid="close-tab-btn"
                  data-tooltip="Close Tab"
                  onDragStart={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )
        })}
        <div 
          ref={addRepoBtnRef}
          className={`add-tab-btn ${isAddRepoDropdownOpen ? 'active' : ''}`} 
          onClick={handleToggleAddRepoDropdown} 
          data-tooltip="Open Repository" 
          data-testid="add-repo-btn"
        >
          <Plus size={16} />
        </div>
      </div>

      {isAddRepoDropdownOpen && addRepoDropdownPos && createPortal(
        <div
          ref={addRepoDropdownRef}
          className="recent-repos-dropdown"
          style={{ position: 'fixed', top: addRepoDropdownPos.top, left: addRepoDropdownPos.left }}
          data-testid="recent-repos-dropdown"
        >
          <button
            className="recent-repos-open-btn"
            onClick={handleOpenRepoFromDropdown}
            data-testid="dropdown-open-repo-btn"
          >
            <FolderOpen size={16} />
            <span>Open Repository...</span>
          </button>
          <div className="recent-repos-divider" />
          <div className="recent-repos-header">RECENT REPOSITORIES</div>
          <div className="recent-repos-list">
            {recentRepos.length === 0 ? (
              <div className="recent-repos-empty">No recent repositories</div>
            ) : (
              recentRepos.slice(0, 20).map((item) => (
                <div
                  key={item.path}
                  className="recent-repo-item"
                  onClick={() => handleSelectRecentRepo(item.path)}
                  data-testid="recent-repo-item"
                  title={item.path}
                >
                  <div className="recent-repo-info">
                    <span className="recent-repo-name">{item.name}</span>
                    <span className="recent-repo-path">{item.path}</span>
                  </div>
                  <button
                    className="recent-repo-remove-btn"
                    onClick={(e) => handleRemoveRecentRepo(e, item.path)}
                    data-testid="remove-recent-repo-btn"
                    data-tooltip="Remove from recent"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
      
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
            <span className="settings-dropdown-label">Updates</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="updates-toggle"
                onClick={handleToggleUpdatesEnabled}
                data-testid="updates-toggle-btn"
                data-tooltip="Automatically check for updates on startup"
                style={{
                  width: '34px',
                  height: '18px',
                  borderRadius: '10px',
                  background: updatesEnabled ? 'var(--accent)' : 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  padding: 0,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '2px',
                  left: updatesEnabled ? '18px' : '2px',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }} />
              </button>
              <span style={{ fontSize: '11px', color: updatesEnabled ? 'var(--accent-light)' : 'var(--text-secondary)', fontWeight: 600 }}>
                {updatesEnabled ? 'Enabled' : 'Disabled'}
              </span>
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

      {tabSettingsTabId && tabSettingsPos && createPortal(
        <div
          ref={tabSettingsRef}
          className="tab-settings-popover"
          style={{ position: 'fixed', top: tabSettingsPos.top, left: tabSettingsPos.left }}
          data-testid="tab-settings-popover"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="tab-settings-header">Tab Settings</div>

          {/* Section 1: Tab Name */}
          <div className="tab-settings-section">
            <div className="tab-settings-label">Tab Name</div>
            <div className="tab-settings-name-row">
              <input
                type="text"
                className="tab-settings-name-input"
                value={editingName}
                onChange={(e) => {
                  setEditingName(e.target.value)
                  setRepoCustomName(tabSettingsTabId, e.target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                    e.preventDefault()
                    setTabSettingsTabId(null)
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setTabSettingsTabId(null)
                  }
                }}
                placeholder="Custom tab name..."
                autoFocus
                data-testid="tab-rename-input"
              />
              {editingName.trim().length > 0 && (
                <button
                  className="tab-settings-reset-name-btn"
                  onClick={() => {
                    setEditingName('')
                    setRepoCustomName(tabSettingsTabId, undefined)
                  }}
                  title="Reset tab name"
                >
                  <RotateCcw size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Tab Color */}
          <div className="tab-settings-section">
            <div className="tab-settings-label">Tab Color</div>
            <div className="tab-color-swatches">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className="color-swatch"
                  style={{ backgroundColor: c }}
                  onClick={() => setRepoTabColor(tabSettingsTabId, c)}
                  data-testid={`color-swatch-${c}`}
                />
              ))}
            </div>
            <div className="tab-color-custom-row">
              <label className="custom-color-label">
                <span>Custom:</span>
                <input
                  type="color"
                  value={repositories.find(r => r.id === tabSettingsTabId)?.customColor || '#3b82f6'}
                  onChange={(e) => setRepoTabColor(tabSettingsTabId, e.target.value)}
                  data-testid="tab-custom-color-input"
                />
              </label>
              <button
                className="reset-color-btn"
                onClick={() => setRepoTabColor(tabSettingsTabId, undefined)}
                data-testid="reset-tab-color-btn"
              >
                <RotateCcw size={11} />
                Reset
              </button>
            </div>
          </div>

          {/* Section 3: Auto Fetch */}
          <div className="tab-settings-section">
            <div className="tab-settings-label">Automations</div>
            <label className="tab-settings-checkbox-label">
              <input
                type="checkbox"
                checked={repositories.find(r => r.id === tabSettingsTabId)?.autoFetch !== false}
                onChange={(e) => setRepoAutoFetch(tabSettingsTabId, e.target.checked)}
                data-testid="tab-auto-fetch-checkbox"
              />
              <span>Auto fetch (every 5 min)</span>
            </label>
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
        onCheckForUpdates={handleManualUpdateCheck}
      />
      {updateInfo && (
        <UpdateBanner
          info={updateInfo}
          currentVersion={pkg.version}
          onDownload={handleUpdateDownload}
          onSkip={handleUpdateSkip}
          onDismiss={handleUpdateDismiss}
        />
      )}
      <AppDialog
        isOpen={missingRepoPath !== null}
        title="Repository Not Found"
        message={`The directory no longer exists on disk:\n${missingRepoPath}`}
        variant="error"
        testId="missing-repo-dialog"
        onCancel={() => setMissingRepoPath(null)}
      />
    </div>
  )
}

export default TitleBar

