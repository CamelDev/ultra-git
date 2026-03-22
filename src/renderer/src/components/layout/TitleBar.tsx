import React from 'react'
import { Plus, X } from 'lucide-react'

interface Tab {
  id: number;
  name: string;
  branch: string;
}

interface TitleBarProps {
  tabs: Tab[];
  activeTab: number;
  setActiveTab: (index: number) => void;
}

const TitleBar: React.FC<TitleBarProps> = ({ tabs, activeTab, setActiveTab }) => {
  return (
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
  )
}

export default TitleBar
