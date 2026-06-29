/// <reference types="vite/client" />
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      git: {
        status: (repoPath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        log: (repoPath: string, maxCount?: number) => Promise<{ success: boolean; data?: any; error?: string }>;
        fetch: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        pull: (repoPath: string) => Promise<{ success: boolean; data?: { hadConflicts: boolean }; error?: string }>;
        push: (repoPath: string, force?: boolean, remote?: string, branch?: string, setUpstream?: boolean) => Promise<{ success: boolean; error?: string }>;
        getRemotes: (repoPath: string) => Promise<{ success: boolean; data?: Array<{ name: string; refs: { fetch: string; push: string } }>; error?: string }>;
        addRemote: (repoPath: string, name: string, url: string) => Promise<{ success: boolean; error?: string }>;
        createBranch: (repoPath: string, branchName: string, startPoint?: string) => Promise<{ success: boolean; error?: string }>;
        deleteBranch: (repoPath: string, branchName: string, force?: boolean) => Promise<{ success: boolean; error?: string }>;
        renameBranch: (repoPath: string, oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>;
        getBranches: (repoPath: string) => Promise<{ success: boolean; data?: { current: string; local: Array<{ name: string; ahead: number; behind: number }>; remote: string[] }; error?: string }>;
        checkout: (repoPath: string, branchName: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        getCommitFiles: (repoPath: string, commitHash: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string, oldPath?: string, status?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        add: (repoPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
        reset: (repoPath: string, filePath: string) => Promise<{ success: boolean; error?: string }>;
        resetToCommit: (repoPath: string, commitHash: string, mode: 'hard' | 'soft') => Promise<{ success: boolean; error?: string }>;
        squashCommits: (repoPath: string, commitHash: string, message: string) => Promise<{ success: boolean; error?: string }>;
        addAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        resetAll: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        commit: (repoPath: string, message: string) => Promise<{ success: boolean; error?: string }>;
        getActiveFileDiff: (repoPath: string, filePath: string, isStaged: boolean, oldPath?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        stashAll: (repoPath: string, message?: string) => Promise<{ success: boolean; error?: string }>;
        stashList: (repoPath: string) => Promise<{ success: boolean; data?: Array<{ index: number; ref: string; message: string; date: string }>; error?: string }>;
        stashPop: (repoPath: string, index: number) => Promise<{ success: boolean; data?: { hadConflicts: boolean }; error?: string }>;
        stashDrop: (repoPath: string, index: number) => Promise<{ success: boolean; data?: any; error?: string }>;
        getStashFiles: (repoPath: string, index: number) => Promise<{ success: boolean; data?: Array<{ status: string; path: string; oldPath?: string; isUntracked?: boolean }>; error?: string }>;
        getStashFileDiff: (repoPath: string, index: number, filePath: string, oldPath?: string, status?: string, isUntracked?: boolean) => Promise<{ success: boolean; data?: { before: string; after: string; isBinary: boolean }; error?: string }>;
        setRepositoryIdentity: (repoPath: string, identity: { name: string; email: string; sshKeyPath?: string; personalAccessToken?: string; username?: string; provider?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
        validateToken: (provider: string, token: string, email?: string) => Promise<{ success: boolean; data?: { name: string; email: string; username: string; avatarUrl: string }; error?: string }>;
        createRemoteRepo: (provider: string, token: string, repoName: string, makePublic: boolean) => Promise<{ success: boolean; data?: any; error?: string }>;
        watchRepo: (repoPath: string | null) => Promise<{ success: boolean; error?: string }>;
        onRepoChanged: (callback: (repoPath: string) => void) => () => void;
        merge: (repoPath: string, sourceBranch: string, strategy: 'merge' | 'no-ff' | 'squash') => Promise<{ success: boolean; data?: { hadConflicts: boolean; conflictedFiles: Array<{ path: string; status: string }> }; error?: string }>;
        rebase: (repoPath: string, ontoBranch: string) => Promise<{ success: boolean; data?: { hadConflicts: boolean; conflictedFiles: Array<{ path: string; status: string }> }; error?: string }>;
        abortMerge: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        abortRebase: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        continueRebase: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        getConflictedFiles: (repoPath: string) => Promise<{ success: boolean; data?: Array<{ path: string; status: string }>; error?: string }>;
        getConflictFileDiff: (repoPath: string, filePath: string) => Promise<{ success: boolean; data?: { raw: string; hunks: Array<{ ours: string; base: string; theirs: string; startLine: number }> }; error?: string }>;
        resolveConflict: (repoPath: string, filePath: string, resolvedContent: string) => Promise<{ success: boolean; error?: string }>;
        getMergeStatus: (repoPath: string) => Promise<{ success: boolean; data?: { isMerge: boolean; isRebase: boolean; isCherryPick?: boolean; inProgress: boolean }; error?: string }>;
        getTags: (repoPath: string) => Promise<{ success: boolean; data?: string[]; error?: string }>;
        createTag: (repoPath: string, tagName: string) => Promise<{ success: boolean; error?: string }>;
        pushTags: (repoPath: string, remote?: string) => Promise<{ success: boolean; error?: string }>;
        deleteTag: (repoPath: string, tagName: string, deleteRemote?: boolean, remote?: string) => Promise<{ success: boolean; error?: string }>;
        getWorktrees: (repoPath: string) => Promise<{ success: boolean; data?: Array<{ path: string; branch: string; hash: string }>; error?: string }>;
        addWorktree: (repoPath: string, newPath: string, branch: string, baseBranch?: string) => Promise<{ success: boolean; error?: string }>;
        removeWorktree: (repoPath: string, targetPath: string) => Promise<{ success: boolean; error?: string }>;
        getBranchCommits: (repoPath: string, branchName: string, maxCount?: number) => Promise<{ success: boolean; data?: any; error?: string }>;
        cherryPick: (repoPath: string, commitHash: string) => Promise<{ success: boolean; data?: { success: boolean; error?: string; hadConflicts?: boolean }; error?: string }>;
        abortCherryPick: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
        continueCherryPick: (repoPath: string) => Promise<{ success: boolean; error?: string }>;
      };
      app: {
        openDirectory: () => Promise<{ canceled: boolean; path?: string }>;
        openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; path?: string }>;
        resolvePath: (repoPath: string) => Promise<{ success: boolean; path?: string; error?: string }>;
        copyToClipboard: (text: string) => Promise<{ success: boolean; error?: string }>;
        showMessageBox: (options: {
          type: 'info' | 'warning' | 'error' | 'question';
          title: string;
          message: string;
          buttons?: string[];
          defaultId?: number;
          cancelId?: number;
          checkboxLabel?: string;
          checkboxChecked?: boolean;
        }) => Promise<{ success: boolean; response?: number; checkboxChecked?: boolean; error?: string }>;
        isTesting: boolean;
        disableDefaultTab: boolean;
      };
    }
  }
}
