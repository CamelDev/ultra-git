import { describe, expect, it } from 'bun:test'
import { deriveConflictRegions } from '../../../../main/conflictRegions'
import { conflictSelectors, conflictSessionReducer, createConflictSession } from '../conflictSession'
import type { ConflictDocument, OperationSnapshot } from '../../../../shared/conflicts'

const snapshot = (generation: string, phase: OperationSnapshot['phase'] = 'conflicted'): OperationSnapshot => ({
  repoId: '/repo', generation, kind: 'rebase', phase,
  roles: { current: 'main', incoming: 'pick change', currentRole: 'onto', incomingRole: 'replayed' }, conflicts: [{ path: 'file.txt', status: 'UU' }], nextConflict: 'file.txt'
})

const document = (generation = 'g1'): ConflictDocument => {
  const regions = deriveConflictRegions({ generation, base: 'before\nkeep\nafter\n', current: 'before\ncurrent\nafter\n', incoming: 'before\nincoming\nafter\n', eol: 'lf', hasFinalNewline: true })
  return { repoId: '/repo', path: 'file.txt', generation, conflictType: 'both-modified', base: { bytes: 'before\nkeep\nafter\n', hash: 'b', byteLength: 18, eol: 'lf', hasFinalNewline: true, isBinary: false }, regions, isBinary: false, eol: 'lf', hasFinalNewline: true }
}

const loaded = () => {
  let state = createConflictSession('/repo')
  state = conflictSessionReducer(state, { type: 'snapshot', snapshot: snapshot('g1') })
  state = conflictSessionReducer(state, { type: 'document', document: document() })
  return state
}

describe('conflictSessionReducer', () => {
  it('starts every text region unresolved and viewing does not make it applyable', () => {
    const state = loaded()
    expect(state.drafts['file.txt'].document.regions[0].choice).toBe('unresolved')
    expect(conflictSelectors.unresolvedCount(state)).toBe(1)
    expect(conflictSelectors.canApplyFile(state)).toBe(false)
  })

  it('supports every explicit region decision and recomposes the whole Result', () => {
    let state = loaded(); const region = state.drafts['file.txt'].document.regions[0]
    for (const choice of ['current', 'incoming', 'both-current-first', 'both-incoming-first'] as const) {
      state = conflictSessionReducer(state, { type: 'choose-region', path: 'file.txt', regionId: region.id, choice })
      expect(state.drafts['file.txt'].result).toContain(choice === 'current' ? 'current' : choice === 'incoming' ? 'incoming' : 'before')
    }
    state = conflictSessionReducer(state, { type: 'choose-region', path: 'file.txt', regionId: region.id, choice: 'selected-range', selected: 'manual range' })
    expect(state.drafts['file.txt'].result).toContain('manual range')
    state = conflictSessionReducer(state, { type: 'choose-region', path: 'file.txt', regionId: region.id, choice: 'manual', selected: 'manual text' })
    expect(state.drafts['file.txt'].result).toContain('manual text')
    state = conflictSessionReducer(state, { type: 'choose-region', path: 'file.txt', regionId: region.id, choice: 'unresolved' })
    expect(conflictSelectors.canApplyFile(state)).toBe(false)
  })

  it('preserves a dirty Result while navigating and isolates structural choices', () => {
    let state = loaded()
    state = conflictSessionReducer(state, { type: 'edit-result', path: 'file.txt', result: 'edited' })
    state = conflictSessionReducer(state, { type: 'select-file', path: 'other.bin' })
    expect(state.drafts['file.txt'].result).toBe('edited')
    const binary: ConflictDocument = { ...document(), path: 'other.bin', isBinary: true, regions: [] }
    state = conflictSessionReducer(state, { type: 'document', document: binary })
    expect(conflictSelectors.canApplyFile(state)).toBe(false)
    state = conflictSessionReducer(state, { type: 'choose-file', path: 'other.bin', choice: 'current' })
    expect(conflictSelectors.canApplyFile(state)).toBe(true)
  })

  it('replaces drafts on a new generation and rejects stale documents', () => {
    let state = loaded()
    state = conflictSessionReducer(state, { type: 'edit-result', path: 'file.txt', result: 'dirty' })
    state = conflictSessionReducer(state, { type: 'snapshot', snapshot: snapshot('g2') })
    expect(state.drafts).toEqual({})
    expect(conflictSessionReducer(state, { type: 'document', document: document('g1') }).drafts).toEqual({})
  })

  it('surfaces external changes, expires undo, and gates continue', () => {
    let state = loaded(); state = { ...state, undo: { token: 'u', generation: 'g1' } }
    state = conflictSessionReducer(state, { type: 'external-snapshot', snapshot: snapshot('g2') })
    expect(state.externalChange).toBe(true)
    expect(conflictSelectors.canUndoResolution(state)).toBe(false)
    state = conflictSessionReducer(state, { type: 'undo-expired' })
    expect(state.undo).toBeNull()
    state = conflictSessionReducer(state, { type: 'action-result', result: { snapshot: snapshot('g2', 'ready-to-continue') } })
    expect(conflictSelectors.canContinue(state)).toBe(true)
  })
})
