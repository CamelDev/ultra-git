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
})
