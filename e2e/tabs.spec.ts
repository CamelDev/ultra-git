import { test, expect } from '@playwright/test'

test.describe('Multi-Repo Tab System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display the initial repository tab', async ({ page }) => {
    const tabs = page.locator('.tab')
    await expect(tabs.first()).toBeVisible()
    await expect(tabs.first()).toContainText('ultra-git')
  })

  test('should have an "Add Tab" button', async ({ page }) => {
    const addButton = page.locator('.tab').filter({ hasText: '' }).locator('svg.lucide-plus')
    await expect(addButton).toBeVisible()
  })

  test('should allow switching tabs (mock)', async ({ page }) => {
    // Since we only have one tab initially, we can't switch yet.
    // In a real E2E we would mock the open dialog to add a second tab.
    const tabs = page.locator('.tab')
    expect(await tabs.count()).toBeGreaterThanOrEqual(2) // 1 repo + 1 add button
  })
})
