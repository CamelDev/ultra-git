import { describe, expect, test } from 'bun:test'
import { getHunkResultContent } from '../ConflictHunkView'
import type { ConflictRegion } from '../../../../../shared/conflicts'

const baseRegion: ConflictRegion = {
  id: 'region-1',
  generation: 'gen-1',
  stageOids: { base: 'b', current: 'c', incoming: 'i' },
  baseRange: { start: 1, end: 2 },
  currentRange: { start: 1, end: 2 },
  incomingRange: { start: 1, end: 2 },
  modes: {},
  contentHashes: { base: 'b', current: 'c', incoming: 'i' },
  base: 'Base line\n',
  current: 'Current line\n',
  incoming: 'Incoming line\n',
  choice: 'unresolved'
}

describe('ConflictHunkView result preview (HV1-HV6)', () => {
  test('HV1: choice current returns current content', () => {
    const region = { ...baseRegion, choice: 'current' as const }
    expect(getHunkResultContent(region)).toBe('Current line\n')
  })

  test('HV2: choice incoming returns incoming content', () => {
    const region = { ...baseRegion, choice: 'incoming' as const }
    expect(getHunkResultContent(region)).toBe('Incoming line\n')
  })

  test('HV3: choice both-current-first concatenates current then incoming', () => {
    const region = { ...baseRegion, choice: 'both-current-first' as const }
    expect(getHunkResultContent(region)).toBe('Current line\nIncoming line\n')

    // Deduplication if equal
    const equalRegion = { ...baseRegion, incoming: 'Current line\n', choice: 'both-current-first' as const }
    expect(getHunkResultContent(equalRegion)).toBe('Current line\n')
  })

  test('HV4: choice both-incoming-first concatenates incoming then current', () => {
    const region = { ...baseRegion, choice: 'both-incoming-first' as const }
    expect(getHunkResultContent(region)).toBe('Incoming line\nCurrent line\n')

    // Deduplication if equal
    const equalRegion = { ...baseRegion, incoming: 'Current line\n', choice: 'both-incoming-first' as const }
    expect(getHunkResultContent(equalRegion)).toBe('Current line\n')
  })

  test('HV5: choice selected-range returns selected text', () => {
    const region = { ...baseRegion, choice: 'selected-range' as const, selected: 'Selected subset\n' }
    expect(getHunkResultContent(region)).toBe('Selected subset\n')
  })

  test('HV6: choice unresolved returns empty string', () => {
    const region = { ...baseRegion, choice: 'unresolved' as const }
    expect(getHunkResultContent(region)).toBe('')
  })

  test('null region returns empty string', () => {
    expect(getHunkResultContent(null)).toBe('')
  })
})
