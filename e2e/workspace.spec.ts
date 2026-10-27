import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));

async function dropFiles(page: Page, files: { name: string; type: string; content: string }[]) {
  const transfer = await page.evaluateHandle((items) => {
    const data = new DataTransfer();
    for (const item of items) {
      const bytes = Uint8Array.from(atob(item.content), (character) => character.charCodeAt(0));
      data.items.add(new File([bytes], item.name, { type: item.type }));
    }
    return data;
  }, files);
  try {
    const zone = page.getByRole('region', { name: 'Video drop zone', exact: true });
    await zone.dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(zone).toHaveClass(/is-dragging/);
    await zone.dispatchEvent('dragover', { dataTransfer: transfer });
    await zone.dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
}

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens and replaces a video by dropping it on the preview', async ({ page }) => {
  const content = (await readFile(fixture)).toString('base64');
  await dropFiles(page, [{ name: 'first-take.webm', type: 'video/webm', content }]);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  const oldUrl = await page.locator('video').getAttribute('src');
  await dropFiles(page, [{ name: 'second-take.webm', type: 'video/webm', content }]);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Video drop zone', exact: true })).not.toHaveClass(
    /is-dragging/,
  );
  expect(await page.locator('video').getAttribute('src')).not.toBe(oldUrl);
  await expect(page.getByTitle('second-take.webm', { exact: true })).toBeVisible();
});

test('rejects non-video and multiple files while preserving the current edit', async ({ page }) => {
  await loadVideo(page);
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  const oldUrl = await page.locator('video').getAttribute('src');
  await dropFiles(page, [
    { name: 'notes.txt', type: 'text/plain', content: Buffer.from('notes').toString('base64') },
  ]);
  await expect(page.getByRole('alert')).toContainText('video file');
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('110');
  const content = (await readFile(fixture)).toString('base64');
  await dropFiles(page, [
    { name: 'one.webm', type: 'video/webm', content },
    { name: 'two.webm', type: 'video/webm', content },
  ]);
  await expect(page.getByRole('alert')).toContainText('one video at a time');
  expect(await page.locator('video').getAttribute('src')).toBe(oldUrl);
  await dropFiles(page, [{ name: 'recovered.webm', type: 'video/webm', content }]);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('prevents file navigation outside the drop zone and ignores dragged text', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const files = new DataTransfer();
    files.items.add(new File(['not media'], 'notes.txt', { type: 'text/plain' }));
    const fileDrop = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: files,
    });
    document.body.dispatchEvent(fileDrop);
    const text = new DataTransfer();
    text.setData('text/plain', 'a plain text selection');
    const zone = document.querySelector('[aria-label="Video drop zone"]')!;
    zone.dispatchEvent(
      new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: text }),
    );
    return {
      prevented: fileDrop.defaultPrevented,
      highlighted: zone.classList.contains('is-dragging'),
    };
  });
  expect(result).toEqual({ prevented: true, highlighted: false });
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
  { width: 1920, height: 1080 },
  { width: 360, height: 800 },
  { width: 390, height: 664 },
]) {
  test(`keeps preview and timeline within ${viewport.width}x${viewport.height} without page scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const loaded of [false, true]) {
      if (loaded) await loadVideo(page);
      const dimensions = await page.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        width: document.documentElement.scrollWidth,
        viewportHeight: innerHeight,
        viewportWidth: innerWidth,
      }));
      expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
      expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
      for (const name of ['Preview', 'Timeline']) {
        const box = (await page.getByRole('region', { name, exact: true }).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
      const stage = (await page
        .getByRole('region', { name: 'Video drop zone', exact: true })
        .boundingBox())!;
      expect(stage.height).toBeGreaterThan(70);
      if (!loaded) {
        const button = (await page
          .getByRole('button', { name: 'Choose a video', exact: true })
          .boundingBox())!;
        expect(button.y).toBeGreaterThanOrEqual(stage.y);
        expect(button.y + button.height).toBeLessThanOrEqual(stage.y + stage.height);
      }
    }
  });
}

test('scrolls effects independently while the video and timeline stay in place', async ({
  page,
}) => {
  await loadVideo(page);
  const preview = page.getByRole('region', { name: 'Preview', exact: true });
  const timeline = page.getByRole('region', { name: 'Timeline', exact: true });
  const previewBefore = await preview.boundingBox();
  const timelineBefore = await timeline.boundingBox();
  const effects = page.locator('.effects-content');
  await effects.hover();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => effects.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await preview.boundingBox()).toEqual(previewBefore);
  expect(await timeline.boundingBox()).toEqual(timelineBefore);
  await effects.evaluate((element) => {
    element.scrollTop = 0;
  });
  await effects.focus();
  await page.keyboard.press('Space');
  await expect.poll(() => effects.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Sepia', exact: true }).click();
  await expect(page.getByLabel('Saturation', { exact: true })).toHaveValue('60');
});
