import React from 'react'

const Toolbar: React.FC = () => {
  return (
    <div className="toolbar">
      <div 
        className="toolbar-title" 
        style={{ 
          fontSize: '16px', 
          fontWeight: 700, 
          color: 'var(--text-primary)' 
        }}
      >
        Branch change log
      </div>
    </div>
  )
}

export default Toolbar
