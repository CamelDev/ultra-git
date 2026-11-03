import React, { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, FileCode2, GitMerge, GripHorizontal, TextWrap } from 'lucide-react'
import type { ConflictDocument, RegionChoice } from '../../../../shared/conflicts'
import { ConflictHunkView, getHunkResultContent } from './ConflictHunkView'
import { ConflictCode } from './ConflictCode'

interface Props {
  document: ConflictDocument
  result: string
  activeRegionId: string | null
  canApply: boolean
  staged: boolean
  currentLabel: string
  incomingLabel: string
  currentRef: string
  incomingRef: string
  onEdit: (value: string) => void
  onChoice: (regionId: string, choice: RegionChoice, selected?: string) => void
  onRegion: (id: string | null) => void
  onApply: () => void
  fileChoice: string
  onFileChoice: (choice: 'current' | 'incoming') => void
}

export const ResolutionEditor: React.FC<Props> = ({ document, result, activeRegionId, canApply, staged, currentLabel, incomingLabel, currentRef, incomingRef, onEdit, onChoice, onRegion, onApply, fileChoice, onFileChoice }) => {
  const [showBase, setShowBase] = useState(false)
  const [wrap, setWrap] = useState(false)
  const [previewRegion, setPreviewRegion] = useState(false)
  const [sourcePercent, setSourcePercent] = useState(56)
  const editorRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const regionIndex = Math.max(0, document.regions.findIndex(r => r.id === activeRegionId))
  const region = document.regions[regionIndex]
  const unresolved = document.regions.filter(r => r.choice === 'unresolved').length
  const nextUnresolved = document.regions.find((r, i) => i > regionIndex && r.choice === 'unresolved') || document.regions.find(r => r.choice === 'unresolved')
  const lineCount = result.split('\n').length

  useEffect(() => {
    setPreviewRegion(false)
    if (resultRef.current) resultRef.current.scrollTop = resultRef.current.scrollLeft = 0
    if (gutterRef.current) gutterRef.current.scrollTop = 0
  }, [document.path])

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !editorRef.current) return
    const bounds = editorRef.current.getBoundingClientRect()
    setSourcePercent(Math.min(75, Math.max(25, (event.clientY - bounds.top) / bounds.height * 100)))
  }

  if (document.isBinary || document.regions.length === 0) return <div className="conflict-resolution-editor">
    <div className="conflict-file-toolbar"><FileCode2 size={15} /><strong title={document.path}>{document.path}</strong></div>
    <div className="conflict-empty conflict-file-choice"><GitMerge size={32} /><h3>{document.isBinary ? 'Choose which file to keep' : 'Choose a file version'}</h3><p>{document.isBinary ? 'This binary file cannot be compared as text.' : 'This conflict needs a decision for the whole file.'}</p>
      <div className="conflict-choices">{(['current', 'incoming'] as const).map(side => <button key={side} type="button" className={`conflict-workbench-btn hunk-${side}`} disabled={staged} aria-pressed={fileChoice === side} data-testid={`conflict-keep-${side}`} onClick={() => onFileChoice(side)}>Keep {side === 'current' ? currentLabel : incomingLabel} file</button>)}</div>
    </div><Footer canApply={canApply} staged={staged} unresolved={fileChoice === 'unresolved' ? 1 : 0} onApply={onApply} />
  </div>

  return <div className={`conflict-resolution-editor${wrap ? ' wrap-code' : ''}`}>
    <div className="conflict-file-toolbar"><FileCode2 size={15} /><strong title={document.path}>{document.path}</strong><span className={`conflict-count-badge${unresolved === 0 ? ' complete' : ''}`}>{unresolved ? `${unresolved} remaining` : 'All conflicts resolved'}</span></div>
    <div className="conflict-navigation">
      <div className="conflict-step-controls"><button type="button" className="conflict-workbench-btn icon-only" aria-label="Previous conflict" disabled={regionIndex === 0} onClick={() => onRegion(document.regions[regionIndex - 1].id)}><ChevronLeft size={15} /></button><span>Conflict <b>{regionIndex + 1}</b> of {document.regions.length}</span><button type="button" className="conflict-workbench-btn icon-only" aria-label="Next conflict" disabled={regionIndex === document.regions.length - 1} onClick={() => onRegion(document.regions[regionIndex + 1].id)}><ChevronRight size={15} /></button></div>
      <div className="conflict-region-tabs" role="tablist" aria-label="Conflict regions" onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (regionIndex + 1) % document.regions.length : event.key === 'ArrowLeft' ? (regionIndex + document.regions.length - 1) % document.regions.length : event.key === 'Home' ? 0 : event.key === 'End' ? document.regions.length - 1 : null
        if (next === null) return
        event.preventDefault()
        onRegion(document.regions[next].id)
        ;(event.currentTarget.children[next] as HTMLElement).focus()
      }}>{document.regions.map((r, i) => <button key={r.id} type="button" role="tab" tabIndex={r.id === region.id ? 0 : -1} aria-selected={r.id === region.id} aria-label={`Conflict ${i + 1}: ${r.choice === 'unresolved' ? 'unresolved' : 'resolved'}`} className={`conflict-region-tab${r.choice !== 'unresolved' ? ' resolved' : ''}`} onClick={() => onRegion(r.id)}>{r.choice !== 'unresolved' ? <Check size={12} /> : i + 1}</button>)}</div>
      <div className="conflict-view-options"><button type="button" className="conflict-workbench-btn quiet" aria-pressed={showBase} onClick={() => setShowBase(!showBase)}>Base</button><button type="button" className="conflict-workbench-btn quiet icon-only" aria-label="Wrap code lines" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><TextWrap size={15} /></button></div>
    </div>
    <div className="conflict-editor-split" ref={editorRef} style={{ gridTemplateRows: `minmax(100px, ${sourcePercent}fr) 8px minmax(100px, ${100 - sourcePercent}fr)` }}>
      <ConflictHunkView document={document} region={region} readOnly={staged} showBase={showBase} currentLabel={currentLabel} incomingLabel={incomingLabel} currentRef={currentRef} incomingRef={incomingRef} onChoice={(choice, selected) => onChoice(region.id, choice, selected)} />
      <div className="conflict-editor-resizer" role="separator" aria-label="Resize source and result panes" aria-orientation="horizontal" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(sourcePercent)} tabIndex={0} onPointerDown={resize} onPointerMove={moveResize} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setSourcePercent(value => Math.min(75, Math.max(25, value + (event.key === 'ArrowUp' ? -5 : 5)))) } }}><GripHorizontal size={16} /></div>
      <section className="conflict-result-area" aria-label="Resolution result">
        <div className="conflict-result-heading"><div className="conflict-result-tabs"><button type="button" aria-pressed={!previewRegion} onClick={() => setPreviewRegion(false)}>Result <span>{staged ? 'Staged file' : 'Editable file'}</span></button><button type="button" aria-pressed={previewRegion} onClick={() => setPreviewRegion(true)}>This conflict</button></div><span className="conflict-result-meta">{document.eol === 'none' ? '' : document.eol.toUpperCase()}<span>{lineCount} lines</span></span></div>
        {previewRegion ? <ConflictCode content={getHunkResultContent(region)} path={document.path} testId="conflict-result-pane" emptyLabel={region.choice === 'unresolved' ? 'Choose a side above to resolve this conflict.' : 'This choice removes these lines.'} /> : <div className="conflict-result-input"><div className="conflict-result-gutter" ref={gutterRef} aria-hidden="true">{Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}</div><textarea ref={resultRef} data-testid="conflict-result-editor" value={result} readOnly={staged} wrap={wrap ? 'soft' : 'off'} spellCheck={false} placeholder="Choose a version above to build the result. Review and edit the file here before staging." onChange={event => onEdit(event.target.value)} onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop }} aria-label="Editable whole-file result" /></div>}
      </section>
    </div>
    <Footer canApply={canApply} staged={staged} unresolved={unresolved} onApply={onApply} onNext={nextUnresolved ? () => onRegion(nextUnresolved.id) : undefined} />
  </div>
}

const Footer: React.FC<{ canApply: boolean; staged: boolean; unresolved: number; onApply: () => void; onNext?: () => void }> = ({ canApply, staged, unresolved, onApply, onNext }) => <div className="conflict-editor-footer"><div className="conflict-stage-hint">{staged ? <><Check size={14} /> File staged. You can continue when all files are ready.</> : unresolved > 0 ? <><span className="conflict-status-dot" />{unresolved} conflict{unresolved === 1 ? '' : 's'} left in this file{onNext && <button className="conflict-workbench-btn quiet" type="button" onClick={onNext}>Next unresolved <ChevronRight size={13} /></button>}</> : <><Check size={14} /> Ready to stage · review or edit the result above</>}</div><button type="button" className="conflict-workbench-btn primary" disabled={!canApply || staged} onClick={onApply} data-testid="conflict-apply-stage"><Check size={14} />{staged ? 'Staged' : 'Apply & Stage'}</button></div>
