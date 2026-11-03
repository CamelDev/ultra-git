import { describe, expect, test } from 'bun:test'
import { selectCherryPickBranch } from '../CherryPickModal'

describe('cherry-pick source selection', () => {
  test('selects a local branch and drops a remote selection until remotes are explicitly loaded', () => {
    expect(selectCherryPickBranch(['main', 'feature'], [], 'main', 'origin/remote-only')).toBe('feature')
  })

  test('keeps the current local branch when no other local source exists', () => {
    expect(selectCherryPickBranch(['main'], ['main'], 'main', 'origin/feature')).toBe('main')
  })

  test('keeps a local selection when remote branches are loaded', () => {
    expect(selectCherryPickBranch(['main', 'feature'], [], 'main', 'feature', ['origin/feature'])).toBe('feature')
  })

  test('preserves a deliberately selected remote across branch refreshes', () => {
    expect(selectCherryPickBranch(['main', 'feature'], [], 'main', 'origin/remote-only', ['origin/remote-only'])).toBe('origin/remote-only')
  })

  test('offers worktree refs, including detached commits, without loading remotes', () => {
    expect(selectCherryPickBranch(['main'], ['main', 'worktree-feature'], 'main', '')).toBe('worktree-feature')
    expect(selectCherryPickBranch(['main'], ['main', 'a1b2c3d'], 'main', '')).toBe('a1b2c3d')
  })

  test('has no implicit remote fallback when no local sources are available', () => {
    expect(selectCherryPickBranch([], [], 'main', 'origin/feature')).toBe('')
  })
})
