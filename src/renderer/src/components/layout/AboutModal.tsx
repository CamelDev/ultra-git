import React from 'react'
import { X, Github, Heart, Info, ExternalLink } from 'lucide-react'
import './AboutModal.css'
import logoIcon from '../../assets/icon.png'
import pkg from '../../../../../package.json'

interface AboutModalProps {
  isOpen: boolean
  onClose: () => void
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <div className="about-modal-overlay" onClick={onClose} data-testid="about-modal-overlay">
      <div
        className="about-modal-content glass"
        onClick={(e) => e.stopPropagation()}
        data-testid="about-modal"
      >
        <div className="about-modal-header">
          <div className="about-header-title">
            <Info size={16} className="icon-pulse" />
            <h3>About UltraGIT</h3>
          </div>
          <button className="about-close-btn" onClick={onClose} data-testid="about-close-btn">
            <X size={16} />
          </button>
        </div>

        <div className="about-modal-body">
          <div className="about-brand">
            <div className="about-logo-wrapper">
              <img src={logoIcon} alt="UltraGIT Logo" style={{ width: 48, height: 48 }} />
            </div>
            <h2 className="about-app-name">UltraGIT</h2>
            <p className="about-version">Version {pkg.version}</p>
            <div className="about-badge">Stable Release</div>
          </div>

          <div className="about-description">
            <p>
              The ultimate <strong>Git client</strong> built for speed, elegance, and productivity. 
              Manage repositories, resolve conflicts visually, and track your commits with power and ease.
            </p>
          </div>

          <div className="about-info-grid">
            <div className="about-info-card">
              <h4>License</h4>
              <p>
                <span
                  className="about-link-accent"
                  onClick={() => handleOpenLink('https://mit-license.org')}
                  style={{ cursor: 'pointer', textDecoration: 'underline' }}
                >
                  MIT License
                </span>
              </p>
            </div>
            <div className="about-info-card">
              <h4>Platform</h4>
              <p>Mac / Win / Linux</p>
            </div>
            <div className="about-info-card">
              <h4>Author</h4>
              <p>Kamil Dabrowski</p>
            </div>
          </div>

          <div className="about-links">
            <button
              className="about-link-btn"
              onClick={() => handleOpenLink('https://github.com/CamelDev/ultra-git')}
              data-testid="about-github-link"
            >
              <Github size={14} /> GitHub Repository <ExternalLink size={10} />
            </button>
          </div>
        </div>

        <div className="about-modal-footer">
          <div className="about-made-with">
            Made with <Heart size={12} color="#ef4444" fill="#ef4444" /> for developers
          </div>
          <button className="about-footer-close-btn" onClick={onClose} data-testid="about-footer-close-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
