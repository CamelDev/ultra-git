import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI, type LaunchedApp } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

const sourceBranch = 'bugfix/BE-12343-use-original-baggage-currency-in-offer-and-preserve-journey-identifiers'
const oldPackage = '    <PackageVersion Include="Efoe.Book.Contract" Version="10.61.0" />'
const newPackage = oldPackage.replace('10.61.0', '10.62.0')
const before = ['<Project>', ...Array.from({ length: 120 }, (_, i) => i === 75
  ? oldPackage
  : `    <PackageVersion Include="Example.Package${i}" Version="1.0.0" />`), '</Project>', ''].join('\n')
const after = before.replace(oldPackage, newPackage)

async function resizeViewport({ app, page }: LaunchedApp, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size[0], size[1]), [width, height])
  // Native resizing returns before the renderer necessarily receives its new viewport.
  await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height])
}

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
    if (size) await resizeViewport(launched, size[0], size[1])
    // Keep the entrance active while Git data loads, exercising the slower CI timing.
    await launched.page.addStyleTag({ content: '.cherry-pick-modal { animation-duration: 1s; animation-timing-function: linear; }' })
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
    await launched.page.getByRole('dialog', { name: 'Cherry Pick Commit', exact: true }).evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished))
    })
    return launched
  }

  test('stacks full-width selectors and keeps long labels and actions inside the dialog', async ({}, testInfo) => {
    const { app, page } = await openPicker()
    try {
      for (const [width, height] of [[1200, 800], [900, 700]]) {
        await resizeViewport({ app, page }, width, height)
        await page.evaluate(theme => window.dispatchEvent(new CustomEvent('theme-changed', { detail: theme })), width === 900 ? 'night' : 'day')
        const modal = page.getByRole('dialog', { name: 'Cherry Pick Commit', exact: true })
        await expect(async () => {
          // Read parent and child bounds in one renderer task, on the same animation/resize frame.
          const { bounds, controls, scrollWidth, clientWidth } = await modal.evaluate(dialog => {
            const rect = (element: Element) => {
              const { x, y, width, height } = element.getBoundingClientRect()
              return { x, y, width, height }
            }
            const control = (testId: string) => {
              const element = dialog.querySelector(`[data-testid="${testId}"]`)
              if (!element) throw new Error(`Missing cherry-pick control: ${testId}`)
              return rect(element)
            }
            return {
              bounds: rect(dialog),
              controls: {
                branch: control('cherry-pick-branch-select'),
                search: control('cherry-pick-commit-search'),
                commit: control('cherry-pick-commit-select'),
                remotes: control('cherry-pick-load-remotes'),
                action: control('cherry-pick-action-btn')
              },
              scrollWidth: dialog.scrollWidth,
              clientWidth: dialog.clientWidth
            }
          })
          const { branch, search, commit } = controls
          expect(branch.y + branch.height).toBeLessThanOrEqual(search.y)
          expect(search.y + search.height).toBeLessThanOrEqual(commit.y)
          expect(branch.width).toBeGreaterThan(bounds.width * 0.9)
          expect(search.width).toBeCloseTo(branch.width, 0)
          expect(commit.width).toBeCloseTo(branch.width, 0)
          for (const [name, box] of Object.entries(controls)) {
            expect(box.x, `${name} left edge`).toBeGreaterThanOrEqual(bounds.x)
            expect(box.y, `${name} top edge`).toBeGreaterThanOrEqual(bounds.y)
            expect(box.x + box.width, `${name} right edge`).toBeLessThanOrEqual(bounds.x + bounds.width)
            expect(box.y + box.height, `${name} bottom edge`).toBeLessThanOrEqual(bounds.y + bounds.height)
          }
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
        }).toPass({ timeout: 10000 })
        for (const testId of ['cherry-pick-branch-select', 'cherry-pick-commit-search', 'cherry-pick-commit-select', 'cherry-pick-load-remotes', 'cherry-pick-action-btn']) {
          await expect(page.getByTestId(testId)).toBeInViewport({ ratio: 1 })
        }
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
