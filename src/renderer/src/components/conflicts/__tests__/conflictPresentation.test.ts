import { describe, expect, test } from 'bun:test'
import {
  composePickedLines,
  CONFLICT_CODE_VIEW_PREFERENCE_KEY,
  findNextUnresolvedRegionId,
  getConflictFileState,
  getInitialPickedLines,
  getSourceExcerpt,
  readConflictBooleanPreference,
  resolveChunkNavigationDelta,
  togglePickedLine,
  writeConflictBooleanPreference
} from '../conflictPresentation'

describe('Conflict file presentation', () => {
  test('an edited unresolved file belongs to one group until it is staged', () => {
    const file = { path: 'src/Journey.cs', status: 'UNMERGED' }
    expect(getConflictFileState(file)).toBe('unresolved')
    expect(getConflictFileState(file, { dirty: false })).toBe('unresolved')
    expect(getConflictFileState(file, { dirty: true })).toBe('edited')
    expect(getConflictFileState({ ...file, status: 'RESOLVED' }, { dirty: false })).toBe('staged')
    expect(getConflictFileState({ ...file, status: 'RESOLVED' }, { dirty: true })).toBe('edited')
  })
})

describe('Source context', () => {
  test('shows the selected conflict with three context lines and original line numbers', () => {
    const source = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n')
    expect(getSourceExcerpt(source, 'line 10', { start: 9, end: 10 })).toEqual({
      content: 'line 7\nline 8\nline 9\nline 10\nline 11\nline 12\nline 13', startLine: 7
    })
  })
  test('base context uses the selected range instead of the beginning of the file', () => {
    const source = 'using System;\nnamespace Example;\nclass Journey {\n  // context\n  // context\n  // context\n  var baseValue = 1;\n}\n'
    const excerpt = getSourceExcerpt(source, '  var baseValue = 1;', { start: 6, end: 7 })
    expect(excerpt.content).toContain('var baseValue = 1')
    expect(excerpt.content).not.toContain('using System;')
    expect(excerpt.startLine).toBe(4)
  })
  test('clips context at file boundaries and handles CRLF and absent stages', () => {
    expect(getSourceExcerpt('one\r\ntwo\r\n', 'one', { start: 0, end: 1 })).toEqual({ content: 'one\ntwo', startLine: 1 })
    expect(getSourceExcerpt(undefined, '', { start: 0, end: 0 })).toEqual({ content: '', startLine: 1 })
    expect(getSourceExcerpt('', '', { start: 0, end: 0 })).toEqual({ content: '', startLine: 1 })
  })
})

describe('Conflict view preferences', () => {
  test('reads and writes boolean preferences with safe defaults', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) }
    }
    expect(readConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, true, storage)).toBe(true)
    writeConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, false, storage)
    expect(readConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, true, storage)).toBe(false)
    writeConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, true, storage)
    expect(readConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, false, storage)).toBe(true)

    store.set(CONFLICT_CODE_VIEW_PREFERENCE_KEY, 'unexpected')
    expect(readConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, true, storage)).toBe(true)
    expect(readConflictBooleanPreference(CONFLICT_CODE_VIEW_PREFERENCE_KEY, false, undefined)).toBe(false)
  })
})

describe('Line-by-line conflict picking', () => {
  const sampleRegion = {
    choice: 'unresolved' as const,
    current: 'const a = 1\nconst b = 2',
    incoming: 'const a = 10\nconst c = 30',
    currentRange: { start: 4, end: 6 },
    incomingRange: { start: 4, end: 6 }
  }

  test('derives initial picked lines from whole-region choices', () => {
    expect(getInitialPickedLines(sampleRegion)).toEqual([])
    expect(getInitialPickedLines({ ...sampleRegion, choice: 'current' })).toEqual([
      { side: 'current', lineIndex: 0 },
      { side: 'current', lineIndex: 1 }
    ])
    expect(getInitialPickedLines({ ...sampleRegion, choice: 'incoming' })).toEqual([
      { side: 'incoming', lineIndex: 0 },
      { side: 'incoming', lineIndex: 1 }
    ])
    expect(getInitialPickedLines({ ...sampleRegion, choice: 'both-current-first' })).toEqual([
      { side: 'current', lineIndex: 0 },
      { side: 'current', lineIndex: 1 },
      { side: 'incoming', lineIndex: 0 },
      { side: 'incoming', lineIndex: 1 }
    ])
  })

  test('toggles and composes picked lines from both sides in selection order', () => {
    let picks = togglePickedLine([], 'current', 0)
    picks = togglePickedLine(picks, 'incoming', 1)
    picks = togglePickedLine(picks, 'current', 1)
    expect(composePickedLines(picks, sampleRegion)).toBe('const a = 1\nconst c = 30\nconst b = 2')

    // Unpicking removes the specific line while preserving remaining order
    picks = togglePickedLine(picks, 'incoming', 1)
    expect(composePickedLines(picks, sampleRegion)).toBe('const a = 1\nconst b = 2')
  })
})

describe('Auto-advance & chunk navigation shortcuts', () => {
  test('findNextUnresolvedRegionId advances forward and wraps around', () => {
    const regions = [
      { id: 'r1', choice: 'unresolved' as const },
      { id: 'r2', choice: 'current' as const },
      { id: 'r3', choice: 'unresolved' as const },
      { id: 'r4', choice: 'unresolved' as const }
    ]
    expect(findNextUnresolvedRegionId(regions, 'r1')).toBe('r3')
    expect(findNextUnresolvedRegionId(regions, 'r3')).toBe('r4')
    expect(findNextUnresolvedRegionId(regions, 'r4')).toBe('r1')
    expect(findNextUnresolvedRegionId([{ id: 'r1', choice: 'current' }], 'r1')).toBeNull()
  })

  test('resolveChunkNavigationDelta handles A/D and Left/Right while ignoring modifiers', () => {
    expect(resolveChunkNavigationDelta({ key: 'a' })).toBe(-1)
    expect(resolveChunkNavigationDelta({ key: 'A' })).toBe(-1)
    expect(resolveChunkNavigationDelta({ key: 'ArrowLeft' })).toBe(-1)
    expect(resolveChunkNavigationDelta({ key: 'd' })).toBe(1)
    expect(resolveChunkNavigationDelta({ key: 'D' })).toBe(1)
    expect(resolveChunkNavigationDelta({ key: 'ArrowRight' })).toBe(1)
    expect(resolveChunkNavigationDelta({ key: 'ArrowRight', altKey: true })).toBe(0)
    expect(resolveChunkNavigationDelta({ key: 'd', ctrlKey: true })).toBe(0)
    expect(resolveChunkNavigationDelta({ key: 'a', metaKey: true })).toBe(0)
    expect(resolveChunkNavigationDelta({ key: 'ArrowLeft', defaultPrevented: true })).toBe(0)
    expect(resolveChunkNavigationDelta({ key: 'w' })).toBe(0)
  })
})
