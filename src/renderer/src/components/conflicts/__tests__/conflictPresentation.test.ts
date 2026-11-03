import { describe, expect, test } from 'bun:test'
import { getConflictFileState, getSourceExcerpt } from '../conflictPresentation'

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
