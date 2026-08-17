import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  Columns,
  Eye,
  History,
  Copy,
  Check,
  Link,
  Unlink,
  FileText,
  AlertCircle
} from 'lucide-react'

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true
})

interface MarkdownDiffViewProps {
  beforeContent: string
  afterContent: string
  filePath: string
  status?: string
}

type PreviewSubMode = 'split' | 'after' | 'before'

export const MarkdownDiffView: React.FC<MarkdownDiffViewProps> = ({
  beforeContent,
  afterContent,
  filePath,
  status
}) => {
  // Default submode is split side-by-side
  const [mode, setMode] = useState<PreviewSubMode>('split')
  const [syncScroll, setSyncScroll] = useState<boolean>(true)
  const [copiedSide, setCopiedSide] = useState<'before' | 'after' | null>(null)

  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef<boolean>(false)

  // Reset mode when file path changes
  useEffect(() => {
    setMode('split')
  }, [filePath])

  // Convert markdown to sanitized HTML
  const renderMarkdown = useCallback((content: string): string => {
    if (!content || !content.trim()) return ''
    try {
      const rawHtml = marked.parse(content) as string
      return DOMPurify.sanitize(rawHtml, {
        ADD_ATTR: ['target', 'rel']
      })
    } catch (err) {
      console.error('Failed to parse markdown:', err)
      return `<p style="color: #f87171;">Failed to render Markdown preview.</p>`
    }
  }, [])

  const beforeHtml = useMemo(() => renderMarkdown(beforeContent), [beforeContent, renderMarkdown])
  const afterHtml = useMemo(() => renderMarkdown(afterContent), [afterContent, renderMarkdown])

  // Handle synchronized scrolling between left and right panes in Split view
  const handleLeftScroll = useCallback(() => {
    if (!syncScroll || isScrollingRef.current || mode !== 'split') return
    const left = leftPaneRef.current
    const right = rightPaneRef.current
    if (!left || !right) return

    const maxLeft = left.scrollHeight - left.clientHeight
    const maxRight = right.scrollHeight - right.clientHeight
    if (maxLeft <= 0 || maxRight <= 0) return

    isScrollingRef.current = true
    const ratio = left.scrollTop / maxLeft
    right.scrollTop = ratio * maxRight

    requestAnimationFrame(() => {
      isScrollingRef.current = false
    })
  }, [syncScroll, mode])

  const handleRightScroll = useCallback(() => {
    if (!syncScroll || isScrollingRef.current || mode !== 'split') return
    const left = leftPaneRef.current
    const right = rightPaneRef.current
    if (!left || !right) return

    const maxLeft = left.scrollHeight - left.clientHeight
    const maxRight = right.scrollHeight - right.clientHeight
    if (maxLeft <= 0 || maxRight <= 0) return

    isScrollingRef.current = true
    const ratio = right.scrollTop / maxRight
    left.scrollTop = ratio * maxLeft

    requestAnimationFrame(() => {
      isScrollingRef.current = false
    })
  }, [syncScroll, mode])

  // Copy raw content handler
  const handleCopy = (text: string, side: 'before' | 'after') => {
    if (window.api?.app?.copyToClipboard) {
      window.api.app.copyToClipboard(text)
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
    }
    setCopiedSide(side)
    setTimeout(() => setCopiedSide(null), 2000)
  }

  // Calculate quick stats
  const getWordCount = (text: string) => {
    if (!text || !text.trim()) return 0
    return text.trim().split(/\s+/).length
  }

  const getLineCount = (text: string) => {
    if (!text) return 0
    return text.split('\n').length
  }

  const activeStats = useMemo(() => {
    if (mode === 'before') {
      return { words: getWordCount(beforeContent), lines: getLineCount(beforeContent) }
    }
    return { words: getWordCount(afterContent), lines: getLineCount(afterContent) }
  }, [mode, beforeContent, afterContent])

  return (
    <div className="md-diff-container" data-testid="markdown-diff-view">
      {/* Sub-toolbar for Markdown Preview controls */}
      <div className="md-diff-toolbar" data-testid="md-diff-toolbar">
        <div className="md-diff-toolbar-left">
          <div className="md-mode-toggle" data-testid="md-mode-toggle">
            <button
              className={`md-mode-btn ${mode === 'split' ? 'active' : ''}`}
              onClick={() => setMode('split')}
              data-tooltip="Side-by-Side Rendered Comparison"
              data-testid="md-mode-split"
            >
              <Columns size={13} />
              <span>Split (Side-by-Side)</span>
            </button>
            <button
              className={`md-mode-btn ${mode === 'after' ? 'active' : ''}`}
              onClick={() => setMode('after')}
              data-tooltip="Rendered Modified Document (Working/Commit)"
              data-testid="md-mode-modified"
            >
              <Eye size={13} />
              <span>Modified (New)</span>
            </button>
            <button
              className={`md-mode-btn ${mode === 'before' ? 'active' : ''}`}
              onClick={() => setMode('before')}
              data-tooltip="Rendered Original Document (Base/HEAD)"
              data-testid="md-mode-original"
            >
              <History size={13} />
              <span>Original (Base)</span>
            </button>
          </div>

          {mode === 'split' && (
            <button
              className={`md-sync-scroll-btn ${syncScroll ? 'active' : ''}`}
              onClick={() => setSyncScroll((prev) => !prev)}
              data-tooltip={syncScroll ? 'Disable Synchronized Scrolling' : 'Enable Synchronized Scrolling'}
              data-testid="md-sync-scroll-btn"
            >
              {syncScroll ? <Link size={13} /> : <Unlink size={13} />}
              <span>{syncScroll ? 'Sync Scroll On' : 'Sync Scroll Off'}</span>
            </button>
          )}
        </div>

        <div className="md-diff-toolbar-right">
          <span className="md-stats-badge" data-testid="md-stats-badge">
            {activeStats.lines} lines • {activeStats.words} words
          </span>
        </div>
      </div>

      {/* Main Preview Area */}
      <div className="md-diff-content">
        {/* Left / Original Pane */}
        {(mode === 'split' || mode === 'before') && (
          <div
            className={`md-diff-pane ${mode === 'before' ? 'full-width' : ''}`}
            data-testid="md-pane-original"
          >
            <div className="md-pane-header">
              <div className="md-pane-title">
                <span className="md-pane-tag original">Original (HEAD / Base)</span>
                {status === 'A' && <span className="md-status-chip added">Not in base</span>}
              </div>
              {beforeContent && (
                <button
                  className="md-pane-copy-btn"
                  onClick={() => handleCopy(beforeContent, 'before')}
                  data-tooltip="Copy Original Markdown Source"
                  data-testid="copy-original-md-btn"
                >
                  {copiedSide === 'before' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSide === 'before' ? 'Copied' : 'Copy MD'}</span>
                </button>
              )}
            </div>

            <div
              ref={leftPaneRef}
              className="md-pane-body"
              onScroll={handleLeftScroll}
            >
              {status === 'A' || !beforeContent.trim() ? (
                <div className="md-empty-placeholder" data-testid="empty-original-placeholder">
                  <FileText size={36} style={{ opacity: 0.3, marginBottom: '10px' }} />
                  <p style={{ fontWeight: 500, fontSize: '13px' }}>Newly Added File</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    File was added in this commit and does not exist in the base version.
                  </p>
                </div>
              ) : (
                <div
                  className="md-rendered-content"
                  data-testid="md-rendered-left"
                  dangerouslySetInnerHTML={{ __html: beforeHtml }}
                />
              )}
            </div>
          </div>
        )}

        {/* Right / Modified Pane */}
        {(mode === 'split' || mode === 'after') && (
          <div
            className={`md-diff-pane ${mode === 'after' ? 'full-width' : ''}`}
            data-testid="md-pane-modified"
          >
            <div className="md-pane-header">
              <div className="md-pane-title">
                <span className="md-pane-tag modified">Modified (Working Tree / Commit)</span>
                {status === 'D' && <span className="md-status-chip deleted">Deleted</span>}
              </div>
              {afterContent && (
                <button
                  className="md-pane-copy-btn"
                  onClick={() => handleCopy(afterContent, 'after')}
                  data-tooltip="Copy Modified Markdown Source"
                  data-testid="copy-modified-md-btn"
                >
                  {copiedSide === 'after' ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copiedSide === 'after' ? 'Copied' : 'Copy MD'}</span>
                </button>
              )}
            </div>

            <div
              ref={rightPaneRef}
              className="md-pane-body"
              onScroll={handleRightScroll}
            >
              {status === 'D' || !afterContent.trim() ? (
                <div className="md-empty-placeholder" data-testid="empty-modified-placeholder">
                  <AlertCircle size={36} style={{ color: '#f87171', opacity: 0.6, marginBottom: '10px' }} />
                  <p style={{ fontWeight: 500, fontSize: '13px', color: '#f87171' }}>File Deleted</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    This file was removed in this revision and has no active content.
                  </p>
                </div>
              ) : (
                <div
                  className="md-rendered-content"
                  data-testid="md-rendered-right"
                  dangerouslySetInnerHTML={{ __html: afterHtml }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
