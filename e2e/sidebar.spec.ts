import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';

test.describe('Resizable Left Sidebar', () => {
  test('should resize the sidebar and persist the width', async () => {
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    // Set viewport size to accommodate maximum resizing bounds
    await page.setViewportSize({ width: 1600, height: 900 });

    try {
      await page.waitForTimeout(1000); // Wait for layout stability

      // Mock openDirectory dialog to load current working directory
      await app.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      // Click the Open Repository button on the landing page
      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();
      await page.waitForTimeout(1000); // Wait for repo to load and sidebar to appear

      // 1. Check initial default width is 280px
      const sidebar = page.locator('[data-testid="sidebar"]');
      await expect(sidebar).toBeVisible();
      
      let box = await sidebar.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBe(280);

      const resizer = page.locator('[data-testid="sidebar-resizer"]');
      await expect(resizer).toBeVisible();

      // Helper function to drag the resizer to a new position dynamically
      const dragResizerBy = async (deltaX: number) => {
        const resizerBox = await resizer.boundingBox();
        expect(resizerBox).toBeTruthy();
        const currentX = resizerBox!.x + resizerBox!.width / 2;
        const currentY = resizerBox!.y + resizerBox!.height / 2;
        
        await page.mouse.move(currentX, currentY);
        await page.mouse.down();
        await page.mouse.move(currentX + deltaX, currentY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(200); // Allow layout to settle
      };

      // 2. Locate the resizer and drag it right by 100px (to 380px)
      await dragResizerBy(100);

      box = await sidebar.boundingBox();
      expect(box!.width).toBe(380);

      // Verify localStorage is updated
      let storedWidth = await page.evaluate(() => localStorage.getItem('sidebar-width'));
      expect(storedWidth).toBe('380');

      // 3. Test minimum constraint (180px) by dragging far to the left
      await dragResizerBy(-300);

      box = await sidebar.boundingBox();
      expect(box!.width).toBe(180);

      storedWidth = await page.evaluate(() => localStorage.getItem('sidebar-width'));
      expect(storedWidth).toBe('180');

      // 4. Test maximum constraint (600px) by dragging far to the right
      await dragResizerBy(600);

      box = await sidebar.boundingBox();
      expect(box!.width).toBe(600);

      storedWidth = await page.evaluate(() => localStorage.getItem('sidebar-width'));
      expect(storedWidth).toBe('600');

      // 5. Test persistence across reload
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      const reloadedSidebar = page.locator('[data-testid="sidebar"]');
      await expect(reloadedSidebar).toBeVisible();
      const reloadedBox = await reloadedSidebar.boundingBox();
      expect(reloadedBox!.width).toBe(600);

    } finally {
      await app.close();
    }
  });

  test('should reset sidebar and details panel widths on choosing Reset Layout', async () => {
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });
    await page.setViewportSize({ width: 1600, height: 900 });

    try {
      await page.waitForTimeout(1000); // Wait for layout stability

      // Mock openDirectory dialog to load current working directory
      await app.evaluate(async ({ ipcMain }, cwdPath) => {
        ipcMain.removeHandler('dialog:openDirectory');
        ipcMain.handle('dialog:openDirectory', async () => {
          return { canceled: false, path: cwdPath };
        });
      }, process.cwd());

      // Click the Open Repository button on the landing page
      const landingOpenBtn = page.locator('[data-testid="landing-open-repo-btn"]');
      await expect(landingOpenBtn).toBeVisible();
      await landingOpenBtn.click();
      await page.waitForTimeout(1000); // Wait for repo to load and sidebar to appear

      const sidebar = page.locator('[data-testid="sidebar"]');
      const details = page.locator('.details-panel');
      const sidebarResizer = page.locator('[data-testid="sidebar-resizer"]');
      const detailsResizer = page.locator('[data-testid="details-resizer"]');

      // Helper function to drag resizers
      const dragResizerBy = async (resizer: typeof sidebarResizer, deltaX: number) => {
        const rBox = await resizer.boundingBox();
        expect(rBox).toBeTruthy();
        const currentX = rBox!.x + rBox!.width / 2;
        const currentY = rBox!.y + rBox!.height / 2;
        
        await page.mouse.move(currentX, currentY);
        await page.mouse.down();
        await page.mouse.move(currentX + deltaX, currentY, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300); // Allow layout to settle
      };

      // 1. Resize sidebar right by 100px (280px -> 380px)
      await dragResizerBy(sidebarResizer, 100);
      let sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox!.width).toBe(380);

      // 2. Resize details panel left by 100px (380px -> 480px)
      await dragResizerBy(detailsResizer, -100);
      let detailsBox = await details.boundingBox();
      expect(detailsBox!.width).toBe(480);

      // 3. Open settings dropdown
      const settingsCog = page.locator('[data-testid="settings-cog-btn"]');
      await expect(settingsCog).toBeVisible();
      await settingsCog.click();
      await page.waitForTimeout(300);

      // 4. Click Reset Layout
      const resetBtn = page.locator('[data-testid="reset-layout-btn"]');
      await expect(resetBtn).toBeVisible();
      await resetBtn.click();
      await page.waitForTimeout(500);

      // 5. Verify widths are reset to default (sidebar: 280, details: 380)
      sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox!.width).toBe(280);

      detailsBox = await details.boundingBox();
      expect(detailsBox!.width).toBe(380);

      // 6. Verify localStorage values are updated
      const storedSidebarWidth = await page.evaluate(() => localStorage.getItem('sidebar-width'));
      expect(storedSidebarWidth).toBe('280');

      const storedDetailsWidth = await page.evaluate(() => localStorage.getItem('details-width'));
      expect(storedDetailsWidth).toBe('380');

    } finally {
      await app.close();
    }
  });
});
