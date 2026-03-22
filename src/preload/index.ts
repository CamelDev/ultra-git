import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  git: {
    status: (repoPath: string) => ipcRenderer.invoke('git:status', repoPath),
    log: (repoPath: string, maxCount?: number) => ipcRenderer.invoke('git:log', repoPath, maxCount),
    fetch: (repoPath: string) => ipcRenderer.invoke('git:fetch', repoPath),
    checkout: (repoPath: string, branchName: string) => ipcRenderer.invoke('git:checkout', repoPath, branchName)
  },
  app: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
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
