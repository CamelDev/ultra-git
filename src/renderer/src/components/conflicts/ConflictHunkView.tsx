import React from 'react'
import type { ConflictDocument, ConflictRegion, RegionChoice } from '../../../../shared/conflicts'

interface Props { document: ConflictDocument; region: ConflictRegion | null; onChoice: (choice: RegionChoice, selected?: string) => void }
const text = (value: string | undefined) => value || '(empty)'

export const ConflictHunkView: React.FC<Props> = ({ document, region, onChoice }) => {
  if (document.isBinary || !region) return <div className="conflict-empty" role="status">{document.isBinary ? 'Binary or non-text conflict: choose a file-level action below.' : 'Select a conflict region to inspect.'}</div>
  return <>
    <div className="conflict-region-bar" aria-label="Conflict region choices">
      <span className="region-label">Region {region.baseRange.start + 1}–{region.baseRange.end}</span>
      <button className="conflict-workbench-btn hunk-current" type="button" aria-pressed={region.choice === 'current'} data-testid="conflict-current" data-legacy-testid="accept-ours-btn" onClick={() => onChoice('current')}>Use Current</button>
      <button className="conflict-workbench-btn hunk-incoming" type="button" aria-pressed={region.choice === 'incoming'} data-testid="conflict-incoming" data-legacy-testid="accept-theirs-btn" onClick={() => onChoice('incoming')}>Use Incoming</button>
      <button className="conflict-workbench-btn hunk-both" type="button" aria-pressed={region.choice === 'both-current-first'} data-testid="conflict-both-current-first" data-legacy-testid="accept-both-btn" onClick={() => onChoice('both-current-first')}>Both (Current first)</button>
      <button className="conflict-workbench-btn hunk-both" type="button" aria-pressed={region.choice === 'both-incoming-first'} data-testid="conflict-both-incoming-first" onClick={() => onChoice('both-incoming-first')}>Both (Incoming first)</button>
      <button className="conflict-workbench-btn hunk-current" type="button" aria-pressed={region.choice === 'selected-range' && region.selected === region.current} onClick={() => onChoice('selected-range', region.current)}>Current range</button>
      <button className="conflict-workbench-btn hunk-incoming" type="button" aria-pressed={region.choice === 'selected-range' && region.selected === region.incoming} onClick={() => onChoice('selected-range', region.incoming)}>Incoming range</button>
      <button className="conflict-workbench-btn" type="button" aria-pressed={region.choice === 'unresolved'} onClick={() => onChoice('unresolved')}>Reset</button>
    </div>
    <div className="conflict-panes" aria-label="Conflict sources">
      <Pane label="Base" content={document.base?.bytes} testId="conflict-base-pane" />
      <Pane label="Current" content={region.current} testId="conflict-current-pane" />
      <Pane label="Incoming" content={region.incoming} testId="conflict-incoming-pane" />
      <Pane label="Result" content={region.choice === 'unresolved' ? '' : region.selected || region[region.choice === 'current' ? 'current' : 'incoming']} result testId="conflict-result-pane" />
    </div>
  </>
}

const Pane: React.FC<{ label: string; content?: string; result?: boolean; testId?: string }> = ({ label, content, result, testId }) => <section className={`conflict-pane${result ? ' result' : ''}`} aria-label={`${label} source`}><div className="conflict-pane-title">{label}</div><pre data-testid={testId}>{text(content)}</pre></section>
