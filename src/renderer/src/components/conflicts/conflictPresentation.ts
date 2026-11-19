import type { ConflictFileSummary, ConflictRegion, LineRange } from '../../../../shared/conflicts'
import type { ConflictDraft } from '../../store/conflictSession'

export type ConflictFileState = 'unresolved' | 'edited' | 'staged'

export interface PickedConflictLine {
  side: 'current' | 'incoming'
  lineIndex: number
}

export function getConflictFileState(file: ConflictFileSummary, draft?: Pick<ConflictDraft, 'dirty'>): ConflictFileState {
  if (draft?.dirty) return 'edited'
  return file.status === 'RESOLVED' ? 'staged' : 'unresolved'
}

export const CONFLICT_CODE_VIEW_PREFERENCE_KEY = 'ultragit.conflict-code-view-enabled'
export const CONFLICT_RESULT_SYNTAX_PREFERENCE_KEY = 'ultragit.conflict-result-syntax-enabled'

export function readConflictBooleanPreference(
  key: string,
  defaultValue: boolean,
  storage: Pick<Storage, 'getItem'> | undefined
): boolean {
  try {
    const value = storage?.getItem(key)
    if (value === 'true') return true
    if (value === 'false') return false
    return defaultValue
  } catch {
    return defaultValue
  }
}

export function writeConflictBooleanPreference(
  key: string,
  enabled: boolean,
  storage: Pick<Storage, 'setItem'> | undefined
): void {
  try {
    storage?.setItem(key, String(enabled))
  } catch {
    /* preference is optional */
  }
}

/** Keep source line numbers and a little context, without showing the entire file. */
export function getSourceExcerpt(source: string | undefined, content: string, range: LineRange) {
  if (source === undefined) return { content, startLine: range.start + 1 }
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  const start = Math.max(0, range.start - 3)
  const end = Math.min(lines.length, range.end + 3)
  return { content: lines.slice(start, end).join('\n'), startLine: start + 1 }
}

export function splitRegionLines(content: string, range: LineRange): string[] {
  if (range.end <= range.start) return []
  return content.replace(/\r\n?/g, '\n').split('\n')
}

export function getInitialPickedLines(
  region: Pick<ConflictRegion, 'choice' | 'current' | 'incoming' | 'currentRange' | 'incomingRange'>
): PickedConflictLine[] {
  const currentCount = splitRegionLines(region.current, region.currentRange).length
  const incomingCount = splitRegionLines(region.incoming, region.incomingRange).length
  const allCurrent: PickedConflictLine[] = Array.from({ length: currentCount }, (_, lineIndex) => ({ side: 'current', lineIndex }))
  const allIncoming: PickedConflictLine[] = Array.from({ length: incomingCount }, (_, lineIndex) => ({ side: 'incoming', lineIndex }))

  switch (region.choice) {
    case 'current':
      return allCurrent
    case 'incoming':
      return allIncoming
    case 'both-current-first':
      return region.current === region.incoming ? allCurrent : [...allCurrent, ...allIncoming]
    case 'both-incoming-first':
      return region.incoming === region.current ? allIncoming : [...allIncoming, ...allCurrent]
    default:
      return []
  }
}

export function togglePickedLine(
  picks: PickedConflictLine[],
  side: 'current' | 'incoming',
  lineIndex: number
): PickedConflictLine[] {
  const exists = picks.some(pick => pick.side === side && pick.lineIndex === lineIndex)
  if (exists) {
    return picks.filter(pick => !(pick.side === side && pick.lineIndex === lineIndex))
  }
  return [...picks, { side, lineIndex }]
}

export function composePickedLines(
  picks: PickedConflictLine[],
  region: Pick<ConflictRegion, 'current' | 'incoming' | 'currentRange' | 'incomingRange'>
): string {
  const currentLines = splitRegionLines(region.current, region.currentRange)
  const incomingLines = splitRegionLines(region.incoming, region.incomingRange)
  const out: string[] = []
  for (const pick of picks) {
    const lines = pick.side === 'current' ? currentLines : incomingLines
    if (pick.lineIndex >= 0 && pick.lineIndex < lines.length) {
      out.push(lines[pick.lineIndex])
    }
  }
  return out.join('\n')
}

export function findNextUnresolvedRegionId(
  regions: Array<Pick<ConflictRegion, 'id' | 'choice'>>,
  currentRegionId: string
): string | null {
  const currentIndex = regions.findIndex(region => region.id === currentRegionId)
  if (currentIndex === -1) return null
  const after = regions.find((region, index) => index > currentIndex && region.choice === 'unresolved')
  if (after) return after.id
  const before = regions.find((region, index) => index < currentIndex && region.choice === 'unresolved')
  return before?.id ?? null
}

export function resolveChunkNavigationDelta(event: {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  defaultPrevented?: boolean
}): -1 | 1 | 0 {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return 0
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key === 'a' || key === 'ArrowLeft') return -1
  if (key === 'd' || key === 'ArrowRight') return 1
  return 0
}
