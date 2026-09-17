import React from 'react'
import { CheckCircle, Circle } from 'lucide-react'
import type { ConflictFileSummary } from '../../../../shared/conflicts'

interface Props { files: ConflictFileSummary[]; activePath: string | null; drafts: Record<string, { dirty: boolean; document: { regions: { choice: string }[]; isBinary: boolean }; fileChoice: string }>; onSelect: (path: string) => void }

export const ConflictFileList: React.FC<Props> = ({ files, activePath, drafts, onSelect }) => {
  const isUnresolved = (f: ConflictFileSummary) => {
    const d = drafts[f.path]
    if (!d) return true
    if (d.document.isBinary) return d.fileChoice === 'unresolved'
    return d.document.regions.some(r => r.choice === 'unresolved')
  }

  const groups = [
    ['Unresolved', files.filter(f => isUnresolved(f))],
    ['Edited', files.filter(f => drafts[f.path]?.dirty)],
    ['Staged / resolved', files.filter(f => {
      const d = drafts[f.path]
      return d && !d.dirty && !isUnresolved(f)
    })]
  ] as const
  return <nav className="conflict-file-list" aria-label="Conflict files">
    <h3>Files ({files.length})</h3>
    {groups.map(([label, entries]) => entries.length ? <section className="conflict-file-group" key={label} aria-labelledby={`conflict-group-${label}`}>
      <div className="conflict-file-group-title" id={`conflict-group-${label}`}>{label} ({entries.length})</div>
      {entries.map(file => {
        const unresolved = isUnresolved(file)
        return <button className="conflict-file-row" key={file.path} type="button" role="option" aria-selected={activePath === file.path} title={file.path} data-testid={`conflict-file-${file.path}`} onClick={() => onSelect(file.path)}>
          <span aria-hidden="true">{unresolved ? <Circle size={13} /> : <CheckCircle size={13} className="lucide-circle-check-big" style={{ color: '#10b981' }} />}</span><span className="path">{file.path}</span><span className="status">{file.status}</span>
        </button>
      })}
    </section> : null)}
  </nav>
}
