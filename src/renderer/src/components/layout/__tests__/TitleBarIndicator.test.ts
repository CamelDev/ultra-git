import { describe, it, expect } from 'bun:test'
import { getTabIndicatorState } from '../TitleBar'

describe('getTabIndicatorState', () => {
  it('returns "busy" when repo is pushing, pulling, or fetching', () => {
    expect(getTabIndicatorState({ isPushing: true })).toBe('busy')
    expect(getTabIndicatorState({ isPulling: true })).toBe('busy')
    expect(getTabIndicatorState({ isFetching: true })).toBe('busy')
  })

  it('returns "remote-changes" (solid dot) when there are commits to pull (behind > 0)', () => {
    expect(getTabIndicatorState({ status: { behind: 2, files: [] }, stashes: [] })).toBe('remote-changes')
    expect(getTabIndicatorState({ status: { behind: 1, files: [{ path: 'a.txt' }] }, stashes: [{ index: 0, ref: 'stash@{0}', message: 'msg', date: '' }] })).toBe('remote-changes')
  })

  it('returns "stashed-or-uncommitted" (circle) when there are uncommitted changes', () => {
    expect(getTabIndicatorState({ status: { behind: 0, files: [{ path: 'modified.ts' }] }, stashes: [] })).toBe('stashed-or-uncommitted')
  })

  it('returns "stashed-or-uncommitted" (circle) when there are stashes', () => {
    expect(getTabIndicatorState({ status: { behind: 0, files: [] }, stashes: [{ index: 0, ref: 'stash@{0}', message: 'msg', date: '' }] })).toBe('stashed-or-uncommitted')
  })

  it('returns "stashed-or-uncommitted" (circle) when both stashes and uncommitted changes exist', () => {
    expect(getTabIndicatorState({
      status: { behind: 0, files: [{ path: 'modified.ts' }] },
      stashes: [{ index: 0, ref: 'stash@{0}', message: 'stash 1', date: '' }]
    })).toBe('stashed-or-uncommitted')
  })

  it('returns "none" (invisible) when in sync and repo is clean/unmodified', () => {
    expect(getTabIndicatorState({ status: { behind: 0, files: [] }, stashes: [] })).toBe('none')
    expect(getTabIndicatorState({ status: null, stashes: [] })).toBe('none')
    expect(getTabIndicatorState({})).toBe('none')
  })
})
