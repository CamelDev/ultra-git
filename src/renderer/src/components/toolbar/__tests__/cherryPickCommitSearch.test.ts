import { describe, expect, test } from 'bun:test'
import { filterCherryPickCommits } from '../CherryPickModal'

const commits = [
  { hash: 'abcd0123456789', message: 'Fix journey IDs [BE-12388]', author_name: 'Ada Lovelace', author_email: 'ada@example.test' },
  { hash: 'efab9876543210', message: 'Improve checkout validation', author_name: 'Grace Hopper', author_email: 'grace@example.test' },
  { hash: '1234567890ffff', message: 'Document availability', author_name: 'Ada Lovelace', author_email: 'ada@example.test' }
]

describe('cherry-pick commit text search', () => {
  test('matches full or partial hashes without case sensitivity', () => {
    expect(filterCherryPickCommits(commits, 'ABCD0123')).toEqual([commits[0]])
    expect(filterCherryPickCommits(commits, commits[1].hash)).toEqual([commits[1]])
  })

  test('matches literal message text, including punctuation', () => {
    expect(filterCherryPickCommits(commits, '  [be-12388]  ')).toEqual([commits[0]])
    expect(filterCherryPickCommits(commits, '.*')).toEqual([])
  })

  test('matches author names and email addresses and keeps source ordering', () => {
    expect(filterCherryPickCommits(commits, 'ADA LOVELACE')).toEqual([commits[0], commits[2]])
    expect(filterCherryPickCommits(commits, 'grace@example')).toEqual([commits[1]])
  })

  test('empty or unmatched input restores all commits or yields no results without changing the source', () => {
    const before = JSON.stringify(commits)
    expect(filterCherryPickCommits(commits, '   ')).toEqual(commits)
    expect(filterCherryPickCommits(commits, 'missing change')).toEqual([])
    expect(JSON.stringify(commits)).toBe(before)
  })

  test('missing author metadata does not prevent matching a message', () => {
    expect(filterCherryPickCommits([{ hash: 'abc', message: 'Fix tests' }], 'tests')).toHaveLength(1)
  })
})
