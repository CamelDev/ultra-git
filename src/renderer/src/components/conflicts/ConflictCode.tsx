import React, { useMemo } from 'react'
import { Check, Plus } from 'lucide-react'
import type { LineRange } from '../../../../shared/conflicts'
import { resolveCodeLanguage, tokenizeCode } from '../details/codeView'
import type { ConflictCharSpan, ConflictDiffRow } from './conflictDiff'

interface LinePickProps {
  pickSide?: 'current' | 'incoming'
  pickableRange?: LineRange
  pickedLines?: ReadonlySet<number>
  pickDisabled?: boolean
  onToggleLine?: (regionLineIndex: number) => void
}

interface Props extends LinePickProps {
  content: string
  path: string
  startLine?: number
  highlight?: LineRange
  testId?: string
  emptyLabel?: string
  scrollRef?: React.Ref<HTMLPreElement>
  onScroll?: React.UIEventHandler<HTMLPreElement>
}

export const ConflictCode: React.FC<Props> = ({
  content,
  path,
  startLine = 1,
  highlight,
  testId,
  emptyLabel = 'No content on this side',
  scrollRef,
  onScroll,
  pickSide,
  pickableRange,
  pickedLines,
  pickDisabled,
  onToggleLine
}) => {
  const lines = useMemo(() => tokenizeCode(content.replace(/\r\n?/g, '\n'), resolveCodeLanguage(path)), [content, path])
  const showPickColumn = Boolean(onToggleLine && pickableRange && pickSide)
  return <pre ref={scrollRef} onScroll={onScroll} className={`conflict-code${showPickColumn ? ' has-line-picks' : ''}`} data-testid={testId} data-view-mode="code" tabIndex={0}>
    {content ? lines.map((line, index) => {
      const fileLine = startLine + index
      const inHighlight = Boolean(highlight && fileLine > highlight.start && fileLine <= highlight.end)
      const inPickRange = Boolean(showPickColumn && pickableRange && fileLine > pickableRange.start && fileLine <= pickableRange.end)
      const regionLineIndex = pickableRange ? fileLine - 1 - pickableRange.start : -1
      const isPicked = inPickRange && Boolean(pickedLines?.has(regionLineIndex))
      return <span className={`conflict-code-line${inHighlight ? ' changed' : ''}${isPicked ? ' picked' : ''}`} key={index}>
        <span className="conflict-line-number" aria-hidden="true">{fileLine}</span>
        {showPickColumn && (inPickRange ? <button
          type="button"
          className={`conflict-line-pick${isPicked ? ' picked' : ''}`}
          disabled={pickDisabled}
          aria-pressed={isPicked}
          aria-label={`${isPicked ? 'Remove' : 'Pick'} ${pickSide} line ${fileLine}`}
          title={isPicked ? 'Remove line from result' : 'Pick line into result'}
          data-testid={`conflict-pick-${pickSide}-${regionLineIndex}`}
          onClick={() => onToggleLine?.(regionLineIndex)}
        >{isPicked ? <Check size={11} /> : <Plus size={11} />}</button> : <span className="conflict-line-pick-spacer" aria-hidden="true" />)}
        <code>{line.tokens.map((token, i) => <span className={`diff-token token-${token.type}`} key={i}>{line.text.slice(token.start, token.end)}</span>)}{line.text ? '' : '\n'}</code>
      </span>
    }) : <span className="conflict-code-empty">{emptyLabel}</span>}
  </pre>
}

interface RawDiffPaneProps extends LinePickProps {
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

export const ConflictRawDiffPane: React.FC<RawDiffPaneProps> = ({
  rows,
  side,
  testId,
  emptyLabel = 'No content on this side',
  scrollRef,
  onScroll,
  pickSide,
  pickableRange,
  pickedLines,
  pickDisabled,
  onToggleLine
}) => {
  const isLeft = side === 'left'
  const hasContent = rows.some(row => isLeft ? row.leftText !== undefined : row.rightText !== undefined)
  const showPickColumn = Boolean(onToggleLine && pickableRange && pickSide)

  return <pre ref={scrollRef} onScroll={onScroll} className={`conflict-code conflict-raw-diff${showPickColumn ? ' has-line-picks' : ''}`} data-testid={testId} data-view-mode="raw-diff" tabIndex={0}>
    {hasContent ? rows.map((row, index) => {
      const text = isLeft ? row.leftText : row.rightText
      const lineNum = isLeft ? row.leftLineNumber : row.rightLineNumber
      const isEmpty = text === undefined
      const isChanged = !isEmpty && (row.rowType === 'change' || (isLeft ? row.rowType === 'delete' : row.rowType === 'add'))
      const kind: 'delete' | 'add' = isLeft ? 'delete' : 'add'
      const inPickRange = Boolean(!isEmpty && showPickColumn && pickableRange && lineNum !== undefined && lineNum > pickableRange.start && lineNum <= pickableRange.end)
      const regionLineIndex = pickableRange && lineNum !== undefined ? lineNum - 1 - pickableRange.start : -1
      const isPicked = inPickRange && Boolean(pickedLines?.has(regionLineIndex))
      const lineClass = isEmpty
        ? 'conflict-code-line diff-empty-row'
        : isChanged
          ? `conflict-code-line diff-${kind}${isPicked ? ' picked' : ''}`
          : `conflict-code-line${isPicked ? ' picked' : ''}`
      const marker = isChanged ? (isLeft ? '-' : '+') : ''
      const spans = row.rowType === 'change' ? (isLeft ? row.leftSpans : row.rightSpans) : undefined

      return <span className={lineClass} key={index}>
        <span className="conflict-line-number" aria-hidden="true">{lineNum ?? ''}</span>
        {showPickColumn && (inPickRange ? <button
          type="button"
          className={`conflict-line-pick${isPicked ? ' picked' : ''}`}
          disabled={pickDisabled}
          aria-pressed={isPicked}
          aria-label={`${isPicked ? 'Remove' : 'Pick'} ${pickSide} line ${lineNum}`}
          title={isPicked ? 'Remove line from result' : 'Pick line into result'}
          data-testid={`conflict-pick-${pickSide}-${regionLineIndex}`}
          onClick={() => onToggleLine?.(regionLineIndex)}
        >{isPicked ? <Check size={11} /> : <Plus size={11} />}</button> : <span className="conflict-line-pick-spacer" aria-hidden="true" />)}
        <span className="conflict-diff-marker" aria-hidden="true">{marker}</span>
        <code>{isEmpty ? '\n' : renderDiffSpans(text, spans, kind)}</code>
      </span>
    }) : <span className="conflict-code-empty">{emptyLabel}</span>}
  </pre>
}
