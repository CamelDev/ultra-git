import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

const RED_1X1_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='
const BLUE_2X2_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGNgYPj/H4KhDAA/0gf5tBJPzQAAAABJRU5ErkJggg=='

const INITIAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="40" fill="red"/>
</svg>`

const UPDATED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="80" fill="blue"/>
</svg>`

test.describe('Image & Graphic Diff Preview in Diff Modal', () => {
  let sandbox: GitSandbox

  test.beforeAll(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()

    // 1. Initial commit with PNG and SVG
    const png1 = Buffer.from(RED_1X1_PNG_BASE64, 'base64')
    fs.writeFileSync(path.join(sandbox.dir, 'logo.png'), png1)
    fs.writeFileSync(path.join(sandbox.dir, 'icon.svg'), INITIAL_SVG)
    fs.writeFileSync(path.join(sandbox.dir, 'readme.txt'), 'Hello Git')
    await sandbox.git.add(['logo.png', 'icon.svg', 'readme.txt'])
    await sandbox.git.commit('Initial commit with assets')

    // 2. Modify PNG and SVG
    const png2 = Buffer.from(BLUE_2X2_PNG_BASE64, 'base64')
    fs.writeFileSync(path.join(sandbox.dir, 'logo.png'), png2)
    fs.writeFileSync(path.join(sandbox.dir, 'icon.svg'), UPDATED_SVG)
    await sandbox.git.add(['logo.png', 'icon.svg'])
    await sandbox.git.commit('Update logo.png and icon.svg')

    // 3. Add a newly created graphic asset
    fs.writeFileSync(path.join(sandbox.dir, 'banner.jpg'), png2)
    await sandbox.git.add(['banner.jpg'])
    await sandbox.git.commit('Add banner.jpg')
  })

  test.afterAll(async () => {
    await sandbox.destroy()
  })

  test('should automatically render ImageDiffView for PNG image diffs without showing binary placeholder', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      // Mock openDirectory to point to sandbox
      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Locate the commit: "Update logo.png and icon.svg" (2nd in list below "Add banner.jpg")
      const commitItems = page.locator('.commit-item')
      const updateAssetsCommit = commitItems.nth(1)
      await expect(updateAssetsCommit).toContainText('Update logo.png and icon.svg')
      await updateAssetsCommit.click()
      await page.waitForTimeout(600)

      // Locate logo.png in commit details file list
      const pngFileRow = page.locator('.file-item', { hasText: 'logo.png' }).first()
      await expect(pngFileRow).toBeVisible()
      await pngFileRow.click()

      // Verify diff modal opens
      const diffModal = page.locator('.diff-modal-content')
      await expect(diffModal).toBeVisible()

      // Verify binary file placeholder is NOT visible for known pics
      const binaryPlaceholder = page.locator('[data-testid="binary-file-placeholder"]')
      await expect(binaryPlaceholder).not.toBeVisible()

      // Verify ImageDiffView is rendered automatically
      const imageDiffView = page.locator('[data-testid="image-diff-view"]')
      await expect(imageDiffView).toBeVisible()

      // Verify dedicated green Preview button is visible and active
      const previewBtn = page.locator('[data-testid="toggle-preview-btn"]')
      await expect(previewBtn).toBeVisible()
      await expect(previewBtn).toHaveClass(/active/)

      // Verify 2-Up mode by default
      const beforeMeta = page.locator('[data-testid="before-meta"]')
      const afterMeta = page.locator('[data-testid="after-meta"]')
      await expect(beforeMeta).toBeVisible()
      await expect(afterMeta).toBeVisible()

      // Verify mode switching: Swipe mode
      const swipeBtn = page.locator('[data-testid="img-mode-swipe"]')
      await swipeBtn.click()
      const swipeContainer = page.locator('[data-testid="image-swipe-container"]')
      await expect(swipeContainer).toBeVisible()
      const swipeDivider = page.locator('[data-testid="swipe-divider"]')
      await expect(swipeDivider).toBeVisible()

      // Verify mode switching: Blend mode
      const blendBtn = page.locator('[data-testid="img-mode-blend"]')
      await blendBtn.click()
      const blendContainer = page.locator('[data-testid="image-blend-container"]')
      await expect(blendContainer).toBeVisible()
      const blendSlider = page.locator('[data-testid="blend-slider-bar"]')
      await expect(blendSlider).toBeVisible()

      // Verify mode switching: Difference mode
      const diffBtn = page.locator('[data-testid="img-mode-diff"]')
      await diffBtn.click()
      const diffContainer = page.locator('[data-testid="image-diff-container"]')
      await expect(diffContainer).toBeVisible()

      // Verify mode switching: Modified and Original single views
      const modBtn = page.locator('[data-testid="img-mode-modified"]')
      await modBtn.click()
      await expect(page.locator('[data-testid="image-modified-container"]')).toBeVisible()

      const origBtn = page.locator('[data-testid="img-mode-original"]')
      await origBtn.click()
      await expect(page.locator('[data-testid="image-original-container"]')).toBeVisible()

      // Test background switching (Dark, Light, Checkerboard)
      const bgDarkBtn = page.locator('[data-testid="img-bg-dark"]')
      await bgDarkBtn.click()
      await expect(page.locator('.image-diff-bg-dark')).toBeVisible()

      const bgLightBtn = page.locator('[data-testid="img-bg-light"]')
      await bgLightBtn.click()
      await expect(page.locator('.image-diff-bg-light')).toBeVisible()

      const bgCheckBtn = page.locator('[data-testid="img-bg-checkerboard"]')
      await bgCheckBtn.click()
      await expect(page.locator('.image-diff-bg-checkerboard')).toBeVisible()

      // Close modal
      const closeBtn = page.locator('.diff-modal-close')
      await closeBtn.click()
      await expect(diffModal).not.toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('should automatically open SVG in visual preview and support toggle with XML code diff', async () => {
    const { app, page } = await launchElectronApp()

    try {
      await page.evaluate(() => localStorage.clear())
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      await app.evaluate(async ({ ipcMain }, sandboxPath) => {
        ipcMain.removeHandler('dialog:openDirectory')
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: sandboxPath }
        })
      }, sandbox.dir)

      await addRepoViaUI(page)

      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      // Select commit "Update logo.png and icon.svg"
      const commitItems = page.locator('.commit-item')
      const updateAssetsCommit = commitItems.nth(1)
      await expect(updateAssetsCommit).toContainText('Update logo.png and icon.svg')
      await updateAssetsCommit.click()
      await page.waitForTimeout(600)

      // Click icon.svg
      const svgFileRow = page.locator('.file-item', { hasText: 'icon.svg' }).first()
      await expect(svgFileRow).toBeVisible()
      await svgFileRow.click()

      const diffModal = page.locator('.diff-modal-content')
      await expect(diffModal).toBeVisible()

      // Preview is automatically displayed
      const imageDiffView = page.locator('[data-testid="image-diff-view"]')
      await expect(imageDiffView).toBeVisible()

      // Verify SVG badge
      const badge = page.locator('.image-diff-badge')
      await expect(badge).toHaveText('SVG')

      // Toggle to code diff via Preview button
      const previewBtn = page.locator('[data-testid="toggle-preview-btn"]')
      await expect(previewBtn).toBeVisible()
      await previewBtn.click()
      await expect(page.locator('.diff-table')).toBeVisible()

      // Toggle back to visual preview
      await previewBtn.click()
      await expect(imageDiffView).toBeVisible()

      const closeBtn = page.locator('.diff-modal-close')
      await closeBtn.click()
    } finally {
      await app.close()
    }
  })
})
