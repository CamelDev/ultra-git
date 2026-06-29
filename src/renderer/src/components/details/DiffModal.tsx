import React, { useEffect, useState, useRef } from 'react'
import { X, FileText } from 'lucide-react'

interface DiffModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  oldPath?: string
  status: string
  commitHash?: string | null
  repoPath: string
  isActiveChange?: boolean
  isStaged?: boolean
  isStash?: boolean
  stashIndex?: number | null
  stashMessage?: string | null
}

interface DiffItem {
  type: 'normal' | 'add' | 'delete'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
}

interface CharSpan {
  text: string
  highlight: boolean
}

/**
 * Character-level LCS diff between two strings.
 * Returns arrays of spans with `highlight: true` for changed chars.
 */
function computeInlineDiff(
  oldStr: string,
  newStr: string
): { oldSpans: CharSpan[]; newSpans: CharSpan[] } {
  const a = oldStr.split('')
  const b = newStr.split('')
  const m = a.length
  const n = b.length

  // Build LCS DP table (cap size to avoid huge allocations)
  const MAX = 2000
  if (m > MAX || n > MAX) {
    // Fallback: highlight entire lines
    return {
      oldSpans: [{ text: oldStr, highlight: true }],
      newSpans: [{ text: newStr, highlight: true }]
    }
  }

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Back-track to find which chars are in LCS
  const oldInLcs = new Uint8Array(m)
  const newInLcs = new Uint8Array(n)
  let i = m,
    j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      oldInLcs[i - 1] = 1
      newInLcs[j - 1] = 1
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  // Build spans by grouping consecutive chars with same highlight status
  const buildSpans = (chars: string[], inLcs: Uint8Array): CharSpan[] => {
    const spans: CharSpan[] = []
    let cur = ''
    let curHighlight = false
    for (let k = 0; k < chars.length; k++) {
      const h = inLcs[k] === 0 // highlight when NOT in LCS
      if (k === 0) {
        cur = chars[k]
        curHighlight = h
      } else if (h === curHighlight) {
        cur += chars[k]
      } else {
        spans.push({ text: cur, highlight: curHighlight })
        cur = chars[k]
        curHighlight = h
      }
    }
    if (cur.length > 0) spans.push({ text: cur, highlight: curHighlight })
    return spans
  }

  return {
    oldSpans: buildSpans(a, oldInLcs),
    newSpans: buildSpans(b, newInLcs)
  }
}

/**
 * Render a line content with inline char highlights.
 */
function InlineContent({
  spans,
  type
}: {
  spans: CharSpan[]
  type: 'add' | 'delete'
}): React.ReactElement {
  return (
    <pre className="diff-line-content">
      {spans.map((span, i) =>
        span.highlight ? (
          <mark key={i} className={`diff-inline-highlight type-${type}`}>
            {span.text}
          </mark>
        ) : (
          <span key={i}>{span.text}</span>
        )
      )}
    </pre>
  )
}

/**
 * A single visual row in the diff view.
 * Paired delete+add are collapsed into one row (old on left, new on right).
 */
interface RenderRow {
  /** 'normal' = unchanged, 'change' = paired del+add, 'delete' = unpaired del, 'add' = unpaired add */
  rowType: 'normal' | 'change' | 'delete' | 'add'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
  oldSpans?: CharSpan[]
  newSpans?: CharSpan[]
}

/**
 * Convert raw DiffItems into RenderRows.
 * Consecutive delete/add blocks are paired N:M, folding each pair into a single side-by-side row.
 */
function buildRenderRows(diffItems: DiffItem[]): RenderRow[] {
  const rows: RenderRow[] = []
  let i = 0

  while (i < diffItems.length) {
    const item = diffItems[i]

    if (item.type === 'normal') {
      rows.push({
        rowType: 'normal',
        beforeLine: item.beforeLine,
        afterLine: item.afterLine,
        beforeNum: item.beforeNum,
        afterNum: item.afterNum
      })
      i++
      continue
    }

    if (item.type === 'delete') {
      // Collect all consecutive deletes
      const deletes: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'delete') {
        deletes.push(diffItems[i++])
      }
      // Collect all consecutive adds that immediately follow
      const adds: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'add') {
        adds.push(diffItems[i++])
      }

      const maxLen = Math.max(deletes.length, adds.length)
      for (let k = 0; k < maxLen; k++) {
        const del = deletes[k]
        const add = adds[k]
        if (del && add) {
          const { oldSpans, newSpans } = computeInlineDiff(
            del.beforeLine ?? '',
            add.afterLine ?? ''
          )
          rows.push({
            rowType: 'change',
            beforeLine: del.beforeLine,
            afterLine: add.afterLine,
            beforeNum: del.beforeNum,
            afterNum: add.afterNum,
            oldSpans,
            newSpans
          })
        } else if (del) {
          rows.push({
            rowType: 'delete',
            beforeLine: del.beforeLine,
            beforeNum: del.beforeNum
          })
        } else {
          rows.push({
            rowType: 'add',
            afterLine: add.afterLine,
            afterNum: add.afterNum
          })
        }
      }
      continue
    }

    // Standalone add (shouldn't happen after the delete handler above, but safety net)
    if (item.type === 'add') {
      rows.push({
        rowType: 'add',
        afterLine: item.afterLine,
        afterNum: item.afterNum
      })
      i++
    }
  }

  return rows
}

function computeDiff(beforeContent: string, afterContent: string): DiffItem[] {
  const beforeLines = beforeContent === '' ? [] : beforeContent.split(/\r?\n/)
  const afterLines = afterContent === '' ? [] : afterContent.split(/\r?\n/)

  let prefixCount = 0
  while (
    prefixCount < beforeLines.length &&
    prefixCount < afterLines.length &&
    beforeLines[prefixCount] === afterLines[prefixCount]
  ) {
    prefixCount++
  }

  let suffixCount = 0
  while (
    suffixCount < beforeLines.length - prefixCount &&
    suffixCount < afterLines.length - prefixCount &&
    beforeLines[beforeLines.length - 1 - suffixCount] === afterLines[afterLines.length - 1 - suffixCount]
  ) {
    suffixCount++
  }

  const midBefore = beforeLines.slice(prefixCount, beforeLines.length - suffixCount)
  const midAfter = afterLines.slice(prefixCount, afterLines.length - suffixCount)

  // DP on the middle part
  const db: number[][] = Array(midBefore.length + 1)
    .fill(null)
    .map(() => Array(midAfter.length + 1).fill(0))

  for (let i = 1; i <= midBefore.length; i++) {
    for (let j = 1; j <= midAfter.length; j++) {
      if (midBefore[i - 1] === midAfter[j - 1]) {
        db[i][j] = db[i - 1][j - 1] + 1
      } else {
        db[i][j] = Math.max(db[i - 1][j], db[i][j - 1])
      }
    }
  }

  let i = midBefore.length
  let j = midAfter.length
  const midDiff: DiffItem[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && midBefore[i - 1] === midAfter[j - 1]) {
      midDiff.unshift({
        type: 'normal',
        beforeLine: midBefore[i - 1],
        afterLine: midAfter[j - 1],
        beforeNum: prefixCount + i,
        afterNum: prefixCount + j
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || db[i][j - 1] >= db[i - 1][j])) {
      midDiff.unshift({
        type: 'add',
        afterLine: midAfter[j - 1],
        afterNum: prefixCount + j
      })
      j--
    } else {
      midDiff.unshift({
        type: 'delete',
        beforeLine: midBefore[i - 1],
        beforeNum: prefixCount + i
      })
      i--
    }
  }

  const diff: DiffItem[] = []
  // Add prefix
  for (let k = 0; k < prefixCount; k++) {
    diff.push({
      type: 'normal',
      beforeLine: beforeLines[k],
      afterLine: beforeLines[k],
      beforeNum: k + 1,
      afterNum: k + 1
    })
  }

  // Add middle
  diff.push(...midDiff)

  // Add suffix
  for (let k = 0; k < suffixCount; k++) {
    const idxBefore = beforeLines.length - suffixCount + k
    const idxAfter = afterLines.length - suffixCount + k
    diff.push({
      type: 'normal',
      beforeLine: beforeLines[idxBefore],
      afterLine: afterLines[idxAfter],
      beforeNum: idxBefore + 1,
      afterNum: idxAfter + 1
    })
  }

  return diff
}

export const DiffModal: React.FC<DiffModalProps> = ({
  isOpen,
  onClose,
  filePath,
  oldPath,
  status,
  commitHash,
  repoPath,
  isActiveChange,
  isStaged,
  isStash = false,
  stashIndex = null,
  stashMessage = null
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diffItems, setDiffItems] = useState<DiffItem[]>([])
  const [isBinary, setIsBinary] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Stash details files states
  const [stashFiles, setStashFiles] = useState<any[]>([])
  const [stashFilesLoading, setStashFilesLoading] = useState(false)
  const [stashFilesError, setStashFilesError] = useState<string | null>(null)
  const [selectedStashFile, setSelectedStashFile] = useState<any | null>(null)

  // 1. Close on ESC key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // Load stash files list
  useEffect(() => {
    if (!isOpen || !isStash || stashIndex === null || stashIndex === undefined) {
      setStashFiles([])
      setSelectedStashFile(null)
      return
    }

    let isMounted = true
    setStashFilesLoading(true)
    setStashFilesError(null)

    window.api.git.getStashFiles(repoPath, stashIndex)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          setStashFiles(res.data)
          if (res.data.length > 0) {
            setSelectedStashFile(res.data[0])
          }
        } else {
          setStashFilesError(res.error || 'Failed to load stash files')
        }
        setStashFilesLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setStashFilesError(err.message || 'Error loading stash files')
        setStashFilesLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, isStash, stashIndex, repoPath])

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setLoading(true)
    setError(null)

    const targetFilePath = isStash ? selectedStashFile?.path : filePath
    const targetOldPath = isStash ? selectedStashFile?.oldPath : oldPath
    const targetStatus = isStash ? selectedStashFile?.status : status
    const isUntracked = isStash ? selectedStashFile?.isUntracked : false

    if (isStash && !selectedStashFile) {
      setLoading(false)
      setDiffItems([])
      return
    }

    const fetchDiff = isStash
      ? window.api.git.getStashFileDiff(repoPath, stashIndex!, targetFilePath, targetOldPath, targetStatus, isUntracked)
      : isActiveChange
      ? window.api.git.getActiveFileDiff(repoPath, targetFilePath, !!isStaged, targetOldPath)
      : window.api.git.getCommitFileDiff(repoPath, commitHash!, targetFilePath, targetOldPath, targetStatus)

    fetchDiff
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          if (res.data.isBinary) {
            setIsBinary(true)
            setDiffItems([])
          } else {
            setIsBinary(false)
            const computed = computeDiff(res.data.before, res.data.after)
            setDiffItems(computed)
          }
        } else {
          setError(res.error || 'Failed to retrieve diff')
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Error fetching diff')
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [
    isOpen,
    filePath,
    commitHash,
    repoPath,
    isActiveChange,
    isStaged,
    oldPath,
    status,
    isStash,
    stashIndex,
    selectedStashFile
  ])

  // 2. Scroll to the first diff position after loading
  useEffect(() => {
    if (!loading && diffItems.length > 0) {
      const timer = setTimeout(() => {
        if (bodyRef.current) {
          const firstChange = bodyRef.current.querySelector(
              '.diff-row.type-change, .diff-row.type-add, .diff-row.type-delete'
            )
          if (firstChange) {
            firstChange.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        }
      }, 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [loading, diffItems])

  const renderRows = buildRenderRows(diffItems)
  const changeIndexes = renderRows
    .map((row, idx) => ({ rowType: row.rowType, idx }))
    .filter((r) => r.rowType !== 'normal')

  // Overview ruler jump helper
  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const pct = clickY / rect.height
    if (bodyRef.current) {
      const targetScrollTop = pct * bodyRef.current.scrollHeight - bodyRef.current.clientHeight / 2
      bodyRef.current.scrollTop = Math.max(0, targetScrollTop)
    }
  }

  if (!isOpen) return null

  const currentFilePath = isStash ? selectedStashFile?.path || 'No file selected' : filePath
  const currentOldPath = isStash ? selectedStashFile?.oldPath : oldPath
  const currentStatus = isStash ? selectedStashFile?.status : status

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: 'var(--accent-light)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', wordBreak: 'break-all' }}>{currentFilePath}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {currentStatus === 'R' ? `Renamed from ${currentOldPath} | ` : ''}
                {isStash ? (
                  <span>
                    Stash details:{' '}
                    <code
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        backgroundColor: 'var(--bg-tertiary)',
                        padding: '1px 4px',
                        borderRadius: '3px'
                      }}
                    >
                      stash@{stashIndex}
                    </code>{' '}
                    {stashMessage ? `— "${stashMessage}"` : ''}
                  </span>
                ) : isActiveChange ? (
                  <span>{isStaged ? 'Staged changes' : 'Unstaged changes'}</span>
                ) : (
                  <>
                    Commit:{' '}
                    <span style={{ fontFamily: 'monospace' }}>{commitHash?.substring(0, 8)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button className="diff-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="diff-modal-body">
          {isStash && (
            <div
              className="diff-modal-sidebar"
              style={{
                width: '240px',
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--bg-secondary)',
                flexShrink: 0
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                Stash Files
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {stashFilesLoading ? (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '12px'
                    }}
                  >
                    Loading...
                  </div>
                ) : stashFilesError ? (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: '#f87171',
                      fontSize: '12px'
                    }}
                  >
                    {stashFilesError}
                  </div>
                ) : stashFiles.length === 0 ? (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '12px'
                    }}
                  >
                    No files changed
                  </div>
                ) : (
                  stashFiles.map((file) => {
                    const isFileSelected = file.path === selectedStashFile?.path
                    return (
                      <div
                        key={file.path}
                        onClick={() => setSelectedStashFile(file)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: isFileSelected
                            ? 'rgba(99, 102, 241, 0.15)'
                            : 'transparent',
                          transition: 'all 0.15s ease',
                          marginBottom: '2px'
                        }}
                        className="stash-modal-file-item"
                      >
                        <FileText
                          size={13}
                          style={{
                            marginRight: '6px',
                            color: isFileSelected
                              ? 'var(--accent-light)'
                              : 'var(--text-secondary)',
                            flexShrink: 0
                          }}
                        />
                        <span
                          style={{
                            fontSize: '12px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            color: isFileSelected ? 'var(--text-primary)' : 'var(--text-secondary)'
                          }}
                          data-tooltip={file.path}
                        >
                          {file.path}
                        </span>
                        <span
                          className={`file-status status-${file.status.toLowerCase()}`}
                          style={{
                            fontSize: '9px',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: 700,
                            flexShrink: 0
                          }}
                        >
                          {file.status}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div
            ref={bodyRef}
            className="diff-modal-scroll"
            style={{ display: isStash && !selectedStashFile ? 'none' : 'block' }}
          >
            {loading && (
              <div
                style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                Loading file diff...
              </div>
            )}
            {error && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
                Error: {error}
              </div>
            )}
            {!loading && !error && isBinary && (
              <div
                data-testid="binary-file-placeholder"
                style={{
                  padding: '60px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                Binary file (diff not available as text)
              </div>
            )}
            {!loading && !error && !isBinary && (
              <div className="diff-table">
                {renderRows.map((row, idx) => (
                  <div key={idx} className={`diff-row type-${row.rowType}`}>
                    <div className={`diff-col left${row.rowType === 'add' ? ' empty-side' : ''}`}>
                      <span className="diff-line-number">{row.beforeNum || ''}</span>
                      {row.oldSpans ? (
                        <InlineContent spans={row.oldSpans} type="delete" />
                      ) : (
                        <pre className="diff-line-content">{row.beforeLine ?? ''}</pre>
                      )}
                    </div>
                    <div className={`diff-col right${row.rowType === 'delete' ? ' empty-side' : ''}`}>
                      <span className="diff-line-number">{row.afterNum || ''}</span>
                      {row.newSpans ? (
                        <InlineContent spans={row.newSpans} type="add" />
                      ) : (
                        <pre className="diff-line-content">{row.afterLine ?? ''}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!loading && !error && !isBinary && renderRows.length > 0 && (
            <div className="diff-overview-ruler" onClick={handleRulerClick}>
              {changeIndexes.map((change) => {
                const topPct = (change.idx / renderRows.length) * 100
                const isDelete = change.rowType === 'delete'
                const isChange = change.rowType === 'change'
                return (
                  <div
                    key={change.idx}
                    className={`diff-ruler-marker type-${change.rowType}`}
                    style={{
                      position: 'absolute',
                      top: `${topPct}%`,
                      height: '2px',
                      left: isDelete ? '0' : isChange ? '0' : '50%',
                      width: isChange ? '100%' : '50%',
                      background: isChange
                        ? 'linear-gradient(to right, #f87171 50%, #34d399 50%)'
                        : isDelete
                        ? '#f87171'
                        : '#34d399',
                      opacity: 0.8
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
