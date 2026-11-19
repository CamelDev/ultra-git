import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import {
  X,
  History,
  Search,
  Copy,
  Check,
  FileText,
  Layers,
  Code2,
  Eye,
  Loader2,
  GitCommit
} from 'lucide-react'
import type { FileHistoryEntry } from '../../../../shared/fileHistory'
import { filterFileHistoryCommits } from '../../../../shared/fileHistory'
import { buildHunksFromDiffItems, computeDiff, DiffHunk, DiffItem } from '../../utils/patchBuilder'
import { getAuthorColor } from '../../utils/authorColor'
import { useToaster } from '../toaster/ToasterContext'
import { MarkdownDiffView } from './MarkdownDiffView'
import { ImageDiffView } from './ImageDiffView'
import {
  CodeToken,
  isRasterImage,
  isSvg,
  readCodeViewPreference,
  resolveCodeLanguage,
  resolveHunkChangeType,
  resolveRenameLanguages,
  tokenizeCode,
  writeCodeViewPreference
} from './codeView'
import { buildRenderRows, CharSpan } from './diffRows'

interface FileHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string
  filePath: string
  initialCommitHash?: string | null
}

function formatCommitDate(isoDate: string): string {
  if (!isoDate) return ''
  const parsed = new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) return isoDate
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const HistoryLineContent = React.memo(function HistoryLineContent({
  text,
  spans,
  tokens,
  codeView,
  type
}: {
  text: string
  spans?: CharSpan[]
  tokens?: CodeToken[]
  codeView: boolean
  type?: 'add' | 'delete'
}) {
  const hasInlineSpans = Boolean(spans && type && spans.some((s) => s.highlight))

  if (!hasInlineSpans) {
    if (codeView && tokens && tokens.length > 0) {
      return (
        <pre className="diff-line-content code-view-content">
          {tokens.map((token, index) => {
            const value = text.slice(token.start, token.end)
            if (token.type !== 'plain') {
              return (
                <span key={index} className={`diff-token token-${token.type}`}>
                  {value}
                </span>
              )
            }
            return value
          })}
        </pre>
      )
    }
    return <pre className={`diff-line-content${codeView ? ' code-view-content' : ''}`}>{text}</pre>
  }

  const inlineRanges: Array<{ start: number; end: number }> = []
  if (spans && type) {
    let offset = 0
    spans.forEach((span) => {
      if (span.highlight) inlineRanges.push({ start: offset, end: offset + span.text.length })
      offset += span.text.length
    })
  }

  const boundaries = new Set<number>([0, text.length])
  if (codeView) {
    tokens?.forEach((token) => {
      boundaries.add(token.start)
      boundaries.add(token.end)
    })
  }
  inlineRanges.forEach((range) => {
    boundaries.add(range.start)
    boundaries.add(range.end)
  })
  const points = [...boundaries].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b)

  const elements = points.slice(0, -1).map((start, index) => {
    const end = points[index + 1]
    const value = text.slice(start, end)
    const inline = inlineRanges.some((range) => range.start <= start && range.end >= end)
    const token = codeView ? tokens?.find((c) => c.start <= start && c.end >= end) : undefined
    let node: React.ReactNode = value
    if (token && token.type !== 'plain') {
      node = <span className={`diff-token token-${token.type}`}>{node}</span>
    }
    if (inline && type) {
      node = <mark className={`diff-inline-highlight type-${type}`}>{node}</mark>
    }
    return <React.Fragment key={`${start}-${end}`}>{node}</React.Fragment>
  })

  return <pre className={`diff-line-content${codeView ? ' code-view-content' : ''}`}>{elements}</pre>
})

export const FileHistoryModal: React.FC<FileHistoryModalProps> = ({
  isOpen,
  onClose,
  repoPath,
  filePath,
  initialCommitHash
}) => {
  const { addToast } = useToaster()

  const [commits, setCommits] = useState<FileHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffItems, setDiffItems] = useState<DiffItem[]>([])
  const [rawBefore, setRawBefore] = useState('')
  const [rawAfter, setRawAfter] = useState('')
  const [isBinary, setIsBinary] = useState(false)

  const [diffExtent, setDiffExtent] = useState<'chunks' | 'full'>('chunks')
  const [isPreviewActive, setPreviewActive] = useState(() => Boolean(filePath && (isRasterImage(filePath) || isSvg(filePath))))
  const [codeViewEnabled, setCodeViewEnabled] = useState(() =>
    readCodeViewPreference(typeof window === 'undefined' ? undefined : window.localStorage)
  )

  const diffCacheRef = useRef<
    Map<string, { isBinary: boolean; diffItems: DiffItem[]; rawBefore: string; rawAfter: string }>
  >(new Map())
  const diffRequestIdRef = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const diffBodyRef = useRef<HTMLDivElement>(null)

  const filteredCommits = useMemo(
    () => filterFileHistoryCommits(commits, searchQuery),
    [commits, searchQuery]
  )

  const selectedCommit = useMemo(() => {
    if (filteredCommits.length === 0) return null
    return filteredCommits.find((c) => c.hash === selectedHash) || filteredCommits[0]
  }, [filteredCommits, selectedHash])

  // Load file history when modal opens
  useEffect(() => {
    if (!isOpen || !repoPath || !filePath) {
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    setHistoryError(null)
    setSearchQuery('')
    diffCacheRef.current.clear()

    window.api.git
      .getFileHistory(repoPath, filePath, 200)
      .then((res) => {
        if (cancelled) return
        if (res.success && Array.isArray(res.data)) {
          setCommits(res.data)
          if (res.data.length > 0) {
            const preferred =
              initialCommitHash && res.data.some((c) => c.hash === initialCommitHash)
                ? initialCommitHash
                : res.data[0].hash
            setSelectedHash(preferred)
          } else {
            setSelectedHash(null)
          }
        } else {
          setCommits([])
          setSelectedHash(null)
          setHistoryError(res.error || 'Failed to load file history')
        }
        setHistoryLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setCommits([])
        setSelectedHash(null)
        setHistoryError(err?.message || 'Error loading file history')
        setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, repoPath, filePath, initialCommitHash])

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setCommits([])
      setSelectedHash(null)
      setSearchQuery('')
      setHistoryError(null)
      setDiffError(null)
      setDiffItems([])
      setRawBefore('')
      setRawAfter('')
      setIsBinary(false)
      setCopiedHash(null)
      diffCacheRef.current.clear()
    }
  }, [isOpen])

  // Keep preview mode synced with file type
  useEffect(() => {
    if (isOpen) {
      setPreviewActive(Boolean(filePath && (isRasterImage(filePath) || isSvg(filePath))))
    }
  }, [isOpen, filePath])

  // Load diff for the selected commit
  useEffect(() => {
    if (!isOpen || !selectedCommit) {
      setDiffLoading(false)
      setDiffError(null)
      setDiffItems([])
      setRawBefore('')
      setRawAfter('')
      setIsBinary(false)
      return
    }

    const cacheKey = `${repoPath}:${selectedCommit.hash}:${selectedCommit.filePath}:${selectedCommit.oldPath || ''}:${selectedCommit.status}`
    const cached = diffCacheRef.current.get(cacheKey)
    if (cached) {
      setIsBinary(cached.isBinary)
      setDiffItems(cached.diffItems)
      setRawBefore(cached.rawBefore)
      setRawAfter(cached.rawAfter)
      setDiffError(null)
      setDiffLoading(false)
      return
    }

    const requestId = ++diffRequestIdRef.current
    setDiffLoading(true)
    setDiffError(null)

    window.api.git
      .getCommitFileDiff(
        repoPath,
        selectedCommit.hash,
        selectedCommit.filePath,
        selectedCommit.oldPath,
        selectedCommit.status
      )
      .then((res) => {
        if (diffRequestIdRef.current !== requestId) return
        if (res.success && res.data) {
          if (res.data.isBinary) {
            const entry = {
              isBinary: true,
              diffItems: [] as DiffItem[],
              rawBefore: res.data.before || '',
              rawAfter: res.data.after || ''
            }
            diffCacheRef.current.set(cacheKey, entry)
            setIsBinary(true)
            setDiffItems([])
            setRawBefore(entry.rawBefore)
            setRawAfter(entry.rawAfter)
          } else {
            const beforeStr = res.data.before || ''
            const afterStr = res.data.after || ''
            const computed = computeDiff(beforeStr, afterStr)
            const entry = {
              isBinary: false,
              diffItems: computed,
              rawBefore: beforeStr,
              rawAfter: afterStr
            }
            diffCacheRef.current.set(cacheKey, entry)
            setIsBinary(false)
            setRawBefore(beforeStr)
            setRawAfter(afterStr)
            setDiffItems(computed)
          }
        } else {
          setDiffError(res.error || 'Failed to load diff for commit')
        }
        setDiffLoading(false)
      })
      .catch((err) => {
        if (diffRequestIdRef.current !== requestId) return
        setDiffError(err?.message || 'Error loading diff for commit')
        setDiffLoading(false)
      })
  }, [isOpen, repoPath, selectedCommit])

  // Keyboard shortcuts: Escape closes modal; ArrowUp/ArrowDown navigate commits
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
        document.activeElement !== searchInputRef.current &&
        filteredCommits.length > 0
      ) {
        e.preventDefault()
        e.stopPropagation()
        const currentIdx = filteredCommits.findIndex((c) => c.hash === selectedCommit?.hash)
        const baseIdx = currentIdx >= 0 ? currentIdx : 0
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(filteredCommits.length - 1, baseIdx + 1)
            : Math.max(0, baseIdx - 1)
        setSelectedHash(filteredCommits[nextIdx].hash)
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose, filteredCommits, selectedCommit])

  const handleCopyHash = useCallback(
    async (hash: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation()
      try {
        if (window.api?.app?.copyToClipboard) {
          await window.api.app.copyToClipboard(hash)
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(hash)
        }
        setCopiedHash(hash)
        addToast({
          variant: 'success',
          title: 'Commit Hash Copied',
          message: hash.substring(0, 8)
        })
        setTimeout(() => {
          setCopiedHash((prev) => (prev === hash ? null : prev))
        }, 2000)
      } catch {
        addToast({
          variant: 'error',
          title: 'Copy Failed',
          message: 'Could not copy commit hash to clipboard'
        })
      }
    },
    [addToast]
  )

  const activeFilePath = selectedCommit?.filePath || filePath
  const activeOldPath = selectedCommit?.oldPath
  const activeStatus = selectedCommit?.status || 'M'

  const isMarkdown = useMemo(
    () => Boolean(activeFilePath && /\.(md|markdown|mdown|mkdn|mdx)$/i.test(activeFilePath)),
    [activeFilePath]
  )
  const isImage = useMemo(
    () => Boolean(activeFilePath && (isRasterImage(activeFilePath) || isSvg(activeFilePath))),
    [activeFilePath]
  )
  const isRaster = useMemo(() => Boolean(activeFilePath && isRasterImage(activeFilePath)), [activeFilePath])
  const supportsCodeView = !isRaster && !isBinary && Boolean(activeFilePath) && resolveCodeLanguage(activeFilePath) !== 'text'
  const viewMode: 'chunks' | 'full' | 'preview' = isPreviewActive ? 'preview' : diffExtent

  const hunks: DiffHunk[] = useMemo(() => buildHunksFromDiffItems(diffItems), [diffItems])
  const renderRows = useMemo(() => buildRenderRows(diffItems), [diffItems])
  const codeLanguages = useMemo(
    () => resolveRenameLanguages(activeOldPath || activeFilePath, activeFilePath),
    [activeOldPath, activeFilePath]
  )
  const beforeCodeLines = useMemo(
    () => tokenizeCode(rawBefore, codeLanguages.before),
    [rawBefore, codeLanguages.before]
  )
  const afterCodeLines = useMemo(
    () => tokenizeCode(rawAfter, codeLanguages.after),
    [rawAfter, codeLanguages.after]
  )

  const hunkByStartDiffIdx = useMemo(() => {
    const map = new Map<number, { hunk: DiffHunk; hunkIdx: number }>()
    hunks.forEach((hunk, hunkIdx) => {
      if (hunk.lines.length > 0) {
        map.set(hunk.lines[0].indexInDiff, { hunk, hunkIdx })
      }
    })
    return map
  }, [hunks])

  const handleToggleCodeView = useCallback(() => {
    if (isPreviewActive) {
      setPreviewActive(false)
      setCodeViewEnabled(true)
      writeCodeViewPreference(true, typeof window === 'undefined' ? undefined : window.localStorage)
      return
    }
    const next = !codeViewEnabled
    setCodeViewEnabled(next)
    writeCodeViewPreference(next, typeof window === 'undefined' ? undefined : window.localStorage)
  }, [codeViewEnabled, isPreviewActive])

  if (!isOpen) return null

  return (
    <div
      className="file-history-modal-overlay"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      data-testid="file-history-modal"
    >
      <div className="file-history-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="file-history-modal-header">
          <div className="file-history-title-group">
            <History size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
            <span className="file-history-title">File History</span>
            <span className="file-history-path-pill" title={filePath} data-testid="file-history-file-path">
              <FileText size={12} />
              <span>{filePath}</span>
            </span>
            {!historyLoading && (
              <span className="file-history-count-badge" data-testid="file-history-count">
                {searchQuery.trim()
                  ? `${filteredCommits.length} of ${commits.length} commits`
                  : `${commits.length} ${commits.length === 1 ? 'commit' : 'commits'}`}
              </span>
            )}
          </div>
          <button
            className="diff-modal-close"
            onClick={onClose}
            data-tooltip="Close File History (Escape)"
            data-testid="file-history-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Split Body: Left Commit List + Right Diff Pane */}
        <div className="file-history-body">
          {/* Left Pane: Search + Commits */}
          <div className="file-history-sidebar" data-testid="file-history-sidebar">
            <div className="file-history-search-box">
              <Search size={13} className="file-history-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="file-history-search-input"
                placeholder="Search message, author, or hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="file-history-search-input"
              />
              {searchQuery && (
                <button
                  className="file-history-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  data-testid="file-history-search-clear"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="file-history-commit-list" data-testid="file-history-commit-list">
              {historyLoading ? (
                <div className="file-history-empty-state">
                  <Loader2 size={16} className="spinning" />
                  <span>Loading file history...</span>
                </div>
              ) : historyError ? (
                <div className="file-history-empty-state error">{historyError}</div>
              ) : filteredCommits.length === 0 ? (
                <div className="file-history-empty-state" data-testid="file-history-empty">
                  <GitCommit size={18} style={{ opacity: 0.5 }} />
                  <span>
                    {commits.length === 0
                      ? 'No commit history found for this file.'
                      : 'No commits match your search.'}
                  </span>
                </div>
              ) : (
                filteredCommits.map((commit) => {
                  const isSelected = selectedCommit?.hash === commit.hash
                  const isCopied = copiedHash === commit.hash
                  const authorColor = getAuthorColor(commit.authorName, commit.authorEmail)

                  return (
                    <div
                      key={commit.hash}
                      className={`file-history-commit-item${isSelected ? ' active' : ''}`}
                      onClick={() => setSelectedHash(commit.hash)}
                      data-testid="file-history-commit-item"
                      data-commit-hash={commit.hash}
                    >
                      <div className="file-history-commit-top">
                        <span className="file-history-commit-message" title={commit.message}>
                          {commit.message}
                        </span>
                        <span
                          className={`file-history-status-badge status-${commit.status.toLowerCase()}`}
                          title={`Status: ${commit.status}`}
                        >
                          {commit.status}
                        </span>
                      </div>

                      <div className="file-history-commit-meta">
                        <span
                          className="file-history-author"
                          title={commit.authorEmail ? `${commit.authorName} <${commit.authorEmail}>` : commit.authorName}
                        >
                          <span
                            className="file-history-author-dot"
                            style={{ backgroundColor: authorColor.color }}
                          />
                          <span className="file-history-author-name">{commit.authorName}</span>
                        </span>
                        <span className="file-history-date">{formatCommitDate(commit.date)}</span>
                      </div>

                      <div className="file-history-commit-footer">
                        <code className="file-history-hash">{commit.hash.substring(0, 7)}</code>
                        <button
                          className={`file-history-copy-btn${isCopied ? ' copied' : ''}`}
                          onClick={(e) => void handleCopyHash(commit.hash, e)}
                          title={isCopied ? 'Copied full commit hash!' : `Copy full hash (${commit.hash})`}
                          aria-label={`Copy commit hash ${commit.hash.substring(0, 7)}`}
                          data-testid="file-history-copy-hash-btn"
                        >
                          {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          <span>{isCopied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Right Pane: Diff View */}
          <div className="file-history-diff-pane" data-testid="file-history-diff-pane">
            {selectedCommit ? (
              <>
                <div className="file-history-diff-header">
                  <div className="file-history-diff-commit-info">
                    <div className="file-history-diff-message" title={selectedCommit.message}>
                      {selectedCommit.message}
                    </div>
                    <div className="file-history-diff-submeta">
                      <span>{selectedCommit.authorName}</span>
                      {selectedCommit.authorEmail && (
                        <span style={{ opacity: 0.7 }}>&lt;{selectedCommit.authorEmail}&gt;</span>
                      )}
                      <span>•</span>
                      <span>{formatCommitDate(selectedCommit.date)}</span>
                      {selectedCommit.status === 'R' && selectedCommit.oldPath && (
                        <>
                          <span>•</span>
                          <span>
                            Renamed from <code>{selectedCommit.oldPath}</code>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="file-history-diff-controls">
                    <div className="file-history-header-hash-group">
                      <code className="file-history-header-hash" data-testid="file-history-selected-hash">
                        {selectedCommit.hash.substring(0, 8)}
                      </code>
                      <button
                        className={`file-history-header-copy-btn${copiedHash === selectedCommit.hash ? ' copied' : ''}`}
                        onClick={() => void handleCopyHash(selectedCommit.hash)}
                        title="Copy full commit hash"
                        data-testid="file-history-header-copy-hash-btn"
                      >
                        {copiedHash === selectedCommit.hash ? <Check size={12} /> : <Copy size={12} />}
                        <span>{copiedHash === selectedCommit.hash ? 'Copied!' : 'Copy Hash'}</span>
                      </button>
                    </div>

                    {(isMarkdown || isImage) && (
                      <button
                        className={`diff-dedicated-preview-btn ${viewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setPreviewActive((prev) => !prev)}
                        data-testid="file-history-toggle-preview-btn"
                      >
                        <Eye size={13} />
                        <span>Preview</span>
                      </button>
                    )}

                    {supportsCodeView && (
                      <button
                        className={`diff-code-view-btn ${codeViewEnabled && viewMode !== 'preview' ? 'active' : ''}`}
                        onClick={handleToggleCodeView}
                        aria-pressed={codeViewEnabled && viewMode !== 'preview'}
                        data-testid="file-history-toggle-code-view-btn"
                      >
                        <Code2 size={13} />
                        <span>Code view</span>
                      </button>
                    )}

                    {renderRows.length > 0 && !diffLoading && !diffError && !isBinary && (
                      <div className="diff-view-toggle">
                        <button
                          className={`diff-view-toggle-btn ${viewMode === 'chunks' ? 'active' : ''}`}
                          onClick={() => {
                            setDiffExtent('chunks')
                            setPreviewActive(false)
                          }}
                          data-testid="file-history-toggle-chunks-btn"
                        >
                          <Layers size={13} />
                          <span>Chunks</span>
                        </button>
                        <button
                          className={`diff-view-toggle-btn ${viewMode === 'full' ? 'active' : ''}`}
                          onClick={() => {
                            setDiffExtent('full')
                            setPreviewActive(false)
                          }}
                          data-testid="file-history-toggle-full-btn"
                        >
                          <FileText size={13} />
                          <span>Full File</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {diffLoading && (
                  <div
                    style={{
                      height: '2px',
                      width: '100%',
                      backgroundColor: 'var(--accent-color, #3b82f6)',
                      opacity: 0.85
                    }}
                  />
                )}

                <div
                  ref={diffBodyRef}
                  className={`diff-modal-scroll ${viewMode === 'preview' ? 'preview-mode' : ''}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                >
                  {diffLoading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Loading commit diff...
                    </div>
                  ) : diffError ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
                      Error: {diffError}
                    </div>
                  ) : isBinary && !isImage && viewMode !== 'preview' ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Binary file (diff not available as text)
                    </div>
                  ) : isImage && (viewMode === 'preview' || isBinary) ? (
                    <ImageDiffView
                      beforeContent={rawBefore}
                      afterContent={rawAfter}
                      filePath={activeFilePath}
                      status={activeStatus}
                    />
                  ) : viewMode === 'preview' && isMarkdown ? (
                    <MarkdownDiffView
                      beforeContent={rawBefore}
                      afterContent={rawAfter}
                      filePath={activeFilePath}
                      status={activeStatus}
                    />
                  ) : (
                    <div className={`diff-table extent-${viewMode}${codeViewEnabled ? ' code-view' : ''}`}>
                      {renderRows.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No changes to display for this commit
                        </div>
                      ) : viewMode === 'chunks' && hunks.length > 0 ? (
                        hunks.map((hunk, hunkIdx) => {
                          const hunkIndices = new Set(hunk.lines.map((l) => l.indexInDiff))
                          const hunkRows = renderRows.filter((row) =>
                            row.diffIndices.some((idx) => hunkIndices.has(idx))
                          )
                          const rowsToRender = hunkRows.length > 0 ? hunkRows : renderRows
                          const hunkChangeType = resolveHunkChangeType(hunk.lines, rowsToRender)

                          return (
                            <div
                              key={`history-hunk-${hunkIdx}`}
                              className={`diff-hunk-block hunk-type-${hunkChangeType}`}
                            >
                              <div className="diff-hunk-header">
                                <div className="diff-hunk-title">
                                  <Layers size={14} />
                                  <span>{hunk.header}</span>
                                  <span style={{ opacity: 0.6, fontSize: '11px' }}>
                                    (Chunk {hunkIdx + 1} of {hunks.length})
                                  </span>
                                </div>
                              </div>

                              {rowsToRender.map((row, rowIdx) => (
                                <div key={`history-row-${hunkIdx}-${rowIdx}`} className={`diff-row type-${row.rowType}`}>
                                  <div className={`diff-col left${row.rowType === 'add' ? ' empty-side' : ''}`}>
                                    <span className="diff-line-number">{row.beforeNum || ''}</span>
                                    <HistoryLineContent
                                      text={row.beforeLine ?? ''}
                                      spans={row.oldSpans}
                                      tokens={row.beforeNum ? beforeCodeLines[row.beforeNum - 1]?.tokens : undefined}
                                      codeView={codeViewEnabled}
                                      type="delete"
                                    />
                                  </div>
                                  <div className={`diff-col right${row.rowType === 'delete' ? ' empty-side' : ''}`}>
                                    <span className="diff-line-number">{row.afterNum || ''}</span>
                                    <HistoryLineContent
                                      text={row.afterLine ?? ''}
                                      spans={row.newSpans}
                                      tokens={row.afterNum ? afterCodeLines[row.afterNum - 1]?.tokens : undefined}
                                      codeView={codeViewEnabled}
                                      type="add"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })
                      ) : (
                        renderRows.map((row, rowIdx) => {
                          let matchingHunk: { hunk: DiffHunk; hunkIdx: number } | undefined
                          for (let d = 0; d < row.diffIndices.length; d++) {
                            const found = hunkByStartDiffIdx.get(row.diffIndices[d])
                            if (found) {
                              matchingHunk = found
                              break
                            }
                          }
                          return (
                            <React.Fragment key={`history-full-row-${rowIdx}`}>
                              {matchingHunk && (
                                <div className="diff-hunk-header">
                                  <div className="diff-hunk-title">
                                    <Layers size={14} />
                                    <span>{matchingHunk.hunk.header}</span>
                                    <span style={{ opacity: 0.6, fontSize: '11px' }}>
                                      (Chunk {matchingHunk.hunkIdx + 1} of {hunks.length})
                                    </span>
                                  </div>
                                </div>
                              )}
                              <div className={`diff-row type-${row.rowType}`}>
                                <div className={`diff-col left${row.rowType === 'add' ? ' empty-side' : ''}`}>
                                  <span className="diff-line-number">{row.beforeNum || ''}</span>
                                  <HistoryLineContent
                                    text={row.beforeLine ?? ''}
                                    spans={row.oldSpans}
                                    tokens={row.beforeNum ? beforeCodeLines[row.beforeNum - 1]?.tokens : undefined}
                                    codeView={codeViewEnabled}
                                    type="delete"
                                  />
                                </div>
                                <div className={`diff-col right${row.rowType === 'delete' ? ' empty-side' : ''}`}>
                                  <span className="diff-line-number">{row.afterNum || ''}</span>
                                  <HistoryLineContent
                                    text={row.afterLine ?? ''}
                                    spans={row.newSpans}
                                    tokens={row.afterNum ? afterCodeLines[row.afterNum - 1]?.tokens : undefined}
                                    codeView={codeViewEnabled}
                                    type="add"
                                  />
                                </div>
                              </div>
                            </React.Fragment>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="file-history-empty-state" style={{ flex: 1 }}>
                <History size={24} style={{ opacity: 0.4 }} />
                <span>
                  {historyLoading
                    ? 'Loading file history...'
                    : 'Select a commit on the left to inspect its diff.'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
