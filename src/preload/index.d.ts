import { ElectronAPI } from '@electron-toolkit/preload'

// Types for IPC responses
export type IpcResponse<T = any> = {
  success: boolean;
  data?: T;
  error?: string;
};

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      git: {
        status: (repoPath: string) => Promise<IpcResponse<any>>;
        log: (repoPath: string, maxCount?: number) => Promise<IpcResponse<any>>;
        fetch: (repoPath: string) => Promise<IpcResponse<void>>;
        checkout: (repoPath: string, branchName: string) => Promise<IpcResponse<any>>;
        getCommitFiles: (repoPath: string, commitHash: string) => Promise<IpcResponse<any[]>>;
        getCommitFileDiff: (
          repoPath: string,
          commitHash: string,
          filePath: string,
          oldPath?: string,
          status?: string
        ) => Promise<IpcResponse<{ before: string, after: string, isBinary: boolean }>>;
      },
      app: {
        openDirectory: () => Promise<{ canceled: boolean, path?: string }>;
        resolvePath: (repoPath: string) => Promise<{ success: boolean, path?: string, error?: string }>;
      }
    }
  }
}
