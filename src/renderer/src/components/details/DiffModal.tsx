import React, { useEffect, useState, useRef } from 'react'
import { X, FileText } from 'lucide-react'

interface DiffModalProps {
  isOpen: boolean
  onClose: () => void
  filePath: string
  oldPath?: string
  status: string
  commitHash: string
  repoPath: string
}

interface DiffItem {
  type: 'normal' | 'add' | 'delete'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
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
  repoPath
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [diffItems, setDiffItems] = useState<DiffItem[]>([])
  const [isBinary, setIsBinary] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setLoading(true)
    setError(null)

    window.api.git
      .getCommitFileDiff(repoPath, commitHash, filePath, oldPath, status)
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
  }, [isOpen, filePath, commitHash, repoPath])

  // 2. Scroll to the first diff position after loading
  useEffect(() => {
    if (!loading && diffItems.length > 0) {
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
  }, [loading, diffItems])

  const changeIndexes = diffItems
    .map((item, idx) => ({ type: item.type, idx }))
    .filter((item) => item.type === 'add' || item.type === 'delete')

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

  return (
    <div className="diff-modal-overlay" onClick={onClose}>
      <div className="diff-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} style={{ color: 'var(--accent-light)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', wordBreak: 'break-all' }}>{filePath}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {status === 'R' ? `Renamed from ${oldPath} | ` : ''}
                Commit: <span style={{ fontFamily: 'monospace' }}>{commitHash.substring(0, 8)}</span>
              </div>
            </div>
          </div>
          <button className="diff-modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="diff-modal-body">
          <div ref={bodyRef} className="diff-modal-scroll">
            {loading && (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading file diff...
              </div>
            )}
            {error && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
                Error: {error}
              </div>
            )}
            {!loading && !error && isBinary && (
              <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Binary file (diff not available as text)
              </div>
            )}
            {!loading && !error && !isBinary && (
              <div className="diff-table">
                {diffItems.map((item, idx) => (
                  <div key={idx} className={`diff-row type-${item.type}`}>
                    <div className="diff-col left">
                      <span className="diff-line-number">{item.beforeNum || ''}</span>
                      <pre className="diff-line-content">{item.beforeLine ?? ''}</pre>
                    </div>
                    <div className="diff-col right">
                      <span className="diff-line-number">{item.afterNum || ''}</span>
                      <pre className="diff-line-content">{item.afterLine ?? ''}</pre>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!loading && !error && !isBinary && diffItems.length > 0 && (
            <div className="diff-overview-ruler" onClick={handleRulerClick}>
              {changeIndexes.map((change) => {
                const topPct = (change.idx / diffItems.length) * 100
                const isDelete = change.type === 'delete'
                return (
                  <div
                    key={change.idx}
                    className={`diff-ruler-marker type-${change.type}`}
                    style={{
                      position: 'absolute',
                      top: `${topPct}%`,
                      height: '2px',
                      left: isDelete ? '0' : '50%',
                      width: '50%',
                      backgroundColor: isDelete ? '#f87171' : '#34d399',
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
