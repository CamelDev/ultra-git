import type { ConflictFileSummary, LineRange } from '../../../../shared/conflicts'
import type { ConflictDraft } from '../../store/conflictSession'

export type ConflictFileState = 'unresolved' | 'edited' | 'staged'

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
