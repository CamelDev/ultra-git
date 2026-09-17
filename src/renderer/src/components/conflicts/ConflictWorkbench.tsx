import React, { useEffect, useRef, useState } from 'react'
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
  const loadCandidates = useRepoStore(state => state.loadConflictCandidates)
  const previewCandidate = useRepoStore(state => state.previewConflictCandidate)
  const acceptCandidate = useRepoStore(state => state.acceptConflictCandidate)
  const rejectCandidate = useRepoStore(state => state.rejectConflictCandidate)
  const setCandidateReuse = useRepoStore(state => state.setConflictCandidateReuse)
  const forgetCandidate = useRepoStore(state => state.forgetConflictCandidate)
  const active = conflictSelectors.activeDraft(session)
  const conflictFiles = session.snapshot?.conflicts || []
  const allPaths = new Set(conflictFiles.map(f => f.path))
  const resolvedSummaries: import('../../../../shared/conflicts').ConflictFileSummary[] = Object.keys(session.drafts)
    .filter(p => !allPaths.has(p))
    .map(p => ({ path: p, status: 'RESOLVED', conflictType: session.drafts[p]?.document.conflictType }))
  const files = [...conflictFiles, ...resolvedSummaries]
  const activeIndex = Math.max(0, files.findIndex(f => f.path === session.activePath))
  const firstFocus = useRef<HTMLButtonElement>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => { if (!session.snapshot && !session.pending) void loadSnapshot(repoId) }, [repoId, session.snapshot, session.pending, loadSnapshot])
  useEffect(() => { if (session.activePath && session.generation && !session.drafts[session.activePath]) void loadDocument(repoId, session.activePath) }, [repoId, session.activePath, session.generation, session.drafts, loadDocument])
  useEffect(() => { if (session.activePath && session.generation && active && conflictFiles.some(f => f.path === session.activePath)) void loadCandidates(repoId, session.activePath) }, [repoId, session.activePath, session.generation, active?.document.path, conflictFiles])
  useEffect(() => { const repo = useRepoStore.getState().repositories.find(item => item.id === repoId); if (!repo) return; void window.api.git.getConflictCandidateSettings(repo.path).then(response => { if (response.success && response.data) useRepoStore.setState(state => ({ conflictSessions: { ...state.conflictSessions, [repoId]: { ...state.getConflictSession(repoId), candidateReuseEnabled: response.data!.enabled } } })) }) }, [repoId])
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

  const runAndClose = async (operation: 'continue' | 'skip' | 'abort') => {
    if (operation === 'abort') { setClosing(true); onDismiss?.() }
    try { await runOperation(repoId, operation) }
    finally { if (operation === 'continue') { setClosing(true); onDismiss?.() } }
  }

  if (closing) return null

  return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description" data-testid="conflict-resolver" data-workbench-testid="conflict-workbench">
    <header className="conflict-operation-strip"><div><h2 id="conflict-title">{operationName} conflict workbench</h2><div className="conflict-operation-meta" id="conflict-description"><span className="conflict-operation-status">{operationName} in progress</span><span>{sourceLabel}: {session.snapshot.roles.current}</span><span>{incomingLabel}: {session.snapshot.roles.incoming}</span>{session.snapshot.currentStep && <span>Step {session.snapshot.currentStep}{session.snapshot.totalSteps ? ` of ${session.snapshot.totalSteps}` : ''}</span>}<span>{session.snapshot.subject || 'Resolve changes explicitly'}</span><span data-testid="conflict-unresolved-count">{statusText}</span></div></div><div className="conflict-operation-actions"><button ref={firstFocus} type="button" className="conflict-workbench-btn danger" data-testid="abort-merge-btn" aria-label="Abort" disabled={!!session.pending} onClick={() => void runAndClose('abort')}>Abort {operationName}</button>{kind === 'rebase' && <button type="button" className="conflict-workbench-btn" disabled={!!session.pending} onClick={() => void runAndClose('skip')}>Skip commit</button>}{conflictSelectors.canUndoResolution(session) && <button type="button" className="conflict-workbench-btn" data-testid="conflict-undo-resolution" onClick={() => void undo(repoId)}>Undo Resolution</button>}<button type="button" className="conflict-workbench-btn primary" disabled={!conflictSelectors.canContinue(session)} onClick={() => void runAndClose('continue')}>Continue</button>{onDismiss && <button type="button" className="conflict-workbench-btn" onClick={onDismiss} aria-label="Minimize conflict workbench">Minimize</button>}</div></header>
    {session.externalChange && <div className="conflict-error" role="alert">Files changed outside UltraGIT. Reload the operation before applying any resolution.</div>}
    {session.error && <div className="conflict-error" role="alert">{session.error}</div>}
    <div className="conflict-workbench-body"><ConflictFileList files={files} activePath={session.activePath} drafts={session.drafts} onSelect={path => void loadDocument(repoId, path)} /><section className="conflict-workbench-content" aria-label="Conflict editor">{!active ? <div className="conflict-empty">Select a file to inspect its Base, {sourceLabel}, {incomingLabel}, and Result.</div> : <><CandidatePanel enabled={session.candidateReuseEnabled} candidates={active.candidates} previewedId={active.previewedCandidateId} acceptedId={active.acceptedCandidateId} onToggle={enabled => void setCandidateReuse(repoId, enabled)} onPreview={id => void previewCandidate(repoId, id)} onAccept={id => acceptCandidate(repoId, id)} onReject={id => rejectCandidate(repoId, id)} onForget={id => void forgetCandidate(repoId, id)} /><ResolutionEditor document={active.document} result={active.result} activeRegionId={session.activeRegionId} canApply={conflictSelectors.canApplyFile(session)} fileChoice={active.fileChoice} onEdit={value => session.activePath && editResult(repoId, session.activePath, value)} onChoice={chooseRegion} onRegion={id => { const store = useRepoStore.getState(); const current = store.getConflictSession(repoId); useRepoStore.setState({ conflictSessions: { ...store.conflictSessions, [repoId]: { ...current, activeRegionId: id } } }) }} onApply={() => void apply(repoId, session.activePath || undefined)} onFileChoice={choice => { const store = useRepoStore.getState(); const current = store.getConflictSession(repoId); const draft = session.activePath ? current.drafts[session.activePath] : undefined; if (draft && session.activePath) useRepoStore.setState({ conflictSessions: { ...store.conflictSessions, [repoId]: { ...current, drafts: { ...current.drafts, [session.activePath]: { ...draft, fileChoice: choice, dirty: true } } } } }) }} /></>}</section></div>
    <footer className="conflict-summary">Keyboard: <kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd> previous/next file · <kbd>Esc</kbd> minimize · {activeIndex + 1} of {files.length}</footer>
  </main>
}

const ruleLabel: Record<string, string> = {
  'one-side-equals-base': 'One side equals base',
  'identical-normalized-result': 'Identical after normalization',
  'whitespace-only': 'Whitespace-only difference',
  'confirmed-record': 'Previously confirmed record'
}

const CandidatePanel: React.FC<{
  enabled: boolean; candidates: import('../../../../shared/conflicts').ConflictCandidate[]; previewedId: string | null; acceptedId: string | null;
  onToggle: (enabled: boolean) => void; onPreview: (id: string) => void; onAccept: (id: string) => void; onReject: (id: string) => void; onForget: (id: string) => void;
}> = ({ enabled, candidates, previewedId, acceptedId, onToggle, onPreview, onAccept, onReject, onForget }) => {
  const selected = candidates.find(candidate => candidate.id === previewedId)
  return <section className="conflict-candidate-panel" aria-labelledby="candidate-heading">
    <div className="conflict-candidate-header"><div><h3 id="candidate-heading">Resolution candidates</h3><p>Suggestions are preview-only. Accept edits Result; Apply &amp; Stage is always separate.</p></div><label><input type="checkbox" checked={enabled} onChange={event => onToggle(event.target.checked)} /> Enable repository-local reuse</label></div>
    {!enabled ? <p className="conflict-candidate-muted">Candidate reuse is off by default. Records stay inside this repository; Git rerere is not used.</p> : candidates.length === 0 ? <p className="conflict-candidate-muted">No safe candidate found for this conflict. Choose regions manually.</p> : <div className="conflict-candidate-list">{candidates.map(candidate => <article key={candidate.id} className="conflict-candidate-card"><div><strong>{ruleLabel[candidate.ruleId] || candidate.ruleId}</strong><span> · {candidate.affectedRegionIds.length} affected region{candidate.affectedRegionIds.length === 1 ? '' : 's'}</span></div><p>{candidate.rationale}</p><small>{candidate.safety}</small><div className="conflict-candidate-actions"><button type="button" className="conflict-workbench-btn" onClick={() => onPreview(candidate.id)}>{previewedId === candidate.id ? 'Previewed' : 'Preview'}</button><button type="button" className="conflict-workbench-btn primary" disabled={previewedId !== candidate.id} onClick={() => onAccept(candidate.id)}>Accept into Result</button><button type="button" className="conflict-workbench-btn" onClick={() => onReject(candidate.id)}>Reject</button>{candidate.recordId && <button type="button" className="conflict-workbench-btn danger" onClick={() => onForget(candidate.recordId!)}>Forget record</button>}</div>{selected?.id === candidate.id && <div className="conflict-candidate-preview" aria-live="polite"><div><b>Before</b><pre>{candidate.beforePreview || '(empty)'}</pre></div><div><b>After</b><pre>{candidate.afterPreview || '(empty)'}</pre></div></div>}{acceptedId === candidate.id && <p role="status">Accepted into editable Result. Nothing has been written or staged.</p>}</article>)}</div>}
  </section>
}

export default ConflictWorkbench
