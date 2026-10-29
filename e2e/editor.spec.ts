import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toBeEnabled();
}

async function currentTime(page: Page) {
  return page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('starts empty, fits the viewport, and passes accessibility checks', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ClipLab video editor' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Open video', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('loads local footage, plays, pauses, seeks, restarts and never uploads it', async ({
  page,
}) => {
  const outbound: string[] = [];
  const origin = new URL(page.url()).origin;
  page.on('request', (request) => {
    if (
      /^https?:/.test(request.url()) &&
      (new URL(request.url()).origin !== origin ||
        request.method() !== 'GET' ||
        request.postDataBuffer())
    )
      outbound.push(`${request.method()} ${request.url()}`);
  });
  await loadVideo(page);
  const video = page.locator('video');
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  await expect.poll(() => currentTime(page)).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  expect(await currentTime(page)).toBeGreaterThanOrEqual(5);
  await page.keyboard.press('ArrowLeft');
  expect(await currentTime(page)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Restart video' }).click();
  await expect.poll(() => currentTime(page)).toBe(0);
  expect(await video.getAttribute('src')).toMatch(/^blob:/);
  expect(outbound).toEqual([]);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
});

test('synchronizes presets, filters, reset and undo / redo', async ({ page }) => {
  await loadVideo(page);
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('105');
  await expect(page.getByLabel('Contrast', { exact: true })).toHaveValue('115');
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('85');
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'webgl2');
  await expect(page.locator('video')).toHaveCSS('filter', 'none');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('85');
  await page.getByRole('button', { name: 'Black & White', exact: true }).click();
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Redo adjustment' })).toBeDisabled();
});

test('groups a real slider drag and keeps arrows native when a slider has focus', async ({
  page,
}) => {
  await loadVideo(page);
  const brightness = page.getByLabel('Brightness', { exact: true });
  await brightness.scrollIntoViewIfNeeded();
  const box = (await brightness.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(Number(await brightness.inputValue())).toBeGreaterThan(140);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(brightness).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await brightness.focus();
  await page.keyboard.press('ArrowRight');
  await expect(brightness).toHaveValue('101');
  expect(await currentTime(page)).toBe(0);
  await expect(page.getByText('Custom', { exact: true })).toBeVisible();
});

test('scrubs the timeline with pause / resume and keyboard access', async ({ page }) => {
  await loadVideo(page);
  await page.keyboard.press('Space');
  const timeline = page.getByRole('slider', { name: 'Video timeline' });
  await timeline.scrollIntoViewIfNeeded();
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 });
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(
    true,
  );
  await expect.poll(() => currentTime(page)).toBeGreaterThan(6);
  await page.mouse.up();
  await expect
    .poll(() => page.locator('video').evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(false);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  await timeline.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => currentTime(page)).toBe(0);
  await page.keyboard.press('End');
  await expect.poll(() => currentTime(page)).toBeGreaterThan(11);
});

test('configures shortcuts, rejects conflicts, traps focus and restores session and preferences', async ({
  page,
}) => {
  await loadVideo(page);
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Play / pause', { exact: true }).selectOption('ArrowLeft');
  await expect(dialog.getByRole('alert')).toContainText('already assigned');
  await expect(dialog.getByLabel('Play / pause', { exact: true })).toHaveValue('Space');
  await dialog.getByLabel('Play / pause', { exact: true }).selectOption('KeyK');
  await dialog.getByRole('button', { name: 'Done', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeFocused();
  await page.keyboard.press('KeyK');
  expect(await page.locator('video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(
    true,
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.locator('#workspace').focus();
  await page.keyboard.press('KeyK');
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  await page.keyboard.press('KeyK');
  await expect(page.locator('.session-storage')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('110');
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await trigger.click();
  await expect(page.getByLabel('Play / pause', { exact: true })).toHaveValue('KeyK');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['cliplab.shortcuts.v1']);
});

test('replaces the same file, resets editing history, and revokes the old object URL', async ({
  page,
}) => {
  await loadVideo(page);
  const oldUrl = (await page.locator('video').getAttribute('src'))!;
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  await loadVideo(page);
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect(await currentTime(page)).toBe(0);
  expect(await page.locator('video').getAttribute('src')).not.toBe(oldUrl);
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return false;
      } catch {
        return true;
      }
    }, oldUrl),
  ).toBe(true);
});

test('recovers from a corrupt video and corrupt shortcut storage', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('cliplab.shortcuts.v1', '{broken'));
  await page.reload();
  await expect(
    page.getByRole('status').filter({ hasText: 'Default shortcuts are active' }),
  ).toBeVisible();
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles({
    name: 'broken.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from('not a video'),
  });
  await expect(page.getByRole('alert')).toContainText('could not be played');
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
  await loadVideo(page);
  await expect(page.getByRole('alert')).not.toBeVisible();
});
