import { useEffect, useState } from 'react'
import TitleBar from './components/layout/TitleBar'
import Sidebar from './components/sidebar/Sidebar'
import Toolbar from './components/toolbar/Toolbar'
import GraphView from './components/graph/GraphView'
import DetailsPanel from './components/details/DetailsPanel'
import { useGitStore } from './store/useGitStore'

function App() {
  const [activeTab, setActiveTab] = useState(0)
  const { setRepoPath } = useGitStore()
  
  const tabs = [
    { id: 0, name: 'ultra-git', branch: 'main' },
  ]

  useEffect(() => {
    // In Phase 1 we hardcode to current app dir for demo
    // We'll add path detection/selection in later phases
    setRepoPath('.') 
  }, [])

  return (
    <>
      <TitleBar 
        tabs={tabs} 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
      />

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
