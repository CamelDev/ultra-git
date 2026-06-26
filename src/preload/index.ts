import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke('git:log', repoPath, maxCount),
    fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
    checkout: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:checkout', repoPath, branchName),
    getCommitFiles: (repoPath: string, commitHash: string) => ipcRenderer.invoke('git:getCommitFiles', repoPath, commitHash),
    getCommitFileDiff: (repoPath: string, commitHash: string, filePath: string, oldPath?: string, status?: string) => 
      ipcRenderer.invoke('git:getCommitFileDiff', repoPath, commitHash, filePath, oldPath, status),
    add: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:add', repoPath, filePath),
    reset: (repoPath: string, filePath: string) => ipcRenderer.invoke('git:reset', repoPath, filePath),
    addAll: (repoPath: string) => ipcRenderer.invoke('git:addAll', repoPath),
    resetAll: (repoPath: string) => ipcRenderer.invoke('git:resetAll', repoPath),
    commit: (repoPath: string, message: string) => ipcRenderer.invoke('git:commit', repoPath, message),
    getActiveFileDiff: (repoPath: string, filePath: string, isStaged: boolean, oldPath?: string) => 
      ipcRenderer.invoke('git:getActiveFileDiff', repoPath, filePath, isStaged, oldPath),
    watchRepo: (repoPath: string | null) => ipcRenderer.invoke('git:watchRepo', repoPath),
    onRepoChanged: (callback: (repoPath: string) => void) => {
      const listener = (_event: any, path: string) => callback(path)
      ipcRenderer.on('git:repo-changed', listener)
      return () => {
        ipcRenderer.off('git:repo-changed', listener)
      }
    }
  },
  app: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    resolvePath: (repoPath: string) => ipcRenderer.invoke('app:resolvePath', repoPath),
    copyToClipboard: (text: string) => ipcRenderer.invoke('app:copyToClipboard', text)
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
