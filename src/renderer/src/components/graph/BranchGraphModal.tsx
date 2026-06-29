import React, { useMemo, useRef, useState, useEffect } from 'react'
import { X, GitBranch, Globe, Search, Tag } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Commit {
  hash: string
  message: string
  author_name?: string
  author?: string
  date?: string
  refs?: string
  parents?: string
  syncStatus?: 'local-only' | 'remote-only' | 'pushed'
}

interface BranchInfo { name: string; ahead: number; behind: number }
interface BranchData { local: Array<BranchInfo | string>; remote: string[] }

interface BranchGraphModalProps {
  isOpen: boolean
  onClose: () => void
  commits: Commit[]
  branches: BranchData | null | undefined
  tags: string[] | undefined
  currentBranch: string
  repoName: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_H   = 34
const LANE_W  = 20
const DOT_R   = 5
const LEFT_PAD = 14

const LANE_COLOURS = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#f472b6', // pink
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
  '#f87171', // red
  '#38bdf8', // sky
  '#e879f9', // fuchsia
  '#facc15', // yellow
]

// ─── Graph computation types ──────────────────────────────────────────────────

interface RowState {
  hash: string
  myLane: number
  colour: string
  hasLineFromAbove: boolean   // straight vertical line coming in from the top
  hasLineBelow: boolean       // straight vertical line going out to the bottom
  // other lanes that pass straight through this row (vertical lines)
  passThrough: Array<{ lane: number; colour: string }>
  // lanes that converge INTO this commit node from above (bezier from top of row to node)
  convergeLanes: Array<{ lane: number; colour: string }>
  // branch-out curves going DOWN from the node (for additional/merge parents)
  branchCurves: Array<{ toLane: number; colour: string }>
}

// ─── Lane-Assignment with full row-state computation ─────────────────────────
//
//  Walk commits newest→oldest.
//  Maintain lanes[] = array of (hash | null) — the commit hash each lane is
//  "waiting for" on the next visible occurrence.
//
//  Per row:
//    1. Determine myLane (existing tracking or new free slot)
//    2. Detect convergences (other lanes also tracking this hash → they merge in)
//    3. Detect pass-throughs (all other active lanes → straight vertical line)
//    4. Update myLane to track first parent
//    5. Assign extra parents to lanes → branchCurves going downward

function computeRowStates(commits: Commit[]): RowState[] {
  const result: RowState[] = []
  if (commits.length === 0) return result

  const lanes: (string | null)[] = []

  const getParents = (c: Commit): string[] =>
    c.parents ? c.parents.split(/\s+/).filter(Boolean) : []

  const allocLane = (): number => {
    const free = lanes.indexOf(null)
    if (free !== -1) return free
    lanes.push(null)
    return lanes.length - 1
  }

  for (const commit of commits) {
    const parents = getParents(commit)

    // 1. Find or open myLane
    let myLane = lanes.indexOf(commit.hash)
    const wasTracked = myLane !== -1
    if (!wasTracked) {
      myLane = allocLane()
    }
    const colour = LANE_COLOURS[myLane % LANE_COLOURS.length]

    // 2. Collect convergeLanes: other lanes that were ALSO tracking this commit
    //    (happens when a branch's tip was below and both lanes now point here)
    const convergeLanes: RowState['convergeLanes'] = []
    for (let i = 0; i < lanes.length; i++) {
      if (i !== myLane && lanes[i] === commit.hash) {
        convergeLanes.push({ lane: i, colour: LANE_COLOURS[i % LANE_COLOURS.length] })
        lanes[i] = null // free the converged lane
      }
    }

    // 3. pass-throughs: all remaining active lanes that aren't myLane
    const passThrough: RowState['passThrough'] = []
    for (let i = 0; i < lanes.length; i++) {
      if (i !== myLane && lanes[i] !== null) {
        passThrough.push({ lane: i, colour: LANE_COLOURS[i % LANE_COLOURS.length] })
      }
    }

    // 4. Update myLane for first parent
    const hasLineBelow = parents.length > 0
    if (parents.length > 0) {
      // Check if first parent is already tracked by another lane
      const existing = lanes.indexOf(parents[0])
      if (existing !== -1 && existing !== myLane) {
        // Our first parent is already being tracked → this lane will converge downward
        // Draw a convergence curve from myLane → existing lane going below
        // We treat it as a "branchCurve" pointing down
        lanes[myLane] = null
        // We'll add this as a "convergence going down" — re-use branchCurves with our colour
        // handled below in branchCurves section
        // Actually push it as a converge-down curve using the parent lane's colour
        // ... let's just null the lane and add a curve
      } else {
        lanes[myLane] = parents[0]
      }
    } else {
      lanes[myLane] = null
    }

    // 5. Assign additional (merge) parents → branchCurves going downward
    const branchCurves: RowState['branchCurves'] = []
    for (let p = 1; p < parents.length; p++) {
      const pHash = parents[p]
      let targetLane = lanes.indexOf(pHash)
      if (targetLane === -1) {
        targetLane = allocLane()
        lanes[targetLane] = pHash
      }
      branchCurves.push({ toLane: targetLane, colour })
    }

    result.push({
      hash: commit.hash,
      myLane,
      colour,
      hasLineFromAbove: wasTracked,
      hasLineBelow,
      passThrough,
      convergeLanes,
      branchCurves,
    })
  }

  return result
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractAllBranchNames(refs: string | undefined): string[] {
  if (!refs) return []
  return refs
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r && r !== 'HEAD' && !r.startsWith('tag: '))
    .map((r) =>
      r
        .replace(/^HEAD -> /, '')
        .replace(/^refs\/heads\//, '')
        .replace(/^refs\/remotes\//, '')
    )
}

function extractTagRefs(refs: string | undefined): string[] {
  if (!refs) return []
  return refs.split(',').map((r) => r.trim()).filter((r) => r.startsWith('tag: ')).map((r) => r.substring(5))
}

function formatDate(dateStr: string): string {
  try {
    const d   = new Date(dateStr)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7)   return `${diffDays}d ago`
    if (diffDays < 30)  return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  } catch { return dateStr }
}

function hexToRgb(hex: string): string {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!r) return '99,102,241'
  return `${parseInt(r[1], 16)},${parseInt(r[2], 16)},${parseInt(r[3], 16)}`
}

// ─── Row SVG ─────────────────────────────────────────────────────────────────

interface RowSvgProps {
  state: RowState
  svgW: number
  isSelected: boolean
  isHead: boolean
  syncStatus?: 'local-only' | 'remote-only' | 'pushed'
}

const RowSvg: React.FC<RowSvgProps> = ({ state, svgW, isSelected, isHead }) => {
  const { myLane, colour, hasLineFromAbove, hasLineBelow, passThrough, convergeLanes, branchCurves } = state
  const cx = LEFT_PAD + myLane * LANE_W
  const cy = ROW_H / 2

  return (
    <svg width={svgW} height={ROW_H} style={{ display: 'block', flexShrink: 0 }}>
      {/* ── Pass-through vertical lines (other active lanes) ── */}
      {passThrough.map(({ lane, colour: c }) => {
        const px = LEFT_PAD + lane * LANE_W
        return (
          <line
            key={`pt-${lane}`}
            x1={px} y1={0} x2={px} y2={ROW_H}
            stroke={c} strokeWidth={2} strokeOpacity={0.65}
          />
        )
      })}

      {/* ── Convergence curves coming in from top (other lanes merging into this commit) ── */}
      {convergeLanes.map(({ lane, colour: c }) => {
        const sx = LEFT_PAD + lane * LANE_W
        // curve from (sx, 0) → (cx, cy)
        const mid = cy * 0.6
        return (
          <path
            key={`conv-${lane}`}
            d={`M ${sx} 0 C ${sx} ${mid}, ${cx} ${mid}, ${cx} ${cy}`}
            stroke={c} strokeWidth={2} strokeOpacity={0.75} fill="none"
          />
        )
      })}

      {/* ── Straight line from top down to commit node ── */}
      {hasLineFromAbove && (
        <line x1={cx} y1={0} x2={cx} y2={cy - DOT_R} stroke={colour} strokeWidth={2} strokeOpacity={0.75} />
      )}

      {/* ── Straight line from commit node down ── */}
      {hasLineBelow && (
        <line x1={cx} y1={cy + DOT_R} x2={cx} y2={ROW_H} stroke={colour} strokeWidth={2} strokeOpacity={0.75} />
      )}

      {/* ── Branch-out / merge curves going downward ── */}
      {branchCurves.map(({ toLane, colour: c }, i) => {
        const tx = LEFT_PAD + toLane * LANE_W
        const midY = cy + (ROW_H - cy) * 0.55
        return (
          <path
            key={`bc-${i}`}
            d={`M ${cx} ${cy + DOT_R} C ${cx} ${midY}, ${tx} ${midY}, ${tx} ${ROW_H}`}
            stroke={c} strokeWidth={1.8} strokeOpacity={0.65} fill="none"
          />
        )
      })}

      {/* ── HEAD glow ── */}
      {isHead && (
        <circle cx={cx} cy={cy} r={DOT_R + 5} fill={colour} opacity={0.2} />
      )}

      {/* ── Selection ring ── */}
      {isSelected && (
        <circle cx={cx} cy={cy} r={DOT_R + 4} fill="transparent" stroke={colour} strokeWidth={1.5} strokeOpacity={0.4} />
      )}

      {/* ── Commit node ── */}
      <circle
        cx={cx} cy={cy}
        r={isSelected ? DOT_R + 1 : DOT_R}
        fill={isHead ? colour : (isSelected ? colour : '#161920')}
        stroke={colour}
        strokeWidth={2}
      />

      {/* ── Inner filled dot for synced commits ── */}
      {!isHead && (
        <circle cx={cx} cy={cy} r={2.2} fill={colour} opacity={0.55} />
      )}
    </svg>
  )
}

// ─── Branch Graph Modal ───────────────────────────────────────────────────────

const BranchGraphModal: React.FC<BranchGraphModalProps> = ({
  isOpen,
  onClose,
  commits,
  branches,
  tags,
  currentBranch,
  repoName,
}) => {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'local' | 'remote'>('all')
  const [selectedHash, setSelectedHash] = useState<string | null>(commits.length > 0 ? commits[0].hash : null)
  const [highlightBranch, setHighlightBranch] = useState<string | null>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isOpen, onClose])

  useEffect(() => {
    if (commits.length > 0 && !selectedHash) setSelectedHash(commits[0].hash)
  }, [commits])

  // Pre-compute row states (lane assignment)
  const rowStates = useMemo(() => computeRowStates(commits), [commits])

  const maxLanes = useMemo(() => {
    let max = 1
    rowStates.forEach((s) => {
      const allLanes = [s.myLane, ...s.passThrough.map(p => p.lane), ...s.convergeLanes.map(c => c.lane), ...s.branchCurves.map(b => b.toLane)]
      allLanes.forEach(l => { if (l + 1 > max) max = l + 1 })
    })
    return max
  }, [rowStates])

  const svgW = LEFT_PAD + maxLanes * LANE_W + 10

  // Branch tip map (branch name → first commit hash in list with that ref)
  const branchTipMap = useMemo(() => {
    const m = new Map<string, string>()
    commits.forEach((c) => {
      extractAllBranchNames(c.refs).forEach((n) => { if (!m.has(n)) m.set(n, c.hash) })
    })
    return m
  }, [commits])

  // Ancestor set for branch highlighting
  const highlightHashes = useMemo<Set<string> | null>(() => {
    if (!highlightBranch) return null
    const cleanName = highlightBranch.includes('/') ? highlightBranch.split('/').slice(1).join('/') : highlightBranch
    const tipHash = branchTipMap.get(highlightBranch) || branchTipMap.get(cleanName)
    if (!tipHash) return null
    const parentMap = new Map<string, string[]>()
    commits.forEach((c) => { parentMap.set(c.hash, c.parents ? c.parents.split(/\s+/).filter(Boolean) : []) })
    const visited = new Set<string>()
    const queue = [tipHash]
    while (queue.length) {
      const h = queue.shift()!
      if (visited.has(h)) continue
      visited.add(h)
      ;(parentMap.get(h) || []).forEach(p => queue.push(p))
    }
    return visited
  }, [highlightBranch, branchTipMap, commits])

  const localBranches = useMemo(
    () => (branches?.local || []).map(b => typeof b === 'string' ? { name: b, ahead: 0, behind: 0 } : b),
    [branches]
  )
  const remoteBranches = useMemo(() => branches?.remote || [], [branches])

  const filteredLocal  = useMemo(() => filter !== 'remote' ? localBranches.filter(b => b.name.toLowerCase().includes(search.toLowerCase())) : [], [localBranches, search, filter])
  const filteredRemote = useMemo(() => filter !== 'local'  ? remoteBranches.filter(b => b.toLowerCase().includes(search.toLowerCase())) : [], [remoteBranches, search, filter])

  const selectedCommit = useMemo(() => commits.find(c => c.hash === selectedHash) || null, [commits, selectedHash])

  const handleSelectBranch = (branchName: string) => {
    const clean = branchName.includes('/') ? branchName.split('/').slice(1).join('/') : branchName
    const tipHash = branchTipMap.get(branchName) || branchTipMap.get(clean)
    setHighlightBranch(highlightBranch === branchName ? null : branchName)
    if (tipHash) {
      setSelectedHash(tipHash)
      setTimeout(() => rowRefs.current.get(tipHash)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
      data-testid="branch-graph-modal-overlay"
    >
      <div
        style={{
          width: '92vw', maxWidth: '1320px', height: '84vh',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid rgba(99,102,241,0.18)',
          borderRadius: '12px',
          boxShadow: '0 32px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.04)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={e => e.stopPropagation()}
        data-testid="branch-graph-modal"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '13px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.07) 0%, transparent 60%)',
          flexShrink: 0,
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.35), rgba(99,102,241,0.1))',
            border: '1px solid rgba(99,102,241,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(99,102,241,0.2)',
          }}>
            <GitBranch size={15} style={{ color: '#818cf8' }} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Branch Graph</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
              {repoName} · {commits.length} commits · {localBranches.length} local · {remoteBranches.length} remote
            </div>
          </div>
          <div style={{
            marginLeft: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 11px',
            background: 'rgba(99,102,241,0.13)', border: '1px solid rgba(99,102,241,0.27)',
            borderRadius: '20px', fontSize: '11px', fontWeight: 700, color: '#818cf8',
          }}>
            <GitBranch size={11} />{currentBranch}
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto', background: 'transparent', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px',
              borderRadius: '6px', display: 'flex', alignItems: 'center',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)' }}
            data-testid="branch-graph-close-btn"
            data-tooltip="Close graph (Escape)"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left sidebar */}
          <div style={{
            width: '220px', flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            background: 'rgba(0,0,0,0.15)',
          }}>
            {/* Search */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '6px 10px', background: 'var(--bg-primary)',
                border: '1px solid var(--border)', borderRadius: '6px',
              }}>
                <Search size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <input
                  type="text" placeholder="Filter branches..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '11px', width: '100%' }}
                  data-testid="branch-graph-search"
                />
              </div>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', padding: '6px 8px', gap: '4px', borderBottom: '1px solid var(--border)' }}>
              {(['all', 'local', 'remote'] as const).map(tab => (
                <button key={tab} onClick={() => setFilter(tab)} style={{
                  flex: 1, padding: '3px 0',
                  background: filter === tab ? 'rgba(99,102,241,0.17)' : 'transparent',
                  border: filter === tab ? '1px solid rgba(99,102,241,0.27)' : '1px solid transparent',
                  borderRadius: '4px',
                  color: filter === tab ? '#818cf8' : 'var(--text-secondary)',
                  fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s', textTransform: 'capitalize',
                }}>{tab}</button>
              ))}
            </div>
            {/* Branch list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredLocal.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Local</div>
                  {filteredLocal.map(b => {
                    const isActive = b.name === currentBranch
                    const isHL = highlightBranch === b.name
                    return (
                      <div key={b.name} onClick={() => handleSelectBranch(b.name)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px', cursor: 'pointer', background: isHL ? 'rgba(99,102,241,0.1)' : 'transparent', borderLeft: isHL ? '2px solid #818cf8' : '2px solid transparent', transition: 'all 0.12s' }}
                        onMouseEnter={e => { if (!isHL) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (!isHL) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        data-testid={`branch-graph-local-${b.name}`}>
                        <GitBranch size={11} style={{ color: isActive ? '#818cf8' : 'var(--text-secondary)', flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', fontWeight: isActive ? 700 : 500, color: isActive ? '#818cf8' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={b.name}>{b.name}</span>
                        {(b.ahead > 0 || b.behind > 0) && <span style={{ fontSize: '9px', fontWeight: 700, color: b.ahead > 0 ? '#34d399' : '#fbbf24', flexShrink: 0 }}>{b.ahead > 0 ? `↑${b.ahead}` : `↓${b.behind}`}</span>}
                      </div>
                    )
                  })}
                </>
              )}
              {filteredRemote.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: filteredLocal.length > 0 ? '4px' : 0 }}>Remote</div>
                  {filteredRemote.map(b => {
                    const isHL = highlightBranch === b
                    return (
                      <div key={b} onClick={() => handleSelectBranch(b)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px', cursor: 'pointer', background: isHL ? 'rgba(52,211,153,0.08)' : 'transparent', borderLeft: isHL ? '2px solid #34d399' : '2px solid transparent', transition: 'all 0.12s' }}
                        onMouseEnter={e => { if (!isHL) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (!isHL) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        data-testid={`branch-graph-remote-${b}`}>
                        <Globe size={11} style={{ color: '#34d399', flexShrink: 0 }} />
                        <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b}>{b}</span>
                      </div>
                    )
                  })}
                </>
              )}
              {filter === 'all' && tags && tags.filter(t => t.toLowerCase().includes(search.toLowerCase())).length > 0 && (
                <>
                  <div style={{ padding: '8px 12px 4px', fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: '4px' }}>Tags</div>
                  {tags.filter(t => t.toLowerCase().includes(search.toLowerCase())).map(t => (
                    <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 12px' }} data-testid={`branch-graph-tag-${t}`}>
                      <Tag size={11} style={{ color: '#f472b6', flexShrink: 0 }} />
                      <span style={{ fontSize: '11px', fontWeight: 500, color: '#f9a8d4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t}>{t}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Right: graph + commit list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Column headers */}
            <div style={{
              display: 'flex', alignItems: 'center',
              height: '26px', borderBottom: '1px solid var(--border)',
              background: 'rgba(0,0,0,0.18)', flexShrink: 0,
            }}>
              <div style={{ width: `${svgW}px`, flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: '4px' }}>Message</div>
              <div style={{ width: '100px', fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right', paddingRight: '12px' }}>Author</div>
              <div style={{ width: '68px', fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hash</div>
              <div style={{ width: '62px', fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right', letterSpacing: '0.06em', textTransform: 'uppercase', paddingRight: '16px' }}>Date</div>
            </div>

            {/* Commit rows */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
              <div style={{ minWidth: '600px' }}>
                {commits.map((commit, rowIdx) => {
                  const state = rowStates[rowIdx]
                  if (!state) return null

                  const isSelected  = commit.hash === selectedHash
                  const isHead      = !!(commit.refs && commit.refs.includes('HEAD -> '))
                  const isDimmed    = highlightHashes !== null && !highlightHashes.has(commit.hash)
                  const branchLabels = extractAllBranchNames(commit.refs)
                  const tagLabels    = extractTagRefs(commit.refs)

                  return (
                    <div
                      key={commit.hash}
                      ref={el => { if (el) rowRefs.current.set(commit.hash, el) }}
                      onClick={() => setSelectedHash(commit.hash)}
                      style={{
                        display: 'flex', alignItems: 'center', height: `${ROW_H}px`,
                        cursor: 'pointer',
                        background: isSelected ? `rgba(${hexToRgb(state.colour)},0.09)` : 'transparent',
                        borderLeft: isSelected ? `2px solid ${state.colour}` : '2px solid transparent',
                        opacity: isDimmed ? 0.22 : 1,
                        transition: 'background 0.1s, opacity 0.18s',
                      }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      data-testid={`graph-commit-row-${commit.hash}`}
                    >
                      {/* Graph SVG */}
                      <RowSvg
                        state={state}
                        svgW={svgW}
                        isSelected={isSelected}
                        isHead={isHead}
                        syncStatus={commit.syncStatus}
                      />

                      {/* Branch/tag labels */}
                      {(branchLabels.length > 0 || tagLabels.length > 0) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, maxWidth: '250px', overflow: 'hidden', paddingRight: '4px' }}>
                          {branchLabels.slice(0, 3).map(label => {
                            const isCurr   = label === currentBranch
                            const isRemLbl = label.includes('/')
                            return (
                              <span key={label} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                                background: isCurr ? 'rgba(99,102,241,0.17)' : isRemLbl ? 'rgba(52,211,153,0.09)' : 'rgba(129,140,248,0.09)',
                                border: isCurr ? '1px solid rgba(99,102,241,0.36)' : isRemLbl ? '1px solid rgba(52,211,153,0.22)' : '1px solid rgba(129,140,248,0.18)',
                                color: isCurr ? '#818cf8' : isRemLbl ? '#34d399' : '#a5b4fc',
                              }} title={label}>
                                {isRemLbl ? <Globe size={9} /> : <GitBranch size={9} />}
                                {label.length > 20 ? label.substring(0, 20) + '…' : label}
                              </span>
                            )
                          })}
                          {tagLabels.slice(0, 2).map(t => (
                            <span key={`tag:${t}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              padding: '2px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap',
                              background: 'rgba(244,114,182,0.09)', border: '1px solid rgba(244,114,182,0.22)', color: '#f472b6',
                            }} title={t}>
                              <Tag size={9} />
                              {t.length > 12 ? t.substring(0, 12) + '…' : t}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Message */}
                      <div style={{ flex: 1, minWidth: 0, paddingLeft: branchLabels.length === 0 && tagLabels.length === 0 ? '6px' : '8px', paddingRight: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={commit.message}>
                          {commit.message}
                        </span>
                      </div>

                      {/* Meta */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '16px', flexShrink: 0 }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '90px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{commit.author_name || commit.author || ''}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", opacity: 0.5, whiteSpace: 'nowrap', width: '56px', textAlign: 'center' }}>{commit.hash.substring(0, 7)}</span>
                        {commit.date && <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', opacity: 0.6, width: '58px', textAlign: 'right' }}>{formatDate(commit.date)}</span>}
                      </div>
                    </div>
                  )
                })}

                {commits.length === 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    No commits to display
                  </div>
                )}
              </div>
            </div>

            {/* Selected commit strip */}
            {selectedCommit && (
              <div style={{
                borderTop: '1px solid var(--border)', padding: '10px 16px',
                background: 'rgba(99,102,241,0.04)',
                display: 'flex', alignItems: 'center', gap: '16px',
                flexShrink: 0, minHeight: '50px',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCommit.message}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{selectedCommit.author_name || selectedCommit.author} · {selectedCommit.date ? formatDate(selectedCommit.date) : ''}</span>
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: '#818cf8', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', padding: '3px 9px', borderRadius: '5px', flexShrink: 0 }}>
                  {selectedCommit.hash.substring(0, 12)}
                </span>
                {selectedCommit.syncStatus && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', flexShrink: 0,
                    background: selectedCommit.syncStatus === 'local-only' ? 'rgba(52,211,153,0.1)' : selectedCommit.syncStatus === 'remote-only' ? 'rgba(251,191,36,0.1)' : 'rgba(99,102,241,0.1)',
                    color: selectedCommit.syncStatus === 'local-only' ? '#34d399' : selectedCommit.syncStatus === 'remote-only' ? '#fbbf24' : '#818cf8',
                    border: selectedCommit.syncStatus === 'local-only' ? '1px solid rgba(52,211,153,0.2)' : selectedCommit.syncStatus === 'remote-only' ? '1px solid rgba(251,191,36,0.2)' : '1px solid rgba(99,102,241,0.2)',
                  }}>
                    {selectedCommit.syncStatus === 'local-only' ? '↑ local only' : selectedCommit.syncStatus === 'remote-only' ? '↓ remote only' : '✓ pushed'}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BranchGraphModal
