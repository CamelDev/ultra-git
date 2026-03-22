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
      },
      app: {
        openDirectory: () => Promise<{ canceled: boolean, path?: string }>;
      }
    }
  }
}
