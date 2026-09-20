import { describe, expect, test } from 'bun:test'
import {
  readCodeViewPreference,
  resolveCodeLanguage,
  resolveHunkChangeType,
  resolveRenameLanguages,
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

