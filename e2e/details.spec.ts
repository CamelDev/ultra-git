import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';

test.describe('Resizable Details Panel', () => {
  test('should resize the details panel and persist the width', async () => {
    const { app, page } = await launchElectronApp();

    // Set viewport size to accommodate the right panel resizing
    await page.setViewportSize({ width: 1600, height: 900 });

    try {
      // Clear localStorage to ensure clean state
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      // Wait for layout to stabilize
      await page.waitForTimeout(1000);

      // 1. Check initial default width is 380px
      const details = page.locator('.details-panel');
      await expect(details).toBeVisible();
      
      let box = await details.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBe(380);

      const resizer = page.locator('[data-testid="details-resizer"]');
      await expect(resizer).toBeVisible();

      // Helper function to drag the resizer to a new position dynamically
      const dragResizerBy = async (deltaX: number) => {
        const rBox = await resizer.boundingBox();
        expect(rBox).toBeTruthy();
        const currentX = rBox!.x + rBox!.width / 2;
        const currentY = rBox!.y + rBox!.height / 2;
        
        await page.mouse.move(currentX, currentY);
        await page.mouse.down();
        await page.mouse.move(currentX + deltaX, currentY);
        await page.mouse.up();
      };

      // 2. Drag left by 100px (should increase details panel width to 480px)
      await dragResizerBy(-100);

      box = await details.boundingBox();
      expect(box!.width).toBe(480);

      // Verify localStorage is updated
      let storedWidth = await page.evaluate(() => localStorage.getItem('details-width'));
      expect(storedWidth).toBe('480');

      // 3. Test minimum constraint (200px) by dragging far to the right (deltaX = +300px)
      await dragResizerBy(300);

      box = await details.boundingBox();
      expect(box!.width).toBe(200);

      storedWidth = await page.evaluate(() => localStorage.getItem('details-width'));
      expect(storedWidth).toBe('200');

      // 4. Test maximum constraint (600px) by dragging far to the left (deltaX = -500px)
      await dragResizerBy(-500);

      box = await details.boundingBox();
      expect(box!.width).toBe(600);

      storedWidth = await page.evaluate(() => localStorage.getItem('details-width'));
      expect(storedWidth).toBe('600');

      // 5. Test persistence across reload
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500); // Wait for load stability

      const reloadedDetails = page.locator('.details-panel');
      await expect(reloadedDetails).toBeVisible();
      const reloadedBox = await reloadedDetails.boundingBox();
      expect(reloadedBox!.width).toBe(600);

    } finally {
      await app.close();
    }
  });
});
