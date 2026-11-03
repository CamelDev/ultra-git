import React, { useMemo } from 'react'
import type { LineRange } from '../../../../shared/conflicts'
import { resolveCodeLanguage, tokenizeCode } from '../details/codeView'

interface Props {
  content: string
  path: string
  startLine?: number
  highlight?: LineRange
  testId?: string
  emptyLabel?: string
}

export const ConflictCode: React.FC<Props> = ({ content, path, startLine = 1, highlight, testId, emptyLabel = 'No content on this side' }) => {
  const lines = useMemo(() => tokenizeCode(content.replace(/\r\n?/g, '\n'), resolveCodeLanguage(path)), [content, path])
  return <pre className="conflict-code" data-testid={testId} tabIndex={0}>
    {content ? lines.map((line, index) => <span className={`conflict-code-line${highlight && startLine + index > highlight.start && startLine + index <= highlight.end ? ' changed' : ''}`} key={index}>
      <span className="conflict-line-number" aria-hidden="true">{startLine + index}</span><code>{line.tokens.map((token, i) => <span className={`diff-token token-${token.type}`} key={i}>{line.text.slice(token.start, token.end)}</span>)}{line.text ? '' : '\n'}</code>
    </span>) : <span className="conflict-code-empty">{emptyLabel}</span>}
  </pre>
}
