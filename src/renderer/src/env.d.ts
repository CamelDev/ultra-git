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
        checkout: (repoPath: string, branchName: string) => Promise<{ success: boolean; data?: any; error?: string }>;
      }
    }
  }
}
