import React, { useState, useRef, useEffect, useMemo } from 'react'
import DOMPurify from 'dompurify'
import {
  Columns2,
  Layers,
  Sliders,
  Sparkles,
  FileImage,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid,
  Moon,
  Sun,
  Plus,
  Minus
} from 'lucide-react'

export type ImageDiffMode = '2-up' | 'swipe' | 'blend' | 'difference' | 'modified' | 'original'
export type ImageBgMode = 'checkerboard' | 'dark' | 'light'

interface ImageDiffViewProps {
  beforeContent?: string
  afterContent?: string
  filePath: string
  status?: string
}

interface ImageMeta {
  width: number
  height: number
  sizeBytes: number
  loaded: boolean
  error: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getSrc(content?: string): string {
  if (!content) return ''
  if (content.startsWith('data:') || content.startsWith('blob:')) return content
  // If raw SVG XML string
  if (content.trim().startsWith('<svg') || content.trim().startsWith('<?xml')) {
    const cleanSvg = DOMPurify.sanitize(content, { USE_PROFILES: { svg: true, svgFilters: true } })
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleanSvg)}`
  }
  return content
}

function calculateSizeFromContent(content?: string): number {
  if (!content) return 0
  if (content.startsWith('data:')) {
    const base64Index = content.indexOf(';base64,')
    if (base64Index !== -1) {
      const base64Str = content.substring(base64Index + 8)
      return Math.round((base64Str.length * 3) / 4)
    }
  }
  return new Blob([content]).size
}

export const ImageDiffView: React.FC<ImageDiffViewProps> = ({
  beforeContent,
  afterContent,
  filePath,
  status
}) => {
  const isAdded = status === 'A' || (!beforeContent && !!afterContent)
  const isDeleted = status === 'D' || (!!beforeContent && !afterContent)

  const [mode, setMode] = useState<ImageDiffMode>(() => {
    if (isAdded) return 'modified'
    if (isDeleted) return 'original'
    return '2-up'
  })

  const [bgMode, setBgMode] = useState<ImageBgMode>('checkerboard')
  const [zoom, setZoom] = useState<number>(1) // 1 = 100%, 0 = fit
  const [isFit, setIsFit] = useState<boolean>(true)
  const [swipePos, setSwipePos] = useState<number>(50) // 0 - 100 percentage
  const [blendOpacity, setBlendOpacity] = useState<number>(50) // 0 - 100 percentage
  const [isDraggingSwipe, setIsDraggingSwipe] = useState<boolean>(false)

  const swipeContainerRef = useRef<HTMLDivElement>(null)

  const beforeSrc = useMemo(() => getSrc(beforeContent), [beforeContent])
  const afterSrc = useMemo(() => getSrc(afterContent), [afterContent])

  const beforeSizeBytes = useMemo(() => calculateSizeFromContent(beforeContent), [beforeContent])
  const afterSizeBytes = useMemo(() => calculateSizeFromContent(afterContent), [afterContent])

  const [beforeMeta, setBeforeMeta] = useState<ImageMeta>({
    width: 0,
    height: 0,
    sizeBytes: beforeSizeBytes,
    loaded: false,
    error: false
  })

  const [afterMeta, setAfterMeta] = useState<ImageMeta>({
    width: 0,
    height: 0,
    sizeBytes: afterSizeBytes,
    loaded: false,
    error: false
  })

  // Load image dimensions
  useEffect(() => {
    if (beforeSrc) {
      const img = new Image()
      img.onload = () => {
        setBeforeMeta({
          width: img.naturalWidth,
          height: img.naturalHeight,
          sizeBytes: beforeSizeBytes,
          loaded: true,
          error: false
        })
      }
      img.onerror = () => {
        setBeforeMeta((prev) => ({ ...prev, error: true, loaded: true }))
      }
      img.src = beforeSrc
    } else {
      setBeforeMeta({
        width: 0,
        height: 0,
        sizeBytes: 0,
        loaded: true,
        error: false
      })
    }
  }, [beforeSrc, beforeSizeBytes])

  useEffect(() => {
    if (afterSrc) {
      const img = new Image()
      img.onload = () => {
        setAfterMeta({
          width: img.naturalWidth,
          height: img.naturalHeight,
          sizeBytes: afterSizeBytes,
          loaded: true,
          error: false
        })
      }
      img.onerror = () => {
        setAfterMeta((prev) => ({ ...prev, error: true, loaded: true }))
      }
      img.src = afterSrc
    } else {
      setAfterMeta({
        width: 0,
        height: 0,
        sizeBytes: 0,
        loaded: true,
        error: false
      })
    }
  }, [afterSrc, afterSizeBytes])

  // Mouse drag handling for swipe mode
  const handleSwipeMove = (clientX: number) => {
    if (!swipeContainerRef.current) return
    const rect = swipeContainerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const clamped = Math.max(0, Math.min(rect.width, x))
    const pct = Math.round((clamped / rect.width) * 100)
    setSwipePos(pct)
  }

  useEffect(() => {
    if (!isDraggingSwipe) return

    const onMouseMove = (e: MouseEvent) => {
      handleSwipeMove(e.clientX)
    }
    const onMouseUp = () => {
      setIsDraggingSwipe(false)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDraggingSwipe])

  // Delta calculation
  const sizeDiff = afterMeta.sizeBytes - beforeMeta.sizeBytes
  const sizeDiffPct = beforeMeta.sizeBytes > 0 ? (sizeDiff / beforeMeta.sizeBytes) * 100 : 0
  const dimDiff =
    afterMeta.loaded && beforeMeta.loaded && beforeMeta.width > 0 && afterMeta.width > 0
      ? {
          w: afterMeta.width - beforeMeta.width,
          h: afterMeta.height - beforeMeta.height
        }
      : null

  const fileExt = filePath.split('.').pop()?.toUpperCase() || 'IMAGE'

  // Zoom scale calculation
  const imageTransformStyle: React.CSSProperties = isFit
    ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
    : {
        transform: `scale(${zoom})`,
        transformOrigin: 'center center',
        transition: 'transform 0.1s ease'
      }

  return (
    <div className="image-diff-view" data-testid="image-diff-view">
      {/* Top Controls Toolbar */}
      <div className="image-diff-toolbar">
        {/* Mode Selector */}
        <div className="image-diff-mode-group">
          {!isAdded && !isDeleted && (
            <>
              <button
                className={`image-diff-mode-btn ${mode === '2-up' ? 'active' : ''}`}
                onClick={() => setMode('2-up')}
                data-tooltip="2-Up Side-by-Side Comparison"
                data-testid="img-mode-2up"
              >
                <Columns2 size={13} />
                <span>2-Up</span>
              </button>
              <button
                className={`image-diff-mode-btn ${mode === 'swipe' ? 'active' : ''}`}
                onClick={() => setMode('swipe')}
                data-tooltip="Interactive Swipe Slider"
                data-testid="img-mode-swipe"
              >
                <Sliders size={13} />
                <span>Swipe</span>
              </button>
              <button
                className={`image-diff-mode-btn ${mode === 'blend' ? 'active' : ''}`}
                onClick={() => setMode('blend')}
                data-tooltip="Onion Skin (Opacity Overlay)"
                data-testid="img-mode-blend"
              >
                <Layers size={13} />
                <span>Blend</span>
              </button>
              <button
                className={`image-diff-mode-btn ${mode === 'difference' ? 'active' : ''}`}
                onClick={() => setMode('difference')}
                data-tooltip="Pixel Difference Highlight"
                data-testid="img-mode-diff"
              >
                <Sparkles size={13} />
                <span>Difference</span>
              </button>
            </>
          )}

          {(!isDeleted || isAdded) && (
            <button
              className={`image-diff-mode-btn ${mode === 'modified' ? 'active' : ''}`}
              onClick={() => setMode('modified')}
              data-tooltip="View Modified (New) Image Only"
              data-testid="img-mode-modified"
            >
              <FileImage size={13} />
              <span>Modified</span>
            </button>
          )}

          {(!isAdded || isDeleted) && (
            <button
              className={`image-diff-mode-btn ${mode === 'original' ? 'active' : ''}`}
              onClick={() => setMode('original')}
              data-tooltip="View Original (Old) Image Only"
              data-testid="img-mode-original"
            >
              <FileImage size={13} />
              <span>Original</span>
            </button>
          )}
        </div>

        {/* Center / Right controls: Zoom, Background, Info */}
        <div className="image-diff-toolbar-right">
          {/* Zoom controls */}
          <div className="image-diff-zoom-group">
            <button
              className={`image-diff-tool-btn ${isFit ? 'active' : ''}`}
              onClick={() => {
                setIsFit(true)
                setZoom(1)
              }}
              data-tooltip="Fit to Container"
              data-testid="img-zoom-fit"
            >
              <Maximize2 size={13} />
              <span>Fit</span>
            </button>
            <button
              className={`image-diff-tool-btn ${!isFit && zoom === 1 ? 'active' : ''}`}
              onClick={() => {
                setIsFit(false)
                setZoom(1)
              }}
              data-tooltip="100% Actual Size (1:1)"
              data-testid="img-zoom-100"
            >
              <span>100%</span>
            </button>
            <button
              className="image-diff-tool-btn"
              onClick={() => {
                setIsFit(false)
                setZoom((prev) => Math.max(0.25, parseFloat((prev - 0.25).toFixed(2))))
              }}
              data-tooltip="Zoom Out"
              data-testid="img-zoom-out"
            >
              <ZoomOut size={13} />
            </button>
            {!isFit && (
              <span className="image-diff-zoom-label">{Math.round(zoom * 100)}%</span>
            )}
            <button
              className="image-diff-tool-btn"
              onClick={() => {
                setIsFit(false)
                setZoom((prev) => Math.min(5, parseFloat((prev + 0.25).toFixed(2))))
              }}
              data-tooltip="Zoom In"
              data-testid="img-zoom-in"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          {/* Background selection */}
          <div className="image-diff-bg-group">
            <button
              className={`image-diff-tool-btn ${bgMode === 'checkerboard' ? 'active' : ''}`}
              onClick={() => setBgMode('checkerboard')}
              data-tooltip="Checkerboard Background (Transparency)"
              data-testid="img-bg-checkerboard"
            >
              <Grid size={13} />
            </button>
            <button
              className={`image-diff-tool-btn ${bgMode === 'dark' ? 'active' : ''}`}
              onClick={() => setBgMode('dark')}
              data-tooltip="Dark Background"
              data-testid="img-bg-dark"
            >
              <Moon size={13} />
            </button>
            <button
              className={`image-diff-tool-btn ${bgMode === 'light' ? 'active' : ''}`}
              onClick={() => setBgMode('light')}
              data-tooltip="Light Background"
              data-testid="img-bg-light"
            >
              <Sun size={13} />
            </button>
          </div>

          {/* Asset Format Badge */}
          <span className="image-diff-badge">{fileExt}</span>
        </div>
      </div>

      {/* Secondary Controls (Sliders for Swipe or Blend) */}
      {mode === 'blend' && (
        <div className="image-diff-slider-bar" data-testid="blend-slider-bar">
          <span className="image-diff-slider-label">Original (0%)</span>
          <input
            type="range"
            min="0"
            max="100"
            value={blendOpacity}
            onChange={(e) => setBlendOpacity(parseInt(e.target.value, 10))}
            className="image-diff-range-slider"
            data-testid="blend-opacity-input"
          />
          <span className="image-diff-slider-label">Modified (100%) [Current: {blendOpacity}%]</span>
        </div>
      )}

      {/* Main Canvas / Viewer Body */}
      <div className={`image-diff-viewport image-diff-bg-${bgMode}`}>
        {/* MODE: 2-UP (SIDE BY SIDE) */}
        {mode === '2-up' && (
          <div className="image-diff-2up-container">
            {/* Left: Original (Old) */}
            <div className="image-diff-pane image-diff-pane-left">
              <div className="image-diff-pane-header">
                <span className="image-diff-pane-title diff-title-del">Original</span>
                {beforeMeta.loaded && beforeMeta.width > 0 && (
                  <span className="image-diff-pane-meta" data-testid="before-meta">
                    {beforeMeta.width} × {beforeMeta.height} px • {formatBytes(beforeMeta.sizeBytes)}
                  </span>
                )}
              </div>
              <div className="image-diff-pane-body">
                {beforeSrc ? (
                  <img
                    src={beforeSrc}
                    alt="Original version"
                    className="image-diff-img"
                    style={imageTransformStyle}
                    data-testid="before-image"
                  />
                ) : (
                  <div className="image-diff-empty">No original image (File added)</div>
                )}
              </div>
            </div>

            {/* Right: Modified (New) */}
            <div className="image-diff-pane image-diff-pane-right">
              <div className="image-diff-pane-header">
                <span className="image-diff-pane-title diff-title-add">Modified</span>
                {afterMeta.loaded && afterMeta.width > 0 && (
                  <span className="image-diff-pane-meta" data-testid="after-meta">
                    {afterMeta.width} × {afterMeta.height} px • {formatBytes(afterMeta.sizeBytes)}
                    {sizeDiff !== 0 && (
                      <span
                        className={`image-diff-delta ${sizeDiff < 0 ? 'delta-decrease' : 'delta-increase'}`}
                      >
                        ({sizeDiff < 0 ? '-' : '+'}
                        {formatBytes(Math.abs(sizeDiff))},{' '}
                        {sizeDiff < 0 ? '' : '+'}
                        {sizeDiffPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="image-diff-pane-body">
                {afterSrc ? (
                  <img
                    src={afterSrc}
                    alt="Modified version"
                    className="image-diff-img"
                    style={imageTransformStyle}
                    data-testid="after-image"
                  />
                ) : (
                  <div className="image-diff-empty">No modified image (File deleted)</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE: SWIPE (INTERACTIVE SPLIT SLIDER) */}
        {mode === 'swipe' && (
          <div
            ref={swipeContainerRef}
            className="image-diff-swipe-container"
            data-testid="image-swipe-container"
            onMouseDown={(e) => {
              setIsDraggingSwipe(true)
              handleSwipeMove(e.clientX)
            }}
          >
            {/* After Image (Background) */}
            <div className="image-diff-swipe-layer swipe-after">
              <img
                src={afterSrc}
                alt="Modified version"
                className="image-diff-img"
                style={imageTransformStyle}
              />
              <span className="image-diff-swipe-badge badge-right">Modified</span>
            </div>

            {/* Before Image (Clipped Left Layer) */}
            <div
              className="image-diff-swipe-layer swipe-before"
              style={{ clipPath: `inset(0 ${100 - swipePos}% 0 0)` }}
            >
              <img
                src={beforeSrc}
                alt="Original version"
                className="image-diff-img"
                style={imageTransformStyle}
              />
              <span className="image-diff-swipe-badge badge-left">Original</span>
            </div>

            {/* Divider Line & Handle */}
            <div
              className="image-diff-swipe-divider"
              style={{ left: `${swipePos}%` }}
              data-testid="swipe-divider"
            >
              <div className="image-diff-swipe-handle">
                <span>◀ ▶</span>
              </div>
            </div>
          </div>
        )}

        {/* MODE: BLEND (ONION SKIN) */}
        {mode === 'blend' && (
          <div className="image-diff-blend-container" data-testid="image-blend-container">
            {/* Base (Original) */}
            <div className="image-diff-blend-base">
              <img
                src={beforeSrc}
                alt="Original version"
                className="image-diff-img"
                style={imageTransformStyle}
              />
            </div>
            {/* Overlay (Modified) with variable opacity */}
            <div
              className="image-diff-blend-overlay"
              style={{ opacity: blendOpacity / 100 }}
            >
              <img
                src={afterSrc}
                alt="Modified version"
                className="image-diff-img"
                style={imageTransformStyle}
              />
            </div>
          </div>
        )}

        {/* MODE: DIFFERENCE (PIXEL DIFF) */}
        {mode === 'difference' && (
          <div className="image-diff-diff-container" data-testid="image-diff-container">
            <div className="image-diff-diff-base">
              <img
                src={beforeSrc}
                alt="Original base"
                className="image-diff-img"
                style={imageTransformStyle}
              />
            </div>
            <div className="image-diff-diff-overlay">
              <img
                src={afterSrc}
                alt="Modified difference"
                className="image-diff-img"
                style={{
                  ...imageTransformStyle,
                  mixBlendMode: 'difference',
                  filter: 'contrast(200%) brightness(150%)'
                }}
              />
            </div>
          </div>
        )}

        {/* MODE: SINGLE MODIFIED */}
        {mode === 'modified' && (
          <div className="image-diff-single-container" data-testid="image-modified-container">
            {isAdded && <div className="image-diff-status-pill added"><Plus size={12} /> Added Asset</div>}
            {afterSrc ? (
              <img
                src={afterSrc}
                alt="Modified version"
                className="image-diff-img"
                style={imageTransformStyle}
                data-testid="single-after-image"
              />
            ) : (
              <div className="image-diff-empty">No modified image</div>
            )}
          </div>
        )}

        {/* MODE: SINGLE ORIGINAL */}
        {mode === 'original' && (
          <div className="image-diff-single-container" data-testid="image-original-container">
            {isDeleted && <div className="image-diff-status-pill deleted"><Minus size={12} /> Deleted Asset</div>}
            {beforeSrc ? (
              <img
                src={beforeSrc}
                alt="Original version"
                className="image-diff-img"
                style={imageTransformStyle}
                data-testid="single-before-image"
              />
            ) : (
              <div className="image-diff-empty">No original image</div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Summary Bar */}
      <div className="image-diff-footer">
        <div className="image-diff-footer-info">
          {beforeMeta.loaded && afterMeta.loaded && beforeMeta.width > 0 && afterMeta.width > 0 && (
            <span>
              <strong>Dimensions:</strong> {beforeMeta.width} × {beforeMeta.height} px →{' '}
              {afterMeta.width} × {afterMeta.height} px
              {dimDiff && (dimDiff.w !== 0 || dimDiff.h !== 0) && (
                <span style={{ marginLeft: '6px', color: 'var(--accent-light)' }}>
                  ({dimDiff.w >= 0 ? `+${dimDiff.w}` : dimDiff.w} ×{' '}
                  {dimDiff.h >= 0 ? `+${dimDiff.h}` : dimDiff.h} px)
                </span>
              )}
            </span>
          )}
          {beforeMeta.loaded && !afterMeta.loaded && beforeMeta.width > 0 && (
            <span>
              <strong>Dimensions:</strong> {beforeMeta.width} × {beforeMeta.height} px
            </span>
          )}
          {!beforeMeta.loaded && afterMeta.loaded && afterMeta.width > 0 && (
            <span>
              <strong>Dimensions:</strong> {afterMeta.width} × {afterMeta.height} px
            </span>
          )}
        </div>

        <div className="image-diff-footer-right">
          {afterMeta.sizeBytes > 0 && beforeMeta.sizeBytes > 0 && (
            <span>
              <strong>Size:</strong> {formatBytes(beforeMeta.sizeBytes)} → {formatBytes(afterMeta.sizeBytes)}
              {sizeDiff !== 0 && (
                <span
                  className={`image-diff-delta ${sizeDiff < 0 ? 'delta-decrease' : 'delta-increase'}`}
                  style={{ marginLeft: '6px' }}
                >
                  ({sizeDiff < 0 ? '-' : '+'}
                  {formatBytes(Math.abs(sizeDiff))},{' '}
                  {sizeDiff < 0 ? '' : '+'}
                  {sizeDiffPct.toFixed(1)}%)
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
