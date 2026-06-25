import { create } from 'zustand'

export interface Repository {
  id: string;
  path: string;
  name: string;
  branch: string;
  status: any;
  commits: any[];
  isLoading: boolean;
  error: string | null;
}

interface RepoState {
  repositories: Repository[];
  activeId: string | null;
  selectedCommitHash: string | null;
  
  // Actions
  addRepo: (path: string) => Promise<void>;
  removeRepo: (id: string) => void;
  setActiveId: (id: string) => void;
  refreshRepo: (id: string) => Promise<void>;
  setSelectedCommitHash: (hash: string | null) => void;
  
  // Helper to get active repo
  getActiveRepo: () => Repository | undefined;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repositories: [],
  activeId: null,
  selectedCommitHash: null,

  getActiveRepo: () => {
    const { repositories, activeId } = get();
    return repositories.find(r => r.id === activeId);
  },

  setActiveId: (id: string) => {
    const repo = get().repositories.find(r => r.id === id);
    const latestHash = (repo && repo.commits.length > 0) ? repo.commits[0].hash : null;
    set({ activeId: id, selectedCommitHash: latestHash });
    get().refreshRepo(id).catch(err => console.error('Failed to refresh repo on switch', err));
  },

  setSelectedCommitHash: (hash: string | null) => {
    set({ selectedCommitHash: hash });
  },

  addRepo: async (path: string) => {
    const { repositories } = get();
    
    let resolvedPath = path;
    try {
      const res = await window.api.app.resolvePath(path);
      if (res.success && res.path) {
        resolvedPath = res.path;
      }
    } catch (e) {
      console.error('Failed to resolve path', e);
    }
    
    // Check if already open
    if (repositories.find(r => r.path === resolvedPath)) {
      const existing = repositories.find(r => r.path === resolvedPath)!;
      const latestHash = existing.commits.length > 0 ? existing.commits[0].hash : null;
      set({ activeId: existing.id, selectedCommitHash: latestHash });
      return;
    }

    const name = resolvedPath.split(/[\\/]/).pop() || resolvedPath;
    const id = Math.random().toString(36).substring(7);

    const newRepo: Repository = {
      id,
      path: resolvedPath,
      name,
      branch: 'main',
      status: null,
      commits: [],
      isLoading: true,
      error: null,
    };

    set({ 
      repositories: [...repositories, newRepo],
      activeId: id,
      selectedCommitHash: null
    });

    await get().refreshRepo(id);
  },

  removeRepo: (id: string) => {
    const { repositories, activeId } = get();
    const newRepos = repositories.filter(r => r.id !== id);
    let newActiveId = activeId;

    if (activeId === id) {
      newActiveId = newRepos.length > 0 ? newRepos[newRepos.length - 1].id : null;
    }

    const nextActiveRepo = newRepos.find(r => r.id === newActiveId);
    const latestHash = (nextActiveRepo && nextActiveRepo.commits.length > 0) ? nextActiveRepo.commits[0].hash : null;

    set({ repositories: newRepos, activeId: newActiveId, selectedCommitHash: latestHash });
  },

  refreshRepo: async (id: string) => {
    const { repositories } = get();
    const repo = repositories.find(r => r.id === id);
    if (!repo) return;

    // Update loading state
    set({
      repositories: repositories.map(r => 
        r.id === id ? { ...r, isLoading: true } : r
      )
    });

    try {
      const [statusRes, logRes] = await Promise.all([
        window.api.git.status(repo.path),
        window.api.git.log(repo.path)
      ]);

      set((state) => {
        const commits = logRes.success ? logRes.data.all : [];
        const updatedRepos = state.repositories.map(r => {
          if (r.id === id) {
            return {
              ...r,
              status: statusRes.success ? statusRes.data : null,
              branch: statusRes.success ? statusRes.data.current : r.branch,
              commits,
              error: statusRes.success ? null : (statusRes.error ?? 'Unknown error'),
              isLoading: false
            };
          }
          return r;
        });

        let newSelectedHash = state.selectedCommitHash;
        if (state.activeId === id && !state.selectedCommitHash && commits.length > 0) {
          newSelectedHash = commits[0].hash;
        }

        return {
          repositories: updatedRepos,
          selectedCommitHash: newSelectedHash
        };
      });
    } catch (err: any) {
      set((state) => ({
        repositories: state.repositories.map(r => 
          r.id === id ? { ...r, error: err.message, isLoading: false } : r
        )
      }));
    }
  }
}));
