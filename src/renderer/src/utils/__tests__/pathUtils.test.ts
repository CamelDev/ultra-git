import { describe, it, expect } from 'bun:test'
import { getFullFilePath } from '../pathUtils'

describe('getFullFilePath', () => {
  it('combines POSIX repoPath and relative filePath', () => {
    const full = getFullFilePath('/Users/kamil/projects/ultra-git', 'src/renderer/DiffModal.tsx')
    expect(full).toBe('/Users/kamil/projects/ultra-git/src/renderer/DiffModal.tsx')
  })

  it('handles trailing slash on repoPath and leading slash on filePath', () => {
    const full = getFullFilePath('/Users/kamil/projects/ultra-git/', '/src/renderer/DiffModal.tsx')
    expect(full).toBe('/Users/kamil/projects/ultra-git/src/renderer/DiffModal.tsx')
  })

  it('handles Windows backslash paths', () => {
    const full = getFullFilePath('C:\\Users\\Kamil\\projects\\ultra-git', 'src/renderer/DiffModal.tsx')
    expect(full).toBe('C:\\Users\\Kamil\\projects\\ultra-git\\src\\renderer\\DiffModal.tsx')
  })

  it('handles Windows paths with trailing backslash and mixed slashes', () => {
    const full = getFullFilePath('C:\\Users\\Kamil\\projects\\ultra-git\\', 'src/components\\details\\DiffModal.tsx')
    expect(full).toBe('C:\\Users\\Kamil\\projects\\ultra-git\\src\\components\\details\\DiffModal.tsx')
  })

  it('returns filePath unchanged if it is already an absolute Windows path on another drive', () => {
    const full = getFullFilePath('C:\\repo', 'D:\\other\\file.txt')
    expect(full).toBe('D:\\other\\file.txt')
  })

  it('returns filePath unchanged if it already begins with repoPath', () => {
    const full = getFullFilePath('/Users/kamil/projects/ultra-git', '/Users/kamil/projects/ultra-git/README.md')
    expect(full).toBe('/Users/kamil/projects/ultra-git/README.md')
  })

  it('handles root directory repoPath properly', () => {
    const full = getFullFilePath('/', 'var/log/app.log')
    expect(full).toBe('/var/log/app.log')
  })

  it('returns empty string if filePath is missing or "No file selected"', () => {
    expect(getFullFilePath('/repo', '')).toBe('')
    expect(getFullFilePath('/repo', 'No file selected')).toBe('')
    expect(getFullFilePath(undefined, undefined)).toBe('')
  })

  it('returns filePath if repoPath is missing or empty', () => {
    expect(getFullFilePath('', 'src/index.ts')).toBe('src/index.ts')
    expect(getFullFilePath(undefined, 'src/index.ts')).toBe('src/index.ts')
  })

  it('handles paths with spaces properly', () => {
    const full = getFullFilePath('/Users/kamil/My Documents/Project', 'sub folder/my file.txt')
    expect(full).toBe('/Users/kamil/My Documents/Project/sub folder/my file.txt')
  })
})
