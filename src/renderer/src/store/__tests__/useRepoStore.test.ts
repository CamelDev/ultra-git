import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { useRepoStore } from '../useRepoStore'

const vi = {
  fn: (impl?: (...args: any[]) => any) => mock(impl || (() => {})),
  clearAllMocks: () => {}
}

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
    getUnpushedTags: vi.fn().mockResolvedValue({ success: true, data: [] }),
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
} as any
// @ts-ignore
global.localStorage = mockLocalStorage as any

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

  it('should automatically clear branch preview on refresh if branch matches previewed branch', async () => {
    const { addRepo } = useRepoStore.getState();
    await addRepo('/test-repo');
    const id = useRepoStore.getState().activeId!;

    // Set preview state
    useRepoStore.setState({ 
      previewBranch: 'feature-branch',
      previewCommits: [{ hash: '123' } as any]
    });

    // Mock status to return 'feature-branch' (matching preview branch)
    mockApi.git.status.mockResolvedValueOnce({
      success: true,
      data: { current: 'feature-branch' }
    });

    // Refresh repo
    const { refreshRepo } = useRepoStore.getState();
    await refreshRepo(id);

    // Verify preview branch is cleared
    const state = useRepoStore.getState();
    expect(state.previewBranch).toBeNull();
    expect(state.previewCommits).toEqual([]);
  });

  it('should automatically clear branch preview on refresh if previewed branch no longer exists', async () => {
    const { addRepo } = useRepoStore.getState();
    await addRepo('/test-repo');
    const id = useRepoStore.getState().activeId!;

    // Set preview state
    useRepoStore.setState({ 
      previewBranch: 'deleted-branch',
      previewCommits: [{ hash: '123' } as any]
    });

    // Mock status to return 'main' (not matching deleted-branch)
    mockApi.git.status.mockResolvedValueOnce({
      success: true,
      data: { current: 'main' }
    });

    // Mock getBranches to NOT contain 'deleted-branch'
    mockApi.git.getBranches.mockResolvedValueOnce({
      success: true,
      data: { local: [{ name: 'main', ahead: 0, behind: 0 }], remote: [] }
    });

    // Refresh repo
    const { refreshRepo } = useRepoStore.getState();
    await refreshRepo(id);

    // Verify preview branch is cleared
    const state = useRepoStore.getState();
    expect(state.previewBranch).toBeNull();
    expect(state.previewCommits).toEqual([]);
  });

  it('should set custom repo name, color, and autoFetch and persist to localStorage', async () => {
    const { addRepo, setRepoCustomName, setRepoTabColor, setRepoAutoFetch } = useRepoStore.getState();
    await addRepo('/test-custom-repo');
    const id = useRepoStore.getState().activeId!;

    let repo = useRepoStore.getState().repositories.find(r => r.id === id);
    expect(repo?.autoFetch).toBe(true);

    setRepoCustomName(id, 'My Custom Project');
    setRepoTabColor(id, '#ef4444');
    setRepoAutoFetch(id, false);

    const state = useRepoStore.getState();
    repo = state.repositories.find(r => r.id === id);
    expect(repo?.customName).toBe('My Custom Project');
    expect(repo?.customColor).toBe('#ef4444');
    expect(repo?.autoFetch).toBe(false);

    // Verify localStorage persistence
    const savedCustomizations = JSON.parse(localStore['repo-tab-customizations']);
    expect(savedCustomizations['/test-custom-repo']).toEqual({
      customName: 'My Custom Project',
      customColor: '#ef4444',
      autoFetch: false
    });
  });

  it('should load custom name and color when initializing repos', async () => {
    // Pre-populate localStorage
    localStore['repo-tab-customizations'] = JSON.stringify({
      '/test-init-repo': {
        customName: 'Custom Init Name',
        customColor: '#10b981'
      }
    });

    const { initializeRepos } = useRepoStore.getState();
    await initializeRepos(['/test-init-repo'], '/test-init-repo');

    const state = useRepoStore.getState();
    const repo = state.repositories[0];
    expect(repo.customName).toBe('Custom Init Name');
    expect(repo.customColor).toBe('#10b981');
  });

  it('should manage recent repos list, cap at 20, and persist to localStorage', async () => {
    const { addRecentRepo, removeRecentRepo } = useRepoStore.getState();

    // Add 25 recent repos
    for (let i = 1; i <= 25; i++) {
      addRecentRepo(`/repo-${i}`, `Repo ${i}`);
    }

    let state = useRepoStore.getState();
    expect(state.recentRepos.length).toBe(20);
    expect(state.recentRepos[0]).toEqual({ path: '/repo-25', name: 'Repo 25' });

    // Verify localStorage
    const saved = JSON.parse(localStore['recent-repositories']);
    expect(saved.length).toBe(20);
    expect(saved[0].path).toBe('/repo-25');

    // Remove a recent repo
    removeRecentRepo('/repo-25');
    state = useRepoStore.getState();
    expect(state.recentRepos.length).toBe(19);
    expect(state.recentRepos[0].path).toBe('/repo-24');
  });

  it('should isolate isPushing, isPulling, and isFetching per repository', async () => {
    const { addRepo, setRepoPushing, setRepoPulling, setRepoFetching } = useRepoStore.getState();
    await addRepo('/repo1');
    const id1 = useRepoStore.getState().activeId!;
    await addRepo('/repo2');
    const id2 = useRepoStore.getState().activeId!;

    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isPushing).toBeFalsy();
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isPushing).toBeFalsy();

    // Set pushing on repo 1
    setRepoPushing(id1, true);
    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isPushing).toBe(true);
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isPushing).toBeFalsy();

    // Set pulling on repo 2
    setRepoPulling(id2, true);
    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isPulling).toBeFalsy();
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isPulling).toBe(true);

    // Set fetching on repo 1
    setRepoFetching(id1, true);
    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isFetching).toBe(true);
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isFetching).toBeFalsy();

    // Reset repo 1 pushing & fetching
    setRepoPushing(id1, false);
    setRepoFetching(id1, false);
    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isPushing).toBe(false);
    expect(useRepoStore.getState().repositories.find(r => r.id === id1)?.isFetching).toBe(false);
    // repo 2 pulling is still true
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isPulling).toBe(true);

    // Reset repo 2 pulling
    setRepoPulling(id2, false);
    expect(useRepoStore.getState().repositories.find(r => r.id === id2)?.isPulling).toBe(false);
  });

  it('should isolate commit message drafts per repository and persist to localStorage', async () => {
    // Clear localStore before testing
    for (const key in localStore) delete localStore[key];

    const { addRepo, setRepoCommitMessage } = useRepoStore.getState();
    await addRepo('/repo-a');
    const idA = useRepoStore.getState().activeId!;
    await addRepo('/repo-b');
    const idB = useRepoStore.getState().activeId!;

    expect(useRepoStore.getState().repositories.find(r => r.id === idA)?.commitMessage).toBe('');
    expect(useRepoStore.getState().repositories.find(r => r.id === idB)?.commitMessage).toBe('');

    // Type commit message for repo A
    setRepoCommitMessage(idA, 'feat(auth): add google sso login');
    expect(useRepoStore.getState().repositories.find(r => r.id === idA)?.commitMessage).toBe('feat(auth): add google sso login');
    expect(useRepoStore.getState().repositories.find(r => r.id === idB)?.commitMessage).toBe('');

    // Type commit message for repo B
    setRepoCommitMessage(idB, 'fix(ui): fix button overflow in toolbar');
    expect(useRepoStore.getState().repositories.find(r => r.id === idA)?.commitMessage).toBe('feat(auth): add google sso login');
    expect(useRepoStore.getState().repositories.find(r => r.id === idB)?.commitMessage).toBe('fix(ui): fix button overflow in toolbar');

    // Verify localStorage has persisted both messages
    const customizations = JSON.parse(localStore['repo-tab-customizations']);
    expect(customizations['/repo-a']?.commitMessage).toBe('feat(auth): add google sso login');
    expect(customizations['/repo-b']?.commitMessage).toBe('fix(ui): fix button overflow in toolbar');

    // Clear message on repo A (e.g. after commit)
    setRepoCommitMessage(idA, '');
    expect(useRepoStore.getState().repositories.find(r => r.id === idA)?.commitMessage).toBe('');
    expect(useRepoStore.getState().repositories.find(r => r.id === idB)?.commitMessage).toBe('fix(ui): fix button overflow in toolbar');
  });

  it('should restore commit message drafts when initializing repos from localStorage', async () => {
    // Pre-populate localStorage
    localStore['repo-tab-customizations'] = JSON.stringify({
      '/repo-with-draft': {
        customName: 'Custom Repo',
        commitMessage: 'WIP: ongoing work on backend refactor'
      }
    });

    const { initializeRepos } = useRepoStore.getState();
    await initializeRepos(['/repo-with-draft'], '/repo-with-draft');

    const state = useRepoStore.getState();
    const repo = state.repositories[0];
    expect(repo.commitMessage).toBe('WIP: ongoing work on backend refactor');
  });
});

