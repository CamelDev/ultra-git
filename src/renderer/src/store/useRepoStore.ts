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
  initializeRepos: (paths: string[], activePath: string | null) => Promise<void>;
  
  // Helper to get active repo
  getActiveRepo: () => Repository | undefined;
}

const normalizePath = (p: string) => p.toLowerCase().replace(/\\/g, '/');

const saveToLocalStorage = (repositories: Repository[], activeId: string | null) => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const paths = repositories.map(r => r.path);
    const activeRepo = repositories.find(r => r.id === activeId);
    localStorage.setItem('open-repo-paths', JSON.stringify(paths));
    if (activeRepo) {
      localStorage.setItem('active-repo-path', activeRepo.path);
    } else {
      localStorage.removeItem('active-repo-path');
    }
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
};

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
    if (repo) {
      window.api.git.watchRepo(repo.path).catch(err => console.error('Failed to watch repo on switch', err));
    }
    get().refreshRepo(id).catch(err => console.error('Failed to refresh repo on switch', err));
    saveToLocalStorage(get().repositories, id);
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
    if (repositories.find(r => normalizePath(r.path) === normalizePath(resolvedPath))) {
      const existing = repositories.find(r => normalizePath(r.path) === normalizePath(resolvedPath))!;
      const latestHash = existing.commits.length > 0 ? existing.commits[0].hash : null;
      set({ activeId: existing.id, selectedCommitHash: latestHash });
      saveToLocalStorage(get().repositories, existing.id);
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
    saveToLocalStorage(get().repositories, id);

    window.api.git.watchRepo(resolvedPath).catch(err => console.error('Failed to watch repo on add', err));
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
    saveToLocalStorage(newRepos, newActiveId);

    if (nextActiveRepo) {
      window.api.git.watchRepo(nextActiveRepo.path).catch(err => console.error('Failed to watch next repo on remove', err));
    } else {
      window.api.git.watchRepo(null).catch(err => console.error('Failed to stop watching repo on remove', err));
    }
  },

  initializeRepos: async (paths: string[], activePath: string | null) => {
    // Resolve all paths
    const resolvedPaths = await Promise.all(
      paths.map(async (p) => {
        try {
          const res = await window.api.app.resolvePath(p);
          if (res.success && res.path) {
            return res.path;
          }
        } catch (e) {
          console.error('Failed to resolve path', p, e);
        }
        return p;
      })
    );

    // Filter duplicates
    const uniquePaths = Array.from(new Set(resolvedPaths));
    if (uniquePaths.length === 0) return;

    // Build Repository objects
    const newRepos: Repository[] = uniquePaths.map((p) => {
      const name = p.split(/[\\/]/).pop() || p;
      const id = Math.random().toString(36).substring(7);
      return {
        id,
        path: p,
        name,
        branch: 'main',
        status: null,
        commits: [],
        isLoading: true,
        error: null,
      };
    });

    // Resolve active path
    let resolvedActivePath = activePath;
    if (activePath) {
      try {
        const res = await window.api.app.resolvePath(activePath);
        if (res.success && res.path) {
          resolvedActivePath = res.path;
        }
      } catch (e) {
        console.error('Failed to resolve active path', activePath, e);
      }
    }
    
    // Find the repo matching the active path, or default to the first one
    const activeRepo = newRepos.find(r => normalizePath(r.path) === normalizePath(resolvedActivePath || '')) || newRepos[0];
    const activeId = activeRepo ? activeRepo.id : null;

    set({
      repositories: newRepos,
      activeId,
      selectedCommitHash: null
    });
    
    if (activeId) {
      saveToLocalStorage(newRepos, activeId);
    }

    if (activeRepo) {
      window.api.git.watchRepo(activeRepo.path).catch(err => 
        console.error('Failed to watch active repo on init', err)
      );
    }

    // Refresh all loaded repos
    await Promise.all(
      newRepos.map(r => get().refreshRepo(r.id))
    );
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
