import { useEffect } from 'react'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/sidebar/Sidebar'
import Toolbar from './components/toolbar/Toolbar'
import GraphView from './components/graph/GraphView'
import DetailsPanel from './components/details/DetailsPanel'
import { useRepoStore } from './store/useRepoStore'

function App() {
  const { addRepo } = useRepoStore()
  
  useEffect(() => {
    // Initial repo load
    addRepo('.') 
  }, [])

  return (
    <>
      <TitleBar />

      <div className="app-container">
        <Sidebar />

        <div className="main-content">
          <Toolbar />
          <GraphView />
        </div>

        <DetailsPanel />
      </div>
    </>
  )
}

export default App
