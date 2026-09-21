import Prism from './prismSetup'

export type CodeLanguage =
  | 'java' | 'csharp' | 'javascript' | 'typescript' | 'python' | 'go' | 'rust'
  | 'cpp' | 'html' | 'css' | 'json' | 'yaml' | 'markdown' | 'bash' | 'sql'
  | 'xml' | 'text'

export type CodeTokenType =
  | 'comment'
  | 'string'
  | 'keyword'
  | 'number'
  | 'property'
  | 'function'
  | 'punctuation'
  | 'operator'
  | 'selector'
  | 'variable'
  | 'plain'

export interface CodeToken {
  start: number
  end: number
  type: CodeTokenType
}

export interface CodeLine {
  text: string
  tokens: CodeToken[]
}

export interface LanguageOption {
  id: CodeLanguage
  label: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { id: 'css', label: 'CSS' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'xml', label: 'XML' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'java', label: 'Java' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'sql', label: 'SQL' },
  { id: 'text', label: 'Plain Text' }
]

const extensionLanguages: Array<[RegExp, CodeLanguage]> = [
  [/\.(?:tsx)$/i, 'typescript'], [ /\.(?:mts|cts|ts)$/i, 'typescript'],
  [/\.(?:mjs|cjs|jsx|js)$/i, 'javascript'], [/\.(?:java)$/i, 'java'],
  [/\.(?:cs)$/i, 'csharp'], [/\.(?:pyw|py)$/i, 'python'], [/\.(?:go)$/i, 'go'],
  [/\.(?:rs)$/i, 'rust'], [/\.(?:cxx|cpp|cc|c|hxx|hpp|hh|h)$/i, 'cpp'],
  [/\.(?:html|htm)$/i, 'html'], [/\.(?:css)$/i, 'css'], [/\.(?:json)$/i, 'json'],
  [/\.(?:yaml|yml)$/i, 'yaml'], [/\.(?:markdown|mdown|mkdn|mdx|md)$/i, 'markdown'],
  [/\.(?:bash|zsh|sh)$/i, 'bash'], [/\.(?:sql)$/i, 'sql'], [/\.(?:svg|xml)$/i, 'xml']
]

const languageToPrism: Record<CodeLanguage, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  csharp: 'csharp',
  java: 'java',
  cpp: 'cpp',
  go: 'go',
  rust: 'rust',
  html: 'markup',
  xml: 'markup',
  css: 'css',
  json: 'json',
  yaml: 'yaml',
  markdown: 'markdown',
  bash: 'bash',
  sql: 'sql',
  text: 'plain'
}

const MAX_CACHE_ENTRIES = 48
const MAX_SOURCE_BYTES = 2 * 1024 * 1024
const MAX_LINES = 25_000
const MAX_LINE_LENGTH = 20_000
const cache = new Map<string, CodeLine[]>()

export function resolveCodeLanguage(path?: string): CodeLanguage {
  if (!path) return 'text'
  return extensionLanguages.find(([pattern]) => pattern.test(path))?.[1] ?? 'text'
}

export function resolveRenameLanguages(oldPath?: string, newPath?: string): { before: CodeLanguage; after: CodeLanguage } {
  return { before: resolveCodeLanguage(oldPath), after: resolveCodeLanguage(newPath) }
}

export function isRasterImage(path?: string): boolean {
  return !!path && /\.(?:png|jpe?g|bmp|gif|webp|ico|avif)$/i.test(path)
}

export function isSvg(path?: string): boolean {
  return !!path && /\.svg$/i.test(path)
}

export function tokenizeCode(source: string, language: CodeLanguage): CodeLine[] {
  const cacheKey = `${language}\u0000${source}`
  const existing = cache.get(cacheKey)
  if (existing) return existing

  const lines = source.split('\n')
  if (source.length > MAX_SOURCE_BYTES || lines.length > MAX_LINES || lines.some((line) => line.length > MAX_LINE_LENGTH)) {
    return lines.map((text) => ({ text, tokens: [{ start: 0, end: text.length, type: 'plain' }] }))
  }

  const tokens = scan(source, language)
  const byLine: CodeLine[] = []
  let lineStart = 0
  let tokenIdx = 0
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index]
    const lineEnd = lineStart + text.length
    while (tokenIdx < tokens.length && tokens[tokenIdx].end <= lineStart) {
      tokenIdx++
    }
    const lineTokens: CodeToken[] = []
    let cur = tokenIdx
    while (cur < tokens.length && tokens[cur].start < lineEnd) {
      const token = tokens[cur]
      if (token.end > lineStart) {
        lineTokens.push({
          start: Math.max(token.start, lineStart) - lineStart,
          end: Math.min(token.end, lineEnd) - lineStart,
          type: token.type
        })
      }
      cur++
    }
    byLine.push({ text, tokens: fillPlainTokens(text.length, lineTokens) })
    lineStart = lineEnd + (index < lines.length - 1 ? 1 : 0)
  }

  cache.set(cacheKey, byLine)
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!)
  return byLine
}

function mapPrismType(type: string): CodeTokenType {
  switch (type) {
    case 'comment':
    case 'prolog':
    case 'doctype':
    case 'cdata':
      return 'comment'
    case 'string':
    case 'char':
    case 'attr-value':
    case 'regex':
    case 'url':
      return 'string'
    case 'keyword':
    case 'atrule':
    case 'rule':
    case 'important':
      return 'keyword'
    case 'number':
    case 'hexcode':
    case 'unit':
    case 'boolean':
    case 'constant':
      return 'number'
    case 'property':
    case 'attr-name':
    case 'tag':
      return 'property'
    case 'function':
      return 'function'
    case 'selector':
    case 'class-name':
      return 'selector'
    case 'variable':
      return 'variable'
    case 'operator':
    case 'entity':
      return 'operator'
    case 'punctuation':
      return 'punctuation'
    default:
      return 'plain'
  }
}

function walkTokens(
  items: Array<string | Prism.Token>,
  offset: number,
  tokens: CodeToken[],
  inheritedType?: CodeTokenType
): number {
  let current = offset
  for (const item of items) {
    if (typeof item === 'string') {
      const len = item.length
      if (inheritedType && inheritedType !== 'plain') {
        tokens.push({ start: current, end: current + len, type: inheritedType })
      }
      current += len
    } else {
      const mapped = mapPrismType(item.type)
      const effectiveType = mapped === 'plain' && inheritedType ? inheritedType : mapped
      if (Array.isArray(item.content)) {
        current = walkTokens(item.content, current, tokens, effectiveType)
      } else {
        const len = item.length
        if (effectiveType !== 'plain') {
          tokens.push({ start: current, end: current + len, type: effectiveType })
        }
        current += len
      }
    }
  }
  return current
}

function scan(source: string, language: CodeLanguage): CodeToken[] {
  if (language === 'text') return []
  const prismLang = languageToPrism[language]
  const grammar = prismLang ? Prism.languages[prismLang] : undefined
  if (!grammar) return []

  try {
    const rawTokens = Prism.tokenize(source, grammar)
    const tokens: CodeToken[] = []
    walkTokens(rawTokens, 0, tokens)
    return tokens
  } catch {
    return []
  }
}

function fillPlainTokens(length: number, tokens: CodeToken[]): CodeToken[] {
  if (!length) return []
  const sorted = tokens.filter((token) => token.end > token.start).sort((a, b) => a.start - b.start)
  const result: CodeToken[] = []
  let cursor = 0
  for (const token of sorted) {
    if (token.start > cursor) result.push({ start: cursor, end: token.start, type: 'plain' })
    result.push(token)
    cursor = Math.max(cursor, token.end)
  }
  if (cursor < length) result.push({ start: cursor, end: length, type: 'plain' })
  return result
}

export const CODE_VIEW_PREFERENCE_KEY = 'ultragit.code-view-enabled'

export function readCodeViewPreference(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    const value = storage?.getItem(CODE_VIEW_PREFERENCE_KEY)
    return value === null || value === 'true' ? true : value === 'false' ? false : true
  } catch { return true }
}

export function writeCodeViewPreference(enabled: boolean, storage: Pick<Storage, 'setItem'> | undefined): void {
  try { storage?.setItem(CODE_VIEW_PREFERENCE_KEY, String(enabled)) } catch { /* preference is optional */ }
}

export type HunkChangeType = 'add' | 'delete' | 'mixed' | 'none'

export function resolveHunkChangeType(
  hunkLines: Array<{ type?: string }>,
  renderRows?: Array<{ rowType?: string }>
): HunkChangeType {
  const hasAdd =
    hunkLines.some((l) => l.type === 'add') ||
    (renderRows ? renderRows.some((r) => r.rowType === 'add' || r.rowType === 'change') : false)
  const hasDelete =
    hunkLines.some((l) => l.type === 'delete') ||
    (renderRows ? renderRows.some((r) => r.rowType === 'delete' || r.rowType === 'change') : false)
  return hasAdd && hasDelete ? 'mixed' : hasAdd ? 'add' : hasDelete ? 'delete' : 'none'
}
