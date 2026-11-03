import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

const mainFile = 'src/Travel.Journeys/JourneyAvailability/JourneyAvailabilityMapper.cs'
const paths = [mainFile, 'src/Travel.Journeys/Shared/Direction.cs', 'tests/Travel.Journeys.Tests/JourneyAvailabilityMapperTests.cs']
const code = (version: string, count = 7) => `using System;\nusing System.Linq;\n\nnamespace Travel.Journeys;\n\npublic class JourneyAvailabilityMapper\n{\n${Array.from({ length: count }, (_, i) => `    public Direction MapJourney${i}(Request request)\n    {\n        // Map journey ${i} and preserve the request identity.\n        var requestId = request.Id;\n        var outbound = new ScraperDirection("${version}-${i}", request.Journeys.First().Segments.Select(MapSegment), request.Options.IncludeEmptyJourneyIds);\n        return outbound;\n    }\n`).join('\n')}\n}\n`

async function rebaseFixture() {
  const sandbox = new GitSandbox()
  await sandbox.init()
  await sandbox.git.branch(['-M', 'main'])
  const write = (version: string) => paths.forEach((file, i) => {
    fs.mkdirSync(path.dirname(path.join(sandbox.dir, file)), { recursive: true })
    fs.writeFileSync(path.join(sandbox.dir, file), code(version, i === 0 ? 7 : 1))
  })
  write('base')
  await sandbox.git.add('.')
  await sandbox.git.commit('Add journey mapping')
  await sandbox.createBranch('feature/empty-journey-ids')
  write('replayed')
  await sandbox.git.add('.')
  await sandbox.git.commit('Preserve empty journey IDs')
  fs.writeFileSync(path.join(sandbox.dir, mainFile), code('second-replay'))
  await sandbox.git.add('.')
  await sandbox.git.commit('Refine journey mapping')
  await sandbox.checkoutBranch('main')
  write('onto')
  await sandbox.git.add('.')
  await sandbox.git.commit('Update direction mapping')
  await sandbox.checkoutBranch('feature/empty-journey-ids')
  await sandbox.git.rebase(['main']).catch(() => {})
  expect((await sandbox.git.status()).conflicted).toHaveLength(3)
  return sandbox
}

test('readable rebase workbench supports navigation, resizing, staging and consecutive conflict stops', async () => {
  const sandbox = await rebaseFixture()
  const { app, page } = await launchElectronApp({ disableDefaultTab: true })
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000))
    await app.evaluate(({ ipcMain }, repoPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
    }, sandbox.dir)
    await addRepoViaUI(page)
    const resolver = page.getByTestId('conflict-resolver')
    await expect(resolver).toBeVisible()
    const file = resolver.getByTestId(`conflict-file-${mainFile}`)
    await file.click()
    await expect(resolver.getByRole('tab', { name: /Conflict \d+:/ })).toHaveCount(7)
    await expect(resolver.getByRole('button', { name: 'Use Onto branch', exact: true })).toBeVisible()
    await expect(resolver.getByRole('button', { name: 'Use Replayed commit', exact: true })).toBeVisible()
    await expect(resolver.locator('.conflict-pane.current .conflict-source-label')).toContainText('main')
    await expect(resolver.locator('.conflict-pane.incoming .conflict-source-label')).toContainText('Preserve empty journey IDs')
    await expect(resolver.getByTestId('conflict-continue-btn')).toBeDisabled()
    await expect(resolver.getByTestId('conflict-apply-stage')).toBeDisabled()
    await expect(resolver.locator('.conflict-candidate-panel')).not.toHaveAttribute('open')

    const geometry = await resolver.evaluate(element => {
      const sources = [...element.querySelectorAll<HTMLElement>('.conflict-panes > .conflict-pane')]
      const code = element.querySelector<HTMLElement>('[data-testid="conflict-current-pane"]')!
      return {
        width: element.getBoundingClientRect().width,
        viewport: window.innerWidth,
        paneWidths: sources.map(source => source.getBoundingClientRect().width),
        wraps: getComputedStyle(code).whiteSpace,
        lineHeight: getComputedStyle(code).lineHeight,
        horizontalScroll: code.scrollWidth > code.clientWidth,
        overflow: element.scrollWidth > element.clientWidth
      }
    })
    expect(geometry.width).toBeGreaterThan(geometry.viewport * .95)
    expect(geometry.paneWidths).toHaveLength(2)
    expect(Math.min(...geometry.paneWidths)).toBeGreaterThan(400)
    expect(geometry.wraps).toBe('pre')
    expect(geometry.lineHeight).toBe('24px')
    expect(geometry.horizontalScroll).toBe(true)
    expect(geometry.overflow).toBe(false)

    // Number tabs stay in one row and support keyboard navigation.
    await resolver.getByRole('tab', { name: 'Conflict 1: unresolved', exact: true }).focus()
    await page.keyboard.press('End')
    await expect(resolver.getByRole('tab', { name: 'Conflict 7: unresolved', exact: true })).toBeFocused()
    await expect(resolver.getByRole('tab', { name: 'Conflict 7: unresolved', exact: true })).toHaveAttribute('aria-selected', 'true')
    await resolver.getByRole('button', { name: 'Base', exact: true }).click()
    const base = resolver.getByTestId('conflict-base-pane')
    await expect(base).toContainText('base-6')
    await expect(base).not.toContainText('using System;')
    await resolver.getByRole('button', { name: 'Base', exact: true }).click()

    const separator = resolver.getByRole('separator', { name: 'Resize source and result panes' })
    await separator.focus()
    await page.keyboard.press('ArrowUp')
    await expect(separator).toHaveAttribute('aria-valuenow', '51')
    await resolver.getByRole('button', { name: 'Wrap code lines' }).click()
    await expect(resolver.getByTestId('conflict-current-pane')).toHaveCSS('white-space', 'pre-wrap')
    await resolver.getByRole('button', { name: 'Wrap code lines' }).click()

    // Keep a real draft while moving between files, without duplicating file rows.
    await resolver.getByTestId('conflict-current').click()
    await expect(resolver.getByTestId(`conflict-file-${mainFile}`)).toHaveCount(1)
    const result = resolver.getByTestId('conflict-result-editor')
    await result.fill('CUSTOM DRAFT\n')
    await page.keyboard.press('Alt+ArrowRight')
    await expect(resolver.getByTestId(`conflict-file-${paths[1]}`)).toHaveAttribute('aria-current', 'true')
    await page.keyboard.press('Alt+ArrowLeft')
    await expect(result).toHaveValue('CUSTOM DRAFT\n')

    // Capture both themes with realistic long paths and source lines.
    await resolver.getByRole('tab', { name: 'Conflict 1: unresolved', exact: true }).click()
    await resolver.getByTestId('conflict-current').click()
    for (const theme of ['day', 'night']) {
      await page.evaluate(value => {
        localStorage.setItem('app-theme', value)
        window.dispatchEvent(new CustomEvent('theme-changed', { detail: value }))
      }, theme)
      // Theme colors transition independently on controls; capture their settled state.
      await page.waitForTimeout(200)
      await page.screenshot({ path: `test-results/conflict-workbench-${theme}.png`, animations: 'disabled' })
    }

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760))
    await expect(resolver.getByTestId('conflict-apply-stage')).toBeInViewport()
    expect(await resolver.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(false)
    await page.screenshot({ path: 'test-results/conflict-workbench-compact.png', animations: 'disabled' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000))

    // Resolve each region explicitly and stage all three files.
    for (const filePath of paths) {
      await resolver.getByTestId(`conflict-file-${filePath}`).click()
      const tabs = resolver.getByRole('tab', { name: /Conflict \d+:/ })
      for (let index = 0; index < await tabs.count(); index++) {
        await tabs.nth(index).click()
        await resolver.getByTestId('conflict-current').click()
      }
      const resultEditor = resolver.getByTestId('conflict-result-editor')
      await resultEditor.fill((await resultEditor.inputValue()).replaceAll('onto-', 'resolved-'))
      await expect(resolver.getByTestId('conflict-apply-stage')).toBeEnabled()
      await resolver.getByTestId('conflict-apply-stage').click()
      await expect(resolver.getByTestId(`conflict-file-${filePath}`).locator('.lucide-circle-check-big')).toBeVisible()
      await resolver.getByTestId(`conflict-file-${filePath}`).click()
      await expect(resolver.getByTestId('conflict-result-editor')).toHaveAttribute('readonly')
      await expect(resolver.getByTestId('conflict-current')).toBeDisabled()
    }
    await expect(resolver.getByTestId('conflict-continue-btn')).toBeEnabled()
    // A Git failure stays visible and can be retried without losing the editor.
    const lock = path.join(sandbox.dir, '.git', 'index.lock')
    fs.writeFileSync(lock, 'locked by the workbench test')
    try {
      await resolver.getByTestId('conflict-continue-btn').click()
      await expect(resolver.getByRole('alert')).toContainText('index.lock')
      await expect(resolver).toBeVisible()
    } finally {
      fs.unlinkSync(lock)
    }
    await resolver.getByTestId('conflict-continue-btn').click()
    await expect(resolver).toBeVisible()
    await expect(resolver.locator('.conflict-operation-badge')).toContainText('2 / 2')
    await expect(resolver.getByTestId('conflict-continue-btn')).toBeDisabled()
    await expect(resolver.getByTestId('conflict-apply-stage')).toBeDisabled()
    expect((await sandbox.git.status()).conflicted).toEqual([mainFile])

    // Abort remains an explicit action and cleans up only the fixture repository.
    await resolver.getByRole('button', { name: 'Abort', exact: true }).click()
    await expect(resolver).toBeHidden()
    expect((await sandbox.git.status()).conflicted).toHaveLength(0)
  } finally {
    await app.close()
    await sandbox.destroy()
  }
})
