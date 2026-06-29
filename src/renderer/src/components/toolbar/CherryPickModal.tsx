import React, { useEffect, useState, useRef } from 'react'
import { X, FileText, Copy, AlertTriangle, GitCommit, GitBranch } from 'lucide-react'

interface CherryPickModalProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string
  branches: {
    local: Array<{ name: string; ahead: number; behind: number } | string>
    remote: string[]
  } | null
  currentBranch: string
  onCherryPickInitiated: (conflictedFiles: Array<{ path: string; status: string }>, isCherryPick: boolean) => void
  onSuccess: () => void
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

function computeInlineDiff(
  oldStr: string,
  newStr: string
): { oldSpans: CharSpan[]; newSpans: CharSpan[] } {
  const a = oldStr.split('')
  const b = newStr.split('')
  const m = a.length
  const n = b.length
  const MAX = 2000
  if (m > MAX || n > MAX) {
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
  const buildSpans = (chars: string[], inLcs: Uint8Array): CharSpan[] => {
    const spans: CharSpan[] = []
    let cur = ''
    let curHighlight = false
    for (let k = 0; k < chars.length; k++) {
      const h = inLcs[k] === 0
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

interface RenderRow {
  rowType: 'normal' | 'change' | 'delete' | 'add'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
  oldSpans?: CharSpan[]
  newSpans?: CharSpan[]
}

function buildRenderRows(diffItems: DiffItem[]): RenderRow[] {
  const rows: RenderRow[] = []
  let i = 0
  while (i < diffItems.length) {
    const item = diffItems[i]
    if (item.type === 'normal') {
      rows.push({ rowType: 'normal', beforeLine: item.beforeLine, afterLine: item.afterLine, beforeNum: item.beforeNum, afterNum: item.afterNum })
      i++
      continue
    }
    if (item.type === 'delete') {
      const deletes: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'delete') deletes.push(diffItems[i++])
      const adds: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'add') adds.push(diffItems[i++])
      const maxLen = Math.max(deletes.length, adds.length)
      for (let k = 0; k < maxLen; k++) {
        const del = deletes[k]
        const add = adds[k]
        if (del && add) {
          const { oldSpans, newSpans } = computeInlineDiff(del.beforeLine ?? '', add.afterLine ?? '')
          rows.push({ rowType: 'change', beforeLine: del.beforeLine, afterLine: add.afterLine, beforeNum: del.beforeNum, afterNum: add.afterNum, oldSpans, newSpans })
        } else if (del) {
          rows.push({ rowType: 'delete', beforeLine: del.beforeLine, beforeNum: del.beforeNum })
        } else {
          rows.push({ rowType: 'add', afterLine: add.afterLine, afterNum: add.afterNum })
        }
      }
      continue
    }
    if (item.type === 'add') {
      rows.push({ rowType: 'add', afterLine: item.afterLine, afterNum: item.afterNum })
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
  for (let k = 0; k < prefixCount; k++) {
    diff.push({
      type: 'normal',
      beforeLine: beforeLines[k],
      afterLine: beforeLines[k],
      beforeNum: k + 1,
      afterNum: k + 1
    })
  }
  diff.push(...midDiff)
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

export const CherryPickModal: React.FC<CherryPickModalProps> = ({
  isOpen,
  onClose,
  repoPath,
  branches,
  currentBranch,
  onCherryPickInitiated,
  onSuccess
}) => {
  const [selectedBranch, setSelectedBranch] = useState('')
  const [commits, setCommits] = useState<any[]>([])
  const [selectedCommitHash, setSelectedCommitHash] = useState<string | null>(null)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [commitsError, setCommitsError] = useState<string | null>(null)

  const [files, setFiles] = useState<any[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<any | null>(null)

  const [diffItems, setDiffItems] = useState<DiffItem[]>([])
  const [isBinary, setIsBinary] = useState(false)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  const [cherryPickLoading, setCherryPickLoading] = useState(false)
  const [cherryPickError, setCherryPickError] = useState<string | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)

  // 1. Reset/populate initial branch
  useEffect(() => {
    if (!isOpen || !branches) return

    const localNames = (branches.local || []).map((b) => (typeof b === 'string' ? b : b.name))
    const remoteNames = branches.remote || []
    const all = [...localNames, ...remoteNames]

    // Select the first branch that is not the current branch
    const defaultBranch = all.find((b) => b !== currentBranch) || all[0] || ''
    setSelectedBranch(defaultBranch)
    setCherryPickError(null)
  }, [isOpen, branches, currentBranch])

  // 2. Fetch commits when selected branch changes
  useEffect(() => {
    if (!isOpen || !selectedBranch) {
      setCommits([])
      setSelectedCommitHash(null)
      return
    }

    let isMounted = true
    setCommitsLoading(true)
    setCommitsError(null)

    window.api.git
      .getBranchCommits(repoPath, selectedBranch, 50)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          setCommits(res.data)
          if (res.data.length > 0) {
            setSelectedCommitHash(res.data[0].hash)
          } else {
            setSelectedCommitHash(null)
          }
        } else {
          setCommitsError(res.error || 'Failed to load branch commits')
        }
        setCommitsLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setCommitsError(err.message || 'Error loading commits')
        setCommitsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, selectedBranch, repoPath])

  // 3. Fetch changed files when selected commit changes
  useEffect(() => {
    if (!isOpen || !selectedCommitHash) {
      setFiles([])
      setSelectedFile(null)
      return
    }

    let isMounted = true
    setFilesLoading(true)

    window.api.git
      .getCommitFiles(repoPath, selectedCommitHash)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          setFiles(res.data)
          if (res.data.length > 0) {
            setSelectedFile(res.data[0])
          } else {
            setSelectedFile(null)
          }
        } else {
          setFiles([])
          setSelectedFile(null)
        }
        setFilesLoading(false)
      })
      .catch(() => {
        if (!isMounted) return
        setFiles([])
        setSelectedFile(null)
        setFilesLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, selectedCommitHash, repoPath])

  // 4. Fetch diff for selected file
  useEffect(() => {
    if (!isOpen || !selectedCommitHash || !selectedFile) {
      setDiffItems([])
      return
    }

    let isMounted = true
    setDiffLoading(true)
    setDiffError(null)

    window.api.git
      .getCommitFileDiff(
        repoPath,
        selectedCommitHash,
        selectedFile.path,
        selectedFile.oldPath,
        selectedFile.status
      )
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          if (res.data.isBinary) {
            setIsBinary(true)
            setDiffItems([])
          } else {
            setIsBinary(false)
            setDiffItems(computeDiff(res.data.before, res.data.after))
          }
        } else {
          setDiffError(res.error || 'Failed to get diff')
        }
        setDiffLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setDiffError(err.message || 'Error fetching diff')
        setDiffLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, selectedCommitHash, selectedFile, repoPath])

  // 5. Scroll to first diff change
  useEffect(() => {
    if (!diffLoading && diffItems.length > 0) {
      const timer = setTimeout(() => {
        if (bodyRef.current) {
          const firstChange = bodyRef.current.querySelector('.diff-row.type-add, .diff-row.type-delete')
          if (firstChange) {
            firstChange.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        }
      }, 100)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [diffLoading, diffItems])

  // ESC key to close
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const localNames = (branches?.local || []).map((b) => (typeof b === 'string' ? b : b.name))
  const remoteNames = branches?.remote || []

  const handleCherryPick = async () => {
    if (!selectedCommitHash) return
    setCherryPickLoading(true)
    setCherryPickError(null)

    try {
      const res = await window.api.git.cherryPick(repoPath, selectedCommitHash)
      if (res.success) {
        if (res.data?.hadConflicts) {
          const cfRes = await window.api.git.getConflictedFiles(repoPath)
          if (cfRes.success && cfRes.data) {
            onCherryPickInitiated(cfRes.data, true)
          }
        } else {
          onSuccess()
        }
        onClose()
      } else {
        setCherryPickError(res.error || 'Cherry-pick failed')
      }
    } catch (err: any) {
      setCherryPickError(err.message || 'Error occurred during cherry-pick')
    } finally {
      setCherryPickLoading(false)
    }
  }

  const renderRows = buildRenderRows(diffItems)
  const changeIndexes = renderRows
    .map((row, idx) => ({ rowType: row.rowType, idx }))
    .filter((r) => r.rowType !== 'normal')

  const handleRulerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const pct = clickY / rect.height
    if (bodyRef.current) {
      const targetScrollTop = pct * bodyRef.current.scrollHeight - bodyRef.current.clientHeight / 2
      bodyRef.current.scrollTop = Math.max(0, targetScrollTop)
    }
  }

  return (
    <div className="diff-modal-overlay" style={{ zIndex: 1100 }} onClick={onClose}>
      <div
        className="diff-modal-content"
        style={{
          width: '85vw',
          maxWidth: '1000px',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '10px',
          overflow: 'hidden',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Copy size={16} style={{ color: 'var(--accent-light)' }} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Cherry Pick Commit
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
            data-testid="cherry-pick-modal-close"
            data-tooltip="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selection Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'var(--bg-primary)',
            flexWrap: 'wrap'
          }}
        >
          {/* Branch select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={14} style={{ color: 'var(--text-secondary)' }} />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              style={{
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                borderRadius: '6px',
                padding: '6px 10px',
                outline: 'none',
                fontSize: '13px'
              }}
              data-testid="cherry-pick-branch-select"
            >
              <optgroup label="Local Branches">
                {localNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
              {remoteNames.length > 0 && (
                <optgroup label="Remote Branches">
                  {remoteNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Commit select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <GitCommit size={14} style={{ color: 'var(--text-secondary)' }} />
            {commitsLoading ? (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading commits...</span>
            ) : commitsError ? (
              <span style={{ fontSize: '12px', color: '#f87171' }}>{commitsError}</span>
            ) : commits.length === 0 ? (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No commits found</span>
            ) : (
              <select
                value={selectedCommitHash || ''}
                onChange={(e) => setSelectedCommitHash(e.target.value)}
                style={{
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  outline: 'none',
                  fontSize: '13px',
                  flex: 1,
                  maxWidth: '500px'
                }}
                data-testid="cherry-pick-commit-select"
              >
                {commits.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    [{c.hash.substring(0, 7)}] {c.message} (by {c.author_name})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Cherry Pick action */}
          <button
            onClick={handleCherryPick}
            disabled={!selectedCommitHash || cherryPickLoading}
            data-tooltip="Cherry pick selected commit into current branch"
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: 'var(--accent-light)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: (!selectedCommitHash || cherryPickLoading) ? 'not-allowed' : 'pointer',
              opacity: (!selectedCommitHash || cherryPickLoading) ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginLeft: 'auto'
            }}
            data-testid="cherry-pick-action-btn"
          >
            {cherryPickLoading ? 'Cherry picking...' : 'Cherry Pick'}
          </button>
        </div>

        {/* Error Alert */}
        {cherryPickError && (
          <div
            style={{
              padding: '10px 20px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            data-testid="cherry-pick-error-alert"
          >
            <AlertTriangle size={14} />
            <span>{cherryPickError}</span>
          </div>
        )}

        {/* Main Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
          {/* File list sidebar */}
          <div
            className="diff-modal-sidebar"
            style={{
              width: '260px',
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
              Changed Files
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {filesLoading ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  Loading changed files...
                </div>
              ) : files.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                  No files changed
                </div>
              ) : (
                files.map((file) => {
                  const isFileSelected = file.path === selectedFile?.path
                  return (
                    <div
                      key={file.path}
                      onClick={() => setSelectedFile(file)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: isFileSelected ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        transition: 'all 0.15s ease',
                        marginBottom: '2px'
                      }}
                      className="stash-modal-file-item"
                      data-testid={`cherry-pick-file-${file.path}`}
                    >
                      <FileText
                        size={13}
                        style={{
                          marginRight: '6px',
                          color: isFileSelected ? 'var(--accent-light)' : 'var(--text-secondary)',
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

          {/* Diff viewer */}
          <div
            ref={bodyRef}
            className="diff-modal-scroll"
            style={{ flex: 1, overflowY: 'auto', display: !selectedFile ? 'none' : 'block' }}
          >
            {diffLoading && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading file diff...
              </div>
            )}
            {diffError && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
                Error: {diffError}
              </div>
            )}
            {!diffLoading && !diffError && isBinary && (
              <div
                style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}
                data-testid="cherry-pick-binary-placeholder"
              >
                Binary file (diff not available as text)
              </div>
            )}
            {!diffLoading && !diffError && !isBinary && (
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

          {/* Scrollbar ruler markers */}
          {!diffLoading && !diffError && !isBinary && renderRows.length > 0 && (
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
