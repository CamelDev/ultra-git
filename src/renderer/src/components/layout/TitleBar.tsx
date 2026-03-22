import React from 'react'
import { Plus, X } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'

const TitleBar: React.FC = () => {
  const { repositories, activeId, setActiveId, removeRepo, addRepo } = useRepoStore()

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
  return (
    <div className="title-bar">
      <div className="tabs-container">
        {repositories.map((tab) => (
          <div 
            key={tab.id} 
            className={`tab ${activeId === tab.id ? 'active' : ''}`}
            onClick={() => setActiveId(tab.id)}
          >
            <span>{tab.name}</span>
            <X 
              className="tab-close" 
              size={12} 
              onClick={(e) => handleCloseTab(e, tab.id)}
            />
          </div>
        ))}
        <div className="add-tab-btn" onClick={handleAddRepo} title="Open Repository" data-testid="add-repo-btn">
          <Plus size={16} />
        </div>
      </div>
    </div>
  )
}

export default TitleBar
