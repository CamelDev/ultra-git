import { useEffect, useState, useCallback, useRef } from 'react'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/sidebar/Sidebar'
import Toolbar from './components/toolbar/Toolbar'
import GraphView from './components/graph/GraphView'
import DetailsPanel from './components/details/DetailsPanel'
import { useRepoStore } from './store/useRepoStore'
import { ActiveChanges } from './components/active-changes/ActiveChanges'

function App() {
  const { addRepo, getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()
  const hasActiveChanges = !!(activeRepo?.status?.files && activeRepo.status.files.length > 0)
  
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebar-width')
    return saved ? parseInt(saved, 10) : 280
  })
  const [isDragging, setIsDragging] = useState(false)

  const [detailsWidth, setDetailsWidth] = useState(() => {
    const saved = localStorage.getItem('details-width')
    return saved ? parseInt(saved, 10) : 380
  })
  const [isDetailsDragging, setIsDetailsDragging] = useState(false)

  const [activeChangesHeight, setActiveChangesHeight] = useState(() => {
    const saved = localStorage.getItem('active-changes-height')
    return saved ? parseInt(saved, 10) : window.innerHeight / 2
  })
  const [isActiveChangesDragging, setIsActiveChangesDragging] = useState(false)

  // Use a ref to access the active width inside listeners without re-binding them
  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const detailsWidthRef = useRef(detailsWidth)
  useEffect(() => {
    detailsWidthRef.current = detailsWidth
  }, [detailsWidth])

  const activeChangesHeightRef = useRef(activeChangesHeight)
  useEffect(() => {
    activeChangesHeightRef.current = activeChangesHeight
  }, [activeChangesHeight])

  const startResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const sidebarEl = document.querySelector('.sidebar')
    const startWidth = sidebarEl ? sidebarEl.getBoundingClientRect().width : sidebarWidthRef.current

    const doResize = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.max(180, Math.min(600, startWidth + deltaX))
      setSidebarWidth(newWidth)
    }

    const stopResize = () => {
      setIsDragging(false)
      document.removeEventListener('pointermove', doResize)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', doResize)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startDetailsResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsDetailsDragging(true)
    const startX = e.clientX
    const detailsEl = document.querySelector('.details-panel')
    const startWidth = detailsEl ? detailsEl.getBoundingClientRect().width : detailsWidthRef.current

    const doDetailsResize = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      // Dragging left (negative deltaX) increases width of right panel
      const newWidth = Math.max(200, Math.min(600, startWidth - deltaX))
      setDetailsWidth(newWidth)
    }

    const stopDetailsResize = () => {
      setIsDetailsDragging(false)
      document.removeEventListener('pointermove', doDetailsResize)
      document.removeEventListener('pointerup', stopDetailsResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', doDetailsResize)
    document.addEventListener('pointerup', stopDetailsResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startActiveChangesResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    setIsActiveChangesDragging(true)
    const startY = e.clientY
    const activeChangesEl = document.querySelector('.active-changes-panel')
    const startHeight = activeChangesEl ? activeChangesEl.getBoundingClientRect().height : activeChangesHeightRef.current

    const doResize = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY
      const newHeight = Math.max(100, Math.min(window.innerHeight - 200, startHeight + deltaY))
      setActiveChangesHeight(newHeight)
    }

    const stopResize = () => {
      setIsActiveChangesDragging(false)
      document.removeEventListener('pointermove', doResize)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('pointermove', doResize)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth.toString())
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('details-width', detailsWidth.toString())
  }, [detailsWidth])

  useEffect(() => {
    localStorage.setItem('active-changes-height', activeChangesHeight.toString())
  }, [activeChangesHeight])

  useEffect(() => {
    // Initial repo load
    addRepo('.') 
  }, [])

  // Auto-refresh when files change in the repository
  useEffect(() => {
    const unsubscribe = window.api.git.onRepoChanged((repoPath) => {
      const currentActive = getActiveRepo()
      if (currentActive && currentActive.path === repoPath) {
        refreshRepo(currentActive.id).catch((err) =>
          console.error('Failed to refresh repo on filesystem change', err)
        )
      }
    })
    return unsubscribe
  }, [activeRepo?.id, activeRepo?.path, getActiveRepo, refreshRepo])

  // Auto-refresh when user returns focus to the application window
  useEffect(() => {
    const handleFocus = () => {
      const currentActive = getActiveRepo()
      if (currentActive) {
        refreshRepo(currentActive.id).catch((err) =>
          console.error('Failed to refresh repo on window focus', err)
        )
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [activeRepo?.id, getActiveRepo, refreshRepo])

  return (
    <>
      <TitleBar />

      <div 
        className="app-container"
        style={{ 
          '--sidebar-width': `${sidebarWidth}px`,
          '--details-width': `${detailsWidth}px`,
          '--active-changes-height': `${activeChangesHeight}px`
        } as React.CSSProperties}
      >
        <Sidebar />
        
        <div 
          className={`sidebar-resizer ${isDragging ? 'is-dragging' : ''}`}
          onPointerDown={startResize}
          data-testid="sidebar-resizer"
        />

        <div className="main-content">
          <Toolbar />
          {hasActiveChanges && (
            <>
              <ActiveChanges />
              <div 
                className={`active-changes-resizer ${isActiveChangesDragging ? 'is-dragging' : ''}`}
                onPointerDown={startActiveChangesResize}
                data-testid="active-changes-resizer"
              />
            </>
          )}
          <div className="git-log-and-details">
            <GraphView />
            <div 
              className={`details-resizer ${isDetailsDragging ? 'is-dragging' : ''}`}
              onPointerDown={startDetailsResize}
              data-testid="details-resizer"
            />
            <DetailsPanel />
          </div>
        </div>
      </div>
    </>
  )
}

export default App

