import React from 'react'
import { Plus, X } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import logoIcon from '../../assets/icon.png'

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

  const isMac = navigator.userAgent.includes('Mac')
  const isWindows = navigator.userAgent.includes('Win')

  return (
    <div 
      className="title-bar"
      style={{
        paddingLeft: isMac ? '80px' : '16px',
        paddingRight: isWindows ? '140px' : '16px'
      }}
    >
      <div className="title-bar-brand">
        <img src={logoIcon} alt="UltraGIT" className="brand-logo" />
        <span className="brand-name">UltraGIT</span>
      </div>
      <div className="tabs-container">
        {repositories.map((tab) => (
          <div 
            key={tab.id} 
            className={`tab ${activeId === tab.id ? 'active' : ''}`}
            onClick={() => setActiveId(tab.id)}
            data-testid="repo-tab"
          >
            <span>{tab.name}</span>
            <X 
              className="tab-close" 
              size={12} 
              onClick={(e) => handleCloseTab(e, tab.id)}
              data-testid="close-tab-btn"
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
