import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildFilter } from '../src/features/editing/filters';
import { PRESETS } from '../src/features/editing/presets';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));
const editedFilter = buildFilter(
  PRESETS.find((preset) => preset.id === 'blackAndWhite')!.adjustments,
);

async function openComparison(page: Page) {
  const toggle = page.getByRole('button', { name: 'Compare before and after', exact: true });
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(toggle).toBeEnabled();
  await page.getByRole('button', { name: 'Black & White', exact: true }).click();
  await toggle.click();
  const split = page.getByRole('slider', { name: 'Before and after split', exact: true });
  await expect(split).toHaveValue('50');
  return { toggle, split };
}

async function pixelDifference(page: Page, split: number, filter = editedFilter) {
  return page.locator('canvas.video-canvas').evaluate(
    (element, parameters) => {
      const canvas = element as HTMLCanvasElement;
      const video = document.querySelector('video')!;
      video.dispatchEvent(new Event('seeked'));
      const gl = canvas.getContext('webgl2')!;
      const actual = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, actual);
      const reference = document.createElement('canvas');
      reference.width = canvas.width;
      reference.height = canvas.height;
      const context = reference.getContext('2d')!;
      context.drawImage(video, 0, 0, reference.width, reference.height);
      const original = context.getImageData(0, 0, reference.width, reference.height).data;
      context.clearRect(0, 0, reference.width, reference.height);
      context.filter = parameters.filter;
      context.drawImage(video, 0, 0, reference.width, reference.height);
      const edited = context.getImageData(0, 0, reference.width, reference.height).data;
      let maximum = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const expected = (x + 0.5) / canvas.width < parameters.split / 100 ? original : edited;
          for (let channel = 0; channel < 3; channel++) {
            const actualIndex = ((canvas.height - 1 - y) * canvas.width + x) * 4 + channel;
            const expectedIndex = (y * canvas.width + x) * 4 + channel;
            maximum = Math.max(maximum, Math.abs(actual[actualIndex] - expected[expectedIndex]));
          }
        }
      }
      return maximum;
    },
    { split, filter },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('compares original and edited pixels and preserves the complete edit history', async ({
  page,
}) => {
  await expect(
    page.getByRole('button', { name: 'Compare before and after', exact: true }),
  ).toBeDisabled();
  const { toggle, split } = await openComparison(page);
  await expect.poll(() => pixelDifference(page, 50)).toBeLessThanOrEqual(4);
  await page.getByLabel('Brightness', { exact: true }).focus();
  await page.keyboard.press('End');
  const changedFilter = buildFilter({
    ...PRESETS.find((preset) => preset.id === 'blackAndWhite')!.adjustments,
    brightness: 200,
  });
  await expect.poll(() => pixelDifference(page, 50, changedFilter)).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await split.focus();
  await split.press('End');
  await expect(split).toHaveValue('100');
  await expect.poll(() => pixelDifference(page, 100)).toBeLessThanOrEqual(4);
  await split.press('Home');
  await expect(split).toHaveValue('0');
  await expect.poll(() => pixelDifference(page, 0)).toBeLessThanOrEqual(4);
  await split.press('ArrowRight');
  await expect(split).toHaveValue('1');
  await toggle.click();
  await expect(split).not.toBeAttached();
  await expect(page.getByRole('button', { name: 'Redo adjustment' })).toBeEnabled();
  await expect.poll(() => pixelDifference(page, 0)).toBeLessThanOrEqual(4);
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  await toggle.click();
  await expect(split).toHaveValue('1');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(
    0,
  );
});

test('supports pointer or touch dragging and Escape restores the initial split', async ({
  page,
}, testInfo) => {
  const { split } = await openComparison(page);
  const box = (await split.boundingBox())!;
  const y = box.y + box.height / 2;
  if (testInfo.project.name === 'mobile') {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x + box.width / 4, y }],
    });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 4, y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(split).toHaveValue('25');
  await expect.poll(() => pixelDifference(page, 25)).toBeLessThanOrEqual(4);
  await page.mouse.move(box.x + box.width * 0.6, y);
  await page.mouse.down();
  await expect(split).toHaveValue('60');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(split).toHaveValue('25');
  await expect(split).toHaveAttribute('aria-valuetext', '25% original, 75% edited');
});

test('keeps both halves on the current frame while playing and scrubbing', async ({ page }) => {
  const { split } = await openComparison(page);
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(1);
  await expect.poll(() => pixelDifference(page, 50)).toBeLessThanOrEqual(4);
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  const timeline = page.getByRole('slider', { name: 'Video timeline', exact: true });
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(8);
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.seeking))
    .toBe(false);
  await expect.poll(() => pixelDifference(page, 50)).toBeLessThanOrEqual(4);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled();
  await expect(split).toHaveValue('50');
});

test('aligns the divider to the fitted image after resizing and supports keyboard access', async ({
  page,
}) => {
  const { toggle, split } = await openComparison(page);
  await toggle.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Enter fullscreen', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(split).toBeFocused();
  await split.press('ArrowRight');
  await expect(split).toHaveValue('51');
  for (const viewport of [
    { width: 900, height: 900 },
    { width: 360, height: 664 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => {
        const frame = (await split.boundingBox())!;
        const stage = (await page
          .getByRole('region', { name: 'Video drop zone', exact: true })
          .boundingBox())!;
        const line = (await page.locator('.comparison-divider').boundingBox())!;
        return (
          Math.abs(frame.width / frame.height - 16 / 9) < 0.01 &&
          Math.abs(frame.x + frame.width / 2 - (stage.x + stage.width / 2)) < 1 &&
          Math.abs(frame.y + frame.height / 2 - (stage.y + stage.height / 2)) < 1 &&
          Math.abs(line.x + line.width / 2 - (frame.x + frame.width * 0.51)) < 1 &&
          frame.x >= stage.x - 1 &&
          frame.y >= stage.y - 1
        );
      })
      .toBe(true);
  }
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('suspends comparison on GPU loss and restores the same view afterward', async ({ page }) => {
  const { toggle, split } = await openComparison(page);
  await split.focus();
  await split.press('ArrowRight');
  const extension = await page
    .locator('canvas.video-canvas')
    .evaluateHandle((element) =>
      (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!,
    );
  await extension.evaluate((value) => value.loseContext());
  await expect(toggle).toBeDisabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(split).not.toBeAttached();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Before/after comparison is temporarily unavailable' }),
  ).toBeVisible();
  await extension.evaluate((value) => value.restoreContext());
  await expect(toggle).toBeEnabled();
  await expect(split).toHaveValue('51');
  await expect.poll(() => pixelDifference(page, 51)).toBeLessThanOrEqual(4);
  await extension.dispose();
});

test('accepts a dropped replacement over the comparison and resets its view', async ({ page }) => {
  const { toggle, split } = await openComparison(page);
  await split.focus();
  await split.press('End');
  const transfer = await page.evaluateHandle(
    (base64) => {
      const data = new DataTransfer();
      data.items.add(
        new File(
          [Uint8Array.from(atob(base64), (value) => value.charCodeAt(0))],
          'replacement.webm',
          { type: 'video/webm' },
        ),
      );
      return data;
    },
    (await readFile(fixture)).toString('base64'),
  );
  await split.dispatchEvent('drop', { dataTransfer: transfer });
  await transfer.dispose();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(split).not.toBeAttached();
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await toggle.click();
  await expect(split).toHaveValue('50');
  await expect(page.locator('.session-storage')).toHaveAttribute('data-save-state', 'saved');
  await page.reload();
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
