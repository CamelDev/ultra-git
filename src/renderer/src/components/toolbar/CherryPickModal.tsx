import React, { useEffect, useState, useRef } from 'react'
import { X, FileText, Copy, Check, AlertTriangle, CloudDownload, GitCommit, GitBranch, Search } from 'lucide-react'
import { computeDiff, DiffItem } from '../../utils/patchBuilder'

interface WorktreeItem {
  path: string
  branch: string
  hash: string
}

interface CherryPickModalProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string
  branches: {
    local: Array<{ name: string; ahead: number; behind: number } | string>
    remote: string[]
  } | null
  worktrees?: WorktreeItem[]
  currentBranch: string
  onCherryPickInitiated: (conflictedFiles: Array<{ path: string; status: string }>, isCherryPick: boolean) => void
  onSuccess: () => void
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



export function selectCherryPickBranch(localNames: string[], worktreeRefs: string[], currentBranch: string, previousSelection: string, remoteNames: string[] = []): string {
  const available = [...worktreeRefs, ...localNames, ...remoteNames].filter(Boolean)
  if (available.includes(previousSelection)) return previousSelection
  return available.find(ref => ref !== currentBranch) || available[0] || ''
}

interface SearchableCommit { hash: string; message: string; author_name?: string; author_email?: string }

export function filterCherryPickCommits<T extends SearchableCommit>(commits: T[], query: string): T[] {
  const search = query.trim().toLowerCase()
  if (!search) return commits
  return commits.filter(commit => [commit.hash, commit.message, commit.author_name, commit.author_email]
    .some(value => (value || '').toLowerCase().includes(search)))
}

export const CherryPickModal: React.FC<CherryPickModalProps> = props => props.isOpen
  ? <CherryPickContent key={props.repoPath} {...props} />
  : null

const CherryPickContent: React.FC<CherryPickModalProps> = ({
  isOpen,
  onClose,
  repoPath,
  branches,
  worktrees = [],
  currentBranch,
  onCherryPickInitiated,
  onSuccess
}) => {
  const [selectedBranch, setSelectedBranch] = useState('')
  const [remoteBranches, setRemoteBranches] = useState<string[] | null>(null)
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [commits, setCommits] = useState<any[]>([])
  const [commitSearch, setCommitSearch] = useState('')
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
  const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null)

  const filteredCommits = filterCherryPickCommits(commits, commitSearch)
  const activeCommitHash = filteredCommits.find(commit => commit.hash === selectedCommitHash)?.hash || filteredCommits[0]?.hash || null
  const canCherryPick = !!activeCommitHash && !commitsLoading && !commitsError && !cherryPickLoading

  const bodyRef = useRef<HTMLDivElement>(null)

  // 1. Reset/populate initial branch
  useEffect(() => {
    if (!isOpen) return

    const localNames = (branches?.local || []).map((b) => (typeof b === 'string' ? b : b.name))
    const wtRefs = (worktrees || []).map((wt) =>
      wt.branch && wt.branch !== '(detached HEAD)' ? wt.branch : wt.hash
    )
    setSelectedBranch(previous => selectCherryPickBranch(localNames, wtRefs, currentBranch, previous, remoteBranches || []))
    setCherryPickError(null)
  }, [isOpen, branches, worktrees, currentBranch, remoteBranches])

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
    setCommits([])
    setSelectedCommitHash(null)

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
    if (!isOpen || !activeCommitHash) {
      setFiles([])
      setSelectedFile(null)
      setFilesLoading(false)
      return
    }

    let isMounted = true
    setFilesLoading(true)

    window.api.git
      .getCommitFiles(repoPath, activeCommitHash)
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
  }, [isOpen, activeCommitHash, repoPath])

  // 4. Fetch diff for selected file
  useEffect(() => {
    if (!isOpen || !activeCommitHash || !selectedFile) {
      setDiffItems([])
      setDiffLoading(false)
      setDiffError(null)
      setIsBinary(false)
      return
    }

    let isMounted = true
    setDiffLoading(true)
    setDiffError(null)

    window.api.git
      .getCommitFileDiff(
        repoPath,
        activeCommitHash,
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
  }, [isOpen, activeCommitHash, selectedFile, repoPath])

  // 5. Scroll to first diff change
  useEffect(() => {
    if (!diffLoading && diffItems.length > 0) {
      const timer = setTimeout(() => {
        if (bodyRef.current) {
          const firstChange = bodyRef.current.querySelector('.diff-row.type-add, .diff-row.type-delete, .diff-row.type-change')
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
  const remoteNames = remoteBranches || []

  const loadRemoteBranches = async () => {
    setRemoteLoading(true)
    setRemoteError(null)
    try {
      const response = await window.api.git.getBranches(repoPath)
      if (!response.success || !response.data) throw new Error(response.error || 'Could not load remote branches')
      setRemoteBranches(response.data.remote)
    } catch (error: any) {
      setRemoteError(error.message || 'Could not load remote branches')
    } finally {
      setRemoteLoading(false)
    }
  }

  const handleCherryPick = async () => {
    if (!activeCommitHash || !canCherryPick) return
    setCherryPickLoading(true)
    setCherryPickError(null)

    try {
      const res = await window.api.git.cherryPick(repoPath, activeCommitHash)
      if (res.success) {
        if (res.data?.hadConflicts || res.data?.needsResolution) {
          const cfRes = await window.api.git.getConflictedFiles(repoPath)
          if (cfRes.success && cfRes.data) {
            onCherryPickInitiated(cfRes.data, true)
          }
        } else if (res.data?.success === false) {
          setCherryPickError(res.data.error || 'Cherry-pick failed')
          return
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

  const handleCopyLeft = () => {
    const leftLines = renderRows
      .filter((r) => r.beforeLine !== undefined)
      .map((r) => r.beforeLine)
      .join('\n')
    navigator.clipboard.writeText(leftLines)
    setCopiedSide('left')
    setTimeout(() => setCopiedSide(null), 2000)
  }

  const handleCopyRight = () => {
    const rightLines = renderRows
      .filter((r) => r.afterLine !== undefined)
      .map((r) => r.afterLine)
      .join('\n')
    navigator.clipboard.writeText(rightLines)
    setCopiedSide('right')
    setTimeout(() => setCopiedSide(null), 2000)
  }

  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    const container = range.commonAncestorContainer
    const targetElement =
      container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as HTMLElement)
    if (!targetElement) return

    const diffTable = targetElement.closest('.diff-table')
    if (!diffTable) return

    const anchorNode = selection.anchorNode
    const anchorEl = anchorNode
      ? anchorNode.nodeType === Node.TEXT_NODE
        ? anchorNode.parentElement
        : (anchorNode as HTMLElement)
      : null

    const focusNode = selection.focusNode
    const focusEl = focusNode
      ? focusNode.nodeType === Node.TEXT_NODE
        ? focusNode.parentElement
        : (focusNode as HTMLElement)
      : null

    const anchorLeft = anchorEl?.closest('.diff-col.left')
    const anchorRight = anchorEl?.closest('.diff-col.right')
    const focusLeft = focusEl?.closest('.diff-col.left')
    const focusRight = focusEl?.closest('.diff-col.right')

    const isLeft = !!(anchorLeft && (focusLeft || !focusRight))
    const isRight = !!(anchorRight && (focusRight || !focusLeft))

    if (isLeft || isRight) {
      const side = isLeft ? 'left' : 'right'
      const rows = Array.from(diffTable.querySelectorAll('.diff-row'))
      const lines: string[] = []

      rows.forEach((row) => {
        if (selection.containsNode(row, true)) {
          const col = row.querySelector(`.diff-col.${side}`)
          if (col && !col.classList.contains('empty-side')) {
            const lineContent = col.querySelector('.diff-line-content')
            if (lineContent) {
              lines.push(lineContent.textContent || '')
            }
          }
        }
      })

      if (lines.length > 1) {
        e.clipboardData.setData('text/plain', lines.join('\n'))
        e.preventDefault()
        return
      }
    }

    const rawText = selection.toString()
    if (rawText) {
      e.clipboardData.setData('text/plain', rawText)
      e.preventDefault()
    }
  }

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
        className="diff-modal-content cherry-pick-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cherry-pick-title"
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
            background: 'var(--bg-secondary)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Copy size={16} style={{ color: 'var(--accent-light)' }} />
            <h2 id="cherry-pick-title" style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
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

        <div className="cherry-pick-controls">
          {/* Branch select */}
          <div className="cherry-pick-field">
            <div className="cherry-pick-field-heading">
              <label htmlFor="cherry-pick-source"><GitBranch size={14} />Source branch</label>
              {remoteBranches === null && <button
                type="button"
                className="btn-secondary cherry-pick-load-remotes"
                data-testid="cherry-pick-load-remotes"
                disabled={remoteLoading}
                onClick={() => void loadRemoteBranches()}
              ><CloudDownload size={14} />{remoteLoading ? 'Loading remote branches…' : remoteError ? 'Retry remote branches' : 'Load remote branches'}</button>}
              {remoteBranches?.length === 0 && <span role="status">No remote branches found</span>}
            </div>
            <select
              id="cherry-pick-source"
              value={selectedBranch}
              title={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              data-testid="cherry-pick-branch-select"
              aria-label="Source branch"
            >
              {worktrees && worktrees.length > 0 && (
                <optgroup label="Worktrees">
                  {worktrees.map((wt) => {
                    const folder = wt.path.split(/[/\\]/).filter(Boolean).pop() || wt.path
                    const value = wt.branch && wt.branch !== '(detached HEAD)' ? wt.branch : wt.hash
                    const isDetached = !wt.branch || wt.branch === '(detached HEAD)'
                    const label = isDetached
                      ? `Detached HEAD @ ${wt.hash.substring(0, 7)} [${folder}]`
                      : `${wt.branch} [Worktree: ${folder}]`
                    return (
                      <option key={wt.path} value={value}>
                        {label}
                      </option>
                    )
                  })}
                </optgroup>
              )}
              <optgroup label="Local Branches">
                {localNames.map((name) => {
                  const matchingWt = worktrees?.find((wt) => wt.branch === name)
                  const folder = matchingWt
                    ? matchingWt.path.split(/[/\\]/).filter(Boolean).pop() || matchingWt.path
                    : null
                  const label = matchingWt ? `${name} (Worktree: ${folder})` : name
                  return (
                    <option key={name} value={name}>
                      {label}
                    </option>
                  )
                })}
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
            {remoteError && <span role="alert" style={{ fontSize: '12px', color: 'var(--conflict-danger, #ef4444)' }}>{remoteError}</span>}
          </div>

          <div className="cherry-pick-field">
            <div className="cherry-pick-field-heading">
              <label htmlFor="cherry-pick-commit"><GitCommit size={14} />Commit</label>
            </div>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                type="search"
                aria-label="Filter commits"
                data-testid="cherry-pick-commit-search"
                placeholder="Filter by hash, message, or author…"
                value={commitSearch}
                onChange={event => setCommitSearch(event.target.value)}
                style={{ paddingLeft: '31px' }}
              />
            </div>
            {commitsLoading ? (
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Loading commits...</span>
            ) : commitsError ? (
              <span style={{ fontSize: '12px', color: '#f87171' }}>{commitsError}</span>
            ) : filteredCommits.length === 0 ? (
              <span role="status" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{commits.length ? 'No commits match your search' : 'No commits found'}</span>
            ) : (
              <select
                id="cherry-pick-commit"
                value={activeCommitHash || ''}
                title={filteredCommits.find(commit => commit.hash === activeCommitHash)?.message}
                onChange={(e) => setSelectedCommitHash(e.target.value)}
                data-testid="cherry-pick-commit-select"
              >
                {filteredCommits.map((c) => (
                  <option key={c.hash} value={c.hash}>
                    [{c.hash.substring(0, 7)}] {c.message} (by {c.author_name})
                  </option>
                ))}
              </select>
            )}
          </div>
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
              flexShrink: 0,
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
        <div className="cherry-pick-preview">
          {/* File list sidebar */}
          <div
            className="diff-modal-sidebar"
            style={{
              width: '24%',
              minWidth: '180px',
              maxWidth: '260px',
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
          <div className="cherry-pick-diff">
            {selectedFile && !diffLoading && !diffError && !isBinary && (
              <div
                style={{
                  padding: '6px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  flexShrink: 0,
                  background: 'var(--bg-secondary)'
                }}
              >
                <button
                  className="diff-copy-btn"
                  data-testid="cherry-pick-copy-left-btn"
                  onClick={handleCopyLeft}
                  title="Copy Old (Left) File Content"
                >
                  {copiedSide === 'left' ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                  <span>{copiedSide === 'left' ? 'Copied Old!' : 'Copy Old'}</span>
                </button>
                <button
                  className="diff-copy-btn"
                  data-testid="cherry-pick-copy-right-btn"
                  onClick={handleCopyRight}
                  title="Copy New (Right) File Content"
                >
                  {copiedSide === 'right' ? <Check size={13} style={{ color: '#34d399' }} /> : <Copy size={13} />}
                  <span>{copiedSide === 'right' ? 'Copied New!' : 'Copy New'}</span>
                </button>
              </div>
            )}
            <div className="cherry-pick-diff-body">
              <div
                ref={bodyRef}
                className="diff-modal-scroll"
                onCopy={handleCopy}
                style={{ display: !selectedFile ? 'none' : 'block' }}
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
        <div className="cherry-pick-footer">
          <button
            onClick={handleCherryPick}
            disabled={!canCherryPick}
            data-tooltip="Cherry pick selected commit into current branch"
            className="cherry-pick-action"
            data-testid="cherry-pick-action-btn"
          >
            {cherryPickLoading ? 'Cherry picking...' : 'Cherry Pick'}
          </button>
        </div>
      </div>
    </div>
  )
}
