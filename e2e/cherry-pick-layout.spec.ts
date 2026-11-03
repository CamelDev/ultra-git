import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

const sourceBranch = 'bugfix/BE-12343-use-original-baggage-currency-in-offer-and-preserve-journey-identifiers'
const oldPackage = '    <PackageVersion Include="Efoe.Book.Contract" Version="10.61.0" />'
const newPackage = oldPackage.replace('10.61.0', '10.62.0')
const before = ['<Project>', ...Array.from({ length: 120 }, (_, i) => i === 75
  ? oldPackage
  : `    <PackageVersion Include="Example.Package${i}" Version="1.0.0" />`), '</Project>', ''].join('\n')
const after = before.replace(oldPackage, newPackage)

test.describe('Cherry-pick layout and code preview', () => {
  let sandbox: GitSandbox

  test.beforeEach(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()
    await sandbox.git.branch(['-M', 'main'])
    await sandbox.createCommit('Directory.Packages.props', before, 'Configure packages')
    await sandbox.createCommit('src/Deleted.cs', 'public class RemovedService {}\n', 'Add old service')
    await sandbox.createBranch(sourceBranch)
    fs.writeFileSync(path.join(sandbox.dir, 'Directory.Packages.props'), after)
    fs.writeFileSync(path.join(sandbox.dir, 'src/Added.cs'), 'public class BaggageCurrencyService {}\n')
    fs.unlinkSync(path.join(sandbox.dir, 'src/Deleted.cs'))
    await sandbox.git.add(['-A'])
    await sandbox.git.commit('BE-12342: Use original baggage currency for all offers and preserve the source journey identifier when mapping outbound and inbound directions')
    await sandbox.checkoutBranch('main')
  })

  test.afterEach(async () => { await sandbox.destroy() })

  async function openPicker(size?: number[]) {
    const launched = await launchElectronApp({ disableDefaultTab: true })
    if (size) await launched.app.evaluate(({ BrowserWindow }, dimensions) => BrowserWindow.getAllWindows()[0].setSize(dimensions[0], dimensions[1]), size)
    await launched.app.evaluate(({ ipcMain }, repoPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
    }, sandbox.dir)
    await addRepoViaUI(launched.page)
    await expect.poll(() => launched.page.evaluate(() => (window as any).useRepoStore.getState().getActiveRepo()?.branches?.local.length)).toBe(2)
    await launched.page.getByTestId('cherry-pick-btn').click()
    await expect(launched.page.getByTestId('cherry-pick-branch-select')).toHaveValue(sourceBranch)
    await expect(launched.page.getByTestId('cherry-pick-file-Directory.Packages.props')).toBeVisible()
    await expect(launched.page.locator('.diff-row.type-change')).toHaveCount(1)
    return launched
  }

  test('stacks full-width selectors and keeps long labels and actions inside the dialog', async ({}, testInfo) => {
    const { app, page } = await openPicker()
    try {
      for (const [width, height] of [[1200, 800], [900, 700]]) {
        await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), [width, height])
        await page.evaluate(theme => window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme })), width === 900 ? 'night' : 'day')
        const branch = page.getByTestId('cherry-pick-branch-select')
        const search = page.getByTestId('cherry-pick-commit-search')
        const commit = page.getByTestId('cherry-pick-commit-select')
        await expect.poll(async () => {
          const b = (await branch.boundingBox())!
          const s = (await search.boundingBox())!
          const c = (await commit.boundingBox())!
          return b.y + b.height <= s.y && s.y + s.height <= c.y
        }).toBe(true)
        const modal = page.locator('.diff-modal-content')
        const bounds = (await modal.boundingBox())!
        const branchBounds = (await branch.boundingBox())!
        const searchBounds = (await search.boundingBox())!
        const commitBounds = (await commit.boundingBox())!
        expect(branchBounds.width).toBeGreaterThan(bounds.width * 0.9)
        expect(searchBounds.width).toBeCloseTo(branchBounds.width, 0)
        expect(commitBounds.width).toBeCloseTo(branchBounds.width, 0)
        for (const control of [branch, search, commit, page.getByTestId('cherry-pick-load-remotes'), page.getByTestId('cherry-pick-action-btn')]) {
          const box = (await control.boundingBox())!
          expect(box.x).toBeGreaterThanOrEqual(bounds.x)
          expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width)
          expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height)
          await expect(control).toBeInViewport({ ratio: 1 })
        }
        expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      }
      await page.screenshot({ path: testInfo.outputPath('stacked-controls.png') })
    } finally { await app.close() }
  })

  test('renders visible old/new code, scrolls to paired changes, and previews added and deleted files', async ({}, testInfo) => {
    const { app, page } = await openPicker([900, 700])
    try {
      const scroll = page.locator('.diff-modal-scroll')
      // Text in the DOM alone missed the regression: a full-height ruler shrank this scroll pane to zero.
      await expect.poll(() => scroll.evaluate(el => el.clientHeight)).toBeGreaterThan(160)
      const oldCode = page.locator('.diff-col.left .diff-line-content').filter({ hasText: 'Efoe.Book.Contract' })
      const newCode = page.locator('.diff-col.right .diff-line-content').filter({ hasText: 'Efoe.Book.Contract' })
      await expect(oldCode).toHaveText(oldPackage)
      await expect(newCode).toHaveText(newPackage)
      await expect(oldCode).toBeInViewport({ ratio: 1 })
      await expect(newCode).toBeInViewport({ ratio: 1 })
      await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
      const codeBounds = (await scroll.boundingBox())!
      const rulerBounds = (await page.locator('.diff-overview-ruler').boundingBox())!
      expect(rulerBounds.x).toBeGreaterThanOrEqual(codeBounds.x + codeBounds.width - 1)
      expect(rulerBounds.height).toBeCloseTo(codeBounds.height, 0)
      await page.screenshot({ path: testInfo.outputPath('package-diff.png') })

      await page.getByTestId('cherry-pick-file-src/Added.cs').click()
      const addedCode = page.locator('.diff-col.right .diff-line-content').filter({ hasText: 'BaggageCurrencyService' })
      await expect(addedCode).toHaveText('public class BaggageCurrencyService {}')
      await expect(addedCode).toBeInViewport({ ratio: 1 })
      await page.getByTestId('cherry-pick-file-src/Deleted.cs').click()
      const deletedCode = page.locator('.diff-col.left .diff-line-content').filter({ hasText: 'RemovedService' })
      await expect(deletedCode).toHaveText('public class RemovedService {}')
      await expect(deletedCode).toBeInViewport({ ratio: 1 })
    } finally { await app.close() }
  })
})
