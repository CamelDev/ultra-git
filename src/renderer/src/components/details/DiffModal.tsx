import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import {
  X,
  FileText,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  RotateCcw,
  Trash2,
  Layers,
  AlertTriangle,
  Loader2,
  Search,
  Eye
} from 'lucide-react'
import {
  buildHunksFromDiffItems,
  buildHunkPatch,
  buildSelectedLinesPatch,
  DiffHunk
} from '../../utils/patchBuilder'
import { useRepoStore } from '../../store/useRepoStore'
import { useToaster } from '../toaster/ToasterContext'
import { MarkdownDiffView } from './MarkdownDiffView'
import { ImageDiffView } from './ImageDiffView'

export interface DiffFileItem {
  path: string
  oldPath?: string
  status: string
  isStaged?: boolean
  isUntracked?: boolean
}

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
  files?: DiffFileItem[]
  initialFileIndex?: number
  initialViewMode?: 'chunks' | 'full' | 'preview'
}

interface DiffItem {
  diffIndex?: number
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

  const lcsLen = dp[m][n]
  const similarity = lcsLen / Math.max(m, n, 1)
  if (similarity < 0.4) {
    return {
      oldSpans: [{ text: oldStr, highlight: true }],
      newSpans: [{ text: newStr, highlight: true }]
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

interface RenderRow {
  rowIdx?: number
  rowType: 'normal' | 'change' | 'delete' | 'add'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
  oldSpans?: CharSpan[]
  newSpans?: CharSpan[]
  diffIndices: number[]
}

interface SearchMatch {
  matchIndex: number
  rowIdx: number
  side: 'left' | 'right'
  startIdx: number
  length: number
}

function SearchHighlightContent({
  text,
  side,
  spans,
  type,
  searchQuery,
  rowMatches,
  activeMatchIndex
}: {
  text: string
  side: 'left' | 'right'
  spans?: CharSpan[]
  type?: 'add' | 'delete'
  searchQuery: string
  rowMatches: SearchMatch[]
  activeMatchIndex: number
}) {
  if (!searchQuery) {
    if (spans && type) {
      return <InlineContent spans={spans} type={type} />
    }
    return <pre className="diff-line-content">{text}</pre>
  }

  const sideMatches = rowMatches.filter((m) => m.side === side)
  if (sideMatches.length === 0) {
    if (spans && type) {
      return <InlineContent spans={spans} type={type} />
    }
    return <pre className="diff-line-content">{text}</pre>
  }

  const elements: React.ReactNode[] = []
  let lastIndex = 0

  sideMatches.forEach((m) => {
    if (m.startIdx > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}`}>{text.substring(lastIndex, m.startIdx)}</span>
      )
    }
    const isActive = m.matchIndex === activeMatchIndex
    elements.push(
      <mark
        id={`search-match-${m.matchIndex}`}
        key={`match-${m.matchIndex}`}
        className={`diff-search-highlight${isActive ? ' active' : ''}`}
      >
        {text.substring(m.startIdx, m.startIdx + m.length)}
      </mark>
    )
    lastIndex = m.startIdx + m.length
  })

  if (lastIndex < text.length) {
    elements.push(<span key={`text-${lastIndex}`}>{text.substring(lastIndex)}</span>)
  }

  return <pre className="diff-line-content">{elements}</pre>
}

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
        afterNum: item.afterNum,
        diffIndices: item.diffIndex !== undefined ? [item.diffIndex] : []
      })
      i++
      continue
    }

    if (item.type === 'delete') {
      const deletes: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'delete') {
        deletes.push(diffItems[i++])
      }
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
          const indices: number[] = []
          if (del.diffIndex !== undefined) indices.push(del.diffIndex)
          if (add.diffIndex !== undefined) indices.push(add.diffIndex)
          rows.push({
            rowType: 'change',
            beforeLine: del.beforeLine,
            afterLine: add.afterLine,
            beforeNum: del.beforeNum,
            afterNum: add.afterNum,
            oldSpans,
            newSpans,
            diffIndices: indices
          })
        } else if (del) {
          rows.push({
            rowType: 'delete',
            beforeLine: del.beforeLine,
            beforeNum: del.beforeNum,
            diffIndices: del.diffIndex !== undefined ? [del.diffIndex] : []
          })
        } else if (add) {
          rows.push({
            rowType: 'add',
            afterLine: add.afterLine,
            afterNum: add.afterNum,
            diffIndices: add.diffIndex !== undefined ? [add.diffIndex] : []
          })
        }
      }
      continue
    }

    if (item.type === 'add') {
      rows.push({
        rowType: 'add',
        afterLine: item.afterLine,
        afterNum: item.afterNum,
        diffIndices: item.diffIndex !== undefined ? [item.diffIndex] : []
      })
      i++
    }
  }

  rows.forEach((r, idx) => {
    r.rowIdx = idx
  })

  return rows
}

function computeDiff(beforeContent: string = '', afterContent: string = ''): DiffItem[] {
  const safeBefore = beforeContent || ''
  const safeAfter = afterContent || ''
  const beforeLines = safeBefore === '' ? [] : safeBefore.split(/\r?\n/)
  const afterLines = safeAfter === '' ? [] : safeAfter.split(/\r?\n/)

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

  // Attach diffIndex to every item
  diff.forEach((item, idx) => {
    item.diffIndex = idx
  })

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
  stashMessage = null,
  files,
  initialFileIndex,
  initialViewMode
}) => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const { addToast } = useToaster()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diffItems, setDiffItems] = useState<DiffItem[]>([])
  const [rawBefore, setRawBefore] = useState<string>('')
  const [rawAfter, setRawAfter] = useState<string>('')
  const [isBinary, setIsBinary] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

  // File navigation state
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(initialFileIndex || 0)

  // Chunk navigation, view mode, and line selection state
  const [viewMode, setViewMode] = useState<'chunks' | 'full' | 'preview'>(() => {
    if (initialViewMode) return initialViewMode
    const p = (files && files.length > 0 && initialFileIndex !== undefined && files[initialFileIndex]?.path) || filePath
    if (p && /\.(png|jpg|jpeg|bmp|svg|gif|webp|ico|avif)$/i.test(p)) {
      return 'preview'
    }
    return 'chunks'
  })
  const [activeChunkIndex, setActiveChunkIndex] = useState(0)
  const [selectedLineIndices, setSelectedLineIndices] = useState<Set<number>>(new Set())
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    confirmText: string
    onConfirm: () => void
  } | null>(null)

  // Stash details files states
  const [stashFiles, setStashFiles] = useState<any[]>([])
  const [stashFilesLoading, setStashFilesLoading] = useState(false)
  const [stashFilesError, setStashFilesError] = useState<string | null>(null)
  const [selectedStashFile, setSelectedStashFile] = useState<any | null>(null)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Sync currentFileIndex when modal opens or initialFileIndex/files/filePath changes
  useEffect(() => {
    if (isOpen) {
      if (files && files.length > 0) {
        if (initialFileIndex !== undefined && initialFileIndex >= 0 && initialFileIndex < files.length) {
          setCurrentFileIndex(initialFileIndex)
        } else {
          const foundIdx = files.findIndex((f) => f.path === filePath)
          setCurrentFileIndex(foundIdx >= 0 ? foundIdx : 0)
        }
      } else {
        setCurrentFileIndex(0)
      }
    }
  }, [isOpen, filePath, initialFileIndex, files])

  // Active file derived properties
  const activeFile = useMemo(() => {
    if (files && files.length > 0) {
      const clampedIdx = Math.max(0, Math.min(currentFileIndex, files.length - 1))
      return files[clampedIdx]
    }
    return null
  }, [files, currentFileIndex])

  const currentFilePath = isStash ? selectedStashFile?.path || 'No file selected' : activeFile?.path || filePath
  const currentOldPath = isStash ? selectedStashFile?.oldPath : activeFile?.oldPath ?? oldPath
  const currentStatus = isStash ? selectedStashFile?.status : activeFile?.status ?? status
  const currentIsStaged = activeFile?.isStaged ?? isStaged
  const currentIsUntracked = activeFile?.isUntracked ?? false

  const totalFiles = isStash ? stashFiles.length : files && files.length > 0 ? files.length : 1
  const fileIndex = isStash
    ? stashFiles.findIndex((f) => f.path === selectedStashFile?.path)
    : files && files.length > 0
    ? Math.max(0, Math.min(currentFileIndex, files.length - 1))
    : 0

  // Check if current file is Markdown or Image
  const isMarkdown = useMemo(() => {
    if (!currentFilePath || currentFilePath === 'No file selected') return false
    return /\.(md|markdown|mdown|mkdn|mdx)$/i.test(currentFilePath)
  }, [currentFilePath])

  const isImage = useMemo(() => {
    if (!currentFilePath || currentFilePath === 'No file selected') return false
    return /\.(png|jpg|jpeg|bmp|svg|gif|webp|ico|avif)$/i.test(currentFilePath)
  }, [currentFilePath])

  const isPreviewable = isMarkdown || isImage

  // Automatically switch to 'preview' for known images, or reset from preview if active file is not previewable
  useEffect(() => {
    if (isImage) {
      setViewMode('preview')
    } else if (viewMode === 'preview' && !isMarkdown) {
      setViewMode('chunks')
    }
  }, [currentFilePath, isImage, isMarkdown])

  // File navigation handlers
  const handlePrevFile = useCallback(() => {
    if (isStash) {
      if (!stashFiles || stashFiles.length <= 1) return
      const curIdx = stashFiles.findIndex((f) => f.path === selectedStashFile?.path)
      if (curIdx > 0) {
        setSelectedStashFile(stashFiles[curIdx - 1])
        setSelectedLineIndices(new Set())
        setActiveChunkIndex(0)
        setLastClickedIndex(null)
      }
    } else if (files && files.length > 1) {
      if (currentFileIndex > 0) {
        setCurrentFileIndex((prev) => prev - 1)
        setSelectedLineIndices(new Set())
        setActiveChunkIndex(0)
        setLastClickedIndex(null)
      }
    }
  }, [isStash, stashFiles, selectedStashFile, files, currentFileIndex])

  const handleNextFile = useCallback(() => {
    if (isStash) {
      if (!stashFiles || stashFiles.length <= 1) return
      const curIdx = stashFiles.findIndex((f) => f.path === selectedStashFile?.path)
      if (curIdx !== -1 && curIdx < stashFiles.length - 1) {
        setSelectedStashFile(stashFiles[curIdx + 1])
        setSelectedLineIndices(new Set())
        setActiveChunkIndex(0)
        setLastClickedIndex(null)
      }
    } else if (files && files.length > 1) {
      if (currentFileIndex < files.length - 1) {
        setCurrentFileIndex((prev) => prev + 1)
        setSelectedLineIndices(new Set())
        setActiveChunkIndex(0)
        setLastClickedIndex(null)
      }
    }
  }, [isStash, stashFiles, selectedStashFile, files, currentFileIndex])

  // Build hunks from diffItems
  const hunks: DiffHunk[] = useMemo(() => {
    return buildHunksFromDiffItems(diffItems)
  }, [diffItems])

  // Map starting diffIndex of each hunk for Full view rendering
  const hunkByStartDiffIdx = useMemo(() => {
    const map = new Map<number, { hunk: DiffHunk; hunkIdx: number }>()
    hunks.forEach((hunk, hunkIdx) => {
      if (hunk.lines.length > 0) {
        map.set(hunk.lines[0].indexInDiff, { hunk, hunkIdx })
      }
    })
    return map
  }, [hunks])

  // Build visual rows and calculate selected row count
  const renderRows = useMemo(() => buildRenderRows(diffItems), [diffItems])
  const selectedRowCount = useMemo(
    () => renderRows.filter((row) => row.diffIndices.some((idx) => selectedLineIndices.has(idx))).length,
    [renderRows, selectedLineIndices]
  )

  // Search matches calculation
  const matches = useMemo<SearchMatch[]>(() => {
    if (!searchQuery) return []
    const result: SearchMatch[] = []
    let count = 0

    renderRows.forEach((row) => {
      const rIdx = row.rowIdx ?? 0
      if (row.rowType !== 'add' && row.beforeLine) {
        const line = row.beforeLine
        const haystack = caseSensitive ? line : line.toLowerCase()
        const needle = caseSensitive ? searchQuery : searchQuery.toLowerCase()
        if (needle.length > 0) {
          let pos = haystack.indexOf(needle)
          while (pos !== -1) {
            result.push({
              matchIndex: count++,
              rowIdx: rIdx,
              side: 'left',
              startIdx: pos,
              length: needle.length
            })
            pos = haystack.indexOf(needle, pos + needle.length)
          }
        }
      }

      if (row.rowType !== 'delete' && row.afterLine) {
        const line = row.afterLine
        const haystack = caseSensitive ? line : line.toLowerCase()
        const needle = caseSensitive ? searchQuery : searchQuery.toLowerCase()
        if (needle.length > 0) {
          let pos = haystack.indexOf(needle)
          while (pos !== -1) {
            result.push({
              matchIndex: count++,
              rowIdx: rIdx,
              side: 'right',
              startIdx: pos,
              length: needle.length
            })
            pos = haystack.indexOf(needle, pos + needle.length)
          }
        }
      }
    })

    return result
  }, [renderRows, searchQuery, caseSensitive])

  const matchesByRowIdx = useMemo(() => {
    const map = new Map<number, SearchMatch[]>()
    matches.forEach((m) => {
      const existing = map.get(m.rowIdx) || []
      existing.push(m)
      map.set(m.rowIdx, existing)
    })
    return map
  }, [matches])

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [searchQuery, caseSensitive])

  const handlePrevMatch = useCallback(() => {
    if (matches.length === 0) return
    setActiveMatchIndex((prev) => (prev - 1 + matches.length) % matches.length)
  }, [matches.length])

  const handleNextMatch = useCallback(() => {
    if (matches.length === 0) return
    setActiveMatchIndex((prev) => (prev + 1) % matches.length)
  }, [matches.length])

  // Scroll active match into view
  useEffect(() => {
    if (searchOpen && matches.length > 0 && matches[activeMatchIndex] !== undefined) {
      const curMatch = matches[activeMatchIndex]
      const matchEl = document.getElementById(`search-match-${curMatch.matchIndex}`)
      if (matchEl) {
        matchEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [searchOpen, activeMatchIndex, matches])

  // Scroll to targeted hunk element
  const scrollToHunk = useCallback((hunkIdx: number) => {
    const hunkEl = document.getElementById(`diff-hunk-${hunkIdx}`)
    if (hunkEl) {
      hunkEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const handlePrevChunk = useCallback(() => {
    if (hunks.length === 0) return
    const prevIndex = Math.max(0, activeChunkIndex - 1)
    setActiveChunkIndex(prevIndex)
    scrollToHunk(prevIndex)
  }, [hunks.length, activeChunkIndex, scrollToHunk])

  const handleNextChunk = useCallback(() => {
    if (hunks.length === 0) return
    const nextIndex = Math.min(hunks.length - 1, activeChunkIndex + 1)
    setActiveChunkIndex(nextIndex)
    scrollToHunk(nextIndex)
  }, [hunks.length, activeChunkIndex, scrollToHunk])

  // Entire File Staging & Unstaging Handlers
  const handleStageEntireFile = async () => {
    if (!currentFilePath) return
    setActionLoading(true)
    try {
      const res = await window.api.git.add(repoPath, currentFilePath)
      if (res.success) {
        setSelectedLineIndices(new Set())
        addToast({ variant: 'success', title: 'File Staged', message: `Staged "${currentFilePath}"` })
        const activeRepo = getActiveRepo()
        if (activeRepo) await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Stage Failed', message: res.error || 'Failed to stage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Stage Error', message: err.message || 'Error staging file' })
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnstageEntireFile = async () => {
    if (!currentFilePath) return
    setActionLoading(true)
    try {
      const res = await window.api.git.reset(repoPath, currentFilePath)
      if (res.success) {
        setSelectedLineIndices(new Set())
        addToast({ variant: 'success', title: 'File Unstaged', message: `Unstaged "${currentFilePath}"` })
        const activeRepo = getActiveRepo()
        if (activeRepo) await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Unstage Failed', message: res.error || 'Failed to unstage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Unstage Error', message: err.message || 'Error unstaging file' })
    } finally {
      setActionLoading(false)
    }
  }

  // Reload diff content
  const loadDiffContent = useCallback(() => {
    if (!isOpen) return

    setLoading(true)
    setError(null)

    const targetFilePath = currentFilePath
    const targetOldPath = currentOldPath
    const targetStatus = currentStatus
    const targetIsStaged = currentIsStaged
    const isUntracked = currentIsUntracked

    if (isStash && !selectedStashFile) {
      setLoading(false)
      setDiffItems([])
      return
    }

    if (!targetFilePath || targetFilePath === 'No file selected') {
      setLoading(false)
      setDiffItems([])
      return
    }

    const fetchDiff = isStash
      ? window.api.git.getStashFileDiff(repoPath, stashIndex!, targetFilePath, targetOldPath, targetStatus, isUntracked)
      : isActiveChange
      ? window.api.git.getActiveFileDiff(repoPath, targetFilePath, !!targetIsStaged, targetOldPath)
      : window.api.git.getCommitFileDiff(repoPath, commitHash!, targetFilePath, targetOldPath, targetStatus)

    fetchDiff
      .then((res) => {
        if (res.success && res.data) {
          if (res.data.isBinary) {
            setIsBinary(true)
            setDiffItems([])
            setRawBefore(res.data.before || '')
            setRawAfter(res.data.after || '')
          } else {
            setIsBinary(false)
            const beforeStr = res.data.before || ''
            const afterStr = res.data.after || ''
            setRawBefore(beforeStr)
            setRawAfter(afterStr)
            const computed = computeDiff(beforeStr, afterStr)
            setDiffItems(computed)
          }
        } else {
          setError(res.error || 'Failed to retrieve diff')
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Error fetching diff')
        setLoading(false)
      })
  }, [
    isOpen,
    currentFilePath,
    currentOldPath,
    currentStatus,
    currentIsStaged,
    currentIsUntracked,
    commitHash,
    repoPath,
    isActiveChange,
    isStash,
    stashIndex,
    selectedStashFile
  ])

  // Patch application handler
  const handleApplyPatch = async (
    patch: string,
    options?: { cached?: boolean; reverse?: boolean },
    successMsg?: string
  ) => {
    setActionLoading(true)
    try {
      const res = await window.api.git.applyPatch(repoPath, patch, options)
      if (res.success) {
        setSelectedLineIndices(new Set())
        const activeRepo = getActiveRepo()
        if (activeRepo) {
          await refreshRepo(activeRepo.id)
        }
        addToast({ variant: 'success', title: 'Success', message: successMsg || 'Changes applied successfully' })
        loadDiffContent()
      } else {
        addToast({ variant: 'error', title: 'Apply Failed', message: res.error || 'Failed to apply changes' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Apply Error', message: err.message || 'Error applying changes' })
    } finally {
      setActionLoading(false)
    }
  }

  // Hunk Staging / Unstaging / Discarding
  const handleStageHunk = async (hunk: DiffHunk) => {
    const patch = buildHunkPatch(currentFilePath, hunk, 'stage')
    await handleApplyPatch(patch, { cached: true }, 'Chunk staged successfully')
  }

  const handleUnstageHunk = async (hunk: DiffHunk) => {
    const patch = buildHunkPatch(currentFilePath, hunk, 'unstage')
    await handleApplyPatch(patch, { cached: true, reverse: true }, 'Chunk unstaged successfully')
  }

  const handleDiscardHunk = (hunk: DiffHunk) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Discard Chunk',
      message: `Are you sure you want to discard this chunk in "${currentFilePath}"? This operation cannot be undone.`,
      confirmText: 'Discard Chunk',
      onConfirm: async () => {
        setConfirmDialog(null)
        setActionLoading(true)
        try {
          if (currentIsStaged) {
            const patch = buildHunkPatch(currentFilePath, hunk, 'unstage')
            const res1 = await window.api.git.applyPatch(repoPath, patch, { cached: true, reverse: true })
            if (!res1.success) {
              addToast({ variant: 'error', title: 'Discard Chunk Failed', message: `Failed to unstage chunk: ${res1.error}` })
              return
            }
            const res2 = await window.api.git.applyPatch(repoPath, patch, { reverse: true })
            if (!res2.success) {
              addToast({ variant: 'error', title: 'Discard Chunk Failed', message: `Failed to discard chunk: ${res2.error}` })
              return
            }
          } else {
            const patch = buildHunkPatch(currentFilePath, hunk, 'discard')
            const res = await window.api.git.applyPatch(repoPath, patch, { reverse: true })
            if (!res.success) {
              addToast({ variant: 'error', title: 'Discard Chunk Failed', message: `Failed to discard chunk: ${res.error}` })
              return
            }
          }
          setSelectedLineIndices(new Set())
          const activeRepo = getActiveRepo()
          if (activeRepo) await refreshRepo(activeRepo.id)
          addToast({ variant: 'success', title: 'Chunk Discarded', message: 'Chunk discarded successfully' })
          loadDiffContent()
        } catch (err: any) {
          addToast({ variant: 'error', title: 'Discard Chunk Error', message: err.message || 'Error discarding chunk' })
        } finally {
          setActionLoading(false)
        }
      }
    })
  }

  // Line Staging / Unstaging / Discarding
  const handleStageSelectedLines = async () => {
    if (selectedLineIndices.size === 0) return
    for (const hunk of hunks) {
      const hasSelected = hunk.lines.some((l) => selectedLineIndices.has(l.indexInDiff))
      if (hasSelected) {
        const patch = buildSelectedLinesPatch(currentFilePath, hunk, selectedLineIndices, 'stage')
        await handleApplyPatch(patch, { cached: true }, 'Selected lines staged')
      }
    }
  }

  const handleUnstageSelectedLines = async () => {
    if (selectedLineIndices.size === 0) return
    for (const hunk of hunks) {
      const hasSelected = hunk.lines.some((l) => selectedLineIndices.has(l.indexInDiff))
      if (hasSelected) {
        const patch = buildSelectedLinesPatch(currentFilePath, hunk, selectedLineIndices, 'unstage')
        await handleApplyPatch(patch, { cached: true, reverse: true }, 'Selected lines unstaged')
      }
    }
  }

  const handleDiscardSelectedLines = () => {
    if (selectedLineIndices.size === 0) return
    setConfirmDialog({
      isOpen: true,
      title: 'Discard Selected Lines',
      message: `Are you sure you want to discard ${selectedRowCount} selected line(s) in "${currentFilePath}"? This operation cannot be undone.`,
      confirmText: 'Discard Lines',
      onConfirm: async () => {
        setConfirmDialog(null)
        setActionLoading(true)
        try {
          for (const hunk of hunks) {
            const hasSelected = hunk.lines.some((l) => selectedLineIndices.has(l.indexInDiff))
            if (hasSelected) {
              if (currentIsStaged) {
                const patch = buildSelectedLinesPatch(currentFilePath, hunk, selectedLineIndices, 'unstage')
                const res1 = await window.api.git.applyPatch(repoPath, patch, { cached: true, reverse: true })
                if (!res1.success) {
                  addToast({ variant: 'error', title: 'Discard Lines Failed', message: `Failed to unstage lines: ${res1.error}` })
                  return
                }
                const res2 = await window.api.git.applyPatch(repoPath, patch, { reverse: true })
                if (!res2.success) {
                  addToast({ variant: 'error', title: 'Discard Lines Failed', message: `Failed to discard lines: ${res2.error}` })
                  return
                }
              } else {
                const patch = buildSelectedLinesPatch(currentFilePath, hunk, selectedLineIndices, 'discard')
                const res = await window.api.git.applyPatch(repoPath, patch, { reverse: true })
                if (!res.success) {
                  addToast({ variant: 'error', title: 'Discard Lines Failed', message: `Failed to discard lines: ${res.error}` })
                  return
                }
              }
            }
          }
          setSelectedLineIndices(new Set())
          const activeRepo = getActiveRepo()
          if (activeRepo) await refreshRepo(activeRepo.id)
          addToast({ variant: 'success', title: 'Lines Discarded', message: 'Selected lines discarded' })
          loadDiffContent()
        } catch (err: any) {
          addToast({ variant: 'error', title: 'Discard Lines Error', message: err.message || 'Error discarding lines' })
        } finally {
          setActionLoading(false)
        }
      }
    })
  }

  // Handle line click selection
  const handleRowClick = (indices: number[], e: React.MouseEvent) => {
    if (!isActiveChange || indices.length === 0) return

    const clickedIdx = indices[0]
    const item = diffItems[clickedIdx]
    if (!item || item.type === 'normal') return

    const newSelected = new Set(selectedLineIndices)

    if (e.shiftKey && lastClickedIndex !== null) {
      const lastRowIdx = renderRows.findIndex((r) => r.diffIndices.includes(lastClickedIndex))
      const currentRowIdx = renderRows.findIndex((r) => r.diffIndices.some((idx) => indices.includes(idx)))

      if (lastRowIdx !== -1 && currentRowIdx !== -1) {
        const start = Math.min(lastRowIdx, currentRowIdx)
        const end = Math.max(lastRowIdx, currentRowIdx)
        for (let r = start; r <= end; r++) {
          const row = renderRows[r]
          if (row.rowType !== 'normal') {
            row.diffIndices.forEach((idx) => newSelected.add(idx))
          }
        }
      } else {
        const start = Math.min(lastClickedIndex, clickedIdx)
        const end = Math.max(lastClickedIndex, clickedIdx)
        for (let k = start; k <= end; k++) {
          if (diffItems[k] && (diffItems[k].type === 'add' || diffItems[k].type === 'delete')) {
            newSelected.add(k)
          }
        }
      }
    } else {
      const isSelected = indices.some((idx) => newSelected.has(idx))
      if (isSelected) {
        indices.forEach((idx) => newSelected.delete(idx))
      } else {
        indices.forEach((idx) => newSelected.add(idx))
      }
    }

    setSelectedLineIndices(newSelected)
    setLastClickedIndex(clickedIdx)
  }

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setSearchOpen((prev) => {
          const next = !prev
          if (next) {
            setTimeout(() => {
              searchInputRef.current?.focus()
              searchInputRef.current?.select()
            }, 50)
          }
          return next
        })
      } else if (e.key === 'Escape') {
        if (searchOpen) {
          e.preventDefault()
          e.stopPropagation()
          setSearchOpen(false)
          return
        }
        if (selectedLineIndices.size > 0) {
          setSelectedLineIndices(new Set())
        } else {
          onClose()
        }
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key.toLowerCase() === 'a' || e.key === 'ArrowLeft')
      ) {
        if ((isStash && stashFiles.length > 1) || (files && files.length > 1)) {
          e.preventDefault()
          handlePrevFile()
        }
      } else if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key.toLowerCase() === 'd' || e.key === 'ArrowRight')
      ) {
        if ((isStash && stashFiles.length > 1) || (files && files.length > 1)) {
          e.preventDefault()
          handleNextFile()
        }
      } else if (
        (e.altKey && e.key === 'ArrowUp') ||
        (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'w')
      ) {
        e.preventDefault()
        handlePrevChunk()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && isActiveChange) {
        e.preventDefault()
        if (selectedLineIndices.size > 0) {
          handleStageSelectedLines()
        } else if (hunks[activeChunkIndex]) {
          handleStageHunk(hunks[activeChunkIndex])
        }
      } else if (
        (e.altKey && e.key === 'ArrowDown') ||
        (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 's')
      ) {
        e.preventDefault()
        handleNextChunk()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'u' && isActiveChange) {
        e.preventDefault()
        if (selectedLineIndices.size > 0) {
          handleUnstageSelectedLines()
        } else if (hunks[activeChunkIndex]) {
          handleUnstageHunk(hunks[activeChunkIndex])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    isOpen,
    onClose,
    searchOpen,
    selectedLineIndices,
    activeChunkIndex,
    hunks,
    isActiveChange,
    isStash,
    stashFiles,
    files,
    handlePrevFile,
    handleNextFile,
    handlePrevChunk,
    handleNextChunk,
    handleStageSelectedLines,
    handleUnstageSelectedLines
  ])

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedStashFile(null)
      setStashFiles([])
      setSelectedLineIndices(new Set())
      setActiveChunkIndex(0)
      setSearchOpen(false)
      setSearchQuery('')
    }
  }, [isOpen])

  // Close modal when viewing active changes and all files in section have been staged/unstaged
  useEffect(() => {
    if (isOpen && isActiveChange && !isStash && files && files.length === 0) {
      onClose()
    }
  }, [isOpen, isActiveChange, isStash, files, onClose])

  // Load stash files list
  useEffect(() => {
    if (!isOpen || !isStash || stashIndex === null || stashIndex === undefined) {
      setStashFiles([])
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

  // Initial and reactive diff loading
  useEffect(() => {
    if (isOpen) {
      loadDiffContent()
    }
  }, [isOpen, loadDiffContent])

  // Scroll to first change on load or viewMode change
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
  }, [loading, diffItems, viewMode])

  const changeIndexes = useMemo(
    () =>
      renderRows
        .map((row, idx) => ({ rowType: row.rowType, idx }))
        .filter((r) => r.rowType !== 'normal'),
    [renderRows]
  )

  const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null)

  const handleCopyLeft = () => {
    const leftLines = renderRows
      .map((row) => (row.rowType !== 'add' ? row.beforeLine || '' : null))
      .filter((line) => line !== null)
      .join('\n')

    navigator.clipboard.writeText(leftLines)
    setCopiedSide('left')
    setTimeout(() => setCopiedSide(null), 2000)
  }

  const handleCopyRight = () => {
    const rightLines = renderRows
      .map((row) => (row.rowType !== 'delete' ? row.afterLine || '' : null))
      .filter((line) => line !== null)
      .join('\n')

    navigator.clipboard.writeText(rightLines)
    setCopiedSide('right')
    setTimeout(() => setCopiedSide(null), 2000)
  }

  const handleCopy = (e: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const diffTable = bodyRef.current?.querySelector('.diff-table')
    if (!diffTable || !diffTable.contains(selection.anchorNode)) return

    const anchorEl = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (selection.anchorNode as HTMLElement)
      : selection.anchorNode?.parentElement

    const focusEl = selection.focusNode?.nodeType === Node.ELEMENT_NODE
      ? (selection.focusNode as HTMLElement)
      : selection.focusNode?.parentElement

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

  if (!isOpen) return null

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          {/* Top Row: Context Badge + Navigation & Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                <span
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 600,
                    fontSize: '11px',
                    color: currentIsStaged ? '#34d399' : '#f59e0b'
                  }}
                >
                  {currentIsStaged ? 'Staged changes' : 'Unstaged changes'}
                </span>
              ) : (
                <span>
                  Commit:{' '}
                  <span style={{ fontFamily: 'monospace' }}>{commitHash?.substring(0, 8)}</span>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* File Navigation Controls */}
              {totalFiles > 1 && (
                <div className="diff-file-nav" data-testid="file-nav">
                  <button
                    className="diff-file-btn"
                    onClick={handlePrevFile}
                    disabled={fileIndex <= 0}
                    data-tooltip="Previous File (A or Left Arrow)"
                    data-testid="prev-file-btn"
                  >
                    <ChevronLeft size={14} />
                    <span>Prev</span>
                  </button>
                  <span className="diff-file-counter" data-testid="file-counter">
                    File {fileIndex + 1} of {totalFiles}
                  </span>
                  <button
                    className="diff-file-btn"
                    onClick={handleNextFile}
                    disabled={fileIndex >= totalFiles - 1}
                    data-tooltip="Next File (D or Right Arrow)"
                    data-testid="next-file-btn"
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

              {/* View Mode Toggle (Chunks vs Full File) */}
              {renderRows.length > 0 && !loading && !error && !isBinary && (
                <div className="diff-view-toggle" data-testid="view-mode-toggle">
                  <button
                    className={`diff-view-toggle-btn ${viewMode === 'chunks' ? 'active' : ''}`}
                    onClick={() => setViewMode('chunks')}
                    data-tooltip="Show only changed chunks with context"
                    data-testid="toggle-chunks-btn"
                  >
                    <Layers size={13} />
                    <span>Chunks</span>
                  </button>
                  <button
                    className={`diff-view-toggle-btn ${viewMode === 'full' ? 'active' : ''}`}
                    onClick={() => setViewMode('full')}
                    data-tooltip="Show entire file content with diff highlights"
                    data-testid="toggle-full-btn"
                  >
                    <FileText size={13} />
                    <span>Full File</span>
                  </button>
                </div>
              )}

              {/* Modal Close Button */}
              <button className="diff-modal-close" onClick={onClose} data-tooltip="Close modal (Escape)">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Expandable Search Bar */}
          {searchOpen && (
            <div className="diff-search-bar" data-testid="diff-search-bar">
              <div className="diff-search-input-wrapper">
                <Search size={14} className="diff-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="diff-search-input"
                  placeholder="Search diff..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (e.shiftKey) {
                        handlePrevMatch()
                      } else {
                        handleNextMatch()
                      }
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      setSearchOpen(false)
                    }
                  }}
                  data-testid="diff-search-input"
                />
                {searchQuery && (
                  <span className="diff-search-counter" data-testid="diff-search-counter">
                    {matches.length > 0
                      ? `${activeMatchIndex + 1} of ${matches.length}`
                      : 'No results'}
                  </span>
                )}
              </div>

              <button
                className={`diff-search-btn${caseSensitive ? ' active' : ''}`}
                onClick={() => setCaseSensitive((prev) => !prev)}
                data-tooltip="Match Case (Alt+C)"
                data-testid="toggle-case-sensitive-btn"
              >
                <span>Aa</span>
              </button>

              <button
                className="diff-search-btn"
                onClick={handlePrevMatch}
                disabled={matches.length === 0}
                data-tooltip="Previous Match (Shift+Enter)"
                data-testid="prev-match-btn"
              >
                <ChevronUp size={14} />
              </button>

              <button
                className="diff-search-btn"
                onClick={handleNextMatch}
                disabled={matches.length === 0}
                data-tooltip="Next Match (Enter)"
                data-testid="next-match-btn"
              >
                <ChevronDown size={14} />
              </button>

              <button
                className="diff-search-btn close-search-btn"
                onClick={() => setSearchOpen(false)}
                data-tooltip="Close Search (Escape)"
                data-testid="close-search-btn"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Bottom Row: Preview Button + File Icon + File Path on Left, Action Controls on Right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingTop: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              {/* Dedicated Green Preview Button for Markdown & Image files */}
              {(isMarkdown || isImage) && (
                <button
                  className={`diff-dedicated-preview-btn ${viewMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setViewMode((prev) => (prev === 'preview' ? 'chunks' : 'preview'))}
                  data-tooltip={
                    viewMode === 'preview'
                      ? 'Return to code / raw diff'
                      : isMarkdown
                      ? 'Show rendered Markdown preview'
                      : 'Show visual image preview & comparison'
                  }
                  data-testid="toggle-preview-btn"
                >
                  <Eye size={13} />
                  <span>Preview</span>
                </button>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <FileText size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
                <div style={{ fontWeight: 600, fontSize: '14px', wordBreak: 'break-all', fontFamily: 'JetBrains Mono, monospace' }}>
                  {currentFilePath}
                </div>
              </div>
            </div>

            {/* Controls Toolbar: [ Chunk 1 of 3 ] [ Stage File ] [ Search ] [ Copy Old ] [ Copy New ] */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {/* Chunk Navigation Buttons */}
              {viewMode !== 'preview' && hunks.length > 0 && (
                <div className="diff-chunk-nav" data-testid="chunk-nav">
                  <button
                    className="diff-chunk-btn"
                    onClick={handlePrevChunk}
                    disabled={activeChunkIndex === 0}
                    data-tooltip="Previous Chunk (W or Alt+Up)"
                    data-testid="prev-chunk-btn"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <span className="diff-chunk-counter" data-testid="chunk-counter">
                    Chunk {activeChunkIndex + 1} of {hunks.length}
                  </span>
                  <button
                    className="diff-chunk-btn"
                    onClick={handleNextChunk}
                    disabled={activeChunkIndex >= hunks.length - 1}
                    data-tooltip="Next Chunk (S or Alt+Down)"
                    data-testid="next-chunk-btn"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}

              {/* Entire File Stage / Unstage Button */}
              {isActiveChange && !isStash && (
                !currentIsStaged ? (
                  <button
                    className="diff-file-action-btn stage-file-btn"
                    onClick={handleStageEntireFile}
                    disabled={actionLoading}
                    data-tooltip="Stage this entire file"
                    data-testid="stage-file-modal-btn"
                  >
                    <Plus size={13} />
                    <span>Stage File</span>
                  </button>
                ) : (
                  <button
                    className="diff-file-action-btn unstage-file-btn"
                    onClick={handleUnstageEntireFile}
                    disabled={actionLoading}
                    data-tooltip="Unstage this entire file"
                    data-testid="unstage-file-modal-btn"
                  >
                    <Minus size={13} />
                    <span>Unstage File</span>
                  </button>
                )
              )}

              {/* Search Toggle Button */}
              {viewMode !== 'preview' && renderRows.length > 0 && !loading && !error && !isBinary && (
                <button
                  className={`diff-search-toggle-btn${searchOpen ? ' active' : ''}`}
                  onClick={() => {
                    setSearchOpen((prev) => {
                      const next = !prev
                      if (next) {
                        setTimeout(() => {
                          searchInputRef.current?.focus()
                          searchInputRef.current?.select()
                        }, 50)
                      }
                      return next
                    })
                  }}
                  data-tooltip="Search Text (Cmd+F / Ctrl+F)"
                  data-testid="toggle-search-btn"
                >
                  <Search size={13} />
                  <span>Search</span>
                </button>
              )}

              {/* Copy Old & Copy New Buttons */}
              {viewMode !== 'preview' && (
                <>
                  <button
                    className="diff-copy-btn"
                    data-testid="copy-left-btn"
                    onClick={handleCopyLeft}
                    data-tooltip="Copy Old (Left) File Content"
                  >
                    {copiedSide === 'left' ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                    <span>{copiedSide === 'left' ? 'Copied Old!' : 'Copy Old'}</span>
                  </button>
                  <button
                    className="diff-copy-btn"
                    data-testid="copy-right-btn"
                    onClick={handleCopyRight}
                    data-tooltip="Copy New (Right) File Content"
                  >
                    {copiedSide === 'right' ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                    <span>{copiedSide === 'right' ? 'Copied New!' : 'Copy New'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
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
                  letterSpacing: '0.05em'
                }}
              >
                Stash Files ({stashFiles.length})
              </div>
              <div style={{ flex: 1, overflow: 'auto' }}>
                {stashFilesLoading ? (
                  <div style={{ padding: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Loading stash files...
                  </div>
                ) : stashFilesError ? (
                  <div style={{ padding: '16px', fontSize: '12px', color: '#f87171' }}>
                    {stashFilesError}
                  </div>
                ) : (
                  stashFiles.map((file) => {
                    const isSelected = selectedStashFile?.path === file.path
                    return (
                      <div
                        key={file.path}
                        onClick={() => setSelectedStashFile(file)}
                        style={{
                          padding: '8px 16px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          backgroundColor: isSelected ? 'var(--hover)' : 'transparent',
                          color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          borderBottom: '1px solid rgba(255,255,255,0.03)'
                        }}
                      >
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.path}
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
            className={`diff-modal-scroll ${viewMode === 'preview' ? 'preview-mode' : ''}`}
            onCopy={handleCopy}
            style={{
              display: isStash && !selectedStashFile ? 'none' : 'flex',
              flexDirection: 'column'
            }}
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
            {!loading && !error && isBinary && !isImage && viewMode !== 'preview' && (
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

            {!loading && !error && isImage && (viewMode === 'preview' || isBinary) && (
              <ImageDiffView
                beforeContent={rawBefore}
                afterContent={rawAfter}
                filePath={currentFilePath}
                status={currentStatus}
              />
            )}

            {!loading && !error && viewMode === 'preview' && isMarkdown && (
              <MarkdownDiffView
                beforeContent={rawBefore}
                afterContent={rawAfter}
                filePath={currentFilePath}
                status={currentStatus}
              />
            )}

            {!loading && !error && !isBinary && viewMode !== 'preview' && (
              <div className="diff-table">
                {renderRows.length === 0 ? (
                  <div
                    data-testid="no-changes-placeholder"
                    style={{
                      padding: '60px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    No changes to display for this file
                  </div>
                ) : viewMode === 'chunks' && hunks.length > 0 ? (
                  hunks.map((hunk, hunkIdx) => {
                    const hunkIndices = new Set(hunk.lines.map((l) => l.indexInDiff))
                    const hunkRows = renderRows.filter((row) =>
                      row.diffIndices.some((idx) => hunkIndices.has(idx))
                    )
                    const rowsToRender = hunkRows.length > 0 ? hunkRows : renderRows

                    return (
                      <div key={`hunk-block-${hunkIdx}`}>
                        {/* Hunk Header Bar */}
                        <div
                          id={`diff-hunk-${hunkIdx}`}
                          className="diff-hunk-header"
                          data-testid={`hunk-header-${hunkIdx}`}
                        >
                          <div className="diff-hunk-title">
                            <Layers size={14} />
                            <span>{hunk.header}</span>
                            <span style={{ opacity: 0.6, fontSize: '11px' }}>
                              (Chunk {hunkIdx + 1} of {hunks.length})
                            </span>
                          </div>

                          {isActiveChange && (
                            <div className="diff-hunk-actions">
                              {!currentIsStaged ? (
                                <>
                                  <button
                                    className="diff-hunk-btn btn-stage"
                                    onClick={() => handleStageHunk(hunk)}
                                    disabled={actionLoading}
                                    title="Stage this chunk"
                                    data-testid={`stage-hunk-btn-${hunkIdx}`}
                                  >
                                    <Plus size={12} />
                                    <span>Stage Chunk</span>
                                  </button>
                                  <button
                                    className="diff-hunk-btn btn-discard"
                                    onClick={() => handleDiscardHunk(hunk)}
                                    disabled={actionLoading}
                                    title="Discard changes in this chunk"
                                    data-testid={`discard-hunk-btn-${hunkIdx}`}
                                  >
                                    <RotateCcw size={12} />
                                    <span>Discard Chunk</span>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    className="diff-hunk-btn btn-unstage"
                                    onClick={() => handleUnstageHunk(hunk)}
                                    disabled={actionLoading}
                                    title="Unstage this chunk"
                                    data-testid={`unstage-hunk-btn-${hunkIdx}`}
                                  >
                                    <Minus size={12} />
                                    <span>Unstage Chunk</span>
                                  </button>
                                  <button
                                    className="diff-hunk-btn btn-discard"
                                    onClick={() => handleDiscardHunk(hunk)}
                                    disabled={actionLoading}
                                    title="Discard staged changes in this chunk"
                                    data-testid={`discard-hunk-btn-${hunkIdx}`}
                                  >
                                    <RotateCcw size={12} />
                                    <span>Discard Chunk</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Hunk Rows */}
                        {rowsToRender.map((row, rowIdx) => {
                          const isRowSelected = row.diffIndices.some((idx) => selectedLineIndices.has(idx))

                          return (
                            <div
                              key={`row-${hunkIdx}-${rowIdx}`}
                              className={`diff-row type-${row.rowType}${isRowSelected ? ' line-selected' : ''}`}
                              onClick={(e) => handleRowClick(row.diffIndices, e)}
                            >
                              <div className={`diff-col left${row.rowType === 'add' ? ' empty-side' : ''}`}>
                                <span className="diff-line-number">{row.beforeNum || ''}</span>
                                <SearchHighlightContent
                                  text={row.beforeLine ?? ''}
                                  side="left"
                                  spans={row.oldSpans}
                                  type="delete"
                                  searchQuery={searchQuery}
                                  rowMatches={matchesByRowIdx.get(row.rowIdx ?? 0) || []}
                                  activeMatchIndex={activeMatchIndex}
                                />
                              </div>
                              <div className={`diff-col right${row.rowType === 'delete' ? ' empty-side' : ''}`}>
                                <span className="diff-line-number">{row.afterNum || ''}</span>
                                <SearchHighlightContent
                                  text={row.afterLine ?? ''}
                                  side="right"
                                  spans={row.newSpans}
                                  type="add"
                                  searchQuery={searchQuery}
                                  rowMatches={matchesByRowIdx.get(row.rowIdx ?? 0) || []}
                                  activeMatchIndex={activeMatchIndex}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                ) : (
                  renderRows.map((row, rowIdx) => {
                    const matchingHunk = row.diffIndices
                      .map((idx) => hunkByStartDiffIdx.get(idx))
                      .find((item) => item !== undefined)
                    const isRowSelected = row.diffIndices.some((idx) => selectedLineIndices.has(idx))

                    return (
                      <React.Fragment key={`full-row-${rowIdx}`}>
                        {matchingHunk && (
                          <div
                            id={`diff-hunk-${matchingHunk.hunkIdx}`}
                            className="diff-hunk-header"
                            data-testid={`hunk-header-${matchingHunk.hunkIdx}`}
                          >
                            <div className="diff-hunk-title">
                              <Layers size={14} />
                              <span>{matchingHunk.hunk.header}</span>
                              <span style={{ opacity: 0.6, fontSize: '11px' }}>
                                (Chunk {matchingHunk.hunkIdx + 1} of {hunks.length})
                              </span>
                            </div>

                            {isActiveChange && (
                              <div className="diff-hunk-actions">
                                {!currentIsStaged ? (
                                  <>
                                    <button
                                      className="diff-hunk-btn btn-stage"
                                      onClick={() => handleStageHunk(matchingHunk.hunk)}
                                      disabled={actionLoading}
                                      title="Stage this chunk"
                                      data-testid={`stage-hunk-btn-${matchingHunk.hunkIdx}`}
                                    >
                                      <Plus size={12} />
                                      <span>Stage Chunk</span>
                                    </button>
                                    <button
                                      className="diff-hunk-btn btn-discard"
                                      onClick={() => handleDiscardHunk(matchingHunk.hunk)}
                                      disabled={actionLoading}
                                      title="Discard changes in this chunk"
                                      data-testid={`discard-hunk-btn-${matchingHunk.hunkIdx}`}
                                    >
                                      <RotateCcw size={12} />
                                      <span>Discard Chunk</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      className="diff-hunk-btn btn-unstage"
                                      onClick={() => handleUnstageHunk(matchingHunk.hunk)}
                                      disabled={actionLoading}
                                      title="Unstage this chunk"
                                      data-testid={`unstage-hunk-btn-${matchingHunk.hunkIdx}`}
                                    >
                                      <Minus size={12} />
                                      <span>Unstage Chunk</span>
                                    </button>
                                    <button
                                      className="diff-hunk-btn btn-discard"
                                      onClick={() => handleDiscardHunk(matchingHunk.hunk)}
                                      disabled={actionLoading}
                                      title="Discard staged changes in this chunk"
                                      data-testid={`discard-hunk-btn-${matchingHunk.hunkIdx}`}
                                    >
                                      <RotateCcw size={12} />
                                      <span>Discard Chunk</span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div
                          className={`diff-row type-${row.rowType}${isRowSelected ? ' line-selected' : ''}`}
                          onClick={(e) => handleRowClick(row.diffIndices, e)}
                        >
                          <div className={`diff-col left${row.rowType === 'add' ? ' empty-side' : ''}`}>
                            <span className="diff-line-number">{row.beforeNum || ''}</span>
                            <SearchHighlightContent
                              text={row.beforeLine ?? ''}
                              side="left"
                              spans={row.oldSpans}
                              type="delete"
                              searchQuery={searchQuery}
                              rowMatches={matchesByRowIdx.get(row.rowIdx ?? 0) || []}
                              activeMatchIndex={activeMatchIndex}
                            />
                          </div>
                          <div className={`diff-col right${row.rowType === 'delete' ? ' empty-side' : ''}`}>
                            <span className="diff-line-number">{row.afterNum || ''}</span>
                            <SearchHighlightContent
                              text={row.afterLine ?? ''}
                              side="right"
                              spans={row.newSpans}
                              type="add"
                              searchQuery={searchQuery}
                              rowMatches={matchesByRowIdx.get(row.rowIdx ?? 0) || []}
                              activeMatchIndex={activeMatchIndex}
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

          {/* Floating Contextual Action Bar for Selected Lines */}
          {isActiveChange && selectedRowCount > 0 && (
            <div className="diff-floating-action-bar" data-testid="floating-action-bar">
              <div className="diff-floating-badge">
                <Layers size={14} style={{ color: 'var(--accent)' }} />
                <span>{selectedRowCount} selected line(s)</span>
              </div>

              {!currentIsStaged ? (
                <>
                  <button
                    className="diff-hunk-btn btn-stage"
                    onClick={handleStageSelectedLines}
                    disabled={actionLoading}
                    data-testid="stage-selected-btn"
                  >
                    <Plus size={12} />
                    <span>Stage Selected Lines</span>
                  </button>
                  <button
                    className="diff-hunk-btn btn-discard"
                    onClick={handleDiscardSelectedLines}
                    disabled={actionLoading}
                    data-testid="discard-selected-btn"
                  >
                    <Trash2 size={12} />
                    <span>Discard Selected Lines</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="diff-hunk-btn btn-unstage"
                    onClick={handleUnstageSelectedLines}
                    disabled={actionLoading}
                    data-testid="unstage-selected-btn"
                  >
                    <Minus size={12} />
                    <span>Unstage Selected Lines</span>
                  </button>
                  <button
                    className="diff-hunk-btn btn-discard"
                    onClick={handleDiscardSelectedLines}
                    disabled={actionLoading}
                    data-testid="discard-selected-btn"
                  >
                    <Trash2 size={12} />
                    <span>Discard Selected Lines</span>
                  </button>
                </>
              )}

              <button
                className="diff-hunk-btn"
                onClick={() => setSelectedLineIndices(new Set())}
                style={{ marginLeft: '4px' }}
                data-testid="clear-selection-btn"
              >
                <span>Deselect All</span>
              </button>
            </div>
          )}

          {!loading && !error && !isBinary && viewMode !== 'preview' && renderRows.length > 0 && (
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

      {/* Custom Non-Blocking Confirmation Dialog for Discard Actions */}
      {confirmDialog && confirmDialog.isOpen && (
        <div
          className="modal-backdrop"
          style={{
            zIndex: 1200,
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setConfirmDialog(null)}
          data-testid="custom-confirm-dialog"
        >
          <div
            className="modal-content"
            style={{
              width: '420px',
              padding: '24px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ef4444',
                  flexShrink: 0
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {confirmDialog.title}
              </h3>
            </div>

            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn-secondary"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
                onClick={() => setConfirmDialog(null)}
                data-testid="cancel-discard-btn"
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer'
                }}
                onClick={confirmDialog.onConfirm}
                data-testid="confirm-discard-btn"
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
