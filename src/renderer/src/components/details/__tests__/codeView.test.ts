import { describe, expect, test } from 'bun:test'
import {
  readCodeViewPreference,
  resolveCodeLanguage,
  resolveHunkChangeType,
  resolveRenameLanguages,
  SUPPORTED_LANGUAGES,
  tokenizeCode
} from '../codeView'

describe('code view language resolution', () => {
  test('supports required aliases case-insensitively and uses plain text for unknown files', () => {
    expect(resolveCodeLanguage('View.TSX')).toBe('typescript')
    expect(resolveCodeLanguage('script.pyw')).toBe('python')
    expect(resolveCodeLanguage('header.HPP')).toBe('cpp')
    expect(resolveCodeLanguage('readme.mdx')).toBe('markdown')
    expect(resolveCodeLanguage('unknown.asset')).toBe('text')
  })
  test('uses the old and new paths independently for renames', () => {
    expect(resolveRenameLanguages('old.java', 'new.ts')).toEqual({ before: 'java', after: 'typescript' })
  })
})

describe('complete-source tokenization', () => {
  test('produces structured presentation tokens for every supported grammar family', () => {
    const samples: Array<[Parameters<typeof tokenizeCode>[1], string]> = [
      ['java', 'class Example { int value = 1; }'], ['csharp', 'public class Example { }'],
      ['javascript', 'const value = 1'], ['typescript', 'interface Example { value: number }'],
      ['python', 'def example():\n  return 1'], ['go', 'func main() { return }'],
      ['rust', 'fn main() { return; }'], ['cpp', 'class Example { int value = 1; };'],
      ['html', '<section id="main">1</section>'], ['css', 'body { color: #123; }'],
      ['json', '{"value": 1}'], ['yaml', 'value: 1'], ['markdown', '# Heading 1'],
      ['bash', 'if true; then echo 1; fi'], ['sql', 'SELECT value FROM things'],
      ['xml', '<node value="1" />']
    ]
    for (const [language, source] of samples) {
      expect(tokenizeCode(source, language).flatMap((line) => line.tokens).some((token) => token.type !== 'plain')).toBe(true)
    }
  })

  test('preserves source text, tabs, unicode, empty lines, and multiline token state', () => {
    const lines = tokenizeCode('const café = "one\n\ttwo"\n\n// note', 'typescript')
    expect(lines.map((line) => line.text).join('\n')).toBe('const café = "one\n\ttwo"\n\n// note')
    expect(lines[0].tokens.some((token) => token.type === 'keyword')).toBe(true)
    expect(lines[1].tokens.some((token) => token.type === 'string')).toBe(true)
    expect(lines[2].text).toBe('')
    expect(lines[3].tokens.some((token) => token.type === 'comment')).toBe(true)
  })

  test('tokenizes large multi-thousand line files quickly without O(N^2) lag', () => {
    const largeSource = Array.from({ length: 3000 }, (_, i) => `const val_${i} = ${i}; // line ${i}`).join('\n')
    const start = performance.now()
    const lines = tokenizeCode(largeSource, 'typescript')
    const elapsed = performance.now() - start
    expect(lines.length).toBe(3000)
    expect(elapsed).toBeLessThan(250) // Should easily run in ~20-50ms
  })

  test('tokenizes CSS accurately with unified hex colors, properties, and selectors', () => {
    const cssSource = [
      '--code-view-empty-bg: #141720;',
      '--code-border-add: #10b981;',
      '.diff-transaction-btn:hover:not(:disabled) {',
      '  background-color: var(--hover);',
      '  opacity: 0.35;',
      '}'
    ].join('\n')

    const lines = tokenizeCode(cssSource, 'css')

    // Line 0: --code-view-empty-bg is property, #141720 is single number/color token
    const line0Prop = lines[0].tokens.find((t) => lines[0].text.slice(t.start, t.end) === '--code-view-empty-bg')
    expect(line0Prop?.type).toBe('property')
    const line0Hex = lines[0].tokens.find((t) => lines[0].text.slice(t.start, t.end) === '#141720')
    expect(line0Hex).toBeDefined()
    expect(line0Hex?.type).toBe('number')

    // Line 1: #10b981 is single token (not split into 10 and b981)
    const line1Hex = lines[1].tokens.find((t) => lines[1].text.slice(t.start, t.end) === '#10b981')
    expect(line1Hex).toBeDefined()
    expect(line1Hex?.type).toBe('number')
    expect(lines[1].tokens.some((t) => lines[1].text.slice(t.start, t.end) === '10')).toBe(false)
    expect(lines[1].tokens.some((t) => lines[1].text.slice(t.start, t.end) === 'b981')).toBe(false)

    // Line 2: selector
    const line2Sel = lines[2].tokens.find((t) => t.type === 'selector')
    expect(line2Sel).toBeDefined()

    // Line 3: background-color property, var function, --hover variable
    const line3Prop = lines[3].tokens.find((t) => lines[3].text.slice(t.start, t.end) === 'background-color')
    expect(line3Prop?.type).toBe('property')
    const line3Var = lines[3].tokens.find((t) => lines[3].text.slice(t.start, t.end) === 'var')
    expect(line3Var?.type).toBe('function')

    // Line 4: opacity property, 0.35 number
    const line4Prop = lines[4].tokens.find((t) => lines[4].text.slice(t.start, t.end) === 'opacity')
    expect(line4Prop?.type).toBe('property')
    const line4Num = lines[4].tokens.find((t) => lines[4].text.slice(t.start, t.end) === '0.35')
    expect(line4Num?.type).toBe('number')
  })

  test('exposes all supported languages for the dropdown selector', () => {
    expect(SUPPORTED_LANGUAGES.some((l) => l.id === 'css' && l.label === 'CSS')).toBe(true)
    expect(SUPPORTED_LANGUAGES.some((l) => l.id === 'typescript' && l.label === 'TypeScript')).toBe(true)
    expect(SUPPORTED_LANGUAGES.some((l) => l.id === 'python' && l.label === 'Python')).toBe(true)
    expect(SUPPORTED_LANGUAGES.some((l) => l.id === 'text' && l.label === 'Plain Text')).toBe(true)
  })
})

describe('code view preference', () => {
  test('defaults safely and handles stored values and unavailable storage', () => {
    expect(readCodeViewPreference({ getItem: () => null })).toBe(true)
    expect(readCodeViewPreference({ getItem: () => 'false' })).toBe(false)
    expect(readCodeViewPreference({ getItem: () => 'bad' })).toBe(true)
    expect(readCodeViewPreference({ getItem: () => { throw new Error('blocked') } })).toBe(true)
  })
})

describe('hunk change type resolution', () => {
  test('returns add for chunks with only additions', () => {
    expect(resolveHunkChangeType([{ type: 'normal' }, { type: 'add' }])).toBe('add')
  })

  test('returns delete for chunks with only deletions', () => {
    expect(resolveHunkChangeType([{ type: 'normal' }, { type: 'delete' }])).toBe('delete')
  })

  test('returns mixed for chunks with both additions and deletions', () => {
    expect(resolveHunkChangeType([{ type: 'delete' }, { type: 'add' }])).toBe('mixed')
  })

  test('handles paired change render rows as mixed', () => {
    expect(resolveHunkChangeType([], [{ rowType: 'change' }])).toBe('mixed')
  })

  test('returns none for chunks with no additions or deletions', () => {
    expect(resolveHunkChangeType([{ type: 'normal' }])).toBe('none')
  })
})

