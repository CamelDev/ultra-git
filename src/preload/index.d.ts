import { ElectronAPI } from '@electron-toolkit/preload'

// Types for IPC responses
export type IpcResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface UpdateInfo {
  latest: string;
  url: string;
  publishedAt: string | null;
  notes: string;
}

export interface UpdateSettings {
  enabled: boolean;
  skippedVersion: string | null;
  lastCheckedAt: string | null;
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      git: {
        status: (repoPath: string) => Promise<IpcResponse<any>>;
        log: (repoPath: string, maxCount?: number) => Promise<IpcResponse<any>>;
        fetch: (repoPath: string) => Promise<IpcResponse<void>>;
        checkout: (repoPath: string, branchName: string) => Promise<IpcResponse<any>>;
        createBranch: (repoPath: string, branchName: string, startPoint?: string) => Promise<IpcResponse<any>>;
        deleteBranch: (repoPath: string, branchName: string, force?: boolean) => Promise<IpcResponse<any>>;
        renameBranch: (repoPath: string, oldName: string, newName: string) => Promise<IpcResponse<any>>;
        getBranches: (repoPath: string) => Promise<IpcResponse<{ current: string, local: Array<{ name: string, ahead: number, behind: number }>, remote: string[] }>>;
        getCommitFiles: (repoPath: string, commitHash: string) => Promise<IpcResponse<any[]>>;
        getCommitFileDiff: (
          repoPath: string,
          commitHash: string,
          filePath: string,
          oldPath?: string,
          status?: string
        ) => Promise<IpcResponse<{ before: string, after: string, isBinary: boolean }>>;
        add: (repoPath: string, filePath: string) => Promise<IpcResponse<void>>;
        reset: (repoPath: string, filePath: string) => Promise<IpcResponse<void>>;
        applyPatch: (repoPath: string, patch: string, options?: { cached?: boolean; reverse?: boolean }) => Promise<IpcResponse<void>>;
        discardChanges: (repoPath: string, filePath: string, isStaged: boolean) => Promise<IpcResponse<void>>;
        resetToCommit: (repoPath: string, commitHash: string, mode: 'hard' | 'soft') => Promise<IpcResponse<void>>;
        squashCommits: (repoPath: string, commitHash: string, message: string) => Promise<IpcResponse<void>>;
        getWorktrees: (repoPath: string) => Promise<IpcResponse<Array<{ path: string; branch: string; hash: string }>>>;
        addWorktree: (repoPath: string, newPath: string, branch: string, baseBranch?: string) => Promise<IpcResponse<void>>;
        removeWorktree: (repoPath: string, targetPath: string) => Promise<IpcResponse<void>>;
        getTags: (repoPath: string) => Promise<IpcResponse<string[]>>;
        getUnpushedTags: (repoPath: string) => Promise<IpcResponse<string[]>>;
        createTag: (repoPath: string, tagName: string, target?: string) => Promise<IpcResponse<void>>;
        pushTags: (repoPath: string, remote?: string) => Promise<IpcResponse<void>>;
        deleteTag: (repoPath: string, tagName: string, deleteRemote?: boolean, remote?: string) => Promise<IpcResponse<void>>;
      },
      app: {
        openDirectory: () => Promise<{ canceled: boolean, path?: string }>;
        resolvePath: (repoPath: string) => Promise<{ success: boolean, path?: string, error?: string }>;
        exists: (repoPath: string) => Promise<{ success: boolean, exists: boolean, error?: string }>;
        openFile: (options?: any) => Promise<{ canceled: boolean, path?: string }>;
        copyToClipboard: (text: string) => Promise<{ success: boolean, error?: string }>;
        showMessageBox: (options: any) => Promise<{ success: boolean, response?: number, checkboxChecked?: boolean, error?: string }>;
        isTesting: boolean;
        disableDefaultTab: boolean;
      },
      updates: {
        check: () => Promise<{ success: boolean; current?: string; update?: UpdateInfo | null; error?: string }>;
        skipVersion: (version: string) => Promise<{ success: boolean; error?: string }>;
        setEnabled: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
        getSettings: () => Promise<{ success: boolean; data?: UpdateSettings; error?: string }>;
        onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
      }
    }
  }
}
