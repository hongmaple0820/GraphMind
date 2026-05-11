import { test, expect } from '@playwright/test';

test.describe('App Shell', () => {
  test('should load the app shell with header and sidebar', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=GraphMind')).toBeVisible({ timeout: 10000 });
  });

  test('should have TopBar with view switcher', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=Editor')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Graph')).toBeVisible();
  });

  test('should toggle between Editor and Graph views', async ({ page }) => {
    await page.goto('/');

    const graphBtn = page.locator('button:has-text("Graph")');
    await graphBtn.click();

    const editorBtn = page.locator('button:has-text("Editor")');
    await editorBtn.click();
  });

  test('should open command palette with Ctrl+K', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Control+k');

    await expect(page.locator('text=Search notes, commands')).toBeVisible({ timeout: 5000 });
  });

  test('should show command palette categories', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    await expect(page.locator('text=Navigation')).toBeVisible({ timeout: 5000 });
  });

  test('should close command palette with Escape', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('text=Search notes')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('text=Search notes')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Sidebar', () => {
  test('should display sidebar sections', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=Files').or(page.locator('text=Notes'))).toBeVisible({ timeout: 10000 });
  });

  test('should have new note button', async ({ page }) => {
    await page.goto('/');

    const newBtn = page.locator('button[title="New Note"]').or(page.locator('text=New'));
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Agent Panel', () => {
  test('should toggle agent panel', async ({ page }) => {
    await page.goto('/');

    const agentBtn = page.locator('button[title="Agent Panel (Ctrl+J)"]');
    if (await agentBtn.isVisible()) {
      await agentBtn.click();
      await expect(page.locator('text=Agent')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Settings', () => {
  test('should open settings modal with Ctrl+,', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Control+,');
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 5000 });
  });

  test('should show settings tabs', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+,');

    await expect(page.locator('text=models')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=sync')).toBeVisible();
    await expect(page.locator('text=general')).toBeVisible();
  });

  test('should close settings on overlay click', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+,');
    await expect(page.locator('text=Settings')).toBeVisible({ timeout: 5000 });

    await page.locator('.fixed.inset-0.bg-black\\/60').click();
    await expect(page.locator('text=Settings')).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Theme', () => {
  test('should have dark theme by default', async ({ page }) => {
    await page.goto('/');

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  test('should switch to light theme from command palette', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');

    const lightBtn = page.locator('text=Theme: Light');
    if (await lightBtn.isVisible()) {
      await lightBtn.click();

      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme).toBe('light');
    }
  });
});
