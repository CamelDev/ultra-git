import { create } from 'zustand'

interface GitState {
  repoPath: string;
  branch: string;
  status: any;
  commits: any[];
  isLoading: boolean;
  error: string | null;

  setRepoPath: (path: string) => void;
  refreshStatus: () => Promise<void>;
  refreshLog: () => Promise<void>;
  checkout: (branchName: string) => Promise<void>;
}

export const useGitStore = create<GitState>((set, get) => ({
  repoPath: '',
  branch: 'main',
  status: null,
  commits: [],
  isLoading: false,
  error: null,

  setRepoPath: (path: string) => {
    set({ repoPath: path });
    get().refreshStatus();
    get().refreshLog();
  },

  refreshStatus: async () => {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ isLoading: true });
    try {
      const response = await window.api.git.status(repoPath);
      if (response.success) {
        set({ status: response.data, branch: response.data.current, error: null });
      } else {
        set({ error: response.error });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  refreshLog: async () => {
    const { repoPath } = get();
    if (!repoPath) return;

    try {
      const response = await window.api.git.log(repoPath);
      if (response.success) {
        set({ commits: response.data.all, error: null });
      } else {
        set({ error: response.error });
      }
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  checkout: async (branchName: string) => {
    const { repoPath } = get();
    if (!repoPath) return;

    set({ isLoading: true });
    try {
      const response = await window.api.git.checkout(repoPath, branchName);
      if (response.success) {
        await get().refreshStatus();
        await get().refreshLog();
      } else {
        set({ error: response.error });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  }
}));
