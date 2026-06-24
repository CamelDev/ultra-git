import { useEffect, useState, useCallback, useRef } from 'react'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/sidebar/Sidebar'
import Toolbar from './components/toolbar/Toolbar'
import GraphView from './components/graph/GraphView'
import DetailsPanel from './components/details/DetailsPanel'
import { useRepoStore } from './store/useRepoStore'

function App() {
  const { addRepo } = useRepoStore()
  
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

  // Use a ref to access the active width inside listeners without re-binding them
  const sidebarWidthRef = useRef(sidebarWidth)
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  const detailsWidthRef = useRef(detailsWidth)
  useEffect(() => {
    detailsWidthRef.current = detailsWidth
  }, [detailsWidth])

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

  useEffect(() => {
    localStorage.setItem('sidebar-width', sidebarWidth.toString())
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('details-width', detailsWidth.toString())
  }, [detailsWidth])

  useEffect(() => {
    // Initial repo load
    addRepo('.') 
  }, [])

  return (
    <>
      <TitleBar />

      <div 
        className="app-container"
        style={{ 
          '--sidebar-width': `${sidebarWidth}px`,
          '--details-width': `${detailsWidth}px`
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
          <GraphView />
        </div>

        <div 
          className={`details-resizer ${isDetailsDragging ? 'is-dragging' : ''}`}
          onPointerDown={startDetailsResize}
          data-testid="details-resizer"
        />

        <DetailsPanel />
      </div>
    </>
  )
}

export default App

