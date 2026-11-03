import type { ConflictFileSummary, LineRange } from '../../../../shared/conflicts'
import type { ConflictDraft } from '../../store/conflictSession'

export type ConflictFileState = 'unresolved' | 'edited' | 'staged'

export function getConflictFileState(file: ConflictFileSummary, draft?: Pick<ConflictDraft, 'dirty'>): ConflictFileState {
  if (draft?.dirty) return 'edited'
  return file.status === 'RESOLVED' ? 'staged' : 'unresolved'
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
