import { describe, it, expect } from 'bun:test'
import { getTabIndicatorState } from '../TitleBar'

describe('getTabIndicatorState', () => {
  it('returns "busy" when repo is pushing, pulling, or fetching', () => {
    expect(getTabIndicatorState({ isPushing: true })).toBe('busy')
    expect(getTabIndicatorState({ isPulling: true })).toBe('busy')
    expect(getTabIndicatorState({ isFetching: true })).toBe('busy')
  })

  it('returns "remote-changes" (globe) when there are commits to pull (behind > 0)', () => {
    expect(getTabIndicatorState({ status: { behind: 2, ahead: 0, files: [] } })).toBe('remote-changes')
    expect(getTabIndicatorState({ status: { behind: 1, ahead: 0, files: [{ path: 'a.txt' }] } })).toBe('remote-changes')
    expect(getTabIndicatorState({ commits: [{ syncStatus: 'remote-only' }] })).toBe('remote-changes')
  })

  it('returns "unpushed-commits" (circle) when there is not pushed local commit (ahead > 0)', () => {
    expect(getTabIndicatorState({ status: { behind: 0, ahead: 1, files: [] } })).toBe('unpushed-commits')
    expect(getTabIndicatorState({ status: { behind: 0, ahead: 3, files: [{ path: 'modified.ts' }] } })).toBe('unpushed-commits')
    expect(getTabIndicatorState({ commits: [{ syncStatus: 'local-only' }] })).toBe('unpushed-commits')
  })

  it('returns "synced" (solid dot) when in sync and all commits are pushed / up to date', () => {
    expect(getTabIndicatorState({ status: { behind: 0, ahead: 0, files: [] } })).toBe('synced')
    expect(getTabIndicatorState({ status: null })).toBe('synced')
    expect(getTabIndicatorState({})).toBe('synced')
    expect(getTabIndicatorState({ commits: [{ syncStatus: 'pushed' }] })).toBe('synced')
  })
})
