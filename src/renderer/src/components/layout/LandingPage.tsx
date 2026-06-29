import React from 'react'
import { FolderOpen } from 'lucide-react'

interface LandingPageProps {
  onOpenRepo: () => void
}

const LandingPage: React.FC<LandingPageProps> = ({ onOpenRepo }) => {
  return (
    <div className="landing-page" data-testid="landing-page">
      <div className="landing-content">
        <div className="landing-icon-container">
          <FolderOpen size={64} className="landing-icon" />
        </div>
        <h1 className="landing-title">Welcome to UltraGIT</h1>
        <p className="landing-subtitle">
          Open a Git repository to start tracking changes, branches, and commits.
        </p>
        <button 
          className="landing-btn" 
          onClick={onOpenRepo}
          data-testid="landing-open-repo-btn"
        >
          <FolderOpen size={16} />
          <span>Open GIT repository</span>
        </button>
      </div>
    </div>
  )
}

export default LandingPage
