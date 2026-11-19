import React, { useMemo } from 'react'
import type { LineRange } from '../../../../shared/conflicts'
import { resolveCodeLanguage, tokenizeCode } from '../details/codeView'
import type { ConflictCharSpan, ConflictDiffRow } from './conflictDiff'

interface Props {
  content: string
  path: string
  startLine?: number
  highlight?: LineRange
  testId?: string
  emptyLabel?: string
  scrollRef?: React.Ref<HTMLPreElement>
  onScroll?: React.UIEventHandler<HTMLPreElement>
}

export const ConflictCode: React.FC<Props> = ({ content, path, startLine = 1, highlight, testId, emptyLabel = 'No content on this side', scrollRef, onScroll }) => {
  const lines = useMemo(() => tokenizeCode(content.replace(/\r\n?/g, '\n'), resolveCodeLanguage(path)), [content, path])
  return <pre ref={scrollRef} onScroll={onScroll} className="conflict-code" data-testid={testId} data-view-mode="code" tabIndex={0}>
    {content ? lines.map((line, index) => <span className={`conflict-code-line${highlight && startLine + index > highlight.start && startLine + index <= highlight.end ? ' changed' : ''}`} key={index}>
      <span className="conflict-line-number" aria-hidden="true">{startLine + index}</span><code>{line.tokens.map((token, i) => <span className={`diff-token token-${token.type}`} key={i}>{line.text.slice(token.start, token.end)}</span>)}{line.text ? '' : '\n'}</code>
    </span>) : <span className="conflict-code-empty">{emptyLabel}</span>}
  </pre>
}

interface RawDiffPaneProps {
  rows: ConflictDiffRow[]
  side: 'left' | 'right'
  testId?: string
  emptyLabel?: string
  scrollRef?: React.Ref<HTMLPreElement>
  onScroll?: React.UIEventHandler<HTMLPreElement>
}

function renderDiffSpans(text: string, spans: ConflictCharSpan[] | undefined, kind: 'delete' | 'add') {
  if (!spans || spans.length === 0) return text || '\n'
  return spans.map((span, idx) =>
    span.highlight
      ? <mark key={idx} className={`diff-inline-highlight type-${kind}`}>{span.text}</mark>
      : <React.Fragment key={idx}>{span.text}</React.Fragment>
  )
}

export const ConflictRawDiffPane: React.FC<RawDiffPaneProps> = ({ rows, side, testId, emptyLabel = 'No content on this side', scrollRef, onScroll }) => {
  const isLeft = side === 'left'
  const hasContent = rows.some(row => isLeft ? row.leftText !== undefined : row.rightText !== undefined)

  return <pre ref={scrollRef} onScroll={onScroll} className="conflict-code conflict-raw-diff" data-testid={testId} data-view-mode="raw-diff" tabIndex={0}>
    {hasContent ? rows.map((row, index) => {
      const text = isLeft ? row.leftText : row.rightText
      const lineNum = isLeft ? row.leftLineNumber : row.rightLineNumber
      const isEmpty = text === undefined
      const isChanged = !isEmpty && (row.rowType === 'change' || (isLeft ? row.rowType === 'delete' : row.rowType === 'add'))
      const kind: 'delete' | 'add' = isLeft ? 'delete' : 'add'
      const lineClass = isEmpty
        ? 'conflict-code-line diff-empty-row'
        : isChanged
          ? `conflict-code-line diff-${kind}`
          : 'conflict-code-line'
      const marker = isChanged ? (isLeft ? '-' : '+') : ''
      const spans = row.rowType === 'change' ? (isLeft ? row.leftSpans : row.rightSpans) : undefined

      return <span className={lineClass} key={index}>
        <span className="conflict-line-number" aria-hidden="true">{lineNum ?? ''}</span>
        <span className="conflict-diff-marker" aria-hidden="true">{marker}</span>
        <code>{isEmpty ? '\n' : renderDiffSpans(text, spans, kind)}</code>
      </span>
    }) : <span className="conflict-code-empty">{emptyLabel}</span>}
  </pre>
}
