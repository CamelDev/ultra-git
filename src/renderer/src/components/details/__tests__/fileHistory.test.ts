import { describe, it, expect } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { filterFileHistoryCommits, FileHistoryEntry } from '../../../../../shared/fileHistory'

const sampleCommits: FileHistoryEntry[] = [
  {
    hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    authorName: 'Alice Anderson',
    authorEmail: 'alice@company.dev',
    date: '2026-05-10T14:20:00Z',
    message: 'feat(diff): add syntax highlighting support',
    status: 'M',
    filePath: 'src/app.ts'
  },
  {
    hash: '9876543210fedcba0123456789abcdef12345678',
    authorName: 'Bob Builder',
    authorEmail: 'bob@contractors.org',
    date: '2026-05-09T09:15:00Z',
    message: 'fix: handle empty diff edge case',
    status: 'M',
    filePath: 'src/app.ts'
  },
  {
    hash: 'deadbeef00112233445566778899aabbccddeeff',
    authorName: 'Carol Chen',
    authorEmail: 'carol@company.dev',
    date: '2026-05-01T08:00:00Z',
    message: 'Initial file creation',
    status: 'A',
    filePath: 'src/app.ts'
  }
]

describe('filterFileHistoryCommits', () => {
  it('returns all commits when query is empty or whitespace', () => {
    expect(filterFileHistoryCommits(sampleCommits, '')).toEqual(sampleCommits)
    expect(filterFileHistoryCommits(sampleCommits, '   ')).toEqual(sampleCommits)
  })

  it('filters by commit message case-insensitively', () => {
    const result = filterFileHistoryCommits(sampleCommits, 'HIGHLIGHTING')
    expect(result.map((c) => c.hash)).toEqual([sampleCommits[0].hash])
  })

  it('filters by author name and email while preserving order', () => {
    const byName = filterFileHistoryCommits(sampleCommits, 'bob')
    expect(byName.map((c) => c.hash)).toEqual([sampleCommits[1].hash])

    const byEmailDomain = filterFileHistoryCommits(sampleCommits, 'company.dev')
    expect(byEmailDomain.map((c) => c.hash)).toEqual([sampleCommits[0].hash, sampleCommits[2].hash])
  })

  it('filters by full or partial commit hash', () => {
    const result = filterFileHistoryCommits(sampleCommits, 'DEADBEEF')
    expect(result.map((c) => c.hash)).toEqual([sampleCommits[2].hash])
  })

  it('returns empty array when no commit matches and does not mutate input', () => {
    const snapshot = [...sampleCommits]
    expect(filterFileHistoryCommits(sampleCommits, 'non-existent-term')).toEqual([])
    expect(sampleCommits).toEqual(snapshot)
  })
})

describe('DiffModal File History integration', () => {
  const diffModalSource = fs.readFileSync(
    path.join(__dirname, '../DiffModal.tsx'),
    'utf8'
  )

  it('places the History button between the Code view toggle and the file path', () => {
    const codeViewIdx = diffModalSource.indexOf('data-testid="toggle-code-view-btn"')
    const historyBtnIdx = diffModalSource.indexOf('data-testid="file-history-btn"')
    const filePathIdx = diffModalSource.indexOf('data-testid="diff-file-path"')

    expect(codeViewIdx).toBeGreaterThan(-1)
    expect(historyBtnIdx).toBeGreaterThan(codeViewIdx)
    expect(filePathIdx).toBeGreaterThan(historyBtnIdx)
  })

  it('guards DiffModal keyboard shortcuts while FileHistoryModal is open', () => {
    expect(diffModalSource).toContain('if (!isOpen || historyModalOpen) return')
  })
})
