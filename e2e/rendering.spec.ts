import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import { buildFilter } from '../src/features/editing/filters';
import { DEFAULT_ADJUSTMENTS, PRESETS } from '../src/features/editing/presets';
import type { Adjustments } from '../src/features/editing/types';

const fixture = fileURLToPath(new URL('./fixtures/test-video.webm', import.meta.url));

async function loadVideo(page: Page) {
  await page.getByLabel('Choose video file', { exact: true }).setInputFiles(fixture);
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
  const color = page.locator('details[data-group="color"]');
  if (!(await color.evaluate((element) => (element as HTMLDetailsElement).open)))
    await color.locator('summary').click();
}

async function expectWebGL(page: Page) {
  const canvas = page.locator('canvas.video-canvas');
  await expect(canvas).toHaveAttribute('data-renderer', 'webgl2');
  await expect(canvas).toHaveCSS('opacity', '1');
  await expect(page.locator('video')).toHaveCSS('filter', 'none');
  await expect(page.getByLabel('Exposure', { exact: true })).toBeEnabled();
  return canvas;
}

async function comparePixels(
  page: Page,
  adjustments: Readonly<Adjustments>,
  expectedGains: readonly number[] = [1, 1, 1],
) {
  return page.locator('canvas.video-canvas').evaluate(
    (element, { filter, expectedGains, shadows, highlights }) => {
      const canvas = element as HTMLCanvasElement;
      const video = document.querySelector('video')!;
      // Render and read in the same task; production does not preserve the GPU buffer.
      video.dispatchEvent(new Event('seeked'));
      const gl = canvas.getContext('webgl2')!;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const reference = document.createElement('canvas');
      reference.width = canvas.width;
      reference.height = canvas.height;
      const context = reference.getContext('2d')!;
      const graded = document.createElement('canvas');
      graded.width = canvas.width;
      graded.height = canvas.height;
      const gradingContext = graded.getContext('2d')!;
      gradingContext.drawImage(video, 0, 0, graded.width, graded.height);
      const original = gradingContext.getImageData(0, 0, graded.width, graded.height).data;
      if (expectedGains.some((gain) => gain !== 1) || shadows !== 0 || highlights !== 0) {
        const image = gradingContext.getImageData(0, 0, graded.width, graded.height);
        const encode = (value: number) =>
          value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
        const smooth = (min: number, max: number, value: number) => {
          const fraction = Math.min(1, Math.max(0, (value - min) / (max - min)));
          return fraction * fraction * (3 - 2 * fraction);
        };
        for (let i = 0; i < image.data.length; i += 4) {
          const light = [0, 1, 2].map((channel) => {
            const srgb = image.data[i + channel] / 255;
            const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
            return Math.min(1, linear * expectedGains[channel]);
          });
          const luminance =
            encode(light[0]) * 0.2126 + encode(light[1]) * 0.7152 + encode(light[2]) * 0.0722;
          const stops =
            (shadows / 100) * (1 - smooth(0.15, 0.65, luminance)) +
            (highlights / 100) * smooth(0.35, 0.85, luminance);
          for (let channel = 0; channel < 3; channel++) {
            image.data[i + channel] = 255 * encode(Math.min(1, light[channel] * 2 ** stops));
          }
        }
        gradingContext.putImageData(image, 0, 0);
      }
      context.filter = filter;
      context.drawImage(graded, 0, 0);
      const expected = context.getImageData(0, 0, reference.width, reference.height).data;
      let maxDelta = 0;
      let totalDelta = 0;
      let darkChange = 0,
        brightChange = 0,
        darkCount = 0,
        brightCount = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const rawIndex = (y * canvas.width + x) * 4;
          const index = ((canvas.height - 1 - y) * canvas.width + x) * 4;
          const before =
            (original[rawIndex] * 0.2126 +
              original[rawIndex + 1] * 0.7152 +
              original[rawIndex + 2] * 0.0722) /
            255;
          const after =
            (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) /
            255;
          if (before < 0.3) {
            darkChange += Math.abs(after - before);
            darkCount++;
          }
          if (before > 0.8) {
            brightChange += Math.abs(after - before);
            brightCount++;
          }
          for (let channel = 0; channel < 3; channel++) {
            const actualIndex = ((canvas.height - 1 - y) * canvas.width + x) * 4 + channel;
            const expectedIndex = (y * canvas.width + x) * 4 + channel;
            const delta = Math.abs(pixels[actualIndex] - expected[expectedIndex]);
            maxDelta = Math.max(maxDelta, delta);
            totalDelta += delta;
          }
        }
      }
      return {
        maxDelta,
        meanDelta: totalDelta / (canvas.width * canvas.height * 3),
        error: gl.getError(),
        darkChange: darkChange / Math.max(1, darkCount),
        brightChange: brightChange / Math.max(1, brightCount),
      };
    },
    {
      filter: buildFilter(adjustments),
      expectedGains,
      shadows: adjustments.shadows,
      highlights: adjustments.highlights,
    },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const control of [
  { name: 'Exposure', key: 'exposure', min: -2, max: 2, low: [0.25, 0.25, 0.25], high: [4, 4, 4] },
  { name: 'Shadows', key: 'shadows', min: -100, max: 100, low: [1, 1, 1], high: [1, 1, 1] },
  { name: 'Highlights', key: 'highlights', min: -100, max: 100, low: [1, 1, 1], high: [1, 1, 1] },
  {
    name: 'Temperature',
    key: 'temperature',
    min: -100,
    max: 100,
    low: [2 ** -0.5, 1, 2 ** 0.5],
    high: [2 ** 0.5, 1, 2 ** -0.5],
  },
  {
    name: 'Tint',
    key: 'tint',
    min: -100,
    max: 100,
    low: [2 ** -0.25, 2 ** 0.5, 2 ** -0.25],
    high: [2 ** 0.25, 2 ** -0.5, 2 ** 0.25],
  },
]) {
  test(`applies ${control.name} in linear light at both limits and supports undo / redo`, async ({
    page,
  }) => {
    await loadVideo(page);
    await expectWebGL(page);
    const slider = page.getByLabel(control.name, { exact: true });
    for (const endpoint of [
      { key: 'End', value: control.max, gains: control.high },
      { key: 'Home', value: control.min, gains: control.low },
    ]) {
      await slider.focus();
      await slider.press(endpoint.key);
      await expect(slider).toHaveValue(String(endpoint.value));
      const adjustments = { ...DEFAULT_ADJUSTMENTS, [control.key]: endpoint.value };
      const difference = await comparePixels(page, adjustments, endpoint.gains);
      expect(difference.error).toBe(0);
      expect(difference.maxDelta).toBeLessThanOrEqual(4);
      if (control.key === 'shadows')
        expect(difference.darkChange).toBeGreaterThan(difference.brightChange + 0.01);
      if (control.key === 'highlights')
        expect(difference.brightChange).toBeGreaterThan(difference.darkChange + 0.01);
      await expect(page.getByText('Custom', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Undo adjustment' }).click();
      await expect(slider).toHaveValue('0');
      expect((await comparePixels(page, DEFAULT_ADJUSTMENTS)).maxDelta).toBeLessThanOrEqual(4);
      await page.getByRole('button', { name: 'Redo adjustment' }).click();
      await expect(slider).toHaveValue(String(endpoint.value));
      await page.getByRole('button', { name: 'Original', exact: true }).click();
      await expect(slider).toHaveValue('0');
    }
    expect(
      await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime),
    ).toBe(0);
  });
}

test('uses fractional EV steps and resets all grading values with a preset', async ({ page }) => {
  await loadVideo(page);
  await expectWebGL(page);
  const exposure = page.getByLabel('Exposure', { exact: true });
  await exposure.focus();
  await exposure.press('ArrowRight');
  await expect(exposure).toHaveValue('0.1');
  await expect(exposure).toHaveAttribute('aria-valuetext', '0.1 exposure stops');
  await page.getByLabel('Temperature', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Tint', { exact: true }).focus();
  await page.keyboard.press('Home');
  await page.getByLabel('Shadows', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Highlights', { exact: true }).focus();
  await page.keyboard.press('Home');
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
    await expect(page.getByLabel(name, { exact: true })).toHaveValue('0');
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(exposure).toHaveValue('0.1');
  await expect(page.getByLabel('Temperature', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Tint', { exact: true })).toHaveValue('-100');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
    await expect(page.getByLabel(name, { exact: true })).toHaveValue('0');
});

test('matches CSS colors and orientation for every preset while paused', async ({ page }) => {
  await loadVideo(page);
  await expectWebGL(page);
  for (const preset of PRESETS) {
    await page.getByRole('button', { name: preset.label, exact: true }).click();
    const difference = await comparePixels(page, preset.adjustments);
    expect(difference.error, preset.label).toBe(0);
    expect(difference.maxDelta, preset.label).toBeLessThanOrEqual(4);
    expect(difference.meanDelta, preset.label).toBeLessThan(1.5);
  }
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
});

test('redraws paused slider changes and undo / redo at adjustment limits', async ({ page }) => {
  await loadVideo(page);
  await expectWebGL(page);
  for (const name of ['Brightness', 'Contrast', 'Saturation', 'Sepia', 'Hue']) {
    await page.getByLabel(name, { exact: true }).focus();
    await page.keyboard.press('End');
  }
  const values = {
    ...DEFAULT_ADJUSTMENTS,
    brightness: 200,
    contrast: 200,
    saturation: 200,
    sepia: 100,
    hue: 180,
  };
  expect((await comparePixels(page, values)).maxDelta).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect((await comparePixels(page, DEFAULT_ADJUSTMENTS)).maxDelta).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  expect((await comparePixels(page, values)).maxDelta).toBeLessThanOrEqual(4);
  await page.getByRole('button', { name: 'Redo adjustment' }).click();
  expect((await comparePixels(page, DEFAULT_ADJUSTMENTS)).maxDelta).toBeLessThanOrEqual(4);
});

test('changes the actual canvas during playback and pointer scrubbing', async ({ page }) => {
  await loadVideo(page);
  const canvas = await expectWebGL(page);
  const first = await canvas.screenshot();
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(first)).toBe(false);
  await page.getByRole('button', { name: 'Pause video', exact: true }).click();
  const timeline = page.getByRole('slider', { name: 'Video timeline' });
  const box = (await timeline.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.75, y);
  await page.mouse.down();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(8);
  const forward = await canvas.screenshot();
  await page.mouse.move(box.x + box.width * 0.25, y, { steps: 8 });
  await expect.poll(async () => (await canvas.screenshot()).equals(forward)).toBe(false);
  await page.mouse.up();
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(
    true,
  );
});

test('keeps playback and legacy effects usable and disables grading when WebGL2 is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: object,
    ) {
      if (type === 'webgl2') return null;
      return original.call(this, type, options);
    } as typeof original;
  });
  await page.reload();
  await loadVideo(page);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'css');
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
    await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('status').filter({ hasText: 'Standard preview is active' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sepia', exact: true }).click();
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  await expect(page.locator('video')).toHaveCSS(
    'filter',
    'brightness(1.05) contrast(0.95) saturate(0.6) sepia(0.75) hue-rotate(0deg)',
  );
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Undo adjustment' }).click();
  await expect(page.getByLabel('Sepia', { exact: true })).toHaveValue('0');
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('recovers a lost GPU context with the latest edits and playback position', async ({
  page,
}) => {
  await loadVideo(page);
  const canvas = await expectWebGL(page);
  await page.getByRole('button', { name: 'Sepia', exact: true }).click();
  await page.getByLabel('Exposure', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Temperature', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Tint', { exact: true }).focus();
  await page.keyboard.press('Home');
  await page.getByLabel('Shadows', { exact: true }).focus();
  await page.keyboard.press('End');
  await page.getByLabel('Highlights', { exact: true }).focus();
  await page.keyboard.press('Home');
  const extension = await canvas.evaluateHandle((element) =>
    (element as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!,
  );
  await extension.evaluate((context) => context.loseContext());
  await expect(canvas).toHaveAttribute('data-renderer', 'css');
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
    await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'temporarily bypassed' })).toBeVisible();
  await page.getByLabel('Hue', { exact: true }).focus();
  await page.keyboard.press('End');
  await extension.evaluate((context) => context.restoreContext());
  await expectWebGL(page);
  expect(
    (
      await comparePixels(
        page,
        {
          ...PRESETS.find((preset) => preset.id === 'sepia')!.adjustments,
          hue: 180,
          exposure: 2,
          temperature: 100,
          tint: -100,
          shadows: 100,
          highlights: -100,
        },
        [2 ** 2.25, 2 ** 2.5, 2 ** 1.25],
      )
    ).maxDelta,
  ).toBeLessThanOrEqual(4);
  await expect(page.getByLabel('Sepia', { exact: true })).toHaveValue('75');
  await expect(page.getByLabel('Exposure', { exact: true })).toHaveValue('2');
  await expect(page.getByLabel('Shadows', { exact: true })).toHaveValue('100');
  await expect(page.getByLabel('Highlights', { exact: true })).toHaveValue('-100');
  expect(await page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBe(
    0,
  );
  await extension.dispose();
});

test('uses the standard preview when video frame callbacks are unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback');
  });
  await page.reload();
  await loadVideo(page);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'css');
  await expect(page.locator('video')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Play video', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  await loadVideo(page);
  await expect(page.locator('canvas.video-canvas')).toHaveAttribute('data-renderer', 'css');
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  await expect(page.getByLabel('Brightness', { exact: true })).toHaveValue('100');
});

test('releases the old GPU program when replacing the video and starts with neutral effects', async ({
  page,
}) => {
  await loadVideo(page);
  const canvas = await expectWebGL(page);
  const oldCanvas = (await canvas.elementHandle())!;
  const oldProgram = await oldCanvas.evaluateHandle((element) => {
    const gl = (element as HTMLCanvasElement).getContext('webgl2')!;
    return gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
  });
  await page.getByRole('button', { name: 'Vintage', exact: true }).click();
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint']) {
    await page.getByLabel(name, { exact: true }).focus();
    await page.keyboard.press('End');
  }
  await loadVideo(page);
  await expectWebGL(page);
  for (const name of ['Exposure', 'Shadows', 'Highlights', 'Temperature', 'Tint'])
    await expect(page.getByLabel(name, { exact: true })).toHaveValue('0');
  expect(
    await oldCanvas.evaluate(
      (element, program) => (element as HTMLCanvasElement).getContext('webgl2')!.isProgram(program),
      oldProgram,
    ),
  ).toBe(false);
  await expect(page.getByRole('button', { name: 'Undo adjustment' })).toBeDisabled();
  expect((await comparePixels(page, DEFAULT_ADJUSTMENTS)).maxDelta).toBeLessThanOrEqual(4);
  await oldProgram.dispose();
  await oldCanvas.dispose();
});
