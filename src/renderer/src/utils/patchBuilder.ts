export interface DiffItem {
  type: 'normal' | 'add' | 'delete'
  beforeLine?: string
  afterLine?: string
  beforeNum?: number
  afterNum?: number
}

export interface DiffLine {
  type: 'normal' | 'add' | 'delete'
  content: string
  beforeNum?: number
  afterNum?: number
  indexInDiff: number // Index in the parent diffItems array
  indexInHunk: number // Index relative to the hunk
}

export interface DiffHunk {
  hunkIndex: number
  header: string
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

/**
 * Group DiffItems into logical DiffHunks separated by unchanged context lines.
 * By default, context padding is 3 lines before/after each change block.
 */
export function buildHunksFromDiffItems(diffItems: DiffItem[], contextPadding = 3): DiffHunk[] {
  if (!diffItems || diffItems.length === 0) return []

  // Find all indices of changed items (add or delete)
  const changeIndices: number[] = []
  diffItems.forEach((item, idx) => {
    if (item.type === 'add' || item.type === 'delete') {
      changeIndices.push(idx)
    }
  })

  if (changeIndices.length === 0) return []

  // Group change indices that are within (2 * contextPadding + 1) of each other
  const hunkRanges: { startIdx: number; endIdx: number }[] = []
  let currentStart = changeIndices[0]
  let currentEnd = changeIndices[0]

  for (let i = 1; i < changeIndices.length; i++) {
    const idx = changeIndices[i]
    if (idx - currentEnd <= 2 * contextPadding + 1) {
      currentEnd = idx
    } else {
      hunkRanges.push({ startIdx: currentStart, endIdx: currentEnd })
      currentStart = idx
      currentEnd = idx
    }
  }
  hunkRanges.push({ startIdx: currentStart, endIdx: currentEnd })

  // Construct DiffHunk for each range
  const hunks: DiffHunk[] = []

  hunkRanges.forEach((range, hunkIdx) => {
    const startIdxWithPadding = Math.max(0, range.startIdx - contextPadding)
    const endIdxWithPadding = Math.min(diffItems.length - 1, range.endIdx + contextPadding)

    const hunkItems = diffItems.slice(startIdxWithPadding, endIdxWithPadding + 1)

    // Calculate oldStart, newStart, oldCount, newCount
    let oldStart = 0
    let newStart = 0
    let oldCount = 0
    let newCount = 0

    // Find first line with beforeNum / afterNum
    for (const item of hunkItems) {
      if (oldStart === 0 && item.beforeNum !== undefined) {
        oldStart = item.beforeNum
      }
      if (newStart === 0 && item.afterNum !== undefined) {
        newStart = item.afterNum
      }
      if (item.type === 'normal') {
        oldCount++
        newCount++
      } else if (item.type === 'delete') {
        oldCount++
      } else if (item.type === 'add') {
        newCount++
      }
    }

    if (oldStart === 0) oldStart = 1
    if (newStart === 0) newStart = 1

    const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`

    const lines: DiffLine[] = hunkItems.map((item, relIdx) => {
      const globalIdx = startIdxWithPadding + relIdx
      const content = item.type === 'delete' ? (item.beforeLine ?? '') : (item.afterLine ?? item.beforeLine ?? '')
      return {
        type: item.type,
        content,
        beforeNum: item.beforeNum,
        afterNum: item.afterNum,
        indexInDiff: globalIdx,
        indexInHunk: relIdx
      }
    })

    hunks.push({
      hunkIndex: hunkIdx,
      header,
      oldStart,
      oldCount,
      newStart,
      newCount,
      lines
    })
  })

  return hunks
}

/**
 * Builds a unified diff patch string for an entire hunk.
 */
export function buildHunkPatch(
  filePath: string,
  hunk: DiffHunk,
  _mode: 'stage' | 'unstage' | 'discard' = 'stage'
): string {
  const headerLines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`
  ]

  const lineStrings = hunk.lines.map((line) => {
    if (line.type === 'normal') return ` ${line.content}`
    if (line.type === 'delete') return `-${line.content}`
    return `+${line.content}`
  })

  return [...headerLines, ...lineStrings, ''].join('\n')
}

/**
 * Builds a unified diff patch string for selected lines within a hunk.
 * `selectedLineIndices` contains `indexInDiff` values.
 */
export function buildSelectedLinesPatch(
  filePath: string,
  hunk: DiffHunk,
  selectedLineIndices: Set<number>,
  _mode: 'stage' | 'unstage' | 'discard' = 'stage'
): string {
  let patchOldCount = 0
  let patchNewCount = 0
  const patchLines: string[] = []

  hunk.lines.forEach((line) => {
    const isSelected = selectedLineIndices.has(line.indexInDiff)

    if (line.type === 'normal') {
      patchLines.push(` ${line.content}`)
      patchOldCount++
      patchNewCount++
    } else if (line.type === 'add') {
      if (isSelected) {
        patchLines.push(`+${line.content}`)
        patchNewCount++
      } else {
        // Unselected addition is omitted from patch
      }
    } else if (line.type === 'delete') {
      if (isSelected) {
        patchLines.push(`-${line.content}`)
        patchOldCount++
      } else {
        // Unselected deletion is converted to context line
        patchLines.push(` ${line.content}`)
        patchOldCount++
        patchNewCount++
      }
    }
  })

  const headerLines = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${hunk.oldStart},${patchOldCount} +${hunk.newStart},${patchNewCount} @@`
  ]

  return [...headerLines, ...patchLines, ''].join('\n')
}
