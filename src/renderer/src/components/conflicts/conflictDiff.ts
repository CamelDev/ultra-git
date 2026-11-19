import { computeDiff } from '../../utils/patchBuilder'

export interface ConflictCharSpan {
  text: string
  highlight: boolean
}

export interface ConflictDiffRow {
  rowType: 'normal' | 'change' | 'delete' | 'add'
  leftText?: string
  rightText?: string
  leftLineNumber?: number
  rightLineNumber?: number
  leftSpans?: ConflictCharSpan[]
  rightSpans?: ConflictCharSpan[]
}

/**
 * Character-level LCS diff between two lines so subtle edits stand out in raw diff view.
 */
export function computeConflictInlineDiff(
  oldStr: string,
  newStr: string
): { leftSpans: ConflictCharSpan[]; rightSpans: ConflictCharSpan[] } {
  const a = oldStr.split('')
  const b = newStr.split('')
  const m = a.length
  const n = b.length

  const MAX = 500
  if (m > MAX || n > MAX || m * n > 100_000) {
    return {
      leftSpans: oldStr ? [{ text: oldStr, highlight: true }] : [],
      rightSpans: newStr ? [{ text: newStr, highlight: true }] : []
    }
  }

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const lcsLen = dp[m][n]
  const similarity = lcsLen / Math.max(m, n, 1)
  if (similarity < 0.4) {
    return {
      leftSpans: oldStr ? [{ text: oldStr, highlight: true }] : [],
      rightSpans: newStr ? [{ text: newStr, highlight: true }] : []
    }
  }

  const leftInLcs = new Uint8Array(m)
  const rightInLcs = new Uint8Array(n)
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      leftInLcs[i - 1] = 1
      rightInLcs[j - 1] = 1
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  const buildSpans = (chars: string[], inLcs: Uint8Array): ConflictCharSpan[] => {
    const spans: ConflictCharSpan[] = []
    let cur = ''
    let curHighlight = false
    for (let k = 0; k < chars.length; k++) {
      const h = inLcs[k] === 0
      if (k === 0) {
        cur = chars[k]
        curHighlight = h
      } else if (h === curHighlight) {
        cur += chars[k]
      } else {
        spans.push({ text: cur, highlight: curHighlight })
        cur = chars[k]
        curHighlight = h
      }
    }
    if (cur.length > 0) spans.push({ text: cur, highlight: curHighlight })
    return spans
  }

  return {
    leftSpans: buildSpans(a, leftInLcs),
    rightSpans: buildSpans(b, rightInLcs)
  }
}

/**
 * Aligns current (left) and incoming (right) excerpts into paired side-by-side raw diff rows,
 * preserving original 1-based file line numbers and computing inline character highlights.
 */
export function buildConflictDiffRows(
  currentContent: string,
  incomingContent: string,
  currentStartLine = 1,
  incomingStartLine = 1
): ConflictDiffRow[] {
  if (!currentContent && !incomingContent) return []

  const items = computeDiff(currentContent, incomingContent)
  const rows: ConflictDiffRow[] = []
  const leftOffset = currentStartLine - 1
  const rightOffset = incomingStartLine - 1

  let idx = 0
  while (idx < items.length) {
    const item = items[idx]
    if (item.type === 'normal') {
      rows.push({
        rowType: 'normal',
        leftText: item.beforeLine ?? '',
        rightText: item.afterLine ?? '',
        leftLineNumber: item.beforeNum !== undefined ? item.beforeNum + leftOffset : undefined,
        rightLineNumber: item.afterNum !== undefined ? item.afterNum + rightOffset : undefined
      })
      idx++
      continue
    }

    const deletes: typeof items = []
    const adds: typeof items = []
    while (idx < items.length && items[idx].type === 'delete') {
      deletes.push(items[idx])
      idx++
    }
    while (idx < items.length && items[idx].type === 'add') {
      adds.push(items[idx])
      idx++
    }

    const pairCount = Math.min(deletes.length, adds.length)
    for (let k = 0; k < pairCount; k++) {
      const del = deletes[k]
      const add = adds[k]
      const leftText = del.beforeLine ?? ''
      const rightText = add.afterLine ?? ''
      const { leftSpans, rightSpans } = computeConflictInlineDiff(leftText, rightText)
      rows.push({
        rowType: 'change',
        leftText,
        rightText,
        leftLineNumber: del.beforeNum !== undefined ? del.beforeNum + leftOffset : undefined,
        rightLineNumber: add.afterNum !== undefined ? add.afterNum + rightOffset : undefined,
        leftSpans,
        rightSpans
      })
    }

    for (let k = pairCount; k < deletes.length; k++) {
      const del = deletes[k]
      rows.push({
        rowType: 'delete',
        leftText: del.beforeLine ?? '',
        leftLineNumber: del.beforeNum !== undefined ? del.beforeNum + leftOffset : undefined
      })
    }

    for (let k = pairCount; k < adds.length; k++) {
      const add = adds[k]
      rows.push({
        rowType: 'add',
        rightText: add.afterLine ?? '',
        rightLineNumber: add.afterNum !== undefined ? add.afterNum + rightOffset : undefined
      })
    }
  }

  return rows
}
