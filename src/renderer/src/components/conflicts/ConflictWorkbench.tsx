import React, { useCallback, useEffect, useRef } from 'react'
import { ArrowRight, CheckCircle2, ChevronDown, GitMerge, Minus, RotateCcw, SkipForward, Sparkles, XCircle } from 'lucide-react'
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
  const observeSnapshot = useRepoStore(state => state.observeConflictSnapshot)
  const loadDocument = useRepoStore(state => state.loadConflictDocument)
  const selectRegion = useRepoStore(state => state.chooseConflictRegion)
  const editResult = useRepoStore(state => state.editConflictResult)
  const apply = useRepoStore(state => state.applyConflictResolution)
  const undo = useRepoStore(state => state.undoConflictResolution)
  const runOperation = useRepoStore(state => state.runConflictOperation)
  const refreshRepo = useRepoStore(state => state.refreshRepo)
  const loadCandidates = useRepoStore(state => state.loadConflictCandidates)
  const previewCandidate = useRepoStore(state => state.previewConflictCandidate)
  const acceptCandidate = useRepoStore(state => state.acceptConflictCandidate)
  const rejectCandidate = useRepoStore(state => state.rejectConflictCandidate)
  const setCandidateReuse = useRepoStore(state => state.setConflictCandidateReuse)
  const forgetCandidate = useRepoStore(state => state.forgetConflictCandidate)
  const active = conflictSelectors.activeDraft(session)
  const conflictFiles = session.snapshot?.conflicts || []
  const allPaths = new Set(conflictFiles.map(file => file.path))
  const resolvedSummaries: import('../../../../shared/conflicts').ConflictFileSummary[] = Object.keys(session.drafts)
    .filter(path => !allPaths.has(path))
    .map(path => ({ path, status: 'RESOLVED', conflictType: session.drafts[path]?.document.conflictType }))
  const files = [...conflictFiles, ...resolvedSummaries]
  const activeIndex = Math.max(0, files.findIndex(file => file.path === session.activePath))
  const dialogRef = useRef<HTMLElement>(null)
  const firstFocus = useRef<HTMLButtonElement>(null)
  const dismissRef = useRef(onDismiss)
  const finished = conflictSelectors.isFinished(session)

  useEffect(() => { dismissRef.current = onDismiss }, [onDismiss])
  useEffect(() => {
    if (!finished) return
    dismissRef.current?.()
    void refreshRepo(repoId)
  }, [finished, repoId, refreshRepo])
  useEffect(() => {
    if (finished) return
    let reading = false
    const observe = async () => {
      if (reading) return
      reading = true
      try { await observeSnapshot(repoId) }
      finally { reading = false }
    }
    // Git-only changes do not emit the working-tree watcher's file events.
    const timer = window.setInterval(() => void observe(), 1500)
    window.addEventListener('focus', observe)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', observe) }
  }, [repoId, finished, observeSnapshot])

  const chooseFile = useCallback((path: string) => {
    const store = useRepoStore.getState()
    const current = store.getConflictSession(repoId)
    const draft = current.drafts[path]
    if (!draft) {
      // The active document is already loading through the effect below.
      if (current.activePath !== path) void loadDocument(repoId, path)
      return
    }
    useRepoStore.setState({ conflictSessions: { ...store.conflictSessions, [repoId]: { ...current, activePath: path, activeRegionId: draft.document.regions[0]?.id ?? null } } })
  }, [repoId, loadDocument])

  useEffect(() => { if (!session.snapshot && !session.pending) void loadSnapshot(repoId) }, [repoId, session.snapshot, session.pending, loadSnapshot])
  useEffect(() => { if (session.activePath && session.generation && !session.drafts[session.activePath]) void loadDocument(repoId, session.activePath) }, [repoId, session.activePath, session.generation, session.drafts, loadDocument])
  useEffect(() => { if (session.activePath && session.generation && active && conflictFiles.some(file => file.path === session.activePath)) void loadCandidates(repoId, session.activePath) }, [repoId, session.activePath, session.generation, active?.document.path, conflictFiles])
  useEffect(() => {
    const repo = useRepoStore.getState().repositories.find(item => item.id === repoId)
    if (!repo) return
    void window.api.git.getConflictCandidateSettings(repo.path).then(response => {
      if (response.success && response.data) useRepoStore.setState(state => ({ conflictSessions: { ...state.conflictSessions, [repoId]: { ...state.getConflictSession(repoId), candidateReuseEnabled: response.data!.enabled } } }))
    })
  }, [repoId])
  useEffect(() => {
    const previous = window.document.activeElement as HTMLElement | null
    firstFocus.current?.focus()
    return () => previous?.focus()
  }, [repoId, !!session.snapshot])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss?.() }
      if (event.altKey && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault()
        const next = files[activeIndex + (event.key === 'ArrowRight' ? 1 : -1)]
        if (next) chooseFile(next.path)
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, summary, [tabindex="0"]')).filter(element => element.getClientRects().length > 0)
        const first = focusable[0], last = focusable.at(-1)
        if (event.shiftKey && window.document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && window.document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIndex, files, chooseFile, onDismiss])

  const kind = session.snapshot?.kind || 'merge'
  const emptyCherryPick = kind === 'cherry-pick' && session.snapshot?.phase === 'empty'
  const showOperationSummary = emptyCherryPick || (session.snapshot?.phase === 'ready-to-continue' && files.length === 0)
  const currentLabel = kind === 'rebase' ? 'Onto branch' : 'Current'
  const incomingLabel = kind === 'rebase' ? 'Replayed commit' : 'Incoming'
  const operationName = kind === 'cherry-pick' ? 'Cherry-pick' : kind[0].toUpperCase() + kind.slice(1)
  const description = session.snapshot?.subject || (kind === 'rebase' ? session.snapshot?.roles.incoming : null) || `Review changes to finish your ${kind}.`

  if (session.error && !session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title"><div className="conflict-error" role="alert"><h2 id="conflict-title">Unable to load conflict operation</h2><p>{session.error}</p><button className="conflict-workbench-btn" type="button" onClick={() => void loadSnapshot(repoId)}>Retry</button></div></main>
  if (session.pending === 'load' && !session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-label="Loading conflict operation"><div className="conflict-loading" role="status">Loading conflict operation…</div></main>
  if (!session.snapshot) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-label="Conflict operation"><div className="conflict-empty" role="status">No active conflict operation.</div></main>
  if (finished) return <main className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title" data-testid="conflict-resolver"><section className="conflict-operation-empty"><CheckCircle2 size={36} aria-hidden="true" /><h2 id="conflict-title">No active conflict operation</h2><p>There is no merge, rebase, or cherry-pick left to finish.</p>{onDismiss && <button type="button" className="conflict-workbench-btn primary" onClick={onDismiss}>Close</button>}</section></main>

  const runAction = async (operation: 'continue' | 'skip' | 'abort') => {
    await runOperation(repoId, operation)
  }
  const setRegion = (id: string | null) => useRepoStore.setState(state => ({ conflictSessions: { ...state.conflictSessions, [repoId]: { ...state.getConflictSession(repoId), activeRegionId: id } } }))
  const setFileChoice = (choice: 'current' | 'incoming') => useRepoStore.setState(state => {
    const current = state.getConflictSession(repoId)
    if (!current.activePath || !current.drafts[current.activePath]) return state
    return { conflictSessions: { ...state.conflictSessions, [repoId]: { ...current, drafts: { ...current.drafts, [current.activePath]: { ...current.drafts[current.activePath], fileChoice: choice, dirty: true } } } } }
  })

  return <main ref={dialogRef} className="conflict-workbench" role="dialog" aria-modal="true" aria-labelledby="conflict-title" aria-describedby="conflict-description" data-testid="conflict-resolver" data-workbench-testid="conflict-workbench" aria-busy={!!session.pending}>
    <header className="conflict-operation-strip">
      <div className="conflict-operation-identity"><span className="conflict-operation-icon"><GitMerge size={20} /></span><div><div className="conflict-title-row"><h2 id="conflict-title">{showOperationSummary ? `Finish ${kind}` : 'Resolve conflicts'}</h2><span className="conflict-operation-badge">{operationName}{session.snapshot.currentStep ? ` · ${session.snapshot.currentStep}${session.snapshot.totalSteps ? ` / ${session.snapshot.totalSteps}` : ''}` : ''}</span></div><p id="conflict-description" title={description}>{description}</p></div></div>
      <div className="conflict-operation-actions">
        {conflictSelectors.canUndoResolution(session) && <button type="button" className="conflict-workbench-btn quiet" data-testid="conflict-undo-resolution" onClick={() => void undo(repoId)}><RotateCcw size={14} /> Undo Resolution</button>}
        <button type="button" className="conflict-workbench-btn quiet danger" data-testid="abort-merge-btn" aria-label="Abort" title={`Abort ${operationName} and restore previous state`} disabled={!!session.pending} onClick={() => void runAction('abort')}><XCircle size={14} /> Abort {operationName}</button>
        {(kind === 'rebase' || emptyCherryPick) && <button type="button" className={`conflict-workbench-btn ${emptyCherryPick ? 'primary' : 'quiet'}`} data-testid="conflict-skip-btn" disabled={!conflictSelectors.canSkip(session)} onClick={() => void runAction('skip')}><SkipForward size={14} /> Skip commit</button>}
        {!emptyCherryPick && <button type="button" className="conflict-workbench-btn primary" data-testid="conflict-continue-btn" disabled={!conflictSelectors.canContinue(session)} title={conflictSelectors.canContinue(session) ? `Continue ${operationName}` : 'Stage all conflicted files to continue'} onClick={() => void runAction('continue')}>Continue {operationName}<ArrowRight size={14} /></button>}
        {onDismiss && <button ref={firstFocus} type="button" className="conflict-workbench-btn quiet icon-only" onClick={onDismiss} aria-label="Minimize conflict workbench" title="Minimize (Esc)"><Minus size={18} /></button>}
      </div>
    </header>
    {session.externalChange && <div className="conflict-error" role="alert">Files changed outside UltraGIT. Reload the operation before applying any resolution.<button className="conflict-workbench-btn" type="button" onClick={() => void loadSnapshot(repoId)}>Reload</button></div>}
    {session.error && <div className="conflict-error" role="alert">{session.error}</div>}
    <div className={`conflict-workbench-body${showOperationSummary ? ' empty-operation' : ''}`}>
      {showOperationSummary ? <section className="conflict-operation-empty" data-testid={emptyCherryPick ? 'conflict-empty-cherry-pick' : 'conflict-ready-to-continue'} aria-labelledby="empty-cherry-pick-title">
        <CheckCircle2 size={36} aria-hidden="true" />
        <h3 id="empty-cherry-pick-title">{!emptyCherryPick ? 'Ready to continue' : session.snapshot.hasUnstagedChanges ? 'Changes still need staging' : 'No changes to apply'}</h3>
        <p>{!emptyCherryPick ? `Your staged changes are ready. Continue to finish this ${kind} step.` : session.snapshot.hasUnstagedChanges ? 'There are unstaged changes in your working tree. Minimize this window to review and stage them, then reopen it to continue.' : 'This commit adds no changes to the current branch. Its changes may already be present, or your conflict resolution kept the current version.'}</p>
        <code>{session.snapshot.roles.incoming}</code>
        {emptyCherryPick && !session.snapshot.hasUnstagedChanges && <p>Choose <strong>Skip commit</strong> to finish this step and keep the current files.</p>}
        <button type="button" className="conflict-workbench-btn quiet" disabled={!!session.pending} onClick={() => void loadSnapshot(repoId)}><RotateCcw size={13} /> Refresh status</button>
      </section> : <>
      <ConflictFileList files={files} activePath={session.activePath} drafts={session.drafts} onSelect={chooseFile} />
      <section className="conflict-workbench-content" aria-label="Conflict editor">{!active ? <div className="conflict-empty">Select a file to compare changes and build the result.</div> : <>
        <CandidatePanel enabled={session.candidateReuseEnabled} candidates={active.candidates} previewedId={active.previewedCandidateId} acceptedId={active.acceptedCandidateId} onToggle={enabled => void setCandidateReuse(repoId, enabled)} onPreview={id => void previewCandidate(repoId, id)} onAccept={id => acceptCandidate(repoId, id)} onReject={id => rejectCandidate(repoId, id)} onForget={id => void forgetCandidate(repoId, id)} />
        <ResolutionEditor document={active.document} result={active.result} activeRegionId={session.activeRegionId} canApply={conflictSelectors.canApplyFile(session)} staged={!allPaths.has(active.document.path) && !active.dirty} fileChoice={active.fileChoice} currentLabel={currentLabel} incomingLabel={incomingLabel} currentRef={session.snapshot.roles.current} incomingRef={session.snapshot.roles.incoming} onEdit={value => session.activePath && editResult(repoId, session.activePath, value)} onChoice={(id, choice, selected) => { if (session.activePath) selectRegion(repoId, session.activePath, id, choice, selected) }} onRegion={setRegion} onApply={() => void apply(repoId, session.activePath || undefined)} onFileChoice={setFileChoice} />
      </>}</section>
      </>}
    </div>
    <footer className="conflict-status-bar"><span><span className="conflict-status-dot" /><span data-testid="conflict-unresolved-count">{session.pending ? `${session.pending}…` : emptyCherryPick ? 'Cherry-pick paused' : showOperationSummary ? 'Ready to continue' : `${conflictFiles.length} file${conflictFiles.length === 1 ? '' : 's'} left to stage`}</span></span><span><kbd>Alt</kbd> + <kbd>←</kbd> <kbd>→</kbd> switch file <span className="conflict-shortcut-divider" /><kbd>Esc</kbd> minimize</span>{!showOperationSummary && <span>File {files.length ? activeIndex + 1 : 0} of {files.length}</span>}</footer>
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
  return <details className="conflict-candidate-panel">
    <summary><span><Sparkles size={14} /> Resolution suggestions <span className="conflict-candidate-count">{enabled ? candidates.length : 'Off'}</span></span><span className="conflict-candidate-summary-hint">{enabled && candidates.length ? 'Review suggestions' : 'Optional'}</span><ChevronDown size={13} /></summary>
    <div className="conflict-candidate-content">
    <div className="conflict-candidate-header"><p>Preview a suggestion before accepting it into the result.</p><label><input type="checkbox" checked={enabled} onChange={event => onToggle(event.target.checked)} /> Reuse resolutions in this repository</label></div>
    {!enabled ? <p className="conflict-candidate-muted">Enable reuse to see suggestions based on resolutions saved in this repository.</p> : candidates.length === 0 ? <p className="conflict-candidate-muted">No safe candidate found for this conflict. Choose regions manually.</p> : <div className="conflict-candidate-list">{candidates.map(candidate => <article key={candidate.id} className="conflict-candidate-card"><div><strong>{ruleLabel[candidate.ruleId] || candidate.ruleId}</strong><span> · {candidate.affectedRegionIds.length} affected region{candidate.affectedRegionIds.length === 1 ? '' : 's'}</span></div><p>{candidate.rationale}</p><small>{candidate.safety}</small><div className="conflict-candidate-actions"><button type="button" className="conflict-workbench-btn" onClick={() => onPreview(candidate.id)}>{previewedId === candidate.id ? 'Previewed' : 'Preview'}</button><button type="button" className="conflict-workbench-btn primary" disabled={previewedId !== candidate.id} onClick={() => onAccept(candidate.id)}>Accept into Result</button><button type="button" className="conflict-workbench-btn" onClick={() => onReject(candidate.id)}>Reject</button>{candidate.recordId && <button type="button" className="conflict-workbench-btn danger" onClick={() => onForget(candidate.recordId!)}>Forget record</button>}</div>{selected?.id === candidate.id && <div className="conflict-candidate-preview" aria-live="polite"><div><b>Before</b><pre>{candidate.beforePreview || '(empty)'}</pre></div><div><b>After</b><pre>{candidate.afterPreview || '(empty)'}</pre></div></div>}{acceptedId === candidate.id && <p role="status">Accepted into editable Result. Nothing has been written or staged.</p>}</article>)}</div>}
    </div>
  </details>
}

export default ConflictWorkbench
