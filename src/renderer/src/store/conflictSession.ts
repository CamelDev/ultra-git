import type { ConflictDocument, ConflictRegion, OperationActionResult, OperationSnapshot, RegionChoice } from '../../../shared/conflicts'

export type FileChoice = 'unresolved' | 'current' | 'incoming' | 'manual'

export interface ConflictDraft {
  document: ConflictDocument
  result: string
  dirty: boolean
  fileChoice: FileChoice
  updatedAt: number
}

export interface ConflictSession {
  repoId: string
  snapshot: OperationSnapshot | null
  generation: string | null
  activePath: string | null
  activeRegionId: string | null
  drafts: Record<string, ConflictDraft>
  undo: { token: string; generation: string } | null
  externalChange: boolean
  pending: string | null
  error: string | null
}

export type ConflictSessionAction =
  | { type: 'snapshot'; snapshot: OperationSnapshot }
  | { type: 'document'; document: ConflictDocument }
  | { type: 'select-file'; path: string }
  | { type: 'select-region'; regionId: string | null }
  | { type: 'choose-region'; path: string; regionId: string; choice: RegionChoice; selected?: string }
  | { type: 'edit-result'; path: string; result: string }
  | { type: 'choose-file'; path: string; choice: FileChoice }
  | { type: 'external-snapshot'; snapshot: OperationSnapshot }
  | { type: 'action-start'; action: string }
  | { type: 'action-result'; result: OperationActionResult }
  | { type: 'undo-expired' }
  | { type: 'error'; message: string }

export const createConflictSession = (repoId: string): ConflictSession => ({
  repoId, snapshot: null, generation: null, activePath: null, activeRegionId: null,
  drafts: {}, undo: null, externalChange: false, pending: null, error: null
})

const compose = (doc: ConflictDocument, choices: Record<string, { choice: RegionChoice; selected?: string }>) => {
  const base = (doc.base?.bytes ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = base.endsWith('\n') ? base.slice(0, -1).split('\n') : base.split('\n')
  const eol = doc.eol === 'crlf' ? '\r\n' : '\n'
  let cursor = 0
  const out: string[] = []
  const append = (value: string) => { if (value) out.push(...value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) }
  for (const region of doc.regions) {
    out.push(...lines.slice(cursor, region.baseRange.start))
    const selected = choices[region.id] ?? region
    switch (selected.choice) {
      case 'current': append(region.current); break
      case 'incoming': append(region.incoming); break
      case 'both-current-first': append(region.current); append(region.incoming === region.current ? '' : region.incoming); break
      case 'both-incoming-first': append(region.incoming); append(region.current === region.incoming ? '' : region.current); break
      case 'manual': case 'selected-range': append(selected.selected ?? ''); break
      default: break
    }
    cursor = region.baseRange.end
  }
  out.push(...lines.slice(cursor))
  const result = out.join('\n')
  return result ? result.replace(/\n/g, eol) + (doc.hasFinalNewline ? eol : '') : (doc.hasFinalNewline ? eol : '')
}

const draftFor = (document: ConflictDocument): ConflictDraft => ({
  document,
  result: document.result?.bytes ?? document.workingResult?.bytes ?? '',
  dirty: false,
  fileChoice: document.isBinary || document.regions.length === 0 ? 'unresolved' : 'unresolved',
  updatedAt: Date.now()
})

const sameGeneration = (state: ConflictSession, generation: string) => state.generation === generation

export function conflictSessionReducer(state: ConflictSession, action: ConflictSessionAction): ConflictSession {
  switch (action.type) {
    case 'snapshot': {
      const replacing = state.generation !== null && state.generation !== action.snapshot.generation
      const path = action.snapshot.nextConflict ?? state.activePath
      return { ...state, snapshot: action.snapshot, generation: action.snapshot.generation, activePath: path, activeRegionId: replacing ? null : state.activeRegionId, drafts: replacing ? {} : state.drafts, undo: replacing ? null : state.undo, externalChange: false, pending: null, error: null }
    }
    case 'document': {
      if (!sameGeneration(state, action.document.generation) || action.document.repoId !== state.repoId) return state
      const previous = state.drafts[action.document.path]
      const draft = previous && !state.externalChange ? { ...previous, document: action.document } : draftFor(action.document)
      return { ...state, drafts: { ...state.drafts, [action.document.path]: draft }, activePath: action.document.path, activeRegionId: draft.document.regions[0]?.id ?? null, externalChange: false, error: null }
    }
    case 'select-file': return { ...state, activePath: action.path, activeRegionId: state.drafts[action.path]?.document.regions[0]?.id ?? null }
    case 'select-region': return { ...state, activeRegionId: action.regionId }
    case 'choose-region': {
      if (!sameGeneration(state, state.generation ?? '') || !state.drafts[action.path]) return state
      const draft = state.drafts[action.path]
      const regions = draft.document.regions.map((region: ConflictRegion) => region.id === action.regionId ? { ...region, choice: action.choice, selected: action.selected } : region)
      const document = { ...draft.document, regions }
      const choices = Object.fromEntries(regions.map(region => [region.id, { choice: region.choice, selected: region.selected }]))
      return { ...state, drafts: { ...state.drafts, [action.path]: { ...draft, document, result: compose(document, choices), dirty: true, updatedAt: Date.now() } }, error: null }
    }
    case 'edit-result': {
      const draft = state.drafts[action.path]; if (!draft) return state
      return { ...state, drafts: { ...state.drafts, [action.path]: { ...draft, result: action.result, dirty: true, fileChoice: 'manual', updatedAt: Date.now() } } }
    }
    case 'choose-file': {
      const draft = state.drafts[action.path]; if (!draft) return state
      return { ...state, drafts: { ...state.drafts, [action.path]: { ...draft, fileChoice: action.choice, dirty: true, updatedAt: Date.now() } } }
    }
    case 'external-snapshot': {
      if (state.generation === action.snapshot.generation) return { ...state, snapshot: action.snapshot, externalChange: false }
      return { ...state, snapshot: action.snapshot, generation: action.snapshot.generation, drafts: {}, undo: null, activePath: action.snapshot.nextConflict ?? null, activeRegionId: null, externalChange: true, pending: null, error: 'The conflict operation changed outside UltraGIT. Review the refreshed files before applying.' }
    }
    case 'action-start': return { ...state, pending: action.action, error: null }
    case 'action-result': {
      const snapshot = action.result.snapshot
      const replacing = state.generation !== null && state.generation !== snapshot.generation
      return { ...state, snapshot, generation: snapshot.generation, drafts: replacing ? {} : state.drafts, activePath: snapshot.nextConflict ?? state.activePath, activeRegionId: replacing ? null : state.activeRegionId, undo: replacing ? null : state.undo, externalChange: false, pending: null, error: action.result.error?.message ?? null }
    }
    case 'undo-expired': return { ...state, undo: null, error: 'Undo Resolution is no longer available because the operation advanced or the file changed.' }
    case 'error': return { ...state, pending: null, error: action.message }
  }
}

export const conflictSelectors = {
  activeDraft: (state: ConflictSession) => state.activePath ? state.drafts[state.activePath] ?? null : null,
  unresolvedCount: (state: ConflictSession) => Object.values(state.drafts).reduce((count, draft) => count + (draft.document.isBinary ? (draft.fileChoice === 'unresolved' ? 1 : 0) : draft.document.regions.filter(region => region.choice === 'unresolved').length), 0),
  dirtyResult: (state: ConflictSession) => Object.values(state.drafts).some(draft => draft.dirty),
  canApplyFile: (state: ConflictSession) => { const draft = conflictSelectors.activeDraft(state); return !!draft && !state.pending && !state.externalChange && (draft.document.isBinary ? draft.fileChoice !== 'unresolved' : draft.document.regions.every(region => region.choice !== 'unresolved')) },
  canContinue: (state: ConflictSession) => !!state.snapshot && state.snapshot.phase === 'ready-to-continue' && !state.pending && !state.externalChange,
  canUndoResolution: (state: ConflictSession) => !!state.undo && !state.pending && !state.externalChange && state.undo.generation === state.generation
}
