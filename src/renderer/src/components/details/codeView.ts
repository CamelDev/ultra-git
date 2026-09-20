export type CodeLanguage =
  | 'java' | 'csharp' | 'javascript' | 'typescript' | 'python' | 'go' | 'rust'
  | 'cpp' | 'html' | 'css' | 'json' | 'yaml' | 'markdown' | 'bash' | 'sql'
  | 'xml' | 'text'

export interface CodeToken {
  start: number
  end: number
  type: 'comment' | 'string' | 'keyword' | 'number' | 'property' | 'plain'
}

export interface CodeLine {
  text: string
  tokens: CodeToken[]
}

// MDX intentionally uses the Markdown grammar and C headers use the C++ grammar. Unknown names
// stay text; the viewer never guesses a language from source content.
const extensionLanguages: Array<[RegExp, CodeLanguage]> = [
  [/\.(?:tsx)$/i, 'typescript'], [ /\.(?:mts|cts|ts)$/i, 'typescript'],
  [/\.(?:mjs|cjs|jsx|js)$/i, 'javascript'], [/\.(?:java)$/i, 'java'],
  [/\.(?:cs)$/i, 'csharp'], [/\.(?:pyw|py)$/i, 'python'], [/\.(?:go)$/i, 'go'],
  [/\.(?:rs)$/i, 'rust'], [/\.(?:cxx|cpp|cc|c|hxx|hpp|hh|h)$/i, 'cpp'],
  [/\.(?:html|htm)$/i, 'html'], [/\.(?:css)$/i, 'css'], [/\.(?:json)$/i, 'json'],
  [/\.(?:yaml|yml)$/i, 'yaml'], [/\.(?:markdown|mdown|mkdn|mdx|md)$/i, 'markdown'],
  [/\.(?:bash|zsh|sh)$/i, 'bash'], [/\.(?:sql)$/i, 'sql'], [/\.(?:svg|xml)$/i, 'xml']
]

const KEYWORDS: Record<CodeLanguage, Set<string>> = {
  java: new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while'.split(' ')),
  csharp: new Set('abstract as base bool break byte case catch char class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while'.split(' ')),
  javascript: new Set('as async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof undefined var void while with yield'.split(' ')),
  typescript: new Set('abstract any as asserts async await bigint boolean break case catch class const continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number of private protected public readonly return set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield'.split(' ')),
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield'.split(' ')),
  go: new Set('break default func interface select case defer go map struct chan else goto package switch const fallthrough if range type continue for import return var'.split(' ')),
  rust: new Set('as async await break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while'.split(' ')),
  cpp: new Set('alignas alignof and and_eq asm auto bitand bitor bool break case catch char char8_t char16_t char32_t class compl concept const consteval constexpr constinit const_cast continue co_await co_return co_yield decltype default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long mutable namespace new noexcept not not_eq nullptr operator or or_eq private protected public register reinterpret_cast requires return short signed sizeof static static_assert static_cast struct switch template this thread_local throw true try typedef typeid typename union unsigned using virtual void volatile wchar_t while xor xor_eq'.split(' ')),
  html: new Set(), css: new Set(), json: new Set(), yaml: new Set(), markdown: new Set(), bash: new Set('case do done elif else esac fi for function if in select then until while'.split(' ')), sql: new Set('select from where join inner left right full outer on as insert into update delete create alter drop table view index primary key foreign references values set distinct group by order having limit offset union all null is not and or exists between like asc desc'.split(' ')), xml: new Set(), text: new Set()
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

/**
 * Tokenizes the complete source before splitting lines so multi-line strings and comments retain
 * their type in collapsed-context rows. The cache is deliberately small and refuses very large
 * files/lines; in those cases callers still receive plain source and Code view markers.
 */
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

function scan(source: string, language: CodeLanguage): CodeToken[] {
  const tokens: CodeToken[] = []
  let cursor = 0
  let state: 'block-comment' | null = null
  const hashComments = language === 'python' || language === 'bash' || language === 'yaml' || language === 'markdown'
  const markup = language === 'html' || language === 'xml'

  const add = (start: number, end: number, type: CodeToken['type']) => tokens.push({ start, end, type })
  while (cursor < source.length) {
    const start = cursor
    if (state === 'block-comment') {
      const end = source.indexOf('*/', cursor)
      cursor = end === -1 ? source.length : end + 2
      add(start, cursor, 'comment')
      state = end === -1 ? 'block-comment' : null
      continue
    }
    if (source[cursor] === '"' || source[cursor] === "'" || (language === 'javascript' || language === 'typescript') && source[cursor] === '`') {
      const quote = source[cursor++]
      while (cursor < source.length) {
        if (source[cursor] === '\\') { cursor += 2; continue }
        if (source[cursor] === quote) { cursor++; break }
        cursor++
      }
      add(start, cursor, 'string')
      continue
    }
    if (source.startsWith('/*', cursor)) { cursor += 2; state = 'block-comment'; continue }
    if (source.startsWith('//', cursor) || (hashComments && source[cursor] === '#') || (markup && source.startsWith('<!--', cursor))) {
      const close = markup && source.startsWith('<!--', cursor) ? source.indexOf('-->', cursor + 4) : source.indexOf('\n', cursor)
      cursor = close === -1 ? source.length : close + (markup && source.startsWith('<!--', start) ? 3 : 0)
      add(start, cursor, 'comment'); continue
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(source.slice(cursor))?.[0]
    if (word) {
      cursor += word.length
      if (KEYWORDS[language].has(word) || (language === 'sql' && KEYWORDS.sql.has(word.toLowerCase()))) add(start, cursor, 'keyword')
      else if (markup && /^(?:[A-Za-z][\w:-]*)$/.test(word)) add(start, cursor, 'property')
      continue
    }
    const number = /^(?:\d+(?:\.\d+)?)/.exec(source.slice(cursor))?.[0]
    if (number) { cursor += number.length; add(start, cursor, 'number'); continue }
    cursor++
  }
  return tokens
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

