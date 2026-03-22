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
  
  // Actions
  addRepo: (path: string) => Promise<void>;
  removeRepo: (id: string) => void;
  setActiveId: (id: string) => void;
  refreshRepo: (id: string) => Promise<void>;
  
  // Helper to get active repo
  getActiveRepo: () => Repository | undefined;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repositories: [],
  activeId: null,

  getActiveRepo: () => {
    const { repositories, activeId } = get();
    return repositories.find(r => r.id === activeId);
  },

  setActiveId: (id: string) => {
    set({ activeId: id });
  },

  addRepo: async (path: string) => {
    const { repositories } = get();
    
    // Check if already open
    if (repositories.find(r => r.path === path)) {
      const existing = repositories.find(r => r.path === path)!;
      set({ activeId: existing.id });
      return;
    }

    const name = path.split(/[\\/]/).pop() || path;
    const id = Math.random().toString(36).substring(7);

    const newRepo: Repository = {
      id,
      path,
      name,
      branch: 'main',
      status: null,
      commits: [],
      isLoading: true,
      error: null,
    };

    set({ 
      repositories: [...repositories, newRepo],
      activeId: id
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

    set({ repositories: newRepos, activeId: newActiveId });
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

      set((state) => ({
        repositories: state.repositories.map(r => {
          if (r.id === id) {
            return {
              ...r,
              status: statusRes.success ? statusRes.data : null,
              branch: statusRes.success ? statusRes.data.current : r.branch,
              commits: logRes.success ? logRes.data.all : [],
              error: statusRes.success ? null : (statusRes.error ?? 'Unknown error'),
              isLoading: false
            };
          }
          return r;
        })
      }));
    } catch (err: any) {
      set((state) => ({
        repositories: state.repositories.map(r => 
          r.id === id ? { ...r, error: err.message, isLoading: false } : r
        )
      }));
    }
  }
}));
