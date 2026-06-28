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

  ipcMain.handle('git:pull', async (_, repoPath) => {
    try {
      const data = await gitService.pull(repoPath)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:push', async (_, repoPath, force, remote, branch, setUpstream) => {
    try {
      const data = await gitService.push(repoPath, force, remote, branch, setUpstream)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getRemotes', async (_, repoPath) => {
    try {
      const data = await gitService.getRemotes(repoPath)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:addRemote', async (_, repoPath, name, url) => {
    try {
      const data = await gitService.addRemote(repoPath, name, url)
      return { success: true, data }
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

  ipcMain.handle('git:createBranch', async (_, repoPath, branchName, startPoint) => {
    try {
      const data = await gitService.createBranch(repoPath, branchName, startPoint)
      return { success: true, data: JSON.parse(JSON.stringify(data)) }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:deleteBranch', async (_, repoPath, branchName, force) => {
    try {
      const data = await gitService.deleteBranch(repoPath, branchName, force)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:renameBranch', async (_, repoPath, oldName, newName) => {
    try {
      const data = await gitService.renameBranch(repoPath, oldName, newName)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getBranches', async (_, repoPath) => {
    try {
      const data = await gitService.getBranches(repoPath)
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

  ipcMain.handle('git:stashAll', async (_, repoPath, message) => {
    try {
      await gitService.stashAll(repoPath, message)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:stashList', async (_, repoPath) => {
    try {
      const data = await gitService.stashList(repoPath)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:stashPop', async (_, repoPath, index) => {
    try {
      const data = await gitService.stashPop(repoPath, index)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:stashDrop', async (_, repoPath, index) => {
    try {
      const data = await gitService.stashDrop(repoPath, index)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getStashFiles', async (_, repoPath, index) => {
    try {
      const data = await gitService.getStashFiles(repoPath, index)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:getStashFileDiff', async (_, repoPath, index, filePath, oldPath, status, isUntracked) => {
    try {
      const data = await gitService.getStashFileDiff(repoPath, index, filePath, oldPath, status, isUntracked)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:setRepositoryIdentity', async (_, repoPath, identity) => {
    console.log('Main Process: git:setRepositoryIdentity called for path:', repoPath, 'with identity:', identity)
    try {
      const data = await gitService.setRepositoryIdentity(repoPath, identity)
      return { success: true, data }
    } catch (error: any) {
      console.error('Main Process: git:setRepositoryIdentity failed:', error.message)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:validateToken', async (_, { provider, token, email }) => {
    try {
      let url = ''
      const headers: Record<string, string> = {
        'User-Agent': 'ultra-git'
      }

      if (provider === 'github') {
        url = 'https://api.github.com/user'
        headers['Authorization'] = `token ${token}`
        headers['Accept'] = 'application/vnd.github.v3+json'
      } else if (provider === 'gitlab') {
        url = 'https://gitlab.com/api/v4/user'
        headers['Authorization'] = `Bearer ${token}`
      } else if (provider === 'bitbucket') {
        url = 'https://api.bitbucket.org/2.0/user'
        if (email) {
          const authString = Buffer.from(`${email}:${token}`).toString('base64')
          headers['Authorization'] = `Basic ${authString}`
        } else {
          headers['Authorization'] = `Bearer ${token}`
        }
      } else {
        return { success: false, error: 'Unsupported provider' }
      }

      const response = await fetch(url, { headers })
      if (!response.ok) {
        return { success: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      const data: any = await response.json()
      let name = ''
      let email = ''
      let username = ''
      let avatarUrl = ''

      if (provider === 'github') {
        name = data.name || data.login || ''
        email = data.email || `${data.login}@users.noreply.github.com`
        username = data.login || ''
        avatarUrl = data.avatar_url || ''
      } else if (provider === 'gitlab') {
        name = data.name || data.username || ''
        email = data.email || `${data.username}@noreply.gitlab.com`
        username = data.username || ''
        avatarUrl = data.avatar_url || ''
      } else if (provider === 'bitbucket') {
        name = data.display_name || data.username || ''
        email = data.email || ''
        username = data.username || ''
        avatarUrl = data.links?.avatar?.href || ''
      }

      return {
        success: true,
        data: { name, email, username, avatarUrl }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('git:createRemoteRepo', async (_, { provider, token, repoName, makePublic }) => {
    try {
      let url = ''
      const headers: Record<string, string> = {
        'User-Agent': 'ultra-git',
        'Content-Type': 'application/json'
      }
      let body: any = {}

      if (provider === 'github') {
        url = 'https://api.github.com/user/repos'
        headers['Authorization'] = `token ${token}`
        headers['Accept'] = 'application/vnd.github.v3+json'
        body = {
          name: repoName,
          private: !makePublic
        }
      } else if (provider === 'gitlab') {
        url = 'https://gitlab.com/api/v4/projects'
        headers['Authorization'] = `Bearer ${token}`
        body = {
          name: repoName,
          visibility: makePublic ? 'public' : 'private'
        }
      } else {
        return { success: false, error: 'Unsupported provider for automatic repository creation' }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        return { success: false, error: `API error (${response.status}): ${errorText}` }
      }

      const data = await response.json()
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

  ipcMain.handle('dialog:openFile', async (_, options) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      ...options
    })
    if (result.canceled) {
      return { canceled: true }
    } else {
      return { canceled: false, path: result.filePaths[0] }
    }
  })

  ipcMain.handle('dialog:showMessageBox', async (_, options) => {
    try {
      const result = await dialog.showMessageBox(mainWindow!, options)
      return { success: true, response: result.response }
    } catch (error: any) {
      return { success: false, error: error.message }
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
