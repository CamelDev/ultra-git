import { test, expect } from '@playwright/test';
import { launchElectronApp } from './helpers/launcher';

test.describe('About Modal System', () => {
  test('should open and close About Modal from the logo and settings dropdown', async () => {
    // Launch the Electron App
    const { app, page } = await launchElectronApp({ disableDefaultTab: true });

    try {
      // 1. Verify About modal is not visible initially
      const aboutOverlay = page.locator('[data-testid="about-modal-overlay"]');
      const aboutModal = page.locator('[data-testid="about-modal"]');
      await expect(aboutOverlay).not.toBeVisible();
      await expect(aboutModal).not.toBeVisible();

      // 2. Click the brand logo in TitleBar to open About modal
      const brandLogo = page.locator('[data-testid="brand-logo"]');
      await expect(brandLogo).toBeVisible();
      await brandLogo.click();

      // Verify About modal is opened
      await expect(aboutOverlay).toBeVisible();
      await expect(aboutModal).toBeVisible();

      // Verify text inside About modal
      const appName = aboutModal.locator('.about-app-name');
      await expect(appName).toContainText('UltraGIT');
      const authorText = aboutModal.locator('.about-info-card >> text=Kamil Dabrowski');
      await expect(authorText).toBeVisible();

      // Close the modal by clicking the Close button in the header
      const closeHeaderBtn = page.locator('[data-testid="about-close-btn"]');
      await expect(closeHeaderBtn).toBeVisible();
      await closeHeaderBtn.click();

      // Verify it is closed
      await expect(aboutOverlay).not.toBeVisible();

      // 3. Click the brand name in TitleBar to open About modal
      const brandName = page.locator('[data-testid="brand-name"]');
      await expect(brandName).toBeVisible();
      await brandName.click();
      await expect(aboutOverlay).toBeVisible();

      // Close it by clicking the Close button in the footer
      const closeFooterBtn = page.locator('[data-testid="about-footer-close-btn"]');
      await expect(closeFooterBtn).toBeVisible();
      await closeFooterBtn.click();
      await expect(aboutOverlay).not.toBeVisible();

      // 4. Click settings cog to open settings dropdown
      const settingsCog = page.locator('[data-testid="settings-cog-btn"]');
      await expect(settingsCog).toBeVisible();
      await settingsCog.click();

      // Click the About button in Settings dropdown
      const aboutDropdownBtn = page.locator('[data-testid="about-btn"]');
      await expect(aboutDropdownBtn).toBeVisible();
      await aboutDropdownBtn.click();

      // Verify About modal is opened
      await expect(aboutOverlay).toBeVisible();

      // Close the modal by clicking on the overlay (backdrop)
      // Click at top-left corner of overlay to avoid hitting modal-content
      await aboutOverlay.click({ position: { x: 5, y: 5 } });
      await expect(aboutOverlay).not.toBeVisible();

    } finally {
      await app.close();
    }
  });
});
