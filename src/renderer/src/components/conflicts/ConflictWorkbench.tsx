import React, { useEffect, useMemo, useRef } from 'react'
import { createConflictSession, conflictSelectors } from '../../store/conflictSession'
import { useRepoStore } from '../../store/useRepoStore'
import { ConflictFileList } from './ConflictFileList'
import { ResolutionEditor } from './ResolutionEditor'
import './conflict-workbench.css'

interface Props { repoId: string; onDismiss?: () => void }

export const ConflictWorkbench: React.FC<Props> = ({ repoId, onDismiss }) => {
  const sessionFromStore = useRepoStore(state => state.conflictSessions[repoId])
  const session = sessionFromStore || createConflictSession(repoId)
  const loadSnapshot = useRepoStore(state => state.loadConflictSnapshot)
  const loadDocument = useRepoStore(state => state.loadConflictDocument)
  const selectFile = useRepoStore(state => state.chooseConflictRegion)
  const editResult = useRepoStore(state => state.editConflictResult)
  const apply = useRepoStore(state => state.applyConflictResolution)
  const undo = useRepoStore(state => state.undoConflictResolution)
  const runOperation = useRepoStore(state => state.runConflictOperation)
  const active = conflictSelectors.activeDraft(session)
  const files = session.snapshot?.conflicts || []
  const activeIndex = Math.max(0, files.findIndex(f => f.path === session.activePath))
  const firstFocus = useRef<HTMLButtonElement>(null)

  useEffect(() => { if (!session.snapshot && !session.pending) void loadSnapshot(repoId) }, [repoId, session.snapshot, session.pending, loadSnapshot])
  useEffect(() => { if (session.activePath && session.generation && !session.drafts[session.activePath]) void loadDocument(repoId, session.activePath) }, [repoId, session.activePath, session.generation, session.drafts, loadDocument])
  useEffect(() => { firstFocus.current?.focus() }, [repoId])
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss?.() } if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); move(1) } if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); move(-1) } }; const move = (delta: number) => { const next = files[activeIndex + delta]; if (next) void loadDocument(repoId, next.path) }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [activeIndex, files, loadDocument, onDismiss, repoId])

  const chooseRegion = (regionId: string, choice: Parameters<typeof selectFile>[3], selected?: string) => { if (session.activePath) selectFile(repoId, session.activePath, regionId, choice, selected) }
  const statusText = session.pending ? `${session.pending}…` : `${conflictSelectors.unresolvedCount(session)} unresolved`
  const kind = session.snapshot?.kind || 'merge'
  const sourceLabel = kind === 'rebase' ? 'Onto branch' : 'Current'
  const incomingLabel = kind === 'rebase' ? 'Replayed commit' : 'Incoming'
  const operationName = kind === 'cherry-pick' ? 'Cherry-pick' : kind[0].toUpperCase() + kind.slice(1)

  if (session.error && !session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="conflict-error" role="alert"><h2 id="conflict-title">Unable to load conflict operation</h2><p>{session.error}</p><button className="conflict-workbench-btn" type="button" onClick={() => void loadSnapshot(repoId)}>Retry</button></div></main>
  if (session.pending === 'load' && !session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="conflict-loading" role="status">Loading conflict operation…</div></main>
  if (!session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="conflict-empty" role="status">No active conflict operation.</div></main>

  return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description" data-testid="conflict-workbench">
    <header className="conflict-operation-strip"><div><h2 id="conflict-title">{operationName} conflict workbench</h2><div className="conflict-operation-meta" id="conflict-description"><span>{sourceLabel}: {session.snapshot.roles.current}</span><span>{incomingLabel}: {session.snapshot.roles.incoming}</span>{session.snapshot.currentStep && <span>Step {session.snapshot.currentStep}{session.snapshot.totalSteps ? ` of ${session.snapshot.totalSteps}` : ''}</span>}<span>{session.snapshot.subject || 'Resolve changes explicitly'}</span><span data-testid="conflict-unresolved-count">{statusText}</span></div></div><div className="conflict-operation-actions"><button ref={firstFocus} type="button" className="conflict-workbench-btn danger" disabled={!!session.pending} onClick={() => void runOperation(repoId, 'abort')}>Abort</button>{kind === 'rebase' && <button type="button" className="conflict-workbench-btn" disabled={!!session.pending} onClick={() => void runOperation(repoId, 'skip')}>Skip commit</button>}{conflictSelectors.canUndoResolution(session) && <button type="button" className="conflict-workbench-btn" data-testid="conflict-undo-resolution" onClick={() => void undo(repoId)}>Undo Resolution</button>}<button type="button" className="conflict-workbench-btn primary" disabled={!conflictSelectors.canContinue(session)} onClick={() => void runOperation(repoId, 'continue')}>Continue</button>{onDismiss && <button type="button" className="conflict-workbench-btn" onClick={onDismiss} aria-label="Minimize conflict workbench">Minimize</button>}</div></header>
    {session.externalChange && <div className="conflict-error" role="alert">Files changed outside UltraGIT. Reload the operation before applying any resolution.</div>}
    {session.error && <div className="conflict-error" role="alert">{session.error}</div>}
    <div className="conflict-workbench-body"><ConflictFileList files={files} activePath={session.activePath} drafts={session.drafts} onSelect={path => void loadDocument(repoId, path)} /><section className="conflict-workbench-content" aria-label="Conflict editor">{!active ? <div className="conflict-empty">Select a file to inspect its Base, {sourceLabel}, {incomingLabel}, and Result.</div> : <ResolutionEditor document={active.document} result={active.result} activeRegionId={session.activeRegionId} canApply={conflictSelectors.canApplyFile(session)} fileChoice={active.fileChoice} onEdit={value => session.activePath && editResult(repoId, session.activePath, value)} onChoice={chooseRegion} onRegion={id => { const store = useRepoStore.getState(); const current = store.getConflictSession(repoId); useRepoStore.setState({ conflictSessions: { ...store.conflictSessions, [repoId]: { ...current, activeRegionId: id } } }) }} onApply={() => void apply(repoId, session.activePath || undefined)} onFileChoice={choice => { const store = useRepoStore.getState(); const current = store.getConflictSession(repoId); const draft = session.activePath ? current.drafts[session.activePath] : undefined; if (draft && session.activePath) useRepoStore.setState({ conflictSessions: { ...store.conflictSessions, [repoId]: { ...current, drafts: { ...current.drafts, [session.activePath]: { ...draft, fileChoice: choice, dirty: true } } } } }) }} />}</section></div>
    <footer className="conflict-summary">Keyboard: <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> previous/next file · <kbd>Esc</kbd> minimize · {activeIndex + 1} of {files.length}</footer>
  </main>
}

export default ConflictWorkbench
