import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useRepoStore } from '../useRepoStore'

// Mock the window.api
const mockApi = {
  git: {
    status: vi.fn().mockResolvedValue({ success: true, data: { current: 'main' } }),
    log: vi.fn().mockResolvedValue({ success: true, data: { all: [] } }),
  },
  app: {
    openDirectory: vi.fn(),
  }
}

// @ts-ignore
global.window = { api: mockApi }

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
});
