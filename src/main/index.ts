import { app, shell, BrowserWindow, ipcMain, dialog, clipboard } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { gitService } from './git'
import { watchDirectory, stopWatching } from './watcher'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    icon,
    titleBarStyle: 'hidden',
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#161920',
        symbolColor: '#94a3b8',
        height: 48
      }
    } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow?.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow?.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron.ultra-git')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register Git IPC Handlers
  ipcMain.handle('git:status', async (_, repoPath) => {
    try {
      const data = await gitService.status(repoPath)
      return { success: true, data: JSON.parse(JSON.stringify(data)) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:log', async (_, repoPath, maxCount) => {
    try {
      const data = await gitService.log(repoPath, maxCount)
      return { success: true, data: JSON.parse(JSON.stringify(data)) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:fetch', async (_, repoPath) => {
    try {
      await gitService.fetch(repoPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:checkout', async (_, repoPath, branchName) => {
    try {
      const data = await gitService.checkout(repoPath, branchName)
      return { success: true, data: JSON.parse(JSON.stringify(data)) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getCommitFiles', async (_, repoPath, commitHash) => {
    try {
      const data = await gitService.getCommitFiles(repoPath, commitHash)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getCommitFileDiff', async (_, repoPath, commitHash, filePath, oldPath, status) => {
    try {
      const data = await gitService.getCommitFileDiff(repoPath, commitHash, filePath, oldPath, status)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:add', async (_, repoPath, filePath) => {
    try {
      await gitService.add(repoPath, filePath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:reset', async (_, repoPath, filePath) => {
    try {
      await gitService.reset(repoPath, filePath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:addAll', async (_, repoPath) => {
    try {
      await gitService.addAll(repoPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:resetAll', async (_, repoPath) => {
    try {
      await gitService.resetAll(repoPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:commit', async (_, repoPath, message) => {
    try {
      await gitService.commit(repoPath, message)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getActiveFileDiff', async (_, repoPath, filePath, isStaged, oldPath) => {
    try {
      const data = await gitService.getActiveFileDiff(repoPath, filePath, isStaged, oldPath)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('dialog:openDirectory', async () => {
    console.log('Main Process: Received dialog:openDirectory request');
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) {
      return { canceled: true }
    } else {
      return { canceled: false, path: result.filePaths[0] }
    }
  })

  ipcMain.handle('app:resolvePath', async (_, repoPath) => {
    try {
      return { success: true, path: resolve(repoPath) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('app:copyToClipboard', async (_, text) => {
    try {
      clipboard.writeText(text)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:watchRepo', async (_, repoPath) => {
    try {
      if (!repoPath) {
        stopWatching()
        return { success: true }
      }
      watchDirectory(repoPath, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('git:repo-changed', repoPath)
        }
      })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  stopWatching()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
