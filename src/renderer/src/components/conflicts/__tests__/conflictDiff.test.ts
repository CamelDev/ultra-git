import { describe, expect, test } from 'bun:test'
import { buildConflictDiffRows, computeConflictInlineDiff } from '../conflictDiff'

describe('conflictDiff', () => {
  test('produces normal rows with preserved original line number offsets for identical excerpts', () => {
    const rows = buildConflictDiffRows('alpha\nbeta\ngamma', 'alpha\nbeta\ngamma', 10, 20)
    expect(rows).toEqual([
      { rowType: 'normal', leftText: 'alpha', rightText: 'alpha', leftLineNumber: 10, rightLineNumber: 20 },
      { rowType: 'normal', leftText: 'beta', rightText: 'beta', leftLineNumber: 11, rightLineNumber: 21 },
      { rowType: 'normal', leftText: 'gamma', rightText: 'gamma', leftLineNumber: 12, rightLineNumber: 22 }
    ])
  })

  test('pairs modified lines into change rows with character-level inline diff highlights', () => {
    const rows = buildConflictDiffRows(
      'const timeout = 1000;\nreturn timeout;',
      'const timeout = 2500;\nreturn timeout;',
      5,
      5
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].rowType).toBe('change')
    expect(rows[0].leftLineNumber).toBe(5)
    expect(rows[0].rightLineNumber).toBe(5)
    expect(rows[0].leftSpans?.some(span => span.highlight && span.text.includes('10'))).toBe(true)
    expect(rows[0].rightSpans?.some(span => span.highlight && span.text.includes('25'))).toBe(true)
    expect(rows[0].leftSpans?.some(span => !span.highlight && span.text.includes('const timeout = '))).toBe(true)
    expect(rows[1].rowType).toBe('normal')
  })

  test('aligns unequal delete and add blocks with empty placeholder rows on the opposite side', () => {
    const rows = buildConflictDiffRows(
      'header\noldA\noldB\nfooter',
      'header\nnewA\nfooter',
      1,
      1
    )
    expect(rows.map(row => row.rowType)).toEqual(['normal', 'change', 'delete', 'normal'])
    expect(rows[2].leftText).toBe('oldB')
    expect(rows[2].leftLineNumber).toBe(3)
    expect(rows[2].rightText).toBeUndefined()
    expect(rows[2].rightLineNumber).toBeUndefined()
  })

  test('handles pure additions on incoming side', () => {
    const rows = buildConflictDiffRows('line1', 'line1\nline2\nline3', 4, 8)
    expect(rows.map(row => row.rowType)).toEqual(['normal', 'add', 'add'])
    expect(rows[1].leftText).toBeUndefined()
    expect(rows[1].rightText).toBe('line2')
    expect(rows[1].rightLineNumber).toBe(9)
    expect(rows[2].rightText).toBe('line3')
    expect(rows[2].rightLineNumber).toBe(10)
  })

  test('highlights whole lines when similarity is below threshold', () => {
    const { leftSpans, rightSpans } = computeConflictInlineDiff('abcdef', 'xyz123')
    expect(leftSpans).toEqual([{ text: 'abcdef', highlight: true }])
    expect(rightSpans).toEqual([{ text: 'xyz123', highlight: true }])
  })

  test('returns empty array when both inputs are empty', () => {
    expect(buildConflictDiffRows('', '')).toEqual([])
  })
})
