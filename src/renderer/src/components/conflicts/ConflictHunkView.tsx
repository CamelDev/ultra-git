import React from 'react'
import { Check, GitBranch, RotateCcw } from 'lucide-react'
import { ConflictCode } from './ConflictCode'
import { getSourceExcerpt } from './conflictPresentation'
import type { ConflictDocument, ConflictRegion, RegionChoice } from '../../../../shared/conflicts'

interface Props {
  document: ConflictDocument
  region: ConflictRegion | null
  showBase: boolean
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

export const ConflictHunkView: React.FC<Props> = ({ document, region, showBase, readOnly, currentLabel, incomingLabel, currentRef, incomingRef, onChoice }) => {
  if (document.isBinary || !region) return <div className="conflict-empty" role="status">Select a conflict to inspect.</div>
  const current = getSourceExcerpt(document.stage2?.bytes, region.current, region.currentRange)
  const incoming = getSourceExcerpt(document.stage3?.bytes, region.incoming, region.incomingRange)
  const base = getSourceExcerpt(document.base?.bytes, region.base, region.baseRange)

  return <div className="conflict-source-area">
    <div className="conflict-panes" aria-label="Conflict sources">
      <SourcePane label={currentLabel} reference={currentRef} side="current" readOnly={readOnly} selected={region.choice === 'current'} onChoose={() => onChoice('current')}>
        <ConflictCode {...current} path={document.path} highlight={region.currentRange} testId="conflict-current-pane" />
      </SourcePane>
      <SourcePane label={incomingLabel} reference={incomingRef} side="incoming" readOnly={readOnly} selected={region.choice === 'incoming'} onChoose={() => onChoice('incoming')}>
        <ConflictCode {...incoming} path={document.path} highlight={region.incomingRange} testId="conflict-incoming-pane" />
      </SourcePane>
    </div>
    {showBase && <section className="conflict-base-context" aria-label="Base source"><div className="conflict-pane-title"><strong>Base</strong><span>Common ancestor · this conflict</span></div><ConflictCode {...base} path={document.path} highlight={region.baseRange} testId="conflict-base-pane" emptyLabel="No base content for this conflict." /></section>}
    <div className="conflict-combine-bar" aria-label="Conflict region choices">
      <span>Keep both</span>
      <button className="conflict-workbench-btn" type="button" disabled={readOnly} aria-pressed={region.choice === 'both-current-first'} data-testid="conflict-both-current-first" onClick={() => onChoice('both-current-first')}>{currentLabel} first</button>
      <button className="conflict-workbench-btn" type="button" disabled={readOnly} aria-pressed={region.choice === 'both-incoming-first'} data-testid="conflict-both-incoming-first" onClick={() => onChoice('both-incoming-first')}>{incomingLabel} first</button>
      <button className="conflict-workbench-btn quiet conflict-reset" type="button" disabled={readOnly || region.choice === 'unresolved'} onClick={() => onChoice('unresolved')}><RotateCcw size={13} /> Reset choice</button>
    </div>
  </div>
}

const SourcePane: React.FC<{ label: string; reference: string; side: 'current' | 'incoming'; readOnly: boolean; selected: boolean; onChoose: () => void; children: React.ReactNode }> = ({ label, reference, side, readOnly, selected, onChoose, children }) => <section className={`conflict-pane ${side}`} aria-label={`${label} source`}>
  <div className="conflict-source-heading"><div className="conflict-source-label"><strong><span className="conflict-side-dot" />{label}</strong><span title={reference}><GitBranch size={12} />{reference}</span></div><button className={`conflict-workbench-btn hunk-${side}`} type="button" disabled={readOnly} aria-pressed={selected} data-testid={`conflict-${side}`} onClick={onChoose}>{selected && <Check size={13} />}Use {label}</button></div>
  {children}
</section>
