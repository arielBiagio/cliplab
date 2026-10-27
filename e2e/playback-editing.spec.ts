import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('repeats past the end with loop enabled without creating edit history', async ({ page }) => {
  const loop = page.getByRole('button', { name: 'Loop video', exact: true });
  await expect(loop).toBeDisabled();
  await loadVideo(page);
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'true');
  const video = page.locator('video');
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await video.evaluate((element: HTMLVideoElement) => {
    element.currentTime = element.duration - 0.2;
  });
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeLessThan(2);
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(false);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await loop.click();
  await expect(loop).toHaveAttribute('aria-pressed', 'false');
});

test('mutes and unmutes while preserving volume and resets playback options for a new file', async ({
  page,
}) => {
  const mute = page.getByRole('button', { name: 'Mute audio', exact: true });
  await expect(mute).toBeDisabled();
  await loadVideo(page);
  const video = page.locator('video');
  await video.evaluate((element: HTMLVideoElement) => {
    element.volume = 0.4;
  });
  await mute.click();
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(true);
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await mute.click();
  expect(await video.evaluate((element: HTMLVideoElement) => element.muted)).toBe(false);
  expect(await video.evaluate((element: HTMLVideoElement) => element.volume)).toBe(0.4);
  await page.getByRole('button', { name: 'Loop video', exact: true }).click();
  await mute.click();
  await page.getByRole('button', { name: 'Sepia', exact: true }).click();
  await loadVideo(page);
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Loop video', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByLabel('Hue', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Sepia', { exact: true })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
});

test('edits hue and sepia with limits, presets, reset and complete undo / redo', async ({
  page,
}) => {
  await loadVideo(page);
  const hue = page.getByLabel('Hue', { exact: true });
  const sepia = page.getByLabel('Sepia', { exact: true });
  const undo = page.getByRole('button', { name: 'Undo adjustment' });
  await hue.focus();
  await hue.press('End');
  await expect(hue).toHaveValue('180');
  await hue.press('ArrowRight');
  await expect(hue).toHaveValue('180');
  await expect(page.getByText('Custom', { exact: true })).toBeVisible();
  await undo.click();
  await expect(hue).toHaveValue('0');
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await expect(hue).toHaveValue('180');
  await page.getByRole('button', { name: 'Sepia', exact: true }).click();
  await expect(hue).toHaveValue('0');
  await expect(sepia).toHaveValue('75');
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'webgl2');
  await expect(page.locator('video')).toHaveCSS('filter', 'none');
  await sepia.focus();
  await sepia.press('End');
  await sepia.press('ArrowRight');
  await expect(sepia).toHaveValue('100');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(sepia).toHaveValue('0');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await undo.click();
  await expect(sepia).toHaveValue('100');
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await expect(hue).toHaveValue('0');
  await expect(sepia).toHaveValue('0');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

test('presents decoded frames forward and backward before releasing the timeline', async ({
  page,
}) => {
  await loadVideo(page);
  const video = page.locator('video');
  await video.evaluate((element: HTMLVideoElement) => {
    const record = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      element.dataset.presentedTime = String(metadata.mediaTime);
      element.requestVideoFrameCallback(record);
    };
    element.requestVideoFrameCallback(record);
  });
  const timeline = page.getByRole('slider', { name: 'Video timeline' });
  const box = (await timeline.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 10 });
  await expect
    .poll(() => video.evaluate((element) => Number(element.dataset.presentedTime)))
    .toBeGreaterThan(8);
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 10 });
  await expect
    .poll(() => video.evaluate((element) => Number(element.dataset.presentedTime)))
    .toBeLessThan(4);
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await page.mouse.up();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeCloseTo(3, 1);
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
});

test('cancels a pointer scrub with Escape and restores its original position', async ({ page }) => {
  await loadVideo(page);
  const video = page.locator('video');
  const timeline = page.getByRole('slider', { name: 'Video timeline' });
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(6);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBe(0);
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});

test('reveals the footer with pointer and keyboard without moving the timeline', async ({
  page,
}) => {
  const footer = page.getByRole('contentinfo');
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  const bounds = await timeline.boundingBox();
  await expect(footer).toHaveCSS('opacity', '0');
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height - 2);
  await expect(footer).toHaveCSS('opacity', '1');
  expect(await timeline.boundingBox()).toEqual(bounds);
  await page.mouse.move(viewport.width / 2, 20);
  await expect(footer).toHaveCSS('opacity', '0');
  await page.getByRole('region', { name: 'Color adjustments and presets', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(
    footer.getByRole('button', { name: 'View keyboard shortcuts', exact: true }),
  ).toBeFocused();
  await expect(footer).toHaveCSS('opacity', '1');
});
