import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';

test.describe('Resizable Left Sidebar', () => {
  test('should resize the sidebar and persist the width', async () => {
    const { app, page } = await launchElectronApp();

    // Set viewport size to accommodate maximum resizing bounds
    await page.setViewportSize({ width: 1600, height: 900 });

    try {
      // Clear localStorage to ensure a clean state for the test run
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000); // Wait for layout stability

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
});
