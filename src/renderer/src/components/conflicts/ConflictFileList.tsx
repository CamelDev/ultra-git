import React from 'react'
import { CheckCircle, Circle, CircleDot, FileCode2 } from 'lucide-react'
import type { ConflictFileSummary } from '../../../../shared/conflicts'
import type { ConflictDraft } from '../../store/conflictSession'
import { getConflictFileState } from './conflictPresentation'

interface Props {
  files: ConflictFileSummary[]
  activePath: string | null
  drafts: Record<string, ConflictDraft>
  onSelect: (path: string) => void
}

export const ConflictFileList: React.FC<Props> = ({ files, activePath, drafts, onSelect }) => {
  const staged = files.filter(file => getConflictFileState(file, drafts[file.path]) === 'staged').length
  const groups = [
    { label: 'Needs resolution', state: 'unresolved' },
    { label: 'In progress', state: 'edited' },
    { label: 'Staged', state: 'staged' }
  ] as const

  return <nav className="conflict-file-list" aria-label="Conflict files">
    <div className="conflict-files-heading"><h3><FileCode2 size={15} /> Files <span>{files.length}</span></h3><p>{staged} of {files.length} staged</p><progress value={staged} max={files.length || 1} aria-label="Files staged" /></div>
    <div className="conflict-files-scroll">
      {groups.map(({ label, state }) => {
        const entries = files.filter(file => getConflictFileState(file, drafts[file.path]) === state)
        return entries.length > 0 && <section className="conflict-file-group" key={state} aria-labelledby={`conflict-group-${state}`}>
          <div className="conflict-file-group-title" id={`conflict-group-${state}`}>{label}<span>{entries.length}</span></div>
          {entries.map(file => {
            const slash = file.path.lastIndexOf('/')
            const name = file.path.slice(slash + 1)
            const directory = slash < 0 ? 'Repository root' : file.path.slice(0, slash)
            return <button className={`conflict-file-row ${state}`} key={file.path} type="button" aria-current={activePath === file.path ? 'true' : undefined} title={file.path} data-testid={`conflict-file-${file.path}`} onClick={() => onSelect(file.path)}>
              {state === 'staged' ? <CheckCircle size={15} className="lucide-circle-check-big" /> : state === 'edited' ? <CircleDot size={15} /> : <Circle size={15} />}
              <span className="conflict-file-name"><strong>{name}</strong><span>{directory}</span></span>
              <span className="sr-only">{label}</span>
            </button>
          })}
        </section>
      })}
    </div>
    <div className="conflict-file-hint">Choose a resolution for each conflict, then stage the file.</div>
  </nav>
}
