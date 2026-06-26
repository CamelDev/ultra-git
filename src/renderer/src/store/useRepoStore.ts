import { create } from 'zustand'

export interface StashEntry {
  index: number;
  ref: string;
  message: string;
  date: string;
}

export interface Identity {
  id: string;
  label: string;
  name: string;
  email: string;
  provider?: 'github' | 'gitlab' | 'bitbucket' | 'custom';
  username?: string;
  avatarUrl?: string;
  sshKeyPath?: string;
  personalAccessToken?: string;
}

export interface Repository {
  id: string;
  path: string;
  name: string;
  branch: string;
  status: any;
  commits: any[];
  stashes: StashEntry[];
  isLoading: boolean;
  error: string | null;
  identityId?: string;
}

interface RepoState {
  repositories: Repository[];
  identities: Identity[];
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

  // Identity Actions
  addIdentity: (identity: Omit<Identity, 'id'>) => void;
  removeIdentity: (id: string) => void;
  updateIdentity: (identity: Identity) => void;
  setRepoIdentity: (repoId: string, identityId: string | undefined) => Promise<void>;
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
  identities: typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('global-identities') || '[]') : [],
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

    const repoIdentities = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('repo-identities') || '{}') : {};
    const globalIdList = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('global-identities') || '[]') : [];
    const normalized = normalizePath(resolvedPath);
    let identityId = repoIdentities[normalized];

    if (!identityId && globalIdList.length === 1) {
      identityId = globalIdList[0].id;
      repoIdentities[normalized] = identityId;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('repo-identities', JSON.stringify(repoIdentities));
      }
      window.api.git.setRepositoryIdentity(resolvedPath, {
        name: globalIdList[0].name,
        email: globalIdList[0].email,
        sshKeyPath: globalIdList[0].sshKeyPath,
        personalAccessToken: globalIdList[0].personalAccessToken,
        username: globalIdList[0].username,
        provider: globalIdList[0].provider
      }).catch(console.error);
    }

    const newRepo: Repository = {
      id,
      path: resolvedPath,
      name,
      branch: 'main',
      status: null,
      commits: [],
      stashes: [],
      isLoading: true,
      error: null,
      identityId
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

    const repoIdentities = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('repo-identities') || '{}') : {};
    const globalIdList = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('global-identities') || '[]') : [];

    // Build Repository objects
    const newRepos: Repository[] = uniquePaths.map((p) => {
      const name = p.split(/[\\/]/).pop() || p;
      const id = Math.random().toString(36).substring(7);
      const normalized = normalizePath(p);
      let identityId = repoIdentities[normalized];

      if (!identityId && globalIdList.length === 1) {
        identityId = globalIdList[0].id;
        repoIdentities[normalized] = identityId;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('repo-identities', JSON.stringify(repoIdentities));
        }
        window.api.git.setRepositoryIdentity(p, {
          name: globalIdList[0].name,
          email: globalIdList[0].email,
          sshKeyPath: globalIdList[0].sshKeyPath,
          personalAccessToken: globalIdList[0].personalAccessToken,
          username: globalIdList[0].username,
          provider: globalIdList[0].provider
        }).catch(console.error);
      }

      return {
        id,
        path: p,
        name,
        branch: 'main',
        status: null,
        commits: [],
        stashes: [],
        isLoading: true,
        error: null,
        identityId
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
      const [statusRes, logRes, stashRes] = await Promise.all([
        window.api.git.status(repo.path),
        window.api.git.log(repo.path),
        window.api.git.stashList(repo.path)
      ]);

      set((state) => {
        const commits = logRes.success ? logRes.data.all : [];
        const stashes = stashRes.success ? (stashRes.data ?? []) : [];
        const updatedRepos = state.repositories.map(r => {
          if (r.id === id) {
            return {
              ...r,
              status: statusRes.success ? statusRes.data : null,
              branch: statusRes.success ? statusRes.data.current : r.branch,
              commits,
              stashes,
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
  },

  addIdentity: (identityData) => {
    const id = Math.random().toString(36).substring(7);
    const newIdentity = { ...identityData, id };
    const updated = [...get().identities, newIdentity];
    set({ identities: updated });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('global-identities', JSON.stringify(updated));
    }

    // If this is the only identity, auto-assign it to all open repositories!
    if (updated.length === 1) {
      const repos = get().repositories;
      for (const r of repos) {
        get().setRepoIdentity(r.id, id);
      }
    }
  },

  removeIdentity: (id) => {
    console.log('useRepoStore: removeIdentity called for id:', id);
    const updatedIdentities = get().identities.filter(i => i.id !== id);
    
    // Update store repositories state synchronously to avoid race conditions
    const repos = get().repositories;
    const updatedRepos = repos.map(r => 
      r.identityId === id ? { ...r, identityId: undefined } : r
    );
    
    set({ 
      identities: updatedIdentities,
      repositories: updatedRepos 
    });

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('global-identities', JSON.stringify(updatedIdentities));
    }

    // Also remove from repository mappings
    const repoIdentities = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('repo-identities') || '{}') : {};
    let changed = false;
    Object.keys(repoIdentities).forEach(k => {
      if (repoIdentities[k] === id) {
        delete repoIdentities[k];
        changed = true;
      }
    });
    if (changed && typeof localStorage !== 'undefined') {
      localStorage.setItem('repo-identities', JSON.stringify(repoIdentities));
    }

    // Unset local git configurations on disk
    console.log('useRepoStore: removeIdentity unsetting local configurations for repos');
    for (const r of repos) {
      if (r.identityId === id) {
        console.log(`useRepoStore: unsetting repo configuration on disk for ${r.path}`);
        window.api.git.setRepositoryIdentity(r.path, { name: '', email: '', sshKeyPath: undefined, personalAccessToken: undefined, username: undefined, provider: undefined })
          .catch(err => console.error('Failed to unset local git config on profile deletion', err));
      }
    }
  },

  updateIdentity: (identity) => {
    const updated = get().identities.map(i => i.id === identity.id ? identity : i);
    set({ identities: updated });
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('global-identities', JSON.stringify(updated));
    }

    // Refresh repository configurations if any repository uses this identity!
    const repos = get().repositories;
    for (const r of repos) {
      if (r.identityId === identity.id) {
        get().setRepoIdentity(r.id, identity.id);
      }
    }
  },

  setRepoIdentity: async (repoId, identityId) => {
    const { repositories, identities } = get();
    const repo = repositories.find(r => r.id === repoId);
    if (!repo) return;

    // Update state
    const updatedRepos = repositories.map(r => 
      r.id === repoId ? { ...r, identityId } : r
    );
    set({ repositories: updatedRepos });

    // Save path mapping to localStorage
    const normalized = normalizePath(repo.path);
    const mappings = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('repo-identities') || '{}') : {};
    if (identityId) {
      mappings[normalized] = identityId;
    } else {
      delete mappings[normalized];
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('repo-identities', JSON.stringify(mappings));
    }

    // Apply to local Git configuration
    const identity = identities.find(i => i.id === identityId);
    if (identity) {
      await window.api.git.setRepositoryIdentity(repo.path, {
        name: identity.name,
        email: identity.email,
        sshKeyPath: identity.sshKeyPath,
        personalAccessToken: identity.personalAccessToken,
        username: identity.username,
        provider: identity.provider
      });
    } else {
      await window.api.git.setRepositoryIdentity(repo.path, { name: '', email: '', sshKeyPath: undefined, personalAccessToken: undefined, username: undefined, provider: undefined });
    }
  }
}));
