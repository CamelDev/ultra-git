import type { DiffItem } from '../../utils/patchBuilder'

export interface CharSpan {
  text: string
  highlight: boolean
}

export interface RenderRow {
  rowIdx?: number
  rowType: 'normal' | 'change' | 'delete' | 'add'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
  oldSpans?: CharSpan[]
  newSpans?: CharSpan[]
  diffIndices: number[]
}

/**
 * Character-level LCS diff between two strings.
 * Returns arrays of spans with `highlight: true` for changed chars.
 */
export function computeInlineDiff(
  oldStr: string,
  newStr: string
): { oldSpans: CharSpan[]; newSpans: CharSpan[] } {
  const a = oldStr.split('')
  const b = newStr.split('')
  const m = a.length
  const n = b.length

  const MAX = 500
  if (m > MAX || n > MAX || m * n > 100_000) {
    return {
      oldSpans: [{ text: oldStr, highlight: true }],
      newSpans: [{ text: newStr, highlight: true }]
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
      oldSpans: [{ text: oldStr, highlight: true }],
      newSpans: [{ text: newStr, highlight: true }]
    }
  }

  const oldInLcs = new Uint8Array(m)
  const newInLcs = new Uint8Array(n)
  let i = m,
    j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      oldInLcs[i - 1] = 1
      newInLcs[j - 1] = 1
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  const buildSpans = (chars: string[], inLcs: Uint8Array): CharSpan[] => {
    const spans: CharSpan[] = []
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
    oldSpans: buildSpans(a, oldInLcs),
    newSpans: buildSpans(b, newInLcs)
  }
}

export function buildRenderRows(diffItems: DiffItem[]): RenderRow[] {
  const rows: RenderRow[] = []
  let i = 0

  while (i < diffItems.length) {
    const item = diffItems[i]

    if (item.type === 'normal') {
      rows.push({
        rowType: 'normal',
        beforeLine: item.beforeLine,
        afterLine: item.afterLine,
        beforeNum: item.beforeNum,
        afterNum: item.afterNum,
        diffIndices: item.diffIndex !== undefined ? [item.diffIndex] : []
      })
      i++
      continue
    }

    if (item.type === 'delete') {
      const deletes: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'delete') {
        deletes.push(diffItems[i++])
      }
      const adds: DiffItem[] = []
      while (i < diffItems.length && diffItems[i].type === 'add') {
        adds.push(diffItems[i++])
      }

      const maxLen = Math.max(deletes.length, adds.length)
      for (let k = 0; k < maxLen; k++) {
        const del = deletes[k]
        const add = adds[k]
        if (del && add) {
          const { oldSpans, newSpans } = computeInlineDiff(
            del.beforeLine ?? '',
            add.afterLine ?? ''
          )
          const indices: number[] = []
          if (del.diffIndex !== undefined) indices.push(del.diffIndex)
          if (add.diffIndex !== undefined) indices.push(add.diffIndex)
          rows.push({
            rowType: 'change',
            beforeLine: del.beforeLine,
            afterLine: add.afterLine,
            beforeNum: del.beforeNum,
            afterNum: add.afterNum,
            oldSpans,
            newSpans,
            diffIndices: indices
          })
        } else if (del) {
          rows.push({
            rowType: 'delete',
            beforeLine: del.beforeLine,
            beforeNum: del.beforeNum,
            diffIndices: del.diffIndex !== undefined ? [del.diffIndex] : []
          })
        } else if (add) {
          rows.push({
            rowType: 'add',
            afterLine: add.afterLine,
            afterNum: add.afterNum,
            diffIndices: add.diffIndex !== undefined ? [add.diffIndex] : []
          })
        }
      }
      continue
    }

    if (item.type === 'add') {
      rows.push({
        rowType: 'add',
        afterLine: item.afterLine,
        afterNum: item.afterNum,
        diffIndices: item.diffIndex !== undefined ? [item.diffIndex] : []
      })
      i++
    }
  }

  rows.forEach((r, idx) => {
    r.rowIdx = idx
  })

  return rows
}
