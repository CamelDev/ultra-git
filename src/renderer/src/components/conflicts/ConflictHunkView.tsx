import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, GitBranch, RotateCcw } from 'lucide-react'
import { ConflictCode, ConflictRawDiffPane } from './ConflictCode'
import { buildConflictDiffRows } from './conflictDiff'
import {
  composePickedLines,
  getInitialPickedLines,
  getSourceExcerpt,
  type PickedConflictLine,
  togglePickedLine
} from './conflictPresentation'
import type { ConflictDocument, ConflictRegion, RegionChoice } from '../../../../shared/conflicts'

interface Props {
  document: ConflictDocument
  region: ConflictRegion | null
  showBase: boolean
  codeView?: boolean
  readOnly: boolean
  currentLabel: string
  incomingLabel: string
  currentRef: string
  incomingRef: string
  onChoice: (choice: RegionChoice, selected?: string) => void
}

export function getHunkResultContent(region: ConflictRegion | null): string {
  if (!region || region.choice === 'unresolved') return ''
  if (region.selected !== undefined) return region.selected
  if (region.choice === 'current') return region.current
  if (region.choice === 'incoming') return region.incoming
  if (region.choice === 'both-current-first') {
    if (region.current === region.incoming) return region.current
    const sep = region.current.endsWith('\n') || region.current.length === 0 ? '' : '\n'
    return `${region.current}${sep}${region.incoming}`
  }
  if (region.choice === 'both-incoming-first') {
    if (region.incoming === region.current) return region.incoming
    const sep = region.incoming.endsWith('\n') || region.incoming.length === 0 ? '' : '\n'
    return `${region.incoming}${sep}${region.current}`
  }
  return ''
}

export const ConflictHunkView: React.FC<Props> = ({ document, region, showBase, codeView = true, readOnly, currentLabel, incomingLabel, currentRef, incomingRef, onChoice }) => {
  const currentScrollRef = useRef<HTMLPreElement>(null)
  const incomingScrollRef = useRef<HTMLPreElement>(null)
  const lastSyncedRef = useRef<{
    current: { top: number; left: number } | null
    incoming: { top: number; left: number } | null
  }>({ current: null, incoming: null })
  const [pickedByRegion, setPickedByRegion] = useState<Record<string, PickedConflictLine[]>>({})
  const regionKey = region ? `${document.path}::${region.id}` : ''

  const handlePaneScroll = useCallback((source: 'current' | 'incoming') => {
    const target = source === 'current' ? 'incoming' : 'current'
    const fromEl = source === 'current' ? currentScrollRef.current : incomingScrollRef.current
    const toEl = source === 'current' ? incomingScrollRef.current : currentScrollRef.current
    if (!fromEl || !toEl) return

    const synced = lastSyncedRef.current[source]
    if (synced) {
      lastSyncedRef.current[source] = null
      if (Math.abs(fromEl.scrollTop - synced.top) <= 1 && Math.abs(fromEl.scrollLeft - synced.left) <= 1) {
        return
      }
    }

    const nextTop = Math.min(fromEl.scrollTop, Math.max(0, toEl.scrollHeight - toEl.clientHeight))
    const nextLeft = Math.min(fromEl.scrollLeft, Math.max(0, toEl.scrollWidth - toEl.clientWidth))
    if (toEl.scrollTop !== nextTop || toEl.scrollLeft !== nextLeft) {
      toEl.scrollTop = nextTop
      toEl.scrollLeft = nextLeft
      lastSyncedRef.current[target] = { top: toEl.scrollTop, left: toEl.scrollLeft }
    }
  }, [])

  useEffect(() => {
    lastSyncedRef.current = { current: null, incoming: null }
    if (currentScrollRef.current) {
      currentScrollRef.current.scrollTop = 0
      currentScrollRef.current.scrollLeft = 0
    }
    if (incomingScrollRef.current) {
      incomingScrollRef.current.scrollTop = 0
      incomingScrollRef.current.scrollLeft = 0
    }
  }, [document.path, region?.id])

  const current = useMemo(
    () => region ? getSourceExcerpt(document.stage2?.bytes, region.current, region.currentRange) : null,
    [document.stage2?.bytes, region]
  )
  const incoming = useMemo(
    () => region ? getSourceExcerpt(document.stage3?.bytes, region.incoming, region.incomingRange) : null,
    [document.stage3?.bytes, region]
  )
  const base = useMemo(
    () => region ? getSourceExcerpt(document.base?.bytes, region.base, region.baseRange) : null,
    [document.base?.bytes, region]
  )
  const diffRows = useMemo(
    () => (!codeView && current && incoming ? buildConflictDiffRows(current.content, incoming.content, current.startLine, incoming.startLine) : []),
    [codeView, current, incoming]
  )

  const activePicks = useMemo(() => {
    if (!region) return []
    if (region.choice === 'selected-range') return pickedByRegion[regionKey] ?? []
    return getInitialPickedLines(region)
  }, [region, regionKey, pickedByRegion])

  const currentPickedLines = useMemo(
    () => new Set(activePicks.filter(pick => pick.side === 'current').map(pick => pick.lineIndex)),
    [activePicks]
  )
  const incomingPickedLines = useMemo(
    () => new Set(activePicks.filter(pick => pick.side === 'incoming').map(pick => pick.lineIndex)),
    [activePicks]
  )

  const handleWholeChoice = useCallback((choice: RegionChoice) => {
    if (regionKey) {
      setPickedByRegion(prev => {
        if (!(regionKey in prev)) return prev
        const next = { ...prev }
        delete next[regionKey]
        return next
      })
    }
    onChoice(choice)
  }, [regionKey, onChoice])

  const handleToggleLine = useCallback((side: 'current' | 'incoming', lineIndex: number) => {
    if (!region || readOnly) return
    const nextPicks = togglePickedLine(activePicks, side, lineIndex)
    setPickedByRegion(prev => ({ ...prev, [regionKey]: nextPicks }))
    if (nextPicks.length === 0) {
      onChoice('unresolved')
    } else {
      onChoice('selected-range', composePickedLines(nextPicks, region))
    }
  }, [region, readOnly, activePicks, regionKey, onChoice])

  if (document.isBinary || !region || !current || !incoming || !base) return <div className="conflict-empty" role="status">Select a conflict to inspect.</div>

  return <div className="conflict-source-area">
    <div className="conflict-panes" aria-label="Conflict sources">
      <SourcePane label={currentLabel} reference={currentRef} side="current" readOnly={readOnly} selected={region.choice === 'current'} onChoose={() => handleWholeChoice('current')}>
        {codeView
          ? <ConflictCode {...current} path={document.path} highlight={region.currentRange} testId="conflict-current-pane" scrollRef={currentScrollRef} onScroll={() => handlePaneScroll('current')} pickSide="current" pickableRange={region.currentRange} pickedLines={currentPickedLines} pickDisabled={readOnly} onToggleLine={idx => handleToggleLine('current', idx)} />
          : <ConflictRawDiffPane rows={diffRows} side="left" testId="conflict-current-pane" scrollRef={currentScrollRef} onScroll={() => handlePaneScroll('current')} pickSide="current" pickableRange={region.currentRange} pickedLines={currentPickedLines} pickDisabled={readOnly} onToggleLine={idx => handleToggleLine('current', idx)} />}
      </SourcePane>
      <SourcePane label={incomingLabel} reference={incomingRef} side="incoming" readOnly={readOnly} selected={region.choice === 'incoming'} onChoose={() => handleWholeChoice('incoming')}>
        {codeView
          ? <ConflictCode {...incoming} path={document.path} highlight={region.incomingRange} testId="conflict-incoming-pane" scrollRef={incomingScrollRef} onScroll={() => handlePaneScroll('incoming')} pickSide="incoming" pickableRange={region.incomingRange} pickedLines={incomingPickedLines} pickDisabled={readOnly} onToggleLine={idx => handleToggleLine('incoming', idx)} />
          : <ConflictRawDiffPane rows={diffRows} side="right" testId="conflict-incoming-pane" scrollRef={incomingScrollRef} onScroll={() => handlePaneScroll('incoming')} pickSide="incoming" pickableRange={region.incomingRange} pickedLines={incomingPickedLines} pickDisabled={readOnly} onToggleLine={idx => handleToggleLine('incoming', idx)} />}
      </SourcePane>
    </div>
    {showBase && <section className="conflict-base-context" aria-label="Base source"><div className="conflict-pane-title"><strong>Base</strong><span>Common ancestor · this conflict</span></div><ConflictCode {...base} path={document.path} highlight={region.baseRange} testId="conflict-base-pane" emptyLabel="No base content for this conflict." /></section>}
    <div className="conflict-combine-bar" aria-label="Conflict region choices">
      <span>Keep both</span>
      <button className="conflict-workbench-btn" type="button" disabled={readOnly} aria-pressed={region.choice === 'both-current-first'} data-testid="conflict-both-current-first" onClick={() => handleWholeChoice('both-current-first')}>{currentLabel} first</button>
      <button className="conflict-workbench-btn" type="button" disabled={readOnly} aria-pressed={region.choice === 'both-incoming-first'} data-testid="conflict-both-incoming-first" onClick={() => handleWholeChoice('both-incoming-first')}>{incomingLabel} first</button>
      {region.choice === 'selected-range' && <span className="conflict-picked-summary" data-testid="conflict-picked-summary">{activePicks.length} line{activePicks.length === 1 ? '' : 's'} picked</span>}
      <button className="conflict-workbench-btn quiet conflict-reset" type="button" disabled={readOnly || region.choice === 'unresolved'} onClick={() => handleWholeChoice('unresolved')}><RotateCcw size={13} /> Reset choice</button>
    </div>
  </div>
}

const SourcePane: React.FC<{ label: string; reference: string; side: 'current' | 'incoming'; readOnly: boolean; selected: boolean; onChoose: () => void; children: React.ReactNode }> = ({ label, reference, side, readOnly, selected, onChoose, children }) => <section className={`conflict-pane ${side}`} aria-label={`${label} source`}>
  <div className="conflict-source-heading"><div className="conflict-source-label"><strong><span className="conflict-side-dot" />{label}</strong><span title={reference}><GitBranch size={12} />{reference}</span></div><button className={`conflict-workbench-btn hunk-${side}`} type="button" disabled={readOnly} aria-pressed={selected} data-testid={`conflict-${side}`} onClick={onChoose}>{selected && <Check size={13} />}Use {label}</button></div>
  {children}
</section>
