import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'

const targetFile = 'src/config/timeoutSettings.ts'

function buildLongConflictFile(variant: 'base' | 'current' | 'incoming'): string {
  const header = [
    'export interface TimeoutConfig {',
    '  readonly serviceName: string',
    '  readonly retries: number',
    '  readonly timeoutMs: number',
    '}',
    ''
  ]
  const bodyLines = Array.from({ length: 24 }, (_, idx) => {
    const label = variant === 'base' ? 'base-mode' : variant === 'current' ? 'current-mode' : 'incoming-mode'
    const ms = variant === 'base' ? 1000 : variant === 'current' ? 2500 : 4000
    return `  const endpoint_${idx} = { serviceName: "${label}-service-endpoint-with-very-long-descriptive-identifier-for-horizontal-scroll-verification-${idx}", retries: ${idx + 1}, timeoutMs: ${ms + idx} }`
  })
  const extraIncoming = variant === 'incoming'
    ? ['  const extraIncomingGuard = true // added only on incoming side']
    : []

  return [
    ...header,
    'export function createTimeoutConfigs(): TimeoutConfig[] {',
    ...bodyLines,
    ...extraIncoming,
    '  return [endpoint_0]',
    '}',
    ''
  ].join('\n')
}

async function createConflictSandbox(): Promise<GitSandbox> {
  const sandbox = new GitSandbox()
  await sandbox.init()
  await sandbox.git.branch(['-M', 'main'])

  const write = (variant: 'base' | 'current' | 'incoming') => {
    const full = path.join(sandbox.dir, targetFile)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, buildLongConflictFile(variant))
  }

  write('base')
  await sandbox.git.add('.')
  await sandbox.git.commit('Initial timeout config')

  await sandbox.createBranch('feature/incoming-timeouts')
  write('incoming')
  await sandbox.git.add('.')
  await sandbox.git.commit('Update incoming timeouts')

  await sandbox.checkoutBranch('main')
  write('current')
  await sandbox.git.add('.')
  await sandbox.git.commit('Update current timeouts')

  await sandbox.git.merge(['feature/incoming-timeouts']).catch(() => {})
  expect((await sandbox.git.status()).conflicted).toContain(targetFile)
  return sandbox
}

test('conflict resolver supports synced scrolling, raw diff toggle, text selection, and optional result syntax coloring', async () => {
  const sandbox = await createConflictSandbox()
  const { app, page } = await launchElectronApp({ disableDefaultTab: true })
  try {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1400, 900))
    await app.evaluate(({ ipcMain }, repoPath) => {
      ipcMain.removeHandler('dialog:openDirectory')
      ipcMain.handle('dialog:openDirectory', () => ({ canceled: false, path: repoPath }))
    }, sandbox.dir)

    await addRepoViaUI(page)
    const resolver = page.getByTestId('conflict-resolver')
    await expect(resolver).toBeVisible()

    const currentPane = resolver.getByTestId('conflict-current-pane')
    const incomingPane = resolver.getByTestId('conflict-incoming-pane')
    const resultEditor = resolver.getByTestId('conflict-result-editor')

    await expect(currentPane).toBeVisible()
    await expect(incomingPane).toBeVisible()
    await expect(currentPane).toHaveAttribute('data-view-mode', 'code')
    await expect(incomingPane).toHaveAttribute('data-view-mode', 'code')

    // 1. Synced scrolling (vertical + horizontal) in both directions
    const scrollMetrics = await resolver.evaluate(() => {
      const left = document.querySelector<HTMLElement>('[data-testid="conflict-current-pane"]')!
      const right = document.querySelector<HTMLElement>('[data-testid="conflict-incoming-pane"]')!
      return {
        canScrollV: left.scrollHeight > left.clientHeight && right.scrollHeight > right.clientHeight,
        canScrollH: left.scrollWidth > left.clientWidth && right.scrollWidth > right.clientWidth
      }
    })
    expect(scrollMetrics.canScrollV).toBe(true)
    expect(scrollMetrics.canScrollH).toBe(true)

    await currentPane.evaluate(el => {
      el.scrollTop = 120
      el.scrollLeft = 180
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async () => incomingPane.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual({
      top: 120,
      left: 180
    })

    // Wait a frame so RAF lock releases, then scroll incoming -> current
    await page.waitForTimeout(50)
    await incomingPane.evaluate(el => {
      el.scrollTop = 60
      el.scrollLeft = 90
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async () => currentPane.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual({
      top: 60,
      left: 90
    })

    // 2. Toggle Code view <-> Raw diff view
    const codeViewToggle = resolver.getByTestId('conflict-code-view-toggle')
    await expect(codeViewToggle).toHaveAttribute('aria-pressed', 'true')
    await codeViewToggle.click()
    await expect(codeViewToggle).toHaveAttribute('aria-pressed', 'false')
    await expect(currentPane).toHaveAttribute('data-view-mode', 'raw-diff')
    await expect(incomingPane).toHaveAttribute('data-view-mode', 'raw-diff')

    // Raw diff renders red/green diff lines and inline character highlights
    await expect(currentPane.locator('.conflict-code-line.diff-delete').first()).toBeVisible()
    await expect(incomingPane.locator('.conflict-code-line.diff-add').first()).toBeVisible()
    await expect(currentPane.locator('.diff-inline-highlight.type-delete').first()).toBeVisible()
    await expect(incomingPane.locator('.diff-inline-highlight.type-add').first()).toBeVisible()
    // Extra line on incoming produces an aligned empty placeholder row on current
    await expect(currentPane.locator('.conflict-code-line.diff-empty-row').first()).toBeVisible()

    // Synced scrolling also works in Raw diff view
    await currentPane.evaluate(el => {
      el.scrollTop = 95
      el.scrollLeft = 110
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async () => incomingPane.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual({
      top: 95,
      left: 110
    })

    // Toggle back to Code view
    await codeViewToggle.click()
    await expect(currentPane).toHaveAttribute('data-view-mode', 'code')
    await expect(currentPane.locator('.diff-token.token-keyword').first()).toBeVisible()

    // 3. Text selection works in both source panes and result editor
    const userSelectStyles = await resolver.evaluate(() => {
      const left = document.querySelector<HTMLElement>('[data-testid="conflict-current-pane"]')!
      const right = document.querySelector<HTMLElement>('[data-testid="conflict-incoming-pane"]')!
      const editor = document.querySelector<HTMLElement>('[data-testid="conflict-result-editor"]')!
      const lineNum = left.querySelector<HTMLElement>('.conflict-line-number')!
      return {
        left: getComputedStyle(left).userSelect,
        right: getComputedStyle(right).userSelect,
        editor: getComputedStyle(editor).userSelect,
        lineNum: getComputedStyle(lineNum).userSelect
      }
    })
    expect(userSelectStyles.left).toBe('text')
    expect(userSelectStyles.right).toBe('text')
    expect(userSelectStyles.editor).toBe('text')
    expect(userSelectStyles.lineNum).toBe('none')

    // Verify dragging/selecting text inside both source panes yields selected text
    const leftSelected = await currentPane.evaluate(el => {
      const codeEl = el.querySelector('.conflict-code-line code')!
      const range = document.createRange()
      range.selectNodeContents(codeEl)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      return sel.toString()
    })
    expect(leftSelected.trim().length).toBeGreaterThan(0)

    const rightSelected = await incomingPane.evaluate(el => {
      const codeEl = el.querySelector('.conflict-code-line code')!
      const range = document.createRange()
      range.selectNodeContents(codeEl)
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
      return sel.toString()
    })
    expect(rightSelected.trim().length).toBeGreaterThan(0)

    // 4. Optional syntax coloring in final merged file view
    await resolver.getByTestId('conflict-current').click()
    const syntaxToggle = resolver.getByTestId('conflict-result-syntax-toggle')
    const syntaxHighlight = resolver.getByTestId('conflict-result-highlight')
    await expect(syntaxToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(syntaxHighlight).toBeVisible()
    await expect(syntaxHighlight.locator('.diff-token.token-keyword').first()).toBeVisible()

    // Scrolling result editor syncs the syntax highlight backdrop
    await resultEditor.evaluate(el => {
      el.scrollTop = 80
      el.scrollLeft = 50
      el.dispatchEvent(new Event('scroll'))
    })
    await expect.poll(async () => syntaxHighlight.evaluate(el => ({ top: el.scrollTop, left: el.scrollLeft }))).toEqual({
      top: 80,
      left: 50
    })

    // Selecting text in result editor works while syntax overlay is active
    const editorSelection = await resultEditor.evaluate(el => {
      const ta = el as HTMLTextAreaElement
      ta.focus()
      ta.setSelectionRange(0, 16)
      return ta.value.slice(ta.selectionStart, ta.selectionEnd)
    })
    expect(editorSelection).toBe('export interface')

    // Toggling syntax coloring off removes the highlight overlay and preserves editing
    await syntaxToggle.click()
    await expect(syntaxToggle).toHaveAttribute('aria-pressed', 'false')
    await expect(syntaxHighlight).toHaveCount(0)
    await expect(resultEditor).not.toHaveClass(/syntax-active/)
  } finally {
    await app.close()
    await sandbox.destroy()
  }
})
