import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRepoStore } from '../useRepoStore'

// Mock the window.api
const mockApi = {
  git: {
    status: vi.fn().mockResolvedValue({ success: true, data: { current: 'main' } }),
    log: vi.fn().mockResolvedValue({ success: true, data: { all: [] } }),
    watchRepo: vi.fn().mockResolvedValue({ success: true }),
    getWorktrees: vi.fn().mockResolvedValue({ success: true, data: [] }),
    stashList: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getBranches: vi.fn().mockResolvedValue({ success: true, data: { local: [], remote: [] } }),
    getTags: vi.fn().mockResolvedValue({ success: true, data: [] }),
    setRepositoryIdentity: vi.fn().mockResolvedValue({ success: true }),
  },
  app: {
    openDirectory: vi.fn(),
    resolvePath: vi.fn().mockImplementation((p) => Promise.resolve({ success: true, path: p })),
  }
}

const localStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn().mockImplementation((key) => localStore[key] || null),
  setItem: vi.fn().mockImplementation((key, value) => { localStore[key] = String(value); }),
  removeItem: vi.fn().mockImplementation((key) => { delete localStore[key]; }),
  clear: vi.fn().mockImplementation(() => { for (const key in localStore) delete localStore[key]; }),
  length: 0,
  key: vi.fn()
};

// @ts-ignore
global.window = {
  api: mockApi,
  localStorage: mockLocalStorage
}
// @ts-ignore
global.localStorage = mockLocalStorage

describe('useRepoStore', () => {
  beforeEach(() => {
    useRepoStore.setState({ repositories: [], activeId: null });
    vi.clearAllMocks();
  });

  it('should initial state be empty', () => {
    const state = useRepoStore.getState();
    expect(state.repositories).toEqual([]);
    expect(state.activeId).toBeNull();
  });

  it('should add a repository', async () => {
    const { addRepo } = useRepoStore.getState();
    await addRepo('/test/path');

    const state = useRepoStore.getState();
    expect(state.repositories.length).toBe(1);
    expect(state.repositories[0].path).toBe('/test/path');
    expect(state.repositories[0].name).toBe('path');
    expect(state.activeId).toBe(state.repositories[0].id);
  });

  it('should not add a repository if already open', async () => {
    const { addRepo } = useRepoStore.getState();
    await addRepo('/test/path');
    const firstId = useRepoStore.getState().activeId;
    
    await addRepo('/test/path');
    const state = useRepoStore.getState();
    expect(state.repositories.length).toBe(1);
    expect(state.activeId).toBe(firstId);
  });

  it('should remove a repository', async () => {
    const { addRepo, removeRepo } = useRepoStore.getState();
    await addRepo('/repo1');
    const id1 = useRepoStore.getState().activeId!;
    await addRepo('/repo2');
    const id2 = useRepoStore.getState().activeId!;

    expect(useRepoStore.getState().repositories.length).toBe(2);

    removeRepo(id2);
    const state = useRepoStore.getState();
    expect(state.repositories.length).toBe(1);
    expect(state.repositories[0].id).toBe(id1);
    expect(state.activeId).toBe(id1);
  });

  it('should switch active repository', async () => {
    const { addRepo, setActiveId } = useRepoStore.getState();
    await addRepo('/repo1');
    const id1 = useRepoStore.getState().activeId!;
    await addRepo('/repo2');
    const id2 = useRepoStore.getState().activeId!;

    expect(useRepoStore.getState().activeId).toBe(id2);

    setActiveId(id1);
    expect(useRepoStore.getState().activeId).toBe(id1);
  });

  it('should initialize repositories and set active one from activePath', async () => {
    const { initializeRepos } = useRepoStore.getState();
    await initializeRepos(['/repo1', '/repo2'], '/repo2');

    const state = useRepoStore.getState();
    expect(state.repositories.length).toBe(2);
    expect(state.repositories[0].path).toBe('/repo1');
    expect(state.repositories[1].path).toBe('/repo2');
    
    const activeRepo = state.getActiveRepo();
    expect(activeRepo).toBeDefined();
    expect(activeRepo!.path).toBe('/repo2');
    expect(state.activeId).toBe(activeRepo!.id);
  });

  it('should fallback to first repository if activePath is not found', async () => {
    const { initializeRepos } = useRepoStore.getState();
    await initializeRepos(['/repo1', '/repo2'], '/non-existent');

    const state = useRepoStore.getState();
    expect(state.repositories.length).toBe(2);
    const activeRepo = state.getActiveRepo();
    expect(activeRepo!.path).toBe('/repo1');
  });

  it('should save to localStorage when repositories are added, switched, and removed', async () => {
    // Clear localStore before testing
    for (const key in localStore) delete localStore[key];

    const { addRepo, setActiveId, removeRepo } = useRepoStore.getState();
    
    await addRepo('/repo1');
    expect(JSON.parse(localStore['open-repo-paths'])).toEqual(['/repo1']);
    expect(localStore['active-repo-path']).toBe('/repo1');

    await addRepo('/repo2');
    expect(JSON.parse(localStore['open-repo-paths'])).toEqual(['/repo1', '/repo2']);
    expect(localStore['active-repo-path']).toBe('/repo2');

    const id1 = useRepoStore.getState().repositories[0].id;
    setActiveId(id1);
    expect(localStore['active-repo-path']).toBe('/repo1');

    const id2 = useRepoStore.getState().repositories[1].id;
    removeRepo(id2);
    expect(JSON.parse(localStore['open-repo-paths'])).toEqual(['/repo1']);
    expect(localStore['active-repo-path']).toBe('/repo1');

    removeRepo(id1);
    expect(JSON.parse(localStore['open-repo-paths'])).toEqual([]);
    expect(localStore['active-repo-path']).toBeUndefined();
  });

  it('should reorder repositories and save to localStorage', async () => {
    // Clear localStore before testing
    for (const key in localStore) delete localStore[key];

    const { addRepo, reorderRepos } = useRepoStore.getState();
    await addRepo('/repo1');
    await addRepo('/repo2');
    await addRepo('/repo3');

    const originalRepos = useRepoStore.getState().repositories;
    expect(originalRepos.length).toBe(3);
    expect(originalRepos[0].path).toBe('/repo1');
    expect(originalRepos[1].path).toBe('/repo2');
    expect(originalRepos[2].path).toBe('/repo3');

    // Reorder: Move first item (/repo1) to the end
    reorderRepos(0, 2);

    const reorderedRepos = useRepoStore.getState().repositories;
    expect(reorderedRepos[0].path).toBe('/repo2');
    expect(reorderedRepos[1].path).toBe('/repo3');
    expect(reorderedRepos[2].path).toBe('/repo1');

    // Verify localStorage has the new order saved
    expect(JSON.parse(localStore['open-repo-paths'])).toEqual(['/repo2', '/repo3', '/repo1']);
  });
});
