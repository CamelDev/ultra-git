import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke('git:log', repoPath, maxCount),
    fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
    pull: (repoPath: string, prune?: boolean) => ipcRenderer.invoke('git:pull', repoPath, prune),
    pullPreflight: (repoPath: string) => ipcRenderer.invoke('git:pullPreflight', repoPath),
    smartPull: (repoPath: string, options?: { strategy?: 'merge' | 'rebase' | 'ff-only'; stash?: boolean; stashIncludeUntracked?: boolean; prune?: boolean }) =>
      ipcRenderer.invoke('git:smartPull', repoPath, options),
    push: (repoPath: string, force?: boolean, remote?: string, branch?: string, setUpstream?: boolean) => 
      ipcRenderer.invoke('git:push', repoPath, force, remote, branch, setUpstream),
    getRemotes: (repoPath: string) => ipcRenderer.invoke('git:getRemotes', repoPath),
    addRemote: (repoPath: string, name: string, url: string) => ipcRenderer.invoke('git:addRemote', repoPath, name, url),
    checkout: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:checkout', repoPath, branchName),
    checkIndexLock: (repoPath: string) => ipcRenderer.invoke('git:checkIndexLock', repoPath),
    removeIndexLock: (repoPath: string) => ipcRenderer.invoke('git:removeIndexLock', repoPath),
    createBranch: (repoPath: string, branchName: string, startPoint?: string) => ipcRenderer.invoke('git:createBranch', repoPath, branchName, startPoint),
    deleteBranch: (repoPath: string, branchName: string, force?: boolean) => ipcRenderer.invoke('git:deleteBranch', repoPath, branchName, force),
    renameBranch: (repoPath: string, oldName: string, newName: string) => ipcRenderer.invoke('git:renameBranch', repoPath, oldName, newName),
    getBranches: (repoPath: string) => ipcRenderer.invoke('git:getBranches', repoPath),
    getCommitFiles: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:getCommitFiles', repoPath, commitHash),
    getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string, oldPath?: string, status?: string) => 
      ipcRenderer.invoke('git:getCommitFileDiff', repoPath, commitHash, filePath, oldPath, status),
    add: (repoPath: string, filePath: string | string[]) => ipcRenderer.invoke('git:add', repoPath, filePath),
    reset: (repoPath: string, filePath: string | string[]) => ipcRenderer.invoke('git:reset', repoPath, filePath),
    applyPatch: (repoPath: string, patch: string, options?: { cached?: boolean; reverse?: boolean }) =>
      ipcRenderer.invoke('git:applyPatch', repoPath, patch, options),
    discardChanges: (repoPath: string, filePath: string | string[], isStaged: boolean) => 
      ipcRenderer.invoke('git:discardChanges', repoPath, filePath, isStaged),
    resetToCommit: (repoPath: string, commitHash: string, mode: 'hard' | 'soft') => 
      ipcRenderer.invoke('git:resetToCommit', repoPath, commitHash, mode),
    squashCommits: (repoPath: string, commitHash: string, message: string) =>
      ipcRenderer.invoke('git:squashCommits', repoPath, commitHash, message),
    addAll: (repoPath: string) => ipcRenderer.invoke('git:addAll', repoPath),
    resetAll: (repoPath: string) => ipcRenderer.invoke('git:resetAll', repoPath),
    commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
    getActiveFileDiff: (repoPath: string, filePath: string, isStaged: boolean, oldPath?: string) => 
      ipcRenderer.invoke('git:getActiveFileDiff', repoPath, filePath, isStaged, oldPath),
    stashAll: (repoPath: string, message?: string) => ipcRenderer.invoke('git:stashAll', repoPath, message),
    stashList: (repoPath: string) => ipcRenderer.invoke('git:stashList', repoPath),
    stashPop: (repoPath: string, index: number) => ipcRenderer.invoke('git:stashPop', repoPath, index),
    stashDrop: (repoPath: string, index: number) => ipcRenderer.invoke('git:stashDrop', repoPath, index),
    getStashFiles: (repoPath: string, index: number) => ipcRenderer.invoke('git:getStashFiles', repoPath, index),
    getStashFileDiff: (repoPath: string, index: number, filePath: string, oldPath?: string, status?: string, isUntracked?: boolean) => 
      ipcRenderer.invoke('git:getStashFileDiff', repoPath, index, filePath, oldPath, status, isUntracked),
    setRepositoryIdentity: (repoPath: string, identity: any) => ipcRenderer.invoke('git:setRepositoryIdentity', repoPath, identity),
    validateToken: (provider: string, token: string, email?: string) => ipcRenderer.invoke('git:validateToken', { provider, token, email }),
    createRemoteRepo: (provider: string, token: string, repoName: string, makePublic: boolean) => 
      ipcRenderer.invoke('git:createRemoteRepo', { provider, token, repoName, makePublic }),
    watchRepo: (repoPath: string | null) => ipcRenderer.invoke('git:watchRepo', repoPath),
    onRepoChanged: (callback: (repoPath: string) => void) => {
      const listener = (_event: any, path: string) => callback(path)
      ipcRenderer.on('git:repo-changed', listener)
      return () => {
        ipcRenderer.off('git:repo-changed', listener)
      }
    },
    merge: (repoPath: string, sourceBranch: string, strategy: 'merge' | 'no-ff' | 'squash') =>
      ipcRenderer.invoke('git:merge', repoPath, sourceBranch, strategy),
    rebase: (repoPath: string, ontoBranch: string) =>
      ipcRenderer.invoke('git:rebase', repoPath, ontoBranch),
    abortMerge: (repoPath: string) => ipcRenderer.invoke('git:abortMerge', repoPath),
    abortRebase: (repoPath: string) => ipcRenderer.invoke('git:abortRebase', repoPath),
    continueRebase: (repoPath: string) => ipcRenderer.invoke('git:continueRebase', repoPath),
    getConflictedFiles: (repoPath: string) => ipcRenderer.invoke('git:getConflictedFiles', repoPath),
    getConflictFileDiff: (repoPath: string, filePath: string) =>
      ipcRenderer.invoke('git:getConflictFileDiff', repoPath, filePath),
    resolveConflict: (repoPath: string, filePath: string, resolvedContent: string) =>
      ipcRenderer.invoke('git:resolveConflict', repoPath, filePath, resolvedContent),
    getMergeStatus: (repoPath: string) => ipcRenderer.invoke('git:getMergeStatus', repoPath),
    getTags: (repoPath: string) => ipcRenderer.invoke('git:getTags', repoPath),
    getUnpushedTags: (repoPath: string) => ipcRenderer.invoke('git:getUnpushedTags', repoPath),
    createTag: (repoPath: string, tagName: string, target?: string) =>
      ipcRenderer.invoke('git:createTag', repoPath, tagName, target),
    pushTags: (repoPath: string, remote?: string) => ipcRenderer.invoke('git:pushTags', repoPath, remote),
    deleteTag: (repoPath: string, tagName: string, deleteRemote?: boolean, remote?: string) =>
      ipcRenderer.invoke('git:deleteTag', repoPath, tagName, deleteRemote, remote),
    getWorktrees: (repoPath: string) => ipcRenderer.invoke('git:getWorktrees', repoPath),
    addWorktree: (repoPath: string, newPath: string, branch: string, baseBranch?: string) => ipcRenderer.invoke('git:addWorktree', repoPath, newPath, branch, baseBranch),
    removeWorktree: (repoPath: string, targetPath: string) => ipcRenderer.invoke('git:removeWorktree', repoPath, targetPath),
    getBranchCommits: (repoPath: string, branchName: string, maxCount?: number) => ipcRenderer.invoke('git:getBranchCommits', repoPath, branchName, maxCount),
    cherryPick: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:cherryPick', repoPath, commitHash),
    abortCherryPick: (repoPath: string) => ipcRenderer.invoke('git:abortCherryPick', repoPath),
    continueCherryPick: (repoPath: string) => ipcRenderer.invoke('git:continueCherryPick', repoPath),
    undoCommit: (repoPath: string) => ipcRenderer.invoke('git:undoCommit', repoPath),
    createSafetySnapshot: (repoPath: string, filePaths?: string[]) => ipcRenderer.invoke('git:createSafetySnapshot', repoPath, filePaths),
    restoreSafetySnapshot: (repoPath: string, snapshotId: string) => ipcRenderer.invoke('git:restoreSafetySnapshot', repoPath, snapshotId),
    deleteSafetySnapshot: (repoPath: string, snapshotId: string) => ipcRenderer.invoke('git:deleteSafetySnapshot', repoPath, snapshotId),
  },
  app: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    resolvePath: (repoPath: string) => ipcRenderer.invoke('app:resolvePath', repoPath),
    exists: (repoPath: string) => ipcRenderer.invoke('app:exists', repoPath),
    copyToClipboard: (text: string) => ipcRenderer.invoke('app:copyToClipboard', text),
    showMessageBox: (options: any) => ipcRenderer.invoke('dialog:showMessageBox', options),
    isTesting: process.env.ULTRA_GIT_TESTING === 'true',
    disableDefaultTab: process.env.ULTRA_GIT_DISABLE_DEFAULT_TAB === 'true'
  },
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    skipVersion: (version: string) => ipcRenderer.invoke('update:skipVersion', version),
    getSettings: () => ipcRenderer.invoke('update:getSettings'),
    onUpdateAvailable: (callback: (info: any) => void) => {
      const listener = (_event: any, info: any) => callback(info)
      ipcRenderer.on('update:available', listener)
      return () => {
        ipcRenderer.off('update:available', listener)
      }
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
