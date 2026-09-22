import { describe, expect, test } from 'bun:test'
import { resolveViewModePreference, saveViewModePreference } from '../ActiveChanges'

const createMockStorage = (initial: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value)
  }
}

describe('ActiveChanges independent view modes', () => {
  test('defaults to list view when no preferences are stored', () => {
    const storage = createMockStorage()
    expect(resolveViewModePreference('unstaged', undefined, undefined, storage)).toBe('list')
    expect(resolveViewModePreference('staged', undefined, undefined, storage)).toBe('list')
  })

  test('prioritizes explicit initialMode if provided', () => {
    const storage = createMockStorage({
      'unstaged-changes-view-mode': 'list',
      'staged-changes-view-mode': 'list'
    })
    expect(resolveViewModePreference('unstaged', 'tree', undefined, storage)).toBe('tree')
    expect(resolveViewModePreference('staged', 'tree', undefined, storage)).toBe('tree')
  })

  test('reads independent storage keys for unstaged and staged files', () => {
    const storage = createMockStorage({
      'unstaged-changes-view-mode': 'tree',
      'staged-changes-view-mode': 'list'
    })
    expect(resolveViewModePreference('unstaged', undefined, undefined, storage)).toBe('tree')
    expect(resolveViewModePreference('staged', undefined, undefined, storage)).toBe('list')
  })

  test('falls back to legacy changes-view-mode or legacy prop when panel key is missing', () => {
    const storageWithLegacyKey = createMockStorage({
      'changes-view-mode': 'tree'
    })
    expect(resolveViewModePreference('unstaged', undefined, undefined, storageWithLegacyKey)).toBe('tree')
    expect(resolveViewModePreference('staged', undefined, undefined, storageWithLegacyKey)).toBe('tree')

    const emptyStorage = createMockStorage()
    expect(resolveViewModePreference('unstaged', undefined, 'tree', emptyStorage)).toBe('tree')
    expect(resolveViewModePreference('staged', undefined, 'tree', emptyStorage)).toBe('tree')
  })

  test('saves preferences independently to storage without mutual interference', () => {
    const storage = createMockStorage()

    saveViewModePreference('unstaged', 'tree', storage)
    expect(storage.getItem('unstaged-changes-view-mode')).toBe('tree')
    expect(storage.getItem('staged-changes-view-mode')).toBeNull()

    saveViewModePreference('staged', 'list', storage)
    expect(storage.getItem('unstaged-changes-view-mode')).toBe('tree')
    expect(storage.getItem('staged-changes-view-mode')).toBe('list')

    saveViewModePreference('staged', 'tree', storage)
    expect(storage.getItem('staged-changes-view-mode')).toBe('tree')
    expect(storage.getItem('unstaged-changes-view-mode')).toBe('tree')
  })
})
