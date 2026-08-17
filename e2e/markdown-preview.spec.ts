import { test, expect } from '@playwright/test'
import { launchElectronApp, addRepoViaUI } from './helpers/launcher'
import { GitSandbox } from './helpers/git-sandbox'
import path from 'path'
import fs from 'fs'

test.describe('Markdown Diff Preview in Diff Modal', () => {
  let sandbox: GitSandbox

  test.beforeAll(async () => {
    sandbox = new GitSandbox()
    await sandbox.init()

    // 1. Initial commit with README.md
    const initialMd = `# Project Documentation

Welcome to UltraGIT documentation.

## Features
- Fast git operations
- Native desktop experience
- Visual diff viewer

## Configuration Table
| Option | Default | Description |
| :--- | :--- | :--- |
| autoFetch | false | Automatically fetch remotes |
| theme | dark | Application color theme |

> Note: UltraGIT requires Git 2.20+ installed.

\`\`\`typescript
const client = new UltraGit();
client.start();
\`\`\`
`
    await sandbox.createCommit('README.md', initialMd, 'Initial README.md')

    // 2. Modify README.md with changes and additions
    const updatedMd = `# UltraGIT Official Documentation

Welcome to UltraGIT documentation and developer guide!

## Key Features
- Ultra fast git operations powered by Electron
- Native desktop experience with themes
- Interactive visual diff viewer with Markdown rendering
- Undo / redo Git actions safely

## Configuration Table
| Option | Default | Description | Status |
| :--- | :--- | :--- | :--- |
| autoFetch | true | Automatically fetch remotes | Active |
| theme | dark | Application color theme | Active |
| previewMd | true | Render markdown preview | New |

> Note: UltraGIT requires Git 2.20+ installed on your machine.

- [x] High performance desktop engine
- [x] Markdown diff viewer with side-by-side preview
- [ ] Multi-window workspace support

\`\`\`typescript
import { UltraGit } from 'ultra-git';
const client = new UltraGit({ theme: 'dark' });
await client.init();
\`\`\`
`
    await sandbox.createCommit('README.md', updatedMd, 'Update README.md documentation')

    // 3. Commit with a plain text file (non-markdown)
    await sandbox.createCommit('config.txt', 'key=value\nenv=production\n', 'Add config.txt')

    // 4. Commit adding a new Markdown file (status: A)
    const newDocMd = `# Release Notes v1.1.0

### Highlights
- Added visual markdown diff preview mode
- Added side-by-side and single pane preview
`
    await sandbox.createCommit('RELEASE.md', newDocMd, 'Add RELEASE.md')
  })

  test.afterAll(async () => {
    await sandbox.destroy()
  })

  test('should provide rendered Markdown preview with Split, Modified, and Original modes', async () => {
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

      const expectedTabName = path.basename(sandbox.dir)
      const tabs = page.locator('[data-testid="repo-tab"]')
      await expect(tabs).toHaveCount(2)
      await expect(tabs.last()).toContainText(expectedTabName)
      await tabs.last().click()
      await page.waitForTimeout(1000)

      const commitItems = page.locator('.commit-item')
      await expect(commitItems).toHaveCount(5) // initial + 4 commits

      // Select the commit updating README.md (3rd in list: [Add RELEASE.md, Add config.txt, Update README.md, Initial README.md, Initial commit])
      const updateReadmeCommit = commitItems.nth(2)
      await expect(updateReadmeCommit).toContainText('Update README.md documentation')
      await updateReadmeCommit.click()
      await page.waitForTimeout(500)

      // Click on README.md in details panel to open DiffModal
      const readmeFileItem = page.locator('.file-item', { hasText: 'README.md' })
      await expect(readmeFileItem).toBeVisible()
      await readmeFileItem.click()
      await page.waitForTimeout(500)

      // Verify DiffModal is open
      const diffModal = page.locator('.diff-modal-content')
      await expect(diffModal).toBeVisible()

      // 1. Verify View Mode Toggle includes "Preview" for Markdown file
      const viewModeToggle = page.locator('[data-testid="view-mode-toggle"]')
      await expect(viewModeToggle).toBeVisible()

      const chunksBtn = page.locator('[data-testid="toggle-chunks-btn"]')
      const fullBtn = page.locator('[data-testid="toggle-full-btn"]')
      const previewBtn = page.locator('[data-testid="toggle-preview-btn"]')

      await expect(chunksBtn).toBeVisible()
      await expect(fullBtn).toBeVisible()
      await expect(previewBtn).toBeVisible()
      await expect(previewBtn).toContainText('Preview')

      // 2. Click Preview toggle button
      await previewBtn.click()
      await page.waitForTimeout(300)
      await expect(previewBtn).toHaveClass(/active/)

      // 3. Verify MarkdownDiffView is rendered
      const mdView = page.locator('[data-testid="markdown-diff-view"]')
      await expect(mdView).toBeVisible()

      // Verify Preview toolbar and mode switcher buttons
      const splitModeBtn = page.locator('[data-testid="md-mode-split"]')
      const modifiedModeBtn = page.locator('[data-testid="md-mode-modified"]')
      const originalModeBtn = page.locator('[data-testid="md-mode-original"]')
      const syncScrollBtn = page.locator('[data-testid="md-sync-scroll-btn"]')

      await expect(splitModeBtn).toBeVisible()
      await expect(modifiedModeBtn).toBeVisible()
      await expect(originalModeBtn).toBeVisible()
      await expect(syncScrollBtn).toBeVisible()

      // Default should be Split mode
      await expect(splitModeBtn).toHaveClass(/active/)

      // 4. Verify Split mode has both Original (Left) and Modified (Right) panes
      const originalPane = page.locator('[data-testid="md-pane-original"]')
      const modifiedPane = page.locator('[data-testid="md-pane-modified"]')

      await expect(originalPane).toBeVisible()
      await expect(modifiedPane).toBeVisible()

      // Check rendered contents inside panes
      const origContent = originalPane.locator('.md-rendered-content')
      const modContent = modifiedPane.locator('.md-rendered-content')

      await expect(origContent.locator('h1')).toContainText('Project Documentation')
      await expect(modContent.locator('h1')).toContainText('UltraGIT Official Documentation')

      // Verify table rendering
      await expect(origContent.locator('table th')).toHaveCount(3)
      await expect(modContent.locator('table th')).toHaveCount(4) // Status column added

      // Verify checklist items in modified pane
      const checkboxes = modContent.locator('input[type="checkbox"]')
      await expect(checkboxes).toHaveCount(3)

      // 5. Test switching to "Modified" single pane mode
      await modifiedModeBtn.click()
      await page.waitForTimeout(200)
      await expect(modifiedModeBtn).toHaveClass(/active/)
      await expect(originalPane).not.toBeVisible()
      await expect(modifiedPane).toBeVisible()
      await expect(modifiedPane).toHaveClass(/full-width/)

      // 6. Test switching to "Original" single pane mode
      await originalModeBtn.click()
      await page.waitForTimeout(200)
      await expect(originalModeBtn).toHaveClass(/active/)
      await expect(originalPane).toBeVisible()
      await expect(originalPane).toHaveClass(/full-width/)
      await expect(modifiedPane).not.toBeVisible()

      // 7. Test switching back to "Split" mode
      await splitModeBtn.click()
      await page.waitForTimeout(200)
      await expect(splitModeBtn).toHaveClass(/active/)
      await expect(originalPane).toBeVisible()
      await expect(modifiedPane).toBeVisible()

      // 8. Test copy button on modified pane
      const copyModBtn = modifiedPane.locator('[data-testid="copy-modified-md-btn"]')
      await expect(copyModBtn).toBeVisible()
      await copyModBtn.click()
      await expect(copyModBtn).toContainText('Copied')

      // 9. Switch back to "Chunks" mode and verify regular code diff displays
      await chunksBtn.click()
      await page.waitForTimeout(200)
      await expect(chunksBtn).toHaveClass(/active/)
      await expect(mdView).not.toBeVisible()
      const diffTable = page.locator('.diff-table')
      await expect(diffTable).toBeVisible()

      // Close modal
      const closeBtn = page.locator('.diff-modal-close')
      await closeBtn.click()
      await page.waitForTimeout(300)
      await expect(diffModal).not.toBeVisible()

      // 10. Open non-markdown file commit and verify "Preview" button is NOT present
      const configCommit = commitItems.nth(1)
      await expect(configCommit).toContainText('Add config.txt')
      await configCommit.click()
      await page.waitForTimeout(500)

      const configFileItem = page.locator('.file-item', { hasText: 'config.txt' })
      await expect(configFileItem).toBeVisible()
      await configFileItem.click()
      await page.waitForTimeout(500)

      // In config.txt diff modal, Preview button should NOT exist
      await expect(diffModal).toBeVisible()
      await expect(page.locator('[data-testid="toggle-preview-btn"]')).not.toBeVisible()

      // Close modal
      await page.locator('.diff-modal-close').click()
      await page.waitForTimeout(300)

      // 11. Open newly added markdown file RELEASE.md and check status "Added" rendering
      const releaseCommit = commitItems.nth(0)
      await expect(releaseCommit).toContainText('Add RELEASE.md')
      await releaseCommit.click()
      await page.waitForTimeout(500)

      const releaseFileItem = page.locator('.file-item', { hasText: 'RELEASE.md' })
      await expect(releaseFileItem).toBeVisible()
      await releaseFileItem.click()
      await page.waitForTimeout(500)

      await expect(diffModal).toBeVisible()
      const releasePreviewBtn = page.locator('[data-testid="toggle-preview-btn"]')
      await expect(releasePreviewBtn).toBeVisible()
      await releasePreviewBtn.click()
      await page.waitForTimeout(300)

      // Check placeholder on original pane for newly added file
      const origPlaceholder = page.locator('[data-testid="md-pane-original"] [data-testid="empty-original-placeholder"]')
      await expect(origPlaceholder).toBeVisible()
      await expect(origPlaceholder).toContainText('File was added in this commit')

      // Check modified pane has rendered release notes
      const releaseModContent = page.locator('[data-testid="md-pane-modified"] .md-rendered-content')
      await expect(releaseModContent.locator('h1')).toContainText('Release Notes v1.1.0')
      await expect(releaseModContent.locator('li')).toHaveCount(2)
    } finally {
      await app.close()
    }
  })

  test('should render Markdown preview for untracked new files and modified files in Active Changes', async () => {
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
      await page.waitForTimeout(500)

      // 1. Create a brand new untracked Markdown file and modify an existing one
      fs.writeFileSync(
        path.join(sandbox.dir, 'NEW_DOC.md'),
        '# Brand New Markdown File\n\nThis is a newly created untracked document.\n\n- Feature 1\n- Feature 2\n'
      )
      fs.appendFileSync(
        path.join(sandbox.dir, 'README.md'),
        '\n\n## Working Tree Addition\n\n> This was added in the active working tree.\n'
      )

      // Trigger status refresh by toggling tabs
      await tabs.first().click()
      await page.waitForTimeout(300)
      await tabs.last().click()
      await page.waitForTimeout(500)

      const activeChangesPanel = page.locator('[data-testid="active-changes-panel"]')
      await expect(activeChangesPanel).toBeVisible()

      // 2. Open Diff for NEW_DOC.md from unstaged changes
      const unstagedColumn = activeChangesPanel.locator('.unstaged-column')
      const newDocItem = unstagedColumn.locator('.file-item', { hasText: 'NEW_DOC.md' })
      await expect(newDocItem).toBeVisible()
      await newDocItem.click()
      await page.waitForTimeout(500)

      const diffModal = page.locator('.diff-modal-overlay')
      await expect(diffModal).toBeVisible()

      // Toggle Preview for new untracked file
      const previewBtn = page.locator('[data-testid="toggle-preview-btn"]')
      await expect(previewBtn).toBeVisible()
      await previewBtn.click()
      await page.waitForTimeout(300)

      const mdView = page.locator('[data-testid="markdown-diff-view"]')
      await expect(mdView).toBeVisible()

      // Verify original pane shows newly added file placeholder
      const origPlaceholder = page.locator('[data-testid="md-pane-original"] [data-testid="empty-original-placeholder"]')
      await expect(origPlaceholder).toBeVisible()

      // Verify modified pane shows rendered new markdown content
      const modPaneContent = page.locator('[data-testid="md-pane-modified"] .md-rendered-content')
      await expect(modPaneContent.locator('h1')).toContainText('Brand New Markdown File')
      await expect(modPaneContent.locator('li')).toHaveCount(2)

      // Close modal
      await page.locator('.diff-modal-close').click()
      await page.waitForTimeout(300)

      // 3. Open Diff for modified README.md from unstaged changes
      const readmeItem = unstagedColumn.locator('.file-item', { hasText: 'README.md' })
      await expect(readmeItem).toBeVisible()
      await readmeItem.click()
      await page.waitForTimeout(500)

      await expect(diffModal).toBeVisible()
      const readmePreviewBtn = page.locator('[data-testid="toggle-preview-btn"]')
      await expect(readmePreviewBtn).toBeVisible()
      await readmePreviewBtn.click()
      await page.waitForTimeout(300)

      const readmeMdView = page.locator('[data-testid="markdown-diff-view"]')
      await expect(readmeMdView).toBeVisible()

      const readmeModContent = page.locator('[data-testid="md-pane-modified"] .md-rendered-content')
      await expect(readmeModContent.locator('blockquote').last()).toContainText('This was added in the active working tree.')

      // Close modal
      await page.locator('.diff-modal-close').click()
    } finally {
      await app.close()
    }
  })
})
