import React from 'react'
import { ArrowUpCircle, Download, X, SkipForward } from 'lucide-react'
import './UpdateBanner.css'

interface UpdateBannerProps {
  info: UpdateInfo
  currentVersion?: string
  onDownload: (url: string) => void
  onSkip: (version: string) => void
  onDismiss: () => void
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  info,
  currentVersion,
  onDownload,
  onSkip,
  onDismiss,
}) => {
  return (
    <div className="update-banner glass" data-testid="update-banner">
      <div className="update-banner__icon">
        <ArrowUpCircle size={20} />
      </div>
      <div className="update-banner__content">
        <div className="update-banner__title" data-testid="update-banner-title">
          Get UltraGIT <strong>{info.latest}</strong>
          {currentVersion && <span className="update-banner__current">(you have {currentVersion})</span>}
        </div>
        <div className="update-banner__notes">
          New version is available
        </div>
      </div>
      <div className="update-banner__actions">
        <button
          className="update-banner__btn update-banner__btn--primary"
          onClick={() => onDownload(info.url)}
          data-testid="update-banner-download"
        >
          <Download size={14} /> Download
        </button>
        <button
          className="update-banner__btn"
          onClick={() => onSkip(info.latest)}
          title="Skip this version"
          data-testid="update-banner-skip"
        >
          <SkipForward size={14} /> Skip
        </button>
        <button
          className="update-banner__close"
          onClick={onDismiss}
          title="Remind me later"
          data-testid="update-banner-dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default UpdateBanner
