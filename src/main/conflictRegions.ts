import { createHash } from 'crypto'
import type { ConflictDocument, ConflictRegion, ConflictRegionIdentity, EolStyle, LineRange, RegionChoice } from '../shared/conflicts'

export interface ConflictRegionInput {
  generation: string
  stageOids?: { base?: string; current?: string; incoming?: string }
  modes?: { base?: string; current?: string; incoming?: string }
  base: string
  current: string
  incoming: string
  eol?: EolStyle
  hasFinalNewline?: boolean
}

interface Edit { baseStart: number; baseEnd: number; sideStart: number; sideEnd: number }
interface SideLines { lines: string[]; finalNewline: boolean; eol: EolStyle }

const digest = (value: string) => createHash('sha256').update(Buffer.from(value)).digest('hex')

function splitLines(value: string): SideLines {
  const finalNewline = value.endsWith('\n') || value.endsWith('\r')
  const eols = [...value.matchAll(/\r\n|\n|\r/g)].map(match => match[0])
  const eol: EolStyle = eols.length === 0 ? 'none' : eols.every(item => item === '\r\n') ? 'crlf' : eols.every(item => item === '\n') ? 'lf' : 'mixed'
  const lines = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (finalNewline) lines.pop()
  return { lines, finalNewline, eol }
}

export function makeEdits(base: string[], side: string[]): Edit[] {
  const rows = base.length + 1
  const cols = side.length + 1
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  for (let i = base.length - 1; i >= 0; i--) for (let j = side.length - 1; j >= 0; j--) {
    table[i][j] = base[i] === side[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
  }
  const edits: Edit[] = []
  let i = 0, j = 0
  let startBase = -1, startSide = -1
  const flush = () => {
    if (startBase >= 0) edits.push({ baseStart: startBase, baseEnd: i, sideStart: startSide, sideEnd: j })
    startBase = startSide = -1
  }
  while (i < base.length || j < side.length) {
    if (i < base.length && j < side.length && base[i] === side[j]) { flush(); i++; j++; continue }
    if (startBase < 0) { startBase = i; startSide = j }
    // Prefer consuming the base line on ties. This keeps substitutions local
    // instead of letting an otherwise valid repeated line absorb the rest of
    // the file into one unstable region.
    if (i < base.length && (j === side.length || table[i + 1][j] >= table[i][j + 1])) i++
    else j++
  }
  flush()
  return edits
}

function range(start: number, end: number): LineRange { return { start, end } }
function slice(lines: string[], from: number, to: number): string { return lines.slice(from, to).join('\n') }

function regionIdentity(input: ConflictRegionInput, base: string, current: string, incoming: string, br: LineRange, cr: LineRange, ir: LineRange): ConflictRegionIdentity {
  return {
    generation: input.generation,
    stageOids: input.stageOids ?? {},
    baseRange: br,
    currentRange: cr,
    incomingRange: ir,
    modes: input.modes ?? {},
    contentHashes: { base: digest(base), current: digest(current), incoming: digest(incoming) }
  }
}

export function regionId(identity: ConflictRegionIdentity): string {
  const stable = {
    generation: identity.generation,
    stageOids: identity.stageOids,
    baseRange: identity.baseRange,
    currentRange: identity.currentRange,
    incomingRange: identity.incomingRange,
    modes: identity.modes,
    contentHashes: identity.contentHashes
  }
  return digest(JSON.stringify(stable))
}

/** Derives stable regions from the two base-to-side edit scripts. This is pure and non-mutating. */
export function deriveConflictRegions(input: ConflictRegionInput): ConflictRegion[] {
  const base = splitLines(input.base), current = splitLines(input.current), incoming = splitLines(input.incoming)
  const currentEdits = makeEdits(base.lines, current.lines)
  const incomingEdits = makeEdits(base.lines, incoming.lines)
  const edits = [...currentEdits.map(edit => ({ ...edit, side: 'current' as const })), ...incomingEdits.map(edit => ({ ...edit, side: 'incoming' as const }))]
    .sort((a, b) => a.baseStart - b.baseStart || a.baseEnd - b.baseEnd || a.side.localeCompare(b.side))
  const regions: Array<{ baseStart: number; baseEnd: number; currentStart: number; currentEnd: number; incomingStart: number; incomingEnd: number }> = []
  for (const edit of edits) {
    const existing = regions[regions.length - 1]
    const touches = existing && edit.baseStart <= existing.baseEnd
    if (!existing || !touches) regions.push({ baseStart: edit.baseStart, baseEnd: edit.baseEnd, currentStart: edit.side === 'current' ? edit.sideStart : edit.baseStart, currentEnd: edit.side === 'current' ? edit.sideEnd : edit.baseStart, incomingStart: edit.side === 'incoming' ? edit.sideStart : edit.baseStart, incomingEnd: edit.side === 'incoming' ? edit.sideEnd : edit.baseStart })
    else {
      existing.baseEnd = Math.max(existing.baseEnd, edit.baseEnd)
      if (edit.side === 'current') { existing.currentStart = Math.min(existing.currentStart, edit.sideStart); existing.currentEnd = Math.max(existing.currentEnd, edit.sideEnd) }
      else { existing.incomingStart = Math.min(existing.incomingStart, edit.sideStart); existing.incomingEnd = Math.max(existing.incomingEnd, edit.sideEnd) }
    }
  }
  const mapBoundary = (source: Edit[], boundary: number, startBoundary: boolean) => {
    let delta = 0
    for (const edit of source) {
      if (boundary < edit.baseStart) break
      if (edit.baseStart === edit.baseEnd && boundary === edit.baseStart) return startBoundary ? edit.sideStart : edit.sideEnd
      if (boundary === edit.baseStart) return edit.sideStart
      if (boundary <= edit.baseEnd) return edit.sideEnd
      delta += (edit.sideEnd - edit.sideStart) - (edit.baseEnd - edit.baseStart)
    }
    return boundary + delta
  }
  return regions.map(item => {
    // A conflict group can contain an edit from the other side that overlaps
    // an unchanged line on this side. Expand each side to the complete group
    // so choosing that side retains its unchanged bytes.
    item.currentStart = mapBoundary(currentEdits, item.baseStart, true)
    item.currentEnd = mapBoundary(currentEdits, item.baseEnd, false)
    item.incomingStart = mapBoundary(incomingEdits, item.baseStart, true)
    item.incomingEnd = mapBoundary(incomingEdits, item.baseEnd, false)
    const values = { base: slice(base.lines, item.baseStart, item.baseEnd), current: slice(current.lines, item.currentStart, item.currentEnd), incoming: slice(incoming.lines, item.incomingStart, item.incomingEnd) }
    const identity = regionIdentity(input, values.base, values.current, values.incoming, range(item.baseStart, item.baseEnd), range(item.currentStart, item.currentEnd), range(item.incomingStart, item.incomingEnd))
    return { ...identity, id: regionId(identity), ...values, choice: 'unresolved' as RegionChoice }
  })
}

export function composeConflictResult(document: Pick<ConflictDocument, 'generation' | 'regions' | 'base' | 'stage2' | 'stage3' | 'eol' | 'hasFinalNewline'>, choices: Record<string, { choice: RegionChoice; selected?: string }> = {}): string {
  const baseLines = splitLines(document.base?.bytes ?? '').lines
  const eol = document.eol === 'crlf' ? '\r\n' : '\n'
  let cursor = 0
  const output: string[] = []
  const append = (text: string) => { if (text.length > 0) output.push(...text.split('\n')) }
  for (const region of document.regions) {
    if (region.generation !== document.generation) throw new Error('STALE_GENERATION')
    append(slice(baseLines, cursor, region.baseRange.start))
    const current = choices[region.id] ?? region
    if (current.choice === 'unresolved') throw new Error('UNRESOLVED_REGION')
    if (current.choice === 'manual' || current.choice === 'selected-range') append(current.selected ?? '')
    else if (current.choice === 'current') append(region.current)
    else if (current.choice === 'incoming') append(region.incoming)
    else if (current.choice === 'both-current-first') { append(region.current); append(region.incoming === region.current ? '' : region.incoming) }
    else if (current.choice === 'both-incoming-first') { append(region.incoming); append(region.current === region.incoming ? '' : region.current) }
    cursor = region.baseRange.end
  }
  append(slice(baseLines, cursor, baseLines.length))
  const result = output.join('\n')
  return result ? result.replace(/\n/g, eol) + (document.hasFinalNewline ? eol : '') : (document.hasFinalNewline ? eol : '')
}

export function validateRegionSelection(region: ConflictRegion, generation: string, choice: { choice: RegionChoice; selected?: string }): void {
  if (region.generation !== generation) throw new Error('STALE_GENERATION')
  const identity: ConflictRegionIdentity = {
    generation: region.generation,
    stageOids: region.stageOids,
    baseRange: region.baseRange,
    currentRange: region.currentRange,
    incomingRange: region.incomingRange,
    modes: region.modes,
    contentHashes: region.contentHashes
  }
  if (region.id !== regionId(identity)) throw new Error('STALE_REGION')
  if (digest(region.base) !== region.contentHashes.base || digest(region.current) !== region.contentHashes.current || digest(region.incoming) !== region.contentHashes.incoming) throw new Error('STALE_REGION')
  if ((choice.choice === 'manual' || choice.choice === 'selected-range') && choice.selected === undefined) throw new Error('STALE_DIFF')
}

export const buildConflictRegions = deriveConflictRegions
export const composeRegions = composeConflictResult
