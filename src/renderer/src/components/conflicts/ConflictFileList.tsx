import React from 'react'
import type { ConflictFileSummary } from '../../../../shared/conflicts'

interface Props { files: ConflictFileSummary[]; activePath: string | null; drafts: Record<string, { dirty: boolean; document: { regions: { choice: string }[]; isBinary: boolean }; fileChoice: string }>; onSelect: (path: string) => void }

export const ConflictFileList: React.FC<Props> = ({ files, activePath, drafts, onSelect }) => {
  const groups = [
    ['Unresolved', files.filter(f => { const d = drafts[f.path]; return !d || d.document.isBinary ? d?.fileChoice === 'unresolved' : d.document.regions.some(r => r.choice === 'unresolved') })],
    ['Edited', files.filter(f => drafts[f.path]?.dirty)],
    ['Staged / resolved', files.filter(f => { const d = drafts[f.path]; return d && !d.dirty && (d.document.isBinary ? d.fileChoice !== 'unresolved' : d.document.regions.every(r => r.choice !== 'unresolved')) })]
  ] as const
  return <nav className="conflict-file-list" aria-label="Conflict files">
    <h3>Files ({files.length})</h3>
    {groups.map(([label, entries]) => entries.length ? <section className="conflict-file-group" key={label} aria-labelledby={`conflict-group-${label}`}>
      <div className="conflict-file-group-title" id={`conflict-group-${label}`}>{label} ({entries.length})</div>
      {entries.map(file => { const draft = drafts[file.path]; const unresolved = !draft || draft.document.isBinary ? draft?.fileChoice === 'unresolved' : draft.document.regions.some(r => r.choice === 'unresolved'); return <button className="conflict-file-row" key={file.path} type="button" role="option" aria-selected={activePath === file.path} title={file.path} data-testid={`conflict-file-${file.path}`} onClick={() => onSelect(file.path)}>
        <span aria-hidden="true">{unresolved ? '○' : '✓'}</span><span className="path">{file.path}</span><span className="status">{file.status}</span>
      </button> })}
    </section> : null)}
  </nav>
}
