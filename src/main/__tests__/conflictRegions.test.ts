import { describe, expect, test } from 'bun:test'
import { composeConflictResult, deriveConflictRegions, regionId, validateRegionSelection } from '../conflictRegions'

const derive = (base: string, current: string, incoming: string, extra: Record<string, unknown> = {}) => ({
  generation: 'generation-1', base, current, incoming, ...extra
})

describe('Git-derived conflict regions', () => {
  test('creates independent regions for separated edits and composes unchanged base text', () => {
    const input = derive('a\nb\nc\nd\ne\nf\n', 'a\nB\nc\nd\nE\nf\n', 'a\nb\nC\nd\ne\nF\n')
    const regions = deriveConflictRegions(input)
    expect(regions).toHaveLength(2)
    const result = composeConflictResult({ generation: input.generation, regions, base: { bytes: input.base } as any, eol: 'lf', hasFinalNewline: true }, Object.fromEntries(regions.map(region => [region.id, { choice: 'current' }])))
    expect(result).toBe('a\nB\nc\nd\nE\nf\n')
  })

  test('groups adjacent edits and supports both order without duplicating identical insertion', () => {
    const input = derive('a\nb\nc\n', 'a\nX\nY\nc\n', 'a\nZ\nY\nc\n')
    const regions = deriveConflictRegions(input)
    expect(regions).toHaveLength(1)
    expect(regions[0].baseRange).toEqual({ start: 1, end: 2 })
    const doc = { generation: input.generation, regions, base: { bytes: input.base } as any, eol: 'lf' as const, hasFinalNewline: true }
    expect(composeConflictResult(doc, { [regions[0].id]: { choice: 'both-current-first' } })).toContain('X')
    const sameInput = derive('a\nb\n', 'a\nX\nb\n', 'a\nX\nb\n')
    const same = deriveConflictRegions(sameInput)
    expect(composeConflictResult({ generation: sameInput.generation, regions: same, base: { bytes: sameInput.base } as any, eol: 'lf', hasFinalNewline: true }, { [same[0].id]: { choice: 'both-current-first' } })).toBe('a\nX\nb\n')
  })

  test('handles same-position insertions deterministically', () => {
    const input = derive('a\nb\n', 'a\nX\nb\n', 'a\nY\nb\n')
    const regions = deriveConflictRegions(input)
    expect(regions[0].baseRange).toEqual({ start: 1, end: 1 })
    const doc = { generation: input.generation, regions, base: { bytes: input.base } as any, eol: 'lf' as const, hasFinalNewline: true }
    expect(composeConflictResult(doc, { [regions[0].id]: { choice: 'both-current-first' } })).toBe('a\nX\nY\nb\n')
    expect(composeConflictResult(doc, { [regions[0].id]: { choice: 'both-incoming-first' } })).toBe('a\nY\nX\nb\n')
  })

  test('supports add/delete and manual selections', () => {
    const added = derive('', 'one\n', 'two\n')
    const regions = deriveConflictRegions(added)
    expect(regions).toHaveLength(1)
    const doc = { generation: added.generation, regions, base: { bytes: added.base } as any, eol: 'lf' as const, hasFinalNewline: true }
    expect(composeConflictResult(doc, { [regions[0].id]: { choice: 'manual', selected: 'chosen' } })).toBe('chosen\n')
    const deleted = derive('remove\n', '', 'keep\n')
    expect(deriveConflictRegions(deleted)).toHaveLength(1)
  })

  test('preserves CRLF and missing final newline', () => {
    const input = derive('a\r\nb\r\nc', 'a\r\nB\r\nc', 'a\r\nb\r\nC', { eol: 'crlf', hasFinalNewline: false })
    const regions = deriveConflictRegions(input)
    const result = composeConflictResult({ generation: input.generation, regions, base: { bytes: input.base } as any, eol: 'crlf', hasFinalNewline: false }, { [regions[0].id]: { choice: 'incoming' } })
    expect(result).toBe('a\r\nb\r\nC')
  })

  test('rejects stale generation and tampered region identity', () => {
    const regions = deriveConflictRegions(derive('a\nb', 'A\nb', 'a\nB'))
    expect(() => validateRegionSelection(regions[0], 'old-generation', { choice: 'current' })).toThrow('STALE_GENERATION')
    const tampered = { ...regions[0], current: 'tampered' }
    expect(() => validateRegionSelection(tampered, 'generation-1', { choice: 'current' })).toThrow('STALE_REGION')
    expect(regionId(regions[0])).toBe(regions[0].id)
  })

  test('does not mutate source inputs', () => {
    const input = derive('same\n', 'current\n', 'incoming\n')
    const before = JSON.stringify(input)
    deriveConflictRegions(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  test('auto-resolves regions with identical changes on both sides while leaving conflicting and one-sided regions unresolved', () => {
    const base = 'line1\nshared\nline3\nreal\nline5\nonesided\nline7\n'
    const current = 'line1\nsame-edit\nline3\ncurrent-edit\nline5\nonesided\nline7\n'
    const incoming = 'line1\nsame-edit\nline3\nincoming-edit\nline5\nincoming-only\nline7\n'
    const regions = deriveConflictRegions(derive(base, current, incoming))
    expect(regions).toHaveLength(3)

    // Region 0: identical on both sides -> auto-resolved
    expect(regions[0].current).toBe('same-edit')
    expect(regions[0].incoming).toBe('same-edit')
    expect(regions[0].choice).toBe('current')
    expect(regions[0].autoResolved).toBe(true)
    expect(() => validateRegionSelection(regions[0], 'generation-1', { choice: regions[0].choice })).not.toThrow()

    // Region 1: genuinely conflicting -> unresolved
    expect(regions[1].choice).toBe('unresolved')
    expect(regions[1].autoResolved).toBeUndefined()

    // Region 2: one-sided change (current === base) -> still unresolved
    expect(regions[2].choice).toBe('unresolved')
    expect(regions[2].autoResolved).toBeUndefined()

    // Composes without needing an explicit override for the auto-resolved region
    const doc = { generation: 'generation-1', regions, base: { bytes: base } as any, eol: 'lf' as const, hasFinalNewline: true }
    const result = composeConflictResult(doc, {
      [regions[1].id]: { choice: 'current' },
      [regions[2].id]: { choice: 'incoming' }
    })
    expect(result).toBe('line1\nsame-edit\nline3\ncurrent-edit\nline5\nincoming-only\nline7\n')
  })

  test('auto-resolves identical deletions on both sides', () => {
    const base = 'keep1\nremove-me\nkeep2\n'
    const regions = deriveConflictRegions(derive(base, 'keep1\nkeep2\n', 'keep1\nkeep2\n'))
    expect(regions).toHaveLength(1)
    expect(regions[0].choice).toBe('current')
    expect(regions[0].autoResolved).toBe(true)
    const doc = { generation: 'generation-1', regions, base: { bytes: base } as any, eol: 'lf' as const, hasFinalNewline: true }
    expect(composeConflictResult(doc)).toBe('keep1\nkeep2\n')
  })
})
