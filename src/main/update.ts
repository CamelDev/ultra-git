import { app, ipcMain, BrowserWindow } from 'electron'
import https from 'https'
import crypto from 'crypto'
import fs from 'fs'
import { join } from 'path'

const UPDATE_URL =
  process.env.ULTRAGIT_UPDATE_URL || 'https://ultragit.intheloop.pro/latest'

export interface UpdateInfo {
  latest: string
  url: string
  publishedAt: string | null
  notes: string
}

// ---------- settings helpers ----------
// ultra-git has no storage-handler module; the settings file lives directly
// under userData/settings.json.
function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function readSettings(): any {
  try {
    const p = getSettingsPath()
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { /* fresh */ }
  return {}
}

function updateSettings(mutator: (s: any) => void): void {
  try {
    const p = getSettingsPath()
    const settings = readSettings()
    mutator(settings)
    fs.writeFileSync(p, JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error('[updates] Failed to write settings:', err)
  }
}

// ---------- install ID ----------
export function getInstallId(): string {
  const settings = readSettings()
  if (!settings.installId) {
    settings.installId = crypto.randomUUID()
    updateSettings(s => { s.installId = settings.installId })
  }
  return settings.installId
}

// ---------- semver compare (no dep) ----------
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^[vV]/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^[vV]/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

// ---------- HTTPS GET JSON ----------
function httpsGetJson(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body))
          } else {
            reject(new Error(`HTTP ${res.statusCode}`))
          }
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

// ---------- the check ----------
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  const settings = readSettings()
  if (settings.updates?.enabled === false) return null // user opted out

  const id = getInstallId()
  const url = `${UPDATE_URL}?v=${encodeURIComponent(app.getVersion())}`
            + `&os=${process.platform}&id=${id}`

  const res = await httpsGetJson(url, 5000).catch(() => null)
  if (!res?.latest) return null
  if (compareVersions(res.latest, app.getVersion()) <= 0) return null
  if (res.latest === settings.updates?.skippedVersion) return null

  return {
    latest: res.latest,
    url: res.url,
    publishedAt: res.publishedAt ?? null,
    notes: res.notes ?? '',
  }
}

// Same as checkForUpdates but also reports whether the server was reached.
async function queryUpdateServer(): Promise<{ contacted: boolean; update: UpdateInfo | null }> {
  const settings = readSettings()
  if (settings.updates?.enabled === false) return { contacted: false, update: null }

  const id = getInstallId()
  const url = `${UPDATE_URL}?v=${encodeURIComponent(app.getVersion())}`
            + `&os=${process.platform}&id=${id}`

  const res = await httpsGetJson(url, 5000).catch(() => null)
  if (!res?.latest) return { contacted: false, update: null }
  if (compareVersions(res.latest, app.getVersion()) <= 0) return { contacted: true, update: null }
  if (res.latest === settings.updates?.skippedVersion) return { contacted: true, update: null }

  return {
    contacted: true,
    update: {
      latest: res.latest,
      url: res.url,
      publishedAt: res.publishedAt ?? null,
      notes: res.notes ?? '',
    },
  }
}

// ---------- IPC ----------
export function registerUpdateHandlers(getWin: () => BrowserWindow | null) {
  ipcMain.handle('update:check', async () => {
    const info = await checkForUpdates()
    return { success: true, current: app.getVersion(), update: info }
  })

  ipcMain.handle('update:skipVersion', async (_, version: string) => {
    updateSettings(s => {
      s.updates = { ...(s.updates || {}), skippedVersion: version }
    })
    return { success: true }
  })

  ipcMain.handle('update:setEnabled', async (_, enabled: boolean) => {
    updateSettings(s => {
      s.updates = { ...(s.updates || {}), enabled: !!enabled }
    })
    return { success: true }
  })

  ipcMain.handle('update:getSettings', async () => {
    const settings = readSettings()
    return {
      success: true,
      data: {
        enabled: settings.updates?.enabled !== false,
        skippedVersion: settings.updates?.skippedVersion ?? null,
        lastCheckedAt: settings.updates?.lastCheckedAt ?? null,
      },
    }
  })
}

// ---------- startup + daily auto-check ----------
const RECHECK_AFTER_MS = 24 * 60 * 60 * 1000   // re-check at least daily…
const TICK_MS          = 60 * 60 * 1000        // …on an hourly timer tick

export function scheduleUpdateChecks(getWin: () => BrowserWindow | null) {
  if (!app.isPackaged || process.env.NODE_ENV === 'test' || process.env.ULTRA_GIT_TESTING === 'true') return   // dev/test: no ping

  const run = async () => {
    const { contacted, update } = await queryUpdateServer()
    // Only stamp lastCheckedAt on successful contact — otherwise an offline
    // machine would go silent for 24 h after every failed tick.
    if (contacted) {
      updateSettings(s => {
        s.updates = { ...(s.updates || {}), lastCheckedAt: new Date().toISOString() }
      })
    }
    if (update) getWin()?.webContents.send('update:available', update)
  }

  setTimeout(run, 5000)                                            // 5 s after start

  // People keep laptops running for months — an hourly tick that fires a
  // re-check once 24 h have elapsed. Comparing wall-clock timestamps (instead
  // of a naive 24 h setInterval) means sleep/suspend time counts too.
  setInterval(() => {
    const last = readSettings().updates?.lastCheckedAt
    if (!last) { run(); return }
    const parsed = Date.parse(last)
    if (isNaN(parsed)) { run(); return } // corrupt timestamp → recheck
    if (Date.now() - parsed >= RECHECK_AFTER_MS) run()
  }, TICK_MS)
}
