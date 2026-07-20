import { useEffect, useState, useCallback, useRef } from "react"
import TitleBar from "./components/layout/TitleBar"
import Sidebar from "./components/sidebar/Sidebar"
import Toolbar from "./components/toolbar/Toolbar"
import GraphView from "./components/graph/GraphView"
import DetailsPanel from "./components/details/DetailsPanel"
import { useRepoStore } from "./store/useRepoStore"
import { ActiveChanges } from "./components/active-changes/ActiveChanges"
import { ConflictResolver } from "./components/sidebar/ConflictResolver"
import LandingPage from "./components/layout/LandingPage"
import { useTooltip } from "./hooks/useTooltip"
import { useTheme } from "./hooks/useTheme"

interface ConflictState {
  active: boolean
  isRebase: boolean
  isCherryPick?: boolean
  conflictedFiles: Array<{ path: string; status: string }>
}

function App() {
  const { addRepo, getActiveRepo, refreshRepo, initializeRepos } = useRepoStore()
  const activeRepo = getActiveRepo()
  const [isInitialized, setIsInitialized] = useState(false)
  useTooltip()
  useTheme()

  const handleOpenRepo = async () => {
    console.log('Renderer: Requesting openDirectory dialog')
    const result = await window.api.app.openDirectory()
    if (!result.canceled && result.path) {
      await addRepo(result.path)
    }
  }
  const hasActiveChanges = !!(activeRepo?.status?.files && activeRepo.status.files.length > 0)

  const [conflictState, setConflictState] = useState<ConflictState>({
    active: false,
    isRebase: false,
    isCherryPick: false,
    conflictedFiles: []
  })

  const handleMergeConflicts = (conflictedFiles: Array<{ path: string; status: string }>, isRebase: boolean, isCherryPick?: boolean) => {
    setConflictState({ active: true, isRebase, isCherryPick, conflictedFiles })
  }

  const handleAbortMerge = async () => {
    if (!activeRepo) return
    if (conflictState.isCherryPick) {
      await window.api.git.abortCherryPick(activeRepo.path)
    } else if (conflictState.isRebase) {
      await window.api.git.abortRebase(activeRepo.path)
    } else {
      await window.api.git.abortMerge(activeRepo.path)
    }
    setConflictState({ active: false, isRebase: false, isCherryPick: false, conflictedFiles: [] })
    await refreshRepo(activeRepo.id)
  }

  const handleCompleteMerge = async () => {
    if (!activeRepo) return
    if (conflictState.isCherryPick) {
      await window.api.git.continueCherryPick(activeRepo.path)
    } else if (conflictState.isRebase) {
      await window.api.git.continueRebase(activeRepo.path)
    } else {
      await window.api.git.commit(activeRepo.path, "Merge commit")
    }
    setConflictState({ active: false, isRebase: false, isCherryPick: false, conflictedFiles: [] })
    await refreshRepo(activeRepo.id)
  }

  // Auto-detect existing conflicts (e.g. from external merge or on app start)
  const conflictedPaths = activeRepo?.status?.conflicted
  useEffect(() => {
    if (!activeRepo || conflictState.active) return
    if (!conflictedPaths || conflictedPaths.length === 0) return

    // Conflicts detected — figure out if merge or rebase is in progress
    window.api.git.getMergeStatus(activeRepo.path).then(msRes => {
      const isRebase = msRes.success && !!msRes.data?.isRebase
      const isCherryPick = msRes.success && !!msRes.data?.isCherryPick
      window.api.git.getConflictedFiles(activeRepo.path).then(cfRes => {
        if (cfRes.success && cfRes.data && cfRes.data.length > 0) {
          setConflictState({ active: true, isRebase, isCherryPick, conflictedFiles: cfRes.data })
        }
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflictedPaths?.length, activeRepo?.id])

  const openConflictResolver = () => {
    if (!activeRepo || conflictState.active) return
    window.api.git.getMergeStatus(activeRepo.path).then(msRes => {
      const isRebase = msRes.success && !!msRes.data?.isRebase
      const isCherryPick = msRes.success && !!msRes.data?.isCherryPick
      window.api.git.getConflictedFiles(activeRepo.path).then(cfRes => {
        if (cfRes.success && cfRes.data) {
          setConflictState({ active: true, isRebase, isCherryPick, conflictedFiles: cfRes.data })
        }
      })
    })
  }
  
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
    // Initial repo load from localStorage
    const savedPathsStr = localStorage.getItem('open-repo-paths')
    const savedActivePath = localStorage.getItem('active-repo-path')
    
    let paths: string[] = []
    if (savedPathsStr) {
      try {
        paths = JSON.parse(savedPathsStr)
      } catch (e) {
        console.error('Failed to parse saved repository paths', e)
      }
    }
    
    const isTesting = window.api.app.isTesting
    const disableDefaultTab = localStorage.getItem('disable-default-tab') === 'true' || window.api.app.disableDefaultTab

    if (paths.length === 0) {
      if (isTesting && !disableDefaultTab) {
        paths = ['.']
      } else {
        setIsInitialized(true)
        return
      }
    }

    initializeRepos(paths, savedActivePath)
      .catch((err) => console.error('Failed to initialize repositories', err))
      .finally(() => setIsInitialized(true))
  }, [initializeRepos])

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

  // Listen for layout reset event
  useEffect(() => {
    const handleReset = () => {
      setSidebarWidth(280)
      setDetailsWidth(380)
      setActiveChangesHeight(window.innerHeight / 2)
    }
    window.addEventListener('reset-layout', handleReset)
    return () => {
      window.removeEventListener('reset-layout', handleReset)
    }
  }, [])


  const renderContent = () => {
    if (!isInitialized) {
      return null
    }

    if (!activeRepo) {
      return <LandingPage onOpenRepo={handleOpenRepo} />
    }

    return (
      <div 
        className="app-container"
        style={{ 
          '--sidebar-width': `${sidebarWidth}px`,
          '--details-width': `${detailsWidth}px`,
          '--active-changes-height': `${activeChangesHeight}px`
        } as React.CSSProperties}
      >
        <Sidebar onMergeConflicts={handleMergeConflicts} />
        
        <div 
          className={`sidebar-resizer ${isDragging ? 'is-dragging' : ''}`}
          onPointerDown={startResize}
          data-testid="sidebar-resizer"
        />

        <div className="main-content">
          <Toolbar onMergeConflicts={handleMergeConflicts} />
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
            <GraphView onOpenConflictResolver={openConflictResolver} />
            <div
              className={`details-resizer ${isDetailsDragging ? "is-dragging" : ""}`}
              onPointerDown={startDetailsResize}
              data-testid="details-resizer"
            />
            <DetailsPanel />
          </div>

          {/* Conflict Resolver Modal Overlay */}
          {conflictState.active && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(4px)',
                padding: '24px'
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: '1100px',
                  height: '85vh',
                  maxHeight: '800px',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '12px',
                  border: '1px solid rgba(251, 191, 36, 0.25)',
                  overflow: 'hidden',
                  boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
                  animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                <ConflictResolver
                  isRebase={conflictState.isRebase}
                  isCherryPick={conflictState.isCherryPick}
                  conflictedFiles={conflictState.conflictedFiles}
                  onAbort={handleAbortMerge}
                  onComplete={handleCompleteMerge}
                  onDismiss={() => setConflictState(s => ({ ...s, active: false }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <TitleBar />
      {renderContent()}
    </>
  )
}

export default App

