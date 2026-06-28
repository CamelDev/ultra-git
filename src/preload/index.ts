import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke('git:log', repoPath, maxCount),
    fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
    pull: (repoPath: string) => ipcRenderer.invoke('git:pull', repoPath),
    push: (repoPath: string, force?: boolean, remote?: string, branch?: string, setUpstream?: boolean) => 
      ipcRenderer.invoke('git:push', repoPath, force, remote, branch, setUpstream),
    getRemotes: (repoPath: string) => ipcRenderer.invoke('git:getRemotes', repoPath),
    addRemote: (repoPath: string, name: string, url: string) => ipcRenderer.invoke('git:addRemote', repoPath, name, url),
    checkout: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:checkout', repoPath, branchName),
    createBranch: (repoPath: string, branchName: string, startPoint?: string) => ipcRenderer.invoke('git:createBranch', repoPath, branchName, startPoint),
    deleteBranch: (repoPath: string, branchName: string, force?: boolean) => ipcRenderer.invoke('git:deleteBranch', repoPath, branchName, force),
    renameBranch: (repoPath: string, oldName: string, newName: string) => ipcRenderer.invoke('git:renameBranch', repoPath, oldName, newName),
    getBranches: (repoPath: string) => ipcRenderer.invoke('git:getBranches', repoPath),
    getCommitFiles: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:getCommitFiles', repoPath, commitHash),
    getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string, oldPath?: string, status?: string) => 
      ipcRenderer.invoke('git:getCommitFileDiff', repoPath, commitHash, filePath, oldPath, status),
    add: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:add', repoPath, filePath),
    reset: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:reset', repoPath, filePath),
    resetToCommit: (repoPath: string, commitHash: string, mode: 'hard' | 'soft') => 
      ipcRenderer.invoke('git:resetToCommit', repoPath, commitHash, mode),
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
  },
  app: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    openFile: (options?: any) => ipcRenderer.invoke('dialog:openFile', options),
    resolvePath: (repoPath: string) => ipcRenderer.invoke('app:resolvePath', repoPath),
    copyToClipboard: (text: string) => ipcRenderer.invoke('app:copyToClipboard', text),
    showMessageBox: (options: any) => ipcRenderer.invoke('dialog:showMessageBox', options)
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
